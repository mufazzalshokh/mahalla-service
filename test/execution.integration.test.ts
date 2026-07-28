import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ExecutionService } from '../src/application/execution/execution-service.js';
import { TransitionOrderService } from '../src/application/orders/transition-order-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../src/infrastructure/database/client.js';
import { runMigrations } from '../src/infrastructure/database/migration-runner.js';
import {
  assignments,
  auditLogs,
  executorCategoryCapabilities,
  executorProfiles,
  orderEscalations,
  orderExecutionSlaClocks,
  orders,
  orderStatusHistory,
  roles,
  serviceAreas,
  serviceCategories,
  userRoles,
  users,
  workEvidence,
  workLogs,
} from '../src/infrastructure/database/schema.js';
import { seedFoundation } from '../src/infrastructure/database/seed-runner.js';
import { PostgresExecutionRepository } from '../src/infrastructure/execution/postgres-execution-repository.js';
import { PostgresPrincipalProvider } from '../src/infrastructure/identity/postgres-principal-provider.js';
import { PostgresExecutorEligibility } from '../src/infrastructure/orders/postgres-executor-eligibility.js';
import { PostgresOrderRepository } from '../src/infrastructure/orders/postgres-order-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const assignmentNow = new Date(Date.now() + 60_000);
const assignmentDueAt = new Date(assignmentNow.getTime() + 3_600_000);
const overdueScanNow = new Date(assignmentDueAt.getTime() + 3_600_000);

