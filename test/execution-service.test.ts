/* eslint-disable @typescript-eslint/unbound-method */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ExecutionOrderRecord,
  ExecutionRepository,
} from '../src/application/execution/execution-repository.js';
import { ExecutionService } from '../src/application/execution/execution-service.js';
import type {
  ExecutorEligibilityPort,
  OrderRepository,
} from '../src/application/orders/order-repository.js';
import { TransitionOrderService } from '../src/application/orders/transition-order-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';

const order: ExecutionOrderRecord = {
  assignedExecutorUserId: 'executor',
  categoryId: 'category',
  dueAt: new Date('2026-07-29T10:00:00Z'),
  id: 'order',
  orderNumber: 'ORD-1',
  priorityBand: 'IMPORTANT',
  serviceAreaId: 'area',
  status: 'IN_PROGRESS',
  version: 2,
};
const executor: Principal = {
  grants: [
    { permission: 'order.read.area', serviceAreaId: 'area' },
    { permission: 'order.work_log.add', serviceAreaId: 'area' },
    { permission: 'order.evidence.add', serviceAreaId: 'area' },
  ],
  userId: 'executor',
};

function fakeRepository(): ExecutionRepository {
  return {
    appendEvidence: vi.fn(),
    appendProgressLog: vi.fn(),
    countEvidence: vi.fn().mockResolvedValue(0),
    findExecutorByCode: vi.fn().mockResolvedValue({
      code: 'EX-1',
      displayName: 'Executor One',
      userId: 'executor',
    }),
    findOrderByNumber: vi.fn().mockResolvedValue(order),
    listAssignedOrders: vi.fn().mockResolvedValue([order]),
    listEligibleExecutors: vi.fn().mockResolvedValue([]),
    scanOverdue: vi.fn().mockResolvedValue([]),
    updateDeadlineEscalation: vi.fn().mockResolvedValue(undefined),
  };
}

function transitionService(): TransitionOrderService {
  const repository: OrderRepository = {
    applyTransition: vi.fn(),
    findById: vi.fn(),
  };
  const eligibility: ExecutorEligibilityPort = { isEligible: vi.fn() };
  return new TransitionOrderService(repository, eligibility);
}

describe('execution service', () => {
  let repository: ExecutionRepository;
  let transitions: TransitionOrderService;
  let service: ExecutionService;

  beforeEach(() => {
    repository = fakeRepository();
    transitions = transitionService();
    vi.spyOn(transitions, 'execute').mockResolvedValue(order);
    service = new ExecutionService(repository, transitions, () => new Date('2026-07-30T00:00:00Z'));
  });

  it('lists eligible executors only for an area-authorized assigner', async () => {
    const operator: Principal = {
      grants: [{ permission: 'order.assign', serviceAreaId: 'area' }],
      userId: 'operator',
    };
    await service.listEligibleExecutors('ord-1', operator);
    expect(repository.listEligibleExecutors).toHaveBeenCalledWith(order);
    await expect(
      service.listEligibleExecutors('ORD-1', { ...operator, grants: [] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('assigns by executor code using the current version', async () => {
    const operator: Principal = {
      grants: [{ permission: 'order.assign', serviceAreaId: 'area' }],
      userId: 'operator',
    };
    const dueAt = new Date('2026-07-31T10:00:00Z');
    await service.assign('ORD-1', 'ex-1', dueAt, operator);
    expect(transitions.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { assigneeUserId: 'executor', dueAt },
        expectedVersion: 2,
        orderId: 'order',
        to: 'ASSIGNED',
      }),
      operator,
    );
  });

  it('records a normalized progress note only for the current executor', async () => {
    await service.addProgress('ORD-1', '  Work is halfway complete  ', executor);
    expect(repository.appendProgressLog).toHaveBeenCalledWith(
      order,
      'Work is halfway complete',
      executor,
    );
    await expect(
      service.addProgress('ORD-1', 'Valid note', { ...executor, userId: 'other' }),
    ).rejects.toMatchObject({ code: 'ACTOR_CONSTRAINT_FAILED' });
  });

  it('validates state, ownership and count before evidence persistence', async () => {
    await service.addEvidence(
      'ORD-1',
      {
        fileId: 'file',
        fileSize: 100,
        fileUniqueId: 'unique',
        mediaType: 'image/jpeg',
        phase: 'AFTER',
      },
      executor,
    );
    expect(repository.appendEvidence).toHaveBeenCalledOnce();
    vi.mocked(repository.countEvidence).mockResolvedValue(3);
    await expect(
      service.addEvidence(
        'ORD-1',
        {
          fileId: 'file-2',
          fileSize: 100,
          fileUniqueId: 'unique-2',
          mediaType: 'image/jpeg',
          phase: 'AFTER',
        },
        executor,
      ),
    ).rejects.toMatchObject({ code: 'WORK_EVIDENCE_LIMIT' });
  });

  it('derives executor and escalation scopes from persisted grants', async () => {
    await service.listMine(executor);
    expect(repository.listAssignedOrders).toHaveBeenCalledWith('executor', ['area']);
    const reviewer: Principal = {
      grants: [{ permission: 'order.escalation.review', serviceAreaId: null }],
      userId: 'operator',
    };
    await service.scanOverdue(reviewer);
    expect(repository.scanOverdue).toHaveBeenCalledWith(
      [null],
      new Date('2026-07-30T00:00:00Z'),
      reviewer,
    );
  });

  it('acknowledges an alert but resolves only after the overdue cause ends', async () => {
    const manager: Principal = {
      grants: [{ permission: 'order.escalation.manage', serviceAreaId: 'area' }],
      userId: 'operator',
    };
    vi.mocked(repository.updateDeadlineEscalation).mockResolvedValue({
      dueAt: new Date('2026-07-29T10:00:00Z'),
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'ACKNOWLEDGED',
    });
    await expect(
      service.updateDeadlineEscalation('ORD-1', 'ACKNOWLEDGED', manager),
    ).resolves.toMatchObject({ status: 'ACKNOWLEDGED' });
    await expect(
      service.updateDeadlineEscalation('ORD-1', 'RESOLVED', manager),
    ).rejects.toMatchObject({ code: 'ESCALATION_CAUSE_ACTIVE' });
    vi.mocked(repository.findOrderByNumber).mockResolvedValue({
      ...order,
      status: 'AWAITING_ACCEPTANCE',
    });
    vi.mocked(repository.updateDeadlineEscalation).mockResolvedValue({
      dueAt: new Date('2026-07-29T10:00:00Z'),
      orderId: order.id,
      orderNumber: order.orderNumber,
      status: 'RESOLVED',
    });
    await expect(
      service.updateDeadlineEscalation('ORD-1', 'RESOLVED', manager),
    ).resolves.toMatchObject({ status: 'RESOLVED' });
    await expect(
      service.updateDeadlineEscalation('ORD-1', 'RESOLVED', { ...manager, grants: [] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
