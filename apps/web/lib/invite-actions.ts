'use server';

import { redirect } from 'next/navigation';
import { eq, getDb, hashPassword, passwordProblem, users, verifyPassword } from '@teaching/db';
import { findInvitation, linkInvitation, type Consent } from './invitations';
import { createLimiter } from './rate-limit';
import { clientIp, createSession, getSessionUser } from './session';
import { endStudentSession } from './student-session';
import type { FormState } from './validation';

// Accepting an e-mail invitation from a teacher: create a student account, sign in to an existing one,
// or (already signed in with the invited address) just confirm.

const GONE = 'To zaproszenie wygasło albo zostało już użyte. Poproś nauczyciela o nowe.';
const passwordAttempts = createLimiter(5, 15 * 60_000);
const CONSENTS: Consent[] = ['student_16_plus', 'guardian'];

const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === 'string' ? v : '';
};

async function finish(userId: string): Promise<never> {
  await endStudentSession();
  await createSession(userId);
  redirect('/uczen');
}

/** New student account for the invited e-mail address. */
export async function acceptWithNewAccount(token: string, _: FormState, data: FormData): Promise<FormState> {
  const invitation = await findInvitation(token);
  if (!invitation) return { error: GONE };

  const name = text(data, 'name').trim().slice(0, 40);
  const password = text(data, 'password');
  const consent = text(data, 'consent') as Consent;
  const values = { name, consent };

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = 'Podaj imię.';
  const problem = passwordProblem(password, invitation.email);
  if (problem) fieldErrors.password = problem;
  // eslint-disable-next-line security/detect-possible-timing-attacks -- both values come from the same form, no secret involved
  else if (password !== text(data, 'repeat')) fieldErrors.repeat = 'Hasła się różnią.';
  if (!CONSENTS.includes(consent)) fieldErrors.consent = 'Wybierz, kto zakłada konto.';
  if (text(data, 'agree') !== 'on') fieldErrors.agree = 'Potrzebujemy tej zgody, żeby założyć konto.';
  if (Object.keys(fieldErrors).length) return { fieldErrors, values };

  const passwordHash = await hashPassword(password);
  const db = getDb();
  let userId: string;
  try {
    userId = await db.transaction(async tx => {
      const [user] = await tx.insert(users)
        .values({ email: invitation.email, displayName: name, role: 'student', passwordHash, passwordUpdatedAt: new Date() })
        .returning({ id: users.id });
      if (!(await linkInvitation(tx, invitation, user.id, consent))) tx.rollback();
      return user.id;
    });
  } catch {
    // Rolled back: the link was used in the meantime, or an account with this e-mail appeared.
    return { error: GONE, values };
  }
  return finish(userId);
}

/** The invited address already has a student account: sign in to connect it. */
export async function acceptWithLogin(token: string, _: FormState, data: FormData): Promise<FormState> {
  const invitation = await findInvitation(token);
  if (!invitation) return { error: GONE };

  const key = `${invitation.id}|${await clientIp()}`;
  if (passwordAttempts.retryAfterMs(key) > 0) return { error: 'Za dużo prób. Spróbuj ponownie za kilkanaście minut.' };

  const db = getDb();
  const [user] = await db.select({ id: users.id, role: users.role, passwordHash: users.passwordHash }).from(users).where(eq(users.email, invitation.email));
  const { ok } = await verifyPassword(text(data, 'password').slice(0, 1024), user?.passwordHash ?? null);
  if (!user || !ok || user.role !== 'student') {
    passwordAttempts.hit(key);
    return { fieldErrors: { password: 'Nieprawidłowe hasło.' } };
  }

  const linked = await db.transaction(tx => linkInvitation(tx, invitation, user.id, null));
  if (!linked) return { error: GONE };
  passwordAttempts.reset(key);
  return finish(user.id);
}

/** Already signed in with the invited address: one click. */
export async function acceptSignedIn(token: string): Promise<void> {
  const invitation = await findInvitation(token);
  const user = await getSessionUser();
  if (!invitation || user?.role !== 'student' || user.email !== invitation.email) redirect(`/zaproszenie/${encodeURIComponent(token)}`);
  const linked = await getDb().transaction(tx => linkInvitation(tx, invitation, user.id, null));
  if (!linked) redirect(`/zaproszenie/${encodeURIComponent(token)}`);
  redirect('/uczen');
}
