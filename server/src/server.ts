import { createApp } from './app.js';
import { env, isAiConfigured } from './config/env.js';
import { startClassificationWorker, stopClassificationWorker } from './jobs/classificationWorker.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';

const server = createApp().listen(env.PORT, () => {
  logger.info(`BookLeaf support API listening on http://localhost:${env.PORT}`);
  logger.info(isAiConfigured ? 'AI assistance enabled' : 'AI assistance disabled: keyword triage and manual replies only');
  startClassificationWorker();
});

function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  stopClassificationWorker();
  server.close(() => {
    void prisma.$disconnect().finally(() => process.exit(0));
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
