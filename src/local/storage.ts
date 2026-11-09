/** IndexedDB persistence for the local database copy and sync metadata. One database per signed-in user (see auth.ts). */
import { dbName } from './auth';
const STORE = 'kv';

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName(), 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function kvGet<T>(key: string): Promise<T | undefined> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const r = d.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result as T | undefined);
    r.onerror = () => reject(r.error);
  });
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).put(value, key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
export async function kvDel(key: string): Promise<void> {
  const d = await idb();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, 'readwrite');
    t.objectStore(STORE).delete(key);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export interface SyncMeta { baseVersion: string | null; dirty: boolean; lastSynced: number | null; fileId: string | null }
export const META_DEFAULT: SyncMeta = { baseVersion: null, dirty: false, lastSynced: null, fileId: null };
export const loadMeta = async () => ({ ...META_DEFAULT, ...(await kvGet<SyncMeta>('meta')) });
export const saveMeta = (m: SyncMeta) => kvSet('meta', m);
export const loadDbBytes = () => kvGet<Uint8Array>('db');
export const saveDbBytes = (b: Uint8Array) => kvSet('db', b);

/** Safety copies of the local database taken just before it is overwritten by the Drive version (last 5). */
export async function pushBackup(bytes: Uint8Array) {
  const list = (await kvGet<{ at: number; bytes: Uint8Array }[]>('backups')) ?? [];
  await kvSet('backups', [{ at: Date.now(), bytes }, ...list].slice(0, 5));
}
export const listBackups = async () => (await kvGet<{ at: number; bytes: Uint8Array }[]>('backups')) ?? [];

/** The database exactly as last synced with Drive: the common ancestor for the three-way merge. */
export const loadBase = () => kvGet<Uint8Array>('base');
export const saveBase = (b: Uint8Array) => kvSet('base', b);
