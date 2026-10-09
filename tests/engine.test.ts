import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AppState, Goal } from '../src/types/models.ts';
import { createEmptyState } from '../src/types/models.ts';
import * as E from '../src/finance/engine.ts';
import * as O from '../src/finance/ops.ts';
import { checkIntegrity } from '../src/finance/integrity.ts';
import { memoryBackend } from '../src/db/database.ts';
import { loadState, saveState } from '../src/db/repositories.ts';
import { exportBackup, parseBackup } from '../src/services/backup.ts';

const T = '2026-10-09', K = (r: number) => r * 100;
const acc = (id: string, balance: number, inc = true) => ({ id, name: id, type: 'bank' as const, balance, includeInCapital: inc, createdAt: '', updatedAt: '' });
const goal = (o: Partial<Goal> = {}): Goal => ({ id: 'g1', name: 'Подушка', targetAmount: K(600000), savedAmount: K(150000), monthlyContribution: K(20000), accountId: 'b', isActive: true, createdAt: '', updatedAt: '', ...o });
const pay = (nextDate: string, o = {}) => ({ id: 'p' + nextDate, name: 'p', amount: K(10000), frequency: 'monthly' as const, nextDate, isMandatory: true, createdAt: '', updatedAt: '', ...o });
const base = (): AppState => ({ ...createEmptyState(), accounts: [acc('a', K(100000)), acc('b', K(200000))], goals: [goal()],
  incomeSources: [{ id: 'i', name: 'Job', amount: K(180000), frequency: 'monthly', nextDate: '2026-10-20', isRegular: true, createdAt: '', updatedAt: '' }] });
const ok = (r: O.Result) => { assert.deepEqual(r.errors, []); return r.state; };
const tx = (o: Partial<O.TxInput>): O.TxInput => ({ date: T, type: 'transfer', amount: K(1000), accountId: 'a', targetAccountId: 'b', ...o });

// ---- базовые расчёты ----
test('капитал = сумма включённых счетов; чистый капитал вычитает долги', () => {
  const s = base(); s.accounts.push(acc('x', K(5), false)); assert.equal(E.calculateTotalCapital(s.accounts), K(300000));
  s.debts = [{ id: 'd', name: 'd', amount: K(50000), includeInNetCapital: true, createdAt: '', updatedAt: '' }]; assert.equal(E.calculateNetCapital(s), K(250000));
});
test('доход увеличивает, расход уменьшает результат месяца; перевод не учитывается', () => {
  let s = base(); s = ok(O.addTransaction(s, tx({ type: 'income', amount: K(100), targetAccountId: undefined }))); s = ok(O.addTransaction(s, tx({ type: 'expense', amount: K(40), targetAccountId: undefined }))); s = ok(O.addTransaction(s, tx({ goalId: null })));
  assert.deepEqual(E.calculateMonth(s.transactions, '2026-10'), { income: K(100), expense: K(40), result: K(60) });
});
test('годовой платёж 24 000 → резерв 2 000/мес, не расход', () => assert.equal(E.recommendedReserve(pay('2027-06-15', { amount: K(24000), frequency: 'yearly' })), K(2000)));
test('цель: процент, нужный темп, прогноз зависит от темпа', () => {
  const g = goal({ savedAmount: K(250000), targetDate: '2027-05-09' }); assert.equal(E.calculateGoalProgress(g).toFixed(1), '41.7'); assert.equal(E.calculateRequiredMonthlyContribution(g, T), K(50000));
  const f = (r: number) => E.calculateGoalForecast(g, K(r), T); assert.equal((f(25000) as any).months, 14); assert.equal((f(50000) as any).months, 7);
});
test('нерегулярный доход не создаёт дату; нет данных → нет NaN/Infinity', () => {
  const s = base(); s.incomeSources = [{ ...s.incomeSources[0], isRegular: false, frequency: 'irregular' }]; assert.equal(E.nextIncome(s, T), null);
  const x = [E.calculateGoalForecast(goal(), 0, T), E.calculateGoalForecast(goal(), NaN, T), E.calculateCapitalForecast(base(), T, 3), E.averageSaving(base(), T), E.calculateRequiredMonthlyContribution(goal({ targetAmount: 0 }), T)];
  assert.ok(!/NaN|Infinity/.test(JSON.stringify(x)));
});

