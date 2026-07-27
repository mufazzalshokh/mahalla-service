import type { ReadinessCheckResult, ReadinessProbe, ReadinessResult } from './readiness-probe.js';

type Clock = () => number;

export class HealthService {
  constructor(
    private readonly probes: readonly ReadinessProbe[],
    private readonly clock: Clock = Date.now,
  ) {}

  async readiness(): Promise<ReadinessResult> {
    const checks = await Promise.all(this.probes.map((probe) => this.runProbe(probe)));
    const status = checks.every((check) => check.status === 'ready') ? 'ready' : 'not_ready';

    return {
      checkedAt: new Date(this.clock()).toISOString(),
      checks,
      status,
    };
  }

  private async runProbe(probe: ReadinessProbe): Promise<ReadinessCheckResult> {
    const startedAt = this.clock();
    try {
      await probe.check();
      return {
        durationMs: Math.max(0, this.clock() - startedAt),
        name: probe.name,
        status: 'ready',
      };
    } catch {
      return {
        durationMs: Math.max(0, this.clock() - startedAt),
        name: probe.name,
        status: 'not_ready',
      };
    }
  }
}
