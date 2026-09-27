// Form validation for the teacher panel. Used by the server actions, so the browser can't skip it.

import { z } from 'zod';

export const STUDENT_COLORS = ['#FF5A4E', '#FF9F1C', '#FFC93C', '#22C1A0', '#3D8BFF', '#8B5CF6', '#FF6FB5'] as const;

const optionalText = (max: number) =>
  z.string().trim().max(max, `Maksymalnie ${max} znaków`).transform(v => v || null);

export const StudentInput = z.object({
  firstName: z.string().trim().min(1, 'Podaj imię').max(40, 'Maksymalnie 40 znaków'),
  lastName: optionalText(40),
  subject: optionalText(40),
  level: optionalText(80),
  goal: optionalText(120),
  notes: optionalText(2000),
  color: z.enum(STUDENT_COLORS, { error: 'Wybierz kolor' }),
});

export const LessonInput = z.object({
  studentId: z.uuid('Wybierz ucznia'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Podaj datę'),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Podaj godzinę'),
  duration: z.coerce.number().int().min(15, 'Minimum 15 minut').max(240, 'Maksymalnie 4 godziny'),
  topic: optionalText(120),
  videoUrl: z.string().trim().max(500)
    .refine(v => !v || /^https:\/\/[^\s]+$/.test(v), 'Link musi zaczynać się od https://')
    .transform(v => v || null),
});

export const Uuid = z.uuid();
export const LessonStatusInput = z.enum(['scheduled', 'done', 'cancelled']);

export type FormState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  /** What the user typed, sent back on errors: React resets the form after every submit. */
  values?: Record<string, string>;
} | undefined;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    out[key] ??= issue.message;
  }
  return out;
}
