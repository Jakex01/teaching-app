import 'server-only';
import { and, asc, boards, desc, eq, getDb, gte, isNull, lessons, lt, sql, studentAccessLinks, students } from '@teaching/db';

// Every query takes the teacher's id and filters by it, so a teacher only ever sees their own data.

const lessonWithStudent = {
  id: lessons.id,
  startsAt: lessons.startsAt,
  endsAt: lessons.endsAt,
  topic: lessons.topic,
  videoUrl: lessons.videoUrl,
  status: lessons.status,
  student: {
    id: students.id,
    firstName: students.firstName,
    lastName: students.lastName,
    color: students.color,
  },
  roomId: boards.roomId,
};

export type LessonRow = Awaited<ReturnType<typeof lessonsBetween>>[number];

export async function lessonsBetween(teacherId: string, from: Date, to: Date) {
  return getDb()
    .select(lessonWithStudent)
    .from(lessons)
    .innerJoin(students, eq(students.id, lessons.studentId))
    .leftJoin(boards, eq(boards.studentId, students.id))
    .where(and(eq(lessons.teacherId, teacherId), gte(lessons.startsAt, from), lt(lessons.startsAt, to)))
    .orderBy(asc(lessons.startsAt));
}

export async function recentLessons(teacherId: string, before: Date, limit = 10) {
  return getDb()
    .select(lessonWithStudent)
    .from(lessons)
    .innerJoin(students, eq(students.id, lessons.studentId))
    .leftJoin(boards, eq(boards.studentId, students.id))
    .where(and(eq(lessons.teacherId, teacherId), lt(lessons.startsAt, before)))
    .orderBy(desc(lessons.startsAt))
    .limit(limit);
}

export async function listStudents(teacherId: string) {
  const now = new Date();
  // Next scheduled lesson per student, computed in the same query.
  const nextLesson = sql<Date | null>`(
    select min(${lessons.startsAt}) from ${lessons}
    where ${lessons.studentId} = ${students.id} and ${lessons.status} = 'scheduled' and ${lessons.startsAt} >= ${now}
  )`.mapWith(v => (v ? new Date(v) : null));
  const lessonCount = sql<number>`(select count(*) from ${lessons} where ${lessons.studentId} = ${students.id} and ${lessons.status} = 'done')`
    .mapWith(Number);

  return getDb()
    .select({
      id: students.id,
      firstName: students.firstName,
      lastName: students.lastName,
      color: students.color,
      subject: students.subject,
      level: students.level,
      goal: students.goal,
      roomId: boards.roomId,
      nextLesson,
      lessonCount,
    })
    .from(students)
    .leftJoin(boards, eq(boards.studentId, students.id))
    .where(and(eq(students.teacherId, teacherId), eq(students.status, 'active')))
    .orderBy(asc(students.firstName));
}

export async function getStudent(teacherId: string, studentId: string) {
  const [row] = await getDb()
    .select({ student: students, roomId: boards.roomId })
    .from(students)
    .leftJoin(boards, eq(boards.studentId, students.id))
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacherId)));
  if (!row) return null;

  const history = await getDb()
    .select({
      id: lessons.id,
      startsAt: lessons.startsAt,
      endsAt: lessons.endsAt,
      topic: lessons.topic,
      videoUrl: lessons.videoUrl,
      status: lessons.status,
    })
    .from(lessons)
    .where(and(eq(lessons.studentId, studentId), eq(lessons.teacherId, teacherId)))
    .orderBy(desc(lessons.startsAt));

  const [access] = await getDb()
    .select({ createdAt: studentAccessLinks.createdAt, lastUsedAt: studentAccessLinks.lastUsedAt })
    .from(studentAccessLinks)
    .where(and(eq(studentAccessLinks.studentId, studentId), isNull(studentAccessLinks.revokedAt)))
    .orderBy(desc(studentAccessLinks.createdAt))
    .limit(1);

  return { ...row.student, roomId: row.roomId, lessons: history, access: access ?? null };
}

export async function studentOptions(teacherId: string) {
  return getDb()
    .select({ id: students.id, firstName: students.firstName, lastName: students.lastName })
    .from(students)
    .where(and(eq(students.teacherId, teacherId), eq(students.status, 'active')))
    .orderBy(asc(students.firstName));
}

export async function countActiveStudents(teacherId: string) {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(students)
    .where(and(eq(students.teacherId, teacherId), eq(students.status, 'active')));
  return row?.n ?? 0;
}
