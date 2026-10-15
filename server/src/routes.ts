import { Router } from 'express';
import { authenticate } from './middleware/authenticate.js';
import { aiRouter } from './modules/ai/ai.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { authorsRouter } from './modules/authors/authors.routes.js';
import { booksRouter } from './modules/books/books.routes.js';
import { ticketsRouter } from './modules/tickets/tickets.routes.js';

export const apiRouter = Router();

// Login is public; /auth/me applies `authenticate` itself.
apiRouter.use('/auth', authRouter);

// Every route below requires a signed-in user. Role and ownership checks happen per route and in services.
apiRouter.use(authenticate);
apiRouter.use('/authors', authorsRouter);
apiRouter.use('/books', booksRouter);
apiRouter.use('/tickets', ticketsRouter);
apiRouter.use('/ai', aiRouter);
