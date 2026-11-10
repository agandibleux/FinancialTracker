import { useEffect, useState } from 'react';
import { Archive, ArchiveRestore, Cloud, CreditCard as CardIcon, Landmark, Percent, Plus, Shield, Tags, Trash2, Users } from 'lucide-react';
import { useAccounts, useCards, useCategories, useDelete, usePeople, useRooms, useSave, useSettings } from '../api';
import { ACCOUNT_META, ACCOUNT_TYPES, REGISTERED, type AccountBalance, type Category, type CreditCard, type Person, type Room, type Settings as S } from '../lib/types';
import { SyncPanel } from '../components/SyncUI';
import { Badge, Card, MoneyInput, NumInput, PageHeader, Tabs, btnCls, btnGhost, inputCls, CrossTable } from '../components/ui';

type Tab = 'categories' | 'cards' | 'people' | 'ratios' | 'accounts' | 'room' | 'sync';
const KIND_INFO: Record<Category['kind'], { title: string; hint: string }> = {
  fixed: { title: 'Fixed costs', hint: 'Same every month – prefilled in new months. Never part of living cost.' },
  utility: { title: 'Utilities', hint: 'Change every month. Group them under a parent (e.g. Power & gas under Utilities).' },
  variable: { title: 'Spending', hint: 'Everyday spending and one-offs. Untick “living” for things like trips or big purchases.' },
};

