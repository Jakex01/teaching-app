// Dates are stored in UTC and shown in the teacher's time zone.

import { TZDate } from '@date-fns/tz';
import { addDays, format, isSameDay, startOfDay, startOfWeek } from 'date-fns';
import { pl } from 'date-fns/locale';

export const inZone = (date: Date, tz: string) => new TZDate(date, tz);

/** "2026-09-30" + "17:30" in the teacher's zone -> a real instant. */
export function zonedDateTime(day: string, time: string, tz: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(new TZDate(y, m - 1, d, hh, mm, tz).getTime());
}

export function dayRange(tz: string, offsetDays = 0, lengthDays = 1) {
  const start = addDays(startOfDay(inZone(new Date(), tz)), offsetDays);
  return { start: new Date(start.getTime()), end: new Date(addDays(start, lengthDays).getTime()) };
}

export function weekRange(tz: string) {
  const start = startOfWeek(inZone(new Date(), tz), { weekStartsOn: 1 });
  return { start: new Date(start.getTime()), end: new Date(addDays(start, 7).getTime()) };
}

export const fmtTime = (d: Date, tz: string) => format(inZone(d, tz), 'HH:mm');
export const fmtDateInput = (d: Date, tz: string) => format(inZone(d, tz), 'yyyy-MM-dd');
export const fmtLongDate = (d: Date, tz: string) => format(inZone(d, tz), 'EEEE, d MMMM', { locale: pl });
export const fmtShortDate = (d: Date, tz: string) => format(inZone(d, tz), 'd MMM', { locale: pl });

/** "Dziś", "Jutro" or "czwartek, 2 października". */
export function fmtDayLabel(d: Date, tz: string) {
  const now = inZone(new Date(), tz);
  const day = inZone(d, tz);
  if (isSameDay(day, now)) return 'Dziś';
  if (isSameDay(day, addDays(now, 1))) return 'Jutro';
  if (isSameDay(day, addDays(now, -1))) return 'Wczoraj';
  return format(day, 'EEEE, d MMMM', { locale: pl });
}

export const dayKey = (d: Date, tz: string) => format(inZone(d, tz), 'yyyy-MM-dd');
