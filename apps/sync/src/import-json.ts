/* eslint-disable security/detect-non-literal-fs-filename -- one-off local script reading this project's own data folder */
// One-off: copies boards saved as JSON files (apps/sync/data/<room>.json, the old format) into Postgres.
// Every element is validated first. Elements already in the database are kept.
//   npm run db:import-boards

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardElements, closeDb, getDb, sql } from '@teaching/db';
import { ElementSchema, roomId } from '@teaching/shared';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json')) : [];
if (!files.length) console.log(`Nothing to import in ${dir}.`);

const db = getDb();
for (const file of files) {
  const room = file.slice(0, -'.json'.length);
  if (!roomId.safeParse(room).success) { console.log(`${file}: skipped (not a room name)`); continue; }

  const raw: unknown = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  const elements = (Array.isArray(raw) ? raw : []).flatMap(item => {
    const parsed = ElementSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });

  // Continue after whatever this room already has in the database.
  const [{ max }] = await db.select({ max: sql<number>`coalesce(max(${boardElements.position}), 0)`.mapWith(Number) })
    .from(boardElements).where(sql`${boardElements.roomId} = ${room}`);
  const rows = elements.map((el, i) => ({ roomId: room, elementId: el.id, position: max + i + 1, data: el }));

  let added = 0;
  for (let i = 0; i < rows.length; i += 200) {
    added += (await db.insert(boardElements).values(rows.slice(i, i + 200)).onConflictDoNothing().returning()).length;
  }
  console.log(`${room}: ${added} of ${elements.length} elements copied`);
}

await closeDb();
