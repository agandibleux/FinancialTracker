import type { Workbook, Worksheet } from 'exceljs';
import { MONTHS, sum } from '../calc';
import { emergencyStatus } from '../emergency';
import { buildProjection } from '../projection';
import { ACCOUNT_META, type AccountBalance, type AnyExpense, type Category, type CreditCard, type DepositRow, type Holding, type MonthDetail, type MonthSummary, type Person, type Room, type Settings, type Snapshot, type WealthYear } from '../types';
import { C, FMT, align, argb, border, fill, font } from './theme';

export interface ExportData {
  people: Person[]; categories: Category[]; months: MonthSummary[]; details: MonthDetail[];
  expenses: AnyExpense[]; accounts: AccountBalance[]; history: Snapshot[]; holdings: Holding[];
  rooms: Room[]; wealth: WealthYear[]; deposits: DepositRow[]; cards: CreditCard[]; settings: Settings;
}
type ExcelNS = typeof import('exceljs');
type Col = { header: string; key: string; width?: number; fmt?: string; total?: boolean; align?: 'left' | 'right' | 'center' };

const ym = (y: number, m: number) => `${MONTHS[m - 1]} ${y}`;

function title(ws: Worksheet, text: string, sub: string, span: number) {
  ws.mergeCells(1, 1, 1, span); ws.mergeCells(2, 1, 2, span);
  const t = ws.getCell(1, 1); t.value = text;
  t.font = font({ size: 18, bold: true, color: { argb: C.white } }); t.fill = fill(C.ink); t.alignment = align('left');
  const s = ws.getCell(2, 1); s.value = sub;
  s.font = font({ size: 10, italic: true, color: { argb: C.muted } }); s.fill = fill(C.accentSoft); s.alignment = align('left');
  ws.getRow(1).height = 30; ws.getRow(2).height = 18;
  for (let c = 2; c <= span; c++) { ws.getCell(1, c).fill = fill(C.ink); ws.getCell(2, c).fill = fill(C.accentSoft); }
}

