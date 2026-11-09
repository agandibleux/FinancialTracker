import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight } from 'lucide-react';
import { useAccounts, useHoldings } from '../api';
import { apiFetch } from '../local/routes';
import { googleUrl as gUrl, yahooUrl } from '../lib/source';
import { Card, COLORS, EmptyState, GRID, PageHeader, Tabs } from '../components/ui';

interface Series { ticker: string; symbol: string; name: string; currency: string; points: { t: number; c: number }[]; error?: boolean }
const RANGES = ['1M', '6M', 'YTD', '1Y', '5Y', 'MAX'] as const;
type Range = (typeof RANGES)[number];

const googleUrl = (s: Series) => gUrl(s.symbol);
const fmtDate = (t: number, range: Range) =>
  new Date(t).toLocaleDateString('en-CA', range === '5Y' || range === 'MAX' ? { year: 'numeric', month: 'short' } : { month: 'short', day: 'numeric' });
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

function Tip({ active, payload, range, digits }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-500">{new Date(p.t).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
      {payload.map((x: any) => <p key={x.dataKey} className="tabular font-semibold text-slate-900">{x.name ? `${x.name} ` : ''}{digits === 'pct' ? pct(x.value) : x.value.toFixed(2)}</p>)}
      <span className="hidden">{range}</span>
    </div>
  );
}

function TickerCard({ s, range }: { s: Series; range: Range }) {
  const first = s.points[0]?.c, last = s.points.at(-1)?.c;
  const change = first && last ? ((last - first) / first) * 100 : 0, up = change >= 0;
  const color = up ? '#059669' : '#e11d48', id = `g-${s.ticker.replace(/\W/g, '')}`;
  const lo = Math.min(...s.points.map(p => p.c)), hi = Math.max(...s.points.map(p => p.c));
  return (
    <div className="group lift cq rounded-3xl border border-slate-200/70 bg-white/95 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold tracking-tight text-slate-900">{s.ticker}</p>
          <p className="truncate text-xs text-slate-500" title={s.name}>{s.name}</p>
        </div>
        <a href={googleUrl(s)} target="_blank" rel="noreferrer" title="Open in Google Finance"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-indigo-700"><ArrowUpRight size={16} /></a>
      </div>
      <div className="mt-3 flex items-baseline gap-3">
        <span className="tabular num-xl font-bold tracking-tight text-slate-900">{last ? last.toFixed(2) : '–'}</span>
        <span className={`tabular text-sm font-semibold ${up ? 'text-emerald-600' : 'text-rose-600'}`}>{pct(change)}</span>
      </div>
      <div className="mt-2 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={s.points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
            <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.22} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs>
            <XAxis dataKey="t" hide /><YAxis domain={['dataMin', 'dataMax']} hide />
            <Tooltip content={<Tip range={range} />} cursor={{ stroke: '#cbd5e1' }} />
            <Area type="monotone" dataKey="c" name="" stroke={color} strokeWidth={2} fill={`url(#${id})`} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="tabular mt-2 flex justify-between text-[11px] text-slate-400"><span>Low {lo.toFixed(2)}</span><span>High {hi.toFixed(2)}</span></div>
      <p className="mt-3 border-t border-slate-100 pt-2.5 text-[11px] text-slate-400">Source: <a className="font-medium text-slate-500 hover:text-indigo-700 hover:underline" href={yahooUrl(s.symbol)} target="_blank" rel="noreferrer">Yahoo Finance · {s.symbol}</a> · daily close, {s.currency || 'CAD'}</p>
    </div>
  );
}

