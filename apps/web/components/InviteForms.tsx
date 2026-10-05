'use client';

import { useActionState } from 'react';
import { acceptWithLogin, acceptWithNewAccount } from '@/lib/invite-actions';
import { Button, Field, FormError, Input, cn } from './ui';

const choiceClass = 'flex cursor-pointer items-start gap-3 rounded-2xl border-[2.5px] border-ink bg-paper p-3 font-bold has-checked:bg-sun/40';

export function InviteSignupForm({ token, email, defaultName }: { token: string; email: string; defaultName: string }) {
  const [state, formAction, pending] = useActionState(acceptWithNewAccount.bind(null, token), undefined);
  const errors = state?.fieldErrors ?? {};
  const v = state?.values ?? {};

  return (
    <form action={formAction} key={JSON.stringify(v)} className="grid gap-4">
      <FormError message={state?.error} />
      <Field label="E-mail (login)">
        <Input type="email" value={email} readOnly autoComplete="username" className="opacity-70" />
      </Field>
      <Field label="Imię ucznia" error={errors.name}>
        <Input name="name" required maxLength={40} defaultValue={v.name ?? defaultName} autoComplete="given-name" />
      </Field>
      <Field label="Hasło" error={errors.password} hint="Co najmniej 12 znaków. Najlepiej kilka słów, które łatwo zapamiętać.">
        <Input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" />
      </Field>
      <Field label="Powtórz hasło" error={errors.repeat}>
        <Input type="password" name="repeat" required maxLength={128} autoComplete="new-password" />
      </Field>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-xs font-extrabold tracking-wider uppercase opacity-70">Kto zakłada konto?</legend>
        <label className={choiceClass}>
          <input type="radio" name="consent" value="student_16_plus" required defaultChecked={v.consent === 'student_16_plus'} className="mt-1 accent-tomato" />
          <span>Jestem uczniem i mam co najmniej 16 lat.</span>
        </label>
        <label className={choiceClass}>
          <input type="radio" name="consent" value="guardian" defaultChecked={v.consent === 'guardian'} className="mt-1 accent-tomato" />
          <span>Jestem rodzicem lub opiekunem ucznia i zakładam konto dla niego.</span>
        </label>
        {errors.consent && <span className="text-sm font-bold text-tomato">{errors.consent}</span>}
      </fieldset>

      <label className={cn(choiceClass, 'bg-white')}>
        <input type="checkbox" name="agree" required className="mt-1 accent-tomato" />
        <span className="text-sm">
          Zgadzam się, żeby dane ucznia (imię, e-mail, plan lekcji i zeszyt) były przetwarzane w celu prowadzenia zajęć.
          Nauczyciel widzi zeszyt i plan lekcji.
        </span>
      </label>
      {errors.agree && <span className="-mt-2 text-sm font-bold text-tomato">{errors.agree}</span>}

      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? 'Zakładam konto…' : 'Załóż konto →'}
      </Button>
    </form>
  );
}

export function InviteLoginForm({ token, email }: { token: string; email: string }) {
  const [state, formAction, pending] = useActionState(acceptWithLogin.bind(null, token), undefined);
  return (
    <form action={formAction} className="grid gap-4">
      <FormError message={state?.error} />
      <Field label="E-mail">
        <Input type="email" value={email} readOnly autoComplete="username" className="opacity-70" />
      </Field>
      <Field label="Hasło" error={state?.fieldErrors?.password}>
        <Input type="password" name="password" required autoFocus maxLength={1024} autoComplete="current-password" />
      </Field>
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? 'Sprawdzam…' : 'Zaloguj się i przyjmij →'}
      </Button>
    </form>
  );
}
