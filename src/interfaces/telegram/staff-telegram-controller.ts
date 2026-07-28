import { priorityBands, type PriorityBand } from '../../domain/priority/priority-calculator.js';
import { DomainRuleError } from '../../domain/shared/domain-errors.js';
import type {
  StaffOperationResult,
  StaffOperationCommand,
  StaffOperations,
} from '../../application/triage/staff-operations-service.js';
import type { InspectionItemInput } from '../../domain/quality/quality-policy.js';
import { pdcaStages, type PdcaStage } from '../../domain/pdca/pdca-policy.js';
import type { ReportPeriodKind } from '../../domain/reporting/reporting-period.js';
import { parseTashkentDateTime } from '../../domain/shared/tashkent-date-time.js';
import type { BotLanguage } from '../../application/localization/bot-language.js';
import {
  billingTypes,
  expenseCategories,
  paymentMethods,
  revenueSourceCodes,
  type BillingType,
  type ExpenseCategory,
  type PaymentMethod,
  type RevenueSourceCode,
} from '../../domain/commercial/commercial-policy.js';

const helpCommands = [
  '/queue',
  '/details TICKET',
  '/staff',
  '/staffgrant TELEGRAM_ID operator_manager|executor AREA full name',
  '/staffsuspend STF_CODE reason',
  '/staffrestore STF_CODE',
  '/commercial ORDER|FIXED_PRICE|RESIDENT|REQUIRED',
  '/quote ORDER|labor|material|other|DD.MM.YYYY|scope',
  '/acceptquote QUO|customer approval reference',
  '/contract ORDER|external reference|terms summary',
  '/certificate ORDER|work acceptance summary',
  '/payment ORDER|amount|CASH|DD.MM.YYYY|proof reference',
  '/expense ORDER|amount|MATERIAL|DD.MM.YYYY|description',
  '/finance ORDER',
  '/document DOC_CODE',
  '/validate TICKET',
  '/info TICKET savol',
  '/triage TICKET safety urgency affected social (har biri 0..5)',
  '/duplicates TICKET',
  '/duplicate TICKET CANDIDATE confirm|dismiss',
  '/override TICKET SCORE BAND sabab',
  '/register TICKET',
  '/reject TICKET sabab',
  '/executors ORDER',
  '/assign ORDER EXECUTOR_CODE DD.MM.YYYY HH:mm',
  '/mine',
  '/accept ORDER',
  '/decline ORDER sabab',
  '/progress ORDER yozuv',
  '/block ORDER sabab',
  '/unblock ORDER izoh',
  '/complete ORDER yakuniy hisobot',
  'Foto izohi: /evidence ORDER BEFORE|AFTER izoh',
  '/overdue',
  '/ackoverdue ORDER',
  '/resolveoverdue ORDER',
  '/failednotifications',
  '/retrynotification NTF_CODE',
  '/report week|month',
  '/reportcsv week|month',
  '/pdca',
  '/pdca new AREA DD.MM.YYYY HH:mm title | problem | action | expected outcome',
  '/pdca move PDC_CODE DO|CHECK|ACT|COMPLETED|PLAN|CANCELLED reason',
  '/checklist ORDER',
  '/inspect ORDER CODE=PASS,CODE=FAIL qisqa xulosa',
  '/approve ORDER',
  '/rework ORDER sabab',
  '/startrework ORDER',
  '/complaints',
  '/reopen COMPLAINT_CODE sabab',
  '/closecomplaint COMPLAINT_CODE resolve|reject sabab',
].join('\n');

function help(language: BotLanguage): string {
  return `${language === 'ru' ? 'Используйте кнопки меню. Команды для опытных пользователей:' : 'Menyu tugmalaridan foydalaning. Tajribali foydalanuvchilar uchun buyruqlar:'}\n${helpCommands}`;
}

function required(value: string | undefined, usage: string): string {
  if (!value?.trim()) throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
  return value.trim();
}

