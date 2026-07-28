import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CommercialService } from '../src/application/commercial/commercial-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';
import {
  createDatabaseClient,
  type DatabaseClient,
} from '../src/infrastructure/database/client.js';
import { runMigrations } from '../src/infrastructure/database/migration-runner.js';
import {
  auditLogs,
  commercialDocuments,
  orderAcceptances,
  orders,
  roles,
  serviceAreas,
  serviceCategories,
  userRoles,
  users,
} from '../src/infrastructure/database/schema.js';
import { seedFoundation } from '../src/infrastructure/database/seed-runner.js';
import { PostgresPrincipalProvider } from '../src/infrastructure/identity/postgres-principal-provider.js';
import { PostgresCommercialRepository } from '../src/infrastructure/commercial/postgres-commercial-repository.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const fixedNow = new Date('2026-07-28T10:00:00Z');

describe.runIf(Boolean(databaseUrl))('CP-09 commercial persistence', () => {
  let client: DatabaseClient;
  let manager: Principal;
  let managerUserId: string;
  let orderId: string;
  let orderNumber: string;
  let service: CommercialService;

  beforeAll(async () => {
    client = createDatabaseClient(databaseUrl as string);
    await runMigrations(client.db);
    await runMigrations(client.db);
    await seedFoundation(client.db);
    await seedFoundation(client.db);

    const [[area], [category], [operatorRole]] = await Promise.all([
      client.db
        .select({ id: serviceAreas.id })
        .from(serviceAreas)
        .where(eq(serviceAreas.code, 'DEMO')),
      client.db
        .select({ id: serviceCategories.id })
        .from(serviceCategories)
        .where(eq(serviceCategories.code, 'PLUMBING')),
      client.db.select({ id: roles.id }).from(roles).where(eq(roles.code, 'operator_manager')),
    ]);
    if (!area || !category || !operatorRole) throw new Error('CP-09 seed incomplete');
    const [managerUser] = await client.db
      .insert(users)
      .values({ telegramUserId: BigInt(Date.now()) * 100n + 91n })
      .returning({ id: users.id });
    if (!managerUser) throw new Error('CP-09 manager missing');
    managerUserId = managerUser.id;
    await client.db.insert(userRoles).values({
      roleId: operatorRole.id,
      serviceAreaId: area.id,
      userId: managerUserId,
    });
    orderNumber = `CP09-${randomUUID().slice(0, 12).toUpperCase()}`;
    const [createdOrder] = await client.db
      .insert(orders)
      .values({
        categoryId: category.id,
        completedAt: fixedNow,
        completionSummary: 'Synthetic CP-09 work completed',
        orderNumber,
        serviceAreaId: area.id,
        status: 'COMPLETED',
        version: 1,
      })
      .returning({ id: orders.id });
    if (!createdOrder) throw new Error('CP-09 order missing');
    orderId = createdOrder.id;
    await client.db.insert(orderAcceptances).values({
      acceptedAt: fixedNow,
      actorUserId: managerUserId,
      orderId,
      orderVersion: 1,
      source: 'OPERATOR',
    });
    const loaded = await new PostgresPrincipalProvider(client.db).load(managerUserId);
    if (!loaded) throw new Error('CP-09 manager principal missing');
    manager = loaded;
    service = new CommercialService(new PostgresCommercialRepository(client.db), () => fixedNow);
  }, 60_000);

  afterAll(async () => client.close());

  it('persists the commercial lifecycle, exact profitability, documents, and audit', async () => {
    await expect(
      service.configure(
        orderNumber,
        { billingType: 'FIXED_PRICE', contractRequired: true, revenueSourceCode: 'RESIDENT' },
        manager,
      ),
    ).resolves.toMatchObject({ billingType: 'FIXED_PRICE', contractRequired: true });

    const issued = await service.issueQuotation(
      orderNumber,
      {
        laborAmount: 250_000n,
        materialAmount: 1_200_000n,
        otherAmount: 50_000n,
        scope: 'Replace the synthetic plumbing section and test the result',
        validUntil: new Date('2026-08-10T18:59:00Z'),
      },
      manager,
    );
    expect(issued.quotation).toMatchObject({ status: 'ISSUED', totalAmount: 1_500_000n });
    expect(issued.document).toMatchObject({ kind: 'QUOTATION' });
    expect(issued.document.checksumSha256).toMatch(/^[0-9a-f]{64}$/u);

    await expect(
      service.acceptQuotation(
        issued.quotation.code,
        'Resident approval recorded by phone on 28.07.2026',
        manager,
      ),
    ).resolves.toMatchObject({ status: 'ACCEPTED' });

    const recordedContract = await service.recordContract(
      orderNumber,
      `SYN-${randomUUID().slice(0, 12)}`,
      'Fixed scope and price; external paper signature is retained by the MCK',
      manager,
    );
    expect(recordedContract.document.kind).toBe('CONTRACT_REFERENCE');

    const certificate = await service.issueAcceptanceCertificate(
      orderNumber,
      'Work was inspected and operationally accepted',
      manager,
    );
    expect(certificate.document.content).toContain('АКТ ПРИЁМКИ');

    await service.recordExpense(
      orderNumber,
      {
        amount: 800_000n,
        category: 'MATERIAL',
        description: 'Synthetic pipe and fitting materials',
        incurredAt: new Date('2026-07-28T09:00:00Z'),
      },
      manager,
    );
    const payment = await service.recordPayment(
      orderNumber,
      {
        amount: 500_000n,
        method: 'CASH',
        paidAt: new Date('2026-07-28T09:00:00Z'),
        proofReference: 'Synthetic cash register note 17',
      },
      manager,
    );
    expect(payment.document.content).toContain('не фискальный чек');
    await expect(
      service.recordPayment(
        orderNumber,
        {
          amount: 1_100_000n,
          method: 'BANK_TRANSFER',
          paidAt: new Date('2026-07-28T09:30:00Z'),
          proofReference: 'Synthetic transfer overpayment',
        },
        manager,
      ),
    ).rejects.toMatchObject({ code: 'COMMERCIAL_OVERPAYMENT' });

    const summary = await service.summary(orderNumber, manager);
    expect(summary.totals).toMatchObject({
      agreedRevenue: 1_500_000n,
      collectedAmount: 500_000n,
      collectionRateBasisPoints: 3333,
      expenseAmount: 800_000n,
      grossMargin: 700_000n,
      grossMarginRateBasisPoints: 4666,
      outstandingAmount: 1_000_000n,
    });
    expect(summary.documentCodes).toHaveLength(4);
    const originalDocument = await service.document(summary.documentCodes[0] ?? '', manager);
    expect(originalDocument).toMatchObject({ orderNumber });

    const [storedDocument] = await client.db
      .select({ id: commercialDocuments.id })
      .from(commercialDocuments)
      .where(eq(commercialDocuments.orderId, orderId))
      .limit(1);
    if (!storedDocument) throw new Error('CP-09 stored document missing');
    await expect(
      client.db
        .update(commercialDocuments)
        .set({ content: 'tampered commercial document content' })
        .where(eq(commercialDocuments.id, storedDocument.id)),
    ).rejects.toThrow();
    const [unchangedDocument] = await client.db
      .select({ content: commercialDocuments.content })
      .from(commercialDocuments)
      .where(eq(commercialDocuments.id, storedDocument.id));
    expect(unchangedDocument?.content).toBe(originalDocument.content);

    const audited = await client.db
      .select({ action: auditLogs.action })
      .from(auditLogs)
      .where(
        inArray(auditLogs.action, [
          'commercial.profile_configured',
          'commercial.quotation_issued',
          'commercial.quotation_accepted',
          'commercial.contract_recorded',
          'commercial.acceptance_certificate_issued',
          'commercial.payment_recorded',
          'commercial.expense_recorded',
        ]),
      );
    expect(new Set(audited.map(({ action }) => action)).size).toBe(7);
  });
});
