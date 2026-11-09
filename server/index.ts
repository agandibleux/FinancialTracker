import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { db, getSettings, monthId, tx } from './db';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

type Row = Record<string, any>;
const all = (sql: string, ...p: any[]) => db.prepare(sql).all(...p) as Row[];
const get = (sql: string, ...p: any[]) => db.prepare(sql).get(...p) as Row | undefined;
const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p);

// ---- people ----
app.get('/api/people', (_q, r) => r.json(all('SELECT * FROM person ORDER BY id')));
app.put('/api/people', (q, r) => {
  tx(() => {
    for (const p of q.body as { id?: number; name: string }[]) {
      if (p.id) run('UPDATE person SET name=? WHERE id=?', p.name, p.id);
      else run('INSERT INTO person(name) VALUES (?)', p.name);
    }
  });
  r.json(all('SELECT * FROM person ORDER BY id'));
});

// ---- categories ----
app.get('/api/categories', (_q, r) => r.json(all('SELECT * FROM category ORDER BY kind, name')));
app.post('/api/categories', (q, r) => {
  const c = q.body;
  const res = run('INSERT INTO category(name, kind, parent_id, counts_as_living, default_amount, archived) VALUES (?,?,?,?,?,0)',
    c.name, c.kind, c.parent_id ?? null, c.counts_as_living ?? 1, c.default_amount ?? 0);
  r.json(get('SELECT * FROM category WHERE id=?', Number(res.lastInsertRowid)));
});
app.put('/api/categories/:id', (q, r) => {
  const c = q.body;
  run('UPDATE category SET name=?, kind=?, parent_id=?, counts_as_living=?, default_amount=?, archived=? WHERE id=?',
    c.name, c.kind, c.parent_id ?? null, c.counts_as_living ? 1 : 0, c.default_amount ?? 0, c.archived ? 1 : 0, q.params.id);
  r.json({ ok: true });
});
app.delete('/api/categories/:id', (q, r) => { run('DELETE FROM category WHERE id=?', q.params.id); r.json({ ok: true }); });

// ---- months ----
const SUMMARY_SQL = `
SELECT m.year, m.month, m.note,
  COALESCE((SELECT SUM(amount) FROM income_entry WHERE month_id=m.id),0) AS income,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e WHERE e.month_id=m.id),0) AS expenses,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e JOIN category c ON c.id=e.category_id WHERE e.month_id=m.id AND c.kind='fixed'),0) AS fixed,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e JOIN category c ON c.id=e.category_id WHERE e.month_id=m.id AND c.kind='utility'),0) AS utility,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e JOIN category c ON c.id=e.category_id WHERE e.month_id=m.id AND c.kind='variable'),0) AS variable,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e JOIN category c ON c.id=e.category_id WHERE e.month_id=m.id AND c.counts_as_living=1 AND c.kind!='fixed'),0) AS living,
  s.to_cash, s.to_investments
FROM month m LEFT JOIN savings_actual s ON s.month_id=m.id`;

app.get('/api/months', (_q, r) => {
  const rows = all(`${SUMMARY_SQL} ORDER BY m.year, m.month`).map(x => ({
    ...x,
    predicted: x.income - x.expenses,
    to_cash: x.to_cash ?? 0,
    to_investments: x.to_investments ?? 0,
    actual: x.to_cash == null ? null : x.to_cash + x.to_investments,
  }));
  r.json(rows);
});

app.get('/api/months/:year/:month', (q, r) => {
  const year = Number(q.params.year), month = Number(q.params.month);
  const m = get('SELECT id, note FROM month WHERE year=? AND month=?', year, month);
  if (!m) return r.json({ year, month, note: '', income: [], expenses: [], savings: null });
  r.json({
    year, month, note: m.note,
    income: all('SELECT person_id, source, amount FROM income_entry WHERE month_id=? ORDER BY id', m.id),
    expenses: all('SELECT category_id, amount FROM expense_entry WHERE month_id=?', m.id),
    savings: get('SELECT to_cash, to_investments, note FROM savings_actual WHERE month_id=?', m.id) ?? null,
  });
});

