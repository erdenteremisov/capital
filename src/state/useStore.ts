import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState } from '../types/models.ts';
import { createEmptyState } from '../types/models.ts';
import { idbBackend, memoryBackend, openDatabase } from '../db/database.ts';
import type { StoreBackend } from '../db/database.ts';
import { loadState, saveState } from '../db/repositories.ts';
import type { Result } from '../finance/ops.ts';
/** Состояние приложения + запись в IndexedDB после каждого изменения. Данные не покидают устройство. */
export function useStore() {
  const [state, setState] = useState<AppState | null>(null), [persisted, setPersisted] = useState(true), ref = useRef<AppState>(createEmptyState()), be = useRef<StoreBackend>(memoryBackend());
  useEffect(() => { (async () => { try { be.current = idbBackend(await openDatabase()); } catch { setPersisted(false); } ref.current = await loadState(be.current); setState(ref.current); })(); }, []);
  const commit = useCallback(async (next: AppState) => { ref.current = next; setState(next); try { await saveState(be.current, next); } catch { setPersisted(false); } }, []);
  /** Выполняет чистую операцию движка; при ошибках валидации состояние не меняется. */
  const run = useCallback((op: (s: AppState) => Result): string[] => { const r = op(ref.current); if (!r.errors.length) void commit(r.state); return r.errors; }, [commit]);
  return { state, persisted, commit, run };
}
