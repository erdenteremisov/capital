export type Id = string;
export type Iso = string; // YYYY-MM-DD
export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom' | 'irregular';
/** Все суммы — целые числа в копейках. */
export interface Settings { id: 'main'; currency: string; locale: string; theme: 'dark' | 'light' | 'system'; onboardingCompleted: boolean; createdAt: string; updatedAt: string }
export interface Account { id: Id; name: string; type: 'bank' | 'cash' | 'savings' | 'investment' | 'other'; balance: number; includeInCapital: boolean; createdAt: string; updatedAt: string }
export interface Debt { id: Id; name: string; amount: number; monthlyPayment?: number; dueDate?: Iso; includeInNetCapital: boolean; createdAt: string; updatedAt: string }
export interface Category { id: Id; name: string }
export interface Transaction {
  id: Id; date: Iso; type: 'income' | 'expense' | 'transfer'; amount: number; accountId: Id; targetAccountId?: Id; categoryId?: Id;
  /** undefined = цель не выбрана; null = пользователь явно выбрал «не относится к цели»; id = цель, которую затрагивает операция */
  goalId?: Id | null;
  /** фактическое изменение savedAmount цели (со знаком); нужно, чтобы правка/удаление не давали двойного учёта */
  goalDelta?: number;
  description?: string; createdAt: string; updatedAt: string;
}
export interface IncomeSource { id: Id; name: string; amount: number; frequency: Frequency; nextDate?: Iso; isRegular: boolean; minimumExpectedAmount?: number; createdAt: string; updatedAt: string }
export interface RecurringPayment {
  id: Id; name: string; amount: number; frequency: Frequency; nextDate: Iso; categoryId?: Id; isMandatory: boolean;
  /** true: в день дохода платёж списывается ПОСЛЕ поступления дохода и в период до дохода не входит. По умолчанию (false) — консервативно входит. */
  paidAfterIncome?: boolean; createdAt: string; updatedAt: string;
}
export interface Goal {
  id: Id; name: string; targetAmount: number;
  /** уже отложено: реальные деньги, входят в капитал */
  savedAmount: number;
  /** счёт, где физически лежат деньги цели */
  accountId?: Id; targetDate?: Iso;
  /** план на будущее: из капитала не вычитается */
  monthlyContribution?: number; priority?: number; isActive: boolean; createdAt: string; updatedAt: string;
}
export interface AppState { version: number; settings: Settings; accounts: Account[]; transactions: Transaction[]; categories: Category[]; goals: Goal[]; recurringPayments: RecurringPayment[]; incomeSources: IncomeSource[]; debts: Debt[] }
export const STATE_VERSION = 2;
const CATS = ['Продукты', 'Жильё', 'Транспорт', 'Здоровье', 'Образование', 'Развлечения', 'Подписки', 'Покупки', 'Связь', 'Другое'];
export function createEmptyState(): AppState {
  const n = new Date().toISOString();
  return { version: STATE_VERSION, settings: { id: 'main', currency: 'RUB', locale: 'ru-RU', theme: 'dark', onboardingCompleted: false, createdAt: n, updatedAt: n },
    accounts: [], transactions: [], categories: CATS.map((name, i) => ({ id: 'c' + (i + 1), name })), goals: [], recurringPayments: [], incomeSources: [], debts: [] };
}
