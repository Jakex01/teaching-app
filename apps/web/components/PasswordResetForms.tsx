'use client';

import { useActionState } from 'react';
import { requestPasswordReset, resetPassword } from '@/lib/auth-actions';
import { Button, Field, FormError, Input } from './ui';

export function ResetRequestForm() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, undefined);
  if (state?.ok) {
    return (
      <p role="status" className="rounded-2xl border-[2.5px] border-ink bg-mint px-4 py-3 font-bold">
        Jeśli konto <strong>{state.values?.email}</strong> istnieje, wysłaliśmy na nie link do ustawienia nowego hasła.
        Sprawdź skrzynkę (także spam). Link działa godzinę.
      </p>
    );
  }
  return (
    <form action={formAction} key={state?.values?.email ?? 'reset'} className="grid gap-4">
      <FormError message={state?.error} />
      <Field label="E-mail">
        <Input type="email" name="email" required autoFocus maxLength={254} autoComplete="username" inputMode="email" defaultValue={state?.values?.email} placeholder="ty@przyklad.pl" />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? 'Wysyłam…' : 'Wyślij link →'}
      </Button>
    </form>
  );
}

export function NewPasswordForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState(resetPassword.bind(null, token), undefined);
  const errors = state?.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid gap-4">
      <FormError message={state?.error} />
      {/* Lets the password manager save the new password under the right login. */}
      <input type="email" value={email} readOnly hidden autoComplete="username" />
      <Field label="Nowe hasło" error={errors.password} hint="Co najmniej 12 znaków. Najlepiej kilka słów, które łatwo zapamiętać.">
        <Input type="password" name="password" required autoFocus minLength={12} maxLength={128} autoComplete="new-password" />
      </Field>
      <Field label="Powtórz nowe hasło" error={errors.repeat}>
        <Input type="password" name="repeat" required maxLength={128} autoComplete="new-password" />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? 'Zapisuję…' : 'Ustaw hasło →'}
      </Button>
    </form>
  );
}
