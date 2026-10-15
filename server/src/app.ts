import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
  serveWebApp(app);
  app.use(errorHandler);

  return app;
}

const CLIENT_DIST = fileURLToPath(new URL('../../client/dist', import.meta.url));

/**
 * In production the API also serves the built React app, so the portal runs on a single origin: no CORS, and the
 * session cookie and event stream work without cross-site settings. In development Vite serves the app instead.
 */
function serveWebApp(app: express.Express) {
  if (!existsSync(CLIENT_DIST)) return;
  // Bundled assets have content hashes in their names, so they can be cached for a long time.
  app.use('/assets', express.static(join(CLIENT_DIST, 'assets'), { immutable: true, maxAge: '1y' }));
  app.use(express.static(CLIENT_DIST, { index: false }));
  // Any other path is a client-side route (e.g. /admin/tickets/abc), so it gets the app shell.
  // API paths and missing asset files fall through to a real 404 instead.
  app.get(/^\/(?!api\/|assets\/).*/, (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
}
