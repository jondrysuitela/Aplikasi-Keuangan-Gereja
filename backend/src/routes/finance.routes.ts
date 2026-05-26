import { Router } from 'express';
import { financeController } from '../controllers/finance.controller.js';

export const financeRoutes = Router();

financeRoutes.get('/summary', financeController.summary);
financeRoutes.get('/monthly-chart', financeController.monthlyChart);
financeRoutes.get('/categories', financeController.categories);
financeRoutes.get('/recent-transactions', financeController.recentTransactions);

