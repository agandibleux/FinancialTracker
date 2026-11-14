/**
 * Fixed costs per year. A plan row is (category, year, month, amount):
 *  - month 0  = the amount for every month of that year
 *  - month 1-12 = an override for just that month
 * A month's amount is its override, else its year's amount, else the most recent earlier year's amount (carried forward),
 * else the category's default. So a new year needs no setup until something actually changes.
 */
export interface PlanRow { category_id: number; year: number; month: number; amount: number }
export type BaseSource = 'year' | 'carried' | 'default';

const find = (rows: PlanRow[], cat: number, year: number, month: number) => rows.find(r => r.category_id === cat && r.year === year && r.month === month);

/** The amount that applies to a whole year, and where it comes from. */
export function fixedBase(rows: PlanRow[], cat: number, year: number, fallback: number): { amount: number; source: BaseSource; from?: number } {
  const own = find(rows, cat, year, 0);
  if (own) return { amount: own.amount, source: 'year' };
  const earlier = rows.filter(r => r.category_id === cat && r.month === 0 && r.year < year).sort((a, b) => b.year - a.year)[0];
  if (earlier) return { amount: earlier.amount, source: 'carried', from: earlier.year };
  return { amount: fallback, source: 'default' };
}

/** A single month's override, if one was set. */
export const fixedOverride = (rows: PlanRow[], cat: number, year: number, month: number) => find(rows, cat, year, month)?.amount;

/** The fixed cost that applies to a specific month. */
export function fixedFor(rows: PlanRow[], cat: number, year: number, month: number, fallback: number): number {
  return fixedOverride(rows, cat, year, month) ?? fixedBase(rows, cat, year, fallback).amount;
}
