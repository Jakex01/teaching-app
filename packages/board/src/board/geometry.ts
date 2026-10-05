import { FONT } from '../constants';
import { LIMITS, type BoardElement, type ImageEl, type ShapeEl, type TaskCardEl, type TextEl } from '../protocol';

export interface Box { x1: number; y1: number; x2: number; y2: number }
export type Pt = [number, number];

let measureCtx: CanvasRenderingContext2D | null = null;

// Task card layout and solution area are shared with the server (lists, copying unfinished tasks).
export { CARD, solutionArea } from '../protocol';
import { CARD } from '../protocol';

/** Section layout, in board units: header band with the title, inner padding. */
export const SECTION = { header: 72, pad: 40 } as const;

/** Hints under the task, in the card's left part. */
export const HINT = { fs: 16, line: 22, pad: 10, gap: 8, button: 36, font: '500 16px' } as const;

export interface HintBox { x: number; y: number; w: number; h: number; n: number; lines: string[] }
export interface HintLayout { boxes: HintBox[]; button: (Box & { label: string }) | null; bottom: number }

/** Where the shown hints and the "Podpowiedź" button go on a card (shared by drawing, clicks and growing). */
export function hintLayout(el: TaskCardEl): HintLayout {
  const x = el.x + CARD.pad;
  const w = Math.max(160, el.split - CARD.pad - CARD.gap);
  const hints = el.hints ?? [];
  const shown = Math.min(el.shown ?? 0, hints.length);
  let y = el.taskH != null ? el.y + CARD.header + el.taskH + 14 : el.y + el.h - CARD.pad - HINT.button;

  const boxes: HintBox[] = [];
  for (let i = 0; i < shown; i++) {
    const lines = wrapText(hints[i], w - HINT.pad * 2 - 30, `${HINT.font} ${FONT}`);
    const h = lines.length * HINT.line + HINT.pad * 2;
    boxes.push({ x, y, w, h, n: i + 1, lines });
    y += h + HINT.gap;
  }
  let button: HintLayout['button'] = null;
  if (!hints.length || shown < hints.length) {
    const label = hints.length ? `💡 Podpowiedź ${shown + 1}/${hints.length}` : '💡 Podpowiedź';
    button = { x1: x, y1: y, x2: x + Math.min(w, 220), y2: y + HINT.button, label };
    y += HINT.button;
  }
  return { boxes, button, bottom: y };
}

/** Splits text into lines that fit `maxW` in the given font. */
export function wrapText(text: string, maxW: number, font: string): string[] {
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = font;
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measureCtx.measureText(next).width > maxW) { out.push(line); line = word; } else line = next;
    }
    out.push(line);
  }
  return out;
}

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Rounds to 0.1 and keeps coordinates inside the range the server accepts.
export const wc = (v: number) => clamp(Math.round(v * 10) / 10, -LIMITS.coord, LIMITS.coord);

export const unionBox = (a: Box | null, b: Box): Box =>
  a ? { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) } : { ...b };

// ---------- Text measuring ----------
const measureCache = new Map<string, { w: number; h: number }>();

export function measureText(el: TextEl) {
  const key = el.text + '|' + el.fs;
  const hit = measureCache.get(key);
  if (hit) return hit;
  measureCtx ??= document.createElement('canvas').getContext('2d')!;
  const ctx = measureCtx;
  ctx.font = `600 ${el.fs}px ${FONT}`;
  const lines = el.text.split('\n');
  const w = Math.max(10, ...lines.map(l => ctx.measureText(l).width));
  const m = { w, h: lines.length * el.fs * 1.25 };
  if (measureCache.size > 500) measureCache.clear();
  measureCache.set(key, m);
  return m;
}

export const clearMeasureCache = () => measureCache.clear();

// ---------- Rotated images ----------
export const imageCenter = (el: ImageEl): Pt => [el.x + el.w / 2, el.y + el.h / 2];

/** Rotates (x, y) by `rot` radians around the origin. */
export const rotate = (x: number, y: number, rot: number): Pt =>
  [x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)];

/** World point -> the image's own frame (origin at its centre, unrotated). */
export function toImageLocal(el: ImageEl, x: number, y: number): Pt {
  const [cx, cy] = imageCenter(el);
  return rotate(x - cx, y - cy, -el.rot);
}

/** Image-local point -> world. */
export function fromImageLocal(el: ImageEl, lx: number, ly: number): Pt {
  const [cx, cy] = imageCenter(el);
  const [rx, ry] = rotate(lx, ly, el.rot);
  return [cx + rx, cy + ry];
}

/** Corners in world coordinates: top-left, top-right, bottom-right, bottom-left. */
export function imageCorners(el: ImageEl): [Pt, Pt, Pt, Pt] {
  const hw = el.w / 2, hh = el.h / 2;
  return [fromImageLocal(el, -hw, -hh), fromImageLocal(el, hw, -hh), fromImageLocal(el, hw, hh), fromImageLocal(el, -hw, hh)];
}

