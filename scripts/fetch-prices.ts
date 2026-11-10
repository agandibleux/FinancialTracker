/**
 * Run by the scheduled GitHub Actions deploy: fetches every upstream response the app needs for the symbols in tickers.json and writes
 * dist/prices.json as { generatedAt, data: { [upstream URL]: trimmed JSON } }. The app looks responses up by URL (src/local/quotes.ts).
 * Keeps the previous snapshot's entry when a fetch fails, so one bad symbol never blanks the others.
 */
import fs from 'node:fs';
import { chartUrl, morningstarUrl } from '../src/local/quotes';

const OUT = process.argv[2] ?? 'dist/prices.json';
const symbols: string[] = JSON.parse(fs.readFileSync('tickers.json', 'utf8'));
const RANGES = ['5d|1d', '1mo|1d', '6mo|1d', 'ytd|1d', '1y|1d', '5y|1wk', 'max|1mo'];
const data: Record<string, unknown> = {};
let prev: Record<string, unknown> = {};
try { prev = JSON.parse(await (await fetch(process.env.PREV_URL ?? '')).text()).data ?? {}; } catch { /* first run */ }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function get(url: string) {
  for (let i = 0; i < 3; i++) {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) return res.json() as Promise<any>;
    if (res.status !== 429) break;
    await sleep(2000 * (i + 1));
  }
  throw new Error('failed');
}
/** Only what the app reads, to keep the file small. */
const trimChart = (j: any) => {
  const r = j.chart?.result?.[0];
  if (!r?.meta?.regularMarketPrice) throw new Error('no price');
  const m = r.meta;
  return { chart: { result: [{
    meta: { regularMarketPrice: m.regularMarketPrice, regularMarketTime: m.regularMarketTime, previousClose: m.previousClose, longName: m.longName, shortName: m.shortName, currency: m.currency },
    timestamp: r.timestamp ?? [], indicators: { quote: [{ close: r.indicators?.quote?.[0]?.close ?? [] }] },
  }] } };
};

let failed = 0;
async function put(url: string, fn: () => Promise<unknown>) {
  try { data[url] = await fn(); } catch { failed++; if (prev[url]) data[url] = prev[url]; console.warn('failed:', url); }
  await sleep(250);
}
for (const sym of symbols) {
  const id = sym.replace(/\.TO$/, '');
  if (/^0P[0-9A-Z]{8}$/.test(id)) await put(morningstarUrl(id), () => get(morningstarUrl(id)));
  for (const r of RANGES) { const [range, interval] = r.split('|'); await put(chartUrl(sym, range, interval), async () => trimChart(await get(chartUrl(sym, range, interval)))); }
}
fs.mkdirSync(OUT.replace(/[^/]*$/, '') || '.', { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), data }));
console.log(`${Object.keys(data).length} entries, ${failed} failed → ${OUT}`);
if (!Object.keys(data).length) process.exit(1);
