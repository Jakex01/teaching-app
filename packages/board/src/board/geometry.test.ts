import { describe, expect, it } from 'vitest';
import type { BoardElement } from '../protocol';
import { bbox, hit, translateEl, unionBox, wc } from './geometry';

const rect = (fill: boolean): BoardElement =>
  ({ id: 'r', type: 'rect', x: 0, y: 0, w: 100, h: 50, size: 4, fill, color: '#000000' });

describe('geometry', () => {
  it('computes the bounds of a stroke including its thickness', () => {
    const stroke: BoardElement = { id: 's', type: 'stroke', pts: [[0, 0], [10, 20]], size: 4, hl: false, color: '#000000' };
    expect(bbox(stroke)).toEqual({ x1: -2, y1: -2, x2: 12, y2: 22 });
  });

  it('hits a filled rectangle anywhere inside', () => {
    expect(hit(rect(true), 50, 25, 0)).toBe(true);
  });

  it('only hits an outlined rectangle near its edge', () => {
    expect(hit(rect(false), 50, 25, 0)).toBe(false);
    expect(hit(rect(false), 1, 25, 0)).toBe(true);
  });

  it('hits a line within the tolerance', () => {
    const line: BoardElement = { id: 'l', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0, size: 2, color: '#000000' };
    expect(hit(line, 50, 5, 5)).toBe(true);
    expect(hit(line, 50, 10, 5)).toBe(false);
  });

  it('moves elements and keeps coordinates inside the allowed range', () => {
    const el = rect(false);
    translateEl(el, 5, 1e9);
    expect(el.type === 'rect' && [el.x, el.y]).toEqual([5, 1_000_000]);
  });

  it('rounds world coordinates to 0.1', () => {
    expect(wc(1.234)).toBe(1.2);
  });

  it('merges boxes', () => {
    expect(unionBox(null, { x1: 0, y1: 0, x2: 1, y2: 1 })).toEqual({ x1: 0, y1: 0, x2: 1, y2: 1 });
    expect(unionBox({ x1: 0, y1: 0, x2: 1, y2: 1 }, { x1: -1, y1: 2, x2: 3, y2: 4 })).toEqual({ x1: -1, y1: 0, x2: 3, y2: 4 });
  });
});
