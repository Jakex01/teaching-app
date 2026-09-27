import Link from 'next/link';
import { LessonItem } from '@/components/LessonItem';
import { Avatar, Card, EmptyState, LinkButton, PageHeader, SectionTitle, cn } from '@/components/ui';
import { CalendarIcon, PlusIcon, UsersIcon } from '@/components/icons';
import { countActiveStudents, lessonsBetween, listStudents } from '@/lib/data';
import { requireTeacher } from '@/lib/session';
import { dayRange, fmtDayLabel, fmtLongDate, fmtShortDate, fmtTime, weekRange } from '@/lib/time';

export const metadata = { title: 'Pulpit' };

function greeting(hour: number) {
  if (hour < 12) return 'Dzień dobry';
  if (hour < 18) return 'Cześć';
  return 'Dobry wieczór';
}

export default async function DashboardPage() {
  const teacher = await requireTeacher();
  const tz = teacher.timezone;
  const today = dayRange(tz);
  const week = weekRange(tz);
  const upcomingRange = dayRange(tz, 1, 14);

  const [todayLessons, weekLessons, upcoming, studentCount, students] = await Promise.all([
    lessonsBetween(teacher.id, today.start, today.end),
    lessonsBetween(teacher.id, week.start, week.end),
    lessonsBetween(teacher.id, upcomingRange.start, upcomingRange.end),
    countActiveStudents(teacher.id),
    listStudents(teacher.id),
  ]);

  const now = new Date();
  const hour = Number(fmtTime(now, tz).slice(0, 2));
  const nextToday = todayLessons.find(l => l.status === 'scheduled' && l.endsAt > now);
  const weekDone = weekLessons.filter(l => l.status === 'done').length;
  const weekPlanned = weekLessons.filter(l => l.status !== 'cancelled').length;
  const nextUpcoming = upcoming.filter(l => l.status === 'scheduled').slice(0, 5);

  const stats = [
    { label: 'Aktywni uczniowie', value: studentCount, color: 'bg-mint', href: '/panel/uczniowie' },
    { label: 'Lekcje dziś', value: todayLessons.filter(l => l.status !== 'cancelled').length, color: 'bg-sun', href: '/panel/lekcje' },
    { label: 'Ten tydzień', value: `${weekDone}/${weekPlanned}`, hint: 'odbyte / zaplanowane', color: 'bg-bubble', href: '/panel/lekcje' },
  ];

  return (
    <>
      <PageHeader
        title={<>{greeting(hour)}, {teacher.displayName} <span className="inline-block origin-bottom-right animate-wave">👋</span></>}
        subtitle={fmtLongDate(now, tz)}
        actions={<>
          <LinkButton href="/panel/uczniowie/nowy"><PlusIcon />Uczeń</LinkButton>
          <LinkButton href="/panel/lekcje/nowa" variant="primary"><CalendarIcon />Zaplanuj lekcję</LinkButton>
        </>}
      />

      <div className="mb-8 grid grid-cols-3 gap-2.5 sm:gap-4">
        {stats.map((s, i) => (
          <Link key={s.label} href={s.href} className={cn(
            'group rounded-card border-[2.5px] border-ink p-3 shadow-hard-sm transition-transform duration-200 ease-bounce hover:-translate-y-1 sm:p-4 sm:shadow-hard',
            s.color, i === 0 ? '-rotate-1' : i === 2 ? 'rotate-1' : '',
          )}>
            <p className="text-[10px] leading-tight font-extrabold tracking-wide uppercase opacity-70 sm:text-sm">{s.label}</p>
            <p className="font-fun text-3xl font-bold sm:text-4xl">{s.value}</p>
            {s.hint && <p className="hidden text-xs font-bold opacity-60 sm:block">{s.hint}</p>}
          </Link>
        ))}
      </div>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0">
          <SectionTitle action={nextToday && <span className="rounded-full border-2 border-ink bg-white px-3 py-0.5 text-sm font-extrabold">Następna o {fmtTime(nextToday.startsAt, tz)}</span>}>
            Dziś
          </SectionTitle>
          {todayLessons.length ? (
            <ul className="grid gap-2.5">
              {todayLessons.map(l => <LessonItem key={l.id} lesson={l} tz={tz} boardStudentId={l.roomId ? l.student.id : null} highlight={l.id === nextToday?.id} />)}
            </ul>
          ) : (
            <EmptyState emoji="☕" title="Dziś wolne">
              <Link href="/panel/lekcje/nowa" className="underline">Zaplanuj lekcję</Link>, jeśli coś się zmieni.
            </EmptyState>
          )}

          <div className="mt-8">
            <SectionTitle action={<Link href="/panel/lekcje" className="text-sm font-extrabold underline">Wszystkie lekcje</Link>}>
              Najbliższe dni
            </SectionTitle>
            {nextUpcoming.length ? (
              <ul className="grid gap-2">
                {nextUpcoming.map(l => (
                  <li key={l.id}>
                    <Link href={`/panel/uczniowie/${l.student.id}`} className="flex items-center gap-3 rounded-2xl border-[2.5px] border-transparent px-2 py-1.5 transition-colors hover:border-ink hover:bg-white">
                      <div className="w-24 shrink-0 text-sm leading-tight font-extrabold">
                        <div className="first-letter:uppercase">{fmtDayLabel(l.startsAt, tz).split(',')[0]}</div>
                        <div className="opacity-50">{fmtShortDate(l.startsAt, tz)} · {fmtTime(l.startsAt, tz)}</div>
                      </div>
                      <Avatar name={`${l.student.firstName} ${l.student.lastName ?? ''}`} color={l.student.color} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-extrabold">{l.student.firstName} {l.student.lastName}</p>
                        <p className="truncate text-sm font-bold opacity-60">{l.topic || 'Bez tematu'}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-bold opacity-60">Brak zaplanowanych lekcji w ciągu 2 tygodni.</p>
            )}
          </div>
        </section>

        <aside>
          <SectionTitle action={<Link href="/panel/uczniowie" className="text-sm font-extrabold underline">Wszyscy</Link>}>
            Uczniowie
          </SectionTitle>
          {students.length ? (
            <Card className="divide-y-2 divide-ink/10 p-2">
              {students.slice(0, 6).map(s => (
                <Link key={s.id} href={`/panel/uczniowie/${s.id}`} className="flex items-center gap-3 rounded-xl p-2 hover:bg-paper">
                  <Avatar name={`${s.firstName} ${s.lastName ?? ''}`} color={s.color} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-extrabold">{s.firstName} {s.lastName}</p>
                    <p className="truncate text-xs font-bold opacity-50">
                      {s.nextLesson ? `Następna: ${fmtDayLabel(s.nextLesson, tz).split(',')[0].toLowerCase()} ${fmtTime(s.nextLesson, tz)}` : 'Brak zaplanowanej lekcji'}
                    </p>
                  </div>
                </Link>
              ))}
            </Card>
          ) : (
            <EmptyState emoji="🎒" title="Nie masz jeszcze uczniów">
              <LinkButton href="/panel/uczniowie/nowy" size="sm" variant="mint" className="mt-2"><UsersIcon />Dodaj pierwszego</LinkButton>
            </EmptyState>
          )}
        </aside>
      </div>
    </>
  );
}
