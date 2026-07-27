import { decideNotificationRetry } from '../../domain/notifications/notification-policy.js';
import { AuthorizationError } from '../../domain/shared/domain-errors.js';
import type { Principal } from '../../domain/identity/permissions.js';
import {
  NotificationDeliveryError,
  type FailedNotification,
  type NotificationRepository,
  type NotificationSender,
} from './notification-repository.js';

export interface NotificationBatchResult {
  readonly claimed: number;
  readonly deadLettered: number;
  readonly delivered: number;
  readonly retryScheduled: number;
}

function safeError(error: unknown): { readonly code: string; readonly retryable: boolean } {
  if (error instanceof NotificationDeliveryError) {
    return { code: error.code.slice(0, 100), retryable: error.retryable };
  }
  return { code: 'DELIVERY_UNEXPECTED', retryable: true };
}

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly sender: NotificationSender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async processBatch(
    workerId: string,
    limit = 20,
    leaseSeconds = 120,
  ): Promise<NotificationBatchResult> {
    const claimed = await this.repository.claimBatch(workerId, this.now(), limit, leaseSeconds);
    let delivered = 0;
    let retryScheduled = 0;
    let deadLettered = 0;
    for (const notification of claimed) {
      try {
        if (notification.recipientTelegramUserId === null) {
          throw new NotificationDeliveryError('RECIPIENT_TELEGRAM_ID_MISSING', false);
        }
        const result = await this.sender.send(notification);
        await this.repository.markDelivered(
          notification,
          workerId,
          this.now(),
          result.providerMessageId,
        );
        delivered += 1;
      } catch (error) {
        const failure = safeError(error);
        const failedAt = this.now();
        const decision = decideNotificationRetry(
          notification.attemptNumber,
          notification.maxAttempts,
          failedAt,
          failure.retryable,
        );
        await this.repository.markFailed(notification, workerId, failedAt, failure.code, decision);
        if (decision.deadLetter) deadLettered += 1;
        else retryScheduled += 1;
      }
    }
    return { claimed: claimed.length, deadLettered, delivered, retryScheduled };
  }

  async listDeadLetters(principal: Principal): Promise<readonly FailedNotification[]> {
    if (!principal.grants.some(({ permission }) => permission === 'notification.manage')) {
      throw new AuthorizationError('notification.manage');
    }
    return this.repository.listDeadLetters(principal);
  }

  async recover(code: string, principal: Principal): Promise<void> {
    if (!principal.grants.some(({ permission }) => permission === 'notification.manage')) {
      throw new AuthorizationError('notification.manage');
    }
    const recovered = await this.repository.recoverDeadLetter(
      code.trim().toUpperCase(),
      principal,
      this.now(),
    );
    if (!recovered) throw new NotificationDeliveryError('DEAD_LETTER_NOT_FOUND', false);
  }
}