/** Styled table starting at row 4: header, zebra rows, autofilter, frozen header, optional SUM totals. */
function table(ws: Worksheet, cols: Col[], rows: Record<string, unknown>[], opts: { totals?: boolean } = {}) {
  const hr = 4;
  cols.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? Math.max(12, c.header.length + 4);
    const h = ws.getCell(hr, i + 1); h.value = c.header;
    h.font = font({ bold: true, color: { argb: C.white } }); h.fill = fill(C.accent); h.border = border;
    h.alignment = { ...align(c.align ?? (c.fmt ? 'right' : 'left')), wrapText: true };
  });
  ws.getRow(hr).height = 22;
  rows.forEach((r, ri) => {
    const row = ws.getRow(hr + 1 + ri);
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1); const v = r[c.key];
      cell.value = (v ?? null) as never;
      cell.font = font(); cell.border = border;
      if (ri % 2) cell.fill = fill(C.zebra);
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = align(c.align ?? (c.fmt ? 'right' : 'left'));
    });
  });
  const last = hr + rows.length;
  if (opts.totals && rows.length) {
    const tr = ws.getRow(last + 1);
    cols.forEach((c, i) => {
      const cell = tr.getCell(i + 1);
      cell.value = i === 0 ? 'Total' : c.total ? { formula: `SUM(${ws.getColumn(i + 1).letter}${hr + 1}:${ws.getColumn(i + 1).letter}${last})`, result: sum(rows.map(r => Number(r[c.key]) || 0)) } : null;
      cell.font = font({ bold: true }); cell.fill = fill(C.accentSoft); cell.border = border;
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = align(c.align ?? (c.fmt ? 'right' : 'left'));
    });
  }
  ws.views = [{ state: 'frozen', ySplit: hr, xSplit: 1, showGridLines: false }];
  if (rows.length) ws.autoFilter = { from: { row: hr, column: 1 }, to: { row: last, column: cols.length } };
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${hr}:${hr}` };
  return { first: hr + 1, last };
}

function sheet(wb: Workbook, name: string, tab: string, heading: string, sub: string, cols: Col[], rows: Record<string, unknown>[], opts: { totals?: boolean } = {}) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: tab } } });
  title(ws, heading, sub, cols.length);
  const r = table(ws, cols, rows, opts);
  return { ws, ...r };
}

export function buildWorkbook(d: ExportData, ExcelJS: ExcelNS): Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Financial Tracker'; wb.created = new Date();
  const stamp = `Exported ${new Date().toLocaleDateString('en-CA')} · all amounts in CAD`;
  const person = new Map(d.people.map(p => [p.id, p.name]));
  const acct = new Map(d.accounts.map(a => [a.id, a]));
  const cat = new Map(d.categories.map(c => [c.id, c]));
  const m = (key: string, header: string, w = 14, total = true): Col => ({ key, header, width: w, fmt: FMT.money, total });

  // ---- Summary ----
  const ws = wb.addWorksheet('Summary', { properties: { tabColor: { argb: C.ink } }, views: [{ showGridLines: false }] });
  title(ws, 'Financial summary', stamp, 6);
  [28, 18, 18, 18, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const lastYear = Math.max(0, ...d.months.map(x => x.year)) || new Date().getFullYear();
  const yr = d.months.filter(x => x.year === lastYear);
  const inc = sum(yr.map(x => x.income)), exp = sum(yr.map(x => x.expenses)), act = sum(yr.map(x => x.actual ?? 0));
  const netWorth = sum(d.accounts.map(a => a.balance));
  const em = emergencyStatus(d.months, d.accounts, d.settings?.emergency_months || 3);
  const kpis: [string, number, string][] = [
    ['Net worth', netWorth, FMT.money0], [`Income ${lastYear}`, inc, FMT.money0], [`Expenses ${lastYear}`, exp, FMT.money0],
    [`Actual savings ${lastYear}`, act, FMT.money0], ['Savings rate', inc ? act / inc : 0, FMT.pct], ['Emergency fund (months)', em.monthsCovered, '0.0'],
  ];
  kpis.forEach(([label, v, fmt], i) => {
    const l = ws.getCell(4, i + 1), c = ws.getCell(5, i + 1);
    l.value = label; l.font = font({ size: 9, bold: true, color: { argb: C.muted } }); l.fill = fill(C.zebra); l.alignment = align('center'); l.border = border;
    c.value = v; c.numFmt = fmt; c.font = font({ size: 16, bold: true, color: { argb: C.ink2 } }); c.fill = fill(C.zebra); c.alignment = align('center'); c.border = border;
  });
  ws.getRow(5).height = 34;
  ws.getCell(7, 1).value = 'Accounts'; ws.getCell(7, 1).font = font({ size: 13, bold: true, color: { argb: C.ink2 } });
  ['Account', 'Owner', 'Type', 'Balance'].forEach((h, i) => {
    const c = ws.getCell(8, i + 1); c.value = h; c.font = font({ bold: true, color: { argb: C.white } }); c.fill = fill(C.accent); c.border = border; c.alignment = align(i === 3 ? 'right' : 'left');
  });
  d.accounts.forEach((a, i) => {
    const r = 9 + i, meta = ACCOUNT_META[a.type];
    [a.name, person.get(a.person_id) ?? '', meta?.label ?? a.type, a.balance].forEach((v, j) => {
      const c = ws.getCell(r, j + 1); c.value = v; c.font = font(); c.border = border;
      if (j === 3) { c.numFmt = FMT.money; c.alignment = align('right'); }
      if (j === 2 && meta) c.fill = fill(argb(meta.color));
    });
  });
  const tr = 9 + d.accounts.length;
  ws.getCell(tr, 1).value = 'Total';
  ws.getCell(tr, 4).value = d.accounts.length ? { formula: `SUM(D9:D${tr - 1})`, result: netWorth } : 0;
  for (let c = 1; c <= 4; c++) { const x = ws.getCell(tr, c); x.font = font({ bold: true }); x.fill = fill(C.accentSoft); x.border = border; }
  ws.getCell(tr, 4).numFmt = FMT.money; ws.getCell(tr, 4).alignment = align('right');
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

  // ---- Monthly ----
  const monthly = sheet(wb, 'Monthly', 'FF3F6BA3', 'Month by month', stamp, [
    { key: 'label', header: 'Month', width: 14 }, m('income', 'Income'), m('fixed', 'Fixed'), m('utility', 'Utilities'), m('variable', 'Variable'),
    m('expenses', 'Expenses'), m('living', 'Living cost'), m('predicted', 'Predicted savings', 16), m('actual', 'Actual savings', 16),
    m('to_cash', 'To cash'), m('to_investments', 'To investments', 16), { key: 'note', header: 'Note', width: 40 },
  ], d.months.map(x => ({ ...x, label: ym(x.year, x.month) })), { totals: true });
  if (d.months.length) monthly.ws.addConditionalFormatting({
    ref: `I${monthly.first}:I${monthly.last}`,
    rules: [{ type: 'dataBar', priority: 1, gradient: true, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FF10B981' } } as never],
  });

  // ---- Income ----
  const incomeRows = d.details.flatMap(x => x.income.map(i => ({ label: ym(x.year, x.month), person: person.get(i.person_id) ?? '', source: i.source, amount: i.amount })));
  sheet(wb, 'Income', 'FF10B981', 'Income', stamp, [
    { key: 'label', header: 'Month', width: 14 }, { key: 'person', header: 'Person', width: 18 }, { key: 'source', header: 'Source', width: 28 }, m('amount', 'Amount', 16),
  ], incomeRows, { totals: true });

  // ---- Expenses (category x month for the latest year) ----
  const years = [...new Set(d.expenses.map(e => e.year))].sort((a, b) => b - a);
  const ey = years[0] ?? lastYear;
  const expCats = d.categories.filter(c => d.expenses.some(e => e.year === ey && e.category_id === c.id));
  const expRows = expCats.map(c => {
    const r: Record<string, unknown> = { name: (c.parent_id ? '   ' : '') + c.name, kind: c.kind };
    MONTHS.forEach((_, i) => { r[`m${i}`] = sum(d.expenses.filter(e => e.year === ey && e.month === i + 1 && e.category_id === c.id).map(e => e.amount)); });
    return r;
  });
  const ex = sheet(wb, 'Expenses', 'FFF43F5E', `Expenses ${ey}`, `${stamp} · credit-card spend is tracked on its own and not added here`, [
    { key: 'name', header: 'Category', width: 28 }, { key: 'kind', header: 'Kind', width: 12 },
    ...MONTHS.map((n, i) => m(`m${i}`, n, 12)),
  ], expRows, { totals: true });
  if (expRows.length) ex.ws.addConditionalFormatting({
    ref: `C${ex.first}:N${ex.last}`,
    rules: [{ type: 'colorScale', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }], color: [{ argb: 'FFFFFFFF' }, { argb: 'FFFDA4AF' }] } as never],
  });
  void cat;

  // ---- Savings & investments ----
  const depRows = d.deposits.map(x => ({ label: ym(x.year, x.month), account: acct.get(x.account_id)?.name ?? `#${x.account_id}`, type: acct.get(x.account_id)?.type ?? '', amount: x.amount }));
  sheet(wb, 'Investments', 'FF14A39E', 'Investment deposits', stamp, [
    { key: 'label', header: 'Month', width: 14 }, { key: 'account', header: 'Account', width: 28 }, { key: 'type', header: 'Type', width: 12 }, m('amount', 'Amount', 16),
  ], depRows, { totals: true });

  // ---- Accounts history ----
  sheet(wb, 'Account history', 'FF38BDF8', 'Account balance history', stamp, [
    { key: 'date', header: 'Date', width: 14, fmt: FMT.date, align: 'left' }, { key: 'account', header: 'Account', width: 28 }, m('balance', 'Balance', 18, false),
  ], d.history.map(h => ({ date: new Date(`${h.date}T00:00:00`), account: acct.get(h.account_id)?.name ?? `#${h.account_id}`, balance: h.balance })));

  // ---- Holdings ----
  const hRows = d.holdings.map(h => {
    const value = h.shares * h.price, cost = h.shares * h.avg_price;
    return { ticker: h.ticker, account: acct.get(h.account_id)?.name ?? '', sector: h.sector, shares: h.shares, avg: h.avg_price, price: h.price, cost, value, gain: value - cost, gainPct: cost ? (value - cost) / cost : 0, target: (h.target_pct || 0) / 100 };
  });
  const hs = sheet(wb, 'Holdings', 'FFF59E0B', 'Holdings', `${stamp} · prices as last fetched`, [
    { key: 'ticker', header: 'Ticker', width: 12 }, { key: 'account', header: 'Account', width: 24 }, { key: 'sector', header: 'Sector', width: 18 },
    { key: 'shares', header: 'Shares', width: 12, fmt: FMT.num }, m('avg', 'Avg price', 13, false), m('price', 'Price', 13, false),
    m('cost', 'Cost', 15), m('value', 'Market value', 16), m('gain', 'Gain / loss', 15), { key: 'gainPct', header: 'Gain %', width: 11, fmt: FMT.pct }, { key: 'target', header: 'Target %', width: 11, fmt: FMT.pct },
  ], hRows, { totals: true });
  if (hRows.length) {
    const red = { font: { color: { argb: C.neg } } }, green = { font: { color: { argb: C.pos } } };
    hs.ws.addConditionalFormatting({ ref: `I${hs.first}:J${hs.last}`, rules: [
      { type: 'cellIs', operator: 'lessThan', formulae: [0], priority: 1, style: red },
      { type: 'cellIs', operator: 'greaterThan', formulae: [0], priority: 2, style: green },
    ] });
  }

  // ---- Room ----
  sheet(wb, 'Contribution room', 'FF6089BD', 'Contribution room', stamp, [
    { key: 'year', header: 'Year', width: 8, align: 'left' }, { key: 'person', header: 'Person', width: 18 }, { key: 'type', header: 'Account', width: 14 },
    m('room', 'Room', 16), m('contributed', 'Contributed', 16), m('left', 'Remaining', 16),
  ], d.rooms.map(r => ({ year: r.year, person: person.get(r.person_id) ?? '', type: r.account_type, room: r.room, contributed: r.contributed, left: r.room - r.contributed })), { totals: true });

  // ---- Projection ----
  const proj = buildProjection(d.wealth, 10);
  sheet(wb, 'Projection', 'FF7C5A3A', 'Wealth projection', stamp, [
    { key: 'year', header: 'Year', width: 8, align: 'left' }, m('start', 'Start', 16, false), m('projectedEnd', 'Projected end', 16, false),
    m('actualEnd', 'Actual end', 16, false), m('variance', 'Variance', 16, false), { key: 'state', header: 'Status', width: 12 },
  ], proj.map(p => ({ ...p, state: p.isActual ? 'Actual' : 'Projected' })));

  // ---- Notes ----
  const notes = wb.addWorksheet('About', { properties: { tabColor: { argb: C.muted } }, views: [{ showGridLines: false }] });
  title(notes, 'About this file', stamp, 2);
  notes.getColumn(1).width = 28; notes.getColumn(2).width = 60;
  const info: [string, string | number][] = [
    ['Emergency fund target (months)', d.settings?.emergency_months ?? 3],
    ...(d.settings?.ratios ?? []).map(r => [`Savings split: ${r.account}`, `${r.pct}%`] as [string, string]),
    ['Privacy', 'Generated in your browser. Nothing was uploaded.'],
  ];
  info.forEach(([k, v], i) => {
    const a = notes.getCell(4 + i, 1), b = notes.getCell(4 + i, 2);
    a.value = k; a.font = font({ bold: true }); b.value = v; b.font = font(); a.border = b.border = border;
  });
  return wb;
}
