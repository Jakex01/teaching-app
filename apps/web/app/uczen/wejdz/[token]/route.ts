import { NextResponse, type NextRequest } from 'next/server';
import { and, eq, getDb, isNull, studentAccessLinks, students } from '@teaching/db';
import { hashToken, isTokenShaped, startStudentSession } from '@/lib/student-session';

// A student's personal link: /uczen/wejdz/<token>. Signs them in and moves them to /uczen,
// so the token doesn't stay in the address bar.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const fail = () => NextResponse.redirect(new URL('/uczen/brak-dostepu', request.url), { headers: { 'Cache-Control': 'no-store' } });
  if (!isTokenShaped(token)) return fail();

  const db = getDb();
  const [link] = await db
    .select({ id: studentAccessLinks.id, studentId: studentAccessLinks.studentId })
    .from(studentAccessLinks)
    .innerJoin(students, eq(students.id, studentAccessLinks.studentId))
    .where(and(eq(studentAccessLinks.tokenHash, hashToken(token)), isNull(studentAccessLinks.revokedAt), eq(students.status, 'active')));
  if (!link) return fail();

  await db.update(studentAccessLinks).set({ lastUsedAt: new Date() }).where(eq(studentAccessLinks.id, link.id));
  await startStudentSession(link.id, link.studentId);
  return NextResponse.redirect(new URL('/uczen', request.url), { headers: { 'Cache-Control': 'no-store' } });
}
