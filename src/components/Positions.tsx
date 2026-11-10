import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ExternalLink, TrendingDown, TrendingUp } from 'lucide-react';
import { money } from '../lib/calc';
import type { Row } from '../lib/portfolio';
import { googleUrl, yahooUrl } from '../lib/source';
import { COLORS } from './ui';

export type SortKey = keyof Row;
export type Sort = { k: SortKey; dir: 1 | -1 };

const pct = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
const tone = (n: number) => (n >= 0 ? 'text-emerald-600' : 'text-rose-600');
const SORTS: [SortKey, string][] = [['value', 'Value'], ['gain', 'Profit'], ['gainPct', 'Return'], ['dayPct', 'Today'], ['weight', 'Weight'], ['drift', 'Drift'], ['ticker', 'A–Z']];

/** How far a holding is from its ideal weight, in words a person would say. */
function driftNote(r: Row) {
  if (!r.target_pct) return null;
  if (Math.abs(r.drift) < 2) return { text: 'On target', cls: 'bg-emerald-50 text-emerald-700' };
  return r.drift > 0
    ? { text: `${r.drift.toFixed(1)} pts over`, cls: 'bg-amber-50 text-amber-700' }
    : { text: `${Math.abs(r.drift).toFixed(1)} pts under`, cls: 'bg-sky-50 text-sky-700' };
}

