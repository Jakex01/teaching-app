import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { DEV_TEACHER_ID, eq, getDb, teacherProfiles, users } from '@teaching/db';

export interface Teacher {
  id: string;
  displayName: string;
  timezone: string;
}

// Who is signed in as a teacher. Until real login exists (task B2), development runs as the
// seeded dev teacher and production has no teacher at all.
export const getTeacher = cache(async (): Promise<Teacher | null> => {
  if (process.env.NODE_ENV !== 'development') return null;

  const [row] = await getDb()
    .select({ id: users.id, displayName: users.displayName, timezone: teacherProfiles.timezone })
    .from(teacherProfiles)
    .innerJoin(users, eq(users.id, teacherProfiles.userId))
    .where(eq(teacherProfiles.userId, DEV_TEACHER_ID));

  if (!row) throw new Error('Dev teacher is missing. Run `npm run db:seed`.');
  return row;
});

/** For panel pages and actions: sends anyone who isn't a teacher to the login page. */
export async function requireTeacher(): Promise<Teacher> {
  const teacher = await getTeacher();
  if (!teacher) redirect('/logowanie');
  return teacher;
}
