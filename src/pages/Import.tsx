import { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { useSave } from '../api';
import { Card, PageHeader, btnCls, inputCls, CrossTable } from '../components/ui';
import { money } from '../lib/calc';

type Sheet = { name: string; rows: any[][] };
type Out = { year: number; month: number; type: 'income' | 'expense'; name: string; amount: number };

function toDate(v: unknown): Date | null {
  if (v instanceof Date && !isNaN(+v)) return v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 86400 * 1000));
  if (typeof v === 'string') { const d = new Date(v); return isNaN(+d) ? null : d; }
  return null;
}
const toNum = (v: unknown) => typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));

export default function Import() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [col, setCol] = useState({ date: -1, name: -1, amount: -1 });
  const [sign, setSign] = useState<'signed' | 'expenses'>('signed');
  const now = new Date();
  const [fallback, setFallback] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const commit = useSave<{ rows: Out[] }>('POST', '/api/import');

  const sheet = sheets[sheetIdx];
  const header = sheet?.rows[0]?.map(String) ?? [];

  async function onFile(f: File) {
    const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
    const s = wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, raw: true, blankrows: false }) }));
    setSheets(s); setSheetIdx(0); commit.reset();
    guess(s[0]);
  }
  function guess(s?: Sheet) {
    const h = (s?.rows[0] ?? []).map(x => String(x).toLowerCase());
    const find = (re: RegExp) => h.findIndex(x => re.test(x));
    setCol({ date: find(/date|month/), name: find(/categor|desc|name|payee|merchant/), amount: find(/amount|total|value|cad/) });
  }

  const rows = useMemo<Out[]>(() => {
    if (!sheet || col.amount < 0 || col.name < 0) return [];
    const agg = new Map<string, Out>();
    for (const r of sheet.rows.slice(1)) {
      const n = toNum(r[col.amount]);
      if (!n || isNaN(n)) continue;
      const d = col.date >= 0 ? toDate(r[col.date]) : null;
      const year = d?.getFullYear() ?? fallback.year, month = d ? d.getMonth() + 1 : fallback.month;
      const type: Out['type'] = sign === 'signed' && n > 0 ? 'income' : 'expense';
      const name = String(r[col.name] ?? 'Uncategorized').trim() || 'Uncategorized';
      const key = `${year}-${month}-${type}-${name.toLowerCase()}`;
      const prev = agg.get(key);
      const amt = Math.abs(n);
      if (prev) prev.amount += amt; else agg.set(key, { year, month, type, name, amount: amt });
    }
    return [...agg.values()].sort((a, b) => a.year - b.year || a.month - b.month);
  }, [sheet, col, sign, fallback]);

  const Sel = ({ k, label }: { k: keyof typeof col; label: string }) => (
    <label className="text-xs text-slate-500">{label}
      <select className={`${inputCls} mt-1`} value={col[k]} onChange={e => setCol(c => ({ ...c, [k]: Number(e.target.value) }))}>
        <option value={-1}>— none —</option>
        {header.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
      </select>
    </label>
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader title="Import" subtitle="Bring in a spreadsheet or bank export in three steps." />
      <Card title="1. Choose a file" subtitle="XLSX, XLS or CSV with one transaction/line per row. Parsed in your browser, nothing is uploaded elsewhere.">
        <input type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files?.[0] && onFile(e.target.files[0])}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-4 file:py-2 file:text-white" />
      </Card>

      {sheet && (
        <Card title="2. Map columns">
          <div className="grid gap-4 md:grid-cols-5">
            <label className="text-xs text-slate-500">Sheet
              <select className={`${inputCls} mt-1`} value={sheetIdx} onChange={e => { setSheetIdx(Number(e.target.value)); guess(sheets[Number(e.target.value)]); }}>
                {sheets.map((s, i) => <option key={s.name} value={i}>{s.name}</option>)}
              </select>
            </label>
            <Sel k="date" label="Date column" /><Sel k="name" label="Category / description" /><Sel k="amount" label="Amount" />
            <label className="text-xs text-slate-500">Amount sign
              <select className={`${inputCls} mt-1`} value={sign} onChange={e => setSign(e.target.value as any)}>
                <option value="signed">Positive = income, negative = expense</option>
                <option value="expenses">Everything is an expense</option>
              </select>
            </label>
          </div>
          {col.date < 0 && (
            <div className="mt-4 flex items-center gap-2 text-sm">No date column → assign all rows to
              <input type="number" className={`${inputCls} w-20`} value={fallback.month} min={1} max={12} onChange={e => setFallback(f => ({ ...f, month: Number(e.target.value) }))} />/
              <input type="number" className={`${inputCls} w-24`} value={fallback.year} onChange={e => setFallback(f => ({ ...f, year: Number(e.target.value) }))} />
            </div>
          )}
        </Card>
      )}

      {rows.length > 0 && (
        <Card title={`3. Preview (${rows.length} lines after grouping by month + category)`}
          right={<button className={btnCls} onClick={() => commit.mutate({ rows })} disabled={commit.isPending}>{commit.isSuccess ? 'Imported ✓' : 'Import'}</button>}>
          <p className="mb-3 text-xs text-slate-500">New expense categories are created as “variable”; adjust kind and living flag in Settings. Amounts for a category already in that month are added to it.</p>
          <div className="max-h-96 overflow-auto text-sm">
            <CrossTable><table className="w-full"><thead className="sticky top-0 bg-white text-left text-xs text-slate-500"><tr><th className="p-2">Month</th><th>Type</th><th>Name</th><th className="text-right">Amount</th></tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-100"><td className="p-2">{r.year}-{String(r.month).padStart(2, '0')}</td>
                  <td className={r.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}>{r.type}</td><td>{r.name}</td><td className="text-right">{money(r.amount, 2)}</td></tr>
              ))}</tbody></table></CrossTable>
          </div>
          {commit.isError && <p className="mt-2 text-sm text-rose-600">Import failed: {String(commit.error)}</p>}
        </Card>
      )}
    </div>
  );
}
