import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import {
  acceptanceCertificateDocument,
  contractReferenceDocument,
  documentChecksum,
  paymentReceiptDocument,
  quotationDocument,
} from '../../application/commercial/commercial-document.js';
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
} from '../../application/commercial/commercial-repository.js';
import {
  calculateCommercialTotals,
  quotationTotal,
  type RevenueSourceCode,
} from '../../domain/commercial/commercial-policy.js';
import { DomainRuleError, EntityNotFoundError } from '../../domain/shared/domain-errors.js';
import type { MckDatabase, MckTransaction } from '../database/client.js';
import {
  acceptanceCertificates,
  auditLogs,
  commercialContracts,
  commercialDocuments,
  commercialExpenses,
  commercialPayments,
  commercialQuotations,
  orderAcceptances,
  orderCommercialProfiles,
  orders,
  revenueSources,
} from '../database/schema.js';

type ProfileRow = typeof orderCommercialProfiles.$inferSelect & {
  readonly revenueSourceCode: string;
};
type QuotationRow = typeof commercialQuotations.$inferSelect;
type ContractRow = typeof commercialContracts.$inferSelect;
type CertificateRow = typeof acceptanceCertificates.$inferSelect;
type PaymentRow = typeof commercialPayments.$inferSelect;
type ExpenseRow = typeof commercialExpenses.$inferSelect;

function profile(row: ProfileRow): CommercialProfile {
  return {
    billingType: row.billingType,
    contractRequired: row.contractRequired,
    currency: 'UZS',
    orderId: row.orderId,
    revenueSourceCode: row.revenueSourceCode as RevenueSourceCode,
  };
}

function quotation(row: QuotationRow): CommercialQuotation {
  return {
    acceptedAt: row.acceptedAt,
    approvalReference: row.approvalReference,
    code: row.code,
    createdAt: row.createdAt,
    id: row.id,
    laborAmount: row.laborAmount,
    materialAmount: row.materialAmount,
    orderId: row.orderId,
    otherAmount: row.otherAmount,
    scope: row.scope,
    status: row.status,
    totalAmount: row.totalAmount,
    validUntil: row.validUntil,
  };
}

function contract(row: ContractRow): CommercialContract {
  return { ...row };
}

function certificate(row: CertificateRow): AcceptanceCertificate {
  return {
    code: row.code,
    createdAt: row.createdAt,
    id: row.id,
    orderId: row.orderId,
    status: row.status,
    summary: row.summary,
  };
}

function payment(row: PaymentRow): CommercialPayment {
  return { ...row };
}

function expense(row: ExpenseRow): CommercialExpense {
  return { ...row };
}

function sequenceCode(prefix: string, year: number, value: string): string {
  return `${prefix}-${year}-${value.padStart(8, '0')}`;
}

async function sequence(executor: MckTransaction, name: string): Promise<string> {
  const rows = await executor.execute(
    sql<{ value: string }>`select nextval(${sql.raw(`'${name}'`)})::text as value`,
  );
  const value = (rows[0] as { readonly value?: unknown } | undefined)?.value;
  if (typeof value !== 'string' || !value) throw new Error(`${name} returned no value`);
  return value;
}

export class PostgresCommercialRepository implements CommercialRepository {
  constructor(private readonly database: MckDatabase) {}

