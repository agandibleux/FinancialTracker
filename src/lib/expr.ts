/** Tiny safe calculator for money fields: + − × ÷, parentheses, % and decimals. No eval. */
export function evalExpr(src: string): number | null {
  const s = src.replace(/[×x*]/g, '*').replace(/[÷/]/g, '/').replace(/[−–]/g, '-').replace(/[,\s$]/g, '');
  if (!s) return null;
  let i = 0;
  const peek = () => s[i];
  const num = (): number => {
    const m = /^\d*\.?\d+|^\d+\.?/.exec(s.slice(i));
    if (!m) throw 0;
    i += m[0].length;
    return parseFloat(m[0]);
  };
  const atom = (): number => {
    let v: number;
    if (peek() === '(') { i++; v = sum(); if (peek() !== ')') throw 0; i++; }
    else if (peek() === '-') { i++; return -atom(); }
    else if (peek() === '+') { i++; return atom(); }
    else v = num();
    while (peek() === '%') { i++; v /= 100; }
    return v;
  };
  const prod = (): number => {
    let v = atom();
    while (peek() === '*' || peek() === '/') { const op = s[i++]; const r = atom(); v = op === '*' ? v * r : v / r; }
    return v;
  };
  function sum(): number {
    let v = prod();
    while (peek() === '+' || peek() === '-') { const op = s[i++]; const r = prod(); v = op === '+' ? v + r : v - r; }
    return v;
  }
  try {
    const v = sum();
    return i === s.length && Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  } catch { return null; }
}

/** True when the text is more than a plain number, i.e. it needs evaluating. */
export const isExpr = (t: string) => !/^-?[\d.,\s$]*$/.test(t);

/** A leading + * / works on the current value: "+45" on a field holding 100 means 100 + 45. */
export const isRelative = (t: string) => /^\s*[+*/×÷x]/.test(t);
