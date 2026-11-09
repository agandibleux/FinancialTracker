import type { Holding, HoldingSnapshot, Snapshot } from './types';
import { sum } from './calc';

export interface Row extends Holding {
  value: number; cost: number; gain: number; gainPct: number; dayChange: number; dayPct: number;
  weight: number; incomeYear: number; feeYear: number; drift: number;
}

export function enrich(hs: Holding[]): Row[] {
  const total = sum(hs.map(h => h.shares * h.price));
  return hs.map(h => {
    const value = h.shares * h.price, cost = h.shares * h.avg_price;
    const dayChange = h.prev_close ? h.shares * (h.price - h.prev_close) : 0;
    const weight = total ? (value / total) * 100 : 0;
    return {
      ...h, value, cost, gain: value - cost, gainPct: cost ? ((value - cost) / cost) * 100 : 0,
      dayChange, dayPct: h.prev_close ? ((h.price - h.prev_close) / h.prev_close) * 100 : 0,
      weight, incomeYear: value * h.yield_pct / 100, feeYear: value * h.expense_ratio / 100, drift: weight - h.target_pct,
    };
  });
}

/** Value-weighted exposure: each holding's % split × its value. */
export function exposure(rows: Row[], keys: { key: string; label: string }[]) {
  const total = sum(rows.map(r => r.value));
  return keys.map(k => ({ name: k.label, value: sum(rows.map(r => r.value * ((r as any)[k.key] ?? 0) / 100)) }))
    .map(x => ({ ...x, pct: total ? (x.value / total) * 100 : 0 })).filter(x => x.value > 0);
}
export const GEO = [{ key: 'usa', label: 'USA' }, { key: 'can', label: 'Canada' }, { key: 'other_geo', label: 'Other' }];
export const CLS = [{ key: 'stocks', label: 'Stocks' }, { key: 'bonds', label: 'Bonds' }, { key: 'other_cls', label: 'Other (gold…)' }];

