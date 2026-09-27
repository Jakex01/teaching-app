import 'server-only';
import { and, boards, eq, getDb, students } from '@teaching/db';
import { getTeacher } from './session';
import { getStudentSession } from './student-session';

/** Can the person making this request see the notebook with this live-sync room? */
export async function canViewRoom(room: string): Promise<boolean> {
  const student = await getStudentSession();
  if (student?.board?.roomId === room) return true;

  const teacher = await getTeacher();
  if (!teacher) return false;
  const [row] = await getDb()
    .select({ id: boards.id })
    .from(boards)
    .innerJoin(students, eq(students.id, boards.studentId))
    .where(and(eq(boards.roomId, room), eq(students.teacherId, teacher.id)));
  return !!row;
}
