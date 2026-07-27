import { and, desc, eq, gte, inArray, lt, sql, type SQLWrapper } from 'drizzle-orm';

import type { ReportingRepository } from '../../application/reporting/reporting-repository.js';
import type {
  OperationalReport,
  RepeatCategoryMetric,
} from '../../domain/reporting/operational-report.js';
import { percentage, rounded } from '../../domain/reporting/reporting-period.js';
import type { ReportingPeriod } from '../../domain/reporting/reporting-period.js';
import type { MckDatabase } from '../database/client.js';
import {
  addresses,
  auditLogs,
  orderAcceptances,
  orderEscalations,
  orderExecutionSlaClocks,
  orderRequestLinks,
  orders,
  orderStatusHistory,
  pdcaActions,
  qualityComplaints,
  qualityFeedback,
  qualityInspections,
  qualityReworkDecisions,
  requestDuplicateMatches,
  serviceAreas,
  serviceCategories,
  serviceRequests,
} from '../database/schema.js';

const activeOrderStatuses = [
  'REGISTERED',
  'ASSIGNED',
  'IN_PROGRESS',
  'BLOCKED',
  'AWAITING_ACCEPTANCE',
  'REWORK_REQUIRED',
] as const;
function areaCondition(
  column: SQLWrapper,
  serviceAreaIds: readonly (string | null)[],
): ReturnType<typeof sql> | undefined {
  if (serviceAreaIds.includes(null)) return undefined;
  const ids = [...new Set(serviceAreaIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return sql`false`;
  return sql`${column} in (${sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  )})`;
}

function metricMap(
  rows: readonly { readonly categoryCode: string; readonly value: number }[],
): ReadonlyMap<string, number> {
  return new Map(rows.map(({ categoryCode, value }) => [categoryCode, value]));
}

export class PostgresReportingRepository implements ReportingRepository {
  constructor(private readonly database: MckDatabase) {}

  async generate(
    period: ReportingPeriod,
    serviceAreaIds: readonly (string | null)[],
  ): Promise<OperationalReport> {
    const start = period.startInclusive.toISOString();
    const end = period.endExclusive.toISOString();
    const orderScope = areaCondition(orders.serviceAreaId, serviceAreaIds);
    const requestScope = areaCondition(addresses.serviceAreaId, serviceAreaIds);
    const pdcaScope = areaCondition(pdcaActions.serviceAreaId, serviceAreaIds);

    const [
      [portfolio],
      [requestMetrics],
      [cancelMetrics],
      [escalationMetrics],
      [qualityInspectionMetrics],
      [acceptanceMetrics],
      [reworkMetrics],
      [feedbackMetrics],
      [complaintMetrics],
      [complaintClosedMetrics],
      [duplicateMetrics],
      consolidatedRows,
      categoryRequestRows,
      categoryComplaintRows,
      categoryReworkRows,
      categoryDuplicateRows,
      [pdcaMetrics],
      [areaMetrics],
    ] = await Promise.all([
      this.database
        .select({
          activeBacklog: sql<number>`count(*) filter (where ${orders.createdAt} < ${end}::timestamptz and ${orders.status} in ('REGISTERED','ASSIGNED','IN_PROGRESS','BLOCKED','AWAITING_ACCEPTANCE','REWORK_REQUIRED'))::int`,
          averageCompletionHours: sql<
            number | null
          >`avg(extract(epoch from (${orders.completedAt} - ${orders.createdAt})) / 3600.0) filter (where ${orders.completedAt} >= ${start}::timestamptz and ${orders.completedAt} < ${end}::timestamptz)::float8`,
          completed: sql<number>`count(*) filter (where ${orders.completedAt} >= ${start}::timestamptz and ${orders.completedAt} < ${end}::timestamptz)::int`,
          completedLate: sql<number>`count(*) filter (where ${orders.completedAt} >= ${start}::timestamptz and ${orders.completedAt} < ${end}::timestamptz and ${orders.dueAt} is not null and ${orders.completedAt} > ${orders.dueAt})::int`,
          completedOnTime: sql<number>`count(*) filter (where ${orders.completedAt} >= ${start}::timestamptz and ${orders.completedAt} < ${end}::timestamptz and ${orders.dueAt} is not null and ${orders.completedAt} <= ${orders.dueAt})::int`,
          ordersCreated: sql<number>`count(*) filter (where ${orders.createdAt} >= ${start}::timestamptz and ${orders.createdAt} < ${end}::timestamptz)::int`,
          overdueActive: sql<number>`count(*) filter (where ${orders.createdAt} < ${end}::timestamptz and ${orders.status} in ('ASSIGNED','IN_PROGRESS','BLOCKED','REWORK_REQUIRED') and ${orders.dueAt} < ${end}::timestamptz)::int`,
          urgentOrdersCreated: sql<number>`count(*) filter (where ${orders.createdAt} >= ${start}::timestamptz and ${orders.createdAt} < ${end}::timestamptz and ${orders.priorityBand} = 'URGENT')::int`,
        })
        .from(orders)
        .where(orderScope),
      this.database
        .select({ value: sql<number>`count(*)::int` })
        .from(serviceRequests)
        .innerJoin(addresses, eq(addresses.id, serviceRequests.addressId))
        .where(
          and(
            gte(serviceRequests.submittedAt, period.startInclusive),
            lt(serviceRequests.submittedAt, period.endExclusive),
            requestScope,
          ),
        ),
      this.database
        .select({ value: sql<number>`count(distinct ${orderStatusHistory.orderId})::int` })
        .from(orderStatusHistory)
        .innerJoin(orders, eq(orders.id, orderStatusHistory.orderId))
        .where(
          and(
            eq(orderStatusHistory.toStatus, 'CANCELLED'),
            gte(orderStatusHistory.occurredAt, period.startInclusive),
            lt(orderStatusHistory.occurredAt, period.endExclusive),
            orderScope,
          ),
        ),
      this.database
        .select({ value: sql<number>`count(*)::int` })
        .from(orderEscalations)
        .innerJoin(orders, eq(orders.id, orderEscalations.orderId))
        .where(
          and(
            gte(orderEscalations.createdAt, period.startInclusive),
            lt(orderEscalations.createdAt, period.endExclusive),
            orderScope,
          ),
        ),
      this.database
        .select({
          passed: sql<number>`count(*) filter (where ${qualityInspections.outcome} = 'PASS')::int`,
          total: sql<number>`count(*)::int`,
        })
        .from(qualityInspections)
        .innerJoin(orders, eq(orders.id, qualityInspections.orderId))
        .where(
          and(
            gte(qualityInspections.createdAt, period.startInclusive),
            lt(qualityInspections.createdAt, period.endExclusive),
            orderScope,
          ),
        ),
      this.database
        .select({ value: sql<number>`count(*)::int` })
        .from(orderAcceptances)
        .innerJoin(orders, eq(orders.id, orderAcceptances.orderId))
        .where(
          and(
            gte(orderAcceptances.acceptedAt, period.startInclusive),
            lt(orderAcceptances.acceptedAt, period.endExclusive),
            orderScope,
          ),
        ),
      this.database
        .select({ value: sql<number>`count(*)::int` })
        .from(qualityReworkDecisions)
        .innerJoin(orders, eq(orders.id, qualityReworkDecisions.orderId))
        .where(
          and(
            gte(qualityReworkDecisions.createdAt, period.startInclusive),
            lt(qualityReworkDecisions.createdAt, period.endExclusive),
            orderScope,
          ),
        ),
      this.database
        .select({
          average: sql<number | null>`avg(${qualityFeedback.rating})::float8`,
          total: sql<number>`count(*)::int`,
        })
        .from(qualityFeedback)
        .innerJoin(orders, eq(orders.id, qualityFeedback.orderId))
        .where(
          and(
            gte(qualityFeedback.createdAt, period.startInclusive),
            lt(qualityFeedback.createdAt, period.endExclusive),
            orderScope,
          ),
        ),
      this.database
        .select({
          created: sql<number>`count(*) filter (where ${qualityComplaints.createdAt} >= ${start}::timestamptz and ${qualityComplaints.createdAt} < ${end}::timestamptz)::int`,
          openBacklog: sql<number>`count(*) filter (where ${qualityComplaints.createdAt} < ${end}::timestamptz and ${qualityComplaints.status} in ('OPEN','REOPENED'))::int`,
          overdueOpen: sql<number>`count(*) filter (where ${qualityComplaints.createdAt} < ${end}::timestamptz and ${qualityComplaints.status} in ('OPEN','REOPENED') and ${qualityComplaints.reviewDueAt} < ${end}::timestamptz)::int`,
          reopened: sql<number>`count(*) filter (where ${qualityComplaints.reopenedAt} >= ${start}::timestamptz and ${qualityComplaints.reopenedAt} < ${end}::timestamptz)::int`,
          withinWarranty: sql<number>`count(*) filter (where ${qualityComplaints.createdAt} >= ${start}::timestamptz and ${qualityComplaints.createdAt} < ${end}::timestamptz and ${qualityComplaints.withinWarranty} = true)::int`,
        })
        .from(qualityComplaints)
        .innerJoin(orders, eq(orders.id, qualityComplaints.orderId))
        .where(orderScope),
      this.database
        .select({ value: sql<number>`count(*)::int` })
        .from(auditLogs)
        .innerJoin(qualityComplaints, eq(qualityComplaints.id, auditLogs.entityId))
        .innerJoin(orders, eq(orders.id, qualityComplaints.orderId))
        .where(
          and(
            inArray(auditLogs.action, ['quality.complaint_resolved', 'quality.complaint_rejected']),
            gte(auditLogs.occurredAt, period.startInclusive),
            lt(auditLogs.occurredAt, period.endExclusive),
            orderScope,
          ),
        ),
      this.database
        .select({ value: sql<number>`count(*)::int` })
        .from(requestDuplicateMatches)
        .innerJoin(serviceRequests, eq(serviceRequests.id, requestDuplicateMatches.requestId))
        .innerJoin(addresses, eq(addresses.id, serviceRequests.addressId))
        .where(
          and(
            eq(requestDuplicateMatches.status, 'CONFIRMED'),
            gte(requestDuplicateMatches.decidedAt, period.startInclusive),
            lt(requestDuplicateMatches.decidedAt, period.endExclusive),
            requestScope,
          ),
        ),
      this.database
        .select({
          linkedRequests: sql<number>`count(*)::int`,
          orderId: orderRequestLinks.orderId,
        })
        .from(orderRequestLinks)
        .innerJoin(orders, eq(orders.id, orderRequestLinks.orderId))
        .where(and(lt(orderRequestLinks.linkedAt, period.endExclusive), orderScope))
        .groupBy(orderRequestLinks.orderId)
        .having(sql`count(*) > 1`),
      this.database
        .select({
          categoryCode: serviceCategories.code,
          value: sql<number>`count(*)::int`,
        })
        .from(serviceRequests)
        .innerJoin(addresses, eq(addresses.id, serviceRequests.addressId))
        .innerJoin(serviceCategories, eq(serviceCategories.id, serviceRequests.categoryId))
        .where(
          and(
            gte(serviceRequests.submittedAt, period.startInclusive),
            lt(serviceRequests.submittedAt, period.endExclusive),
            requestScope,
          ),
        )
        .groupBy(serviceCategories.code)
        .orderBy(desc(sql`count(*)`), serviceCategories.code)
        .limit(5),
      this.database
        .select({
          categoryCode: serviceCategories.code,
          value: sql<number>`count(*)::int`,
        })
        .from(qualityComplaints)
        .innerJoin(orders, eq(orders.id, qualityComplaints.orderId))
        .innerJoin(serviceCategories, eq(serviceCategories.id, orders.categoryId))
        .where(
          and(
            gte(qualityComplaints.createdAt, period.startInclusive),
            lt(qualityComplaints.createdAt, period.endExclusive),
            orderScope,
          ),
        )
        .groupBy(serviceCategories.code),
      this.database
        .select({
          categoryCode: serviceCategories.code,
          value: sql<number>`count(*)::int`,
        })
        .from(qualityReworkDecisions)
        .innerJoin(orders, eq(orders.id, qualityReworkDecisions.orderId))
        .innerJoin(serviceCategories, eq(serviceCategories.id, orders.categoryId))
        .where(
          and(
            gte(qualityReworkDecisions.createdAt, period.startInclusive),
            lt(qualityReworkDecisions.createdAt, period.endExclusive),
            orderScope,
          ),
        )
        .groupBy(serviceCategories.code),
      this.database
        .select({
          categoryCode: serviceCategories.code,
          value: sql<number>`count(*)::int`,
        })
        .from(requestDuplicateMatches)
        .innerJoin(serviceRequests, eq(serviceRequests.id, requestDuplicateMatches.requestId))
        .innerJoin(addresses, eq(addresses.id, serviceRequests.addressId))
        .innerJoin(serviceCategories, eq(serviceCategories.id, serviceRequests.categoryId))
        .where(
          and(
            eq(requestDuplicateMatches.status, 'CONFIRMED'),
            gte(requestDuplicateMatches.decidedAt, period.startInclusive),
            lt(requestDuplicateMatches.decidedAt, period.endExclusive),
            requestScope,
          ),
        )
        .groupBy(serviceCategories.code),
      this.database
        .select({
          active: sql<number>`count(*) filter (where ${pdcaActions.createdAt} < ${end}::timestamptz and ${pdcaActions.stage} in ('PLAN','DO','CHECK','ACT'))::int`,
          completed: sql<number>`count(*) filter (where ${pdcaActions.completedAt} >= ${start}::timestamptz and ${pdcaActions.completedAt} < ${end}::timestamptz)::int`,
          created: sql<number>`count(*) filter (where ${pdcaActions.createdAt} >= ${start}::timestamptz and ${pdcaActions.createdAt} < ${end}::timestamptz)::int`,
          overdue: sql<number>`count(*) filter (where ${pdcaActions.createdAt} < ${end}::timestamptz and ${pdcaActions.stage} in ('PLAN','DO','CHECK','ACT') and ${pdcaActions.dueAt} < ${end}::timestamptz)::int`,
        })
        .from(pdcaActions)
        .where(pdcaScope),
      this.database
        .select({ value: sql<number>`count(*)::int` })
        .from(serviceAreas)
        .where(
          and(
            eq(serviceAreas.isActive, true),
            serviceAreaIds.includes(null)
              ? undefined
              : inArray(
                  serviceAreas.id,
                  serviceAreaIds.filter((id): id is string => id !== null),
                ),
          ),
        ),
    ]);

    const complaintByCategory = metricMap(categoryComplaintRows);
    const reworkByCategory = metricMap(categoryReworkRows);
    const duplicateByCategory = metricMap(categoryDuplicateRows);
    const topCategories: readonly RepeatCategoryMetric[] = categoryRequestRows.map(
      ({ categoryCode, value }) => ({
        categoryCode,
        complaintCount: complaintByCategory.get(categoryCode) ?? 0,
        confirmedDuplicateCount: duplicateByCategory.get(categoryCode) ?? 0,
        requestCount: value,
        reworkCount: reworkByCategory.get(categoryCode) ?? 0,
      }),
    );
    const completedWithDeadline =
      (portfolio?.completedOnTime ?? 0) + (portfolio?.completedLate ?? 0);
    return {
      complaints: {
        closedInPeriod: complaintClosedMetrics?.value ?? 0,
        created: complaintMetrics?.created ?? 0,
        openBacklog: complaintMetrics?.openBacklog ?? 0,
        overdueOpen: complaintMetrics?.overdueOpen ?? 0,
        reopened: complaintMetrics?.reopened ?? 0,
        withinWarranty: complaintMetrics?.withinWarranty ?? 0,
      },
      generatedAt: new Date(period.asOf),
      pdca: {
        active: pdcaMetrics?.active ?? 0,
        completedInPeriod: pdcaMetrics?.completed ?? 0,
        createdInPeriod: pdcaMetrics?.created ?? 0,
        overdue: pdcaMetrics?.overdue ?? 0,
      },
      period,
      portfolio: {
        activeBacklog: portfolio?.activeBacklog ?? 0,
        cancelled: cancelMetrics?.value ?? 0,
        completed: portfolio?.completed ?? 0,
        completionToIntakePercent: percentage(
          portfolio?.completed ?? 0,
          requestMetrics?.value ?? 0,
        ),
        ordersCreated: portfolio?.ordersCreated ?? 0,
        overdueActive: portfolio?.overdueActive ?? 0,
        requestsReceived: requestMetrics?.value ?? 0,
        urgentOrdersCreated: portfolio?.urgentOrdersCreated ?? 0,
      },
      quality: {
        acceptanceCount: acceptanceMetrics?.value ?? 0,
        averageRating: rounded(feedbackMetrics?.average ?? null, 2),
        feedbackCount: feedbackMetrics?.total ?? 0,
        inspectionCount: qualityInspectionMetrics?.total ?? 0,
        inspectionPassPercent: percentage(
          qualityInspectionMetrics?.passed ?? 0,
          qualityInspectionMetrics?.total ?? 0,
        ),
        reworkCount: reworkMetrics?.value ?? 0,
      },
      repeatProblems: {
        confirmedDuplicatePairs: duplicateMetrics?.value ?? 0,
        consolidatedOrders: consolidatedRows.length,
        consolidatedRequests: consolidatedRows.reduce(
          (sum, { linkedRequests }) => sum + linkedRequests,
          0,
        ),
        topCategories,
      },
      serviceAreaCount: areaMetrics?.value ?? 0,
      sla: {
        activePaused: await this.activePaused(serviceAreaIds, period),
        averageCompletionHours: rounded(portfolio?.averageCompletionHours ?? null),
        completedLate: portfolio?.completedLate ?? 0,
        completedOnTime: portfolio?.completedOnTime ?? 0,
        escalationCount: escalationMetrics?.value ?? 0,
        onTimePercent: percentage(portfolio?.completedOnTime ?? 0, completedWithDeadline),
      },
    };
  }

  private async activePaused(
    serviceAreaIds: readonly (string | null)[],
    period: ReportingPeriod,
  ): Promise<number> {
    const [row] = await this.database
      .select({ value: sql<number>`count(*)::int` })
      .from(orderExecutionSlaClocks)
      .innerJoin(orders, eq(orders.id, orderExecutionSlaClocks.orderId))
      .where(
        and(
          lt(orders.createdAt, period.endExclusive),
          inArray(orders.status, activeOrderStatuses),
          sql`${orderExecutionSlaClocks.pausedAt} is not null`,
          areaCondition(orders.serviceAreaId, serviceAreaIds),
        ),
      );
    return row?.value ?? 0;
  }
}
