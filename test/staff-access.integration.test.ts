import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { StaffAccessService } from '../src/application/identity/staff-access-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../src/infrastructure/database/client.js';
import {
  auditLogs,
  executorCategoryCapabilities,
  executorProfiles,
  roles,
  serviceAreas,
  staffProfiles,
  userRoles,
  users,
} from '../src/infrastructure/database/schema.js';
import { runMigrations } from '../src/infrastructure/database/migration-runner.js';
import { seedFoundation } from '../src/infrastructure/database/seed-runner.js';
import { PostgresPrincipalProvider } from '../src/infrastructure/identity/postgres-principal-provider.js';
import { PostgresStaffAccessRepository } from '../src/infrastructure/identity/postgres-staff-access-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('staff access persistence and authorization', () => {
  let client: DatabaseClient;
  let admin: Principal;
  let service: StaffAccessService;

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
    const [administrator] = await client.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, 'administrator'));
    if (!area || !administrator) throw new Error('Staff access seed is incomplete');
    const [owner] = await client.db
      .insert(users)
      .values({ telegramUserId: 9_000_000_001n })
      .returning({ id: users.id });
    if (!owner) throw new Error('Owner was not created');
    await client.db.insert(userRoles).values({
      roleId: administrator.id,
      serviceAreaId: area.id,
      userId: owner.id,
    });
    const provider = new PostgresPrincipalProvider(client.db);
    const loaded = await provider.load(owner.id);
    if (!loaded) throw new Error('Administrator principal was not loaded');
    admin = loaded;
    service = new StaffAccessService(new PostgresStaffAccessRepository(client.db));
  }, 60_000);

  afterAll(async () => client.close());

  it('grants, changes, suspends and restores area-scoped operator access with audit', async () => {
    const granted = await service.grant(
      9_000_000_002n,
      'Operator One',
      'operator_manager',
      'DEMO',
      admin,
    );
    expect(granted).toMatchObject({ role: 'operator_manager', status: 'ACTIVE' });
    const provider = new PostgresPrincipalProvider(client.db);
    const activePrincipal = await provider.load(granted.userId);
    expect(activePrincipal?.grants.map(({ permission }) => permission)).toContain(
      'request.read.area',
    );

    const suspended = await service.suspend(granted.code, 'Employment ended', admin);
    expect(suspended.status).toBe('SUSPENDED');
    await expect(provider.load(granted.userId)).resolves.toMatchObject({ grants: [] });
    await expect(
      client.db.select({ status: users.status }).from(users).where(eq(users.id, granted.userId)),
    ).resolves.toEqual([{ status: 'ACTIVE' }]);

    await expect(service.restore(granted.code, admin)).resolves.toMatchObject({ status: 'ACTIVE' });
    const restoredPrincipal = await provider.load(granted.userId);
    expect(restoredPrincipal?.grants.map(({ permission }) => permission)).toContain(
      'request.read.area',
    );
    await expect(
      client.db.select().from(auditLogs).where(eq(auditLogs.entityId, granted.userId)),
    ).resolves.toHaveLength(3);
  });

  it('creates an assignable executor with every active pilot category', async () => {
    const executor = await service.grant(9_000_000_003n, 'Executor One', 'executor', 'DEMO', admin);
    await expect(
      client.db.select().from(executorProfiles).where(eq(executorProfiles.userId, executor.userId)),
    ).resolves.toMatchObject([{ code: executor.code, isAvailable: true }]);
    await expect(
      client.db
        .select()
        .from(executorCategoryCapabilities)
        .where(eq(executorCategoryCapabilities.executorUserId, executor.userId)),
    ).resolves.toHaveLength(4);
    await expect(service.list(admin)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: executor.code, role: 'executor', status: 'ACTIVE' }),
      ]),
    );
    await expect(
      client.db.select().from(staffProfiles).where(eq(staffProfiles.userId, executor.userId)),
    ).resolves.toHaveLength(1);
  });
});
