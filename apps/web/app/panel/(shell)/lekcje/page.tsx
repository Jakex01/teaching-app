import Link from 'next/link';
import { LessonItem } from '@/components/LessonItem';
import { EmptyState, LinkButton, PageHeader, SectionTitle, cn } from '@/components/ui';
import { CalendarIcon } from '@/components/icons';
import { lessonsBetween, recentLessons, type LessonRow } from '@/lib/data';
import { requireTeacher } from '@/lib/session';
import { dayKey, dayRange, fmtDayLabel } from '@/lib/time';

export const metadata = { title: 'Lekcje' };

function groupByDay(lessons: LessonRow[], tz: string) {
  const groups = new Map<string, LessonRow[]>();
  for (const l of lessons) {
    const key = dayKey(l.startsAt, tz);
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  return [...groups.values()];
}

export default async function LessonsPage() {
  const teacher = await requireTeacher();
  const tz = teacher.timezone;
  const next = dayRange(tz, 0, 21);
  const [upcoming, recent] = await Promise.all([
    lessonsBetween(teacher.id, next.start, next.end),
    recentLessons(teacher.id, next.start, 10),
  ]);
  const todayKey = dayKey(new Date(), tz);

  return (
    <>
      <PageHeader
        title="Lekcje"
        subtitle="Najbliższe 3 tygodnie"
        actions={<LinkButton href="/panel/lekcje/nowa" variant="primary"><CalendarIcon />Zaplanuj lekcję</LinkButton>}
      />

      {upcoming.length ? (
        <div className="grid gap-6">
          {groupByDay(upcoming, tz).map(items => {
            const isToday = dayKey(items[0].startsAt, tz) === todayKey;
            return (
              <section key={items[0].id}>
                <h2 className={cn(
                  'mb-2 inline-block rounded-full border-[2.5px] px-3 py-0.5 font-fun text-lg font-semibold first-letter:uppercase',
                  isToday ? '-rotate-1 border-ink bg-sun shadow-hard-sm' : 'border-transparent',
                )}>
                  {fmtDayLabel(items[0].startsAt, tz)}
                </h2>
                <ul className="grid gap-2.5">{items.map(l => <LessonItem key={l.id} lesson={l} tz={tz} boardStudentId={l.roomId ? l.student.id : null} />)}</ul>
              </section>
            );
          })}
        </div>
      ) : (
        <EmptyState emoji="🗓️" title="Brak zaplanowanych lekcji">
          <Link href="/panel/lekcje/nowa" className="underline">Zaplanuj pierwszą</Link>
        </EmptyState>
      )}

      {recent.length > 0 && (
        <section className="mt-10">
          <SectionTitle>Ostatnio</SectionTitle>
          <div className="grid gap-2 opacity-90">
            {recent.map(l => (
              <div key={l.id}>
                <p className="mb-1 ml-1 text-sm font-extrabold opacity-60 first-letter:uppercase">{fmtDayLabel(l.startsAt, tz)}</p>
                <ul><LessonItem lesson={l} tz={tz} boardStudentId={l.roomId ? l.student.id : null} /></ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
