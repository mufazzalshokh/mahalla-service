import { and, eq, inArray, sql } from 'drizzle-orm';

import type {
  OrderRepository,
  PersistOrderTransition,
} from '../../application/orders/order-repository.js';
import type {
  OrderSnapshot,
  OrderTransitionData,
} from '../../domain/orders/order-state-machine.js';
import {
  ConcurrencyConflictError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';
import type { MckDatabase } from '../database/client.js';
import {
  assignments,
  auditLogs,
  orderExecutionSlaClocks,
  orders,
  orderStatusHistory,
  workLogs,
} from '../database/schema.js';

type OrderRow = typeof orders.$inferSelect;

function mapOrder(row: OrderRow): OrderSnapshot {
  return {
    assignedExecutorUserId: row.currentExecutorUserId,
    categoryId: row.categoryId,
    id: row.id,
    serviceAreaId: row.serviceAreaId,
    status: row.status,
    version: row.version,
  };
}

function metadataFrom(data: OrderTransitionData): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  );
}

function reasonFrom(data: OrderTransitionData): string | undefined {
  return (
    data.reason ??
    data.cancellationReason ??
    data.blockerReason ??
    data.reworkReason ??
    data.completionSummary
  );
}

export class PostgresOrderRepository implements OrderRepository {
  constructor(private readonly database: MckDatabase) {}

  async findById(id: string): Promise<OrderSnapshot | undefined> {
    const [row] = await this.database.select().from(orders).where(eq(orders.id, id)).limit(1);
    return row ? mapOrder(row) : undefined;
  }

