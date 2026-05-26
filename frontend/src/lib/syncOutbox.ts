import type { DoorscrieftRowInput } from '@/types';

const OUTBOX_KEY = 'keuangan-gereja-sync-outbox-v1';

export type SyncOutboxState = {
  pendingUuids: string[]; // dedup list
};

function safeParse(raw: string | null): SyncOutboxState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.pendingUuids)) return null;
    // ensure strings
    return { pendingUuids: parsed.pendingUuids.map(String) };
  } catch {
    return null;
  }
}

export function loadOutbox(): SyncOutboxState {
  if (typeof localStorage === 'undefined') {
    return { pendingUuids: [] };
  }
  const st = safeParse(localStorage.getItem(OUTBOX_KEY));
  return st ?? { pendingUuids: [] };
}

export function saveOutbox(st: SyncOutboxState) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(st));
}

export function addPendingUuid(uuid: string) {
  const st = loadOutbox();
  if (!uuid) return;
  if (st.pendingUuids.includes(uuid)) return;
  st.pendingUuids.push(uuid);
  saveOutbox(st);
}

export function removePendingUuid(uuid: string) {
  const st = loadOutbox();
  st.pendingUuids = st.pendingUuids.filter((u) => u !== uuid);
  saveOutbox(st);
}

export function getPendingUuids(): string[] {
  return loadOutbox().pendingUuids;
}

export function pendingCount(): number {
  return getPendingUuids().length;
}

// Utility: ambil transaksi pending berdasarkan UUID list
export function pickPendingTransactions(transactions: DoorscrieftRowInput[], uuids: string[]): DoorscrieftRowInput[] {
  const set = new Set(uuids);
  return transactions.filter((t) => set.has(t.id));
}

