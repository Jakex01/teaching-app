import 'server-only';

// Spending guard for all AI calls (hints, drawings): per notebook and for the whole app, per day
// (per server process). Answers that come from the cache don't count.

const PER_ROOM = 40;
const PER_APP = 300;
const DAY = 24 * 60 * 60 * 1000;
const calls = new Map<string, number[]>();

function allow(key: string, max: number) {
  const now = Date.now();
  const times = (calls.get(key) ?? []).filter(t => now - t < DAY);
  if (times.length >= max) return false;
  times.push(now);
  calls.set(key, times);
  return true;
}

export const allowAiCall = (room: string) => allow(`room:${room}`, PER_ROOM) && allow('app', PER_APP);
