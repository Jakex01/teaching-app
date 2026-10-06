// "✨ Rysuj": the AI describes a figure (points, segments, circles, constructions, graphs) and this code
// computes it exactly and turns it into ordinary board elements. The AI never draws pixels and never
// solves anything: it only says what to draw; tangency, inscribed circles and graphs are computed here.

import { z } from 'zod';
import type { BoardElement, LineEl, ShapeEl, StrokeEl, TextEl } from './elements';
import { compileFormula } from './expr';

// A, B1, O_1, O₁, A' (shown with a subscript: O₁)
const Name = z.string().regex(/^[A-Za-z][A-Za-z0-9_'′₀-₉]{0,5}$/);
const Num = z.number().finite().min(-1000).max(1000);
const Label = z.string().trim().max(16);
const Pair = z.tuple([Name, Name]);

const Item = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('point'), name: Name, x: Num, y: Num, hidden: z.boolean().optional() }),
  z.object({ kind: z.literal('midpoint'), name: Name, of: Pair }),
  z.object({ kind: z.literal('foot'), name: Name, from: Name, line: Pair }),
  z.object({ kind: z.literal('intersection'), name: Name, line1: Pair, line2: Pair }),
  z.object({ kind: z.literal('segment'), from: Name, to: Name, label: Label.optional(), dashed: z.boolean().optional() }),
  z.object({ kind: z.literal('polygon'), points: z.array(Name).min(3).max(12) }),
  z.object({ kind: z.literal('circle'), name: Name.optional(), center: Name, radius: Num.positive().optional(), through: Name.optional() }),
  z.object({ kind: z.literal('circumcircle'), name: Name.optional(), of: z.array(Name).min(3).max(12), center: Name.optional() }),
  z.object({ kind: z.literal('incircle'), name: Name.optional(), of: z.array(Name).min(3).max(12), center: Name.optional(), touchPoints: z.array(Name).max(12).optional() }),
  z.object({ kind: z.literal('tangent_circle'), name: Name, to: Name, radius: Num.positive(), angle: Num, external: z.boolean().optional(), center: Name.optional() }),
  z.object({ kind: z.literal('tangents'), from: Name, circle: Name, points: z.tuple([Name, Name]).optional() }),
  z.object({ kind: z.literal('right_angle'), at: Name, a: Name, b: Name }),
  z.object({ kind: z.literal('angle'), at: Name, a: Name, b: Name, label: Label.optional() }),
  z.object({ kind: z.literal('axes'), x: z.tuple([Num, Num]), y: z.tuple([Num, Num]) }),
  z.object({ kind: z.literal('function'), expr: z.string().max(120), x: z.tuple([Num, Num]).optional(), label: Label.optional() }),
  z.object({ kind: z.literal('label'), at: Name, text: Label }),
]);

export const DrawingSpec = z.object({
  title: z.string().max(80).optional(),
  items: z.array(Item).min(1).max(60),
});
export type DrawingSpec = z.infer<typeof DrawingSpec>;

type P = [number, number];
interface Circle { c: P; r: number }

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
const mul = (a: P, k: number): P => [a[0] * k, a[1] * k];
const len = (a: P) => Math.hypot(a[0], a[1]);
const unit = (a: P): P => { const l = len(a) || 1; return [a[0] / l, a[1] / l]; };
const dot = (a: P, b: P) => a[0] * b[0] + a[1] * b[1];

function foot(p: P, a: P, b: P): P {
  const d = sub(b, a);
  return add(a, mul(d, dot(sub(p, a), d) / (dot(d, d) || 1)));
}

function intersect(a: P, b: P, c: P, d: P): P | null {
  const r = sub(b, a), s = sub(d, c);
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  return add(a, mul(r, t));
}