// ---- модель «капитал → свободно → можно потратить» ----
test('отложено 150k + план 20k: капитал 300k, Свободно 150k, Можно потратить 130k', () => {
  const s = base(), f = E.calculateFreeMoney(s, T), sp = E.calculateSpendable(s, T) as any;
  assert.equal(f.capital, K(300000)); assert.equal(f.free, K(150000)); assert.equal(sp.spendable, K(130000));
});
test('цель на отдельном накопительном счёте: вычитается один раз; счёт вне капитала — не вычитается', () => {
  const s = base(); assert.equal(E.goalAllocation(s).held, K(150000)); s.accounts[1].includeInCapital = false;
  const f = E.calculateFreeMoney(s, T); assert.equal(f.capital, K(100000)); assert.equal(f.held, 0); assert.equal(f.free, K(100000));
});
test('цель без счёта: вычитается, расположение помечено как неопределённое', () => {
  const s = base(); delete s.goals[0].accountId; const f = E.calculateFreeMoney(s, T);
  assert.equal(f.held, K(150000)); assert.equal(f.unlinkedGoalMoney, K(150000)); assert.ok(checkIntegrity(s).some(i => i.code === 'goal-unlinked'));
});
test('нет даты дохода: «Свободно» с пометкой неполных обязательств, «Можно потратить» не считается, 30 дней не используются', () => {
  const s = base(); s.incomeSources = []; s.recurringPayments = [pay('2026-10-10'), pay('2026-10-09', { id: 'today' })];
  const f = E.calculateFreeMoney(s, T); assert.equal(f.obligationsComplete, false); assert.equal(f.nextIncomeDate, null);
  assert.equal(f.obligations, K(10000), 'учтён только платёж, наступающий сегодня'); assert.equal(f.free, K(300000) - K(10000) - K(150000)); assert.equal(E.calculateSpendable(s, T).ok, false);
});
test('до дохода 11 дней, план 25k: резервируется 25k, а не доля 11/30', () => {
  const s = base(); s.goals[0].monthlyContribution = K(25000); const sp = E.calculateSpendable(s, T) as any;
  assert.equal(sp.days, 11); assert.equal(sp.planReserve, K(25000)); assert.equal(sp.spendable, K(125000)); assert.notEqual(sp.planReserve, Math.round(K(25000) * 11 / 30.44));
});
test('пример из ТЗ: 427 500 − 56 000(+1 200 в день дохода) − 250 000', () => {
  const s = base(); s.accounts = [acc('a', K(427500))]; s.goals = [goal({ savedAmount: K(250000), monthlyContribution: K(25000), accountId: undefined })];
  s.recurringPayments = [pay('2026-10-10', { amount: K(40000) }), pay('2026-10-15', { amount: K(16000) }), pay('2026-10-20', { amount: K(1200) })];
  const sp = E.calculateSpendable(s, T) as any; assert.equal(sp.obligations, K(57200)); assert.equal(sp.free, K(120300)); assert.equal(sp.spendable, K(95300)); assert.equal(sp.perDay, Math.floor(K(95300) / 11));
});
test('платёж в день дохода: по умолчанию входит (консервативно); paidAfterIncome — не входит; день до — входит; день после — не входит', () => {
  const o = (p: any) => { const s = base(); s.recurringPayments = [p]; return E.calculateFreeMoney(s, T).obligations; };
  assert.equal(o(pay('2026-10-19')), K(10000)); assert.equal(o(pay('2026-10-20')), K(10000)); assert.equal(o(pay('2026-10-20', { paidAfterIncome: true })), 0); assert.equal(o(pay('2026-10-21')), 0);
});

