import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type {
  ComplaintRecord,
  InspectionRecord,
  QualityOrderRecord,
  QualityPolicyRecord,
  QualityRepository,
  WarrantyRecord,
} from '../../application/quality/quality-repository.js';
import type { Principal } from '../../domain/identity/permissions.js';
import type { ValidatedInspection } from '../../domain/quality/quality-policy.js';
import {
  ActorConstraintError,
  ConcurrencyConflictError,
  DomainRuleError,
} from '../../domain/shared/domain-errors.js';
import type { MckDatabase } from '../database/client.js';
import {
  auditLogs,
  orderRequestLinks,
  orders,
  orderWarranties,
  qualityChecklistItems,
  qualityChecklistTemplates,
  qualityComplaints,
  qualityFeedback,
  qualityInspections,
  serviceRequests,
} from '../database/schema.js';

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && error.code === '23505') return true;
  return 'cause' in error && isUniqueViolation(error.cause);
}

export class PostgresQualityRepository implements QualityRepository {
  constructor(private readonly database: MckDatabase) {}

  private async requesterIds(orderId: string): Promise<readonly string[]> {
    const rows = await this.database
      .select({ requesterUserId: serviceRequests.requesterUserId })
      .from(orderRequestLinks)
      .innerJoin(serviceRequests, eq(serviceRequests.id, orderRequestLinks.requestId))
      .where(eq(orderRequestLinks.orderId, orderId));
    return [...new Set(rows.map(({ requesterUserId }) => requesterUserId))];
  }

  async findOrderByNumber(orderNumber: string): Promise<QualityOrderRecord | undefined> {
    const [row] = await this.database
      .select({
        assignedExecutorUserId: orders.currentExecutorUserId,
        categoryId: orders.categoryId,
        id: orders.id,
        orderNumber: orders.orderNumber,
        serviceAreaId: orders.serviceAreaId,
        status: orders.status,
        version: orders.version,
      })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    return row ? { ...row, requesterUserIds: await this.requesterIds(row.id) } : undefined;
  }

  async loadPolicy(order: QualityOrderRecord): Promise<QualityPolicyRecord | undefined> {
    const [template] = await this.database
      .select()
      .from(qualityChecklistTemplates)
      .where(
        and(
          eq(qualityChecklistTemplates.categoryId, order.categoryId),
          eq(qualityChecklistTemplates.isActive, true),
        ),
      )
      .limit(1);
    if (!template) return undefined;
    const items = await this.database
      .select({
        code: qualityChecklistItems.code,
        isRequired: qualityChecklistItems.isRequired,
        labelUzCyrl: qualityChecklistItems.labelUzCyrl,
        labelUzLatn: qualityChecklistItems.labelUzLatn,
      })
      .from(qualityChecklistItems)
      .where(eq(qualityChecklistItems.templateId, template.id))
      .orderBy(qualityChecklistItems.sortOrder, qualityChecklistItems.code);
    const [inspection] = await this.database
      .select({ id: qualityInspections.id })
      .from(qualityInspections)
      .where(
        and(
          eq(qualityInspections.orderId, order.id),
          eq(qualityInspections.orderVersion, order.version),
          eq(qualityInspections.templateId, template.id),
          eq(qualityInspections.outcome, 'PASS'),
        ),
      )
      .orderBy(desc(qualityInspections.attempt))
      .limit(1);
    return {
      acceptanceMode: template.acceptanceMode,
      complaintReviewHours: template.complaintReviewHours,
      inspectionRequired: template.inspectionRequired,
      items,
      latestPassingInspectionId: inspection?.id ?? null,
      reworkTargetHours: template.reworkTargetHours,
      templateId: template.id,
      templateVersion: template.version,
      warrantyDays: template.warrantyDays,
    };
  }

