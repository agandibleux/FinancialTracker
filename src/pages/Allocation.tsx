import { useEffect, useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, Sparkles } from 'lucide-react';
import { useAccounts, useMonths, usePeople, useRooms, useSave, useSettings } from '../api';
import { money, sum } from '../lib/calc';
import { emergencyStatus } from '../lib/emergency';
import { EmergencyFund } from '../components/EmergencyFund';
import { allocate, planRoom, type RoomRowOut } from '../lib/allocation';
import { ACCOUNT_META, REGISTERED, type AccountType, type Room } from '../lib/types';
import { Badge, COLORS, Card, ChartTooltip, CountUp, EmptyState, HeroRing, MoneyInput, PageHeader, Tabs, btnCls, btnGhost } from '../components/ui';

/** Fill order when savings can't cover everything: closest-to-home goal first, then tax-free, then tax-deferred. */
const PRIORITY: AccountType[] = ['FHSA', 'TFSA', 'RRSP'];
const k = (pid: number, t: AccountType) => `${pid}|${t}`;

export default function Allocation() {
  const months = useMonths().data ?? [];
  const accounts = useAccounts().data ?? [];
  const rooms = useRooms().data ?? [];
  const people = usePeople().data ?? [];
  const settings = useSettings().data;
  const saveRooms = useSave<Room[]>('PUT', '/api/rooms');

  const now = new Date();
  const thisYear = now.getFullYear();
  const [which, setWhich] = useState<'this' | 'next'>('this');
  const year = which === 'this' ? thisYear : thisYear + 1;

  /* ---- savings picture: only savings accounts (CASH) above the emergency fund, plus predicted savings ---- */
  const em = emergencyStatus(months, accounts, settings?.emergency_months ?? 3);
  const cash = em.cash, target = em.target;
  const excess = Math.max(0, em.diff);
  const recent = months.filter(m => m.income > 0).slice(-3);
  const avgPredicted = recent.length ? Math.max(0, sum(recent.map(m => m.predicted)) / recent.length) : 0;
  /** predicted savings for the months left in `y`: your entered predictions where they exist, the recent average elsewhere */
  const predictedSavings = (y: number) => {
    const first = y === thisYear ? now.getMonth() + 1 : 1;
    let total = 0;
    for (let mo = first; mo <= 12; mo++) {
      const m = months.find(x => x.year === y && x.month === mo);
      total += m && m.income > 0 ? Math.max(0, m.predicted) : avgPredicted;
    }
    return total;
  };
  const thisPredicted = predictedSavings(thisYear), nextPredicted = predictedSavings(thisYear + 1);
  const monthsLeft = Math.max(1, 12 - now.getMonth());
  const surplus = (which === 'this' ? thisPredicted / monthsLeft : nextPredicted / 12);

  /* ---- room draft for the selected year (edited inline, saved explicitly) ---- */
  const fromDb = (y: number) => {
    const m = new Map<string, { room: number; contributed: number }>();
    for (const r of rooms) if (r.year === y) m.set(k(r.person_id, r.account_type), { room: r.room, contributed: r.contributed });
    return m;
  };
  const [draft, setDraft] = useState<Map<string, { room: number; contributed: number }>>(new Map());
  const [dirty, setDirty] = useState(false);
  const roomsSig = JSON.stringify(rooms);
  useEffect(() => { setDraft(fromDb(year)); setDirty(false); }, [roomsSig, year]); // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (pid: number, t: AccountType, patch: Partial<{ room: number; contributed: number }>) => {
    setDraft(d => { const n = new Map(d); n.set(k(pid, t), { room: 0, contributed: 0, ...n.get(k(pid, t)), ...patch }); return n; });
    setDirty(true);
  };
  const save = () => saveRooms.mutate(people.flatMap(p => REGISTERED.map(t => {
    const v = draft.get(k(p.id, t)) ?? { room: 0, contributed: 0 };
    return { person_id: p.id, account_type: t, year, room: v.room, contributed: v.contributed };
  })));
  const prevYearHasData = rooms.some(r => r.year === year - 1 && r.room > 0);
  const copyFromPrev = () => {
    const prev = fromDb(year - 1);
    setDraft(new Map([...prev].map(([key, v]) => [key, { room: v.room, contributed: 0 }])));
    setDirty(true);
  };

  /* ---- plans (next year only gets what this year's plan leaves over) ---- */
  const rowsFor = (y: number, src: Map<string, { room: number; contributed: number }>) =>
    people.flatMap(p => REGISTERED.map(t => ({ key: `${p.name}|${t}`, account: t, room: src.get(k(p.id, t))?.room ?? 0, contributed: src.get(k(p.id, t))?.contributed ?? 0, y })));
  const plan = useMemo(() => {
    const thisPlan = planRoom({ rows: rowsFor(thisYear, which === 'this' ? draft : fromDb(thisYear)), monthsLeft, monthlySurplus: surplus, excessCash: excess, priority: PRIORITY });
    if (which === 'this') return thisPlan;
    return planRoom({ rows: rowsFor(year, draft), monthsLeft: 12, monthlySurplus: surplus, excessCash: Math.max(0, excess - thisPlan.fundedBySavings), priority: PRIORITY });
  }, [draft, which, rooms, people, surplus, excess]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalRoom = sum(plan.rows.map(r => r.room));
  const noRoom = totalRoom <= 0;
  const monthsLabel = which === 'this' ? `${monthsLeft} month${monthsLeft > 1 ? 's' : ''} left in ${year}` : `all 12 months of ${year}`;
  const headline = noRoom ? `Add your ${year} room to get a plan`
    : plan.needed <= 0.5 ? 'Every account is maxed'
    : plan.gap <= 0.5 ? 'You can max everything'
    : `${money(plan.gap, 0)} short of maxing out`;

  /* ---- this month's split (unchanged logic) ---- */
  const roomLeftByType = useMemo(() => {
    const out: Partial<Record<AccountType, number>> = {};
    const cur = fromDb(thisYear);
    for (const t of REGISTERED) out[t] = sum(people.map(p => { const v = cur.get(k(p.id, t)); return v ? Math.max(0, v.room - v.contributed) : 0; }));
    return out;
  }, [rooms, people]); // eslint-disable-line react-hooks/exhaustive-deps
  const defaultAmt = months.length ? Math.max(0, Math.round(months[months.length - 1].predicted)) : 0;
  const [amount, setAmount] = useState<number | null>(null);
  const amt = amount ?? defaultAmt;
  const rec = settings ? allocate({ amount: amt, emergencyTarget: target, cashBalance: cash, ratios: settings.ratios, roomLeft: roomLeftByType }) : null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Allocation" subtitle="Add your contribution room, and see exactly how to max it out: what to move from savings and what to set up monthly."
        actions={<Tabs value={which} onChange={setWhich} tabs={[{ id: 'this', label: `This year · ${thisYear}` }, { id: 'next', label: `Next year · ${thisYear + 1}` }]} />} />

      {/* hero */}
      <section className="hero-ink rounded-3xl p-5 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
          <HeroRing pct={noRoom ? 0 : plan.pctFilled} size={148} stroke={13}>
            <div><p className="tabular text-3xl font-semibold tracking-tight">{noRoom ? '—' : `${Math.round(plan.pctFilled)}%`}</p><p className="text-xs text-white/70">already used</p></div>
          </HeroRing>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/70">{year} contribution room · {monthsLabel}</p>
            <h2 className="display mt-2 text-4xl leading-[1.05] sm:text-5xl">{headline}</h2>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80">
              {noRoom ? `Enter your TFSA, RRSP and FHSA room for ${year} below. Everything else is calculated for you.`
                : plan.needed <= 0.5 ? 'Nothing left to contribute this year.'
                : <>You have <b className="text-white">{money(plan.needed, 0)}</b> of room left. Savings above your emergency fund can cover <b className="text-white">{money(plan.fundedBySavings, 0)}</b>, and predicted savings the rest.</>}
            </p>
          </div>
        </div>
        {!noRoom && (
          <dl className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-white/15 text-sm sm:grid-cols-4">
            {[
              ['Room left', plan.needed, ''],
              ['From savings now', plan.fundedBySavings, ''],
              ['Per month', plan.perMonth, '/mo'],
              ['Shortfall', plan.gap, ''],
            ].map(([label, v, suf]) => (
              <div key={label as string} className="bg-white/[.06] px-4 py-3.5">
                <dt className="text-xs text-white/65">{label}</dt>
                <dd className="tabular mt-1 text-xl font-semibold"><CountUp value={v as number} format={n => money(n, 0)} />{suf}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* what the plan can draw on: savings accounts + predicted savings only */}
      <Card title="What you can draw on" subtitle="Only your savings accounts and predicted savings are used to fill room">
        <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
          {[
            ['Savings accounts', money(cash, 0), 'balance today'],
            ['Kept for emergencies', money(Math.min(cash, target), 0), `${em.targetMonths} months of living costs`],
            ['Available to invest', money(excess, 0), excess > 0 ? 'above your emergency fund' : 'emergency fund not full yet'],
            [`Predicted savings ${which === 'this' ? `rest of ${year}` : year}`, money(which === 'this' ? thisPredicted : nextPredicted, 0), `${money(surplus, 0)}/month`],
          ].map(([l, v, h]) => (
            <div key={l}><dt className="text-xs text-slate-400">{l}</dt><dd className="tabular mt-1 text-2xl font-semibold tracking-tight text-slate-900">{v}</dd><dd className="text-xs text-slate-500">{h}</dd></div>
          ))}
        </dl>
        {em.state === 'under' && <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" />Your emergency fund is {money(-em.diff, 0)} short, so nothing is taken from savings. Contributions come from predicted savings only.</p>}
      </Card>

      {/* advice + room editor */}
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-5">
        <div className="space-y-4 sm:space-y-6 lg:col-span-3">
          <Card title={`${year} room`} subtitle="From your CRA My Account notice. Contributed = what you've already put in this year."
            right={<div className="flex gap-2">
              {prevYearHasData && noRoom && <button className={btnGhost} onClick={copyFromPrev}><Copy size={14} />Copy {year - 1}</button>}
              <button className={btnCls} onClick={save} disabled={!dirty || saveRooms.isPending}>{saveRooms.isPending ? 'Saving…' : dirty ? 'Save room' : 'Saved'}</button>
            </div>}>
            {people.length === 0 ? (
              <EmptyState title="Add people first" text="Contribution room is tracked per person." action={<Link to="/settings" className={btnCls}>Open settings</Link>} />
            ) : (
              <div className="space-y-5">
                {people.map(p => (
                  <div key={p.id}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{p.name}</p>
                    <div className="space-y-2">
                      {REGISTERED.map(t => {
                        const v = draft.get(k(p.id, t)) ?? { room: 0, contributed: 0 };
                        return (
                          <div key={t} className="grid grid-cols-[84px_1fr_1fr] items-center gap-2 sm:grid-cols-[120px_1fr_1fr] sm:gap-3">
                            <span className="flex items-center gap-2 text-sm font-medium text-slate-800">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ACCOUNT_META[t].color }} />{t}
                            </span>
                            <label className="block"><span className="mb-0.5 block text-[11px] text-slate-400">Room</span><MoneyInput value={v.room} onChange={n => edit(p.id, t, { room: n })} /></label>
                            <label className="block"><span className="mb-0.5 block text-[11px] text-slate-400">Contributed</span><MoneyInput value={v.contributed} onChange={n => edit(p.id, t, { contributed: n })} /></label>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4 sm:space-y-6 lg:col-span-2">
          <Card title="What to do" subtitle={noRoom ? undefined : `Based on ${money(surplus, 0)}/month predicted savings and ${money(excess, 0)} above your emergency fund`}>
            {noRoom ? <p className="text-sm text-slate-500">Advice appears once you've entered some room.</p> : (
              <ol className="space-y-3">
                {plan.advice.map((a, i) => (
                  <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                    <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${a.tone === 'good' ? 'bg-emerald-50 text-emerald-600' : a.tone === 'warn' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>
                      {a.tone === 'good' ? <CheckCircle2 size={14} /> : a.tone === 'warn' ? <AlertTriangle size={14} /> : <ArrowRight size={14} />}
                    </span>
                    <span>{a.text}</span>
                  </li>
                ))}
              </ol>
            )}
            {which === 'next' && !noRoom && <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500"><Sparkles size={14} className="mt-0.5 shrink-0" />Next year's plan only counts savings that this year's plan doesn't already use.</p>}
          </Card>
          <p className="px-1 text-xs text-slate-400">Confirm official limits and carry-forward in CRA My Account. This tool only uses the numbers you enter.</p>
        </div>
      </div>

      {/* per-account breakdown */}
      {!noRoom && (
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
          {plan.rows.filter(r => r.room > 0).map(r => <AccountCard key={r.key} r={r} />)}
        </div>
      )}

      <EmergencyFund s={em} />

      {/* this month's savings */}
      <Card title="Where should this month's savings go?" subtitle="Emergency fund first, then by ratio, capped at this year's remaining room"
        right={<Link to="/settings" className="text-xs text-indigo-600 underline">edit ratios</Link>}>
        <div className="mb-4 flex items-center gap-3 text-sm">Amount to place
          <div className="w-40"><MoneyInput value={amt} onChange={setAmount} /></div>
          {amount != null && <button className="text-xs text-slate-500 underline" onClick={() => setAmount(null)}>reset to predicted</button>}
        </div>
        <div className="grid items-center gap-4 md:grid-cols-2">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={rec?.lines.map(l => ({ name: ACCOUNT_META[l.account].short, value: l.amount })) ?? []} dataKey="value" innerRadius={50} outerRadius={85} stroke="none" paddingAngle={2}>
                {rec?.lines.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="space-y-2 text-sm">
            {rec?.lines.map((l, i) => (
              <li key={l.account + i} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                <span><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{ACCOUNT_META[l.account].short}<span className="ml-2 text-xs text-slate-500">{l.reason}</span></span>
                <b className="tabular">{money(l.amount)}</b>
              </li>
            ))}
            {rec && rec.unallocated > 0.5 && <li className="text-amber-600">{money(rec.unallocated)} unallocated — all rooms are full; consider the savings account.</li>}
          </ul>
        </div>
      </Card>
    </div>
  );
}

function AccountCard({ r }: { r: RoomRowOut }) {
  const [name, t] = r.key.split('|') as [string, AccountType];
  const color = ACCOUNT_META[t].color;
  const pct = (n: number) => `${Math.min(100, (n / r.room) * 100)}%`;
  const tone = r.status === 'maxed' ? 'green' : r.status === 'on-track' ? 'indigo' : 'amber';
  return (
    <div className="rounded-3xl border border-slate-200/70 bg-white/95 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_8px_24px_-12px_rgba(15,23,42,0.08)]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{t}</p>
          <p className="text-xs text-slate-400">{name}</p>
        </div>
        <Badge tone={tone}>{r.status === 'maxed' ? 'Maxed' : r.status === 'on-track' ? 'On track' : 'Short'}</Badge>
      </div>
      <p className="tabular mt-4 text-2xl font-semibold tracking-tight text-slate-900">{money(r.remaining, 0)}<span className="ml-1.5 text-sm font-normal text-slate-400">left of {money(r.room, 0)}</span></p>
      <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${t} funding split`}>
        <div style={{ width: pct(r.contributed), background: color }} />
        <div style={{ width: pct(r.fromSavings), background: color, opacity: 0.55 }} />
        <div style={{ width: pct(r.fromMonthly), background: color, opacity: 0.28 }} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-slate-400">Done</dt><dd className="tabular font-medium text-slate-800">{money(r.contributed, 0)}</dd></div>
        <div><dt className="text-slate-400">From savings</dt><dd className="tabular font-medium text-slate-800">{money(r.fromSavings, 0)}</dd></div>
        <div><dt className="text-slate-400">Monthly</dt><dd className="tabular font-medium text-slate-800">{money(r.perMonth, 0)}</dd></div>
      </dl>
      {r.shortfall > 0.5 && <p className="mt-3 text-xs font-medium text-amber-600">{money(r.shortfall, 0)} can't be covered yet</p>}
    </div>
  );
}
