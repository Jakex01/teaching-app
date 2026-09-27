import Link from 'next/link';
import type { LessonStatus } from '@teaching/db';
import { setLessonStatus } from '@/lib/actions';
import { fmtTime } from '@/lib/time';
import { Avatar, Badge, Button, ExternalButton, LinkButton, cn } from './ui';
import { BoardIcon, CheckIcon, UndoIcon, VideoIcon, XIcon } from './icons';

export interface LessonItemData {
  id: string;
  startsAt: Date;
  endsAt: Date;
  topic: string | null;
  videoUrl: string | null;
  status: LessonStatus;
  student?: { id: string; firstName: string; lastName: string | null; color: string };
}

const STATUS: Record<LessonStatus, { label: string; className: string }> = {
  scheduled: { label: 'Zaplanowana', className: 'bg-sun' },
  done: { label: 'Odbyta', className: 'bg-mint' },
  cancelled: { label: 'Odwołana', className: 'bg-ink/10 border-ink/40' },
};

/** The teacher's view of a student's notebook-board. */
export const boardHref = (studentId: string) => `/panel/zeszyt/${studentId}`;

export function LessonItem({ lesson, tz, boardStudentId, highlight }: { lesson: LessonItemData; tz: string; boardStudentId?: string | null; highlight?: boolean }) {
  const { student } = lesson;
  const cancelled = lesson.status === 'cancelled';

  return (
    <li className={cn(
      'flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border-[2.5px] border-ink bg-white p-3',
      highlight && 'bg-sun/25 shadow-hard-sm',
      cancelled && 'opacity-60',
    )}>
      <div className={cn('w-16 shrink-0 text-center font-fun leading-tight', cancelled && 'line-through')}>
        <div className="text-xl font-bold">{fmtTime(lesson.startsAt, tz)}</div>
        <div className="text-xs font-bold opacity-50">{fmtTime(lesson.endsAt, tz)}</div>
      </div>

      <div className="flex min-w-40 flex-1 items-center gap-3">
        {student && <Avatar name={`${student.firstName} ${student.lastName ?? ''}`} color={student.color} size="sm" />}
        <div className="min-w-0">
          {student && (
            <Link href={`/panel/uczniowie/${student.id}`} className="block truncate font-extrabold hover:underline">
              {student.firstName} {student.lastName}
            </Link>
          )}
          <p className={cn('truncate font-bold', student ? 'text-sm opacity-60' : '')}>{lesson.topic || 'Bez tematu'}</p>
        </div>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <Badge className={STATUS[lesson.status].className}>{STATUS[lesson.status].label}</Badge>
        {boardStudentId && !cancelled && (
          <LinkButton href={boardHref(boardStudentId)} size="sm" variant="sun" title="Otwórz tablicę ucznia"><BoardIcon />Tablica</LinkButton>
        )}
        {lesson.videoUrl && lesson.status === 'scheduled' && (
          <ExternalButton href={lesson.videoUrl} size="sm" variant="sky" title="Dołącz do rozmowy wideo"><VideoIcon />Wideo</ExternalButton>
        )}
        {lesson.status === 'scheduled' ? (
          <>
            <form action={setLessonStatus.bind(null, lesson.id, 'done')}>
              <Button size="sm" variant="ghost" title="Oznacz jako odbytą" aria-label="Oznacz jako odbytą"><CheckIcon /></Button>
            </form>
            <form action={setLessonStatus.bind(null, lesson.id, 'cancelled')}>
              <Button size="sm" variant="ghost" title="Odwołaj lekcję" aria-label="Odwołaj lekcję"><XIcon /></Button>
            </form>
          </>
        ) : (
          <form action={setLessonStatus.bind(null, lesson.id, 'scheduled')}>
            <Button size="sm" variant="ghost" title="Przywróć jako zaplanowaną" aria-label="Przywróć jako zaplanowaną"><UndoIcon /></Button>
          </form>
        )}
      </div>
    </li>
  );
}
