/**
 * Stops calling the AI service after repeated outages, so each ticket doesn't wait through timeouts and retries
 * while the service is down. After the cool-down the next call is let through: success closes the circuit,
 * another failure opens it again.
 */
export class CircuitBreaker {
  private consecutiveFailures = 0;
  private openUntil = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get state(): 'closed' | 'open' {
    return this.now() < this.openUntil ? 'open' : 'closed';
  }

  allowRequest(): boolean {
    return this.state === 'closed';
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) this.openUntil = this.now() + this.cooldownMs;
  }
}

export const aiCircuitBreaker = new CircuitBreaker(3, 60_000);