app.put('/api/months/:year/:month', (q, r) => {
  const year = Number(q.params.year), month = Number(q.params.month);
  const b = q.body;
  tx(() => {
    const id = monthId(year, month);
    run('UPDATE month SET note=? WHERE id=?', b.note ?? '', id);
    run('DELETE FROM income_entry WHERE month_id=?', id);
    run('DELETE FROM expense_entry WHERE month_id=?', id);
    for (const i of b.income ?? []) if (i.amount) run('INSERT INTO income_entry(month_id, person_id, source, amount) VALUES (?,?,?,?)', id, i.person_id, i.source || 'Salary', i.amount);
    for (const e of b.expenses ?? []) if (e.amount) run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', id, e.category_id, e.amount);
    if (b.savings) {
      run(`INSERT INTO savings_actual(month_id, to_cash, to_investments, note) VALUES (?,?,?,?)
           ON CONFLICT(month_id) DO UPDATE SET to_cash=excluded.to_cash, to_investments=excluded.to_investments, note=excluded.note`,
        id, b.savings.to_cash ?? 0, b.savings.to_investments ?? 0, b.savings.note ?? '');
    } else run('DELETE FROM savings_actual WHERE month_id=?', id);
  });
  r.json({ ok: true });
});

// ---- settings ----
app.get('/api/settings', (_q, r) => r.json(getSettings()));
app.put('/api/settings', (q, r) => {
  const s = q.body;
  run('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', 'emergency_months', String(s.emergency_months));
  run('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', 'ratios', JSON.stringify(s.ratios));
  r.json(getSettings());
});

// ---- wealth ----
app.get('/api/wealth', (_q, r) => r.json(all('SELECT * FROM wealth_year ORDER BY year')));
app.put('/api/wealth', (q, r) => {
  tx(() => {
    for (const w of q.body as Row[])
      run(`INSERT INTO wealth_year(year, start_wealth, return_pct, monthly_contribution, actual_end) VALUES (?,?,?,?,?)
           ON CONFLICT(year) DO UPDATE SET start_wealth=excluded.start_wealth, return_pct=excluded.return_pct,
           monthly_contribution=excluded.monthly_contribution, actual_end=excluded.actual_end`,
        w.year, w.start_wealth, w.return_pct, w.monthly_contribution, w.actual_end ?? null);
  });
  r.json(all('SELECT * FROM wealth_year ORDER BY year'));
});
app.delete('/api/wealth/:year', (q, r) => { run('DELETE FROM wealth_year WHERE year=?', q.params.year); r.json({ ok: true }); });

// ---- accounts & room ----
app.get('/api/accounts', (_q, r) => r.json(all('SELECT * FROM account ORDER BY person_id, type')));
app.put('/api/accounts', (q, r) => {
  tx(() => {
    for (const a of q.body as Row[]) {
      if (a.id) run('UPDATE account SET person_id=?, type=?, name=?, balance=? WHERE id=?', a.person_id, a.type, a.name, a.balance, a.id);
      else run('INSERT INTO account(person_id, type, name, balance) VALUES (?,?,?,?)', a.person_id, a.type, a.name, a.balance);
    }
  });
  r.json(all('SELECT * FROM account ORDER BY person_id, type'));
});
app.delete('/api/accounts/:id', (q, r) => { run('DELETE FROM account WHERE id=?', q.params.id); r.json({ ok: true }); });

app.get('/api/account-history', (_q, r) => r.json(all('SELECT account_id, date, balance FROM account_balance ORDER BY date')));
app.post('/api/accounts/:id/snapshot', (q, r) => {
  const id = Number(q.params.id), { date, balance } = q.body;
  tx(() => {
    run(`INSERT INTO account_balance(account_id, date, balance) VALUES (?,?,?)
         ON CONFLICT(account_id, date) DO UPDATE SET balance=excluded.balance`, id, date, balance);
    run('UPDATE account SET balance=(SELECT balance FROM account_balance WHERE account_id=? ORDER BY date DESC LIMIT 1) WHERE id=?', id, id);
  });
  r.json({ ok: true });
});
app.get('/api/expenses', (_q, r) => r.json(all(
  `SELECT m.year, m.month, e.category_id, e.amount FROM expense_entry e JOIN month m ON m.id=e.month_id ORDER BY m.year, m.month`)));
app.get('/api/expenses/:year', (q, r) => r.json(all(
  `SELECT m.month, e.category_id, e.amount FROM expense_entry e JOIN month m ON m.id=e.month_id WHERE m.year=? ORDER BY m.month`, q.params.year)));

app.get('/api/rooms', (_q, r) => r.json(all('SELECT * FROM contribution_room ORDER BY year, person_id, account_type')));
app.put('/api/rooms', (q, r) => {
  tx(() => {
    for (const x of q.body as Row[])
      run(`INSERT INTO contribution_room(person_id, account_type, year, room, contributed) VALUES (?,?,?,?,?)
           ON CONFLICT(person_id, account_type, year) DO UPDATE SET room=excluded.room, contributed=excluded.contributed`,
        x.person_id, x.account_type, x.year, x.room, x.contributed ?? 0);
  });
  r.json(all('SELECT * FROM contribution_room ORDER BY year, person_id, account_type'));
});

