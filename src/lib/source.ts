/** Where each number comes from, shown next to the data so nothing is a black box. */
const GOOGLE_EXCHANGE: Record<string, string> = { TO: 'TSE', V: 'CVE', NE: 'NEO', CN: 'CNSX' };

export const yahooUrl = (symbol: string) => `https://finance.yahoo.com/quote/${encodeURIComponent(symbol)}`;
export function googleUrl(symbol: string) {
  const m = symbol.match(/^(.+)\.(TO|V|NE|CN)$/);
  return `https://www.google.com/finance/quote/${(m ? m[1] : symbol).replace('-', '.')}:${m ? GOOGLE_EXCHANGE[m[2]] : 'NYSEARCA'}`;
}

export const SOURCES = [
  { field: 'Price, day change', from: 'Yahoo Finance (live quote, ~15 min delayed)', how: 'Refresh prices button, plus automatically at start-up, every 15 min and when the app regains focus' },
  { field: 'Price history & charts', from: 'Yahoo Finance (daily closes)', how: 'Charts page' },
  { field: 'Shares, average price', from: 'Your own records (spreadsheet / Edit holdings)', how: 'Entered by you' },
  { field: 'MER, yield, geography & asset-class split, ideal %', from: 'Your spreadsheet (fund provider data you copied in)', how: 'Static: not updated automatically' },
  { field: 'Daily account history', from: 'Calculated here: shares × price, saved once a day', how: 'Stored in data/finance.db' },
];
