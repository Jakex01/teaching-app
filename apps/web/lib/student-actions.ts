'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, getDb, isNull, studentAccessLinks, students } from '@teaching/db';
import { requireTeacher } from './session';
import { endStudentSession, hashToken, newAccessToken } from './student-session';
import { Uuid } from './validation';

export type AccessLinkState = { path?: string; error?: string } | undefined;

async function ownedStudent(teacherId: string, studentId: string) {
  if (!Uuid.safeParse(studentId).success) return null;
  const [row] = await getDb()
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacherId), eq(students.status, 'active')));
  return row ?? null;
}

/** Creates a new sign-in link for a student. Any older link stops working. The token is shown once. */
export async function createAccessLink(studentId: string, _: AccessLinkState): Promise<AccessLinkState> {
  const teacher = await requireTeacher();
  if (!(await ownedStudent(teacher.id, studentId))) return { error: 'Nie znaleziono ucznia.' };

  const token = newAccessToken();
  const db = getDb();
  await db.update(studentAccessLinks).set({ revokedAt: new Date() })
    .where(and(eq(studentAccessLinks.studentId, studentId), isNull(studentAccessLinks.revokedAt)));
  await db.insert(studentAccessLinks).values({ studentId, tokenHash: hashToken(token) });

  revalidatePath(`/panel/uczniowie/${studentId}`);
  return { path: `/uczen/wejdz/${token}` };
}

/** Turns off the student's access. Signed-in devices are logged out on their next request. */
export async function revokeAccessLinks(studentId: string) {
  const teacher = await requireTeacher();
  if (!(await ownedStudent(teacher.id, studentId))) return;
  await getDb().update(studentAccessLinks).set({ revokedAt: new Date() })
    .where(and(eq(studentAccessLinks.studentId, studentId), isNull(studentAccessLinks.revokedAt)));
  revalidatePath(`/panel/uczniowie/${studentId}`);
}

export async function studentSignOut() {
  await endStudentSession();
  redirect('/uczen/brak-dostepu?wylogowano=1');
}
