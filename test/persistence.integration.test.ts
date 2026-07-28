import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TransitionOrderService } from '../src/application/orders/transition-order-service.js';
import { ConcurrencyConflictError } from '../src/domain/shared/domain-errors.js';
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
  orders,
  orderStatusHistory,
  permissions,
  rolePermissions,
  roles,
  serviceAreas,
  serviceCategories,
  userRoles,
  users,
} from '../src/infrastructure/database/schema.js';
import { seedFoundation } from '../src/infrastructure/database/seed-runner.js';
import { PostgresPrincipalProvider } from '../src/infrastructure/identity/postgres-principal-provider.js';
import { PostgresExecutorEligibility } from '../src/infrastructure/orders/postgres-executor-eligibility.js';
import { PostgresOrderRepository } from '../src/infrastructure/orders/postgres-order-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const fixedNow = new Date(Date.now() + 60_000);
const futureDueAt = new Date(fixedNow.getTime() + 86_400_000);

describe.runIf(Boolean(databaseUrl))('CP-02 PostgreSQL persistence', () => {
  let client: DatabaseClient;
  let areaId: string;
  let categoryId: string;
  let executorUserId: string;
  let operatorUserId: string;

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
    if (!area || !category || !operatorRole || !executorRole) {
      throw new Error('Foundation seed did not create required reference data');
    }
    areaId = area.id;
    categoryId = category.id;

    const [operator, executor] = await client.db
      .insert(users)
      .values([{ status: 'ACTIVE' }, { status: 'ACTIVE' }])
      .returning({ id: users.id });
    if (!operator || !executor) throw new Error('Test users were not created');
    operatorUserId = operator.id;
    executorUserId = executor.id;

    await client.db.insert(userRoles).values([
      {
        roleId: operatorRole.id,
        serviceAreaId: areaId,
        userId: operatorUserId,
      },
      {
        roleId: executorRole.id,
        serviceAreaId: areaId,
        userId: executorUserId,
      },
    ]);
    await client.db.insert(executorProfiles).values({
      code: `EXEC-${executorUserId.slice(0, 8)}`,
      displayName: 'Integration executor',
      userId: executorUserId,
    });
    await client.db.insert(executorCategoryCapabilities).values({
      categoryId,
      executorUserId,
    });
  }, 60_000);

  afterAll(async () => client.close());

  async function createOrder(): Promise<string> {
    const [order] = await client.db
      .insert(orders)
      .values({
        categoryId,
        orderNumber: `ORD-${randomUUID().slice(0, 20)}`,
        serviceAreaId: areaId,
      })
      .returning({ id: orders.id });
    if (!order) throw new Error('Test order was not created');
    return order.id;
  }

  async function createService(): Promise<{
    principal: NonNullable<Awaited<ReturnType<PostgresPrincipalProvider['load']>>>;
    service: TransitionOrderService;
  }> {
    const principalProvider = new PostgresPrincipalProvider(client.db);
    const principal = await principalProvider.load(operatorUserId);
    if (!principal) throw new Error('Operator principal was not loaded');
    return {
      principal,
      service: new TransitionOrderService(
        new PostgresOrderRepository(client.db),
        new PostgresExecutorEligibility(client.db),
        () => fixedNow,
      ),
    };
  }

  it('applies migrations and seed data repeatably', async () => {
    const permissionCount = await client.db
      .select({ count: sql<number>`count(*)::int` })
      .from(permissions);
    const roleCount = await client.db.select({ count: sql<number>`count(*)::int` }).from(roles);
    expect(permissionCount[0]?.count).toBeGreaterThanOrEqual(21);
    expect(roleCount[0]?.count).toBe(4);
    const residentPermissions = await client.db
      .select({ code: permissions.code })
      .from(roles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(roles.code, 'resident'));
    expect(residentPermissions.map(({ code }) => code)).not.toContain('quality.accept');
    expect(residentPermissions.map(({ code }) => code)).not.toContain('quality.require_rework');
  });

  it('loads persisted area-scoped grants and executor eligibility', async () => {
    const provider = new PostgresPrincipalProvider(client.db);
    const principal = await provider.load(operatorUserId);
    expect(principal?.grants).toContainEqual({
      permission: 'order.assign',
      serviceAreaId: areaId,
    });
    await expect(
      new PostgresExecutorEligibility(client.db).isEligible(executorUserId, areaId, categoryId),
    ).resolves.toBe(true);
    await expect(provider.load(randomUUID())).resolves.toBeUndefined();
    const [suspended] = await client.db
      .insert(users)
      .values({ status: 'SUSPENDED' })
      .returning({ id: users.id });
    if (!suspended) throw new Error('Suspended test user was not created');
    await expect(provider.load(suspended.id)).resolves.toBeUndefined();
  });

  it('commits order, history and audit atomically', async () => {
    const orderId = await createOrder();
    const { principal, service } = await createService();
    const updated = await service.execute(
      {
        data: {
          assigneeUserId: executorUserId,
          dueAt: futureDueAt,
        },
        expectedVersion: 0,
        orderId,
        requestId: 'integration-correlation',
        to: 'ASSIGNED',
      },
      principal,
    );

    expect(updated).toMatchObject({
      assignedExecutorUserId: executorUserId,
      status: 'ASSIGNED',
      version: 1,
    });
    await expect(
      client.db.select().from(orderStatusHistory).where(eq(orderStatusHistory.orderId, orderId)),
    ).resolves.toHaveLength(1);
    const audit = await client.db.select().from(auditLogs).where(eq(auditLogs.entityId, orderId));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: 'order.assigned',
      requestId: 'integration-correlation',
    });
  });

  it('allows exactly one writer for the same expected version', async () => {
    const orderId = await createOrder();
    const first = await createService();
    const second = await createService();
    const command = {
      data: {
        assigneeUserId: executorUserId,
        dueAt: futureDueAt,
      },
      expectedVersion: 0,
      orderId,
      to: 'ASSIGNED' as const,
    };

    const outcomes = await Promise.allSettled([
      first.service.execute(command, first.principal),
      second.service.execute(command, second.principal),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    const rejection = outcomes.find((outcome) => outcome.status === 'rejected');
    expect(rejection?.status).toBe('rejected');
    if (!rejection || rejection.status !== 'rejected') throw new Error('Expected one conflict');
    expect(rejection.reason).toBeInstanceOf(ConcurrencyConflictError);
  });

  it('enforces coordinate integrity and append-only audit records in PostgreSQL', async () => {
    await expect(
      client.db
        .insert(addresses)
        .values({ latitude: '41.311081', line1: 'Test', serviceAreaId: areaId }),
    ).rejects.toThrow();

    const [audit] = await client.db.select({ id: auditLogs.id }).from(auditLogs).limit(1);
    if (!audit) throw new Error('Expected an audit record from a prior transition');
    await expect(
      client.sql`update audit_logs set reason = 'tampered' where id = ${audit.id}`,
    ).rejects.toThrow(/append-only/);
  });
});
