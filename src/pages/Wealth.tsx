import { useEffect, useMemo, useState } from 'react';
import { Area, Bar, BarChart, ReferenceLine, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useDelete, useSave, useWealth, useAccounts, useMonths } from '../api';
import { money, sum } from '../lib/calc';
import { buildProjection, projectSavings, type Withdrawal } from '../lib/projection';
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

type Mode = 'both' | 'invest' | 'savings';
interface Plan {
  horizon: number; returnPct: number; spread: number; contrib: number | null; growthPct: number;
  mode: Mode; savingsRate: number; savingsMonthly: number | null; withdrawals: Withdrawal[];
}
const DEFAULT_PLAN: Plan = { horizon: 30, returnPct: 7, spread: 2, contrib: null, growthPct: 0, mode: 'both', savingsRate: 3, savingsMonthly: null, withdrawals: [] };
const PLAN_KEY = 'wealth-plan-v1';
function usePlan() {
  const [plan, setPlan] = useState<Plan>(() => {
    try { return { ...DEFAULT_PLAN, ...JSON.parse(localStorage.getItem(PLAN_KEY) ?? '{}') }; } catch { return DEFAULT_PLAN; }
  });
  useEffect(() => { try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch { /* private mode */ } }, [plan]);
  const patch = (p: Partial<Plan>) => setPlan(x => ({ ...x, ...p }));
  return [plan, patch] as const;
}
const PRESETS = [{ label: 'Cautious', pct: 5 }, { label: 'Balanced', pct: 7 }, { label: 'Growth', pct: 9 }, { label: 'Bold', pct: 11 }];
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'both', label: 'Investments + savings', hint: 'Everything you put aside' },
  { id: 'invest', label: 'Investments only', hint: 'Without the savings account' },
  { id: 'savings', label: 'Savings only', hint: 'Without investing at all' },
];
const C_SAV = '#1baf7a';

