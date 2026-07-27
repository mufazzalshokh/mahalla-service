import { and, eq, gt, inArray, lte, sql } from 'drizzle-orm';

import type {
  AutomationRepository,
  AutomationScanResult,
} from '../../application/automation/operational-automation.js';
import type { MckDatabase } from '../database/client.js';
import { auditLogs, orderEscalations, orders, qualityComplaints } from '../database/schema.js';
import {
  enqueueNotificationIntent,
  staffRecipientsForArea,
} from '../notifications/notification-enqueuer.js';

const activeDeadlineStatuses = ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'REWORK_REQUIRED'] as const;

export class PostgresAutomationRepository implements AutomationRepository {
  constructor(private readonly database: MckDatabase) {}

  async scan(now: Date): Promise<AutomationScanResult> {
    return this.database.transaction(async (tx) => {
      const [lock] = await tx.execute<{ acquired: boolean }>(
        sql`select pg_try_advisory_xact_lock(72007001) as acquired`,
      );
      if (!lock?.acquired) {
        return { complaintAlerts: 0, deadlineAlerts: 0, reminders: 0, skipped: true };
      }

      let reminders = 0;
      let deadlineAlerts = 0;
      let complaintAlerts = 0;
      const reminderHorizon = new Date(now.getTime() + 2 * 60 * 60 * 1_000);
      const dueSoon = await tx
        .select({
          dueAt: orders.dueAt,
          executorUserId: orders.currentExecutorUserId,
          id: orders.id,
          orderNumber: orders.orderNumber,
          serviceAreaId: orders.serviceAreaId,
          status: orders.status,
          version: orders.version,
        })
        .from(orders)
        .where(
          and(
            inArray(orders.status, activeDeadlineStatuses),
            gt(orders.dueAt, now),
            lte(orders.dueAt, reminderHorizon),
          ),
        );
      for (const order of dueSoon) {
        if (!order.dueAt || !order.executorUserId) continue;
        reminders += await enqueueNotificationIntent(
          tx,
          {
            deduplicationKey: `order:${order.id}:v${order.version}:deadline-reminder:${order.dueAt.toISOString()}`,
            payload: {
              dueAt: order.dueAt.toISOString(),
              reference: order.orderNumber,
              status: order.status,
              templateKey: 'executor.deadline_reminder',
            },
            serviceAreaId: order.serviceAreaId,
          },
          [{ audience: 'STAFF', userId: order.executorUserId }],
        );
      }

      const overdue = await tx
        .select({
          dueAt: orders.dueAt,
          id: orders.id,
          orderNumber: orders.orderNumber,
          serviceAreaId: orders.serviceAreaId,
          status: orders.status,
        })
        .from(orders)
        .where(and(inArray(orders.status, activeDeadlineStatuses), lte(orders.dueAt, now)));
      for (const order of overdue) {
        if (!order.dueAt) continue;
        const [created] = await tx
          .insert(orderEscalations)
          .values({ orderId: order.id, type: 'DEADLINE_OVERDUE' })
          .onConflictDoNothing()
          .returning({ id: orderEscalations.id });
        const [active] = created
          ? [created]
          : await tx
              .select({ id: orderEscalations.id })
              .from(orderEscalations)
              .where(
                and(
                  eq(orderEscalations.orderId, order.id),
                  eq(orderEscalations.type, 'DEADLINE_OVERDUE'),
                  inArray(orderEscalations.status, ['OPEN', 'ACKNOWLEDGED']),
                ),
              )
              .limit(1);
        if (!active) continue;
        if (created) {
          await tx.insert(auditLogs).values({
            action: 'order.deadline_escalated_automatically',
            after: { dueAt: order.dueAt.toISOString(), escalationId: active.id },
            entityId: order.id,
            entityType: 'order',
          });
        }
        deadlineAlerts += await enqueueNotificationIntent(
          tx,
          {
            deduplicationKey: `escalation:${active.id}:deadline-overdue`,
            payload: {
              dueAt: order.dueAt.toISOString(),
              reference: order.orderNumber,
              status: order.status,
              templateKey: 'operator.deadline_overdue',
            },
            serviceAreaId: order.serviceAreaId,
          },
          await staffRecipientsForArea(tx, order.serviceAreaId),
        );
      }

      const complaintHorizon = new Date(now.getTime() + 4 * 60 * 60 * 1_000);
      const complaints = await tx
        .select({
          code: qualityComplaints.code,
          id: qualityComplaints.id,
          orderNumber: orders.orderNumber,
          reviewDueAt: qualityComplaints.reviewDueAt,
          serviceAreaId: orders.serviceAreaId,
          status: qualityComplaints.status,
        })
        .from(qualityComplaints)
        .innerJoin(orders, eq(orders.id, qualityComplaints.orderId))
        .where(
          and(
            inArray(qualityComplaints.status, ['OPEN', 'REOPENED']),
            lte(qualityComplaints.reviewDueAt, complaintHorizon),
          ),
        );
      for (const complaint of complaints) {
        const overdueReview = complaint.reviewDueAt <= now;
        complaintAlerts += await enqueueNotificationIntent(
          tx,
          {
            deduplicationKey: `complaint:${complaint.id}:${overdueReview ? 'review-overdue' : 'review-reminder'}`,
            payload: {
              dueAt: complaint.reviewDueAt.toISOString(),
              reference: complaint.code,
              status: complaint.status,
              templateKey: overdueReview
                ? 'operator.complaint_review_overdue'
                : 'operator.complaint_review_reminder',
            },
            serviceAreaId: complaint.serviceAreaId,
          },
          await staffRecipientsForArea(tx, complaint.serviceAreaId),
        );
      }
      return { complaintAlerts, deadlineAlerts, reminders, skipped: false };
    });
  }
}