  async findOrder(orderNumber: string): Promise<CommercialOrder | null> {
    const [row] = await this.database
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        serviceAreaId: orders.serviceAreaId,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);
    return row ?? null;
  }

  async findQuotationOrder(quotationCode: string): Promise<CommercialOrder | null> {
    const [row] = await this.database
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        serviceAreaId: orders.serviceAreaId,
        status: orders.status,
      })
      .from(commercialQuotations)
      .innerJoin(orders, eq(orders.id, commercialQuotations.orderId))
      .where(eq(commercialQuotations.code, quotationCode))
      .limit(1);
    return row ?? null;
  }

  async configureProfile(
    orderId: string,
    input: Parameters<CommercialRepository['configureProfile']>[1],
    actorUserId: string,
  ): Promise<CommercialProfile> {
    return this.database.transaction(async (tx) => {
      const [source] = await tx
        .select({ id: revenueSources.id })
        .from(revenueSources)
        .where(
          and(eq(revenueSources.code, input.revenueSourceCode), eq(revenueSources.isActive, true)),
        )
        .limit(1);
      if (!source) throw new EntityNotFoundError('RevenueSource', input.revenueSourceCode);
      const [activeQuotation] = await tx
        .select({ id: commercialQuotations.id })
        .from(commercialQuotations)
        .where(
          and(
            eq(commercialQuotations.orderId, orderId),
            inArray(commercialQuotations.status, ['ISSUED', 'ACCEPTED']),
          ),
        )
        .limit(1);
      const [existing] = await tx
        .select()
        .from(orderCommercialProfiles)
        .where(eq(orderCommercialProfiles.orderId, orderId))
        .for('update');
      if (
        activeQuotation &&
        existing &&
        (existing.billingType !== input.billingType ||
          existing.revenueSourceId !== source.id ||
          existing.contractRequired !== input.contractRequired)
      ) {
        throw new DomainRuleError(
          'COMMERCIAL_PROFILE_LOCKED',
          'Commercial classification cannot change after a quotation is issued',
        );
      }
      const now = new Date();
      const [saved] = await tx
        .insert(orderCommercialProfiles)
        .values({
          billingType: input.billingType,
          contractRequired: input.contractRequired,
          orderId,
          revenueSourceId: source.id,
          setByUserId: actorUserId,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          set: {
            billingType: input.billingType,
            contractRequired: input.contractRequired,
            revenueSourceId: source.id,
            setByUserId: actorUserId,
            updatedAt: now,
          },
          target: orderCommercialProfiles.orderId,
        })
        .returning();
      if (!saved) throw new Error('Commercial profile insert returned no row');
      await tx.insert(auditLogs).values({
        action: existing ? 'commercial.profile_changed' : 'commercial.profile_configured',
        actorUserId,
        after: {
          billingType: input.billingType,
          contractRequired: input.contractRequired,
          revenueSourceCode: input.revenueSourceCode,
        },
        before: existing
          ? {
              billingType: existing.billingType,
              contractRequired: existing.contractRequired,
              revenueSourceId: existing.revenueSourceId,
            }
          : undefined,
        entityId: orderId,
        entityType: 'order_commercial_profile',
      });
      return profile({ ...saved, revenueSourceCode: input.revenueSourceCode });
    });
  }

  async issueQuotation(
    orderId: string,
    input: Parameters<CommercialRepository['issueQuotation']>[1],
    actorUserId: string,
  ): Promise<{
    readonly document: StoredCommercialDocument;
    readonly quotation: CommercialQuotation;
  }> {
    return this.database.transaction(async (tx) => {
      const [context] = await tx
        .select({
          billingType: orderCommercialProfiles.billingType,
          orderNumber: orders.orderNumber,
          serviceAreaId: orders.serviceAreaId,
        })
        .from(orders)
        .innerJoin(orderCommercialProfiles, eq(orderCommercialProfiles.orderId, orders.id))
        .where(eq(orders.id, orderId))
        .for('update');
      if (!context)
        throw new DomainRuleError('COMMERCIAL_PROFILE_REQUIRED', 'Configure the order first');
      if (context.billingType !== 'FIXED_PRICE') {
        throw new DomainRuleError(
          'COMMERCIAL_QUOTATION_FORBIDDEN',
          'No-charge orders cannot have quotations',
        );
      }
      const [active] = await tx
        .select({ code: commercialQuotations.code })
        .from(commercialQuotations)
        .where(
          and(
            eq(commercialQuotations.orderId, orderId),
            inArray(commercialQuotations.status, ['ISSUED', 'ACCEPTED']),
          ),
        )
        .limit(1);
      if (active) {
        throw new DomainRuleError(
          'COMMERCIAL_QUOTATION_EXISTS',
          `Active quotation already exists: ${active.code}`,
        );
      }
      const now = new Date();
      const quoteCode = sequenceCode(
        'QUO',
        now.getUTCFullYear(),
        await sequence(tx, 'commercial_quotation_seq'),
      );
      const totalAmount = quotationTotal(input);
      const [created] = await tx
        .insert(commercialQuotations)
        .values({
          code: quoteCode,
          createdAt: now,
          createdByUserId: actorUserId,
          laborAmount: input.laborAmount,
          materialAmount: input.materialAmount,
          orderId,
          otherAmount: input.otherAmount,
          scope: input.scope,
          totalAmount,
          validUntil: input.validUntil,
        })
        .returning();
      if (!created) throw new Error('Quotation insert returned no row');
      const documentCode = sequenceCode(
        'DOC',
        now.getUTCFullYear(),
        await sequence(tx, 'commercial_document_seq'),
      );
      const content = quotationDocument({
        code: quoteCode,
        laborAmount: input.laborAmount,
        materialAmount: input.materialAmount,
        orderNumber: context.orderNumber,
        otherAmount: input.otherAmount,
        scope: input.scope,
        totalAmount,
        validUntil: input.validUntil,
      });
      const checksumSha256 = documentChecksum(content);
      await tx.insert(commercialDocuments).values({
        checksumSha256,
        code: documentCode,
        content,
        createdAt: now,
        createdByUserId: actorUserId,
        kind: 'QUOTATION',
        orderId,
        quotationId: created.id,
      });
      await tx.insert(auditLogs).values({
        action: 'commercial.quotation_issued',
        actorUserId,
        after: {
          code: quoteCode,
          totalAmount: totalAmount.toString(),
          validUntil: input.validUntil.toISOString(),
        },
        entityId: created.id,
        entityType: 'commercial_quotation',
      });
      return {
        document: {
          checksumSha256,
          code: documentCode,
          content,
          createdAt: now,
          kind: 'QUOTATION',
          orderNumber: context.orderNumber,
          serviceAreaId: context.serviceAreaId,
        },
        quotation: quotation(created),
      };
    });
  }

  async acceptQuotation(
    quotationCode: string,
    approvalReference: string,
    actorUserId: string,
    acceptedAt: Date,
  ): Promise<CommercialQuotation> {
    return this.database.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(commercialQuotations)
        .where(eq(commercialQuotations.code, quotationCode))
        .for('update');
      if (!current) throw new EntityNotFoundError('Quotation', quotationCode);
      if (current.status !== 'ISSUED') {
        throw new DomainRuleError(
          'COMMERCIAL_QUOTATION_STATE',
          'Only an issued quotation can be accepted',
        );
      }
      if (current.validUntil < acceptedAt) {
        throw new DomainRuleError('COMMERCIAL_QUOTATION_EXPIRED', 'Quotation validity has expired');
      }
      const [updated] = await tx
        .update(commercialQuotations)
        .set({
          acceptedAt,
          acceptedByUserId: actorUserId,
          approvalReference,
          status: 'ACCEPTED',
        })
        .where(
          and(eq(commercialQuotations.id, current.id), eq(commercialQuotations.status, 'ISSUED')),
        )
        .returning();
      if (!updated)
        throw new DomainRuleError('COMMERCIAL_CONFLICT', 'Quotation changed concurrently');
      await tx.insert(auditLogs).values({
        action: 'commercial.quotation_accepted',
        actorUserId,
        after: { approvalReference, status: 'ACCEPTED' },
        before: { status: current.status },
        entityId: current.id,
        entityType: 'commercial_quotation',
        reason: approvalReference,
      });
      return quotation(updated);
    });
  }

  async recordContract(
    orderId: string,
    externalReference: string,
    termsSummary: string,
    actorUserId: string,
  ): Promise<{
    readonly contract: CommercialContract;
    readonly document: StoredCommercialDocument;
  }> {
    return this.database.transaction(async (tx) => {
      const [context] = await tx
        .select({
          billingType: orderCommercialProfiles.billingType,
          contractRequired: orderCommercialProfiles.contractRequired,
          orderNumber: orders.orderNumber,
          quotationCode: commercialQuotations.code,
          quotationId: commercialQuotations.id,
          serviceAreaId: orders.serviceAreaId,
        })
        .from(orders)
        .innerJoin(orderCommercialProfiles, eq(orderCommercialProfiles.orderId, orders.id))
        .innerJoin(
          commercialQuotations,
          and(
            eq(commercialQuotations.orderId, orders.id),
            eq(commercialQuotations.status, 'ACCEPTED'),
          ),
        )
        .where(eq(orders.id, orderId))
        .for('update');
      if (!context || context.billingType !== 'FIXED_PRICE') {
        throw new DomainRuleError(
          'COMMERCIAL_ACCEPTED_QUOTATION_REQUIRED',
          'Accept a quotation before recording a contract',
        );
      }
      const [existing] = await tx
        .select({ code: commercialContracts.code })
        .from(commercialContracts)
        .where(
          and(eq(commercialContracts.orderId, orderId), eq(commercialContracts.status, 'RECORDED')),
        )
        .limit(1);
      if (existing)
        throw new DomainRuleError(
          'COMMERCIAL_CONTRACT_EXISTS',
          `Contract already exists: ${existing.code}`,
        );
      const now = new Date();
      const code = sequenceCode(
        'CTR',
        now.getUTCFullYear(),
        await sequence(tx, 'commercial_contract_seq'),
      );
      const [created] = await tx
        .insert(commercialContracts)
        .values({
          code,
          createdAt: now,
          externalReference,
          orderId,
          quotationId: context.quotationId,
          recordedByUserId: actorUserId,
          termsSummary,
        })
        .returning();
      if (!created) throw new Error('Contract insert returned no row');
      const documentCode = sequenceCode(
        'DOC',
        now.getUTCFullYear(),
        await sequence(tx, 'commercial_document_seq'),
      );
      const content = contractReferenceDocument({
        code,
        externalReference,
        orderNumber: context.orderNumber,
        quotationCode: context.quotationCode,
        termsSummary,
      });
      const checksumSha256 = documentChecksum(content);
      await tx.insert(commercialDocuments).values({
        checksumSha256,
        code: documentCode,
        content,
        contractId: created.id,
        createdAt: now,
        createdByUserId: actorUserId,
        kind: 'CONTRACT_REFERENCE',
        orderId,
      });
      await tx.insert(auditLogs).values({
        action: 'commercial.contract_recorded',
        actorUserId,
        after: { code, contractRequired: context.contractRequired, externalReference },
        entityId: created.id,
        entityType: 'commercial_contract',
      });
      return {
        contract: contract(created),
        document: {
          checksumSha256,
          code: documentCode,
          content,
          createdAt: now,
          kind: 'CONTRACT_REFERENCE',
          orderNumber: context.orderNumber,
          serviceAreaId: context.serviceAreaId,
        },
      };
    });
  }

  async issueAcceptanceCertificate(
    orderId: string,
    summary: string,
    actorUserId: string,
  ): Promise<{
    readonly certificate: AcceptanceCertificate;
    readonly document: StoredCommercialDocument;
  }> {
    return this.database.transaction(async (tx) => {
      const [context] = await tx
        .select({
          acceptanceId: orderAcceptances.id,
          contractRequired: orderCommercialProfiles.contractRequired,
          orderNumber: orders.orderNumber,
          serviceAreaId: orders.serviceAreaId,
          status: orders.status,
        })
        .from(orders)
        .innerJoin(orderCommercialProfiles, eq(orderCommercialProfiles.orderId, orders.id))
        .innerJoin(orderAcceptances, eq(orderAcceptances.orderId, orders.id))
        .where(eq(orders.id, orderId))
        .orderBy(desc(orderAcceptances.acceptedAt))
        .limit(1)
        .for('update');
      if (!context || context.status !== 'COMPLETED') {
        throw new DomainRuleError(
          'COMMERCIAL_ACCEPTANCE_REQUIRED',
          'Order must be operationally accepted and completed',
        );
      }
      if (context.contractRequired) {
        const [activeContract] = await tx
          .select({ id: commercialContracts.id })
          .from(commercialContracts)
          .where(
            and(
              eq(commercialContracts.orderId, orderId),
              eq(commercialContracts.status, 'RECORDED'),
            ),
          )
          .limit(1);
        if (!activeContract) {
          throw new DomainRuleError(
            'COMMERCIAL_CONTRACT_REQUIRED',
            'Record the required contract first',
          );
        }
      }
      const [existing] = await tx
        .select({ code: acceptanceCertificates.code })
        .from(acceptanceCertificates)
        .where(eq(acceptanceCertificates.acceptanceId, context.acceptanceId))
        .limit(1);
      if (existing) {
        throw new DomainRuleError(
          'COMMERCIAL_CERTIFICATE_EXISTS',
          `Certificate already exists: ${existing.code}`,
        );
      }
      const now = new Date();
      const code = sequenceCode(
        'ACT',
        now.getUTCFullYear(),
        await sequence(tx, 'acceptance_certificate_seq'),
      );
      const [created] = await tx
        .insert(acceptanceCertificates)
        .values({
          acceptanceId: context.acceptanceId,
          code,
          createdAt: now,
          issuedByUserId: actorUserId,
          orderId,
          summary,
        })
        .returning();
      if (!created) throw new Error('Acceptance certificate insert returned no row');
      const documentCode = sequenceCode(
        'DOC',
        now.getUTCFullYear(),
        await sequence(tx, 'commercial_document_seq'),
      );
      const content = acceptanceCertificateDocument({
        code,
        issuedAt: now,
        orderNumber: context.orderNumber,
        summary,
      });
      const checksumSha256 = documentChecksum(content);
      await tx.insert(commercialDocuments).values({
        acceptanceCertificateId: created.id,
        checksumSha256,
        code: documentCode,
        content,
        createdAt: now,
        createdByUserId: actorUserId,
        kind: 'ACCEPTANCE_CERTIFICATE',
        orderId,
      });
      await tx.insert(auditLogs).values({
        action: 'commercial.acceptance_certificate_issued',
        actorUserId,
        after: { code },
        entityId: created.id,
        entityType: 'acceptance_certificate',
      });
      return {
        certificate: certificate(created),
        document: {
          checksumSha256,
          code: documentCode,
          content,
          createdAt: now,
          kind: 'ACCEPTANCE_CERTIFICATE',
          orderNumber: context.orderNumber,
          serviceAreaId: context.serviceAreaId,
        },
      };
    });
  }

  async recordPayment(
    orderId: string,
    input: Parameters<CommercialRepository['recordPayment']>[1],
    actorUserId: string,
  ): Promise<{ readonly document: StoredCommercialDocument; readonly payment: CommercialPayment }> {
    return this.database.transaction(async (tx) => {
      const [context] = await tx
        .select({
          orderNumber: orders.orderNumber,
          serviceAreaId: orders.serviceAreaId,
          totalAmount: commercialQuotations.totalAmount,
        })
        .from(orders)
        .innerJoin(
          commercialQuotations,
          and(
            eq(commercialQuotations.orderId, orders.id),
            eq(commercialQuotations.status, 'ACCEPTED'),
          ),
        )
        .where(eq(orders.id, orderId))
        .for('update');
      if (!context)
        throw new DomainRuleError(
          'COMMERCIAL_ACCEPTED_QUOTATION_REQUIRED',
          'Accept a quotation before recording payment',
        );
      const [aggregate] = await tx
        .select({ amount: sql<string>`coalesce(sum(${commercialPayments.amount}), 0)::text` })
        .from(commercialPayments)
        .where(
          and(eq(commercialPayments.orderId, orderId), eq(commercialPayments.status, 'CONFIRMED')),
        );
      const collected = BigInt(aggregate?.amount ?? '0');
      if (collected + input.amount > context.totalAmount) {
        throw new DomainRuleError(
          'COMMERCIAL_OVERPAYMENT',
          'Payment would exceed the accepted quotation total',
        );
      }
      const now = new Date();
      const code = sequenceCode(
        'PAY',
        now.getUTCFullYear(),
        await sequence(tx, 'commercial_payment_seq'),
      );
      const [created] = await tx
        .insert(commercialPayments)
        .values({
          amount: input.amount,
          code,
          createdAt: now,
          method: input.method,
          orderId,
          paidAt: input.paidAt,
          proofReference: input.proofReference,
          recordedByUserId: actorUserId,
        })
        .returning();
      if (!created) throw new Error('Payment insert returned no row');
      const documentCode = sequenceCode(
        'DOC',
        now.getUTCFullYear(),
        await sequence(tx, 'commercial_document_seq'),
      );
      const content = paymentReceiptDocument({
        amount: input.amount,
        code,
        method: input.method,
        orderNumber: context.orderNumber,
        paidAt: input.paidAt,
        proofReference: input.proofReference,
      });
      const checksumSha256 = documentChecksum(content);
      await tx.insert(commercialDocuments).values({
        checksumSha256,
        code: documentCode,
        content,
        createdAt: now,
        createdByUserId: actorUserId,
        kind: 'PAYMENT_RECEIPT',
        orderId,
        paymentId: created.id,
      });
      await tx.insert(auditLogs).values({
        action: 'commercial.payment_recorded',
        actorUserId,
        after: {
          amount: input.amount.toString(),
          code,
          method: input.method,
          paidAt: input.paidAt.toISOString(),
        },
        entityId: created.id,
        entityType: 'commercial_payment',
      });
      return {
        document: {
          checksumSha256,
          code: documentCode,
          content,
          createdAt: now,
          kind: 'PAYMENT_RECEIPT',
          orderNumber: context.orderNumber,
          serviceAreaId: context.serviceAreaId,
        },
        payment: payment(created),
      };
    });
  }

  async recordExpense(
    orderId: string,
    input: Parameters<CommercialRepository['recordExpense']>[1],
    actorUserId: string,
  ): Promise<CommercialExpense> {
    return this.database.transaction(async (tx) => {
      const [profileRow] = await tx
        .select({ orderId: orderCommercialProfiles.orderId })
        .from(orderCommercialProfiles)
        .where(eq(orderCommercialProfiles.orderId, orderId))
        .for('update');
      if (!profileRow)
        throw new DomainRuleError(
          'COMMERCIAL_PROFILE_REQUIRED',
          'Configure the order before recording expenses',
        );
      const now = new Date();
      const code = sequenceCode(
        'EXP',
        now.getUTCFullYear(),
        await sequence(tx, 'commercial_expense_seq'),
      );
      const [created] = await tx
        .insert(commercialExpenses)
        .values({
          amount: input.amount,
          category: input.category,
          code,
          createdAt: now,
          description: input.description,
          incurredAt: input.incurredAt,
          orderId,
          recordedByUserId: actorUserId,
        })
        .returning();
      if (!created) throw new Error('Expense insert returned no row');
      await tx.insert(auditLogs).values({
        action: 'commercial.expense_recorded',
        actorUserId,
        after: {
          amount: input.amount.toString(),
          category: input.category,
          code,
          incurredAt: input.incurredAt.toISOString(),
        },
        entityId: created.id,
        entityType: 'commercial_expense',
      });
      return expense(created);
    });
  }

  async getSummary(orderId: string): Promise<CommercialOrderSummary> {
    const [order] = await this.database
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        serviceAreaId: orders.serviceAreaId,
        status: orders.status,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);
    if (!order) throw new EntityNotFoundError('Order', orderId);
    const [profileRow] = await this.database
      .select({
        billingType: orderCommercialProfiles.billingType,
        contractRequired: orderCommercialProfiles.contractRequired,
        createdAt: orderCommercialProfiles.createdAt,
        currency: orderCommercialProfiles.currency,
        orderId: orderCommercialProfiles.orderId,
        revenueSourceCode: revenueSources.code,
        revenueSourceId: orderCommercialProfiles.revenueSourceId,
        setByUserId: orderCommercialProfiles.setByUserId,
        updatedAt: orderCommercialProfiles.updatedAt,
      })
      .from(orderCommercialProfiles)
      .innerJoin(revenueSources, eq(revenueSources.id, orderCommercialProfiles.revenueSourceId))
      .where(eq(orderCommercialProfiles.orderId, orderId))
      .limit(1);
    const [quotationRow] = await this.database
      .select()
      .from(commercialQuotations)
      .where(
        and(
          eq(commercialQuotations.orderId, orderId),
          inArray(commercialQuotations.status, ['ISSUED', 'ACCEPTED']),
        ),
      )
      .orderBy(desc(commercialQuotations.createdAt))
      .limit(1);
    const [contractRow] = await this.database
      .select()
      .from(commercialContracts)
      .where(
        and(eq(commercialContracts.orderId, orderId), eq(commercialContracts.status, 'RECORDED')),
      )
      .limit(1);
    const [paymentsAggregate] = await this.database
      .select({ amount: sql<string>`coalesce(sum(${commercialPayments.amount}), 0)::text` })
      .from(commercialPayments)
      .where(
        and(eq(commercialPayments.orderId, orderId), eq(commercialPayments.status, 'CONFIRMED')),
      );
    const [expensesAggregate] = await this.database
      .select({ amount: sql<string>`coalesce(sum(${commercialExpenses.amount}), 0)::text` })
      .from(commercialExpenses)
      .where(
        and(eq(commercialExpenses.orderId, orderId), eq(commercialExpenses.status, 'RECORDED')),
      );
    const [paymentRows, expenseRows, certificateRows, documentRows] = await Promise.all([
      this.database
        .select({ code: commercialPayments.code })
        .from(commercialPayments)
        .where(
          and(eq(commercialPayments.orderId, orderId), eq(commercialPayments.status, 'CONFIRMED')),
        )
        .orderBy(commercialPayments.paidAt),
      this.database
        .select({ code: commercialExpenses.code })
        .from(commercialExpenses)
        .where(
          and(eq(commercialExpenses.orderId, orderId), eq(commercialExpenses.status, 'RECORDED')),
        )
        .orderBy(commercialExpenses.incurredAt),
      this.database
        .select({ code: acceptanceCertificates.code })
        .from(acceptanceCertificates)
        .where(
          and(
            eq(acceptanceCertificates.orderId, orderId),
            eq(acceptanceCertificates.status, 'ISSUED'),
          ),
        )
        .orderBy(acceptanceCertificates.createdAt),
      this.database
        .select({ code: commercialDocuments.code })
        .from(commercialDocuments)
        .where(eq(commercialDocuments.orderId, orderId))
        .orderBy(commercialDocuments.createdAt),
    ]);
    const activeQuotation = quotationRow ? quotation(quotationRow) : null;
    return {
      certificateCodes: certificateRows.map(({ code }) => code),
      contract: contractRow ? contract(contractRow) : null,
      documentCodes: documentRows.map(({ code }) => code),
      expenseCodes: expenseRows.map(({ code }) => code),
      order,
      paymentCodes: paymentRows.map(({ code }) => code),
      profile: profileRow ? profile(profileRow) : null,
      quotation: activeQuotation,
      totals: calculateCommercialTotals({
        agreedRevenue: activeQuotation?.status === 'ACCEPTED' ? activeQuotation.totalAmount : null,
        collectedAmount: BigInt(paymentsAggregate?.amount ?? '0'),
        expenseAmount: BigInt(expensesAggregate?.amount ?? '0'),
      }),
    };
  }

  async findDocument(code: string): Promise<StoredCommercialDocument | null> {
    const [row] = await this.database
      .select({
        checksumSha256: commercialDocuments.checksumSha256,
        code: commercialDocuments.code,
        content: commercialDocuments.content,
        createdAt: commercialDocuments.createdAt,
        kind: commercialDocuments.kind,
        orderNumber: orders.orderNumber,
        serviceAreaId: orders.serviceAreaId,
      })
      .from(commercialDocuments)
      .innerJoin(orders, eq(orders.id, commercialDocuments.orderId))
      .where(eq(commercialDocuments.code, code))
      .limit(1);
    return row ?? null;
  }
}
