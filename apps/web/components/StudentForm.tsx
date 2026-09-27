'use client';

import { useActionState, useEffect, useState } from 'react';
import type { FormState } from '@/lib/validation';
import { STUDENT_COLORS } from '@/lib/validation';
import { Button, Field, FormError, Input, Textarea, cn, colorClass } from './ui';

export interface StudentFormValues {
  firstName: string;
  lastName: string | null;
  subject: string | null;
  level: string | null;
  goal: string | null;
  notes: string | null;
  color: string;
}

export function StudentForm({ action, initial, submitLabel }: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  initial?: StudentFormValues;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const [color, setColor] = useState(initial?.color ?? STUDENT_COLORS[0]);
  const [saved, setSaved] = useState(false);
  const errors = state?.fieldErrors ?? {};
  // After a failed submit, show what was typed; otherwise the saved values.
  const v = (key: keyof StudentFormValues) => state?.values?.[key] ?? initial?.[key] ?? '';

  // Show "Zapisano" for a moment after a successful edit.
  useEffect(() => {
    if (!state?.ok) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form action={formAction} key={state?.values ? JSON.stringify(state.values) : 'saved'} className="grid gap-4">
      <FormError message={state?.error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Imię" error={errors.firstName}>
          <Input name="firstName" defaultValue={v('firstName')} maxLength={40} required autoFocus={!initial} placeholder="np. Ola" />
        </Field>
        <Field label="Nazwisko" error={errors.lastName}>
          <Input name="lastName" defaultValue={v('lastName')} maxLength={40} placeholder="opcjonalnie" />
        </Field>
        <Field label="Przedmiot" error={errors.subject}>
          <Input name="subject" defaultValue={v('subject')} maxLength={40} placeholder="np. matematyka" list="subjects" />
          <datalist id="subjects">
            {['matematyka', 'fizyka', 'chemia', 'angielski', 'niemiecki', 'hiszpański', 'polski', 'biologia'].map(s => <option key={s} value={s} />)}
          </datalist>
        </Field>
        <Field label="Poziom" error={errors.level}>
          <Input name="level" defaultValue={v('level')} maxLength={80} placeholder="np. liceum, klasa 3" />
        </Field>
      </div>
      <Field label="Cel" error={errors.goal} hint="Po co uczeń przychodzi na lekcje?">
        <Input name="goal" defaultValue={v('goal')} maxLength={120} placeholder="np. matura rozszerzona w maju" />
      </Field>
      <Field label="Notatki" error={errors.notes} hint="Widzisz je tylko Ty.">
        <Textarea name="notes" defaultValue={v('notes')} maxLength={2000} placeholder="Mocne strony, z czym ma problem, ustalenia z rodzicem…" />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-xs font-extrabold tracking-wider uppercase opacity-70">Kolor</legend>
        <div className="flex flex-wrap gap-2.5">
          {STUDENT_COLORS.map(c => (
            <label key={c} className="cursor-pointer">
              <input type="radio" name="color" value={c} checked={color === c} onChange={() => setColor(c)} className="peer sr-only" />
              <span className={cn(
                'block size-9 rounded-full border-[2.5px] border-ink transition-transform duration-200 ease-bounce hover:scale-110',
                'peer-checked:scale-115 peer-checked:shadow-[0_0_0_3px_white,0_0_0_5.5px_var(--color-ink)] peer-focus-visible:outline-3 peer-focus-visible:outline-sun',
                colorClass(c),
              )} />
            </label>
          ))}
        </div>
        {errors.color && <p className="mt-1 text-sm font-bold text-tomato">{errors.color}</p>}
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Zapisuję…' : submitLabel}</Button>
        {saved && <span className="font-extrabold text-mint" role="status">✓ Zapisano</span>}
      </div>
    </form>
  );
}
