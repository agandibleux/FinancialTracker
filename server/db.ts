import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { ADDED_COLUMNS, SCHEMA_SQL } from '../src/local/schema';

const dir = path.resolve(process.cwd(), 'data');
fs.mkdirSync(dir, { recursive: true });
export const db = new DatabaseSync(path.join(dir, process.env.DB_FILE ?? 'finance.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(SCHEMA_SQL);

function addColumn(table: string, col: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${ddl}`);
}
for (const [t, c, ddl] of ADDED_COLUMNS) addColumn(t, c, ddl);

export const DEFAULT_RATIOS = [
  { account: 'TFSA', pct: 40 }, { account: 'RRSP', pct: 30 },
  { account: 'FHSA', pct: 10 }, { account: 'NONREG', pct: 20 },
];

export function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const m = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    emergency_months: Number(m.emergency_months ?? 3),
    ratios: m.ratios ? JSON.parse(m.ratios) : DEFAULT_RATIOS,
  };
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

export function monthId(year: number, month: number): number {
  db.prepare('INSERT OR IGNORE INTO month(year, month) VALUES (?, ?)').run(year, month);
  return (db.prepare('SELECT id FROM month WHERE year=? AND month=?').get(year, month) as { id: number }).id;
}
