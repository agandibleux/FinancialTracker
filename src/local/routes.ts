/**
 * The former Express API, running in the browser against the local SQLite database.
 * `apiFetch` mimics `fetch('/api/...')` so the pages and hooks stay unchanged.
 */
import { all, get, getSettings, monthId, newId, notifyWrite, run, tx, type Row } from './db';
import { NoProxyError, chart, quote, yahooSymbol } from './quotes';

type Ctx = { p: string[]; q: URLSearchParams; body: any };
type Handler = (c: Ctx) => unknown | Promise<unknown>;

const people = () => all('SELECT * FROM person ORDER BY id');
const accounts = () => all('SELECT * FROM account ORDER BY person_id, type');
const rooms = () => all('SELECT * FROM contribution_room ORDER BY year, person_id, account_type');
const wealth = () => all('SELECT * FROM wealth_year ORDER BY year');

const SUMMARY_SQL = `
SELECT m.year, m.month, m.note,
  COALESCE((SELECT SUM(amount) FROM income_entry WHERE month_id=m.id),0) AS income,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e WHERE e.month_id=m.id),0) AS expenses,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e JOIN category c ON c.id=e.category_id WHERE e.month_id=m.id AND c.kind='fixed'),0) AS fixed,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e JOIN category c ON c.id=e.category_id WHERE e.month_id=m.id AND c.kind='utility'),0) AS utility,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e JOIN category c ON c.id=e.category_id WHERE e.month_id=m.id AND c.kind='variable'),0) AS variable,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e JOIN category c ON c.id=e.category_id WHERE e.month_id=m.id AND c.counts_as_living=1 AND c.kind!='fixed'),0) AS living,
  COALESCE((SELECT SUM(e.amount) FROM expense_entry e JOIN category c ON c.id=e.category_id WHERE e.month_id=m.id AND c.kind='variable' AND c.counts_as_living=0),0) AS one_off,
  s.to_cash, s.to_investments
FROM month m LEFT JOIN savings_actual s ON s.month_id=m.id`;

/**
 * Bonus lines are lump sums that would spike the charts, so the summaries spread each year's bonus evenly over
 * its 12 months (as if it had always been part of monthly income). Entries stay untouched in the month itself.
 */
function spreadBonuses(rows: Row[]) {
  const bonus = new Map<number, number>();
  for (const b of all(`SELECT m.year, SUM(i.amount) AS amount FROM income_entry i JOIN month m ON m.id=i.month_id
    WHERE LOWER(i.source) LIKE '%bonus%' GROUP BY m.year`)) bonus.set(b.year, b.amount);
  return rows.map(x => {
    const own = all(`SELECT COALESCE(SUM(i.amount),0) AS a FROM income_entry i JOIN month m ON m.id=i.month_id
      WHERE m.year=? AND m.month=? AND LOWER(i.source) LIKE '%bonus%'`, x.year, x.month)[0]?.a ?? 0;
    const share = (bonus.get(x.year) ?? 0) / 12;
    if (!share && !own) return x;
    const active = x.income > 0 || x.expenses > 0;
    return { ...x, income: x.income - own + (active ? share : 0) };
  });
}

const HCOLS = ['account_id', 'ticker', 'quote_symbol', 'info', 'sector', 'expense_ratio', 'yield_pct', 'shares', 'avg_price', 'price',
  'prev_close', 'price_date', 'target_pct', 'usa', 'can', 'other_geo', 'stocks', 'bonds', 'other_cls'];
const hvals = (h: Row) => HCOLS.map(c => h[c] ?? (['ticker', 'quote_symbol', 'info', 'sector', 'price_date'].includes(c) ? '' : 0));
const allHoldings = () => all('SELECT * FROM holding ORDER BY account_id, ticker')
  .map(h => ({ ...h, yahoo_symbol: yahooSymbol(h.ticker, h.quote_symbol) }));

const today = () => new Date().toLocaleDateString('en-CA'); // local date, YYYY-MM-DD

/**
 * Daily history per account: one balance row per account per day (account_balance) and the holdings behind it
 * (holding_snapshot). Accounts with holdings are valued shares × price; others keep their manual balance.
 * History rows are only written when a `date` is passed. Re-running on the same day overwrites that day's row,
 * so a day's row holds the last prices seen that day.
 */
