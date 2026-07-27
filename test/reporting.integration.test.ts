import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PdcaService } from '../src/application/pdca/pdca-service.js';
import { ReportingService } from '../src/application/reporting/reporting-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';
import { createReportingPeriod } from '../src/domain/reporting/reporting-period.js';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../src/infrastructure/database/client.js';
import { runMigrations } from '../src/infrastructure/database/migration-runner.js';
import {
  auditLogs,
  pdcaActionHistory,
  pdcaActions,
  serviceAreas,
  users,
} from '../src/infrastructure/database/schema.js';
import { seedFoundation } from '../src/infrastructure/database/seed-runner.js';
import { PostgresPdcaRepository } from '../src/infrastructure/pdca/postgres-pdca-repository.js';
import { PostgresReportingRepository } from '../src/infrastructure/reporting/postgres-reporting-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('CP-08 reporting and PDCA persistence', () => {
  const now = new Date('2026-07-27T10:00:00Z');
  const asOf = new Date('2026-07-30T10:00:00Z');
  let client: DatabaseClient;
  let areaCode: string;
  let otherAreaCode: string;
  let manager: Principal;
  let otherManager: Principal;
  let pdca: PdcaService;
  let repository: PostgresPdcaRepository;

  beforeAll(async () => {
    client = createDatabaseClient(databaseUrl as string);
    await runMigrations(client.db);
    await runMigrations(client.db);
    await seedFoundation(client.db);
    await seedFoundation(client.db);
    const suffix = randomUUID().slice(0, 8).toUpperCase();
    areaCode = `R${suffix}`;
    otherAreaCode = `O${suffix}`;
    const [area, otherArea] = await client.db
      .insert(serviceAreas)
      .values([
        { code: areaCode, nameUzCyrl: `Ҳудуд ${suffix}`, nameUzLatn: `Area ${suffix}` },
        { code: otherAreaCode, nameUzCyrl: `Бошқа ${suffix}`, nameUzLatn: `Other ${suffix}` },
      ])
      .returning({ id: serviceAreas.id });
    const [actor, otherActor] = await client.db
      .insert(users)
      .values([
        { telegramUserId: BigInt(Date.now()) * 100n + 1n },
        { telegramUserId: BigInt(Date.now()) * 100n + 2n },
      ])
      .returning({ id: users.id });
    if (!area || !otherArea || !actor || !otherActor) throw new Error('Integration setup failed');
    manager = {
      grants: [
        { permission: 'pdca.manage', serviceAreaId: area.id },
        { permission: 'report.read', serviceAreaId: area.id },
        { permission: 'report.export', serviceAreaId: area.id },
      ],
      userId: actor.id,
    };
    otherManager = {
      grants: [{ permission: 'pdca.manage', serviceAreaId: otherArea.id }],
      userId: otherActor.id,
    };
    repository = new PostgresPdcaRepository(client.db);
    pdca = new PdcaService(repository, () => now);
  });

  afterAll(async () => client.close());

  it('creates scoped actions with history/audit and reports a live overdue snapshot', async () => {
    const action = await pdca.create(
      areaCode,
      {
        dueAt: new Date('2026-07-28T10:00:00Z'),
        expectedOutcome: 'No repeat leak for seven days',
        plannedAction: 'Replace the damaged pipe section',
        problemStatement: 'The same pipe section leaks repeatedly',
        title: 'Eliminate recurring pipe leak',
      },
      manager,
    );
    await pdca.create(
      otherAreaCode,
      {
        dueAt: new Date('2026-08-10T10:00:00Z'),
        expectedOutcome: 'Other area result remains scoped out',
        plannedAction: 'Perform action in other service area',
        problemStatement: 'Other service area test problem',
        title: 'Other area action',
      },
      otherManager,
    );
    expect(action.code).toMatch(/^PDC-2026-\d{8}$/u);
    await expect(pdca.list(manager)).resolves.toMatchObject([
      { code: action.code, overdue: false, stage: 'PLAN' },
    ]);

    const reporting = new ReportingService(new PostgresReportingRepository(client.db), () => asOf);
    const report = await reporting.report('WEEK', manager);
    expect(report).toMatchObject({
      pdca: { active: 1, completedInPeriod: 0, createdInPeriod: 1, overdue: 1 },
      portfolio: { activeBacklog: 0, requestsReceived: 0 },
      serviceAreaCount: 1,
    });
    expect(report.portfolio.completionToIntakePercent).toBeNull();
    expect(report.sla.onTimePercent).toBeNull();
    expect(report.quality.inspectionPassPercent).toBeNull();
    const csv = await reporting.exportCsv('WEEK', manager);
    expect(csv.content).toContain('pdca,overdue,1,count');

    const reportingRepository = new PostgresReportingRepository(client.db);
    const period = createReportingPeriod('WEEK', asOf);
    const globalReport = await reportingRepository.generate(period, [null]);
    expect(globalReport.pdca.active).toBeGreaterThanOrEqual(2);
    expect(globalReport.serviceAreaCount).toBeGreaterThanOrEqual(3);
    const emptyReport = await reportingRepository.generate(period, []);
    expect(emptyReport).toMatchObject({ pdca: { active: 0 }, serviceAreaCount: 0 });
    await expect(repository.list([null])).resolves.toHaveLength(2);
    await expect(repository.findAreaByCode('MISSING')).resolves.toBeUndefined();
    await expect(repository.findByCode('PDC-2099-99999999')).resolves.toBeUndefined();

    const [history] = await client.db
      .select()
      .from(pdcaActionHistory)
      .where(eq(pdcaActionHistory.actionId, action.id));
    const [audit] = await client.db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.entityType, 'pdca_action'), eq(auditLogs.entityId, action.id)));
    expect(history).toMatchObject({ actionVersion: 0, fromStage: null, toStage: 'PLAN' });
    expect(audit?.action).toBe('pdca.action_created');
  });

  it('protects optimistic transitions and completes the auditable PDCA cycle', async () => {
    const [current] = await pdca.list(manager);
    if (!current) throw new Error('Expected active PDCA action');
    const attempts = await Promise.allSettled([
      repository.transition(current, 'DO', 'Work started by first operator', manager, now),
      repository.transition(current, 'DO', 'Work started by second operator', manager, now),
    ]);
    expect(attempts.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter(({ status }) => status === 'rejected')).toHaveLength(1);

    await pdca.transition(
      current.code,
      'CHECK',
      'Implementation is ready for verification',
      manager,
    );
    await pdca.transition(
      current.code,
      'ACT',
      'Verification confirmed the expected outcome',
      manager,
    );
    const completed = await pdca.transition(
      current.code,
      'COMPLETED',
      'Result accepted and standard work updated',
      manager,
    );
    expect(completed).toMatchObject({ stage: 'COMPLETED', version: 4 });
    expect(completed.completedAt).toEqual(now);
    expect(completed.result).toBe('Result accepted and standard work updated');
    await expect(pdca.list(manager)).resolves.toEqual([]);

    const rows = await client.db
      .select()
      .from(pdcaActionHistory)
      .where(eq(pdcaActionHistory.actionId, completed.id));
    expect(rows.map(({ toStage }) => toStage)).toEqual(['PLAN', 'DO', 'CHECK', 'ACT', 'COMPLETED']);
    const [stored] = await client.db
      .select()
      .from(pdcaActions)
      .where(eq(pdcaActions.id, completed.id));
    expect(stored?.version).toBe(4);

    const report = await new ReportingService(
      new PostgresReportingRepository(client.db),
      () => asOf,
    ).report('WEEK', manager);
    expect(report.pdca).toEqual({
      active: 0,
      completedInPeriod: 1,
      createdInPeriod: 1,
      overdue: 0,
    });
  });
});
