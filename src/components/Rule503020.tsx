import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, TriangleAlert } from 'lucide-react';
import { money } from '../lib/calc';
import { Card } from './ui';

export type Verdict = 'good' | 'near' | 'off';
export type EverydayAs = 'needs' | 'wants';
const KEY = 'rule-everyday-as';

/** Where a bucket stands against its target. Needs and wants are ceilings, savings is a floor. */
export function judge(pct: number, target: number, floor: boolean): Verdict {
  const diff = floor ? target - pct : pct - target; // positive = on the wrong side
  return diff <= 0 ? 'good' : diff <= 5 ? 'near' : 'off';
}
export const PILL: Record<Verdict, string> = { good: 'bg-emerald-50 text-emerald-700', near: 'bg-amber-50 text-amber-700', off: 'bg-rose-50 text-rose-700' };
const BAR: Record<Verdict, string> = { good: '#1f5c44', near: '#e3a21a', off: '#b4503a' };

/** "Everyday" spending counts as a need or a want: the choice is remembered on this device and shared by every 50/30/20 view. */
export function useEverydayAs(): [EverydayAs, (v: EverydayAs) => void] {
  const [v, set] = useState<EverydayAs>(() => (localStorage.getItem(KEY) === 'wants' ? 'wants' : 'needs'));
  return [v, (n: EverydayAs) => { set(n); localStorage.setItem(KEY, n); }];
}

/** One month's money split into the three buckets, as dollars and as % of income. */
export function bucket503020(m: { income: number; fixed: number; utility: number; variable: number; one_off?: number; saved: number }, everydayAs: EverydayAs) {
  const oneOff = m.one_off ?? 0, everyday = Math.max(0, m.variable - oneOff);
  const needs = m.fixed + m.utility + (everydayAs === 'needs' ? everyday : 0);
  const wants = oneOff + (everydayAs === 'wants' ? everyday : 0);
  const savings = Math.max(0, m.saved), inc = m.income || 1;
  const pct = { needs: (needs / inc) * 100, wants: (wants / inc) * 100, savings: (savings / inc) * 100 };
  return { needs, wants, savings, pct, verdict: { needs: judge(pct.needs, 50, false), wants: judge(pct.wants, 30, false), savings: judge(pct.savings, 20, true) } };
}

export function Rule503020({ income, fixed, utility, everyday, oneOff, saved, month, className = '', mode, seeMonths = false }: {
  seeMonths?: boolean; className?: string; mode?: [EverydayAs, (v: EverydayAs) => void]; income: number; fixed: number; utility: number; everyday: number; oneOff: number; saved: number; month: string;
}) {
  const own = useEverydayAs();
  const [everydayAs, pick] = mode ?? own;
  if (income <= 0) return null;

  const needs = fixed + utility + (everydayAs === 'needs' ? everyday : 0);
  const wants = oneOff + (everydayAs === 'wants' ? everyday : 0);
  const rows = [
    { key: 'Needs', hint: everydayAs === 'needs' ? 'Fixed costs, utilities, everyday' : 'Fixed costs, utilities', amount: needs, target: 50, floor: false },
    { key: 'Wants', hint: everydayAs === 'wants' ? 'Everyday and one-off spending' : 'One-off spending', amount: wants, target: 30, floor: false },
    { key: 'Savings', hint: 'Cash and investments', amount: Math.max(0, saved), target: 20, floor: true },
  ].map(r => {
    const pct = (r.amount / income) * 100, v = judge(pct, r.target, r.floor);
    const delta = r.amount - (r.target / 100) * income; // dollars vs the target line
    return { ...r, pct, v, delta };
  });

  const worst = rows.filter(r => r.v !== 'good').sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  const verdict = !worst
    ? `You hit 50/30/20 in ${month}. Needs, wants and savings are all inside their targets.`
    : worst.floor
      ? `Savings came in ${Math.abs(worst.delta) < 1 ? 'just under' : `${money(Math.abs(worst.delta), 0)} short of`} the 20% target.`
      : `${worst.key} ran ${money(worst.delta, 0)} over the ${worst.target}% target.`;
  const unplaced = income - needs - wants - Math.max(0, saved);

  return (
    <Card className={className} title="The 50/30/20 check" subtitle={`How ${month} split across needs, wants and savings`}
      right={<div className="inline-flex rounded-lg border border-slate-300 bg-[var(--card)] p-0.5 text-xs font-semibold" role="group" aria-label="Count everyday spending as">
        {(['needs', 'wants'] as const).map(v => (
          <button key={v} onClick={() => pick(v)} aria-pressed={everydayAs === v} className={`min-h-0 rounded-md px-2.5 py-1 capitalize ${everydayAs === v ? 'bg-[#10281f] text-[#f6f1e4]' : 'text-slate-500 hover:text-slate-800'}`}>Everyday: {v}</button>
        ))}
      </div>}>
      <p className="display mb-4 text-[22px] leading-tight text-slate-900 sm:text-[26px]">{verdict}</p>

      <ul className="grid gap-4 md:grid-cols-3 md:gap-5">
        {rows.map(r => (
          <li key={r.key} title={r.hint} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2"><b className="text-sm text-slate-900">{r.key}</b><span className="text-[11px] text-slate-400">{r.floor ? '≥' : '≤'} {r.target}% · {money((r.target / 100) * income, 0)}</span></div>
            <p className="tabular mt-1 flex items-baseline gap-2"><span className="display text-[30px] leading-none text-slate-900">{r.pct.toFixed(0)}%</span><span className="text-sm text-slate-500">{money(r.amount, 0)}</span></p>
            <div className="relative mt-2 h-2.5 rounded-full bg-slate-200/70">
              <div className="grow h-full rounded-full" style={{ width: `${Math.min(100, r.pct)}%`, background: BAR[r.v] }} />
              <span className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-slate-900 ring-2 ring-[var(--card)]" style={{ left: `${r.target}%` }} title={`Target ${r.target}%`} />
            </div>
            <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[r.v]}`}>
              {r.v === 'good' ? <Check size={12} /> : <TriangleAlert size={12} />}
              {r.v === 'good'
                ? (r.floor ? `${money(Math.abs(r.delta), 0)} above target` : `${money(Math.abs(r.delta), 0)} under target`)
                : (r.floor ? `${money(Math.abs(r.delta), 0)} short` : `${money(r.delta, 0)} over`)}
            </span>
          </li>
        ))}
      </ul>

      {Math.abs(unplaced) > income * 0.01 && (
        <p className="mt-4 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-500">
          {money(Math.abs(unplaced), 0)} of income {unplaced > 0 ? 'is not accounted for, so some savings may not be recorded yet.' : 'was spent beyond what you earned.'}
        </p>
      )}
      {seeMonths && <Link to="/budget" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700 hover:underline">Compare other months <ArrowRight size={14} /></Link>}
    </Card>
  );
}