const thCls = 'pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500';
const Field = ({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) => (
  <label className={`block min-w-0 ${className}`}><span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>{children}</label>
);

export default function Settings() {
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(location.search).get('tab') as Tab | null) ?? 'categories');
  const people = usePeople().data ?? [];
  const cats = useCategories().data ?? [];
  const accounts = useAccounts().data ?? [];
  const rooms = useRooms().data ?? [];
  const cards = useCards().data ?? [];
  const settings = useSettings().data;

  const savePeople = useSave<Partial<Person>[]>('PUT', '/api/people');
  const saveCat = useSave<Category>('PUT', c => `/api/categories/${c.id}`, 'Category updated');
  const addCat = useSave<Partial<Category>>('POST', '/api/categories', 'Category added');
  const delCat = useDelete(id => `/api/categories/${id}`);
  const saveSettings = useSave<S>('PUT', '/api/settings');
  const saveAccounts = useSave<Partial<AccountBalance>[]>('PUT', '/api/accounts');
  const delAccount = useDelete(id => `/api/accounts/${id}`);
  const saveCard = useSave<CreditCard>('PUT', c => `/api/cards/${c.id}`, null);
  const addCard = useSave<Partial<CreditCard>>('POST', '/api/cards', 'Card added');
  const delCard = useDelete(id => `/api/cards/${id}`);
  const [nCard, setNCard] = useState({ name: '', credit_limit: 0 });
  // earlier versions kept cards as sub-categories of a "Credit cards" spending group; offer to move them here
  const legacyGroup = cats.find(c => c.kind === 'variable' && !c.parent_id && c.name === 'Credit cards');
  const legacyCards = cats.filter(c => legacyGroup && c.parent_id === legacyGroup.id);
  const importLegacy = async () => {
    for (const c of legacyCards) if (!cards.some(x => x.name === c.name)) await addCard.mutateAsync({ name: c.name, credit_limit: 0 });
    for (const c of legacyCards) await delCat.mutateAsync(c.id);
    if (legacyGroup) await delCat.mutateAsync(legacyGroup.id);
  };
  const saveRooms = useSave<Room[]>('PUT', '/api/rooms');

  const [names, setNames] = useState<Person[]>([]);
  const [s, setS] = useState<S | null>(null);
  const [accs, setAccs] = useState<AccountBalance[]>([]);
  const [rms, setRms] = useState<Room[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  useEffect(() => setNames(people), [JSON.stringify(people)]);
  useEffect(() => { if (settings) setS(settings); }, [JSON.stringify(settings)]);
  useEffect(() => setAccs(accounts), [JSON.stringify(accounts)]);
  useEffect(() => setRms(rooms), [JSON.stringify(rooms)]);
  const [nc, setNc] = useState({ name: '', kind: 'variable' as Category['kind'], default_amount: 0, parent_id: null as number | null });
  const parentsFor = (kind: Category['kind'], selfId?: number) => cats.filter(p => p.kind === kind && !p.parent_id && p.id !== selfId);
  const year = new Date().getFullYear() + 1;
  const ratioSum = s?.ratios.reduce((a, r) => a + r.pct, 0) ?? 0;

  const catRow = (c: Category) => (
    <tr key={c.id} className={`border-t border-slate-100 ${c.archived ? 'opacity-50' : ''}`}>
      <td className="py-1.5 pr-2"><input className={inputCls} defaultValue={c.name} onBlur={e => e.target.value !== c.name && saveCat.mutate({ ...c, name: e.target.value })} /></td>
      <td className="pr-2">
        <select className={inputCls} value={c.parent_id ?? ''} onChange={e => saveCat.mutate({ ...c, parent_id: e.target.value ? Number(e.target.value) : null })}>
          <option value="">— top level —</option>{parentsFor(c.kind, c.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </td>
      <td className="w-36 pr-2"><MoneyInput value={c.default_amount} onChange={v => saveCat.mutate({ ...c, default_amount: v })} /></td>
      <td className="w-20 text-center">
        {c.kind === 'fixed' ? <span className="text-xs text-slate-500">never</span>
          : <input type="checkbox" checked={!!c.counts_as_living} onChange={e => saveCat.mutate({ ...c, counts_as_living: e.target.checked ? 1 : 0 })} />}
      </td>
      <td className="w-24 text-right">
        <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900" title={c.archived ? 'Restore' : 'Archive (hide from new months)'} onClick={() => saveCat.mutate({ ...c, archived: c.archived ? 0 : 1 })}>
          {c.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}</button>
        <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-rose-600" title="Delete (removes its history)" onClick={() => confirm(`Delete “${c.name}” and all its history?`) && delCat.mutate(c.id)}><Trash2 size={16} /></button>
      </td>
    </tr>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Settings" subtitle="Set things up once – the monthly screens do the rest."
        actions={<Tabs value={tab} onChange={setTab} tabs={[
          { id: 'categories', label: 'Categories', icon: Tags }, { id: 'cards', label: 'Credit cards', icon: CardIcon }, { id: 'people', label: 'People', icon: Users },
          { id: 'ratios', label: 'Savings ratios', icon: Percent }, { id: 'accounts', label: 'Accounts', icon: Landmark }, { id: 'room', label: 'Contribution room', icon: Shield }, { id: 'sync', label: 'Sync & data', icon: Cloud }]} />} />

      {tab === 'categories' && (<>
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Archived categories are hidden from new months but their history is kept.</p>
          <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />Show archived ({cats.filter(c => c.archived).length})</label>
        </div>
        {(['fixed', 'utility', 'variable'] as const).map(kind => (
          <Card key={kind} title={KIND_INFO[kind].title} subtitle={KIND_INFO[kind].hint}
            right={<Badge tone={kind === 'fixed' ? 'violet' : kind === 'utility' ? 'amber' : 'blue'}>{cats.filter(c => c.kind === kind && !c.archived).length} active</Badge>}>
            <CrossTable><table className="w-full text-sm">
              <thead className="text-left"><tr><th className={thCls}>Name</th><th className={thCls}>Group under</th><th className={thCls}>Monthly template</th><th className={`${thCls} text-center`}>Living</th><th /></tr></thead>
              <tbody>
                {cats.filter(c => c.kind === kind && (showArchived || !c.archived)).map(catRow)}
                {nc.kind === kind && (
                  <tr className="border-t border-slate-200">
                    <td className="py-2 pr-2"><input className={inputCls} placeholder="New category name" value={nc.name} onChange={e => setNc({ ...nc, name: e.target.value })} /></td>
                    <td className="pr-2"><select className={inputCls} value={nc.parent_id ?? ''} onChange={e => setNc({ ...nc, parent_id: e.target.value ? Number(e.target.value) : null })}><option value="">— top level —</option>{parentsFor(kind).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></td>
                    <td className="pr-2"><MoneyInput value={nc.default_amount} onChange={v => setNc({ ...nc, default_amount: v })} /></td>
                    <td /><td className="text-right"><button className={btnCls} disabled={!nc.name} onClick={() => { addCat.mutate({ ...nc, kind, counts_as_living: kind === 'variable' ? 1 : 0 }); setNc({ name: '', kind, default_amount: 0, parent_id: null }); }}>Add</button></td>
                  </tr>
                )}
              </tbody>
            </table></CrossTable>
            {nc.kind !== kind && <button className={`${btnGhost} mt-3`} onClick={() => setNc({ name: '', kind, default_amount: 0, parent_id: null })}><Plus size={14} />Add {KIND_INFO[kind].title.toLowerCase()}</button>}
          </Card>
        ))}
      </>)}

      {tab === 'cards' && (
        <Card title="Credit cards" subtitle="Enter each card’s credit limit once. In the monthly Spending step you then only type what is left (or what you spent) and the other is calculated.">
          {legacyCards.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900">
              <span>Found {legacyCards.length} card{legacyCards.length > 1 ? 's' : ''} in your Spending categories ({legacyCards.map(c => c.name).join(', ')}).</span>
              <button className={btnCls} onClick={importLegacy}>Move them here</button>
            </div>
          )}
          <div className="space-y-3">
            {cards.length === 0 && <p className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No cards yet – add your first one below.</p>}
            {cards.map(c => (
              <div key={c.id} className="flex items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4">
                <span className="mb-1 hidden h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-600 sm:grid"><CardIcon size={18} /></span>
                <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
                  <Field label="Card name"><input className={inputCls} defaultValue={c.name} onBlur={e => e.target.value.trim() && e.target.value !== c.name && saveCard.mutate({ ...c, name: e.target.value.trim() })} /></Field>
                  <Field label="Credit limit"><MoneyInput value={c.credit_limit} onChange={v => saveCard.mutate({ ...c, credit_limit: v })} /></Field>
                </div>
                <button className="mb-0.5 rounded-xl p-2.5 text-slate-500 hover:bg-white hover:text-rose-600" title="Remove card" aria-label={`Remove ${c.name}`} onClick={() => confirm(`Remove “${c.name}”? Its monthly amounts are deleted too.`) && delCard.mutate(c.id)}><Trash2 size={18} /></button>
              </div>
            ))}
            <div className="rounded-2xl border border-dashed border-slate-300 p-3 sm:p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">Add a card</p>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
                <Field label="Card name"><input className={inputCls} placeholder="e.g. Visa Infinite" value={nCard.name} onChange={e => setNCard({ ...nCard, name: e.target.value })} /></Field>
                <Field label="Credit limit"><MoneyInput value={nCard.credit_limit} onChange={v => setNCard({ ...nCard, credit_limit: v })} /></Field>
                <button className={btnCls} disabled={!nCard.name.trim()} onClick={() => { addCard.mutate({ name: nCard.name.trim(), credit_limit: nCard.credit_limit }); setNCard({ name: '', credit_limit: 0 }); }}><Plus size={16} />Add card</button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {tab === 'sync' && <SyncPanel />}

      {tab === 'people' && (
        <Card title="People" subtitle="Used for income and registered-account room" right={<button className={btnCls} onClick={() => savePeople.mutate(names)}>Save</button>}>
          <div className="max-w-md space-y-3">
            {names.map((p, i) => <Field key={p.id || `n${i}`} label={`Person ${i + 1}`}><input className={inputCls} value={p.name} onChange={e => setNames(n => n.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} /></Field>)}
            <button className={btnGhost} onClick={() => setNames(n => [...n, { id: 0, name: 'New person' }])}><Plus size={14} />Add person</button>
          </div>
        </Card>
      )}

      {tab === 'ratios' && s && (
        <Card title="Where should savings go?" subtitle="After the emergency fund is full, new savings are split by these ratios (capped by contribution room)"
          right={<button className={btnCls} onClick={() => saveSettings.mutate(s)}>Save</button>}>
          <div className="max-w-xl space-y-5">
            <div className="flex items-center gap-3 text-sm">Emergency fund =
              <div className="w-20"><NumInput value={s.emergency_months} onChange={v => setS({ ...s, emergency_months: v })} /></div> months of living costs (fixed + utilities + everyday)</div>
            {s.ratios.map((r, i) => (
              <div key={r.account} className="grid grid-cols-[72px_minmax(0,1fr)_44px] items-center gap-3 text-sm sm:grid-cols-[90px_minmax(0,1fr)_52px] sm:gap-4">
                <span className="font-medium">{r.account}</span>
                <input type="range" min={0} max={100} value={r.pct} onChange={e => setS({ ...s, ratios: s.ratios.map((x, j) => j === i ? { ...x, pct: Number(e.target.value) } : x) })} />
                <span className="tabular text-right">{r.pct}%</span>
              </div>
            ))}
            <Badge tone={ratioSum === 100 ? 'green' : 'amber'}>Total {ratioSum}%{ratioSum !== 100 ? ' – aim for 100' : ' ✓'}</Badge>
          </div>
        </Card>
      )}

      {tab === 'accounts' && (
        <Card title="Accounts" subtitle="Cash accounts feed the emergency fund; everything counts toward net worth. Use the Accounts page for monthly balance updates."
          right={<button className={btnCls} onClick={() => saveAccounts.mutate(accs)}>Save</button>}>
          <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {ACCOUNT_TYPES.map(t => (
              <div key={t} className={`flex gap-3 rounded-2xl border p-3 ${t === 'FHSA' || t === 'HOME' ? 'border-amber-200/80 bg-amber-50/40' : 'border-slate-200/70 bg-slate-50/50'}`}>
                <i className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: ACCOUNT_META[t].color }} />
                <div className="min-w-0"><p className="text-sm font-semibold text-slate-900">{ACCOUNT_META[t].label}</p><p className="text-xs leading-relaxed text-slate-500">{ACCOUNT_META[t].desc}</p></div>
              </div>
            ))}
          </div>
          <p className="mb-4 rounded-2xl bg-sky-50 px-4 py-3 text-xs leading-relaxed text-sky-800"><b>House down payment ≠ home equity.</b> Down payment is cash you are saving (FHSA) to buy a home. Home equity is what a home you already own is worth minus the mortgage. They count separately, and equity is not treated as investable money.</p>
          <div className="space-y-3">
            {accs.length === 0 && <p className="text-sm text-slate-500">No accounts yet – add your TFSA, RRSP, FHSA, savings and brokerage accounts.</p>}
            {accs.map((a, i) => (
              <div key={a.id || `n${i}`} className="grid grid-cols-2 items-end gap-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-[110px_130px_1fr_150px_auto]">
                <Field label="Owner"><select className={inputCls} value={a.person_id} onChange={e => setAccs(x => x.map((r, j) => j === i ? { ...r, person_id: Number(e.target.value) } : r))}>{people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                <Field label="Type"><select className={inputCls} value={a.type} onChange={e => setAccs(x => x.map((r, j) => j === i ? { ...r, type: e.target.value as any } : r))}>{ACCOUNT_TYPES.map(t => <option key={t} value={t}>{ACCOUNT_META[t].label}</option>)}</select></Field>
                <Field label="Name" className="col-span-2 sm:col-span-1"><input className={inputCls} value={a.name} onChange={e => setAccs(x => x.map((r, j) => j === i ? { ...r, name: e.target.value } : r))} /></Field>
                <Field label="Balance"><MoneyInput value={a.balance} onChange={v => setAccs(x => x.map((r, j) => j === i ? { ...r, balance: v } : r))} /></Field>
                <button className="justify-self-end rounded-xl p-2.5 text-slate-500 hover:bg-white hover:text-rose-600" aria-label="Remove account" onClick={() => a.id ? delAccount.mutate(a.id) : setAccs(x => x.filter((_, j) => j !== i))}><Trash2 size={18} /></button>
              </div>
            ))}
            <button className={btnGhost} onClick={() => setAccs(x => [...x, { id: 0, person_id: people[0]?.id ?? 1, type: 'TFSA', name: 'TFSA', balance: 0 }])}><Plus size={14} />Add account</button>
          </div>
        </Card>
      )}

      {tab === 'room' && (
        <Card title={`Contribution room for ${year}`} subtitle="What you can put in on Jan 1 and what is already contributed. Re-enter each year – check your official limits in CRA My Account."
          right={<button className={btnCls} onClick={() => saveRooms.mutate(rms)}>Save</button>}>
          <CrossTable><table className="w-full max-w-2xl text-sm">
            <thead className="text-left"><tr><th className={thCls}>Person</th><th className={thCls}>Account</th><th className={thCls}>Room</th><th className={thCls}>Already contributed</th></tr></thead>
            <tbody>
              {people.flatMap(p => REGISTERED.map(t => {
                const idx = rms.findIndex(r => r.person_id === p.id && r.account_type === t && r.year === year);
                const r = rms[idx] ?? { person_id: p.id, account_type: t, year, room: 0, contributed: 0 };
                const upd = (patch: Partial<Room>) => setRms(x => idx >= 0 ? x.map((y, j) => j === idx ? { ...y, ...patch } : y) : [...x, { ...r, ...patch }]);
                return (
                  <tr key={p.id + t} className="border-t border-slate-100">
                    <td className="py-1.5">{p.name}</td><td><Badge tone={t === 'TFSA' ? 'green' : t === 'RRSP' ? 'violet' : 'amber'}>{t}</Badge></td>
                    <td className="pr-2"><MoneyInput value={r.room} onChange={v => upd({ room: v })} /></td>
                    <td><MoneyInput value={r.contributed} onChange={v => upd({ contributed: v })} /></td>
                  </tr>
                );
              }))}
            </tbody>
          </table></CrossTable>
        </Card>
      )}
    </div>
  );
}
