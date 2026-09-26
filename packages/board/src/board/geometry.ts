import { FONT } from '../constants';
import { LIMITS, type BoardElement, type ShapeEl, type TextEl } from '../protocol';

export interface Box { x1: number; y1: number; x2: number; y2: number }
export type Pt = [number, number];

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// Rounds to 0.1 and keeps coordinates inside the range the server accepts.
export const wc = (v: number) => clamp(Math.round(v * 10) / 10, -LIMITS.coord, LIMITS.coord);

export const unionBox = (a: Box | null, b: Box): Box =>
  a ? { x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1), x2: Math.max(a.x2, b.x2), y2: Math.max(a.y2, b.y2) } : { ...b };

// ---------- Text measuring ----------
let measureCtx: CanvasRenderingContext2D | null = null;
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
    case 'stroke': el.pts = el.pts.map(([x, y]) => [wc(x + dx), wc(y + dy)]); break;
    case 'line': case 'arrow':
      el.x1 = wc(el.x1 + dx); el.y1 = wc(el.y1 + dy); el.x2 = wc(el.x2 + dx); el.y2 = wc(el.y2 + dy);
      break;
    default: el.x = wc(el.x + dx); el.y = wc(el.y + dy);
  }
}
