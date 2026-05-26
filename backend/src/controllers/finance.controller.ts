import { financeService } from '../services/finance.service.js';
import type { Request, Response } from 'express';

function parseMonthYear(query: any) {

  const year = Number(query.year);
  const month = query.month !== undefined ? Number(query.month) : undefined;
  if (!Number.isFinite(year)) throw new Error('Invalid year');
  if (month !== undefined && !Number.isFinite(month)) throw new Error('Invalid month');
  return { year, month };
}

export const financeController = {

  summary: async (req: Request, res: Response) => {


    try {
      const { year, month } = parseMonthYear(req.query);
      const data = await financeService.summary({ year, month });
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return res.status(400).json({
        error: 'Bad request',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },

  monthlyChart: async (req: Request, res: Response) => {

    try {
      const year = Number(req.query.year);
      if (!Number.isFinite(year)) throw new Error('Invalid year');
      const data = await financeService.monthlyChart({ year });
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return res.status(400).json({
        error: 'Bad request',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },

  categories: async (req: Request, res: Response) => {
    try {
      const { year, month } = parseMonthYear(req.query);
      const data = await financeService.categories({ year, month });
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return res.status(400).json({
        error: 'Bad request',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },

  recentTransactions: async (req: Request, res: Response) => {
    try {
      const { year, month } = parseMonthYear(req.query);
      const data = await financeService.recentTransactions({ year, month });
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      return res.status(400).json({
        error: 'Bad request',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  },
};

