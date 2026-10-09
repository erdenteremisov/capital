import { useState } from 'react';
import type { AppState, Goal } from '../types/models.ts';
import type { Result } from '../finance/ops.ts';
import { newId, reduceGoalToFit, saveGoal, unlinkGoal } from '../finance/ops.ts';
import { averageSaving, calculateEmergencyFundCoverage, calculateGoalForecast, calculateGoalProgress, calculateRequiredMonthlyContribution } from '../finance/engine.ts';
import { checkIntegrity } from '../finance/integrity.ts';
import { formatRub } from '../finance/money.ts';
import { Card, Empty, Errors, Field, MoneyField, Row, toK } from './common.tsx';
type Run = (op: (s: AppState) => Result) => string[];
function GoalForm({ s, g, run, done }: { s: AppState; g?: Goal; run: Run; done: () => void }) {
  const r = (k?: number) => (k === undefined ? '' : String(k / 100)), [name, setName] = useState(g?.name ?? ''), [target, setTarget] = useState(r(g?.targetAmount)), [saved, setSaved] = useState(r(g?.savedAmount ?? 0)), [acc, setAcc] = useState(g?.accountId ?? ''), [plan, setPlan] = useState(r(g?.monthlyContribution)), [date, setDate] = useState(g?.targetDate ?? ''), [err, setErr] = useState<string[]>([]);
  return <form onSubmit={e => { e.preventDefault(); const t = toK(target), sv = toK(saved) ?? 0, p = toK(plan); const n = new Date().toISOString();
    const goal: Goal = { id: g?.id ?? newId(), name, targetAmount: t ?? 0, savedAmount: sv, accountId: acc || undefined, targetDate: date || undefined, monthlyContribution: p ?? undefined, priority: g?.priority ?? 1, isActive: true, createdAt: g?.createdAt ?? n, updatedAt: n };
    const errs = run(st => saveGoal(st, goal)); setErr(errs); if (!errs.length) done(); }}>
    <Field label="Название"><input value={name} onChange={e => setName(e.target.value)} placeholder="Подушка безопасности" /></Field><MoneyField label="Сумма цели, ₽" value={target} onChange={setTarget} />
    <Field label="Счёт, где лежат отложенные деньги"><select value={acc} onChange={e => setAcc(e.target.value)}><option value="">Не выбран: расположение денег не определено</option>{s.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    {!acc && <div className="y">Без счёта приложение не знает, где лежат эти деньги, и расчёт может быть неточным.</div>}
    <MoneyField label="Уже отложено, ₽ (эти деньги уже входят в капитал)" value={saved} onChange={setSaved} /><MoneyField label="План: откладывать в месяц, ₽ (будущие деньги, из капитала не вычитаются)" value={plan} onChange={setPlan} />
    <Field label="Срок (необязательно)"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field><Errors list={err} /><div className="row"><button type="button" className="b2" onClick={done}>Отмена</button><button className="b">Сохранить</button></div></form>;
}
export function Goals({ s, today, run }: { s: AppState; today: string; run: Run }) {
  const [edit, setEdit] = useState<string | null>(null), issues = checkIntegrity(s), a = averageSaving(s, today);
  return <>
    {issues.filter(i => i.code === 'over-allocated' || i.code === 'goal-account-missing').map((i, k) => <div className="c y" role="alert" key={k}>{i.message}<div className="row">{i.goalIds.map(id => { const g = s.goals.find(x => x.id === id)!; return <span key={id}>{i.code === 'over-allocated' && <button className="b2 sm" onClick={() => run(st => ({ state: reduceGoalToFit(st, id), errors: [] }))}>Уменьшить «{g.name}»</button>} <button className="b2 sm" onClick={() => run(st => ({ state: unlinkGoal(st, id), errors: [] }))}>Деньги «{g.name}» больше не на этом счёте</button></span>; })}</div></div>)}
    {s.goals.length === 0 && edit === null && <Card title="Цели"><Empty text="Пока нет финансовой цели. Добавь первую цель, чтобы видеть прогресс и прогноз." action="Создать цель" onAction={() => setEdit('new')} /></Card>}
    {s.goals.map(g => { const p = calculateGoalProgress(g), rem = Math.max(0, g.targetAmount - g.savedAmount), rq = calculateRequiredMonthlyContribution(g, today), fc = calculateGoalForecast(g, a && a.result > 0 ? a.result : 0, today), fp = calculateGoalForecast(g, g.monthlyContribution ?? 0, today), cov = /подушк|резерв/i.test(g.name) ? calculateEmergencyFundCoverage(g, s) : null, ac = s.accounts.find(x => x.id === g.accountId);
      return <Card key={g.id} title="Цель">{edit === g.id ? <GoalForm s={s} g={g} run={run} done={() => setEdit(null)} /> : <>
        <Row><b>{g.name}</b><span><button className="b2 sm" onClick={() => setEdit(g.id)}>Изменить</button> <button className="b2 sm" aria-label="Удалить цель" onClick={() => run(st => ({ state: { ...st, goals: st.goals.filter(x => x.id !== g.id) }, errors: [] }))}>✕</button></span></Row>
        <div className="m">{formatRub(g.savedAmount)} / {formatRub(g.targetAmount)} · {p.toFixed(1).replace('.', ',')}% · осталось {formatRub(rem)}</div><div className="bar"><i style={{ width: p + '%' }} /></div>
        <div className="m">{ac ? `Счёт: ${ac.name}${ac.includeInCapital ? '' : ' (вне капитала)'}` : 'Расположение отложенных денег не определено: привяжи цель к счёту.'}</div>
        {rem > 0 && <p>{rq !== null ? `Нужно ${formatRub(rq)} / мес.` : 'Добавь срок цели, чтобы увидеть необходимый темп.'}</p>}
        {rq !== null && a && <p>{a.result < rq ? `🟠 Текущий темп ниже необходимого: нужно увеличить накопление примерно на ${formatRub(rq - Math.max(a.result, 0))} / мес.` : '🟢 Ты опережаешь план.'}</p>}
        <p><b>Прогноз</b> при текущем темпе: {fc.ok ? (fc.done ? 'цель достигнута' : '≈ ' + fc.date) : 'недостаточно истории для надёжного прогноза.'}{g.monthlyContribution ? ` · при плане ${formatRub(g.monthlyContribution)} / мес: ${fp.ok && !fp.done ? '≈ ' + fp.date : '—'}` : ''}</p>
        {cov !== null && <p>Покрытие обязательных расходов: <b>{cov.toFixed(1).replace('.', ',')} мес.</b></p>}</>}</Card>; })}
    {edit === 'new' ? <Card title="Новая цель"><GoalForm s={s} run={run} done={() => setEdit(null)} /></Card> : s.goals.length > 0 && <button className="b" onClick={() => setEdit('new')}>+ Цель</button>}
  </>;
}
