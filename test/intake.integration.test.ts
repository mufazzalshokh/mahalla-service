import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HandleResidentUpdateService } from '../src/application/intake/handle-resident-update-service.js';
import type {
  IntakeResponse,
  ResidentUpdateInput,
} from '../src/application/intake/intake-types.js';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../src/infrastructure/database/client.js';
import { runMigrations } from '../src/infrastructure/database/migration-runner.js';
import {
  attachments,
  auditLogs,
  privacyConsents,
  requestStatusHistory,
  residentProfiles,
  serviceRequests,
  telegramIntakeSessions,
  telegramUpdateReceipts,
  users,
} from '../src/infrastructure/database/schema.js';
import { seedFoundation } from '../src/infrastructure/database/seed-runner.js';
import { PostgresResidentIntakeUnitOfWork } from '../src/infrastructure/intake/postgres-resident-intake-unit-of-work.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const runId = BigInt(Date.now());

describe.runIf(Boolean(databaseUrl))('CP-03 resident intake persistence', () => {
  let client: DatabaseClient;
  let service: HandleResidentUpdateService;

  beforeAll(async () => {
    client = createDatabaseClient(databaseUrl as string);
    await runMigrations(client.db);
    await runMigrations(client.db);
    await seedFoundation(client.db);
    await seedFoundation(client.db);
    service = new HandleResidentUpdateService(new PostgresResidentIntakeUnitOfWork(client.db));
  }, 60_000);

  afterAll(async () => client.close());

  async function execute(
    telegramUserId: bigint,
    updateId: bigint,
    input: ResidentUpdateInput,
  ): Promise<IntakeResponse> {
    return service.execute({ input, telegramUserId, updateId });
  }

  async function reachReview(
    telegramUserId: bigint,
    firstUpdateId: bigint,
    includePhoto = false,
  ): Promise<bigint> {
    let updateId = firstUpdateId;
    await execute(telegramUserId, updateId++, { kind: 'start' });
    await execute(telegramUserId, updateId++, { data: 'lang:uz-Latn', kind: 'callback' });
    await execute(telegramUserId, updateId++, { data: 'consent:accept', kind: 'callback' });
    const categories = await execute(telegramUserId, updateId++, {
      contactTelegramUserId: telegramUserId,
      kind: 'contact',
      phone: '+998901234567',
    });
    const category = categories.categories?.[0];
    if (!category) throw new Error('Seeded category was not returned');
    await execute(telegramUserId, updateId++, {
      data: `category:${category.id}`,
      kind: 'callback',
    });
    await execute(telegramUserId, updateId++, {
      kind: 'text',
      text: 'Kitchen water pipe is leaking badly',
    });
    await execute(telegramUserId, updateId++, {
      kind: 'location',
      latitude: 41.311081,
      longitude: 69.240562,
    });
    if (includePhoto) {
      await execute(telegramUserId, updateId++, {
        kind: 'photo',
        photo: {
          fileId: 'telegram-file-id',
          fileSize: 2_048,
          fileUniqueId: `unique-${telegramUserId}`,
        },
      });
    }
    await execute(telegramUserId, updateId++, { data: 'photos:done', kind: 'callback' });
    return updateId;
  }

  it('persists consent, profile, request, photo, initial history and audit exactly once', async () => {
    const telegramUserId = runId + 1n;
    const confirmUpdateId = await reachReview(telegramUserId, runId * 100n + 10_000n, true);
    const [submitted, replayed] = await Promise.all([
      execute(telegramUserId, confirmUpdateId, {
        data: 'submit:confirm',
        kind: 'callback',
      }),
      execute(telegramUserId, confirmUpdateId, {
        data: 'submit:confirm',
        kind: 'callback',
      }),
    ]);

    expect(replayed).toEqual(submitted);
    expect(submitted.parameters?.ticketNumber).toMatch(/^MCK-\d{4}-\d{8}$/);
    const [user] = await client.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramUserId, telegramUserId));
    if (!user) throw new Error('Resident user was not persisted');
    const requests = await client.db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.requesterUserId, user.id));
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (!request) throw new Error('Service request was not persisted');
    expect(request).toMatchObject({ status: 'RECEIVED', submissionUpdateId: confirmUpdateId });
    await expect(
      client.db.select().from(privacyConsents).where(eq(privacyConsents.userId, user.id)),
    ).resolves.toHaveLength(1);
    await expect(
      client.db.select().from(residentProfiles).where(eq(residentProfiles.userId, user.id)),
    ).resolves.toMatchObject([{ language: 'uz-Latn', phone: '+998901234567' }]);
    await expect(
      client.db.select().from(attachments).where(eq(attachments.requestId, request.id)),
    ).resolves.toHaveLength(1);
    await expect(
      client.db
        .select()
        .from(requestStatusHistory)
        .where(eq(requestStatusHistory.requestId, request.id)),
    ).resolves.toMatchObject([{ requestVersion: 0, transitionKey: 'SUBMITTED' }]);
    await expect(
      client.db.select().from(auditLogs).where(eq(auditLogs.entityId, request.id)),
    ).resolves.toMatchObject([{ action: 'request.submitted' }]);
    await expect(
      client.db
        .select()
        .from(telegramIntakeSessions)
        .where(eq(telegramIntakeSessions.userId, user.id)),
    ).resolves.toMatchObject([{ draft: { photos: [] }, step: 'SUBMITTED' }]);
  });

  it('serializes concurrent confirmations and creates one ticket', async () => {
    const telegramUserId = runId + 2n;
    const nextUpdateId = await reachReview(telegramUserId, runId * 100n + 20_000n);
    const outcomes = await Promise.all([
      execute(telegramUserId, nextUpdateId, { data: 'submit:confirm', kind: 'callback' }),
      execute(telegramUserId, nextUpdateId + 1n, { data: 'submit:confirm', kind: 'callback' }),
    ]);
    expect(outcomes.filter(({ key }) => key === 'submitted')).toHaveLength(1);

    const [user] = await client.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramUserId, telegramUserId));
    if (!user) throw new Error('Concurrent test user was not persisted');
    const [count] = await client.db
      .select({ value: sql<number>`count(*)::int` })
      .from(serviceRequests)
      .where(eq(serviceRequests.requesterUserId, user.id));
    expect(count?.value).toBe(1);
  });

  it('returns ticket status only to its owning Telegram user', async () => {
    const [request] = await client.db.select().from(serviceRequests).limit(1);
    if (!request) throw new Error('Expected a request from a prior intake test');
    const [owner] = await client.db
      .select({ telegramUserId: users.telegramUserId })
      .from(users)
      .where(eq(users.id, request.requesterUserId));
    if (!owner?.telegramUserId) throw new Error('Expected a Telegram request owner');

    await expect(
      execute(owner.telegramUserId, runId * 100n + 30_000n, {
        kind: 'status',
        ticketNumber: request.ticketNumber,
      }),
    ).resolves.toMatchObject({ key: 'status_result' });
    await expect(
      execute(runId + 999n, runId * 100n + 30_001n, {
        kind: 'status',
        ticketNumber: request.ticketNumber,
      }),
    ).resolves.toMatchObject({ key: 'ticket_not_found' });
  });

  it('stores one replayable response for every processed Telegram update', async () => {
    const [count] = await client.db
      .select({ value: sql<number>`count(*)::int` })
      .from(telegramUpdateReceipts);
    expect(count?.value).toBeGreaterThan(0);
    const [receipt] = await client.db.select().from(telegramUpdateReceipts).limit(1);
    expect(typeof receipt?.response.key).toBe('string');
    expect(typeof receipt?.response.language).toBe('string');
  });

  it('persists Russian selection and returns Russian category labels', async () => {
    const telegramUserId = runId + 3n;
    let updateId = runId * 100n + 40_000n;
    await execute(telegramUserId, updateId++, { kind: 'start' });
    const privacy = await execute(telegramUserId, updateId++, {
      data: 'lang:ru',
      kind: 'callback',
    });
    expect(privacy.language).toBe('ru');
    await execute(telegramUserId, updateId++, { data: 'consent:accept', kind: 'callback' });
    const categories = await execute(telegramUserId, updateId, {
      contactTelegramUserId: telegramUserId,
      kind: 'contact',
      phone: '+998901234568',
    });
    expect(categories.language).toBe('ru');
    expect(categories.categories?.map(({ label }) => label)).toEqual([
      'Сантехника',
      'Электрические услуги',
      'Ремонт',
      'Благоустройство',
    ]);
    const [user] = await client.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.telegramUserId, telegramUserId));
    if (!user) throw new Error('Russian resident user was not persisted');
    await expect(
      client.db.select().from(residentProfiles).where(eq(residentProfiles.userId, user.id)),
    ).resolves.toMatchObject([{ language: 'ru' }]);
  });
});
