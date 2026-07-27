import type {
  NotificationBatchResult,
  NotificationService,
} from '../notifications/notification-service.js';

export interface AutomationScanResult {
  readonly complaintAlerts: number;
  readonly deadlineAlerts: number;
  readonly reminders: number;
  readonly skipped: boolean;
}

export interface AutomationRepository {
  scan(now: Date): Promise<AutomationScanResult>;
}

export interface AutomationCycleResult {
  readonly notifications: NotificationBatchResult;
  readonly scan: AutomationScanResult;
}

export class OperationalAutomation {
  constructor(
    private readonly repository: AutomationRepository,
    private readonly notifications: NotificationService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async runCycle(workerId: string): Promise<AutomationCycleResult> {
    const scan = await this.repository.scan(this.now());
    const notifications = await this.notifications.processBatch(workerId);
    return { notifications, scan };
  }
}