export default function Charts() {
  const holdings = useHoldings().data ?? [];
  const [range, setRange] = useState<Range>('1Y');
  const [onlyOwned, setOnlyOwned] = useState(true);
  const accounts = useAccounts().data ?? [];
  const [picked, setPicked] = useState<number[]>([]); // empty = every account
  const { data, isLoading, isError } = useQuery({
    queryKey: ['history', range], staleTime: 5 * 60_000,
    queryFn: async () => (await apiFetch(`/api/history?range=${range}`)).json() as Promise<Series[]>,
  });

  /** accounts that actually hold tickers, with how many */
  const sources = useMemo(() => accounts
    .map(a => ({ id: a.id, name: a.name, n: new Set(holdings.filter(h => h.account_id === a.id).map(h => h.ticker)).size }))
    .filter(a => a.n > 0), [accounts, holdings]);
  const shown = useMemo(() => {
    const pool = holdings.filter(h => (!picked.length || picked.includes(h.account_id)) && (!onlyOwned || h.shares > 0));
    return new Set(pool.map(h => h.ticker));
  }, [holdings, picked, onlyOwned]);
  const series = useMemo(() => (data ?? []).filter(s => !s.error && s.points.length > 1 && shown.has(s.ticker)), [data, shown]);
  const toggle = (id: number) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const failed = (data ?? []).filter(s => s.error).map(s => s.ticker);

  // every series rebased to 0% at the start of the range, so funds of any price compare
  const compare = useMemo(() => {
    const byT = new Map<number, Record<string, number>>();
    for (const s of series) {
      const base = s.points[0].c;
      for (const p of s.points) {
        const day = Math.round(p.t / 864e5) * 864e5, row = byT.get(day) ?? { t: day };
        row[s.ticker] = ((p.c - base) / base) * 100; byT.set(day, row);
      }
    }
    return [...byT.values()].sort((a, b) => a.t - b.t);
  }, [series]);

  if (!holdings.length) return <EmptyState title="No tickers yet" text="Add holdings on the ETF portfolio page first." />;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Charts" subtitle="Price history of every ticker you hold. Prices from Yahoo Finance; the arrow opens the same ticker on Google Finance."
        actions={<>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={onlyOwned} onChange={e => setOnlyOwned(e.target.checked)} />Only tickers I own</label>
          <Tabs tabs={RANGES.map(r => ({ id: r, label: r }))} value={range} onChange={setRange} />
        </>} />

      {sources.length > 1 && (
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by account">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Account</span>
          {[{ id: 0, name: 'All', n: 0 }, ...sources].map(a => {
            const on = a.id === 0 ? picked.length === 0 : picked.includes(a.id);
            return (
              <button key={a.id} aria-pressed={on} onClick={() => (a.id === 0 ? setPicked([]) : toggle(a.id))}
                className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition ${on ? 'border-transparent bg-gradient-to-r from-indigo-600 to-teal-500 text-white shadow-md shadow-indigo-500/25' : 'border-slate-200 bg-white/80 text-slate-600 hover:-translate-y-px hover:border-indigo-300 hover:text-indigo-700'}`}>
                {a.name}{a.id !== 0 && <span className={`rounded-full px-1.5 text-xs ${on ? 'bg-white/25' : 'bg-slate-100 text-slate-500'}`}>{a.n}</span>}
              </button>
            );
          })}
        </div>
      )}

      {isLoading && <p className="text-sm text-slate-500">Loading price history…</p>}
      {isError && <EmptyState title="Could not load prices" text="Check your internet connection and the API server, then reload." />}

      {series.length === 0 && !isLoading && !isError && <EmptyState title="Nothing to chart" text="No tickers match this account filter." />}

      {series.length > 0 && (
        <Card title="Compared" subtitle={`Change since the start of the range (${range}), every ticker starting at 0%.`}>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={compare} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} stroke="#94a3b8" fontSize={11} tickFormatter={t => fmtDate(t, range)} minTickGap={48} />
              <YAxis stroke="#94a3b8" fontSize={11} unit="%" width={48} />
              <Tooltip content={({ active, payload }: any) => !active || !payload?.length ? null : (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-xl">
                  <p className="mb-1 text-slate-500">{new Date(payload[0].payload.t).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
                  {[...payload].sort((a: any, b: any) => b.value - a.value).map((x: any) => (
                    <p key={x.dataKey} className="tabular flex items-center gap-2 text-slate-600"><i className="h-2 w-2 rounded-full" style={{ background: x.color }} />{x.dataKey}<b className="ml-auto pl-4 text-slate-900">{pct(x.value)}</b></p>
                  ))}
                </div>)} />
              {series.map((s, i) => <Line key={s.ticker} type="monotone" dataKey={s.ticker} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {series.map((s, i) => <li key={s.ticker} className="flex items-center gap-2 text-slate-600"><i className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{s.ticker}</li>)}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {series.map(s => <TickerCard key={s.ticker} s={s} range={range} />)}
      </div>
      {failed.length > 0 && <p className="text-sm text-slate-500">No quote data for {failed.join(', ')}. Set the Yahoo symbol in ETF portfolio → Edit holdings.</p>}
      <p className="text-xs text-slate-400">Mutual fund NAVs update daily but are not charted.</p>
    </div>
  );
}
