import { describe, expect, it } from 'vitest';

import { HandleResidentUpdateService } from '../src/application/intake/handle-resident-update-service.js';
import type { ResidentIntakeUnitOfWork } from '../src/application/intake/resident-intake-unit-of-work.js';
import type { IntakeResponse } from '../src/application/intake/intake-types.js';
import { ResidentTelegramController } from '../src/interfaces/telegram/resident-telegram-controller.js';
import { translate } from '../src/interfaces/telegram/translations.js';

class ResponseUnitOfWork implements ResidentIntakeUnitOfWork {
  constructor(private readonly response: IntakeResponse) {}

  process(): Promise<IntakeResponse> {
    return Promise.resolve(this.response);
  }
}

describe('resident Telegram controller', () => {
  it('renders localized inline actions without exposing business logic', async () => {
    const controller = new ResidentTelegramController(
      new HandleResidentUpdateService(
        new ResponseUnitOfWork({
          actions: [{ data: 'consent:accept', labelKey: 'button_accept' }],
          key: 'privacy_notice',
          language: 'uz-Cyrl',
          parameters: { version: 'v1' },
        }),
      ),
    );

    const reply = await controller.handle({
      input: { kind: 'start' },
      telegramUserId: 1n,
      updateId: 1n,
    });
    expect(reply.inlineActions).toEqual([{ data: 'consent:accept', label: '✅ Қабул қиламан' }]);
    expect(reply.actionColumns).toBe(1);
    expect(reply.text).toContain('v1');
  });

  it('renders a Telegram contact keyboard request', async () => {
    const controller = new ResidentTelegramController(
      new HandleResidentUpdateService(
        new ResponseUnitOfWork({
          key: 'share_contact',
          language: 'uz-Latn',
          requestContact: true,
        }),
      ),
    );

    const reply = await controller.handle({
      input: { kind: 'start' },
      telegramUserId: 1n,
      updateId: 1n,
    });
    expect(reply.contactLabel).toContain('Telegram');
    expect(reply.inlineActions).toEqual([]);
  });

  it('renders location/manual controls and the post-submission main menu signal', async () => {
    const locationController = new ResidentTelegramController(
      new HandleResidentUpdateService(
        new ResponseUnitOfWork({
          key: 'enter_address',
          language: 'ru',
          requestLocation: true,
        }),
      ),
    );
    await expect(
      locationController.handle({ input: { kind: 'start' }, telegramUserId: 1n, updateId: 1n }),
    ).resolves.toMatchObject({
      locationLabel: '📍 Отправить геолокацию',
      manualAddressLabel: '⌨️ Ввести адрес',
    });

    const submittedController = new ResidentTelegramController(
      new HandleResidentUpdateService(
        new ResponseUnitOfWork({ key: 'submitted', language: 'uz-Latn', showMainMenu: true }),
      ),
    );
    await expect(
      submittedController.handle({ input: { kind: 'start' }, telegramUserId: 1n, updateId: 2n }),
    ).resolves.toMatchObject({ mainMenuLanguage: 'uz' });
  });

  it('uses a safe key fallback for a data-driven category label', () => {
    expect(translate('uz-Latn', 'Santexnika')).toBe('Santexnika');
  });

  it('renders Russian resident messages', () => {
    expect(translate('ru', 'choose_category')).toContain('Выберите вид услуги.');
    expect(translate('ru', 'submitted', { ticketNumber: 'MCK-1' })).toContain('MCK-1');
    expect(translate('ru', 'enter_ticket_number')).not.toContain('00000001');
  });
});
