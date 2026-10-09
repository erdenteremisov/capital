import { useEffect, useState } from 'react';
import { useStore } from './state/useStore.ts';
import { todayIso } from './finance/dates.ts';
import { Dashboard } from './ui/Dashboard.tsx';
import { Money } from './ui/Money.tsx';
import { Goals } from './ui/Goals.tsx';
import { Payments } from './ui/Payments.tsx';
import { Settings } from './ui/Settings.tsx';
const TABS: [string, string][] = [['home', 'Главная'], ['money', 'Деньги'], ['goals', 'Цели'], ['pay', 'Платежи']];
export default function App() {
  const { state: s, persisted, commit, run } = useStore(), [tab, setTab] = useState('home'), today = todayIso();
  useEffect(() => { const t = s?.settings.theme; if (!t || t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t; }, [s?.settings.theme]);
  if (!s) return <main><p className="m">Загрузка…</p></main>;
  return <>
    <header><b>MY CAPITAL</b><button className="b2 sm" onClick={() => setTab('set')}>⚙ Настройки</button></header>
    <main>{!persisted && <div className="c y" role="alert">Хранилище недоступно: данные живут только до закрытия вкладки.</div>}
      {tab === 'home' && <Dashboard s={s} today={today} go={setTab} />}{tab === 'money' && <Money s={s} today={today} run={run} commit={commit} />}{tab === 'goals' && <Goals s={s} today={today} run={run} />}{tab === 'pay' && <Payments s={s} today={today} run={run} />}{tab === 'set' && <Settings s={s} today={today} persisted={persisted} commit={commit} />}</main>
    <nav aria-label="Разделы">{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} aria-current={tab === k ? 'page' : undefined} onClick={() => setTab(k)}>{l}</button>)}</nav>
  </>;
}
