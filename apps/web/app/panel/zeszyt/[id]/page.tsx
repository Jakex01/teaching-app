import { notFound, redirect } from 'next/navigation';
import { getStudent } from '@/lib/data';
import { latestBoardId } from '@/lib/boards';
import { requireTeacher } from '@/lib/session';
import { Uuid } from '@/lib/validation';

// "Tablica" for a student: continues with the board used last (or the notebook).
export default async function ContinueBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teacher = await requireTeacher();
  if (!Uuid.safeParse(id).success) notFound();
  const student = await getStudent(teacher.id, id);
  if (!student || student.status === 'archived') notFound();
  const boardId = await latestBoardId(student.id);
  if (!boardId) notFound();
  redirect(`/panel/tablica/${boardId}`);
}
