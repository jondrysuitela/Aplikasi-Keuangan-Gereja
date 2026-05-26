import { Router } from 'express';
import { syncController } from '../controllers/sync.controller.js';

export const syncRoutes = Router();

syncRoutes.post('/transactions', syncController.upsertTransactions);

