// Live-sync server: WebSocket at /ws, health check at /health.
// Every message is validated with the shared zod schemas before it touches a board.

import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { ClientMessageSchema, LIMITS, type ServerMessage, type User } from '@teaching/shared';
import { isProtectedRoom, verifyTicket } from '@teaching/shared/ticket';
import { getRoom, releaseIfEmpty, saveAll, scheduleSave, type Client, type Room } from './rooms';

type Message = ReturnType<typeof ClientMessageSchema.parse>;

const PORT = Number(process.env.PORT) || 3001;

// Shared with the web app, which signs join tickets with it. Required outside `npm run dev`.
const SYNC_SECRET = process.env.SYNC_SECRET || (process.env.SYNC_DEV === '1' ? 'dev-only-sync-secret' : '');
if (!SYNC_SECRET) {
  console.error('\n  SYNC_SECRET is not set. Set the same value for apps/web and apps/sync.\n');
  process.exit(1);
}
// Web app origins allowed to connect, comma separated.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',').map(s => s.trim()).filter(Boolean);

// ---------- HTTP ----------
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ ok: true }));
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

// ---------- WebSocket ----------
function originAllowed(origin: string | undefined, host: string | undefined) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try { return new URL(origin).host === host; } catch { return false; }
}

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 1024 * 1024, // 1 MB per message
  // Blocks other websites from connecting to a board in a visitor's name.
  verifyClient: ({ origin, req }: { origin: string; req: http.IncomingMessage }) => originAllowed(origin, req.headers.host),
});

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMessage, except?: WebSocket) {
  const data = JSON.stringify(msg);
  for (const c of room.clients) if (c.ws !== except && c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
}

const presence = (room: Room) => [...room.clients].flatMap(c => (c.user ? [c.user] : []));

// Token bucket: up to 240 messages at once, refilling 120 per second.
function makeLimiter(capacity = 240, perSecond = 120) {
  let tokens = capacity;
  let last = Date.now();
  return () => {
    const now = Date.now();
    tokens = Math.min(capacity, tokens + ((now - last) / 1000) * perSecond);
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

function handleMessage(client: Client, msg: Message) {
  const { ws } = client;

  if (msg.t === 'join' || msg.t === 'join-ticket') {
    if (client.room) return; // one room per connection

    let roomId: string;
    let user: User;
    if (msg.t === 'join-ticket') {
      // Identity comes from the web app's signed ticket, not from the browser.
      const ticket = verifyTicket(msg.ticket, SYNC_SECRET);
      if (!ticket) {
        send(ws, { t: 'error', msg: 'Link do tablicy wygasł. Odśwież stronę.' });
        return ws.close(1008, 'Invalid ticket');
      }
      roomId = ticket.room;
      user = { id: client.id, name: ticket.name, role: ticket.role, color: ticket.color };
    } else {
      // Anonymous join is only allowed for open demo boards, never for a student's notebook.
      if (isProtectedRoom(msg.room)) {
        send(ws, { t: 'error', msg: 'Ten zeszyt jest dostępny tylko przez aplikację.' });
        return ws.close(1008, 'Ticket required');
      }
      roomId = msg.room;
      user = { id: client.id, name: msg.name, role: msg.role, color: msg.color };
    }

    const room = getRoom(roomId);
    if (room.clients.size >= LIMITS.clientsPerRoom) {
      send(ws, { t: 'error', msg: 'This room is full.' });
      releaseIfEmpty(room);
      return ws.close(1008, 'Room full');
    }
    client.room = room;
    client.user = user;
    room.clients.add(client);
    send(ws, { t: 'init', you: client.user, elements: [...room.elements.values()], users: presence(room) });
    broadcast(room, { t: 'presence', users: presence(room) }, ws);
    return;
  }

  const room = client.room;
  if (!room || !client.user) return;
  const isTeacher = client.user.role === 'teacher';

  switch (msg.t) {
    case 'upsert': {
      const accepted = [];
      let full = false;
      for (const el of msg.els) {
        // An image may only show a file uploaded to this same notebook.
        if (el.type === 'image' && !el.src.startsWith(`/api/assets/${room.id}/`)) continue;
        if (!room.elements.has(el.id) && room.elements.size >= LIMITS.elementsPerRoom) { full = true; continue; }
        room.elements.set(el.id, el);
        accepted.push(el);
      }
      if (full) send(ws, { t: 'error', msg: 'The board is full. Clear some space first.' });
      if (!accepted.length) return;
      broadcast(room, { t: 'upsert', els: accepted, by: client.id }, ws);
      break;
    }
    case 'delete':
      for (const id of msg.ids) room.elements.delete(id);
      broadcast(room, { t: 'delete', ids: msg.ids, by: client.id }, ws);
      break;
    case 'clear':
      if (!isTeacher) return; // only teachers can wipe the board
      room.elements.clear();
      broadcast(room, { t: 'clear', by: client.id }, ws);
      break;
    case 'cursor':
      broadcast(room, { t: 'cursor', id: client.id, x: msg.x, y: msg.y }, ws);
      return;
    case 'follow':
      if (!isTeacher) return;
      broadcast(room, { t: 'follow', id: client.id, cam: msg.cam }, ws);
      return;
  }
  scheduleSave(room);
}

const clients = new Set<Client>();

wss.on('connection', (ws) => {
  const client: Client = { id: crypto.randomBytes(6).toString('hex'), ws, room: null, user: null, alive: true };
  clients.add(client);
  const allow = makeLimiter();
  let dropped = 0;

  ws.on('pong', () => { client.alive = true; });

  ws.on('message', (data, isBinary) => {
    if (isBinary) return ws.close(1003, 'Text only');
    if (!allow()) {
      // A normal browser never gets close to this. Keep flooding and you're out.
      if (++dropped > 500) ws.close(1008, 'Too many messages');
      return;
    }
    let json: unknown;
    try { json = JSON.parse(data.toString()); } catch { return; }
    const parsed = ClientMessageSchema.safeParse(json);
    if (!parsed.success) return;
    handleMessage(client, parsed.data);
  });

  ws.on('close', () => {
    clients.delete(client);
    const room = client.room;
    if (!room) return;
    room.clients.delete(client);
    broadcast(room, { t: 'presence', users: presence(room) });
    broadcast(room, { t: 'bye', id: client.id });
    releaseIfEmpty(room);
  });

  ws.on('error', () => ws.terminate());
});

// Drop connections that stopped answering (closed laptop, lost Wi-Fi).
const heartbeat = setInterval(() => {
  for (const client of clients) {
    if (!client.alive) { client.ws.terminate(); continue; }
    client.alive = false;
    client.ws.ping();
  }
}, 30_000);
wss.on('close', () => clearInterval(heartbeat));

// ---------- Start / stop ----------
server.listen(PORT, () => {
  console.log(`\n  🔌 Sync server on ws://localhost:${PORT}/ws`);
  console.log(`  Allowed origins: ${ALLOWED_ORIGINS.join(', ')}\n`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already in use. Stop the other server, or run with PORT=<another port>.\n`);
    process.exit(1);
  }
  throw err;
});

function shutdown() {
  saveAll();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

