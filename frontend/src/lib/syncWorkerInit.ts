import { startSyncWorker } from '@/lib/syncWorker';
import { startSyncWorkerOfflineOnline } from '@/lib/syncWorkerOfflineOnline';

let cleanupLegacy: (() => void) | null = null;
let cleanupNew: (() => void) | null = null;

export function initSyncWorkerOnce() {
  // Keep legacy worker as-is (do not delete code)
  if (!cleanupLegacy) cleanupLegacy = startSyncWorker() ?? null;

  // Start the new offline/online worker
  if (!cleanupNew) cleanupNew = startSyncWorkerOfflineOnline() ?? null;
}


export function stopSyncWorker() {
  cleanupLegacy?.();
  cleanupLegacy = null;

  cleanupNew?.();
  cleanupNew = null;
}



