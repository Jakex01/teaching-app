import { describe, expect, it } from 'vitest';
import { ClientMessageSchema, ElementSchema, LIMITS } from './index';

const rect = { id: 'abc123', type: 'rect', x: 0, y: 0, w: 10, h: 10, size: 3, fill: false, color: '#1E1B3A' };

describe('ElementSchema', () => {
  it('accepts a valid rectangle', () => {
    expect(ElementSchema.safeParse(rect).success).toBe(true);
  });

  it('strips unknown fields', () => {
    const parsed = ElementSchema.parse({ ...rect, evil: '<script>' });
    expect(parsed).not.toHaveProperty('evil');
  });

  it.each([
    ['a named colour', { ...rect, color: 'red' }],
    ['a path-like id', { ...rect, id: '../../etc' }],
    ['a coordinate out of range', { ...rect, x: LIMITS.coord + 1 }],
    ['an unknown type', { ...rect, type: 'hexagon' }],
  ])('rejects %s', (_, el) => {
    expect(ElementSchema.safeParse(el).success).toBe(false);
  });

  it('rejects text longer than the limit', () => {
    const text = { id: 't1', type: 'text', x: 0, y: 0, fs: 20, color: '#000000', text: 'x'.repeat(LIMITS.text + 1) };
    expect(ElementSchema.safeParse(text).success).toBe(false);
  });

  it('rejects a stroke with too many points', () => {
    const pts = Array.from({ length: LIMITS.points + 1 }, (_, i) => [i, i]);
    const stroke = { id: 's1', type: 'stroke', pts, size: 3, hl: false, color: '#000000' };
    expect(ElementSchema.safeParse(stroke).success).toBe(false);
  });
});

describe('ImageSchema', () => {
  const img = { id: 'i1', type: 'image', src: '/api/assets/b-abc/AAAAAAAAAAAAAAAAAAAAAA.webp', x: 0, y: 0, w: 100, h: 50, rot: 0 };

  it('accepts an image stored in this app', () => {
    expect(ElementSchema.safeParse(img).success).toBe(true);
  });

  it.each([
    ['an outside URL', 'https://evil.example/x.png'],
    ['a data URL', 'data:image/png;base64,AAAA'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['an SVG', '/api/assets/b-abc/AAAAAAAAAAAAAAAAAAAAAA.svg'],
    ['a path that walks up', '/api/assets/../AAAAAAAAAAAAAAAAAAAAAA.png'],
  ])('rejects %s', (_, src) => {
    expect(ElementSchema.safeParse({ ...img, src }).success).toBe(false);
  });
});

describe('ClientMessageSchema', () => {
  it('cleans control characters out of display names', () => {
    const msg = ClientMessageSchema.parse({ t: 'join', room: 'sunny-otter-42', name: ' Ann\u0007 ', role: 'student', color: '#FF5A4E' });
    expect(msg.t === 'join' && msg.name).toBe('Ann');
  });

  it('rejects a name that is only control characters', () => {
    const r = ClientMessageSchema.safeParse({ t: 'join', room: 'room', name: '\u0000\u0001', role: 'student', color: '#FF5A4E' });
    expect(r.success).toBe(false);
  });

  it('rejects room ids with uppercase or slashes', () => {
    for (const room of ['Room', 'a/b', '../x', '']) {
      expect(ClientMessageSchema.safeParse({ t: 'join', room, name: 'A', role: 'student', color: '#FF5A4E' }).success).toBe(false);
    }
  });

  it('rejects unknown message types', () => {
    expect(ClientMessageSchema.safeParse({ t: 'hack' }).success).toBe(false);
  });
});
