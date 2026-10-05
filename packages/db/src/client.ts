// Database connection: PostgreSQL through postgres.js.
// Development: the `db` service from docker-compose.yml (start it with `npm run db:up`).
// Production: DATABASE_URL, e.g. Supabase Postgres in the EU.

import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

/** Matches the `db` service in docker-compose.yml. Only used outside production. */
export const DEV_DATABASE_URL = 'postgres://teaching:teaching@localhost:55432/teaching';

export function databaseUrl() {
  const url = process.env.DATABASE_URL;
  if (url) return url;
  if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is not set');
  return DEV_DATABASE_URL;
}

// One pool per process. Kept on globalThis so hot reload in `next dev` doesn't open new pools.
const g = globalThis as unknown as { __teachingSql?: postgres.Sql; __teachingDb?: Db };

export function getDb(): Db {
  if (!g.__teachingDb) {
    g.__teachingSql = postgres(databaseUrl(), {
      max: Number(process.env.DATABASE_POOL_SIZE) || 10,
      onnotice: () => {}, // "relation already exists, skipping" etc.
    });
    g.__teachingDb = drizzle(g.__teachingSql, { schema });
  }
  return g.__teachingDb;
}

/** Closes the pool (scripts and server shutdown). */
export async function closeDb() {
  await g.__teachingSql?.end({ timeout: 5 });
  g.__teachingSql = undefined;
  g.__teachingDb = undefined;
}
