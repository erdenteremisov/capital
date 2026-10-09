import type { Account, AppState, Goal, Transaction } from '../types/models.ts';
import { formatRub } from './money.ts';
export interface Result { state: AppState; errors: string[] }
export type TxInput = Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'goalDelta'>;
export const newId = (): string => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => new Date().toISOString();
type D = Record<string, number>;
const add = (m: D, id: string | undefined, v: number) => { if (id) m[id] = (m[id] || 0) + v; };

/** Изменение балансов счетов. Перевод — это только перемещение денег: капитал, доходы и расходы не затрагиваются. */
export function balanceDeltas(t: Pick<Transaction, 'type' | 'amount' | 'accountId' | 'targetAccountId'>): D {
  const m: D = {};
  if (t.type === 'income') add(m, t.accountId, t.amount);
  else if (t.type === 'expense') add(m, t.accountId, -t.amount);
  else { add(m, t.accountId, -t.amount); add(m, t.targetAccountId, t.amount); }
  return m;
}
/** Как операция меняет savedAmount выбранной цели (только если цель выбрана явно). */
export function goalDeltaFor(s: AppState, t: Pick<Transaction, 'type' | 'amount' | 'accountId' | 'targetAccountId' | 'goalId'>): number {
  const g = t.goalId ? s.goals.find(x => x.id === t.goalId) : undefined; if (!g || !g.accountId) return 0;
  if (t.type === 'transfer') return g.accountId === t.targetAccountId ? t.amount : g.accountId === t.accountId ? -t.amount : 0;
  if (t.type === 'expense' && g.accountId === t.accountId) return -t.amount;
  return 0;
}
const linkedGoals = (s: AppState, accountId?: string) => s.goals.filter(g => g.isActive && g.accountId === accountId && accountId);
export function validateTransaction(s: AppState, t: TxInput): string[] {
  const e: string[] = [], acc = (id?: string) => s.accounts.find(a => a.id === id);
  if (!Number.isInteger(t.amount) || t.amount <= 0) e.push('Укажи сумму больше нуля.');
  if (!acc(t.accountId)) e.push('Выбери счёт.');
  if (t.type === 'transfer') { if (!acc(t.targetAccountId)) e.push('Выбери счёт назначения.'); else if (t.targetAccountId === t.accountId) e.push('Выбери разные счета.'); }
  if (t.goalId) { if (!s.goals.some(g => g.id === t.goalId)) e.push('Цель не найдена.'); else if (goalDeltaFor(s, t) === 0) e.push('Выбранная цель не привязана к счетам этой операции.'); }
  const touched = t.type === 'transfer' ? [t.accountId, t.targetAccountId] : t.type === 'expense' ? [t.accountId] : [];
  if (t.goalId === undefined && touched.some(id => linkedGoals(s, id).length >= 2)) e.push('На счёте закреплено несколько целей: выбери, какую цель затрагивает операция, или «не относится к цели».');
  return e;
}
function applyTx(s: AppState, t: Transaction): AppState {
  const m = balanceDeltas(t), gd = goalDeltaFor(s, t); let applied = 0;
  const goals = s.goals.map(g => { if (g.id !== t.goalId || !gd) return g; applied = Math.max(-g.savedAmount, gd); return { ...g, savedAmount: g.savedAmount + applied, updatedAt: now() }; });
  return { ...s, accounts: s.accounts.map(a => m[a.id] ? { ...a, balance: a.balance + m[a.id], updatedAt: now() } : a), goals, transactions: [...s.transactions, { ...t, goalDelta: applied }] };
}
function revertTx(s: AppState, t: Transaction): AppState {
  const m = balanceDeltas(t);
  return { ...s, accounts: s.accounts.map(a => m[a.id] ? { ...a, balance: a.balance - m[a.id], updatedAt: now() } : a),
    goals: s.goals.map(g => g.id === t.goalId && t.goalDelta ? { ...g, savedAmount: g.savedAmount - t.goalDelta, updatedAt: now() } : g), transactions: s.transactions.filter(x => x.id !== t.id) };
}
export function addTransaction(s: AppState, input: TxInput): Result {
  const errors = validateTransaction(s, input); if (errors.length) return { state: s, errors };
  const n = now(); return { state: applyTx(s, { ...input, id: newId(), createdAt: n, updatedAt: n }), errors: [] };
}
/** Правка = откат старого эффекта + применение нового: накопления не учитываются дважды. */
export function updateTransaction(s: AppState, id: string, patch: Partial<TxInput>): Result {
  const old = s.transactions.find(t => t.id === id); if (!old) return { state: s, errors: ['Операция не найдена.'] };
  const base = revertTx(s, old), { goalDelta: _d, ...rest } = old, next = { ...rest, ...patch, id, updatedAt: now() } as Transaction;
  const errors = validateTransaction(base, next); if (errors.length) return { state: s, errors };
  return { state: applyTx(base, next), errors: [] };
}
export function deleteTransaction(s: AppState, id: string): Result { const old = s.transactions.find(t => t.id === id); return old ? { state: revertTx(s, old), errors: [] } : { state: s, errors: ['Операция не найдена.'] }; }

