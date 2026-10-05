/* eslint-disable security/detect-non-literal-fs-filename -- one-off local script reading this project's own .data folder */
// One-off: copies data from the old local PGlite database (.data/pglite) into Postgres.
// Existing rows are kept (conflicts are skipped), so it's safe to run more than once.
//   npm run db:import-pglite

import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { closeDb, getDb } from './client';
import { boards, lessons, studentAccessLinks, students, teacherProfiles, users } from './schema';

let root = process.cwd();
while (!fs.existsSync(path.join(root, 'packages', 'db'))) root = path.dirname(root);
const dir = path.join(root, '.data', 'pglite');

if (!fs.existsSync(dir)) {
  console.log(`Nothing to import: ${dir} doesn't exist.`);
} else {
  const source = drizzle(new PGlite(dir));
  const target = getDb();

  // Parents before children, so foreign keys are satisfied.
  const tables = [
    ['users', users], ['teacher_profiles', teacherProfiles], ['students', students],
    ['boards', boards], ['student_access_links', studentAccessLinks], ['lessons', lessons],
  ] as const;

  for (const [name, table] of tables) {
    const rows = await source.select().from(table);
    let added = 0;
    for (let i = 0; i < rows.length; i += 200) {
      const result = await target.insert(table).values(rows.slice(i, i + 200) as never).onConflictDoNothing().returning();
      added += result.length;
    }
    console.log(`${name}: ${added} of ${rows.length} copied`);
  }
  await (source.$client as PGlite).close();
  console.log(`Done. When everything looks right you can delete ${path.relative(root, dir)}.`);
}

await closeDb();
