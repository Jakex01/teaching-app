// Rooms live in memory while someone is connected and are saved to data/<room>.json.
// (Replaced by Postgres + Yjs in stage C of the roadmap.)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ElementSchema, roomId, type BoardElement } from '@teaching/shared';
import type { WebSocket } from 'ws';
import type { User } from '@teaching/shared';

export interface Client {
  id: string;
  ws: WebSocket;
  room: Room | null;
  user: User | null;
  alive: boolean;
}

export interface Room {
  id: string;
  elements: Map<string, BoardElement>;
  clients: Set<Client>;
  saveTimer: ReturnType<typeof setTimeout> | null;
  dirty: boolean;
}

const DATA_DIR = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const rooms = new Map<string, Room>();

function fileFor(id: string) {
  // roomId only allows [a-z0-9-], so the path can never leave DATA_DIR.
  if (!roomId.safeParse(id).success) throw new Error('Invalid room id');
  return path.join(DATA_DIR, id + '.json');
}

function load(id: string) {
  const elements = new Map<string, BoardElement>();
  const file = fileFor(id);
  if (!fs.existsSync(file)) return elements;
  try {
    const raw: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    let skipped = 0;
    for (const item of Array.isArray(raw) ? raw : []) {
      const parsed = ElementSchema.safeParse(item);
      if (parsed.success) elements.set(parsed.data.id, parsed.data);
      else skipped++;
    }
    if (skipped) console.warn(`Board ${id}: skipped ${skipped} invalid element(s)`);
  } catch (e) {
    console.warn('Could not load board', id, (e as Error).message);
  }
  return elements;
}

export function getRoom(id: string) {
  let room = rooms.get(id);
  if (!room) {
    room = { id, elements: load(id), clients: new Set(), saveTimer: null, dirty: false };
    rooms.set(id, room);
  }
  return room;
}

function save(room: Room) {
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = null;
  if (!room.dirty) return;
  room.dirty = false;
  const file = fileFor(room.id);
  const tmp = `${file}.${process.pid}.tmp`;
  // Write to a temp file first, then rename, so a crash never leaves half a board.
  fs.writeFile(tmp, JSON.stringify([...room.elements.values()]), (err) => {
    if (err) return console.warn('Could not save board', room.id, err.message);
    fs.rename(tmp, file, (e) => { if (e) console.warn('Could not save board', room.id, e.message); });
  });
}

export function scheduleSave(room: Room) {
  room.dirty = true;
  if (room.saveTimer) clearTimeout(room.saveTimer);
  room.saveTimer = setTimeout(() => save(room), 800);
}

// Called when the last person leaves: save and free the memory.
export function releaseIfEmpty(room: Room) {
  if (room.clients.size) return;
  save(room);
  rooms.delete(room.id);
}

export function saveAll() {
  for (const room of rooms.values()) {
    if (!room.dirty) continue;
    room.dirty = false;
    try {
      fs.writeFileSync(fileFor(room.id), JSON.stringify([...room.elements.values()]));
    } catch (e) {
      console.warn('Could not save board', room.id, (e as Error).message);
    }
  }
}
