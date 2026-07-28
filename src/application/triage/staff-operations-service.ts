import type { PrincipalProvider } from '../identity/principal-provider.js';
import type { TransitionRequestService } from '../requests/transition-request-service.js';
import { AuthorizationError } from '../../domain/shared/domain-errors.js';
import type {
  AssessPriorityService,
  DecideDuplicateService,
  ListValidationQueueService,
  OverridePriorityService,
  RegisterRequestAsOrderService,
  SuggestDuplicatesService,
} from './triage-services.js';
import type { PriorityBand } from '../../domain/priority/priority-calculator.js';
import type { WorkEvidenceInput } from '../../domain/execution/work-evidence-policy.js';
import type { ExecutionService } from '../execution/execution-service.js';
import type { QualityService } from '../quality/quality-service.js';
import type { InspectionItemInput } from '../../domain/quality/quality-policy.js';
import type { NotificationService } from '../notifications/notification-service.js';
import type { ReportingService } from '../reporting/reporting-service.js';
import { formatOperationalReport } from '../reporting/report-format.js';
import type { ReportPeriodKind } from '../../domain/reporting/reporting-period.js';
import type { PdcaActionInput, PdcaStage } from '../../domain/pdca/pdca-policy.js';
import type { PdcaService } from '../pdca/pdca-service.js';
import { formatTashkentDateTime } from '../../domain/shared/tashkent-date-time.js';
import type { BotLanguage } from '../localization/bot-language.js';
import { staffMessage, staffStatus } from './staff-messages.js';

export interface StaffDocumentResult {
  readonly caption: string;
  readonly content: string;
  readonly fileName: string;
  readonly kind: 'document';
}

export type StaffOperationResult = string | StaffDocumentResult;

export interface StaffOperations {
  execute(
    telegramUserId: bigint,
    command: StaffOperationCommand,
    language?: BotLanguage,
  ): Promise<StaffOperationResult>;
}

export type StaffOperationCommand =
  | { readonly kind: 'queue' }
  | { readonly kind: 'request-details'; readonly ticketNumber: string }
  | { readonly kind: 'validate'; readonly ticketNumber: string }
  | { readonly kind: 'information'; readonly question: string; readonly ticketNumber: string }
  | {
      readonly affected: number;
      readonly kind: 'triage';
      readonly safety: number;
      readonly social: number;
      readonly ticketNumber: string;
      readonly urgency: number;
    }
  | { readonly kind: 'duplicates'; readonly ticketNumber: string }
  | {
      readonly candidateTicketNumber: string;
      readonly decision: 'CONFIRMED' | 'DISMISSED';
      readonly kind: 'duplicate-decision';
      readonly ticketNumber: string;
    }
  | {
      readonly band: PriorityBand;
      readonly kind: 'override';
      readonly reason: string;
      readonly score: number;
      readonly ticketNumber: string;
    }
  | { readonly kind: 'register'; readonly ticketNumber: string }
  | { readonly kind: 'reject'; readonly reason: string; readonly ticketNumber: string }
  | { readonly kind: 'executors'; readonly orderNumber: string }
  | {
      readonly dueAt: Date;
      readonly executorCode: string;
      readonly kind: 'assign';
      readonly orderNumber: string;
    }
  | { readonly kind: 'my-orders' }
  | { readonly kind: 'accept-assignment'; readonly orderNumber: string }
  | { readonly kind: 'decline-assignment'; readonly orderNumber: string; readonly reason: string }
  | { readonly kind: 'progress'; readonly note: string; readonly orderNumber: string }
  | { readonly blockerReason: string; readonly kind: 'block'; readonly orderNumber: string }
  | { readonly kind: 'unblock'; readonly note?: string; readonly orderNumber: string }
  | { readonly kind: 'complete-work'; readonly orderNumber: string; readonly summary: string }
  | {
      readonly evidence: WorkEvidenceInput;
      readonly kind: 'work-evidence';
      readonly orderNumber: string;
    }
  | { readonly kind: 'overdue' }
  | { readonly kind: 'acknowledge-overdue'; readonly orderNumber: string }
  | { readonly kind: 'resolve-overdue'; readonly orderNumber: string }
  | { readonly kind: 'failed-notifications' }
  | { readonly code: string; readonly kind: 'retry-notification' }
  | { readonly kind: 'report'; readonly period: ReportPeriodKind }
  | { readonly kind: 'report-export'; readonly period: ReportPeriodKind }
  | { readonly kind: 'pdca-list' }
  | {
      readonly areaCode: string;
      readonly input: PdcaActionInput;
      readonly kind: 'pdca-create';
    }
  | {
      readonly code: string;
      readonly kind: 'pdca-transition';
      readonly reason: string;
      readonly to: PdcaStage;
    }
  | { readonly kind: 'quality-checklist'; readonly orderNumber: string }
  | {
      readonly kind: 'quality-inspection';
      readonly orderNumber: string;
      readonly results: readonly InspectionItemInput[];
      readonly summary: string;
    }
  | { readonly kind: 'approve-work'; readonly orderNumber: string }
  | { readonly kind: 'require-rework'; readonly orderNumber: string; readonly reason: string }
  | { readonly kind: 'start-rework'; readonly orderNumber: string }
  | { readonly kind: 'complaints' }
  | { readonly complaintCode: string; readonly kind: 'reopen'; readonly reason: string }
  | {
      readonly complaintCode: string;
      readonly kind: 'complaint-decision';
      readonly outcome: 'RESOLVED' | 'REJECTED';
      readonly reason: string;
    };

