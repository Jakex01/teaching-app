// Small per-browser conveniences (last colour, name…). Everything read back is validated,
// so a hand-edited localStorage can't put odd values into the app.

import { z } from 'zod';
import { COLORS } from './constants';

const paletteColor = z.string().refine(c => COLORS.some(p => p.c === c));

const schemas = {
  color: paletteColor,
  hlColor: paletteColor,
  size: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  fill: z.boolean(),
  me: z.object({
    name: z.string().max(24),
    role: z.enum(['teacher', 'student']),
    color: paletteColor,
  }),
};
type Prefs = { [K in keyof typeof schemas]: z.infer<(typeof schemas)[K]> };

export function getPref<K extends keyof Prefs>(key: K): Prefs[K] | undefined {
  try {
    const raw = localStorage.getItem('doodle.' + key);
    if (raw == null) return undefined;
    const parsed = schemas[key].safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data as Prefs[K]) : undefined;
  } catch {
    return undefined;
  }
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  try { localStorage.setItem('doodle.' + key, JSON.stringify(value)); } catch { /* ignore */ }
}
