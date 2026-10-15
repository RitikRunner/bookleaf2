import { ApiError } from '@google/genai';
import { AppError } from '../lib/errors.js';
import type { TokenUsage } from './pricing.js';

export type AiFailureReason =
  | 'disabled' // no API key, or AI_ENABLED=false
  | 'circuit_open' // recent calls kept failing; skipping calls for a cool-down period
  | 'auth'
  | 'rate_limited'
  | 'timeout'
  | 'connection'
  | 'server_error'
  | 'bad_request'
  | 'refusal'
  | 'invalid_output'
  | 'unknown';

/** Failures that mean the AI service is unreachable or unusable right now, rather than one bad request. */
const OUTAGE_REASONS = new Set<AiFailureReason>(['auth', 'rate_limited', 'timeout', 'connection', 'server_error']);

export function isOutage(reason: AiFailureReason): boolean {
  return OUTAGE_REASONS.has(reason);
}

/** A response we can't use (blocked, cut short, or not matching the schema), with its token usage so the cost is still recorded. */
export class AiOutputError extends Error {
  constructor(
    readonly reason: 'refusal' | 'invalid_output',
    readonly usage?: TokenUsage,
  ) {
    super(`AI output unusable: ${reason}`);
  }
}

/** Raised to callers whenever AI can't help. Features catch it and fall back; over HTTP it becomes a 503. */
export class AiUnavailableError extends AppError {
  constructor(readonly reason: AiFailureReason) {
    super(503, 'AI_UNAVAILABLE', 'AI assistance is unavailable right now. You can still write and send a reply manually.', {
      reason,
    });
  }
}

/** Maps SDK and network errors to a small set of reasons. */
export function classifyAiError(error: unknown): AiFailureReason {
  if (error instanceof AiUnavailableError) return error.reason;
  if (error instanceof AiOutputError) return error.reason;
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return 'auth';
    if (error.status === 429) return 'rate_limited';
    if (error.status === 408 || error.status === 504) return 'timeout';
    if (error.status >= 500) return 'server_error';
    return 'bad_request';
  }
  // The SDK enforces timeouts by aborting the request.
  if (isNamedError(error, 'AbortError') || isNamedError(error, 'TimeoutError')) return 'timeout';
  // fetch() rejects with a TypeError when the network request itself fails.
  if (error instanceof TypeError) return 'connection';
  return 'unknown';
}

function isNamedError(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === name;
}
