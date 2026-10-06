import { describe, expect, it } from 'vitest';
import { buildDrawing, DrawingSpec } from './drawing';

let n = 0;
const id = () => `d${++n}`;
const build = (spec: unknown) => buildDrawing(DrawingSpec.parse(spec), id);
const ellipses = (els: ReturnType<typeof build>['elements']) => els.filter(e => e.type === 'ellipse' && !e.fill) as { x: number; y: number; w: number; h: number }[];

describe('buildDrawing', () => {
  it('puts an inscribed circle into a square, touching all four sides', () => {
    const d = build({ items: [
      { kind: 'point', name: 'A', x: 0, y: 0 }, { kind: 'point', name: 'B', x: 4, y: 0 },
      { kind: 'point', name: 'C', x: 4, y: 4 }, { kind: 'point', name: 'D', x: 0, y: 4 },
      { kind: 'polygon', points: ['A', 'B', 'C', 'D'] },
      { kind: 'incircle', of: ['A', 'B', 'C', 'D'], center: 'O' },
    ] });
    expect(d.warnings).toEqual([]);
    const [circle] = ellipses(d.elements);
    // The square is 4 units → the circle's diameter equals the side.
    const side = d.elements.filter(e => e.type === 'line').map(e => (e as { x1: number; x2: number }).x2 - (e as { x1: number }).x1).find(v => v > 0)!;
    expect(circle.w).toBeCloseTo(side, 0);
  });

  it('says when a quadrilateral has no inscribed circle', () => {
    const d = build({ items: [
      { kind: 'point', name: 'A', x: 0, y: 0 }, { kind: 'point', name: 'B', x: 6, y: 0 },
      { kind: 'point', name: 'C', x: 6, y: 2 }, { kind: 'point', name: 'D', x: 0, y: 2 },
      { kind: 'incircle', of: ['A', 'B', 'C', 'D'] },
    ] });
    expect(d.warnings.join(' ')).toMatch(/nie da się wpisać/);
  });

  it('makes externally tangent circles touch', () => {
    const d = build({ items: [
      { kind: 'point', name: 'O', x: 0, y: 0 },
      { kind: 'circle', name: 'k1', center: 'O', radius: 2 },
      { kind: 'tangent_circle', name: 'k2', to: 'k1', radius: 1, angle: 0, external: true },
    ] });
    const [a, b] = ellipses(d.elements);
    const dist = Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2));
    expect(dist).toBeCloseTo(a.w / 2 + b.w / 2, 0);
  });

  it('plots a graph and ignores anything that is not a formula', () => {
    const ok = build({ items: [{ kind: 'axes', x: [-2, 5], y: [-2, 5] }, { kind: 'function', expr: 'x^2-4x+3' }] });
    expect(ok.elements.some(e => e.type === 'stroke')).toBe(true);
    const bad = build({ items: [{ kind: 'axes', x: [-2, 5], y: [-2, 5] }, { kind: 'function', expr: 'alert(1)' }] });
    expect(bad.warnings.join(' ')).toMatch(/Wzór/);
  });

  it('rejects specs with odd names or too many items', () => {
    expect(DrawingSpec.safeParse({ items: [{ kind: 'point', name: '<script>', x: 0, y: 0 }] }).success).toBe(false);
    expect(DrawingSpec.safeParse({ items: Array(61).fill({ kind: 'point', name: 'A', x: 0, y: 0 }) }).success).toBe(false);
  });
});
