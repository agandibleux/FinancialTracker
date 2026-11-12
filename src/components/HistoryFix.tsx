import { useState } from 'react';
import { useAccountHistory, useAccounts, usePeople, useSave } from '../api';
import { money } from '../lib/calc';
import { Card, MoneyInput, btnCls, inputCls } from './ui';

/** Hidden tool (Settings → tap the title 5 times, or ?tab=fix): overwrite one account's saved balance on one date. */
export default function HistoryFix() {
  const accounts = useAccounts().data ?? [];
  const people = usePeople().data ?? [];
  const history = useAccountHistory().data ?? [];
  const save = useSave<{ id: number; date: string; balance: number }>('POST', b => `/api/accounts/${b.id}/snapshot`, 'Balance corrected');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [date, setDate] = useState(`${new Date().getFullYear() - 1}-12-31`);
  const [balance, setBalance] = useState(0);

  const id = accountId ?? accounts.find(a => a.name === 'Sun Life Mutual Funds')?.id ?? accounts[0]?.id ?? 0;
  const current = history.find(h => h.account_id === id && h.date === date)?.balance;
  const label = (a: (typeof accounts)[number]) => `${people.find(p => p.id === a.person_id)?.name ?? ''} · ${a.name}`;

  return (
    <Card title="Correct a balance" subtitle="Overwrites the saved balance of one account on one day, e.g. a year-end figure from your statement. Daily snapshots keep working as usual.">
      <div className="grid max-w-3xl gap-3 sm:grid-cols-[1fr_160px_180px_auto] sm:items-end">
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">Account</span>
          <select className={inputCls} value={id} onChange={e => setAccountId(Number(e.target.value))}>{accounts.map(a => <option key={a.id} value={a.id}>{label(a)}</option>)}</select></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">Date</span>
          <input type="date" className={inputCls} value={date} onChange={e => setDate(e.target.value)} /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">Correct balance</span>
          <MoneyInput value={balance} onChange={setBalance} /></label>
        <button className={btnCls} disabled={!id || !date || !balance || save.isPending} onClick={() => save.mutate({ id, date, balance })}>Save</button>
      </div>
      <p className="mt-3 text-sm text-slate-500">{current == null ? 'No balance saved for that day yet.' : `Currently saved for that day: ${money(current)}`}</p>
    </Card>
  );
}