export function groupBy(rows: Row[], f: (r: Row) => string) {
  const total = sum(rows.map(r => r.value)), m = new Map<string, number>();
  for (const r of rows) m.set(f(r) || 'Unspecified', (m.get(f(r) || 'Unspecified') ?? 0) + r.value);
  return [...m].map(([name, value]) => ({ name, value, pct: total ? (value / total) * 100 : 0 })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
}

const num = (s: string) => { const n = parseFloat(String(s ?? '').replace(/[$,%\s]/g, '')); return Number.isFinite(n) ? n : 0; };
/** Parse a table pasted from a spreadsheet (tab separated, header row with "ETF/Stock"). Columns matched by header name. */
export function parsePasted(text: string, account_id: number): Holding[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const hi = lines.findIndex(l => /^ETF\/Stock/i.test(l.trim()));
  if (hi < 0) return [];
  const head = lines[hi].split('\t').map(s => s.trim());
  // duplicate header names (USA/CAN/Other twice-ish): first "Other" = geography, second = asset class
  const idx = (name: string, nth = 0) => head.map((h, i) => (h === name ? i : -1)).filter(i => i >= 0)[nth] ?? -1;
  const col = { ticker: 0, info: idx('Info'), sector: idx('Sector'), er: idx('Expense Ratio'), yld: idx('Yield'), price: idx('Current Price'),
    avg: idx('AVG Price'), shares: idx('Current shares'), usa: idx('USA'), can: idx('CAN'), og: idx('Other', 0), st: idx('Stocks'), bo: idx('Bonds'), oc: idx('Other', 1) };
  const out: Holding[] = [];
  for (const l of lines.slice(hi + 1)) {
    const c = l.split('\t'), g = (i: number) => (i >= 0 ? c[i] ?? '' : '');
    const ticker = c[0]?.trim();
    if (!ticker) continue;
    const info = g(col.info).trim(), tgt = info.match(/Ideal\s+(\d+(?:\.\d+)?)%/i);
    out.push({
      account_id, ticker, quote_symbol: '', info, sector: g(col.sector).trim(),
      expense_ratio: num(g(col.er)), yield_pct: num(g(col.yld)), shares: num(g(col.shares)), avg_price: num(g(col.avg)),
      price: num(g(col.price)), prev_close: 0, price_date: '', target_pct: tgt ? Number(tgt[1]) : 0,
      usa: num(g(col.usa)), can: num(g(col.can)), other_geo: num(g(col.og)), stocks: num(g(col.st)), bonds: num(g(col.bo)), other_cls: num(g(col.oc)),
    });
  }
  return out;
}

export interface YearStat {
  year: number; start: number; end: number; growth: number; growthPct: number;
  /** null when deposits are unknown for this year */ profit: number | null; contributions: number | null; returnPct: number | null;
  days: number; partial: boolean; exact: boolean;
}

type Day = Map<string, { shares: number; price: number }>;

/** Exact market profit and time-weighted return per year from daily holding snapshots (deposits never count as profit). */
function snapshotYears(snaps: HoldingSnapshot[], accountIds: Set<number>) {
  const byDate = new Map<string, Day>();
  for (const s of snaps) {
    if (!accountIds.has(s.account_id)) continue;
    const day: Day = byDate.get(s.date) ?? new Map(), cur = day.get(s.ticker);
    day.set(s.ticker, { shares: (cur?.shares ?? 0) + s.shares, price: s.price });
    byDate.set(s.date, day);
  }
  const dates = [...byDate.keys()].sort();
  const valueOf = (d: Day) => sum([...d.values()].map(x => x.shares * x.price));
  const out = new Map<number, { profit: number; factor: number; days: number }>();
  for (let i = 1; i < dates.length; i++) {
    const prev = byDate.get(dates[i - 1])!, day = byDate.get(dates[i])!, pv = valueOf(prev);
    const gain = sum([...prev].map(([t, p]) => (day.has(t) ? p.shares * (day.get(t)!.price - p.price) : 0)));
    const y = out.get(Number(dates[i].slice(0, 4))) ?? { profit: 0, factor: 1, days: 0 };
    y.profit += gain; y.days++; if (pv > 0) y.factor *= 1 + gain / pv;
    out.set(Number(dates[i].slice(0, 4)), y);
  }
  return out;
}

/**
 * Yearly stats. Start/end/growth come from the daily account balances (longest history; they include deposits).
 * Market profit and return are exact when holding snapshots cover the year; otherwise they use the net deposits
 * entered for that year (profit = growth − deposits, return = profit / (start + deposits)); otherwise they are null.
 * A balance dated Jan 1 is the previous year's closing value (markets are closed). An account's first year starts at 0.
 */
export function yearlyStats(balances: Snapshot[], snaps: HoldingSnapshot[], accountIds: Set<number>, deposits: Record<number, number> = {}): YearStat[] {
  const closing = (d: string) => (d.slice(5) === '01-01' ? `${Number(d.slice(0, 4)) - 1}-12-31` : d);
  const rows = balances.filter(b => accountIds.has(b.account_id)).sort((a, b) => a.date.localeCompare(b.date)).map(b => ({ ...b, date: closing(b.date) }));
  if (!rows.length) return [];
  const accs = [...new Set(rows.map(r => r.account_id))];
  const per = new Map(accs.map(a => [a, rows.filter(r => r.account_id === a)]));
  const last = Number(rows[rows.length - 1].date.slice(0, 4)), first = Number(rows[0].date.slice(0, 4));
  const exact = snapshotYears(snaps, accountIds);
  const out: YearStat[] = [];
  for (let year = first; year <= last; year++) {
    const from = `${year}-01-01`, to = `${year}-12-31`;
    let start = 0, end = 0;
    for (const list of per.values()) {
      const inYear = list.filter(r => r.date >= from && r.date <= to);
      if (!inYear.length) { const carry = [...list].reverse().find(r => r.date < from); if (carry) { start += carry.balance; end += carry.balance; } continue; }
      const before = [...list].reverse().find(r => r.date < from);
      start += before ? before.balance : 0; end += inYear[inYear.length - 1].balance;
    }
    const days = new Set(rows.filter(r => r.date >= from && r.date <= to).map(r => r.date)).size;
    const ex = exact.get(year), growth = end - start;
    let profit: number | null = null, contributions: number | null = null, returnPct: number | null = null, isExact = false;
    if (ex && ex.days >= days * 0.8) { profit = ex.profit; contributions = growth - profit; returnPct = (ex.factor - 1) * 100; isExact = true; }
    else if (deposits[year] !== undefined) {
      contributions = deposits[year]; profit = growth - contributions;
      const base = start + contributions; returnPct = base > 0 ? (profit / base) * 100 : null;
    }
    out.push({ year, start, end, growth, growthPct: start ? (growth / start) * 100 : 0, profit, contributions, returnPct, days, partial: year === first || year === last, exact: isExact });
  }
  return out;
}
