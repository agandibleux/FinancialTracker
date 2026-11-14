import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, PencilLine, TriangleAlert } from 'lucide-react';
import { useCategories, useMonth, useMonths } from '../api';
import { MONTHS, money, sum } from '../lib/calc';
import type { MonthSummary } from '../lib/types';
import { Card, EmptyState, GRID, MonthNav, PageHeader, Tabs, btnGhost } from '../components/ui';
import { PILL, Rule503020, bucket503020, useEverydayAs, type Verdict } from '../components/Rule503020';

const axis = { stroke: '#94a3b8', fontSize: 12, tickLine: false, axisLine: false };
const BUCKETS = [
  { key: 'needs', label: 'Needs', target: 50, color: '#1f5c44', floor: false },
  { key: 'wants', label: 'Wants', target: 30, color: '#e3a21a', floor: false },
  { key: 'savings', label: 'Savings', target: 20, color: '#2b7a8c', floor: true },
] as const;
const savedOf = (m: MonthSummary) => m.actual ?? m.predicted;

function Pill({ v, pct, floor }: { v: Verdict; pct: number; floor?: boolean }) {
  return (
    <span className={`tabular inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${PILL[v]}`}>
      {v === 'good' ? <Check size={11} /> : <TriangleAlert size={11} />}{pct.toFixed(0)}%<span className="sr-only">{floor ? ' savings' : ''}</span>
    </span>
  );
}

