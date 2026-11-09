import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import { ADDED_COLUMNS, SCHEMA_SQL } from './schema';

export type Row = Record<string, any>;

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;

/** Called after every committed write; the storage layer persists + syncs from here. */
let onWrite: () => void = () => {};
export const setWriteHook = (fn: () => void) => { onWrite = fn; };

export async function loadEngine(wasm?: ArrayBuffer | Uint8Array) {
  if (SQL) return SQL;
  if (wasm) SQL = await initSqlJs({ wasmBinary: wasm as ArrayBuffer });
  else {
    const url = (await import('sql.js/dist/sql-wasm.wasm?url')).default;
    SQL = await initSqlJs({ locateFile: () => url });
  }
  return SQL;
}

function prepareDb(d: Database) {
  d.run('PRAGMA foreign_keys = ON');
  d.exec(SCHEMA_SQL);
  for (const [t, c, ddl] of ADDED_COLUMNS) {
    const cols = d.exec(`PRAGMA table_info(${t})`)[0]?.values.map(v => v[1]) ?? [];
    if (!cols.includes(c)) d.run(`ALTER TABLE ${t} ADD COLUMN ${c} ${ddl}`);
  }
}

/** Opens a database from SQLite file bytes (or empty). Replaces the current one. */
export async function openDb(bytes?: Uint8Array | null, wasm?: ArrayBuffer | Uint8Array) {
  const S = await loadEngine(wasm);
  db?.close();
  db = bytes ? new S.Database(bytes) : new S.Database();
  prepareDb(db);
  return db;
}

/** Standalone in-memory database (used by the merge); does not touch the working one. */
export async function openTemp(bytes?: Uint8Array | null): Promise<Database> {
  const S = await loadEngine();
  const d = bytes ? new S.Database(bytes) : new S.Database();
  prepareDb(d);
  return d;
}

/**
 * New rows get random ids instead of 1,2,3…: two devices adding rows while offline can never collide, so merging is exact.
 * (2^40 range stays well inside JS's safe-integer limit.)
 */
export const newId = () => 1_000_000 + Math.floor(Math.random() * 2 ** 40);

export const hasDb = () => db !== null;
const D = () => { if (!db) throw new Error('Database not open'); return db; };

/** Whole database as SQLite file bytes. export() closes + reopens the connection, which resets the foreign_keys pragma. */
export function exportDb(): Uint8Array {
  const bytes = D().export();
  D().run('PRAGMA foreign_keys = ON');
  return bytes;
}

const norm = (p: any[]) => p.map(v => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));

export function all(sql: string, ...p: any[]): Row[] {
  const st = D().prepare(sql);
  try {
    st.bind(norm(p));
    const out: Row[] = [];
    while (st.step()) out.push(st.getAsObject());
    return out;
  } finally { st.free(); }
}
export const get = (sql: string, ...p: any[]): Row | undefined => all(sql, ...p)[0];
export function run(sql: string, ...p: any[]) {
  D().run(sql, norm(p));
  return { lastInsertRowid: Number(D().exec('SELECT last_insert_rowid()')[0].values[0][0]) };
}

export function tx<T>(fn: () => T): T {
  D().run('BEGIN');
  try { const r = fn(); D().run('COMMIT'); return r; }
  catch (e) { D().run('ROLLBACK'); throw e; }
}

export function monthId(year: number, month: number): number {
  // deterministic id: the same month created on two devices is the same row
  run('INSERT OR IGNORE INTO month(id, year, month) VALUES (?, ?, ?)', year * 100 + month, year, month);
  return get('SELECT id FROM month WHERE year=? AND month=?', year, month)!.id;
}

export const DEFAULT_RATIOS = [
  { account: 'TFSA', pct: 40 }, { account: 'RRSP', pct: 30 },
  { account: 'FHSA', pct: 10 }, { account: 'NONREG', pct: 20 },
];

export function getSettings() {
  const m = Object.fromEntries(all('SELECT key, value FROM settings').map(r => [r.key, r.value]));
  return {
    emergency_months: Number(m.emergency_months ?? 3),
    ratios: m.ratios ? JSON.parse(m.ratios) : DEFAULT_RATIOS,
  };
}

export const notifyWrite = () => onWrite();
