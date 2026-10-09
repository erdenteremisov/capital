export const rubToKopecks = (rub: number): number => Math.round(rub * 100);
/** "1 850,5" -> 185050 | null */
export function parseRub(input: string): number | null { const n = parseFloat(input.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? rubToKopecks(n) : null; }
export const formatRub = (k: number): string => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(Math.round((Number.isFinite(k) ? k : 0) / 100)).replace('\u2212', '-');
