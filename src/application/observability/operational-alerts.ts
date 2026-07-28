import type {
  OperationalAlertCode,
  OperationalAlertSeverity,
  OperationalMetrics,
} from './operational-metrics.js';

export interface OperationalAlertEvent {
  readonly code: OperationalAlertCode;
  readonly occurredAt: string;
  readonly severity: OperationalAlertSeverity;
}

export class OperationalAlerts {
  constructor(
    private readonly metrics: OperationalMetrics,
    private readonly sink: (event: OperationalAlertEvent) => void,
    private readonly now: () => Date = () => new Date(),
  ) {}

  raise(code: OperationalAlertCode, severity: OperationalAlertSeverity): void {
    const event = { code, occurredAt: this.now().toISOString(), severity };
    this.metrics.recordAlert(code, severity);
    this.sink(event);
  }
}