function circumcircle(a: P, b: P, c: P): Circle | null {
  const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
  if (Math.abs(d) < 1e-9) return null;
  const sq = (p: P) => p[0] * p[0] + p[1] * p[1];
  const ux = (sq(a) * (b[1] - c[1]) + sq(b) * (c[1] - a[1]) + sq(c) * (a[1] - b[1])) / d;
  const uy = (sq(a) * (c[0] - b[0]) + sq(b) * (a[0] - c[0]) + sq(c) * (b[0] - a[0])) / d;
  return { c: [ux, uy], r: len(sub(a, [ux, uy])) };
}

/** Inscribed circle of a polygon, from the bisectors at its first two corners. Null if the polygon has none. */
function incircle(pts: P[]): Circle | null {
  const n = pts.length;
  const bis = (i: number): [P, P] => {
    const p = pts[i], u = unit(sub(pts[(i - 1 + n) % n], p)), v = unit(sub(pts[(i + 1) % n], p));
    return [p, add(p, add(u, v))];
  };
  const [a1, a2] = bis(0), [b1, b2] = bis(1);
  const c = intersect(a1, a2, b1, b2);
  if (!c) return null;
  const dist = (i: number) => len(sub(c, foot(c, pts[i], pts[(i + 1) % n])));
  const r = dist(0);
  for (let i = 1; i < n; i++) if (Math.abs(dist(i) - r) > r * 0.02) return null; // not tangential
  return { c, r };
}

export interface BuiltDrawing { elements: BoardElement[]; width: number; height: number; warnings: string[] }

const INK = '#1E1B3A', CIRCLE = '#8B5CF6', GRAPH = '#FF5A4E', AXIS = '#1E1B3A';
const MAX_ELEMENTS = 400;

/**
 * Computes the figure and returns board elements with the top-left of the drawing at (0, 0),
 * scaled to about `target` board units on its longer side.
 */
