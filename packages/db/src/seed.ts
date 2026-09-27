// Development data: the dev teacher, and a few example students and lessons on first run.
// Safe to run many times. Runs automatically before `npm run dev`.

import { eq } from 'drizzle-orm';
import { getDb } from './client';
import { DEV_TEACHER_ID, newRoomId } from './dev';
import { boards, lessons, students, teacherProfiles, users } from './schema';

const db = getDb();

await db.insert(users)
  .values({ id: DEV_TEACHER_ID, email: 'dev-teacher@teaching.local', displayName: 'Kuba' })
  .onConflictDoNothing();
await db.insert(teacherProfiles)
  .values({ userId: DEV_TEACHER_ID, subjects: ['matematyka', 'fizyka'] })
  .onConflictDoNothing();

const existing = await db.select({ id: students.id }).from(students).where(eq(students.teacherId, DEV_TEACHER_ID)).limit(1);

if (!existing.length) {
  const examples = [
    { firstName: 'Ola', lastName: 'Nowak', color: '#FF5A4E', subject: 'matematyka', level: 'Liceum, klasa 3', goal: 'Matura rozszerzona, maj', notes: 'Dobrze liczy, gubi się w dowodach. Lubi rysować schematy.' },
    { firstName: 'Tymek', lastName: 'Kowalski', color: '#3D8BFF', subject: 'fizyka', level: 'Szkoła podstawowa, klasa 8', goal: 'Egzamin ósmoklasisty', notes: null },
    { firstName: 'Zuza', lastName: 'Wiśniewska', color: '#22C1A0', subject: 'matematyka', level: 'Studia, 1. rok', goal: 'Zaliczenie analizy', notes: 'Kolokwium w listopadzie.' },
  ];

  const now = new Date();
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const d = new Date(now);
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, minute, 0, 0);
    return d;
  };
  const plan = [
    [{ day: -3, h: 17, topic: 'Funkcja kwadratowa' }, { day: 0, h: 17, topic: 'Ciągi arytmetyczne' }, { day: 4, h: 17, topic: 'Ciągi geometryczne' }],
    [{ day: 0, h: 15, m: 30, topic: 'Ruch jednostajny' }, { day: 2, h: 16, topic: 'Prędkość średnia' }],
    [{ day: -1, h: 19, topic: 'Granice ciągów' }, { day: 6, h: 19, topic: 'Pochodne' }],
  ];

  for (const [i, s] of examples.entries()) {
    const [student] = await db.insert(students).values({ ...s, teacherId: DEV_TEACHER_ID }).returning();
    await db.insert(boards).values({ studentId: student.id, title: `Zeszyt: ${s.subject}`, roomId: newRoomId() });
    for (const l of plan[i]) {
      const startsAt = at(l.day, l.h, 'm' in l ? l.m : 0);
      await db.insert(lessons).values({
        teacherId: DEV_TEACHER_ID,
        studentId: student.id,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 60 * 60 * 1000),
        topic: l.topic,
        videoUrl: 'https://meet.google.com/',
        status: l.day < 0 ? 'done' : 'scheduled',
      });
    }
  }
  console.log('Added example students and lessons.');
}

console.log('Dev teacher is ready.');
process.exit(0);
