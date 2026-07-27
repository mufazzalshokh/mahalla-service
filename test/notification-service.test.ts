/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';

import {
  NotificationDeliveryError,
  type ClaimedNotification,
  type NotificationRepository,
  type NotificationSender,
} from '../src/application/notifications/notification-repository.js';
import { NotificationService } from '../src/application/notifications/notification-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';

const notification: ClaimedNotification = {
  attemptNumber: 1,
  audience: 'RESIDENT',
  id: 'notification-1',
  language: 'uz-Latn',
  maxAttempts: 3,
  payload: {
    reference: 'REQ-1',
    status: 'VALIDATING',
    templateKey: 'resident.status_changed',
  },
  recipientTelegramUserId: 10n,
};

function dependencies(claimed: readonly ClaimedNotification[] = [notification]): {
  repository: NotificationRepository;
  sender: NotificationSender;
} {
  return {
    repository: {
      claimBatch: vi.fn().mockResolvedValue(claimed),
      listDeadLetters: vi.fn().mockResolvedValue([]),
      markDelivered: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
      recoverDeadLetter: vi.fn().mockResolvedValue(true),
    },
    sender: { send: vi.fn().mockResolvedValue({ providerMessageId: '42' }) },
  };
}

describe('NotificationService', () => {
  const now = new Date('2026-07-27T10:00:00Z');

  it('claims and records successful delivery', async () => {
    const { repository, sender } = dependencies();
    const result = await new NotificationService(repository, sender, () => now).processBatch(
      'worker',
    );
    expect(result).toEqual({ claimed: 1, deadLettered: 0, delivered: 1, retryScheduled: 0 });
    expect(repository.markDelivered).toHaveBeenCalledWith(notification, 'worker', now, '42');
  });

  it('schedules transient failures and hides unexpected error details', async () => {
    const { repository, sender } = dependencies();
    vi.mocked(sender.send).mockRejectedValueOnce(new Error('secret provider response'));
    const result = await new NotificationService(repository, sender, () => now).processBatch(
      'worker',
    );
    expect(result.retryScheduled).toBe(1);
    expect(repository.markFailed).toHaveBeenCalledWith(
      notification,
      'worker',
      now,
      'DELIVERY_UNEXPECTED',
      { deadLetter: false, retryAt: new Date('2026-07-27T10:00:30Z') },
    );
  });

  it('dead-letters permanent and missing-recipient failures', async () => {
    const { repository, sender } = dependencies([
      { ...notification, recipientTelegramUserId: null },
      { ...notification, id: 'notification-2' },
    ]);
    vi.mocked(sender.send).mockRejectedValueOnce(
      new NotificationDeliveryError('TELEGRAM_403', false),
    );
    const result = await new NotificationService(repository, sender, () => now).processBatch(
      'worker',
    );
    expect(result.deadLettered).toBe(2);
  });

  it('dead-letters an exhausted transient failure and handles an empty batch', async () => {
    const exhausted = { ...notification, attemptNumber: 3, maxAttempts: 3 };
    const { repository, sender } = dependencies([exhausted]);
    vi.mocked(sender.send).mockRejectedValueOnce(
      new NotificationDeliveryError('TELEGRAM_500', true),
    );
    const service = new NotificationService(repository, sender, () => now);
    await expect(service.processBatch('worker')).resolves.toMatchObject({ deadLettered: 1 });
    vi.mocked(repository.claimBatch).mockResolvedValueOnce([]);
    await expect(service.processBatch('worker')).resolves.toEqual({
      claimed: 0,
      deadLettered: 0,
      delivered: 0,
      retryScheduled: 0,
    });
  });

  it('authorizes failure visibility and recovery', async () => {
    const { repository, sender } = dependencies([]);
    const service = new NotificationService(repository, sender, () => now);
    const principal: Principal = {
      grants: [{ permission: 'notification.manage', serviceAreaId: 'area' }],
      userId: 'operator',
    };
    await expect(service.listDeadLetters(principal)).resolves.toEqual([]);
    await expect(service.recover('ntf-1', principal)).resolves.toBeUndefined();
    expect(repository.recoverDeadLetter).toHaveBeenCalledWith('NTF-1', principal, now);
    await expect(service.listDeadLetters({ grants: [], userId: 'other' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(service.recover('NTF-1', { grants: [], userId: 'other' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    vi.mocked(repository.recoverDeadLetter).mockResolvedValueOnce(false);
    await expect(service.recover('NTF-X', principal)).rejects.toMatchObject({
      code: 'DEAD_LETTER_NOT_FOUND',
    });
  });
});
