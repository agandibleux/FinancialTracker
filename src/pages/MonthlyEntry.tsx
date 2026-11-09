import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Copy, PiggyBank, Plus, Save, ShoppingBag, Trash2, Wallet, Zap, Home, type LucideIcon } from 'lucide-react';
import { useAccounts, useCards, useCategories, useMonth, useMonths, usePeople, useSave } from '../api';
import { MONTHS, money, sum, totals } from '../lib/calc';
import { Badge, CountUp, MoneyInput, MonthNav, PageHeader, btnCls, btnGhost, inputCls } from '../components/ui';
import { isInvested, type Category, type IncomeEntry, type MonthDetail } from '../lib/types';

type Form = { income: IncomeEntry[]; amounts: Record<number, number>; hasActual: boolean; toCash: number; inv: Record<number, number>; note: string; savingsNote: string; cards: Record<number, number>; excl: Record<number, number> };
const emptyForm: Form = { income: [], amounts: {}, hasActual: false, toCash: 0, inv: {}, note: '', savingsNote: '', cards: {}, excl: {} };

/** The five stages of a month, in the order you fill them. */
const STEPS: { id: string; label: string; title: string; hint: string; icon: LucideIcon; grad: string; soft: string }[] = [
  { id: 'earn', label: 'Earnings', title: 'What came in', hint: 'Salary, bonus, anything you were paid this month.', icon: Wallet, grad: 'linear-gradient(135deg,#0f9f78,#34d399)', soft: '#ecfdf5' },
  { id: 'fixed', label: 'Fixed costs', title: 'Fixed costs', hint: 'Same every month and prefilled from your template. Just check them.', icon: Home, grad: 'linear-gradient(135deg,#2f5688,#6089bd)', soft: '#eff4fa' },
  { id: 'util', label: 'Utilities', title: 'Utilities', hint: 'These change each month. Tap last month’s amount to reuse it.', icon: Zap, grad: 'linear-gradient(135deg,#e8890c,#fbbf24)', soft: '#fffbeb' },
  { id: 'spend', label: 'Spending', title: 'Spending', hint: 'Enter each credit card’s statement total and one-off spending (trips, furniture); everyday spending is the card total minus the one-offs, and counts as living cost.', icon: ShoppingBag, grad: 'linear-gradient(135deg,#db2777,#f472b6)', soft: '#fdf2f8' },
  { id: 'save', label: 'Savings', title: 'Actual savings', hint: 'Optional. When the month is over, record what you really put aside.', icon: PiggyBank, grad: 'linear-gradient(135deg,#0f8a86,#4cd1c8)', soft: '#effafa' },
];

