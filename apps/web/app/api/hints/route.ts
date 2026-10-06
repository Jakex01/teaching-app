import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { assetSrc } from '@teaching/shared';
import { isProtectedRoom, verifyTicket } from '@teaching/shared/ticket';
import { HintsError, aiEnabled, hintsForTask } from '@/lib/ai/hints';
import { allowAiCall } from '@/lib/ai/limits';
import { readAsset } from '@/lib/assets';
import { syncSecret } from '@/lib/secrets';

// AI hints for a task card. Like image upload, the request carries the board ticket in a custom header:
// that proves which notebook it's for. Only the task image from that same notebook is sent to the AI.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const Body = z.object({ src: assetSrc });

export async function POST(request: NextRequest) {
  const ticket = verifyTicket(request.headers.get('x-board-ticket') ?? '', syncSecret());
  if (!ticket || !isProtectedRoom(ticket.room)) return json({ error: 'Brak dostępu do tego zeszytu.' }, 403);
  if (!aiEnabled()) return json({ error: 'Podpowiedzi AI nie są włączone.' }, 503);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Nieprawidłowe zapytanie.' }, 400);
  // /api/assets/<room>/<file>: only images of this notebook.
  const [, , , room, file] = parsed.data.src.split('/');
  if (room !== ticket.room) return json({ error: 'Brak dostępu do tego obrazu.' }, 403);
  const asset = await readAsset(room, file);
  if (!asset) return json({ error: 'Nie znaleziono obrazu zadania.' }, 404);

  try {
    const hints = await hintsForTask(asset.bytes, asset.type, () => allowAiCall(room));
    return json({ hints });
  } catch (e) {
    const reason = e instanceof HintsError ? e.message : 'unknown';
    console.warn('Hints failed:', reason);
    if (reason === 'daily-limit') return json({ error: 'Na dziś wyczerpał się limit podpowiedzi. Spróbuj jutro.' }, 429);
    if (reason === 'not-math') return json({ error: 'Na tym obrazie nie widzę zadania z matematyki.' }, 422);
    if (reason === 'rate-limited' || reason === 'busy') return json({ error: 'AI jest teraz zajęte (limit darmowego planu). Spróbuj za minutę.' }, 503);
    return json({ error: 'Nie udało się przygotować podpowiedzi. Spróbuj ponownie.' }, 502);
  }
}
