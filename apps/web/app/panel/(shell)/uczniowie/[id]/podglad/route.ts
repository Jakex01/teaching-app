import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, getDb, isNull, studentAccessLinks, students } from '@teaching/db';
import { requireTeacher } from '@/lib/session';
import { hashToken, newAccessToken, startStudentSession } from '@/lib/student-session';
import { Uuid } from '@/lib/validation';

// "Podgląd jako uczeń": signs this browser in as one of the teacher's students and opens /uczen.
// Opened from a plain link in the panel. Browsers send Sec-Fetch-Site on their own and pages can't fake it,
// so a link on another website can't trigger this ("cross-site" is refused).
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const site = request.headers.get('sec-fetch-site');
  if (site !== 'same-origin' && site !== 'none') {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { id } = await params;
  const teacher = await requireTeacher();
  if (!Uuid.safeParse(id).success) return new NextResponse('Not found', { status: 404 });

  const db = getDb();
  const [student] = await db
    .select({ id: students.id })
    .from(students)
    .where(and(eq(students.id, id), eq(students.teacherId, teacher.id), eq(students.status, 'active')));
  if (!student) return new NextResponse('Not found', { status: 404 });

  // Reuse the student's current link. If there is none, create one whose token nobody ever sees.
  let [link] = await db
    .select({ id: studentAccessLinks.id })
    .from(studentAccessLinks)
    .where(and(eq(studentAccessLinks.studentId, id), isNull(studentAccessLinks.revokedAt)))
    .orderBy(desc(studentAccessLinks.createdAt))
    .limit(1);
  if (!link) {
    [link] = await db.insert(studentAccessLinks)
      .values({ studentId: id, tokenHash: hashToken(newAccessToken()) })
      .returning({ id: studentAccessLinks.id });
  }

  await startStudentSession(link.id, id);
  return NextResponse.redirect(new URL('/uczen', request.url), { status: 303, headers: { 'Cache-Control': 'no-store' } });
}
