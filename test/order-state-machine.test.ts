import { describe, expect, it } from 'vitest';

import type { Principal } from '../src/domain/identity/permissions.js';
import {
  orderTransitionDefinitions,
  planOrderTransition,
  type OrderSnapshot,
} from '../src/domain/orders/order-state-machine.js';
import {
  ActorConstraintError,
  AuthorizationError,
  InvalidTransitionError,
  MissingTransitionDataError,
} from '../src/domain/shared/domain-errors.js';
import type { DomainRuleError } from '../src/domain/shared/domain-errors.js';

const now = new Date('2026-07-27T10:00:00.000Z');
const registered: OrderSnapshot = {
  assignedExecutorUserId: null,
  categoryId: 'category-a',
  id: 'order-1',
  serviceAreaId: 'area-a',
  status: 'REGISTERED',
  version: 0,
};
const operator: Principal = {
  grants: [{ permission: 'order.assign', serviceAreaId: 'area-a' }],
  userId: 'operator-1',
};

describe('order state machine', () => {
  it('defines complete operational metadata and unique edges', () => {
    const edges = new Set<string>();
    for (const definition of orderTransitionDefinitions) {
      const edge = `${definition.from}->${definition.to}`;
      expect(edges.has(edge)).toBe(false);
      edges.add(edge);
      expect(definition.auditEvent).not.toHaveLength(0);
      expect(definition.compensation).not.toHaveLength(0);
      expect(definition.failureBehavior).not.toHaveLength(0);
      expect(definition.preconditions.length).toBeGreaterThan(0);
      expect(definition.sideEffects.length).toBeGreaterThan(0);
    }
  });

  it('plans a valid assignment with a future deadline', () => {
    const result = planOrderTransition(
      registered,
      'ASSIGNED',
      { assigneeUserId: 'executor-1', dueAt: new Date('2026-07-28T10:00:00.000Z') },
      operator,
      now,
    );
    expect(result).toMatchObject({ from: 'REGISTERED', to: 'ASSIGNED' });
  });

  it('rejects missing and past assignment data', () => {
    expect(() => planOrderTransition(registered, 'ASSIGNED', {}, operator, now)).toThrow(
      MissingTransitionDataError,
    );
    expect(() =>
      planOrderTransition(
        registered,
        'ASSIGNED',
        { assigneeUserId: 'executor-1', dueAt: new Date('2026-07-26T10:00:00.000Z') },
        operator,
        now,
      ),
    ).toThrowError(
      expect.objectContaining<Partial<DomainRuleError>>({ code: 'DEADLINE_NOT_FUTURE' }),
    );
  });

  it('enforces scope and the assigned-executor actor constraint', () => {
    expect(() =>
      planOrderTransition(
        registered,
        'ASSIGNED',
        { assigneeUserId: 'executor-1', dueAt: new Date('2026-07-28T10:00:00.000Z') },
        { ...operator, grants: [{ permission: 'order.assign', serviceAreaId: 'area-b' }] },
        now,
      ),
    ).toThrow(AuthorizationError);

    const assigned: OrderSnapshot = {
      ...registered,
      assignedExecutorUserId: 'executor-1',
      status: 'ASSIGNED',
    };
    const wrongExecutor: Principal = {
      grants: [{ permission: 'assignment.respond', serviceAreaId: 'area-a' }],
      userId: 'executor-2',
    };
    expect(() => planOrderTransition(assigned, 'IN_PROGRESS', {}, wrongExecutor, now)).toThrow(
      ActorConstraintError,
    );
  });

  it('covers executor-owned progress, blocking, completion and rework edges', () => {
    const executor: Principal = {
      grants: [
        { permission: 'assignment.respond', serviceAreaId: 'area-a' },
        { permission: 'order.update_progress', serviceAreaId: 'area-a' },
        { permission: 'order.submit_completion', serviceAreaId: 'area-a' },
        { permission: 'order.start_rework', serviceAreaId: 'area-a' },
      ],
      userId: 'executor-1',
    };
    const assigned: OrderSnapshot = {
      ...registered,
      assignedExecutorUserId: 'executor-1',
      status: 'ASSIGNED',
    };
    const inProgress = { ...assigned, status: 'IN_PROGRESS' as const };

    expect(
      planOrderTransition(assigned, 'REGISTERED', { reason: 'Cannot serve' }, executor, now),
    ).toMatchObject({ to: 'REGISTERED' });
    expect(planOrderTransition(assigned, 'IN_PROGRESS', {}, executor, now)).toMatchObject({
      to: 'IN_PROGRESS',
    });
    expect(
      planOrderTransition(
        inProgress,
        'BLOCKED',
        { blockerReason: 'Access unavailable' },
        executor,
        now,
      ),
    ).toMatchObject({ to: 'BLOCKED' });
    expect(
      planOrderTransition(
        inProgress,
        'AWAITING_ACCEPTANCE',
        { completionSummary: 'Fixed' },
        executor,
        now,
      ),
    ).toMatchObject({ to: 'AWAITING_ACCEPTANCE' });
    expect(
      planOrderTransition({ ...assigned, status: 'BLOCKED' }, 'IN_PROGRESS', {}, executor, now),
    ).toMatchObject({ to: 'IN_PROGRESS' });
    expect(
      planOrderTransition(
        { ...assigned, status: 'REWORK_REQUIRED' },
        'IN_PROGRESS',
        {},
        executor,
        now,
      ),
    ).toMatchObject({ to: 'IN_PROGRESS' });
  });

  it('rejects an invalid date value', () => {
    expect(() =>
      planOrderTransition(
        registered,
        'ASSIGNED',
        { assigneeUserId: 'executor-1', dueAt: new Date(Number.NaN) },
        operator,
        now,
      ),
    ).toThrow(MissingTransitionDataError);
  });

  it('rejects an undefined lifecycle edge', () => {
    expect(() => planOrderTransition(registered, 'COMPLETED', {}, operator, now)).toThrow(
      InvalidTransitionError,
    );
  });
});
