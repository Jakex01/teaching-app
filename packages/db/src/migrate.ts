// Applies migrations from packages/db/drizzle. Runs automatically before `npm run dev`.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { dataDir, getDb } from './client';

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'drizzle');

await migrate(getDb(), { migrationsFolder });
console.log(`Database is up to date (${path.relative(process.cwd(), dataDir()) || dataDir()})`);
process.exit(0);
