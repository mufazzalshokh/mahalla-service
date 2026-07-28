import { describe, expect, it } from 'vitest';

import {
  calculateCommercialTotals,
  formatBasisPoints,
  formatUzs,
  quotationTotal,
} from '../src/domain/commercial/commercial-policy.js';

describe('commercial policy', () => {
  it('uses exact integer UZS arithmetic for quotation totals', () => {
    expect(
      quotationTotal({ laborAmount: 250_000n, materialAmount: 1_200_000n, otherAmount: 50_000n }),
    ).toBe(1_500_000n);
    expect(formatUzs(1_500_000n)).toBe('1 500 000 UZS');
  });

  it('calculates operational gross margin and collection without floating-point money', () => {
    const totals = calculateCommercialTotals({
      agreedRevenue: 2_000_000n,
      collectedAmount: 1_500_000n,
      expenseAmount: 1_200_000n,
    });
    expect(totals).toEqual({
      agreedRevenue: 2_000_000n,
      collectedAmount: 1_500_000n,
      collectionRateBasisPoints: 7500,
      expenseAmount: 1_200_000n,
      grossMargin: 800_000n,
      grossMarginRateBasisPoints: 4000,
      outstandingAmount: 500_000n,
    });
    expect(formatBasisPoints(totals.collectionRateBasisPoints)).toBe('75.00%');
  });

  it('marks profitability unavailable until revenue is agreed', () => {
    expect(
      calculateCommercialTotals({
        agreedRevenue: null,
        collectedAmount: 0n,
        expenseAmount: 100_000n,
      }),
    ).toMatchObject({ grossMargin: null, grossMarginRateBasisPoints: null });
  });

  it('rejects negative components and zero-total quotations', () => {
    expect(() => quotationTotal({ laborAmount: -1n, materialAmount: 1n, otherAmount: 0n })).toThrow(
      /laborAmount/u,
    );
    expect(() => quotationTotal({ laborAmount: 0n, materialAmount: 0n, otherAmount: 0n })).toThrow(
      /quotationTotal/u,
    );
  });
});
