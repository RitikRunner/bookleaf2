import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { isAiConfigured } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { apiRouter } from './routes.js';

export function createApp() {
  const app = express();

  // Hosting platforms terminate TLS at a proxy; trusting one hop gives correct client IPs for rate limiting.
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  app.get('/api/health', async (_req, res) => {
    const database = await prisma.$queryRaw`SELECT 1`.then(
      () => 'up',
      () => 'down',
    );
    res.status(database === 'up' ? 200 : 503).json({
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      ai: isAiConfigured ? 'enabled' : 'disabled',
    });
  });

  app.use('/api/v1', apiRouter);
  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