export function buildDrawing(spec: DrawingSpec, newId: () => string, target = 440): BuiltDrawing {
  const warnings: string[] = [];
  const pts = new Map<string, P>();
  const hidden = new Set<string>();
  const circles = new Map<string, Circle>();
  const segs: { a: P; b: P; label?: string; dashed?: boolean }[] = [];
  const rings: Circle[] = [];
  const rightAngles: { at: P; a: P; b: P }[] = [];
  const angles: { at: P; a: P; b: P; label?: string }[] = [];
  const labels: { at: P; text: string }[] = [];
  let axes: { x: [number, number]; y: [number, number] } | null = null;
  const graphs: { pts: P[][]; label?: string }[] = [];
  const fnSpecs: { expr: string; x?: [number, number]; label?: string }[] = [];

  const need = (n: string): P | null => {
    const p = pts.get(n);
    if (!p) warnings.push(`Brak punktu ${n}.`);
    return p ?? null;
  };
  const setPoint = (name: string, p: P | null, hide = false) => { if (p) { pts.set(name, p); if (hide) hidden.add(name); } };

  for (const it of spec.items) {
    switch (it.kind) {
      case 'point': setPoint(it.name, [it.x, it.y], it.hidden); break;
      case 'midpoint': { const a = need(it.of[0]), b = need(it.of[1]); if (a && b) setPoint(it.name, mul(add(a, b), 0.5)); break; }
      case 'foot': { const p = need(it.from), a = need(it.line[0]), b = need(it.line[1]); if (p && a && b) setPoint(it.name, foot(p, a, b)); break; }
      case 'intersection': {
        const [a, b, c, d] = [...it.line1, ...it.line2].map(need);
        if (a && b && c && d) {
          const x = intersect(a, b, c, d);
          if (x) setPoint(it.name, x); else warnings.push(`Proste się nie przecinają (${it.name}).`);
        }
        break;
      }
      case 'segment': { const a = need(it.from), b = need(it.to); if (a && b) segs.push({ a, b, label: it.label, dashed: it.dashed }); break; }
      case 'polygon': {
        const ps = it.points.map(need);
        if (ps.every(Boolean)) ps.forEach((p, i) => segs.push({ a: p!, b: ps[(i + 1) % ps.length]! }));
        break;
      }
      case 'circle': {
        const c = need(it.center);
        if (!c) break;
        const r = it.radius ?? (it.through ? (pts.has(it.through) ? len(sub(pts.get(it.through)!, c)) : 0) : 0);
        if (r > 0) { const circ = { c, r }; rings.push(circ); if (it.name) circles.set(it.name, circ); }
        else warnings.push('Okrąg bez promienia.');
        break;
      }
      case 'circumcircle': {
        const ps = it.of.map(need);
        if (!ps.every(Boolean)) break;
        const circ = circumcircle(ps[0]!, ps[1]!, ps[2]!);
        if (!circ) { warnings.push('Na tych punktach nie da się opisać okręgu.'); break; }
        if (ps.length > 3 && ps.some(p => Math.abs(len(sub(p!, circ.c)) - circ.r) > circ.r * 0.02)) {
          warnings.push('Na tym wielokącie nie da się opisać okręgu; narysowano okrąg przez pierwsze trzy wierzchołki.');
        }
        rings.push(circ);
        if (it.name) circles.set(it.name, circ);
        if (it.center) setPoint(it.center, circ.c);
        break;
      }
      case 'incircle': {
        const ps = it.of.map(need);
        if (!ps.every(Boolean)) break;
        const circ = incircle(ps as P[]);
        if (!circ) { warnings.push('W ten wielokąt nie da się wpisać okręgu.'); break; }
        rings.push(circ);
        if (it.name) circles.set(it.name, circ);
        if (it.center) setPoint(it.center, circ.c);
        it.touchPoints?.forEach((n, i) => { if (i < ps.length) setPoint(n, foot(circ.c, ps[i]!, ps[(i + 1) % ps.length]!)); });
        break;
      }
      case 'tangent_circle': {
        const base = circles.get(it.to);
        if (!base) { warnings.push(`Brak okręgu ${it.to}.`); break; }
        const dir: P = [Math.cos((it.angle * Math.PI) / 180), Math.sin((it.angle * Math.PI) / 180)];
        const d = it.external === false ? Math.abs(base.r - it.radius) : base.r + it.radius;
        const circ = { c: add(base.c, mul(dir, d)), r: it.radius };
        rings.push(circ);
        circles.set(it.name, circ);
        if (it.center) setPoint(it.center, circ.c);
        break;
      }
      case 'tangents': {
        const p = need(it.from), circ = circles.get(it.circle);
        if (!p || !circ) { if (!circ) warnings.push(`Brak okręgu ${it.circle}.`); break; }
        const d = len(sub(p, circ.c));
        if (d <= circ.r) { warnings.push('Punkt leży wewnątrz okręgu: stycznych nie ma.'); break; }
        const base = Math.atan2(p[1] - circ.c[1], p[0] - circ.c[0]), a = Math.acos(circ.r / d);
        const t1: P = add(circ.c, [circ.r * Math.cos(base + a), circ.r * Math.sin(base + a)]);
        const t2: P = add(circ.c, [circ.r * Math.cos(base - a), circ.r * Math.sin(base - a)]);
        segs.push({ a: p, b: t1 }, { a: p, b: t2 });
        if (it.points) { setPoint(it.points[0], t1); setPoint(it.points[1], t2); }
        break;
      }
      case 'right_angle': { const at = need(it.at), a = need(it.a), b = need(it.b); if (at && a && b) rightAngles.push({ at, a, b }); break; }
      case 'angle': { const at = need(it.at), a = need(it.a), b = need(it.b); if (at && a && b) angles.push({ at, a, b, label: it.label }); break; }
      case 'axes': axes = { x: [Math.min(...it.x), Math.max(...it.x)], y: [Math.min(...it.y), Math.max(...it.y)] }; break;
      case 'function': fnSpecs.push(it); break;
      case 'label': { const at = need(it.at); if (at) labels.push({ at, text: it.text }); break; }
    }
  }

  // Graphs: sampled, cut where the curve jumps or leaves the visible range.
  for (const f of fnSpecs) {
    let fn: (x: number) => number;
    try { fn = compileFormula(f.expr); } catch (e) { warnings.push(`Wzór „${f.expr}”: ${(e as Error).message}`); continue; }
    const [x0, x1] = f.x ?? axes?.x ?? [-5, 5];
    const [y0, y1] = axes?.y ?? [-10, 10];
    const parts: P[][] = [[]];
    const steps = 240;
    for (let i = 0; i <= steps; i++) {
      const x = x0 + ((x1 - x0) * i) / steps, y = fn(x);
      const cur = parts[parts.length - 1];
      const ok = Number.isFinite(y) && y >= y0 - (y1 - y0) * 0.05 && y <= y1 + (y1 - y0) * 0.05;
      const jump = cur.length && Math.abs(y - cur[cur.length - 1][1]) > (y1 - y0) * 0.5;
      if (!ok || jump) { if (cur.length) parts.push([]); if (!ok) continue; }
      parts[parts.length - 1].push([x, y]);
    }
    graphs.push({ pts: parts.filter(p => p.length > 1), label: f.label });
  }

  // ---------- Fit to the board: math y goes up, board y goes down ----------
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const grow = (p: P, r = 0) => { minX = Math.min(minX, p[0] - r); maxX = Math.max(maxX, p[0] + r); minY = Math.min(minY, p[1] - r); maxY = Math.max(maxY, p[1] + r); };
  pts.forEach(p => grow(p));
  rings.forEach(c => grow(c.c, c.r));
  graphs.forEach(g => g.pts.flat().forEach(p => grow(p)));
  if (axes) { grow([axes.x[0], axes.y[0]]); grow([axes.x[1], axes.y[1]]); }
  if (!Number.isFinite(minX)) return { elements: [], width: 0, height: 0, warnings: [...warnings, 'Nie ma czego narysować.'] };

  const span = Math.max(maxX - minX, maxY - minY, 1e-6);
  const s = target / span;
  const pad = 28;
  const T = (p: P): P => [Math.round(((p[0] - minX) * s + pad) * 10) / 10, Math.round(((maxY - p[1]) * s + pad) * 10) / 10];
  const centre = T([(minX + maxX) / 2, (minY + maxY) / 2]);

  const out: BoardElement[] = [];
  const line = (a: P, b: P, color = INK, size = 3, type: LineEl['type'] = 'line') =>
    out.push({ id: newId(), type, x1: a[0], y1: a[1], x2: b[0], y2: b[1], color, size });
  const text = (at: P, t: string, fs = 20, color = INK) =>
    out.push({ id: newId(), type: 'text', x: at[0], y: at[1], text: t, fs, color } satisfies TextEl);
  const stroke = (p: P[], color: string, size = 3) =>
    out.push({ id: newId(), type: 'stroke', pts: p.slice(0, 5000) as StrokeEl['pts'], color, size, hl: false });

  // Axes with arrows, ticks and numbers
  if (axes) {
    const [ax0, ax1] = axes.x, [ay0, ay1] = axes.y;
    const ox = Math.min(Math.max(0, ax0), ax1), oy = Math.min(Math.max(0, ay0), ay1);
    line(T([ax0, oy]), T([ax1, oy]), AXIS, 2, 'arrow');
    line(T([ox, ay0]), T([ox, ay1]), AXIS, 2, 'arrow');
    const [xe, ye] = [T([ax1, oy]), T([ox, ay1])];
    text([xe[0] - 6, xe[1] + 6], 'x', 18);
    text([ye[0] + 8, ye[1] - 6], 'y', 18);
    const step = Math.max(1, Math.ceil(Math.max(ax1 - ax0, ay1 - ay0) / 12));
    for (let x = Math.ceil(ax0 / step) * step; x < ax1; x += step) {
      if (x === ox) continue;
      const p = T([x, oy]);
      line([p[0], p[1] - 5], [p[0], p[1] + 5], AXIS, 1.5);
      text([p[0] - 5, p[1] + 8], String(x), 13);
    }
    for (let y = Math.ceil(ay0 / step) * step; y < ay1; y += step) {
      if (y === oy) continue;
      const p = T([ox, y]);
      line([p[0] - 5, p[1]], [p[0] + 5, p[1]], AXIS, 1.5);
      text([p[0] + 8, p[1] - 8], String(y), 13);
    }
  }

  for (const g of graphs) {
    for (const part of g.pts) stroke(part.map(T), GRAPH);
    if (g.label && g.pts[0]?.length) { const end = T(g.pts[0][g.pts[0].length - 1]); text([end[0] + 6, end[1] - 24], g.label, 18, GRAPH); }
  }

  for (const c of rings) {
    const [cx, cy] = T(c.c), r = Math.round(c.r * s * 10) / 10;
    out.push({ id: newId(), type: 'ellipse', x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, color: CIRCLE, size: 3, fill: false } satisfies ShapeEl);
  }

  for (const sg of segs) {
    const a = T(sg.a), b = T(sg.b);
    if (sg.dashed) {
      const L = len(sub(b, a)), u = unit(sub(b, a));
      for (let d = 0; d < L; d += 18) line(add(a, mul(u, d)), add(a, mul(u, Math.min(d + 10, L))), INK, 2);
    } else line(a, b);
    if (sg.label) {
      const m = mul(add(a, b), 0.5), nrm = unit([-(b[1] - a[1]), b[0] - a[0]]);
      const side = dot(sub(m, centre), nrm) >= 0 ? 1 : -1; // outside the figure
      const at = add(m, mul(nrm, 16 * side));
      text([at[0] - 6, at[1] - 10], sg.label, 18);
    }
  }

  for (const ra of rightAngles) {
    const at = T(ra.at), u = unit(sub(T(ra.a), at)), v = unit(sub(T(ra.b), at)), k = 14;
    const p1 = add(at, mul(u, k)), p3 = add(at, mul(v, k)), p2 = add(p1, mul(v, k));
    line(p1, p2, INK, 2); line(p2, p3, INK, 2);
  }

  for (const an of angles) {
    const at = T(an.at), a = sub(T(an.a), at), b = sub(T(an.b), at);
    const a0 = Math.atan2(a[1], a[0]), a1 = Math.atan2(b[1], b[0]);
    let delta = a1 - a0;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const R = 26, arc: P[] = [];
    for (let i = 0; i <= 16; i++) { const t = a0 + (delta * i) / 16; arc.push([at[0] + R * Math.cos(t), at[1] + R * Math.sin(t)]); }
    stroke(arc, '#22C1A0', 2);
    if (an.label) { const mid = a0 + delta / 2; text([at[0] + (R + 10) * Math.cos(mid) - 6, at[1] + (R + 10) * Math.sin(mid) - 10], an.label, 18, '#22C1A0'); }
  }

  // Points: a dot and the name (O_1 → O₁), pushed away from the middle of the figure
  const pretty = (name: string) => name.replace(/_?(\d+)/g, (_, d: string) => [...d].map(c => '₀₁₂₃₄₅₆₇₈₉'[+c]).join(''));
  pts.forEach((p, name) => {
    if (hidden.has(name)) return;
    const at = T(p);
    out.push({ id: newId(), type: 'ellipse', x: at[0] - 4, y: at[1] - 4, w: 8, h: 8, color: INK, size: 1, fill: true } satisfies ShapeEl);
    const dir = unit(sub(at, centre));
    const lp = add(at, mul(len(dir) ? dir : [1, -1], 16));
    text([lp[0] - 7, lp[1] - 11], pretty(name), 20);
  });
  for (const l of labels) { const at = T(l.at); text([at[0] + 8, at[1] - 26], l.text, 18); }

  if (out.length > MAX_ELEMENTS) warnings.push('Rysunek był za duży i został skrócony.');
  return { elements: out.slice(0, MAX_ELEMENTS), width: span * s + pad * 2, height: (maxY - minY) * s + pad * 2, warnings };
}
