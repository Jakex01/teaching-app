'use server';

import { redirect } from 'next/navigation';
import { and, eq, getDb, hashPassword, isNull, normalizeEmail, passwordProblem, passwordResets, teacherProfiles, users, verifyPassword } from '@teaching/db';
import { appUrl } from './app-url';
import { passwordResetMail, sendMail } from './mail';
import { createLimiter } from './rate-limit';
import { clientIp, createSession, destroyAllSessions, destroyOtherSessions, destroySession, requireUser } from './session';
import { endStudentSession } from './student-session';
import { findPasswordReset } from './password-reset';
import { hashToken, newToken } from './tokens';
import type { FormState } from './validation';

// Wrong passwords per e-mail+IP pair (so a stranger can't lock the teacher out from elsewhere),
// a looser cap per e-mail (guessing from many IPs), and all attempts per IP.
const failuresByEmailAndIp = createLimiter(5, 15 * 60_000);
const failuresByEmail = createLimiter(50, 15 * 60_000);
const attemptsByIp = createLimiter(30, 15 * 60_000);
const passwordChanges = createLimiter(5, 15 * 60_000);
const resetRequestsByIp = createLimiter(10, 60 * 60_000);
const resetRequestsByEmail = createLimiter(3, 60 * 60_000);
const RESET_MINUTES = 60;

const GENERIC = 'Nieprawidłowy e-mail lub hasło.';
const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));
const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === 'string' ? v : '';
};

/** Where to go after signing in: only same-site paths, never "//evil.com" or "https://…" (open redirect). */
function safeNext(next: string, role: 'teacher' | 'student') {
  const home = role === 'teacher' ? '/panel' : '/uczen';
  if (!/^\/(?!\/)[^\\\s]{0,200}$/.test(next)) return home;
  return next === home || next.startsWith(`${home}/`) || (role === 'teacher' && next.startsWith('/board')) ? next : home;
}

export async function login(_: FormState, data: FormData): Promise<FormState> {
  const email = normalizeEmail(text(data, 'email')).slice(0, 254);
  const password = text(data, 'password');
  const values = { email };
  const ip = await clientIp();

  const pair = `${email}|${ip}`;
  const wait = Math.max(attemptsByIp.retryAfterMs(ip), failuresByEmailAndIp.retryAfterMs(pair), failuresByEmail.retryAfterMs(email));
  if (wait > 0) return { error: `Za dużo prób logowania. Spróbuj ponownie za ${minutes(wait)} min.`, values };
  attemptsByIp.hit(ip);
  if (!email || !password || password.length > 1024) return { error: GENERIC, values };

  const [user] = await getDb()
    .select({ id: users.id, role: users.role, passwordHash: users.passwordHash, teacher: teacherProfiles.userId })
    .from(users)
    .leftJoin(teacherProfiles, eq(teacherProfiles.userId, users.id))
    .where(eq(users.email, email));

  // Always run the hash check, even for unknown e-mails, so timing doesn't reveal who has an account.
  const { ok, needsRehash } = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user || !ok || (user.role === 'teacher' && !user.teacher)) {
    failuresByEmailAndIp.hit(pair);
    failuresByEmail.hit(email);
    console.info(`Failed teacher login from ${ip}`);
    return { error: GENERIC, values };
  }

  failuresByEmailAndIp.reset(pair);
  if (needsRehash) {
    await getDb().update(users).set({ passwordHash: await hashPassword(password), passwordUpdatedAt: new Date() }).where(eq(users.id, user.id));
  }
  await endStudentSession(); // drop a personal-link cookie, the account is what counts now
  await createSession(user.id);
  redirect(safeNext(text(data, 'next'), user.role));
}

export async function logout() {
  await destroySession();
  redirect('/logowanie');
}