// ---- import (rows already parsed in the browser) ----
app.post('/api/import', (q, r) => {
  const rows = q.body.rows as { year: number; month: number; type: 'income' | 'expense'; name: string; person?: string; amount: number }[];
  let count = 0;
  tx(() => {
    for (const x of rows) {
      if (!x.amount || !x.year || !x.month) continue;
      const id = monthId(x.year, x.month);
      if (x.type === 'income') {
        let p = get('SELECT id FROM person WHERE name=?', x.person ?? '') ?? get('SELECT id FROM person ORDER BY id LIMIT 1');
        if (!p) { run('INSERT INTO person(name) VALUES (?)', x.person || 'Me'); p = get('SELECT id FROM person ORDER BY id LIMIT 1')!; }
        run('INSERT INTO income_entry(month_id, person_id, source, amount) VALUES (?,?,?,?)', id, p.id, x.name || 'Income', x.amount);
      } else {
        let c = get('SELECT id FROM category WHERE lower(name)=lower(?)', x.name);
        if (!c) { run("INSERT INTO category(name, kind) VALUES (?, 'variable')", x.name); c = get('SELECT id FROM category WHERE name=?', x.name)!; }
        run(`INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)
             ON CONFLICT(month_id, category_id) DO UPDATE SET amount = amount + excluded.amount`, id, c.id, x.amount);
      }
      count++;
    }
  });
  r.json({ imported: count });
});

// ---- ETF holdings (per account) ----
const HCOLS = ['account_id', 'ticker', 'quote_symbol', 'info', 'sector', 'expense_ratio', 'yield_pct', 'shares', 'avg_price', 'price',
  'prev_close', 'price_date', 'target_pct', 'usa', 'can', 'other_geo', 'stocks', 'bonds', 'other_cls'];
const hvals = (h: Row) => HCOLS.map(c => h[c] ?? (['ticker', 'quote_symbol', 'info', 'sector', 'price_date'].includes(c) ? '' : 0));
const withSource = (rows: Row[]) => rows.map(h => ({ ...h, yahoo_symbol: yahooSymbol(h.ticker, h.quote_symbol) }));
const allHoldings = () => withSource(all('SELECT * FROM holding ORDER BY account_id, ticker'));
app.get('/api/holdings', (_q, r) => r.json(allHoldings()));
app.put('/api/holdings', (q, r) => {
  tx(() => {
    for (const h of q.body as Row[]) {
      if (h.id) run(`UPDATE holding SET ${HCOLS.map(c => `${c}=?`).join(',')} WHERE id=?`, ...hvals(h), h.id);
      else run(`INSERT INTO holding(${HCOLS.join(',')}) VALUES (${HCOLS.map(() => '?').join(',')})`, ...hvals(h));
    }
  });
  snapshotAccounts();
  r.json(allHoldings());
});
app.delete('/api/holdings/:id', (q, r) => { run('DELETE FROM holding WHERE id=?', q.params.id); snapshotAccounts(); r.json({ ok: true }); });

/**
 * Maps a ticker (plain, Google Finance "TSE:VFV", or Yahoo "VFV.TO") to a Yahoo symbol.
 * Plain tickers are assumed to be TSX listings. Mutual funds use their Morningstar ID (e.g. 0P00015IR7) as quote_symbol, with .TO appended.
 */
const GOOGLE_SUFFIX: Record<string, string> = { TSE: '.TO', CVE: '.V', NEO: '.NE', CNSX: '.CN', LON: '.L', EPA: '.PA', FRA: '.F', ETR: '.DE' };
const US_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'NYSEARCA', 'NYSEAMERICAN', 'BATS', 'OTCMKTS']);
function yahooSymbol(ticker: string, override = ''): string | null {
  const t = (override || ticker).trim().toUpperCase();
  if (!t || /\s/.test(t)) return null;
  const g = t.match(/^([A-Z]+):(.+)$/);
  if (g) {
    const base = g[2].replace('.', '-');
    if (US_EXCHANGES.has(g[1])) return base;
    return base + (GOOGLE_SUFFIX[g[1]] ?? '');
  }
  if (override) return t;
  return `${t.replace('.', '-')}.TO`;
}

