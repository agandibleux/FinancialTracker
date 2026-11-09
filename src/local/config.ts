/** Per-device settings (not part of the synced database). Build-time env values are the defaults. */
const KEY = 'planner-config';
export interface Config { googleClientId: string; quoteProxy: string }

const defaults = (): Config => ({
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  quoteProxy: import.meta.env.VITE_QUOTE_PROXY_URL || '', // static hosting has no backend: deploy worker/quotes.js and set VITE_QUOTE_PROXY_URL
});

export function getConfig(): Config {
  try {
    const c = { ...defaults(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
    return { ...c, quoteProxy: c.quoteProxy || defaults().quoteProxy };
  } catch { return defaults(); }
}
export function setConfig(patch: Partial<Config>) {
  localStorage.setItem(KEY, JSON.stringify({ ...getConfig(), ...patch }));
}

/**
 * "Set up another device" link: carries only the two public identifiers (Google client ID, quote proxy URL) in the URL *fragment*
 * (#setup=…), which browsers never send to any server. It never contains the passphrase or any data.
 */
export function makeSetupLink(): string {
  const { googleClientId, quoteProxy } = getConfig();
  return `${location.origin}${location.pathname}#setup=${encodeURIComponent(btoa(JSON.stringify({ g: googleClientId, q: quoteProxy })))}`;
}
/** Call once at startup: stores the config from a setup link and removes it from the address bar. */
export function applySetupLink() {
  const m = location.hash.match(/^#setup=(.+)$/);
  if (!m) return false;
  try {
    const { g, q } = JSON.parse(atob(decodeURIComponent(m[1])));
    setConfig({ googleClientId: String(g ?? ''), quoteProxy: String(q ?? '') });
  } catch { /* ignore a malformed link */ }
  history.replaceState(null, '', location.pathname + location.search);
  return true;
}
