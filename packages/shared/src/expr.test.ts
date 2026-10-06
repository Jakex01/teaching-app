import { describe, expect, it } from 'vitest';
import { compileFormula } from './expr';

describe('compileFormula', () => {
  it.each([
    ['x^2 - 4x + 3', 1, 0],
    ['x^2 - 4x + 3', 0, 3],
    ['2(x+1)', 2, 6],
    ['-x^2', 3, -9],
    ['2^3^2', 0, 512],
    ['sqrt(x+1)/2', 3, 1],
    ['2sin(x)', Math.PI / 2, 2],
    ['|x|', 0, NaN],
  ])('%s at x=%s', (src, x, y) => {
    if (Number.isNaN(y)) { expect(() => compileFormula(src)).toThrow(); return; }
    expect(compileFormula(src)(x)).toBeCloseTo(y);
  });

  it('accepts Polish-style notation', () => {
    expect(compileFormula('2·x − 1')(2)).toBeCloseTo(3);
    expect(compileFormula('0,5x')(4)).toBeCloseTo(2);
    expect(compileFormula('tg(x)')(0)).toBeCloseTo(0);
  });

  it('refuses anything that is not a formula', () => {
    for (const bad of ['alert(1)', 'x+', '(x', 'process.exit()', 'x;y']) expect(() => compileFormula(bad)).toThrow();
  });
});
