import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PostgresDependency } from '../src/infrastructure/database/postgres-readiness.js';
import { createPostgresDependency } from '../src/infrastructure/database/postgres-readiness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('PostgreSQL readiness integration', () => {
  let database: PostgresDependency;

  beforeAll(() => {
    database = createPostgresDependency(databaseUrl as string);
  });

  afterAll(async () => database.close());

  it('executes a real readiness query', async () => {
    await expect(database.probe.check()).resolves.toBeUndefined();
  });
});
