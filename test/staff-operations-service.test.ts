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
  ],
  userId: 'staff',
};

function createService(): {
  execution: Record<string, ReturnType<typeof vi.fn>>;
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
  };
  const dependencies = {
    execution,
    principals: { loadByTelegramUserId: vi.fn().mockResolvedValue(principal) },
  } as unknown as StaffOperationDependencies;
  return { execution, service: new StaffOperationsService(dependencies) };
}

describe('staff execution operations', () => {
  it('dispatches every operator and executor execution command', async () => {
    const { execution, service } = createService();
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
    ];
    for (const command of commands) {
      await expect(service.execute(1n, command)).resolves.toEqual(expect.any(String));
    }
    expect(execution.transition).toHaveBeenCalledTimes(5);
    expect(execution.addProgress).toHaveBeenCalledOnce();
    expect(execution.addEvidence).toHaveBeenCalledOnce();
    expect(execution.scanOverdue).toHaveBeenCalledOnce();
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
