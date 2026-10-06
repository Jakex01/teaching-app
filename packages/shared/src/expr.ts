// A small, safe parser for function formulas ("x^2 - 4x + 3", "2sin(x)", "sqrt(x+1)/2").
// No eval and no access to anything else: only numbers, x, + - * / ^, brackets, and a few functions.

const FUNCS: Record<string, (v: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, tg: Math.tan, ctg: v => 1 / Math.tan(v),
  sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };
const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, neg: 3, '^': 4 };

type Token = { t: 'num'; v: number } | { t: 'x' } | { t: 'fn'; v: string } | { t: 'op'; v: string } | { t: '(' } | { t: ')' };

function tokenize(src: string): Token[] {
  const s = src.toLowerCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/·|×/g, '*').replace(/−/g, '-').replace(/π/g, 'pi');
  const out: Token[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const num = /^(?:\d+\.\d+|\d+|\.\d+)/.exec(s.slice(i));
    if (num) { out.push({ t: 'num', v: parseFloat(num[0]) }); i += num[0].length; continue; }
    const word = /^[a-z]+/.exec(s.slice(i));
    if (word) {
      // Split runs like "xsin" or "pix" into known pieces.
      let w = word[0];
      while (w) {
        const fn = Object.keys(FUNCS).sort((a, b) => b.length - a.length).find(f => w.startsWith(f));
        const k = Object.keys(CONSTS).find(n => w.startsWith(n));
        if (fn) { out.push({ t: 'fn', v: fn }); w = w.slice(fn.length); }
        else if (k) { out.push({ t: 'num', v: CONSTS[k] }); w = w.slice(k.length); }
        else if (w[0] === 'x') { out.push({ t: 'x' }); w = w.slice(1); }
        else throw new Error(`Nieznany symbol: ${w}`);
      }
      i += word[0].length;
      continue;
    }
    if ('+-*/^'.includes(c)) out.push({ t: 'op', v: c });
    else if (c === '(') out.push({ t: '(' });
    else if (c === ')') out.push({ t: ')' });
    else throw new Error(`Nieznany znak: ${c}`);
    i++;
  }
  // Implicit multiplication: 2x, 2(x+1), x(x-1), )(, 3sin(x)
  const withMul: Token[] = [];
  for (const tok of out) {
    const prev = withMul[withMul.length - 1];
    const prevEnds = prev && (prev.t === 'num' || prev.t === 'x' || prev.t === ')');
    const startsValue = tok.t === 'num' || tok.t === 'x' || tok.t === 'fn' || tok.t === '(';
    if (prevEnds && startsValue) withMul.push({ t: 'op', v: '*' });
    withMul.push(tok);
  }
  return withMul;
}

type Rpn = (Token | { t: 'neg' })[];

/** Compiles a formula in x into a function. Throws (with a message in Polish) for anything it doesn't understand. */
export function compileFormula(src: string): (x: number) => number {
  if (src.length > 120) throw new Error('Wzór jest za długi.');
  const tokens = tokenize(src);
  const output: Rpn = [];
  const stack: (Token | { t: 'neg' })[] = [];
  let prev: Token | null = null;
  for (const tok of tokens) {
    if (tok.t === 'num' || tok.t === 'x') output.push(tok);
    else if (tok.t === 'fn') stack.push(tok);
    else if (tok.t === '(') stack.push(tok);
    else if (tok.t === ')') {
      while (stack.length && stack[stack.length - 1].t !== '(') output.push(stack.pop()!);
      if (!stack.length) throw new Error('Brakuje nawiasu.');
      stack.pop();
      if (stack.length && stack[stack.length - 1].t === 'fn') output.push(stack.pop()!);
    } else {
      const unary = tok.v === '-' && (!prev || prev.t === 'op' || prev.t === '(');
      if (unary) { stack.push({ t: 'neg' }); prev = tok; continue; }
      if (tok.v === '+' && (!prev || prev.t === 'op' || prev.t === '(')) { prev = tok; continue; }
      const p = PREC[tok.v];
      while (stack.length) {
        const top = stack[stack.length - 1];
        const tp = top.t === 'op' ? PREC[top.v] : top.t === 'neg' ? PREC.neg : -1;
        if (tp < 0) break;
        if (tp > p || (tp === p && tok.v !== '^')) output.push(stack.pop()!); else break;
      }
      stack.push(tok);
    }
    prev = tok;
  }
  while (stack.length) {
    const top = stack.pop()!;
    if (top.t === '(') throw new Error('Brakuje nawiasu.');
    output.push(top);
  }

  // Check the shape once, so evaluation can't fail halfway.
  let depth = 0;
  for (const tok of output) {
    if (tok.t === 'num' || tok.t === 'x') depth++;
    else if (tok.t === 'op') depth--;
    if (depth < 1) throw new Error('Wzór jest niepełny.');
  }
  if (depth !== 1) throw new Error('Wzór jest niepełny.');

  return (x: number) => {
    const st: number[] = [];
    for (const tok of output) {
      if (tok.t === 'num') st.push(tok.v);
      else if (tok.t === 'x') st.push(x);
      else if (tok.t === 'neg') st.push(-st.pop()!);
      else if (tok.t === 'fn') st.push(FUNCS[tok.v](st.pop()!));
      else if (tok.t === 'op') {
        const b = st.pop()!, a = st.pop()!;
        st.push(tok.v === '+' ? a + b : tok.v === '-' ? a - b : tok.v === '*' ? a * b : tok.v === '/' ? a / b : Math.pow(a, b));
      }
    }
    return st[0];
  };
}
