import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildWorkbook, type ExportData } from './buildWorkbook';

const data: ExportData = {
  people: [{ id: 1, name: 'Alex' }],
  categories: [{ id: 1, name: 'Rent', kind: 'utility', parent_id: null, counts_as_living: 1, default_amount: 0, archived: 0 }],
  months: [
    { year: 2026, month: 1, note: 'ok', income: 5000, expenses: 3000, fixed: 1000, utility: 1500, variable: 500, living: 2800, predicted: 2000, actual: 1800, to_cash: 800, to_investments: 1000 },
    { year: 2026, month: 2, note: '', income: 5000, expenses: 3200, fixed: 1000, utility: 1500, variable: 700, living: 3000, predicted: 1800, actual: null, to_cash: 0, to_investments: 0 },
  ],
  details: [{ year: 2026, month: 1, note: '', income: [{ person_id: 1, source: 'Salary', amount: 5000 }], expenses: [{ category_id: 1, amount: 1500 }], savings: null }],
  expenses: [{ year: 2026, month: 1, category_id: 1, amount: 1500 }],
  accounts: [{ id: 1, person_id: 1, type: 'TFSA', name: 'TFSA main', balance: 10000 }],
  history: [{ account_id: 1, date: '2026-01-31', balance: 9500 }],
  holdings: [{ account_id: 1, ticker: 'VEQT', quote_symbol: 'VEQT.TO', info: '', sector: 'ETF', expense_ratio: 0.2, yield_pct: 2, shares: 10, avg_price: 30, price: 35, prev_close: 34, price_date: '', target_pct: 50, usa: 0, can: 0, other_geo: 0, stocks: 100, bonds: 0, other_cls: 0 }],
  rooms: [{ person_id: 1, account_type: 'TFSA', year: 2026, room: 7000, contributed: 2000 }],
  wealth: [{ year: 2026, start_wealth: 50000, return_pct: 6, monthly_contribution: 500, actual_end: null }],
  deposits: [{ year: 2026, month: 1, account_id: 1, amount: 1000 }],
  cards: [], settings: { emergency_months: 3, ratios: [{ account: 'TFSA', pct: 100 }] },
};

describe('buildWorkbook', () => {
  it('builds a styled workbook that survives a round trip', async () => {
    const buf = await buildWorkbook(data, ExcelJS).xlsx.writeBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as ArrayBuffer);
    expect(wb.worksheets.map(w => w.name)).toEqual(['Summary', 'Monthly', 'Income', 'Expenses', 'Investments', 'Account history', 'Holdings', 'Contribution room', 'Projection', 'About']);
    const m = wb.getWorksheet('Monthly')!;
    expect(m.getCell('A4').font?.bold).toBe(true);
    expect(typeof m.getCell('B5').value).toBe('number');
    expect(m.getCell('B7').value).toMatchObject({ formula: 'SUM(B5:B6)' });
    expect(m.views[0]).toMatchObject({ state: 'frozen', ySplit: 4 });
  });

  it('does not crash on an empty database', async () => {
    const empty: ExportData = { ...data, months: [], details: [], expenses: [], accounts: [], history: [], holdings: [], rooms: [], wealth: [], deposits: [] };
    await expect(buildWorkbook(empty, ExcelJS).xlsx.writeBuffer()).resolves.toBeTruthy();
  });
});