type Hist = { b: ReturnType<typeof bucket503020> }[];
function HitRate({ hist, className = '' }: { hist: Hist; className?: string }) {
  const onTarget = BUCKETS.map(x => hist.filter(h => h.b.verdict[x.key] === 'good').length);
  const perfect = hist.filter(h => BUCKETS.every(x => h.b.verdict[x.key] === 'good')).length;
  return (
    <Card className={className} title="How often you hit it" subtitle={`Across ${hist.length} months`}>
      <p className="display text-[40px] leading-none text-slate-900">{perfect}<span className="text-2xl text-slate-400"> / {hist.length}</span></p>
      <p className="mt-1 text-sm text-slate-500">months with all three buckets on target</p>
      <ul className="mt-4 space-y-3">
        {BUCKETS.map((x, i) => (
          <li key={x.key}>
            <div className="flex items-baseline justify-between text-sm"><span className="flex items-center gap-2 font-medium text-slate-700"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />{x.label}<span className="text-xs font-normal text-slate-400">{x.floor ? '≥' : '≤'} {x.target}%</span></span><b className="tabular text-slate-900">{onTarget[i]} of {hist.length}</b></div>
            <div className="mt-1 h-2 rounded-full bg-slate-200/70"><div className="grow h-full rounded-full" style={{ width: `${(onTarget[i] / hist.length) * 100}%`, background: x.color }} /></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EverydayToggle({ mode }: { mode: ReturnType<typeof useEverydayAs> }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs text-slate-500">
      <span>Count everyday spending as</span>
      <div className="inline-flex rounded-lg border border-slate-300 bg-[var(--card)] p-0.5 font-semibold" role="group" aria-label="Count everyday spending as">
        {(['needs', 'wants'] as const).map(v => (
          <button key={v} onClick={() => mode[1](v)} aria-pressed={mode[0] === v} className={`min-h-0 rounded-md px-2.5 py-1 capitalize ${mode[0] === v ? 'bg-[#10281f] text-[#f6f1e4]' : 'text-slate-500 hover:text-slate-800'}`}>{v}</button>
        ))}
      </div>
    </div>
  );
}

export default function Budget() {
  const all = useMonths().data ?? [];
  const mode = useEverydayAs();
  const [params] = useSearchParams();
  const qy = Number(params.get('y')), qm = Number(params.get('m'));
  const [sel, setSel] = useState<{ y: number; m: number } | null>(qy > 2000 && qm >= 1 && qm <= 12 ? { y: qy, m: qm } : null);
  const cats = useCategories().data ?? [];
  const [view, setView] = useState<'month' | 'overview' | 'years'>('month');
  const openMonth = (y: number, m: number) => { setSel({ y, m }); setView('month'); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  // only months that have income can be judged against a share of income
  const months = useMemo(() => all.filter(m => m.income > 0), [all]);
  const now = new Date();
  const cur = (sel && months.find(m => m.year === sel.y && m.month === sel.m))
    || months.find(m => m.year === now.getFullYear() && m.month === now.getMonth() + 1) || months.at(-1);

  const detail = useMonth(cur?.year ?? 0, cur?.month ?? 0).data;

  const history = useMemo(() => months.slice(-12).map(m => {
    const b = bucket503020({ ...m, saved: savedOf(m) }, mode[0]);
    return { m, b, name: `${MONTHS[m.month - 1]} ${String(m.year).slice(2)}`, Needs: +b.pct.needs.toFixed(1), Wants: +b.pct.wants.toFixed(1), Savings: +b.pct.savings.toFixed(1) };
  }), [months, mode]);

  const allHist = useMemo(() => months.map(m => ({ m, b: bucket503020({ ...m, saved: savedOf(m) }, mode[0]) })), [months, mode]);
  const roll = (ms: MonthSummary[]) => ({ income: sum(ms.map(m => m.income)), fixed: sum(ms.map(m => m.fixed)), utility: sum(ms.map(m => m.utility)), variable: sum(ms.map(m => m.variable)), one_off: sum(ms.map(m => m.one_off ?? 0)), saved: sum(ms.map(savedOf)) });
  const years = useMemo(() => {
    const g = new Map<number, MonthSummary[]>();
    for (const m of months) g.set(m.year, [...(g.get(m.year) ?? []), m]);
    return [...g].map(([year, ms]) => { const t = roll(ms), b = bucket503020(t, mode[0]); return { year, n: ms.length, t, b, name: String(year), Needs: +b.pct.needs.toFixed(1), Wants: +b.pct.wants.toFixed(1), Savings: +b.pct.savings.toFixed(1) }; });
  }, [months, mode]);
  const total = useMemo(() => roll(months), [months]);

  if (!cur) return (
    <div className="space-y-3 sm:space-y-5">
      <PageHeader title="50/30/20 budget" />
      <EmptyState title="No months yet" text="Enter a month with income and spending, then come back to see how it compares with the 50/30/20 rule." />
    </div>
  );

  const everyday = Math.max(0, cur.variable - (cur.one_off ?? 0));
  // what went where: every entered category, grouped under its parent, placed in a bucket
  const byId = new Map(cats.map(c => [c.id, c]));
  const lines: Record<'needs' | 'wants', Map<string, { amount: number; tag: string }>> = { needs: new Map(), wants: new Map() };
  for (const e of detail?.expenses ?? []) {
    const c = byId.get(e.category_id); if (!c || !e.amount) continue;
    const tag = c.kind === 'fixed' ? 'Fixed' : c.kind === 'utility' ? 'Utility' : c.counts_as_living ? 'Everyday' : 'One-off';
    const to = tag === 'Everyday' ? mode[0] : tag === 'One-off' ? 'wants' : 'needs';
    const label = c.parent_id ? byId.get(c.parent_id)?.name ?? c.name : c.name;
    const row = lines[to].get(label) ?? { amount: 0, tag };
    row.amount += e.amount; lines[to].set(label, row);
  }
  const sorted = (m: Map<string, { amount: number; tag: string }>) => [...m].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.amount - a.amount);
  const cols = [
    { title: 'Needs', how: `Fixed costs and utilities${mode[0] === 'needs' ? ', plus everyday spending' : ''}. Target 50%.`, items: sorted(lines.needs), color: '#1f5c44' },
    { title: 'Wants', how: `One-off spending${mode[0] === 'wants' ? ', plus everyday spending' : ''}. Target 30%.`, items: sorted(lines.wants), color: '#e3a21a' },
  ];
  const entry = `/month?y=${cur.year}&m=${cur.month}`;

  return (
    <div className="space-y-3 sm:space-y-5">
      <PageHeader title="50/30/20 budget" subtitle={view === 'month' ? 'Half of income to needs, 30% to wants, 20% to savings. Pick any month to see how it compared.' : view === 'overview' ? `How the last ${history.length} months measured up. Tap a month to open its details.` : `Every month since ${MONTHS[months[0].month - 1]} ${months[0].year}, rolled up by year and overall.`}
        actions={view === 'month' ? <MonthNav year={cur.year} month={cur.month} months={months} onChange={(y, m) => setSel({ y, m })} /> : undefined} />

      <Tabs tabs={[{ id: 'month', label: `${MONTHS[cur.month - 1]} ${cur.year}` }, { id: 'overview', label: 'Last 12 months' }, { id: 'years', label: 'All years' }]} value={view} onChange={setView} />

      {view === 'month' && <>
      <Rule503020 mode={mode} income={cur.income} fixed={cur.fixed} utility={cur.utility} everyday={everyday} oneOff={cur.one_off ?? 0} saved={savedOf(cur)} month={`${MONTHS[cur.month - 1]} ${cur.year}`} />


      <Card title={`What went into ${MONTHS[cur.month - 1]} ${cur.year}`} subtitle="Every category you entered, placed in the bucket it counts toward."
        right={<Link to={entry} className={btnGhost}><PencilLine size={15} />Edit in Monthly entry</Link>}>
        <div className="grid gap-5 md:grid-cols-3">
          {cols.map(c => (
            <section key={c.title} className="min-w-0">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />{c.title}<span className="tabular ml-auto text-slate-500">{money(sum(c.items.map(i => i.amount)), 0)}</span></h3>
              <p className="mt-1 text-xs text-slate-400">{c.how}</p>
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {c.items.map(i => (
                  <li key={i.name} className="flex items-center justify-between gap-2 py-1.5">
                    <span className="flex min-w-0 items-center gap-2 text-slate-700"><span className="truncate">{i.name}</span><span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">{i.tag}</span></span>
                    <span className="tabular shrink-0"><b className="text-slate-900">{money(i.amount, 0)}</b> <span className="text-xs text-slate-400">{((i.amount / cur.income) * 100).toFixed(0)}%</span></span>
                  </li>
                ))}
                {c.items.length === 0 && <li className="py-2 text-xs text-slate-400">Nothing entered for this bucket.</li>}
              </ul>
            </section>
          ))}
          <section className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#2b7a8c' }} />Savings<span className="tabular ml-auto text-slate-500">{money(savedOf(cur), 0)}</span></h3>
            <p className="mt-1 text-xs text-slate-400">{cur.actual == null ? 'Predicted: income minus expenses, until you record the actual.' : 'What you recorded as actually saved. Target 20%.'}</p>
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {cur.actual == null
                ? <li className="flex justify-between gap-2 py-1.5"><span className="text-slate-700">Predicted <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">Estimate</span></span><b className="tabular text-slate-900">{money(cur.predicted, 0)}</b></li>
                : <>
                  <li className="flex justify-between gap-2 py-1.5"><span className="text-slate-700">Savings account</span><b className="tabular text-slate-900">{money(cur.to_cash, 0)}</b></li>
                  <li className="flex justify-between gap-2 py-1.5"><span className="text-slate-700">Investments</span><b className="tabular text-slate-900">{money(cur.to_investments, 0)}</b></li>
                </>}
            </ul>
            {cur.actual == null && <Link to={entry} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:underline">Record the actual savings <ArrowRight size={12} /></Link>}
          </section>
        </div>
      </Card>

      </>}

      {view === 'overview' && <>
      <div className="flex justify-end"><EverydayToggle mode={mode} /></div>
      {history.length > 1 && (
        <div className="grid gap-3 sm:gap-5 xl:grid-cols-12">
          <Card className="xl:col-span-8" title="Last 12 months" subtitle="Share of income by bucket. Dashed lines mark 50% (end of needs) and 80% (end of wants). Tap a bar to open that month.">
            <div className="h-[230px] sm:h-[270px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={history} margin={{ left: -12, top: 8 }} onClick={(e: any) => { const h = e?.activePayload?.[0]?.payload; if (h) openMonth(h.m.year, h.m.month); }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" {...axis} interval="preserveStartEnd" /><YAxis {...axis} unit="%" domain={[0, 'dataMax']} />
                  <Tooltip cursor={{ fill: '#1f5c4411' }} formatter={(v: any, n: any) => [`${v}%`, n]} />
                  <ReferenceLine y={50} stroke="#10281f" strokeDasharray="4 4" /><ReferenceLine y={80} stroke="#10281f" strokeDasharray="4 4" />
                  {BUCKETS.map((x, i) => (
                    <Bar key={x.key} dataKey={x.label} stackId="s" fill={x.color} maxBarSize={34} radius={i === 2 ? [5, 5, 0, 0] : 0} cursor="pointer">
                      {history.map(h => <Cell key={h.name} fill={x.color} fillOpacity={h.m === cur ? 1 : 0.62} />)}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <HitRate hist={history} className="xl:col-span-4" />
        </div>
      )}

      {history.length > 0 && (
        <Card pad={false} title="Every month" subtitle="Green = within target, amber = up to 5 points off, red = further off.">
          <div className="px-4 pb-4 sm:px-6 sm:pb-6">
            <div className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-x-2 border-b border-slate-200 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 sm:grid-cols-[1fr_repeat(3,6rem)]">
              <span>Month</span>{BUCKETS.map(x => <span key={x.key} className="text-right">{x.label}</span>)}
            </div>
            <ul>
              {[...history].reverse().map(h => (
                <li key={h.name}>
                  <button onClick={() => openMonth(h.m.year, h.m.month)}
                    className={`grid min-h-0 w-full grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-x-2 border-b border-slate-100 py-2.5 text-left text-sm hover:bg-slate-50 sm:grid-cols-[1fr_repeat(3,6rem)] ${h.m === cur ? 'font-semibold text-slate-900' : 'text-slate-700'}`}>
                    <span>{MONTHS[h.m.month - 1]} {h.m.year}</span>
                    {BUCKETS.map(x => <span key={x.key} className="text-right"><Pill v={h.b.verdict[x.key]} pct={h.b.pct[x.key]} floor={x.floor} /></span>)}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}
      </>}

      {view === 'years' && <>
      <div className="flex justify-end"><EverydayToggle mode={mode} /></div>
      <Rule503020 mode={mode} income={total.income} fixed={total.fixed} utility={total.utility} everyday={Math.max(0, total.variable - total.one_off)} oneOff={total.one_off} saved={total.saved} month={`all ${months.length} months`} />

      <div className="grid gap-3 sm:gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-8" title="Year by year" subtitle="Share of each year's total income. A partial year only counts the months entered so far.">
          <div className="h-[230px] sm:h-[270px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={years} margin={{ left: -12, top: 8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" {...axis} /><YAxis {...axis} unit="%" domain={[0, 'dataMax']} />
                <Tooltip cursor={{ fill: '#1f5c4411' }} formatter={(v: any, n: any) => [`${v}%`, n]} />
                <ReferenceLine y={50} stroke="#10281f" strokeDasharray="4 4" /><ReferenceLine y={80} stroke="#10281f" strokeDasharray="4 4" />
                {BUCKETS.map((x, i) => <Bar key={x.key} dataKey={x.label} stackId="s" fill={x.color} maxBarSize={64} radius={i === 2 ? [5, 5, 0, 0] : 0} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <HitRate hist={allHist} className="xl:col-span-4" />
      </div>

      <Card pad={false} title="Each year" subtitle="Dashed totals use every month entered that year.">
        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          <div className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-x-2 border-b border-slate-200 pb-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 sm:grid-cols-[1fr_repeat(3,6rem)]">
            <span>Year</span>{BUCKETS.map(x => <span key={x.key} className="text-right">{x.label}</span>)}
          </div>
          <ul>
            {[...years].reverse().map(y => (
              <li key={y.year} className="grid grid-cols-[1fr_repeat(3,4.5rem)] items-center gap-x-2 border-b border-slate-100 py-2.5 text-sm text-slate-700 sm:grid-cols-[1fr_repeat(3,6rem)]">
                <span><b className="text-slate-900">{y.year}</b> <span className="text-xs text-slate-400">{y.n} {y.n === 1 ? 'month' : 'months'} · {money(y.t.income, 0)} in</span></span>
                {BUCKETS.map(x => <span key={x.key} className="text-right"><Pill v={y.b.verdict[x.key]} pct={y.b.pct[x.key]} floor={x.floor} /></span>)}
              </li>
            ))}
          </ul>
        </div>
      </Card>
      </>}
    </div>
  );
}
