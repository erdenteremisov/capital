export const DB_NAME = 'my-capital';
export const DB_VERSION = 2; // v1 — прототип (один store "kv"); v2 — отдельные stores по сущностям
export const STORES = ['accounts', 'transactions', 'categories', 'goals', 'recurringPayments', 'incomeSources', 'debts', 'settings'] as const;
export type StoreName = typeof STORES[number];
/** Единственная точка доступа к хранилищу. Реализации: IndexedDB (браузер) и память (тесты). */
export interface StoreBackend { getAll(store: StoreName): Promise<unknown[]>; replaceMany(data: Partial<Record<StoreName, unknown[]>>): Promise<void> }
export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION);
    r.onupgradeneeded = () => { const db = r.result; for (const n of STORES) if (!db.objectStoreNames.contains(n)) db.createObjectStore(n, { keyPath: 'id' }); if (db.objectStoreNames.contains('kv')) db.deleteObjectStore('kv'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('IndexedDB заблокирована другой вкладкой'));
  });
}
export const idbBackend = (db: IDBDatabase): StoreBackend => ({
  getAll: n => new Promise((res, rej) => { const q = db.transaction(n).objectStore(n).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }),
  /** Все stores заменяются в одной транзакции: либо всё, либо ничего. */
  replaceMany: data => new Promise((res, rej) => {
    const names = Object.keys(data) as StoreName[], t = db.transaction(names, 'readwrite');
    for (const n of names) { const st = t.objectStore(n); st.clear(); for (const x of data[n]!) st.put(x); }
    t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  }),
});
export const memoryBackend = (): StoreBackend => { const m = new Map<string, unknown[]>(); return { getAll: async n => structuredClone(m.get(n) ?? []), replaceMany: async d => { for (const [k, v] of Object.entries(d)) m.set(k, structuredClone(v)); } }; };
