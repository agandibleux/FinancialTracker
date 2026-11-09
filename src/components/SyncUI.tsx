import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Cloud, CloudOff, Copy, FileUp, Lock, LockKeyhole, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { getConfig, makeSetupLink, setConfig } from '../local/config';
import { disableLock, enableLock, lockEnabled, unlockApp } from '../local/lock';
import { downloadBlob } from '../local/download';
import { enableSync, exportFile, importFile, resolveConflict, restoreFromDrive, startFresh, syncNow, unlink, unlock, type Status } from '../local/sync';
import { findVault } from '../local/drive';
import { useSyncState } from '../local/useSync';
import { toast } from '../lib/toast';
import { Badge, Card, btnCls, btnGhost, inputCls } from './ui';

const LABEL: Record<Status, { text: string; tone: 'green' | 'amber' | 'rose' | 'indigo' | 'blue' }> = {
  local: { text: 'Local only', tone: 'blue' }, idle: { text: 'Synced', tone: 'green' }, syncing: { text: 'Syncing…', tone: 'indigo' },
  offline: { text: 'Offline', tone: 'amber' }, auth: { text: 'Reconnect', tone: 'amber' }, locked: { text: 'Locked', tone: 'amber' },
  conflict: { text: 'Conflict', tone: 'rose' }, error: { text: 'Sync error', tone: 'rose' },
};

