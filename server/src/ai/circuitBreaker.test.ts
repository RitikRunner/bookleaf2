import { describe, expect, it } from 'vitest';
import { CircuitBreaker } from './circuitBreaker.js';
import { estimateCostMicroUsd } from './pricing.js';

describe('CircuitBreaker', () => {
  function setup() {
    let now = 0;
    const breaker = new CircuitBreaker(3, 60_000, () => now);
    return { breaker, advance: (ms: number) => (now += ms) };
  }

  it('opens after consecutive failures and lets a trial request through after the cool-down', () => {
    const { breaker, advance } = setup();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.allowRequest()).toBe(true);

    breaker.recordFailure();
    expect(breaker.state).toBe('open');
    expect(breaker.allowRequest()).toBe(false);

    advance(60_000);
    expect(breaker.allowRequest()).toBe(true);
  });

  it('re-opens immediately if the trial request fails, and closes if it succeeds', () => {
    const { breaker, advance } = setup();
    [1, 2, 3].forEach(() => breaker.recordFailure());
    advance(60_000);

    breaker.recordFailure();
    expect(breaker.state).toBe('open');

    advance(60_000);
    breaker.recordSuccess();
    expect(breaker.state).toBe('closed');
    breaker.recordFailure();
    expect(breaker.state).toBe('closed'); // the failure count was reset
  });
});

describe('estimateCostMicroUsd', () => {
  it('prices input, output and cache tokens', () => {
    // gemini-3.1-flash-lite: $0.25 / $1.50 per million; cache reads at 10% of input.
    const usage = { inputTokens: 800, outputTokens: 120, cacheReadTokens: 600 };
    expect(estimateCostMicroUsd('gemini-3.1-flash-lite', usage)).toBe(395); // 200 + 15 + 180
  });

  it('returns 0 for an unknown model rather than guessing', () => {
    expect(estimateCostMicroUsd('some-other-model', { inputTokens: 1000, outputTokens: 1000, cacheReadTokens: 0 })).toBe(0);
  });
});
