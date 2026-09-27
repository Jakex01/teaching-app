import { notFound } from 'next/navigation';
import { BoardClient } from '@/app/board/BoardClient';
import { config } from '@/lib/config';
import { getStudent } from '@/lib/data';
import { requireTeacher } from '@/lib/session';
import { boardTicket } from '@/lib/tickets';
import { Uuid } from '@/lib/validation';

export const metadata = { title: 'Zeszyt · Doodle Board' };

// The teacher opens a student's notebook-board. Joins as "teacher" (Spotlight, Clear).
export default async function TeacherNotebookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teacher = await requireTeacher();
  if (!Uuid.safeParse(id).success) notFound();
  const student = await getStudent(teacher.id, id);
  if (!student || student.status === 'archived' || !student.roomId) notFound();

  const color = '#FFC93C';
  return (
    <BoardClient
      syncUrl={config.SYNC_PUBLIC_URL}
      session={{
        room: student.roomId,
        ticket: boardTicket(student.roomId, { uid: teacher.id, name: teacher.displayName, role: 'teacher', color }),
        name: teacher.displayName,
        role: 'teacher',
        color,
        title: `${student.firstName} ${student.lastName ?? ''}`.trim(),
        backHref: `/panel/uczniowie/${student.id}`,
        backLabel: 'Panel',
      }}
    />
  );
}
