import { useState } from 'react';
import type { AppState, Frequency } from '../types/models.ts';
import type { Result } from '../finance/ops.ts';
import { addTransaction, deleteTransaction, newId, upsertAccount } from '../finance/ops.ts';
import { calculateMonth, calculateNetCapital } from '../finance/engine.ts';
import { formatRub } from '../finance/money.ts';
import { Card, Errors, Field, MoneyField, Row, Rub, toK } from './common.tsx';
type Run = (op: (s: AppState) => Result) => string[]; type P = { s: AppState; today: string; run: Run; commit: (s: AppState) => void };
function AddAccount({ run }: { run: Run; }) {
  const [name, setName] = useState('Основная карта'), [bal, setBal] = useState(''), [inc, setInc] = useState(true), [err, setErr] = useState<string[]>([]);
  return <form onSubmit={e => { e.preventDefault(); const k = toK(bal); if (k === null || !name.trim()) return setErr(['Укажи название и сумму.']); const n = new Date().toISOString(); setErr(run(s => ({ state: upsertAccount(s, { id: newId(), name: name.trim(), type: 'bank', balance: k, includeInCapital: inc, createdAt: n, updatedAt: n }), errors: [] }))); setBal(''); }}>
    <Field label="Название счёта"><input value={name} onChange={e => setName(e.target.value)} /></Field><MoneyField label="Баланс сейчас, ₽" value={bal} onChange={setBal} />
    <label className="f"><span>Учитывать в капитале</span><input type="checkbox" checked={inc} onChange={e => setInc(e.target.checked)} /></label><Errors list={err} /><button className="b">Добавить счёт</button></form>;
}
function AddIncome({ s, run }: { s: AppState; run: Run }) {
  const [name, setName] = useState('Основная работа'), [amt, setAmt] = useState(''), [f, setF] = useState<Frequency>('monthly'), [d, setD] = useState(''), [err, setErr] = useState<string[]>([]);
  return <form onSubmit={e => { e.preventDefault(); const k = toK(amt); if (k === null || k <= 0) return setErr(['Укажи сумму дохода.']); const n = new Date().toISOString(); setErr(run(st => ({ state: { ...st, incomeSources: [...st.incomeSources, { id: newId(), name, amount: k, frequency: f, nextDate: d || undefined, isRegular: f !== 'irregular', createdAt: n, updatedAt: n }] }, errors: [] }))); setAmt(''); }}>
    <Field label="Название"><input value={name} onChange={e => setName(e.target.value)} /></Field><MoneyField label="Сумма, ₽" value={amt} onChange={setAmt} />
    <Field label="Как часто"><select value={f} onChange={e => setF(e.target.value as Frequency)}><option value="monthly">Каждый месяц</option><option value="weekly">Каждую неделю</option><option value="quarterly">Раз в квартал</option><option value="yearly">Раз в год</option><option value="irregular">Нерегулярно</option></select></Field>
    <Field label="Дата следующего дохода (нужна для «можно потратить»)"><input type="date" value={d} onChange={e => setD(e.target.value)} /></Field><Errors list={err} />
    <button className="b">Сохранить</button><ul>{s.incomeSources.map(x => <li key={x.id}>{x.name} · {formatRub(x.amount)}{x.nextDate ? ' · след. ' + x.nextDate : ''}</li>)}</ul></form>;
}
function AddTx({ s, today, run }: { s: AppState; today: string; run: Run }) {
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>('expense'), [amt, setAmt] = useState(''), [acc, setAcc] = useState(s.accounts[0]?.id ?? ''), [tgt, setTgt] = useState(s.accounts[1]?.id ?? ''), [cat, setCat] = useState('c1'), [date, setDate] = useState(today), [goal, setGoal] = useState<string>('undef'), [err, setErr] = useState<string[]>([]);
  const touched = type === 'transfer' ? [acc, tgt] : type === 'expense' ? [acc] : [], goals = s.goals.filter(g => g.isActive && g.accountId && touched.includes(g.accountId));
  return <form onSubmit={e => { e.preventDefault(); const k = toK(amt); if (k === null) return setErr(['Укажи сумму.']);
    const r = run(st => addTransaction(st, { type, amount: k, accountId: acc, targetAccountId: type === 'transfer' ? tgt : undefined, categoryId: type === 'expense' ? cat : undefined, date, goalId: goal === 'undef' ? undefined : goal === 'none' ? null : goal })); setErr(r); if (!r.length) setAmt(''); }}>
    <div className="row"><button type="button" className={type === 'income' ? 'b' : 'b2'} onClick={() => setType('income')}>+ Доход</button><button type="button" className={type === 'expense' ? 'b' : 'b2'} onClick={() => setType('expense')}>− Расход</button><button type="button" className={type === 'transfer' ? 'b' : 'b2'} onClick={() => setType('transfer')}>↔ Перевод</button></div>
    <MoneyField label="Сумма, ₽" value={amt} onChange={setAmt} />
    {type === 'expense' && <Field label="Категория"><select value={cat} onChange={e => setCat(e.target.value)}>{s.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>}
    <Field label={type === 'transfer' ? 'Со счёта' : 'Счёт'}><select value={acc} onChange={e => setAcc(e.target.value)}>{s.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    {type === 'transfer' && <Field label="На счёт"><select value={tgt} onChange={e => setTgt(e.target.value)}>{s.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>}
    {goals.length > 0 && <Field label="Какая цель затрагивается?"><select value={goal} onChange={e => setGoal(e.target.value)}><option value="undef">— выбери —</option><option value="none">Не относится к цели</option>{goals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>}
    <Field label="Дата"><input type="date" value={date} onChange={e => setDate(e.target.value)} /></Field><Errors list={err} /><button className="b">Сохранить</button></form>;
}
export function Money({ s, today, run, commit }: P) {
  const m = calculateMonth(s.transactions, today.slice(0, 7)), last = [...s.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15), [open, setOpen] = useState<string>(s.accounts.length ? '' : 'acc');
  return <>
    <Card title="Капитал"><div className="big">{formatRub(calculateNetCapital(s))}</div>{s.accounts.map(a => <Row key={a.id}><span>{a.name}{a.includeInCapital ? '' : ' (вне капитала)'}</span><Rub v={a.balance} /></Row>)}<button className="b2" onClick={() => setOpen(open === 'acc' ? '' : 'acc')}>+ Счёт</button>{open === 'acc' && <AddAccount run={run} />}</Card>
    <Card title="Источники дохода"><button className="b2" onClick={() => setOpen(open === 'inc' ? '' : 'inc')}>+ Доход (источник)</button>{open === 'inc' ? <AddIncome s={s} run={run} /> : s.incomeSources.length === 0 && <p className="m">Добавь ожидаемый доход и его дату, чтобы считать «можно потратить».</p>}</Card>
    <Card title="Этот месяц"><Row><span>Доходы</span><Rub v={m.income} /></Row><Row><span>Расходы</span><Rub v={m.expense} /></Row><Row><span>Результат</span><Rub v={m.result} cls={m.result >= 0 ? 'g' : 'r'} /></Row><p className="m">Переводы между своими счетами не считаются доходом или расходом.</p></Card>
    {s.accounts.length > 0 && <Card title="Новая операция"><AddTx key={s.accounts.length + ':' + s.goals.length} s={s} today={today} run={run} /></Card>}
    <Card title="Последние операции">{last.length ? last.map(t => <Row key={t.id}><span>{t.date} · {t.type === 'income' ? 'Доход' : t.type === 'transfer' ? 'Перевод' : s.categories.find(c => c.id === t.categoryId)?.name ?? 'Расход'}</span><span><Rub v={t.amount} /> <button className="b2 sm" aria-label="Удалить операцию" onClick={() => run(st => deleteTransaction(st, t.id))}>✕</button></span></Row>) : <p className="m">Здесь появятся твои доходы и расходы.</p>}</Card>
  </>;
}
