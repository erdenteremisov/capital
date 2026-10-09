import { useState } from 'react';
import type { AppState, Frequency } from '../types/models.ts';
import type { Result } from '../finance/ops.ts';
import { newId } from '../finance/ops.ts';
import { occurrences, recommendedReserve } from '../finance/engine.ts';
import { addDays, addMonths } from '../finance/dates.ts';
import { formatRub } from '../finance/money.ts';
import { Card, Errors, Field, Info, MoneyField, Row, toK } from './common.tsx';
type Run = (op: (s: AppState) => Result) => string[];
function AddPay({ s, today, run }: { s: AppState; today: string; run: Run }) {
  const [name, setName] = useState(''), [amt, setAmt] = useState(''), [f, setF] = useState<Frequency>('monthly'), [d, setD] = useState(today), [mand, setMand] = useState(true), [after, setAfter] = useState(false), [err, setErr] = useState<string[]>([]);
  return <form onSubmit={e => { e.preventDefault(); const k = toK(amt); if (!name.trim() || k === null || k <= 0) return setErr(['Укажи название и сумму.']); const n = new Date().toISOString();
    setErr(run(st => ({ state: { ...st, recurringPayments: [...st.recurringPayments, { id: newId(), name: name.trim(), amount: k, frequency: f, nextDate: d, isMandatory: mand, paidAfterIncome: after, createdAt: n, updatedAt: n }] }, errors: [] }))); setName(''); setAmt(''); }}>
    <Field label="Название"><input value={name} onChange={e => setName(e.target.value)} placeholder="Аренда" /></Field><MoneyField label="Сумма, ₽" value={amt} onChange={setAmt} />
    <Field label="Как часто"><select value={f} onChange={e => setF(e.target.value as Frequency)}><option value="monthly">Каждый месяц</option><option value="weekly">Каждую неделю</option><option value="quarterly">Раз в квартал</option><option value="yearly">Раз в год</option><option value="custom">Один раз</option></select></Field>
    <Field label="Ближайшая дата"><input type="date" value={d} onChange={e => setD(e.target.value)} /></Field>
    <label className="f"><span>Обязательный</span><input type="checkbox" checked={mand} onChange={e => setMand(e.target.checked)} /></label>
    <label className="f"><span>Если платёж в день дохода — он списывается после поступления дохода <Info text="По умолчанию платёж в день дохода учитывается консервативно, как будто он спишется до поступления денег. Отметь это, если знаешь, что деньги придут раньше." /></span><input type="checkbox" checked={after} onChange={e => setAfter(e.target.checked)} /></label>
    <Errors list={err} /><button className="b">Добавить платёж</button></form>;
}
export function Payments({ s, today, run }: { s: AppState; today: string; run: Run }) {
  const f = today.slice(0, 8) + '01', mt = s.recurringPayments.reduce((q, p) => q + occurrences(p, f, addDays(addMonths(f, 1), -1)).length * p.amount, 0), up = s.recurringPayments.flatMap(p => occurrences(p, today, addDays(today, 45)).map(d => [d, p] as const)).sort((a, b) => a[0].localeCompare(b[0])), rs = s.recurringPayments.filter(p => recommendedReserve(p) > 0);
  return <>
    <Card title="Платежи">{s.recurringPayments.length ? <><div className="m">В этом месяце</div><div className="big">{formatRub(mt)}</div></> : <p className="m">Добавь регулярные платежи, чтобы приложение могло учитывать будущие обязательства.</p>}</Card>
    <Card title="Ближайшие">{up.length ? up.map(([d, p]) => <Row key={d + p.id}><span>{d} · {p.name}</span><span><b>{formatRub(p.amount)}</b> <button className="b2 sm" aria-label="Удалить платёж" onClick={() => run(st => ({ state: { ...st, recurringPayments: st.recurringPayments.filter(x => x.id !== p.id) }, errors: [] }))}>✕</button></span></Row>) : <p className="m">В ближайшие 45 дней платежей нет.</p>}<AddPay s={s} today={today} run={run} /></Card>
    <Card title="Ежемесячный резерв"><Info text="Это не реальный расход. Чтобы редкий платёж не стал неожиданностью, желательно откладывать примерно эту сумму каждый месяц. В «Свободно» и «Можно потратить» резерв не входит." />{rs.length ? rs.map(p => <Row key={p.id}><span>{p.name} · {formatRub(p.amount)} / {p.frequency === 'yearly' ? 'год' : 'квартал'}</span><b>{formatRub(recommendedReserve(p))} / мес</b></Row>) : <p className="m">Годовые и квартальные платежи появятся здесь с рекомендуемым резервом.</p>}</Card>
  </>;
}
