/**
 * Minimal Google Drive client. Uses the `drive.appdata` scope only: the app can see just its own hidden folder,
 * never the rest of your Drive, and the file doesn't clutter "My Drive".
 */
import { getConfig } from './config';
import { getUser, userKey } from './auth';

/** drive.appdata = the app's hidden folder only; openid/email/profile identify the user (see auth.ts). */
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata openid email profile';
const FILE_NAME = 'planner.vault';
const connectedKey = () => userKey('planner-drive-connected');

export class AuthRequired extends Error { constructor(m = 'Sign in to Google Drive') { super(m); } }
export class Offline extends Error { constructor() { super('Offline'); } }

let gisLoad: Promise<any> | null = null;
function loadGis(): Promise<any> {
  const w = window as any;
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  return gisLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = () => resolve(w.google);
    s.onerror = () => { gisLoad = null; reject(new Offline()); };
    document.head.appendChild(s);
  });
}

/** Load Google's script ahead of time so a later tap can open the popup immediately. */
export const preloadGis = () => { void loadGis().catch(() => {}); };

const TOKEN_KEY = 'planner-drive-token';
type Tok = { value: string; exp: number };
/** The 1 h access token survives reloads of this tab only (sessionStorage, not localStorage: it is gone when the tab closes). */
let token: Tok | null = (() => { try { return JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null'); } catch { return null; } })();
const setToken = (t: Tok | null) => { token = t; if (t) sessionStorage.setItem(TOKEN_KEY, JSON.stringify(t)); else sessionStorage.removeItem(TOKEN_KEY); };
export const wasConnected = () => localStorage.getItem(connectedKey()) === '1';
/** Tells Google to invalidate the access token (sign-out). Best effort. */
export async function revokeToken() {
  const t = token?.value;
  setToken(null);
  if (!t) return;
  try { const g = await loadGis(); await new Promise<void>(r => g.accounts.oauth2.revoke(t, () => r())); } catch { /* offline */ }
}
export const disconnect = () => { setToken(null); localStorage.removeItem(connectedKey()); };

const SILENT_COOLDOWN = 30 * 60_000; // after a failed silent renewal, don't flash Google's popup again until the user taps Reconnect
let silentFailedAt = 0;
let pending: Promise<string> | null = null;

/** interactive=true opens Google's sign-in popup (needs a user tap); otherwise tries to renew silently (at most one attempt at a time). */
export async function getToken(interactive: boolean): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  if (!interactive && Date.now() - silentFailedAt < SILENT_COOLDOWN) throw new AuthRequired();
  if (pending) return pending;
  const clientId = getConfig().googleClientId.trim();
  if (!clientId) throw new Error('Google client ID not set (Settings → Sync & data)');
  pending = (async () => {
    const google = await loadGis();
    return new Promise<string>((resolve, reject) => {
      const fail = (m?: string) => { if (!interactive) silentFailedAt = Date.now(); reject(new AuthRequired(m)); };
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        login_hint: getUser()?.email || undefined,
        callback: (r: any) => {
          if (r.error || !r.access_token) return fail(r.error_description ?? r.error);
          setToken({ value: r.access_token, exp: Date.now() + Number(r.expires_in) * 1000 });
          silentFailedAt = 0;
          localStorage.setItem(connectedKey(), '1');
          resolve(r.access_token);
        },
        error_callback: () => fail(),
      });
      client.requestAccessToken({ prompt: interactive ? '' : 'none' });
    });
  })().finally(() => { pending = null; });
  return pending;
}

async function call(path: string, init: RequestInit, interactive: boolean, retried = false): Promise<Response> {
  const t = await getToken(interactive);
  let res: Response;
  try { res = await fetch(path, { ...init, headers: { ...init.headers, Authorization: `Bearer ${t}` } }); }
  catch { throw new Offline(); }
  if (res.status === 401 && !retried) { setToken(null); return call(path, init, interactive, true); }
  if (res.status === 401) throw new AuthRequired();
  if (!res.ok) throw new Error(`Drive ${res.status}: ${await res.text()}`);
  return res;
}

export interface RemoteFile { id: string; version: string; modifiedTime: string }

export async function findVault(interactive: boolean): Promise<RemoteFile | null> {
  const q = encodeURIComponent(`name='${FILE_NAME}' and trashed=false`);
  const res = await call(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,version,modifiedTime)`, {}, interactive);
  const files = ((await res.json()).files ?? []) as RemoteFile[];
  return files[0] ?? null;
}

export async function downloadVault(id: string, interactive: boolean): Promise<Uint8Array> {
  const res = await call(`https://www.googleapis.com/drive/v3/files/${id}?alt=media`, {}, interactive);
  return new Uint8Array(await res.arrayBuffer());
}

export async function uploadVault(bytes: Uint8Array, existingId: string | null, interactive: boolean): Promise<RemoteFile> {
  const fields = 'id,version,modifiedTime';
  if (existingId) {
    const res = await call(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media&fields=${fields}`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes as BodyInit }, interactive);
    return res.json();
  }
  const boundary = `b${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name: FILE_NAME, parents: ['appDataFolder'] });
  const enc = new TextEncoder();
  const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`);
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
  const res = await call(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${fields}`,
    { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }, interactive);
  return res.json();
}
