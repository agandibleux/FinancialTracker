import { useEffect, useState } from 'react';
import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { BarChart3, CalendarDays, FileSpreadsheet, LayoutDashboard, Landmark, PiggyBank, Scale, Settings as Cog, TrendingUp, Menu, Activity, CandlestickChart, ChartLine as LineChartIcon, type LucideIcon } from 'lucide-react';
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
  { title: 'Overview', items: [['/', 'Dashboard', LayoutDashboard], ['/trends', 'Trends', Activity], ['/reports', 'Yearly report', BarChart3]] },
  { title: 'Monthly', items: [['/month', 'Monthly entry', CalendarDays], ['/import', 'Import', FileSpreadsheet]] },
  { title: 'Accounts & portfolio', items: [['/accounts', 'Accounts', Landmark], ['/portfolio', 'ETF portfolio', CandlestickChart], ['/charts', 'Charts', LineChartIcon]] },
  { title: 'Planning', items: [['/wealth', 'Wealth projection', TrendingUp], ['/allocation', 'Allocation', Scale]] },
  { title: 'Setup', items: [['/settings', 'Settings', Cog]] },
];

const link = (isActive: boolean) =>
  `group relative flex items-center justify-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition lg:justify-start ${isActive ? 'bg-gradient-to-r from-emerald-400/20 to-white/5 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]' : 'text-slate-400 hover:bg-white/5 hover:text-white lg:hover:translate-x-0.5'}`;

/** the four daily destinations live in the bottom bar; everything else sits behind "More" */
const TABS: [string, string, LucideIcon][] = [['/', 'Home', LayoutDashboard], ['/month', 'Month', CalendarDays], ['/accounts', 'Accounts', Landmark], ['/trends', 'Trends', Activity]];

export default function App() {
  useAutoPrices();
  const [more, setMore] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => { setMore(false); window.scrollTo(0, 0); }, [pathname]);
  const inTabs = TABS.some(([to]) => (to === '/' ? pathname === '/' : pathname.startsWith(to)));
  const tab = (active: boolean) => `flex flex-1 flex-col items-center justify-center gap-1 rounded-2xl py-1.5 text-[11px] font-semibold transition ${active ? 'text-indigo-700' : 'text-slate-500'}`;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[100rem] md:gap-4 md:p-4 lg:gap-6 lg:p-6">
      <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-[4.75rem] shrink-0 flex-col rounded-3xl p-3 lg:top-6 lg:h-[calc(100vh-3rem)] lg:w-60 lg:p-4 text-white shadow-[0_24px_48px_-24px_rgba(14,26,46,0.6)] md:flex" style={{ background: 'linear-gradient(170deg,#16294a 0%,#0e1a2e 70%)' }}>
        <div className="mb-7 flex items-center justify-center gap-3 pt-1 lg:justify-start lg:px-2">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-10 w-10 rounded-xl shadow-lg shadow-black/30" />
          <div className="hidden lg:block"><p className="text-[15px] font-semibold leading-tight tracking-tight">Financial Planner</p><p className="flex items-center gap-1.5 text-[11px] text-slate-400"><i className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />Household · CAD</p></div>
        </div>
        <nav className="flex flex-1 flex-col gap-3 overflow-y-auto lg:gap-5 lg:pr-1">
          {GROUPS.map(g => (
            <div key={g.title}>
              <p className="mb-1.5 hidden px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500 lg:block">{g.title}</p>
              <div className="flex flex-col gap-0.5">
                {g.items.map(([to, label, Icon]) => (
                  <NavLink key={to} to={to} end={to === '/'} title={label} className={({ isActive }) => link(isActive)}>
                    {({ isActive }) => (<>
                      {isActive && <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-emerald-400" />}
                      <Icon size={18} className={`shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-emerald-300' : ''}`} /><span className="hidden lg:inline">{label}</span>
                    </>)}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="flex items-center justify-center gap-2 border-t border-white/10 pt-3 text-[11px] text-slate-500 lg:justify-start lg:px-2"><PiggyBank size={14} /><span className="hidden lg:contents"><SyncChip /></span><UserMenu up className="lg:ml-auto" /></div>
      </aside>

      {/* phone header */}
      <header className="pt-safe fixed inset-x-0 top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl md:hidden">
        <div className="flex h-12 items-center gap-2.5 px-4">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-7 w-7 rounded-lg" />
          <p className="text-[15px] font-semibold tracking-tight text-slate-900">Financial Planner</p>
          <SyncChip className="ml-auto text-slate-500" /><UserMenu />
        </div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-32 pt-[calc(env(safe-area-inset-top,0px)+4rem)] md:px-0 md:pb-16 md:pt-0">
        <div className="page">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/month" element={<MonthlyEntry />} />
            <Route path="/import" element={<Import />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/charts" element={<Charts />} />
            <Route path="/trends" element={<Trends />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/wealth" element={<Wealth />} />
            <Route path="/allocation" element={<Allocation />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>

      {/* phone: bottom tab bar + "More" sheet */}
      {more && <button aria-label="Close menu" className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden" onClick={() => setMore(false)} />}
      <div className={`pb-safe fixed inset-x-0 bottom-0 z-50 rounded-t-3xl bg-white px-4 pt-3 shadow-2xl transition-transform duration-300 md:hidden ${more ? 'translate-y-0' : 'translate-y-full'}`} style={{ paddingBottom: 'calc(env(safe-area-inset-bottom,0px) + 5.5rem)' }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
        {GROUPS.map(g => (
          <div key={g.title} className="mb-3">
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{g.title}</p>
            <div className="grid grid-cols-3 gap-2">
              {g.items.map(([to, label, Icon]) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3 text-center text-xs font-medium ${isActive ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-50 text-slate-600'}`}>
                  <Icon size={20} />{label}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </div>
      <nav className="pb-safe fixed inset-x-3 bottom-3 z-50 flex items-stretch rounded-3xl border border-slate-200/80 bg-white/90 px-2 pt-1.5 shadow-[0_12px_32px_-8px_rgba(14,26,46,0.35)] backdrop-blur-xl md:hidden" style={{ bottom: 'calc(env(safe-area-inset-bottom,0px) + .75rem)', paddingBottom: '.375rem' }}>
        {TABS.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => tab(isActive && !more)}>
            <Icon size={21} />{label}
          </NavLink>
        ))}
        <button onClick={() => setMore(m => !m)} className={tab(more || !inTabs)}><Menu size={21} />More</button>
      </nav>
    </div>
  );
}
