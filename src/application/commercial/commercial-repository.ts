import type {
  BillingType,
  CommercialTotals,
  ExpenseCategory,
  PaymentMethod,
  QuotationAmounts,
  RevenueSourceCode,
} from '../../domain/commercial/commercial-policy.js';

export interface CommercialOrder {
  readonly id: string;
  readonly orderNumber: string;
  readonly serviceAreaId: string;
  readonly status: string;
}

export interface CommercialProfile {
  readonly billingType: BillingType;
  readonly contractRequired: boolean;
  readonly currency: 'UZS';
  readonly orderId: string;
  readonly revenueSourceCode: RevenueSourceCode;
}

export interface CommercialQuotation extends QuotationAmounts {
  readonly acceptedAt: Date | null;
  readonly approvalReference: string | null;
  readonly code: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly orderId: string;
  readonly scope: string;
  readonly status: 'ACCEPTED' | 'ISSUED' | 'REJECTED' | 'VOID';
  readonly totalAmount: bigint;
  readonly validUntil: Date;
}

export interface CommercialContract {
  readonly code: string;
  readonly createdAt: Date;
  readonly externalReference: string;
  readonly id: string;
  readonly orderId: string;
  readonly quotationId: string;
  readonly status: 'RECORDED' | 'VOID';
  readonly termsSummary: string;
}

export interface AcceptanceCertificate {
  readonly code: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly orderId: string;
  readonly status: 'ISSUED' | 'VOID';
  readonly summary: string;
}

export interface CommercialPayment {
  readonly amount: bigint;
  readonly code: string;
  readonly createdAt: Date;
  readonly id: string;
  readonly method: PaymentMethod;
  readonly orderId: string;
  readonly paidAt: Date;
  readonly proofReference: string;
  readonly status: 'CONFIRMED' | 'VOID';
}

export interface CommercialExpense {
  readonly amount: bigint;
  readonly category: ExpenseCategory;
  readonly code: string;
  readonly createdAt: Date;
  readonly description: string;
  readonly id: string;
  readonly incurredAt: Date;
  readonly orderId: string;
  readonly status: 'RECORDED' | 'VOID';
}

export type CommercialDocumentKind =
  'ACCEPTANCE_CERTIFICATE' | 'CONTRACT_REFERENCE' | 'PAYMENT_RECEIPT' | 'QUOTATION';

export interface StoredCommercialDocument {
  readonly checksumSha256: string;
  readonly code: string;
  readonly content: string;
  readonly createdAt: Date;
  readonly kind: CommercialDocumentKind;
  readonly orderNumber: string;
  readonly serviceAreaId: string;
}

export interface CommercialOrderSummary {
  readonly certificateCodes: readonly string[];
  readonly contract: CommercialContract | null;
  readonly documentCodes: readonly string[];
  readonly expenseCodes: readonly string[];
  readonly order: CommercialOrder;
  readonly paymentCodes: readonly string[];
  readonly profile: CommercialProfile | null;
  readonly quotation: CommercialQuotation | null;
  readonly totals: CommercialTotals;
}

export interface CommercialRepository {
  acceptQuotation(
    quotationCode: string,
    approvalReference: string,
    actorUserId: string,
    acceptedAt: Date,
  ): Promise<CommercialQuotation>;
  configureProfile(
    orderId: string,
    input: {
      readonly billingType: BillingType;
      readonly contractRequired: boolean;
      readonly revenueSourceCode: RevenueSourceCode;
    },
    actorUserId: string,
  ): Promise<CommercialProfile>;
  findDocument(code: string): Promise<StoredCommercialDocument | null>;
  findOrder(orderNumber: string): Promise<CommercialOrder | null>;
  findQuotationOrder(quotationCode: string): Promise<CommercialOrder | null>;
  getSummary(orderId: string): Promise<CommercialOrderSummary>;
  issueAcceptanceCertificate(
    orderId: string,
    summary: string,
    actorUserId: string,
  ): Promise<{
    readonly certificate: AcceptanceCertificate;
    readonly document: StoredCommercialDocument;
  }>;
  issueQuotation(
    orderId: string,
    input: QuotationAmounts & { readonly scope: string; readonly validUntil: Date },
    actorUserId: string,
  ): Promise<{
    readonly document: StoredCommercialDocument;
    readonly quotation: CommercialQuotation;
  }>;
  recordContract(
    orderId: string,
    externalReference: string,
    termsSummary: string,
    actorUserId: string,
  ): Promise<{
    readonly contract: CommercialContract;
    readonly document: StoredCommercialDocument;
  }>;
  recordExpense(
    orderId: string,
    input: {
      readonly amount: bigint;
      readonly category: ExpenseCategory;
      readonly description: string;
      readonly incurredAt: Date;
    },
    actorUserId: string,
  ): Promise<CommercialExpense>;
  recordPayment(
    orderId: string,
    input: {
      readonly amount: bigint;
      readonly method: PaymentMethod;
      readonly paidAt: Date;
      readonly proofReference: string;
    },
    actorUserId: string,
  ): Promise<{ readonly document: StoredCommercialDocument; readonly payment: CommercialPayment }>;
}
