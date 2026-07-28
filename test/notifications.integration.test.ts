import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ExecutionService } from '../src/application/execution/execution-service.js';
import { NotificationDeliveryError } from '../src/application/notifications/notification-repository.js';
import { NotificationService } from '../src/application/notifications/notification-service.js';
import { TransitionOrderService } from '../src/application/orders/transition-order-service.js';
import { TransitionRequestService } from '../src/application/requests/transition-request-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../src/infrastructure/database/client.js';
import { runMigrations } from '../src/infrastructure/database/migration-runner.js';
import {
  addresses,
  auditLogs,
  executorCategoryCapabilities,
  executorProfiles,
  notificationDeliveryAttempts,
  notificationOutbox,
  orderEscalations,
  orderRequestLinks,
  orders,
  qualityComplaints,
  requestSources,
  residentProfiles,
  roles,
  serviceAreas,
  serviceCategories,
  serviceRequests,
  userRoles,
  users,
} from '../src/infrastructure/database/schema.js';
import { seedFoundation } from '../src/infrastructure/database/seed-runner.js';
import { PostgresAutomationRepository } from '../src/infrastructure/automation/postgres-automation-repository.js';
import { PostgresExecutionRepository } from '../src/infrastructure/execution/postgres-execution-repository.js';
import { PostgresPrincipalProvider } from '../src/infrastructure/identity/postgres-principal-provider.js';
import { PostgresNotificationRepository } from '../src/infrastructure/notifications/postgres-notification-repository.js';
import { PostgresExecutorEligibility } from '../src/infrastructure/orders/postgres-executor-eligibility.js';
import { PostgresOrderRepository } from '../src/infrastructure/orders/postgres-order-repository.js';
import { PostgresRequestRepository } from '../src/infrastructure/requests/postgres-request-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('CP-07 notification and automation persistence', () => {
  let client: DatabaseClient;
  let areaId: string;
  let operator: Principal;
  let operatorUserId: string;
  let executorUserId: string;
  let residentUserId: string;
  let overdueOrderNumber: string;
  const suffix = randomUUID().slice(0, 8).toUpperCase();

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
    const [source] = await client.db
      .select({ id: requestSources.id })
      .from(requestSources)
      .where(eq(requestSources.code, 'TELEGRAM'));
    if (!area || !category || !operatorRole || !executorRole || !source) {
      throw new Error('Seed incomplete');
    }
    areaId = area.id;
    const telegramBase = BigInt(Date.now()) * 1000n;
    const [resident, staff, executor] = await client.db
      .insert(users)
      .values([
        { telegramUserId: telegramBase + 1n },
        { telegramUserId: telegramBase + 2n },
        { telegramUserId: telegramBase + 3n },
      ])
      .returning({ id: users.id });
    if (!resident || !staff || !executor) throw new Error('Users missing');
    residentUserId = resident.id;
    operatorUserId = staff.id;
    executorUserId = executor.id;
    await client.db.insert(residentProfiles).values({ language: 'uz-Latn', userId: resident.id });
    await client.db.insert(userRoles).values([
      { roleId: operatorRole.id, serviceAreaId: area.id, userId: staff.id },
      { roleId: executorRole.id, serviceAreaId: area.id, userId: executor.id },
    ]);
    await client.db.insert(executorProfiles).values({
      code: `CP07-${suffix}`,
      displayName: 'CP07 Executor',
      userId: executor.id,
    });
    await client.db
      .insert(executorCategoryCapabilities)
      .values({ categoryId: category.id, executorUserId: executor.id });
    const [address] = await client.db
      .insert(addresses)
      .values({ line1: 'CP07 test address', serviceAreaId: area.id })
      .returning({ id: addresses.id });
    if (!address) throw new Error('Address missing');
    const [request] = await client.db
      .insert(serviceRequests)
      .values({
        addressId: address.id,
        categoryId: category.id,
        description: 'CP07 notification request',
        requesterUserId: resident.id,
        sourceId: source.id,
        ticketNumber: `REQ-CP07-${suffix}`,
      })
      .returning({ ticketNumber: serviceRequests.ticketNumber });
    if (!request) throw new Error('Request missing');
    const loaded = await new PostgresPrincipalProvider(client.db).load(staff.id);
    if (!loaded) throw new Error('Operator principal missing');
    operator = loaded;
    await new TransitionRequestService(new PostgresRequestRepository(client.db)).execute(
      { data: {}, ticketNumber: request.ticketNumber, to: 'VALIDATING' },
      operator,
    );

    overdueOrderNumber = `ORD-CP07-LATE-${suffix}`;
    const [overdueOrder, completedOrder] = await client.db
      .insert(orders)
      .values([
        {
          categoryId: category.id,
          currentExecutorUserId: executor.id,
          dueAt: new Date('2026-07-27T08:00:00Z'),
          orderNumber: overdueOrderNumber,
          serviceAreaId: area.id,
          status: 'IN_PROGRESS',
        },
        {
          categoryId: category.id,
          completedAt: new Date('2026-07-26T08:00:00Z'),
          currentExecutorUserId: executor.id,
          orderNumber: `ORD-CP07-DONE-${suffix}`,
          serviceAreaId: area.id,
          status: 'COMPLETED',
        },
      ])
      .returning({ id: orders.id, orderNumber: orders.orderNumber });
    if (!overdueOrder || !completedOrder) throw new Error('Orders missing');
    const [linkedRequest] = await client.db
      .select({ id: serviceRequests.id })
      .from(serviceRequests)
      .where(eq(serviceRequests.ticketNumber, request.ticketNumber));
    if (!linkedRequest) throw new Error('Request link missing');
    await client.db
      .insert(orderRequestLinks)
      .values({ orderId: completedOrder.id, requestId: linkedRequest.id });
    await client.db.insert(qualityComplaints).values({
      code: `CMP-CP07-${suffix}`,
      orderId: completedOrder.id,
      reason: 'CP07 complaint review deadline test',
      requesterUserId: resident.id,
      reviewDueAt: new Date('2026-07-27T09:00:00Z'),
      withinWarranty: true,
    });
  }, 60_000);

  afterAll(async () => client.close());

  it('stores lifecycle notification intent in the same transaction', async () => {
    const rows = await client.db
      .select({ eventType: notificationOutbox.eventType, status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.recipientUserId, residentUserId));
    expect(rows).toContainEqual({ eventType: 'resident.status_changed', status: 'PENDING' });
  });

  it('automates deadline escalation and complaint alerts idempotently', async () => {
    const automation = new PostgresAutomationRepository(client.db);
    const first = await automation.scan(new Date('2026-07-27T10:00:00Z'));
    const second = await automation.scan(new Date('2026-07-27T10:01:00Z'));
    expect(first).toMatchObject({ skipped: false });
    expect(first.deadlineAlerts).toBeGreaterThan(0);
    expect(first.complaintAlerts).toBeGreaterThan(0);
    expect(second).toMatchObject({ complaintAlerts: 0, deadlineAlerts: 0, skipped: false });
    const escalations = await client.db
      .select()
      .from(orderEscalations)
      .innerJoin(orders, eq(orders.id, orderEscalations.orderId))
      .where(eq(orders.orderNumber, overdueOrderNumber));
    expect(escalations).toHaveLength(1);
  });

  it('claims without duplication and records delivery attempts', async () => {
    const first = new PostgresNotificationRepository(client.db);
    const second = new PostgresNotificationRepository(client.db);
    const now = new Date(Date.now() + 60_000);
    const [a, b] = await Promise.all([
      first.claimBatch('worker-a', now, 50, 120),
      second.claimBatch('worker-b', now, 50, 120),
    ]);
    const ids = [...a, ...b].map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
    for (const notification of a) await first.markDelivered(notification, 'worker-a', now, '1');
    for (const notification of b) await second.markDelivered(notification, 'worker-b', now, '1');
    const attempts = await client.db.select().from(notificationDeliveryAttempts);
    expect(attempts.length).toBeGreaterThanOrEqual(ids.length);
  });

  it('dead-letters permanent failures and supports scoped recovery', async () => {
    await client.db.insert(notificationOutbox).values({
      audience: 'RESIDENT',
      code: `NTF-CP07-${suffix}`,
      deduplicationKey: `cp07:permanent:${suffix}`,
      eventType: 'resident.status_changed',
      maxAttempts: 1,
      payload: {
        reference: `REQ-CP07-${suffix}`,
        status: 'VALIDATING',
        templateKey: 'resident.status_changed',
      },
      recipientUserId: residentUserId,
      serviceAreaId: areaId,
    });
    const repository = new PostgresNotificationRepository(client.db);
    const service = new NotificationService(
      repository,
      {
        send: (): Promise<never> =>
          Promise.reject(new NotificationDeliveryError('TELEGRAM_403', false)),
      },
      () => new Date(Date.now() + 60_000),
    );
    const result = await service.processBatch('worker-dead');
    expect(result.deadLettered).toBe(1);
    await expect(service.listDeadLetters(operator)).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ code: `NTF-CP07-${suffix}` })]),
    );
    await service.recover(`NTF-CP07-${suffix}`, operator);
    const [recovered] = await client.db
      .select({ attemptCount: notificationOutbox.attemptCount, status: notificationOutbox.status })
      .from(notificationOutbox)
      .where(eq(notificationOutbox.code, `NTF-CP07-${suffix}`));
    expect(recovered).toEqual({ attemptCount: 0, status: 'PENDING' });
    const recoveryAudit = await client.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(eq(auditLogs.action, 'notification.dead_letter_recovered'));
    expect(recoveryAudit.length).toBeGreaterThan(0);
  });

  it('acknowledges and resolves overdue escalation with audit-backed authorization', async () => {
    const execution = new ExecutionService(
      new PostgresExecutionRepository(client.db),
      new TransitionOrderService(
        new PostgresOrderRepository(client.db),
        new PostgresExecutorEligibility(client.db),
      ),
      () => new Date('2026-07-27T10:15:00Z'),
    );
    await expect(
      execution.updateDeadlineEscalation(overdueOrderNumber, 'ACKNOWLEDGED', operator),
    ).resolves.toMatchObject({ status: 'ACKNOWLEDGED' });
    await expect(
      execution.updateDeadlineEscalation(overdueOrderNumber, 'RESOLVED', operator),
    ).rejects.toMatchObject({ code: 'ESCALATION_CAUSE_ACTIVE' });
    await client.db
      .update(orders)
      .set({ status: 'AWAITING_ACCEPTANCE' })
      .where(eq(orders.orderNumber, overdueOrderNumber));
    await expect(
      execution.updateDeadlineEscalation(overdueOrderNumber, 'RESOLVED', operator),
    ).resolves.toMatchObject({ status: 'RESOLVED' });
    const [resolved] = await client.db
      .select({ status: orderEscalations.status })
      .from(orderEscalations)
      .innerJoin(orders, eq(orders.id, orderEscalations.orderId))
      .where(eq(orders.orderNumber, overdueOrderNumber));
    expect(resolved?.status).toBe('RESOLVED');
    expect(operatorUserId).toBe(operator.userId);
    expect(executorUserId).not.toBe(operator.userId);
  });
});
