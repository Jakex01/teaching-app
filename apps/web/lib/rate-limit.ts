import 'server-only';

// Simple sliding-window limiter kept in memory (one server process). Enough for a single server;
// with several instances this moves to the database or Redis.
export function createLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  const recent = (key: string, now: number) => (hits.get(key) ?? []).filter(t => now - t < windowMs);

  return {
    /** How long until another attempt is allowed (0 = allowed now). */
    retryAfterMs(key: string) {
      const now = Date.now();
      const times = recent(key, now);
      return times.length < max ? 0 : windowMs - (now - times[0]);
    },
    hit(key: string) {
      const now = Date.now();
      const times = recent(key, now);
      times.push(now);
      hits.set(key, times);
      if (hits.size > 10_000) hits.clear(); // don't grow without bound under attack
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
