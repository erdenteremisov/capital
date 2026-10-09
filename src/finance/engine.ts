import type { Account, AppState, Goal, IncomeSource, Iso, RecurringPayment, Transaction } from '../types/models.ts';
import { addMonths, diffDays, monthsPerPeriod, nextDate, prevDate } from './dates.ts';
export const fin = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

export const calculateTotalCapital = (a: Account[]): number => a.filter(x => x.includeInCapital).reduce((s, x) => s + x.balance, 0);
export const calculateNetCapital = (s: AppState): number => calculateTotalCapital(s.accounts) - s.debts.filter(d => d.includeInNetCapital).reduce((q, d) => q + d.amount, 0);
export function calculateMonth(tx: Transaction[], ym: string) { let income = 0, expense = 0; for (const t of tx) if (t.date.startsWith(ym)) { if (t.type === 'income') income += t.amount; else if (t.type === 'expense') expense += t.amount; } return { income, expense, result: income - expense }; }
export const monthlyEquivalent = (p: Pick<RecurringPayment, 'amount' | 'frequency'>): number => Math.round(fin(({ weekly: p.amount * 52 / 12, monthly: p.amount, quarterly: p.amount / 3, yearly: p.amount / 12 } as Record<string, number>)[p.frequency]));
/** Рекомендуемый резерв: только для редких платежей; это НЕ расход. */
export const recommendedReserve = (p: RecurringPayment): number => (p.frequency === 'yearly' || p.frequency === 'quarterly') ? monthlyEquivalent(p) : 0;
export const calculateMandatoryMonthly = (s: AppState): number => s.recurringPayments.filter(p => p.isMandatory).reduce((q, p) => q + monthlyEquivalent(p), 0);

