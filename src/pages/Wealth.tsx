import { useEffect, useMemo, useState } from 'react';
import { Area, Bar, BarChart, ReferenceLine, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDelete, useSave, useWealth, useAccounts, useMonths } from '../api';
import { money, sum } from '../lib/calc';
import { buildProjection } from '../lib/projection';
import { isInvested, type WealthYear } from '../lib/types';
import { Card, ChartTooltip, Kpi, MoneyInput, NumInput, PageHeader, btnCls, btnGhost, CrossTable, GRID, inputCls } from '../components/ui';

const C_PATH = '#2a78d6', C_PLAN = '#898781', C_ACTUAL = '#eb6834';
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}
const compact = (v: number) => v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : `$${Math.round(v / 1000)}k`;

export default function Wealth() {
  const saved = useWealth().data ?? [];
  const accounts = useAccounts().data ?? [];
  const months = useMonths().data ?? [];
  const save = useSave<WealthYear[]>('PUT', '/api/wealth');
  const del = useDelete(y => `/api/wealth/${y}`);
  const mobile = useIsMobile();
  const [rows, setRows] = useState<WealthYear[]>([]);
  const [horizon, setHorizon] = useState(30);
  useEffect(() => setRows(saved), [JSON.stringify(saved)]);

  const invested = sum(accounts.filter(a => isInvested(a.type)).map(a => a.balance));
  const now = new Date();
  const thisYear = now.getFullYear();
  // Today's real net worth anchors the current year: the rest of the year grows from it.
  const monthsLeft = (Date.UTC(thisYear + 1, 0, 1) - Date.UTC(thisYear, now.getMonth(), now.getDate())) / 864e5 / 365 * 12;
  const anchor = invested > 0 ? { year: thisYear, value: invested, monthsLeft } : undefined;
  const proj = useMemo(() => buildProjection(rows, horizon, anchor), [rows, horizon, invested, monthsLeft]);
  const avgSavings = months.length ? sum(months.slice(-12).map(m => m.actual ?? m.predicted)) / Math.min(12, months.length) : 0;
  const cur = proj.find(p => p.year === thisYear) ?? proj[0];

  // Savings actually put aside, from the monthly entries that have a savings split.
  const saved12 = months.filter(m => m.actual != null);
  const byYear = [...new Set(saved12.map(m => m.year))].map(y => {
    const ms = saved12.filter(m => m.year === y);
    const inv = sum(ms.map(m => m.to_investments)), cash = sum(ms.map(m => m.to_cash));
    return { year: y, months: ms.length, inv, cash, total: inv + cash };
  });
  const nSaved = saved12.length || 1;
  const avgMonthInv = sum(saved12.map(m => m.to_investments)) / nSaved;
  const avgMonthCash = sum(saved12.map(m => m.to_cash)) / nSaved;
  const avgYear = { inv: avgMonthInv * 12, cash: avgMonthCash * 12, total: (avgMonthInv + avgMonthCash) * 12 };
  const monthly = saved12.slice(-12).map(m => ({ name: `${m.year}-${String(m.month).padStart(2, '0')}`, Investments: Math.round(m.to_investments), 'Savings account': Math.round(m.to_cash) }));
  const lastMonth = saved12[saved12.length - 1];
  const applyAvg = () => {
    const c = Math.round(avgMonthInv);
    setRows(rs => rs.map(r => r.actual_end == null ? { ...r, monthly_contribution: c } : r));
  };

  const set = (year: number, patch: Partial<WealthYear>) => setRows(rs => rs.map(r => r.year === year ? { ...r, ...patch } : r));
  const removeYear = (year: number) => {
    const idx = rows.findIndex(r => r.year === year);
    const nextRows = rows.filter(r => r.year !== year);
    // Removing the first year: the new first year keeps the wealth it would have started with.
    if (idx === 0 && nextRows[0]) nextRows[0] = { ...nextRows[0], start_wealth: proj.find(p => p.year === nextRows[0].year)?.start ?? nextRows[0].start_wealth };
    setRows(nextRows);
    if (saved.some(r => r.year === year)) del.mutate(year);
  };
  const addYear = () => {
    const last = rows[rows.length - 1];
    const year = last ? last.year + 1 : thisYear;
    const prev = proj.find(p => p.year === year - 1);
    setRows(rs => [...rs, { year, start_wealth: prev?.end ?? invested, return_pct: last?.return_pct ?? 6, monthly_contribution: Math.round(avgMonthInv), actual_end: null }]);
  };

  /** Fill a 30-year plan at 8%: keeps years with actuals, resets the rest to 8%. Later actuals re-base the following years. */
  const generate30 = () => {
    const first = rows[0]?.year ?? thisYear;
    const contrib = Math.round(avgMonthInv);
    const byYear = new Map(rows.map(r => [r.year, r]));
    const next: WealthYear[] = [];
    for (let y = first; y < first + 30; y++) {
      const r = byYear.get(y);
      if (r) next.push(r.actual_end != null ? r : { ...r, return_pct: 8 });
      else next.push({ year: y, start_wealth: 0, return_pct: 8, monthly_contribution: contrib, actual_end: null });
    }
    next[0] = { ...next[0], start_wealth: rows[0]?.start_wealth ?? invested };
    setRows(next);
    setHorizon(30);
  };

  const chart = proj.map(p => ({ name: String(p.year), 'Original plan': Math.round(p.projectedEnd), Actual: p.actualEnd == null ? null : Math.round(p.actualEnd), 'Wealth path': Math.round(p.end), 'Today (actual)': p.asOf == null ? null : Math.round(p.asOf) }));
  const at = (n: number) => proj[n - 1];
  const first = proj[0], last = proj[proj.length - 1];
  const contributed = rows.length && proj.length ? proj.reduce((t, p) => t + (rows.filter(r => r.year <= p.year).slice(-1)[0]?.monthly_contribution ?? 0) * 12, 0) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Wealth projection" subtitle="Plan with a yearly return, then replace each year with your real result."
        actions={<button className={btnCls} onClick={() => save.mutate(rows)} disabled={save.isPending}>Save</button>} />

      <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Investments today" value={money(invested)} hint="Real balance · cash & house excluded" tone="green" />
        <Kpi label={`End of ${cur?.year ?? '—'}`} value={cur ? money(cur.end) : '—'} hint={cur?.isActual ? 'actual' : cur?.asOf != null ? 'forecast from today\'s real balance' : 'projected'} tone="blue" />
        <Kpi label="In 10 years" value={at(10) ? money(at(10).end) : '—'} tone="violet" />
        <Kpi label="In 30 years" value={at(30) ? money(at(30).end) : '—'} hint="Generate plan to see" tone="violet" />
        <Kpi label="Avg monthly savings" value={money(avgSavings)} hint="Last 12 months" tone="amber" />
      </div>

      <Card title="Projection" subtitle="Orange bars = your real result for closed years. The blue path re-bases on each actual; grey shows the original plan."
        right={<label className="flex items-center gap-2 text-xs text-slate-500">Horizon <select className={`${inputCls} !w-auto`} value={horizon} onChange={e => setHorizon(Number(e.target.value))}>{[10, 15, 20, 25, 30, 40].map(n => <option key={n}>{n}</option>)}</select> yrs</label>}>
        {last && first && (
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 sm:mb-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Projected wealth in {last.year}</p>
              <p className="mt-1 bg-gradient-to-br from-[#0b0b0b] via-[#1c5cab] to-[#2a78d6] bg-clip-text text-[2.6rem] leading-none font-semibold tracking-tight text-transparent sm:text-6xl">{money(last.end)}</p>
              <p className="mt-1 text-sm text-slate-500">{first.start > 0 ? `${(last.end / first.start).toFixed(1)}× your starting ${money(first.start)} · ` : ''}{money(last.end - first.start - contributed)} from growth</p>
            </div>
            <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-slate-50 px-4 py-3 text-[11px] text-slate-600 ring-1 ring-slate-200/70 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1 sm:rounded-full sm:py-2 sm:text-xs">
              <span className="flex items-center gap-2"><i className="inline-block h-0.5 w-4 rounded" style={{ background: C_PATH }} />Wealth path</span>
              <span className="flex items-center gap-2"><i className="inline-block h-0.5 w-4 rounded" style={{ background: C_PLAN }} />Original plan</span>
              <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-[3px]" style={{ background: C_ACTUAL }} />Actual year-end</span>
              <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-slate-300" style={{ background: '#0b0b0b' }} />Today (real balance)</span>
            </div>
          </div>
        )}
        <ResponsiveContainer width="100%" height={mobile ? 300 : 380}>
          <ComposedChart data={chart} margin={{ top: mobile ? 28 : 16, right: mobile ? 44 : 72, bottom: 0, left: mobile ? -4 : 0 }}>
            <defs>
              <linearGradient id="gPath" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C_PATH} stopOpacity={0.32} /><stop offset="70%" stopColor={C_PATH} stopOpacity={0.06} /><stop offset="100%" stopColor={C_PATH} stopOpacity={0} /></linearGradient>
              <linearGradient id="gStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#5598e7" /><stop offset="100%" stopColor="#184f95" /></linearGradient>
              <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f58a5c" /><stop offset="100%" stopColor={C_ACTUAL} /></linearGradient>
              <filter id="glow" x="-10%" y="-30%" width="120%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="5" floodColor={C_PATH} floodOpacity="0.35" /></filter>
            </defs>
            <CartesianGrid stroke="#e1e0d9" strokeDasharray="0" vertical={false} strokeOpacity={0.7} />
            {cur && <ReferenceLine x={String(cur.year)} stroke="#c3c2b7" strokeDasharray="3 4" label={{ value: mobile ? 'Real balance' : 'Real balance, not a forecast →', position: 'insideTopLeft', fill: '#898781', fontSize: 11, dy: -12 }} />}
            <XAxis dataKey="name" stroke="none" tick={{ fill: '#898781', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#c3c2b7' }} interval={mobile ? Math.max(0, Math.ceil(chart.length / 6) - 1) : chart.length > 20 ? 1 : 0} tickMargin={8} />
            <YAxis stroke="none" tick={{ fill: '#898781', fontSize: 11 }} tickLine={false} axisLine={false} width={mobile ? 44 : 56} tickFormatter={compact} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: C_PATH, strokeOpacity: 0.35, strokeWidth: 1 }} wrapperStyle={{ outline: 'none' }} />
            <Bar dataKey="Actual" fill="url(#gBar)" maxBarSize={24} radius={[4, 4, 0, 0]} />
            <Line dataKey="Today (actual)" stroke="none" isAnimationActive={false} activeDot={false}
              dot={(d: any) => d.value == null ? <g key={d.index} /> : <g key="today"><circle cx={d.cx} cy={d.cy} r={9} fill="#0b0b0b" fillOpacity={0.12} /><circle cx={d.cx} cy={d.cy} r={5.5} fill="#0b0b0b" stroke="#fff" strokeWidth={2.5} /><text x={d.cx} y={d.cy - 16} textAnchor="middle" fontSize={11} fontWeight={600} fill="#0b0b0b">{mobile ? compact(d.value) : `Today · ${compact(d.value)} actual`}</text></g>} />
            <Line dataKey="Original plan" stroke={C_PLAN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} activeDot={false} />
            <Area dataKey="Wealth path" type="monotone" stroke="url(#gStroke)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="url(#gPath)" style={{ filter: 'url(#glow)' }} animationDuration={900}
              activeDot={{ r: 4, fill: C_PATH, stroke: '#fcfcfb', strokeWidth: 2 }}
              dot={(d: any) => d.index === chart.length - 1
                ? <g key="end"><circle cx={d.cx} cy={d.cy} r={11} fill={C_PATH} fillOpacity={0.15} /><circle cx={d.cx} cy={d.cy} r={5} fill={C_PATH} stroke="#fff" strokeWidth={2.5} /><text x={d.cx + 9} y={d.cy + 4} fontSize={mobile ? 11 : 12} fontWeight={600} fill="#0b0b0b">{compact(d.value)}</text></g>
                : <g key={d.index} />} />
          </ComposedChart>
        </ResponsiveContainer>
      </Card>

      <Card title="Your savings" subtitle="What you actually put aside each month, split between investments and your savings account. Averages feed the projection below.">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Average per year</p>
              <p className="mt-1 bg-gradient-to-br from-[#0b0b0b] to-[#1c5cab] bg-clip-text text-[2.4rem] font-semibold leading-none tracking-tight text-transparent sm:text-5xl">{money(avgYear.total)}</p>
              <p className="mt-1 text-sm text-slate-500">{money(avgYear.total / 12)} / month · across {saved12.length} months of data</p>
            </div>
            <div>
              <div className="flex h-3 overflow-hidden rounded-full bg-slate-100 [&>i]:min-w-[2px]">
                <i style={{ width: `${avgYear.total ? avgYear.inv / avgYear.total * 100 : 0}%`, background: C_PATH }} />
                <i className="ml-0.5" style={{ width: `${avgYear.total ? avgYear.cash / avgYear.total * 100 : 0}%`, background: '#1baf7a' }} />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><p className="flex items-center gap-2 text-xs text-slate-500"><i className="h-2.5 w-2.5 rounded-full" style={{ background: C_PATH }} />Investments</p><p className="tabular font-semibold text-slate-900">{money(avgYear.inv)}<span className="text-xs font-normal text-slate-400"> /yr</span></p><p className="tabular text-xs text-slate-500">{money(avgMonthInv)} / mo</p></div>
                <div><p className="flex items-center gap-2 text-xs text-slate-500"><i className="h-2.5 w-2.5 rounded-full" style={{ background: '#1baf7a' }} />Savings account</p><p className="tabular font-semibold text-slate-900">{money(avgYear.cash)}<span className="text-xs font-normal text-slate-400"> /yr</span></p><p className="tabular text-xs text-slate-500">{money(avgMonthCash)} / mo</p></div>
              </div>
            </div>
            {lastMonth && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200/70">Latest month ({lastMonth.year}-{String(lastMonth.month).padStart(2, '0')}): <b className="text-slate-900">{money(lastMonth.actual ?? 0)}</b> saved — {money(lastMonth.to_investments)} invested, {money(lastMonth.to_cash)} to savings.</p>}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Last 12 months</p>
            <ResponsiveContainer width="100%" height={mobile ? 180 : 210}>
              <BarChart data={monthly} margin={{ top: 4, right: 0, bottom: 0, left: mobile ? -8 : 0 }}>
                <CartesianGrid stroke="#e1e0d9" strokeOpacity={0.7} vertical={false} />
                <XAxis dataKey="name" stroke="none" tick={{ fill: '#898781', fontSize: 10 }} tickLine={false} axisLine={{ stroke: '#c3c2b7' }} tickFormatter={v => v.slice(2)} interval={mobile ? 2 : 0} />
                <YAxis stroke="none" tick={{ fill: '#898781', fontSize: 10 }} tickLine={false} axisLine={false} width={mobile ? 40 : 48} tickFormatter={compact} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: '#0b0b0b', fillOpacity: 0.04 }} />
                <Bar dataKey="Investments" stackId="s" fill={C_PATH} maxBarSize={24} stroke="#fff" strokeWidth={1} />
                <Bar dataKey="Savings account" stackId="s" fill="#1baf7a" maxBarSize={24} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="mt-5 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200/70">
          <div className="grid grid-cols-[3rem_1fr_1fr_1fr] gap-2 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-400 sm:grid-cols-[5rem_1fr_1fr_1fr_1fr] sm:px-4"><span>Year</span><span className="hidden sm:block">Months</span><span>Total</span><span>Invested</span><span>Savings acct</span></div>
          {byYear.map(y => (
            <div key={y.year} className="grid grid-cols-[3rem_1fr_1fr_1fr] gap-2 px-3 py-2.5 text-sm sm:grid-cols-[5rem_1fr_1fr_1fr_1fr] sm:px-4">
              <span className="font-semibold text-slate-900">{y.year}</span><span className="hidden text-slate-500 sm:block">{y.months}</span>
              <span className="tabular font-semibold">{money(y.total)}</span><span className="tabular text-slate-700">{money(y.inv)}</span><span className="tabular text-slate-700">{money(y.cash)}</span>
            </div>
          ))}
          <div className="grid grid-cols-[3rem_1fr_1fr_1fr] gap-2 bg-slate-50/70 px-3 py-2.5 text-sm sm:grid-cols-[5rem_1fr_1fr_1fr_1fr] sm:px-4">
            <span className="font-semibold text-slate-900">Avg</span><span className="hidden text-slate-500 sm:block">per year</span>
            <span className="tabular font-semibold">{money(avgYear.total)}</span><span className="tabular text-slate-700">{money(avgYear.inv)}</span><span className="tabular text-slate-700">{money(avgYear.cash)}</span>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={btnGhost} onClick={applyAvg}>Apply {money(avgMonthInv)}/mo to every projected year</button>
          <p className="text-xs text-slate-500">Only the investments part is added, since the projection tracks investments. Remember to Save.</p>
        </div>
      </Card>

      <Card title="Assumptions & year-end actuals" right={<div className="flex w-full gap-2 sm:w-auto [&>button]:flex-1 sm:[&>button]:flex-none"><button className={btnGhost} onClick={generate30}>Generate 30 yrs @ 8%</button><button className={btnGhost} onClick={addYear}>+ Add year</button></div>}
        subtitle="Set a yearly return % and monthly contribution. When the year is over, type the real ending wealth.">
        {!rows.length && <p className="text-sm text-slate-500">No years yet. Add a year to start from your current investments ({money(invested)}).</p>}
        <div className="hidden sm:block">
          <CrossTable className="rounded-2xl border border-slate-200/70"><table className="w-full min-w-[820px] text-sm">
            <thead className="text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500"><tr>
              {['Year', 'Start wealth', 'Return %/yr', 'Contribution /mo', 'Projected end', 'Actual end', 'Variance', ''].map((h, i) => <th key={i} className={`whitespace-nowrap px-3 py-3 ${i === 6 ? 'text-right' : ''}`}>{h}</th>)}
            </tr></thead>
            <tbody className="align-middle">
              {rows.map(r => {
                const p = proj.find(x => x.year === r.year);
                const tag = r.actual_end != null ? ['Actual', 'bg-amber-50 text-amber-700 ring-amber-200'] : p?.asOf != null ? ['Live', 'bg-emerald-50 text-emerald-700 ring-emerald-200'] : ['Projected', 'bg-sky-50 text-sky-700 ring-sky-200'];
                return (
                  <tr key={r.year}>
                    <td className="px-3 py-3"><p className="text-base font-semibold tracking-tight text-slate-900">{r.year}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${tag[1]}`}>{tag[0]}</span></td>
                    <td className="min-w-[9rem] px-3 py-3">{r.year === rows[0].year ? <MoneyInput value={r.start_wealth} onChange={v => set(r.year, { start_wealth: v })} /> : <span className="tabular text-slate-600">{money(p?.start ?? 0)}</span>}</td>
                    <td className="w-28 px-3 py-3"><NumInput value={r.return_pct} onChange={v => set(r.year, { return_pct: v })} /></td>
                    <td className="min-w-[9rem] px-3 py-3"><MoneyInput value={r.monthly_contribution} onChange={v => set(r.year, { monthly_contribution: v })} /></td>
                    <td className="px-3 py-3"><span className="tabular whitespace-nowrap font-semibold text-slate-900">{money(p?.projectedEnd ?? 0)}</span>{p?.asOf != null && <span className="mt-0.5 block text-[11px] font-medium text-emerald-700">Today {money(p.asOf)} · real balance</span>}</td>
                    <td className="min-w-[9rem] px-3 py-3"><MoneyInput value={r.actual_end ?? 0} onChange={v => set(r.year, { actual_end: v || null })} /></td>
                    <td className="min-w-[8.5rem] whitespace-nowrap px-3 py-3 text-right">{p?.variance == null ? <span className="text-slate-300">—</span> : <span className={`tabular inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${p.variance >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{p.variance >= 0 ? '+' : '−'}{money(Math.abs(p.variance))}</span>}</td>
                    <td className="px-2 py-3 text-right"><button className="rounded-lg px-2 py-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600" title={`Remove ${r.year}`} aria-label={`Remove ${r.year}`} onClick={() => removeYear(r.year)}>✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table></CrossTable>
        </div>
        <div className="space-y-3 sm:hidden">
          {rows.map(r => {
            const p = proj.find(x => x.year === r.year);
            const tag = r.actual_end != null ? ['Actual', 'bg-amber-50 text-amber-700 ring-amber-200'] : p?.asOf != null ? ['Live', 'bg-emerald-50 text-emerald-700 ring-emerald-200'] : ['Projected', 'bg-sky-50 text-sky-700 ring-sky-200'];
            return (
              <div key={r.year} className="cq overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(15,23,42,0.12)]">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="display text-3xl leading-none text-slate-900">{r.year}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${tag[1]}`}>{tag[0]}</span>
                  </div>
                  <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-300 active:bg-rose-50 active:text-rose-600" aria-label={`Remove ${r.year}`} onClick={() => removeYear(r.year)}>✕</button>
                </div>
                <div className="flex items-end justify-between gap-3 bg-gradient-to-br from-indigo-700 to-indigo-900 px-4 py-4 text-white">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-indigo-200">Projected end</p>
                    <p className="tabular num-lg font-semibold">{money(p?.projectedEnd ?? 0)}</p>
                  </div>
                  {p?.variance != null && <p className={`tabular shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${p.variance >= 0 ? 'bg-emerald-400/25 text-emerald-50' : 'bg-rose-400/30 text-rose-50'}`}>{p.variance >= 0 ? '+' : '−'}{money(Math.abs(p.variance))}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 text-xs font-medium text-slate-500">
                  <label className="space-y-1"><span>Start wealth</span>{r.year === rows[0].year ? <MoneyInput value={r.start_wealth} onChange={v => set(r.year, { start_wealth: v })} /> : <p className="tabular flex min-h-[44px] items-center text-sm font-semibold text-slate-700">{money(p?.start ?? 0)}</p>}</label>
                  <label className="space-y-1"><span>Return %/yr</span><NumInput value={r.return_pct} onChange={v => set(r.year, { return_pct: v })} /></label>
                  <label className="space-y-1"><span>Contribution /mo</span><MoneyInput value={r.monthly_contribution} onChange={v => set(r.year, { monthly_contribution: v })} /></label>
                  <label className="space-y-1"><span>Actual end</span><MoneyInput value={r.actual_end ?? 0} onChange={v => set(r.year, { actual_end: v || null })} /></label>
                </div>
                {p?.asOf != null && <p className="border-t border-emerald-100 bg-emerald-50/60 px-4 py-2 text-[11px] font-medium text-emerald-700">Today {money(p.asOf)} · real balance, not a forecast</p>}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
