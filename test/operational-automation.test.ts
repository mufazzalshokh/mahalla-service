import { describe, expect, it, vi } from 'vitest';

import { OperationalAutomation } from '../src/application/automation/operational-automation.js';

describe('OperationalAutomation', () => {
  it('runs the idempotent scan before delivery processing', async () => {
    const calls: string[] = [];
    const repository = {
      scan: vi.fn().mockImplementation(() => {
        calls.push('scan');
        return { complaintAlerts: 1, deadlineAlerts: 1, reminders: 2, skipped: false };
      }),
    };
    const notifications = {
      processBatch: vi.fn().mockImplementation(() => {
        calls.push('deliver');
        return { claimed: 4, deadLettered: 0, delivered: 4, retryScheduled: 0 };
      }),
    };
    const result = await new OperationalAutomation(
      repository,
      notifications as never,
      () => new Date('2026-07-27T10:00:00Z'),
    ).runCycle('worker');
    expect(calls).toEqual(['scan', 'deliver']);
    expect(result.scan.reminders).toBe(2);
  });
});
