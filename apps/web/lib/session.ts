import 'server-only';
import crypto from 'node:crypto';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { and, eq, getDb, gt, lt, sessions, teacherProfiles, users, type UserRole } from '@teaching/db';

// Sessions for signed-in accounts (teachers and students). The cookie holds a random 256-bit token; the database stores only its SHA-256.
// A session ends after 30 days without use, and at the latest 90 days after signing in.

export interface Teacher {
  id: string;
  email: string | null;
  displayName: string;
  timezone: string;
}

const PROD = process.env.NODE_ENV === 'production';
// "__Host-": the browser only accepts it over HTTPS, for this exact host, on path "/" (no subdomain tricks).
const COOKIE = PROD ? '__Host-session' : 'session';
const IDLE_MS = 30 * 24 * 60 * 60 * 1000;
const ABSOLUTE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_USER = 10;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

async function currentSessionId() {
  const token = (await cookies()).get(COOKIE)?.value;
  return token && TOKEN_RE.test(token) ? hashToken(token) : null;
}

/** Starts a session after a successful login (always a new token, so an old one can't be reused). */
export async function createSession(userId: string) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  const userAgent = (await headers()).get('user-agent')?.slice(0, 200) ?? null;
  const db = getDb();

  await db.delete(sessions).where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date(now))));
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt: new Date(now + IDLE_MS), userAgent });

  // Keep only the newest few sessions per person.
  const all = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId)).orderBy(sessions.createdAt);
  for (const old of all.slice(0, Math.max(0, all.length - MAX_SESSIONS_PER_USER))) {
    await db.delete(sessions).where(eq(sessions.id, old.id));
  }

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: ABSOLUTE_MS / 1000,
  });
}

/** Signs this browser out. */
export async function destroySession() {
  const id = await currentSessionId();
  if (id) await getDb().delete(sessions).where(eq(sessions.id, id));
  (await cookies()).delete(COOKIE);
}

/** Signs this person out everywhere (e.g. after a password reset). */
export async function destroyAllSessions(userId: string) {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
}

/** Signs out every other browser of this person (e.g. after changing the password). */
export async function destroyOtherSessions(userId: string) {
  const id = await currentSessionId();
  const others = await getDb().select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  for (const s of others) if (s.id !== id) await getDb().delete(sessions).where(eq(sessions.id, s.id));
}

export interface SessionUser {
  id: string;
  email: string | null;
  displayName: string;
  role: UserRole;
}

/** Whoever is signed in (teacher or student), or null. Checked against the database on every request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const id = await currentSessionId();
  if (!id) return null;
  const now = Date.now();

  const [row] = await getDb()
    .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date(now)), gt(sessions.createdAt, new Date(now - ABSOLUTE_MS))));
  if (!row) return null;

  // Sliding expiry: push it back at most once a day, not on every request.
  if (row.expiresAt.getTime() - now < IDLE_MS - 24 * 60 * 60 * 1000) {
    await getDb().update(sessions).set({ expiresAt: new Date(now + IDLE_MS) }).where(eq(sessions.id, id));
  }
  return { id: row.id, email: row.email, displayName: row.displayName, role: row.role };
});

/** The signed-in teacher, or null (students and visitors get null). */
export const getTeacher = cache(async (): Promise<Teacher | null> => {
  const user = await getSessionUser();
  if (user?.role !== 'teacher') return null;
  const [profile] = await getDb().select({ timezone: teacherProfiles.timezone }).from(teacherProfiles).where(eq(teacherProfiles.userId, user.id));
  if (!profile) return null;
  return { id: user.id, email: user.email, displayName: user.displayName, timezone: profile.timezone };
});

/** For panel pages and actions: sends anyone who isn't signed in as a teacher to the login page. */
export async function requireTeacher(): Promise<Teacher> {
  const teacher = await getTeacher();
  if (!teacher) redirect('/logowanie');
  return teacher;
}

/** For pages and actions any signed-in person may use (e.g. changing the password). */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect('/logowanie');
  return user;
}

/** Best guess at the visitor's IP (behind our reverse proxy). Used only for rate limiting. */
export async function clientIp() {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown';
}
