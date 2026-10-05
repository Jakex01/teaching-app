import 'server-only';
import { and, eq, getDb, gt, isNull, passwordResets, users } from '@teaching/db';
import { hashToken, isTokenShaped } from './tokens';

/** Finds the account behind a reset link that is still valid. */
export async function findPasswordReset(token: string) {
  if (!isTokenShaped(token)) return null;
  const [row] = await getDb()
    .select({ id: passwordResets.id, userId: users.id, email: users.email })
    .from(passwordResets)
    .innerJoin(users, eq(users.id, passwordResets.userId))
    .where(and(eq(passwordResets.tokenHash, hashToken(token)), isNull(passwordResets.usedAt), gt(passwordResets.expiresAt, new Date())));
  return row ?? null;
}
