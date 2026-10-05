import { describe, expect, it } from 'vitest';
import { hashPassword, normalizeEmail, passwordProblem, verifyPassword } from './passwords';

describe('password hashing', () => {
  it('accepts the right password and rejects a wrong one', async () => {
    const stored = await hashPassword('correct horse battery staple');
    expect(stored).toMatch(/^scrypt\$N=131072,r=8,p=1\$/);
    expect(await verifyPassword('correct horse battery staple', stored)).toEqual({ ok: true, needsRehash: false });
    expect((await verifyPassword('correct horse battery stapl', stored)).ok).toBe(false);
  });

  it('salts every hash differently', async () => {
    expect(await hashPassword('same password here')).not.toBe(await hashPassword('same password here'));
  });

  it('never matches when there is no user', async () => {
    expect((await verifyPassword('not-a-real-password', null)).ok).toBe(false);
  });

  it('does not accept a hash whose parameters were tampered with', async () => {
    const [, , salt, key] = (await hashPassword('x')).split('$');
    // Same salt/key but claims weaker parameters: the key no longer matches, so it must not verify.
    const weaker = `scrypt$N=16384,r=8,p=1$${salt}$${key}`;
    expect((await verifyPassword('x', weaker)).ok).toBe(false);
  });

  it('rejects malformed or absurd stored values', async () => {
    for (const bad of ['', 'plain-text', 'scrypt$N=999999999,r=8,p=1$AAAA$AAAA', 'bcrypt$2b$10$abc']) {
      expect((await verifyPassword('x', bad)).ok).toBe(false);
    }
  });
});

describe('password rules', () => {
  it('requires at least 12 characters', () => {
    expect(passwordProblem('short-pass1')).toMatch(/12/);
    expect(passwordProblem('a long enough passphrase')).toBeNull();
  });

  it('blocks common and repeated passwords', () => {
    expect(passwordProblem('Password1234')).toMatch(/popularne/);
    expect(passwordProblem('zzzzzzzzzzzzzz')).toMatch(/popularne/);
  });

  it('blocks passwords that contain the e-mail name', () => {
    expect(passwordProblem('kuba.sokol-2026!', 'kuba.sokol@example.com')).toMatch(/e-mail/);
  });

  it('normalizes e-mail addresses', () => {
    expect(normalizeEmail('  Kuba@Example.COM ')).toBe('kuba@example.com');
  });
});
