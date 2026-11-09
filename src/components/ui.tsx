import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { MONTHS, money } from '../lib/calc';
import type { ToastKind } from '../lib/toast';

/* ---------- motion helpers ---------- */
/** Counts up to `value` once on mount and eases to new values after that. */
export function CountUp({ value, format = money, ms = 900 }: { value: number; format?: (n: number) => string; ms?: number }) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(value); return; }
    const a = from.current, t0 = performance.now(); let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      setV(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return <>{format(v)}</>;
}

/** Tiny area + line chart that draws itself in. */
export function Spark({ data, color = '#fff', height = 44, className = '' }: { data: number[]; color?: string; height?: number; className?: string }) {
  if (data.length < 2) return null;
  const w = 120, min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((d, i) => [(i / (data.length - 1)) * w, height - 4 - ((d - min) / span) * (height - 10)]);
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const id = `sp${Math.abs(Math.round(data.reduce((a, b) => a + b, 0))) % 100000}${data.length}${color.replace('#', '')}`;
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height }} aria-hidden>
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path className="spark-area" d={`${line} L${w} ${height} L0 ${height} Z`} fill={`url(#${id})`} />
      <path className="spark-line" pathLength={1} d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="0" fill={color} />
    </svg>
  );
}

/** Circular gauge, e.g. savings rate. */
export function HeroRing({ pct, size = 132, stroke = 12, className = '', children }: { pct: number; size?: number; stroke?: number; className?: string; children?: ReactNode }) {
  const [p, setP] = useState(0);
  useEffect(() => { const t = setTimeout(() => setP(Math.max(0, Math.min(100, pct))), 80); return () => clearTimeout(t); }, [pct]);
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className={`relative grid shrink-0 place-items-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs><linearGradient id="ringg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5eead4" /><stop offset="1" stopColor="#a3e635" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth={stroke} />
        <circle className="ring" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ringg)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ---------- layout ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-slate-900 sm:text-[32px] ">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, right, children, className = '', pad = true, id }: {
  title?: string; subtitle?: string; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean; id?: string;
}) {
  return (
    <section id={id} className={`cq glass-lift rounded-3xl border border-slate-200/70 bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.03),0_8px_24px_-12px_rgba(15,23,42,0.08)] ${pad ? 'p-4 sm:p-6' : ''} ${className}`}>
      {(title || right) && (
        <header className={`flex flex-wrap items-start justify-between gap-3 ${pad ? 'mb-4 sm:mb-5' : 'p-4 pb-3 sm:p-6 sm:pb-3'}`}>
          <div>
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-600', blue: 'bg-sky-50 text-sky-600', violet: 'bg-violet-50 text-violet-600',
  amber: 'bg-amber-50 text-amber-600', rose: 'bg-rose-50 text-rose-600', indigo: 'bg-indigo-50 text-indigo-600',
};
const BADGE = {
  green: 'bg-emerald-50 text-emerald-700', blue: 'bg-sky-50 text-sky-700', violet: 'bg-violet-50 text-violet-700',
  amber: 'bg-amber-50 text-amber-700', rose: 'bg-rose-50 text-rose-700', indigo: 'bg-indigo-50 text-indigo-700',
};
export type Tone = keyof typeof TONES;

const TILE: Record<Tone, { bg: string; glow: string; line: string }> = {
  green: { bg: 'linear-gradient(135deg,#0f9f78,#12c58f 60%,#46dba6)', glow: 'rgba(255,255,255,.35)', line: '#d1fae5' },
  rose: { bg: 'linear-gradient(135deg,#e0446b,#f06a7f 60%,#ff9a8b)', glow: 'rgba(255,255,255,.35)', line: '#ffe4e6' },
  amber: { bg: 'linear-gradient(135deg,#e8890c,#f5a524 60%,#ffcf6b)', glow: 'rgba(255,255,255,.4)', line: '#fff7d6' },
  blue: { bg: 'linear-gradient(135deg,#1f7ae0,#3b9bff 60%,#6dc3ff)', glow: 'rgba(255,255,255,.35)', line: '#e0f2fe' },
  indigo: { bg: 'linear-gradient(135deg,#2f5688,#4a7bc0 60%,#7aa6e6)', glow: 'rgba(255,255,255,.3)', line: '#dbeafe' },
  violet: { bg: 'linear-gradient(135deg,#0f8a86,#14a39e 60%,#4cd1c8)', glow: 'rgba(255,255,255,.35)', line: '#ccfbf1' },
};

export function Kpi({ label, value, num, hint, tone = 'indigo', icon: Icon, delta, goodWhenUp = true, spark }: {
  label: string; value: string; hint?: string; tone?: Tone; icon?: LucideIcon;
  /** numeric value: counts up instead of showing `value` */ num?: number;
  /** % change vs reference; omit to hide */ delta?: number | null; goodWhenUp?: boolean; spark?: number[];
}) {
  const good = delta == null ? true : goodWhenUp ? delta >= 0 : delta <= 0;
  const t = TILE[tone];
  return (
    <div className="tile cq rounded-3xl p-4 text-white sm:p-5" style={{ background: t.bg, '--glow': t.glow, '--glow-strong': t.line + '99', boxShadow: '0 10px 28px -14px rgba(15,23,42,.35)' } as React.CSSProperties}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs font-semibold uppercase leading-snug tracking-[0.1em] text-white/85">{label}</p>
        {Icon && <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/20 backdrop-blur-sm"><Icon size={18} /></span>}
      </div>
      <p className="tabular num-xl mt-2.5 font-semibold tracking-[-0.03em]">{num != null ? <CountUp value={num} /> : value}</p>
      {spark && <Spark data={spark} color={t.line} className="mt-2" />}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        {delta != null && Number.isFinite(delta) && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${good ? 'bg-white/25 text-white' : 'bg-black/25 text-white'}`}>
            {delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(delta).toFixed(1)}%
          </span>
        )}
        {hint && <span className="text-white/80">{hint}</span>}
      </div>
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-8 sm:p-12 text-center">
      <p className="text-lg font-semibold text-slate-900">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">{text}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/* ---------- controls ---------- */
