import { supabaseAdmin } from '../config/supabase.js';

import type { SyncTransaction } from '../types/finance.js';

export const syncService = {
  upsertTransactions: async (transactions: SyncTransaction[]) => {
    // Upsert by uuid. We assume Supabase table has unique(uuid)
    // and columns match payload naming (mapped in controller for now).

    const payload = transactions.map((t) => ({
      uuid: t.uuid,
      tanggal: t.tanggal,
      no: t.no,
      uraian: t.uraian,
      kode_anggaran: t.kode_anggaran,
      mata_anggaran: t.mata_anggaran,
      lembar_id: t.lembar_id ?? null,
      penerimaan: t.penerimaan,
      pengeluaran: t.pengeluaran,
      deleted_at: t.deleted_at ?? null,
      created_at: t.created_at ?? new Date().toISOString(),
      updated_at: t.updated_at ?? new Date().toISOString(),
      is_public: t.is_public,
      created_by: t.created_by ?? null,
      deleted_by: t.deleted_by ?? null,
    }));

    const { error, data } = await supabaseAdmin
      .from('transactions')
      .upsert(payload, {
        onConflict: 'uuid',
      });

    if (error) {
      throw new Error(error.message);
    }

    return {
      upserted: payload.length,
      representation: data || null,
    };
  },
};

