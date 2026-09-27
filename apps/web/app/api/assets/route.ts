import { NextResponse, type NextRequest } from 'next/server';
import { LIMITS } from '@teaching/shared';
import { isProtectedRoom, verifyTicket } from '@teaching/shared/ticket';
import { countRoomAssets, saveAsset, sniffImage } from '@/lib/assets';
import { syncSecret } from '@/lib/secrets';

// Image upload for notebook-boards. The request carries the board ticket in a custom header:
// that proves which notebook it's for, and a custom header also means other websites can't send it.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// At most 20 uploads per person per minute (per server process).
const recent = new Map<string, number[]>();
function allowUpload(key: string) {
  const now = Date.now();
  const times = (recent.get(key) ?? []).filter(t => now - t < 60_000);
  if (times.length >= 20) return false;
  times.push(now);
  recent.set(key, times);
  if (recent.size > 5000) recent.clear();
  return true;
}

/** Reads the body but stops as soon as it's bigger than the limit. */
async function readLimited(request: NextRequest, max: number) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); return 'too-big' as const; }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

export async function POST(request: NextRequest) {
  const ticket = verifyTicket(request.headers.get('x-board-ticket') ?? '', syncSecret());
  if (!ticket || !isProtectedRoom(ticket.room)) return json({ error: 'Brak dostępu do tego zeszytu.' }, 403);

  if (Number(request.headers.get('content-length') ?? 0) > LIMITS.imageBytes) {
    return json({ error: 'Obraz jest za duży (maks. 5 MB).' }, 413);
  }
  if (!allowUpload(`${ticket.room}:${ticket.uid}`)) return json({ error: 'Za dużo obrazów naraz. Spróbuj za minutę.' }, 429);
  if (await countRoomAssets(ticket.room) >= LIMITS.imagesPerRoom) {
    return json({ error: 'W tym zeszycie jest już za dużo obrazów.' }, 409);
  }

  const bytes = await readLimited(request, LIMITS.imageBytes);
  if (bytes === 'too-big') return json({ error: 'Obraz jest za duży (maks. 5 MB).' }, 413);
  if (!bytes?.byteLength) return json({ error: 'Pusty plik.' }, 400);

  const ext = sniffImage(bytes);
  if (!ext) return json({ error: 'Obsługiwane są tylko obrazy PNG, JPEG, WebP i GIF.' }, 415);

  const src = await saveAsset(ticket.room, ext, bytes);
  return json({ src }, 201);
}
