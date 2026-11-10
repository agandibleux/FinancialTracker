import { useEffect, useState } from 'react';
import { LockKeyhole, CloudCog, LineChart, ShieldCheck, KeyRound, Laptop, Smartphone, HardDrive, ArrowRight } from 'lucide-react';
import { signIn, signInLocal } from '../local/auth';
import { getConfig } from '../local/config';
import { GoogleSetupGuide, PrivacyNote } from '../components/SyncUI';

/** Counts from 0 to `to` once on mount (ease-out). Rests at the final value under reduced motion. */
function useCountUp(to: number, ms = 1600) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(to); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const p = Math.min(1, (t - t0) / ms); setV(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return v;
}
const fmt = (n: number) => Math.round(n).toLocaleString('en-CA');

const FEATURES: [typeof LockKeyhole, string, string, 'bars' | 'accounts' | 'sync'][] = [
  [LineChart, 'See where the money goes', 'Monthly income and living cost, predicted versus actual savings, and a wealth projection that stays honest about what really happened.', 'bars'],
  [ShieldCheck, 'Built for Canadian households', 'Plan Jan 1 contributions across TFSA, RRSP and FHSA with ratio-based allocation, and track your ETF portfolio with live prices.', 'accounts'],
  [CloudCog, 'Works offline, syncs everywhere', 'Your data lives in your browser and syncs between your computer and phone through your own Google Drive.', 'sync'],
];

function BarsViz() {
  return <div className="lp-viz lp-bars" aria-hidden>{[38, 52, 44, 66, 58, 80, 72].map((h, i) => <i key={i} style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }} />)}</div>;
}
function AccountsViz() {
  return (
    <div className="lp-viz lp-accts" aria-hidden>
      {[['TFSA', 46, '#34d399'], ['RRSP', 34, '#60a5fa'], ['FHSA', 20, '#fbbf24']].map(([n, w, c], i) => (
        <div key={n as string}><span>{n}</span><b><i style={{ width: `${w}%`, background: c as string, animationDelay: `${i * 0.25}s` }} /></b></div>
      ))}
    </div>
  );
}
function SyncViz() {
  return (
    <div className="lp-viz lp-syncviz" aria-hidden>
      <Laptop size={20} /><span className="lp-wire"><i /></span><CloudCog size={20} /><span className="lp-wire"><i style={{ animationDelay: '.7s' }} /></span><Smartphone size={20} />
    </div>
  );
}

