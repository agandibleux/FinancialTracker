import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, Download, Minus } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAccountHistory, useAccounts, usePeople } from '../api';
import { accountHistoryCsv } from '../local/routes';
import { downloadBlob } from '../local/download';
import { money, sum } from '../lib/calc';
import { ACCOUNT_META, ACCOUNT_TYPES, isInvested, type AccountType } from '../lib/types';
import { COLORS, Card, ChartTooltip, Kpi, PageHeader, btnGhost, GRID } from '../components/ui';


export default function Accounts() {
  const accounts = useAccounts().data ?? [];
  const people = usePeople().data ?? [];
  const history = useAccountHistory().data ?? [];

  const total = sum(accounts.map(a => a.balance));
  const byType = ACCOUNT_TYPES.map(t => ({ type: t, name: ACCOUNT_META[t].label, value: sum(accounts.filter(a => a.type === t).map(a => a.balance)) })).filter(x => x.value > 0);
  const registered = sum(accounts.filter(a => ['TFSA', 'RRSP', 'FHSA'].includes(a.type)).map(a => a.balance));
  const invested = sum(accounts.filter(a => isInvested(a.type)).map(a => a.balance));

  const owner = (pid: number) => people.find(p => p.id === pid)?.name ?? '';
  const label = (a: (typeof accounts)[number]) => `${a.type} · ${owner(a.person_id)}${a.name && a.name !== a.type ? ` · ${a.name}` : ''}`;

  // Daily history: for every date, each account's latest snapshot on or before it (gaps carry forward).
  const { series, dates } = useMemo(() => {
    const dates = [...new Set(history.map(h => h.date))].sort();
    const per = new Map(accounts.map(a => [a.id, history.filter(h => h.account_id === a.id).sort((x, y) => x.date.localeCompare(y.date))]));
    const series = dates.map(d => {
      const row: Record<string, number | string> = { name: d, total: 0 };
      for (const a of accounts) {
        const last = [...(per.get(a.id) ?? [])].reverse().find(h => h.date <= d);
        row[label(a)] = last?.balance ?? 0; row.total = (row.total as number) + (last?.balance ?? 0);
      }
      return row;
    });
    return { series, dates };
  }, [history, accounts, people]);
  const growth = series.length > 1 ? (series[series.length - 1].total as number) - (series[0].total as number) : 0;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Accounts" subtitle="Balances and net worth. A snapshot of every account is saved automatically each day." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Net worth" value={money(total)} tone="green" />
        <Kpi label="Registered" hint="TFSA · RRSP · FHSA" value={money(registered)} tone="violet" />
        <Kpi label="Invested" value={money(invested)} hint={`${total ? ((invested / total) * 100).toFixed(0) : 0}% of net worth · excl. cash & home`} tone="blue" />
        <Kpi label="Change over history" value={`${growth >= 0 ? '+' : ''}${money(growth)}`} hint={`${dates.length} daily snapshot${dates.length === 1 ? '' : 's'}`} tone="amber" />
      </div>

      <div className="grid gap-4 sm:gap-6 xl:grid-cols-3">
        <Card title="Net worth over time" subtitle="One band per account, from the daily snapshots" className="xl:col-span-2">
          {series.length < 2 ? <p className="text-sm text-slate-500">History started {dates[0] ?? 'today'}. Each day the app is open adds a point here.</p> : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={series}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} minTickGap={40} /><YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `$${v / 1000}k`} />
                <Tooltip content={<ChartTooltip />} /><Legend />
                {accounts.map((a, i) => <Area key={a.id} dataKey={label(a)} stackId="1" stroke={COLORS[i % COLORS.length]} fill={COLORS[i % COLORS.length]} fillOpacity={0.3} isAnimationActive={false} />)}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>
        <AllocationToday byType={byType} total={total} />
      </div>

      <DailyHistory series={series} accounts={accounts} label={label} />
    </div>
  );
}

