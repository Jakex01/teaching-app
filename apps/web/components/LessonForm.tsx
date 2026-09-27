'use client';

import { useActionState } from 'react';
import { createLesson } from '@/lib/actions';
import { Button, Field, FormError, Input, Select } from './ui';

export function LessonForm({ students, defaultStudentId, defaultDate, returnTo }: {
  students: { id: string; firstName: string; lastName: string | null }[];
  defaultStudentId?: string;
  defaultDate: string;
  returnTo: 'student' | 'lessons';
}) {
  const [state, formAction, pending] = useActionState(createLesson, undefined);
  const errors = state?.fieldErrors ?? {};
  const v = (key: string, fallback = '') => state?.values?.[key] ?? fallback;

  return (
    <form action={formAction} key={state?.values ? JSON.stringify(state.values) : 'new'} className="grid gap-4">
      <FormError message={state?.error} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <Field label="Uczeń" error={errors.studentId}>
        <Select name="studentId" defaultValue={v('studentId', defaultStudentId)} required>
          <option value="" disabled>Wybierz ucznia…</option>
          {students.map(s => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Dzień" error={errors.date}>
          <Input type="date" name="date" defaultValue={v('date', defaultDate)} required />
        </Field>
        <Field label="Godzina" error={errors.time}>
          <Input type="time" name="time" defaultValue={v('time', '17:00')} step={300} required />
        </Field>
        <Field label="Czas trwania" error={errors.duration}>
          <Select name="duration" defaultValue={v('duration', '60')}>
            {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Temat" error={errors.topic}>
        <Input name="topic" defaultValue={v('topic')} maxLength={120} placeholder="np. ciągi geometryczne" />
      </Field>
      <Field label="Link do wideo" error={errors.videoUrl} hint="Google Meet, Zoom albo Jitsi. Pojawi się przy lekcji jako przycisk „Wideo”.">
        <Input type="url" name="videoUrl" defaultValue={v('videoUrl')} maxLength={500} placeholder="https://meet.google.com/…" inputMode="url" />
      </Field>
      <div>
        <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Zapisuję…' : 'Zaplanuj lekcję'}</Button>
      </div>
    </form>
  );
}
