import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { and, boards, desc, eq, getDb, isNull, studentAccessLinks, students, teacherProfiles, users } from '@teaching/db';
import { signPayload, verifyPayload } from '@teaching/shared/ticket';
import { sessionSecret } from './secrets';
import { getSessionUser } from './session';

// Who is using the student pages: a student account (the normal way, see session.ts), or a personal
// link from the teacher (also used by "Podgląd jako uczeń"). The link sets a signed, httpOnly cookie. Every request re-checks in the database that the link
// is still active, so "Wyłącz dostęp" in the teacher panel works immediately.

const COOKIE = 'student_session';
const MAX_AGE = 60 * 60 * 24 * 90; // 90 days

const Payload = z.object({ lid: z.uuid(), sid: z.uuid() });

export { hashToken, isTokenShaped, newToken as newAccessToken } from './tokens';

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
  /** 'account': signed in with their own account. 'link': a personal link (or the teacher's "Podgląd jako uczeń"). */
  via: 'account' | 'link';
  student: { id: string; firstName: string; lastName: string | null; color: string; subject: string | null };
  teacher: { id: string; name: string; timezone: string };
  board: { roomId: string; title: string } | null;
}

const studentFields = {
  student: { id: students.id, firstName: students.firstName, lastName: students.lastName, color: students.color, subject: students.subject },
  teacher: { id: users.id, name: users.displayName, timezone: teacherProfiles.timezone },
  roomId: boards.roomId,
  boardTitle: boards.title,
};

type StudentRow = { student: StudentSession['student']; teacher: StudentSession['teacher']; roomId: string | null; boardTitle: string | null };
const toSession = (via: StudentSession['via'], row: StudentRow): StudentSession => ({
  via,
  student: row.student,
  teacher: row.teacher,
  board: row.roomId && row.boardTitle ? { roomId: row.roomId, title: row.boardTitle } : null,
});

/** The student account's active teacher relationships, newest first. */
async function accountStudents(userId: string) {
  return getDb()
    .select(studentFields)
    .from(students)
    .innerJoin(teacherProfiles, eq(teacherProfiles.userId, students.teacherId))
    .innerJoin(users, eq(users.id, teacherProfiles.userId))
    .leftJoin(boards, and(eq(boards.studentId, students.id), eq(boards.kind, 'notebook')))
    .where(and(eq(students.userId, userId), eq(students.status, 'active')))
    .orderBy(desc(students.createdAt));
}

export const getStudentSession = cache(async (): Promise<StudentSession | null> => {
  // 1. A student account. (With several teachers, the newest one for now; a switcher comes later.)
  const user = await getSessionUser();
  if (user?.role === 'student') {
    const [row] = await accountStudents(user.id);
    return row ? toSession('account', row) : null;
  }

  // 2. A personal link cookie.
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const parsed = Payload.safeParse(verifyPayload(raw, sessionSecret()));
  if (!parsed.success) return null;

  const [row] = await getDb()
    .select(studentFields)
    .from(studentAccessLinks)
    .innerJoin(students, eq(students.id, studentAccessLinks.studentId))
    .innerJoin(teacherProfiles, eq(teacherProfiles.userId, students.teacherId))
    .innerJoin(users, eq(users.id, teacherProfiles.userId))
    .leftJoin(boards, and(eq(boards.studentId, students.id), eq(boards.kind, 'notebook')))
    .where(and(
      eq(studentAccessLinks.id, parsed.data.lid),
      eq(studentAccessLinks.studentId, parsed.data.sid),
      isNull(studentAccessLinks.revokedAt),
      eq(students.status, 'active'),
    ));
  return row ? toSession('link', row) : null;
});

export async function requireStudent(): Promise<StudentSession> {
  const session = await getStudentSession();
  if (session) return session;
  // A student account that no teacher is connected to (any more).
  if ((await getSessionUser())?.role === 'student') redirect('/uczen/brak-dostepu?konto=1');
  redirect('/logowanie?next=/uczen');
}
