import type { AppState } from '../types/models.ts';
import { formatRub } from './money.ts';
export interface Issue { code: 'over-allocated' | 'goal-account-missing' | 'goal-unlinked' | 'goal-account-outside-capital' | 'tx-broken-ref'; severity: 'error' | 'warn'; message: string; accountId?: string; goalIds: string[]; deficit?: number }
export function checkIntegrity(s: AppState): Issue[] {
  const out: Issue[] = [];
  for (const a of s.accounts) {
    const gs = s.goals.filter(g => g.isActive && g.accountId === a.id), sum = gs.reduce((q, g) => q + Math.max(0, g.savedAmount), 0), room = Math.max(a.balance, 0);
    if (gs.length && sum > room) out.push({ code: 'over-allocated', severity: 'error', accountId: a.id, goalIds: gs.map(g => g.id), deficit: sum - room, message: `На счёте «${a.name}» за целями закреплено ${formatRub(sum)}, а на счёте ${formatRub(a.balance)}. Уменьши сумму цели или укажи, что деньги больше не на этом счёте.` });
    if (gs.length && !a.includeInCapital) out.push({ code: 'goal-account-outside-capital', severity: 'warn', accountId: a.id, goalIds: gs.map(g => g.id), message: `Счёт «${a.name}» не входит в капитал: деньги целей на нём не учитываются в капитале и в «Свободно».` });
  }
  for (const g of s.goals) { if (!g.isActive) continue;
    if (g.accountId && !s.accounts.some(a => a.id === g.accountId)) out.push({ code: 'goal-account-missing', severity: 'error', goalIds: [g.id], message: `Счёт цели «${g.name}» удалён: укажи новый счёт.` });
    else if (!g.accountId && g.savedAmount > 0) out.push({ code: 'goal-unlinked', severity: 'warn', goalIds: [g.id], message: `Расположение денег цели «${g.name}» не определено: привяжи цель к счёту.` }); }
  for (const t of s.transactions) if (!s.accounts.some(a => a.id === t.accountId) || (t.targetAccountId && !s.accounts.some(a => a.id === t.targetAccountId))) out.push({ code: 'tx-broken-ref', severity: 'warn', goalIds: [], message: `Операция от ${t.date} ссылается на удалённый счёт.` });
  return out;
}