async function chart(symbol: string, range: string, interval: string) {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const r = ((await res.json()) as any).chart?.result?.[0];
  if (!r?.meta?.regularMarketPrice) throw new Error('no price');
  return r;
}
/**
 * Mutual funds (Morningstar performance IDs like 0P00015IR7) come straight from Morningstar's realtime quote API, the same source the
 * muFunds Sheets add-on uses; it posts the day's NAV hours before Yahoo does.
 */
const isMorningstarId = (symbol: string) => /^0P[0-9A-Z]{8}(\.TO)?$/.test(symbol);
async function morningstarQuote(symbol: string) {
  const id = symbol.replace(/\.TO$/, '');
  const res = await fetch(`https://global.morningstar.com/api/v1/en-gb/stores/realtime/quotes?securities=${encodeURIComponent(id)}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const q = ((await res.json()) as any)[id], v = (x: any) => x?.value;
  const price = v(q?.lastPrice), date = v(q?.lastPrice?.properties?.date) ?? v(q?.date);
  if (!price) throw new Error('no price');
  return { price: price as number, prev: (v(q.previousClosePrice) ?? price - (v(q.netChange) ?? 0)) as number, asOf: typeof date === 'string' ? date.slice(0, 10) : '' };
}
async function quote(symbol: string) {
  if (isMorningstarId(symbol)) { try { return await morningstarQuote(symbol); } catch { /* fall back to Yahoo's NAV */ } }
  const c = await chart(symbol, '5d', '1d'), m = c.meta;
  // chartPreviousClose is the close before the whole 5d window, not yesterday's: take the previous daily bar instead.
  const tz = 'America/Toronto', dayOf = (t: number) => new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: tz });
  const ts: number[] = c.timestamp ?? [], closes: (number | null)[] = c.indicators?.quote?.[0]?.close ?? [];
  const bars = ts.map((t, i) => ({ d: dayOf(t), c: closes[i] })).filter((b): b is { d: string; c: number } => b.c != null);
  const quoteDay = m.regularMarketTime ? dayOf(m.regularMarketTime) : '';
  const prevBar = [...bars].reverse().find(b => b.d !== quoteDay);
  const prevClose = prevBar?.c;
  // Funds publish one NAV per day: record the date of the quote itself, not the day we happened to fetch it.
  const asOf = m.regularMarketTime ? new Date(m.regularMarketTime * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) : '';
  return { price: m.regularMarketPrice as number, prev: (prevClose ?? m.previousClose ?? m.regularMarketPrice) as number, asOf };
}
/**
 * Daily history per account: one balance row per account per day (account_balance) and the holdings behind it
 * (holding_snapshot). Accounts with holdings are valued shares × price; others keep their manual balance.
 * History rows are only written when a `date` is passed, and that is only done by the 23:30 close-out, so a day's row always
 * holds that day's final prices and is never created early (e.g. just after midnight from yesterday's prices).
 * Without a date, only the live account balance is updated. Re-running on the same day overwrites that day's row.
 */
const today = () => new Date().toLocaleDateString('en-CA'); // local date, YYYY-MM-DD
function snapshotAccounts(date?: string) {
  tx(() => {
    for (const a of all('SELECT id, balance FROM account')) {
      const hs = all('SELECT ticker, shares, price, avg_price FROM holding WHERE account_id=? AND shares > 0', a.id);
      let balance = a.balance as number;
      if (hs.length) {
        balance = hs.reduce((t, h) => t + h.shares * h.price, 0);
        run('UPDATE account SET balance=? WHERE id=?', balance, a.id);
        if (date) for (const h of hs) run(`INSERT INTO holding_snapshot(account_id, date, ticker, shares, price, avg_price) VALUES (?,?,?,?,?,?)
          ON CONFLICT(account_id, date, ticker) DO UPDATE SET shares=excluded.shares, price=excluded.price, avg_price=excluded.avg_price`,
          a.id, date, h.ticker, h.shares, h.price, h.avg_price);
      }
      if (date) run(`INSERT INTO account_balance(account_id, date, balance) VALUES (?,?,?)
           ON CONFLICT(account_id, date) DO UPDATE SET balance=excluded.balance`, a.id, date, balance);
    }
  });
}

async function refreshPrices(closeDate?: string) {
  const rows = all('SELECT id, ticker, quote_symbol FROM holding WHERE shares > 0 OR price = 0');
  const date = today();
  const failed: string[] = [];
  let updated = 0;
  await Promise.all(rows.map(async h => {
    const sym = yahooSymbol(h.ticker, h.quote_symbol);
    if (!sym) return; // manual-price holding (mutual fund)
    try {
      const x = await quote(sym);
      run('UPDATE holding SET price=?, prev_close=?, price_date=? WHERE id=?', x.price, x.prev, x.asOf || date, h.id);
      updated++;
    } catch { failed.push(sym); }
  }));
  snapshotAccounts(closeDate);
  return { updated, failed };
}
app.post('/api/holdings/refresh', async (_q, r) => r.json(await refreshPrices()));
app.post('/api/snapshot', (_q, r) => { snapshotAccounts(); r.json({ ok: true }); });
app.get('/api/account-history.csv', (_q, r) => {
  const rows = all(`SELECT b.date, p.name AS owner, a.type, a.name AS account, b.balance FROM account_balance b
                    JOIN account a ON a.id=b.account_id JOIN person p ON p.id=a.person_id ORDER BY b.date, p.name, a.type, a.name`);
  const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  r.type('text/csv').attachment('account-history.csv')
    .send(['date,owner,type,account,balance', ...rows.map(x => [x.date, q(x.owner), x.type, q(x.account), Number(x.balance).toFixed(2)].join(','))].join('\n'));
});
app.get('/api/holding-history', (_q, r) => r.json(all('SELECT * FROM holding_snapshot ORDER BY date, account_id, ticker')));

const RANGES: Record<string, string> = { '1M': '1mo|1d', '6M': '6mo|1d', 'YTD': 'ytd|1d', '1Y': '1y|1d', '5Y': '5y|1wk', 'MAX': 'max|1mo' };
/** Price history for every distinct ticker held (mutual funds are skipped). */
app.get('/api/history', async (q, r) => {
  const [range, interval] = (RANGES[String(q.query.range ?? '1Y')] ?? RANGES['1Y']).split('|');
  const rows = all('SELECT ticker, quote_symbol FROM holding');
  const syms = new Map<string, string>();
  for (const h of rows) { const s = yahooSymbol(h.ticker, h.quote_symbol); if (s) syms.set(h.ticker, s); }
  const out = await Promise.all([...syms].map(async ([ticker, symbol]) => {
    try {
      const c = await chart(symbol, range, interval);
      const ts: number[] = c.timestamp ?? [], close: (number | null)[] = c.indicators?.quote?.[0]?.close ?? [];
      const points = ts.map((t, i) => ({ t: t * 1000, c: close[i] })).filter(p => p.c != null);
      return { ticker, symbol, name: c.meta.longName ?? c.meta.shortName ?? ticker, currency: c.meta.currency, points };
    } catch { return { ticker, symbol, name: ticker, currency: '', points: [], error: true }; }
  }));
  r.json(out);
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, () => console.log(`API on http://localhost:${port}`));

// Keep the daily history going while the app is running: refresh prices at start-up, then hourly (one row per day).
/** One full copy of the database per day (last 30 kept), so the history survives a bad edit or a corrupted file. */
function dailyBackup(force = false) {
  const dir = path.resolve('data', 'backups'), file = path.join(dir, `finance-${today()}.db`);
  if (fs.existsSync(file) && !force) return;
  fs.mkdirSync(dir, { recursive: true });
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(path.resolve('data', process.env.DB_FILE ?? 'finance.db'), file);
  for (const f of fs.readdirSync(dir).filter(f => /^finance-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -30)) fs.unlinkSync(path.join(dir, f));
}
const tick = () => refreshPrices().catch(() => snapshotAccounts()).finally(() => { try { dailyBackup(); } catch { /* backup is best-effort */ } });
tick();
setInterval(tick, 15 * 60 * 1000); // intraday: keeps live prices and balances current; history rows come from the close-out only

/**
 * Daily close-out at 23:30 local time: fetch the last prices, then write that day's final value for every account
 * plus the holdings behind it, and take the daily backup. Checked every minute so a
 * laptop that was asleep at 23:30 still closes the day as soon as it wakes, but only before midnight (never into the next day).
 */
const closeKey = 'last_close';
async function closeDay() {
  const now = new Date();
  if (now.getHours() * 60 + now.getMinutes() < Number(process.env.CLOSE_MINUTE ?? 23 * 60 + 30)) return;
  const day = today();
  if ((get('SELECT value FROM settings WHERE key=?', closeKey) as Row | undefined)?.value === day) return;
  run('INSERT INTO settings(key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', closeKey, day);
  try { await refreshPrices(day); } catch { snapshotAccounts(day); }
  try { dailyBackup(true); } catch { /* best-effort */ }
  console.log(`Closed ${day}: daily values saved for ${all('SELECT 1 FROM account_balance WHERE date=?', day).length} accounts`);
}
setInterval(() => { closeDay().catch(e => console.error('close-out failed', e)); }, 60 * 1000);
