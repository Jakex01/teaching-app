import 'server-only';
import { and, boards, eq, getDb, students } from '@teaching/db';
import { getTeacher } from './session';
import { getStudentSession } from './student-session';

/** Can the person making this request see the notebook with this live-sync room? */
export async function canViewRoom(room: string): Promise<boolean> {
  // A student sees all boards of their own notebook (the notebook, lesson boards, free boards).
  const student = await getStudentSession();
  if (student) {
    const [own] = await getDb().select({ id: boards.id }).from(boards).where(and(eq(boards.roomId, room), eq(boards.studentId, student.student.id)));
    if (own) return true;
  }

  const teacher = await getTeacher();
  if (!teacher) return false;
  const [row] = await getDb()
    .select({ id: boards.id })
    .from(boards)
    .innerJoin(students, eq(students.id, boards.studentId))
    .where(and(eq(boards.roomId, room), eq(students.teacherId, teacher.id)));
  return !!row;
}
