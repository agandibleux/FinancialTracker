import { describe, expect, it } from 'vitest';
import { totals } from './calc';
import { allocate, planRoom } from './allocation';
import { buildProjection, projectYear } from './projection';
import type { Category } from './types';

const cats: Category[] = [
  { id: 1, name: 'Rent', kind: 'fixed', parent_id: null, counts_as_living: 1, default_amount: 0, archived: 0 },
  { id: 2, name: 'Hydro', kind: 'utility', parent_id: null, counts_as_living: 1, default_amount: 0, archived: 0 },
  { id: 3, name: 'Travel', kind: 'variable', parent_id: null, counts_as_living: 0, default_amount: 0, archived: 0 },
];

describe('totals', () => {
  it('excludes non-living categories from living cost', () => {
    const t = totals([{ person_id: 1, source: 'Job', amount: 5000 }],
      [{ category_id: 1, amount: 1500 }, { category_id: 2, amount: 100 }, { category_id: 3, amount: 400 }], cats);
    expect(t.expenses).toBe(2000);
    expect(t.living).toBe(100); // fixed (rent) and non-living (travel) are excluded
    expect(t.predicted).toBe(3000);
    expect(t.fixed).toBe(1500);
    expect(t.utility).toBe(100);
  });
});

describe('projection', () => {
  it('compounds to the annual rate with no contributions', () => {
    expect(projectYear(1000, 10, 0)).toBeCloseTo(1100, 6);
  });
  it('actual overrides projection and seeds next year', () => {
    const rows = buildProjection([
      { year: 2026, start_wealth: 1000, return_pct: 10, monthly_contribution: 0, actual_end: 1200 },
      { year: 2027, start_wealth: 0, return_pct: 10, monthly_contribution: 0, actual_end: null },
    ], 2);
    expect(rows[0].end).toBe(1200);
    expect(rows[0].variance).toBeCloseTo(100, 6);
    expect(rows[1].start).toBe(1200);
    expect(rows[1].end).toBeCloseTo(1320, 6);
  });
});

describe('allocate', () => {
  const ratios = [{ account: 'TFSA' as const, pct: 50 }, { account: 'RRSP' as const, pct: 50 }];
  it('fills emergency fund first', () => {
    const r = allocate({ amount: 1000, emergencyTarget: 3000, cashBalance: 2500, ratios, roomLeft: {} });
    expect(r.lines[0]).toMatchObject({ account: 'CASH', amount: 500 });
    expect(r.lines.find(l => l.account === 'TFSA')!.amount).toBeCloseTo(250);
  });
  it('caps by room and redistributes overflow', () => {
    const r = allocate({ amount: 1000, emergencyTarget: 0, cashBalance: 0, ratios, roomLeft: { TFSA: 100 } });
    expect(r.lines.find(l => l.account === 'TFSA')!.amount).toBeCloseTo(100);
    expect(r.lines.find(l => l.account === 'RRSP')!.amount).toBeCloseTo(900);
    expect(r.unallocated).toBeCloseTo(0);
  });
});

describe('planRoom', () => {
  const prio = ['FHSA', 'TFSA', 'RRSP'] as const;
  const row = (account: 'TFSA' | 'RRSP' | 'FHSA', room: number, contributed = 0) => ({ key: `A|${account}`, account, room, contributed });
  it('uses excess savings first, then monthly surplus', () => {
    const p = planRoom({ rows: [row('TFSA', 7000)], monthsLeft: 3, monthlySurplus: 400, excessCash: 5000, priority: [...prio] });
    expect(p.fundedBySavings).toBe(5000);
    expect(p.fundedByMonthly).toBe(1200);
    expect(p.gap).toBe(800);
    expect(p.extraPerMonth).toBeCloseTo(800 / 3);
    expect(p.rows[0].status).toBe('short');
  });
  it('fills higher-priority account first', () => {
    const p = planRoom({ rows: [row('RRSP', 1000), row('FHSA', 1000)], monthsLeft: 12, monthlySurplus: 0, excessCash: 1000, priority: [...prio] });
    expect(p.rows.find(r => r.account === 'FHSA')!.fromSavings).toBe(1000);
    expect(p.rows.find(r => r.account === 'RRSP')!.shortfall).toBe(1000);
  });
  it('marks maxed accounts and warns on over-contribution', () => {
    const p = planRoom({ rows: [row('TFSA', 1000, 1200)], monthsLeft: 6, monthlySurplus: 100, excessCash: 0, priority: [...prio] });
    expect(p.rows[0].status).toBe('maxed');
    expect(p.advice[0].tone).toBe('warn');
  });
  it('is on track when surplus covers everything', () => {
    const p = planRoom({ rows: [row('TFSA', 1200)], monthsLeft: 12, monthlySurplus: 100, excessCash: 0, priority: [...prio] });
    expect(p.gap).toBe(0);
    expect(p.rows[0].status).toBe('on-track');
  });
});

