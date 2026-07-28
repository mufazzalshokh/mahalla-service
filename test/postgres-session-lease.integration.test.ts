import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createDatabaseClient,
  type DatabaseClient,
} from '../src/infrastructure/database/client.js';
import { tryAcquirePostgresSessionLease } from '../src/infrastructure/database/postgres-session-lease.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('PostgreSQL singleton session lease', () => {
  let first: DatabaseClient;
  let second: DatabaseClient;

  beforeAll(() => {
    first = createDatabaseClient(databaseUrl as string, 2);
    second = createDatabaseClient(databaseUrl as string, 2);
  });

  afterAll(async () => {
    await first.close();
    await second.close();
  });

  it('allows one bot consumer and releases ownership for recovery', async () => {
    const lockKey = 72_011_099n;
    const firstLease = await tryAcquirePostgresSessionLease(first.sql, lockKey);
    expect(firstLease).toBeDefined();
    await expect(tryAcquirePostgresSessionLease(second.sql, lockKey)).resolves.toBeUndefined();

    await firstLease?.close();
    const recovered = await tryAcquirePostgresSessionLease(second.sql, lockKey);
    expect(recovered).toBeDefined();
    await recovered?.close();
    await recovered?.close();
  });
});
