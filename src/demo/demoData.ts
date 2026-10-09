import type { AppState, Iso } from '../types/models.ts';
import { createEmptyState } from '../types/models.ts';
import { addMonths, parseIso } from '../finance/dates.ts';
/** Демо-набор. Полностью отделён от пользовательских данных: загружается только по кнопке. */
export function createDemoState(today: Iso): AppState {
  const s = createEmptyState(), n = new Date().toISOString(), K = (r: number) => r * 100, f = today.slice(0, 8) + '01'; let x = 7; const rnd = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  const day = (d: number) => addMonths(f, parseIso(today).getDate() > d ? 1 : 0).slice(0, 8) + String(d).padStart(2, '0');
  s.accounts = [['Основная карта', 'bank', 185000], ['Накопления', 'savings', 220000], ['Наличные', 'cash', 22500]].map((a, i) => ({ id: 'd' + i, name: a[0] as string, type: a[1] as any, balance: K(a[2] as number), includeInCapital: true, createdAt: n, updatedAt: n }));
  s.incomeSources = [{ id: 'di', name: 'Основная работа', amount: K(180000), frequency: 'monthly', nextDate: day(20), isRegular: true, createdAt: n, updatedAt: n }];
  s.recurringPayments = [['Аренда', 40000, 'monthly', 10], ['Обучение', 16000, 'monthly', 15], ['Интернет', 1200, 'monthly', 20], ['Страховка', 24000, 'yearly', 0]].map((p, i) => ({ id: 'dp' + i, name: p[0] as string, amount: K(p[1] as number), frequency: p[2] as any, nextDate: p[3] ? day(p[3] as number) : addMonths(today, 5), isMandatory: true, createdAt: n, updatedAt: n }));
  s.goals = [{ id: 'dg', name: 'Подушка безопасности', targetAmount: K(600000), savedAmount: K(220000), accountId: 'd1', targetDate: addMonths(today, 7), monthlyContribution: K(25000), priority: 1, isActive: true, createdAt: n, updatedAt: n }];
  const add = (date: string, type: 'income' | 'expense', amount: number, categoryId?: string, description?: string) => { if (date <= today) s.transactions.push({ id: 'dt' + s.transactions.length, date, type, amount: K(amount), accountId: 'd0', categoryId, description, createdAt: n, updatedAt: n }); };
  for (let k = 5; k >= 0; k--) { const m = addMonths(f, -k).slice(0, 8); add(m + '20', 'income', 180000); add(m + '10', 'expense', 40000, 'c2', 'Аренда'); add(m + '15', 'expense', 16000, 'c5', 'Обучение'); add(m + '20', 'expense', 1200, 'c9', 'Интернет'); for (let j = 0; j < 6; j++) add(m + String(2 + j * 4).padStart(2, '0'), 'expense', Math.round(1500 + rnd() * 3500), 'c1'); add(m + '08', 'expense', Math.round(3000 + rnd() * 3000), 'c3'); add(m + '22', 'expense', Math.round(2000 + rnd() * 7000), 'c6'); }
  return s;
}
