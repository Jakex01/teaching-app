import Link from 'next/link';
import { Badge, Card, EmptyState, ExternalButton, SectionTitle, cn } from '@/components/ui';
import { BoardIcon, VideoIcon } from '@/components/icons';
import { BoardList } from '@/components/BoardList';
import { listBoards } from '@/lib/boards';
import { studentHome } from '@/lib/student-data';
import { requireStudent } from '@/lib/student-session';
import { fmtDayLabel, fmtShortDate, fmtTime } from '@/lib/time';

export default async function StudentHomePage() {
  const { student, teacher, board } = await requireStudent();
  const tz = teacher.timezone;
  const [{ next, rest, past, minutesToNext, isLive }, boardList] = await Promise.all([studentHome(student.id), listBoards(student.id)]);

  return (
    <>
      <h1 className="font-fun text-3xl font-bold tracking-tight sm:text-4xl">
        Cześć, {student.firstName}! <span className="inline-block origin-bottom-right animate-wave">👋</span>
      </h1>
      <p className="mt-1 mb-6 font-bold opacity-60">
        Uczysz się z: {teacher.name}{student.subject ? ` · ${student.subject}` : ''}
      </p>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        {board ? (
          <Link
            href="/uczen/tablica"
            className="group flex -rotate-1 flex-col justify-between gap-6 rounded-card border-[2.5px] border-ink bg-sun p-5 shadow-hard transition-transform duration-200 ease-bounce hover:-translate-y-1 hover:rotate-0"
          >
            <span className="grid size-12 place-items-center rounded-2xl border-[2.5px] border-ink bg-white transition-transform duration-300 ease-bounce group-hover:-rotate-12 [&_svg]:size-6">
              <BoardIcon />
            </span>
            <span>
              <span className="block font-fun text-2xl font-bold">Kontynuuj →</span>
              <span className="block truncate text-sm font-bold opacity-70">{boardList[0]?.title ?? 'Wszystko z lekcji zostaje tutaj.'}</span>
            </span>
          </Link>
        ) : (
          <EmptyState emoji="📓" title="Zeszyt jeszcze nie jest gotowy" />
        )}

        <Card bg={isLive ? 'bg-mint' : 'bg-white'} className="flex rotate-1 flex-col justify-between gap-4 p-5">
          {next ? (
            <>
              <div>
                <p className="text-xs font-extrabold tracking-wider uppercase opacity-60">
                  {isLive ? 'Lekcja teraz' : 'Następna lekcja'}
                </p>
                <p className="mt-1 font-fun text-2xl font-bold first-letter:uppercase">
                  {fmtDayLabel(next.startsAt, tz).split(',')[0]}, {fmtTime(next.startsAt, tz)}
                </p>
                <p className="font-bold opacity-70">{next.topic || 'Temat ustali nauczyciel'}</p>
                {!isLive && minutesToNext !== null && minutesToNext < 24 * 60 && (
                  <p className="mt-1 text-sm font-bold opacity-50">
                    za {minutesToNext >= 60 ? `${Math.floor(minutesToNext / 60)} h ${minutesToNext % 60} min` : `${minutesToNext} min`}
                  </p>
                )}
              </div>
              {next.videoUrl && (
                <ExternalButton href={next.videoUrl} variant={isLive ? 'primary' : 'secondary'} size={isLive ? 'lg' : 'md'} className="self-start">
                  <VideoIcon />{isLive ? 'Dołącz do wideo' : 'Link do wideo'}
                </ExternalButton>
              )}
            </>
          ) : (
            <div>
              <p className="text-xs font-extrabold tracking-wider uppercase opacity-60">Następna lekcja</p>
              <p className="mt-1 font-fun text-xl font-bold">Jeszcze nie zaplanowana</p>
              <p className="font-bold opacity-60">Nauczyciel doda ją tutaj.</p>
            </div>
          )}
        </Card>
      </div>

      <section className="mb-8">
        <SectionTitle>Moje tablice</SectionTitle>
        <BoardList boards={boardList} hrefBase="/uczen/tablica/" tz={tz} />
      </section>

      {rest.length > 0 && (
        <section className="mb-8">
          <SectionTitle>Kolejne lekcje</SectionTitle>
          <ul className="grid gap-2">
            {rest.map(l => (
              <li key={l.id} className={cn('flex items-center gap-4 rounded-2xl border-[2.5px] border-ink bg-white px-4 py-2.5', l.status === 'cancelled' && 'opacity-50')}>
                <div className="w-28 shrink-0 font-extrabold leading-tight">
                  <div className="first-letter:uppercase">{fmtDayLabel(l.startsAt, tz).split(',')[0]}</div>
                  <div className="text-sm opacity-50">{fmtShortDate(l.startsAt, tz)} · {fmtTime(l.startsAt, tz)}</div>
                </div>
                <p className={cn('min-w-0 flex-1 truncate font-bold', l.status === 'cancelled' && 'line-through')}>{l.topic || 'Bez tematu'}</p>
                {l.status === 'cancelled' && <Badge className="bg-ink/10">Odwołana</Badge>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionTitle>Ostatnio przerobione</SectionTitle>
        {past.length ? (
          <ul className="grid gap-2">
            {past.map(l => (
              <li key={l.id} className="flex items-center gap-3 font-bold">
                <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-ink bg-mint text-sm">✓</span>
                <span className="min-w-0 flex-1 truncate">{l.topic || 'Lekcja'}</span>
                <span className="shrink-0 text-sm opacity-50">{fmtShortDate(l.startsAt, tz)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-bold opacity-60">Tu pojawią się tematy odbytych lekcji.</p>
        )}
      </section>
    </>
  );
}
