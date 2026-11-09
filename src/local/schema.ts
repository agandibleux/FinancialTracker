/** Single source of truth for the SQLite schema (used by the browser database and the legacy Node server). */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS person (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS category (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('fixed','utility','variable')),
  parent_id INTEGER REFERENCES category(id) ON DELETE SET NULL,
  counts_as_living INTEGER NOT NULL DEFAULT 1,
  default_amount REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS month (id INTEGER PRIMARY KEY, year INTEGER NOT NULL, month INTEGER NOT NULL, UNIQUE(year, month));
CREATE TABLE IF NOT EXISTS income_entry (
  id INTEGER PRIMARY KEY, month_id INTEGER NOT NULL REFERENCES month(id) ON DELETE CASCADE,
  person_id INTEGER NOT NULL REFERENCES person(id), source TEXT NOT NULL DEFAULT 'Salary', amount REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS expense_entry (
  id INTEGER PRIMARY KEY, month_id INTEGER NOT NULL REFERENCES month(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE, amount REAL NOT NULL,
  UNIQUE(month_id, category_id)
);
CREATE TABLE IF NOT EXISTS credit_card (id INTEGER PRIMARY KEY, name TEXT NOT NULL, credit_limit REAL NOT NULL DEFAULT 0);
/* amount spent on each card in a month; an input only, never summed into expenses (Everyday spending is derived from it) */
CREATE TABLE IF NOT EXISTS card_spend (
  month_id INTEGER NOT NULL REFERENCES month(id) ON DELETE CASCADE, card_id INTEGER NOT NULL REFERENCES credit_card(id) ON DELETE CASCADE,
  amount REAL NOT NULL, excluded REAL NOT NULL DEFAULT 0, PRIMARY KEY (month_id, card_id)
);
CREATE TABLE IF NOT EXISTS savings_actual (
  month_id INTEGER PRIMARY KEY REFERENCES month(id) ON DELETE CASCADE,
  to_cash REAL NOT NULL DEFAULT 0, to_investments REAL NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS investment_deposit (
  month_id INTEGER NOT NULL REFERENCES month(id) ON DELETE CASCADE, account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  amount REAL NOT NULL, PRIMARY KEY (month_id, account_id)
);
CREATE TABLE IF NOT EXISTS account (
  id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES person(id),
  type TEXT NOT NULL, name TEXT NOT NULL, balance REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS account_balance (
  account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE, date TEXT NOT NULL, balance REAL NOT NULL,
  PRIMARY KEY (account_id, date)
);
CREATE TABLE IF NOT EXISTS contribution_room (
  person_id INTEGER NOT NULL REFERENCES person(id), account_type TEXT NOT NULL, year INTEGER NOT NULL,
  room REAL NOT NULL DEFAULT 0, contributed REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (person_id, account_type, year)
);
CREATE TABLE IF NOT EXISTS wealth_year (
  year INTEGER PRIMARY KEY, start_wealth REAL NOT NULL DEFAULT 0, return_pct REAL NOT NULL DEFAULT 6,
  monthly_contribution REAL NOT NULL DEFAULT 0, actual_end REAL
);
CREATE TABLE IF NOT EXISTS holding (
  id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL, quote_symbol TEXT NOT NULL DEFAULT '', info TEXT NOT NULL DEFAULT '', sector TEXT NOT NULL DEFAULT '',
  expense_ratio REAL NOT NULL DEFAULT 0, yield_pct REAL NOT NULL DEFAULT 0,
  shares REAL NOT NULL DEFAULT 0, avg_price REAL NOT NULL DEFAULT 0,
  price REAL NOT NULL DEFAULT 0, prev_close REAL NOT NULL DEFAULT 0, price_date TEXT NOT NULL DEFAULT '',
  target_pct REAL NOT NULL DEFAULT 0,
  usa REAL NOT NULL DEFAULT 0, can REAL NOT NULL DEFAULT 0, other_geo REAL NOT NULL DEFAULT 0,
  stocks REAL NOT NULL DEFAULT 0, bonds REAL NOT NULL DEFAULT 0, other_cls REAL NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS holding_snapshot (
  account_id INTEGER NOT NULL REFERENCES account(id) ON DELETE CASCADE, date TEXT NOT NULL, ticker TEXT NOT NULL,
  shares REAL NOT NULL, price REAL NOT NULL, avg_price REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (account_id, date, ticker)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/** Columns added after the first release: [table, column, DDL]. */
export const ADDED_COLUMNS: [string, string, string][] = [
  ['category', 'archived', 'INTEGER NOT NULL DEFAULT 0'],
  ['card_spend', 'excluded', 'REAL NOT NULL DEFAULT 0'],
  ['month', 'note', "TEXT NOT NULL DEFAULT ''"],
];