function numeric(value: string | undefined, usage: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed))
    throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
  return parsed;
}

function positiveBigInt(value: string | undefined, usage: string): bigint {
  try {
    const parsed = BigInt(required(value, usage));
    if (parsed > 0n) return parsed;
  } catch {
    // Converted to the same safe command-usage error below.
  }
  throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
}

function money(value: string | undefined, usage: string): bigint {
  const normalized = required(value, usage).replace(/[\s_]/gu, '');
  if (!/^\d+$/u.test(normalized)) {
    throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
  }
  const amount = BigInt(normalized);
  if (amount <= 0n) throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
  return amount;
}

function zeroOrPositiveMoney(value: string | undefined, usage: string): bigint {
  const normalized = required(value, usage).replace(/[\s_]/gu, '');
  if (!/^\d+$/u.test(normalized)) {
    throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
  }
  return BigInt(normalized);
}

function pipeFields(text: string, usage: string, count: number): readonly string[] {
  const separator = text.search(/\s/u);
  const tail = separator < 0 ? '' : text.slice(separator + 1);
  const fields = tail.split('|').map((value) => value.trim());
  if (fields.length !== count || fields.some((value) => !value)) {
    throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
  }
  return fields;
}

function localDate(value: string, usage: string, endOfDay = false): Date {
  try {
    return parseTashkentDateTime(value, endOfDay ? '23:59' : '00:00');
  } catch {
    throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
  }
}

function deadline(
  values: readonly string[],
  start: number,
  usage: string,
): { readonly dueAt: Date; readonly next: number } {
  const raw = required(values[start], usage);
  if (/^\d{2}\.\d{2}\.\d{4}$/u.test(raw)) {
    const time = required(values[start + 1], usage);
    try {
      return { dueAt: parseTashkentDateTime(raw, time), next: start + 2 };
    } catch {
      throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
    }
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/u.test(raw)) {
    throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) {
    throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
  }
  return { dueAt: parsed, next: start + 1 };
}

function reportPeriod(value: string | undefined): ReportPeriodKind {
  const normalized = required(value, '/report week|month').toUpperCase();
  if (normalized !== 'WEEK' && normalized !== 'MONTH') {
    throw new DomainRuleError('COMMAND_INVALID', 'Davr week yoki month bo‘lishi kerak');
  }
  return normalized;
}

function pdcaStage(value: string | undefined): PdcaStage {
  const normalized = required(value, '/pdca move PDC_CODE STAGE reason').toUpperCase();
  if (!pdcaStages.includes(normalized as PdcaStage)) {
    throw new DomainRuleError('COMMAND_INVALID', `PDCA bosqichi: ${pdcaStages.join('|')}`);
  }
  return normalized as PdcaStage;
}

function inspectionResults(value: string | undefined): readonly InspectionItemInput[] {
  const raw = required(value, '/inspect ORDER CODE=PASS,CODE=FAIL qisqa xulosa');
  return raw.split(',').map((entry) => {
    const [rawCode, rawResult] = entry.split('=');
    const code = required(rawCode, '/inspect ORDER CODE=PASS,CODE=FAIL qisqa xulosa').toUpperCase();
    const result = required(
      rawResult,
      '/inspect ORDER CODE=PASS,CODE=FAIL qisqa xulosa',
    ).toUpperCase();
    if (result !== 'PASS' && result !== 'FAIL' && result !== 'NOT_APPLICABLE') {
      throw new DomainRuleError('COMMAND_INVALID', 'Natija PASS, FAIL yoki NOT_APPLICABLE');
    }
    return { code, result };
  });
}

