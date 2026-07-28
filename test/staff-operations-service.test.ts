import { describe, expect, it, vi } from 'vitest';

import {
  StaffOperationsService,
  type StaffOperationDependencies,
  type StaffOperationCommand,
} from '../src/application/triage/staff-operations-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';

const principal: Principal = {
  grants: [
    { permission: 'order.read.area', serviceAreaId: 'area' },
    { permission: 'order.assign', serviceAreaId: 'area' },
    { permission: 'order.escalation.review', serviceAreaId: 'area' },
    { permission: 'order.escalation.manage', serviceAreaId: 'area' },
    { permission: 'notification.manage', serviceAreaId: 'area' },
  ],
  userId: 'staff',
};

function createService(): {
  execution: Record<string, ReturnType<typeof vi.fn>>;
  quality: Record<string, ReturnType<typeof vi.fn>>;
  service: StaffOperationsService;
} {
  const execution = {
    addEvidence: vi.fn().mockResolvedValue(undefined),
    addProgress: vi.fn().mockResolvedValue(undefined),
    assign: vi.fn().mockResolvedValue({ orderNumber: 'ORD-1' }),
    listEligibleExecutors: vi.fn().mockResolvedValue([]),
    listMine: vi.fn().mockResolvedValue([]),
    scanOverdue: vi.fn().mockResolvedValue([]),
    transition: vi.fn().mockResolvedValue({ orderNumber: 'ORD-1' }),
    updateDeadlineEscalation: vi.fn().mockResolvedValue({ orderNumber: 'ORD-1' }),
  };
  const quality = {
    accept: vi.fn().mockResolvedValue({ orderNumber: 'ORD-1' }),
    checklist: vi.fn().mockResolvedValue({ items: [], templateVersion: 1 }),
    decideComplaint: vi.fn().mockResolvedValue(undefined),
    inspect: vi.fn().mockResolvedValue({ attempt: 1, outcome: 'PASS' }),
    listComplaints: vi.fn().mockResolvedValue([]),
    reopen: vi.fn().mockResolvedValue({ orderNumber: 'ORD-1' }),
    requireRework: vi.fn().mockResolvedValue({ orderNumber: 'ORD-1' }),
  };
  const dependencies = {
    execution,
    notifications: {
      listDeadLetters: vi.fn().mockResolvedValue([]),
      recover: vi.fn().mockResolvedValue(undefined),
    },
    principals: { loadByTelegramUserId: vi.fn().mockResolvedValue(principal) },
    quality,
  } as unknown as StaffOperationDependencies;
  return { execution, quality, service: new StaffOperationsService(dependencies) };
}

