import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LessonItem, boardHref } from '@/components/LessonItem';
import { StudentAccessCard } from '@/components/StudentAccessCard';
import { StudentForm } from '@/components/StudentForm';
import { Avatar, Badge, Button, Card, EmptyState, ExternalButton, LinkButton, SectionTitle } from '@/components/ui';
import { ArrowLeftIcon, BoardIcon, CalendarIcon, EyeIcon } from '@/components/icons';
import { archiveStudent, updateStudent } from '@/lib/actions';
import { getStudent } from '@/lib/data';
import { requireTeacher } from '@/lib/session';
import { dayKey, fmtDayLabel, fmtShortDate, fmtTime } from '@/lib/time';
import { Uuid } from '@/lib/validation';

export const metadata = { title: 'Uczeń' };

export default async function StudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const teacher = await requireTeacher();
  if (!Uuid.safeParse(id).success) notFound();
  const student = await getStudent(teacher.id, id);
  if (!student || student.status === 'archived') notFound();

  const tz = teacher.timezone;
  const now = new Date();
  const upcoming = student.lessons.filter(l => l.startsAt >= now || (l.status === 'scheduled' && l.endsAt >= now)).reverse();
  const past = student.lessons.filter(l => !upcoming.includes(l));
  const doneCount = student.lessons.filter(l => l.status === 'done').length;
  const fullName = `${student.firstName} ${student.lastName ?? ''}`.trim();

  // Past lessons grouped by day, newest first.
  const pastByDay = new Map<string, typeof past>();
  for (const l of past) {
    const key = dayKey(l.startsAt, tz);
    pastByDay.set(key, [...(pastByDay.get(key) ?? []), l]);
  }

  return (
    <>
      <Link href="/panel/uczniowie" className="mb-3 inline-flex items-center gap-1.5 text-sm font-extrabold opacity-60 hover:opacity-100 [&_svg]:size-4">
        <ArrowLeftIcon />Uczniowie
      </Link>

      <div className="mb-8 flex flex-wrap items-center gap-4">
        <Avatar name={fullName} color={student.color} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-fun text-3xl font-bold tracking-tight sm:text-4xl">{fullName}</h1>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {student.subject && <Badge className="bg-sun">{student.subject}</Badge>}
            {student.level && <Badge className="bg-white">{student.level}</Badge>}
            <Badge className="bg-mint">{doneCount} {doneCount === 1 ? 'lekcja odbyta' : 'odbytych lekcji'}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {student.roomId && <LinkButton href={boardHref(student.id)} variant="sun" size="lg"><BoardIcon />Zeszyt-tablica</LinkButton>}
          {/* A plain <a>, not <Link>: Next.js would prefetch a <Link>, which would sign in on hover. */}
          <ExternalButton href={`/panel/uczniowie/${student.id}/podglad`} size="lg" title="Otwiera widok ucznia w nowej karcie">
            <EyeIcon />Podgląd jako uczeń
          </ExternalButton>
          <LinkButton href={`/panel/lekcje/nowa?uczen=${student.id}`} variant="primary" size="lg"><CalendarIcon />Zaplanuj</LinkButton>
        </div>
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0">
          <SectionTitle>Nadchodzące lekcje</SectionTitle>
          {upcoming.length ? (
            <div className="mb-8 grid gap-2.5">
              {upcoming.map(l => (
                <div key={l.id}>
                  <p className="mb-1 ml-1 text-sm font-extrabold opacity-60 first-letter:uppercase">{fmtDayLabel(l.startsAt, tz)}</p>
                  <ul><LessonItem lesson={l} tz={tz} boardStudentId={student.roomId ? student.id : null} /></ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-8">
              <EmptyState emoji="🗓️" title="Nic nie jest zaplanowane">
                <Link href={`/panel/lekcje/nowa?uczen=${student.id}`} className="underline">Zaplanuj następną lekcję</Link>
              </EmptyState>
            </div>
          )}

          <SectionTitle>Historia</SectionTitle>
          {pastByDay.size ? (
            <div className="grid gap-4">
              {[...pastByDay].map(([day, items]) => (
                <div key={day}>
                  <p className="mb-1 ml-1 text-sm font-extrabold opacity-60 first-letter:uppercase">{fmtDayLabel(items[0].startsAt, tz)}</p>
                  <ul className="grid gap-2">{items.map(l => <LessonItem key={l.id} lesson={l} tz={tz} boardStudentId={student.roomId ? student.id : null} />)}</ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="font-bold opacity-60">Jeszcze nie było lekcji.</p>
          )}
        </section>

        <aside>
          <div className="mb-8">
            <StudentAccessCard
              studentId={student.id}
              firstName={student.firstName}
              active={student.access ? {
                created: `${fmtShortDate(student.access.createdAt, tz)}, ${fmtTime(student.access.createdAt, tz)}`,
                lastUsed: student.access.lastUsedAt ? `${fmtShortDate(student.access.lastUsedAt, tz)}, ${fmtTime(student.access.lastUsedAt, tz)}` : null,
              } : null}
            />
          </div>
          <SectionTitle>Kartoteka</SectionTitle>
          <Card className="p-5">
            <StudentForm
              action={updateStudent.bind(null, student.id)}
              initial={student}
              submitLabel="Zapisz zmiany"
            />
          </Card>
          <form action={archiveStudent.bind(null, student.id)} className="mt-4">
            <Button variant="ghost" size="sm" className="opacity-60 hover:opacity-100">Przenieś do archiwum</Button>
          </form>
        </aside>
      </div>
    </>
  );
}