function parse(text: string): StaffOperationCommand | 'help' {
  const [rawCommand, ...parts] = text.trim().split(/\s+/u);
  const command = rawCommand?.split('@')[0]?.toLocaleLowerCase('en-US');
  const ticket = (): string => required(parts[0], `${command} TICKET`).toUpperCase();
  switch (command) {
    case '/start':
    case '/help':
      return 'help';
    case '/queue':
      return { kind: 'queue' };
    case '/details':
      return { kind: 'request-details', ticketNumber: ticket() };
    case '/staff':
      return { kind: 'staff-list' };
    case '/staffgrant': {
      const usage = '/staffgrant TELEGRAM_ID operator_manager|executor AREA full name';
      const role = required(parts[1], usage);
      if (role !== 'operator_manager' && role !== 'executor') {
        throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
      }
      return {
        areaCode: required(parts[2], usage).toUpperCase(),
        displayName: required(parts.slice(3).join(' '), usage),
        kind: 'staff-grant',
        role,
        telegramUserId: positiveBigInt(parts[0], usage),
      };
    }
    case '/staffsuspend':
      return {
        code: ticket(),
        kind: 'staff-suspend',
        reason: required(parts.slice(1).join(' '), '/staffsuspend STF_CODE reason'),
      };
    case '/staffrestore':
      return { code: ticket(), kind: 'staff-restore' };
    case '/commercial': {
      const usage = '/commercial ORDER|NO_CHARGE|FIXED_PRICE source REQUIRED|OPTIONAL';
      const fields = pipeFields(text, usage, 4);
      const [orderNumber, rawBillingType, rawRevenueSource, rawContract] = fields;
      const billingType = rawBillingType?.toUpperCase();
      const revenueSourceCode = rawRevenueSource?.toUpperCase();
      const contract = rawContract?.toUpperCase();
      if (!billingTypes.includes(billingType as BillingType)) {
        throw new DomainRuleError('COMMAND_INVALID', `BILLING: ${billingTypes.join('|')}`);
      }
      if (!revenueSourceCodes.includes(revenueSourceCode as RevenueSourceCode)) {
        throw new DomainRuleError('COMMAND_INVALID', `SOURCE: ${revenueSourceCodes.join('|')}`);
      }
      if (contract !== 'REQUIRED' && contract !== 'OPTIONAL') {
        throw new DomainRuleError('COMMAND_INVALID', 'CONTRACT: REQUIRED|OPTIONAL');
      }
      return {
        billingType: billingType as BillingType,
        contractRequired: contract === 'REQUIRED',
        kind: 'commercial-configure',
        orderNumber: required(orderNumber, usage).toUpperCase(),
        revenueSourceCode: revenueSourceCode as RevenueSourceCode,
      };
    }
    case '/quote': {
      const usage = '/quote ORDER|labor|material|other|DD.MM.YYYY|scope';
      const fields = pipeFields(text, usage, 6);
      return {
        kind: 'quotation-issue',
        laborAmount: zeroOrPositiveMoney(fields[1], usage),
        materialAmount: zeroOrPositiveMoney(fields[2], usage),
        orderNumber: required(fields[0], usage).toUpperCase(),
        otherAmount: zeroOrPositiveMoney(fields[3], usage),
        scope: required(fields[5], usage),
        validUntil: localDate(required(fields[4], usage), usage, true),
      };
    }
    case '/acceptquote': {
      const usage = '/acceptquote QUO|customer approval reference';
      const fields = pipeFields(text, usage, 2);
      return {
        approvalReference: required(fields[1], usage),
        kind: 'quotation-accept',
        quotationCode: required(fields[0], usage).toUpperCase(),
      };
    }
    case '/contract': {
      const usage = '/contract ORDER|external reference|terms summary';
      const fields = pipeFields(text, usage, 3);
      return {
        externalReference: required(fields[1], usage),
        kind: 'contract-record',
        orderNumber: required(fields[0], usage).toUpperCase(),
        termsSummary: required(fields[2], usage),
      };
    }
    case '/certificate': {
      const usage = '/certificate ORDER|work acceptance summary';
      const fields = pipeFields(text, usage, 2);
      return {
        kind: 'acceptance-certificate',
        orderNumber: required(fields[0], usage).toUpperCase(),
        summary: required(fields[1], usage),
      };
    }
    case '/payment': {
      const usage = '/payment ORDER|amount|CASH|BANK_TRANSFER|OTHER|DD.MM.YYYY|proof reference';
      const fields = pipeFields(text, usage, 5);
      const method = fields[2]?.toUpperCase();
      if (!paymentMethods.includes(method as PaymentMethod)) {
        throw new DomainRuleError('COMMAND_INVALID', `METHOD: ${paymentMethods.join('|')}`);
      }
      return {
        amount: money(fields[1], usage),
        kind: 'payment-record',
        method: method as PaymentMethod,
        orderNumber: required(fields[0], usage).toUpperCase(),
        paidAt: localDate(required(fields[3], usage), usage),
        proofReference: required(fields[4], usage),
      };
    }
    case '/expense': {
      const usage = '/expense ORDER|amount|LABOR|MATERIAL|TRANSPORT|OTHER|DD.MM.YYYY|description';
      const fields = pipeFields(text, usage, 5);
      const category = fields[2]?.toUpperCase();
      if (!expenseCategories.includes(category as ExpenseCategory)) {
        throw new DomainRuleError('COMMAND_INVALID', `CATEGORY: ${expenseCategories.join('|')}`);
      }
      return {
        amount: money(fields[1], usage),
        category: category as ExpenseCategory,
        description: required(fields[4], usage),
        incurredAt: localDate(required(fields[3], usage), usage),
        kind: 'expense-record',
        orderNumber: required(fields[0], usage).toUpperCase(),
      };
    }
    case '/finance':
      return { kind: 'finance-summary', orderNumber: ticket() };
    case '/document':
      return { code: ticket(), kind: 'commercial-document' };
    case '/validate':
      return { kind: 'validate', ticketNumber: ticket() };
    case '/info':
      return {
        kind: 'information',
        question: required(parts.slice(1).join(' '), '/info TICKET savol'),
        ticketNumber: ticket(),
      };
    case '/triage':
      if (parts.length !== 5) {
        throw new DomainRuleError(
          'COMMAND_INVALID',
          'Foydalanish: /triage TICKET safety urgency affected social',
        );
      }
      return {
        affected: numeric(parts[3], '/triage TICKET safety urgency affected social'),
        kind: 'triage',
        safety: numeric(parts[1], '/triage TICKET safety urgency affected social'),
        social: numeric(parts[4], '/triage TICKET safety urgency affected social'),
        ticketNumber: ticket(),
        urgency: numeric(parts[2], '/triage TICKET safety urgency affected social'),
      };
    case '/duplicates':
      return { kind: 'duplicates', ticketNumber: ticket() };
    case '/duplicate': {
      const rawDecision = required(parts[2], '/duplicate TICKET CANDIDATE confirm|dismiss');
      if (rawDecision !== 'confirm' && rawDecision !== 'dismiss') {
        throw new DomainRuleError('COMMAND_INVALID', 'Qaror confirm yoki dismiss bo‘lishi kerak');
      }
      return {
        candidateTicketNumber: required(
          parts[1],
          '/duplicate TICKET CANDIDATE confirm|dismiss',
        ).toUpperCase(),
        decision: rawDecision === 'confirm' ? 'CONFIRMED' : 'DISMISSED',
        kind: 'duplicate-decision',
        ticketNumber: ticket(),
      };
    }
    case '/override': {
      const rawBand = required(parts[2], '/override TICKET SCORE BAND sabab').toUpperCase();
      if (!priorityBands.includes(rawBand as PriorityBand)) {
        throw new DomainRuleError('COMMAND_INVALID', `BAND: ${priorityBands.join('|')}`);
      }
      return {
        band: rawBand as PriorityBand,
        kind: 'override',
        reason: required(parts.slice(3).join(' '), '/override TICKET SCORE BAND sabab'),
        score: numeric(parts[1], '/override TICKET SCORE BAND sabab'),
        ticketNumber: ticket(),
      };
    }
    case '/register':
      return { kind: 'register', ticketNumber: ticket() };
    case '/reject':
      return {
        kind: 'reject',
        reason: required(parts.slice(1).join(' '), '/reject TICKET sabab'),
        ticketNumber: ticket(),
      };
    case '/executors':
      return { kind: 'executors', orderNumber: ticket() };
    case '/assign': {
      const usage = '/assign ORDER EXECUTOR_CODE DD.MM.YYYY HH:mm';
      return {
        dueAt: deadline(parts, 2, usage).dueAt,
        executorCode: required(parts[1], usage).toUpperCase(),
        kind: 'assign',
        orderNumber: ticket(),
      };
    }
    case '/mine':
      return { kind: 'my-orders' };
    case '/accept':
      return { kind: 'accept-assignment', orderNumber: ticket() };
    case '/decline':
      return {
        kind: 'decline-assignment',
        orderNumber: ticket(),
        reason: required(parts.slice(1).join(' '), '/decline ORDER sabab'),
      };
    case '/progress':
      return {
        kind: 'progress',
        note: required(parts.slice(1).join(' '), '/progress ORDER yozuv'),
        orderNumber: ticket(),
      };
    case '/block':
      return {
        blockerReason: required(parts.slice(1).join(' '), '/block ORDER sabab'),
        kind: 'block',
        orderNumber: ticket(),
      };
    case '/unblock': {
      const note = parts.slice(1).join(' ').trim();
      return { kind: 'unblock', ...(note ? { note } : {}), orderNumber: ticket() };
    }
    case '/complete':
      return {
        kind: 'complete-work',
        orderNumber: ticket(),
        summary: required(parts.slice(1).join(' '), '/complete ORDER yakuniy hisobot'),
      };
    case '/overdue':
      return { kind: 'overdue' };
    case '/ackoverdue':
      return { kind: 'acknowledge-overdue', orderNumber: ticket() };
    case '/resolveoverdue':
      return { kind: 'resolve-overdue', orderNumber: ticket() };
    case '/failednotifications':
      return { kind: 'failed-notifications' };
    case '/retrynotification':
      return { code: ticket(), kind: 'retry-notification' };
    case '/report':
      return { kind: 'report', period: reportPeriod(parts[0]) };
    case '/reportcsv':
      return { kind: 'report-export', period: reportPeriod(parts[0]) };
    case '/pdca': {
      const operation = parts[0]?.toLowerCase();
      if (!operation || operation === 'list') return { kind: 'pdca-list' };
      if (operation === 'new') {
        const usage = '/pdca new AREA DD.MM.YYYY HH:mm title | problem | action | expected outcome';
        const parsedDeadline = deadline(parts, 2, usage);
        const fields = parts
          .slice(parsedDeadline.next)
          .join(' ')
          .split('|')
          .map((value) => value.trim());
        if (fields.length !== 4) {
          throw new DomainRuleError('COMMAND_INVALID', `Foydalanish: ${usage}`);
        }
        const [title, problemStatement, plannedAction, expectedOutcome] = fields;
        return {
          areaCode: required(parts[1], usage).toUpperCase(),
          input: {
            dueAt: parsedDeadline.dueAt,
            expectedOutcome: required(expectedOutcome, usage),
            plannedAction: required(plannedAction, usage),
            problemStatement: required(problemStatement, usage),
            title: required(title, usage),
          },
          kind: 'pdca-create',
        };
      }
      if (operation === 'move') {
        return {
          code: required(parts[1], '/pdca move PDC_CODE STAGE reason').toUpperCase(),
          kind: 'pdca-transition',
          reason: required(parts.slice(3).join(' '), '/pdca move PDC_CODE STAGE reason'),
          to: pdcaStage(parts[2]),
        };
      }
      throw new DomainRuleError('COMMAND_INVALID', 'Foydalanish: /pdca [list|new|move]');
    }
    case '/checklist':
      return { kind: 'quality-checklist', orderNumber: ticket() };
    case '/inspect':
      return {
        kind: 'quality-inspection',
        orderNumber: ticket(),
        results: inspectionResults(parts[1]),
        summary: required(
          parts.slice(2).join(' '),
          '/inspect ORDER CODE=PASS,CODE=FAIL qisqa xulosa',
        ),
      };
    case '/approve':
      return { kind: 'approve-work', orderNumber: ticket() };
    case '/rework':
      return {
        kind: 'require-rework',
        orderNumber: ticket(),
        reason: required(parts.slice(1).join(' '), '/rework ORDER sabab'),
      };
    case '/startrework':
      return { kind: 'start-rework', orderNumber: ticket() };
    case '/complaints':
      return { kind: 'complaints' };
    case '/reopen':
      return {
        complaintCode: ticket(),
        kind: 'reopen',
        reason: required(parts.slice(1).join(' '), '/reopen COMPLAINT_CODE sabab'),
      };
    case '/closecomplaint': {
      const rawOutcome = required(
        parts[1],
        '/closecomplaint COMPLAINT_CODE resolve|reject sabab',
      ).toLowerCase();
      if (rawOutcome !== 'resolve' && rawOutcome !== 'reject') {
        throw new DomainRuleError('COMMAND_INVALID', 'Qaror resolve yoki reject bo‘lishi kerak');
      }
      return {
        complaintCode: ticket(),
        kind: 'complaint-decision',
        outcome: rawOutcome === 'resolve' ? 'RESOLVED' : 'REJECTED',
        reason: required(
          parts.slice(2).join(' '),
          '/closecomplaint COMPLAINT_CODE resolve|reject sabab',
        ),
      };
    }
    default:
      return 'help';
  }
}

