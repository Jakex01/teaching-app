import 'server-only';
import crypto from 'node:crypto';
import { z } from 'zod';
import { LIMITS } from '@teaching/shared';
import { eq, getDb, taskHints } from '@teaching/db';
import { KARTA_WZOROW } from './karta-wzorow';

// Hints for a task (an image of it), made by an AI model. They guide the student's thinking and point
// to the CKE formula sheet; they never give the answer. Only the task image is sent, nothing about the student.
// Provider settings: AI_PROVIDER=gemini, GEMINI_API_KEY, optional GEMINI_MODEL (default gemini-3.8-flash).

/** Bump when the prompt changes, so cached hints are made again. */
const PROMPT_VERSION = 'v1';
const DEFAULT_MODEL = 'gemini-3.8-flash';
/** Tried in turn when the main model is busy (free plans get "high demand" errors at peak times) or gone. */
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-flash-latest'];

const SYSTEM = `Jesteś doświadczonym korepetytorem matematyki w polskim liceum. Dostajesz obraz jednego zadania (często z arkusza maturalnego CKE).
Przygotuj DOKŁADNIE 3 podpowiedzi, od najdelikatniejszej do najbardziej konkretnej. Mają naprowadzać ucznia, żeby sam pomyślał i sam rozwiązał zadanie.

Zasady:
- Nigdy nie podawaj wyniku, odpowiedzi, wartości liczbowych z rozwiązania ani gotowego rozwiązania.
- Podpowiedź 1: pytanie naprowadzające. Co jest dane, czego szukamy, z jakim pojęciem lub typem zadania to się kojarzy.
- Podpowiedź 2: metoda lub strategia. Jeśli potrzebny wzór lub twierdzenie jest w karcie „Wybrane wzory matematyczne”, napisz wprost, żeby tam zajrzeć, w formie: „Zajrzyj do karty wzorów, dział „<nazwa działu>”: <czego szukać>.” Używaj wyłącznie nazw działów z listy poniżej. Jeśli potrzebnego wzoru nie ma na liście, nie wspominaj o karcie.
- Podpowiedź 3: pierwszy konkretny krok (jak zapisać zależność, od czego zacząć, na jakie przypadki podzielić), bez dalszych obliczeń i bez wyniku.
- Każda podpowiedź ma 1–2 krótkie zdania, po polsku, zwracaj się do ucznia na „ty”.
- Wzory pisz zwykłym tekstem z symbolami Unicode (x², √, π, ≤, ≥, ≠, ∈, ∞, Δ, α, β), bez LaTeX-a.
- Jeśli na obrazie nie ma zadania matematycznego, ustaw notMath na true i zwróć pustą listę hints.

Działy karty wzorów (nazwa — co zawiera):
${KARTA_WZOROW.map(k => `- ${k.section} — ${k.contains}`).join('\n')}`;

const Answer = z.object({
  notMath: z.boolean().optional(),
  hints: z.array(z.string().trim().min(1)).max(LIMITS.hints),
});

export class HintsError extends Error {}

export const aiEnabled = () => process.env.AI_PROVIDER === 'gemini' && !!process.env.GEMINI_API_KEY;

/** Hints for the task in this image; from the cache when the same image was seen before. */
export async function hintsForTask(image: Uint8Array, mimeType: string, mayCallAi: () => boolean = () => true): Promise<string[]> {
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const key = `${PROMPT_VERSION}:${crypto.createHash('sha256').update(image).digest('hex')}`;
  const db = getDb();

  const [cached] = await db.select({ hints: taskHints.hints }).from(taskHints).where(eq(taskHints.key, key));
  const fromCache = z.array(z.string()).safeParse(cached?.hints);
  if (fromCache.success && fromCache.data.length) return fromCache.data;

  if (!mayCallAi()) throw new HintsError('daily-limit');
  const models = [...new Set([model, ...FALLBACK_MODELS])];
  for (const [i, m] of models.entries()) {
    try {
      const hints = await askGemini(image, mimeType, m);
      await db.insert(taskHints).values({ key, hints, model: m }).onConflictDoNothing();
      return hints;
    } catch (e) {
      const retry = e instanceof HintsError && ['busy', 'model-gone'].includes(e.message);
      if (!retry || i === models.length - 1) throw e;
      await new Promise(r => setTimeout(r, 1500)); // a short pause before the next model
    }
  }
  throw new HintsError('busy');
}

async function askGemini(image: Uint8Array, mimeType: string, model: string): Promise<string[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    // The key goes in a header, not the URL, so it doesn't end up in logs.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: Buffer.from(image).toString('base64') } },
          { text: 'Przygotuj 3 podpowiedzi do tego zadania.' },
        ],
      }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            notMath: { type: 'BOOLEAN' },
            hints: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['hints'],
        },
      },
    }),
  }).catch(e => { throw new HintsError(`AI unreachable: ${(e as Error).message}`); });

  if (res.status === 429) throw new HintsError('rate-limited');
  if (res.status === 503) throw new HintsError('busy');
  if (res.status === 404) throw new HintsError('model-gone');
  if (!res.ok) throw new HintsError(`AI error ${res.status}`);
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? '').join('') ?? '';

  let parsed: z.infer<typeof Answer>;
  try {
    parsed = Answer.parse(JSON.parse(text));
  } catch {
    throw new HintsError('AI answer not understood');
  }
  if (parsed.notMath) throw new HintsError('not-math');
  const hints = parsed.hints.map(h => h.slice(0, LIMITS.hintText)).slice(0, LIMITS.hints);
  if (!hints.length) throw new HintsError('no hints');
  return hints;
}
