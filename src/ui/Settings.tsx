import { useState } from 'react';
import type { AppState } from '../types/models.ts';
import { createEmptyState } from '../types/models.ts';
import { exportBackup, parseBackup } from '../services/backup.ts';
import type { ParseResult } from '../services/backup.ts';
import { createDemoState } from '../demo/demoData.ts';
import { Card, Row } from './common.tsx';
export function Settings({ s, today, persisted, commit }: { s: AppState; today: string; persisted: boolean; commit: (s: AppState) => void }) {
  const [text, setText] = useState(''), [prev, setPrev] = useState<ParseResult | null>(null), [exp, setExp] = useState(''), [wipe, setWipe] = useState(false);
  const download = () => { const j = exportBackup(s); setExp(j); try { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([j], { type: 'application/json' })); a.download = `my-capital-backup-${today}.json`; a.click(); } catch { /* текст ниже можно скопировать */ } };
  return <>
    <Card title="Данные"><div className="row"><button className="b2" onClick={download}>Экспортировать резервную копию</button></div>{exp && <textarea readOnly value={exp} aria-label="Резервная копия" />}
      <label className="f"><span>Импортировать резервную копию (файл)</span><input type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(t => { setText(t); setPrev(parseBackup(t)); }); }} /></label>
      <textarea value={text} onChange={e => { setText(e.target.value); setPrev(text || e.target.value ? parseBackup(e.target.value) : null); }} placeholder="или вставь JSON" aria-label="JSON для импорта" />
      {prev && !prev.ok && <div className="er" role="alert">{prev.error}</div>}
      {prev?.ok && <div><p>Будет восстановлено: счетов {prev.summary.accounts}, операций {prev.summary.transactions}, целей {prev.summary.goals}, платежей {prev.summary.recurringPayments}, источников дохода {prev.summary.incomeSources}.</p><p className="r">Текущие данные будут заменены.</p><button className="b" onClick={() => { commit(prev.state); setPrev(null); setText(''); }}>Заменить данные</button></div>}
      <div className="row"><button className="b2" onClick={() => setWipe(true)}>Удалить все данные</button></div>
      {wipe && <div role="alertdialog"><p className="r">Это действие нельзя отменить.</p><button className="b2" onClick={download}>Сначала экспортировать резервную копию</button><Row><button className="b2" onClick={() => setWipe(false)}>Отмена</button><button className="b" style={{ background: 'var(--r)' }} onClick={() => { commit(createEmptyState()); setWipe(false); }}>Удалить всё</button></Row></div>}
      {!s.accounts.length && <div className="row"><button className="b2" onClick={() => commit(createDemoState(today))}>Загрузить демо-данные</button></div>}</Card>
    <Card title="Тема"><select aria-label="Тема" value={s.settings.theme} onChange={e => commit({ ...s, settings: { ...s.settings, theme: e.target.value as any, updatedAt: new Date().toISOString() } })}><option value="dark">Тёмная</option><option value="light">Светлая</option><option value="system">Как в системе</option></select></Card>
    <Card title="Приватность"><p>Твои финансовые данные хранятся непосредственно на этом устройстве и не отправляются на сервер.</p><Row><span>Локальное хранение</span><b className={persisted ? 'g' : 'y'}>{persisted ? 'ON' : 'недоступно'}</b></Row><Row><span>Облачная синхронизация</span><b>OFF</b></Row><Row><span>Банковские подключения</span><b>OFF</b></Row><Row><span>Аналитика пользовательских финансов</span><b>OFF</b></Row></Card>
  </>;
}