export class StaffTelegramController {
  constructor(private readonly operations: StaffOperations) {}

  async handle(
    telegramUserId: bigint,
    text: string,
    language: BotLanguage = 'uz',
  ): Promise<StaffOperationResult> {
    const command = parse(text);
    return command === 'help'
      ? help(language)
      : language === 'uz'
        ? this.operations.execute(telegramUserId, command)
        : this.operations.execute(telegramUserId, command, language);
  }

  async handleEvidence(
    telegramUserId: bigint,
    caption: string,
    photo: { readonly fileId: string; readonly fileSize: number; readonly fileUniqueId: string },
    language: BotLanguage = 'uz',
  ): Promise<string> {
    const [command, rawOrderNumber, rawPhase, ...noteParts] = caption.trim().split(/\s+/u);
    if (command?.split('@')[0]?.toLocaleLowerCase('en-US') !== '/evidence') {
      throw new DomainRuleError('COMMAND_INVALID', 'Foto izohi: /evidence ORDER BEFORE|AFTER izoh');
    }
    const orderNumber = required(rawOrderNumber, '/evidence ORDER BEFORE|AFTER izoh').toUpperCase();
    const phase = required(rawPhase, '/evidence ORDER BEFORE|AFTER izoh').toUpperCase();
    if (phase !== 'BEFORE' && phase !== 'AFTER') {
      throw new DomainRuleError(
        'COMMAND_INVALID',
        'Evidence phase BEFORE yoki AFTER bo‘lishi kerak',
      );
    }
    const operation = {
      evidence: {
        fileId: photo.fileId,
        fileSize: photo.fileSize,
        fileUniqueId: photo.fileUniqueId,
        mediaType: 'image/jpeg',
        ...(noteParts.length > 0 ? { note: noteParts.join(' ') } : {}),
        phase,
      },
      kind: 'work-evidence',
      orderNumber,
    } as const;
    const result =
      language === 'uz'
        ? await this.operations.execute(telegramUserId, operation)
        : await this.operations.execute(telegramUserId, operation, language);
    if (typeof result !== 'string') throw new Error('Evidence operation returned a document');
    return result;
  }
}
