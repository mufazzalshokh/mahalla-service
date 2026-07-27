import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import type {
  EscalationRecord,
  ExecutionOrderRecord,
  ExecutionRepository,
  ExecutorRecord,
} from '../../application/execution/execution-repository.js';
import type { Principal } from '../../domain/identity/permissions.js';
import type {
  WorkEvidenceInput,
  WorkEvidencePhase,
} from '../../domain/execution/work-evidence-policy.js';
import type { MckDatabase } from '../database/client.js';
import {
  auditLogs,
  executorCategoryCapabilities,
  executorProfiles,
  orderEscalations,
  orders,
  roles,
  userRoles,
  users,
  workEvidence,
  workLogs,
} from '../database/schema.js';

const orderProjection = {
  assignedExecutorUserId: orders.currentExecutorUserId,
  categoryId: orders.categoryId,
  dueAt: orders.dueAt,
  id: orders.id,
  orderNumber: orders.orderNumber,
  priorityBand: orders.priorityBand,
  serviceAreaId: orders.serviceAreaId,
  status: orders.status,
  version: orders.version,
};

export class PostgresExecutionRepository implements ExecutionRepository {
  constructor(private readonly database: MckDatabase) {}

  async findOrderByNumber(orderNumber: string): Promise<ExecutionOrderRecord | undefined> {
    const [row] = await this.database
      .select(orderProjection)
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    return row;
  }

  async findExecutorByCode(code: string): Promise<ExecutorRecord | undefined> {
    const [row] = await this.database
      .select({
        code: executorProfiles.code,
        displayName: executorProfiles.displayName,
        userId: executorProfiles.userId,
      })
      .from(executorProfiles)
      .innerJoin(users, eq(users.id, executorProfiles.userId))
      .where(
        and(
          eq(executorProfiles.code, code),
          eq(executorProfiles.isAvailable, true),
          eq(users.status, 'ACTIVE'),
        ),
      )
      .limit(1);
    return row;
  }

  async listEligibleExecutors(order: ExecutionOrderRecord): Promise<readonly ExecutorRecord[]> {
    return this.database
      .selectDistinct({
        code: executorProfiles.code,
        displayName: executorProfiles.displayName,
        userId: executorProfiles.userId,
      })
      .from(executorProfiles)
      .innerJoin(users, eq(users.id, executorProfiles.userId))
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(
        executorCategoryCapabilities,
        eq(executorCategoryCapabilities.executorUserId, users.id),
      )
      .where(
        and(
          eq(users.status, 'ACTIVE'),
          eq(executorProfiles.isAvailable, true),
          eq(roles.code, 'executor'),
          eq(executorCategoryCapabilities.categoryId, order.categoryId),
          or(isNull(userRoles.serviceAreaId), eq(userRoles.serviceAreaId, order.serviceAreaId)),
        ),
      )
      .orderBy(executorProfiles.code);
  }

  async listAssignedOrders(
    executorUserId: string,
    serviceAreaIds: readonly (string | null)[],
  ): Promise<readonly ExecutionOrderRecord[]> {
    const areas = serviceAreaIds.filter((value): value is string => value !== null);
    return this.database
      .select(orderProjection)
      .from(orders)
      .where(
        and(
          eq(orders.currentExecutorUserId, executorUserId),
          inArray(orders.status, [
            'ASSIGNED',
            'IN_PROGRESS',
            'BLOCKED',
            'AWAITING_ACCEPTANCE',
            'REWORK_REQUIRED',
          ]),
          ...(serviceAreaIds.includes(null) ? [] : [inArray(orders.serviceAreaId, areas)]),
        ),
      )
      .orderBy(orders.dueAt);
  }

