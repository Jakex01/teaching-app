// Small per-browser conveniences (last colour, name…). Everything read back is validated,
// so a hand-edited localStorage can't put odd values into the app.

import { z } from 'zod';
import { COLORS } from './constants';

const paletteColor = z.string().refine(c => COLORS.some(p => p.c === c));

const schemas = {
  color: paletteColor,
  hlColor: paletteColor,
  size: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  pressure: z.enum(['soft', 'normal', 'firm']),
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

// ---------- Where you were looking on each board ----------
// Saved as the centre of the screen and the zoom, so it works on a different window size.
// Only the last few boards are kept.

const View = z.object({ cx: z.number().finite(), cy: z.number().finite(), z: z.number().min(0.05).max(10) });
export type SavedView = z.infer<typeof View>;
const Views = z.record(z.string().max(40), View.extend({ t: z.number() }));
const VIEWS_KEY = 'doodle.views';
const MAX_VIEWS = 50;

function readViews() {
  try {
    const parsed = Views.safeParse(JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '{}'));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

export function getView(room: string): SavedView | undefined {
  const v = readViews()[room];
  return v ? { cx: v.cx, cy: v.cy, z: v.z } : undefined;
}

export function setView(room: string, view: SavedView) {
  try {
    const all = readViews();
    all[room] = { ...view, t: Date.now() };
    const keep = Object.entries(all).sort((a, b) => b[1].t - a[1].t).slice(0, MAX_VIEWS);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(Object.fromEntries(keep)));
  } catch { /* private mode or full storage: just don't remember */ }
}
