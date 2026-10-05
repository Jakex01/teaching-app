'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import type { SimilarBoard } from '@teaching/shared';
import { createBoard, renameBoard, suggestBoards } from '@/lib/board-actions';
import { Button, FormError, Input } from './ui';

/** New board, with a nudge to reuse an existing board (as a new section) when the name matches one. */
export function NewBoardForm({ studentId }: { studentId: string }) {
  const [state, formAction, pending] = useActionState(createBoard.bind(null, studentId), undefined);
  const [title, setTitle] = useState('');
  const [similar, setSimilar] = useState<SimilarBoard[]>([]);

  // Ask the server once typing pauses; ignore answers to older text.
  useEffect(() => {
    let current = true;
    const t = setTimeout(async () => {
      const found = title.trim().length >= 3 ? await suggestBoards(studentId, title).catch(() => []) : [];
      if (current) setSimilar(found);
    }, 400);
    return () => { current = false; clearTimeout(t); };
  }, [title, studentId]);

  const name = title.trim();
  const shown = name.length >= 3 ? similar : [];

  return (
    <form action={formAction} className="mt-3 grid gap-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-48 flex-1">
          <Input name="title" required maxLength={120} value={title} onChange={e => setTitle(e.target.value)}
            placeholder="np. Matura, Ciągi – rozszerzenie" aria-label="Nazwa nowej tablicy" autoComplete="off" />
          {state?.fieldErrors?.title && <span className="mt-1 block text-sm font-bold text-tomato">{state.fieldErrors.title}</span>}
        </div>
        <Button type="submit" variant={shown.length ? 'ghost' : 'sun'} disabled={pending}>
          {pending ? 'Tworzę…' : shown.length ? 'Mimo to utwórz nową' : '+ Nowa tablica'}
        </Button>
      </div>
      <FormError message={state?.error} />

      {shown.length > 0 && (
        <div role="status" className="rounded-2xl border-[2.5px] border-ink bg-sun/30 p-3">
          <p className="mb-2 text-sm font-extrabold">💡 Podobna tablica już jest. Może lepiej dodać to jako sekcję?</p>
          <ul className="grid gap-2">
            {shown.map(s => (
              <li key={s.boardId} className="flex flex-wrap items-center gap-2 text-sm font-bold">
                <span className="min-w-40 flex-1">
                  „{s.title}”{s.section && <span className="opacity-60"> · sekcja „{s.section}”</span>}
                </span>
                <Link href={`/panel/tablica/${s.boardId}?sekcja=${encodeURIComponent(name.slice(0, 80))}`}
                  className="rounded-full border-2 border-ink bg-mint px-3 py-1 font-extrabold">
                  Dodaj sekcję „{name.slice(0, 40)}” tam
                </Link>
                <Link href={`/panel/tablica/${s.boardId}`} className="rounded-full border-2 border-ink bg-white px-3 py-1 font-extrabold">Otwórz</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}

export function RenameBoard({ boardId, title }: { boardId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: Parameters<typeof renameBoard>[1], data: FormData) => {
    const result = await renameBoard(boardId, prev, data);
    if (result?.ok) setOpen(false);
    return result;
  }, undefined);

  if (!open) {
    return <Button type="button" size="sm" variant="ghost" title="Zmień nazwę" onClick={() => setOpen(true)}>✎</Button>;
  }
  return (
    <form action={formAction} className="flex w-full flex-wrap gap-2">
      <Input name="title" defaultValue={title} required maxLength={120} autoFocus className="min-w-48 flex-1" aria-label="Nowa nazwa tablicy" />
      <Button type="submit" size="sm" variant="primary" disabled={pending}>Zapisz</Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Anuluj</Button>
      {state?.fieldErrors?.title && <span className="w-full text-sm font-bold text-tomato">{state.fieldErrors.title}</span>}
    </form>
  );
}
