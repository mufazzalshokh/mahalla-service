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

export interface StaffOperations {
  execute(telegramUserId: bigint, command: StaffOperationCommand): Promise<string>;
}

export type StaffOperationCommand =
  | { readonly kind: 'queue' }
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
  | { readonly kind: 'overdue' };

export interface StaffOperationDependencies {
  readonly assessPriority: AssessPriorityService;
  readonly decideDuplicate: DecideDuplicateService;
  readonly execution: ExecutionService;
  readonly listQueue: ListValidationQueueService;
  readonly overridePriority: OverridePriorityService;
  readonly principals: PrincipalProvider;
  readonly registerRequest: RegisterRequestAsOrderService;
  readonly suggestDuplicates: SuggestDuplicatesService;
  readonly transitionRequest: TransitionRequestService;
}

export class StaffOperationsService implements StaffOperations {
  constructor(private readonly dependencies: StaffOperationDependencies) {}

  async execute(telegramUserId: bigint, command: StaffOperationCommand): Promise<string> {
    const principal = await this.dependencies.principals.loadByTelegramUserId(telegramUserId);
    if (!principal) throw new AuthorizationError('active staff account');
    switch (command.kind) {
      case 'queue': {
        const requests = await this.dependencies.listQueue.execute(principal);
        if (requests.length === 0) return 'Tekshiruv navbati bo‘sh.';
        return requests.map(({ status, ticketNumber }) => `${ticketNumber} — ${status}`).join('\n');
      }
      case 'validate': {
        const request = await this.dependencies.transitionRequest.execute(
          { data: {}, ticketNumber: command.ticketNumber, to: 'VALIDATING' },
          principal,
        );
        return `${request.ticketNumber}: tekshiruv boshlandi.`;
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
        return `${request.ticketNumber}: qo‘shimcha ma’lumot so‘raldi.`;
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
        return `${command.ticketNumber}: ustuvorlik ${assessment.effectiveScore} (${assessment.effectiveBand}).`;
      }
      case 'duplicates': {
        const suggestions = await this.dependencies.suggestDuplicates.execute(
          command.ticketNumber,
          principal,
        );
        if (suggestions.length === 0)
          return `${command.ticketNumber}: o‘xshash murojaat topilmadi.`;
        return suggestions
          .map(
            ({ candidateTicketNumber, score, status }) =>
              `${candidateTicketNumber} — ${score}% (${status})`,
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
        return `${match.candidateTicketNumber}: ${match.status}.`;
      }
      case 'override': {
        const assessment = await this.dependencies.overridePriority.execute(
          command.ticketNumber,
          command.score,
          command.band,
          command.reason,
          principal,
        );
        return `${command.ticketNumber}: yangi ustuvorlik ${assessment.effectiveScore} (${assessment.effectiveBand}).`;
      }
      case 'register': {
        const result = await this.dependencies.registerRequest.execute(
          command.ticketNumber,
          principal,
        );
        return `${result.ticketNumber}: ${result.orderNumber}${result.linkedToExistingOrder ? ' bilan birlashtirildi' : ' yaratildi'}.`;
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
        return `${request.ticketNumber}: rad etildi.`;
      }
      case 'executors': {
        const executors = await this.dependencies.execution.listEligibleExecutors(
          command.orderNumber,
          principal,
        );
        return executors.length === 0
          ? 'Mos va mavjud ijrochi topilmadi.'
          : executors.map(({ code, displayName }) => `${code} — ${displayName}`).join('\n');
      }
      case 'assign': {
        const order = await this.dependencies.execution.assign(
          command.orderNumber,
          command.executorCode,
          command.dueAt,
          principal,
        );
        return `${order.orderNumber}: ijrochi tayinlandi, muddat ${command.dueAt.toISOString()}.`;
      }
      case 'my-orders': {
        const orders = await this.dependencies.execution.listMine(principal);
        return orders.length === 0
          ? 'Sizga biriktirilgan faol buyurtma yo‘q.'
          : orders
              .map(
                ({ dueAt, orderNumber, status }) =>
                  `${orderNumber} — ${status}${dueAt ? ` — ${dueAt.toISOString()}` : ''}`,
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
        return `${order.orderNumber}: topshiriq qabul qilindi.`;
      }
      case 'decline-assignment': {
        const order = await this.dependencies.execution.transition(
          command.orderNumber,
          'REGISTERED',
          { reason: command.reason },
          principal,
        );
        return `${order.orderNumber}: topshiriq rad etildi.`;
      }
      case 'progress':
        await this.dependencies.execution.addProgress(command.orderNumber, command.note, principal);
        return `${command.orderNumber}: ish yozuvi saqlandi.`;
      case 'block': {
        const order = await this.dependencies.execution.transition(
          command.orderNumber,
          'BLOCKED',
          { blockerReason: command.blockerReason },
          principal,
        );
        return `${order.orderNumber}: ish to‘siq sababli pauzaga qo‘yildi.`;
      }
      case 'unblock': {
        const order = await this.dependencies.execution.transition(
          command.orderNumber,
          'IN_PROGRESS',
          { ...(command.note ? { progressNote: command.note } : {}) },
          principal,
        );
        return `${order.orderNumber}: ish davom ettirildi.`;
      }
      case 'complete-work': {
        const order = await this.dependencies.execution.transition(
          command.orderNumber,
          'AWAITING_ACCEPTANCE',
          { completionSummary: command.summary },
          principal,
        );
        return `${order.orderNumber}: yakunlash tekshiruvga yuborildi.`;
      }
      case 'work-evidence':
        await this.dependencies.execution.addEvidence(
          command.orderNumber,
          command.evidence,
          principal,
        );
        return `${command.orderNumber}: ${command.evidence.phase} fotosi saqlandi.`;
      case 'overdue': {
        const escalations = await this.dependencies.execution.scanOverdue(principal);
        return escalations.length === 0
          ? 'Muddati o‘tgan faol buyurtma yo‘q.'
          : escalations
              .map(
                ({ dueAt, orderNumber, status }) =>
                  `${orderNumber} — ${dueAt.toISOString()} (${status})`,
              )
              .join('\n');
      }
    }
  }
}
