import 'server-only';

// One place that talks to Gemini (hints, drawings): the API key in a header, fallback models when the
// free plan is busy, and errors with short codes the routes turn into messages.
// Settings: AI_PROVIDER=gemini, GEMINI_API_KEY, optional GEMINI_MODEL (default gemini-3.8-flash).

const DEFAULT_MODEL = 'gemini-3.8-flash';
/** Tried in turn when the main model is busy ("high demand" at peak times) or gone. */
const FALLBACK_MODELS = ['gemini-3.5-flash', 'gemini-flash-latest'];

/** message: 'busy' | 'rate-limited' | 'model-gone' | 'not-understood' | 'daily-limit' | … */
export class AiError extends Error {}

export const aiEnabled = () => process.env.AI_PROVIDER === 'gemini' && !!process.env.GEMINI_API_KEY;

export interface GeminiRequest {
  system: string;
  parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[];
  /** Gemini's response schema (OpenAPI subset), when the answer has a fixed shape. */
  schema?: object;
  temperature?: number;
}

/** Sends one request (trying the fallback models if needed) and returns the model name and its parsed JSON answer. */
export async function geminiJson(req: GeminiRequest): Promise<{ model: string; json: unknown }> {
  const models = [...new Set([process.env.GEMINI_MODEL || DEFAULT_MODEL, ...FALLBACK_MODELS])];
  for (const [i, model] of models.entries()) {
    try {
      return { model, json: await ask(model, req) };
    } catch (e) {
      const retry = e instanceof AiError && ['busy', 'model-gone'].includes(e.message);
      if (!retry || i === models.length - 1) throw e;
      await new Promise(r => setTimeout(r, 1500)); // a short pause before the next model
    }
  }
  throw new AiError('busy');
}

async function ask(model: string, req: GeminiRequest): Promise<unknown> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    // The key goes in a header, not the URL, so it doesn't end up in logs.
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY ?? '' },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts: req.parts }],
      generationConfig: {
        temperature: req.temperature ?? 0.4,
        responseMimeType: 'application/json',
        ...(req.schema ? { responseSchema: req.schema } : {}),
      },
    }),
  }).catch(e => { throw new AiError(`unreachable: ${(e as Error).message}`); });

  if (res.status === 429) throw new AiError('rate-limited');
  if (res.status === 503) throw new AiError('busy');
  if (res.status === 404) throw new AiError('model-gone');
  if (!res.ok) throw new AiError(`error ${res.status}`);
  const data = await res.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text ?? '').join('') ?? '';
  try {
    return JSON.parse(text);
  } catch {
    throw new AiError('not-understood');
  }
}
