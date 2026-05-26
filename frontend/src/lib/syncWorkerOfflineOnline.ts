import { useStore } from '@/stores';
import type { DoorscrieftRowInput } from '@/types';
import { syncPendingTransactions } from '@/lib/syncClient';
import { addPendingUuid, getPendingUuids, pickPendingTransactions, pendingCount, removePendingUuid } from '@/lib/syncOutbox';


let isSyncing = false;
let lastRunAt = 0;

const SYNC_INTERVAL_MS = 20_000;
const MIN_GAP_BETWEEN_RUNS_MS = 2_000;

function isOnlineNow(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine;
}

function syncOutboxFromStorePending(state: ReturnType<typeof useStore.getState>) {
  const pending = state.doorscrieftTransaksis.filter((t) => t.sync_status === 'pending');
  // Populate outbox from store (idempotent via addPendingUuid dedup)
  for (const row of pending) {
    addPendingUuid(String(row.id));
  }
}

async function runSyncOnce() {
  if (isSyncing) return;

  const now = Date.now();
  if (now - lastRunAt < MIN_GAP_BETWEEN_RUNS_MS) return;

  const state = useStore.getState();
  if (!state.user) return;
  if (!isOnlineNow()) return;

  // Ensure outbox reflects current store pending before reading uuids
  syncOutboxFromStorePending(state);

  if (pendingCount() <= 0) return;

  const uuids = getPendingUuids();
  if (!uuids.length) return;

  isSyncing = true;
  lastRunAt = now;
  let pendingRows: DoorscrieftRowInput[] = [];
  try {
    pendingRows = pickPendingTransactions(state.doorscrieftTransaksis, uuids);

    // only sync pending rows (server expects pending)
    const result = await syncPendingTransactions({ pending: pendingRows, source: 'frontend-store-offline-online' });

    if (result?.ok) {
      const ids = pendingRows.map((t) => t.id);
      state.markTransactionsSynced(ids);
      ids.forEach((id) => removePendingUuid(id));
      return;
    }

    // Non-ok path: treat as failed (server response indicates permanent issue)
    const ids = pendingRows.map((t) => t.id);
    state.markTransactionsFailed(ids);
  } catch (e) {
    const err = e as unknown;
    const message = (() => {
      if (typeof err === 'object' && err) {
        const maybeMessage = (err as { message?: unknown }).message;
        if (typeof maybeMessage === 'string') return maybeMessage;
      }
      return String(err);
    })();





    // Network errors: keep status as pending so it can retry on next online event.

    // (Do not mark failed on transient failures)
    const isLikelyNetworkError =
      /network|failed to fetch|fetch|timeout|ECONN|ENOTFOUND|EAI_AGAIN|offline|NetworkError/i.test(message);

    if (!isLikelyNetworkError) {
      // Likely server-side/validation issue -> mark failed
      const ids = pendingRows.map((t) => t.id);
      if (ids.length) state.markTransactionsFailed(ids);
    }


    // keep retrying later
    console.error('[SyncWorkerOfflineOnline] syncOnce error:', e);
  } finally {
    isSyncing = false;
  }
}

export function startSyncWorkerOfflineOnline(options?: { intervalMs?: number }) {
  const intervalMs = options?.intervalMs ?? SYNC_INTERVAL_MS;

  const onOnline = () => {
    // online event should trigger immediate attempt
    runSyncOnce();
  };

  if (typeof window === 'undefined') return undefined;

  window.addEventListener('online', onOnline);

  const timer = window.setInterval(() => {
    runSyncOnce();
  }, intervalMs);

  // initial attempt (only if online)
  if (isOnlineNow()) {
    runSyncOnce();
  }

  return () => {
    window.removeEventListener('online', onOnline);
    window.clearInterval(timer);
  };
}

export function isSyncingNow() {
  return isSyncing;
}

