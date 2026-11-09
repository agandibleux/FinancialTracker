import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { useAllExpenses, useCategories, useMonths } from '../api';
import { MONTHS, money, movingAvg, sum } from '../lib/calc';
import type { MonthSummary } from '../lib/types';
import { COLORS, Card, ChartTooltip, CrossTable, GRID, MonthNav, PageHeader, inputCls } from '../components/ui';

const axis = { stroke: '#94a3b8', fontSize: 12, tickLine: false, axisLine: false };
const k = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v) / 1000}k`;
const pctFmt = (v: number) => `${v.toFixed(1)}%`;
const saved = (m: MonthSummary) => m.actual ?? m.predicted;

type MetricKey = 'income' | 'expenses' | 'living' | 'utility' | 'saved';
const METRICS: Record<MetricKey, { label: string; get: (m: MonthSummary) => number }> = {
  income: { label: 'Money in', get: m => m.income }, expenses: { label: 'Money out', get: m => m.expenses },
  living: { label: 'Living cost', get: m => m.living }, utility: { label: 'Utilities', get: m => m.utility }, saved: { label: 'Saved', get: saved },
};
// rows of the "this month vs last month" table; goodUp = is an increase good news?
const COMPARE: { label: string; get: (m: MonthSummary) => number; goodUp: boolean; bold?: boolean }[] = [
  { label: 'Money in', get: m => m.income, goodUp: true },
  { label: 'Money out', get: m => m.expenses, goodUp: false, bold: true },
  { label: 'Fixed costs', get: m => m.fixed, goodUp: false },
  { label: 'Utilities', get: m => m.utility, goodUp: false },
  { label: 'Everyday spending (living cost)', get: m => m.living, goodUp: false },
  { label: 'One-off & big purchases', get: m => m.expenses - m.fixed - m.utility - m.living, goodUp: false },
  { label: 'Saved', get: saved, goodUp: true, bold: true },
];

function Delta({ diff, goodUp }: { diff: number; goodUp: boolean }) {
  if (Math.abs(diff) < 0.005) return <span className="inline-flex items-center gap-1 text-slate-400"><Minus size={14} />no change</span>;
  const good = goodUp ? diff > 0 : diff < 0;
  return <span className={`inline-flex items-center gap-1 font-semibold ${good ? 'text-emerald-600' : 'text-rose-600'}`}>{diff > 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{diff > 0 ? '+' : '−'}{money(Math.abs(diff))}</span>;
}

export default function Trends() {
  const months = useMonths().data ?? [];
  const cats = useCategories().data ?? [];
  const expenses = useAllExpenses().data ?? [];
  const [range, setRange] = useState(12);
  const [includeCurrent, setIncludeCurrent] = useState(false);
  const [metric, setMetric] = useState<MetricKey>('expenses');
  const [catId, setCatId] = useState<number | null>(null);
  const [sel, setSel] = useState<{ y: number; m: number } | null>(null);

  // months we can trust: have income, and (unless asked) are already over
  const nowKey = new Date().getFullYear() * 12 + new Date().getMonth();
  const base = useMemo(() => months.filter(m => m.income > 0 && (includeCurrent || m.year * 12 + m.month - 1 < nowKey)), [months, includeCurrent, nowKey]);
  const view = range ? base.slice(-range) : base;
  const label = (m: MonthSummary) => `${MONTHS[m.month - 1]} ${String(m.year).slice(2)}`;

  const series = useMemo(() => {
    const sv = view.map(saved), out = view.map(m => m.expenses), lv = view.map(m => m.living);
    const sAvg = movingAvg(sv), lAvg = movingAvg(lv), oAvg = movingAvg(out);
    return view.map((m, i) => {
      const prev = base[base.indexOf(m) - 1];
      return {
        name: label(m), 'Money in': m.income, 'Money out': m.expenses, Saved: sv[i], 'Saved (3-month trend)': sAvg[i],
        'Money out (3-month trend)': oAvg[i], 'Living cost': lv[i], 'Living (3-month trend)': lAvg[i],
        rate: (sv[i] / m.income) * 100, change: prev && prev.expenses ? ((m.expenses - prev.expenses) / prev.expenses) * 100 : 0,
      };
    });
  }, [view, base]);
  const avgRate = series.length ? sum(series.map(s => s.rate)) / series.length : 0;

  // month vs previous month
  const cur = (sel && base.find(m => m.year === sel.y && m.month === sel.m)) || base[base.length - 1];
  const prev = cur ? base[base.indexOf(cur) - 1] : undefined;

  // year over year: one line per year across Jan..Dec
  const years = [...new Set(base.map(m => m.year))];
  const yoy = MONTHS.map((name, i) => {
    const row: Record<string, number | string | undefined> = { name };
    for (const y of years) { const m = base.find(x => x.year === y && x.month === i + 1); row[String(y)] = m ? METRICS[metric].get(m) : undefined; }
    return row;
  });

  // one category (with its sub-categories) over time
  const options = cats.filter(c => !c.parent_id && expenses.some(e => e.category_id === c.id || cats.some(k2 => k2.parent_id === c.id && k2.id === e.category_id)));
  const chosen = options.find(c => c.id === catId) ?? options.find(c => c.name === 'Utilities') ?? options[0];
  const catSeries = useMemo(() => {
    if (!chosen) return [];
    const ids = new Set([chosen.id, ...cats.filter(c => c.parent_id === chosen.id).map(c => c.id)]);
    const vals = view.map(m => sum(expenses.filter(e => e.year === m.year && e.month === m.month && ids.has(e.category_id)).map(e => e.amount)));
    const avg = movingAvg(vals);
    return view.map((m, i) => ({ name: label(m), [chosen.name]: vals[i], '3-month trend': avg[i] }));
  }, [chosen, view, expenses, cats]);

  if (base.length < 2) return <div className="space-y-4 sm:space-y-6"><PageHeader title="Trends" /><Card>Add at least two months with income to see trends.</Card></div>;

  const headline = cur && prev ? (() => {
    const inc = cur.income - prev.income, out = cur.expenses - prev.expenses, sv = saved(cur) - saved(prev);
    const w = (d: number, up: string, down: string) => `${money(Math.abs(d))} ${d >= 0 ? up : down}`;
    return `Compared with ${MONTHS[prev.month - 1]} ${prev.year}, you earned ${w(inc, 'more', 'less')}, spent ${w(out, 'more', 'less')} and saved ${w(sv, 'more', 'less')}.`;
  })() : '';

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Trends" subtitle="Follow how your money moves month over month, and compare with the same month last year."
        actions={<>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={includeCurrent} onChange={e => setIncludeCurrent(e.target.checked)} />Include current &amp; estimated months</label>
          <select className={`${inputCls} !w-auto`} value={range} onChange={e => setRange(Number(e.target.value))}>
            <option value={6}>Last 6 months</option><option value={12}>Last 12 months</option><option value={24}>Last 24 months</option><option value={0}>All months</option>
          </select>
        </>} />

      {/* month vs previous month */}
      {cur && (
        <Card title="Month vs previous month" subtitle={headline}
          right={<MonthNav year={cur.year} month={cur.month} months={base} onChange={(y, m) => setSel({ y, m })} />}>
          {prev ? (
            <CrossTable>
              <table className="w-full text-[15px]">
                <thead><tr className="text-left text-sm text-slate-500">
                  <th className="px-3 py-2.5 font-medium">&nbsp;</th>
                  <th className="px-3 py-2.5 text-right font-medium">{MONTHS[prev.month - 1]} {prev.year}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{MONTHS[cur.month - 1]} {cur.year}</th>
                  <th className="px-3 py-2.5 text-right font-medium">Change</th>
                  <th className="px-3 py-2.5 text-right font-medium">%</th>
                </tr></thead>
                <tbody>
                  {COMPARE.map(r => {
                    const a = r.get(prev), b = r.get(cur), d = b - a;
                    return (
                      <tr key={r.label} className={r.bold ? 'font-semibold' : ''}>
                        <td className="px-3 py-2.5 text-slate-700">{r.label}</td>
                        <td className="tabular px-3 py-2.5 text-right text-slate-500">{money(a)}</td>
                        <td className="tabular px-3 py-2.5 text-right text-slate-900">{money(b)}</td>
                        <td className="tabular px-3 py-2.5 text-right"><Delta diff={d} goodUp={r.goodUp} /></td>
                        <td className="tabular px-3 py-2.5 text-right text-slate-500">{a ? `${d >= 0 ? '+' : '−'}${Math.abs((d / a) * 100).toFixed(2)}%` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CrossTable>
          ) : <p className="text-sm text-slate-500">This is the first month on record – nothing to compare with yet.</p>}
        </Card>
      )}

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-2">
        <Card title="Money in vs money out" subtitle="Where the two lines are far apart, you are saving.">
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={series} margin={{ left: -8, top: 8 }}>
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={k} />
              <Tooltip content={<ChartTooltip />} /><Legend iconType="circle" iconSize={8} />
              <Line dataKey="Money in" stroke="#10b981" strokeWidth={3} dot={{ r: 3 }} />
              <Line dataKey="Money out" stroke="#f43f5e" strokeWidth={3} dot={{ r: 3 }} />
              <Line dataKey="Money out (3-month trend)" stroke="#f43f5e" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Saved each month, with trend" subtitle="Bars = what you saved. Line = 3-month average, which smooths out one-off months.">
          <ResponsiveContainer width="100%" height={290}>
            <ComposedChart data={series} margin={{ left: -8, top: 8 }}>
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={k} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#3f6ba311' }} /><Legend iconType="circle" iconSize={8} /><ReferenceLine y={0} stroke="#cbd5e1" />
              <Bar dataKey="Saved" radius={[6, 6, 0, 0]} maxBarSize={36}>{series.map((s, i) => <Cell key={i} fill={s.Saved < 0 ? '#fb7185' : '#6089bd'} />)}</Bar>
              <Line dataKey="Saved (3-month trend)" stroke="#274670" strokeWidth={3} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Savings rate" subtitle={`Share of your income that you save. Average over this period: ${avgRate.toFixed(1)}%.`}>
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={series} margin={{ left: -8, top: 8 }}>
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip content={<ChartTooltip fmt={pctFmt} />} /><ReferenceLine y={0} stroke="#cbd5e1" />
              <ReferenceLine y={avgRate} stroke="#64748b" strokeDasharray="5 5" label={{ value: 'average', fill: '#64748b', fontSize: 12, position: 'insideTopRight' }} />
              <Line name="Savings rate" dataKey="rate" stroke="#0f766e" strokeWidth={3} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Spending change vs the month before" subtitle="Red bars: you spent more than the previous month. Green bars: you spent less.">
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={series} margin={{ left: -8, top: 8 }}>
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip content={<ChartTooltip fmt={pctFmt} />} cursor={{ fill: '#3f6ba311' }} /><ReferenceLine y={0} stroke="#94a3b8" />
              <Bar name="Change in money out" dataKey="change" radius={[6, 6, 0, 0]} maxBarSize={36}>{series.map((s, i) => <Cell key={i} fill={s.change > 0 ? '#f43f5e' : '#10b981'} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Living cost trend" subtitle="Everyday spending only (no fixed costs, utilities or one-offs).">
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={series} margin={{ left: -8, top: 8 }}>
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={k} />
              <Tooltip content={<ChartTooltip />} /><Legend iconType="circle" iconSize={8} />
              <Line dataKey="Living cost" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} />
              <Line dataKey="Living (3-month trend)" stroke="#b45309" strokeWidth={2} strokeDasharray="5 5" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Compare with last year" subtitle="Each line is a year – see how the same month looks year over year."
          right={<select className={`${inputCls} !w-auto`} value={metric} onChange={e => setMetric(e.target.value as MetricKey)}>
            {(Object.keys(METRICS) as MetricKey[]).map(m => <option key={m} value={m}>{METRICS[m].label}</option>)}</select>}>
          <ResponsiveContainer width="100%" height={290}>
            <LineChart data={yoy} margin={{ left: -8, top: 8 }}>
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={k} />
              <Tooltip content={<ChartTooltip />} /><Legend iconType="circle" iconSize={8} />
              {years.map((y, i) => <Line key={y} dataKey={String(y)} stroke={COLORS[(i + 4) % COLORS.length]} strokeWidth={3} dot={{ r: 3 }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card title="One category over time" className="xl:col-span-2" subtitle="Pick any category – sub-categories (e.g. Hydro under Utilities) are added up."
          right={<select className={`${inputCls} !w-auto`} value={chosen?.id ?? ''} onChange={e => setCatId(Number(e.target.value))}>
            {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}>
          <ResponsiveContainer width="100%" height={290}>
            <ComposedChart data={catSeries} margin={{ left: -8, top: 8 }}>
              <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={(v: number) => `$${v}`} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#3f6ba311' }} /><Legend iconType="circle" iconSize={8} />
              {chosen && <Bar dataKey={chosen.name} fill="#94b0d4" radius={[6, 6, 0, 0]} maxBarSize={36} />}
              <Line dataKey="3-month trend" stroke="#274670" strokeWidth={3} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}
