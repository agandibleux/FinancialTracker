/** Rewrites tickers.json (the symbols the scheduled deploy fetches prices for) from the local database. Run: npm run tickers */
import fs from 'node:fs';
import initSqlJs from 'sql.js';
import { yahooSymbol } from '../src/local/quotes';

const SQL = await initSqlJs();
const db = new SQL.Database(fs.readFileSync('data/finance.db'));
const rows = db.exec('SELECT DISTINCT ticker, quote_symbol FROM holding')[0]?.values ?? [];
const symbols = [...new Set(rows.map(([t, q]) => yahooSymbol(String(t), String(q))).filter((s): s is string => !!s))].sort();
fs.writeFileSync('tickers.json', JSON.stringify(symbols, null, 2) + '\n');
console.log(`tickers.json: ${symbols.length} symbols`);
