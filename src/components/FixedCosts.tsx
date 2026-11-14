import { useMemo, useState } from 'react';
import { ChevronDown, CopyPlus, Plus, RotateCcw, Wand2 } from 'lucide-react';
import { useFixedPlan, useMonths, useSave } from '../api';
import { MONTHS, money } from '../lib/calc';
import { fixedBase, fixedFor, fixedOverride, type PlanRow } from '../lib/fixedPlan';
import type { Category } from '../lib/types';
import { Badge, Card, btnCls, btnGhost, inputCls } from './ui';

type Patch = { category_id: number; year: number; month: number; amount: number | null };

/** A money box that edits locally and commits on blur or Enter, so one save happens per edit instead of one per keystroke. */
function Amount({ value, onCommit, placeholder, className = '', highlight = false, label }: { value: number; onCommit: (n: number) => void; placeholder?: string; className?: string; highlight?: boolean; label: string }) {
  const [text, setText] = useState<string | null>(null);
  const idle = value ? value.toLocaleString('en-CA', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '';
  const commit = () => {
    if (text === null) return;
    const n = parseFloat(text.replace(/[^0-9.\-]/g, ''));
    setText(null);
    if (Number.isFinite(n) && n !== value) onCommit(n); else if (text.trim() === '' && value !== 0) onCommit(0);
  };
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">$</span>
      <input aria-label={label} inputMode="decimal" placeholder={placeholder ?? '0'} value={text ?? idle}
        onFocus={e => { setText(value ? String(value) : ''); requestAnimationFrame(() => e.target.select()); }}
        onBlur={commit} onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} onChange={e => setText(e.target.value)}
        className={`${inputCls} tabular !min-h-0 !py-1.5 pl-6 text-right ${highlight ? '!border-amber-400 !bg-amber-50/70 font-semibold' : ''} ${className}`} />
    </div>
  );
}

