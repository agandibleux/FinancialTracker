import { apiFetch } from '../../local/routes';
import { downloadBlob } from '../../local/download';
import type { ExportData } from './buildWorkbook';
import type { MonthDetail, MonthSummary } from '../types';

async function get<T>(url: string): Promise<T> {
  const r = await apiFetch(url);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

/** Reads everything through the local API, builds the styled workbook in the browser and downloads it. */
export async function exportToExcel() {
  const [months, ExcelJS, build] = await Promise.all([
    get<MonthSummary[]>('/api/months'),
    import('exceljs').then(m => m.default),
    import('./buildWorkbook'),
  ]);
  const [details, rest] = await Promise.all([
    Promise.all(months.map(m => get<MonthDetail>(`/api/months/${m.year}/${m.month}`))),
    Promise.all([
      get('/api/people'), get('/api/categories'), get('/api/expenses'), get('/api/accounts'), get('/api/account-history'),
      get('/api/holdings'), get('/api/rooms'), get('/api/wealth'), get('/api/investment-deposits'), get('/api/cards'), get('/api/settings'),
    ]),
  ]);
  const [people, categories, expenses, accounts, history, holdings, rooms, wealth, deposits, cards, settings] = rest as unknown as
    [ExportData['people'], ExportData['categories'], ExportData['expenses'], ExportData['accounts'], ExportData['history'], ExportData['holdings'], ExportData['rooms'], ExportData['wealth'], ExportData['deposits'], ExportData['cards'], ExportData['settings']];
  const wb = build.buildWorkbook({ people, categories, months, details, expenses, accounts, history, holdings, rooms, wealth, deposits, cards, settings }, ExcelJS);
  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `FinancialTracker-${new Date().toLocaleDateString('en-CA')}.xlsx`);
}
