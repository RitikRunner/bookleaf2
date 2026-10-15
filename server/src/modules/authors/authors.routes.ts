import { Router } from 'express';
import { currentUser, requireRole } from '../../middleware/authenticate.js';
import * as authorsService from './authors.service.js';

export const authorsRouter = Router();

authorsRouter.get('/', requireRole('ADMIN'), async (_req, res) => {
  res.json({ data: await authorsService.listAuthors() });
});

authorsRouter.get('/:authorId', async (req, res) => {
  res.json({ data: await authorsService.getAuthor(currentUser(req), req.params.authorId) });
});
