/**
 * Vault format (what is stored in Google Drive):  "FPV1" | salt(16) | iv(12) | AES-GCM ciphertext of the SQLite file.
 * Key = PBKDF2-SHA256(passphrase, salt, 600k). The salt is fixed per vault so a derived key can be cached on a trusted device
 * (as a non-extractable CryptoKey in IndexedDB) and the passphrase is only typed once per device. Every save uses a fresh IV.
 */
const MAGIC = new TextEncoder().encode('FPV1');
const ITER = 600_000;
const subtle = () => globalThis.crypto.subtle;

export const newSalt = () => globalThis.crypto.getRandomValues(new Uint8Array(16));

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: ITER, hash: 'SHA-256' }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(plain: Uint8Array, key: CryptoKey, salt: Uint8Array): Promise<Uint8Array> {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain as BufferSource));
  const out = new Uint8Array(MAGIC.length + 16 + 12 + ct.length);
  out.set(MAGIC); out.set(salt, MAGIC.length); out.set(iv, MAGIC.length + 16); out.set(ct, MAGIC.length + 28);
  return out;
}

export function readSalt(vault: Uint8Array): Uint8Array {
  if (vault.length < MAGIC.length + 28 || !MAGIC.every((b, i) => vault[i] === b)) throw new Error('Not a Planner vault file');
  return vault.slice(MAGIC.length, MAGIC.length + 16);
}

export class WrongPassphrase extends Error { constructor() { super('Wrong passphrase'); } }

export async function open(vault: Uint8Array, key: CryptoKey): Promise<Uint8Array> {
  readSalt(vault);
  const iv = vault.slice(MAGIC.length + 16, MAGIC.length + 28);
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv }, key, vault.slice(MAGIC.length + 28)));
  } catch { throw new WrongPassphrase(); }
}
