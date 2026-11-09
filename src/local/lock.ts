/**
 * Optional device passcode. When on, the app asks for it when opened and after being in the background for 5 minutes,
 * so someone holding your unlocked phone or computer still can't read your finances. It is checked locally against an
 * encrypted token (never stored or sent anywhere) and is independent from the Drive vault passphrase.
 */
import { deriveKey, newSalt, open, readSalt, seal, WrongPassphrase } from './crypto';
import { userKey } from './auth';
import { kvDel, kvGet, kvSet } from './storage';

const flag = () => userKey('planner-applock');
const IDLE_MS = 5 * 60_000;
export const lockEnabled = () => localStorage.getItem(flag()) === '1';

let locked = lockEnabled();
const subs = new Set<() => void>();
const setLocked = (v: boolean) => { locked = v; subs.forEach(f => f()); };
export const isLocked = () => locked;
export const subscribeLock = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

const TOKEN = new TextEncoder().encode('planner-unlocked');

export async function enableLock(passcode: string) {
  const salt = newSalt();
  await kvSet('lockcheck', await seal(TOKEN, await deriveKey(passcode, salt), salt));
  localStorage.setItem(flag(), '1');
  setLocked(false);
}
export async function disableLock() { await kvDel('lockcheck'); localStorage.removeItem(flag()); setLocked(false); }

export async function unlockApp(passcode: string) {
  const check = await kvGet<Uint8Array>('lockcheck');
  if (!check) { localStorage.removeItem(flag()); setLocked(false); return; }
  try { await open(check, await deriveKey(passcode, readSalt(check))); } catch { throw new WrongPassphrase(); }
  setLocked(false);
}

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') hiddenAt = Date.now();
  else if (lockEnabled() && hiddenAt && Date.now() - hiddenAt > IDLE_MS) setLocked(true);
});