export const inputCls = 'min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/15';
export const btnCls = 'inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-700/25 ring-1 ring-inset ring-white/10 transition hover:brightness-110 active:scale-[.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none';
export const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40';

export function NumInput({ value, onChange, className = '' }: { value: number; onChange: (n: number) => void; className?: string }) {
  return <input type="number" step="any" className={`${inputCls} tabular ${className}`} value={Number.isFinite(value) ? value : ''}
    onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />;
}

const fmt2 = new Intl.NumberFormat('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Money field: shows 1,234.50 when idle, plain digits while you type; empty shows the placeholder. */
export function MoneyInput({ value, onChange, placeholder = '0.00', big = false }: { value: number; onChange: (n: number) => void; placeholder?: string; big?: boolean }) {
  const [text, setText] = useState<string | null>(null); // non-null while focused
  const idle = value ? fmt2.format(value) : '';
  const ph = /^-?\d+(\.\d+)?$/.test(placeholder) ? fmt2.format(Number(placeholder)) : placeholder;
  return (
    <div className="relative">
      <span className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 ${big ? 'text-base' : 'text-sm'}`}>$</span>
      <input type="text" inputMode="decimal" placeholder={ph}
        className={`${inputCls} tabular pl-7 text-right ${big ? '!text-base font-semibold' : ''}`}
        value={text ?? idle}
        onFocus={e => { setText(value ? String(value) : ''); requestAnimationFrame(() => e.target.select()); }}
        onBlur={() => setText(null)}
        onChange={e => {
          const raw = e.target.value.replace(/[^0-9.\-]/g, '');
          setText(raw);
          const n = parseFloat(raw);
          onChange(Number.isFinite(n) ? n : 0);
        }} />
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: LucideIcon }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div className="-mx-1 max-w-[calc(100%+0.5rem)] min-w-0 overflow-x-auto px-1"><div className="inline-flex gap-1 rounded-2xl bg-slate-200/60 p-1">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition ${value === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
          {t.icon && <t.icon size={14} />}{t.label}
        </button>
      ))}
    </div></div>
  );
}

export function MonthNav({ year, month, onChange, months }: {
  year: number; month: number; onChange: (y: number, m: number) => void; months?: { year: number; month: number }[];
}) {
  const step = (d: number) => { const t = year * 12 + (month - 1) + d; onChange(Math.floor(t / 12), (t % 12) + 1); };
  const btn = 'grid h-10 w-10 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900';
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
      <button className={btn} onClick={() => step(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
      {months ? (
        <select className="cursor-pointer rounded-xl bg-transparent py-2 pl-3 text-sm font-semibold text-slate-900 outline-none" value={`${year}-${month}`}
          onChange={e => { const [y, m] = e.target.value.split('-').map(Number); onChange(y, m); }}>
          {[...months].reverse().map(m => <option key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>{MONTHS[m.month - 1]} {m.year}</option>)}
        </select>
      ) : <span className="min-w-[120px] px-2 text-center text-sm font-semibold text-slate-900">{MONTHS[month - 1]} {year}</span>}
      <button className={btn} onClick={() => step(1)} aria-label="Next month"><ChevronRight size={18} /></button>
    </div>
  );
}

export function Badge({ children, tone = 'indigo' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[tone]}`}>{children}</span>;
}

/* ---------- tables: highlights the hovered row AND column (styles live in index.css) ---------- */
export function CrossTable({ children, className = '' }: { children: ReactNode; className?: string }) {
  const marked = useRef<Element[]>([]);
  const clear = () => { marked.current.forEach(el => el.classList.remove('hl-row', 'hl-col')); marked.current = []; };
  const onOver = (e: MouseEvent) => {
    const cell = (e.target as HTMLElement).closest('td,th') as HTMLTableCellElement | null;
    clear();
    if (!cell) return;
    const row = cell.parentElement as HTMLTableRowElement, table = cell.closest('table');
    if (!table) return;
    for (const c of Array.from(row.cells)) { c.classList.add('hl-row'); marked.current.push(c); }
    const full = table.rows[0]?.cells.length;
    if (row.cells.length !== full) return;
    for (const r of Array.from(table.rows)) {
      const c = r.cells[cell.cellIndex];
      if (c && r.cells.length === full) { c.classList.add('hl-col'); marked.current.push(c); }
    }
  };
  return <div className={`xt ${className}`} onMouseOver={onOver} onMouseLeave={clear}>{children}</div>;
}

/** Circular progress ring with centered content. */
export function Ring({ value, size = 132, stroke = 12, color = '#10b981', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/* ---------- charts ---------- */
export function ChartTooltip({ active, payload, label, fmt = money }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-xl">
      <p className="mb-1 font-semibold text-slate-900">{label ?? payload[0]?.payload?.name}</p>
      {payload.filter((p: any) => p.value != null).map((p: any) => (
        <p key={p.dataKey ?? p.name} className="tabular flex items-center gap-2 text-slate-600">
          <i className="inline-block h-2 w-2 rounded-full" style={{ background: p.color || p.payload?.fill }} />{p.name}: <b className="text-slate-900">{fmt(p.value)}</b>
        </p>
      ))}
    </div>
  );
}
export const COLORS = ['#3f6ba3', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#7c5a3a', '#14b8a6', '#f43f5e', '#64748b', '#84cc16', '#f97316', '#0891b2'];
export const GRID = '#e2e8f0';

/* ---------- toasts ---------- */
export function ToastHost() {
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([]);
  useEffect(() => {
    let n = 0;
    const on = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail; const id = ++n;
      setItems(s => [...s, { id, message, kind }]);
      setTimeout(() => setItems(s => s.filter(x => x.id !== id)), 2600);
    };
    window.addEventListener('app-toast', on);
    return () => window.removeEventListener('app-toast', on);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-28 z-[60] items-center md:inset-x-auto md:bottom-6 md:right-6 md:items-end flex flex-col gap-2">
      {items.map(t => (
        <div key={t.id} className="pointer-events-auto flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white shadow-2xl">
          {t.kind === 'success' ? <CheckCircle2 size={18} className="text-emerald-400" /> : <AlertCircle size={18} className="text-rose-400" />}{t.message}
        </div>
      ))}
    </div>
  );
}
