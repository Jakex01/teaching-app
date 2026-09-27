// Database connection.
// Development: PGlite, a real Postgres running inside the Node process, stored in .data/pglite.
// Later (stage 1, task B1): Supabase Postgres via DATABASE_URL, with the same schema and queries.

import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';

export type Db = PgliteDatabase<typeof schema>;

// The repo root is the first folder upwards that contains packages/db.
function repoRoot() {
  let dir = process.cwd();
  while (!fs.existsSync(path.join(dir, 'packages', 'db'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('Could not find the repository root');
    dir = parent;
  }
  return dir;
}

export function dataDir() {
  return process.env.PGLITE_DIR || path.join(repoRoot(), '.data', 'pglite');
}

// One connection per process. Kept on globalThis so hot reload in `next dev` doesn't open a second one.
const g = globalThis as unknown as { __teachingDb?: Db };

// PGlite can only be used by one process at a time; two at once can corrupt the data.
// A lock file with the owner's pid stops a second process (e.g. `npm run db:migrate` while `npm run dev` runs).
function takeLock(dir: string) {
  const lockFile = `${dir}.lock`;
  if (fs.existsSync(lockFile)) {
    const pid = Number(fs.readFileSync(lockFile, 'utf8'));
    const alive = pid > 0 && pid !== process.pid && (() => { try { process.kill(pid, 0); return true; } catch { return false; } })();
    if (alive) {
      throw new Error(`The local database is in use by another process (pid ${pid}). Stop \`npm run dev\` first, then try again.`);
    }
  }
  fs.writeFileSync(lockFile, String(process.pid));
  process.once('exit', () => {
    try { if (fs.readFileSync(lockFile, 'utf8') === String(process.pid)) fs.unlinkSync(lockFile); } catch { /* already gone */ }
  });
}

export function getDb(): Db {
  if (!g.__teachingDb) {
    const dir = dataDir();
    fs.mkdirSync(dir, { recursive: true });
    takeLock(dir);
    g.__teachingDb = drizzle(new PGlite(dir), { schema });
  }
  return g.__teachingDb;
}