describe.runIf(Boolean(databaseUrl))('CP-05 assignment and execution persistence', () => {
  let client: DatabaseClient;
  let areaId: string;
  let categoryId: string;
  let operator: Principal;
  let executor: Principal;
  let otherExecutor: Principal;
  let service: ExecutionService;
  const executorCode = `CP05-${randomUUID().slice(0, 8)}`.toUpperCase();
  const unavailableExecutorCode = `CP05-${randomUUID().slice(0, 8)}`.toUpperCase();

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
    const [category] = await client.db
      .select({ id: serviceCategories.id })
      .from(serviceCategories)
      .where(eq(serviceCategories.code, 'PLUMBING'));
    const [operatorRole] = await client.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, 'operator_manager'));
    const [executorRole] = await client.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, 'executor'));
    if (!area || !category || !operatorRole || !executorRole) throw new Error('Seed incomplete');
    areaId = area.id;
    categoryId = category.id;

    const telegramBase = BigInt(Date.now()) * 100n;
    const [operatorUser, executorUser, otherExecutorUser] = await client.db
      .insert(users)
      .values([
        { telegramUserId: telegramBase + 1n },
        { telegramUserId: telegramBase + 2n },
        { telegramUserId: telegramBase + 3n },
      ])
      .returning({ id: users.id });
    if (!operatorUser || !executorUser || !otherExecutorUser) throw new Error('Users missing');
    await client.db.insert(userRoles).values([
      { roleId: operatorRole.id, serviceAreaId: areaId, userId: operatorUser.id },
      { roleId: executorRole.id, serviceAreaId: areaId, userId: executorUser.id },
      { roleId: executorRole.id, serviceAreaId: areaId, userId: otherExecutorUser.id },
    ]);
    await client.db.insert(executorProfiles).values([
      { code: executorCode, displayName: 'CP05 Executor One', userId: executorUser.id },
      {
        code: unavailableExecutorCode,
        displayName: 'Unavailable Executor',
        isAvailable: false,
        userId: otherExecutorUser.id,
      },
    ]);
    await client.db.insert(executorCategoryCapabilities).values([
      { categoryId, executorUserId: executorUser.id },
      { categoryId, executorUserId: otherExecutorUser.id },
    ]);
    const provider = new PostgresPrincipalProvider(client.db);
    const loadedOperator = await provider.load(operatorUser.id);
    const loadedExecutor = await provider.load(executorUser.id);
    const loadedOtherExecutor = await provider.load(otherExecutorUser.id);
    if (!loadedOperator || !loadedExecutor || !loadedOtherExecutor) {
      throw new Error('Principals missing');
    }
    operator = loadedOperator;
    executor = loadedExecutor;
    otherExecutor = loadedOtherExecutor;

    const repository = new PostgresExecutionRepository(client.db);
    service = new ExecutionService(
      repository,
      new TransitionOrderService(
        new PostgresOrderRepository(client.db),
        new PostgresExecutorEligibility(client.db),
        () => assignmentNow,
      ),
      () => overdueScanNow,
    );
  }, 60_000);

  afterAll(async () => client.close());

  async function createOrder(): Promise<{ id: string; orderNumber: string }> {
    const orderNumber = `E-${randomUUID().slice(0, 20)}`.toUpperCase();
    const [created] = await client.db
      .insert(orders)
      .values({ categoryId, orderNumber, serviceAreaId: areaId })
      .returning({ id: orders.id });
    if (!created) throw new Error('Order missing');
    return { id: created.id, orderNumber };
  }

  it('lists only active, available and category-capable executors', async () => {
    const order = await createOrder();
    const eligible = await service.listEligibleExecutors(order.orderNumber, operator);
    expect(eligible.map(({ code }) => code)).toContain(executorCode);
    expect(eligible.map(({ code }) => code)).not.toContain(unavailableExecutorCode);
  });

  it('persists the complete executor lifecycle, evidence, SLA and audit', async () => {
    const order = await createOrder();
    const dueAt = assignmentDueAt;
    await service.assign(order.orderNumber, executorCode, dueAt, operator);
    await service.addEvidence(
      order.orderNumber,
      {
        fileId: 'before-file',
        fileSize: 1_000,
        fileUniqueId: `before-${order.id}`,
        mediaType: 'image/jpeg',
        phase: 'BEFORE',
      },
      executor,
    );
    await service.transition(order.orderNumber, 'IN_PROGRESS', {}, executor);
    await service.addProgress(
      order.orderNumber,
      'Old pipe removed and replacement prepared',
      executor,
    );
    await service.transition(
      order.orderNumber,
      'BLOCKED',
      { blockerReason: 'Building water access temporarily unavailable' },
      executor,
    );
    await expect(
      service.transition(order.orderNumber, 'IN_PROGRESS', {}, otherExecutor),
    ).rejects.toMatchObject({ code: 'ACTOR_CONSTRAINT_FAILED' });
    await service.transition(
      order.orderNumber,
      'IN_PROGRESS',
      { progressNote: 'Water access restored' },
      executor,
    );
    await service.addEvidence(
      order.orderNumber,
      {
        fileId: 'after-file',
        fileSize: 1_100,
        fileUniqueId: `after-${order.id}`,
        mediaType: 'image/jpeg',
        phase: 'AFTER',
      },
      executor,
    );
    const submitted = await service.transition(
      order.orderNumber,
      'AWAITING_ACCEPTANCE',
      { completionSummary: 'Pipe replaced and pressure tested successfully' },
      executor,
    );
    expect(submitted.status).toBe('AWAITING_ACCEPTANCE');

    await expect(
      client.db.select().from(assignments).where(eq(assignments.orderId, order.id)),
    ).resolves.toMatchObject([{ status: 'COMPLETED' }]);
    const logs = await client.db.select().from(workLogs).where(eq(workLogs.orderId, order.id));
    expect(logs.map(({ logType }) => logType)).toEqual([
      'PROGRESS',
      'BLOCKED',
      'UNBLOCKED',
      'COMPLETION',
    ]);
    await expect(
      client.db.select().from(workEvidence).where(eq(workEvidence.orderId, order.id)),
    ).resolves.toHaveLength(2);
    const [clock] = await client.db
      .select()
      .from(orderExecutionSlaClocks)
      .where(eq(orderExecutionSlaClocks.orderId, order.id));
    expect(clock).toMatchObject({ dueAt, pausedAt: null });
    expect(clock?.startedAt).toBeInstanceOf(Date);
    expect(clock?.stoppedAt).toBeInstanceOf(Date);
    const history = await client.db
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, order.id));
    expect(history).toHaveLength(5);
    const audit = await client.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, order.id));
    expect(audit.map(({ action }) => action)).toEqual(
      expect.arrayContaining([
        'order.assigned',
        'assignment.accepted',
        'order.progress_recorded',
        'order.evidence_added',
        'order.blocked',
        'order.unblocked',
        'order.completion_submitted',
      ]),
    );
  });

  it('preserves a declined assignment and returns the order for reassignment', async () => {
    const order = await createOrder();
    await service.assign(order.orderNumber, executorCode, assignmentDueAt, operator);
    const returned = await service.transition(
      order.orderNumber,
      'REGISTERED',
      { reason: 'Required equipment is unavailable' },
      executor,
    );
    expect(returned).toMatchObject({
      assignedExecutorUserId: null,
      dueAt: null,
      status: 'REGISTERED',
    });
    await expect(
      client.db.select().from(assignments).where(eq(assignments.orderId, order.id)),
    ).resolves.toMatchObject([
      { responseReason: 'Required equipment is unavailable', status: 'DECLINED' },
    ]);
  });

  it('serializes concurrent assignment to one active assignment', async () => {
    const order = await createOrder();
    const dueAt = assignmentDueAt;
    const outcomes = await Promise.allSettled([
      service.assign(order.orderNumber, executorCode, dueAt, operator),
      service.assign(order.orderNumber, executorCode, dueAt, operator),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    await expect(
      client.db.select().from(assignments).where(eq(assignments.orderId, order.id)),
    ).resolves.toHaveLength(1);
  });

  it('creates one idempotent overdue escalation with audit evidence', async () => {
    const order = await createOrder();
    await service.assign(order.orderNumber, executorCode, assignmentDueAt, operator);
    const first = await service.scanOverdue(operator);
    const second = await service.scanOverdue(operator);
    expect(first.map(({ orderNumber }) => orderNumber)).toContain(order.orderNumber);
    expect(second.map(({ orderNumber }) => orderNumber)).toContain(order.orderNumber);
    await expect(
      client.db.select().from(orderEscalations).where(eq(orderEscalations.orderId, order.id)),
    ).resolves.toHaveLength(1);
    const escalationAudit = await client.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.entityId, order.id));
    expect(
      escalationAudit.filter(({ action }) => action === 'order.deadline_escalated'),
    ).toHaveLength(1);
  });
});
