import { and, eq, inArray, sql } from 'drizzle-orm';

import type {
  PdcaActionRecord,
  PdcaRepository,
  ServiceAreaRecord,
} from '../../application/pdca/pdca-repository.js';
import type { Principal } from '../../domain/identity/permissions.js';
import type { PdcaStage, ValidatedPdcaActionInput } from '../../domain/pdca/pdca-policy.js';
import { ConcurrencyConflictError } from '../../domain/shared/domain-errors.js';
import type { MckDatabase } from '../database/client.js';
import { auditLogs, pdcaActionHistory, pdcaActions, serviceAreas } from '../database/schema.js';

type PdcaRow = typeof pdcaActions.$inferSelect;

function mapAction(row: PdcaRow): PdcaActionRecord {
  return {
    code: row.code,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    dueAt: row.dueAt,
    expectedOutcome: row.expectedOutcome,
    id: row.id,
    ownerUserId: row.ownerUserId,
    plannedAction: row.plannedAction,
    problemStatement: row.problemStatement,
    result: row.result,
    serviceAreaId: row.serviceAreaId,
    stage: row.stage,
    title: row.title,
    version: row.version,
  };
}

export class PostgresPdcaRepository implements PdcaRepository {
  constructor(private readonly database: MckDatabase) {}

  async findAreaByCode(code: string): Promise<ServiceAreaRecord | undefined> {
    const [row] = await this.database
      .select({ code: serviceAreas.code, id: serviceAreas.id })
      .from(serviceAreas)
      .where(and(eq(serviceAreas.code, code), eq(serviceAreas.isActive, true)))
      .limit(1);
    return row;
  }

  async findByCode(code: string): Promise<PdcaActionRecord | undefined> {
    const [row] = await this.database
      .select()
      .from(pdcaActions)
      .where(eq(pdcaActions.code, code))
      .limit(1);
    return row ? mapAction(row) : undefined;
  }

  async create(
    input: ValidatedPdcaActionInput,
    serviceAreaId: string,
    actor: Principal,
    now: Date,
  ): Promise<PdcaActionRecord> {
    return this.database.transaction(async (tx) => {
      const sequenceRows = await tx.execute<{ value: string }>(
        sql`select nextval('pdca_action_seq')::text as value`,
      );
      const sequence = sequenceRows[0]?.value;
      if (!sequence) throw new Error('PDCA action sequence returned no value');
      const code = `PDC-${now.getUTCFullYear()}-${sequence.padStart(8, '0')}`;
      const [created] = await tx
        .insert(pdcaActions)
        .values({
          code,
          createdAt: now,
          createdByUserId: actor.userId,
          dueAt: input.dueAt,
          expectedOutcome: input.expectedOutcome,
          ownerUserId: actor.userId,
          plannedAction: input.plannedAction,
          problemStatement: input.problemStatement,
          serviceAreaId,
          title: input.title,
          updatedAt: now,
        })
        .returning();
      if (!created) throw new Error('PDCA action insert returned no row');
      await tx.insert(pdcaActionHistory).values({
        actionId: created.id,
        actionVersion: 0,
        actorUserId: actor.userId,
        occurredAt: now,
        reason: 'PDCA action created',
        toStage: 'PLAN',
      });
      await tx.insert(auditLogs).values({
        action: 'pdca.action_created',
        actorUserId: actor.userId,
        after: { code, dueAt: input.dueAt.toISOString(), ownerUserId: actor.userId, stage: 'PLAN' },
        entityId: created.id,
        entityType: 'pdca_action',
        occurredAt: now,
      });
      return mapAction(created);
    });
  }

  async list(serviceAreaIds: readonly (string | null)[]): Promise<readonly PdcaActionRecord[]> {
    const ids = serviceAreaIds.filter((id): id is string => id !== null);
    const rows = await this.database
      .select()
      .from(pdcaActions)
      .where(
        and(
          inArray(pdcaActions.stage, ['PLAN', 'DO', 'CHECK', 'ACT']),
          ...(serviceAreaIds.includes(null) ? [] : [inArray(pdcaActions.serviceAreaId, ids)]),
        ),
      )
      .orderBy(pdcaActions.dueAt, pdcaActions.code)
      .limit(50);
    return rows.map(mapAction);
  }

  async transition(
    action: PdcaActionRecord,
    to: PdcaStage,
    reason: string,
    actor: Principal,
    now: Date,
  ): Promise<PdcaActionRecord> {
    return this.database.transaction(async (tx) => {
      const [updated] = await tx
        .update(pdcaActions)
        .set({
          ...(to === 'COMPLETED' ? { completedAt: now, result: reason } : {}),
          stage: to,
          updatedAt: now,
          version: sql`${pdcaActions.version} + 1`,
        })
        .where(
          and(
            eq(pdcaActions.id, action.id),
            eq(pdcaActions.stage, action.stage),
            eq(pdcaActions.version, action.version),
          ),
        )
        .returning();
      if (!updated) throw new ConcurrencyConflictError('PdcaAction', action.id);
      await tx.insert(pdcaActionHistory).values({
        actionId: action.id,
        actionVersion: updated.version,
        actorUserId: actor.userId,
        fromStage: action.stage,
        occurredAt: now,
        reason,
        toStage: to,
      });
      await tx.insert(auditLogs).values({
        action: 'pdca.stage_changed',
        actorUserId: actor.userId,
        after: { stage: to, version: updated.version },
        before: { stage: action.stage, version: action.version },
        entityId: action.id,
        entityType: 'pdca_action',
        occurredAt: now,
        reason,
      });
      return mapAction(updated);
    });
  }
}
