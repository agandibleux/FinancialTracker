import type { WealthYear } from './types';

export interface ProjectionRow {
  year: number; start: number; projectedEnd: number; actualEnd: number | null;
  end: number; variance: number | null; isActual: boolean;
  /** Set on the anchored year: the real balance today that the rest of the year grows from. */
  asOf: number | null;
  /** Lump sum taken out at the end of this year (gross), the tax on it, and what you keep. */
  withdrawn: number; tax: number; net: number;
}

export interface Anchor { year: number; value: number; monthsLeft: number }
export interface Withdrawal { id: string; year: number; amount: number; tax_pct: number }

/** Plan-wide assumptions. Years without their own row use these. */
export interface PlanOpts {
  /** Used for years that have no saved row. */
  defaults?: { return_pct: number; monthly_contribution: number; growth_pct: number };
  startYear?: number; startWealth?: number;
  withdrawals?: Withdrawal[];
  /** Added to every year's return (for the conservative / optimistic band). */
  returnOffset?: number;
}

/** Monthly compounding with end-of-month contributions. */
export function projectYear(start: number, returnPct: number, monthlyContribution: number): number {
  const r = Math.pow(1 + returnPct / 100, 1 / 12) - 1;
  let v = start;
  for (let m = 0; m < 12; m++) v = v * (1 + r) + monthlyContribution;
  return v;
}

/** Grow `value` over a (fractional) number of months with end-of-month contributions. */
export function projectMonths(value: number, returnPct: number, monthlyContribution: number, months: number): number {
  const r = Math.pow(1 + returnPct / 100, 1 / 12) - 1;
  const g = Math.pow(1 + r, months);
  return value * g + (r === 0 ? monthlyContribution * months : monthlyContribution * (g - 1) / r);
}

/**
 * Chain years: a year with an actual end value overrides the projection,
 * and the following year starts from it. Years without a row use `opts.defaults`
 * (or, when none are given, reuse the last row's assumptions).
 */
export function buildProjection(rows: WealthYear[], horizonYears: number, anchor?: Anchor, opts: PlanOpts = {}): ProjectionRow[] {
  const sorted = [...rows].sort((a, b) => a.year - b.year);
  const d = opts.defaults;
  if (!sorted.length && !d) return [];
  const firstYear = opts.startYear ?? sorted[0]?.year ?? new Date().getFullYear();
  const out: ProjectionRow[] = [];
  let carry = sorted.find(r => r.year === firstYear)?.start_wealth ?? opts.startWealth ?? sorted[0]?.start_wealth ?? 0;
  let last: WealthYear | undefined = sorted[0];
  const off = opts.returnOffset ?? 0;
  for (let y = firstYear; y <= firstYear + horizonYears - 1; y++) {
    const row = sorted.find(r => r.year === y);
    if (row) last = row;
    let ret: number, contrib: number;
    if (row) { ret = row.return_pct; contrib = row.monthly_contribution; }
    else if (d) { ret = d.return_pct; contrib = d.monthly_contribution * Math.pow(1 + d.growth_pct / 100, y - firstYear); }
    else { ret = last!.return_pct; contrib = last!.monthly_contribution; }
    ret += off;
    const start = carry;
    const anchored = anchor && anchor.year === y;
    const grown = anchored ? projectMonths(anchor.value, ret, contrib, anchor.monthsLeft) : projectYear(start, ret, contrib);
    const actualEnd = row?.actual_end ?? null;
    // A lump sum only comes off a projected year; a typed-in actual already reflects it.
    const wd = (opts.withdrawals ?? []).filter(w => w.year === y);
    const asked = wd.reduce((t, w) => t + w.amount, 0);
    const gross = actualEnd == null ? Math.min(grown, asked) : 0;
    const taxAsked = wd.reduce((t, w) => t + w.amount * w.tax_pct / 100, 0);
    const tax = actualEnd == null && asked ? taxAsked * gross / asked : 0;
    const projectedEnd = grown - gross;
    const end = actualEnd ?? projectedEnd;
    out.push({
      year: y, start, projectedEnd, actualEnd, end,
      variance: actualEnd == null ? null : actualEnd - projectedEnd,
      isActual: actualEnd != null, asOf: anchored ? anchor.value : null,
      withdrawn: gross, tax, net: gross - tax,
    });
    carry = end;
  }
  return out;
}

/** Savings account balance at the end of each year (monthly compounding, contribution grows yearly). */
export function projectSavings(start: number, ratePct: number, monthly: number, growthPct: number, years: number): number[] {
  const out: number[] = [];
  let v = start;
  for (let i = 0; i < years; i++) {
    v = projectYear(v, ratePct, monthly * Math.pow(1 + growthPct / 100, i));
    out.push(v);
  }
  return out;
}