const allocatedOn = (s: AppState, accountId: string, exceptGoalId?: string) => s.goals.filter(g => g.isActive && g.accountId === accountId && g.id !== exceptGoalId).reduce((q, g) => q + Math.max(0, g.savedAmount), 0);
/** Сумма, закреплённая за целями на одном счёте, не может превышать баланс счёта. */
export function validateGoal(s: AppState, g: Goal): string[] {
  const e: string[] = []; if (!g.name.trim()) e.push('Укажи название цели.'); if (!(g.targetAmount > 0)) e.push('Укажи сумму цели.'); if (g.savedAmount < 0) e.push('Отложенная сумма не может быть отрицательной.');
  if (g.accountId) { const a = s.accounts.find(x => x.id === g.accountId); if (!a) e.push('Счёт цели не найден.'); else { const room = Math.max(a.balance, 0) - allocatedOn(s, a.id, g.id); if (g.isActive && g.savedAmount > room) e.push(`На счёте «${a.name}» доступно для распределения ${formatRub(Math.max(room, 0))}.`); } }
  return e;
}
export function saveGoal(s: AppState, g: Goal): Result {
  const errors = validateGoal(s, g); if (errors.length) return { state: s, errors };
  const n = now(), exists = s.goals.some(x => x.id === g.id);
  return { state: { ...s, goals: exists ? s.goals.map(x => x.id === g.id ? { ...g, updatedAt: n } : x) : [...s.goals, { ...g, createdAt: n, updatedAt: n }] }, errors: [] };
}
/** Исправление: уменьшить сумму цели на нехватку денег на её счёте. Капитал не меняется. */
export function reduceGoalToFit(s: AppState, goalId: string): AppState {
  const g = s.goals.find(x => x.id === goalId), a = g?.accountId ? s.accounts.find(x => x.id === g.accountId) : undefined; if (!g || !a) return s;
  const deficit = allocatedOn(s, a.id) - Math.max(a.balance, 0); if (deficit <= 0) return s;
  return { ...s, goals: s.goals.map(x => x.id === goalId ? { ...x, savedAmount: Math.max(0, x.savedAmount - deficit), updatedAt: now() } : x) };
}
/** Исправление: деньги больше не на этом счёте — цель без привязки (расположение не определено). */
export function unlinkGoal(s: AppState, goalId: string): AppState { return { ...s, goals: s.goals.map(x => { if (x.id !== goalId) return x; const { accountId: _a, ...rest } = x; return { ...rest, updatedAt: now() }; }) }; }
export const upsertAccount = (s: AppState, a: Account): AppState => ({ ...s, accounts: s.accounts.some(x => x.id === a.id) ? s.accounts.map(x => x.id === a.id ? a : x) : [...s.accounts, a] });
