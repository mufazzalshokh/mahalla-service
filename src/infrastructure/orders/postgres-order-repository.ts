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
  ActorConstraintError,
  ConcurrencyConflictError,
  DomainRuleError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';
import type { MckDatabase } from '../database/client.js';
import {
  assignments,
  auditLogs,
  orderAcceptances,
  orderExecutionSlaClocks,
  orderRequestLinks,
  orderWarranties,
  orders,
  orderStatusHistory,
  qualityComplaints,
  qualityChecklistTemplates,
  qualityInspections,
  qualityReworkDecisions,
  serviceRequests,
  workLogs,
} from '../database/schema.js';
import {
  enqueueNotificationIntent,
  residentRecipientsForOrder,
  staffRecipientsForArea,
  type NotificationRecipient,
} from '../notifications/notification-enqueuer.js';

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
  constructor(
    private readonly database: MckDatabase,
    private readonly now: () => Date = () => new Date(),
  ) {}

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

      const now = this.now();
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
      if (command.plan.to === 'REWORK_REQUIRED') changes.dueAt = command.data.reworkDueAt;
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
      if (command.plan.to === 'REWORK_REQUIRED') {
        const dueAt = command.data.reworkDueAt;
        const executorUserId = current.currentExecutorUserId;
        const reason = command.data.reworkReason;
        if (!dueAt || !executorUserId || !reason) {
          throw new DomainRuleError(
            'REWORK_CONTEXT_MISSING',
            'Rework requires an executor, reason, and deadline',
          );
        }
        if (command.data.complaintId) {
          const [complaint] = await tx
            .select({ id: qualityComplaints.id })
            .from(qualityComplaints)
            .where(
              and(
                eq(qualityComplaints.id, command.data.complaintId),
                eq(qualityComplaints.orderId, command.order.id),
                eq(qualityComplaints.status, 'OPEN'),
              ),
            )
            .for('update');
          if (!complaint) {
            throw new DomainRuleError(
              'COMPLAINT_NOT_OPEN',
              'Complaint is not open and linked to this order',
            );
          }
          await tx
            .update(qualityComplaints)
            .set({
              reopenedAt: now,
              reopenedByUserId: command.actorUserId,
              status: 'REOPENED',
            })
            .where(eq(qualityComplaints.id, complaint.id));
        }
        await tx.insert(qualityReworkDecisions).values({
          actorUserId: command.actorUserId,
          ...(command.data.complaintId ? { complaintId: command.data.complaintId } : {}),
          dueAt,
          orderId: command.order.id,
          reason,
          source: command.data.complaintId ? 'COMPLAINT' : 'ACCEPTANCE',
        });
        await tx.insert(assignments).values({
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
      if (command.plan.from === 'REWORK_REQUIRED' && command.plan.to === 'IN_PROGRESS') {
        await tx
          .update(assignments)
          .set({ respondedAt: now, status: 'ACCEPTED' })
          .where(and(eq(assignments.orderId, command.order.id), eq(assignments.status, 'PENDING')));
        await tx
          .update(orderExecutionSlaClocks)
          .set({ startedAt: now, stoppedAt: null, updatedAt: now })
          .where(eq(orderExecutionSlaClocks.orderId, command.order.id));
      }
      if (command.plan.to === 'COMPLETED') {
        const source = command.data.acceptanceSource;
        const warrantyDays = command.data.warrantyDays;
        if (!source || warrantyDays === undefined) {
          throw new Error('Acceptance data missing after validation');
        }
        const [policy] = await tx
          .select({
            acceptanceMode: qualityChecklistTemplates.acceptanceMode,
            id: qualityChecklistTemplates.id,
            inspectionRequired: qualityChecklistTemplates.inspectionRequired,
            warrantyDays: qualityChecklistTemplates.warrantyDays,
          })
          .from(qualityChecklistTemplates)
          .where(
            and(
              eq(qualityChecklistTemplates.categoryId, current.categoryId),
              eq(qualityChecklistTemplates.isActive, true),
            ),
          )
          .limit(1);
        if (!policy || policy.warrantyDays !== warrantyDays) {
          throw new DomainRuleError(
            'QUALITY_POLICY_MISMATCH',
            'Acceptance must use the active category quality policy',
          );
        }
        if (source === 'RESIDENT') {
          if (policy.acceptanceMode === 'OPERATOR_ONLY') {
            throw new DomainRuleError(
              'OPERATOR_ACCEPTANCE_REQUIRED',
              'Category policy requires operator acceptance',
            );
          }
          const [owned] = await tx
            .select({ requestId: serviceRequests.id })
            .from(orderRequestLinks)
            .innerJoin(serviceRequests, eq(serviceRequests.id, orderRequestLinks.requestId))
            .where(
              and(
                eq(orderRequestLinks.orderId, command.order.id),
                eq(serviceRequests.requesterUserId, command.actorUserId),
              ),
            )
            .limit(1);
          if (!owned) {
            throw new ActorConstraintError('Resident does not own this order');
          }
        }
        if (policy.inspectionRequired || command.data.inspectionId) {
          const [inspection] = command.data.inspectionId
            ? await tx
                .select({ id: qualityInspections.id })
                .from(qualityInspections)
                .where(
                  and(
                    eq(qualityInspections.id, command.data.inspectionId),
                    eq(qualityInspections.orderId, command.order.id),
                    eq(qualityInspections.orderVersion, current.version),
                    eq(qualityInspections.templateId, policy.id),
                    eq(qualityInspections.outcome, 'PASS'),
                  ),
                )
                .limit(1)
            : [];
          if (!inspection) {
            throw new DomainRuleError(
              'PASSING_INSPECTION_REQUIRED',
              'A passing inspection for the active policy is required',
            );
          }
        }
        const orderVersion = command.expectedVersion + 1;
        await tx.insert(orderAcceptances).values({
          actorUserId: command.actorUserId,
          ...(command.data.inspectionId ? { inspectionId: command.data.inspectionId } : {}),
          orderId: command.order.id,
          orderVersion,
          source,
        });
        const endsAt = new Date(now.getTime() + warrantyDays * 24 * 60 * 60 * 1000);
        await tx
          .insert(orderWarranties)
          .values({ endsAt, orderId: command.order.id, startsAt: now, warrantyDays })
          .onConflictDoUpdate({
            set: { endsAt, startsAt: now, warrantyDays },
            target: orderWarranties.orderId,
          });
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

      const effect = command.plan.definition.notification;
      if (effect === 'none') return mapOrder(updated);
      let recipients: readonly NotificationRecipient[];
      if (effect.startsWith('resident.')) {
        recipients = await residentRecipientsForOrder(tx, command.order.id);
      } else if (effect.startsWith('operator.')) {
        recipients = await staffRecipientsForArea(tx, command.order.serviceAreaId);
      } else {
        const executorUserId =
          command.data.assigneeUserId ??
          current.currentExecutorUserId ??
          updated.currentExecutorUserId;
        recipients = executorUserId ? [{ audience: 'STAFF', userId: executorUserId }] : [];
      }
      await enqueueNotificationIntent(
        tx,
        {
          deduplicationKey: `order:${command.order.id}:v${updated.version}:${effect}`,
          payload: {
            ...(updated.dueAt ? { dueAt: updated.dueAt.toISOString() } : {}),
            reference: updated.orderNumber,
            status: updated.status,
            templateKey: effect,
          },
          serviceAreaId: command.order.serviceAreaId,
        },
        recipients,
      );

      return mapOrder(updated);
    });
  }
}