export function FixedCosts({ cats }: { cats: Category[] }) {
  const plan = useFixedPlan().data ?? [];
  const months = useMonths().data ?? [];
  const save = useSave<Patch[]>('PUT', '/api/fixed-plan', null);
  const apply = useSave<{ year: number }>('POST', '/api/fixed-plan/apply', 'Updated the months already entered');
  const addCat = useSave<Partial<Category>>('POST', '/api/categories', 'Fixed cost added');

  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [nc, setNc] = useState({ name: '', amount: '' });

  const fixed = useMemo(() => cats.filter(c => c.kind === 'fixed' && !c.archived).sort((a, b) => a.name.localeCompare(b.name)), [cats]);
  const years = useMemo(() => {
    const ys = new Set<number>([thisYear - 1, thisYear, thisYear + 1, year, ...plan.map(r => r.year), ...months.map(m => m.year)]);
    return [...ys].sort((a, b) => a - b);
  }, [plan, months, thisYear, year]);

  const rowTotal = (c: Category) => Array.from({ length: 12 }, (_, i) => fixedFor(plan, c.id, year, i + 1, c.default_amount)).reduce((a, b) => a + b, 0);
  const yearTotal = fixed.reduce((t, c) => t + rowTotal(c), 0);
  const entered = months.filter(m => m.year === year).length;
  const overridesIn = (c: Category) => Array.from({ length: 12 }, (_, i) => fixedOverride(plan, c.id, year, i + 1)).filter(v => v !== undefined).length;

  const setBase = (c: Category, v: number) => save.mutate([{ category_id: c.id, year, month: 0, amount: v }]);
  const setMonth = (c: Category, m: number, v: number) => {
    const base = fixedBase(plan, c.id, year, c.default_amount).amount;
    // typing the year's own amount again just clears the override, so only real exceptions are stored
    save.mutate([{ category_id: c.id, year, month: m, amount: v === base ? null : v }]);
  };
  const resetMonths = (c: Category) => save.mutate(Array.from({ length: 12 }, (_, i) => ({ category_id: c.id, year, month: i + 1, amount: null })));

  const copyPrev = () => {
    const rows: Patch[] = [];
    for (const c of fixed) {
      rows.push({ category_id: c.id, year, month: 0, amount: fixedBase(plan, c.id, year - 1, c.default_amount).amount });
      for (let m = 1; m <= 12; m++) { const o = fixedOverride(plan, c.id, year - 1, m); if (o !== undefined) rows.push({ category_id: c.id, year, month: m, amount: o }); }
    }
    if (plan.some(r => r.year === year) && !confirm(`Replace the ${year} amounts with ${year - 1}'s?`)) return;
    save.mutate(rows);
  };
  const add = () => {
    const amount = parseFloat(nc.amount.replace(/[^0-9.]/g, '')) || 0;
    addCat.mutate({ name: nc.name.trim(), kind: 'fixed', counts_as_living: 0, default_amount: amount, parent_id: null }, {
      onSuccess: (r: any) => { if (r?.id) save.mutate([{ category_id: r.id, year, month: 0, amount }]); },
    });
    setNc({ name: '', amount: '' });
  };

  return (
    <div className="space-y-3 sm:space-y-5">
      {/* year strip + totals */}
      <Card pad={false}>
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Fixed costs in</p>
            <div className="fade-x -mx-1 mt-1.5 overflow-x-auto px-1"><div className="flex w-max gap-1.5 pb-1">
              {years.map(y => (
                <button key={y} onClick={() => setYear(y)} aria-pressed={y === year}
                  className={`min-h-0 rounded-lg border px-3.5 py-1.5 text-sm font-semibold ${y === year ? 'border-[#10281f] bg-[#10281f] text-[#f6f1e4]' : 'border-slate-300 bg-[var(--card)] text-slate-600 hover:bg-slate-50'}`}>{y}</button>
              ))}
            </div></div>
          </div>
          <div className="text-right">
            <p className="display tabular text-[34px] leading-none text-slate-900">{money(yearTotal, 0)}</p>
            <p className="mt-1 text-xs text-slate-500">for {year} · about {money(yearTotal / 12, 0)} a month</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/80 bg-slate-50/60 px-4 py-3 sm:px-5">
          <button className={btnGhost} onClick={copyPrev} disabled={!fixed.length}><CopyPlus size={15} />Copy from {year - 1}</button>
          <button className={btnGhost} disabled={!entered || !fixed.length}
            title={entered ? `Rewrite the fixed costs of the ${entered} month${entered > 1 ? 's' : ''} already entered in ${year}` : `No months entered in ${year} yet`}
            onClick={() => confirm(`Rewrite the fixed costs in the ${entered} month${entered > 1 ? 's' : ''} already entered for ${year} so they match this plan? Income, spending and savings are not touched.`) && apply.mutate({ year })}>
            <Wand2 size={15} />Apply to {entered} entered month{entered === 1 ? '' : 's'}
          </button>
          <p className="ml-auto hidden text-xs text-slate-400 md:block">New months are prefilled from this plan. Months you already entered only change if you press Apply.</p>
        </div>
      </Card>

      {fixed.length === 0 && <p className="rounded-2xl bg-slate-100 px-4 py-6 text-center text-sm text-slate-500">No fixed costs yet. Add rent, insurance, subscriptions or anything that stays the same each month.</p>}

      <ul className="space-y-3">
        {fixed.map(c => {
          const base = fixedBase(plan, c.id, year, c.default_amount), n = overridesIn(c), isOpen = open[c.id] ?? n > 0;
          return (
            <li key={c.id} className="rounded-2xl border border-slate-300/60 bg-[var(--card)]">
              <div className="grid items-center gap-x-4 gap-y-2 p-4 sm:grid-cols-[minmax(0,1fr)_10rem_7.5rem] sm:p-5">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-slate-900">{c.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                    {base.source === 'year' && <span>Set for {year}</span>}
                    {base.source === 'carried' && <span>Carried from {base.from}</span>}
                    {base.source === 'default' && <span>Default amount, not set for {year}</span>}
                    {n > 0 && <Badge tone="amber">{n} month{n > 1 ? 's' : ''} adjusted</Badge>}
                  </p>
                </div>
                <label className="block"><span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Every month</span>
                  <Amount label={`${c.name}, every month of ${year}`} value={base.amount} onCommit={v => setBase(c, v)} /></label>
                <div className="sm:text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">Year total</p><p className="tabular text-base font-semibold text-slate-900">{money(rowTotal(c), 0)}</p></div>
              </div>

              <button onClick={() => setOpen(o => ({ ...o, [c.id]: !isOpen }))} aria-expanded={isOpen}
                className="flex min-h-0 w-full items-center gap-1.5 border-t border-slate-200/80 px-4 py-2.5 text-left text-xs font-semibold text-slate-500 hover:text-slate-800 sm:px-5">
                <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />{isOpen ? 'Hide months' : 'Change for specific months'}
              </button>
              {isOpen && (
                <div className="border-t border-slate-200/80 p-4 sm:p-5">
                  <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                    {Array.from({ length: 12 }, (_, i) => {
                      const m = i + 1, o = fixedOverride(plan, c.id, year, m), shown = fixedFor(plan, c.id, year, m, c.default_amount);
                      return (
                        <label key={m} className="block min-w-0">
                          <span className={`mb-1 block text-[11px] font-semibold ${o !== undefined ? 'text-amber-700' : 'text-slate-400'}`}>{MONTHS[i]}</span>
                          <Amount label={`${c.name}, ${MONTHS[i]} ${year}`} value={shown} highlight={o !== undefined} onCommit={v => setMonth(c, m, v)} />
                        </label>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
                    <span>Highlighted months differ from the {money(base.amount, 0)} yearly amount.</span>
                    {n > 0 && <button onClick={() => resetMonths(c)} className="inline-flex min-h-0 items-center gap-1 font-semibold text-slate-500 hover:text-slate-800"><RotateCcw size={12} />Reset all months</button>}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="rounded-2xl border border-dashed border-slate-300 p-4 sm:p-5">
        <p className="mb-3 text-sm font-semibold text-slate-800">Add a fixed cost</p>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
          <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">Name</span><input className={inputCls} placeholder="e.g. Rent, Car insurance" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} /></label>
          <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">Per month in {year}</span><input className={`${inputCls} tabular text-right`} inputMode="decimal" placeholder="0" value={nc.amount} onChange={e => setNc({ ...nc, amount: e.target.value })} /></label>
          <button className={btnCls} disabled={!nc.name.trim()} onClick={add}><Plus size={16} />Add</button>
        </div>
      </div>
    </div>
  );
}
