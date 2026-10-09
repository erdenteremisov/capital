import type { AppState } from '../types/models.ts';
import { STATE_VERSION, createEmptyState } from '../types/models.ts';
const KEYS = ['accounts', 'transactions', 'categories', 'goals', 'recurringPayments', 'incomeSources', 'debts'] as const;
export const exportBackup = (s: AppState): string => JSON.stringify({ app: 'my-capital', version: STATE_VERSION, exportedAt: new Date().toISOString(), data: s }, null, 2);
export type ParseResult = { ok: true; state: AppState; summary: Record<string, number> } | { ok: false; error: string };
/** Принимает бэкап v2 и экспорт прототипа (v1: плоский объект с полем v). Ничего не применяет — только проверяет и мигрирует. */
export function parseBackup(text: string): ParseResult {
  let raw: any; try { raw = JSON.parse(text); } catch { return { ok: false, error: 'Это не JSON-файл.' }; }
  const d = raw && raw.app === 'my-capital' ? raw.data : raw, v = raw?.app === 'my-capital' ? raw.version : d?.v ?? d?.version;
  if (!d || typeof d !== 'object' || typeof v !== 'number') return { ok: false, error: 'Неизвестный формат файла.' };
  if (v > STATE_VERSION) return { ok: false, error: 'Версия копии новее, чем приложение.' };
  const e = createEmptyState(), out: any = { version: STATE_VERSION, settings: { ...e.settings, ...(d.settings ?? {}), id: 'main' } };
  for (const k of KEYS) { const x = d[k] ?? (k === 'categories' ? e.categories : []); if (!Array.isArray(x)) return { ok: false, error: `Поле «${k}» повреждено.` }; out[k] = x; }
  const ids = new Set(out.accounts.map((a: any) => a.id)); if (out.accounts.some((a: any) => !Number.isInteger(a.balance))) return { ok: false, error: 'Суммы должны быть целыми (в копейках).' };
  if (out.transactions.some((t: any) => !ids.has(t.accountId))) return { ok: false, error: 'Есть операции с несуществующим счётом.' };
  return { ok: true, state: out as AppState, summary: Object.fromEntries(KEYS.map(k => [k, out[k].length])) };
}
