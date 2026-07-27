import type { PermissionKey } from '../identity/permissions.js';

export type NotificationEffect =
  | 'none'
  | 'resident.status_changed'
  | 'resident.information_requested'
  | 'executor.assignment_created'
  | 'operator.assignment_rejected'
  | 'operator.order_blocked'
  | 'resident.acceptance_requested'
  | 'executor.rework_required';

export type SlaEffect =
  | 'none'
  | 'start_validation'
  | 'pause_waiting_for_resident'
  | 'resume_validation'
  | 'start_execution'
  | 'pause_blocked'
  | 'resume_execution'
  | 'stop_execution';

export interface TransitionDefinition<Status extends string, DataKey extends string> {
  readonly auditEvent: string;
  readonly compensation: string;
  readonly failureBehavior: string;
  readonly from: Status;
  readonly notification: NotificationEffect;
  readonly permission: PermissionKey;
  readonly preconditions: readonly string[];
  readonly requiredData: readonly DataKey[];
  readonly sideEffects: readonly string[];
  readonly slaEffect: SlaEffect;
  readonly to: Status;
}

export interface TransitionPlan<Status extends string, DataKey extends string> {
  readonly definition: TransitionDefinition<Status, DataKey>;
  readonly from: Status;
  readonly to: Status;
}

export function transitionKey(from: string, to: string): string {
  return `${from}->${to}`;
}