export function SyncChip({ className = '' }: { className?: string }) {
  const s = useSyncState();
  const l = LABEL[s.status];
  const pending = s.dirty && s.linked && s.status === 'idle';
  const Icon = s.status === 'offline' ? CloudOff : s.status === 'local' ? ShieldCheck : s.status === 'conflict' || s.status === 'error' ? TriangleAlert : s.status === 'syncing' ? RefreshCw : Cloud;
  return (
    <Link to="/settings?tab=sync" className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${className}`} title={s.message || l.text}>
      <Icon size={13} className={s.status === 'syncing' ? 'animate-spin' : ''} />{pending ? 'Saved · syncing soon' : l.text}
    </Link>
  );
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Passphrase({ value, onChange, confirm, onConfirm, remember, onRemember }: {
  value: string; onChange: (v: string) => void; confirm?: string; onConfirm?: (v: string) => void; remember: boolean; onRemember: (b: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <input className={inputCls} type="password" autoComplete="off" placeholder="Vault passphrase" value={value} onChange={e => onChange(e.target.value)} />
      {onConfirm && <input className={inputCls} type="password" autoComplete="off" placeholder="Repeat passphrase" value={confirm} onChange={e => onConfirm(e.target.value)} />}
      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={remember} onChange={e => onRemember(e.target.checked)} />Remember on this device (stored as a non-exportable key; skip on shared computers)
      </label>
    </div>
  );
}

function ClientIdFields() {
  const [cfg, setCfg] = useState(getConfig());
  const save = (patch: Partial<typeof cfg>) => { setCfg(c => ({ ...c, ...patch })); setConfig(patch); };
  return (
    <div className="space-y-3 text-sm">
      <label className="block"><span className="mb-1 block font-medium">Google OAuth client ID</span>
        <input className={inputCls} value={cfg.googleClientId} onChange={e => save({ googleClientId: e.target.value })} placeholder="1234-abc.apps.googleusercontent.com" /></label>
    </div>
  );
}

/** Plain-language answer to "who can see my data?" */
export function PrivacyNote({ compact = false }: { compact?: boolean }) {
  const rows: [string, string][] = [
    ['Only you can read it', 'Your data is encrypted with a passphrase only you know before it leaves this device. Without it the Drive file is unreadable noise, to Google, to the website host and to anyone else.'],
    ['Stored in your own Drive', 'In the app’s hidden folder of your personal Google Drive. The app can’t see any of your other files, and nobody else is given access.'],
    ['The website holds no data', 'The site is just the app’s code. A stranger who opens it sees an empty app; signing in with their own Google account shows their own empty folder, never yours.'],
    ['Nothing is shared or tracked', 'No accounts, analytics or servers of ours. The optional price proxy only sees ticker symbols (e.g. “VFV.TO”), never amounts or holdings.'],
  ];
  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm">
      <p className="mb-2 flex items-center gap-2 font-semibold text-emerald-900"><LockKeyhole size={16} />Private to you</p>
      <ul className="space-y-2 text-emerald-900/90">
        {(compact ? rows.slice(0, 2) : rows).map(([t, d]) => <li key={t}><b>{t}.</b> {d}</li>)}
      </ul>
      {!compact && <p className="mt-3 text-xs text-emerald-900/70">Keep the passphrase safe — it can’t be recovered. Turn on the device passcode (Settings → Sync & data) so someone holding your unlocked phone can’t open the app.</p>}
    </div>
  );
}

export function LockScreen() {
  const [code, setCode] = useState(''), [error, setError] = useState('');
  const go = async () => { try { await unlockApp(code); setCode(''); } catch { setError('Wrong passcode'); } };
  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6 pt-safe">
      <div className="flex items-center gap-3"><img src="/icon.svg" alt="" className="h-11 w-11 rounded-xl" /><h1 className="text-lg font-semibold">Financial Planner is locked</h1></div>
      <input className={inputCls} type="password" autoFocus placeholder="Device passcode" value={code} onChange={e => { setCode(e.target.value); setError(''); }} onKeyDown={e => e.key === 'Enter' && code && go()} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className={btnCls} disabled={!code} onClick={go}><Lock size={16} />Unlock</button>
    </div>
  );
}

function DeviceLock() {
  const [on, setOn] = useState(lockEnabled());
  const [code, setCode] = useState('');
  return (
    <div className="space-y-2 text-sm">
      <p className="font-medium">Device passcode {on && <Badge tone="green">On</Badge>}</p>
      <p className="text-xs text-slate-500">Asks for a passcode when the app opens and after 5 minutes in the background. Stays on this device only.</p>
      {on ? <button className={btnGhost} onClick={async () => { await disableLock(); setOn(false); }}>Turn off</button> : (
        <div className="flex max-w-sm gap-2">
          <input className={inputCls} type="password" placeholder="Choose a passcode (4+ characters)" value={code} onChange={e => setCode(e.target.value)} />
          <button className={btnCls} disabled={code.length < 4} onClick={async () => { await enableLock(code); setCode(''); setOn(true); }}>Turn on</button>
        </div>
      )}
    </div>
  );
}

/** Settings: hand the (public) configuration to another device without retyping anything. */
function SetupLinkCard() {
  const cfg = getConfig();
  if (!cfg.googleClientId) return null;
  return (
    <Card title="Add another device" subtitle="Send this link to yourself (Messages, AirDrop, notes). It carries only the public setup values — not your passphrase or data — so the new device only asks for your passphrase.">
      <button className={btnGhost} onClick={async () => { await navigator.clipboard.writeText(makeSetupLink()); toast('Setup link copied'); }}><Copy size={16} />Copy setup link</button>
      <p className="mt-3 text-xs text-slate-500">On the iPhone: open the link in Safari → Share → Add to Home Screen → open it → “I already set it up on another device” → passphrase.</p>
    </Card>
  );
}

function FilePicker({ label, onBytes, className = btnGhost }: { label: string; onBytes: (b: Uint8Array) => Promise<void>; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (<>
    <input ref={ref} type="file" className="hidden" accept=".db,.sqlite,.sqlite3,application/x-sqlite3,application/octet-stream" onChange={async e => {
      const f = e.target.files?.[0]; e.target.value = '';
      if (!f) return;
      try { await onBytes(new Uint8Array(await f.arrayBuffer())); toast('Database imported'); } catch (err) { toast(errMsg(err), 'error'); }
    }} />
    <button className={className} onClick={() => ref.current?.click()}><FileUp size={16} />{label}</button>
  </>);
}

const A = ({ href, children }: { href: string; children: string }) => <a className="font-medium text-indigo-600 underline" href={href} target="_blank" rel="noreferrer">{children}</a>;

/** Step-by-step Google Cloud setup (one time, free). */
export function GoogleSetupGuide({ open = false }: { open?: boolean }) {
  const origin = location.origin;
  return (
    <details open={open} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
      <summary className="cursor-pointer font-semibold text-slate-800">How to get a Google client ID (one time, free, works with a personal @gmail.com account, ~5 min)</summary>
      <ol className="mt-3 list-decimal space-y-2 pl-5 text-slate-700">
        <li>Go to <A href="https://console.cloud.google.com/projectcreate">console.cloud.google.com</A>, sign in with your personal Google account (the one whose Drive will hold your data; no Workspace or billing needed) and create a project named “Financial Planner”.</li>
        <li>Open <A href="https://console.cloud.google.com/apis/library/drive.googleapis.com">Google Drive API</A> and click <b>Enable</b>.</li>
        <li>Open <A href="https://console.cloud.google.com/auth/overview">Google Auth Platform</A> → <b>Get started</b>. App name “Financial Planner”, your email, Audience <b>External</b> (the only option for a personal account), accept the terms.</li>
        <li><b>Scopes: nothing to do.</b> The app asks for the Drive “app data” permission itself when you sign in, and Google doesn’t require non-sensitive scopes to be listed on the consent screen. If you’re curious: Data access → Add or remove scopes → paste <code className="select-all rounded bg-white px-1">https://www.googleapis.com/auth/drive.appdata</code> into “Manually add scopes” (only shown once the Drive API is enabled) — optional.</li>
        <li>Open <b>Audience</b> → <b>Publish app</b> → confirm, so the status reads <b>In production</b>. This scope is non-sensitive, so Google needs no review, shows no warning and never expires your sign-in. (Skip this and you stay in “Testing”: you must add your Gmail under Test users and re-sign-in about weekly.)</li>
        <li>Open <b>Clients</b> → <b>Create client</b> → type <b>Web application</b>. Under <b>Authorised JavaScript origins</b> add <code className="select-all rounded bg-white px-1">{origin}</code> and click <b>Create</b>.</li>
        <li>Copy the <b>Client ID</b> (ends in <code className="rounded bg-white px-1">.apps.googleusercontent.com</code>) and paste it into the field on this page.</li>
      </ol>
      <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-slate-700">
        <p className="font-semibold text-slate-800">Already set this up on another device? Reuse the same client ID.</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5">
          <li>Open <A href="https://console.cloud.google.com/auth/clients">Google Auth Platform → Clients</A> with the same Google account and select the “Financial Planner” project in the project picker at the top.</li>
          <li>Click your existing <b>Web application</b> client. The <b>Client ID</b> is at the top of the page (copy it and paste it into the field above). Nothing to create.</li>
          <li>Under <b>Authorised JavaScript origins</b> click <b>Add URI</b>, enter <code className="select-all rounded bg-white px-1">{origin}</code> and <b>Save</b>. Each address you open the app from (this computer’s localhost, your deployed site, …) must be listed; changes can take a few minutes to apply.</li>
        </ol>
        <p className="mt-1.5 text-xs text-slate-500">Can’t find it? Check you’re on the right Google account and project, or open any device where sign-in works: Settings → Sync &amp; data shows the ID, and “Set up another device” gives a link that carries it for you.</p>
      </div>
      <p className="mt-3 text-xs text-slate-500">The app only ever sees its own hidden folder in your Drive (never your other files). Your computer’s browser and the iPhone home-screen app use the same web address, so one authorised origin covers both. If you also test on localhost, add that origin too.</p>
    </details>
  );
}

const Step = ({ n, title, children }: { n: number; title: string; children?: ReactNode }) => (
  <li className="flex gap-3">
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{n}</span>
    <div className="min-w-0 flex-1 space-y-2"><p className="text-sm font-medium text-slate-900">{title}</p>{children}</div>
  </li>
);

/** First run on a device: no local database yet. */
export function Welcome() {
  const s = useSyncState();
  const [mode, setMode] = useState<'first' | 'other' | null>(null);
  const [pass, setPass] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const configured = !!getConfig().googleClientId.trim();
  const [, force] = useState(0);
  const [found, setFound] = useState<boolean | null>(null);
  // Signed-in users: look for an existing vault in their Drive so a new device goes straight to "enter your passphrase".
  useEffect(() => {
    let live = true;
    findVault(false).then(v => { if (live) { setFound(!!v); setMode(m => m ?? (v ? 'other' : 'first')); } }).catch(() => {});
    return () => { live = false; };
  }, []);
  const choice = (m: 'first' | 'other', title: string, text: string) => (
    <button onClick={() => setMode(m)} className={`w-full rounded-2xl border p-4 text-left transition ${mode === m ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-500/10' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
      <p className="font-semibold text-slate-900">{title}</p><p className="mt-0.5 text-sm text-slate-500">{text}</p>
    </button>
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 p-5 pt-safe">
      <div className="flex items-center gap-3"><img src="/icon.svg" alt="" className="h-12 w-12 rounded-xl" />
        <div><h1 className="text-xl font-semibold tracking-tight">Financial Planner</h1><p className="text-sm text-slate-500">Your data stays on your devices — and in your own encrypted Google Drive file.</p></div></div>

      <PrivacyNote compact />

      {found && <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><ShieldCheck size={16} />We found your encrypted data in your Google Drive. Enter your passphrase below to open it on this device.</p>}
      <p className="text-sm font-semibold text-slate-700">What are you doing?</p>
      <div className="space-y-3">
        {choice('first', 'This is my first device', 'Set up the app for the first time and bring in my existing data. Do this on your computer.')}
        {choice('other', 'I already set it up on another device', 'Restore my data from Google Drive onto this phone or computer.')}
      </div>

      {mode === 'first' && (
        <Card title="First-time setup" subtitle="Two parts: bring in your data now, then switch on Drive sync so other devices can use it.">
          <ol className="space-y-5">
            <Step n={1} title="Load your data on this device">
              <p className="text-sm text-slate-500">Choose your existing database file: the <code className="rounded bg-slate-100 px-1">data/finance.db</code> file inside your FinancialTracker project folder. No data yet? Start empty instead.</p>
              <div className="flex flex-wrap gap-2">
                <FilePicker label="Choose finance.db" onBytes={importFile} className={btnCls} />
                <button className={btnGhost} onClick={() => void startFresh()}>Start empty</button>
              </div>
            </Step>
            <Step n={2} title="Then turn on Drive sync">
              <p className="text-sm text-slate-500">After step 1 the app opens. Go to <b>Settings → Sync & data</b> (left menu on a computer; <b>More → Settings</b> on a phone), choose a passphrase and click <b>Turn on Drive sync</b>. The guide for the client ID is on that screen too.</p>
            </Step>
            <Step n={3} title="Add your phone">
              <p className="text-sm text-slate-500">On the iPhone open this same web address in <b>Safari</b> → Share → <b>Add to Home Screen</b>. Open the new icon, pick <b>“I already set it up on another device”</b>, and enter the passphrase.</p>
            </Step>
          </ol>
        </Card>
      )}

      {mode === 'other' && (
        <Card title="Restore from Google Drive" subtitle="You need the passphrase you chose when you turned on sync.">
          <div className="space-y-4">
            {configured
              ? <p className="flex items-center gap-2 text-sm text-emerald-700"><ShieldCheck size={16} />Google setup received — just enter your passphrase.</p>
              : (<><p className="text-sm text-slate-600">Easiest: open the <b>setup link</b> from your first device (Settings → Sync & data → Copy setup link). Or paste the values by hand:</p>
                  <div onChange={() => force(n => n + 1)}><ClientIdFields /></div><GoogleSetupGuide /></>)}
            {configured && <Passphrase value={pass} onChange={setPass} remember={remember} onRemember={setRemember} />}
            {(error || s.message) && <p className="text-sm text-red-600">{error || s.message}</p>}
            <button className={btnCls} disabled={busy || !pass || !configured} onClick={async () => {
              setBusy(true); setError('');
              try { await restoreFromDrive(pass, remember); } catch (e) { setError(errMsg(e)); }
              setBusy(false);
            }}><Cloud size={16} />{busy ? 'Restoring…' : 'Sign in with Google & restore'}</button>
          </div>
        </Card>
      )}
    </div>
  );
}

const ago = (t: number | null) => (t ? new Date(t).toLocaleString() : 'never');

/** Settings → Sync & data */
export function SyncPanel() {
  const s = useSyncState();
  const [pass, setPass] = useState(''), [pass2, setPass2] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [, force] = useState(0);
  const l = LABEL[s.status];
  const act = async (fn: () => Promise<unknown>) => { setBusy(true); setError(''); try { await fn(); } catch (e) { setError(errMsg(e)); } setBusy(false); };
  const configured = !!getConfig().googleClientId.trim();

  return (
    <div className="space-y-5">
      <PrivacyNote />
      <Card title="Drive sync" subtitle="One encrypted file in this app's hidden Google Drive folder. Google never sees your passphrase or readable data."
        right={<Badge tone={l.tone}>{l.text}</Badge>}>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">Last synced: {ago(s.lastSynced)}{s.dirty ? ' · changes waiting to upload' : ''}</p>
          {s.message && <p className="text-sm text-amber-700">{s.message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {!s.linked && (<>
            <div onChange={() => force(n => n + 1)}><ClientIdFields /></div>
            <GoogleSetupGuide open={!configured} />
            {configured && <Passphrase value={pass} onChange={setPass} confirm={pass2} onConfirm={setPass2} remember={remember} onRemember={setRemember} />}
            <p className="text-xs text-slate-500">Choose a passphrase you will remember — it cannot be recovered. The same passphrase is needed on every device.</p>
            <button className={btnCls} disabled={busy || !configured || pass.length < 8 || pass !== pass2} onClick={() => act(() => enableSync(pass, remember))}>
              <Cloud size={16} />Turn on Drive sync</button>
            {pass && pass.length < 8 && <p className="text-xs text-slate-500">Use at least 8 characters.</p>}
          </>)}

          {s.linked && s.status === 'conflict' && (
            <div className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
              <p className="font-medium text-red-800">Drive already holds a vault.</p>
              <p className="text-red-700">“Merge” combines both (this device wins if the same row differs). The other two replace one side; a safety copy of this device is kept.</p>
              <div className="flex flex-wrap gap-2">
                <button className={btnCls} disabled={busy} onClick={() => act(() => resolveConflict('merge'))}>Merge both</button>
                <button className={btnGhost} disabled={busy} onClick={() => act(() => resolveConflict('mine'))}>Keep this device’s data</button>
                <button className={btnGhost} disabled={busy} onClick={() => act(() => resolveConflict('drive'))}>Use Drive’s data</button>
              </div>
            </div>
          )}

          {s.linked && s.status === 'locked' && (
            <div className="max-w-sm space-y-2"><Passphrase value={pass} onChange={setPass} remember={remember} onRemember={setRemember} />
              <button className={btnCls} disabled={busy || !pass} onClick={() => act(() => unlock(pass, remember))}><Lock size={16} />Unlock</button></div>
          )}

          {s.linked && (
            <div className="flex flex-wrap gap-2">
              <button className={btnCls} disabled={busy || s.status === 'syncing' || s.status === 'conflict'} onClick={() => act(() => syncNow(true))}>
                <RefreshCw size={16} className={s.status === 'syncing' ? 'animate-spin' : ''} />{s.status === 'auth' ? 'Reconnect & sync' : 'Sync now'}</button>
              <button className={btnGhost} disabled={busy} onClick={() => confirm('Stop syncing on this device? The Drive file is kept.') && act(unlink)}>Turn off on this device</button>
            </div>
          )}
        </div>
      </Card>

      {s.linked && <SetupLinkCard />}

      <Card title="This device" subtitle="Your data is stored in this browser. Make sure to keep a copy you control.">
        <div className="mb-5 border-b border-slate-100 pb-5"><DeviceLock /></div>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={() => downloadBlob(exportFile(), `finance-${new Date().toLocaleDateString('en-CA')}.db`)}>Download backup (.db)</button>
          <FilePicker label="Replace with a .db file" onBytes={async b => { if (confirm('Replace ALL data on this device with the selected file?')) await importFile(b); }} />
        </div>
        {s.linked && <div className="mt-5 border-t border-slate-100 pt-4"><ClientIdFields /></div>}
        {!s.linked && <p className="mt-3 text-xs text-slate-500">The quote proxy URL above is also used for live prices without Drive sync.</p>}
      </Card>
    </div>
  );
}
