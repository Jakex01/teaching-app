import Link from 'next/link';
import type { ReactNode } from 'react';
import { Avatar, Button } from '@/components/ui';
import { BrandMark } from '@/components/icons';
import { studentSignOut } from '@/lib/student-actions';
import { requireStudent } from '@/lib/student-session';

export const metadata = { title: 'Moje lekcje · Doodle Board' };

export default async function StudentLayout({ children }: { children: ReactNode }) {
  const { student, via } = await requireStudent();
  const fullName = `${student.firstName} ${student.lastName ?? ''}`.trim();

  return (
    <div className="mx-auto min-h-dvh max-w-3xl p-3 sm:p-6">
      <header className="mb-6 flex items-center justify-between gap-3 rounded-card border-[2.5px] border-ink bg-white p-2.5 pl-3 shadow-hard">
        <Link href="/uczen" className="flex items-center gap-2.5">
          <span className="grid size-9 -rotate-6 place-items-center rounded-xl border-[2.5px] border-ink bg-sun [&_svg]:size-6">
            <BrandMark />
          </span>
          <span className="hidden font-fun text-xl font-bold tracking-tight sm:inline">Doodle<span className="text-tomato">Board</span></span>
        </Link>
        <div className="flex items-center gap-2">
          <Avatar name={fullName} color={student.color} size="sm" />
          {via === 'account'
            ? <Link href="/uczen/konto" title="Konto" className="rounded-lg px-1 font-extrabold hover:bg-ink/5">{student.firstName}</Link>
            : <span className="font-extrabold">{student.firstName}</span>}
          <form action={studentSignOut}>
            <Button size="sm" variant="ghost" className="opacity-60 hover:opacity-100">Wyjdź</Button>
          </form>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
