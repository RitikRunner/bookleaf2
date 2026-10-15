/**
 * Gemini API paid-tier list prices in USD per million tokens (text, standard tier). Used for cost estimates.
 * On the free tier the actual bill is zero; estimating at paid prices keeps the numbers meaningful for production.
 */
const PRICES_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
  'gemini-3.1-flash-lite': { input: 0.25, output: 1.5 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-3.6-flash': { input: 0.75, output: 3.75 },
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
};

// Cached prompt tokens are billed at 10% of the input rate. Implicit caching has no write fee.
const CACHE_READ_MULTIPLIER = 0.1;

export interface TokenUsage {
  /** Prompt tokens that were not served from cache. */
  inputTokens: number;
  /** Response and thinking tokens (both billed as output). */
  outputTokens: number;
  cacheReadTokens: number;
}

/** Estimated cost in micro-USD. Dollars per million tokens × tokens = millionths of a dollar. */
export function estimateCostMicroUsd(model: string, usage: TokenUsage): number {
  const price = PRICES_PER_MTOK[model];
  if (!price) return 0;
  const billedInput = usage.inputTokens + usage.cacheReadTokens * CACHE_READ_MULTIPLIER;
  return Math.round(billedInput * price.input + usage.outputTokens * price.output);
}
