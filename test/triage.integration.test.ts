import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { TransitionRequestService } from '../src/application/requests/transition-request-service.js';
import {
  AssessPriorityService,
  DecideDuplicateService,
  ListValidationQueueService,
  OverridePriorityService,
  RegisterRequestAsOrderService,
  SuggestDuplicatesService,
} from '../src/application/triage/triage-services.js';
import type { Principal } from '../src/domain/identity/permissions.js';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../src/infrastructure/database/client.js';
import { runMigrations } from '../src/infrastructure/database/migration-runner.js';
import {
  addresses,
  auditLogs,
  orderRequestLinks,
  orders,
  requestInformationMessages,
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
import { PostgresPrincipalProvider } from '../src/infrastructure/identity/postgres-principal-provider.js';
import { PostgresRequestRepository } from '../src/infrastructure/requests/postgres-request-repository.js';
import { PostgresTriageRepository } from '../src/infrastructure/triage/postgres-triage-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;

describe.runIf(Boolean(databaseUrl))('CP-04 PostgreSQL validation and triage', () => {
  let client: DatabaseClient;
  let areaId: string;
  let categoryId: string;
  let sourceId: string;
  let operator: Principal;
  let resident: Principal;
  let transitions: TransitionRequestService;
  let assess: AssessPriorityService;
  let duplicates: SuggestDuplicatesService;
  let decideDuplicate: DecideDuplicateService;
  let override: OverridePriorityService;
  let register: RegisterRequestAsOrderService;
  let queue: ListValidationQueueService;

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
    const [source] = await client.db
      .select({ id: requestSources.id })
      .from(requestSources)
      .where(eq(requestSources.code, 'TELEGRAM'));
    const [operatorRole] = await client.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.code, 'operator_manager'));
    if (!area || !category || !source || !operatorRole) throw new Error('Seed is incomplete');
    areaId = area.id;
    categoryId = category.id;
    sourceId = source.id;

    const [operatorUser, residentUser] = await client.db
      .insert(users)
      .values([
        { status: 'ACTIVE', telegramUserId: BigInt(Date.now()) * 10n + 1n },
        { status: 'ACTIVE', telegramUserId: BigInt(Date.now()) * 10n + 2n },
      ])
      .returning({ id: users.id });
    if (!operatorUser || !residentUser) throw new Error('Users were not created');
    await client.db.insert(userRoles).values({
      roleId: operatorRole.id,
      serviceAreaId: areaId,
      userId: operatorUser.id,
    });
    await client.db.insert(residentProfiles).values({
      fullName: 'Ali Valiyev',
      language: 'uz-Latn',
      phone: '+998901234567',
      userId: residentUser.id,
    });
    const provider = new PostgresPrincipalProvider(client.db);
    const loadedOperator = await provider.load(operatorUser.id);
    const loadedResident = await provider.load(residentUser.id);
    if (!loadedOperator || !loadedResident) throw new Error('Principals were not loaded');
    operator = loadedOperator;
    resident = loadedResident;

    const triageRepository = new PostgresTriageRepository(client.db);
    transitions = new TransitionRequestService(new PostgresRequestRepository(client.db));
    assess = new AssessPriorityService(triageRepository);
    duplicates = new SuggestDuplicatesService(triageRepository);
    decideDuplicate = new DecideDuplicateService(triageRepository);
    override = new OverridePriorityService(triageRepository);
    register = new RegisterRequestAsOrderService(triageRepository);
    queue = new ListValidationQueueService(triageRepository);
  }, 60_000);

  afterAll(async () => client.close());

  async function createRequest(
    description = 'Yerto‘lada suv quvuri yorilgan',
  ): Promise<{ id: string; ticketNumber: string }> {
    const [address] = await client.db
      .insert(addresses)
      .values({
        latitude: '41.311100',
        line1: 'Amir Temur ko‘chasi 10-uy',
        longitude: '69.279100',
        serviceAreaId: areaId,
      })
      .returning({ id: addresses.id });
    if (!address) throw new Error('Address was not created');
    const ticketNumber = `T-${randomUUID().slice(0, 20)}`;
    const [request] = await client.db
      .insert(serviceRequests)
      .values({
        addressId: address.id,
        categoryId,
        description,
        preferredVisitEnd: new Date('2026-07-28T09:00:00.000Z'),
        preferredVisitStart: new Date('2026-07-28T08:00:00.000Z'),
        requesterUserId: resident.userId,
        residentDeclaredUrgency: 'IMPORTANT',
        sourceId,
        ticketNumber,
      })
      .returning({ id: serviceRequests.id });
    if (!request) throw new Error('Request was not created');
    return { id: request.id, ticketNumber };
  }

  it('returns area-authorized resident and preferred-visit details', async () => {
    const request = await createRequest('Oshxonadagi quvurdan suv oqmoqda');
    await expect(queue.details(request.ticketNumber, operator)).resolves.toMatchObject({
      fullName: 'Ali Valiyev',
      phone: '+998901234567',
      preferredVisitStart: new Date('2026-07-28T08:00:00.000Z'),
      residentDeclaredUrgency: 'IMPORTANT',
    });
    await expect(queue.details(request.ticketNumber, resident)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  async function validateAndAssess(ticketNumber: string): Promise<void> {
    await transitions.execute({ data: {}, ticketNumber, to: 'VALIDATING' }, operator);
    await assess.execute(
      ticketNumber,
      { RESIDENTS_AFFECTED: 4, SAFETY_RISK: 5, SOCIAL_IMPACT: 3, URGENCY: 4 },
      operator,
    );
  }

  it('records missing-information dialogue, deterministic priority and reasoned override', async () => {
    const request = await createRequest();
    await transitions.execute(
      { data: {}, ticketNumber: request.ticketNumber, to: 'VALIDATING' },
      operator,
    );
    await transitions.execute(
      {
        data: { informationRequest: 'Qaysi kirish va qavat?' },
        ticketNumber: request.ticketNumber,
        to: 'NEEDS_INFORMATION',
      },
      operator,
    );
    await transitions.execute(
      {
        data: { providedInformation: 'Ikkinchi kirish, yerto‘la.' },
        ticketNumber: request.ticketNumber,
        to: 'VALIDATING',
      },
      resident,
    );
    const assessment = await assess.execute(
      request.ticketNumber,
      { RESIDENTS_AFFECTED: 4, SAFETY_RISK: 5, SOCIAL_IMPACT: 3, URGENCY: 4 },
      operator,
    );
    expect(assessment.explanation).toContain('SOURCE_CONFIDENCE=4');
    const overridden = await override.execute(
      request.ticketNumber,
      95,
      'URGENT',
      'Operator verified an immediate electrical safety risk',
      operator,
    );
    expect(overridden).toMatchObject({ effectiveBand: 'URGENT', effectiveScore: 95 });
    await expect(
      client.db
        .select()
        .from(requestInformationMessages)
        .where(eq(requestInformationMessages.requestId, request.id)),
    ).resolves.toHaveLength(2);
    const audit = await client.db
      .select({ action: auditLogs.action, reason: auditLogs.reason })
      .from(auditLogs)
      .where(eq(auditLogs.entityId, request.id));
    expect(audit.map(({ action }) => action)).toContain('request.priority_overridden');
    expect(audit.find(({ action }) => action === 'request.priority_overridden')?.reason).toContain(
      'safety',
    );
  });

  it('keeps duplicate requests separate and links confirmed matches to one order', async () => {
    const first = await createRequest();
    const second = await createRequest();
    await validateAndAssess(first.ticketNumber);
    await validateAndAssess(second.ticketNumber);
    await override.execute(
      second.ticketNumber,
      99,
      'URGENT',
      'Confirmed wider safety impact across multiple households',
      operator,
    );
    const suggestions = await duplicates.execute(first.ticketNumber, operator);
    expect(suggestions.map(({ candidateTicketNumber }) => candidateTicketNumber)).toContain(
      second.ticketNumber,
    );
    await decideDuplicate.execute(first.ticketNumber, second.ticketNumber, 'CONFIRMED', operator);
    const firstOrder = await register.execute(first.ticketNumber, operator);
    const secondOrder = await register.execute(second.ticketNumber, operator);
    expect(secondOrder).toMatchObject({
      linkedToExistingOrder: true,
      orderId: firstOrder.orderId,
    });
    const links = await client.db
      .select()
      .from(orderRequestLinks)
      .where(eq(orderRequestLinks.orderId, firstOrder.orderId));
    expect(links).toHaveLength(2);
    const [portfolioOrder] = await client.db
      .select({ priorityScore: orders.priorityScore })
      .from(orders)
      .where(eq(orders.id, firstOrder.orderId));
    expect(Number(portfolioOrder?.priorityScore)).toBe(99);
  });

  it('serializes concurrent registration and creates one request-order link', async () => {
    const request = await createRequest('Ko‘chadagi suv quvuri yorilgan');
    await validateAndAssess(request.ticketNumber);
    const outcomes = await Promise.allSettled([
      register.execute(request.ticketNumber, operator),
      register.execute(request.ticketNumber, operator),
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const links = await client.db
      .select()
      .from(orderRequestLinks)
      .where(eq(orderRequestLinks.requestId, request.id));
    expect(links).toHaveLength(1);
  });

  it('enforces persisted area scope', async () => {
    const request = await createRequest();
    const wrongScope: Principal = {
      grants: [{ permission: 'request.validate', serviceAreaId: randomUUID() }],
      userId: operator.userId,
    };
    await expect(
      transitions.execute(
        { data: {}, ticketNumber: request.ticketNumber, to: 'VALIDATING' },
        wrongScope,
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const [unchanged] = await client.db
      .select({ status: serviceRequests.status })
      .from(serviceRequests)
      .where(and(eq(serviceRequests.id, request.id), eq(serviceRequests.status, 'RECEIVED')));
    expect(unchanged).toBeTruthy();
  });
});