/** Public page shown to signed-out visitors. Signing in only identifies you; your data is still unlocked by your own passphrase. */
export default function Landing() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const configured = !!getConfig().googleClientId.trim();
  const go = async () => {
    setBusy(true); setError('');
    try { await signIn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  const net = useCountUp(248600), saved = useCountUp(2140), pct = useCountUp(62);

  return (
    <div className="lp">
      <header className="lp-nav" style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 1rem)' }}>
        <div className="lp-wrap flex items-center justify-between">
          <div className="flex items-center gap-3"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-10 w-10 rounded-xl ring-1 ring-white/10" /><span className="text-[15px] font-semibold tracking-tight">Financial Planner</span></div>
          <button onClick={go} disabled={busy || !configured} className="lp-btn-ghost">Sign in</button>
        </div>
      </header>

      <main>
        {/* hero: alone on the first screen */}
        <section className="lp-hero">
          <div className="lp-aurora" aria-hidden><i /><i /><i /></div>
          <div className="lp-grid" aria-hidden />
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-copy">
              <span className="lp-pill"><span className="live-dot" />Private by design · Invite only</span>
              <h1 className="display lp-h1">Know where your <em>household</em> stands.</h1>
              <p className="lp-lede">A private planner for monthly spending, savings and long-term wealth. Encrypted on your device before anything is stored, and readable only by you.</p>
              <div className="lp-actions">
                <button onClick={go} disabled={busy || !configured} className="lp-btn">
                  <KeyRound size={16} />{busy ? 'Opening Google…' : 'Sign in with Google'}<ArrowRight size={16} className="lp-arrow" />
                </button>
                {import.meta.env.DEV && <button onClick={() => signInLocal().catch(e => setError(String(e?.message ?? e)))} className="lp-btn-ghost lp-btn-lg">Continue on this computer</button>}
              </div>
              <p className="lp-fine">Your account must be on the allowed list.</p>
              {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
              {!configured && <div className="mt-6 max-w-xl text-slate-900"><p className="mb-3 text-sm text-amber-200">Sign-in isn’t configured on this site yet. The owner sets <code>VITE_GOOGLE_CLIENT_ID</code> at build time.</p><GoogleSetupGuide /></div>}
            </div>

            {/* the product, live: a mock of the dashboard */}
            <div className="lp-stage" aria-hidden>
              <div className="lp-app">
                <div className="lp-app-bar"><i /><i /><i /><span>Wealth · 2026</span></div>
                <div className="lp-app-body">
                  <div className="lp-kpis">
                    <div><small>Net worth</small><b>${fmt(net)}</b></div>
                    <div><small>Saved this month</small><b className="lp-up">+${fmt(saved)}</b></div>
                  </div>
                  <svg viewBox="0 0 320 120" className="lp-chart" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="lpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34d399" stopOpacity=".38" /><stop offset="1" stopColor="#34d399" stopOpacity="0" /></linearGradient>
                    </defs>
                    {[30, 60, 90].map(y => <line key={y} x1="0" x2="320" y1={y} y2={y} stroke="rgba(255,255,255,.07)" />)}
                    <path className="lp-area" d="M0 104 C40 98 60 92 90 84 S150 74 180 56 S250 30 320 12 L320 120 L0 120Z" fill="url(#lpg)" />
                    <path className="lp-line" d="M0 104 C40 98 60 92 90 84 S150 74 180 56 S250 30 320 12" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" pathLength={1} />
                    <circle className="lp-dot" cx="320" cy="12" r="4.5" fill="#34d399" />
                  </svg>
                  <div className="lp-savebar"><div><span className="sheen" style={{ width: `${pct}%` }} /></div><small>Savings goal · {Math.round(pct)}%</small></div>
                </div>
              </div>
              <div className="lp-chip lp-chip-a"><ShieldCheck size={14} />TFSA room used <b>$7,000</b></div>
              <div className="lp-chip lp-chip-b"><LockKeyhole size={14} />Encrypted on device</div>
            </div>
          </div>
        </section>

        <section className="lp-sec">
          <div className="lp-wrap">
            <h2 className="display lp-h2">One calm place for the whole picture.</h2>
            <div className="lp-cards">
              {FEATURES.map(([Icon, t, d, v]) => (
                <article key={t} className="lp-card">
                  {v === 'bars' ? <BarsViz /> : v === 'accounts' ? <AccountsViz /> : <SyncViz />}
                  <Icon size={20} className="lp-ic" /><h3>{t}</h3><p>{d}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-sec lp-sec-alt">
          <div className="lp-wrap lp-priv">
            <div>
              <h2 className="display lp-h2">Your data never leaves your hands.</h2>
              <p className="lp-lede">Everything is encrypted with your passphrase before it reaches Google Drive. Not us, not Google: only you can read it.</p>
              <div className="lp-flow" aria-hidden>
                <div><Laptop size={22} /><span>Your device</span></div>
                <span className="lp-wire lp-wire-lg"><i /></span>
                <div className="lp-lock"><LockKeyhole size={22} /><span>Encrypt</span></div>
                <span className="lp-wire lp-wire-lg"><i style={{ animationDelay: '.9s' }} /></span>
                <div><HardDrive size={22} /><span>Your Drive</span></div>
              </div>
            </div>
            <div className="text-slate-900"><PrivacyNote /></div>
          </div>
        </section>
      </main>

      <footer className="lp-wrap lp-foot">Signing in shares only your name and email with this site. Access to your Drive is limited to the app’s own hidden folder.</footer>
    </div>
  );
}
