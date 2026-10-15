import { FinishReason, ThinkingLevel, type GenerateContentResponse } from '@google/genai';
import type { AiOperation } from '@prisma/client';
import { z } from 'zod';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';
import { aiCircuitBreaker } from './circuitBreaker.js';
import { getAiClient } from './client.js';
import { AiOutputError, AiUnavailableError, classifyAiError, isOutage, type AiFailureReason } from './errors.js';
import { estimateCostMicroUsd, type TokenUsage } from './pricing.js';

export interface StructuredRequest<T extends z.ZodType> {
  operation: AiOperation;
  model: string;
  promptVersion: string;
  /**
   * Stable instructions, most stable first. Gemini caches repeated prompt prefixes automatically,
   * so per-ticket content is kept out of here and sent as `prompt`.
   */
  system: string[];
  /** Per-ticket content: facts, the ticket, recent conversation. */
  prompt: string;
  schema: T;
  maxOutputTokens: number;
  thinking: 'low' | 'medium' | 'high';
  timeoutMs: number;
  maxRetries: number;
  ticketId?: string;
  /** Usage is logged to the database by default; the offline eval turns this off. */
  logUsage?: boolean;
}

export interface CallStats extends TokenUsage {
  costMicroUsd: number;
  latencyMs: number;
}

const THINKING_LEVELS = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH } as const;

/** Finish reasons meaning the model or its safety filters declined to answer. */
const BLOCKED_FINISH_REASONS = new Set<FinishReason>([
  FinishReason.SAFETY,
  FinishReason.RECITATION,
  FinishReason.BLOCKLIST,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.SPII,
]);

/**
 * The single entry point for model calls. Everything that should be true of every call lives here:
 * JSON output constrained by a schema and validated with Zod, timeouts and retries, the circuit breaker,
 * and a usage/cost record for every call, successful or not.
 */
export async function generateStructured<T extends z.ZodType>(
  request: StructuredRequest<T>,
): Promise<{ output: z.output<T>; stats: CallStats }> {
  const client = getAiClient();
  if (!client) throw new AiUnavailableError('disabled');
  if (!aiCircuitBreaker.allowRequest()) throw new AiUnavailableError('circuit_open');

  const startedAt = Date.now();
  let usage: TokenUsage | undefined;
  try {
    const response = await client.models.generateContent({
      model: request.model,
      contents: request.prompt,
      config: {
        systemInstruction: request.system.join('\n\n'),
        responseMimeType: 'application/json',
        responseJsonSchema: responseSchemaFor(request.schema),
        maxOutputTokens: request.maxOutputTokens,
        thinkingConfig: { thinkingLevel: THINKING_LEVELS[request.thinking] },
        // Retries 408/429/5xx with exponential backoff; the timeout applies to each attempt.
        httpOptions: {
          timeout: request.timeoutMs,
          retryOptions: { attempts: request.maxRetries + 1, initialDelay: 1, maxDelay: 8 },
        },
      },
    });
    usage = tokenUsage(response);
    const output = parseOutput(response, request.schema, usage);

    aiCircuitBreaker.recordSuccess();
    const stats = toStats(request.model, usage, Date.now() - startedAt);
    await recordUsage(request, stats, null);
    return { output, stats };
  } catch (error) {
    const reason = classifyAiError(error);
    if (isOutage(reason)) aiCircuitBreaker.recordFailure();

    await recordUsage(request, toStats(request.model, usage, Date.now() - startedAt), reason);
    logger.warn(
      { reason, operation: request.operation, model: request.model, ticketId: request.ticketId, detail: summarize(error) },
      'AI call failed',
    );
    throw new AiUnavailableError(reason);
  }
}

/** One line for the log; provider errors can carry kilobytes of JSON. */
function summarize(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 200 ? `${message.slice(0, 200)}…` : message;
}

/** The JSON Schema sent to Gemini to constrain the response; Zod re-validates what comes back. */
function responseSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema;
}

function parseOutput<T extends z.ZodType>(response: GenerateContentResponse, schema: T, usage: TokenUsage): z.output<T> {
  const finishReason = response.candidates?.[0]?.finishReason;
  if (response.promptFeedback?.blockReason || (finishReason && BLOCKED_FINISH_REASONS.has(finishReason))) {
    throw new AiOutputError('refusal', usage);
  }
  const text = response.text;
  if (finishReason === FinishReason.MAX_TOKENS || !text) throw new AiOutputError('invalid_output', usage);

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiOutputError('invalid_output', usage);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new AiOutputError('invalid_output', usage);
  return parsed.data;
}

function tokenUsage(response: GenerateContentResponse): TokenUsage {
  const metadata = response.usageMetadata;
  const cached = metadata?.cachedContentTokenCount ?? 0;
  return {
    // Gemini counts cached tokens inside promptTokenCount; split them out so each is priced correctly.
    inputTokens: (metadata?.promptTokenCount ?? 0) - cached,
    outputTokens: (metadata?.candidatesTokenCount ?? 0) + (metadata?.thoughtsTokenCount ?? 0),
    cacheReadTokens: cached,
  };
}

function toStats(model: string, usage: TokenUsage | undefined, latencyMs: number): CallStats {
  const tokens = usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
  return { ...tokens, costMicroUsd: estimateCostMicroUsd(model, tokens), latencyMs };
}

/** Best effort: failing to write a log row must never break the feature that made the call. */
async function recordUsage(
  request: StructuredRequest<z.ZodType>,
  stats: CallStats,
  errorType: AiFailureReason | null,
): Promise<void> {
  if (request.logUsage === false) return;
  try {
    await prisma.aiUsageLog.create({
      data: {
        operation: request.operation,
        model: request.model,
        promptVersion: request.promptVersion,
        ticketId: request.ticketId,
        success: errorType === null,
        errorType,
        ...stats,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to record AI usage');
  }
}
