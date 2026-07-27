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
    await controller.handle(2n, '/ackoverdue ord-1');
    await controller.handle(2n, '/resolveoverdue ord-1');
    await controller.handle(2n, '/failednotifications');
    await controller.handle(2n, '/retrynotification ntf-1');
    expect(execute).toHaveBeenCalledTimes(13);
    expect(execute).toHaveBeenLastCalledWith(2n, {
      code: 'NTF-1',
      kind: 'retry-notification',
    });
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

  it('parses checklist, inspection, acceptance, complaint, and reopen commands', async () => {
    const execute = vi.fn().mockResolvedValue('ok');
    const controller = new StaffTelegramController({ execute });
    await controller.handle(2n, '/checklist ord-1');
    await controller.handle(
      2n,
      '/inspect ord-1 WORK_COMPLETE=PASS,RESULT_TESTED=FAIL Tekshiruv yakuni',
    );
    await controller.handle(2n, '/approve ord-1');
    await controller.handle(2n, '/rework ord-1 Oqish davom etmoqda');
    await controller.handle(2n, '/startrework ord-1');
    await controller.handle(2n, '/complaints');
    await controller.handle(2n, '/reopen cmp-1 Kafolat tuzatishi');
    await controller.handle(2n, '/closecomplaint cmp-1 resolve Tuzatish qabul qilindi');
    expect(execute).toHaveBeenNthCalledWith(2, 2n, {
      kind: 'quality-inspection',
      orderNumber: 'ORD-1',
      results: [
        { code: 'WORK_COMPLETE', result: 'PASS' },
        { code: 'RESULT_TESTED', result: 'FAIL' },
      ],
      summary: 'Tekshiruv yakuni',
    });
    expect(execute).toHaveBeenNthCalledWith(7, 2n, {
      complaintCode: 'CMP-1',
      kind: 'reopen',
      reason: 'Kafolat tuzatishi',
    });
    expect(execute).toHaveBeenLastCalledWith(2n, {
      complaintCode: 'CMP-1',
      kind: 'complaint-decision',
      outcome: 'RESOLVED',
      reason: 'Tuzatish qabul qilindi',
    });
  });

  it('rejects malformed inspection outcomes', async () => {
    const controller = new StaffTelegramController({ execute: vi.fn() });
    await expect(controller.handle(2n, '/inspect ORD-1 WORK=MAYBE Xulosa')).rejects.toThrow(/PASS/);
    await expect(controller.handle(2n, '/closecomplaint CMP-1 maybe Sabab')).rejects.toThrow(
      /resolve/,
    );
  });

  it('parses reporting and PDCA commands into explicit operations', async () => {
    const execute = vi.fn().mockResolvedValue('ok');
    const controller = new StaffTelegramController({ execute });
    await controller.handle(2n, '/report week');
    await controller.handle(2n, '/reportcsv month');
    await controller.handle(2n, '/pdca');
    await controller.handle(
      2n,
      '/pdca new demo 2026-08-10T18:00:00+05:00 Stop leak | Pipe leaks | Replace pipe | No leak',
    );
    await controller.handle(2n, '/pdca move pdc-2026-1 do Work started');
    expect(execute).toHaveBeenNthCalledWith(1, 2n, { kind: 'report', period: 'WEEK' });
    expect(execute).toHaveBeenNthCalledWith(2, 2n, { kind: 'report-export', period: 'MONTH' });
    expect(execute).toHaveBeenNthCalledWith(3, 2n, { kind: 'pdca-list' });
    expect(execute).toHaveBeenNthCalledWith(4, 2n, {
      areaCode: 'DEMO',
      input: {
        dueAt: new Date('2026-08-10T13:00:00Z'),
        expectedOutcome: 'No leak',
        plannedAction: 'Replace pipe',
        problemStatement: 'Pipe leaks',
        title: 'Stop leak',
      },
      kind: 'pdca-create',
    });
    expect(execute).toHaveBeenLastCalledWith(2n, {
      code: 'PDC-2026-1',
      kind: 'pdca-transition',
      reason: 'Work started',
      to: 'DO',
    });
  });

  it('rejects malformed reporting and PDCA commands', async () => {
    const controller = new StaffTelegramController({ execute: vi.fn() });
    await expect(controller.handle(2n, '/report year')).rejects.toThrow(/week/i);
    await expect(controller.handle(2n, '/pdca move X UNKNOWN reason')).rejects.toThrow(/PLAN/u);
    await expect(controller.handle(2n, '/pdca new DEMO bad a | b | c | d')).rejects.toThrow(
      /timezone/i,
    );
    await expect(controller.handle(2n, '/pdca unknown')).rejects.toThrow(/list/u);
  });

  it('falls back to help and rejects malformed photo evidence captions', async () => {
    const execute = vi.fn();
    const controller = new StaffTelegramController({ execute });
    await expect(controller.handle(2n, '/unknown')).resolves.toContain('/reopen');
    expect(execute).not.toHaveBeenCalled();
    const photo = { fileId: 'f', fileSize: 10, fileUniqueId: 'u' };
    await expect(controller.handleEvidence(2n, '/wrong ORD-1 BEFORE', photo)).rejects.toThrow(
      /Foto/u,
    );
    await expect(controller.handleEvidence(2n, '/evidence ORD-1 DURING', photo)).rejects.toThrow(
      /BEFORE/u,
    );
  });
});
