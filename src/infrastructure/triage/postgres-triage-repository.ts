import { and, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm';

import type {
  DuplicateSuggestionRecord,
  OrderRegistrationResult,
  PriorityAssessmentRecord,
  PriorityModelRecord,
  SavePriorityAssessment,
  TriageRepository,
  TriageRequestRecord,
} from '../../application/triage/triage-repository.js';
import {
  priorityCriterionCodes,
  type PriorityBand,
  type PriorityCriterionCode,
} from '../../domain/priority/priority-calculator.js';
import {
  ConcurrencyConflictError,
  DomainRuleError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';
import type { MckDatabase } from '../database/client.js';
import {
  addresses,
  auditLogs,
  orderRequestLinks,
  orders,
  priorityAssessments,
  priorityCriteria,
  priorityModels,
  requestDuplicateMatches,
  requestSources,
  requestStatusHistory,
  serviceRequests,
} from '../database/schema.js';

function numberOrNull(value: string | null): number | null {
  return value === null ? null : Number(value);
}

function mapRequest(row: {
  addressLine: string;
  categoryId: string;
  description: string;
  id: string;
  latitude: string | null;
  longitude: string | null;
  requesterUserId: string;
  serviceAreaId: string;
  sourceConfidence: number;
  status: TriageRequestRecord['status'];
  ticketNumber: string;
  version: number;
}): TriageRequestRecord {
  return {
    ...row,
    latitude: numberOrNull(row.latitude),
    longitude: numberOrNull(row.longitude),
  };
}

const requestProjection = {
  addressLine: addresses.line1,
  categoryId: serviceRequests.categoryId,
  description: serviceRequests.description,
  id: serviceRequests.id,
  latitude: addresses.latitude,
  longitude: addresses.longitude,
  requesterUserId: serviceRequests.requesterUserId,
  serviceAreaId: addresses.serviceAreaId,
  sourceConfidence: requestSources.confidenceScore,
  status: serviceRequests.status,
  ticketNumber: serviceRequests.ticketNumber,
  version: serviceRequests.version,
};

function mapAssessment(row: {
  calculatedBand: PriorityBand;
  calculatedScore: string;
  explanation: string;
  id: string;
  modelCode: string;
  modelVersion: number;
  overrideBand: PriorityBand | null;
  overrideReason: string | null;
  overrideScore: string | null;
  requestId: string;
}): PriorityAssessmentRecord {
  const calculatedScore = Number(row.calculatedScore);
  return {
    calculatedBand: row.calculatedBand,
    calculatedScore,
    effectiveBand: row.overrideBand ?? row.calculatedBand,
    effectiveScore: row.overrideScore === null ? calculatedScore : Number(row.overrideScore),
    explanation: row.explanation,
    id: row.id,
    modelCode: row.modelCode,
    modelVersion: row.modelVersion,
    overrideReason: row.overrideReason,
    requestId: row.requestId,
  };
}

const assessmentProjection = {
  calculatedBand: priorityAssessments.calculatedBand,
  calculatedScore: priorityAssessments.calculatedScore,
  explanation: priorityAssessments.explanation,
  id: priorityAssessments.id,
  modelCode: priorityModels.code,
  modelVersion: priorityModels.version,
  overrideBand: priorityAssessments.overrideBand,
  overrideReason: priorityAssessments.overrideReason,
  overrideScore: priorityAssessments.overrideScore,
  requestId: priorityAssessments.requestId,
};

export class PostgresTriageRepository implements TriageRepository {
  constructor(private readonly database: MckDatabase) {}

  async findRequest(ticketNumber: string): Promise<TriageRequestRecord | undefined> {
    const [row] = await this.database
      .select(requestProjection)
      .from(serviceRequests)
      .innerJoin(addresses, eq(addresses.id, serviceRequests.addressId))
      .innerJoin(requestSources, eq(requestSources.id, serviceRequests.sourceId))
      .where(eq(serviceRequests.ticketNumber, ticketNumber))
      .limit(1);
    return row ? mapRequest(row) : undefined;
  }

  async loadActivePriorityModel(): Promise<PriorityModelRecord | undefined> {
    const [model] = await this.database
      .select()
      .from(priorityModels)
      .where(eq(priorityModels.isActive, true))
      .orderBy(desc(priorityModels.version))
      .limit(1);
    if (!model) return undefined;
    const rows = await this.database
      .select({
        code: priorityCriteria.code,
        maximumValue: priorityCriteria.maximumValue,
        weight: priorityCriteria.weight,
      })
      .from(priorityCriteria)
      .where(eq(priorityCriteria.modelId, model.id))
      .orderBy(priorityCriteria.sortOrder);
    const criteria = rows.map((criterion) => {
      if (!priorityCriterionCodes.includes(criterion.code as PriorityCriterionCode)) {
        throw new DomainRuleError('PRIORITY_MODEL_INVALID', `Unknown criterion: ${criterion.code}`);
      }
      return { ...criterion, code: criterion.code as PriorityCriterionCode };
    });
    return { code: model.code, criteria, id: model.id, version: model.version };
  }

  async savePriorityAssessment(command: SavePriorityAssessment): Promise<PriorityAssessmentRecord> {
    return this.database.transaction(async (tx) => {
      const now = new Date();
      const [saved] = await tx
        .insert(priorityAssessments)
        .values({
          assessedAt: now,
          assessedByUserId: command.actor.userId,
          calculatedBand: command.result.band,
          calculatedScore: String(command.result.score),
          explanation: command.result.explanation,
          factors: { inputs: command.inputs, results: command.result.factors },
          modelId: command.model.id,
          requestId: command.request.id,
        })
        .onConflictDoUpdate({
          set: {
            assessedAt: now,
            assessedByUserId: command.actor.userId,
            calculatedBand: command.result.band,
            calculatedScore: String(command.result.score),
            explanation: command.result.explanation,
            factors: { inputs: command.inputs, results: command.result.factors },
            modelId: command.model.id,
            overrideBand: null,
            overrideReason: null,
            overrideScore: null,
            overriddenAt: null,
            overriddenByUserId: null,
          },
          target: priorityAssessments.requestId,
        })
        .returning();
      if (!saved) throw new Error('Priority assessment insert returned no row');
      await tx.insert(auditLogs).values({
        action: 'request.priority_assessed',
        actorUserId: command.actor.userId,
        after: {
          band: command.result.band,
          inputs: command.inputs,
          model: `${command.model.code}@${command.model.version}`,
          score: command.result.score,
        },
        entityId: command.request.id,
        entityType: 'service_request',
      });
      return mapAssessment({
        ...saved,
        modelCode: command.model.code,
        modelVersion: command.model.version,
      });
    });
  }

  async findPriorityAssessment(requestId: string): Promise<PriorityAssessmentRecord | undefined> {
    const [row] = await this.database
      .select(assessmentProjection)
      .from(priorityAssessments)
      .innerJoin(priorityModels, eq(priorityModels.id, priorityAssessments.modelId))
      .where(eq(priorityAssessments.requestId, requestId))
      .limit(1);
    return row ? mapAssessment(row) : undefined;
  }

  async overridePriority(
    assessment: PriorityAssessmentRecord,
    score: number,
    band: PriorityBand,
    reason: string,
    actor: SavePriorityAssessment['actor'],
  ): Promise<PriorityAssessmentRecord> {
    return this.database.transaction(async (tx) => {
      const now = new Date();
      const [updated] = await tx
        .update(priorityAssessments)
        .set({
          overrideBand: band,
          overrideReason: reason,
          overrideScore: String(score),
          overriddenAt: now,
          overriddenByUserId: actor.userId,
        })
        .where(eq(priorityAssessments.id, assessment.id))
        .returning();
      if (!updated) throw new EntityNotFoundError('PriorityAssessment', assessment.id);
      await tx.insert(auditLogs).values({
        action: 'request.priority_overridden',
        actorUserId: actor.userId,
        after: { band, score },
        before: { band: assessment.effectiveBand, score: assessment.effectiveScore },
        entityId: assessment.requestId,
        entityType: 'service_request',
        reason,
      });
      return {
        ...assessment,
        effectiveBand: band,
        effectiveScore: score,
        overrideReason: reason,
      };
    });
  }

  async findDuplicateCandidates(
    request: TriageRequestRecord,
  ): Promise<readonly TriageRequestRecord[]> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
    const rows = await this.database
      .select(requestProjection)
      .from(serviceRequests)
      .innerJoin(addresses, eq(addresses.id, serviceRequests.addressId))
      .innerJoin(requestSources, eq(requestSources.id, serviceRequests.sourceId))
      .where(
        and(
          ne(serviceRequests.id, request.id),
          eq(serviceRequests.categoryId, request.categoryId),
          eq(addresses.serviceAreaId, request.serviceAreaId),
          gte(serviceRequests.submittedAt, since),
          inArray(serviceRequests.status, [
            'RECEIVED',
            'VALIDATING',
            'NEEDS_INFORMATION',
            'REGISTERED',
          ]),
        ),
      )
      .orderBy(desc(serviceRequests.submittedAt))
      .limit(50);
    return rows.map(mapRequest);
  }

  async saveDuplicateSuggestions(
    request: TriageRequestRecord,
    suggestions: readonly {
      candidate: TriageRequestRecord;
      reasons: readonly string[];
      score: number;
    }[],
    actor: SavePriorityAssessment['actor'],
  ): Promise<readonly DuplicateSuggestionRecord[]> {
    return this.database.transaction(async (tx) => {
      for (const suggestion of suggestions) {
        await tx
          .insert(requestDuplicateMatches)
          .values({
            candidateRequestId: suggestion.candidate.id,
            reasons: suggestion.reasons,
            requestId: request.id,
            score: String(suggestion.score),
          })
          .onConflictDoUpdate({
            set: { reasons: suggestion.reasons, score: String(suggestion.score) },
            target: [requestDuplicateMatches.requestId, requestDuplicateMatches.candidateRequestId],
          });
      }
      await tx.insert(auditLogs).values({
        action: 'request.duplicates_suggested',
        actorUserId: actor.userId,
        after: {
          candidates: suggestions.map(({ candidate, score }) => ({ id: candidate.id, score })),
        },
        entityId: request.id,
        entityType: 'service_request',
      });
      const rows = await tx
        .select({
          candidateTicketNumber: serviceRequests.ticketNumber,
          reasons: requestDuplicateMatches.reasons,
          score: requestDuplicateMatches.score,
          status: requestDuplicateMatches.status,
        })
        .from(requestDuplicateMatches)
        .innerJoin(
          serviceRequests,
          eq(serviceRequests.id, requestDuplicateMatches.candidateRequestId),
        )
        .where(eq(requestDuplicateMatches.requestId, request.id));
      return rows.map((row) => ({ ...row, score: Number(row.score) }));
    });
  }

  async decideDuplicate(
    request: TriageRequestRecord,
    candidateTicketNumber: string,
    decision: 'CONFIRMED' | 'DISMISSED',
    actor: SavePriorityAssessment['actor'],
  ): Promise<DuplicateSuggestionRecord> {
    return this.database.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ id: serviceRequests.id })
        .from(serviceRequests)
        .where(eq(serviceRequests.ticketNumber, candidateTicketNumber))
        .limit(1);
      if (!candidate) throw new EntityNotFoundError('ServiceRequest', candidateTicketNumber);
      const [updated] = await tx
        .update(requestDuplicateMatches)
        .set({
          decidedAt: new Date(),
          decidedByUserId: actor.userId,
          status: decision,
        })
        .where(
          and(
            eq(requestDuplicateMatches.requestId, request.id),
            eq(requestDuplicateMatches.candidateRequestId, candidate.id),
          ),
        )
        .returning();
      if (!updated) {
        throw new DomainRuleError('DUPLICATE_SUGGESTION_MISSING', 'No duplicate suggestion exists');
      }
      await tx.insert(auditLogs).values({
        action: 'request.duplicate_decided',
        actorUserId: actor.userId,
        after: { candidateRequestId: candidate.id, decision },
        entityId: request.id,
        entityType: 'service_request',
      });
      return {
        candidateTicketNumber,
        reasons: updated.reasons,
        score: Number(updated.score),
        status: updated.status,
      };
    });
  }

  async registerAsOrder(
    request: TriageRequestRecord,
    assessment: PriorityAssessmentRecord,
    actor: SavePriorityAssessment['actor'],
  ): Promise<OrderRegistrationResult> {
    return this.database.transaction(async (tx) => {
      const [updatedRequest] = await tx
        .update(serviceRequests)
        .set({
          status: 'REGISTERED',
          updatedAt: new Date(),
          version: sql`${serviceRequests.version} + 1`,
        })
        .where(
          and(
            eq(serviceRequests.id, request.id),
            eq(serviceRequests.status, 'VALIDATING'),
            eq(serviceRequests.version, request.version),
          ),
        )
        .returning({ version: serviceRequests.version });
      if (!updatedRequest) throw new ConcurrencyConflictError('ServiceRequest', request.id);

      const [confirmed] = await tx
        .select({
          candidateRequestId: requestDuplicateMatches.candidateRequestId,
          requestId: requestDuplicateMatches.requestId,
        })
        .from(requestDuplicateMatches)
        .where(
          and(
            eq(requestDuplicateMatches.status, 'CONFIRMED'),
            or(
              eq(requestDuplicateMatches.requestId, request.id),
              eq(requestDuplicateMatches.candidateRequestId, request.id),
            ),
          ),
        )
        .limit(1);
      const counterpartId = confirmed
        ? confirmed.requestId === request.id
          ? confirmed.candidateRequestId
          : confirmed.requestId
        : undefined;
      const [existingLink] = counterpartId
        ? await tx
            .select({ orderId: orderRequestLinks.orderId })
            .from(orderRequestLinks)
            .where(eq(orderRequestLinks.requestId, counterpartId))
            .limit(1)
        : [];

      let orderId: string;
      let orderNumber: string;
      if (existingLink) {
        const [existingOrder] = await tx
          .select({ orderNumber: orders.orderNumber, priorityScore: orders.priorityScore })
          .from(orders)
          .where(eq(orders.id, existingLink.orderId))
          .limit(1);
        if (!existingOrder) throw new EntityNotFoundError('Order', existingLink.orderId);
        orderId = existingLink.orderId;
        orderNumber = existingOrder.orderNumber;
        if (
          existingOrder.priorityScore === null ||
          Number(existingOrder.priorityScore) < assessment.effectiveScore
        ) {
          await tx
            .update(orders)
            .set({
              priorityAssessmentId: assessment.id,
              priorityBand: assessment.effectiveBand,
              priorityScore: String(assessment.effectiveScore),
              updatedAt: new Date(),
            })
            .where(eq(orders.id, orderId));
        }
      } else {
        const sequenceRows = await tx.execute<{ value: string }>(
          sql`select nextval('order_portfolio_seq')::text as value`,
        );
        const sequence = sequenceRows[0]?.value;
        if (!sequence) throw new Error('Order number sequence returned no value');
        orderNumber = `ORD-${new Date().getUTCFullYear()}-${sequence.padStart(8, '0')}`;
        const [created] = await tx
          .insert(orders)
          .values({
            categoryId: request.categoryId,
            orderNumber,
            priorityAssessmentId: assessment.id,
            priorityBand: assessment.effectiveBand,
            priorityScore: String(assessment.effectiveScore),
            serviceAreaId: request.serviceAreaId,
          })
          .returning({ id: orders.id });
        if (!created) throw new Error('Order insert returned no row');
        orderId = created.id;
      }
      await tx.insert(orderRequestLinks).values({ orderId, requestId: request.id });
      await tx.insert(requestStatusHistory).values({
        actorUserId: actor.userId,
        fromStatus: 'VALIDATING',
        metadata: { orderId, orderNumber },
        requestId: request.id,
        requestVersion: updatedRequest.version,
        toStatus: 'REGISTERED',
        transitionKey: 'VALIDATING->REGISTERED',
      });
      await tx.insert(auditLogs).values({
        action: 'request.registered',
        actorUserId: actor.userId,
        after: { orderId, orderNumber, status: 'REGISTERED', version: updatedRequest.version },
        before: { status: request.status, version: request.version },
        entityId: request.id,
        entityType: 'service_request',
      });
      return {
        linkedToExistingOrder: Boolean(existingLink),
        orderId,
        orderNumber,
        ticketNumber: request.ticketNumber,
      };
    });
  }

  async listValidationQueue(
    serviceAreaIds: readonly (string | null)[],
  ): Promise<readonly TriageRequestRecord[]> {
    const statusFilter = inArray(serviceRequests.status, [
      'RECEIVED',
      'VALIDATING',
      'NEEDS_INFORMATION',
    ]);
    const scopedAreaIds = serviceAreaIds.filter((value): value is string => value !== null);
    const rows = await this.database
      .select(requestProjection)
      .from(serviceRequests)
      .innerJoin(addresses, eq(addresses.id, serviceRequests.addressId))
      .innerJoin(requestSources, eq(requestSources.id, serviceRequests.sourceId))
      .where(
        serviceAreaIds.includes(null)
          ? statusFilter
          : and(statusFilter, inArray(addresses.serviceAreaId, scopedAreaIds)),
      )
      .orderBy(serviceRequests.submittedAt)
      .limit(50);
    return rows.map(mapRequest);
  }
}
