// Applies migrations from packages/db/drizzle. Runs automatically before `npm run dev`.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { closeDb, databaseUrl, getDb } from './client';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');
const where = new URL(databaseUrl()).host;

try {
  await migrate(getDb(), { migrationsFolder });
  console.log(`Database is up to date (${where})`);
} catch (e) {
  const err = e as { code?: string; cause?: { code?: string }; message?: string };
  if ([err.code, err.cause?.code].includes('ECONNREFUSED')) {
    console.error(`\n  Can't reach the database at ${where}. Start it with: npm run db:up\n`);
  } else {
    console.error(err.message ?? e);
  }
  process.exitCode = 1;
} finally {
  await closeDb();
}