  async applyTransition(command: PersistOrderTransition): Promise<OrderSnapshot> {
    return this.database.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, command.order.id))
        .limit(1);
      if (!current) throw new EntityNotFoundError('Order', command.order.id);

      const now = new Date();
      const changes: Record<string, unknown> = {
        status: command.plan.to,
        updatedAt: now,
        version: sql`${orders.version} + 1`,
      };

      if (command.plan.from === 'REGISTERED' && command.plan.to === 'ASSIGNED') {
        changes.currentExecutorUserId = command.data.assigneeUserId;
        changes.dueAt = command.data.dueAt;
      }
      if (command.plan.from === 'ASSIGNED' && command.plan.to === 'REGISTERED') {
        changes.currentExecutorUserId = null;
        changes.dueAt = null;
      }
      if (command.plan.to === 'BLOCKED') changes.blockerReason = command.data.blockerReason;
      if (command.plan.from === 'BLOCKED' && command.plan.to === 'IN_PROGRESS') {
        changes.blockerReason = null;
      }
      if (command.plan.to === 'AWAITING_ACCEPTANCE') {
        changes.completionSummary = command.data.completionSummary;
      }
      if (command.plan.to === 'REWORK_REQUIRED') changes.reworkReason = command.data.reworkReason;
      if (command.plan.to === 'COMPLETED') changes.completedAt = now;
      if (command.plan.to === 'CANCELLED') {
        changes.cancellationReason = command.data.cancellationReason;
      }

      const [updated] = await tx
        .update(orders)
        .set(changes)
        .where(
          and(
            eq(orders.id, command.order.id),
            eq(orders.version, command.expectedVersion),
            eq(orders.status, command.plan.from),
          ),
        )
        .returning();

      if (!updated) throw new ConcurrencyConflictError('Order', command.order.id);

      if (command.plan.from === 'REGISTERED' && command.plan.to === 'ASSIGNED') {
        const executorUserId = command.data.assigneeUserId;
        const dueAt = command.data.dueAt;
        if (!executorUserId || !dueAt) throw new Error('Assignment data missing after validation');
        await tx.insert(assignments).values({
          assignedAt: now,
          assignedByUserId: command.actorUserId,
          dueAt,
          executorUserId,
          orderId: command.order.id,
        });
        await tx
          .insert(orderExecutionSlaClocks)
          .values({ dueAt, orderId: command.order.id })
          .onConflictDoUpdate({
            set: {
              dueAt,
              pausedAt: null,
              pausedSeconds: 0,
              startedAt: null,
              stoppedAt: null,
              updatedAt: now,
            },
            target: orderExecutionSlaClocks.orderId,
          });
      }
      if (command.plan.from === 'ASSIGNED' && command.plan.to === 'REGISTERED') {
        await tx
          .update(assignments)
          .set({
            respondedAt: now,
            responseReason: command.data.reason,
            status: 'DECLINED',
          })
          .where(and(eq(assignments.orderId, command.order.id), eq(assignments.status, 'PENDING')));
        await tx
          .update(orderExecutionSlaClocks)
          .set({ stoppedAt: now, updatedAt: now })
          .where(eq(orderExecutionSlaClocks.orderId, command.order.id));
      }
      if (command.plan.from === 'ASSIGNED' && command.plan.to === 'IN_PROGRESS') {
        await tx
          .update(assignments)
          .set({ respondedAt: now, status: 'ACCEPTED' })
          .where(and(eq(assignments.orderId, command.order.id), eq(assignments.status, 'PENDING')));
        await tx
          .update(orderExecutionSlaClocks)
          .set({ startedAt: now, stoppedAt: null, updatedAt: now })
          .where(eq(orderExecutionSlaClocks.orderId, command.order.id));
      }
      if (command.plan.from === 'IN_PROGRESS' && command.plan.to === 'BLOCKED') {
        const note = command.data.blockerReason;
        if (!note) throw new Error('Blocker reason missing after validation');
        await tx.insert(workLogs).values({
          actorUserId: command.actorUserId,
          logType: 'BLOCKED',
          note,
          orderId: command.order.id,
        });
        await tx
          .update(orderExecutionSlaClocks)
          .set({ pausedAt: now, updatedAt: now })
          .where(eq(orderExecutionSlaClocks.orderId, command.order.id));
      }
      if (command.plan.from === 'BLOCKED' && command.plan.to === 'IN_PROGRESS') {
        await tx.insert(workLogs).values({
          actorUserId: command.actorUserId,
          logType: 'UNBLOCKED',
          note: command.data.progressNote?.trim() || 'Blocker resolved',
          orderId: command.order.id,
        });
        await tx
          .update(orderExecutionSlaClocks)
          .set({
            pausedAt: null,
            pausedSeconds: sql`${orderExecutionSlaClocks.pausedSeconds} + greatest(0, extract(epoch from (${now.toISOString()}::timestamptz - ${orderExecutionSlaClocks.pausedAt})))::int`,
            updatedAt: now,
          })
          .where(eq(orderExecutionSlaClocks.orderId, command.order.id));
      }
      if (command.plan.from === 'IN_PROGRESS' && command.plan.to === 'AWAITING_ACCEPTANCE') {
        const note = command.data.completionSummary;
        if (!note) throw new Error('Completion summary missing after validation');
        await tx.insert(workLogs).values({
          actorUserId: command.actorUserId,
          logType: 'COMPLETION',
          note,
          orderId: command.order.id,
        });
        await tx
          .update(assignments)
          .set({ status: 'COMPLETED' })
          .where(
            and(eq(assignments.orderId, command.order.id), eq(assignments.status, 'ACCEPTED')),
          );
        await tx
          .update(orderExecutionSlaClocks)
          .set({ stoppedAt: now, updatedAt: now })
          .where(eq(orderExecutionSlaClocks.orderId, command.order.id));
      }
      if (command.plan.to === 'CANCELLED') {
        await tx
          .update(assignments)
          .set({ status: 'CANCELLED' })
          .where(
            and(
              eq(assignments.orderId, command.order.id),
              inArray(assignments.status, ['PENDING', 'ACCEPTED']),
            ),
          );
        await tx
          .update(orderExecutionSlaClocks)
          .set({ stoppedAt: now, updatedAt: now })
          .where(eq(orderExecutionSlaClocks.orderId, command.order.id));
      }

      const nextVersion = command.expectedVersion + 1;
      const metadata = metadataFrom(command.data);
      const reason = reasonFrom(command.data);

      await tx.insert(orderStatusHistory).values({
        actorUserId: command.actorUserId,
        fromStatus: command.plan.from,
        metadata,
        occurredAt: now,
        orderId: command.order.id,
        orderVersion: nextVersion,
        ...(reason ? { reason } : {}),
        toStatus: command.plan.to,
        transitionKey: `${command.plan.from}->${command.plan.to}`,
      });

      await tx.insert(auditLogs).values({
        action: command.plan.definition.auditEvent,
        actorUserId: command.actorUserId,
        after: {
          assignedExecutorUserId: updated.currentExecutorUserId,
          status: updated.status,
          version: updated.version,
        },
        before: {
          assignedExecutorUserId: current.currentExecutorUserId,
          status: current.status,
          version: current.version,
        },
        entityId: command.order.id,
        entityType: 'order',
        occurredAt: now,
        ...(reason ? { reason } : {}),
        ...(command.requestId ? { requestId: command.requestId } : {}),
      });

      return mapOrder(updated);
    });
  }
}