/* ---------------- Daily history: a visual timeline instead of a wide table ---------------- */
type Row = Record<string, number | string>;
const RANGES = [['30D', 30], ['90D', 90], ['1Y', 365], ['All', 99999]] as const;
const parse = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); };
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`;

function Delta({ v, big = false }: { v: number | null; big?: boolean }) {
  if (v == null) return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">First day</span>;
  const flat = Math.abs(v) < 0.5, up = v > 0;
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`tabular inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 font-semibold ${big ? 'text-sm' : 'text-xs'} ${flat ? 'bg-slate-100 text-slate-500' : up ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
      <Icon size={13} />{flat ? 'No change' : signed(v)}
    </span>
  );
}

function DailyHistory({ series, accounts, label }: { series: Row[]; accounts: { id: number }[]; label: (a: any) => string }) {
  const [range, setRange] = useState<(typeof RANGES)[number][0]>('90D');
  const [open, setOpen] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);

  const days = useMemo(() => series.map((r, i) => ({
    date: r.name as string, total: r.total as number,
    delta: i ? (r.total as number) - (series[i - 1].total as number) : null,
    parts: accounts.map((a, j) => ({ a, color: COLORS[j % COLORS.length], name: label(a), v: r[label(a)] as number })),
  })), [series, accounts]);

  const n = RANGES.find(r => r[0] === range)![1];
  const view = days.slice(-n);
  const first = view[0], last = view[view.length - 1];
  const change = first && last ? last.total - first.total : 0;
  const changePct = first?.total ? (change / first.total) * 100 : 0;
  const moves = view.filter(d => d.delta != null);
  const best = moves.reduce<typeof moves[number] | null>((m, d) => (!m || d.delta! > m.delta! ? d : m), null);
  const worst = moves.reduce<typeof moves[number] | null>((m, d) => (!m || d.delta! < m.delta! ? d : m), null);
  const upDays = moves.filter(d => d.delta! > 0).length;

  const list = [...view].reverse();
  const shown = list.slice(0, limit);
  const monthOf = (d: string) => parse(d).toLocaleDateString('en-CA', { month: 'long', year: 'numeric' });
  const maxAbs = Math.max(1, ...moves.map(d => Math.abs(d.delta!)));

  const stat = (title: string, value: string, sub: string, tone = 'text-slate-900') => (
    <div className="cq rounded-2xl bg-slate-50/80 p-3.5 ring-1 ring-slate-200/60">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{title}</p>
      <p className={`tabular num-xl mt-1 font-semibold tracking-tight ${tone}`}>{value}</p>
      <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>
    </div>
  );

  return (
    <Card title="Daily history" subtitle="How your total moved, day by day. Tap a day to see each account."
      right={<button className={btnGhost} onClick={() => downloadBlob(new Blob([accountHistoryCsv()], { type: 'text/csv' }), 'account-history.csv')}><Download size={16} />CSV</button>}>
      {days.length === 0 ? <p className="text-sm text-slate-500">No snapshots yet. One is saved each day the app is open.</p> : (
        <div className="space-y-5">
          {/* range chips */}
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
            <div className="inline-flex gap-1 rounded-2xl bg-slate-200/60 p-1">
              {RANGES.map(([id]) => (
                <button key={id} onClick={() => { setRange(id); setLimit(10); setOpen(null); }}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${range === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{id}</button>
              ))}
            </div>
          </div>

          {/* headline for the range */}
          <div className="hero-ink cq overflow-hidden rounded-3xl p-5 sm:p-6">
            <p className="text-xs font-medium text-indigo-100">Total on {last && parse(last.date).toLocaleDateString('en-CA', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
            <p className="display tabular num-hero mt-1">{money(last?.total ?? 0)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className={`tabular inline-flex items-center gap-1 rounded-full px-3 py-1 font-semibold ${change >= 0 ? 'bg-emerald-400/25 text-emerald-50' : 'bg-rose-400/30 text-rose-50'}`}>
                {change >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}{signed(change)} · {Math.abs(changePct).toFixed(2)}%
              </span>
              <span className="text-indigo-100">over {view.length} day{view.length === 1 ? '' : 's'}</span>
            </div>
            {moves.length > 1 && (
              <div className="mt-4 h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={view} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <defs><linearGradient id="dh" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5ccf9f" stopOpacity={0.55} /><stop offset="100%" stopColor="#5ccf9f" stopOpacity={0} /></linearGradient></defs>
                    <YAxis hide domain={['dataMin', 'dataMax']} /><XAxis hide dataKey="date" />
                    <Area type="monotone" dataKey="total" stroke="#5ccf9f" strokeWidth={2.5} fill="url(#dh)" dot={false} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* quick facts */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {stat('Best day', best ? signed(best.delta!) : '–', best ? parse(best.date).toLocaleDateString('en-CA', { day: 'numeric', month: 'short' }) : 'Not enough data', 'text-emerald-600')}
            {stat('Worst day', worst ? signed(worst.delta!) : '–', worst ? parse(worst.date).toLocaleDateString('en-CA', { day: 'numeric', month: 'short' }) : 'Not enough data', worst && worst.delta! < 0 ? 'text-rose-600' : 'text-slate-900')}
            {stat('Up days', moves.length ? `${upDays} of ${moves.length}` : '–', moves.length ? `${Math.round((upDays / moves.length) * 100)}% of days` : 'Not enough data')}
            {stat('Snapshots', String(view.length), `since ${first ? parse(first.date).toLocaleDateString('en-CA', { day: 'numeric', month: 'short' }) : '–'}`)}
          </div>

          {/* daily moves as bars */}
          {moves.length > 1 && (
            <div>
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Change each day</p>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moves} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                    <XAxis hide dataKey="date" /><YAxis hide />
                    <Tooltip content={<ChartTooltip fmt={(v: number) => signed(v)} />} cursor={{ fill: '#3f6ba311' }} />
                    <Bar dataKey="delta" name="Change" radius={3} isAnimationActive={false}>
                      {moves.map(d => <Cell key={d.date} fill={d.delta! >= 0 ? '#10b981' : '#f43f5e'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-600">
            {days[0].parts.map(p => <span key={p.a.id} className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.name}</span>)}
          </div>

          {/* timeline */}
          <ol className="space-y-1">
            {shown.map((d, i) => {
              const m = monthOf(d.date), newMonth = i === 0 || monthOf(shown[i - 1].date) !== m;
              const isOpen = open === d.date, dt = parse(d.date), share = d.total || 1;
              return (
                <li key={d.date}>
                  {newMonth && <p className="sticky top-12 z-[1] -mx-1 bg-white/90 px-1 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 backdrop-blur md:top-0">{m}</p>}
                  <div className={`lift overflow-hidden rounded-2xl border ${isOpen ? 'border-indigo-200 bg-indigo-50/40' : 'border-slate-200/70 bg-white'}`}>
                    <button onClick={() => setOpen(isOpen ? null : d.date)} aria-expanded={isOpen} className="block w-full p-3 text-left sm:p-3.5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-100 text-center leading-none">
                        <span><span className="block text-lg font-semibold text-slate-900">{dt.getDate()}</span><span className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">{dt.toLocaleDateString('en-CA', { weekday: 'short' })}</span></span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                          <p className="tabular text-base font-semibold tracking-tight text-slate-900">{money(d.total)}</p>
                          <Delta v={d.delta} />
                        </div>
                        <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
                          {d.parts.map(p => p.v > 0 && <div key={p.a.id} style={{ width: `${(p.v / share) * 100}%`, background: p.color }} />)}
                        </div>
                      </div>
                      <ChevronDown size={18} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                    </button>
                    {isOpen && (
                      <ul className="mx-3 grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-1.5 border-t border-slate-200/70 pb-3 pt-3 text-sm sm:mx-3.5 sm:grid-cols-2">
                        {d.parts.map(p => (
                          <li key={p.a.id} className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2 text-slate-600"><i className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.color }} /><span className="min-w-0 [overflow-wrap:anywhere]">{p.name}</span></span>
                            <span className="tabular shrink-0 whitespace-nowrap font-semibold text-slate-900">{money(p.v)} <span className="text-xs font-normal text-slate-400">{((p.v / share) * 100).toFixed(0)}%</span></span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {list.length > limit && <button className={`${btnGhost} w-full`} onClick={() => setLimit(l => l + 14)}>Show 14 more days ({list.length - limit} left)</button>}
        </div>
      )}
    </Card>
  );
}

/* ---------------- Allocation today: a donut grouped by what the money is for ---------------- */
const GROUPS = [['Cash', 'Ready to spend'], ['Investing', 'Growing for the long run'], ['Home', 'Your house plans']] as const;

function AllocationToday({ byType, total }: { byType: { type: AccountType; name: string; value: number }[]; total: number }) {
  const [active, setActive] = useState<AccountType | null>(null);
  const shown = active ? byType.find(x => x.type === active) : null;
  const pct = (v: number) => (total ? (v / total) * 100 : 0);
  return (
    <Card title="Allocation today" subtitle="Where your net worth sits right now">
      {byType.length === 0 ? <p className="text-sm text-slate-500">Add accounts in Settings to see your allocation.</p> : (
        <div className="space-y-5">
          <div className="cq relative mx-auto aspect-square w-full max-w-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="name" innerRadius="68%" outerRadius="100%" paddingAngle={2} cornerRadius={6} stroke="none" isAnimationActive={false}
                  onMouseEnter={(_: unknown, i: number) => setActive(byType[i].type)} onMouseLeave={() => setActive(null)}>
                  {byType.map(x => <Cell key={x.type} fill={ACCOUNT_META[x.type].color} opacity={active && active !== x.type ? 0.35 : 1} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-[22%] text-center">
              <div className="min-w-0">
                <p className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{shown ? shown.name : 'Net worth'}</p>
                <p className="display tabular text-[clamp(1.1rem,9cqi,1.9rem)] leading-tight text-slate-900">{money(shown ? shown.value : total)}</p>
                {shown && <p className="text-xs font-semibold text-slate-500">{pct(shown.value).toFixed(0)}%</p>}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {GROUPS.map(([g, sub]) => {
              const items = byType.filter(x => ACCOUNT_META[x.type].group === g);
              if (!items.length) return null;
              const gt = sum(items.map(x => x.value));
              return (
                <div key={g}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{g} <span className="font-medium normal-case tracking-normal text-slate-400">· {sub}</span></p>
                    <p className="tabular whitespace-nowrap text-xs font-semibold text-slate-500">{pct(gt).toFixed(0)}%</p>
                  </div>
                  <ul className="space-y-1.5">
                    {items.map(x => (
                      <li key={x.type} onMouseEnter={() => setActive(x.type)} onMouseLeave={() => setActive(null)}
                        className={`rounded-2xl border p-3 transition ${active === x.type ? 'border-slate-300 bg-slate-50' : 'border-slate-200/70 bg-white'}`}>
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex min-w-0 items-center gap-2 font-medium text-slate-800"><i className="h-3 w-3 shrink-0 rounded-full" style={{ background: ACCOUNT_META[x.type].color }} /><span className="min-w-0">{x.name}</span></span>
                          <span className="tabular whitespace-nowrap text-sm font-semibold text-slate-900">{money(x.value)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full" style={{ width: `${pct(x.value)}%`, background: ACCOUNT_META[x.type].color }} /></div>
                          <span className="tabular w-9 text-right text-xs text-slate-500">{pct(x.value).toFixed(0)}%</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
