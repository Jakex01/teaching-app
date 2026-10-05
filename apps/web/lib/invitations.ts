import 'server-only';
import { z } from 'zod';
import { and, count, eq, getDb, gt, isNull, studentAccessLinks, studentInvitations, students, users } from '@teaching/db';
import { appUrl } from './app-url';
import { invitationMail, sendMail } from './mail';
import { hashToken, isTokenShaped, newToken } from './tokens';

const INVITE_DAYS = 7;
const INVITES_PER_DAY = 30; // per teacher, so the app can't be used to spam strangers
const InviteEmail = z.email().max(254);

type InviteResult = { ok: true } | { field: string } | { error: string };

/** Can this teacher invite this (normalized) address? Returns a message for the e-mail field, or null. */
export async function inviteEmailProblem(teacherId: string, email: string, studentId?: string): Promise<string | null> {
  if (!InviteEmail.safeParse(email).success) return 'Podaj poprawny adres e-mail.';
  const db = getDb();
  const [owner] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.email, email));
  if (owner?.role === 'teacher') return 'Ten adres należy do konta nauczyciela. Podaj adres ucznia lub rodzica.';
  if (owner) {
    const [other] = await db.select({ id: students.id }).from(students)
      .where(and(eq(students.userId, owner.id), eq(students.teacherId, teacherId), eq(students.status, 'active')));
    if (other && other.id !== studentId) return 'To konto jest już połączone z innym Twoim uczniem.';
  }
  return null;
}

/** Creates an invitation (cancelling the previous one) and e-mails it. */
export async function inviteStudent(teacher: { id: string; displayName: string }, studentId: string, email: string): Promise<InviteResult> {
  const db = getDb();
  const [student] = await db
    .select({ id: students.id, firstName: students.firstName, userId: students.userId })
    .from(students)
    .where(and(eq(students.id, studentId), eq(students.teacherId, teacher.id), eq(students.status, 'active')));
  if (!student) return { error: 'Nie znaleziono ucznia.' };
  if (student.userId) return { error: 'Ten uczeń ma już konto.' };

  const problem = await inviteEmailProblem(teacher.id, email, studentId);
  if (problem) return { field: problem };

  const [{ sent }] = await db
    .select({ sent: count() })
    .from(studentInvitations)
    .innerJoin(students, eq(students.id, studentInvitations.studentId))
    .where(and(eq(students.teacherId, teacher.id), gt(studentInvitations.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))));
  if (sent >= INVITES_PER_DAY) return { error: 'Wysłano dziś już dużo zaproszeń. Spróbuj jutro.' };

  const token = newToken();
  const now = new Date();
  const [invitation] = await db.transaction(async tx => {
    await tx.update(studentInvitations).set({ revokedAt: now })
      .where(and(eq(studentInvitations.studentId, studentId), isNull(studentInvitations.acceptedAt), isNull(studentInvitations.revokedAt)));
    return tx.insert(studentInvitations)
      .values({ studentId, email, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + INVITE_DAYS * 24 * 60 * 60 * 1000) })
      .returning({ id: studentInvitations.id });
  });

  try {
    await sendMail(invitationMail({
      to: email,
      teacherName: teacher.displayName,
      studentName: student.firstName,
      url: new URL(`/zaproszenie/${token}`, appUrl()).href,
      days: INVITE_DAYS,
    }));
  } catch (e) {
    console.error('Sending the invitation failed:', (e as Error).message);
    await db.update(studentInvitations).set({ revokedAt: new Date() }).where(eq(studentInvitations.id, invitation.id));
    return { error: 'Nie udało się wysłać e-maila. Spróbuj ponownie za chwilę.' };
  }
  return { ok: true };
}

export type Consent = 'student_16_plus' | 'guardian';

/** An invitation that can still be accepted, or null (unknown, used, cancelled, expired, or the student already has an account). */
export async function findInvitation(token: string) {
  if (!isTokenShaped(token)) return null;
  const [row] = await getDb()
    .select({
      id: studentInvitations.id,
      email: studentInvitations.email,
      expiresAt: studentInvitations.expiresAt,
      studentId: students.id,
      studentFirstName: students.firstName,
      teacherName: users.displayName,
    })
    .from(studentInvitations)
    .innerJoin(students, eq(students.id, studentInvitations.studentId))
    .innerJoin(users, eq(users.id, students.teacherId))
    .where(and(
      eq(studentInvitations.tokenHash, hashToken(token)),
      isNull(studentInvitations.acceptedAt),
      isNull(studentInvitations.revokedAt),
      gt(studentInvitations.expiresAt, new Date()),
      eq(students.status, 'active'),
      isNull(students.userId),
    ));
  return row ?? null;
}

export type Invitation = NonNullable<Awaited<ReturnType<typeof findInvitation>>>;
type Tx = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];

/**
 * Connects an account to the invited student. Runs inside a transaction and re-checks everything,
 * so the same link can't be used twice even by two requests at once. Returns false if it was too late.
 */
export async function linkInvitation(tx: Tx, invitation: Invitation, userId: string, consent: Consent | null) {
  const now = new Date();
  const [used] = await tx.update(studentInvitations)
    .set({ acceptedAt: now, acceptedBy: userId, ...(consent ? { consent } : {}) })
    .where(and(
      eq(studentInvitations.id, invitation.id),
      isNull(studentInvitations.acceptedAt),
      isNull(studentInvitations.revokedAt),
      gt(studentInvitations.expiresAt, now),
    ))
    .returning({ id: studentInvitations.id });
  if (!used) return false;

  const [linked] = await tx.update(students).set({ userId })
    .where(and(eq(students.id, invitation.studentId), isNull(students.userId), eq(students.status, 'active')))
    .returning({ id: students.id });
  if (!linked) return false;

  // The account replaces the personal link.
  await tx.update(studentAccessLinks).set({ revokedAt: now })
    .where(and(eq(studentAccessLinks.studentId, invitation.studentId), isNull(studentAccessLinks.revokedAt)));
  // The link came to this inbox, so the address is verified.
  await tx.update(users).set({ emailVerifiedAt: now }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
  return true;
}
