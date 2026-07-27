export interface ReadinessProbe {
  readonly name: string;
  check(): Promise<void>;
}

export interface ReadinessCheckResult {
  readonly durationMs: number;
  readonly name: string;
  readonly status: 'ready' | 'not_ready';
}

export interface ReadinessResult {
  readonly checkedAt: string;
  readonly checks: readonly ReadinessCheckResult[];
  readonly status: 'ready' | 'not_ready';
}
