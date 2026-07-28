import { describe, expect, it, vi } from 'vitest';

import { OperationalAlerts } from '../src/application/observability/operational-alerts.js';
import { OperationalMetrics } from '../src/application/observability/operational-metrics.js';
import { safeErrorMetadata } from '../src/domain/shared/safe-error.js';

describe('operational observability', () => {
  it('exports only bounded labels and never embeds request paths or Telegram subjects', () => {
    const metrics = new OperationalMetrics();
    metrics.recordHttpRequest('/resident/998877/private', 404);
    metrics.recordTelegramUpdate('resident', 'succeeded', 125);
    metrics.recordTelegramUpdate('staff', 'rate_limited', 1);

    const rendered = metrics.renderPrometheus(12.5);

    expect(rendered).toContain('mck_process_uptime_seconds 12.500');
    expect(rendered).toContain('route="other",status_class="4xx"');
    expect(rendered).toContain('bot="resident",outcome="succeeded"');
    expect(rendered).not.toContain('998877');
  });

  it('turns a fixed failure code into both a metric and a sanitized alert event', () => {
    const metrics = new OperationalMetrics();
    const sink = vi.fn();
    const alerts = new OperationalAlerts(metrics, sink, () => new Date('2026-07-28T10:00:00Z'));

    alerts.raise('automation_cycle_failed', 'critical');

    expect(sink).toHaveBeenCalledWith({
      code: 'automation_cycle_failed',
      occurredAt: '2026-07-28T10:00:00.000Z',
      severity: 'critical',
    });
    expect(metrics.renderPrometheus()).toContain(
      'code="automation_cycle_failed",severity="critical"} 1',
    );
  });

  it('reduces errors to a safe name and optional controlled code', () => {
    const secret = new Error('postgresql://user:password@host/private');
    expect(JSON.stringify(safeErrorMetadata(secret))).not.toContain('password');

    const coded = Object.assign(new Error('private resident address'), { code: 'COMMAND_INVALID' });
    expect(safeErrorMetadata(coded)).toEqual({ code: 'COMMAND_INVALID', name: 'Error' });
  });
});
