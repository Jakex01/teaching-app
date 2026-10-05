'use client';

import { useActionState } from 'react';
import { cancelInvitation, sendInvitation, unlinkStudentAccount } from '@/lib/student-actions';
import { Button, Card, Field, FormError, Input, cn } from './ui';

export function StudentAccountCard({ studentId, firstName, account, invitation }: {
  studentId: string;
  firstName: string;
  /** Pre-formatted, or null when the student has no account yet. */
  account: { email: string | null; since: string } | null;
  invitation: { email: string; sent: string; expires: string } | null;
}) {
  const [state, formAction, pending] = useActionState(sendInvitation.bind(null, studentId), undefined);
  const status = account ? 'Konto aktywne' : invitation ? 'Zaproszenie wysłane' : 'Brak konta';

  return (
    <Card bg={account ? 'bg-white' : 'bg-paper'} className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-fun text-lg font-semibold">Konto ucznia</h3>
        <span className={cn('rounded-full border-2 border-ink px-2.5 py-0.5 text-xs font-extrabold', account ? 'bg-mint' : invitation ? 'bg-sun' : 'bg-white')}>
          {status}
        </span>
      </div>

      {account ? (
        <>
          <p className="text-sm font-bold opacity-70">
            {firstName} loguje się jako <strong>{account.email}</strong> (konto od {account.since}).
          </p>
          <form
            action={unlinkStudentAccount.bind(null, studentId)}
            onSubmit={e => { if (!window.confirm(`Odłączyć konto? ${firstName} straci dostęp do zeszytu i lekcji u Ciebie.`)) e.preventDefault(); }}
            className="mt-4"
          >
            <Button size="sm" variant="ghost" className="text-tomato">Odłącz konto</Button>
          </form>
        </>
      ) : (
        <>
          {state?.ok ? (
            <p role="status" className="mb-3 rounded-2xl border-[2.5px] border-ink bg-mint px-3 py-2 text-sm font-bold">
              ✓ Zaproszenie wysłane. Link działa 7 dni.
            </p>
          ) : invitation ? (
            <p className="mb-3 text-sm font-bold opacity-70">
              Wysłane na <strong>{invitation.email}</strong> {invitation.sent}. Ważne do {invitation.expires}.
            </p>
          ) : (
            <p className="mb-3 text-sm font-bold opacity-70">
              Wyślij zaproszenie e-mailem. {firstName} (albo rodzic, jeśli uczeń ma mniej niż 16 lat) założy konto
              i będzie logować się do zeszytu i planu lekcji.
            </p>
          )}
          <form action={formAction} key={state?.ok ? 'sent' : (state?.values?.email ?? 'invite')} className="grid gap-3">
            <FormError message={state?.error} />
            <Field label="E-mail ucznia lub rodzica" error={state?.fieldErrors?.email}>
              <Input
                type="email" name="email" required maxLength={254} inputMode="email" autoComplete="off"
                defaultValue={state?.ok ? '' : (state?.values?.email ?? invitation?.email ?? '')}
                placeholder="uczen@przyklad.pl"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={invitation ? 'secondary' : 'primary'} disabled={pending}>
                {pending ? 'Wysyłam…' : invitation ? 'Wyślij ponownie' : 'Wyślij zaproszenie'}
              </Button>
            </div>
          </form>
          {invitation && !state?.ok && (
            <form action={cancelInvitation.bind(null, studentId)} className="mt-2">
              <Button size="sm" variant="ghost" className="text-tomato">Anuluj zaproszenie</Button>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
