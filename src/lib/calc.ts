import type { Category, ExpenseEntry, IncomeEntry } from './types';

export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export function totals(income: IncomeEntry[], expenses: ExpenseEntry[], cats: Category[]) {
  const byId = new Map(cats.map(c => [c.id, c]));
  const inc = sum(income.map(i => i.amount));
  let exp = 0, living = 0, fixed = 0, utility = 0, variable = 0;
  for (const e of expenses) {
    const c = byId.get(e.category_id);
    if (!c) continue;
    exp += e.amount;
    if (c.counts_as_living && c.kind !== 'fixed') living += e.amount;
    if (c.kind === 'fixed') fixed += e.amount;
    else if (c.kind === 'utility') utility += e.amount;
    else variable += e.amount;
  }
  return { income: inc, expenses: exp, living, fixed, utility, variable, predicted: inc - exp };
}

export const money = (n: number, digits = 2) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n || 0);

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Trailing moving average; early points average whatever is available. */
export const movingAvg = (xs: number[], n = 3) => xs.map((_, i) => sum(xs.slice(Math.max(0, i - n + 1), i + 1)) / Math.min(n, i + 1));
