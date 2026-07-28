import { randomUUID } from 'node:crypto';

import { and, desc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { QualityService } from '../src/application/quality/quality-service.js';
import { TransitionOrderService } from '../src/application/orders/transition-order-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../src/infrastructure/database/client.js';
import { runMigrations } from '../src/infrastructure/database/migration-runner.js';
import {
  addresses,
  assignments,
  auditLogs,
  executorCategoryCapabilities,
  executorProfiles,
  orderAcceptances,
  orderExecutionSlaClocks,
  orderRequestLinks,
  orders,
  orderWarranties,
  qualityComplaints,
  qualityFeedback,
  qualityInspections,
  qualityReworkDecisions,
  requestSources,
  roles,
  serviceAreas,
  serviceCategories,
  serviceRequests,
  userRoles,
  users,
} from '../src/infrastructure/database/schema.js';
import { seedFoundation } from '../src/infrastructure/database/seed-runner.js';
import { PostgresPrincipalProvider } from '../src/infrastructure/identity/postgres-principal-provider.js';
import { PostgresExecutorEligibility } from '../src/infrastructure/orders/postgres-executor-eligibility.js';
import { PostgresOrderRepository } from '../src/infrastructure/orders/postgres-order-repository.js';
import { PostgresQualityRepository } from '../src/infrastructure/quality/postgres-quality-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const fixedNow = new Date(Date.now() + 60_000);
const dayInMilliseconds = 86_400_000;

describe.runIf(Boolean(databaseUrl))('CP-06 quality and complaint persistence', () => {
  let client: DatabaseClient;
  let areaId: string;
  let electricalCategoryId: string;
  let plumbingCategoryId: string;
  let sourceId: string;
  let operatorUserId: string;
  let executorUserId: string;
  let residentUserId: string;
  let otherResidentUserId: string;
  let operator: Principal;
  let executor: Principal;
  let resident: Principal;
  let otherResident: Principal;
  let quality: QualityService;
  let transitions: TransitionOrderService;

  beforeAll(async () => {
    client = createDatabaseClient(databaseUrl as string);
    await runMigrations(client.db);
    await runMigrations(client.db);
    await seedFoundation(client.db);
    await seedFoundation(client.db);

    const [area] = await client.db
      .select({ id: serviceAreas.id })
      .from(serviceAreas)
      .where(eq(serviceAreas.code, 'DEMO'));
    const [electrical, plumbing] = await Promise.all([
      client.db
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(eq(serviceCategories.code, 'ELECTRICAL'))
        .then((rows) => rows[0]),
      client.db
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(eq(serviceCategories.code, 'PLUMBING'))
        .then((rows) => rows[0]),
    ]);
    const [source] = await client.db
      .select({ id: requestSources.id })
      .from(requestSources)
      .where(eq(requestSources.code, 'TELEGRAM'));
    const [operatorRole] = await client.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, 'operator_manager'));
    const [executorRole] = await client.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, 'executor'));
    if (!area || !electrical || !plumbing || !source || !operatorRole || !executorRole) {
      throw new Error('Seed incomplete');
    }
    areaId = area.id;
    electricalCategoryId = electrical.id;
    plumbingCategoryId = plumbing.id;
    sourceId = source.id;

    const telegramBase = BigInt(Date.now()) * 100n;
    const [operatorUser, executorUser, residentUser, otherResidentUser] = await client.db
      .insert(users)
      .values([
        { telegramUserId: telegramBase + 11n },
        { telegramUserId: telegramBase + 12n },
        { telegramUserId: telegramBase + 13n },
        { telegramUserId: telegramBase + 14n },
      ])
      .returning({ id: users.id });
    if (!operatorUser || !executorUser || !residentUser || !otherResidentUser) {
      throw new Error('Users missing');
    }
    operatorUserId = operatorUser.id;
    executorUserId = executorUser.id;
    residentUserId = residentUser.id;
    otherResidentUserId = otherResidentUser.id;
    await client.db.insert(userRoles).values([
      { roleId: operatorRole.id, serviceAreaId: areaId, userId: operatorUserId },
      { roleId: executorRole.id, serviceAreaId: areaId, userId: executorUserId },
    ]);
    await client.db.insert(executorProfiles).values({
      code: `CP06-${randomUUID().slice(0, 8)}`.toUpperCase(),
      displayName: 'CP06 Executor',
      userId: executorUserId,
    });
    await client.db.insert(executorCategoryCapabilities).values([
      { categoryId: electricalCategoryId, executorUserId },
      { categoryId: plumbingCategoryId, executorUserId },
    ]);

    const provider = new PostgresPrincipalProvider(client.db);
    const principals = await Promise.all([
      provider.load(operatorUserId),
      provider.load(executorUserId),
      provider.load(residentUserId),
      provider.load(otherResidentUserId),
    ]);
    if (principals.some((value) => !value)) throw new Error('Principals missing');
    [operator, executor, resident, otherResident] = principals as [
      Principal,
      Principal,
      Principal,
      Principal,
    ];
    transitions = new TransitionOrderService(
      new PostgresOrderRepository(client.db, () => fixedNow),
      new PostgresExecutorEligibility(client.db),
      () => fixedNow,
    );
    quality = new QualityService(
      new PostgresQualityRepository(client.db),
      transitions,
      () => fixedNow,
    );
  }, 60_000);

  afterAll(async () => client.close());

  async function createAwaitingOrder(categoryId: string): Promise<{
    id: string;
    orderNumber: string;
  }> {
    const suffix = randomUUID().slice(0, 16).toUpperCase();
    const assignedAt = new Date(fixedNow.getTime() - dayInMilliseconds);
    const initialDueAt = new Date(fixedNow.getTime() + 3 * dayInMilliseconds);
    const [address] = await client.db
      .insert(addresses)
      .values({ line1: 'CP06 synthetic address', serviceAreaId: areaId })
      .returning({ id: addresses.id });
    if (!address) throw new Error('Address missing');
    const [request] = await client.db
      .insert(serviceRequests)
      .values({
        addressId: address.id,
        categoryId,
        description: 'CP06 synthetic quality request',
        requesterUserId: residentUserId,
        sourceId,
        status: 'REGISTERED',
        ticketNumber: `Q-${suffix}`,
      })
      .returning({ id: serviceRequests.id });
    const [created] = await client.db
      .insert(orders)
      .values({
        categoryId,
        currentExecutorUserId: executorUserId,
        dueAt: initialDueAt,
        orderNumber: `O-${suffix}`,
        serviceAreaId: areaId,
        status: 'AWAITING_ACCEPTANCE',
      })
      .returning({ id: orders.id });
    if (!request || !created) throw new Error('Quality fixture missing');
    await client.db
      .insert(orderRequestLinks)
      .values({ orderId: created.id, requestId: request.id });
    await client.db.insert(assignments).values({
      assignedAt,
      assignedByUserId: operatorUserId,
      dueAt: initialDueAt,
      executorUserId,
      orderId: created.id,
      respondedAt: new Date(assignedAt.getTime() + 300_000),
      status: 'COMPLETED',
    });
    return { id: created.id, orderNumber: `O-${suffix}` };
  }

  it('persists inspection, resident acceptance, warranty, feedback, and complaint', async () => {
    const order = await createAwaitingOrder(electricalCategoryId);
    const failed = await quality.inspect(
      order.orderNumber,
      [
        { code: 'WORK_COMPLETE', result: 'PASS' },
        { code: 'RESULT_TESTED', result: 'FAIL' },
        { code: 'AREA_CLEAN', result: 'PASS' },
      ],
      'Electrical result needs correction',
      operator,
    );
    expect(failed).toMatchObject({ attempt: 1, outcome: 'FAIL' });
    await expect(quality.accept(order.orderNumber, 'RESIDENT', resident)).rejects.toMatchObject({
      code: 'PASSING_INSPECTION_REQUIRED',
    });
    await quality.inspect(
      order.orderNumber,
      [
        { code: 'WORK_COMPLETE', result: 'PASS' },
        { code: 'RESULT_TESTED', result: 'PASS' },
        { code: 'AREA_CLEAN', result: 'PASS' },
      ],
      'Electrical result tested safely',
      operator,
    );
    await expect(
      quality.accept(order.orderNumber, 'RESIDENT', otherResident),
    ).rejects.toMatchObject({ code: 'ACTOR_CONSTRAINT_FAILED' });
    const completed = await quality.accept(order.orderNumber, 'RESIDENT', resident);
    expect(completed.status).toBe('COMPLETED');

    await expect(
      client.db.select().from(qualityInspections).where(eq(qualityInspections.orderId, order.id)),
    ).resolves.toHaveLength(2);
    await expect(
      client.db.select().from(orderAcceptances).where(eq(orderAcceptances.orderId, order.id)),
    ).resolves.toMatchObject([{ source: 'RESIDENT' }]);
    const [warranty] = await client.db
      .select()
      .from(orderWarranties)
      .where(eq(orderWarranties.orderId, order.id));
    expect(warranty).toMatchObject({ startsAt: fixedNow, warrantyDays: 7 });
    expect(warranty?.endsAt).toEqual(new Date(fixedNow.getTime() + 7 * dayInMilliseconds));

    await quality.feedback(order.orderNumber, 5, 'Muammo to‘liq hal qilindi', resident);
    await expect(
      quality.feedback(order.orderNumber, 4, 'Second rating', resident),
    ).rejects.toMatchObject({ code: 'FEEDBACK_ALREADY_SUBMITTED' });
    await expect(
      client.db.select().from(qualityFeedback).where(eq(qualityFeedback.orderId, order.id)),
    ).resolves.toMatchObject([{ rating: 5 }]);

    const complaint = await quality.complaint(
      order.orderNumber,
      'Kafolat davrida muammo qaytdi',
      resident,
    );
    expect(complaint).toMatchObject({ status: 'OPEN', withinWarranty: true });
    await expect(
      quality.complaint(order.orderNumber, 'Ikkinchi ochiq shikoyat', resident),
    ).rejects.toMatchObject({ code: 'COMPLAINT_ALREADY_OPEN' });
    await expect(quality.listComplaints(operator)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: complaint.code })]),
    );
    const [stillCompleted] = await client.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(stillCompleted?.status).toBe('COMPLETED');

    const reopened = await quality.reopen(
      complaint.code,
      'Kafolat bo‘yicha qayta tuzatish',
      operator,
    );
    expect(reopened.status).toBe('REWORK_REQUIRED');
    const [storedComplaint] = await client.db
      .select()
      .from(qualityComplaints)
      .where(eq(qualityComplaints.id, complaint.id));
    expect(storedComplaint).toMatchObject({
      reopenedByUserId: operatorUserId,
      status: 'REOPENED',
    });
    const assignmentRows = await client.db
      .select()
      .from(assignments)
      .where(eq(assignments.orderId, order.id))
      .orderBy(desc(assignments.assignedAt));
    expect(assignmentRows).toHaveLength(2);
    expect(assignmentRows[0]).toMatchObject({ status: 'PENDING' });
    const [clock] = await client.db
      .select()
      .from(orderExecutionSlaClocks)
      .where(eq(orderExecutionSlaClocks.orderId, order.id));
    expect(clock).toMatchObject({
      dueAt: new Date(fixedNow.getTime() + dayInMilliseconds),
      startedAt: null,
      stoppedAt: null,
    });
    await expect(
      client.db
        .select()
        .from(qualityReworkDecisions)
        .where(eq(qualityReworkDecisions.orderId, order.id)),
    ).resolves.toMatchObject([{ complaintId: complaint.id, source: 'COMPLAINT' }]);

    await transitions.execute(
      { data: {}, expectedVersion: reopened.version, orderId: order.id, to: 'IN_PROGRESS' },
      executor,
    );
    const [activeAssignment] = await client.db
      .select()
      .from(assignments)
      .where(and(eq(assignments.orderId, order.id), eq(assignments.status, 'ACCEPTED')));
    expect(activeAssignment?.respondedAt).toEqual(fixedNow);

    const [inProgress] = await client.db
      .select({ version: orders.version })
      .from(orders)
      .where(eq(orders.id, order.id));
    if (!inProgress) throw new Error('Rework order missing');
    await transitions.execute(
      {
        data: { completionSummary: 'Warranty correction completed and tested' },
        expectedVersion: inProgress.version,
        orderId: order.id,
        to: 'AWAITING_ACCEPTANCE',
      },
      executor,
    );
    await expect(quality.accept(order.orderNumber, 'RESIDENT', resident)).rejects.toMatchObject({
      code: 'PASSING_INSPECTION_REQUIRED',
    });
    await quality.inspect(
      order.orderNumber,
      [
        { code: 'WORK_COMPLETE', result: 'PASS' },
        { code: 'RESULT_TESTED', result: 'PASS' },
        { code: 'AREA_CLEAN', result: 'PASS' },
      ],
      'Reworked electrical result tested safely',
      operator,
    );
    await quality.accept(order.orderNumber, 'RESIDENT', resident);
    await quality.decideComplaint(
      complaint.code,
      'RESOLVED',
      'Corrected work accepted after reinspection',
      operator,
    );
    const [resolvedComplaint] = await client.db
      .select({ status: qualityComplaints.status })
      .from(qualityComplaints)
      .where(eq(qualityComplaints.id, complaint.id));
    expect(resolvedComplaint?.status).toBe('RESOLVED');
    await expect(
      client.db.select().from(orderAcceptances).where(eq(orderAcceptances.orderId, order.id)),
    ).resolves.toHaveLength(2);
    await expect(
      client.db.select().from(qualityInspections).where(eq(qualityInspections.orderId, order.id)),
    ).resolves.toHaveLength(3);
  });

  it('serializes competing resident acceptance and rework decisions', async () => {
    const order = await createAwaitingOrder(plumbingCategoryId);
    const outcomes = await Promise.allSettled([
      quality.accept(order.orderNumber, 'RESIDENT', resident),
      quality.requireRework(order.orderNumber, 'Natija yetarli emas', 'RESIDENT', resident),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const [stored] = await client.db
      .select({ status: orders.status })
      .from(orders)
      .where(eq(orders.id, order.id));
    expect(['COMPLETED', 'REWORK_REQUIRED']).toContain(stored?.status);
    const materialAudits = await client.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, order.id));
    expect(
      materialAudits.filter(({ action }) =>
        ['order.completed', 'order.rework_required'].includes(action),
      ),
    ).toHaveLength(1);
  });
});