export function snapshotAccounts(date?: string) {
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

export async function refreshPrices() {
  const rows = all('SELECT id, ticker, quote_symbol FROM holding WHERE shares > 0 OR price = 0');
  const date = today();
  const failed: string[] = [];
  let updated = 0, noProxy = false;
  await Promise.all(rows.map(async h => {
    const sym = yahooSymbol(h.ticker, h.quote_symbol);
    if (!sym) return; // manual-price holding (mutual fund)
    try {
      const x = await quote(sym);
      run('UPDATE holding SET price=?, prev_close=?, price_date=? WHERE id=?', x.price, x.prev, x.asOf || date, h.id);
      updated++;
    } catch (e) { if (e instanceof NoProxyError) noProxy = true; failed.push(sym); }
  }));
  // Only stamp today's history row when fresh prices arrived, so an offline open never records stale prices as today's.
  snapshotAccounts(updated > 0 || rows.length === 0 ? date : undefined);
  return { updated, failed, noProxy };
}

const defaultInvestAccount = () => get("SELECT id FROM account WHERE type='NONREG' ORDER BY id LIMIT 1")?.id as number | undefined;

function investmentDeposits() {
  const rows = all(`SELECT m.year, m.month, d.account_id, d.amount FROM investment_deposit d JOIN month m ON m.id=d.month_id`);
  const legacy = defaultInvestAccount();
  if (legacy != null) rows.push(...all(`SELECT m.year, m.month, ${legacy} AS account_id, s.to_investments AS amount FROM savings_actual s JOIN month m ON m.id=s.month_id
    WHERE s.to_investments != 0 AND NOT EXISTS (SELECT 1 FROM investment_deposit d WHERE d.month_id=s.month_id)`));
  return rows;
}

function withInvestments(mid: number, savings: Row | undefined) {
  if (!savings) return null;
  let investments = all('SELECT account_id, amount FROM investment_deposit WHERE month_id=?', mid);
  const legacy = defaultInvestAccount();
  if (!investments.length && savings.to_investments && legacy != null) investments = [{ account_id: legacy, amount: savings.to_investments }];
  return { ...savings, investments };
}

const RANGES: Record<string, string> = { '1M': '1mo|1d', '6M': '6mo|1d', 'YTD': 'ytd|1d', '1Y': '1y|1d', '5Y': '5y|1wk', 'MAX': 'max|1mo' };

const ok = () => ({ ok: true });
const routes: [string, RegExp, Handler][] = [
  // ---- people ----
  ['GET', /^people$/, () => people()],
  ['PUT', /^people$/, ({ body }) => {
    tx(() => {
      for (const p of body as { id?: number; name: string }[]) {
        if (p.id) run('UPDATE person SET name=? WHERE id=?', p.name, p.id);
        else run('INSERT INTO person(id, name) VALUES (?,?)', newId(), p.name);
      }
    });
    return people();
  }],

  // ---- categories ----
  ['GET', /^categories$/, () => all('SELECT * FROM category ORDER BY kind, name')],
  ['POST', /^categories$/, ({ body: c }) => {
    const res = run('INSERT INTO category(id, name, kind, parent_id, counts_as_living, default_amount, archived) VALUES (?,?,?,?,?,?,0)',
      newId(), c.name, c.kind, c.parent_id ?? null, c.counts_as_living ?? 1, c.default_amount ?? 0);
    return get('SELECT * FROM category WHERE id=?', res.lastInsertRowid);
  }],
  ['PUT', /^categories\/(\d+)$/, ({ p, body: c }) => {
    run('UPDATE category SET name=?, kind=?, parent_id=?, counts_as_living=?, default_amount=?, archived=? WHERE id=?',
      c.name, c.kind, c.parent_id ?? null, c.counts_as_living ? 1 : 0, c.default_amount ?? 0, c.archived ? 1 : 0, p[0]);
    return ok();
  }],
  ['DELETE', /^categories\/(\d+)$/, ({ p }) => { run('DELETE FROM category WHERE id=?', p[0]); return ok(); }],

  // ---- credit cards ----
  ['GET', /^cards$/, () => all('SELECT * FROM credit_card ORDER BY name')],
  ['POST', /^cards$/, ({ body: c }) => {
    const res = run('INSERT INTO credit_card(id, name, credit_limit) VALUES (?,?,?)', newId(), c.name, c.credit_limit ?? 0);
    return get('SELECT * FROM credit_card WHERE id=?', res.lastInsertRowid);
  }],
  ['PUT', /^cards\/(\d+)$/, ({ p, body: c }) => { run('UPDATE credit_card SET name=?, credit_limit=? WHERE id=?', c.name, c.credit_limit ?? 0, p[0]); return ok(); }],
  ['DELETE', /^cards\/(\d+)$/, ({ p }) => { run('DELETE FROM credit_card WHERE id=?', p[0]); return ok(); }],

  // ---- months ----
  ['GET', /^months$/, () => spreadBonuses(all(`${SUMMARY_SQL} ORDER BY m.year, m.month`)).map(x => ({
    ...x,
    predicted: x.income - x.expenses,
    to_cash: x.to_cash ?? 0,
    to_investments: x.to_investments ?? 0,
    actual: x.to_cash == null ? null : x.to_cash + x.to_investments,
  }))],
  ['GET', /^months\/(\d+)\/(\d+)$/, ({ p }) => {
    const year = Number(p[0]), month = Number(p[1]);
    const m = get('SELECT id, note FROM month WHERE year=? AND month=?', year, month);
    if (!m) return { year, month, note: '', income: [], expenses: [], savings: null };
    return {
      year, month, note: m.note,
      income: all('SELECT person_id, source, amount FROM income_entry WHERE month_id=? ORDER BY id', m.id),
      expenses: all('SELECT category_id, amount FROM expense_entry WHERE month_id=?', m.id),
      savings: withInvestments(m.id, get('SELECT to_cash, to_investments, note FROM savings_actual WHERE month_id=?', m.id)),
      cards: all('SELECT card_id, amount, excluded FROM card_spend WHERE month_id=?', m.id),
    };
  }],
  ['PUT', /^months\/(\d+)\/(\d+)$/, ({ p, body: b }) => {
    const year = Number(p[0]), month = Number(p[1]);
    // Safety net: a save replaces the whole month, so never let an empty form overwrite a month that has data.
    const existing = get('SELECT id FROM month WHERE year=? AND month=?', year, month);
    if (existing) {
      const had = get(`SELECT (SELECT COUNT(*) FROM income_entry WHERE month_id=?1) + (SELECT COUNT(*) FROM expense_entry WHERE month_id=?1)
                       + (SELECT COUNT(*) FROM card_spend WHERE month_id=?1) AS n`, existing.id)?.n ?? 0;
      const has = (b.income ?? []).filter((i: any) => i.amount).length + (b.expenses ?? []).filter((e: any) => e.amount).length
        + (b.cards ?? []).filter((c: any) => c.amount || c.excluded).length;
      if (had > 0 && has === 0) throw new Error('Refused to overwrite a month that has data with an empty one');
    }
    tx(() => {
      const id = monthId(year, month);
      run('UPDATE month SET note=? WHERE id=?', b.note ?? '', id);
      run('DELETE FROM income_entry WHERE month_id=?', id);
      run('DELETE FROM expense_entry WHERE month_id=?', id);
      for (const i of b.income ?? []) if (i.amount) run('INSERT INTO income_entry(month_id, person_id, source, amount) VALUES (?,?,?,?)', id, i.person_id, i.source || 'Salary', i.amount);
      run('DELETE FROM card_spend WHERE month_id=?', id);
      for (const c of b.cards ?? []) if (c.card_id && (c.amount || c.excluded)) run('INSERT INTO card_spend(month_id, card_id, amount, excluded) VALUES (?,?,?,?)', id, c.card_id, c.amount ?? 0, c.excluded ?? 0);
      for (const e of b.expenses ?? []) if (e.amount) run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', id, e.category_id, e.amount);
      if (b.savings) {
        // With a per-account split, the monthly total is the sum of the parts.
        const split = (b.savings.investments as { account_id: number; amount: number }[] | undefined)?.filter(x => x.amount) ;
        const toInv = split ? split.reduce((t, x) => t + x.amount, 0) : b.savings.to_investments ?? 0;
        run(`INSERT INTO savings_actual(month_id, to_cash, to_investments, note) VALUES (?,?,?,?)
             ON CONFLICT(month_id) DO UPDATE SET to_cash=excluded.to_cash, to_investments=excluded.to_investments, note=excluded.note`,
          id, b.savings.to_cash ?? 0, toInv, b.savings.note ?? '');
        if (split) {
          run('DELETE FROM investment_deposit WHERE month_id=?', id);
          for (const x of split) run('INSERT INTO investment_deposit(month_id, account_id, amount) VALUES (?,?,?)', id, x.account_id, x.amount);
        }
      } else { run('DELETE FROM savings_actual WHERE month_id=?', id); run('DELETE FROM investment_deposit WHERE month_id=?', id); }
    });
    return ok();
  }],

  /** Money added to each investing account per month. Months saved before accounts were asked go to the first non-registered account. */
  ['GET', /^investment-deposits$/, () => investmentDeposits()],

  // ---- settings ----
  ['GET', /^settings$/, () => getSettings()],
  ['PUT', /^settings$/, ({ body: s }) => {
    run('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', 'emergency_months', String(s.emergency_months));
    run('INSERT OR REPLACE INTO settings(key, value) VALUES (?, ?)', 'ratios', JSON.stringify(s.ratios));
    return getSettings();
  }],

  // ---- wealth ----
  ['GET', /^wealth$/, () => wealth()],
  ['PUT', /^wealth$/, ({ body }) => {
    tx(() => {
      for (const w of body as Row[])
        run(`INSERT INTO wealth_year(year, start_wealth, return_pct, monthly_contribution, actual_end) VALUES (?,?,?,?,?)
             ON CONFLICT(year) DO UPDATE SET start_wealth=excluded.start_wealth, return_pct=excluded.return_pct,
             monthly_contribution=excluded.monthly_contribution, actual_end=excluded.actual_end`,
          w.year, w.start_wealth, w.return_pct, w.monthly_contribution, w.actual_end ?? null);
    });
    return wealth();
  }],
  ['DELETE', /^wealth\/(\d+)$/, ({ p }) => { run('DELETE FROM wealth_year WHERE year=?', p[0]); return ok(); }],

  // ---- accounts & room ----
  ['GET', /^accounts$/, () => accounts()],
  ['PUT', /^accounts$/, ({ body }) => {
    tx(() => {
      for (const a of body as Row[]) {
        if (a.id) run('UPDATE account SET person_id=?, type=?, name=?, balance=? WHERE id=?', a.person_id, a.type, a.name, a.balance, a.id);
        else run('INSERT INTO account(id, person_id, type, name, balance) VALUES (?,?,?,?,?)', newId(), a.person_id, a.type, a.name, a.balance);
      }
    });
    return accounts();
  }],
  ['DELETE', /^accounts\/(\d+)$/, ({ p }) => { run('DELETE FROM account WHERE id=?', p[0]); return ok(); }],
  ['GET', /^account-history$/, () => all('SELECT account_id, date, balance FROM account_balance ORDER BY date')],
  ['POST', /^accounts\/(\d+)\/snapshot$/, ({ p, body: { date, balance } }) => {
    const id = Number(p[0]);
    tx(() => {
      run(`INSERT INTO account_balance(account_id, date, balance) VALUES (?,?,?)
           ON CONFLICT(account_id, date) DO UPDATE SET balance=excluded.balance`, id, date, balance);
      run('UPDATE account SET balance=(SELECT balance FROM account_balance WHERE account_id=? ORDER BY date DESC LIMIT 1) WHERE id=?', id, id);
    });
    return ok();
  }],
  ['GET', /^expenses$/, () => all(
    `SELECT m.year, m.month, e.category_id, e.amount FROM expense_entry e JOIN month m ON m.id=e.month_id ORDER BY m.year, m.month`)],
  ['GET', /^expenses\/(\d+)$/, ({ p }) => all(
    `SELECT m.month, e.category_id, e.amount FROM expense_entry e JOIN month m ON m.id=e.month_id WHERE m.year=? ORDER BY m.month`, p[0])],
  ['GET', /^rooms$/, () => rooms()],
  ['PUT', /^rooms$/, ({ body }) => {
    tx(() => {
      for (const x of body as Row[])
        run(`INSERT INTO contribution_room(person_id, account_type, year, room, contributed) VALUES (?,?,?,?,?)
             ON CONFLICT(person_id, account_type, year) DO UPDATE SET room=excluded.room, contributed=excluded.contributed`,
          x.person_id, x.account_type, x.year, x.room, x.contributed ?? 0);
    });
    return rooms();
  }],

  // ---- import (rows already parsed in the browser) ----
  ['POST', /^import$/, ({ body }) => {
    const rows = body.rows as { year: number; month: number; type: 'income' | 'expense'; name: string; person?: string; amount: number }[];
    let count = 0;
    tx(() => {
      for (const x of rows) {
        if (!x.amount || !x.year || !x.month) continue;
        const id = monthId(x.year, x.month);
        if (x.type === 'income') {
          let p = get('SELECT id FROM person WHERE name=?', x.person ?? '') ?? get('SELECT id FROM person ORDER BY id LIMIT 1');
          if (!p) { run('INSERT INTO person(id, name) VALUES (?,?)', newId(), x.person || 'Me'); p = get('SELECT id FROM person ORDER BY id LIMIT 1')!; }
          run('INSERT INTO income_entry(month_id, person_id, source, amount) VALUES (?,?,?,?)', id, p.id, x.name || 'Income', x.amount);
        } else {
          let c = get('SELECT id FROM category WHERE lower(name)=lower(?)', x.name);
          if (!c) { run("INSERT INTO category(id, name, kind) VALUES (?, ?, 'variable')", newId(), x.name); c = get('SELECT id FROM category WHERE name=?', x.name)!; }
          run(`INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)
               ON CONFLICT(month_id, category_id) DO UPDATE SET amount = amount + excluded.amount`, id, c.id, x.amount);
        }
        count++;
      }
    });
    return { imported: count };
  }],

  // ---- ETF holdings ----
  ['GET', /^holdings$/, () => allHoldings()],
  ['PUT', /^holdings$/, ({ body }) => {
    tx(() => {
      for (const h of body as Row[]) {
        if (h.id) run(`UPDATE holding SET ${HCOLS.map(c => `${c}=?`).join(',')} WHERE id=?`, ...hvals(h), h.id);
        else run(`INSERT INTO holding(id,${HCOLS.join(',')}) VALUES (?,${HCOLS.map(() => '?').join(',')})`, newId(), ...hvals(h));
      }
    });
    snapshotAccounts();
    return allHoldings();
  }],
  ['DELETE', /^holdings\/(\d+)$/, ({ p }) => { run('DELETE FROM holding WHERE id=?', p[0]); snapshotAccounts(); return ok(); }],
  ['POST', /^holdings\/refresh$/, () => refreshPrices()],
  ['POST', /^snapshot$/, () => { snapshotAccounts(); return ok(); }],
  ['GET', /^holding-history$/, () => all('SELECT * FROM holding_snapshot ORDER BY date, account_id, ticker')],

  /** Price history for every distinct ticker held (mutual funds are skipped). */
  ['GET', /^history$/, async ({ q }) => {
    const [range, interval] = (RANGES[q.get('range') ?? '1Y'] ?? RANGES['1Y']).split('|');
    const syms = new Map<string, string>();
    for (const h of all('SELECT ticker, quote_symbol FROM holding')) { const s = yahooSymbol(h.ticker, h.quote_symbol); if (s) syms.set(h.ticker, s); }
    return Promise.all([...syms].map(async ([ticker, symbol]) => {
      try {
        const c = await chart(symbol, range, interval);
        const ts: number[] = c.timestamp ?? [], close: (number | null)[] = c.indicators?.quote?.[0]?.close ?? [];
        const points = ts.map((t, i) => ({ t: t * 1000, c: close[i] })).filter(pt => pt.c != null);
        return { ticker, symbol, name: c.meta.longName ?? c.meta.shortName ?? ticker, currency: c.meta.currency, points };
      } catch { return { ticker, symbol, name: ticker, currency: '', points: [], error: true }; }
    }));
  }],
];

export function accountHistoryCsv(): string {
  const rows = all(`SELECT b.date, p.name AS owner, a.type, a.name AS account, b.balance FROM account_balance b
                    JOIN account a ON a.id=b.account_id JOIN person p ON p.id=a.person_id ORDER BY b.date, p.name, a.type, a.name`);
  const q = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
  return ['date,owner,type,account,balance', ...rows.map(x => [x.date, q(x.owner), x.type, q(x.account), Number(x.balance).toFixed(2)].join(','))].join('\n');
}

export async function dispatch(method: string, url: string, body?: unknown): Promise<unknown> {
  const u = new URL(url, 'http://local');
  const path = u.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  for (const [m, re, handler] of routes) {
    if (m !== method) continue;
    const match = path.match(re);
    if (!match) continue;
    const result = await handler({ p: match.slice(1), q: u.searchParams, body });
    if (method !== 'GET') notifyWrite();
    return result;
  }
  throw new Error(`No route: ${method} ${url}`);
}

/** Drop-in for `fetch('/api/...')` returning a real Response, so callers can keep using .json() / .text(). */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : undefined;
    const result = await dispatch((init.method ?? 'GET').toUpperCase(), url, body);
    return new Response(JSON.stringify(result ?? null), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response((e as Error).message, { status: 500 });
  }
}
