import { hasPermission, type Principal } from '../identity/permissions.js';
import {
  ActorConstraintError,
  AuthorizationError,
  InvalidTransitionError,
  MissingTransitionDataError,
} from '../shared/domain-errors.js';
import {
  transitionKey,
  type TransitionDefinition,
  type TransitionPlan,
} from '../workflow/transition-types.js';

export const requestStatuses = [
  'RECEIVED',
  'VALIDATING',
  'NEEDS_INFORMATION',
  'REGISTERED',
  'REJECTED',
  'CANCELLED',
] as const;

export type RequestStatus = (typeof requestStatuses)[number];

export interface ServiceRequestSnapshot {
  readonly id: string;
  readonly requesterUserId: string;
  readonly serviceAreaId: string;
  readonly status: RequestStatus;
  readonly version: number;
}

export interface RequestTransitionData {
  readonly cancellationReason?: string;
  readonly informationRequest?: string;
  readonly providedInformation?: string;
  readonly rejectionReason?: string;
}

type RequestDataKey = keyof RequestTransitionData;

const sharedFailure = 'Reject the command without changing request state or emitting side effects.';
const noCompensation =
  'No compensation is required because persistence and audit commit atomically.';

export const requestTransitionDefinitions: readonly TransitionDefinition<
  RequestStatus,
  RequestDataKey
>[] = [
  {
    auditEvent: 'request.validation_started',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'RECEIVED',
    notification: 'resident.status_changed',
    permission: 'request.validate',
    preconditions: ['Request has a source, requester, category and location.'],
    requiredData: [],
    sideEffects: ['Append request status history.'],
    slaEffect: 'start_validation',
    to: 'VALIDATING',
  },
  {
    auditEvent: 'request.information_requested',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'VALIDATING',
    notification: 'resident.information_requested',
    permission: 'request.request_information',
    preconditions: ['The missing information can be stated clearly.'],
    requiredData: ['informationRequest'],
    sideEffects: ['Append request status history.', 'Record the information request.'],
    slaEffect: 'pause_waiting_for_resident',
    to: 'NEEDS_INFORMATION',
  },
  {
    auditEvent: 'request.information_provided',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'NEEDS_INFORMATION',
    notification: 'resident.status_changed',
    permission: 'request.provide_information',
    preconditions: ['Actor is the requester or has area-scoped validation permission.'],
    requiredData: ['providedInformation'],
    sideEffects: ['Record the supplied information.', 'Append request status history.'],
    slaEffect: 'resume_validation',
    to: 'VALIDATING',
  },
  {
    auditEvent: 'request.registered',
    compensation:
      'If order creation fails, roll back request registration in the same transaction.',
    failureBehavior: sharedFailure,
    from: 'VALIDATING',
    notification: 'resident.status_changed',
    permission: 'request.register',
    preconditions: ['Validation is complete.', 'Duplicate review outcome is recorded.'],
    requiredData: [],
    sideEffects: ['Append request status history.', 'Create or link an order atomically.'],
    slaEffect: 'none',
    to: 'REGISTERED',
  },
  {
    auditEvent: 'request.rejected',
    compensation: noCompensation,
    failureBehavior: sharedFailure,
    from: 'VALIDATING',
    notification: 'resident.status_changed',
    permission: 'request.reject',
    preconditions: ['The rejection is permitted by an approved business rule.'],
    requiredData: ['rejectionReason'],
    sideEffects: ['Append request status history.', 'Record the rejection reason.'],
    slaEffect: 'none',
    to: 'REJECTED',
  },
  ...(['RECEIVED', 'VALIDATING', 'NEEDS_INFORMATION'] as const).map(
    (from): TransitionDefinition<RequestStatus, RequestDataKey> => ({
      auditEvent: 'request.cancelled',
      compensation: noCompensation,
      failureBehavior: sharedFailure,
      from,
      notification: 'resident.status_changed',
      permission: 'request.cancel.own',
      preconditions: ['Actor is the requester.'],
      requiredData: ['cancellationReason'],
      sideEffects: ['Append request status history.', 'Record the cancellation reason.'],
      slaEffect: 'none',
      to: 'CANCELLED',
    }),
  ),
];

const requestTransitions = new Map(
  requestTransitionDefinitions.map((definition) => [
    transitionKey(definition.from, definition.to),
    definition,
  ]),
);

function requireData(data: RequestTransitionData, fields: readonly RequestDataKey[]): void {
  for (const field of fields) {
    const value = data[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new MissingTransitionDataError(field);
    }
  }
}

export function planRequestTransition(
  request: ServiceRequestSnapshot,
  to: RequestStatus,
  data: RequestTransitionData,
  principal: Principal,
): TransitionPlan<RequestStatus, RequestDataKey> {
  const definition = requestTransitions.get(transitionKey(request.status, to));
  if (!definition) throw new InvalidTransitionError(request.status, to);

  const requesterAction = definition.permission === 'request.cancel.own';
  const informationFromRequester = definition.permission === 'request.provide_information';
  const isRequester = principal.userId === request.requesterUserId;

  if (requesterAction && !isRequester) {
    throw new ActorConstraintError('Only the requester may cancel this request');
  }

  const hasAreaPermission = hasPermission(principal, definition.permission, request.serviceAreaId);
  if (
    !(requesterAction && isRequester) &&
    !(informationFromRequester && isRequester) &&
    !hasAreaPermission
  ) {
    throw new AuthorizationError(definition.permission);
  }

  requireData(data, definition.requiredData);
  return { definition, from: request.status, to };
}
