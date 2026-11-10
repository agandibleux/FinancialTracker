import { useState } from 'react';
import { LockKeyhole, CloudCog, LineChart, ShieldCheck, KeyRound } from 'lucide-react';
import { signIn, signInLocal } from '../local/auth';
import { getConfig } from '../local/config';
import { GoogleSetupGuide, PrivacyNote } from '../components/SyncUI';

const FEATURES: [typeof LockKeyhole, string, string][] = [
  [LineChart, 'See where the money goes', 'Monthly income and living cost, predicted versus actual savings, and a wealth projection that stays honest about what really happened.'],
  [ShieldCheck, 'Built for Canadian households', 'Plan Jan 1 contributions across TFSA, RRSP and FHSA with ratio-based allocation, and track your ETF portfolio with live prices.'],
  [CloudCog, 'Works offline, syncs everywhere', 'Your data lives in your browser and syncs between your computer and phone through your own Google Drive.'],
];

/** Public page shown to signed-out visitors. Signing in only identifies you; your data is still unlocked by your own passphrase. */
export default function Landing() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const configured = !!getConfig().googleClientId.trim();
  const go = async () => {
    setBusy(true); setError('');
    try { await signIn(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); setBusy(false); }
  };
  return (
    <div className="min-h-screen text-white" style={{ background: 'radial-gradient(700px 360px at 85% -5%, rgba(20,163,158,.28), transparent 70%), radial-gradient(520px 320px at 5% 0%, rgba(99,140,235,.22), transparent 70%), #0e1a2e' }}>
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 pb-4" style={{ paddingTop: 'calc(env(safe-area-inset-top,0px) + 1.25rem)' }}>
        <div className="flex items-center gap-3"><img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" className="h-10 w-10 rounded-xl shadow-lg shadow-black/30 ring-1 ring-white/10" /><span className="text-[15px] font-semibold tracking-tight">Financial Planner</span></div>
        <button onClick={go} disabled={busy || !configured} className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium transition hover:bg-white/20 disabled:opacity-50">Sign in</button>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-6 pb-20 pt-16 sm:pt-24">
          <h1 className="display max-w-3xl text-5xl leading-[1.05] sm:text-7xl">Know where your household stands.</h1>
          <p className="mt-6 max-w-xl text-lg text-slate-300">A private planner for monthly spending, savings and long-term wealth. Encrypted on your device before anything is stored, and readable only by you.</p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button onClick={go} disabled={busy || !configured} className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-6 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-300 disabled:opacity-50">
              <KeyRound size={16} />{busy ? 'Opening Google…' : 'Sign in with Google'}
            </button>
            {import.meta.env.DEV && <button onClick={() => signInLocal().catch(e => setError(String(e?.message ?? e)))} className="rounded-xl border border-white/20 px-6 py-3 text-sm font-medium transition hover:bg-white/10">Continue on this computer</button>}
            <span className="text-sm text-slate-400">Invite only. Your account must be on the allowed list.</span>
          </div>
          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          {!configured && <div className="mt-6 max-w-xl text-slate-900"><p className="mb-3 text-sm text-amber-200">Sign-in isn’t configured on this site yet. The owner sets <code>VITE_GOOGLE_CLIENT_ID</code> at build time.</p><GoogleSetupGuide /></div>}
        </section>

        <section className="border-t border-white/10 bg-white/[0.03]">
          <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 sm:grid-cols-3">
            {FEATURES.map(([Icon, t, d]) => (
              <div key={t}><Icon size={20} className="text-emerald-300" /><h2 className="mt-3 text-base font-semibold">{t}</h2><p className="mt-1.5 text-sm text-slate-400">{d}</p></div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 py-16 text-slate-900"><PrivacyNote /></section>
      </main>

      <footer className="mx-auto max-w-5xl px-6 pb-10 text-xs text-slate-500">Signing in shares only your name and email with this site. Access to your Drive is limited to the app’s own hidden folder.</footer>
    </div>
  );
}