function Stat({ label, children, cls = '' }: { label: string; children: React.ReactNode; cls?: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p><p className={`tabular mt-0.5 text-sm font-medium text-slate-800 ${cls}`}>{children}</p></div>;
}

function PositionCard({ r, i, scale }: { r: Row; i: number; scale: number }) {
  const [open, setOpen] = useState(false);
  const c = COLORS[i % COLORS.length], note = driftNote(r), up = r.gain >= 0;
  const fill = Math.min(100, (r.weight / scale) * 100), mark = r.target_pct ? Math.min(100, (r.target_pct / scale) * 100) : null;
  return (
    <li className="lift rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.03)] sm:p-5">
      <div className="grid items-center gap-x-6 gap-y-4 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.3fr)_auto]">
        {/* who */}
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[13px] font-bold tracking-tight" style={{ background: `${c}1f`, color: c, boxShadow: `inset 0 0 0 1px ${c}33` }}>{r.ticker.slice(0, 3)}</span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 truncate text-[17px] font-semibold leading-tight tracking-tight text-slate-900" title={r.info}>{r.ticker}
              {r.sector && <span className="truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">{r.sector}</span>}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
              {r.yahoo_symbol ? <>
                <a className="hover:text-indigo-700 hover:underline" href={yahooUrl(r.yahoo_symbol)} target="_blank" rel="noreferrer" title={`Yahoo Finance · ${r.price_date || 'not refreshed yet'}`}>{r.yahoo_symbol}</a>
                <a className="hover:text-indigo-700" href={googleUrl(r.yahoo_symbol)} target="_blank" rel="noreferrer" title="Open in Google Finance" aria-label="Open in Google Finance"><ExternalLink size={11} /></a>
              </> : 'Manual price'}
            </p>
          </div>
          {/* value stays top-right on phones; on desktop it moves to the last column */}
          <div className="text-right md:hidden">
            <p className="tabular text-lg font-semibold tracking-tight text-slate-900">{money(r.value)}</p>
            <p className={`tabular text-xs font-semibold ${tone(r.gain)}`}>{pct(r.gainPct)}</p>
          </div>
        </div>

        {/* weight vs ideal */}
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
            <span className="tabular font-medium text-slate-700">{r.weight.toFixed(1)}% <span className="font-normal text-slate-400">of portfolio{r.target_pct ? ` · ideal ${r.target_pct}%` : ''}</span></span>
            {note && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${note.cls}`}>{note.text}</span>}
          </div>
          <div className="relative h-2.5 rounded-full bg-slate-100">
            <div className="grow h-full rounded-full" style={{ width: `${fill}%`, background: `linear-gradient(90deg, ${c}aa, ${c})` }} />
            {mark !== null && <span className="absolute -top-1 h-[18px] w-[3px] -translate-x-1/2 rounded-full bg-slate-800 ring-2 ring-white" style={{ left: `${mark}%` }} title={`Ideal ${r.target_pct}%`} />}
          </div>
        </div>

        {/* money (desktop) */}
        <div className="hidden items-center gap-6 md:flex">
          <div className="text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Today</p>
            <p className={`tabular mt-0.5 text-sm font-semibold ${r.prev_close ? tone(r.dayChange) : 'text-slate-400'}`}>{r.prev_close ? pct(r.dayPct) : '–'}</p></div>
          <div className="min-w-[7.5rem] text-right"><p className="tabular text-lg font-semibold tracking-tight text-slate-900">{money(r.value)}</p>
            <p className={`tabular inline-flex items-center gap-1 text-xs font-semibold ${tone(r.gain)}`}>{up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{money(r.gain)} · {pct(r.gainPct)}</p></div>
        </div>
      </div>

      {/* phone: day + profit pills under the bar */}
      <div className="mt-3 flex flex-wrap items-center gap-2 md:hidden">
        <span className={`tabular inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{money(r.gain)} profit</span>
        {r.prev_close > 0 && <span className={`tabular rounded-full px-2.5 py-1 text-xs font-semibold ${r.dayChange >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{money(r.dayChange)} today</span>}
      </div>

      <button onClick={() => setOpen(o => !o)} aria-expanded={open} className="mt-3 inline-flex min-h-0 items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800">
        {open ? 'Hide details' : 'Details'}<ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <dl className="mt-3 grid grid-cols-3 gap-x-4 gap-y-3 border-t border-slate-100 pt-3 sm:grid-cols-6">
          <Stat label="Shares">{r.shares}</Stat>
          <Stat label="Avg cost">{r.avg_price.toFixed(2)}</Stat>
          <Stat label="Price">{r.price.toFixed(2)}</Stat>
          <Stat label="Yield">{r.yield_pct.toFixed(2)}%</Stat>
          <Stat label="MER">{r.expense_ratio ? `${r.expense_ratio}%` : '–'}</Stat>
          <Stat label="Cost basis">{money(r.cost)}</Stat>
        </dl>
      )}
    </li>
  );
}

export function Positions({ rows, sort, setSort, totals }: { rows: Row[]; sort: Sort; setSort: (s: Sort) => void; totals: { value: number; cost: number; day: number } }) {
  const scale = Math.max(10, ...rows.map(r => Math.max(r.weight, r.target_pct))) * 1.1;
  const profit = totals.value - totals.cost;
  return (
    <div>
      <div className="fade-x -mx-1 mb-3 overflow-x-auto px-1"><div className="flex w-max items-center gap-1.5 pb-1">
        <span className="mr-1 text-xs font-medium text-slate-400">Sort</span>
        {SORTS.map(([k, label]) => {
          const on = sort.k === k;
          return (
            <button key={k} onClick={() => setSort({ k, dir: on ? (-sort.dir as 1 | -1) : k === 'ticker' ? 1 : -1 })}
              className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
              {label}{on && (sort.dir < 0 ? <ArrowDown size={12} /> : <ArrowUp size={12} />)}
            </button>
          );
        })}
      </div></div>

      <ul className="space-y-3">{rows.map((r, i) => <PositionCard key={r.id ?? r.ticker} r={r} i={i} scale={scale} />)}</ul>

      <div className="mt-3 grid grid-cols-3 gap-3 rounded-2xl p-4 text-white sm:p-5" style={{ background: 'linear-gradient(135deg,#16294a,#0e1a2e)' }}>
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/60">Total value</p><p className="tabular mt-1 truncate text-base font-semibold sm:text-xl">{money(totals.value)}</p></div>
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/60">Profit</p><p className={`tabular mt-1 truncate text-base font-semibold sm:text-xl ${profit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(profit)}{totals.cost ? <span className="ml-1.5 text-xs font-medium opacity-80">{pct((profit / totals.cost) * 100)}</span> : null}</p></div>
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/60">Today</p><p className={`tabular mt-1 truncate text-base font-semibold sm:text-xl ${totals.day >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{money(totals.day)}</p></div>
      </div>
    </div>
  );
}