describe('yearlyStats', () => {
  const h = (date: string, shares: number, price: number) => ({ account_id: 1, date, ticker: 'X', shares, price, avg_price: 0 });
  const b = (date: string, balance: number) => ({ account_id: 1, date, balance });
  it('uses exact holding snapshots when they cover the year', async () => {
    const { yearlyStats } = await import('./portfolio');
    const r = yearlyStats([b('2025-12-31', 1000), b('2026-01-02', 1100), b('2026-01-03', 2200), b('2026-01-04', 2420)],
      [h('2025-12-31', 10, 100), h('2026-01-02', 10, 110), h('2026-01-03', 20, 110), h('2026-01-04', 20, 121)], new Set([1]));
    const y = r.find(x => x.year === 2026)!;
    expect(y.exact).toBe(true);
    expect(y.profit).toBeCloseTo(320);
    expect(y.returnPct).toBeCloseTo(21);
  });
  it('covers every year with balances and uses entered deposits otherwise', async () => {
    const { yearlyStats } = await import('./portfolio');
    const bal = [b('2025-02-01', 1000), b('2025-12-31', 3000), b('2026-06-01', 3300)];
    const r = yearlyStats(bal, [], new Set([1]), { 2025: 1500 });
    expect(r.map(x => x.year)).toEqual([2025, 2026]);
    expect(r[0].start).toBe(0);
    expect(r[0].profit).toBe(1500);
    expect(r[0].returnPct).toBeCloseTo(100);
    expect(r[1].start).toBe(3000); expect(r[1].growth).toBe(300); expect(r[1].profit).toBeNull();
  });
});

describe('yearlyStats year boundaries', () => {
  it('treats a Jan 1 balance as the previous year-end and returns profit over invested', async () => {
    const { yearlyStats } = await import('./portfolio');
    const b = (date: string, balance: number) => ({ account_id: 1, date, balance });
    const r = yearlyStats([b('2025-01-23', 7138.87), b('2025-12-31', 34778.82), b('2026-01-01', 34601.28)], [], new Set([1]), { 2025: 29050 });
    expect(r[0].end).toBeCloseTo(34601.28);
    expect(r[0].profit).toBeCloseTo(5551.28);
    expect(r[0].returnPct).toBeCloseTo(19.11, 2);
  });
});

import { evalExpr, isExpr, isRelative } from './expr';
describe('evalExpr', () => {
  it('does precedence, parens, percent and unicode operators', () => {
    expect(evalExpr('2+3*4')).toBe(14);
    expect(evalExpr('(2+3)×4')).toBe(20);
    expect(evalExpr('1,200 − 85.5')).toBe(1114.5);
    expect(evalExpr('50%')).toBe(0.5);
    expect(evalExpr('10÷4')).toBe(2.5);
    expect(evalExpr('-3+5')).toBe(2);
  });
  it('rejects junk and divide-by-zero', () => {
    expect(evalExpr('2+')).toBeNull();
    expect(evalExpr('abc')).toBeNull();
    expect(evalExpr('1/0')).toBeNull();
    expect(evalExpr('')).toBeNull();
  });
  it('tells plain numbers from expressions', () => {
    expect(isExpr('1234.5')).toBe(false);
    expect(isExpr('-20')).toBe(false);
    expect(isExpr('12+3')).toBe(true);
    expect(isRelative('+45')).toBe(true);
    expect(isRelative('45')).toBe(false);
  });
});