// ---- переводы, цели, целостность ----
test('перевод 30k между своими счетами: 70k/30k, капитал 100k, доход и расход 0', () => {
  const s = ok(O.addTransaction({ ...createEmptyState(), accounts: [acc('a', K(100000)), acc('b', 0)] }, tx({ amount: K(30000) })));
  assert.deepEqual(s.accounts.map(a => a.balance), [K(70000), K(30000)]); assert.equal(E.calculateTotalCapital(s.accounts), K(100000)); assert.deepEqual(E.calculateMonth(s.transactions, '2026-10'), { income: 0, expense: 0, result: 0 });
});
test('перевод на счёт цели не меняет капитал; правка savedAmount тоже не меняет капитал', () => {
  let s = base(); s = ok(O.addTransaction(s, tx({ goalId: 'g1' }))); assert.equal(E.calculateTotalCapital(s.accounts), K(300000));
  s = ok(O.saveGoal(s, { ...s.goals[0], savedAmount: K(100000) })); assert.equal(E.calculateTotalCapital(s.accounts), K(300000));
});
test('перевод на счёт цели: цель выбрана явно, «Можно потратить» не меняется, «Свободно» уменьшается на взнос', () => {
  const s0 = base(); s0.goals[0].monthlyContribution = K(25000); const a = E.calculateSpendable(s0, T) as any;
  const s1 = ok(O.addTransaction(s0, tx({ date: '2026-10-01', amount: K(10000), goalId: 'g1' }))), b = E.calculateSpendable(s1, T) as any;
  assert.equal(s1.goals[0].savedAmount, K(160000)); assert.equal(b.spendable, a.spendable); assert.equal(b.free, a.free - K(10000)); assert.equal(b.alreadySaved, K(10000));
});
test('перевод без выбора цели не меняет savedAmount и не назначается первой попавшейся цели', () => {
  const s = ok(O.addTransaction(base(), tx({ goalId: null }))); assert.equal(s.goals[0].savedAmount, K(150000));
  const s2 = ok(O.addTransaction(base(), tx({}))); assert.equal(s2.goals[0].savedAmount, K(150000));
});
test('несколько целей на счёте: нужно выбрать цель или «не относится»', () => {
  const s = base(); s.goals.push(goal({ id: 'g2', name: 'Отпуск', savedAmount: K(30000) }));
  assert.ok(O.addTransaction(s, tx({})).errors.length > 0); assert.deepEqual(O.addTransaction(s, tx({ goalId: 'g2' })).errors, []); assert.deepEqual(O.addTransaction(s, tx({ goalId: null })).errors, []);
});
test('снятие со счёта цели с выбором цели уменьшает savedAmount; без выбора — предупреждение и исправление', () => {
  const s1 = ok(O.addTransaction(base(), { date: T, type: 'expense', amount: K(100000), accountId: 'b', goalId: 'g1' })); assert.equal(s1.goals[0].savedAmount, K(50000)); assert.equal(checkIntegrity(s1).filter(i => i.code === 'over-allocated').length, 0);
  const s2 = ok(O.addTransaction(base(), { date: T, type: 'expense', amount: K(100000), accountId: 'b', goalId: null })), iss = checkIntegrity(s2).find(i => i.code === 'over-allocated')!;
  assert.equal(iss.deficit, K(50000)); assert.equal(checkIntegrity(O.reduceGoalToFit(s2, 'g1')).filter(i => i.code === 'over-allocated').length, 0);
  assert.equal(O.reduceGoalToFit(s2, 'g1').goals[0].savedAmount, K(100000)); assert.equal(checkIntegrity(O.unlinkGoal(s2, 'g1')).filter(i => i.code === 'over-allocated').length, 0);
});
test('сумма целей на одном счёте не может превышать баланс', () => {
  const s = base(); s.goals.push(goal({ id: 'g2', savedAmount: K(10000) }));
  assert.ok(O.saveGoal(s, { ...s.goals[1], savedAmount: K(60000) }).errors.length > 0); assert.deepEqual(O.saveGoal(s, { ...s.goals[1], savedAmount: K(50000) }).errors, []);
});
test('смена даты следующего дохода пересчитывает период обязательств и резерв плана', () => {
  let s = base(); s.recurringPayments = [pay('2026-10-25')]; s = ok(O.addTransaction(s, tx({ date: '2026-09-25', amount: K(5000), goalId: 'g1' })));
  const a = E.calculateSpendable(s, T) as any; assert.equal(a.obligations, 0); assert.equal(a.alreadySaved, K(5000)); assert.equal(a.planReserve, K(15000));
  s.incomeSources[0].nextDate = '2026-10-31'; const b = E.calculateSpendable(s, T) as any;
  assert.equal(b.obligations, K(10000)); assert.equal(b.periodStart, '2026-09-30'); assert.equal(b.alreadySaved, 0); assert.equal(b.planReserve, K(20000)); assert.equal(b.days, 22);
});
test('правка и удаление операции не дают двойного учёта накоплений', () => {
  const s0 = base(); let s = ok(O.addTransaction(s0, tx({ goalId: 'g1' }))); const id = s.transactions[0].id;
  s = ok(O.updateTransaction(s, id, { amount: K(3000) })); assert.equal(s.goals[0].savedAmount, K(153000)); assert.equal(s.accounts[0].balance, K(97000));
  s = ok(O.updateTransaction(s, id, { goalId: null })); assert.equal(s.goals[0].savedAmount, K(150000)); assert.equal(s.accounts[1].balance, K(203000));
  s = ok(O.updateTransaction(s, id, { goalId: 'g1' })); assert.equal(s.goals[0].savedAmount, K(153000));
  s = ok(O.deleteTransaction(s, id)); assert.deepEqual(s.accounts.map(a => a.balance), s0.accounts.map(a => a.balance)); assert.equal(s.goals[0].savedAmount, K(150000)); assert.equal(s.transactions.length, 0);
});
test('данные сохраняются и восстанавливаются (backend) и переживают JSON-бэкап', async () => {
  let s = base(); s = ok(O.addTransaction(s, tx({ goalId: 'g1' }))); const b = memoryBackend(); await saveState(b, s);
  assert.deepEqual(await loadState(b), s, 'новая загрузка из того же хранилища = исходное состояние');
  const p = parseBackup(exportBackup(s)); assert.ok(p.ok); if (p.ok) { assert.deepEqual(p.state, s); assert.equal(p.summary.transactions, 1); }
  assert.equal(parseBackup('{bad').ok, false);
  const v1 = parseBackup(JSON.stringify({ v: 1, settings: { currency: 'RUB' }, accounts: [{ id: 'a', name: 'a', balance: 100 }], transactions: [], goals: [], recurringPayments: [], incomeSources: [], debts: [] })); assert.ok(v1.ok);
});
