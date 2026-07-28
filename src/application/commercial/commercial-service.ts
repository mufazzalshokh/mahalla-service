import {
  assertCommercialText,
  assertPositiveMoney,
  assertValidFutureDate,
  assertValidPastOrPresentDate,
  billingTypes,
  expenseCategories,
  paymentMethods,
  quotationTotal,
  revenueSourceCodes,
  type BillingType,
  type ExpenseCategory,
  type PaymentMethod,
  type QuotationAmounts,
  type RevenueSourceCode,
} from '../../domain/commercial/commercial-policy.js';
import { hasPermission, type Principal } from '../../domain/identity/permissions.js';
import {
  AuthorizationError,
  DomainRuleError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';
import type {
  AcceptanceCertificate,
  CommercialContract,
  CommercialExpense,
  CommercialOrder,
  CommercialOrderSummary,
  CommercialPayment,
  CommercialProfile,
  CommercialQuotation,
  CommercialRepository,
  StoredCommercialDocument,
} from './commercial-repository.js';

function assertKnown<T extends string>(
  value: string,
  allowed: readonly T[],
  field: string,
): asserts value is T {
  if (!allowed.includes(value as T)) {
    throw new DomainRuleError('COMMERCIAL_VALUE_INVALID', `${field}: ${allowed.join('|')}`);
  }
}

export class CommercialService {
  constructor(
    private readonly repository: CommercialRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async order(
    orderNumber: string,
    principal: Principal,
    permission: 'finance.manage' | 'finance.read',
  ): Promise<CommercialOrder> {
    const order = await this.repository.findOrder(orderNumber.trim().toUpperCase());
    if (!order) throw new EntityNotFoundError('Order', orderNumber);
    if (!hasPermission(principal, permission, order.serviceAreaId)) {
      throw new AuthorizationError(permission);
    }
    return order;
  }

  async configure(
    orderNumber: string,
    input: {
      readonly billingType: BillingType;
      readonly contractRequired: boolean;
      readonly revenueSourceCode: RevenueSourceCode;
    },
    principal: Principal,
  ): Promise<CommercialProfile> {
    const order = await this.order(orderNumber, principal, 'finance.manage');
    assertKnown(input.billingType, billingTypes, 'billingType');
    assertKnown(input.revenueSourceCode, revenueSourceCodes, 'revenueSourceCode');
    if (order.status === 'CANCELLED') {
      throw new DomainRuleError('COMMERCIAL_ORDER_CLOSED', 'Cancelled orders cannot be configured');
    }
    if (input.billingType === 'NO_CHARGE' && input.contractRequired) {
      throw new DomainRuleError(
        'COMMERCIAL_CONTRACT_INVALID',
        'A no-charge pilot order cannot require a commercial contract',
      );
    }
    return this.repository.configureProfile(order.id, input, principal.userId);
  }

  async issueQuotation(
    orderNumber: string,
    input: QuotationAmounts & { readonly scope: string; readonly validUntil: Date },
    principal: Principal,
  ): Promise<{
    readonly document: StoredCommercialDocument;
    readonly quotation: CommercialQuotation;
  }> {
    const order = await this.order(orderNumber, principal, 'finance.manage');
    quotationTotal(input);
    const scope = assertCommercialText(input.scope, 'scope', 3, 2000);
    assertValidFutureDate(input.validUntil, this.now(), 'validUntil');
    return this.repository.issueQuotation(order.id, { ...input, scope }, principal.userId);
  }

  async acceptQuotation(
    quotationCode: string,
    approvalReference: string,
    principal: Principal,
  ): Promise<CommercialQuotation> {
    const code = quotationCode.trim().toUpperCase();
    const order = await this.repository.findQuotationOrder(code);
    if (!order) throw new EntityNotFoundError('Quotation', code);
    if (!hasPermission(principal, 'finance.manage', order.serviceAreaId)) {
      throw new AuthorizationError('finance.manage');
    }
    return this.repository.acceptQuotation(
      code,
      assertCommercialText(approvalReference, 'approvalReference', 3, 500),
      principal.userId,
      this.now(),
    );
  }

  async recordContract(
    orderNumber: string,
    externalReference: string,
    termsSummary: string,
    principal: Principal,
  ): Promise<{
    readonly contract: CommercialContract;
    readonly document: StoredCommercialDocument;
  }> {
    const order = await this.order(orderNumber, principal, 'finance.manage');
    return this.repository.recordContract(
      order.id,
      assertCommercialText(externalReference, 'externalReference', 3, 200),
      assertCommercialText(termsSummary, 'termsSummary', 3, 2000),
      principal.userId,
    );
  }

  async issueAcceptanceCertificate(
    orderNumber: string,
    summary: string,
    principal: Principal,
  ): Promise<{
    readonly certificate: AcceptanceCertificate;
    readonly document: StoredCommercialDocument;
  }> {
    const order = await this.order(orderNumber, principal, 'finance.manage');
    return this.repository.issueAcceptanceCertificate(
      order.id,
      assertCommercialText(summary, 'summary', 3, 2000),
      principal.userId,
    );
  }

  async recordPayment(
    orderNumber: string,
    input: {
      readonly amount: bigint;
      readonly method: PaymentMethod;
      readonly paidAt: Date;
      readonly proofReference: string;
    },
    principal: Principal,
  ): Promise<{
    readonly document: StoredCommercialDocument;
    readonly payment: CommercialPayment;
  }> {
    const order = await this.order(orderNumber, principal, 'finance.manage');
    assertPositiveMoney(input.amount, 'amount');
    assertKnown(input.method, paymentMethods, 'method');
    assertValidPastOrPresentDate(input.paidAt, this.now(), 'paidAt');
    return this.repository.recordPayment(
      order.id,
      {
        ...input,
        proofReference: assertCommercialText(input.proofReference, 'proofReference', 3, 500),
      },
      principal.userId,
    );
  }

  async recordExpense(
    orderNumber: string,
    input: {
      readonly amount: bigint;
      readonly category: ExpenseCategory;
      readonly description: string;
      readonly incurredAt: Date;
    },
    principal: Principal,
  ): Promise<CommercialExpense> {
    const order = await this.order(orderNumber, principal, 'finance.manage');
    assertPositiveMoney(input.amount, 'amount');
    assertKnown(input.category, expenseCategories, 'category');
    assertValidPastOrPresentDate(input.incurredAt, this.now(), 'incurredAt');
    return this.repository.recordExpense(
      order.id,
      {
        ...input,
        description: assertCommercialText(input.description, 'description', 3, 1000),
      },
      principal.userId,
    );
  }

  async summary(orderNumber: string, principal: Principal): Promise<CommercialOrderSummary> {
    const order = await this.order(orderNumber, principal, 'finance.read');
    return this.repository.getSummary(order.id);
  }

  async document(code: string, principal: Principal): Promise<StoredCommercialDocument> {
    const normalized = code.trim().toUpperCase();
    const document = await this.repository.findDocument(normalized);
    if (!document) throw new EntityNotFoundError('Commercial document', normalized);
    if (!hasPermission(principal, 'document.read', document.serviceAreaId)) {
      throw new AuthorizationError('document.read');
    }
    return document;
  }
}
