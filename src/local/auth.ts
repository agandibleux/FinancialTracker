/**
 * Identity for this browser. Google sign-in only says *who* the user is (OIDC `sub`); it never replaces the vault passphrase.
 * Everything stored locally (IndexedDB name, app-lock flag, Drive flag) is namespaced by `sub`, so several people can use the
 * same browser without ever seeing each other's data. Sign-in/out reloads the page so no in-memory state can leak across users.
 */
import { getToken, revokeToken } from './drive';

export interface User { sub: string; email: string; name: string; picture?: string }

const USER_KEY = 'planner-user';
const LEGACY_DB = 'planner-local';

export function getUser(): User | null {
  try {
    const u = JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    return u && typeof u.sub === 'string' && /^[\w-]+$/.test(u.sub) ? u : null;
  } catch { return null; }
}

/** `planner-local` for nobody (never opened when signed out), `planner-local:<sub>` otherwise. */
export const dbName = () => { const u = getUser(); return u ? `${LEGACY_DB}:${u.sub}` : LEGACY_DB; };
/** Namespaced localStorage key for the current user. */
export const userKey = (k: string) => `${k}:${getUser()?.sub ?? 'anon'}`;

const subs = new Set<() => void>();
export const subscribeUser = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** Opens Google's popup (needs a tap), reads the profile, stores it and reloads into the user's own namespace. */
export async function signIn(): Promise<void> {
  const token = await getToken(true);
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Could not read your Google profile');
  const p = await res.json();
  if (!p.sub || !/^[\w-]+$/.test(p.sub)) throw new Error('Unexpected profile from Google');
  const user: User = { sub: p.sub, email: String(p.email ?? ''), name: String(p.name ?? p.email ?? ''), picture: typeof p.picture === 'string' ? p.picture : undefined };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  await claimLegacyData(user);
  subs.forEach(f => f());
  location.reload();
}

/** Dev-server only: a fixed local identity so the app is usable on localhost without a Google client ID (no Drive sync). */
export async function signInLocal(): Promise<void> {
  if (!import.meta.env.DEV) throw new Error('Local sign-in is only available on the dev server');
  const user: User = { sub: 'local-dev', email: 'local@localhost', name: 'Local user' };
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  await claimLegacyData(user);
  subs.forEach(f => f());
  location.reload();
}

/**
 * Data created before accounts existed lives in the un-namespaced `planner-local` database. The first person to sign in on this
 * browser adopts it (it was theirs); it is then removed so a second person can never inherit it.
 */
async function claimLegacyData(user: User) {
  if (localStorage.getItem('planner-legacy-claimed') === '1') return;
  localStorage.setItem('planner-legacy-claimed', '1');
  const names = (await indexedDB.databases?.())?.map(d => d.name) ?? [];
  if (!names.includes(LEGACY_DB)) return;
  const src = await openIdb(LEGACY_DB), dst = await openIdb(`${LEGACY_DB}:${user.sub}`);
  const rows = await new Promise<[IDBValidKey, unknown][]>((resolve, reject) => {
    const out: [IDBValidKey, unknown][] = [];
    const c = src.transaction('kv').objectStore('kv').openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out.push([cur.key, cur.value]); cur.continue(); } else resolve(out); };
    c.onerror = () => reject(c.error);
  });
  await new Promise<void>((resolve, reject) => {
    const t = dst.transaction('kv', 'readwrite');
    for (const [k, v] of rows) t.objectStore('kv').put(v, k);
    t.oncomplete = () => resolve(); t.onerror = () => reject(t.error);
  });
  src.close(); dst.close();
  indexedDB.deleteDatabase(LEGACY_DB);
  // the legacy app-lock / Drive flags belong to the same person
  for (const k of ['planner-applock', 'planner-drive-connected']) {
    const v = localStorage.getItem(k);
    if (v) { localStorage.setItem(`${k}:${user.sub}`, v); localStorage.removeItem(k); }
  }
  localStorage.removeItem('planner-drive-token');
}

function openIdb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/** Signs out of this browser. With `wipe`, also deletes the local copy (the encrypted Drive vault is untouched). */
export async function signOut(wipe = false): Promise<void> {
  const u = getUser();
  await revokeToken();
  if (u) {
    if (wipe) {
      indexedDB.deleteDatabase(`${LEGACY_DB}:${u.sub}`);
      for (const k of ['planner-applock', 'planner-drive-connected']) localStorage.removeItem(`${k}:${u.sub}`);
    }
  }
  localStorage.removeItem(USER_KEY);
  sessionStorage.clear();
  location.reload();
}
