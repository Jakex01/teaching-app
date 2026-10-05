// Rooms live in memory while someone is connected. Every change is saved to Postgres (board_elements),
// one row per element, at most ~1 second after it happens, even while people keep drawing.

import { and, boardElements, closeDb, eq, getDb, inArray, sql } from '@teaching/db';
import { ElementSchema, roomId as RoomIdSchema, type BoardElement, type User } from '@teaching/shared';
import type { WebSocket } from 'ws';

export interface Client {
  id: string;
  ws: WebSocket;
  room: Room | null;
  user: User | null;
  alive: boolean;
  /** Messages from this person are handled one after another. */
  queue: Promise<void>;
}

export interface Room {
  id: string;
  elements: Map<string, BoardElement>; // Map order = drawing order
  positions: Map<string, number>;
  nextPosition: number;
  clients: Set<Client>;
  // Changes not yet written to the database:
  dirty: Set<string>;
  deleted: Set<string>;
  cleared: boolean;
  flushTimer: ReturnType<typeof setTimeout> | null;
  flushing: Promise<void> | null;
}

const SAVE_DELAY_MS = 1000;
const RETRY_DELAY_MS = 5000;
const BATCH = 200;

const rooms = new Map<string, Room>();
const loading = new Map<string, Promise<Room>>();

async function load(id: string): Promise<Room> {
  if (!RoomIdSchema.safeParse(id).success) throw new Error('Invalid room id');
  const rows = await getDb()
    .select({ elementId: boardElements.elementId, position: boardElements.position, data: boardElements.data })
    .from(boardElements)
    .where(eq(boardElements.roomId, id))
    .orderBy(boardElements.position);

  const room: Room = {
    id, elements: new Map(), positions: new Map(), nextPosition: 1, clients: new Set(),
    dirty: new Set(), deleted: new Set(), cleared: false, flushTimer: null, flushing: null,
  };
  let skipped = 0;
  for (const row of rows) {
    const parsed = ElementSchema.safeParse(row.data);
    if (!parsed.success) { skipped++; continue; }
    room.elements.set(row.elementId, parsed.data);
    room.positions.set(row.elementId, row.position);
    room.nextPosition = Math.max(room.nextPosition, row.position + 1);
  }
  if (skipped) console.warn(`Board ${id}: skipped ${skipped} invalid element(s)`);
  return room;
}

/** The room, loaded from the database on first use. Parallel joins share one load. */
export async function getRoom(id: string): Promise<Room> {
  const existing = rooms.get(id);
  if (existing) return existing;
  let pending = loading.get(id);
  if (!pending) {
    pending = load(id).then(room => { rooms.set(id, room); return room; }).finally(() => loading.delete(id));
    loading.set(id, pending);
  }
  return pending;
}

// ---------- Changes ----------
export function upsertElement(room: Room, el: BoardElement) {
  if (!room.positions.has(el.id)) room.positions.set(el.id, room.nextPosition++);
  room.elements.set(el.id, el);
  room.deleted.delete(el.id);
  room.dirty.add(el.id);
  scheduleFlush(room);
}

export function deleteElement(room: Room, id: string) {
  if (!room.elements.delete(id)) return;
  room.positions.delete(id);
  room.dirty.delete(id);
  room.deleted.add(id);
  scheduleFlush(room);
}

export function clearRoom(room: Room) {
  room.elements.clear();
  room.positions.clear();
  room.dirty.clear();
  room.deleted.clear();
  room.cleared = true;
  scheduleFlush(room);
}

// ---------- Saving ----------
function scheduleFlush(room: Room, delay = SAVE_DELAY_MS) {
  // Not reset by new changes: saving happens at most `delay` after the first unsaved change.
  if (room.flushTimer) return;
  room.flushTimer = setTimeout(() => { room.flushTimer = null; void flush(room); }, delay);
}

const hasChanges = (room: Room) => room.cleared || room.dirty.size > 0 || room.deleted.size > 0;

/** Writes pending changes. Safe to call at any time; runs one save per room at a time. */
export async function flush(room: Room): Promise<void> {
  if (room.flushing) {
    await room.flushing;
    if (hasChanges(room)) return flush(room);
    return;
  }
  if (room.flushTimer) { clearTimeout(room.flushTimer); room.flushTimer = null; }
  if (!hasChanges(room)) return;

  const cleared = room.cleared;
  const deleted = [...room.deleted];
  const dirty = [...room.dirty];
  room.cleared = false;
  room.deleted.clear();
  room.dirty.clear();

  room.flushing = (async () => {
    try {
      const now = new Date();
      await getDb().transaction(async tx => {
        if (cleared) await tx.delete(boardElements).where(eq(boardElements.roomId, room.id));
        for (let i = 0; i < deleted.length; i += BATCH) {
          await tx.delete(boardElements).where(and(
            eq(boardElements.roomId, room.id),
            inArray(boardElements.elementId, deleted.slice(i, i + BATCH)),
          ));
        }
        const rows = dirty.flatMap(id => {
          const el = room.elements.get(id);
          const position = room.positions.get(id);
          return el && position !== undefined ? [{ roomId: room.id, elementId: id, position, data: el, updatedAt: now }] : [];
        });
        for (let i = 0; i < rows.length; i += BATCH) {
          await tx.insert(boardElements).values(rows.slice(i, i + BATCH)).onConflictDoUpdate({
            target: [boardElements.roomId, boardElements.elementId],
            set: { data: sql`excluded.data`, updatedAt: sql`excluded.updated_at` },
          });
        }
      });
    } catch (e) {
      // Put the changes back (unless something newer replaced them) and try again later.
      console.warn(`Could not save board ${room.id}, retrying:`, (e as Error).message);
      if (cleared) room.cleared = true;
      for (const id of deleted) if (!room.elements.has(id)) room.deleted.add(id);
      for (const id of dirty) if (room.elements.has(id)) room.dirty.add(id);
      scheduleFlush(room, RETRY_DELAY_MS);
    }
  })();

  try { await room.flushing; } finally { room.flushing = null; }
}

/** Called when someone leaves: once the room is empty, save it and free the memory. */
export async function releaseIfEmpty(room: Room) {
  if (room.clients.size) return;
  await flush(room);
  if (!room.clients.size && !hasChanges(room) && rooms.get(room.id) === room) rooms.delete(room.id);
}

/** Saves every room and closes the database connection (server shutdown). */
export async function saveAllAndClose() {
  await Promise.all([...rooms.values()].map(room => flush(room)));
  await closeDb();
}
