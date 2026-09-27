// Live-sync connection with automatic reconnect. Incoming messages are validated with zod.

import { LIMITS, ServerMessageSchema, type BoardElement, type ClientMessage, type ServerMessage } from '../protocol';

const MAX_CHUNK_BYTES = 256 * 1024;

// Where the sync server lives. Defaults to /ws on the page's own host.
export function defaultSyncUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export class Socket {
  private ws: WebSocket | null = null;
  private ready = false;
  private stopped = false;
  private delay = 500;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly url: string,
    private readonly join: Extract<ClientMessage, { t: 'join' | 'join-ticket' }>,
    private readonly onMessage: (msg: ServerMessage) => void,
    private readonly onLost: () => void,
  ) {}

  open() {
    this.stopped = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.ready = true;
      this.delay = 500;
      ws.send(JSON.stringify(this.join));
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let json: unknown;
      try { json = JSON.parse(ev.data); } catch { return; }
      const parsed = ServerMessageSchema.safeParse(json);
      if (!parsed.success) {
        console.warn('Ignored an unexpected message from the server', parsed.error.issues[0]);
        return;
      }
      this.onMessage(parsed.data);
    };
    ws.onclose = (ev) => {
      const wasReady = this.ready;
      this.ready = false;
      if (this.stopped) return;
      // 1008 = the server refused us (bad ticket, room full…). Retrying won't help.
      if (ev.code === 1008) { this.stopped = true; return; }
      if (wasReady) this.onLost();
      this.retryTimer = setTimeout(() => this.open(), this.delay);
      this.delay = Math.min(this.delay * 1.7, 8000);
    };
  }

  close() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.ws?.close();
    this.ws = null;
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ready) this.ws.send(JSON.stringify(msg));
  }

  // Sends elements in chunks that stay well under the server's message size limit.
  sendElements(els: BoardElement[]) {
    let batch: BoardElement[] = [];
    let bytes = 0;
    for (const el of els) {
      const n = JSON.stringify(el).length;
      if (batch.length && (bytes + n > MAX_CHUNK_BYTES || batch.length >= LIMITS.batch)) {
        this.send({ t: 'upsert', els: batch });
        batch = [];
        bytes = 0;
      }
      batch.push(el);
      bytes += n;
    }
    if (batch.length) this.send({ t: 'upsert', els: batch });
  }

  sendDelete(ids: string[]) {
    for (let i = 0; i < ids.length; i += 5000) this.send({ t: 'delete', ids: ids.slice(i, i + 5000) });
  }
}
