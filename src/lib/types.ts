export type Kind = 'income' | 'fixed' | 'utility' | 'variable';
export type AccountType = 'TFSA' | 'RRSP' | 'FHSA' | 'NONREG' | 'CASH' | 'HOME';
export const ACCOUNT_TYPES: AccountType[] = ['CASH', 'TFSA', 'RRSP', 'NONREG', 'FHSA', 'HOME'];

/** What each account type means, in plain words. Used by Settings, Accounts and the Dashboard. */
export const ACCOUNT_META: Record<AccountType, { label: string; short: string; desc: string; color: string; group: 'Cash' | 'Investing' | 'Home' }> = {
  CASH:   { label: 'Savings account',        short: 'Cash',        desc: 'Everyday money and your emergency fund.',                       color: '#38bdf8', group: 'Cash' },
  TFSA:   { label: 'TFSA',                   short: 'TFSA',        desc: 'Tax-free investing. Withdrawals are free.',                      color: '#34d399', group: 'Investing' },
  RRSP:   { label: 'RRSP',                   short: 'RRSP',        desc: 'Retirement investing. Contributions reduce tax.',                color: '#6089bd', group: 'Investing' },
  NONREG: { label: 'Investments',            short: 'Investments', desc: 'Non-registered stocks and ETFs, no contribution limit.',         color: '#fb7185', group: 'Investing' },
  FHSA:   { label: 'House down payment',     short: 'Down payment', desc: 'FHSA: money you are saving to buy a home. Not the home itself.', color: '#fbbf24', group: 'Home' },
  HOME:   { label: 'Home equity',            short: 'Home equity', desc: 'Value of a home you own minus what you still owe on it.',        color: '#14a39e', group: 'Home' },
};
/** counts as money you can invest (excludes cash and the value of a house) */
export const isInvested = (t: AccountType) => t !== 'CASH' && t !== 'HOME';
export const REGISTERED: AccountType[] = ['TFSA', 'RRSP', 'FHSA'];

export interface Person { id: number; name: string }
export interface Category {
  id: number; name: string; kind: Exclude<Kind, 'income'>;
  parent_id: number | null; counts_as_living: number; default_amount: number; archived: number;
}
export interface IncomeEntry { person_id: number; source: string; amount: number }
export interface ExpenseEntry { category_id: number; amount: number }
export interface InvestmentDeposit { account_id: number; amount: number }
export interface SavingsActual { to_cash: number; to_investments: number; note: string; investments?: InvestmentDeposit[] }
export interface MonthDetail {
  year: number; month: number; note: string;
  income: IncomeEntry[]; expenses: ExpenseEntry[];
  savings: SavingsActual | null;
  cards?: { card_id: number; amount: number; excluded: number }[];
}
export interface CreditCard { id: number; name: string; credit_limit: number }
export interface MonthSummary {
  year: number; month: number; note: string;
  income: number; expenses: number; fixed: number; utility: number; variable: number;
  living: number; one_off?: number; predicted: number; actual: number | null;
  to_cash: number; to_investments: number;
}
export interface Ratio { account: AccountType; pct: number }
export interface Settings { emergency_months: number; ratios: Ratio[] }
export interface WealthYear {
  year: number; start_wealth: number; return_pct: number;
  monthly_contribution: number; actual_end: number | null;
}
/** One month's money added to one investing account. */
export interface DepositRow { year: number; month: number; account_id: number; amount: number }
export interface Room { person_id: number; account_type: AccountType; year: number; room: number; contributed: number }
export interface Snapshot { account_id: number; date: string; balance: number }
export interface AnyExpense { year: number; month: number; category_id: number; amount: number }
export interface YearExpense { month: number; category_id: number; amount: number }
export interface AccountBalance { id: number; person_id: number; type: AccountType; name: string; balance: number }

export interface Holding {
  id?: number; yahoo_symbol?: string | null; account_id: number; ticker: string; quote_symbol: string; info: string; sector: string;
  expense_ratio: number; yield_pct: number; shares: number; avg_price: number;
  price: number; prev_close: number; price_date: string; target_pct: number;
  usa: number; can: number; other_geo: number; stocks: number; bonds: number; other_cls: number;
}

export interface HoldingSnapshot { account_id: number; date: string; ticker: string; shares: number; price: number; avg_price: number }
