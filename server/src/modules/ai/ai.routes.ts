import { Router } from 'express';
import { getAiMetrics } from '../../ai/metrics.js';
import { requireRole } from '../../middleware/authenticate.js';

export const aiRouter = Router();

aiRouter.get('/metrics', requireRole('ADMIN'), async (_req, res) => {
  res.json({ data: await getAiMetrics() });
});
