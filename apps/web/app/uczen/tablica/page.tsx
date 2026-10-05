import { notFound, redirect } from 'next/navigation';
import { latestBoardId } from '@/lib/boards';
import { requireStudent } from '@/lib/student-session';

// "Mój zeszyt": continues with the board used last.
export default async function ContinueStudentBoardPage() {
  const { student } = await requireStudent();
  const boardId = await latestBoardId(student.id);
  if (!boardId) notFound();
  redirect(`/uczen/tablica/${boardId}`);
}
