import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { deriveKey, newSalt, open, readSalt, seal, WrongPassphrase } from './crypto';
import { exportDb, openDb } from './db';
import { dispatch } from './routes';

const wasm = readFileSync('node_modules/sql.js/dist/sql-wasm.wasm');

describe('vault crypto', () => {
  it('round-trips and rejects a wrong passphrase', async () => {
    const salt = newSalt(), data = new TextEncoder().encode('SQLite format 3\0 hello');
    const vault = await seal(data, await deriveKey('correct horse', salt), salt);
    expect(Array.from(readSalt(vault))).toEqual(Array.from(salt));
    expect(new TextDecoder().decode(await open(vault, await deriveKey('correct horse', salt)))).toBe('SQLite format 3\0 hello');
    await expect(open(vault, await deriveKey('wrong', salt))).rejects.toBeInstanceOf(WrongPassphrase);
  });
});

describe('local api', () => {
  beforeAll(async () => { await openDb(null, wasm); });

  it('saves a month and summarises it', async () => {
    await dispatch('PUT', '/api/people', [{ name: 'Me' }]);
    const cat = (await dispatch('POST', '/api/categories', { name: 'Rent', kind: 'fixed', default_amount: 1000 })) as { id: number };
    await dispatch('PUT', '/api/months/2026/3', { note: 'n', income: [{ person_id: ((await dispatch('GET', '/api/people')) as any[])[0].id, source: 'Salary', amount: 5000 }], expenses: [{ category_id: cat.id, amount: 1200 }], savings: { to_cash: 100, to_investments: 200, note: '' } });
    const [m] = (await dispatch('GET', '/api/months')) as any[];
    expect(m).toMatchObject({ year: 2026, month: 3, income: 5000, expenses: 1200, fixed: 1200, predicted: 3800, actual: 300 });
    expect(await dispatch('GET', '/api/months/2026/3')).toMatchObject({ note: 'n', income: [{ amount: 5000 }] });
  });

  it('cascades deletes (foreign keys on) and survives export/reopen', async () => {
    const [{ id: catId }] = (await dispatch('GET', '/api/categories')) as { id: number }[];
    await dispatch('DELETE', `/api/categories/${catId}`);
    expect(await dispatch('GET', '/api/expenses')).toEqual([]);
    const bytes = exportDb();
    await openDb(bytes, wasm);
    expect(((await dispatch('GET', '/api/people')) as any[])[0].name).toBe('Me');
    // foreign_keys must still be enforced after export()
    await expect(dispatch('PUT', '/api/accounts', [{ person_id: 999, type: 'TFSA', name: 'x', balance: 1 }])).rejects.toThrow();
  });
});

describe('three-way merge', () => {
  it('keeps edits made on two devices and propagates deletes', async () => {
    const { mergeDatabases } = await import('./merge');
    await openDb(null, wasm);
    await dispatch('PUT', '/api/people', [{ name: 'Me' }]);
    const rent = (await dispatch('POST', '/api/categories', { name: 'Rent', kind: 'fixed' })) as { id: number };
    const food = (await dispatch('POST', '/api/categories', { name: 'Food', kind: 'variable' })) as { id: number };
    await dispatch('PUT', '/api/months/2026/1', { income: [{ person_id: ((await dispatch('GET', '/api/people')) as any[])[0].id, amount: 100 }], expenses: [{ category_id: rent.id, amount: 10 }] });
    const base = exportDb();

    await dispatch('PUT', '/api/months/2026/2', { expenses: [{ category_id: rent.id, amount: 20 }] }); // device A adds Feb
    await dispatch('DELETE', `/api/categories/${food.id}`);                                              // device A deletes Food
    const a = exportDb();

    await openDb(base, wasm);                                                                              // device B (from base)
    await dispatch('PUT', '/api/months/2026/3', { expenses: [{ category_id: rent.id, amount: 30 }] });    // adds Mar
    await dispatch('POST', '/api/categories', { name: 'Gym', kind: 'variable' });                         // adds Gym
    const b = exportDb();

    await openDb(await mergeDatabases(base, a, b), wasm);
    const months = ((await dispatch('GET', '/api/months')) as any[]).map(m => [m.month, m.expenses]);
    expect(months).toEqual([[1, 10], [2, 20], [3, 30]]);
    expect(((await dispatch('GET', '/api/categories')) as any[]).map(c => c.name).sort()).toEqual(['Gym', 'Rent']);
  });
});

describe('per-user namespacing', () => {
  it('derives separate keys and database names per Google account', async () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    const { getUser, userKey, dbName } = await import('./auth');
    expect(getUser()).toBeNull();
    store.set('planner-user', JSON.stringify({ sub: 'alice1', email: 'a@x.com', name: 'A' }));
    expect(userKey('planner-applock')).toBe('planner-applock:alice1');
    expect(dbName()).toBe('planner-local:alice1');
    store.set('planner-user', JSON.stringify({ sub: 'bob2', email: 'b@x.com', name: 'B' }));
    expect(dbName()).toBe('planner-local:bob2');
    store.set('planner-user', JSON.stringify({ sub: '../evil', email: '', name: '' }));
    expect(getUser()).toBeNull();
  });

  it('refuses to overwrite a month that has data with an empty save', async () => {
    await openDb(null, wasm);
    await dispatch('PUT', '/api/people', [{ name: 'Me' }]);
    const pid = ((await dispatch('GET', '/api/people')) as any[])[0].id;
    await dispatch('PUT', '/api/months/2026/11', { note: '', income: [{ person_id: pid, source: 'Salary', amount: 5000 }], expenses: [], savings: null });
    await expect(dispatch('PUT', '/api/months/2026/11', { note: '', income: [], expenses: [], savings: null })).rejects.toThrow(/empty/);
    expect(await dispatch('GET', '/api/months/2026/11')).toMatchObject({ income: [{ amount: 5000 }] });
  });
});
