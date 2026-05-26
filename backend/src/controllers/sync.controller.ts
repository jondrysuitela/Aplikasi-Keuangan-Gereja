import { z } from 'zod';
import { syncService } from '../services/sync.service.js';
import type { Request, Response } from 'express';

const SyncTransactionSchema = z.object({

  // UUID required for upsert
  uuid: z.string().min(1),

  // domain fields
  tanggal: z.string().min(1), // ISO string
  no: z.string().min(1),
  uraian: z.string().min(1),
  kode_anggaran: z.string().min(1),
  mata_anggaran: z.string().min(1),
  lembar_id: z.string().nullable().optional(),
  penerimaan: z.number().nonnegative().default(0),
  pengeluaran: z.number().nonnegative().default(0),

  // soft delete
  deleted_at: z.string().nullable().optional(),

  // created/updated
  created_at: z.string().min(1).optional(),
  updated_at: z.string().min(1).optional(),

  // public visibility
  is_public: z.boolean().default(true),

  // auditing
  created_by: z.string().optional(),
  deleted_by: z.string().optional(),
});

const PayloadSchema = z.object({
  transactions: z.array(SyncTransactionSchema).min(1),
  source: z.string().optional(),
});

export const syncController = {
  upsertTransactions: async (req: Request, res: Response) => {

    const parsed = PayloadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    try {
      const result = await syncService.upsertTransactions(parsed.data.transactions);
      return res.status(200).json({
        ok: true,
        ...result,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[syncController] upsert failed', err);
      return res.status(500).json({
        error: 'Sync failed',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