export default function MonthlyEntry() {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const { year, month } = ym;
  const people = usePeople().data ?? [];
  const cards = useCards().data ?? [];
  const [exclOpen, setExclOpen] = useState<number[]>([]);
  const toggleExcl = (id: number) => setExclOpen(o => o.includes(id) ? o.filter(x => x !== id) : [...o, id]);
  const cats = useCategories().data ?? [];
  const allMonths = useMonths().data ?? [];
  const investAccounts = (useAccounts().data ?? []).filter(a => isInvested(a.type));
  const accLabel = (a: (typeof investAccounts)[number]) => `${a.type} · ${people.find(p => p.id === a.person_id)?.name ?? ''}${a.name && a.name !== a.type ? ` · ${a.name}` : ''}`;
  const { data: detail, isFetching } = useMonth(year, month);
  const prevYm = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  const prevDetail = useMonth(prevYm.year, prevYm.month).data;
  const save = useSave<MonthDetail>('PUT', () => `/api/months/${year}/${month}`, null); // silent: the button and badge show save state

  const [form, setForm] = useState<Form>(emptyForm);
  const [baseline, setBaseline] = useState('');
  const key = `${year}-${month}`;
  const loadedKey = useRef('');   // which month the form currently holds
  const initial = useRef('');     // form as loaded, to tell user edits from the prefilled template
  const formRef = useRef(form); formRef.current = form;
  const baselineRef = useRef(baseline); baselineRef.current = baseline;
  const keyRef = useRef(key); keyRef.current = key;
  const edited = () => { if (loadedKey.current !== keyRef.current) return false; const j = JSON.stringify(formRef.current); return j !== initial.current && j !== baselineRef.current; };
  const root = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  const patch = (p: Partial<Form>) => setForm(f => ({ ...f, ...p }));
  // Older versions kept cards as children of a "Credit cards" spending group; hide them (Settings offers to move them).
  const legacyGroup = cats.find(c => c.kind === 'variable' && !c.parent_id && c.name === 'Credit cards');
  const isCardCat = (c: Category) => c.id === legacyGroup?.id || c.parent_id === legacyGroup?.id;
  // Everyday spending = all credit-card statement totals − one-offs. Only derived once a card total is entered.
  const everydayCat = cats.find(c => c.kind === 'variable' && c.counts_as_living && !c.parent_id && /everyday/i.test(c.name));
  const oneOffCats = cats.filter(c => c.kind === 'variable' && !c.counts_as_living);
  const derive = (f: Form): Form => {
    const cardsTotal = sum(cards.map(c => (f.cards[c.id] ?? 0) - (f.excl[c.id] ?? 0)));
    if (!everydayCat || cardsTotal <= 0) return f;
    const oneOff = sum(oneOffCats.map(c => f.amounts[c.id] ?? 0));
    return { ...f, amounts: { ...f.amounts, [everydayCat.id]: Math.max(0, Math.round((cardsTotal - oneOff) * 100) / 100) } };
  };
  const setAmount = (id: number, v: number) => setForm(f => derive({ ...f, amounts: { ...f.amounts, [id]: v } }));
  const setExcl = (id: number, v: number) => setForm(f => derive({ ...f, excl: { ...f.excl, [id]: v } }));
  const setCard = (id: number, v: number) => setForm(f => derive({ ...f, cards: { ...f.cards, [id]: v } }));

  // Load a month into the form. A brand-new month is prefilled from the fixed-cost template.
  useEffect(() => {
    if (!detail || isFetching || !cats.length) return;
    if (loadedKey.current === key && edited()) return; // don't clobber typing with a refetch
    const isNew = detail.income.length === 0 && detail.expenses.length === 0;
    const amounts: Record<number, number> = {};
    for (const c of cats) amounts[c.id] = isNew && c.kind === 'fixed' && !c.archived ? c.default_amount : 0;
    for (const e of detail.expenses) amounts[e.category_id] = e.amount;
    const f: Form = {
      income: detail.income.length ? detail.income : [{ person_id: people[0]?.id ?? 1, source: 'Salary', amount: 0 }],
      amounts, hasActual: !!detail.savings, toCash: detail.savings?.to_cash ?? 0, inv: Object.fromEntries((detail.savings?.investments ?? []).map(x => [x.account_id, x.amount])),
      note: detail.note ?? '', savingsNote: detail.savings?.note ?? '',
      cards: Object.fromEntries((detail.cards ?? []).map(c => [c.card_id, c.amount])),
      excl: Object.fromEntries((detail.cards ?? []).map(c => [c.card_id, c.excluded])),
    };
    loadedKey.current = key;
    initial.current = JSON.stringify(f);
    setForm(f);
    setBaseline(isNew ? '' : initial.current);
  }, [detail, isFetching, cats.length, people.length, investAccounts.length]);

  const dirty = JSON.stringify(form) !== baseline;
  const expenses = cats.filter(c => !isCardCat(c)).map(c => ({ category_id: c.id, amount: form.amounts[c.id] ?? 0 }));
  const t = totals(form.income, expenses, cats);
  const toInv = sum(Object.values(form.inv));
  const actual = form.toCash + toInv;
  const prevAmount = (id: number) => prevDetail?.expenses.find(e => e.category_id === id)?.amount;

  const onSave = () => {
    const snapshot = JSON.stringify(form), savedKey = key;
    save.mutate({
      year, month, note: form.note, income: form.income, expenses,
      cards: cards.map(c => ({ card_id: c.id, amount: form.cards[c.id] ?? 0, excluded: form.excl[c.id] ?? 0 })),
      savings: form.hasActual ? { to_cash: form.toCash, to_investments: toInv, note: form.savingsNote, investments: investAccounts.map(a => ({ account_id: a.id, amount: form.inv[a.id] ?? 0 })) } : null,
    }, { onSuccess: () => { if (loadedKey.current === savedKey) setBaseline(snapshot); } });
  };

  // Cmd/Ctrl + S saves; keep the latest handler in a ref
  const saveRef = useRef(onSave); saveRef.current = onSave;
  useEffect(() => {
    const h = (e: globalThis.KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); saveRef.current(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);

  // Autosave shortly after the last edit. A failed save is not retried until the next edit.
  const saving = useRef(false); saving.current = save.isPending;
  useEffect(() => {
    if (loadedKey.current !== key || !edited()) return;
    const id = setTimeout(() => { if (!saving.current) saveRef.current(); }, 800);
    return () => clearTimeout(id);
  }, [form, baseline, key]);
  // flush pending edits when leaving the page or switching month
  useEffect(() => () => { if (edited()) saveRef.current(); }, []);

  // Enter jumps to the next field – fill the whole month without touching the mouse
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLInputElement;
    if (e.key !== 'Enter' || !['INPUT', 'SELECT'].includes(el.tagName) || el.type === 'checkbox') return;
    e.preventDefault();
    const all = Array.from(root.current?.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not(:disabled), select, textarea') ?? []);
    all[all.indexOf(el) + 1]?.focus();
  };

  const copyLast = () => {
    if (!prevDetail) return;
    const amounts = { ...form.amounts };
    for (const c of cats) if (c.kind !== 'fixed') amounts[c.id] = prevDetail.expenses.find(e => e.category_id === c.id)?.amount ?? 0;
    patch({ amounts, income: form.income.some(i => i.amount) ? form.income : (prevDetail.income.length ? prevDetail.income : form.income) });
  };

  const visible = (c: Category) => !c.archived || !!form.amounts[c.id];
  const kindTotal = (k: Category['kind']) => sum(cats.filter(c => c.kind === k && !isCardCat(c)).map(c => form.amounts[c.id] ?? 0));

  /** one category: name, last month (tap to reuse), this month */
  const row = (c: Category, kind: Category['kind']) => {
    const prev = prevAmount(c.id);
    return (
      <label key={c.id} className="grid grid-cols-[minmax(0,1fr)_9.5rem] items-center gap-x-3 rounded-2xl px-3 py-2 transition hover:bg-white focus-within:bg-white focus-within:shadow-[0_0_0_1px_rgba(95,140,200,.5),0_6px_18px_-10px_rgba(47,86,136,.5)] sm:grid-cols-[minmax(0,1fr)_6.5rem_10rem]">
        <span className="min-w-0 text-[15px] leading-tight text-slate-800">
          {c.name}
          {kind === 'variable' && <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.counts_as_living ? 'bg-sky-50 text-sky-700' : 'bg-pink-50 text-pink-700'}`}>{c.counts_as_living ? 'everyday' : 'one-off'}</span>}
          {c.archived ? <span className="ml-2 text-xs text-slate-400">(archived)</span> : null}
          {prev ? <button type="button" tabIndex={-1} onClick={() => setAmount(c.id, prev)} className="tabular mt-0.5 block text-xs text-slate-400 hover:text-indigo-600 sm:hidden">Last month {money(prev)} · tap to reuse</button> : null}
        </span>
        {prev ? <button type="button" tabIndex={-1} onClick={() => setAmount(c.id, prev)} title="Use last month's amount" className="tabular hidden rounded-lg px-2 py-1 text-right text-xs text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-700 sm:block">{money(prev)}</button> : <span className="hidden sm:block" />}
        <MoneyInput value={form.amounts[c.id] ?? 0} onChange={v => setAmount(c.id, v)} placeholder="0" />
      </label>
    );
  };

  const colHead = (mid: string) => (
    <div className="mb-1 hidden grid-cols-[minmax(0,1fr)_6.5rem_10rem] gap-x-3 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:grid">
      <span>Category</span><span className="text-right">{mid}</span><span className="text-right">This month</span>
    </div>
  );

  const fields = (kind: Category['kind']) => {
    const inKind = cats.filter(c => c.kind === kind && visible(c) && !isCardCat(c));
    const kids = (id: number) => inKind.filter(c => c.parent_id === id);
    // spending: plain rows (Everyday spending) first, then groups such as Credit cards
    const roots = inKind.filter(c => !c.parent_id || !inKind.some(p => p.id === c.parent_id))
      .sort((a, b) => kind === 'variable' ? Number(kids(a.id).length > 0) - Number(kids(b.id).length > 0) : 0);
    if (inKind.length === 0) return <p className="text-sm text-slate-500">Nothing here yet. <Link to="/settings" className="font-medium text-indigo-600 underline">Add categories in Settings</Link>.</p>;
    return (
      <div>
        {colHead('Last month')}
        <div className="space-y-0.5">
          {roots.map(c => kids(c.id).length === 0 ? row(c, kind) : (
            <div key={c.id} className="my-2 rounded-2xl bg-white/60 p-1.5 ring-1 ring-slate-200/70">
              <p className="flex justify-between gap-3 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><span>{c.name}</span><span className="tabular normal-case tracking-normal text-slate-700">{money(sum(kids(c.id).map(k => form.amounts[k.id] ?? 0)))}</span></p>
              {kids(c.id).map(k => row(k, kind))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const hasData = allMonths.some(m => m.year === year && m.month === month);
  const gap = actual - t.predicted;
  const stepTotal = [t.income, kindTotal('fixed'), kindTotal('utility'), kindTotal('variable'), actual];
  const stepDone = [t.income > 0, t.fixed > 0, t.utility > 0, t.variable > 0, form.hasActual];
  const doneCount = stepDone.filter(Boolean).length;
  const multi = people.length > 1; // a person picker only matters with 2+ people
  const cur = STEPS[step], last = step === STEPS.length - 1;
  const left = Math.max(0, t.predicted);
  const alloc = [
    { label: 'Fixed costs', v: t.fixed, c: '#6089bd' }, { label: 'Utilities', v: t.utility, c: '#f5b942' },
    { label: 'Spending', v: t.variable, c: '#f472b6' }, { label: 'Left to save', v: left, c: '#34d399' },
  ];
  const allocBase = Math.max(t.income, t.fixed + t.utility + t.variable, 1);
  const setInc = (i: number, p: Partial<IncomeEntry>) => patch({ income: form.income.map((r, j) => j === i ? { ...r, ...p } : r) });

  const saveBtn = (cls = '') => (
    <button className={`${btnCls} ${cls}`} onClick={onSave} disabled={save.isPending || !dirty}>
      <Save size={17} />{save.isPending ? 'Saving…' : dirty ? 'Save now' : 'All saved'}
    </button>
  );

  return (
    <div className="space-y-4 sm:space-y-6" ref={root} onKeyDown={onKey}>
      <PageHeader title="Monthly entry" subtitle="Work through the five steps. Type an amount and press Enter to jump to the next field."
        actions={<>
          <MonthNav year={year} month={month} onChange={(y, m) => { if (edited()) onSave(); setYm({ year: y, month: m }); setStep(0); }} />
          <button className={btnGhost} onClick={copyLast} disabled={!prevDetail} title="Copy utilities, spending and income from last month"><Copy size={15} />Copy last month</button>
        </>} />

      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[13.5rem_minmax(0,1fr)_21rem]">
        {/* step rail: vertical on desktop, a scrolling strip on phones */}
        <nav aria-label="Steps" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:sticky lg:top-6 lg:row-span-2 lg:mx-0 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:rounded-3xl lg:border lg:border-slate-200/70 lg:bg-white/80 lg:p-2.5 lg:pb-2.5 lg:shadow-[0_8px_24px_-14px_rgba(15,23,42,.18)] xl:row-span-1">
          {STEPS.map((st, i) => {
            const on = i === step, Icon = st.icon;
            return (
              <button key={st.id} onClick={() => setStep(i)} aria-current={on ? 'step' : undefined}
                className={`group flex shrink-0 items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition lg:w-full ${on ? 'bg-white shadow-md ring-1 ring-slate-200 lg:shadow-[0_6px_18px_-8px_rgba(15,23,42,.3)]' : 'bg-white/60 ring-1 ring-slate-200/60 hover:bg-white lg:bg-transparent lg:ring-0'}`}>
                <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-sm transition group-hover:scale-105" style={{ background: st.grad, opacity: on || stepDone[i] ? 1 : .55 }}>
                  <Icon size={17} />
                  {stepDone[i] && !on && <span className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-white"><Check size={10} strokeWidth={3} /></span>}
                </span>
                <span className="min-w-0">
                  <span className={`block whitespace-nowrap text-sm font-semibold ${on ? 'text-slate-900' : 'text-slate-600'}`}>{st.label}</span>
                  <span className="tabular hidden text-xs text-slate-400 lg:block">{stepTotal[i] ? money(stepTotal[i], 0) : i === 4 ? 'optional' : 'to do'}</span>
                </span>
              </button>
            );
          })}
          <p className="hidden px-3 pb-1 pt-2 text-xs text-slate-400 lg:block">{doneCount} of 5 filled</p>
        </nav>

        {/* active step */}
        <section key={step} className="animate-rise rounded-3xl border border-slate-200/70 bg-white/90 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_12px_32px_-16px_rgba(15,23,42,0.14)]">
          <header className="flex flex-wrap items-center gap-4 rounded-t-3xl p-4 sm:p-6" style={{ background: `linear-gradient(120deg, ${cur.soft}, transparent 70%)` }}>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-lg" style={{ background: cur.grad }}><cur.icon size={22} /></span>
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Step {step + 1} of {STEPS.length}</p>
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">{cur.title}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{cur.hint}</p>
            </div>
            <p className="tabular text-2xl font-bold tracking-tight text-slate-900"><CountUp value={stepTotal[step]} /></p>
          </header>

          <div className="px-2 pb-2 sm:px-4">
            {step === 0 && (
              <div className="space-y-4 px-2 pb-2">
                {(people.length ? people : [{ id: 1, name: '' }]).map(person => {
                  const lines = form.income.map((r, i) => ({ r, i })).filter(x => x.r.person_id === person.id);
                  const sub = sum(lines.map(x => x.r.amount));
                  return (
                    <div key={person.id} className={multi ? 'rounded-2xl bg-white/60 p-2 ring-1 ring-slate-200/70 sm:p-3' : ''}>
                      {multi && (
                        <div className="mb-2 flex items-center gap-3 px-1">
                          <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-indigo-600 to-teal-500 text-sm font-bold text-white shadow">{person.name.slice(0, 1).toUpperCase()}</span>
                          <p className="flex-1 font-semibold text-slate-900">{person.name}</p>
                          <p className="tabular text-sm font-semibold text-slate-700">{money(sub)}</p>
                        </div>
                      )}
                      <div className="mb-1 hidden grid-cols-[minmax(0,1fr)_10rem_2.5rem] gap-x-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:grid"><span>Source</span><span className="text-right">Amount</span><span /></div>
                      <div className="space-y-2">
                        {lines.map(({ r, i }) => (
                          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)_2.5rem] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_10rem_2.5rem] sm:gap-x-3">
                            <input className={inputCls} value={r.source} placeholder="Salary, Bonus…" aria-label="Income source" onChange={e => setInc(i, { source: e.target.value })} />
                            <MoneyInput value={r.amount} onChange={v => setInc(i, { amount: v })} />
                            <button className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-rose-50 hover:text-rose-600" onClick={() => patch({ income: form.income.filter((_, j) => j !== i) })} aria-label="Remove line"><Trash2 size={16} /></button>
                          </div>
                        ))}
                      </div>
                      <button className={`${btnGhost} mt-3`} onClick={() => patch({ income: [...form.income, { person_id: person.id, source: lines.length ? 'Other' : 'Salary', amount: 0 }] })}><Plus size={14} />Add income{multi ? ` for ${person.name}` : ''}</button>
                    </div>
                  );
                })}
              </div>
            )}
            {step === 1 && fields('fixed')}
            {step === 2 && fields('utility')}
            {step === 3 && (<>
              {fields('variable')}
              <div className="mt-3 rounded-2xl bg-white/60 p-1.5 ring-1 ring-slate-200/70">
                <p className="flex justify-between gap-3 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-slate-500"><span>Credit cards</span><span className="tabular normal-case tracking-normal text-slate-700">{money(sum(cards.map(c => form.cards[c.id] ?? 0)))}</span></p>
                <p className="px-3 pb-2 text-xs text-slate-400">Type the credit left <i>or</i> the amount spent on each card; the other is calculated from its limit. Everyday spending becomes the total spent, minus amounts not counted (reimbursed), minus one-offs.</p>
                {cards.length === 0 && <p className="px-3 pb-2 text-sm text-slate-500">No cards yet. <Link to="/settings?tab=cards" className="font-medium text-indigo-600 underline">Add your credit cards in Settings</Link>.</p>}
                {cards.map(c => {
                  const spent = form.cards[c.id] ?? 0;
                  return (
                    <div key={c.id} className="grid grid-cols-[minmax(0,1fr)_7.5rem_7.5rem] items-center gap-x-2 rounded-2xl px-3 py-1.5 hover:bg-white focus-within:bg-white sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
                      <span className="min-w-0 text-[15px] leading-tight text-slate-800">{c.name}{c.credit_limit > 0 && <span className="ml-2 text-xs text-slate-400">limit {money(c.credit_limit, 0)}</span>}</span>
                      {c.credit_limit > 0
                        ? <MoneyInput value={spent > 0 ? Math.max(0, c.credit_limit - spent) : 0} onChange={v => setCard(c.id, v > 0 ? Math.max(0, c.credit_limit - v) : 0)} placeholder="Left" />
                        : <span className="text-right text-xs text-slate-400">no limit set</span>}
                      <MoneyInput value={spent} onChange={v => setCard(c.id, v)} placeholder="Spent" />
                      {exclOpen.includes(c.id) ? (
                        <>
                          <span className="col-span-2 mt-1 flex items-center justify-end gap-1.5 text-[11px] text-slate-400" title="Spent on this card but not part of your own spending, e.g. work costs that will be reimbursed">
                            not counted
                            <button type="button" className="rounded px-1 text-slate-300 hover:text-slate-600" aria-label="Hide not counted" title="Hide" onClick={() => toggleExcl(c.id)}>✕</button>
                          </span>
                          <div className="mt-1 opacity-80 focus-within:opacity-100"><MoneyInput value={form.excl[c.id] ?? 0} onChange={v => setExcl(c.id, v)} placeholder="0" /></div>
                        </>
                      ) : (form.excl[c.id] || spent > 0) ? (
                        <button type="button" className={`col-span-full mt-0.5 justify-self-end text-[11px] transition hover:text-slate-600 ${form.excl[c.id] ? 'text-slate-400' : 'text-slate-300'}`} onClick={() => toggleExcl(c.id)}>
                          {form.excl[c.id] ? `− ${money(form.excl[c.id], 0)} not counted` : '+ not counted'}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 px-3 pb-3">
                <p className="mb-1.5 text-sm font-medium text-slate-700">What happened this month? <span className="font-normal text-slate-400">(shown on the dashboard)</span></p>
                <textarea className={`${inputCls} min-h-[72px]`} value={form.note} placeholder="e.g. Iceland trip, new tires…" onChange={e => patch({ note: e.target.value })} />
              </div>
            </>)}
            {step === 4 && (
              <div className="space-y-4 px-3 pb-3 pt-1">
                <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-slate-200/70">
                  <span><span className="block text-sm font-semibold text-slate-800">This month is closed</span><span className="text-xs text-slate-500">Turn on to record what you really saved instead of the prediction.</span></span>
                  <input type="checkbox" checked={form.hasActual} onChange={e => patch({ hasActual: e.target.checked })} />
                </label>
                <div className={`grid gap-4 transition sm:grid-cols-2 ${form.hasActual ? '' : 'pointer-events-none opacity-40'}`}>
                  <div><p className="mb-1.5 text-sm text-slate-600">Into savings account</p><MoneyInput big value={form.toCash} onChange={v => patch({ toCash: v })} /></div>
                  <div className="space-y-2 sm:col-span-2">
                    <p className="text-sm text-slate-600">Into investments <span className="text-slate-400">· which account did the money go to?</span></p>
                    {investAccounts.length === 0 && <p className="text-sm text-slate-500">Add an investing account in Settings first.</p>}
                    {investAccounts.map(a => (
                      <div key={a.id} className="grid grid-cols-[minmax(0,1fr)_10rem] items-center gap-3">
                        <span className="min-w-0 truncate text-sm font-medium text-slate-800">{accLabel(a)}</span>
                        <MoneyInput value={form.inv[a.id] ?? 0} onChange={v => patch({ inv: { ...form.inv, [a.id]: v } })} />
                      </div>
                    ))}
                    <p className="tabular text-right text-xs text-slate-500">Total invested {money(toInv)}</p>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-sm sm:col-span-2">
                    <span className="text-slate-600">Total saved <b className="tabular ml-1 text-slate-900">{money(actual)}</b></span>
                    <span className={`font-semibold ${gap >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{gap >= 0 ? '+' : '−'}{money(Math.abs(gap))} vs predicted</span>
                  </div>
                  <button className={`${btnGhost} sm:col-span-2`} onClick={() => patch({ hasActual: true, toCash: Math.max(0, Math.round(t.predicted * 0.25)), inv: investAccounts.length ? { ...form.inv, [(investAccounts.find(a => a.type === 'NONREG') ?? investAccounts[0]).id]: Math.max(0, Math.round(t.predicted * 0.75)) } : form.inv })}>Prefill from prediction (25% cash / 75% to your first non-registered account)</button>
                </div>
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-slate-100 p-4 sm:px-6">
            <button className={btnGhost} onClick={() => setStep(step - 1)} disabled={step === 0}><ArrowLeft size={15} />Back</button>
            {last ? saveBtn() : <button className={btnCls} onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1].label}<ArrowRight size={15} /></button>}
          </footer>
        </section>

        {/* live summary */}
        <aside className="space-y-4 lg:col-start-2 xl:sticky xl:top-6 xl:col-start-3 xl:row-start-1">
          <section className="hero-ink cq overflow-hidden rounded-3xl p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{MONTHS[month - 1]} {year}</h2>
              {dirty ? <Badge tone="amber">{save.isPending ? 'Saving…' : 'Unsaved'}</Badge> : <Badge tone="green">{hasData ? 'Saved' : 'Not started'}</Badge>}
            </div>
            <p className="mt-4 text-sm text-indigo-100">Predicted savings</p>
            <p className={`display tabular num-lg ${t.predicted < 0 ? 'text-rose-200' : ''}`}><CountUp value={t.predicted} /></p>
            <p className="mt-1 text-sm text-indigo-100">{t.income ? `${((t.predicted / t.income) * 100).toFixed(0)}% of what you earned` : 'Add your earnings to see your rate'}</p>
            <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-white/15">
              {alloc.map(a => a.v > 0 && <div key={a.label} className="grow" style={{ width: `${(a.v / allocBase) * 100}%`, background: a.c, transition: 'width .5s ease' }} />)}
            </div>
            <dl className="tabular mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-indigo-100">Money in</dt><dd className="font-semibold text-emerald-300">{money(t.income)}</dd></div>
              {alloc.map(a => <div key={a.label} className="flex justify-between gap-3"><dt className="flex items-center gap-2 text-indigo-100"><i className="inline-block h-2 w-2 rounded-full" style={{ background: a.c }} />{a.label === 'Left to save' ? '= Left to save' : `− ${a.label}`}</dt><dd>{money(a.v)}</dd></div>)}
              <div className="flex justify-between gap-3 border-t border-white/15 pt-2" title="Everyday spending only"><dt className="text-indigo-100">Living cost</dt><dd className="font-semibold text-amber-200">{money(t.living)}</dd></div>
            </dl>
          </section>
          <div className="hidden xl:block">{saveBtn('w-full !py-3.5 text-base')}<p className="mt-2 text-center text-xs text-slate-400">Shortcut: ⌘S (Ctrl+S)</p></div>
        </aside>
      </div>

      {/* phones and tablets: save is always in reach above the tab bar */}
      {dirty && <div className="pointer-events-none sticky bottom-24 z-20 flex justify-end md:bottom-4 xl:hidden">
        <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/95 py-2 pl-4 pr-2 shadow-xl backdrop-blur">
          <span className="tabular text-sm text-slate-500">Saves <b className={t.predicted < 0 ? 'text-rose-600' : 'text-emerald-600'}>{money(t.predicted, 0)}</b></span>
          {saveBtn('!py-2')}
        </div>
      </div>}
    </div>
  );
}
