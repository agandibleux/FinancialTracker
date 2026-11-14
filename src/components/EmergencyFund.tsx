import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { money } from '../lib/calc';
import type { EmergencyStatus } from '../lib/emergency';
import { Card, CountUp } from './ui';

const STATE = {
  under: { label: 'Under target', bar: '#e3a21a', chip: 'bg-amber-50 text-amber-700', verb: 'short' },
  'on-target': { label: 'On target', bar: '#1f5c44', chip: 'bg-emerald-50 text-emerald-700', verb: '' },
  over: { label: 'Over target', bar: '#2b7a8c', chip: 'bg-indigo-50 text-indigo-700', verb: 'above' },
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
    <Card className={className} title="Emergency fund" subtitle={`vs ${s.targetMonths} months of living costs`}
      right={<span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${st.chip}`}><ShieldCheck size={13} />{st.label}</span>}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="display tabular num-lg text-slate-900"><CountUp value={s.cash} /></p>
          <p className="text-xs text-slate-500">in savings · target <b className="text-slate-700">{money(s.target, 0)}</b></p>
        </div>
        <p className="tabular shrink-0 text-xl font-semibold tracking-tight" style={{ color: st.bar }}>
          {s.state === 'unset' ? '—' : s.state === 'on-target' ? '✓' : `${s.diff < 0 ? '−' : '+'}${money(Math.abs(s.diff), 0)}`}
        </p>
      </div>
      <div className="relative mt-4 mb-1">
        <div className="h-3 overflow-hidden rounded-full bg-slate-200/70">
          <div className="grow h-full rounded-full transition-[width] duration-700" style={{ width: `${fill}%`, background: st.bar }} />
        </div>
        <div className="absolute -top-1 h-5 w-[3px] -translate-x-1/2 rounded-full bg-slate-900 ring-2 ring-[var(--card)]" style={{ left: `${mark}%` }} title="Target" />
      </div>
      <p className="tabular mt-3 text-xs text-slate-500"><b className="text-slate-800">{s.monthsCovered.toFixed(1)}</b> of {s.targetMonths} months · {money(s.monthlyCost, 0)}/mo · {Math.round(s.pct)}% funded</p>
      <p className="mt-1.5 text-xs text-slate-600">{msg} <Link to="/settings" className="text-indigo-600 underline">change months</Link></p>
    </Card>
  );
}
