import type { Principal } from '../../domain/identity/permissions.js';
import {
  planRequestTransition,
  type RequestStatus,
  type RequestTransitionData,
} from '../../domain/requests/request-state-machine.js';
import {
  ConcurrencyConflictError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';
import type { RequestRecord, RequestRepository } from './request-repository.js';

export interface TransitionRequestCommand {
  readonly data: RequestTransitionData;
  readonly expectedVersion?: number;
  readonly requestId?: string;
  readonly ticketNumber: string;
  readonly to: RequestStatus;
}

export class TransitionRequestService {
  constructor(private readonly repository: RequestRepository) {}

  async execute(command: TransitionRequestCommand, principal: Principal): Promise<RequestRecord> {
    const request = await this.repository.findByTicket(command.ticketNumber);
    if (!request) throw new EntityNotFoundError('ServiceRequest', command.ticketNumber);
    if (command.expectedVersion !== undefined && request.version !== command.expectedVersion) {
      throw new ConcurrencyConflictError('ServiceRequest', request.id);
    }
    const plan = planRequestTransition(request, command.to, command.data, principal);
    return this.repository.applyTransition({
      actorUserId: principal.userId,
      data: command.data,
      plan,
      request,
      ...(command.requestId ? { requestId: command.requestId } : {}),
    });
  }
}
