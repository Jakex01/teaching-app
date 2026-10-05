import { notFound } from 'next/navigation';
import { boards, eq, getDb } from '@teaching/db';
import { BoardClient } from '@/app/board/BoardClient';
import { markOpened } from '@/lib/boards';
import { config } from '@/lib/config';
import { requireStudent } from '@/lib/student-session';
import { boardTicket } from '@/lib/tickets';
import { Uuid } from '@/lib/validation';

export const metadata = { title: 'Tablica · Doodle Board' };

// One of the student's own boards. The ticket says "student", so Clear and Spotlight stay with the teacher.
export default async function StudentBoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const { student } = await requireStudent();
  if (!Uuid.safeParse(boardId).success) notFound();
  const [board] = await getDb().select().from(boards).where(eq(boards.id, boardId));
  if (!board || board.studentId !== student.id) notFound();
  await markOpened(board.id);

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
