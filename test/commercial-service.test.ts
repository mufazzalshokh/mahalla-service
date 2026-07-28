/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, it, vi } from 'vitest';

import type { CommercialRepository } from '../src/application/commercial/commercial-repository.js';
import { CommercialService } from '../src/application/commercial/commercial-service.js';
import type { Principal } from '../src/domain/identity/permissions.js';

const now = new Date('2026-07-28T10:00:00Z');
const order = { id: 'order', orderNumber: 'ORD-1', serviceAreaId: 'area', status: 'REGISTERED' };

function repository(): CommercialRepository {
  return {
    acceptQuotation: vi.fn(),
    configureProfile: vi.fn().mockResolvedValue({
      billingType: 'FIXED_PRICE',
      contractRequired: false,
      currency: 'UZS',
      orderId: order.id,
      revenueSourceCode: 'RESIDENT',
    }),
    findDocument: vi.fn(),
    findOrder: vi.fn().mockResolvedValue(order),
    findQuotationOrder: vi.fn().mockResolvedValue(order),
    getSummary: vi.fn(),
    issueAcceptanceCertificate: vi.fn(),
    issueQuotation: vi.fn(),
    recordContract: vi.fn(),
    recordExpense: vi.fn(),
    recordPayment: vi.fn(),
  };
}

const manager: Principal = {
  grants: [
    { permission: 'finance.manage', serviceAreaId: 'area' },
    { permission: 'finance.read', serviceAreaId: 'area' },
    { permission: 'document.read', serviceAreaId: 'area' },
  ],
  userId: 'manager',
};

describe('commercial service', () => {
  it('enforces scoped finance permissions in the backend', async () => {
    const service = new CommercialService(repository(), () => now);
    await expect(
      service.configure(
        'ORD-1',
        { billingType: 'FIXED_PRICE', contractRequired: false, revenueSourceCode: 'RESIDENT' },
        { grants: [], userId: 'unknown' },
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('prevents contradictory no-charge contract configuration', async () => {
    const service = new CommercialService(repository(), () => now);
    await expect(
      service.configure(
        'ORD-1',
        { billingType: 'NO_CHARGE', contractRequired: true, revenueSourceCode: 'SOCIAL_FUNDING' },
        manager,
      ),
    ).rejects.toMatchObject({ code: 'COMMERCIAL_CONTRACT_INVALID' });
  });

  it('validates exact quotation money and future validity before persistence', async () => {
    const repo = repository();
    const service = new CommercialService(repo, () => now);
    await expect(
      service.issueQuotation(
        'ORD-1',
        {
          laborAmount: 0n,
          materialAmount: 0n,
          otherAmount: 0n,
          scope: 'Repair pipe',
          validUntil: new Date('2026-08-01T18:59:00Z'),
        },
        manager,
      ),
    ).rejects.toMatchObject({ code: 'COMMERCIAL_AMOUNT_INVALID' });
    expect(repo.issueQuotation).not.toHaveBeenCalled();
  });

  it('rejects future-dated manual payments', async () => {
    const repo = repository();
    const service = new CommercialService(repo, () => now);
    await expect(
      service.recordPayment(
        'ORD-1',
        {
          amount: 100_000n,
          method: 'CASH',
          paidAt: new Date('2026-07-29T00:00:00Z'),
          proofReference: 'Receipt 1',
        },
        manager,
      ),
    ).rejects.toMatchObject({ code: 'COMMERCIAL_DATE_INVALID' });
    expect(repo.recordPayment).not.toHaveBeenCalled();
  });

  it('checks document scope independently from finance access', async () => {
    const repo = repository();
    vi.mocked(repo.findDocument).mockResolvedValue({
      checksumSha256: 'a'.repeat(64),
      code: 'DOC-1',
      content: 'stored document content',
      createdAt: now,
      kind: 'QUOTATION',
      orderNumber: 'ORD-1',
      serviceAreaId: 'other-area',
    });
    await expect(
      new CommercialService(repo, () => now).document('DOC-1', manager),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
