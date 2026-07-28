export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly retryAfterSeconds: number;
}

export interface UpdateRateLimiter {
  consume(subjectKey: string): RateLimitDecision;
}

interface WindowState {
  readonly count: number;
  readonly endsAt: number;
}

export class FixedWindowUpdateRateLimiter implements UpdateRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly maximumUpdates: number,
    private readonly windowMilliseconds: number,
    private readonly maximumSubjects: number,
    private readonly now: () => number = Date.now,
  ) {
    if (
      !Number.isInteger(maximumUpdates) ||
      maximumUpdates <= 0 ||
      !Number.isInteger(windowMilliseconds) ||
      windowMilliseconds <= 0 ||
      !Number.isInteger(maximumSubjects) ||
      maximumSubjects <= 0
    ) {
      throw new RangeError('Rate-limit settings must be positive integers');
    }
  }

  consume(subjectKey: string): RateLimitDecision {
    const now = this.now();
    const existing = this.windows.get(subjectKey);
    if (!existing || existing.endsAt <= now) {
      this.evictExpiredOrOldest(now, subjectKey);
      this.windows.set(subjectKey, { count: 1, endsAt: now + this.windowMilliseconds });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (existing.count >= this.maximumUpdates) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.endsAt - now) / 1_000)),
      };
    }

    this.windows.delete(subjectKey);
    this.windows.set(subjectKey, { count: existing.count + 1, endsAt: existing.endsAt });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private evictExpiredOrOldest(now: number, incomingKey: string): void {
    for (const [key, state] of this.windows) {
      if (state.endsAt <= now) this.windows.delete(key);
    }
    if (!this.windows.has(incomingKey) && this.windows.size >= this.maximumSubjects) {
      const oldest = this.windows.keys().next().value;
      if (typeof oldest === 'string') this.windows.delete(oldest);
    }
  }
}
