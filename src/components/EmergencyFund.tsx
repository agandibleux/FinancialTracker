import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { money } from '../lib/calc';
import type { EmergencyStatus } from '../lib/emergency';
import { Card, CountUp } from './ui';

const STATE = {
  under: { label: 'Under target', bar: '#f59e0b', chip: 'bg-amber-50 text-amber-700', verb: 'short' },
  'on-target': { label: 'On target', bar: '#10b981', chip: 'bg-emerald-50 text-emerald-700', verb: '' },
  over: { label: 'Over target', bar: '#3f6ba3', chip: 'bg-indigo-50 text-indigo-700', verb: 'above' },
  unset: { label: 'No target yet', bar: '#94a3b8', chip: 'bg-slate-100 text-slate-600', verb: '' },
} as const;

/** Savings accounts vs. the emergency target: a bar with a target marker, months of cover, and the over/under amount. */
export function EmergencyFund({ s, className = '' }: { s: EmergencyStatus; className?: string }) {
  const st = STATE[s.state];
  // scale: the bar's full width is 150% of target so the marker sits at 2/3 and "over" is visible
  const scale = Math.max(150, s.pct);
  const fill = Math.min(100, (s.pct / scale) * 100), mark = (100 / scale) * 100;
  const msg = s.state === 'unset' ? 'Enter a few months of spending to compute your target.'
    : s.state === 'on-target' ? 'Right where you want to be.'
    : s.state === 'under' ? `Build ${money(-s.diff, 0)} more before investing extra.`
    : `${money(s.diff, 0)} is free to move into TFSA, RRSP or FHSA.`;
  return (
    <Card className={className} title="Emergency fund" subtitle={`Savings accounts vs ${s.targetMonths} months of living costs (fixed + utilities + everyday)`}
      right={<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${st.chip}`}><ShieldCheck size={13} />{st.label}</span>}>
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div>
          <p className="display tabular num-lg text-slate-900"><CountUp value={s.cash} /></p>
          <p className="text-sm text-slate-500">in savings · target <b className="text-slate-700">{money(s.target, 0)}</b></p>
        </div>
        <div className="text-right">
          <p className="tabular text-2xl font-semibold tracking-tight" style={{ color: st.bar }}>
            {s.state === 'unset' ? '—' : s.state === 'on-target' ? '✓' : `${s.diff < 0 ? '−' : '+'}${money(Math.abs(s.diff), 0)}`}
          </p>
          <p className="text-sm text-slate-500">{s.state === 'under' || s.state === 'over' ? st.verb : ''}{s.state === 'on-target' ? 'on target' : ''}</p>
        </div>
      </div>

      <div className="relative mt-6 mb-7">
        <div className="h-3.5 overflow-hidden rounded-full bg-slate-100">
          <div className="grow h-full rounded-full transition-[width] duration-700" style={{ width: `${fill}%`, background: st.bar }} />
        </div>
        <div className="absolute -top-1.5 h-6 w-0.5 rounded bg-slate-800" style={{ left: `${mark}%` }} />
        <span className="absolute top-6 -translate-x-1/2 text-[11px] font-medium text-slate-500" style={{ left: `${mark}%` }}>Target</span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div><p className="text-xs text-slate-400">Months covered</p><p className="tabular text-lg font-semibold text-slate-900">{s.monthsCovered.toFixed(1)}<span className="text-sm font-normal text-slate-400"> / {s.targetMonths}</span></p></div>
        <div><p className="text-xs text-slate-400">Monthly cost</p><p className="tabular text-lg font-semibold text-slate-900">{money(s.monthlyCost, 0)}</p></div>
        <div><p className="text-xs text-slate-400">Funded</p><p className="tabular text-lg font-semibold text-slate-900">{Math.round(s.pct)}%</p></div>
      </div>
      <p className="mt-4 text-sm text-slate-600">{msg} <Link to="/settings" className="text-indigo-600 underline">change months</Link></p>
    </Card>
  );
}
