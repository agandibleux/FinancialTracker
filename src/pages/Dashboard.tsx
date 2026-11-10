import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, Banknote, Home, Receipt, Wallet } from 'lucide-react';
import { useAccounts, useCategories, useMonth, useMonths, usePeople, useSettings } from '../api';
import { EmergencyFund } from '../components/EmergencyFund';
import { emergencyStatus } from '../lib/emergency';
import { MONTHS, money, sum } from '../lib/calc';
import { COLORS, Card, ChartTooltip, CountUp, EmptyState, GRID, Kpi, MonthNav, PageHeader, HeroRing, btnCls } from '../components/ui';
import { ACCOUNT_META, ACCOUNT_TYPES, type AccountType, type MonthSummary } from '../lib/types';

const axis = { stroke: '#94a3b8', fontSize: 12, tickLine: false, axisLine: false };
const pct = (a: number, b: number) => (b ? ((a - b) / Math.abs(b)) * 100 : null);
const TYPE_LABEL = Object.fromEntries(ACCOUNT_TYPES.map(t => [t, ACCOUNT_META[t].label])) as Record<AccountType, string>;

export default function Dashboard() {
  const months = useMonths().data ?? [];
  const cats = useCategories().data ?? [];
  const accounts = useAccounts().data ?? [];
  const person = usePeople().data?.[0]?.name;
  const settings = useSettings().data;
  // always open on the current calendar month, even if nothing is entered for it yet
  const now = new Date(), thisYear = now.getFullYear(), thisMonth = now.getMonth() + 1;
  const emptyMonth: MonthSummary = { year: thisYear, month: thisMonth, note: '', income: 0, expenses: 0, fixed: 0, utility: 0, variable: 0, living: 0, predicted: 0, actual: null, to_cash: 0, to_investments: 0 };
  const current = months.length ? months.find(m => m.year === thisYear && m.month === thisMonth) ?? emptyMonth : undefined;
  const [sel, setSel] = useState<{ y: number; m: number } | null>(null);
  const cur = (sel && months.find(m => m.year === sel.y && m.month === sel.m)) || current;
  const prev = cur ? months.filter(m => m.year * 12 + m.month < cur.year * 12 + cur.month).at(-1) : undefined;
  const detail = useMonth(cur?.year ?? 0, cur?.month ?? 0).data;

  const trend = useMemo(() => months.filter(m => m.income > 0 && (!cur || m.year * 12 + m.month <= cur.year * 12 + cur.month)).slice(-12).map(m => ({
    name: MONTHS[m.month - 1], Saved: m.actual ?? m.predicted,
    'Savings account': m.actual != null ? m.to_cash : undefined, Investments: m.actual != null ? m.to_investments : undefined,
    Predicted: m.actual == null ? m.predicted : undefined,
  })), [months, cur]);
  const avgSaved = trend.length ? sum(trend.map(t => t.Saved)) / trend.length : 0;

  /** the month's expenses grouped for the ranked list, and split for the "where did each dollar go" bar */
  const { ranked, split } = useMemo(() => {
    const byId = new Map(cats.map(c => [c.id, c]));
    const g = new Map<string, number>();
    let fixed = 0, utility = 0, everyday = 0, oneOff = 0;
    for (const e of detail?.expenses ?? []) {
      const c = byId.get(e.category_id); if (!c) continue;
      const label = c.parent_id ? byId.get(c.parent_id)?.name ?? c.name : c.name;
      g.set(label, (g.get(label) ?? 0) + e.amount);
      if (c.kind === 'fixed') fixed += e.amount; else if (c.kind === 'utility') utility += e.amount;
      else if (c.counts_as_living) everyday += e.amount; else oneOff += e.amount;
    }
    return { ranked: [...g].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value), split: { fixed, utility, everyday, oneOff } };
  }, [detail, cats]);

  if (!cur) return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Dashboard" />
      <EmptyState title="Welcome" text="Add your first month, or import your spreadsheet, to see your dashboard come alive."
        action={<Link to="/month" className={btnCls}>Add a month</Link>} />
    </div>
  );

  const saved = cur.actual ?? cur.predicted;
  const rate = cur.income ? (saved / cur.income) * 100 : 0;
  const gap = cur.actual == null ? null : cur.actual - cur.predicted;
  const netWorth = sum(accounts.map(a => a.balance));
  const base = Math.max(cur.income, cur.expenses, 1);
  const segs = [
    { label: 'Fixed costs', value: split.fixed, color: '#94b0d4' },
    { label: 'Utilities', value: split.utility, color: '#e3c27a' },
    { label: 'Everyday', value: split.everyday, color: '#7fb3cf' },
    { label: 'One-off', value: split.oneOff, color: '#d49aa6' },
    { label: 'Saved', value: Math.max(0, cur.income - cur.expenses), color: '#5ccf9f' },
  ];
  const maxRank = ranked[0]?.value || 1;
  const hist = months.filter(m => m.income > 0 && m.year * 12 + m.month <= cur.year * 12 + cur.month).slice(-12);
  const sIn = hist.map(m => m.income), sOut = hist.map(m => m.expenses), sLiv = hist.map(m => m.living);
  const byType = (Object.keys(TYPE_LABEL) as AccountType[]).map(t => ({ t, v: sum(accounts.filter(a => a.type === t).map(a => a.balance)) })).filter(x => x.v !== 0);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title={`${person ? person + ' · ' : ''}${MONTHS[cur.month - 1]} ${cur.year}`} subtitle={`${gap == null ? 'You are on track to save' : 'You saved'} ${money(saved)}, ${rate.toFixed(0)}% of your income.`}
        actions={<MonthNav year={cur.year} month={cur.month} months={[...months.filter(m => m.income > 0 || m.expenses > 0 || (m.year === cur.year && m.month === cur.month)), ...(months.some(m => m.year === cur.year && m.month === cur.month) ? [] : [cur])]} onChange={(y, m) => setSel({ y, m })} />} />

      {/* HERO: what did I save, and where did each dollar of income go */}
      <div className="grid gap-4 sm:gap-6 xl:grid-cols-12">
        <section className="hero-ink cq overflow-hidden rounded-3xl p-5 sm:p-8 xl:col-span-8">
          <i className="hero-grain" aria-hidden />
          <p className="text-sm font-medium text-indigo-100">{MONTHS[cur.month - 1]} {cur.year} · {cur.actual == null ? 'predicted so far' : 'final'}</p>
          <div className="mt-2 flex items-center justify-between gap-4 sm:gap-6">
            <div className="min-w-0">
              <p className="display tabular num-hero max-w-full"><CountUp value={saved} /></p>
              <p className="mt-1 text-lg text-indigo-100">{cur.actual == null ? 'you will save' : 'saved'} this month</p>
            </div>
            <HeroRing pct={rate} size={96} className="sm:scale-[1.3] sm:origin-right"><div><p className="text-xl font-semibold leading-none tabular"><CountUp value={rate} format={n => `${n.toFixed(0)}%`} /></p><p className="mt-0.5 text-[9px] uppercase tracking-widest text-indigo-100">of income</p></div></HeroRing>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-sm">
            {cur.actual != null && <span className="rounded-full bg-white/15 px-3 py-1">Predicted <b>{money(cur.predicted)}</b></span>}
            {gap != null && <span className={`rounded-full px-3 py-1 font-semibold ${gap >= 0 ? 'bg-emerald-400/25 text-emerald-50' : 'bg-rose-400/30 text-rose-50'}`}>{gap >= 0 ? '+' : '−'}{money(Math.abs(gap))} vs predicted</span>}
          </div>

          <p className="mb-3 mt-8 text-sm font-medium text-indigo-100">Where each dollar of the {money(cur.income)} you earned went</p>
          <div className="relative flex h-3 w-full overflow-hidden rounded-full bg-white/15 sm:h-3.5">
            {segs.map(s => s.value > 0 && <div key={s.label} title={`${s.label}: ${money(s.value)}`} className="grow" style={{ width: `${(s.value / base) * 100}%`, background: s.color }} />)}
            <span className="sheen pointer-events-none absolute inset-0" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 text-sm min-[420px]:grid-cols-3 sm:grid-cols-5">
            {segs.map(s => (
              <div key={s.label}>
                <p className="flex items-center gap-2 text-indigo-100"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />{s.label}</p>
                <p className="tabular text-lg font-semibold">{money(s.value)}</p>
              </div>
            ))}
          </div>
          {cur.note && <p className="mt-5 rounded-xl bg-white/10 px-4 py-2.5 text-sm text-indigo-50">{cur.note}</p>}
          {cur.actual == null && <Link to="/month" className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white underline-offset-4 hover:underline">Month over? Record the actual savings <ArrowRight size={15} /></Link>}
        </section>

        <Card className="xl:col-span-4" title="Net worth" subtitle={accounts.length ? 'All your accounts' : 'Add accounts to track your wealth'} right={<Link to="/accounts" className="text-sm font-medium text-indigo-600 hover:underline">Manage</Link>}>
          <p className="tabular display num-lg bg-gradient-to-r from-indigo-700 to-teal-600 bg-clip-text text-transparent"><CountUp value={netWorth} /></p>
          {byType.length === 0
            ? <Link to="/accounts" className={`${btnCls} mt-5`}>Add your accounts</Link>
            : <>
              <div className="relative mx-auto mt-3 h-40 w-40 sm:h-44 sm:w-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={byType.map(({ t, v }) => ({ name: TYPE_LABEL[t], value: Math.max(v, 0) }))} dataKey="value" innerRadius="68%" outerRadius="100%" paddingAngle={3} cornerRadius={6} stroke="none">
                    {byType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie></PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><p className="text-xl font-semibold text-slate-900">{byType.length}</p><p className="text-[10px] uppercase tracking-widest text-slate-500">types</p></div></div>
              </div>
              <ul className="mt-4 space-y-2.5">{byType.map(({ t, v }, i) => (
                <li key={t} className="flex justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2 text-slate-600"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{TYPE_LABEL[t]}<span className="text-xs text-slate-400">{((v / (netWorth || 1)) * 100).toFixed(0)}%</span></span><b className="tabular text-slate-900">{money(v)}</b></li>))}</ul>
            </>}
        </Card>
      </div>

      <EmergencyFund s={emergencyStatus(months.filter(m => m.year * 12 + m.month <= cur.year * 12 + cur.month), accounts, settings?.emergency_months ?? 3)} />

      {/* three plain numbers */}
      <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 sm:gap-6 lg:grid-cols-3">
        <Kpi label="Money in" value={money(cur.income)} num={cur.income} spark={sIn} icon={Banknote} tone="green" delta={prev ? pct(cur.income, prev.income) : null} hint="vs last month" />
        <Kpi label="Money out" value={money(cur.expenses)} num={cur.expenses} spark={sOut} icon={Receipt} tone="rose" delta={prev ? pct(cur.expenses, prev.expenses) : null} goodWhenUp={false} hint="fixed + utilities + spending" />
        <Kpi label="Living cost" value={money(cur.living)} num={cur.living} spark={sLiv} icon={Home} tone="amber" delta={prev ? pct(cur.living, prev.living) : null} goodWhenUp={false} hint="everyday spending only" />
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-12">
        <Card className="xl:col-span-4 xl:order-2" title="Where the money went" subtitle={`Biggest items in ${MONTHS[cur.month - 1]}`}>
          <ul className="space-y-3.5">
            {ranked.slice(0, 7).map((r, i) => (
              <li key={r.name}>
                <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-medium text-slate-700">{r.name}</span>
                  <span className="tabular text-slate-900"><b>{money(r.value)}</b> <span className="text-xs text-slate-400">{((r.value / (cur.expenses || 1)) * 100).toFixed(0)}%</span></span></div>
                <div className="h-2 rounded-full bg-slate-100"><div className="grow h-full rounded-full" style={{ width: `${(r.value / maxRank) * 100}%`, background: COLORS[i % COLORS.length] }} /></div>
              </li>
            ))}
            {ranked.length === 0 && <p className="text-sm text-slate-500">No expenses recorded for this month yet.</p>}
          </ul>
        </Card>

        <Card className="xl:col-span-8 xl:order-1" title="How much you saved each month" subtitle="Last 12 months · dashed line = average"
          right={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">avg {money(avgSaved)}</span>}>
          <div className="h-[240px] sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%" minHeight={220}>
            <BarChart data={trend} margin={{ left: -8, top: 8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="name" {...axis} /><YAxis {...axis} tickFormatter={(v: number) => `${v < 0 ? "-" : ""}$${Math.abs(v) / 1000}k`} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: '#3f6ba311' }} /><Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#64748b' }} />
              <ReferenceLine y={avgSaved} stroke="#64748b" strokeDasharray="5 5" />
              <ReferenceLine y={0} stroke="#cbd5e1" />
              <Bar dataKey="Savings account" stackId="s" fill="#2f5688" maxBarSize={38} />
              <Bar dataKey="Investments" stackId="s" fill="#0f9d6e" maxBarSize={38} radius={[6, 6, 0, 0]} />
              <Bar dataKey="Predicted" stackId="s" fill="#94b0d4" maxBarSize={38} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}
