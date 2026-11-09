import type { WealthYear } from './types';

export interface ProjectionRow {
  year: number; start: number; projectedEnd: number; actualEnd: number | null;
  end: number; variance: number | null; isActual: boolean;
  /** Set on the anchored year: the real balance today that the rest of the year grows from. */
  asOf: number | null;
}

export interface Anchor { year: number; value: number; monthsLeft: number }

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
 * and the following year starts from it. Years beyond `rows` reuse the last assumptions.
 */
export function buildProjection(rows: WealthYear[], horizonYears: number, anchor?: Anchor): ProjectionRow[] {
  if (!rows.length) return [];
  const sorted = [...rows].sort((a, b) => a.year - b.year);
  const out: ProjectionRow[] = [];
  let carry = sorted[0].start_wealth;
  let last = sorted[0];
  const endYear = sorted[0].year + horizonYears - 1;
  for (let y = sorted[0].year; y <= endYear; y++) {
    const row = sorted.find(r => r.year === y);
    if (row) last = row;
    const start = carry;
    const anchored = anchor && anchor.year === y;
    const projectedEnd = anchored
      ? projectMonths(anchor.value, last.return_pct, last.monthly_contribution, anchor.monthsLeft)
      : projectYear(start, last.return_pct, last.monthly_contribution);
    const actualEnd = row?.actual_end ?? null;
    const end = actualEnd ?? projectedEnd;
    out.push({
      year: y, start, projectedEnd, actualEnd, end,
      variance: actualEnd == null ? null : actualEnd - projectedEnd,
      isActual: actualEnd != null, asOf: anchored ? anchor.value : null,
    });
    carry = end;
  }
  return out;
}
