import { describe, expect, it } from 'vitest';

import { FixedWindowUpdateRateLimiter } from '../src/interfaces/telegram/update-rate-limiter.js';

describe('Telegram update rate limiter', () => {
  it('allows the configured burst and reports a bounded retry delay', () => {
    let now = 1_000;
    const limiter = new FixedWindowUpdateRateLimiter(2, 10_000, 10, () => now);

    expect(limiter.consume('resident-a')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.consume('resident-a')).toEqual({ allowed: true, retryAfterSeconds: 0 });
    expect(limiter.consume('resident-a')).toEqual({ allowed: false, retryAfterSeconds: 10 });
    now = 11_000;
    expect(limiter.consume('resident-a')).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it('isolates subjects and remains deterministic under a concurrent burst', async () => {
    const limiter = new FixedWindowUpdateRateLimiter(20, 60_000, 100, () => 5_000);
    const decisions = await Promise.all(
      Array.from({ length: 100 }, () => Promise.resolve(limiter.consume('same-subject'))),
    );

    expect(decisions.filter(({ allowed }) => allowed)).toHaveLength(20);
    expect(limiter.consume('different-subject').allowed).toBe(true);
  });

  it('rejects unsafe configuration', () => {
    expect(() => new FixedWindowUpdateRateLimiter(0, 1, 1)).toThrow(RangeError);
    expect(() => new FixedWindowUpdateRateLimiter(1, 0, 1)).toThrow(RangeError);
    expect(() => new FixedWindowUpdateRateLimiter(1, 1, 0)).toThrow(RangeError);
  });
});
