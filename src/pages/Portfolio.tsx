import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ClipboardPaste, ExternalLink, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccountHistory, useAccounts, useDelete, useDeposits, useHoldingHistory, useHoldings, usePeople, useSave } from '../api';
import { apiFetch } from '../local/routes';
import { money, sum } from '../lib/calc';
import { CLS, GEO, enrich, exposure, groupBy, parsePasted, yearlyStats, type Row, type YearStat } from '../lib/portfolio';
import type { Holding } from '../lib/types';
import { toast } from '../lib/toast';
import { SOURCES, googleUrl, yahooUrl } from '../lib/source';
import { Badge, COLORS, Card, ChartTooltip, CrossTable, EmptyState, GRID, Kpi, PageHeader, Tabs, btnCls, btnGhost, inputCls } from '../components/ui';

type SortKey = keyof Row;
/** Known totals invested per year, keyed by account id: the Non-registered ETF account's 2025 (opened with $0, $29,050 put in, ended at $34,601.28). */
const SEED_DEPOSITS: Record<string, Record<number, number>> = { '1': { 2025: 29050 } };
const pct = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}%`;
const tone = (n: number) => (n >= 0 ? 'text-emerald-600' : 'text-rose-600');
const blank = (account_id: number): Holding => ({ account_id, ticker: '', quote_symbol: '', info: '', sector: '', expense_ratio: 0, yield_pct: 0, shares: 0, avg_price: 0, price: 0, prev_close: 0, price_date: '', target_pct: 0, usa: 0, can: 0, other_geo: 0, stocks: 100, bonds: 0, other_cls: 0 });

function Mix({ title, data }: { title: string; data: { name: string; value: number; pct: number }[] }) {
  return (
    <Card title={title}>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2} stroke="none">
            {data.map((x, i) => <Cell key={x.name} fill={COLORS[i % COLORS.length]} />)}
          </Pie>
          <Tooltip content={<ChartTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <ul className="mt-2 space-y-1 text-sm">
        {data.map((x, i) => <li key={x.name} className="flex justify-between"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{x.name}</span><b className="tabular">{x.pct.toFixed(1)}%</b></li>)}
      </ul>
    </Card>
  );
}

function YearlyView({ stats, allAccts, setAllAccts, deposits, setDeposit }: {
  stats: YearStat[]; allAccts: boolean; setAllAccts: (b: boolean) => void; deposits: Record<number, number>; setDeposit: (year: number, v: number | null) => void;
}) {
  const known = stats.filter(y => y.returnPct !== null);
  const total = known.reduce((t, y) => t + (y.profit ?? 0), 0);
  const cum = known.reduce((f, y) => f * (1 + (y.returnPct ?? 0) / 100), 1) - 1;
  const best = known.length ? known.reduce((a, b) => ((b.returnPct ?? 0) > (a.returnPct ?? 0) ? b : a)) : null;
  const money0 = (n: number | null) => (n === null ? '–' : money(n, 0));
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {[false, true].map(v => (
          <button key={String(v)} onClick={() => setAllAccts(v)}
            className={`rounded-xl border px-3 py-1.5 text-sm font-medium ${v === allAccts ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>{v ? 'All investment accounts' : 'Selected account'}</button>
        ))}
      </div>
      {!stats.length ? (
        <EmptyState title="No history yet" text="Yearly stats are built from the daily account balances saved each day the app is open." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Growth" value={`${stats.reduce((t, y) => t + y.growth, 0) >= 0 ? '+' : ''}${money(stats.reduce((t, y) => t + y.growth, 0), 0)}`} tone="blue" hint="all years, incl. deposits" />
            <Kpi label="Market profit" value={known.length ? `${total >= 0 ? '+' : ''}${money(total, 0)}` : '–'} tone={total >= 0 ? 'green' : 'rose'} hint={known.length ? `${known.length} of ${stats.length} years` : 'enter deposits below'} />
            <Kpi label="Cumulative return" value={known.length ? pct(cum * 100) : '–'} tone={cum >= 0 ? 'indigo' : 'rose'} hint="chained yearly returns" />
            <Kpi label="Best year" value={best ? `${best.year}` : '–'} tone="violet" hint={best ? pct(best.returnPct ?? 0) : undefined} />
          </div>
          <Card title="Growth per year" subtitle="Value change over the year, deposits included. Return (%) below excludes deposits.">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={stats.map(y => ({ name: y.partial ? `${y.year}*` : `${y.year}`, Growth: Math.round(y.growth), Profit: y.profit === null ? null : Math.round(y.profit) }))}>
                <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" stroke="#94a3b8" fontSize={11} /><YAxis stroke="#94a3b8" fontSize={11} tickFormatter={v => `$${v / 1000}k`} />
                <Tooltip content={<ChartTooltip />} /><Legend />
                <Bar dataKey="Growth" fill="#3f6ba3" radius={[4, 4, 0, 0]} /><Bar dataKey="Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card pad={false} title="Year by year" subtitle="* partial year: history starts mid-year or the year is in progress. Balances include deposits; net deposits default to what you recorded per account in the monthly entry; type over a year to correct it (✓ = exact, from daily holdings).">
            <CrossTable className="overflow-x-auto pb-4">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {['Year', 'Start', 'End', 'Growth $', 'Growth %', 'Net deposits', 'Market profit', 'Return', 'Days'].map((h, i) => <th key={h} className={`px-3 py-2 ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}
                </tr></thead>
                <tbody className="tabular">
                  {[...stats].reverse().map(y => (
                    <tr key={y.year} className="border-b border-slate-100">
                      <td className="px-3 py-2 font-semibold">{y.year}{y.partial ? '*' : ''}</td>
                      <td className="px-3 py-2 text-right">{money(y.start, 0)}</td>
                      <td className="px-3 py-2 text-right font-medium">{money(y.end, 0)}</td>
                      <td className={`px-3 py-2 text-right ${tone(y.growth)}`}>{money(y.growth, 0)}</td>
                      <td className={`px-3 py-2 text-right ${tone(y.growthPct)}`}>{y.start ? pct(y.growthPct) : '–'}</td>
                      <td className="px-3 py-1 text-right">{y.exact ? <span className="text-slate-600">{money0(y.contributions)} ✓</span> :
                        <input type="number" step="any" placeholder="enter" className={`${inputCls} tabular !min-h-0 !w-24 !py-1 text-right`} value={deposits[y.year] ?? ''}
                          onChange={e => setDeposit(y.year, e.target.value === '' ? null : Number(e.target.value))} />}</td>
                      <td className={`px-3 py-2 text-right ${tone(y.profit ?? 0)}`}>{money0(y.profit)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${tone(y.returnPct ?? 0)}`}>{y.returnPct === null ? '–' : pct(y.returnPct)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{y.days}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CrossTable>
          </Card>
        </>
      )}
    </>
  );
}

export default function Portfolio() {
  const accounts = (useAccounts().data ?? []).filter(a => a.type !== 'CASH' && a.type !== 'HOME');
  const people = usePeople().data ?? [];
  const holdings = useHoldings().data ?? [];
  const qc = useQueryClient();
  const save = useSave<Holding[]>('PUT', '/api/holdings');
  const del = useDelete(id => `/api/holdings/${id}`);
  const [sel, setSel] = useState<number | null>(null);
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'value', dir: -1 });
  const [tab, setTab] = useState<'positions' | 'yearly' | 'edit'>('positions');
  const [allAccts, setAllAccts] = useState(false);
  const snaps = useHoldingHistory().data ?? [];
  const balances = useAccountHistory().data ?? [];
  const [deposits, setDeposits] = useState<Record<string, Record<number, number>>>(() => { try { return JSON.parse(localStorage.getItem('yearly-deposits') ?? JSON.stringify(SEED_DEPOSITS)); } catch { return {}; } });
  const [paste, setPaste] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const accId = sel ?? accounts.find(a => a.type === 'NONREG')?.id ?? accounts[0]?.id ?? 0;
  const acct = accounts.find(a => a.id === accId);
  const rows = useMemo(() => enrich(holdings.filter(h => h.account_id === accId && (h.shares > 0 || h.target_pct > 0))), [holdings, accId]);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const x = a[sort.k], y = b[sort.k];
    return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
  }), [rows, sort]);
  const depositRows = useDeposits().data ?? [];
  // Deposits recorded in the monthly entry, per year, for the accounts in scope.
  const savedPerYear = useMemo(() => {
    const ids = new Set(allAccts ? accounts.map(a => a.id) : [accId]), m: Record<number, number> = {};
    for (const x of depositRows) if (ids.has(x.account_id)) m[x.year] = (m[x.year] ?? 0) + x.amount;
    const years = balances.filter(b => ids.has(b.account_id)).map(b => Number(b.date.slice(0, 4)));
    if (years.length) delete m[Math.min(...years)]; // an account's first year also holds everything deposited before: enter it by hand
    return m;
  }, [depositRows, balances, accounts, accId, allAccts]);
  const scopeKey = allAccts ? 'all' : String(accId);
  const scopeDeposits = useMemo(() => ({ ...savedPerYear, ...(deposits[scopeKey] ?? {}) }), [savedPerYear, deposits, scopeKey]);
  const setDeposit = (year: number, v: number | null) => setDeposits(d => {
    const { [year]: _, ...rest } = d[scopeKey] ?? {}, next = { ...d, [scopeKey]: v === null ? rest : { ...rest, [year]: v } };
    localStorage.setItem('yearly-deposits', JSON.stringify(next)); return next;
  });
  const yearly = useMemo(() => yearlyStats(balances, snaps, new Set(allAccts ? accounts.map(a => a.id) : [accId]), scopeDeposits), [balances, snaps, accounts, accId, allAccts, scopeDeposits]);
  const [draft, setDraft] = useState<Record<number, Holding>>({});

  const value = sum(rows.map(r => r.value)), cost = sum(rows.map(r => r.cost));
  const day = sum(rows.map(r => r.dayChange)), income = sum(rows.map(r => r.incomeYear)), fees = sum(rows.map(r => r.feeYear));
  const lastDate = rows.map(r => r.price_date).filter(Boolean).sort().pop();

  const refresh = async (silent = false) => {
    setBusy(true);
    try {
      const res = await (await apiFetch('/api/holdings/refresh', { method: 'POST' })).json();
      qc.invalidateQueries();
      if (res.noProxy) { if (!silent) toast('Set the quote proxy URL in Settings → Sync & data to fetch live prices', 'error'); }
      else if (!silent) toast(res.failed?.length ? `Updated ${res.updated}; no quote for ${res.failed.join(', ')} (set the Yahoo symbol in Edit)` : `Updated ${res.updated} prices`, res.failed?.length ? 'error' : 'success');
    } catch { if (!silent) toast('Could not fetch prices (offline?)', 'error'); }
    setBusy(false);
  };
  const th = (k: SortKey, label: string, left = false) => (
    <th className={`cursor-pointer select-none px-3 py-2 ${left ? 'text-left' : 'text-right'} text-xs font-semibold uppercase tracking-wide text-slate-500`}
      onClick={() => setSort(s => ({ k, dir: s.k === k ? (-s.dir as 1 | -1) : -1 }))}>{label}{sort.k === k ? (sort.dir < 0 ? ' ↓' : ' ↑') : ''}</th>
  );
  const owner = (pid: number) => people.find(p => p.id === pid)?.name ?? '';

  if (!accounts.length) return <EmptyState title="No investment accounts" text="Add a TFSA / RRSP / FHSA / non-registered account in Settings first." />;

  const editable = holdings.filter(h => h.account_id === accId);
  const numField = (h: Holding, k: keyof Holding, w = '!py-1 w-20') => (
    <input type="number" step="any" className={`${inputCls} tabular ${w}`} value={h[k] as number}
      onChange={e => setDraft(d => ({ ...d, [h.id ?? -1]: { ...h, [k]: Number(e.target.value) } }))} />
  );
  const txtField = (h: Holding, k: keyof Holding, w = '!py-1 w-24') => (
    <input className={`${inputCls} ${w}`} value={h[k] as string}
      onChange={e => setDraft(d => ({ ...d, [h.id ?? -1]: { ...h, [k]: e.target.value } }))} />
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="ETF portfolio" subtitle="Positions per account: profit, daily change, exposure and drift vs your target."
        actions={<>
          <button className={btnGhost} onClick={() => setPaste('')}><ClipboardPaste size={16} />Paste table</button>
          <button className={btnCls} onClick={() => refresh()} disabled={busy}><RefreshCw size={16} className={busy ? 'animate-spin' : ''} />Refresh prices</button>
        </>} />

      <div className="flex flex-wrap gap-2">
        {accounts.map(a => (
          <button key={a.id} onClick={() => setSel(a.id)}
            className={`rounded-xl border px-4 py-2 text-sm font-medium ${a.id === accId ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
            {a.type} <span className="text-slate-400">· {owner(a.person_id)}{a.name ? ` · ${a.name}` : ''}</span>
          </button>
        ))}
      </div>

      {paste !== null && (
        <Card title="Paste from spreadsheet" subtitle={`Copy your table (with the "ETF/Stock" header row) and paste it. It replaces the holdings of ${acct?.type} · ${owner(acct?.person_id ?? 0)}.`}>
          <textarea className={`${inputCls} h-40 font-mono text-xs`} value={paste} onChange={e => setPaste(e.target.value)} placeholder="ETF/Stock	Info	Sector	..." />
          <div className="mt-3 flex gap-2">
            <button className={btnCls} disabled={!paste.trim()} onClick={() => {
              const parsed = parsePasted(paste, accId);
              if (!parsed.length) return toast('No rows found — include the header row starting with ETF/Stock', 'error');
              const old = holdings.filter(h => h.account_id === accId);
              Promise.all(old.map(h => apiFetch(`/api/holdings/${h.id}`, { method: 'DELETE' }))).then(() =>
                save.mutate(parsed, { onSuccess: () => { setPaste(null); refresh(); } }));
            }}>Import {paste.trim() ? parsePasted(paste, accId).length : 0} holdings</button>
            <button className={btnGhost} onClick={() => setPaste(null)}>Cancel</button>
          </div>
        </Card>
      )}

      {!rows.length && tab === 'positions' ? (
        <EmptyState title="No holdings yet" text="Paste your spreadsheet table or add positions manually in the Edit tab."
          action={<button className={btnCls} onClick={() => setTab('edit')}><Plus size={16} />Add holdings</button>} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Kpi label="Market value" value={money(value)} tone="blue" hint={lastDate ? `prices ${lastDate}` : 'prices not refreshed'} />
            <Kpi label="Total profit" value={`${cost ? (value - cost >= 0 ? '+' : '') : ''}${money(value - cost)}`} tone={value >= cost ? 'green' : 'rose'} delta={cost ? ((value - cost) / cost) * 100 : null} hint={`cost ${money(cost, 0)}`} />
            <Kpi label="Today" value={`${day >= 0 ? '+' : ''}${money(day)}`} tone={day >= 0 ? 'green' : 'rose'} delta={value - day ? (day / (value - day)) * 100 : null} />
            <Kpi label="Yearly income" value={money(income, 0)} tone="violet" hint={`${value ? ((income / value) * 100).toFixed(2) : 0}% yield`} />
            <Kpi label="Yearly fees" value={money(fees, 0)} tone="amber" hint={`${value ? ((fees / value) * 100).toFixed(2) : 0}% MER`} />
          </div>

          <Tabs tabs={[{ id: 'positions', label: 'Positions' }, { id: 'yearly', label: 'Yearly' }, { id: 'edit', label: 'Edit holdings' }]} value={tab} onChange={setTab} />

          {tab === 'yearly' ? (
            <YearlyView stats={yearly} allAccts={allAccts} setAllAccts={setAllAccts} deposits={scopeDeposits} setDeposit={setDeposit} />
          ) : tab === 'positions' ? (
            <>
              <Card pad={false} title="Positions" subtitle="Click a header to sort. Drift = current weight − your ideal %.">
                <CrossTable className="overflow-x-auto pb-4">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-slate-200">
                      {th('ticker', 'ETF', true)}{th('sector', 'Sector', true)}{th('shares', 'Shares')}{th('avg_price', 'Avg')}{th('price', 'Price')}
                      {th('dayPct', 'Day %')}{th('dayChange', 'Day $')}{th('value', 'Value')}{th('gain', 'Profit $')}{th('gainPct', 'Profit %')}
                      {th('weight', 'Weight')}{th('target_pct', 'Ideal')}{th('drift', 'Drift')}{th('yield_pct', 'Yield')}{th('expense_ratio', 'MER')}
                    </tr></thead>
                    <tbody className="tabular">
                      {sorted.map(r => (
                        <tr key={r.id} className="border-b border-slate-100">
                          <td className="px-3 py-2 font-semibold" title={r.info}>{r.ticker}
                            <div className="whitespace-nowrap text-[11px] font-normal leading-tight text-slate-400">
                              {r.yahoo_symbol ? (<>
                                <a className="hover:text-indigo-700 hover:underline" href={yahooUrl(r.yahoo_symbol)} target="_blank" rel="noreferrer" title={`Yahoo Finance · ${r.price_date || 'not refreshed yet'}`}>Yahoo · {r.yahoo_symbol}</a>
                                <a className="ml-1.5 inline-block align-middle hover:text-indigo-700" href={googleUrl(r.yahoo_symbol)} target="_blank" rel="noreferrer" title="Open in Google Finance"><ExternalLink size={10} /></a>
                              </>) : 'Manual price'}
                            </div></td>
                          <td className="px-3 py-2 text-slate-500">{r.sector}</td>
                          <td className="px-3 py-2 text-right">{r.shares}</td>
                          <td className="px-3 py-2 text-right">{r.avg_price.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{r.price.toFixed(2)}</td>
                          <td className={`px-3 py-2 text-right ${tone(r.dayPct)}`}>{r.prev_close ? pct(r.dayPct) : '–'}</td>
                          <td className={`px-3 py-2 text-right ${tone(r.dayChange)}`}>{r.prev_close ? money(r.dayChange) : '–'}</td>
                          <td className="px-3 py-2 text-right font-medium">{money(r.value)}</td>
                          <td className={`px-3 py-2 text-right ${tone(r.gain)}`}>{money(r.gain)}</td>
                          <td className={`px-3 py-2 text-right ${tone(r.gainPct)}`}>{pct(r.gainPct)}</td>
                          <td className="px-3 py-2 text-right">{r.weight.toFixed(1)}%</td>
                          <td className="px-3 py-2 text-right text-slate-500">{r.target_pct ? `${r.target_pct}%` : '–'}</td>
                          <td className="px-3 py-2 text-right">{r.target_pct || r.weight ? <Badge tone={Math.abs(r.drift) < 2 ? 'green' : r.drift > 0 ? 'amber' : 'blue'}>{pct(r.drift)}</Badge> : '–'}</td>
                          <td className="px-3 py-2 text-right">{r.yield_pct.toFixed(2)}%</td>
                        </tr>
                      ))}
                      <tr className="font-bold">
                        <td className="px-3 py-2" colSpan={6}>Total</td>
                        <td className={`px-3 py-2 text-right ${tone(day)}`}>{money(day)}</td>
                        <td className="px-3 py-2 text-right">{money(value)}</td>
                        <td className={`px-3 py-2 text-right ${tone(value - cost)}`}>{money(value - cost)}</td>
                        <td className={`px-3 py-2 text-right ${tone(value - cost)}`}>{cost ? pct(((value - cost) / cost) * 100) : ''}</td>
                        <td className="px-3 py-2 text-right">100%</td><td colSpan={4} />
                      </tr>
                    </tbody>
                  </table>
                </CrossTable>
              </Card>

              <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-4">
                <Mix title="By location" data={exposure(rows, GEO)} />
                <Mix title="By asset class" data={exposure(rows, CLS)} />
                <Mix title="By sector" data={groupBy(rows, r => r.sector)} />
                <Mix title="By ETF" data={groupBy(rows, r => r.ticker)} />
              </div>

              <Card title="Current vs ideal weight" subtitle="Where new money should go: the most negative drift.">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={sorted.map(r => ({ name: r.ticker, Current: +r.weight.toFixed(1), Ideal: r.target_pct }))}>
                    <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey="name" stroke="#94a3b8" fontSize={11} /><YAxis stroke="#94a3b8" fontSize={11} unit="%" />
                    <Tooltip /><Legend />
                    <Bar dataKey="Current" fill="#3f6ba3" radius={[4, 4, 0, 0]} /><Bar dataKey="Ideal" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card title="Data sources" subtitle="Where every number on this page comes from.">
                <dl className="divide-y divide-slate-100 text-sm">
                  {SOURCES.map(x => (
                    <div key={x.field} className="grid gap-1 py-2.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)_minmax(0,1.2fr)] md:gap-4">
                      <dt className="font-medium text-slate-900">{x.field}</dt><dd className="text-slate-700">{x.from}</dd><dd className="text-slate-500">{x.how}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs text-slate-400">Quotes are informational and may be delayed; check your broker for official values. Mutual fund NAVs come from Yahoo via their Morningstar ID (set as the quote symbol).</p>
              </Card>
            </>
          ) : (
            <Card title="Edit holdings" subtitle="Yahoo symbol is only for price refresh (default: ticker + .TO, e.g. XAW.TO). Geography and asset-class splits should each add up to 100."
              right={<button className={btnGhost} onClick={() => save.mutate([blank(accId)])}><Plus size={16} />Add</button>}>
              <div className="space-y-4">
                {editable.length === 0 && <p className="text-sm text-slate-500">No holdings in this account yet. Press Add to create one.</p>}
                {editable.map(base => {
                  const h = draft[base.id!] ?? base, dirty = !!draft[base.id!];
                  const fld = (label: string, input: ReactNode, span = '') => <label className={`block min-w-0 space-y-1 ${span}`}><span className="block text-[11px] font-medium text-slate-500">{label}</span>{input}</label>;
                  const num = (label: string, k: keyof Holding) => fld(label, numField(h, k, '!py-2 w-full'));
                  const geo = h.usa + h.can + h.other_geo, cls = h.stocks + h.bonds + h.other_cls;
                  const sumPill = (v: number) => <span className={`tabular rounded-full px-2 py-0.5 text-[11px] font-semibold ${Math.abs(v - 100) < 0.5 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{+v.toFixed(1)}% / 100</span>;
                  const group = 'text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400';
                  return (
                    <div key={base.id} className={`cq overflow-hidden rounded-3xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition ${dirty ? 'border-amber-300 ring-4 ring-amber-100' : 'border-slate-200/70'}`}>
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-indigo-50 text-xs font-bold text-indigo-700">{(h.ticker || '?').slice(0, 3)}</span>
                          <div className="min-w-0"><p className="truncate text-base font-semibold tracking-tight text-slate-900">{h.ticker || 'New holding'}</p><p className="truncate text-xs text-slate-500">{h.sector || 'No sector'}</p></div>
                          {dirty && <Badge tone="amber">Unsaved</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <button className={btnGhost} aria-label={`Delete ${h.ticker}`} onClick={() => confirm(`Delete ${h.ticker}?`) && del.mutate(base.id!)}><Trash2 size={15} /></button>
                          <button className={btnCls} disabled={!dirty} onClick={() => save.mutate([h], { onSuccess: () => setDraft(d => { const { [base.id!]: _, ...r } = d; return r; }) })}>Save</button>
                        </div>
                      </div>
                      <div className="space-y-5 p-4 sm:p-5">
                        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                          {fld('Ticker', txtField(h, 'ticker', '!py-2 w-full'))}
                          {fld('Yahoo symbol', txtField(h, 'quote_symbol', '!py-2 w-full'))}
                          {fld('Sector', txtField(h, 'sector', '!py-2 w-full'), 'col-span-2 md:col-span-1')}
                        </div>
                        <div>
                          <p className={`${group} mb-2`}>Position</p>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                            {num('Shares', 'shares')}{num('Avg price', 'avg_price')}{num('Price', 'price')}
                            {num('Ideal %', 'target_pct')}{num('MER %', 'expense_ratio')}{num('Yield %', 'yield_pct')}
                          </div>
                        </div>
                        <div className="grid gap-5 md:grid-cols-2">
                          <div>
                            <div className="mb-2 flex items-center justify-between gap-2"><p className={group}>Geography</p>{sumPill(geo)}</div>
                            <div className="grid grid-cols-3 gap-3">{num('USA', 'usa')}{num('Canada', 'can')}{num('Other', 'other_geo')}</div>
                          </div>
                          <div>
                            <div className="mb-2 flex items-center justify-between gap-2"><p className={group}>Asset class</p>{sumPill(cls)}</div>
                            <div className="grid grid-cols-3 gap-3">{num('Stocks', 'stocks')}{num('Bonds', 'bonds')}{num('Other', 'other_cls')}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
