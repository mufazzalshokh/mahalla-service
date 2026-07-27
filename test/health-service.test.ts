import { describe, expect, it, vi } from 'vitest';

import { HealthService } from '../src/application/health/health-service.js';
import type { ReadinessProbe } from '../src/application/health/readiness-probe.js';

describe('HealthService', () => {
  it('is ready when every dependency probe succeeds', async () => {
    const probe: ReadinessProbe = {
      check: vi.fn().mockResolvedValue(undefined),
      name: 'postgres',
    };
    const clock = vi
      .fn()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_007)
      .mockReturnValue(2_000);

    const result = await new HealthService([probe], clock).readiness();

    expect(result).toEqual({
      checkedAt: new Date(2_000).toISOString(),
      checks: [{ durationMs: 7, name: 'postgres', status: 'ready' }],
      status: 'ready',
    });
  });

  it('reports a safe not-ready result without exposing dependency errors', async () => {
    const probe: ReadinessProbe = {
      check: vi.fn().mockRejectedValue(new Error('password=do-not-leak')),
      name: 'postgres',
    };
    const clock = vi.fn().mockReturnValueOnce(10).mockReturnValueOnce(12).mockReturnValue(20);

    const result = await new HealthService([probe], clock).readiness();

    expect(result.status).toBe('not_ready');
    expect(result.checks).toEqual([{ durationMs: 2, name: 'postgres', status: 'not_ready' }]);
    expect(JSON.stringify(result)).not.toContain('do-not-leak');
  });

  it('is ready when there are no external probes', async () => {
    const result = await new HealthService([], () => 0).readiness();

    expect(result.status).toBe('ready');
    expect(result.checks).toEqual([]);
  });
});
