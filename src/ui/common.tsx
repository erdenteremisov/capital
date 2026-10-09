import { useState } from 'react';
import type { ReactNode } from 'react';
import { formatRub, parseRub } from '../finance/money.ts';
export const Card = ({ title, children }: { title: string; children: ReactNode }) => <section className="c"><h4>{title}</h4>{children}</section>;
export const Row = ({ children }: { children: ReactNode }) => <div className="row">{children}</div>;
export const Rub = ({ v, cls }: { v: number; cls?: string }) => <b className={cls}>{formatRub(v)}</b>;
export function Info({ text }: { text: string }) { const [o, s] = useState(false); return <><button type="button" className="i" aria-label="Пояснение" onClick={() => s(!o)}>ⓘ</button>{o && <div className="m" role="note">{text}</div>}</>; }
export const Errors = ({ list }: { list: string[] }) => list.length ? <div className="er" role="alert">{list.map(e => <div key={e}>{e}</div>)}</div> : null;
export const Empty = ({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) => <div><p className="m">{text}</p>{action && <button className="b" onClick={onAction}>{action}</button>}</div>;
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="f"><span>{label}</span>{children}</label>; }
export function MoneyField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) { return <Field label={label}><input inputMode="decimal" value={value} onChange={e => onChange(e.target.value)} placeholder="0" /></Field>; }
export const toK = (v: string): number | null => (v.trim() === '' ? null : parseRub(v));