  async appendProgressLog(
    order: ExecutionOrderRecord,
    note: string,
    actor: Principal,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const [created] = await tx
        .insert(workLogs)
        .values({ actorUserId: actor.userId, logType: 'PROGRESS', note, orderId: order.id })
        .returning({ id: workLogs.id });
      if (!created) throw new Error('Work log insert returned no row');
      await tx.insert(auditLogs).values({
        action: 'order.progress_recorded',
        actorUserId: actor.userId,
        after: { logId: created.id, logType: 'PROGRESS' },
        entityId: order.id,
        entityType: 'order',
      });
    });
  }

  async countEvidence(orderId: string, phase: WorkEvidencePhase): Promise<number> {
    const [row] = await this.database
      .select({ value: sql<number>`count(*)::int` })
      .from(workEvidence)
      .where(and(eq(workEvidence.orderId, orderId), eq(workEvidence.phase, phase)));
    return row?.value ?? 0;
  }

  async appendEvidence(
    order: ExecutionOrderRecord,
    input: WorkEvidenceInput,
    actor: Principal,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const [created] = await tx
        .insert(workEvidence)
        .values({
          actorUserId: actor.userId,
          fileSize: input.fileSize,
          mediaType: input.mediaType,
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
          orderId: order.id,
          phase: input.phase,
          telegramFileId: input.fileId,
          telegramFileUniqueId: input.fileUniqueId,
        })
        .returning({ id: workEvidence.id });
      if (!created) throw new Error('Work evidence insert returned no row');
      await tx.insert(auditLogs).values({
        action: 'order.evidence_added',
        actorUserId: actor.userId,
        after: { evidenceId: created.id, phase: input.phase },
        entityId: order.id,
        entityType: 'order',
      });
    });
  }

  async scanOverdue(
    serviceAreaIds: readonly (string | null)[],
    now: Date,
    actor: Principal,
  ): Promise<readonly EscalationRecord[]> {
    return this.database.transaction(async (tx) => {
      const areas = serviceAreaIds.filter((value): value is string => value !== null);
      const overdue = await tx
        .select({ dueAt: orders.dueAt, id: orders.id, orderNumber: orders.orderNumber })
        .from(orders)
        .where(
          and(
            inArray(orders.status, ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED']),
            lt(orders.dueAt, now),
            ...(serviceAreaIds.includes(null) ? [] : [inArray(orders.serviceAreaId, areas)]),
          ),
        );
      for (const order of overdue) {
        if (!order.dueAt) continue;
        const [created] = await tx
          .insert(orderEscalations)
          .values({ orderId: order.id, type: 'DEADLINE_OVERDUE' })
          .onConflictDoNothing()
          .returning({ id: orderEscalations.id });
        if (created) {
          await tx.insert(auditLogs).values({
            action: 'order.deadline_escalated',
            actorUserId: actor.userId,
            after: { dueAt: order.dueAt.toISOString(), escalationId: created.id },
            entityId: order.id,
            entityType: 'order',
          });
        }
      }
      const rows = await tx
        .select({
          dueAt: orders.dueAt,
          orderId: orders.id,
          orderNumber: orders.orderNumber,
          status: orderEscalations.status,
        })
        .from(orderEscalations)
        .innerJoin(orders, eq(orders.id, orderEscalations.orderId))
        .where(
          and(
            inArray(orderEscalations.status, ['OPEN', 'ACKNOWLEDGED']),
            eq(orderEscalations.type, 'DEADLINE_OVERDUE'),
            ...(serviceAreaIds.includes(null) ? [] : [inArray(orders.serviceAreaId, areas)]),
          ),
        )
        .orderBy(orders.dueAt);
      return rows.flatMap((row) => (row.dueAt ? [{ ...row, dueAt: row.dueAt }] : []));
    });
  }

  async updateDeadlineEscalation(
    order: ExecutionOrderRecord,
    status: 'ACKNOWLEDGED' | 'RESOLVED',
    actor: Principal,
    now: Date,
  ): Promise<EscalationRecord | undefined> {
    return this.database.transaction(async (tx) => {
      const [updated] = await tx
        .update(orderEscalations)
        .set(
          status === 'ACKNOWLEDGED'
            ? {
                acknowledgedAt: now,
                acknowledgedByUserId: actor.userId,
                status,
              }
            : { resolvedAt: now, status },
        )
        .where(
          and(
            eq(orderEscalations.orderId, order.id),
            eq(orderEscalations.type, 'DEADLINE_OVERDUE'),
            status === 'ACKNOWLEDGED'
              ? eq(orderEscalations.status, 'OPEN')
              : inArray(orderEscalations.status, ['OPEN', 'ACKNOWLEDGED']),
          ),
        )
        .returning({ id: orderEscalations.id });
      if (!updated || !order.dueAt) return undefined;
      await tx.insert(auditLogs).values({
        action:
          status === 'ACKNOWLEDGED'
            ? 'order.deadline_escalation_acknowledged'
            : 'order.deadline_escalation_resolved',
        actorUserId: actor.userId,
        after: { escalationId: updated.id, status },
        entityId: order.id,
        entityType: 'order',
      });
      return {
        dueAt: order.dueAt,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status,
      };
    });
  }
}
