import Link from 'next/link';
import { StudentForm } from '@/components/StudentForm';
import { Card, PageHeader } from '@/components/ui';
import { ArrowLeftIcon } from '@/components/icons';
import { createStudent } from '@/lib/actions';
import { requireTeacher } from '@/lib/session';

export const metadata = { title: 'Nowy uczeń' };

export default async function NewStudentPage() {
  await requireTeacher();
  return (
    <div className="max-w-2xl">
      <Link href="/panel/uczniowie" className="mb-3 inline-flex items-center gap-1.5 text-sm font-extrabold opacity-60 hover:opacity-100 [&_svg]:size-4">
        <ArrowLeftIcon />Uczniowie
      </Link>
      <PageHeader title="Nowy uczeń" subtitle="Każdy uczeń dostaje własny zeszyt-tablicę. Podaj e-mail, a od razu wyślemy zaproszenie do założenia konta." />
      <Card className="p-5 sm:p-6">
        <StudentForm action={createStudent} submitLabel="Dodaj ucznia" withInvite />
      </Card>
    </div>
  );
}
