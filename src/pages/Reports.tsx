import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCategories, useMonths, useYearExpenses } from '../api';
import { MONTHS, money, sum } from '../lib/calc';
import ExportExcelButton from '../components/ExportExcelButton';
import { COLORS, Card, ChartTooltip, Kpi, PageHeader, btnGhost, inputCls, CrossTable, GRID } from '../components/ui';

export default function Reports() {
  const months = useMonths().data ?? [];
  const cats = useCategories().data ?? [];
  const years = [...new Set(months.map(m => m.year))].sort((a, b) => b - a);
  const [sel, setSel] = useState<number | null>(null);
  const year = sel ?? years[0] ?? new Date().getFullYear();
  const exp = useYearExpenses(year).data ?? [];
  const rows = months.filter(m => m.year === year);

  const tot = (f: (m: (typeof rows)[number]) => number) => sum(rows.map(f));
  const income = tot(m => m.income), expenses = tot(m => m.expenses), predicted = tot(m => m.predicted);
  const actual = tot(m => m.actual ?? 0), living = tot(m => m.living);
  const n = rows.length || 1;
  const nActual = rows.filter(m => m.actual != null).length || 1;

  // Utility sub-categories per month (leaf categories of kind "utility").
  const utilCats = cats.filter(c => c.kind === 'utility' && !cats.some(k => k.parent_id === c.id));
  const utilChart = useMemo(() => MONTHS.map((name, i) => {
    const r: Record<string, number | string> = { name };
    for (const c of utilCats) r[c.name] = exp.filter(e => e.month === i + 1 && e.category_id === c.id).reduce((a, e) => a + e.amount, 0);
    return r;
  }).filter((_, i) => rows.some(m => m.month === i + 1)), [exp, cats, rows.length]);

  const catTotals = useMemo(() => cats.map(c => {
    const list = exp.filter(e => e.category_id === c.id);
    const t = sum(list.map(e => e.amount));
    return { c, total: t, avg: t / n, max: Math.max(0, ...list.map(e => e.amount)) };
  }).filter(x => x.total > 0).sort((a, b) => b.total - a.total), [exp, cats, n]);

  const exportCsv = () => {
    const head = ['Month', 'Income', 'Fixed', 'Utilities', 'Variable', 'Expenses', 'Living cost', 'Predicted savings', 'Actual savings', 'To cash', 'To investments'];
    const lines = rows.map(m => [`${year}-${String(m.month).padStart(2, '0')}`, m.income, m.fixed, m.utility, m.variable, m.expenses, m.living, m.predicted, m.actual ?? '', m.to_cash, m.to_investments].join(','));
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-${year}.csv`; a.click();
  };

  const th = 'px-2 py-2 text-right text-xs font-medium text-slate-500';
  const td = 'px-2 py-1.5 text-right';
  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Yearly report" subtitle="Every month side by side, with utilities and category totals."
        actions={<>
          <select className={`${inputCls} !w-auto`} value={year} onChange={e => setSel(Number(e.target.value))}>{(years.length ? years : [year]).map(y => <option key={y}>{y}</option>)}</select>
          <button className={btnGhost} onClick={exportCsv}>Export CSV</button>
          <ExportExcelButton />
        </>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Income" value={money(income)} hint={`${money(income / n)} / month`} tone="green" />
        <Kpi label="Expenses" value={money(expenses)} hint={`${money(expenses / n)} / month`} tone="rose" />
        <Kpi label="Avg living cost" value={money(living / n)} hint="fixed costs excluded" tone="amber" />
        <Kpi label="Predicted savings" value={money(predicted)} tone="blue" />
        <Kpi label="Actual savings" value={money(actual)} hint={`${income ? ((actual / income) * 100).toFixed(0) : 0}% of income`} tone="violet" />
      </div>

      <Card title="Month by month">
        <div className="overflow-x-auto">
          <CrossTable><table className="w-full min-w-[900px] text-sm">
            <thead><tr><th className={`${th} text-left`}>Month</th>{['Income', 'Fixed', 'Utilities', 'Variable', 'Expenses', 'Living', 'Predicted', 'Actual', 'Gap', 'Cash', 'Invested'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(m => (
                <tr key={m.month} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">{MONTHS[m.month - 1]}</td>
                  <td className={td}>{money(m.income)}</td><td className={td}>{money(m.fixed)}</td><td className={td}>{money(m.utility)}</td><td className={td}>{money(m.variable)}</td>
                  <td className={`${td} font-medium`}>{money(m.expenses)}</td><td className={td}>{money(m.living)}</td><td className={td}>{money(m.predicted)}</td>
                  <td className={td}>{m.actual == null ? '—' : money(m.actual)}</td>
                  <td className={`${td} ${m.actual == null ? '' : m.actual - m.predicted >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{m.actual == null ? '—' : money(m.actual - m.predicted)}</td>
                  <td className={td}>{money(m.to_cash)}</td><td className={td}>{money(m.to_investments)}</td>
                </tr>
              ))}
              <tr className="border-t border-slate-300 font-semibold">
                <td className="px-2 py-2">Total</td>
                {[tot(m => m.income), tot(m => m.fixed), tot(m => m.utility), tot(m => m.variable), expenses, living, predicted, actual, tot(m => m.actual == null ? 0 : m.actual - m.predicted), tot(m => m.to_cash), tot(m => m.to_investments)].map((v, i) => <td key={i} className={td}>{money(v)}</td>)}
              </tr>
              <tr className="text-slate-500">
                <td className="px-2 py-1.5">Average</td>
                {[income, tot(m => m.fixed), tot(m => m.utility), tot(m => m.variable), expenses, living, predicted, actual, 0, tot(m => m.to_cash), tot(m => m.to_investments)].map((v, i) => <td key={i} className={td}>{i === 8 ? '' : money(v / (i >= 7 ? nActual : n))}</td>)}
              </tr>
            </tbody>
          </table></CrossTable>
        </div>
      </Card>

      <div className="grid gap-4 sm:gap-6 lg:grid-cols-2">
        <Card title="Utilities by sub-category" subtitle="They change every month — see which one moves">
          {utilCats.length === 0 ? <p className="text-sm text-slate-500">No utility categories yet.</p> : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={utilChart}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} /><YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `$${v}`} />
                <Tooltip content={<ChartTooltip />} /><Legend />
                {utilCats.map((c, i) => <Bar key={c.id} dataKey={c.name} stackId="u" fill={COLORS[i % COLORS.length]} />)}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title="Category totals" subtitle={`${year}, largest first`}>
          <div className="max-h-[280px] overflow-auto">
            <CrossTable><table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-xs text-slate-500"><tr><th className="p-1.5 text-left">Category</th><th className={th}>Total</th><th className={th}>Avg / mo</th><th className={th}>Max</th></tr></thead>
              <tbody>{catTotals.map(({ c, total, avg, max }) => (
                <tr key={c.id} className="border-t border-slate-100"><td className="p-1.5">{c.name} <span className="text-xs text-slate-400">{c.kind}</span></td>
                  <td className={td}>{money(total)}</td><td className={td}>{money(avg)}</td><td className={td}>{money(max)}</td></tr>
              ))}</tbody>
            </table></CrossTable>
          </div>
        </Card>
      </div>
    </div>
  );
}
