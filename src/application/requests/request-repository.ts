import type {
  RequestTransitionData,
  ServiceRequestSnapshot,
} from '../../domain/requests/request-state-machine.js';
import type { TransitionPlan } from '../../domain/workflow/transition-types.js';
import type { RequestStatus } from '../../domain/requests/request-state-machine.js';

export interface RequestRecord extends ServiceRequestSnapshot {
  readonly ticketNumber: string;
}

export interface PersistRequestTransition {
  readonly actorUserId: string;
  readonly data: RequestTransitionData;
  readonly plan: TransitionPlan<RequestStatus, keyof RequestTransitionData>;
  readonly request: RequestRecord;
  readonly requestId?: string;
}

export interface RequestRepository {
  findByTicket(ticketNumber: string): Promise<RequestRecord | undefined>;
  applyTransition(command: PersistRequestTransition): Promise<RequestRecord>;
}
