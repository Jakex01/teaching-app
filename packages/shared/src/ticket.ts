// Signed "tickets": the web app vouches for who someone is, and the sync server checks it.
// Server-only (uses node:crypto). Import from '@teaching/shared/ticket', never from the browser.

import crypto from 'node:crypto';
import { z } from 'zod';
import { hexColor, roomId } from './elements';
import { RoleSchema } from './messages';

export const TicketSchema = z.object({
  room: roomId,
  uid: z.string().max(64),        // teacher user id or student id
  name: z.string().min(1).max(24),
  role: RoleSchema,
  color: hexColor,
  exp: z.number().int(),          // unix seconds
});
export type Ticket = z.infer<typeof TicketSchema>;

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

function hmac(secret: string, data: string) {
  return crypto.createHmac('sha256', secret).update(data).digest();
}

/** Signs any JSON payload as "<payload>.<signature>". */
export function signPayload(payload: unknown, secret: string): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${b64url(hmac(secret, body))}`;
}

/** Returns the payload if the signature is valid, otherwise null. */
export function verifyPayload(token: string, secret: string): unknown {
  if (typeof token !== 'string' || token.length > 4000) return null;
  const [body, sig, extra] = token.split('.');
  if (!body || !sig || extra !== undefined) return null;
  const expected = hmac(secret, body);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
}

export function signTicket(ticket: Omit<Ticket, 'exp'>, secret: string, ttlSeconds = 8 * 60 * 60): string {
  return signPayload({ ...ticket, exp: Math.floor(Date.now() / 1000) + ttlSeconds }, secret);
}

export function verifyTicket(token: string, secret: string): Ticket | null {
  const parsed = TicketSchema.safeParse(verifyPayload(token, secret));
  if (!parsed.success) return null;
  if (parsed.data.exp < Date.now() / 1000) return null;
  return parsed.data;
}

/** Rooms that belong to a student's notebook. They can only be joined with a ticket. */
export const isProtectedRoom = (room: string) => room.startsWith('b-');
