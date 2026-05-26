import { useStore } from '@/stores';
import { syncPendingTransactions } from '@/lib/syncClient';
import { getPendingUuids, pendingCount, pickPendingTransactions } from '@/lib/syncOutbox';

let isSyncing = false;

const SYNC_INTERVAL_MS = 30_000;

export function startSyncWorker(options?: { intervalMs?: number }) {
  const intervalMs = options?.intervalMs ?? SYNC_INTERVAL_MS;

  const syncOnce = async () => {
    if (isSyncing) return;

    const state = useStore.getState();
    if (!state.user) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    if (pendingCount() <= 0) return;

    const uuids = getPendingUuids();
    if (!uuids.length) return;

    isSyncing = true;
    try {
      const pendingRows = pickPendingTransactions(state.doorscrieftTransaksis, uuids);
      if (pendingRows.length === 0) return;

      const result = await syncPendingTransactions({ pending: pendingRows, source: 'frontend-store' });

      // Contract saat ini: { ok: boolean; received: number }
      if (result?.ok) {
        const ids = pendingRows.map((t) => t.id);
        state.markTransactionsSynced(ids);
        ids.forEach((id) => state.removePendingUuid(id));
      } else {
        const ids = pendingRows.map((t) => t.id);
        state.markTransactionsFailed(ids);
      }
    } catch (e) {
      const uuidsNow = getPendingUuids();
      if (uuidsNow.length > 0) {
        state.markTransactionsFailed(uuidsNow);
      }
      console.error('[SyncWorker] syncOnce error:', e);
    } finally {
      isSyncing = false;
    }
  };

  const onOnline = () => {
    syncOnce();
  };

  if (typeof window === 'undefined') return undefined;

  window.addEventListener('online', onOnline);

  const timer = window.setInterval(() => {
    syncOnce();
  }, intervalMs);

  // do an initial attempt
  onOnline();

  return () => {
    window.removeEventListener('online', onOnline);
    window.clearInterval(timer);
  };
}

export function isSyncingNow() {
  return isSyncing;
}

