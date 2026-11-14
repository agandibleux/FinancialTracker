import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, FileSpreadsheet, LayoutDashboard, Landmark, PiggyBank, Scale, Settings as Cog, TrendingUp, Menu, Activity, Target, CandlestickChart, ChartLine as LineChartIcon, type LucideIcon } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import MonthlyEntry from './pages/MonthlyEntry';
import Import from './pages/Import';
import Wealth from './pages/Wealth';
import Allocation from './pages/Allocation';
import Settings from './pages/Settings';
import Accounts from './pages/Accounts';
import Reports from './pages/Reports';
import Portfolio from './pages/Portfolio';
import Trends from './pages/Trends';
import Budget from './pages/Budget';
import Charts from './pages/Charts';
import { SyncChip } from './components/SyncUI';
import { UserMenu } from './components/UserMenu';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './local/routes';

/** Live prices: refresh at start-up, every 15 min and when the app regains focus (throttled), on any page. */
function useAutoPrices() {
  const qc = useQueryClient();
  useEffect(() => {
    let last = 0, running = false;
    const go = async (min = 0) => {
      if (running || Date.now() - last < min) return;
      running = true;
      try { await apiFetch('/api/holdings/refresh', { method: 'POST' }); last = Date.now(); qc.invalidateQueries(); } catch { /* offline: retry next tick */ }
      running = false;
    };
    const onVis = () => { if (document.visibilityState === 'visible') void go(60_000); };
    void go();
    const t = setInterval(() => void go(), 15 * 60 * 1000);
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [qc]);
}

const GROUPS: { title: string; items: [string, string, LucideIcon][] }[] = [
  { title: 'Overview', items: [['/', 'Dashboard', LayoutDashboard], ['/trends', 'Trends', Activity], ['/budget', '50/30/20', Target], ['/reports', 'Yearly report', BarChart3]] },
  { title: 'Monthly', items: [['/month', 'Monthly entry', CalendarDays], ['/import', 'Import', FileSpreadsheet]] },
  { title: 'Accounts & portfolio', items: [['/accounts', 'Accounts', Landmark], ['/portfolio', 'ETF portfolio', CandlestickChart], ['/charts', 'Charts', LineChartIcon]] },
  { title: 'Planning', items: [['/wealth', 'Wealth projection', TrendingUp], ['/allocation', 'Allocation', Scale]] },
  { title: 'Setup', items: [['/settings', 'Settings', Cog]] },
];

const link = (isActive: boolean) =>
  `group relative flex items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition lg:justify-start ${isActive ? 'bg-[#f6f1e4] text-[#10281f]' : 'text-[#a9bdb1] hover:bg-white/[.07] hover:text-[#f6f1e4]'}`;

/** the four daily destinations live in the bottom bar; everything else sits behind "More" */
const TABS: [string, string, LucideIcon][] = [['/', 'Home', LayoutDashboard], ['/portfolio', 'ETFs', CandlestickChart], ['/month', 'Month', CalendarDays], ['/trends', 'Trends', Activity]];

export default function App() {
  useAutoPrices();
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setMore(false); window.scrollTo(0, 0); }, [pathname]);
  const tab = (active: boolean) => `tab-item isolate flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-semibold transition ${active ? 'text-[#10281f]' : 'text-slate-500'}`;

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-[4.75rem] shrink-0 flex-col border-r border-black/20 p-3 text-[#f6f1e4] md:flex lg:w-64 lg:p-5" style={{ background: 'var(--ink)' }}>
        <div className="mb-8 flex items-center justify-center gap-3 pt-1 lg:justify-start">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-9 w-9 rounded-lg" />
          <div className="hidden lg:block"><p className="display text-[22px] leading-none">Financial Planner</p><p className="mt-1.5 flex items-center gap-1.5 text-[11px] tracking-wide text-[#a9bdb1]"><i className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#e3a21a]" />Household · CAD</p></div>
        </div>
        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto lg:gap-6">
          {GROUPS.map(g => (
            <div key={g.title}>
              <p className="mb-2 hidden px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#6f8a7b] lg:block">{g.title}</p>
              <div className="flex flex-col gap-0.5">
                {g.items.map(([to, label, Icon]) => (
                  <NavLink key={to} to={to} end={to === '/'} title={label} className={({ isActive }) => link(isActive)}>
                    {({ isActive }) => (<>
                      <Icon size={18} className="shrink-0" /><span className="hidden lg:inline">{label}</span>
                      {isActive && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-[#e3a21a] lg:block" />}
                    </>)}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="flex items-center justify-center gap-2 border-t border-white/10 pt-4 text-[11px] text-[#a9bdb1] lg:justify-start"><PiggyBank size={14} /><span className="hidden lg:contents"><SyncChip /></span><UserMenu up className="lg:ml-auto" /></div>
      </aside>

      {/* phone header */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-slate-300/70 md:hidden" style={{ background: 'var(--paper)', paddingTop: 'calc(env(safe-area-inset-top,0px) + 1.1rem)' }}>
        <div className="flex h-14 items-center gap-3 px-4">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-8 w-8 rounded-lg" />
          <div className="min-w-0"><p className="display truncate text-[21px] leading-none text-slate-900">Financial Planner</p><p className="mt-1 flex items-center gap-1.5 text-[11px] leading-tight text-slate-500"><i className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[#e3a21a]" />Household · CAD</p></div>
          <SyncChip className="ml-auto text-slate-500" /><UserMenu />
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-32 pt-[calc(env(safe-area-inset-top,0px)+6.25rem)] md:px-8 md:pb-20 md:pt-10 lg:px-14">
        <div className="page mx-auto max-w-[80rem]">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/month" element={<MonthlyEntry />} />
            <Route path="/import" element={<Import />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/charts" element={<Charts />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/budget" element={<Budget />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/wealth" element={<Wealth />} />
            <Route path="/allocation" element={<Allocation />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>

      {/* phone: bottom tab bar + "More" sheet */}
      {more && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-[#10281f]/50 md:hidden" onClick={() => setMore(false)} />}
      <div className={`pb-safe fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-[var(--card)] px-4 pt-3 shadow-2xl transition-transform duration-300 md:hidden ${more ? 'translate-y-0' : 'translate-y-full'}`} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 5.5rem)' }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        {GROUPS.map(g => (
          <div key={g.title} className="mb-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{g.title}</p>
            <div className="grid grid-cols-3 gap-2">
              {g.items.map(([to, label, Icon]) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-center text-xs font-medium ${isActive ? 'bg-[#10281f] text-[#f6f1e4]' : 'bg-slate-100 text-slate-600'}`}>
                  <Icon size={20} />{label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-50 flex items-stretch border-t border-slate-300/80 px-2 pt-1.5 md:hidden" style={{ background: 'var(--card)', paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + .375rem)' }}>
        {TABS.map(([to, label, Icon]) => {
          const on = (to === '/' ? pathname === '/' : pathname.startsWith(to)) && !more;
          if (to === '/month') return (
            <NavLink key={to} to={to} aria-label={label} className="relative flex flex-1 flex-col items-center justify-end gap-1 pb-1 text-[11px] font-bold text-[#10281f]">
              <span className={`-mt-6 grid h-14 w-14 place-items-center rounded-2xl text-[#f6f1e4] ring-4 ring-[var(--card)] transition-transform active:scale-95 ${on ? 'scale-105' : ''}`} style={{ background: 'var(--ink)', boxShadow: '0 8px 0 -4px #e3a21a' }}><Icon size={26} /></span>
              {label}
            </NavLink>
          );
          return (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => tab(isActive && !more)} data-active={on}>
              <Icon size={21} />{label}
            </NavLink>
          );
        })}
        <button onClick={() => setMore(m => !m)} data-active={more} className={tab(more)}><Menu size={21} />More</button>
      </nav>
    </div>
  );
}
