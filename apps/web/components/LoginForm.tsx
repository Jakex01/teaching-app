'use client';

import { useActionState } from 'react';
import { login } from '@/lib/auth-actions';
import { Button, Field, FormError, Input } from './ui';

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form action={formAction} key={state?.values?.email ?? 'login'} className="grid gap-4">
      <FormError message={state?.error} />
      <input type="hidden" name="next" value={next ?? ''} />
      <Field label="E-mail">
        <Input
          type="email" name="email" required autoFocus maxLength={254}
          autoComplete="username" inputMode="email" defaultValue={state?.values?.email}
          placeholder="ty@przyklad.pl"
        />
      </Field>
      <Field label="Hasło">
        <Input type="password" name="password" required maxLength={1024} autoComplete="current-password" />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? 'Sprawdzam…' : 'Zaloguj się →'}
      </Button>
    </form>
  );
}
