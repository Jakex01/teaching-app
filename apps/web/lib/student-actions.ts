'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, eq, getDb, isNull, normalizeEmail, studentAccessLinks, studentInvitations, students } from '@teaching/db';
import { inviteStudent } from './invitations';
import { destroySession, requireTeacher } from './session';
import { endStudentSession, getStudentSession } from './student-session';
import { hashToken, newToken } from './tokens';
import { Uuid, type FormState } from './validation';


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

  const token = newToken();
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
  const session = await getStudentSession();
  await endStudentSession();
  if (session?.via === 'account') {
    await destroySession();
    redirect('/logowanie?wylogowano=1');
  }
  redirect('/uczen/brak-dostepu?wylogowano=1');
}

/** Sends an e-mail invitation to create a student account. A new invitation cancels the previous one. */
export async function sendInvitation(studentId: string, _: FormState, data: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const raw = data.get('email');
  const email = normalizeEmail(typeof raw === 'string' ? raw : '');
  const values = { email };

  const result = await inviteStudent(teacher, studentId, email);
  if ('field' in result) return { fieldErrors: { email: result.field }, values };
  if ('error' in result) return { error: result.error, values };
  revalidatePath(`/panel/uczniowie/${studentId}`);
  return { ok: true };
}

/** Cancels the pending invitation: its link stops working. */
export async function cancelInvitation(studentId: string) {
  const teacher = await requireTeacher();
  if (!(await ownedStudent(teacher.id, studentId))) return;
  await getDb().update(studentInvitations).set({ revokedAt: new Date() })
    .where(and(eq(studentInvitations.studentId, studentId), isNull(studentInvitations.acceptedAt), isNull(studentInvitations.revokedAt)));
  revalidatePath(`/panel/uczniowie/${studentId}`);
}

/** Disconnects the student's account from this teacher. They lose access on their next request; the account stays. */
export async function unlinkStudentAccount(studentId: string) {
  const teacher = await requireTeacher();
  if (!(await ownedStudent(teacher.id, studentId))) return;
  await getDb().update(students).set({ userId: null }).where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id)));
  revalidatePath(`/panel/uczniowie/${studentId}`);
}
