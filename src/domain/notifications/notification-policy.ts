export const notificationTemplateKeys = [
  'resident.status_changed',
  'resident.information_requested',
  'resident.acceptance_requested',
  'resident.complaint_decided',
  'executor.assignment_created',
  'executor.rework_required',
  'executor.deadline_reminder',
  'operator.assignment_rejected',
  'operator.order_blocked',
  'operator.deadline_overdue',
  'operator.complaint_created',
  'operator.complaint_review_reminder',
  'operator.complaint_review_overdue',
] as const;

export type NotificationTemplateKey = (typeof notificationTemplateKeys)[number];
export type NotificationAudience = 'RESIDENT' | 'STAFF';

export interface NotificationPayload {
  readonly dueAt?: string;
  readonly reference: string;
  readonly status?: string;
  readonly templateKey: NotificationTemplateKey;
}

export interface RetryDecision {
  readonly deadLetter: boolean;
  readonly retryAt?: Date;
}

export function decideNotificationRetry(
  attemptNumber: number,
  maxAttempts: number,
  failedAt: Date,
  retryable = true,
): RetryDecision {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) {
    throw new RangeError('attemptNumber must be a positive integer');
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new RangeError('maxAttempts must be a positive integer');
  }
  if (!retryable || attemptNumber >= maxAttempts) return { deadLetter: true };
  const delaySeconds = Math.min(3_600, 30 * 2 ** (attemptNumber - 1));
  return { deadLetter: false, retryAt: new Date(failedAt.getTime() + delaySeconds * 1_000) };
}
