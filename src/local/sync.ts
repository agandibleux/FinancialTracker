/**
 * Local-first storage + encrypted sync.
 *
 * - The working copy of the database lives in this browser (IndexedDB) and every edit is saved there immediately.
 * - If Drive sync is on, the same file is encrypted with your passphrase and kept in the app's hidden Drive folder.
 * - Two-way sync: we remember which Drive version our copy is based on (and keep that copy as the merge base).
 *   Drive unchanged → push; only Drive changed → pull; both changed (edits on two devices before they met) → three-way merge
 *   row by row (see merge.ts), then push the merged result. Devices also re-check Drive every minute and when you return to the app.
 */
import { exportDb, hasDb, openDb, setWriteHook } from './db';
import { mergeDatabases } from './merge';
import { deriveKey, newSalt, open, readSalt, seal, WrongPassphrase } from './crypto';
import { AuthRequired, Offline, disconnect, downloadVault, findVault, getToken, uploadVault, wasConnected } from './drive';
import { META_DEFAULT, kvDel, kvGet, kvSet, loadBase, loadDbBytes, loadMeta, pushBackup, saveBase, saveDbBytes, saveMeta, type SyncMeta } from './storage';

export type Status = 'local' | 'idle' | 'syncing' | 'offline' | 'auth' | 'locked' | 'conflict' | 'error';
export interface SyncState {
  phase: 'booting' | 'welcome' | 'ready';
  status: Status;
  message: string;
  lastSynced: number | null;
  dirty: boolean;
  /** true when this device is linked to a Drive vault */
  linked: boolean;
}

let state: SyncState = { phase: 'booting', status: 'local', message: '', lastSynced: null, dirty: false, linked: false };
const subs = new Set<() => void>();
const set = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; subs.forEach(f => f()); };
export const getState = () => state;
export const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const replacedSubs = new Set<() => void>();
/** fired when the database was swapped for another copy (pull / import) so cached queries must reload */
export const onReplaced = (f: () => void) => { replacedSubs.add(f); return () => { replacedSubs.delete(f); }; };

let meta: SyncMeta = { ...META_DEFAULT };
let keyBundle: { key: CryptoKey; salt: Uint8Array } | null = null;
let writeSeq = 0;

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- boot ----------
export async function boot() {
  setWriteHook(onWrite);
  meta = await loadMeta();
  const bytes = await loadDbBytes();
  const stored = await kvGet<{ key: CryptoKey; salt: Uint8Array }>('key');
  if (stored) keyBundle = stored;
  const linked = !!meta.fileId || wasConnected();
  if (!bytes) { set({ phase: 'welcome', linked }); return; }
  await openDb(bytes);
  set({ phase: 'ready', dirty: meta.dirty, lastSynced: meta.lastSynced, linked, status: linked ? 'idle' : 'local' });
  startListeners();
  if (linked) void syncNow(false);
}

// ---------- local persistence ----------
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let syncTimer: ReturnType<typeof setTimeout> | undefined;

function onWrite() {
  writeSeq++;
  meta.dirty = true;
  set({ dirty: true });
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void flushLocal(), 300);
  if (state.linked) { clearTimeout(syncTimer); syncTimer = setTimeout(() => void syncNow(false), 4000); }
}

async function flushLocal() {
  clearTimeout(persistTimer);
  if (!hasDb()) return;
  await saveDbBytes(exportDb());
  await saveMeta(meta);
}

/** Replace the working database with other bytes (import / pull). */
async function adopt(bytes: Uint8Array) {
  await openDb(bytes);
  await saveDbBytes(bytes);
  replacedSubs.forEach(f => f());
}

// ---------- onboarding ----------
export async function startFresh() {
  await openDb();
  meta = { ...META_DEFAULT, dirty: true };
  await flushLocal();
  set({ phase: 'ready', status: 'local', dirty: true, linked: false });
  startListeners();
}

export async function importFile(bytes: Uint8Array) {
  const header = new TextDecoder().decode(bytes.slice(0, 15));
  if (header !== 'SQLite format 3') throw new Error('That is not a SQLite database file (expected finance.db)');
  await adopt(bytes);
  meta = { ...meta, dirty: true };
  await flushLocal();
  set({ phase: 'ready', dirty: true, status: state.linked ? 'idle' : 'local' });
  if (state.linked) void syncNow(false);
  startListeners();
}

