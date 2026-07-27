import { describe, expect, it } from 'vitest';

import { decideNotificationRetry } from '../src/domain/notifications/notification-policy.js';

describe('notification retry policy', () => {
  const failedAt = new Date('2026-07-27T10:00:00Z');

  it('uses bounded exponential backoff', () => {
    expect(decideNotificationRetry(1, 5, failedAt)).toEqual({
      deadLetter: false,
      retryAt: new Date('2026-07-27T10:00:30Z'),
    });
    expect(decideNotificationRetry(4, 10, failedAt)).toEqual({
      deadLetter: false,
      retryAt: new Date('2026-07-27T10:04:00Z'),
    });
    expect(decideNotificationRetry(10, 20, failedAt).retryAt).toEqual(
      new Date('2026-07-27T11:00:00Z'),
    );
  });

  it('dead-letters exhausted or permanent failures', () => {
    expect(decideNotificationRetry(5, 5, failedAt)).toEqual({ deadLetter: true });
    expect(decideNotificationRetry(1, 5, failedAt, false)).toEqual({ deadLetter: true });
  });

  it('rejects invalid counters', () => {
    expect(() => decideNotificationRetry(0, 5, failedAt)).toThrow(RangeError);
    expect(() => decideNotificationRetry(1, 0, failedAt)).toThrow(RangeError);
  });
});
