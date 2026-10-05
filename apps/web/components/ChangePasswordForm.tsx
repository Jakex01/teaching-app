'use client';

import { useActionState } from 'react';
import { changePassword } from '@/lib/auth-actions';
import { Button, Field, FormError, Input } from './ui';

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, undefined);
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4">
      <FormError message={state?.error} />
      {state?.ok && (
        <p role="status" className="rounded-2xl border-[2.5px] border-ink bg-mint px-4 py-2 font-bold">
          ✓ Hasło zmienione. Inne urządzenia zostały wylogowane.
        </p>
      )}
      <Field label="Obecne hasło" error={errors.current}>
        <Input type="password" name="current" required maxLength={1024} autoComplete="current-password" />
      </Field>
      <Field label="Nowe hasło" error={errors.password} hint="Co najmniej 12 znaków. Najlepiej kilka słów, które zapamiętasz.">
        <Input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" />
      </Field>
      <Field label="Powtórz nowe hasło" error={errors.repeat}>
        <Input type="password" name="repeat" required maxLength={128} autoComplete="new-password" />
      </Field>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Zapisuję…' : 'Zmień hasło'}</Button>
      </div>
    </form>
  );
}
