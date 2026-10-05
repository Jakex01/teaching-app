import Link from 'next/link';
import type { BoardListItem } from '@/lib/boards';
import { fmtShortDate } from '@/lib/time';
import { BoardIcon } from './icons';
import { RenameBoard } from './BoardForms';
import { cn } from './ui';

const KIND: Record<BoardListItem['kind'], { label: string; className: string }> = {
  notebook: { label: 'Zeszyt', className: 'bg-sun' },
  lesson: { label: 'Lekcja', className: 'bg-mint' },
  free: { label: 'Tablica', className: 'bg-sky text-white' },
};

/** A student's boards, most recently used first; the first one is "Kontynuuj". */
export function BoardList({ boards, hrefBase, tz, canRename = false }: { boards: BoardListItem[]; hrefBase: string; tz: string; canRename?: boolean }) {
  if (!boards.length) return <p className="font-bold opacity-60">Jeszcze nie ma tablic.</p>;
  return (
    <ul className="grid gap-2">
      {boards.map((b, i) => (
        <li key={b.id} className={cn('flex flex-wrap items-center gap-3 rounded-2xl border-[2.5px] border-ink bg-white p-3', i === 0 && 'bg-sun/25 shadow-hard-sm')}>
          <span className="grid size-10 shrink-0 place-items-center rounded-xl border-[2.5px] border-ink bg-white [&_svg]:size-5"><BoardIcon /></span>
          <Link href={`${hrefBase}${b.id}`} className="min-w-40 flex-1 hover:underline">
            <span className="block truncate font-extrabold">{b.title}</span>
            <span className="block text-sm font-bold opacity-60">
              {fmtShortDate(b.date, tz)}
              {b.tasks > 0 && ` · ✏️ rozwiązane ${b.solved} z ${b.tasks}`}
            </span>
            {b.sections.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {b.sections.slice(0, 4).map(s => (
                  <span key={s} className="truncate rounded-full border-2 border-ink/30 bg-paper px-2 py-0.5 text-xs font-bold">📁 {s}</span>
                ))}
                {b.sections.length > 4 && <span className="text-xs font-bold opacity-60">+{b.sections.length - 4}</span>}
              </span>
            )}
          </Link>
          <span className={cn('rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-extrabold', KIND[b.kind].className)}>{KIND[b.kind].label}</span>
          {canRename && <RenameBoard boardId={b.id} title={b.title} />}
          {i === 0 && (
            <Link href={`${hrefBase}${b.id}`} className="rounded-full border-[2.5px] border-ink bg-tomato px-3 py-1 text-sm font-extrabold text-white shadow-hard-sm">
              Kontynuuj →
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
