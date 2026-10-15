import { Router } from 'express';
import { z } from 'zod';
import { currentUser } from '../../middleware/authenticate.js';
import { parse } from '../../lib/validation.js';
import * as booksService from './books.service.js';

// `authorId` lets admins narrow the list; for authors the access scope overrides it.
const listBooksQuery = z.object({ authorId: z.string().trim().min(1).optional() });

export const booksRouter = Router();

booksRouter.get('/', async (req, res) => {
  const query = parse(listBooksQuery, req.query, 'query');
  res.json({ data: await booksService.listBooks(currentUser(req), query) });
});

booksRouter.get('/:bookId', async (req, res) => {
  res.json({ data: await booksService.getBook(currentUser(req), req.params.bookId) });
});
