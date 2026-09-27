import Link from 'next/link';
import { boardHref } from '@/components/LessonItem';
import { Avatar, Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui';
import { BoardIcon, PlusIcon } from '@/components/icons';
import { listStudents } from '@/lib/data';
import { requireTeacher } from '@/lib/session';
import { fmtDayLabel, fmtTime } from '@/lib/time';

export const metadata = { title: 'Uczniowie' };

export default async function StudentsPage() {
  const teacher = await requireTeacher();
  const students = await listStudents(teacher.id);
  const tz = teacher.timezone;

  return (
    <>
      <PageHeader
        title="Uczniowie"
        subtitle={students.length === 1 ? '1 aktywny uczeń' : `${students.length} aktywnych uczniów`}
        actions={<LinkButton href="/panel/uczniowie/nowy" variant="primary"><PlusIcon />Dodaj ucznia</LinkButton>}
      />

      {students.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {students.map((s, i) => (
            <li key={s.id}>
              <Card className={`flex h-full flex-col p-4 transition-transform duration-200 ease-bounce hover:-translate-y-1 ${i % 3 === 0 ? 'hover:-rotate-1' : 'hover:rotate-1'}`}>
                <Link href={`/panel/uczniowie/${s.id}`} className="flex items-center gap-3">
                  <Avatar name={`${s.firstName} ${s.lastName ?? ''}`} color={s.color} />
                  <div className="min-w-0">
                    <p className="truncate font-fun text-xl font-semibold">{s.firstName} {s.lastName}</p>
                    <p className="truncate text-sm font-bold opacity-60">{s.level || 'Poziom nieustalony'}</p>
                  </div>
                </Link>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {s.subject && <Badge className="bg-paper">{s.subject}</Badge>}
                  <Badge className="bg-paper">{s.lessonCount} {s.lessonCount === 1 ? 'lekcja' : 'lekcji'}</Badge>
                </div>
                {s.goal && <p className="mt-3 text-sm font-bold">🎯 {s.goal}</p>}

                <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                  <p className="text-sm font-bold opacity-60">
                    {s.nextLesson ? `Następna: ${fmtDayLabel(s.nextLesson, tz).split(',')[0].toLowerCase()}, ${fmtTime(s.nextLesson, tz)}` : 'Brak planu'}
                  </p>
                  {s.roomId && <LinkButton href={boardHref(s.id)} size="sm" variant="sun"><BoardIcon />Tablica</LinkButton>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState emoji="🎒" title="Nie masz jeszcze uczniów">
          Dodaj pierwszego ucznia, a dostanie własny zeszyt-tablicę.
          <div className="mt-4"><LinkButton href="/panel/uczniowie/nowy" variant="primary"><PlusIcon />Dodaj ucznia</LinkButton></div>
        </EmptyState>
      )}
    </>
  );
}
