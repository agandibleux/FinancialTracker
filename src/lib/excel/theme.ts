import type { Alignment, Borders, Fill, Font } from 'exceljs';

/** Palette taken from the app theme (src/index.css) so the workbook feels like the app. */
export const C = {
  ink: 'FF0E1A2E', ink2: 'FF16294A', accent: 'FF3F6BA3', accentSoft: 'FFE3ECF7',
  zebra: 'FFF4F7FB', grid: 'FFE2E8F0', text: 'FF0F172A', muted: 'FF64748B',
  pos: 'FF059669', neg: 'FFE11D48', white: 'FFFFFFFF',
};

export const FMT = {
  money: '$#,##0.00;[Red]-$#,##0.00',
  money0: '$#,##0;[Red]-$#,##0',
  pct: '0.0%',
  date: 'yyyy-mm-dd',
  num: '#,##0.####',
};

export const FONT = 'Calibri';
export const font = (o: Partial<Font> = {}): Partial<Font> => ({ name: FONT, size: 11, color: { argb: C.text }, ...o });
export const fill = (argb: string): Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const line = { style: 'thin', color: { argb: C.grid } } as const;
export const border: Partial<Borders> = { top: line, bottom: line, left: line, right: line };
export const align = (h: Alignment['horizontal'] = 'left'): Partial<Alignment> => ({ vertical: 'middle', horizontal: h });

/** Excel wants ARGB without '#', ours come from the app as '#rrggbb'. */
export const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
