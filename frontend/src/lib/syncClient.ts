import type { DoorscrieftRowInput } from '@/types';

export type SyncPayload = {
  transactions: {
    uuid: string;
    tanggal: string;
    no: string;
    uraian: string;
    kode_anggaran: string;
    mata_anggaran: string;
    lembar_id?: string | null;
    penerimaan: number;
    pengeluaran: number;
    deleted_at?: string | null;
    created_at?: string;
    updated_at?: string;
    is_public: boolean;
    created_by?: string | null;
    deleted_by?: string | null;
  }[];
  source?: string;
};

function getSyncBaseUrl() {
  // Default backend API for local dev
  return (import.meta as any).env?.VITE_SYNC_BASE_URL || 'http://localhost:4000';
}

function normalizeToIsoString(d: unknown): string {
  if (d instanceof Date) return d.toISOString();
  const dt = new Date(String(d));
  if (Number.isNaN(dt.getTime())) {
    throw new Error(`Invalid date for sync: ${String(d)}`);
  }
  return dt.toISOString();
}

function validateTxForSync(tx: DoorscrieftRowInput) {
  // Jangan sync jika data penting tidak ada.
  if (!tx.id) throw new Error('Missing tx.id');
  if (!tx.no) throw new Error('Missing tx.no');
  if (!tx.uraian) throw new Error('Missing tx.uraian');
  if (!tx.kodeAnggaran) throw new Error('Missing tx.kodeAnggaran');
  if (!tx.mataAnggaran) throw new Error('Missing tx.mataAnggaran');
  if (!(tx.tanggal instanceof Date) && typeof (tx.tanggal as any) !== 'string') {
    // tanggal sekarang di store adalah Date, tapi fallback tetap disiapkan.
  }
}

export async function syncPendingTransactions(params: {
  pending: DoorscrieftRowInput[];
  source?: string;
}): Promise<{ ok: boolean; received: number }> {
  const { pending, source } = params;
  if (!Array.isArray(pending) || pending.length === 0) {
    return { ok: true, received: 0 };
  }

  // Jangan langsung sync semua data: sync hanya yang sync_status=pending (validasi ulang di layer ini)
  const toSync = pending.filter((t) => t.sync_status === 'pending');
  if (toSync.length === 0) return { ok: true, received: 0 };

  const payload: SyncPayload = {
    transactions: toSync.map((t) => {
      validateTxForSync(t);
      return {
        uuid: t.id, // uuid = id agar upsert konsisten
        tanggal: normalizeToIsoString(t.tanggal),
        no: String(t.no),
        uraian: String(t.uraian),
        kode_anggaran: String(t.kodeAnggaran),
        mata_anggaran: String(t.mataAnggaran),
        lembar_id: (t.lembarId as any) ?? null,
        penerimaan: Number(t.penerimaan || 0),
        pengeluaran: Number(t.pengeluaran || 0),
        deleted_at: t.deleted_at ?? undefined,
        created_at: t.created_at ?? undefined,
        updated_at: t.updated_at ?? undefined,
        is_public: Boolean(t.is_public ?? true),
        created_by: (t.createdBy as any) ?? null,
        deleted_by: null,
      };
    }),
    source,
  };

  // Jangan sync tanpa validasi ukuran payload (limit untuk mencegah request terlalu besar)
  const MAX_BATCH = 200;
  const limited = payload.transactions.slice(0, MAX_BATCH);

  const res = await fetch(`${getSyncBaseUrl()}/api/sync/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...payload, transactions: limited }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Sync failed: ${res.status} ${text}`);
  }

  return { ok: true, received: limited.length };
}