export interface StaffOperationDependencies {
  readonly assessPriority: AssessPriorityService;
  readonly decideDuplicate: DecideDuplicateService;
  readonly execution: ExecutionService;
  readonly listQueue: ListValidationQueueService;
  readonly notifications: NotificationService;
  readonly overridePriority: OverridePriorityService;
  readonly principals: PrincipalProvider;
  readonly quality: QualityService;
  readonly pdca: PdcaService;
  readonly reporting: ReportingService;
  readonly registerRequest: RegisterRequestAsOrderService;
  readonly suggestDuplicates: SuggestDuplicatesService;
  readonly transitionRequest: TransitionRequestService;
}

export class StaffOperationsService implements StaffOperations {
  constructor(private readonly dependencies: StaffOperationDependencies) {}

  async execute(
    telegramUserId: bigint,
    command: StaffOperationCommand,
    language: BotLanguage = 'uz',
  ): Promise<StaffOperationResult> {
    const principal = await this.dependencies.principals.loadByTelegramUserId(telegramUserId);
    if (!principal) throw new AuthorizationError('active staff account');
    switch (command.kind) {
      case 'queue': {
        const requests = await this.dependencies.listQueue.execute(principal);
        if (requests.length === 0) return staffMessage(language, 'no_queue');
        return requests
          .map(({ status, ticketNumber }) => `${ticketNumber} — ${staffStatus(language, status)}`)
          .join('\n');
      }
      case 'request-details': {
        const details = await this.dependencies.listQueue.details(command.ticketNumber, principal);
        const urgency = details.residentDeclaredUrgency
          ? staffStatus(language, details.residentDeclaredUrgency)
          : language === 'ru'
            ? 'не указана'
            : 'ko‘rsatilmagan';
        const visit = details.visitAsSoonAsPossible
          ? language === 'ru'
            ? 'как можно скорее'
            : 'imkon qadar tez'
          : details.preferredVisitStart && details.preferredVisitEnd
            ? `${formatTashkentDateTime(details.preferredVisitStart)}–${formatTashkentDateTime(details.preferredVisitEnd).slice(-5)}`
            : language === 'ru'
              ? 'не указано'
              : 'ko‘rsatilmagan';
        const category = language === 'ru' ? details.categoryNameRu : details.categoryNameUzLatn;
        return language === 'ru'
          ? `📋 ${details.ticketNumber}\n👤 ${details.fullName ?? 'Не указано'}\n📱 ${details.phone ?? 'Не указано'}\n🧰 ${category}\n⏱ Заявленная срочность: ${urgency}\n📝 ${details.description}\n📍 ${details.addressLine}\n🕐 Желаемое время: ${visit}\n📌 Статус: ${staffStatus(language, details.status)}`
          : `📋 ${details.ticketNumber}\n👤 ${details.fullName ?? 'Ko‘rsatilmagan'}\n📱 ${details.phone ?? 'Ko‘rsatilmagan'}\n🧰 ${category}\n⏱ Bildirilgan shoshilinchlik: ${urgency}\n📝 ${details.description}\n📍 ${details.addressLine}\n🕐 Qulay vaqt: ${visit}\n📌 Holat: ${staffStatus(language, details.status)}`;
      }
      case 'validate': {
        const request = await this.dependencies.transitionRequest.execute(
          { data: {}, ticketNumber: command.ticketNumber, to: 'VALIDATING' },
          principal,
        );
        return staffMessage(language, 'validation_started', { reference: request.ticketNumber });
      }
      case 'information': {
        const request = await this.dependencies.transitionRequest.execute(
          {
            data: { informationRequest: command.question },
            ticketNumber: command.ticketNumber,
            to: 'NEEDS_INFORMATION',
          },
          principal,
        );
        return staffMessage(language, 'information_requested', { reference: request.ticketNumber });
      }
      case 'triage': {
        const assessment = await this.dependencies.assessPriority.execute(
          command.ticketNumber,
          {
            RESIDENTS_AFFECTED: command.affected,
            SAFETY_RISK: command.safety,
            SOCIAL_IMPACT: command.social,
            URGENCY: command.urgency,
          },
          principal,
        );
        return staffMessage(language, 'priority_set', {
          reference: command.ticketNumber,
          score: assessment.effectiveScore,
          status: staffStatus(language, assessment.effectiveBand),
        });
      }
      case 'duplicates': {
        const suggestions = await this.dependencies.suggestDuplicates.execute(
          command.ticketNumber,
          principal,
        );
        if (suggestions.length === 0)
          return staffMessage(language, 'no_duplicates', { reference: command.ticketNumber });
        return suggestions
          .map(
            ({ candidateTicketNumber, score, status }) =>
              `${candidateTicketNumber} — ${score}% (${staffStatus(language, status)})`,
          )
          .join('\n');
      }
      case 'duplicate-decision': {
        const match = await this.dependencies.decideDuplicate.execute(
          command.ticketNumber,
          command.candidateTicketNumber,
          command.decision,
          principal,
        );
        return staffMessage(language, 'duplicate_decided', {
          reference: match.candidateTicketNumber,
          status: staffStatus(language, match.status),
        });
      }
      case 'override': {
        const assessment = await this.dependencies.overridePriority.execute(
          command.ticketNumber,
          command.score,
          command.band,
          command.reason,
          principal,
        );
        return staffMessage(language, 'priority_overridden', {
          reference: command.ticketNumber,
          score: assessment.effectiveScore,
          status: staffStatus(language, assessment.effectiveBand),
        });
      }
      case 'register': {
        const result = await this.dependencies.registerRequest.execute(
          command.ticketNumber,
          principal,
        );
        return staffMessage(
          language,
          result.linkedToExistingOrder ? 'registered_linked' : 'registered_new',
          { order: result.orderNumber, reference: result.ticketNumber },
        );
      }
      case 'reject': {
        const request = await this.dependencies.transitionRequest.execute(
          {
            data: { rejectionReason: command.reason },
            ticketNumber: command.ticketNumber,
            to: 'REJECTED',
          },
          principal,
        );
        return staffMessage(language, 'rejected', { reference: request.ticketNumber });
      }
      case 'executors': {
        const executors = await this.dependencies.execution.listEligibleExecutors(
          command.orderNumber,
          principal,
        );
        return executors.length === 0
          ? staffMessage(language, 'no_executors')
          : executors.map(({ code, displayName }) => `${code} — ${displayName}`).join('\n');
      }
      case 'assign': {
        const order = await this.dependencies.execution.assign(
          command.orderNumber,
          command.executorCode,
          command.dueAt,
          principal,
        );
        return staffMessage(language, 'assignment_created', {
          dueAt: formatTashkentDateTime(command.dueAt),
          reference: order.orderNumber,
        });
      }
      case 'my-orders': {
        const orders = await this.dependencies.execution.listMine(principal);
        return orders.length === 0
          ? staffMessage(language, 'no_orders')
          : orders
              .map(
                ({ dueAt, orderNumber, status }) =>
                  `${orderNumber} — ${staffStatus(language, status)}${dueAt ? ` — ${formatTashkentDateTime(dueAt)}` : ''}`,
              )
              .join('\n');
      }
      case 'accept-assignment': {
        const order = await this.dependencies.execution.transition(
          command.orderNumber,
          'IN_PROGRESS',
          {},
          principal,
        );
        return staffMessage(language, 'assignment_accepted', { reference: order.orderNumber });
      }
      case 'decline-assignment': {
        const order = await this.dependencies.execution.transition(
          command.orderNumber,
          'REGISTERED',
          { reason: command.reason },
          principal,
        );
        return staffMessage(language, 'assignment_declined', { reference: order.orderNumber });
      }
      case 'progress':
        await this.dependencies.execution.addProgress(command.orderNumber, command.note, principal);
        return staffMessage(language, 'progress_saved', { reference: command.orderNumber });
      case 'block': {
        const order = await this.dependencies.execution.transition(
          command.orderNumber,
          'BLOCKED',
          { blockerReason: command.blockerReason },
          principal,
        );
        return staffMessage(language, 'blocked', { reference: order.orderNumber });
      }
      case 'unblock': {
        const order = await this.dependencies.execution.transition(
          command.orderNumber,
          'IN_PROGRESS',
          { ...(command.note ? { progressNote: command.note } : {}) },
          principal,
        );
        return staffMessage(language, 'unblocked', { reference: order.orderNumber });
      }
      case 'complete-work': {
        const order = await this.dependencies.execution.transition(
          command.orderNumber,
          'AWAITING_ACCEPTANCE',
          { completionSummary: command.summary },
          principal,
        );
        return staffMessage(language, 'completion_submitted', { reference: order.orderNumber });
      }
      case 'work-evidence':
        await this.dependencies.execution.addEvidence(
          command.orderNumber,
          command.evidence,
          principal,
        );
        return staffMessage(language, 'evidence_saved', {
          phase: staffStatus(language, command.evidence.phase),
          reference: command.orderNumber,
        });
      case 'overdue': {
        const escalations = await this.dependencies.execution.scanOverdue(principal);
        return escalations.length === 0
          ? staffMessage(language, 'no_overdue')
          : escalations
              .map(
                ({ dueAt, orderNumber, status }) =>
                  `${orderNumber} — ${formatTashkentDateTime(dueAt)} (${staffStatus(language, status)})`,
              )
              .join('\n');
      }
      case 'acknowledge-overdue': {
        const escalation = await this.dependencies.execution.updateDeadlineEscalation(
          command.orderNumber,
          'ACKNOWLEDGED',
          principal,
        );
        return staffMessage(language, 'overdue_acknowledged', {
          reference: escalation.orderNumber,
        });
      }
      case 'resolve-overdue': {
        const escalation = await this.dependencies.execution.updateDeadlineEscalation(
          command.orderNumber,
          'RESOLVED',
          principal,
        );
        return staffMessage(language, 'overdue_resolved', { reference: escalation.orderNumber });
      }
      case 'failed-notifications': {
        const failures = await this.dependencies.notifications.listDeadLetters(principal);
        return failures.length === 0
          ? staffMessage(language, 'no_failed_notifications')
          : failures
              .map(
                ({ attemptCount, code, eventType, lastErrorCode }) =>
                  `${code} — ${eventType} — ${lastErrorCode ?? 'UNKNOWN'} (${attemptCount})`,
              )
              .join('\n');
      }
      case 'retry-notification':
        await this.dependencies.notifications.recover(command.code, principal);
        return staffMessage(language, 'retry_queued', { reference: command.code });
      case 'report':
        return formatOperationalReport(
          await this.dependencies.reporting.report(command.period, principal),
          language,
        );
      case 'report-export': {
        const exported = await this.dependencies.reporting.exportCsv(command.period, principal);
        return {
          caption:
            language === 'ru'
              ? `${command.period === 'WEEK' ? 'Недельный' : 'Месячный'} операционный отчёт`
              : `${command.period === 'WEEK' ? 'Haftalik' : 'Oylik'} operatsion hisobot`,
          content: exported.content,
          fileName: exported.fileName,
          kind: 'document',
        };
      }
      case 'pdca-list': {
        const actions = await this.dependencies.pdca.list(principal);
        return actions.length === 0
          ? staffMessage(language, 'no_pdca')
          : actions
              .map(
                ({ code, dueAt, overdue, stage, title }) =>
                  `${code} — ${staffStatus(language, stage)} — ${formatTashkentDateTime(dueAt)}${overdue ? ` — ${language === 'ru' ? 'СРОК ИСТЁК' : 'MUDDAT O‘TGAN'}` : ''} — ${title}`,
              )
              .join('\n');
      }
      case 'pdca-create': {
        const action = await this.dependencies.pdca.create(
          command.areaCode,
          command.input,
          principal,
        );
        return staffMessage(language, 'pdca_created', {
          dueAt: formatTashkentDateTime(action.dueAt),
          reference: action.code,
        });
      }
      case 'pdca-transition': {
        const action = await this.dependencies.pdca.transition(
          command.code,
          command.to,
          command.reason,
          principal,
        );
        return staffMessage(language, 'pdca_transitioned', {
          reference: action.code,
          status: staffStatus(language, action.stage),
        });
      }
      case 'quality-checklist': {
        const policy = await this.dependencies.quality.checklist(command.orderNumber, principal);
        return [
          `V${policy.templateVersion}${policy.inspectionRequired ? ` — ${language === 'ru' ? 'проверка обязательна' : 'tekshiruv majburiy'}` : ''}`,
          ...policy.items.map(
            ({ code, isRequired, labelRu, labelUzLatn }) =>
              `${code} — ${language === 'ru' ? labelRu : labelUzLatn}${isRequired ? ' *' : ''}`,
          ),
        ].join('\n');
      }
      case 'quality-inspection': {
        const inspection = await this.dependencies.quality.inspect(
          command.orderNumber,
          command.results,
          command.summary,
          principal,
        );
        return staffMessage(language, 'inspection_saved', {
          attempt: inspection.attempt,
          reference: command.orderNumber,
          status: staffStatus(language, inspection.outcome),
        });
      }
      case 'approve-work': {
        const order = await this.dependencies.quality.accept(
          command.orderNumber,
          'OPERATOR',
          principal,
        );
        return staffMessage(language, 'work_approved', { reference: order.orderNumber });
      }
      case 'require-rework': {
        const order = await this.dependencies.quality.requireRework(
          command.orderNumber,
          command.reason,
          'OPERATOR',
          principal,
        );
        return staffMessage(language, 'rework_required', { reference: order.orderNumber });
      }
      case 'start-rework': {
        const order = await this.dependencies.execution.transition(
          command.orderNumber,
          'IN_PROGRESS',
          {},
          principal,
        );
        return staffMessage(language, 'rework_started', { reference: order.orderNumber });
      }
      case 'complaints': {
        const complaints = await this.dependencies.quality.listComplaints(principal);
        return complaints.length === 0
          ? staffMessage(language, 'no_complaints')
          : complaints
              .map(
                ({ code, order, reviewDueAt, withinWarranty }) =>
                  `${code} — ${order.orderNumber} — ${formatTashkentDateTime(reviewDueAt)} — ${withinWarranty ? (language === 'ru' ? 'по гарантии' : 'kafolatda') : language === 'ru' ? 'вне гарантии' : 'kafolatdan tashqari'}`,
              )
              .join('\n');
      }
      case 'reopen': {
        const order = await this.dependencies.quality.reopen(
          command.complaintCode,
          command.reason,
          principal,
        );
        return staffMessage(language, 'complaint_reopened', { reference: order.orderNumber });
      }
      case 'complaint-decision':
        await this.dependencies.quality.decideComplaint(
          command.complaintCode,
          command.outcome,
          command.reason,
          principal,
        );
        return staffMessage(language, 'complaint_decided', {
          reference: command.complaintCode,
          status: staffStatus(language, command.outcome),
        });
    }
  }
}
