/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { describe, expect, it, vi } from 'vitest';

import {
  StaffOperationsService,
  type StaffOperationDependencies,
} from '../src/application/triage/staff-operations-service.js';

function service() {
  const commercial = {
    acceptQuotation: vi.fn().mockResolvedValue({ code: 'QUO-1' }),
    configure: vi.fn().mockResolvedValue({
      billingType: 'FIXED_PRICE',
      revenueSourceCode: 'RESIDENT',
    }),
    document: vi.fn().mockResolvedValue({
      checksumSha256: 'a'.repeat(64),
      code: 'DOC-1',
      content: 'stored bilingual document',
    }),
    issueAcceptanceCertificate: vi.fn(),
    issueQuotation: vi.fn().mockResolvedValue({
      document: { code: 'DOC-1' },
      quotation: { code: 'QUO-1', totalAmount: 1_500_000n },
    }),
    recordContract: vi.fn(),
    recordExpense: vi.fn(),
    recordPayment: vi.fn(),
    summary: vi.fn().mockResolvedValue({
      certificateCodes: ['ACT-1'],
      contract: { code: 'CTR-1' },
      documentCodes: ['DOC-1'],
      expenseCodes: ['EXP-1'],
      paymentCodes: ['PAY-1'],
      profile: {
        billingType: 'FIXED_PRICE',
        revenueSourceCode: 'RESIDENT',
      },
      quotation: { code: 'QUO-1', status: 'ACCEPTED' },
      totals: {
        agreedRevenue: 1_500_000n,
        collectedAmount: 500_000n,
        collectionRateBasisPoints: 3333,
        expenseAmount: 800_000n,
        grossMargin: 700_000n,
        grossMarginRateBasisPoints: 4666,
        outstandingAmount: 1_000_000n,
      },
    }),
  };
  const dependencies = {
    commercial,
    principals: {
      loadByTelegramUserId: vi.fn().mockResolvedValue({ grants: [], userId: 'manager' }),
    },
  } as unknown as StaffOperationDependencies;
  return { commercial, operations: new StaffOperationsService(dependencies) };
}

describe('staff commercial operations', () => {
  it('renders an understandable Uzbek operational margin summary', async () => {
    const { operations } = service();
    const result = await operations.execute(1n, { kind: 'finance-summary', orderNumber: 'ORD-1' });
    expect(result).toContain('Kelishilgan tushum: 1 500 000 UZS');
    expect(result).toContain('Yalpi marja: 700 000 UZS (46.66%)');
    expect(result).toContain('soliq yoki buxgalteriya hisoboti emas');
  });

  it('renders the same finance facts in Russian', async () => {
    const { operations } = service();
    const result = await operations.execute(
      1n,
      { kind: 'finance-summary', orderNumber: 'ORD-1' },
      'ru',
    );
    expect(result).toContain('Согласованная выручка: 1 500 000 UZS');
    expect(result).toContain('Валовая маржа: 700 000 UZS (46.66%)');
  });

  it('returns stored commercial documents through the existing safe document result', async () => {
    const { operations } = service();
    await expect(
      operations.execute(1n, { code: 'DOC-1', kind: 'commercial-document' }),
    ).resolves.toEqual({
      caption: 'DOC-1 — SHA-256 aaaaaaaaaaaa…',
      content: 'stored bilingual document',
      fileName: 'doc-1.txt',
      kind: 'document',
    });
  });
});
