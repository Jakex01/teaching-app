import 'server-only';
import crypto from 'node:crypto';
import { and, boardElements, boards, desc, eq, getDb, inArray, lessons, lt, newRoomId, sql, students } from '@teaching/db';
import { carryOverUnfinished, cardStats, type BoardElement } from '@teaching/shared';
import { readAsset, saveAsset, type AssetExt } from './assets';
import { fmtShortDate } from './time';

// A student's boards: the notebook, one board per lesson, and free boards.

export interface BoardListItem {
  id: string;
  title: string;
  kind: 'notebook' | 'lesson' | 'free';
  /** The lesson date for lesson boards, otherwise when the board was made. */
  date: Date;
  lastOpenedAt: Date | null;
  tasks: number;
  solved: number;
  /** Section titles, top to bottom. */
  sections: string[];
}

const recent = sql`coalesce(${boards.lastOpenedAt}, ${boards.createdAt})`;

/** All boards of a student, most recently used first, with how many task cards are solved. */
export async function listBoards(studentId: string): Promise<BoardListItem[]> {
  const db = getDb();
  const rows = await db
    .select({ id: boards.id, title: boards.title, kind: boards.kind, roomId: boards.roomId, createdAt: boards.createdAt, lastOpenedAt: boards.lastOpenedAt, lessonAt: lessons.startsAt })
    .from(boards)
    .leftJoin(lessons, eq(lessons.id, boards.lessonId))
    .where(eq(boards.studentId, studentId))
    .orderBy(desc(recent));
  if (!rows.length) return [];

  const elements = await db
    .select({ roomId: boardElements.roomId, data: boardElements.data })
    .from(boardElements)
    .where(inArray(boardElements.roomId, rows.map(r => r.roomId)));
  const byRoom = new Map<string, BoardElement[]>();
  for (const e of elements) {
    const list = byRoom.get(e.roomId) ?? [];
    list.push(e.data as BoardElement); // validated when it was written
    byRoom.set(e.roomId, list);
  }

  return rows.map(r => ({
    id: r.id, title: r.title, kind: r.kind, lastOpenedAt: r.lastOpenedAt,
    date: r.lessonAt ?? r.createdAt,
    ...cardStats(byRoom.get(r.roomId) ?? []),
    sections: (byRoom.get(r.roomId) ?? [])
      .filter((el): el is Extract<BoardElement, { type: 'section' }> => el.type === 'section')
      .sort((a, b) => a.y - b.y)
      .map(s => s.title),
  }));
}

/** The board to continue with: the one used last (or the notebook). */
export async function latestBoardId(studentId: string): Promise<string | null> {
  const [row] = await getDb().select({ id: boards.id }).from(boards).where(eq(boards.studentId, studentId)).orderBy(desc(recent)).limit(1);
  return row?.id ?? null;
}

export async function markOpened(boardId: string) {
  await getDb().update(boards).set({ lastOpenedAt: new Date() }).where(eq(boards.id, boardId));
}

/** A board of one of this teacher's active students, or null. */
export async function boardForTeacher(teacherId: string, boardId: string) {
  const [row] = await getDb()
    .select({ board: boards, student: { id: students.id, firstName: students.firstName, lastName: students.lastName } })
    .from(boards)
    .innerJoin(students, eq(students.id, boards.studentId))
    .where(and(eq(boards.id, boardId), eq(students.teacherId, teacherId), eq(students.status, 'active')));
  return row ?? null;
}

export const lessonBoardTitle = (startsAt: Date, topic: string | null, tz: string) =>
  `Lekcja ${fmtShortDate(startsAt, tz)}${topic ? ` · ${topic}` : ''}`.slice(0, 120);

/**
 * The board of a lesson, made on first use. A new one starts with copies of the task cards that weren't
 * finished on the student's previous lesson board, so nothing gets lost between lessons.
 */
export async function ensureLessonBoard(lesson: { id: string; studentId: string; startsAt: Date; topic: string | null }, tz: string) {
  const db = getDb();
  const [existing] = await db.select({ id: boards.id }).from(boards).where(eq(boards.lessonId, lesson.id));
  if (existing) return { id: existing.id, carried: 0 };

  const roomId = newRoomId();
  const [created] = await db.insert(boards)
    .values({ studentId: lesson.studentId, title: lessonBoardTitle(lesson.startsAt, lesson.topic, tz), roomId, kind: 'lesson', lessonId: lesson.id })
    .onConflictDoNothing()
    .returning({ id: boards.id });
  if (!created) {
    // Made at the same moment by another request.
    const [again] = await db.select({ id: boards.id }).from(boards).where(eq(boards.lessonId, lesson.id));
    return { id: again.id, carried: 0 };
  }

  const [previous] = await db
    .select({ roomId: boards.roomId })
    .from(boards)
    .innerJoin(lessons, eq(lessons.id, boards.lessonId))
    .where(and(eq(boards.studentId, lesson.studentId), eq(boards.kind, 'lesson'), lt(lessons.startsAt, lesson.startsAt)))
    .orderBy(desc(lessons.startsAt))
    .limit(1);
  if (!previous) return { id: created.id, carried: 0 };

  const old = await db.select({ data: boardElements.data }).from(boardElements).where(eq(boardElements.roomId, previous.roomId)).orderBy(boardElements.position);
  const copies = carryOverUnfinished(old.map(o => o.data as BoardElement), () => crypto.randomBytes(9).toString('base64url'));
  // Images live in their board's folder (the sync server refuses images of another board), so copy the files.
  for (const el of copies) {
    if (el.type !== 'image') continue;
    const [, , , room, file] = el.src.split('/');
    const asset = await readAsset(room, file);
    if (asset) el.src = await saveAsset(roomId, file.split('.').pop() as AssetExt, asset.bytes);
  }
  if (copies.length) {
    await db.insert(boardElements).values(copies.map((el, i) => ({ roomId, elementId: el.id, position: i + 1, data: el })));
  }
  return { id: created.id, carried: copies.filter(el => el.type === 'task').length };
}
