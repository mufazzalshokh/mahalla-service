import { DomainRuleError } from '../shared/domain-errors.js';

export const billingTypes = ['NO_CHARGE', 'FIXED_PRICE'] as const;
export type BillingType = (typeof billingTypes)[number];

export const revenueSourceCodes = [
  'RESIDENT',
  'ORGANIZATION',
  'GRANT',
  'SOCIAL_FUNDING',
  'ADDITIONAL_SERVICE',
] as const;
export type RevenueSourceCode = (typeof revenueSourceCodes)[number];

export const paymentMethods = ['CASH', 'BANK_TRANSFER', 'OTHER'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

export const expenseCategories = ['LABOR', 'MATERIAL', 'TRANSPORT', 'OTHER'] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];

const maximumPilotAmount = 9_000_000_000_000_000n;

export interface QuotationAmounts {
  readonly laborAmount: bigint;
  readonly materialAmount: bigint;
  readonly otherAmount: bigint;
}

export interface CommercialTotals {
  readonly agreedRevenue: bigint | null;
  readonly collectedAmount: bigint;
  readonly collectionRateBasisPoints: number | null;
  readonly expenseAmount: bigint;
  readonly grossMargin: bigint | null;
  readonly grossMarginRateBasisPoints: number | null;
  readonly outstandingAmount: bigint | null;
}

function assertMoney(value: bigint, field: string, allowZero: boolean): void {
  if ((allowZero ? value < 0n : value <= 0n) || value > maximumPilotAmount) {
    throw new DomainRuleError(
      'COMMERCIAL_AMOUNT_INVALID',
      `${field} must be ${allowZero ? 'zero or a positive' : 'a positive'} whole UZS amount`,
    );
  }
}

export function quotationTotal(amounts: QuotationAmounts): bigint {
  assertMoney(amounts.laborAmount, 'laborAmount', true);
  assertMoney(amounts.materialAmount, 'materialAmount', true);
  assertMoney(amounts.otherAmount, 'otherAmount', true);
  const total = amounts.laborAmount + amounts.materialAmount + amounts.otherAmount;
  assertMoney(total, 'quotationTotal', false);
  return total;
}

export function assertPositiveMoney(value: bigint, field: string): void {
  assertMoney(value, field, false);
}

export function assertCommercialText(
  value: string,
  field: string,
  minimum: number,
  maximum: number,
): string {
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new DomainRuleError(
      'COMMERCIAL_TEXT_INVALID',
      `${field} must contain between ${minimum} and ${maximum} characters`,
    );
  }
  return normalized;
}

export function assertValidFutureDate(value: Date, now: Date, field: string): void {
  if (Number.isNaN(value.valueOf()) || value <= now) {
    throw new DomainRuleError('COMMERCIAL_DATE_INVALID', `${field} must be a future date`);
  }
}

export function assertValidPastOrPresentDate(value: Date, now: Date, field: string): void {
  if (Number.isNaN(value.valueOf()) || value > now) {
    throw new DomainRuleError('COMMERCIAL_DATE_INVALID', `${field} cannot be in the future`);
  }
}

export function calculateCommercialTotals(input: {
  readonly agreedRevenue: bigint | null;
  readonly collectedAmount: bigint;
  readonly expenseAmount: bigint;
}): CommercialTotals {
  assertMoney(input.collectedAmount, 'collectedAmount', true);
  assertMoney(input.expenseAmount, 'expenseAmount', true);
  if (input.agreedRevenue === null) {
    return {
      agreedRevenue: null,
      collectedAmount: input.collectedAmount,
      collectionRateBasisPoints: null,
      expenseAmount: input.expenseAmount,
      grossMargin: null,
      grossMarginRateBasisPoints: null,
      outstandingAmount: null,
    };
  }
  assertMoney(input.agreedRevenue, 'agreedRevenue', false);
  const grossMargin = input.agreedRevenue - input.expenseAmount;
  return {
    agreedRevenue: input.agreedRevenue,
    collectedAmount: input.collectedAmount,
    collectionRateBasisPoints: Number((input.collectedAmount * 10_000n) / input.agreedRevenue),
    expenseAmount: input.expenseAmount,
    grossMargin,
    grossMarginRateBasisPoints: Number((grossMargin * 10_000n) / input.agreedRevenue),
    outstandingAmount: input.agreedRevenue - input.collectedAmount,
  };
}

export function formatUzs(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const digits = (value < 0n ? -value : value).toString();
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/gu, ' ')} UZS`;
}

export function formatBasisPoints(value: number | null): string {
  if (value === null) return '—';
  return `${(value / 100).toFixed(2)}%`;
}
