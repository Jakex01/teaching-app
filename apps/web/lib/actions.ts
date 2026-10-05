'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, boards, eq, getDb, lessons, newRoomId, normalizeEmail, students } from '@teaching/db';
import { inviteEmailProblem, inviteStudent } from './invitations';
import { requireTeacher } from './session';
import { zonedDateTime } from './time';
import { LessonInput, LessonStatusInput, StudentInput, Uuid, fieldErrors, type FormState } from './validation';

// Server actions for the teacher panel. Each one checks who is signed in and that the record
// belongs to that teacher before changing anything.

const formObject = (data: FormData) => Object.fromEntries([...data.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : '']));

export async function createStudent(_: FormState, data: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const values = formObject(data);
  const parsed = StudentInput.safeParse(values);
  // Optional: invite the student (or a parent) by e-mail right away.
  const inviteEmail = normalizeEmail(values.inviteEmail ?? '');
  const inviteProblem = inviteEmail ? await inviteEmailProblem(teacher.id, inviteEmail) : null;
  if (!parsed.success || inviteProblem) {
    return { fieldErrors: { ...(parsed.success ? {} : fieldErrors(parsed.error)), ...(inviteProblem ? { inviteEmail: inviteProblem } : {}) }, values };
  }

  const db = getDb();
  const [student] = await db.insert(students).values({ ...parsed.data, teacherId: teacher.id }).returning({ id: students.id });
  await db.insert(boards).values({
    studentId: student.id,
    title: parsed.data.subject ? `Zeszyt: ${parsed.data.subject}` : 'Zeszyt',
    roomId: newRoomId(),
  });

  let invite = '';
  if (inviteEmail) {
    const result = await inviteStudent(teacher, student.id, inviteEmail);
    invite = 'ok' in result ? '?zaproszenie=wyslane' : '?zaproszenie=blad';
  }

  revalidatePath('/panel', 'layout');
  redirect(`/panel/uczniowie/${student.id}${invite}`);
}

export async function updateStudent(studentId: string, _: FormState, data: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  if (!Uuid.safeParse(studentId).success) return { error: 'Nie znaleziono ucznia.' };
  const values = formObject(data);
  const parsed = StudentInput.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const updated = await getDb()
    .update(students)
    .set(parsed.data)
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id)))
    .returning({ id: students.id });
  if (!updated.length) return { error: 'Nie znaleziono ucznia.' };

  revalidatePath('/panel', 'layout');
  return { ok: true };
}

export async function archiveStudent(studentId: string) {
  const teacher = await requireTeacher();
  if (!Uuid.safeParse(studentId).success) return;
  await getDb()
    .update(students)
    .set({ status: 'archived' })
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id)));
  revalidatePath('/panel', 'layout');
  redirect('/panel/uczniowie');
}

export async function createLesson(_: FormState, data: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const values = formObject(data);
  const parsed = LessonInput.safeParse(values);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };
  const { studentId, date, time, duration, topic, videoUrl } = parsed.data;

  const db = getDb();
  const [owned] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id), eq(students.status, 'active')));
  if (!owned) return { fieldErrors: { studentId: 'Wybierz ucznia' }, values };

  const startsAt = zonedDateTime(date, time, teacher.timezone);
  await db.insert(lessons).values({
    teacherId: teacher.id,
    studentId,
    startsAt,
    endsAt: new Date(startsAt.getTime() + duration * 60_000),
    topic,
    videoUrl,
  });

  revalidatePath('/panel', 'layout');
  redirect(data.get('returnTo') === 'student' ? `/panel/uczniowie/${studentId}` : '/panel/lekcje');
}

export async function setLessonStatus(lessonId: string, status: string) {
  const teacher = await requireTeacher();
  const id = Uuid.safeParse(lessonId);
  const next = LessonStatusInput.safeParse(status);
  if (!id.success || !next.success) return;
  await getDb()
    .update(lessons)
    .set({ status: next.data })
    .where(and(eq(lessons.id, id.data), eq(lessons.teacherId, teacher.id)));
  revalidatePath('/panel', 'layout');
}

export async function deleteLesson(lessonId: string) {
  const teacher = await requireTeacher();
  const id = Uuid.safeParse(lessonId);
  if (!id.success) return;
  await getDb().delete(lessons).where(and(eq(lessons.id, id.data), eq(lessons.teacherId, teacher.id)));
  revalidatePath('/panel', 'layout');
}
