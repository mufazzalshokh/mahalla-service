import { hasPermission, type Principal } from '../identity/permissions.js';
import {
  ActorConstraintError,
  AuthorizationError,
  DomainRuleError,
  InvalidTransitionError,
  MissingTransitionDataError,
} from '../shared/domain-errors.js';
import {
  transitionKey,
  type TransitionDefinition,
  type TransitionPlan,
} from '../workflow/transition-types.js';

export const orderStatuses = [
  'REGISTERED',
  'ASSIGNED',
  'IN_PROGRESS',
  'BLOCKED',
  'AWAITING_ACCEPTANCE',
  'REWORK_REQUIRED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type OrderStatus = (typeof orderStatuses)[number];

export interface OrderSnapshot {
  readonly assignedExecutorUserId: string | null;
  readonly categoryId: string;
  readonly id: string;
  readonly serviceAreaId: string;
  readonly status: OrderStatus;
  readonly version: number;
}

export interface OrderTransitionData {
  readonly acceptanceSource?: 'OPERATOR' | 'RESIDENT';
  readonly assigneeUserId?: string;
  readonly cancellationReason?: string;
  readonly completionSummary?: string;
  readonly dueAt?: Date;
  readonly reason?: string;
  readonly reworkReason?: string;
  readonly reworkDueAt?: Date;
  readonly complaintId?: string;
  readonly inspectionId?: string;
  readonly warrantyDays?: number;
  readonly blockerReason?: string;
  readonly progressNote?: string;
}

export type OrderDataKey = keyof OrderTransitionData;

const sharedFailure = 'Reject the command without changing order state or emitting side effects.';
const noCompensation =
  'No compensation is required because persistence and audit commit atomically.';

export const orderTransitionDefinitions: readonly TransitionDefinition<
  OrderStatus,
  OrderDataKey
>[] = [
  {
    auditEvent: 'order.assigned',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'REGISTERED',
    notification: 'executor.assignment_created',
    permission: 'order.assign',
    preconditions: [
      'Executor is active and authorized for the service area.',
      'Deadline is in the future.',
    ],
    requiredData: ['assigneeUserId', 'dueAt'],
    sideEffects: ['Set current executor and deadline.', 'Append status history.'],
    slaEffect: 'none',
    to: 'ASSIGNED',
  },
  {
    auditEvent: 'assignment.rejected',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'ASSIGNED',
    notification: 'operator.assignment_rejected',
    permission: 'assignment.respond',
    preconditions: ['Actor is the currently assigned executor.'],
    requiredData: ['reason'],
    sideEffects: ['Clear current executor.', 'Append status history.'],
    slaEffect: 'none',
    to: 'REGISTERED',
  },
  {
    auditEvent: 'assignment.accepted',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'ASSIGNED',
    notification: 'resident.status_changed',
    permission: 'assignment.respond',
    preconditions: ['Actor is the currently assigned executor.'],
    requiredData: [],
    sideEffects: ['Append status history.'],
    slaEffect: 'start_execution',
    to: 'IN_PROGRESS',
  },
  {
    auditEvent: 'order.blocked',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'IN_PROGRESS',
    notification: 'operator.order_blocked',
    permission: 'order.update_progress',
    preconditions: ['Actor is the currently assigned executor.'],
    requiredData: ['blockerReason'],
    sideEffects: ['Record blocker reason.', 'Append status history.'],
    slaEffect: 'pause_blocked',
    to: 'BLOCKED',
  },
  {
    auditEvent: 'order.unblocked',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'BLOCKED',
    notification: 'resident.status_changed',
    permission: 'order.update_progress',
    preconditions: ['Actor is the currently assigned executor.', 'Blocker is resolved.'],
    requiredData: [],
    sideEffects: ['Clear blocker reason.', 'Append status history.'],
    slaEffect: 'resume_execution',
    to: 'IN_PROGRESS',
  },
  {
    auditEvent: 'order.completion_submitted',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'IN_PROGRESS',
    notification: 'resident.acceptance_requested',
    permission: 'order.submit_completion',
    preconditions: [
      'Actor is the currently assigned executor.',
      'Required evidence is present when configured.',
    ],
    requiredData: ['completionSummary'],
    sideEffects: ['Record completion summary.', 'Append status history.'],
    slaEffect: 'stop_execution',
    to: 'AWAITING_ACCEPTANCE',
  },
  {
    auditEvent: 'order.rework_required',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'AWAITING_ACCEPTANCE',
    notification: 'executor.rework_required',
    permission: 'quality.require_rework',
    preconditions: ['Actor is authorized to inspect or accept the work.'],
    requiredData: ['reworkReason', 'reworkDueAt'],
    sideEffects: [
      'Record rework decision.',
      'Create a rework assignment and SLA.',
      'Append status history.',
    ],
    slaEffect: 'none',
    to: 'REWORK_REQUIRED',
  },
  {
    auditEvent: 'order.rework_started',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'REWORK_REQUIRED',
    notification: 'resident.status_changed',
    permission: 'order.start_rework',
    preconditions: ['Actor is the currently assigned executor.'],
    requiredData: [],
    sideEffects: ['Append status history.'],
    slaEffect: 'start_execution',
    to: 'IN_PROGRESS',
  },
  {
    auditEvent: 'order.completed',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'AWAITING_ACCEPTANCE',
    notification: 'resident.status_changed',
    permission: 'quality.accept',
    preconditions: ['Actor is authorized to inspect or accept the work.'],
    requiredData: ['acceptanceSource', 'warrantyDays'],
    sideEffects: [
      'Record acceptance.',
      'Set completion and warranty timestamps.',
      'Append status history.',
    ],
    slaEffect: 'stop_execution',
    to: 'COMPLETED',
  },
  {
    auditEvent: 'order.complaint_reopened',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'COMPLETED',
    notification: 'executor.rework_required',
    permission: 'quality.reopen',
    preconditions: [
      'Actor is authorized to review complaints.',
      'Complaint is open and linked to this order.',
    ],
    requiredData: ['complaintId', 'reworkReason', 'reworkDueAt'],
    sideEffects: [
      'Mark complaint as reopened.',
      'Create a rework assignment and SLA.',
      'Append status history.',
    ],
    slaEffect: 'none',
    to: 'REWORK_REQUIRED',
  },
  ...(['REGISTERED', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'] as const).map(
    (from): TransitionDefinition<OrderStatus, OrderDataKey> => ({
      auditEvent: 'order.cancelled',
      compensation: noCompensation,
      failureBehavior: sharedFailure,
      from,
      notification: 'resident.status_changed',
      permission: 'order.cancel',
      preconditions: ['Cancellation policy permits cancellation at the current stage.'],
      requiredData: ['cancellationReason'],
      sideEffects: ['Record cancellation reason.', 'Append status history.'],
      slaEffect: 'stop_execution',
      to: 'CANCELLED',
    }),
  ),
];

const orderTransitions = new Map(
  orderTransitionDefinitions.map((definition) => [
    transitionKey(definition.from, definition.to),
    definition,
  ]),
);

function requireData(data: OrderTransitionData, fields: readonly OrderDataKey[]): void {
  for (const field of fields) {
    const value = data[field];
    const present =
      value instanceof Date
        ? !Number.isNaN(value.valueOf())
        : typeof value === 'number'
          ? Number.isFinite(value)
          : typeof value === 'string' && value.trim().length > 0;
    if (!present) throw new MissingTransitionDataError(field);
  }
}

function requiresCurrentExecutor(from: OrderStatus, to: OrderStatus): boolean {
  return (
    (from === 'ASSIGNED' && (to === 'REGISTERED' || to === 'IN_PROGRESS')) ||
    (from === 'IN_PROGRESS' && (to === 'BLOCKED' || to === 'AWAITING_ACCEPTANCE')) ||
    (from === 'BLOCKED' && to === 'IN_PROGRESS') ||
    (from === 'REWORK_REQUIRED' && to === 'IN_PROGRESS')
  );
}

export function planOrderTransition(
  order: OrderSnapshot,
  to: OrderStatus,
  data: OrderTransitionData,
  principal: Principal,
  now: Date = new Date(),
): TransitionPlan<OrderStatus, OrderDataKey> {
  const definition = orderTransitions.get(transitionKey(order.status, to));
  if (!definition) throw new InvalidTransitionError(order.status, to);
  if (!hasPermission(principal, definition.permission, order.serviceAreaId)) {
    throw new AuthorizationError(definition.permission);
  }
  if (
    requiresCurrentExecutor(order.status, to) &&
    order.assignedExecutorUserId !== principal.userId
  ) {
    throw new ActorConstraintError(
      'Only the currently assigned executor may perform this transition',
    );
  }

  requireData(data, definition.requiredData);
  if (order.status === 'REGISTERED' && to === 'ASSIGNED' && data.dueAt && data.dueAt <= now) {
    throw new DomainRuleError('DEADLINE_NOT_FUTURE', 'Assignment deadline must be in the future');
  }
  if (to === 'REWORK_REQUIRED' && data.reworkDueAt && data.reworkDueAt <= now) {
    throw new DomainRuleError(
      'REWORK_DEADLINE_NOT_FUTURE',
      'Rework deadline must be in the future',
    );
  }
  if (to === 'COMPLETED' && data.warrantyDays !== undefined) {
    if (!Number.isInteger(data.warrantyDays) || data.warrantyDays < 0 || data.warrantyDays > 365) {
      throw new DomainRuleError('WARRANTY_DAYS_INVALID', 'Warranty days must be from 0 to 365');
    }
  }

  return { definition, from: order.status, to };
}