describe('staff execution operations', () => {
  it('dispatches administrator staff-access operations', async () => {
    const staffAccess = {
      grant: vi.fn().mockResolvedValue({ code: 'STF-1', displayName: 'Ali' }),
      list: vi.fn().mockResolvedValue([
        {
          code: 'STF-1',
          displayName: 'Ali',
          role: 'operator_manager',
          serviceAreaCode: 'DEMO',
          status: 'ACTIVE',
          telegramUserId: 123n,
        },
      ]),
      restore: vi.fn().mockResolvedValue({ code: 'STF-1' }),
      suspend: vi.fn().mockResolvedValue({ code: 'STF-1' }),
    };
    const dependencies = {
      principals: { loadByTelegramUserId: vi.fn().mockResolvedValue(principal) },
      staffAccess,
    } as unknown as StaffOperationDependencies;
    const service = new StaffOperationsService(dependencies);
    await expect(service.execute(1n, { kind: 'staff-list' })).resolves.toContain('TG 123');
    await service.execute(1n, {
      areaCode: 'DEMO',
      displayName: 'Ali',
      kind: 'staff-grant',
      role: 'operator_manager',
      telegramUserId: 123n,
    });
    await service.execute(1n, { code: 'STF-1', kind: 'staff-suspend', reason: 'Ended' });
    await service.execute(1n, { code: 'STF-1', kind: 'staff-restore' });
    expect(staffAccess.grant).toHaveBeenCalledOnce();
    expect(staffAccess.suspend).toHaveBeenCalledOnce();
    expect(staffAccess.restore).toHaveBeenCalledOnce();
  });

  it('renders localized resident request details with a simple Tashkent visit window', async () => {
    const dependencies = {
      listQueue: {
        details: vi.fn().mockResolvedValue({
          addressLine: 'Amir Temur 10',
          categoryNameRu: 'Сантехника',
          categoryNameUzLatn: 'Santexnika',
          description: 'Kitchen pipe is leaking',
          fullName: 'Ali Valiyev',
          phone: '+998901234567',
          preferredVisitEnd: new Date('2026-07-28T09:00:00.000Z'),
          preferredVisitStart: new Date('2026-07-28T08:00:00.000Z'),
          residentDeclaredUrgency: 'IMPORTANT',
          serviceAreaId: 'area',
          status: 'RECEIVED',
          ticketNumber: 'MCK-1',
          visitAsSoonAsPossible: false,
        }),
      },
      principals: { loadByTelegramUserId: vi.fn().mockResolvedValue(principal) },
    } as unknown as StaffOperationDependencies;
    const service = new StaffOperationsService(dependencies);
    await expect(
      service.execute(1n, { kind: 'request-details', ticketNumber: 'MCK-1' }, 'uz'),
    ).resolves.toContain('28.07.2026 13:00–14:00');
    await expect(
      service.execute(1n, { kind: 'request-details', ticketNumber: 'MCK-1' }, 'ru'),
    ).resolves.toContain('Сантехника');
  });

  it('dispatches every operator and executor execution command', async () => {
    const { execution, quality, service } = createService();
    const commands: readonly StaffOperationCommand[] = [
      { kind: 'executors', orderNumber: 'ORD-1' },
      {
        dueAt: new Date('2026-07-28T10:00:00Z'),
        executorCode: 'EX-1',
        kind: 'assign',
        orderNumber: 'ORD-1',
      },
      { kind: 'my-orders' },
      { kind: 'accept-assignment', orderNumber: 'ORD-1' },
      { kind: 'decline-assignment', orderNumber: 'ORD-1', reason: 'No tools' },
      { kind: 'progress', note: 'Working', orderNumber: 'ORD-1' },
      { blockerReason: 'No access', kind: 'block', orderNumber: 'ORD-1' },
      { kind: 'unblock', note: 'Access restored', orderNumber: 'ORD-1' },
      { kind: 'complete-work', orderNumber: 'ORD-1', summary: 'Completed' },
      {
        evidence: {
          fileId: 'file',
          fileSize: 100,
          fileUniqueId: 'unique',
          mediaType: 'image/jpeg',
          phase: 'AFTER',
        },
        kind: 'work-evidence',
        orderNumber: 'ORD-1',
      },
      { kind: 'overdue' },
      { kind: 'acknowledge-overdue', orderNumber: 'ORD-1' },
      { kind: 'resolve-overdue', orderNumber: 'ORD-1' },
      { kind: 'failed-notifications' },
      { code: 'NTF-1', kind: 'retry-notification' },
      { kind: 'quality-checklist', orderNumber: 'ORD-1' },
      {
        kind: 'quality-inspection',
        orderNumber: 'ORD-1',
        results: [{ code: 'WORK', result: 'PASS' }],
        summary: 'Checked',
      },
      { kind: 'approve-work', orderNumber: 'ORD-1' },
      { kind: 'require-rework', orderNumber: 'ORD-1', reason: 'Fix it' },
      { kind: 'start-rework', orderNumber: 'ORD-1' },
      { kind: 'complaints' },
      { complaintCode: 'CMP-1', kind: 'reopen', reason: 'Warranty correction' },
      {
        complaintCode: 'CMP-1',
        kind: 'complaint-decision',
        outcome: 'RESOLVED',
        reason: 'Correction accepted',
      },
    ];
    for (const command of commands) {
      await expect(service.execute(1n, command)).resolves.toEqual(expect.any(String));
    }
    expect(execution.transition).toHaveBeenCalledTimes(6);
    expect(execution.addProgress).toHaveBeenCalledOnce();
    expect(execution.addEvidence).toHaveBeenCalledOnce();
    expect(execution.scanOverdue).toHaveBeenCalledOnce();
    expect(execution.updateDeadlineEscalation).toHaveBeenCalledTimes(2);
    expect(quality.checklist).toHaveBeenCalledOnce();
    expect(quality.inspect).toHaveBeenCalledOnce();
    expect(quality.accept).toHaveBeenCalledOnce();
    expect(quality.requireRework).toHaveBeenCalledOnce();
    expect(quality.listComplaints).toHaveBeenCalledOnce();
    expect(quality.reopen).toHaveBeenCalledOnce();
    expect(quality.decideComplaint).toHaveBeenCalledOnce();
  });

  it('rejects a Telegram account without an active staff principal', async () => {
    const dependencies = {
      principals: { loadByTelegramUserId: vi.fn().mockResolvedValue(undefined) },
    } as unknown as StaffOperationDependencies;
    await expect(
      new StaffOperationsService(dependencies).execute(9n, { kind: 'my-orders' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
