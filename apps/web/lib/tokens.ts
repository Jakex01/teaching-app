import 'server-only';
import crypto from 'node:crypto';

// One-time tokens for links sent by e-mail (invitations, password resets).
// 256 random bits in the link; the database stores only the SHA-256, so a database copy can't be used.

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
export const isTokenShaped = (token: string) => /^[A-Za-z0-9_-]{43}$/.test(token);
