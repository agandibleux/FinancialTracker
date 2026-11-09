import { sum } from './calc';
import type { AccountBalance, MonthSummary } from './types';

export interface EmergencyStatus {
  cash: number;            // balance of savings (CASH) accounts
  monthlyCost: number;     // average cost of living (fixed + utilities + everyday, no one-offs), last 3 months
  targetMonths: number;
  target: number;
  diff: number;            // cash - target (positive = over)
  monthsCovered: number;
  pct: number;             // cash / target * 100
  state: 'under' | 'on-target' | 'over' | 'unset';
}

/** Cost of living for a month: everything you must keep paying (fixed, utilities, everyday), without one-offs. */
const lifeCost = (m: MonthSummary) => m.expenses - (m.one_off ?? 0);

/** Emergency fund = savings accounts vs. N months of cost of living. ±5% of target counts as on target. */
export function emergencyStatus(months: MonthSummary[], accounts: AccountBalance[], targetMonths = 3): EmergencyStatus {
  const recent = months.filter(m => lifeCost(m) > 0).slice(-3);
  const monthlyCost = recent.length ? sum(recent.map(lifeCost)) / recent.length : 0;
  const cash = sum(accounts.filter(a => a.type === 'CASH').map(a => a.balance));
  const target = targetMonths * monthlyCost;
  const diff = cash - target;
  const state = target <= 0 ? 'unset' : Math.abs(diff) <= target * 0.05 ? 'on-target' : diff < 0 ? 'under' : 'over';
  return { cash, monthlyCost, targetMonths, target, diff, monthsCovered: monthlyCost > 0 ? cash / monthlyCost : 0, pct: target > 0 ? (cash / target) * 100 : 0, state };
}