  async recordInspection(
    order: QualityOrderRecord,
    policy: QualityPolicyRecord,
    inspection: ValidatedInspection,
    actor: Principal,
  ): Promise<InspectionRecord> {
    return this.database.transaction(async (tx) => {
      const [current] = await tx
        .select({ status: orders.status, version: orders.version })
        .from(orders)
        .where(eq(orders.id, order.id))
        .for('update');
      if (
        !current ||
        current.version !== order.version ||
        current.status !== 'AWAITING_ACCEPTANCE'
      ) {
        throw new ConcurrencyConflictError('Order', order.id);
      }
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(qualityInspections)
        .where(eq(qualityInspections.orderId, order.id));
      const attempt = (countRow?.count ?? 0) + 1;
      const [created] = await tx
        .insert(qualityInspections)
        .values({
          actorUserId: actor.userId,
          attempt,
          orderId: order.id,
          orderVersion: order.version,
          outcome: inspection.outcome,
          results: inspection.results,
          summary: inspection.summary,
          templateId: policy.templateId,
          templateVersion: policy.templateVersion,
        })
        .returning({
          attempt: qualityInspections.attempt,
          id: qualityInspections.id,
          outcome: qualityInspections.outcome,
        });
      if (!created) throw new Error('Quality inspection was not created');
      await tx.insert(auditLogs).values({
        action: 'quality.inspection_recorded',
        actorUserId: actor.userId,
        after: {
          attempt,
          outcome: inspection.outcome,
          templateVersion: policy.templateVersion,
        },
        entityId: order.id,
        entityType: 'order',
      });
      return created;
    });
  }