let listening = false;
function startListeners() {
  if (listening) return;
  listening = true;
  window.addEventListener('online', () => void syncNow(false));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(false); });
  window.addEventListener('pagehide', () => { if (meta.dirty) void flushLocal(); });
  setInterval(() => { if (document.visibilityState === 'visible') void syncNow(false); }, 60_000);
}

async function rememberKey(remember: boolean) {
  if (remember && keyBundle) await kvSet('key', keyBundle); else await kvDel('key');
}

/** New device: sign in, download the vault, decrypt with the passphrase. */
export async function restoreFromDrive(passphrase: string, remember: boolean) {
  set({ status: 'syncing', message: 'Connecting to Google Drive…' });
  try {
    await getToken(true);
    const remote = await findVault(true);
    if (!remote) throw new Error('No vault found in this Google account yet. Set one up from a device that has your data first.');
    const vault = await downloadVault(remote.id, true);
    const salt = readSalt(vault);
    const key = await deriveKey(passphrase, salt);
    const bytes = await open(vault, key);
    keyBundle = { key, salt };
    await rememberKey(remember);
    await adopt(bytes);
    await saveBase(bytes);
    meta = { baseVersion: remote.version, dirty: false, lastSynced: Date.now(), fileId: remote.id };
    await saveMeta(meta);
    set({ phase: 'ready', status: 'idle', message: '', dirty: false, lastSynced: meta.lastSynced, linked: true });
    startListeners();
  } catch (e) {
    set({ status: 'local', message: errText(e) });
    throw e;
  }
}

/** Existing device with data: link it to Drive. Creates the vault, or (if one exists) verifies the passphrase and flags a conflict. */
export async function enableSync(passphrase: string, remember: boolean) {
  set({ status: 'syncing', message: 'Connecting to Google Drive…' });
  try {
    await getToken(true);
    const remote = await findVault(true);
    if (remote) {
      const vault = await downloadVault(remote.id, true);
      const salt = readSalt(vault);
      const key = await deriveKey(passphrase, salt);
      await open(vault, key); // throws WrongPassphrase
      keyBundle = { key, salt };
      await rememberKey(remember);
      meta = { ...meta, fileId: remote.id, baseVersion: null };
      set({ linked: true, status: 'conflict', message: 'Drive already has a vault. Merge it with this device’s data, or pick one.' });
      return;
    }
    const salt = newSalt();
    keyBundle = { key: await deriveKey(passphrase, salt), salt };
    await rememberKey(remember);
    meta = { ...meta, fileId: null, baseVersion: null, dirty: true };
    set({ linked: true, status: 'idle', message: '' });
    await syncNow(true);
  } catch (e) {
    set({ status: state.linked ? 'idle' : 'local', message: errText(e) });
    throw e;
  }
}

/** Device is linked but has no cached key (cleared browser data): ask for the passphrase again. */
export async function unlock(passphrase: string, remember: boolean) {
  const remote = await findVault(true);
  if (!remote) throw new Error('Vault not found in Drive');
  const vault = await downloadVault(remote.id, true);
  const salt = readSalt(vault);
  const key = await deriveKey(passphrase, salt);
  await open(vault, key);
  keyBundle = { key, salt };
  await rememberKey(remember);
  set({ status: 'idle', message: '' });
  await syncNow(true);
}

export async function unlink() {
  disconnect();
  keyBundle = null;
  await kvDel('key');
  meta = { ...meta, fileId: null, baseVersion: null };
  await saveMeta(meta);
  set({ linked: false, status: 'local', message: '' });
}

// ---------- sync ----------
let running = false;
let again = false;

