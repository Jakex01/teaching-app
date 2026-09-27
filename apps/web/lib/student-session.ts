import 'server-only';
import crypto from 'node:crypto';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { and, boards, eq, getDb, isNull, studentAccessLinks, students, teacherProfiles, users } from '@teaching/db';
import { signPayload, verifyPayload } from '@teaching/shared/ticket';
import { sessionSecret } from './secrets';

// Students sign in with a personal link from their teacher (no e-mail or password).
// The link sets a signed, httpOnly cookie. Every request re-checks in the database that the link
// is still active, so "Wyłącz dostęp" in the teacher panel works immediately.

const COOKIE = 'student_session';
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

const Payload = z.object({ lid: z.uuid(), sid: z.uuid() });

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const newAccessToken = () => crypto.randomBytes(32).toString('base64url');
export const isTokenShaped = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);

export async function startStudentSession(linkId: string, studentId: string) {
  (await cookies()).set(COOKIE, signPayload({ lid: linkId, sid: studentId }, sessionSecret()), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function endStudentSession() {
  (await cookies()).delete(COOKIE);
}

export interface StudentSession {
  linkId: string;
  student: { id: string; firstName: string; lastName: string | null; color: string; subject: string | null };
  teacher: { id: string; name: string; timezone: string };
  board: { roomId: string; title: string } | null;
}

export const getStudentSession = cache(async (): Promise<StudentSession | null> => {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const parsed = Payload.safeParse(verifyPayload(raw, sessionSecret()));
  if (!parsed.success) return null;

  const [row] = await getDb()
    .select({
      student: { id: students.id, firstName: students.firstName, lastName: students.lastName, color: students.color, subject: students.subject },
      teacher: { id: users.id, name: users.displayName, timezone: teacherProfiles.timezone },
      roomId: boards.roomId,
      boardTitle: boards.title,
    })
    .from(studentAccessLinks)
    .innerJoin(students, eq(students.id, studentAccessLinks.studentId))
    .innerJoin(teacherProfiles, eq(teacherProfiles.userId, students.teacherId))
    .innerJoin(users, eq(users.id, teacherProfiles.userId))
    .leftJoin(boards, eq(boards.studentId, students.id))
    .where(and(
      eq(studentAccessLinks.id, parsed.data.lid),
      eq(studentAccessLinks.studentId, parsed.data.sid),
      isNull(studentAccessLinks.revokedAt),
      eq(students.status, 'active'),
    ));

  if (!row) return null;
  return {
    linkId: parsed.data.lid,
    student: row.student,
    teacher: row.teacher,
    board: row.roomId && row.boardTitle ? { roomId: row.roomId, title: row.boardTitle } : null,
  };
});

export async function requireStudent(): Promise<StudentSession> {
  const session = await getStudentSession();
  if (!session) redirect('/uczen/brak-dostepu');
  return session;
}