  async saveFeedback(
    order: QualityOrderRecord,
    rating: number,
    comment: string | null,
    requester: Principal,
  ): Promise<void> {
    try {
      await this.database.transaction(async (tx) => {
        const [current] = await tx
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, order.id))
          .for('update');
        if (!current || current.status !== 'COMPLETED') {
          throw new ConcurrencyConflictError('Order', order.id);
        }
        const [owned] = await tx
          .select({ requestId: serviceRequests.id })
          .from(orderRequestLinks)
          .innerJoin(serviceRequests, eq(serviceRequests.id, orderRequestLinks.requestId))
          .where(
            and(
              eq(orderRequestLinks.orderId, order.id),
              eq(serviceRequests.requesterUserId, requester.userId),
            ),
          )
          .limit(1);
        if (!owned) throw new ActorConstraintError('Resident does not own this order');
        const [created] = await tx
          .insert(qualityFeedback)
          .values({ comment, orderId: order.id, rating, requesterUserId: requester.userId })
          .returning({ id: qualityFeedback.id });
        if (!created) throw new Error('Feedback was not created');
        await tx.insert(auditLogs).values({
          action: 'quality.feedback_submitted',
          actorUserId: requester.userId,
          after: { rating },
          entityId: created.id,
          entityType: 'quality_feedback',
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainRuleError(
          'FEEDBACK_ALREADY_SUBMITTED',
          'Feedback was already submitted for this order',
        );
      }
      throw error;
    }
  }

  async createComplaint(
    order: QualityOrderRecord,
    reason: string,
    reviewDueAt: Date,
    requester: Principal,
    withinWarranty: boolean,
  ): Promise<ComplaintRecord> {
    try {
      return await this.database.transaction(async (tx) => {
        const [current] = await tx
          .select({ status: orders.status })
          .from(orders)
          .where(eq(orders.id, order.id))
          .for('update');
        if (!current || current.status !== 'COMPLETED') {
          throw new ConcurrencyConflictError('Order', order.id);
        }
        const [owned] = await tx
          .select({ requestId: serviceRequests.id })
          .from(orderRequestLinks)
          .innerJoin(serviceRequests, eq(serviceRequests.id, orderRequestLinks.requestId))
          .where(
            and(
              eq(orderRequestLinks.orderId, order.id),
              eq(serviceRequests.requesterUserId, requester.userId),
            ),
          )
          .limit(1);
        if (!owned) throw new ActorConstraintError('Resident does not own this order');
        const [sequence] = await tx.execute<{ value: number }>(
          sql`select nextval('quality_complaint_seq')::int as value`,
        );
        if (!sequence) throw new Error('Complaint identifier could not be generated');
        const code = `CMP-${new Date().getUTCFullYear()}-${String(sequence.value).padStart(8, '0')}`;
        const [created] = await tx
          .insert(qualityComplaints)
          .values({
            code,
            orderId: order.id,
            reason,
            requesterUserId: requester.userId,
            reviewDueAt,
            withinWarranty,
          })
          .returning();
        if (!created) throw new Error('Complaint was not created');
        await tx.insert(auditLogs).values({
          action: 'quality.complaint_submitted',
          actorUserId: requester.userId,
          after: { code, reviewDueAt: reviewDueAt.toISOString(), withinWarranty },
          entityId: created.id,
          entityType: 'quality_complaint',
        });
        return { ...created, order };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DomainRuleError(
          'COMPLAINT_ALREADY_OPEN',
          'An open complaint already exists for this order',
        );
      }
      throw error;
    }
  }

  async findComplaintByCode(code: string): Promise<ComplaintRecord | undefined> {
    const [row] = await this.database
      .select({
        code: qualityComplaints.code,
        id: qualityComplaints.id,
        orderNumber: orders.orderNumber,
        reason: qualityComplaints.reason,
        reviewDueAt: qualityComplaints.reviewDueAt,
        status: qualityComplaints.status,
        withinWarranty: qualityComplaints.withinWarranty,
      })
      .from(qualityComplaints)
      .innerJoin(orders, eq(orders.id, qualityComplaints.orderId))
      .where(eq(qualityComplaints.code, code))
      .limit(1);
    if (!row) return undefined;
    const order = await this.findOrderByNumber(row.orderNumber);
    return order ? { ...row, order } : undefined;
  }

  async decideComplaint(
    complaint: ComplaintRecord,
    outcome: 'RESOLVED' | 'REJECTED',
    reason: string,
    actor: Principal,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const [updated] = await tx
        .update(qualityComplaints)
        .set({ status: outcome })
        .where(
          and(
            eq(qualityComplaints.id, complaint.id),
            eq(qualityComplaints.status, complaint.status),
          ),
        )
        .returning({ id: qualityComplaints.id });
      if (!updated) throw new ConcurrencyConflictError('Complaint', complaint.id);
      await tx.insert(auditLogs).values({
        action:
          outcome === 'RESOLVED' ? 'quality.complaint_resolved' : 'quality.complaint_rejected',
        actorUserId: actor.userId,
        after: { status: outcome },
        before: { status: complaint.status },
        entityId: complaint.id,
        entityType: 'quality_complaint',
        reason,
      });
    });
  }

  async listOpenComplaints(
    serviceAreaIds: readonly (string | null)[],
  ): Promise<readonly ComplaintRecord[]> {
    const scopedIds = serviceAreaIds.filter((id): id is string => id !== null);
    const where = serviceAreaIds.includes(null)
      ? eq(qualityComplaints.status, 'OPEN')
      : and(eq(qualityComplaints.status, 'OPEN'), inArray(orders.serviceAreaId, scopedIds));
    const rows = await this.database
      .select({ code: qualityComplaints.code })
      .from(qualityComplaints)
      .innerJoin(orders, eq(orders.id, qualityComplaints.orderId))
      .where(where)
      .orderBy(qualityComplaints.reviewDueAt);
    const complaints = await Promise.all(rows.map(({ code }) => this.findComplaintByCode(code)));
    return complaints.filter((record): record is ComplaintRecord => Boolean(record));
  }

  async findWarranty(orderId: string): Promise<WarrantyRecord | undefined> {
    const [row] = await this.database
      .select({
        endsAt: orderWarranties.endsAt,
        startsAt: orderWarranties.startsAt,
        warrantyDays: orderWarranties.warrantyDays,
      })
      .from(orderWarranties)
      .where(eq(orderWarranties.orderId, orderId))
      .limit(1);
    return row;
  }
}