/** interactive=true is only passed from a button tap (Google may open a popup). */
export async function syncNow(interactive: boolean) {
  if (!state.linked || state.phase !== 'ready' || state.status === 'conflict') return;
  if (!keyBundle) { set({ status: 'locked', message: 'Enter your passphrase to sync on this device' }); return; }
  if (!navigator.onLine) { set({ status: 'offline', message: '' }); return; }
  if (running) { again = true; return; }
  running = true;
  set({ status: 'syncing', message: '' });
  try {
    await flushLocal();
    const remote = await findVault(interactive);
    const { key, salt } = keyBundle;
    if (!remote) {
      await push(null, key, salt, interactive);
    } else if (remote.version === meta.baseVersion) {
      if (meta.dirty) await push(remote.id, key, salt, interactive, remote.version);
    } else if (!meta.dirty && meta.baseVersion) {
      const seq = writeSeq;
      const bytes = await open(await downloadVault(remote.id, interactive), key);
      if (writeSeq === seq) await adoptRemote(bytes, remote.version, remote.id);
      else await mergeAndPush(bytes, remote.id, remote.version, key, salt, interactive); // edited while downloading
    } else {
      const bytes = await open(await downloadVault(remote.id, interactive), key);
      await mergeAndPush(bytes, remote.id, remote.version, key, salt, interactive);
    }
    meta.lastSynced = Date.now();
    await saveMeta(meta);
    set({ status: 'idle', message: '', lastSynced: meta.lastSynced, dirty: meta.dirty });
  } catch (e) {
    if (e instanceof Raced) { again = true; set({ status: 'idle', message: '' }); }
    else if (e instanceof Offline) set({ status: 'offline', message: '' });
    else if (e instanceof AuthRequired) set({ status: 'auth', message: 'Tap Reconnect to renew Google access' });
    else if (e instanceof WrongPassphrase) { keyBundle = null; await kvDel('key'); set({ status: 'locked', message: 'Passphrase no longer matches the vault' }); }
    else set({ status: 'error', message: errText(e) });
  } finally {
    running = false;
    if (again) { again = false; if (state.status === 'idle') setTimeout(() => void syncNow(false), 500); }
  }
}

class Raced extends Error {}

/** `expect`: the Drive version we based this upload on; if Drive moved meanwhile (another device synced) we back off and redo the sync. */
async function push(fileId: string | null, key: CryptoKey, salt: Uint8Array, interactive: boolean, expect?: string) {
  if (fileId && expect) { const cur = await findVault(interactive); if (cur?.version !== expect) throw new Raced(); }
  const seq = writeSeq;
  const snapshot = exportDb();
  const vault = await seal(snapshot, key, salt);
  const res = await uploadVault(vault, fileId, interactive);
  await saveBase(snapshot);
  meta.fileId = res.id;
  meta.baseVersion = res.version;
  meta.dirty = writeSeq !== seq; // edited while uploading → still dirty
  await saveMeta(meta);
}

async function adoptRemote(bytes: Uint8Array, version: string, fileId: string) {
  await adopt(bytes);
  await saveBase(bytes);
  meta.baseVersion = version;
  meta.fileId = fileId;
  meta.dirty = false;
  await saveMeta(meta);
}

/** Both sides changed: merge Drive's copy into ours, adopt the result and upload it. */
async function mergeAndPush(remoteBytes: Uint8Array, fileId: string, version: string, key: CryptoKey, salt: Uint8Array, interactive: boolean) {
  const local = exportDb();
  await pushBackup(local); // safety net: the pre-merge copy of this device
  const merged = await mergeDatabases(await loadBase() ?? null, local, remoteBytes);
  await adopt(merged);
  await push(fileId, key, salt, interactive, version);
}

/** Both sides changed: keep this device's copy (overwrites Drive) or take Drive's (this device's copy is kept as a local safety backup). */
export async function resolveConflict(keep: 'merge' | 'mine' | 'drive') {
  if (!keyBundle) return;
  const remote = await findVault(true);
  const { key, salt } = keyBundle;
  try {
    set({ status: 'syncing', message: '' });
    if (keep === 'mine') {
      await push(remote?.id ?? null, key, salt, true);
    } else {
      if (!remote) throw new Error('Drive vault not found');
      const bytes = await open(await downloadVault(remote.id, true), key);
      if (keep === 'merge') {
        await mergeAndPush(bytes, remote.id, remote.version, key, salt, true);
      } else {
        await pushBackup(exportDb());
        await adoptRemote(bytes, remote.version, remote.id);
      }
    }
    meta.lastSynced = Date.now();
    await saveMeta(meta);
    set({ status: 'idle', message: '', lastSynced: meta.lastSynced, dirty: meta.dirty });
  } catch (e) {
    set({ status: 'conflict', message: errText(e) });
  }
}

/** Download the current database as an unencrypted SQLite file (same format as data/finance.db). */
export function exportFile(): Blob {
  return new Blob([exportDb() as BlobPart], { type: 'application/x-sqlite3' });
}
