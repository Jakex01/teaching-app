import { notFound } from 'next/navigation';
import { BoardClient } from '@/app/board/BoardClient';
import { config } from '@/lib/config';
import { requireStudent } from '@/lib/student-session';
import { boardTicket } from '@/lib/tickets';

export const metadata = { title: 'Mój zeszyt · Doodle Board' };

// The student's own notebook-board. The ticket says "student", so Clear and Spotlight stay with the teacher.
export default async function StudentNotebookPage() {
  const { student, board } = await requireStudent();
  if (!board) notFound();

  return (
    <BoardClient
      syncUrl={config.SYNC_PUBLIC_URL}
      session={{
        room: board.roomId,
        ticket: boardTicket(board.roomId, { uid: student.id, name: student.firstName, role: 'student', color: student.color }),
        name: student.firstName,
        role: 'student',
        color: student.color,
        title: board.title,
        backHref: '/uczen',
        backLabel: 'Moje lekcje',
      }}
    />
  );
}
