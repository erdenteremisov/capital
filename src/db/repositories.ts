import type { Account, AppState, Category, Debt, Goal, IncomeSource, RecurringPayment, Settings, Transaction } from '../types/models.ts';
import { STATE_VERSION, createEmptyState } from '../types/models.ts';
import type { StoreBackend, StoreName } from './database.ts';
const repo = <T>(b: StoreBackend, n: StoreName) => ({ all: () => b.getAll(n) as Promise<T[]>, replaceAll: (x: T[]) => b.replaceMany({ [n]: x }) });
export const createRepositories = (b: StoreBackend) => ({
  accounts: repo<Account>(b, 'accounts'), transactions: repo<Transaction>(b, 'transactions'), categories: repo<Category>(b, 'categories'), goals: repo<Goal>(b, 'goals'),
  recurringPayments: repo<RecurringPayment>(b, 'recurringPayments'), incomeSources: repo<IncomeSource>(b, 'incomeSources'), debts: repo<Debt>(b, 'debts'), settings: repo<Settings>(b, 'settings'),
});
export type Repositories = ReturnType<typeof createRepositories>;
export async function loadState(b: StoreBackend): Promise<AppState> {
  const r = createRepositories(b), e = createEmptyState();
  const [accounts, transactions, categories, goals, recurringPayments, incomeSources, debts, settings] = await Promise.all([r.accounts.all(), r.transactions.all(), r.categories.all(), r.goals.all(), r.recurringPayments.all(), r.incomeSources.all(), r.debts.all(), r.settings.all()]);
  return { version: STATE_VERSION, settings: settings[0] ?? e.settings, accounts, transactions, categories: categories.length ? categories : e.categories, goals, recurringPayments, incomeSources, debts };
}
export const saveState = (b: StoreBackend, s: AppState): Promise<void> => b.replaceMany({ accounts: s.accounts, transactions: s.transactions, categories: s.categories, goals: s.goals, recurringPayments: s.recurringPayments, incomeSources: s.incomeSources, debts: s.debts, settings: [s.settings] });
