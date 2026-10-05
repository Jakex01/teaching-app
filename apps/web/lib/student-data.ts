import 'server-only';
import { and, asc, desc, eq, getDb, gte, lessons, lt } from '@teaching/db';

// What a student may see about their lessons. Deliberately no teacher notes or other students.
const studentLessonFields = {
  id: lessons.id,
  startsAt: lessons.startsAt,
  endsAt: lessons.endsAt,
  topic: lessons.topic,
  videoUrl: lessons.videoUrl,
  status: lessons.status,
};

export async function studentUpcomingLessons(studentId: string, limit = 8) {
  // Include a lesson that is still running.
  const from = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const rows = await getDb()
    .select(studentLessonFields)
    .from(lessons)
    .where(and(eq(lessons.studentId, studentId), gte(lessons.startsAt, from)))
    .orderBy(asc(lessons.startsAt))
    .limit(limit + 4);
  const now = new Date();
  return rows.filter(l => l.endsAt > now).slice(0, limit);
}

export async function studentPastLessons(studentId: string, limit = 5) {
  return getDb()
    .select(studentLessonFields)
    .from(lessons)
    .where(and(eq(lessons.studentId, studentId), eq(lessons.status, 'done'), lt(lessons.startsAt, new Date())))
    .orderBy(desc(lessons.startsAt))
    .limit(limit);
}

/** Everything the student's home page shows: the next lesson (and whether it's on now), the rest, and past ones. */
export async function studentHome(studentId: string) {
  const [upcoming, past] = await Promise.all([studentUpcomingLessons(studentId), studentPastLessons(studentId)]);
  const now = Date.now();
  const next = upcoming.find(l => l.status === 'scheduled') ?? null;
  return {
    next,
    rest: upcoming.filter(l => l.id !== next?.id),
    past,
    minutesToNext: next ? Math.round((next.startsAt.getTime() - now) / 60_000) : null,
    // "Live" from 15 minutes before the start until the end.
    isLive: next ? next.startsAt.getTime() - 15 * 60_000 <= now && next.endsAt.getTime() > now : false,
  };
}
