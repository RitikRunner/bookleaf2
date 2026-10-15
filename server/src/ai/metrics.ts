import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { aiCircuitBreaker } from './circuitBreaker.js';
import { getAiClient } from './client.js';

/**
 * How the AI is doing, for the admin dashboard: spend and reliability per operation, how often admins correct
 * the AI's classification (a running accuracy signal), and how often drafts are sent as written.
 */
export async function getAiMetrics() {
  const [usage, failures, classification, drafts] = await Promise.all([
    prisma.aiUsageLog.groupBy({
      by: ['operation'],
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, cacheReadTokens: true, costMicroUsd: true },
      _avg: { latencyMs: true },
    }),
    prisma.aiUsageLog.groupBy({ by: ['operation'], where: { success: false }, _count: { _all: true } }),
    classificationStats(),
    draftStats(),
  ]);

  return {
    status: {
      enabled: getAiClient() !== null,
      circuit: aiCircuitBreaker.state,
      models: { classification: env.AI_CLASSIFY_MODEL, draft: env.AI_DRAFT_MODEL },
    },
    usage: usage.map((row) => {
      const calls = row._count._all;
      const costUsd = (row._sum.costMicroUsd ?? 0) / 1_000_000;
      return {
        operation: row.operation,
        calls,
        failures: failures.find((failure) => failure.operation === row.operation)?._count._all ?? 0,
        inputTokens: row._sum.inputTokens ?? 0,
        outputTokens: row._sum.outputTokens ?? 0,
        cacheReadTokens: row._sum.cacheReadTokens ?? 0,
        costUsd,
        avgCostUsd: calls ? costUsd / calls : 0,
        avgLatencyMs: Math.round(row._avg.latencyMs ?? 0),
      };
    }),
    classification,
    drafts,
  };
}

async function classificationStats() {
  const [row] = await prisma.$queryRaw<
    { total: number; byAi: number; byRules: number; pending: number; categoryCorrections: number; priorityCorrections: number }[]
  >`
    SELECT
      COUNT(*)::int AS "total",
      COUNT(*) FILTER (WHERE "aiStatus" = 'COMPLETED')::int AS "byAi",
      COUNT(*) FILTER (WHERE "aiStatus" = 'FALLBACK')::int AS "byRules",
      COUNT(*) FILTER (WHERE "aiStatus" = 'PENDING')::int AS "pending",
      COUNT(*) FILTER (WHERE "categorySource" = 'ADMIN' AND "aiCategory" IS NOT NULL AND "category" <> "aiCategory")::int AS "categoryCorrections",
      COUNT(*) FILTER (WHERE "prioritySource" = 'ADMIN' AND "aiPriority" IS NOT NULL AND "priority" <> "aiPriority")::int AS "priorityCorrections"
    FROM "Ticket"
  `;
  const stats = row ?? { total: 0, byAi: 0, byRules: 0, pending: 0, categoryCorrections: 0, priorityCorrections: 0 };
  return {
    ...stats,
    // Share of AI-classified tickets whose category no admin had to change.
    categoryAgreementRate: stats.byAi ? 1 - stats.categoryCorrections / stats.byAi : null,
  };
}

async function draftStats() {
  const [generated, sentAsWritten, sentEdited] = await Promise.all([
    prisma.aiDraft.count(),
    prisma.ticketMessage.count({ where: { aiDraftId: { not: null }, draftEdited: false } }),
    prisma.ticketMessage.count({ where: { aiDraftId: { not: null }, draftEdited: true } }),
  ]);
  return { generated, sentAsWritten, sentEdited };
}
