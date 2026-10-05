'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { and, boards, eq, getDb, lessons, newRoomId, students } from '@teaching/db';
import { findSimilarBoards, type SimilarBoard } from '@teaching/shared';
import { boardForTeacher, ensureLessonBoard, listBoards } from './boards';
import { requireTeacher } from './session';
import { Uuid, type FormState } from './validation';

const text = (data: FormData, key: string) => {
  const v = data.get(key);
  return typeof v === 'string' ? v.trim() : '';
};

/** Opens a lesson's board, making it on first use (with unfinished tasks from the previous lesson). */
export async function openLessonBoard(lessonId: string) {
  const teacher = await requireTeacher();
  if (!Uuid.safeParse(lessonId).success) return;
  const [lesson] = await getDb()
    .select({ id: lessons.id, studentId: lessons.studentId, startsAt: lessons.startsAt, topic: lessons.topic })
    .from(lessons)
    .innerJoin(students, eq(students.id, lessons.studentId))
    .where(and(eq(lessons.id, lessonId), eq(lessons.teacherId, teacher.id), eq(students.status, 'active')));
  if (!lesson) return;
  const board = await ensureLessonBoard(lesson, teacher.timezone);
  revalidatePath(`/panel/uczniowie/${lesson.studentId}`);
  redirect(`/panel/tablica/${board.id}${board.carried ? `?przeniesiono=${board.carried}` : ''}`);
}

/** A free board for a student (a mock exam, revision…). */
export async function createBoard(studentId: string, _: FormState, data: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const title = text(data, 'title').slice(0, 120);
  if (!title) return { fieldErrors: { title: 'Podaj nazwę tablicy.' } };
  if (!Uuid.safeParse(studentId).success) return { error: 'Nie znaleziono ucznia.' };
  const [student] = await getDb().select({ id: students.id }).from(students)
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id), eq(students.status, 'active')));
  if (!student) return { error: 'Nie znaleziono ucznia.' };

  const [board] = await getDb().insert(boards).values({ studentId, title, roomId: newRoomId(), kind: 'free' }).returning({ id: boards.id });
  redirect(`/panel/tablica/${board.id}`);
}

export async function renameBoard(boardId: string, _: FormState, data: FormData): Promise<FormState> {
  const teacher = await requireTeacher();
  const title = text(data, 'title').slice(0, 120);
  if (!title) return { fieldErrors: { title: 'Podaj nazwę tablicy.' } };
  if (!Uuid.safeParse(boardId).success) return { error: 'Nie znaleziono tablicy.' };
  const found = await boardForTeacher(teacher.id, boardId);
  if (!found) return { error: 'Nie znaleziono tablicy.' };
  await getDb().update(boards).set({ title }).where(eq(boards.id, boardId));
  revalidatePath(`/panel/uczniowie/${found.student.id}`);
  return { ok: true };
}

/** Boards (or sections in them) of this student whose names look like `title`: "maybe use that one". */
export async function suggestBoards(studentId: string, title: string): Promise<SimilarBoard[]> {
  const teacher = await requireTeacher();
  const name = typeof title === 'string' ? title.trim().slice(0, 120) : '';
  if (name.length < 3 || !Uuid.safeParse(studentId).success) return [];
  const [student] = await getDb().select({ id: students.id }).from(students)
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id)));
  if (!student) return [];
  return findSimilarBoards(name, await listBoards(studentId));
}