/** Даты платежа в [from, to] включительно. */
export function occurrences(p: { nextDate: Iso; frequency: string }, from: Iso, to: Iso): Iso[] { let d: Iso | null = p.nextDate, n = 0; const out: Iso[] = []; while (d && d < from && n++ < 600) d = nextDate(d, p.frequency); while (d && d <= to && n++ < 600) { out.push(d); d = nextDate(d, p.frequency); } return out; }
export function nextIncome(s: AppState, today: Iso): { date: Iso; source: IncomeSource } | null {
  let best: { date: Iso; source: IncomeSource } | null = null;
  for (const x of s.incomeSources) { if (!x.isRegular || !x.nextDate || x.frequency === 'irregular') continue; let d: Iso | null = x.nextDate, n = 0; while (d && d <= today && n++ < 600) d = nextDate(d, x.frequency); if (d && (!best || d < best.date)) best = { date: d, source: x }; }
  return best;
}
/** Обязательства в [from, end]. incomeDay=true: end — день дохода; платёж с paidAfterIncome в этот день не входит (по умолчанию входит — консервативно). */
export function obligations(s: AppState, from: Iso, end: Iso, incomeDay: boolean): number {
  return s.recurringPayments.filter(p => p.isMandatory).reduce((q, p) => q + occurrences(p, from, end).filter(d => !(incomeDay && d === end && p.paidAfterIncome)).length * p.amount, 0);
}
/** Деньги целей, лежащие внутри капитала. Вычитаются один раз. */
export function goalAllocation(s: AppState): { held: number; unlinked: number; over: boolean } {
  const by: Record<string, number> = {}; let unlinked = 0, over = false;
  for (const g of s.goals) { if (!g.isActive) continue; const v = Math.max(0, fin(g.savedAmount)), a = g.accountId ? s.accounts.find(x => x.id === g.accountId) : undefined; if (!a) unlinked += v; else if (a.includeInCapital) by[a.id] = (by[a.id] || 0) + v; }
  let held = 0; for (const id in by) { const room = Math.max(s.accounts.find(a => a.id === id)!.balance, 0); held += Math.min(by[id], room); if (by[id] > room) over = true; }
  const room = Math.max(calculateTotalCapital(s.accounts) - held, 0), u = Math.min(unlinked, room); if (unlinked > room) over = true;
  return { held: held + u, unlinked: u, over };
}
export interface FreeMoney { capital: number; obligations: number; held: number; unlinkedGoalMoney: number; overAllocated: boolean; free: number; nextIncomeDate: Iso | null; source: IncomeSource | null; obligationsComplete: boolean }
/** Свободно = капитал − обязательства − отложено на цели. Без даты дохода учитываются только платежи, наступающие сегодня; obligationsComplete=false. */
export function calculateFreeMoney(s: AppState, today: Iso): FreeMoney {
  const n = nextIncome(s, today), capital = calculateTotalCapital(s.accounts), h = goalAllocation(s), ob = obligations(s, today, n ? n.date : today, !!n);
  return { capital, obligations: ob, held: h.held, unlinkedGoalMoney: h.unlinked, overAllocated: h.over, free: capital - ob - h.held, nextIncomeDate: n?.date ?? null, source: n?.source ?? null, obligationsComplete: !!n };
}
export type Spendable = { ok: false; reason: string } | ({ ok: true; days: number; planPerPeriod: number; alreadySaved: number; planReserve: number; spendable: number; perDay: number; periodStart: Iso } & FreeMoney);
/** Можно потратить = Свободно − max(0, план периода − уже отложено в этом периоде). Период — между прошлым и следующим доходом. */
export function calculateSpendable(s: AppState, today: Iso): Spendable {
  if (!s.accounts.length) return { ok: false, reason: 'Добавь хотя бы один счёт.' };
  const f = calculateFreeMoney(s, today); if (!f.nextIncomeDate || !f.source) return { ok: false, reason: 'Для расчёта «можно потратить» добавь дату следующего ожидаемого дохода.' };
  const start = prevDate(f.nextIncomeDate, f.source.frequency), m = monthsPerPeriod(f.source.frequency); let plan = 0, done = 0, res = 0;
  for (const g of s.goals) { if (!g.isActive) continue; const pc = Math.round(fin(g.monthlyContribution) * m), dn = Math.max(0, s.transactions.filter(t => t.goalId === g.id && t.date >= start && t.date <= today).reduce((q, t) => q + fin(t.goalDelta), 0)); plan += pc; done += Math.min(dn, pc); res += Math.max(0, pc - dn); }
  const sp = f.free - res, days = Math.max(1, diffDays(today, f.nextIncomeDate));
  return { ok: true, ...f, days, planPerPeriod: plan, alreadySaved: done, planReserve: res, spendable: sp, perDay: sp > 0 ? Math.floor(sp / days) : 0, periodStart: start };
}
export const calculateSavings = (income: number, expense: number) => income - expense;
export const calculateSavingsRate = (income: number, expense: number): number | null => income > 0 ? (income - expense) / income * 100 : null;
export function averageSaving(s: AppState, today: Iso): { income: number; expense: number; result: number; months: number } | null {
  const first = today.slice(0, 8) + '01', L = []; for (let k = 1; k <= 6; k++) { const ym = addMonths(first, -k).slice(0, 7); if (s.transactions.some(x => x.date.startsWith(ym) && x.type !== 'transfer')) L.push(calculateMonth(s.transactions, ym)); }
  const u = L.slice(0, 3); if (u.length < 2) return null; const a = (k: 'income' | 'expense' | 'result') => Math.round(u.reduce((q, x) => q + x[k], 0) / u.length); return { income: a('income'), expense: a('expense'), result: a('result'), months: u.length };
}
export const calculateGoalProgress = (g: Goal): number => g.targetAmount > 0 ? Math.max(0, Math.min(100, g.savedAmount / g.targetAmount * 100)) : 0;
export const monthsLeft = (g: Goal, today: Iso): number | null => g.targetDate ? Math.max(0, Math.ceil(diffDays(today, g.targetDate) / 30.44)) : null;
export function calculateRequiredMonthlyContribution(g: Goal, today: Iso): number | null { const m = monthsLeft(g, today), rem = Math.max(0, g.targetAmount - g.savedAmount); return m === null || m < 1 ? null : Math.ceil(rem / m); }
export function calculateGoalForecast(g: Goal, rate: number, today: Iso): { ok: false } | { ok: true; done: true } | { ok: true; done: false; months: number; date: Iso } {
  const rem = g.targetAmount - g.savedAmount; if (rem <= 0) return { ok: true, done: true }; if (!Number.isFinite(rate) || rate <= 0) return { ok: false }; const m = Math.ceil(rem / rate); return { ok: true, done: false, months: m, date: addMonths(today, m) };
}
export function calculateCapitalForecast(s: AppState, today: Iso, months: number): number | null { const a = averageSaving(s, today); return a ? calculateTotalCapital(s.accounts) + a.result * months : null; }
export function calculateEmergencyFundCoverage(g: Goal, s: AppState): number | null { const m = calculateMandatoryMonthly(s); return m > 0 ? g.savedAmount / m : null; }
export type Status = { level: 'green' | 'yellow' | 'red'; title: string; why: string } | null;
export function calculateFinancialStatus(s: AppState, today: Iso): Status {
  const sp = calculateSpendable(s, today), a = averageSaving(s, today), f = calculateFreeMoney(s, today);
  if (!s.accounts.length || (!sp.ok && !a)) return null;
  if (f.free < 0) return { level: 'red', title: 'Нужна осторожность', why: 'После обязательных платежей и денег, отложенных на цели, не остаётся свободных денег: придётся трогать накопления.' };
  if (sp.ok && sp.spendable < 0) return { level: 'yellow', title: 'Требует внимания', why: 'Свободные деньги есть, но их не хватает, чтобы сохранить плановое накопление до следующего дохода.' };
  if (a && a.result < 0) return { level: 'yellow', title: 'Требует внимания', why: 'В среднем за последние месяцы расходы выше доходов.' };
  const g = s.goals.find(x => x.isActive), rq = g ? calculateRequiredMonthlyContribution(g, today) : null; if (a && rq && a.result < rq) return { level: 'yellow', title: 'Требует внимания', why: 'Текущий темп накопления ниже необходимого для цели.' };
  return { level: 'green', title: 'Стабильно', why: a ? 'Расходы в среднем ниже доходов, платежи покрываются.' : 'Платежи до следующего дохода покрываются.' };
}
