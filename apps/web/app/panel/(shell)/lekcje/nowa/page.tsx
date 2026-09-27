import Link from 'next/link';
import { LessonForm } from '@/components/LessonForm';
import { Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { ArrowLeftIcon, PlusIcon } from '@/components/icons';
import { studentOptions } from '@/lib/data';
import { requireTeacher } from '@/lib/session';
import { fmtDateInput } from '@/lib/time';

export const metadata = { title: 'Nowa lekcja' };

export default async function NewLessonPage({ searchParams }: { searchParams: Promise<{ uczen?: string }> }) {
  const teacher = await requireTeacher();
  const { uczen } = await searchParams;
  const students = await studentOptions(teacher.id);
  const preselected = students.find(s => s.id === uczen)?.id;

  return (
    <div className="max-w-2xl">
      <Link
        href={preselected ? `/panel/uczniowie/${preselected}` : '/panel/lekcje'}
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-extrabold opacity-60 hover:opacity-100 [&_svg]:size-4"
      >
        <ArrowLeftIcon />{preselected ? 'Uczeń' : 'Lekcje'}
      </Link>
      <PageHeader title="Nowa lekcja" subtitle={`Godziny w strefie ${teacher.timezone}`} />
      {students.length ? (
        <Card className="p-5 sm:p-6">
          <LessonForm
            students={students}
            defaultStudentId={preselected}
            defaultDate={fmtDateInput(new Date(), teacher.timezone)}
            returnTo={preselected ? 'student' : 'lessons'}
          />
        </Card>
      ) : (
        <EmptyState emoji="🎒" title="Najpierw dodaj ucznia">
          <div className="mt-3"><LinkButton href="/panel/uczniowie/nowy" variant="primary"><PlusIcon />Dodaj ucznia</LinkButton></div>
        </EmptyState>
      )}
    </div>
  );
}
