// Password hashing with scrypt (built into Node.js), using the OWASP-recommended parameters.
// Stored as "scrypt$N=…,r=…,p=…$<salt>$<hash>" so the parameters can be raised later:
// verifyPassword() then reports needsRehash and the login re-hashes with the new ones.

import crypto from 'node:crypto';

const PARAMS = { N: 2 ** 17, r: 8, p: 1 }; // OWASP Password Storage Cheat Sheet: N=2^17, r=8, p=1
const KEY_LENGTH = 32;
const SALT_BYTES = 16;

function scrypt(password: string, salt: Buffer, params: typeof PARAMS): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password.normalize('NFKC'), salt, KEY_LENGTH,
      // Runs off the main thread. maxmem must exceed 128 * N * r bytes (128 MiB here).
      { ...params, maxmem: 256 * 1024 * 1024 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_BYTES);
  const key = await scrypt(password, salt, PARAMS);
  return `scrypt$N=${PARAMS.N},r=${PARAMS.r},p=${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

function parse(stored: string) {
  const m = /^scrypt\$N=(\d+),r=(\d+),p=(\d+)\$([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+)$/.exec(stored);
  if (!m) return null;
  const [N, r, p] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // Refuse absurd values from a tampered row instead of burning memory on them.
  if (N < 2 ** 10 || N > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  return { params: { N, r, p }, salt: Buffer.from(m[4], 'base64'), key: Buffer.from(m[5], 'base64') };
}

// Verified against when the e-mail doesn't exist, so "no such user" takes as long as "wrong password".
let dummyHash: Promise<string> | null = null;

/**
 * Checks a password against a stored hash. Pass `null` when there is no such user:
 * the same amount of work is done, so response times don't reveal which e-mails have accounts.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<{ ok: boolean; needsRehash: boolean }> {
  dummyHash ??= hashPassword('not-a-real-password');
  const parsed = parse(stored ?? (await dummyHash));
  if (!parsed) return { ok: false, needsRehash: false };
  const key = await scrypt(password, parsed.salt, parsed.params);
  const ok = stored !== null && key.length === parsed.key.length && crypto.timingSafeEqual(key, parsed.key);
  const needsRehash = ok && (parsed.params.N !== PARAMS.N || parsed.params.r !== PARAMS.r || parsed.params.p !== PARAMS.p);
  return { ok, needsRehash };
}

// ---------- Password rules (NIST SP 800-63B: length and a blocklist, no forced character mixes) ----------
export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

// A blocklist of weak passwords, not secrets (hence the gitleaks:allow marker).
const COMMON = new Set([
  'password1234', 'password12345', 'password123456', 'qwertyuiop12', 'qwerty123456', '123456789012', '1234567890123', // gitleaks:allow
  'aaaaaaaaaaaa', 'iloveyou1234', 'administrator', 'haslo1234567', 'haslohaslo12', 'zaq12wsxcde3', '1qaz2wsx3edc',
  'qwertyqwerty', 'passwordpassword', 'letmein12345', 'welcome12345', 'doodleboard1', 'doodleboard12',
]);

/** Returns a message in Polish if the password isn't acceptable, otherwise null. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Hasło musi mieć co najmniej ${PASSWORD_MIN} znaków.`;
  if (password.length > PASSWORD_MAX) return `Hasło może mieć najwyżej ${PASSWORD_MAX} znaki.`;
  const lower = password.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(password)) return 'To hasło jest zbyt popularne. Wybierz inne.';
  const local = email?.split('@')[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return 'Hasło nie może zawierać Twojego adresu e-mail.';
  return null;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
