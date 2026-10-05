import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { BoardClient } from '@/app/board/BoardClient';
import { boardForTeacher, markOpened } from '@/lib/boards';
import { config } from '@/lib/config';
import { requireTeacher } from '@/lib/session';
import { boardTicket } from '@/lib/tickets';
import { Uuid } from '@/lib/validation';

export const metadata = { title: 'Tablica · Doodle Board' };

// The teacher opens one of a student's boards. Joins as "teacher" (Spotlight, Clear).
export default async function TeacherBoardPage({ params, searchParams }: { params: Promise<{ boardId: string }>; searchParams: Promise<{ sekcja?: string }> }) {
  const { boardId } = await params;
  // "Add it there" from the new-board form: the board adds this section once it has loaded.
  // Only when the link was clicked inside this app: the browser sets Sec-Fetch-Site itself, so a link
  // on another website can't add sections to a teacher's board.
  const { sekcja } = await searchParams;
  const fromThisApp = (await headers()).get('sec-fetch-site') === 'same-origin';
  const newSection = fromThisApp && typeof sekcja === 'string' ? sekcja.trim().slice(0, 80) || undefined : undefined;
  const teacher = await requireTeacher();
  if (!Uuid.safeParse(boardId).success) notFound();
  const found = await boardForTeacher(teacher.id, boardId);
  if (!found) notFound();
  await markOpened(boardId);

  const { board, student } = found;
  const color = '#FFC93C';
  return (
    <BoardClient
      syncUrl={config.SYNC_PUBLIC_URL}
      session={{
        room: board.roomId,
        ticket: boardTicket(board.roomId, { uid: teacher.id, name: teacher.displayName, role: 'teacher', color }),
        name: teacher.displayName,
        role: 'teacher',
        color,
        title: `${student.firstName} · ${board.title}`,
        backHref: `/panel/uczniowie/${student.id}`,
        backLabel: 'Panel',
        newSection,
      }}
    />
  );
}
