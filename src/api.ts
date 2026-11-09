import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from './lib/toast';
import { apiFetch } from './local/routes';
import type { DepositRow, Holding, HoldingSnapshot, AnyExpense, Snapshot, YearExpense, AccountBalance, Category, CreditCard, MonthDetail, MonthSummary, Person, Room, Settings, WealthYear } from './lib/types';

async function j<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await apiFetch(url, init);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
const send = (method: string, body?: unknown) => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

const q = <T,>(key: string, url: string) => () => useQuery({ queryKey: [key], queryFn: () => j<T>(url) });
export const usePeople = q<Person[]>('people', '/api/people');
export const useCategories = q<Category[]>('categories', '/api/categories');
export const useMonths = q<MonthSummary[]>('months', '/api/months');
export const useSettings = q<Settings>('settings', '/api/settings');
export const useWealth = q<WealthYear[]>('wealth', '/api/wealth');
export const useAccounts = q<AccountBalance[]>('accounts', '/api/accounts');
export const useHoldings = q<Holding[]>('holdings', '/api/holdings');
export const useCards = q<CreditCard[]>('cards', '/api/cards');
export const useRooms = q<Room[]>('rooms', '/api/rooms');
export const useAllExpenses = q<AnyExpense[]>('all-expenses', '/api/expenses');
export const useAccountHistory = q<Snapshot[]>('account-history', '/api/account-history');
export const useHoldingHistory = q<HoldingSnapshot[]>('holding-history', '/api/holding-history');
export const useDeposits = q<DepositRow[]>('deposits', '/api/investment-deposits');
export const useYearExpenses = (y: number) =>
  useQuery({ queryKey: ['expenses', y], queryFn: () => j<YearExpense[]>(`/api/expenses/${y}`) });
export const useMonth = (y: number, m: number) =>
  useQuery({ queryKey: ['month', y, m], queryFn: () => j<MonthDetail>(`/api/months/${y}/${m}`) });

/** Mutation that invalidates everything afterwards (data is small, simplicity wins). */
export function useSave<B>(method: string, url: string | ((b: B) => string), okMessage: string | null = 'Saved') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: B) => j<unknown>(typeof url === 'function' ? url(b) : url, send(method, b)),
    onSuccess: () => { qc.invalidateQueries(); if (okMessage) toast(okMessage); },
    onError: (e: Error) => toast(`Could not save: ${e.message}`, 'error'),
  });
}
export function useDelete(url: (id: number) => string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: number) => j<unknown>(url(id), send('DELETE')), onSuccess: () => qc.invalidateQueries() });
}
