import { AiStatus } from '@prisma/client';
import { aiCircuitBreaker } from '../ai/circuitBreaker.js';
import { classifyTicket } from '../ai/classifier.js';
import { getAiClient } from '../ai/client.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

/*
 * Classification runs in the background so creating a ticket never waits on, or fails because of, the AI.
 *
 * This is an in-process queue: fine for a single server, and the sweep below recovers anything lost in a restart
 * because state lives in the database (aiStatus). With several servers this would move to a shared job queue.
 */

const SWEEP_INTERVAL_MS = 2 * 60 * 1000;
const MAX_AI_ATTEMPTS = 3;
const SWEEP_BATCH_SIZE = 20;

const queue = new Set<string>();
let draining = false;
let sweepTimer: NodeJS.Timeout | undefined;

export function enqueueClassification(ticketId: string): void {
  queue.add(ticketId);
  void drain();
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    // A Set iterates over ids added while draining, too.
    for (const ticketId of queue) {
      queue.delete(ticketId);
      try {
        await classifyTicket(ticketId);
      } catch (error) {
        logger.error({ err: error, ticketId }, 'Ticket classification failed');
      }
    }
  } finally {
    draining = false;
  }
}

/**
 * Picks up tickets that were never classified (e.g. the server restarted with work queued) and retries tickets
 * that fell back to keyword rules while the AI was unavailable.
 */
export async function sweepUnclassifiedTickets(): Promise<void> {
  const aiAvailable = getAiClient() !== null && aiCircuitBreaker.allowRequest();
  const tickets = await prisma.ticket.findMany({
    where: {
      OR: [
        { aiStatus: AiStatus.PENDING },
        ...(aiAvailable ? [{ aiStatus: AiStatus.FALLBACK, aiAttempts: { lt: MAX_AI_ATTEMPTS } }] : []),
      ],
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: SWEEP_BATCH_SIZE,
  });
  tickets.forEach((ticket) => enqueueClassification(ticket.id));
}

export function startClassificationWorker(): void {
  const sweep = () => sweepUnclassifiedTickets().catch((error) => logger.error({ err: error }, 'Classification sweep failed'));
  void sweep();
  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  sweepTimer.unref();
}

export function stopClassificationWorker(): void {
  clearInterval(sweepTimer);
}
