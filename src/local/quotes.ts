import { getConfig } from './config';

/** Browsers can't call Yahoo/Morningstar directly (no CORS), so quotes go through a tiny stateless proxy (worker/quotes.js). */
export class NoProxyError extends Error { constructor() { super('Quote proxy URL not set (Settings → Sync & data)'); } }

async function fetchJson(url: string): Promise<any> {
  const proxy = getConfig().quoteProxy.trim();
  if (!proxy) throw new NoProxyError();
  const res = await fetch(`${proxy}${proxy.includes('?') ? '&' : '?'}u=${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Maps a ticker (plain, Google Finance "TSE:VFV", or Yahoo "VFV.TO") to a Yahoo symbol.
 * Plain tickers are assumed to be TSX listings. Mutual funds use their Morningstar ID (e.g. 0P00015IR7) as quote_symbol, with .TO appended.
 */
const GOOGLE_SUFFIX: Record<string, string> = { TSE: '.TO', CVE: '.V', NEO: '.NE', CNSX: '.CN', LON: '.L', EPA: '.PA', FRA: '.F', ETR: '.DE' };
const US_EXCHANGES = new Set(['NYSE', 'NASDAQ', 'NYSEARCA', 'NYSEAMERICAN', 'BATS', 'OTCMKTS']);
export function yahooSymbol(ticker: string, override = ''): string | null {
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

export async function chart(symbol: string, range: string, interval: string) {
  const json = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`);
  const r = json.chart?.result?.[0];
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
  const q = (await fetchJson(`https://global.morningstar.com/api/v1/en-gb/stores/realtime/quotes?securities=${encodeURIComponent(id)}`))[id];
  const v = (x: any) => x?.value;
  const price = v(q?.lastPrice), date = v(q?.lastPrice?.properties?.date) ?? v(q?.date);
  if (!price) throw new Error('no price');
  return { price: price as number, prev: (v(q.previousClosePrice) ?? price - (v(q.netChange) ?? 0)) as number, asOf: typeof date === 'string' ? date.slice(0, 10) : '' };
}

export async function quote(symbol: string) {
  if (isMorningstarId(symbol)) {
    try { return await morningstarQuote(symbol); } catch (e) { if (e instanceof NoProxyError) throw e; /* fall back to Yahoo's NAV */ }
  }
  const c = await chart(symbol, '5d', '1d'), m = c.meta;
  // chartPreviousClose is the close before the whole 5d window, not yesterday's: take the previous daily bar instead.
  const dayOf = (t: number) => new Date(t * 1000).toLocaleDateString('en-CA', { timeZone: 'America/Toronto' });
  const ts: number[] = c.timestamp ?? [], closes: (number | null)[] = c.indicators?.quote?.[0]?.close ?? [];
  const bars = ts.map((t, i) => ({ d: dayOf(t), c: closes[i] })).filter((b): b is { d: string; c: number } => b.c != null);
  const quoteDay = m.regularMarketTime ? dayOf(m.regularMarketTime) : '';
  const prevClose = [...bars].reverse().find(b => b.d !== quoteDay)?.c;
  // Funds publish one NAV per day: record the date of the quote itself, not the day we happened to fetch it.
  const asOf = m.regularMarketTime ? dayOf(m.regularMarketTime) : '';
  return { price: m.regularMarketPrice as number, prev: (prevClose ?? m.previousClose ?? m.regularMarketPrice) as number, asOf };
}
