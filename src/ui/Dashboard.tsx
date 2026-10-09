import type { AppState } from '../types/models.ts';
import { calculateFinancialStatus, calculateFreeMoney, calculateGoalProgress, calculateMonth, calculateNetCapital, calculateRequiredMonthlyContribution, calculateSpendable, occurrences } from '../finance/engine.ts';
import { addDays } from '../finance/dates.ts';
import { formatRub } from '../finance/money.ts';
import { checkIntegrity } from '../finance/integrity.ts';
import { Card, Empty, Info, Row, Rub } from './common.tsx';
export function Dashboard({ s, today, go }: { s: AppState; today: string; go: (t: string) => void }) {
  if (!s.accounts.length) return <Card title="Добро пожаловать"><Empty text="Приложение хранит всё только на этом устройстве. Добавь первый счёт на вкладке «Деньги» или загрузи демо в Настройках." action="Добавить счёт" onAction={() => go('money')} /></Card>;
  const fr = calculateFreeMoney(s, today), sp = calculateSpendable(s, today), st = calculateFinancialStatus(s, today), g = s.goals.find(x => x.isActive), m = calculateMonth(s.transactions, today.slice(0, 7)), issues = checkIntegrity(s).filter(i => i.severity === 'error');
  const up = s.recurringPayments.flatMap(p => occurrences(p, today, addDays(today, 30)).map(d => [d, p] as const)).sort((a, b) => a[0].localeCompare(b[0])).slice(0, 3), rq = g ? calculateRequiredMonthlyContribution(g, today) : null;
  return <>
    {issues.length > 0 && <div className="c y" role="alert">{issues[0].message} <button className="b2 sm" onClick={() => go('goals')}>Исправить</button></div>}
    <Card title="Мои деньги"><div className="big">{formatRub(calculateNetCapital(s))}</div><div>Капитал <Info text="Все деньги и активы, включённые в капитал. Деньги, отложенные на цели, уже входят сюда." /></div></Card>
    <Card title="Свободно"><div className="big">{formatRub(fr.free)}</div>
      <div className="m">Капитал {formatRub(fr.capital)} − платежи {formatRub(fr.obligations)} − отложено на цели {formatRub(fr.held)}</div>
      {!fr.obligationsComplete && <div className="y" role="alert">Обязательства до следующего дохода могут быть учтены не полностью: не указана дата дохода. <button className="b2 sm" onClick={() => go('money')}>Добавить доход</button></div>}
      {fr.unlinkedGoalMoney > 0 && <div className="y">Расположение {formatRub(fr.unlinkedGoalMoney)} отложенных денег не определено: привяжи цель к счёту.</div>}</Card>
    <Card title="Можно потратить до следующего дохода">{sp.ok ? <><div className={'big ' + (sp.spendable < 0 ? 'r' : '')}>{sp.spendable < 0 ? 'Не хватает ' + formatRub(-sp.spendable) : formatRub(sp.spendable)}</div>
      <div>до {sp.nextIncomeDate} ({sp.days} дн.) · ≈ {formatRub(sp.perDay)} / день</div>
      <div className="m">Свободно {formatRub(sp.free)} − осталось отложить по плану {formatRub(sp.planReserve)} (план периода {formatRub(sp.planPerPeriod)}, уже отложено {formatRub(sp.alreadySaved)}). Ориентир, не финансовая рекомендация.</div></>
      : <><b>Пока недостаточно данных для расчёта.</b><p className="m">{sp.reason}</p></>}</Card>
    <Card title="Финансовое состояние">{st ? <><div className={'big ' + (st.level === 'green' ? 'g' : st.level === 'yellow' ? 'y' : 'r')} style={{ fontSize: 26 }}>{st.level === 'green' ? '🟢' : st.level === 'yellow' ? '🟡' : '🔴'} {st.title}</div><div className="m">{st.why}</div></> : <span className="m">Пока недостаточно данных.</span>}</Card>
    <Card title="Моя цель">{g ? <><Row><b>{g.name}</b><span>{calculateGoalProgress(g).toFixed(1).replace('.', ',')}%</span></Row><div className="bar"><i style={{ width: calculateGoalProgress(g) + '%' }} /></div><div className="m">{formatRub(g.savedAmount)} / {formatRub(g.targetAmount)}{rq ? ` · нужно ${formatRub(rq)} / мес` : ''}</div></> : <Empty text="Пока нет финансовой цели. Добавь первую цель, чтобы видеть прогресс и прогноз." action="Создать цель" onAction={() => go('goals')} />}</Card>
    <Card title="Ближайшие платежи">{up.length ? up.map(([d, p]) => <Row key={d + p.id}><span>{d} · {p.name}</span><Rub v={p.amount} /></Row>) : <span className="m">Добавь регулярные платежи, чтобы учитывать будущие обязательства.</span>}</Card>
    <Card title="Этот месяц"><Row><span>Доходы</span><Rub v={m.income} /></Row><Row><span>Расходы</span><Rub v={m.expense} /></Row><Row><span>Осталось</span><Rub v={m.result} cls={m.result >= 0 ? 'g' : 'r'} /></Row></Card>
  </>;
}
