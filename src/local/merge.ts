/**
 * Three-way merge of the SQLite database: base (state at the last sync), local (this device), remote (Drive).
 * Per row: if this device did not change it since base, Drive's version wins (including deletions); if this device changed,
 * added or deleted it, this device's version wins. Rows changed only on Drive are kept, so edits made offline on
 * two devices end up in both. Only the *same row* edited on both sides is a real conflict, and there this device (the later sync) wins.
 */
import type { Database } from 'sql.js';
import { openTemp, type Row } from './db';

interface Spec { table: string; key?: string[]; unit?: string; noId?: boolean }
/** Parents before children. `unit` tables are merged as a whole set per parent value (they are rewritten wholesale on save). */
const SPECS: Spec[] = [
  { table: 'person', key: ['id'] },
  { table: 'category', key: ['id'] },
  { table: 'month', key: ['id'] },
  { table: 'income_entry', unit: 'month_id', noId: true },
  { table: 'expense_entry', key: ['month_id', 'category_id'], noId: true },
  { table: 'credit_card', key: ['id'] },
  { table: 'card_spend', key: ['month_id', 'card_id'], noId: true },
  { table: 'savings_actual', key: ['month_id'] },
  { table: 'account', key: ['id'] },
  { table: 'account_balance', key: ['account_id', 'date'] },
  { table: 'investment_deposit', key: ['month_id', 'account_id'], noId: true },
  { table: 'contribution_room', key: ['person_id', 'account_type', 'year'] },
  { table: 'wealth_year', key: ['year'] },
  { table: 'holding', key: ['id'] },
  { table: 'holding_snapshot', key: ['account_id', 'date', 'ticker'] },
  { table: 'settings', key: ['key'] },
];

function rowsOf(d: Database, table: string, noId?: boolean): Row[] {
  const res = d.exec(`SELECT * FROM ${table}`)[0];
  if (!res) return [];
  return res.values.map(v => {
    const r: Row = {};
    res.columns.forEach((c, i) => { if (!(noId && c === 'id')) r[c] = v[i]; });
    return r;
  });
}
const ser = (r: Row | undefined) => (r ? JSON.stringify(r) : '');

/** Returns [key → group] where a group is the list of rows sharing that key (a single row for keyed tables). */
function group(rows: Row[], spec: Spec): Map<string, Row[]> {
  const m = new Map<string, Row[]>();
  for (const r of rows) {
    const k = spec.unit ? String(r[spec.unit]) : spec.key!.map(c => String(r[c])).join('\u0001');
    (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  }
  if (spec.unit) for (const g of m.values()) g.sort((a, b) => ser(a).localeCompare(ser(b)));
  return m;
}
const same = (a?: Row[], b?: Row[]) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

export async function mergeDatabases(baseBytes: Uint8Array | null, localBytes: Uint8Array, remoteBytes: Uint8Array): Promise<Uint8Array> {
  const [base, local, remote, out] = await Promise.all([openTemp(baseBytes), openTemp(localBytes), openTemp(remoteBytes), openTemp()]);
  try {
    out.run('PRAGMA foreign_keys = OFF');
    out.run('BEGIN');
    for (const spec of SPECS) {
      const b = group(rowsOf(base, spec.table, spec.noId), spec);
      const l = group(rowsOf(local, spec.table, spec.noId), spec);
      const r = group(rowsOf(remote, spec.table, spec.noId), spec);
      const info = out.exec(`PRAGMA table_info(${spec.table})`)[0].values.map(v => String(v[1])).filter(c => !(spec.noId && c === 'id'));
      const ins = out.prepare(`INSERT OR REPLACE INTO ${spec.table}(${info.join(',')}) VALUES (${info.map(() => '?').join(',')})`);
      for (const k of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
        const localChanged = !same(b.get(k), l.get(k));
        const winner = localChanged ? l.get(k) : r.get(k);
        for (const row of winner ?? []) ins.run(info.map(c => row[c] ?? null) as any[]);
      }
      ins.free();
    }
    out.run('COMMIT');
    // drop rows whose parent was deleted on the other side (e.g. an expense for a category removed elsewhere)
    for (let i = 0; i < 10; i++) {
      const bad = out.exec('PRAGMA foreign_key_check')[0]?.values ?? [];
      if (!bad.length) break;
      for (const [table, rowid] of bad) out.run(`DELETE FROM ${table} WHERE rowid = ?`, [rowid as number]);
    }
    return out.export();
  } finally { base.close(); local.close(); remote.close(); out.close(); }
}
