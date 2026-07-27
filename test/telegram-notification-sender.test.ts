import { describe, expect, it } from 'vitest';

import type { ClaimedNotification } from '../src/application/notifications/notification-repository.js';
import { notificationTemplateKeys } from '../src/domain/notifications/notification-policy.js';
import {
  renderTelegramNotification,
  TelegramNotificationSender,
} from '../src/interfaces/telegram/telegram-notification-sender.js';

const notification: ClaimedNotification = {
  attemptNumber: 1,
  audience: 'RESIDENT',
  id: 'id',
  language: 'uz-Latn',
  maxAttempts: 5,
  payload: { reference: 'REQ-1', status: 'VALIDATING', templateKey: 'resident.status_changed' },
  recipientTelegramUserId: 1n,
};

describe('Telegram notification adapter', () => {
  it('renders bounded templates without arbitrary business text', () => {
    expect(renderTelegramNotification(notification)).toBe('REQ-1: holat VALIDATING.');
    expect(renderTelegramNotification({ ...notification, language: 'uz-Cyrl' })).toContain('ҳолат');
  });

  it('renders every approved template in both scripts with and without optional fields', () => {
    for (const templateKey of notificationTemplateKeys) {
      for (const language of ['uz-Latn', 'uz-Cyrl'] as const) {
        expect(
          renderTelegramNotification({
            ...notification,
            language,
            payload: {
              dueAt: '2026-07-28T10:00:00Z',
              reference: 'REF-1',
              status: 'ACTIVE',
              templateKey,
            },
          }).length,
        ).toBeGreaterThan(10);
        expect(
          renderTelegramNotification({
            ...notification,
            language,
            payload: { reference: 'REF-1', templateKey },
          }),
        ).toContain('REF-1');
      }
    }
  });

  it('fails permanently when the audience token or recipient is absent', async () => {
    const sender = new TelegramNotificationSender();
    await expect(sender.send(notification)).rejects.toMatchObject({
      code: 'BOT_TOKEN_NOT_CONFIGURED',
      retryable: false,
    });
    await expect(
      new TelegramNotificationSender(`123456:${'a'.repeat(30)}`).send({
        ...notification,
        recipientTelegramUserId: null,
      }),
    ).rejects.toMatchObject({ code: 'RECIPIENT_TELEGRAM_ID_MISSING', retryable: false });
    await expect(sender.send({ ...notification, audience: 'STAFF' })).rejects.toMatchObject({
      code: 'BOT_TOKEN_NOT_CONFIGURED',
      retryable: false,
    });
  });
});