function Slider({ label, value, min, max, step, onChange, suffix = '%' }: { label: string; value: number; min: number; max: number; step: number; onChange: (n: number) => void; suffix?: string }) {
  const pct = (value - min) / (max - min) * 100;
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-xs text-[#d9cfb4]"><span>{label}</span><b className="tabular text-base text-[#f6f1e4]">{value}{suffix}</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
        className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full accent-[#e3a21a]"
        style={{ background: `linear-gradient(90deg,#e3a21a ${pct}%,rgba(255,255,255,.14) ${pct}%)` }} />
    </label>
  );
}
function DarkMoney({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return <div className="rounded-lg bg-white/10 ring-1 ring-white/15 focus-within:ring-[#e3a21a] [&_input]:!border-0 [&_input]:!bg-transparent [&_input]:!text-[#f6f1e4] [&_input]:!shadow-none [&_input]:!ring-0"><MoneyInput value={value} onChange={onChange} /></div>;
}

export default function Wealth() {
  const saved = useWealth().data ?? [];
  const accounts = useAccounts().data ?? [];
  const months = useMonths().data ?? [];
  const save = useSave<WealthYear[]>('PUT', '/api/wealth');
  const del = useDelete(y => `/api/wealth/${y}`);
  const mobile = useIsMobile();
  const [rows, setRows] = useState<WealthYear[]>([]);
  const [plan, setPlanPatch] = usePlan();
  const horizon = plan.horizon;
  useEffect(() => setRows(saved), [JSON.stringify(saved)]);

  const invested = sum(accounts.filter(a => isInvested(a.type)).map(a => a.balance));
  const cashNow = sum(accounts.filter(a => a.type === 'CASH').map(a => a.balance));
  const now = new Date();
  const thisYear = now.getFullYear();
  // Today's real net worth anchors the current year: the rest of the year grows from it.
  const monthsLeft = (Date.UTC(thisYear + 1, 0, 1) - Date.UTC(thisYear, now.getMonth(), now.getDate())) / 864e5 / 365 * 12;
  const anchor = invested > 0 ? { year: thisYear, value: invested, monthsLeft } : undefined;

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
  const avgSavings = months.length ? sum(months.slice(-12).map(m => m.actual ?? m.predicted)) / Math.min(12, months.length) : 0;

  const invMonthly = Math.round(plan.contrib ?? avgMonthInv);
  const savMonthly = Math.round(plan.savingsMonthly ?? avgMonthCash);
  const useInv = plan.mode !== 'savings', useSav = plan.mode !== 'invest';
  const startYear = rows[0]?.year ?? thisYear;
  const opts = useMemo(() => ({
    defaults: { return_pct: plan.returnPct, monthly_contribution: useInv ? invMonthly : 0, growth_pct: plan.growthPct },
    startYear, startWealth: useInv ? invested : 0, withdrawals: plan.withdrawals,
  }), [plan.returnPct, plan.growthPct, plan.withdrawals, invMonthly, useInv, startYear, invested]);
  const proj = useMemo(() => useInv ? buildProjection(rows, horizon, anchor, opts) : buildProjection([], horizon, undefined, { ...opts, startWealth: 0 }),
    [rows, horizon, invested, monthsLeft, opts, useInv]);
  const lo = useMemo(() => buildProjection(rows, horizon, anchor, { ...opts, returnOffset: -plan.spread }), [rows, horizon, invested, monthsLeft, opts, plan.spread]);
  const hi = useMemo(() => buildProjection(rows, horizon, anchor, { ...opts, returnOffset: plan.spread }), [rows, horizon, invested, monthsLeft, opts, plan.spread]);
  const sav = useMemo(() => projectSavings(cashNow, plan.savingsRate, savMonthly, plan.growthPct, horizon), [cashNow, plan.savingsRate, savMonthly, plan.growthPct, horizon]);
  const sv = (i: number) => useSav ? sav[i] ?? 0 : 0;
  const iv = (a: typeof proj, i: number) => useInv ? a[i]?.end ?? 0 : 0;
  const totalAt = (i: number) => iv(proj, i) + sv(i);
  const cur = proj.find(p => p.year === thisYear) ?? proj[0];

  const applyAvg = () => setPlanPatch({ contrib: null, savingsMonthly: null });
  const defaultRow = (year: number): WealthYear => ({
    year, start_wealth: invested, return_pct: plan.returnPct,
    monthly_contribution: Math.round(invMonthly * Math.pow(1 + plan.growthPct / 100, year - startYear)), actual_end: null,
  });
  const set = (year: number, patch: Partial<WealthYear>) => setRows(rs => {
    let base = rs;
    if (!base.length && year !== thisYear) base = [defaultRow(thisYear)];
    return base.some(r => r.year === year) ? base.map(r => r.year === year ? { ...r, ...patch } : r) : [...base, { ...defaultRow(year), ...patch }].sort((a, b) => a.year - b.year);
  });
  const removeYear = (year: number) => {
    const idx = rows.findIndex(r => r.year === year);
    const nextRows = rows.filter(r => r.year !== year);
    // Removing the first year: the new first year keeps the wealth it would have started with.
    if (idx === 0 && nextRows[0]) nextRows[0] = { ...nextRows[0], start_wealth: proj.find(p => p.year === nextRows[0].year)?.start ?? nextRows[0].start_wealth };
    setRows(nextRows);
    if (saved.some(r => r.year === year)) del.mutate(year);
  };
  /** Rows shown in the table: saved ones, or the plan defaults for the rest of the horizon. */
  const shown: (WealthYear & { saved: boolean })[] = proj.map(p => {
    const r = rows.find(x => x.year === p.year);
    return r ? { ...r, saved: true } : { ...defaultRow(p.year), saved: false };
  });
  const resetProjected = () => setRows(rs => rs.filter(r => r.actual_end != null || r.year === rs[0]?.year).map((r, i) => i === 0 && r.actual_end == null ? { ...r, return_pct: plan.returnPct, monthly_contribution: invMonthly } : r));

  const addWd = () => {
    const y = Math.min(thisYear + horizon - 1, thisYear + 10);
    setPlanPatch({ withdrawals: [...plan.withdrawals, { id: Math.random().toString(36).slice(2), year: y, amount: 50000, tax_pct: 25 }] });
  };
  const patchWd = (id: string, p: Partial<Withdrawal>) => setPlanPatch({ withdrawals: plan.withdrawals.map(w => w.id === id ? { ...w, ...p } : w) });
  const wdTotals = proj.reduce((t, p) => ({ gross: t.gross + p.withdrawn, tax: t.tax + p.tax, net: t.net + p.net }), { gross: 0, tax: 0, net: 0 });

  const chart = proj.map((p, i) => ({
    name: String(p.year),
    Conservative: Math.round(iv(lo, i) + sv(i)), Optimistic: Math.round(iv(hi, i) + sv(i)),
    Actual: p.actualEnd == null ? null : Math.round(p.actualEnd + sv(i)),
    'Wealth path': Math.round(totalAt(i)),
    'Savings account': useSav ? Math.round(sv(i)) : null,
    'Today (actual)': p.asOf == null || !useInv ? null : Math.round(p.asOf + (useSav ? cashNow : 0)),
  }));
  const at = (n: number) => proj[n - 1] ? totalAt(n - 1) : null;
  const first = proj[0], last = proj[proj.length - 1];
  const lastI = proj.length - 1;
  const startTotal = (useInv ? first?.start ?? 0 : 0) + (useSav ? cashNow : 0);
  const contributed = shown.reduce((t, r, i) => t + (useInv ? r.monthly_contribution * 12 : 0) + (useSav ? savMonthly * 12 * Math.pow(1 + plan.growthPct / 100, i) : 0), 0);
  const endTotal = last ? totalAt(lastI) : 0;
  const growthTotal = endTotal - startTotal - contributed + wdTotals.gross;
  const nowIdx = Math.max(0, proj.findIndex(p => p.year === cur?.year));

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Wealth projection" subtitle="Set your plan once, then replace each year with your real result."
        actions={<button className={btnCls} onClick={() => save.mutate(rows)} disabled={save.isPending}>Save</button>} />

      {/* ── Plan settings ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl bg-[#10281f] p-5 text-[#f6f1e4] shadow-[0_20px_50px_-24px_rgba(16,40,31,0.7)] sm:p-7">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#e3a21a]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-[#1baf7a]/20 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#e3a21a]">Your plan</p>
              <h2 className="display mt-1 text-3xl leading-none sm:text-4xl">Over {horizon} years, to {thisYear + horizon - 1}</h2>
            </div>
            <div className="flex flex-wrap gap-1.5 rounded-full bg-white/10 p-1 ring-1 ring-white/10">
              {[10, 15, 20, 25, 30, 40].map(n => (
                <button key={n} onClick={() => setPlanPatch({ horizon: n })} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${n === horizon ? 'bg-[#e3a21a] text-[#10281f]' : 'text-[#d9cfb4] hover:bg-white/10'}`}>{n}y</button>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {MODES.map(m => (
              <button key={m.id} onClick={() => setPlanPatch({ mode: m.id })}
                className={`rounded-2xl px-4 py-3 text-left ring-1 transition ${plan.mode === m.id ? 'bg-[#f6f1e4] text-[#10281f] ring-[#f6f1e4]' : 'bg-white/5 text-[#f6f1e4] ring-white/15 hover:bg-white/10'}`}>
                <p className="text-sm font-semibold">{m.label}</p>
                <p className={`text-xs ${plan.mode === m.id ? 'text-[#10281f]/70' : 'text-[#d9cfb4]'}`}>{m.hint}</p>
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <div className={`space-y-4 ${useInv ? '' : 'opacity-40'}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#d9cfb4]">Investments</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map(pr => <button key={pr.label} onClick={() => setPlanPatch({ returnPct: pr.pct })} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${plan.returnPct === pr.pct ? 'bg-[#e3a21a] text-[#10281f] ring-[#e3a21a]' : 'ring-white/20 text-[#d9cfb4] hover:bg-white/10'}`}>{pr.label} {pr.pct}%</button>)}
              </div>
              <Slider label="Market return per year" value={plan.returnPct} min={0} max={15} step={0.5} onChange={n => setPlanPatch({ returnPct: n })} />
              <Slider label="Range shown (± return)" value={plan.spread} min={0} max={5} step={0.5} onChange={n => setPlanPatch({ spread: n })} />
              <div>
                <span className="text-xs text-[#d9cfb4]">Invested per month {plan.contrib == null ? <em className="not-italic text-[#e3a21a]">· your real average</em> : <button type="button" onClick={() => setPlanPatch({ contrib: null })} className="ml-1 rounded-full bg-[#e3a21a]/20 px-2 py-0.5 text-[11px] font-semibold text-[#e3a21a] hover:bg-[#e3a21a]/30">↺ back to real avg {money(avgMonthInv)}</button>}</span>
                <div className="mt-1"><DarkMoney value={invMonthly} onChange={n => setPlanPatch({ contrib: n })} /></div>
              </div>
            </div>

            <div className={`space-y-4 ${useSav ? '' : 'opacity-40'}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#d9cfb4]">Savings account</p>
              <Slider label="Interest rate" value={plan.savingsRate} min={0} max={6} step={0.25} onChange={n => setPlanPatch({ savingsRate: n })} />
              <div>
                <span className="text-xs text-[#d9cfb4]">Saved per month {plan.savingsMonthly == null ? <em className="not-italic text-[#e3a21a]">· your real average</em> : <button type="button" onClick={() => setPlanPatch({ savingsMonthly: null })} className="ml-1 rounded-full bg-[#e3a21a]/20 px-2 py-0.5 text-[11px] font-semibold text-[#e3a21a] hover:bg-[#e3a21a]/30">↺ back to real avg {money(avgMonthCash)}</button>}</span>
                <div className="mt-1"><DarkMoney value={savMonthly} onChange={n => setPlanPatch({ savingsMonthly: n })} /></div>
              </div>
              <p className="text-xs text-[#d9cfb4]">Starts from your savings balance today: <b className="text-[#f6f1e4]">{money(cashNow)}</b></p>
            </div>

            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#d9cfb4]">Both</p>
              <Slider label="Yearly raise in what you save" value={plan.growthPct} min={0} max={10} step={0.5} onChange={n => setPlanPatch({ growthPct: n })} />
              <button onClick={applyAvg} className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-medium ring-1 ring-white/15 transition hover:bg-white/15">Use my real savings average ({money(avgMonthInv)} invested · {money(avgMonthCash)} cash)</button>
              <button onClick={resetProjected} className="w-full rounded-lg px-3 py-2 text-xs text-[#d9cfb4] ring-1 ring-white/10 transition hover:bg-white/10">Reset projected years to these settings</button>
            </div>
          </div>

          <div className="mt-6 border-t border-white/10 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#d9cfb4]">Lump-sum withdrawals</p>
                <p className="text-xs text-[#d9cfb4]/80">Taken from investments at the end of the year, with the tax you expect on it.</p>
              </div>
              <button onClick={addWd} className="rounded-lg bg-[#e3a21a] px-3 py-1.5 text-sm font-semibold text-[#10281f] transition hover:brightness-110">+ Add withdrawal</button>
            </div>
            {plan.withdrawals.length > 0 && (
              <div className="mt-3 space-y-2">
                {plan.withdrawals.map(w => (
                  <div key={w.id} className="grid grid-cols-2 items-end gap-3 rounded-2xl bg-white/5 p-3 ring-1 ring-white/10 sm:grid-cols-[7rem_1fr_7rem_1fr_auto]">
                    <label className="text-xs text-[#d9cfb4]">Year<select className={`${inputCls} mt-1`} value={w.year} onChange={e => patchWd(w.id, { year: Number(e.target.value) })}>{proj.map(p => <option key={p.year}>{p.year}</option>)}</select></label>
                    <div className="text-xs text-[#d9cfb4]">Amount<div className="mt-1"><DarkMoney value={w.amount} onChange={n => patchWd(w.id, { amount: n })} /></div></div>
                    <label className="text-xs text-[#d9cfb4]">Tax %<NumInput className="mt-1" value={w.tax_pct} onChange={n => patchWd(w.id, { tax_pct: Math.min(100, Math.max(0, n)) })} /></label>
                    <p className="tabular text-sm"><span className="text-xs text-[#d9cfb4]">You keep</span><br /><b className="text-[#e3a21a]">{money(w.amount * (1 - w.tax_pct / 100))}</b><span className="text-xs text-[#d9cfb4]"> · tax {money(w.amount * w.tax_pct / 100)}</span></p>
                    <button className="justify-self-end rounded-lg px-2 py-1 text-[#d9cfb4] hover:bg-white/10" aria-label="Remove withdrawal" onClick={() => setPlanPatch({ withdrawals: plan.withdrawals.filter(x => x.id !== w.id) })}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Investments today" value={money(invested)} hint={`Real balance · savings ${money(cashNow)}`} tone="green" />
        <Kpi label={`End of ${cur?.year ?? '—'}`} value={cur ? money(totalAt(nowIdx)) : '—'} hint={cur?.isActual ? 'actual' : cur?.asOf != null ? 'forecast from today\'s real balance' : 'projected'} tone="blue" />
        <Kpi label="In 10 years" value={at(10) != null ? money(at(10)!) : '—'} tone="violet" />
        <Kpi label={`In ${horizon} years`} value={at(horizon) != null ? money(at(horizon)!) : '—'} tone="violet" />
        <Kpi label={wdTotals.gross ? 'Withdrawn · after tax' : 'Avg monthly savings'} value={wdTotals.gross ? money(wdTotals.net) : money(avgSavings)} hint={wdTotals.gross ? `${money(wdTotals.gross)} gross · ${money(wdTotals.tax)} tax` : 'Last 12 months'} tone="amber" />
      </div>

      <Card title="Projection" subtitle={`Orange bars = your real result for closed years. The path re-bases on each actual; dashed lines show ${(plan.returnPct - plan.spread).toFixed(1)}% and ${(plan.returnPct + plan.spread).toFixed(1)}% markets.`}>
        {last && first && (
          <div className="mb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 sm:mb-5">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400">Projected wealth in {last.year}</p>
              <p className="mt-1 bg-gradient-to-br from-[#0b0b0b] via-[#1c5cab] to-[#2a78d6] bg-clip-text text-[2.6rem] leading-none font-semibold tracking-tight text-transparent sm:text-6xl">{money(endTotal)}</p>
              <p className="mt-1 text-sm text-slate-500">{startTotal > 0 ? `${(endTotal / startTotal).toFixed(1)}× your starting ${money(startTotal)} · ` : ''}{money(contributed)} saved · {money(growthTotal)} from growth{wdTotals.gross ? ` · ${money(wdTotals.gross)} withdrawn` : ''}</p>
            </div>
            <div className="grid w-full grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-slate-50 px-4 py-3 text-[11px] text-slate-600 ring-1 ring-slate-200/70 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:gap-x-5 sm:gap-y-1 sm:rounded-full sm:py-2 sm:text-xs">
              <span className="flex items-center gap-2"><i className="inline-block h-0.5 w-4 rounded" style={{ background: C_PATH }} />Wealth path</span>
              <span className="flex items-center gap-2"><i className="inline-block h-0.5 w-4 rounded border-t border-dashed" style={{ borderColor: C_PLAN }} />Conservative / optimistic</span>
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
            <Line dataKey="Conservative" stroke={C_PLAN} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} />
            <Line dataKey="Optimistic" stroke={C_PLAN} strokeWidth={1.5} strokeDasharray="5 4" dot={false} activeDot={false} />
            {useSav && useInv && <Area dataKey="Savings account" type="monotone" stroke={C_SAV} strokeWidth={1.5} fill={C_SAV} fillOpacity={0.08} dot={false} activeDot={false} />}
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

      <Card title="Year by year & real year-end results"
        subtitle="Every year follows your plan above. Override a year if you like, and when it closes, type your real ending investments.">
                <div className="hidden sm:block">
          <CrossTable className="rounded-2xl border border-slate-200/70"><table className="w-full min-w-[900px] text-sm">
            <thead className="text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500"><tr>
              {['Year', 'Start wealth', 'Return %/yr', 'Contribution /mo', 'Projected end', 'Actual end (investments)', 'Variance', ''].map((h, i) => <th key={i} className={`whitespace-nowrap px-3 py-3 ${i === 6 ? 'text-right' : ''}`}>{h}</th>)}
            </tr></thead>
            <tbody className="align-middle">
              {shown.map(r => {
                const p = proj.find(x => x.year === r.year);
                const tag = r.actual_end != null ? ['Actual', 'bg-amber-50 text-amber-700 ring-amber-200'] : p?.asOf != null ? ['Live', 'bg-emerald-50 text-emerald-700 ring-emerald-200'] : ['Projected', 'bg-sky-50 text-sky-700 ring-sky-200'];
                return (
                  <tr key={r.year}>
                    <td className="px-3 py-3"><p className="text-base font-semibold tracking-tight text-slate-900">{r.year}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${tag[1]}`}>{tag[0]}</span></td>
                    <td className="min-w-[9rem] px-3 py-3">{r.year === startYear ? <MoneyInput value={r.start_wealth} onChange={v => set(r.year, { start_wealth: v })} /> : <span className="tabular text-slate-600">{money(p?.start ?? 0)}</span>}</td>
                    <td className="w-28 px-3 py-3"><NumInput value={r.return_pct} onChange={v => set(r.year, { return_pct: v })} /></td>
                    <td className="min-w-[9rem] px-3 py-3"><MoneyInput value={r.monthly_contribution} onChange={v => set(r.year, { monthly_contribution: v })} /></td>
                    <td className="px-3 py-3"><span className="tabular whitespace-nowrap font-semibold text-slate-900">{money(p?.projectedEnd ?? 0)}</span>{p?.asOf != null && <span className="mt-0.5 block text-[11px] font-medium text-emerald-700">Today {money(p.asOf)} · real balance</span>}{p && p.withdrawn > 0 && <span className="mt-0.5 block text-[11px] font-medium text-amber-700">− {money(p.withdrawn)} withdrawn · {money(p.net)} after tax</span>}</td>
                    <td className="min-w-[9rem] px-3 py-3"><MoneyInput value={r.actual_end ?? 0} onChange={v => set(r.year, { actual_end: v || null })} /></td>
                    <td className="min-w-[8.5rem] whitespace-nowrap px-3 py-3 text-right">{p?.variance == null ? <span className="text-slate-300">—</span> : <span className={`tabular inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${p.variance >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{p.variance >= 0 ? '+' : '−'}{money(Math.abs(p.variance))}</span>}</td>
                    <td className="px-2 py-3 text-right">{r.saved && <button className="rounded-lg px-2 py-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600" title={`Reset ${r.year} to the plan`} aria-label={`Reset ${r.year}`} onClick={() => removeYear(r.year)}>✕</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></CrossTable>
        </div>
        <div className="space-y-3 sm:hidden">
          {shown.map(r => {
            const p = proj.find(x => x.year === r.year);
            const tag = r.actual_end != null ? ['Actual', 'bg-amber-50 text-amber-700 ring-amber-200'] : p?.asOf != null ? ['Live', 'bg-emerald-50 text-emerald-700 ring-emerald-200'] : ['Projected', 'bg-sky-50 text-sky-700 ring-sky-200'];
            return (
              <div key={r.year} className="cq overflow-hidden rounded-3xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-14px_rgba(15,23,42,0.12)]">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="display text-3xl leading-none text-slate-900">{r.year}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${tag[1]}`}>{tag[0]}</span>
                  </div>
                  {r.saved && <button className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-slate-300 active:bg-rose-50 active:text-rose-600" aria-label={`Reset ${r.year}`} onClick={() => removeYear(r.year)}>✕</button>}
                </div>
                <div className="flex items-end justify-between gap-3 bg-gradient-to-br from-indigo-700 to-indigo-900 px-4 py-4 text-white">
                  <div className="min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-indigo-200">Projected end</p>
                    <p className="tabular num-lg font-semibold">{money(p?.projectedEnd ?? 0)}</p>
                  </div>
                  {p?.variance != null && <p className={`tabular shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${p.variance >= 0 ? 'bg-emerald-400/25 text-emerald-50' : 'bg-rose-400/30 text-rose-50'}`}>{p.variance >= 0 ? '+' : '−'}{money(Math.abs(p.variance))}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 text-xs font-medium text-slate-500">
                  <label className="space-y-1"><span>Start wealth</span>{r.year === startYear ? <MoneyInput value={r.start_wealth} onChange={v => set(r.year, { start_wealth: v })} /> : <p className="tabular flex min-h-[44px] items-center text-sm font-semibold text-slate-700">{money(p?.start ?? 0)}</p>}</label>
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
