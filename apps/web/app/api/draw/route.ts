import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { isProtectedRoom, verifyTicket } from '@teaching/shared/ticket';
import { drawingFor } from '@/lib/ai/draw';
import { AiError, aiEnabled } from '@/lib/ai/gemini';
import { allowAiCall } from '@/lib/ai/limits';
import { syncSecret } from '@/lib/secrets';

// "✨ Rysuj" on a board: a request in words → a drawing description (the browser computes and places it).
// Like image upload, the board ticket in a custom header proves which notebook this is for.

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const Body = z.object({ prompt: z.string().trim().min(3).max(300) });

export async function POST(request: NextRequest) {
  const ticket = verifyTicket(request.headers.get('x-board-ticket') ?? '', syncSecret());
  if (!ticket || !isProtectedRoom(ticket.room)) return json({ error: 'Brak dostępu do tego zeszytu.' }, 403);
  if (!aiEnabled()) return json({ error: 'Rysowanie z AI nie jest włączone.' }, 503);

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: 'Opisz rysunek w kilku słowach (do 300 znaków).' }, 400);
  if (!allowAiCall(ticket.room)) return json({ error: 'Na dziś wyczerpał się limit AI. Spróbuj jutro.' }, 429);

  try {
    return json({ spec: await drawingFor(parsed.data.prompt) });
  } catch (e) {
    const reason = e instanceof AiError ? e.message : 'unknown';
    console.warn('Drawing failed:', reason);
    if (reason === 'not-math') return json({ error: 'To nie wygląda na prośbę o rysunek z matematyki.' }, 422);
    if (reason === 'busy' || reason === 'rate-limited') return json({ error: 'AI jest teraz zajęte. Spróbuj za minutę.' }, 503);
    return json({ error: 'Nie udało się narysować. Spróbuj opisać to inaczej.' }, 502);
  }
}
