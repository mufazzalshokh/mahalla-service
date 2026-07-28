import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { roleCodes, rolePermissionMatrix } from '../src/domain/identity/role-permission-matrix.js';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../src/infrastructure/database/client.js';
import { runMigrations } from '../src/infrastructure/database/migration-runner.js';
import { permissions, rolePermissions, roles } from '../src/infrastructure/database/schema.js';
import { seedFoundation } from '../src/infrastructure/database/seed-runner.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('persisted authorization matrix', () => {
  let client: DatabaseClient;

  beforeAll(async () => {
    client = createDatabaseClient(databaseUrl as string);
    await runMigrations(client.db);
    await seedFoundation(client.db);
  }, 60_000);

  afterAll(async () => client.close());

  it('persists every approved role permission and no unapproved grant', async () => {
    const rows = await client.db
      .select({ permission: permissions.code, role: roles.code })
      .from(rolePermissions)
      .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId));

    for (const role of roleCodes) {
      expect(
        rows
          .filter((row) => row.role === role)
          .map((row) => row.permission)
          .sort(),
      ).toEqual([...rolePermissionMatrix[role]].sort());
    }
  });
});