/** Keeps an angle in (-π, π]. */
export function normalizeAngle(a: number) {
  a = a % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

// ---------- Bounds & hit testing ----------
export function bbox(el: BoardElement): Box {
  switch (el.type) {
    case 'stroke': {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const [x, y] of el.pts) { if (x < x1) x1 = x; if (y < y1) y1 = y; if (x > x2) x2 = x; if (y > y2) y2 = y; }
      const p = el.size / 2;
      return { x1: x1 - p, y1: y1 - p, x2: x2 + p, y2: y2 + p };
    }
    case 'line': case 'arrow':
      return { x1: Math.min(el.x1, el.x2), y1: Math.min(el.y1, el.y2), x2: Math.max(el.x1, el.x2), y2: Math.max(el.y1, el.y2) };
    case 'text': {
      const m = measureText(el);
      return { x1: el.x, y1: el.y, x2: el.x + m.w, y2: el.y + m.h };
    }
    case 'image': {
      const c = imageCorners(el);
      const xs = c.map(p => p[0]), ys = c.map(p => p[1]);
      return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
    }
    default:
      return { x1: el.x, y1: el.y, x2: el.x + el.w, y2: el.y + el.h };
  }
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = clamp(l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0, 0, 1);
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export const triPts = (el: ShapeEl): [Pt, Pt, Pt] =>
  [[el.x + el.w / 2, el.y], [el.x + el.w, el.y + el.h], [el.x, el.y + el.h]];

export function hit(el: BoardElement, x: number, y: number, tol: number): boolean {
  switch (el.type) {
    case 'stroke': {
      const r = el.size / 2 + tol;
      const p = el.pts;
      if (p.length === 1) return Math.hypot(x - p[0][0], y - p[0][1]) <= r;
      for (let i = 1; i < p.length; i++) if (distToSeg(x, y, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]) <= r) return true;
      return false;
    }
    case 'line': case 'arrow':
      return distToSeg(x, y, el.x1, el.y1, el.x2, el.y2) <= el.size / 2 + tol;
    case 'text': {
      const b = bbox(el);
      return x >= b.x1 - tol && x <= b.x2 + tol && y >= b.y1 - tol && y <= b.y2 + tol;
    }
    case 'image': {
      const [lx, ly] = toImageLocal(el, x, y);
      return Math.abs(lx) <= el.w / 2 + tol && Math.abs(ly) <= el.h / 2 + tol;
    }
    case 'section': {
      // Like a card: only the title band and the edge pick it, so everything inside stays easy to use.
      const inside = x >= el.x - tol && x <= el.x + el.w + tol && y >= el.y - tol && y <= el.y + el.h + tol;
      if (!inside) return false;
      const r = 12 + tol;
      return y <= el.y + SECTION.header || x <= el.x + r || x >= el.x + el.w - r || y >= el.y + el.h - r;
    }
    case 'task': {
      // Only the header and the edge pick the card, so drawing and selecting inside it still works.
      const inside = x >= el.x - tol && x <= el.x + el.w + tol && y >= el.y - tol && y <= el.y + el.h + tol;
      if (!inside) return false;
      const r = 10 + tol;
      return y <= el.y + CARD.header || x <= el.x + r || x >= el.x + el.w - r || y >= el.y + el.h - r;
    }
    case 'rect': case 'ellipse': case 'triangle': {
      const b = bbox(el);
      const inside = x >= b.x1 - tol && x <= b.x2 + tol && y >= b.y1 - tol && y <= b.y2 + tol;
      if (!inside) return false;
      if (el.fill) return true;
      // Outline-only: must be near the edge
      const r = el.size / 2 + tol;
      if (el.type === 'rect') return x <= b.x1 + r || x >= b.x2 - r || y <= b.y1 + r || y >= b.y2 - r;
      if (el.type === 'ellipse') {
        const cx = (b.x1 + b.x2) / 2, cy = (b.y1 + b.y2) / 2;
        const rx = Math.max(1, el.w / 2), ry = Math.max(1, el.h / 2);
        const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
        return Math.abs(d - 1) * Math.min(rx, ry) <= r;
      }
      const [a, bb, c] = triPts(el);
      return distToSeg(x, y, ...a, ...bb) <= r || distToSeg(x, y, ...bb, ...c) <= r || distToSeg(x, y, ...c, ...a) <= r;
    }
  }
}

export function translateEl(el: BoardElement, dx: number, dy: number) {
  switch (el.type) {
    case 'stroke': el.pts = el.pts.map(p => (p.length === 3 ? [wc(p[0] + dx), wc(p[1] + dy), p[2]] : [wc(p[0] + dx), wc(p[1] + dy)])); break;
    case 'line': case 'arrow':
      el.x1 = wc(el.x1 + dx); el.y1 = wc(el.y1 + dy); el.x2 = wc(el.x2 + dx); el.y2 = wc(el.y2 + dy);
      break;
    default: el.x = wc(el.x + dx); el.y = wc(el.y + dy);
  }
}
