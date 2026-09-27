import { afterEach, describe, expect, it, vi } from 'vitest';
import { isProtectedRoom, signPayload, signTicket, verifyPayload, verifyTicket } from './ticket';

const SECRET = 'test-secret';
const base = { room: 'b-abc123', uid: 'u1', name: 'Ola', role: 'student' as const, color: '#FF5A4E' };

afterEach(() => vi.useRealTimers());

describe('tickets', () => {
  it('round-trips a valid ticket', () => {
    const t = signTicket(base, SECRET);
    expect(verifyTicket(t, SECRET)).toMatchObject(base);
  });

  it('rejects a ticket signed with another secret', () => {
    expect(verifyTicket(signTicket(base, 'other'), SECRET)).toBeNull();
  });

  it('rejects a ticket whose payload was changed (student -> teacher)', () => {
    const [, sig] = signTicket(base, SECRET).split('.');
    const forged = Buffer.from(JSON.stringify({ ...base, role: 'teacher', exp: 9e9 })).toString('base64url');
    expect(verifyTicket(`${forged}.${sig}`, SECRET)).toBeNull();
  });

  it('rejects an expired ticket', () => {
    const t = signTicket(base, SECRET, 60);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 61_000);
    expect(verifyTicket(t, SECRET)).toBeNull();
  });

  it('rejects garbage', () => {
    for (const t of ['', 'a', 'a.b', 'a.b.c', 'x'.repeat(5000)]) expect(verifyTicket(t, SECRET)).toBeNull();
  });

  it('rejects a correctly signed payload that is not a ticket', () => {
    expect(verifyTicket(signPayload({ hello: 'world' }, SECRET), SECRET)).toBeNull();
    expect(verifyPayload(signPayload({ hello: 'world' }, SECRET), SECRET)).toEqual({ hello: 'world' });
  });

  it('marks notebook rooms as protected', () => {
    expect(isProtectedRoom('b-123')).toBe(true);
    expect(isProtectedRoom('sunny-otter-42')).toBe(false);
  });
});
