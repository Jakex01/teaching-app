'use client';

import { useActionState, useState } from 'react';
import { createAccessLink, revokeAccessLinks } from '@/lib/student-actions';
import { Button, Card, FormError, cn } from './ui';

export function StudentAccessCard({ studentId, firstName, active }: {
  studentId: string;
  firstName: string;
  /** Pre-formatted info about the current link, or null if the student has no access. */
  active: { created: string; lastUsed: string | null } | null;
}) {
  const [state, formAction, pending] = useActionState(createAccessLink.bind(null, studentId), undefined);
  const [copied, setCopied] = useState(false);
  const link = state?.path ? `${window.location.origin}${state.path}` : null;

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* the link is visible and selectable anyway */ }
  };

  return (
    <Card bg={active ? 'bg-white' : 'bg-paper'} className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-fun text-lg font-semibold">Link bez konta</h3>
        <span className={cn('rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-extrabold', active ? 'bg-mint' : 'bg-white')}>
          {active ? 'Włączony' : 'Wyłączony'}
        </span>
      </div>

      <FormError message={state?.error} />

      {link ? (
        <div className="grid gap-2">
          <p className="text-sm font-bold">Wyślij ten link {firstName} (lub rodzicowi). Po otwarciu uczeń zobaczy swój zeszyt i lekcje.</p>
          <input
            readOnly
            value={link}
            onFocus={e => e.currentTarget.select()}
            className="w-full rounded-xl border-[2.5px] border-ink bg-sun/30 px-3 py-2 font-mono text-xs font-bold"
            aria-label="Link dla ucznia"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="sun" onClick={copy}>{copied ? '✓ Skopiowano' : 'Kopiuj link'}</Button>
            <span className="text-xs font-bold opacity-60">Ze względów bezpieczeństwa pokazujemy go tylko teraz.</span>
          </div>
        </div>
      ) : active ? (
        <p className="text-sm font-bold opacity-70">
          Link utworzony {active.created}. {active.lastUsed ? `Ostatnio użyty ${active.lastUsed}.` : 'Jeszcze nieużyty.'}
        </p>
      ) : (
        <p className="text-sm font-bold opacity-70">
          Dla młodszych uczniów: osobisty link do zeszytu i lekcji, bez zakładania konta. Kto ma link, ten wchodzi, więc lepsze jest konto.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={formAction}>
          <Button size="sm" variant={active || link ? 'secondary' : 'primary'} disabled={pending}>
            {pending ? 'Tworzę…' : active || link ? 'Nowy link (stary przestanie działać)' : 'Utwórz link dla ucznia'}
          </Button>
        </form>
        {(active || link) && (
          <form action={revokeAccessLinks.bind(null, studentId)}>
            <Button size="sm" variant="ghost" className="text-tomato">Wyłącz dostęp</Button>
          </form>
        )}
      </div>
    </Card>
  );
}
