import { describe, expect, it } from 'vitest';

import type {
  ExecutorEligibilityPort,
  OrderRepository,
  PersistOrderTransition,
} from '../src/application/orders/order-repository.js';
import { TransitionOrderService } from '../src/application/orders/transition-order-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';
import type { OrderSnapshot } from '../src/domain/orders/order-state-machine.js';
import {
  ConcurrencyConflictError,
  EntityNotFoundError,
} from '../src/domain/shared/domain-errors.js';
import type { DomainRuleError } from '../src/domain/shared/domain-errors.js';

const now = new Date('2026-07-27T10:00:00.000Z');
const order: OrderSnapshot = {
  assignedExecutorUserId: null,
  categoryId: 'category-a',
  id: 'order-1',
  serviceAreaId: 'area-a',
  status: 'REGISTERED',
  version: 3,
};
const principal: Principal = {
  grants: [{ permission: 'order.assign', serviceAreaId: 'area-a' }],
  userId: 'operator-1',
};
const command = {
  data: { assigneeUserId: 'executor-1', dueAt: new Date('2026-07-28T10:00:00.000Z') },
  expectedVersion: 3,
  orderId: 'order-1',
  requestId: 'correlation-1',
  to: 'ASSIGNED' as const,
};

class StubRepository implements OrderRepository {
  applied?: PersistOrderTransition;

  constructor(private readonly stored?: OrderSnapshot) {}

  findById(): Promise<OrderSnapshot | undefined> {
    return Promise.resolve(this.stored);
  }

  applyTransition(input: PersistOrderTransition): Promise<OrderSnapshot> {
    this.applied = input;
    return Promise.resolve({
      ...input.order,
      assignedExecutorUserId: input.data.assigneeUserId ?? null,
      status: input.plan.to,
      version: input.expectedVersion + 1,
    });
  }
}

class StubEligibility implements ExecutorEligibilityPort {
  constructor(private readonly eligible: boolean) {}

  isEligible(): Promise<boolean> {
    return Promise.resolve(this.eligible);
  }
}

describe('TransitionOrderService', () => {
  it('validates and persists a transition with actor and correlation metadata', async () => {
    const repository = new StubRepository(order);
    const service = new TransitionOrderService(repository, new StubEligibility(true), () => now);

    await expect(service.execute(command, principal)).resolves.toMatchObject({
      assignedExecutorUserId: 'executor-1',
      status: 'ASSIGNED',
      version: 4,
    });
    expect(repository.applied).toMatchObject({
      actorUserId: 'operator-1',
      expectedVersion: 3,
      requestId: 'correlation-1',
    });
  });

  it('rejects missing orders and stale versions', async () => {
    const missing = new TransitionOrderService(new StubRepository(), new StubEligibility(true));
    await expect(missing.execute(command, principal)).rejects.toBeInstanceOf(EntityNotFoundError);

    const stale = new TransitionOrderService(new StubRepository(order), new StubEligibility(true));
    await expect(
      stale.execute({ ...command, expectedVersion: 2 }, principal),
    ).rejects.toBeInstanceOf(ConcurrencyConflictError);
  });

  it('rejects an ineligible executor', async () => {
    const service = new TransitionOrderService(
      new StubRepository(order),
      new StubEligibility(false),
      () => now,
    );
    await expect(service.execute(command, principal)).rejects.toMatchObject({
      code: 'EXECUTOR_NOT_ELIGIBLE',
    } satisfies Partial<DomainRuleError>);
  });
});
