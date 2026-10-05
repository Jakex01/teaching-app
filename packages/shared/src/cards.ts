// Task cards seen from outside the board: which ones are solved, and copying unfinished ones to a new board.
// Pure functions on board elements, used by the web server (lists, new lesson boards) and the board itself.

import type { BoardElement, TaskCardEl } from './elements';

export interface Box { x1: number; y1: number; x2: number; y2: number }

/** Task card layout, in board units: padding, header with the label, gap between the task and the solution. */
export const CARD = { pad: 20, header: 46, gap: 52 } as const;

/** The solution area of a task card (its right part). */
export const solutionArea = (el: TaskCardEl): Box => ({
  x1: el.x + el.split, y1: el.y + CARD.header, x2: el.x + el.w - CARD.pad, y2: el.y + el.h - CARD.pad,
});

/** Rough bounds without measuring text (good enough to tell which card something lies on). */
export function roughBox(el: BoardElement): Box {
  switch (el.type) {
    case 'stroke': {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      for (const [x, y] of el.pts) { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); }
      return { x1, y1, x2, y2 };
    }
    case 'line': case 'arrow':
      return { x1: Math.min(el.x1, el.x2), y1: Math.min(el.y1, el.y2), x2: Math.max(el.x1, el.x2), y2: Math.max(el.y1, el.y2) };
    case 'text': {
      const lines = el.text.split('\n');
      return { x1: el.x, y1: el.y, x2: el.x + Math.max(...lines.map(l => l.length)) * el.fs * 0.55, y2: el.y + lines.length * el.fs * 1.25 };
    }
    default:
      return { x1: el.x, y1: el.y, x2: el.x + el.w, y2: el.y + el.h };
  }
}

const centre = (b: Box) => ({ x: (b.x1 + b.x2) / 2, y: (b.y1 + b.y2) / 2 });
const inside = (p: { x: number; y: number }, b: Box) => p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2;

/** A card counts as solved when anything (writing, a shape, text, an image) lies in its solution area. */
export function isSolved(card: TaskCardEl, all: BoardElement[]) {
  const area = solutionArea(card);
  return all.some(el => el.type !== 'task' && inside(centre(roughBox(el)), area));
}

export function cardStats(all: BoardElement[]) {
  const cards = all.filter((el): el is TaskCardEl => el.type === 'task');
  return { tasks: cards.length, solved: cards.filter(c => isSolved(c, all)).length };
}

export function translate<T extends BoardElement>(el: T, dx: number, dy: number): T {
  const r = (v: number) => Math.round(v * 10) / 10;
  switch (el.type) {
    case 'stroke': return { ...el, pts: el.pts.map(p => (p.length === 3 ? [r(p[0] + dx), r(p[1] + dy), p[2]] : [r(p[0] + dx), r(p[1] + dy)])) };
    case 'line': case 'arrow': return { ...el, x1: r(el.x1 + dx), y1: r(el.y1 + dy), x2: r(el.x2 + dx), y2: r(el.y2 + dy) };
    default: return { ...el, x: r(el.x + dx), y: r(el.y + dy) };
  }
}

/**
 * Copies of the unfinished task cards (with their task, not the empty solution area), stacked from the
 * top-left, under a heading. New ids come from `newId`; hints start hidden again.
 */
export function carryOverUnfinished(all: BoardElement[], newId: () => string): BoardElement[] {
  const unfinished = all.filter((el): el is TaskCardEl => el.type === 'task' && !isSolved(el, all));
  if (!unfinished.length) return [];
  unfinished.sort((a, b) => a.y - b.y || a.x - b.x);

  const out: BoardElement[] = [{
    id: newId(), type: 'text', x: 0, y: 0, fs: 30, color: '#1E1B3A',
    text: 'Do dokończenia z poprzedniej lekcji',
  }];
  let y = 70;
  for (const card of unfinished) {
    const box: Box = { x1: card.x, y1: card.y, x2: card.x + card.w, y2: card.y + card.h };
    const dx = -card.x, dy = y - card.y;
    out.push(translate({ ...card, id: newId(), shown: card.hints?.length ? 0 : card.shown }, dx, dy));
    // What the card carries in its left part: the task itself.
    for (const el of all) {
      if (el.type === 'task' || el.id === card.id) continue;
      const c = centre(roughBox(el));
      if (inside(c, box) && c.x < card.x + card.split) out.push(translate({ ...el, id: newId() }, dx, dy));
    }
    y += card.h + 48;
  }
  return out;
}
