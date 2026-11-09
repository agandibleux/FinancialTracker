import type { AccountType, Ratio } from './types';

export interface AllocationInput {
  amount: number;
  emergencyTarget: number;
  cashBalance: number;
  ratios: Ratio[];
  /** remaining contribution room per account (registered accounts only; omit = unlimited) */
  roomLeft: Partial<Record<AccountType, number>>;
}
export interface AllocationResult {
  lines: { account: AccountType; amount: number; reason: string }[];
  unallocated: number;
}

/**
 * 1) top up the emergency fund (cash) to its target,
 * 2) split the remainder by ratio, capping at remaining room,
 * 3) redistribute overflow to accounts that still have room (in ratio order).
 */
export function allocate(inp: AllocationInput): AllocationResult {
  const lines: AllocationResult['lines'] = [];
  let left = Math.max(0, inp.amount);

  const gap = Math.max(0, inp.emergencyTarget - inp.cashBalance);
  const toEmergency = Math.min(left, gap);
  if (toEmergency > 0) {
    lines.push({ account: 'CASH', amount: toEmergency, reason: 'Emergency fund top-up' });
    left -= toEmergency;
  }

  const alloc = new Map<AccountType, number>();
  const room = (a: AccountType) => inp.roomLeft[a] ?? Infinity;
  const ratios = inp.ratios.filter(r => r.pct > 0 && r.account !== 'CASH');
  let pool = left;
  let active = [...ratios];
  for (let guard = 0; guard < 10 && pool > 0.005 && active.length; guard++) {
    const totalPct = active.reduce((a, r) => a + r.pct, 0);
    let spent = 0;
    const next: Ratio[] = [];
    for (const r of active) {
      const share = pool * (r.pct / totalPct);
      const cap = room(r.account) - (alloc.get(r.account) ?? 0);
      const put = Math.min(share, cap);
      if (put > 0) { alloc.set(r.account, (alloc.get(r.account) ?? 0) + put); spent += put; }
      if (cap - put > 0.005) next.push(r);
    }
    pool -= spent;
    active = next;
  }
  for (const r of ratios) {
    const v = alloc.get(r.account);
    if (v && v > 0) lines.push({ account: r.account, amount: v, reason: `${r.pct}% target ratio` });
  }
  return { lines, unallocated: Math.max(0, pool) };
}

export interface RoomRowIn { key: string; account: AccountType; room: number; contributed: number }
export interface RoomRowOut extends RoomRowIn {
  remaining: number; fromSavings: number; fromMonthly: number; perMonth: number; shortfall: number; over: number;
  status: 'maxed' | 'on-track' | 'short';
}
export interface RoomPlan {
  rows: RoomRowOut[];
  needed: number; fundedBySavings: number; fundedByMonthly: number; gap: number; extraPerMonth: number; perMonth: number;
  pctFilled: number;
  advice: { tone: 'good' | 'action' | 'warn'; text: string }[];
}

/**
 * Plan how to max out registered room over the remaining months:
 * 1) lump sum from savings above the emergency fund, highest-priority account first,
 * 2) the rest spread evenly over the months left from the monthly surplus,
 * 3) anything still uncovered is the shortfall (and the extra monthly amount that would close it).
 */
export function planRoom(inp: { rows: RoomRowIn[]; monthsLeft: number; monthlySurplus: number; excessCash: number; priority: AccountType[] }): RoomPlan {
  const months = Math.max(1, inp.monthsLeft);
  const rank = (a: AccountType) => { const i = inp.priority.indexOf(a); return i < 0 ? 99 : i; };
  const base = inp.rows.map(r => ({ ...r, remaining: Math.max(0, r.room - r.contributed), over: Math.max(0, r.contributed - r.room) }));
  let cash = Math.max(0, inp.excessCash);
  const lump = new Map<string, number>();
  for (const r of [...base].sort((a, b) => rank(a.account) - rank(b.account))) {
    const put = Math.min(cash, r.remaining);
    lump.set(r.key, put); cash -= put;
  }
  let monthly = Math.max(0, inp.monthlySurplus) * months;
  const monthlyBy = new Map<string, number>();
  for (const r of [...base].sort((a, b) => rank(a.account) - rank(b.account))) {
    const need = r.remaining - (lump.get(r.key) ?? 0);
    const put = Math.min(monthly, need);
    monthlyBy.set(r.key, put); monthly -= put;
  }
  const rows: RoomRowOut[] = base.map(r => {
    const fromSavings = lump.get(r.key) ?? 0, fromMonthly = monthlyBy.get(r.key) ?? 0;
    const shortfall = Math.max(0, r.remaining - fromSavings - fromMonthly);
    return { ...r, fromSavings, fromMonthly, perMonth: fromMonthly / months, shortfall,
      status: r.remaining <= 0.005 ? 'maxed' : shortfall > 0.005 ? 'short' : 'on-track' };
  });
  const needed = rows.reduce((a, r) => a + r.remaining, 0);
  const fundedBySavings = rows.reduce((a, r) => a + r.fromSavings, 0);
  const fundedByMonthly = rows.reduce((a, r) => a + r.fromMonthly, 0);
  const gap = rows.reduce((a, r) => a + r.shortfall, 0);
  const totalRoom = rows.reduce((a, r) => a + r.room, 0);
  const done = rows.reduce((a, r) => a + Math.min(r.room, r.contributed), 0);
  const plan: RoomPlan = {
    rows, needed, fundedBySavings, fundedByMonthly, gap, extraPerMonth: gap / months, perMonth: fundedByMonthly / months,
    pctFilled: totalRoom > 0 ? (done / totalRoom) * 100 : 0, advice: [],
  };
  const f = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`;
  const names = (xs: RoomRowOut[]) => xs.map(r => r.key.replace('|', ' ')).join(', ');
  for (const r of rows) if (r.over > 0.005) plan.advice.push({ tone: 'warn', text: `${r.key.replace('|', ' ')} is over its room by ${f(r.over)} — withdraw the excess to avoid CRA penalties.` });
  if (needed <= 0.005) { plan.advice.push({ tone: 'good', text: 'All your room is used. Nothing to do.' }); return plan; }
  if (fundedBySavings > 0.5) plan.advice.push({ tone: 'action', text: `Move ${f(fundedBySavings)} from savings now into ${names(rows.filter(r => r.fromSavings > 0.5))}. Your emergency fund stays intact.` });
  if (plan.perMonth > 0.5) plan.advice.push({ tone: 'action', text: `Set up an automatic ${f(plan.perMonth)}/month transfer for the next ${months} month${months > 1 ? 's' : ''} (${names(rows.filter(r => r.fromMonthly > 0.5))}).` });
  if (gap > 0.5) plan.advice.push({ tone: 'warn', text: `${f(gap)} of room can't be filled from your current surplus. Add ${f(plan.extraPerMonth)}/month, trim spending, or accept leaving ${names(rows.filter(r => r.shortfall > 0.5))} partly unused (check carry-forward in CRA My Account).` });
  else plan.advice.push({ tone: 'good', text: 'At this pace every account is maxed by December.' });
  return plan;
}

/** Jan-1 planner: what to put in each registered account on Jan 1 and the monthly set-aside. */
export function jan1Plan(roomLeft: number, wantedPct = 100, monthsUntil = 12) {
  const target = Math.max(0, roomLeft * (wantedPct / 100));
  return { target, monthly: monthsUntil > 0 ? target / monthsUntil : target };
}
