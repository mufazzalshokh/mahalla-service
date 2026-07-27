import type { Principal } from '../../domain/identity/permissions.js';
import type {
  NotificationAudience,
  NotificationPayload,
  RetryDecision,
} from '../../domain/notifications/notification-policy.js';

export interface ClaimedNotification {
  readonly attemptNumber: number;
  readonly audience: NotificationAudience;
  readonly id: string;
  readonly language: 'ru' | 'uz-Cyrl' | 'uz-Latn';
  readonly maxAttempts: number;
  readonly payload: NotificationPayload;
  readonly recipientTelegramUserId: bigint | null;
}

export interface FailedNotification {
  readonly attemptCount: number;
  readonly code: string;
  readonly eventType: string;
  readonly lastErrorCode: string | null;
  readonly updatedAt: Date;
}

export interface NotificationRepository {
  claimBatch(
    workerId: string,
    now: Date,
    limit: number,
    leaseSeconds: number,
  ): Promise<readonly ClaimedNotification[]>;
  markDelivered(
    notification: ClaimedNotification,
    workerId: string,
    deliveredAt: Date,
    providerMessageId?: string,
  ): Promise<void>;
  markFailed(
    notification: ClaimedNotification,
    workerId: string,
    failedAt: Date,
    errorCode: string,
    decision: RetryDecision,
  ): Promise<void>;
  listDeadLetters(principal: Principal): Promise<readonly FailedNotification[]>;
  recoverDeadLetter(code: string, principal: Principal, now: Date): Promise<boolean>;
}

export interface NotificationSender {
  send(notification: ClaimedNotification): Promise<{ readonly providerMessageId?: string }>;
}

export class NotificationDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    message = code,
  ) {
    super(message);
    this.name = 'NotificationDeliveryError';
  }
}
