import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { ToastHost } from './components/ui';
import { LockScreen, Welcome } from './components/SyncUI';
import { boot, onReplaced } from './local/sync';
import { applySetupLink } from './local/config';
import { getUser } from './local/auth';
import Landing from './pages/Landing';
import { useLocked, useSyncState } from './local/useSync';

// Clickjacking defence: GitHub Pages can't send frame-ancestors, so refuse to run inside someone else's frame.
if (window.top !== window.self) { document.body.textContent = ''; throw new Error('Framing is not allowed'); }

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } });
onReplaced(() => qc.invalidateQueries());
applySetupLink();
if (getUser()) void boot();

/** Renders the app once the local database is open; otherwise the first-run screen. */
function Gate() {
  if (!getUser()) return <Landing />;
  return <AppGate />;
}

function AppGate() {
  const { phase } = useSyncState();
  const locked = useLocked();
  if (phase === 'booting') return null;
  if (locked && phase !== 'welcome') return <LockScreen />;
  if (phase === 'welcome') return <Welcome />;
  return <App />;
}

function Root() {
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }, []);
  return (
    <QueryClientProvider client={qc}>
      <HashRouter><Gate /><ToastHost /></HashRouter>
    </QueryClientProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Root /></React.StrictMode>);