export async function changePassword(_: FormState, data: FormData): Promise<FormState> {
  const me = await requireUser();
  const current = text(data, 'current');
  const next = text(data, 'password');
  const repeat = text(data, 'repeat');

  const wait = passwordChanges.retryAfterMs(me.id);
  if (wait > 0) return { error: `Za dużo prób. Spróbuj ponownie za ${minutes(wait)} min.` };

  const problem = passwordProblem(next, me.email ?? undefined);
  if (problem) return { fieldErrors: { password: problem } };
  if (next !== repeat) return { fieldErrors: { repeat: 'Hasła się różnią.' } };
  if (next === current) return { fieldErrors: { password: 'Nowe hasło musi być inne niż obecne.' } };

  const [user] = await getDb().select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, me.id));
  const { ok } = await verifyPassword(current, user?.passwordHash ?? null);
  if (!ok) {
    passwordChanges.hit(me.id);
    return { fieldErrors: { current: 'Obecne hasło jest nieprawidłowe.' } };
  }

  await getDb().update(users).set({ passwordHash: await hashPassword(next), passwordUpdatedAt: new Date() }).where(eq(users.id, me.id));
  await destroyOtherSessions(me.id);
  passwordChanges.reset(me.id);
  return { ok: true };
}

/** "Forgot password": e-mails a one-time link. Always answers the same, so it doesn't reveal who has an account. */
export async function requestPasswordReset(_: FormState, data: FormData): Promise<FormState> {
  const email = normalizeEmail(text(data, 'email')).slice(0, 254);
  const ip = await clientIp();
  const done: FormState = { ok: true, values: { email } };

  const wait = resetRequestsByIp.retryAfterMs(ip);
  if (wait > 0) return { error: `Za dużo prób. Spróbuj ponownie za ${minutes(wait)} min.`, values: { email } };
  resetRequestsByIp.hit(ip);
  if (!email.includes('@') || resetRequestsByEmail.retryAfterMs(email) > 0) return done;
  resetRequestsByEmail.hit(email);

  const db = getDb();
  const [user] = await db.select({ id: users.id, name: users.displayName }).from(users).where(eq(users.email, email));
  if (!user) return done;

  const token = newToken();
  await db.delete(passwordResets).where(eq(passwordResets.userId, user.id)); // only the newest link works
  await db.insert(passwordResets).values({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) });

  // Not awaited: waiting for the mail server would make known e-mails measurably slower than unknown ones.
  void sendMail(passwordResetMail({ to: email, name: user.name, url: new URL(`/reset-hasla/${token}`, appUrl()).href, minutes: RESET_MINUTES }))
    .catch(e => console.error('Sending the password reset e-mail failed:', (e as Error).message));
  return done;
}

/** Sets the new password from a reset link and signs the person out everywhere. */
export async function resetPassword(token: string, _: FormState, data: FormData): Promise<FormState> {
  const password = text(data, 'password');
  const repeat = text(data, 'repeat');
  const reset = await findPasswordReset(token);
  if (!reset) return { error: 'Ten link wygasł albo został już użyty. Poproś o nowy.' };

  const problem = passwordProblem(password, reset.email ?? undefined);
  if (problem) return { fieldErrors: { password: problem } };
  // eslint-disable-next-line security/detect-possible-timing-attacks -- both values come from the same form, no secret involved
  if (password !== repeat) return { fieldErrors: { repeat: 'Hasła się różnią.' } };

  const db = getDb();
  const passwordHash = await hashPassword(password);
  const used = await db.transaction(async tx => {
    const [row] = await tx.update(passwordResets).set({ usedAt: new Date() })
      .where(and(eq(passwordResets.id, reset.id), isNull(passwordResets.usedAt))).returning({ id: passwordResets.id });
    if (!row) return false;
    // Opening the link proved access to the inbox, so the address counts as verified.
    await tx.update(users).set({ passwordHash, passwordUpdatedAt: new Date(), emailVerifiedAt: new Date() }).where(eq(users.id, reset.userId));
    return true;
  });
  if (!used) return { error: 'Ten link wygasł albo został już użyty. Poproś o nowy.' };

  await destroyAllSessions(reset.userId);
  redirect('/logowanie?haslo=zmienione');
}
