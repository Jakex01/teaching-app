import { describe, expect, it } from 'vitest';
import { carryOverUnfinished, cardStats, type BoardElement } from './index';

const card = (id: string, y: number): BoardElement => ({ id, type: 'task', color: '#FFC93C', x: 0, y, w: 1000, h: 500, split: 520, label: id });
const taskImage = (id: string, y: number): BoardElement => ({ id, type: 'image', src: '/api/assets/b-abc/AAAAAAAAAAAAAAAAAAAAAA.webp', x: 20, y: y + 46, w: 480, h: 120, rot: 0 });
const writing = (id: string, y: number): BoardElement => ({ id, type: 'stroke', color: '#1E1B3A', size: 3, hl: false, pts: [[600, y + 200], [700, y + 220]] });

describe('task cards', () => {
  const all = [card('c1', 0), taskImage('i1', 0), writing('s1', 0), card('c2', 600), taskImage('i2', 600)];

  it('counts solved cards: something in the solution area', () => {
    expect(cardStats(all)).toEqual({ tasks: 2, solved: 1 });
  });

  it('copies only unfinished cards with their task, under a heading', () => {
    let n = 0;
    const copy = carryOverUnfinished(all, () => `n${++n}`);
    expect(copy.map(el => el.type)).toEqual(['text', 'task', 'image']);
    expect(copy.every(el => el.id.startsWith('n'))).toBe(true);
    const [, c, img] = copy as [BoardElement, Extract<BoardElement, { type: 'task' }>, Extract<BoardElement, { type: 'image' }>];
    expect(c.y).toBe(70);
    expect(img.y).toBe(70 + 46); // moved together with its card
  });

  it('copies nothing when everything is solved', () => {
    expect(carryOverUnfinished([card('c1', 0), writing('s1', 0)], () => 'x')).toEqual([]);
  });
});
