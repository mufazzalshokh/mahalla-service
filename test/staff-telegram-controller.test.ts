/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';

import type { StaffOperations } from '../src/application/triage/staff-operations-service.js';
import { StaffTelegramController } from '../src/interfaces/telegram/staff-telegram-controller.js';

describe('staff Telegram controller', () => {
  it('shows discoverable help without invoking an operation', async () => {
    const operations: StaffOperations = { execute: vi.fn() };
    const reply = await new StaffTelegramController(operations).handle(10n, '/help');
    expect(reply).toContain('/triage');
    expect(operations.execute).not.toHaveBeenCalled();
  });

  it('normalizes and dispatches priority input', async () => {
    const execute = vi.fn().mockResolvedValue('ok');
    const controller = new StaffTelegramController({ execute });
    await expect(controller.handle(10n, '/triage req-1 5 4 3 2')).resolves.toBe('ok');
    expect(execute).toHaveBeenCalledWith(10n, {
      affected: 3,
      kind: 'triage',
      safety: 5,
      social: 2,
      ticketNumber: 'REQ-1',
      urgency: 4,
    });
  });

  it('requires explicit decisions and complete commands', async () => {
    const controller = new StaffTelegramController({ execute: vi.fn() });
    await expect(controller.handle(10n, '/duplicate A B maybe')).rejects.toThrow(/confirm/i);
    await expect(controller.handle(10n, '/override A 90 UNKNOWN because')).rejects.toThrow(/BAND/);
    await expect(controller.handle(10n, '/info A')).rejects.toThrow(/Foydalanish/);
  });

  it('dispatches confirmation, information, queue and rejection commands', async () => {
    const execute = vi.fn().mockResolvedValue('ok');
    const controller = new StaffTelegramController({ execute });
    await controller.handle(2n, '/duplicate a b confirm');
    await controller.handle(2n, '/info a Manzilni aniqlang');
    await controller.handle(2n, '/queue');
    await controller.handle(2n, '/reject a Takroriy murojaat');
    expect(execute).toHaveBeenCalledTimes(4);
  });

  it('parses assignment with an explicit timezone and rejects ambiguous deadlines', async () => {
    const execute = vi.fn().mockResolvedValue('ok');
    const controller = new StaffTelegramController({ execute });
    await controller.handle(2n, '/assign ord-1 ex-1 2026-07-28T18:00:00+05:00');
    expect(execute).toHaveBeenCalledWith(2n, {
      dueAt: new Date('2026-07-28T13:00:00.000Z'),
      executorCode: 'EX-1',
      kind: 'assign',
      orderNumber: 'ORD-1',
    });
    await expect(controller.handle(2n, '/assign ORD-1 EX-1 2026-07-28T18:00:00')).rejects.toThrow(
      /timezone/i,
    );
  });

  it('dispatches executor lifecycle commands', async () => {
    const execute = vi.fn().mockResolvedValue('ok');
    const controller = new StaffTelegramController({ execute });
    await controller.handle(2n, '/executors ord-1');
    await controller.handle(2n, '/mine');
    await controller.handle(2n, '/accept ord-1');
    await controller.handle(2n, '/decline ord-1 Uskuna yo‘q');
    await controller.handle(2n, '/progress ord-1 Quvur almashtirilmoqda');
    await controller.handle(2n, '/block ord-1 Suv yopilmadi');
    await controller.handle(2n, '/unblock ord-1 Suv yopildi');
    await controller.handle(2n, '/complete ord-1 Quvur almashtirildi');
    await controller.handle(2n, '/overdue');
    expect(execute).toHaveBeenCalledTimes(9);
  });

  it('normalizes Telegram photo evidence from its caption', async () => {
    const execute = vi.fn().mockResolvedValue('saved');
    const controller = new StaffTelegramController({ execute });
    await expect(
      controller.handleEvidence(2n, '/evidence ord-1 after Bosim tekshirildi', {
        fileId: 'file',
        fileSize: 1000,
        fileUniqueId: 'unique',
      }),
    ).resolves.toBe('saved');
    expect(execute).toHaveBeenCalledWith(2n, {
      evidence: {
        fileId: 'file',
        fileSize: 1000,
        fileUniqueId: 'unique',
        mediaType: 'image/jpeg',
        note: 'Bosim tekshirildi',
        phase: 'AFTER',
      },
      kind: 'work-evidence',
      orderNumber: 'ORD-1',
    });
  });
});
