import {
  planOrderTransition,
  type OrderSnapshot,
  type OrderStatus,
  type OrderTransitionData,
} from '../../domain/orders/order-state-machine.js';
import type { Principal } from '../../domain/identity/permissions.js';
import {
  ConcurrencyConflictError,
  DomainRuleError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';
import type { ExecutorEligibilityPort, OrderRepository } from './order-repository.js';

export interface TransitionOrderCommand {
  readonly data: OrderTransitionData;
  readonly expectedVersion: number;
  readonly orderId: string;
  readonly requestId?: string;
  readonly to: OrderStatus;
}

export class TransitionOrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly executorEligibility: ExecutorEligibilityPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(command: TransitionOrderCommand, principal: Principal): Promise<OrderSnapshot> {
    const order = await this.repository.findById(command.orderId);
    if (!order) throw new EntityNotFoundError('Order', command.orderId);
    if (order.version !== command.expectedVersion) {
      throw new ConcurrencyConflictError('Order', command.orderId);
    }

    const plan = planOrderTransition(order, command.to, command.data, principal, this.now());

    if (plan.from === 'REGISTERED' && plan.to === 'ASSIGNED') {
      const assigneeUserId = command.data.assigneeUserId;
      if (!assigneeUserId) {
        throw new DomainRuleError('EXECUTOR_REQUIRED', 'An executor is required for assignment');
      }
      const eligible = await this.executorEligibility.isEligible(
        assigneeUserId,
        order.serviceAreaId,
        order.categoryId,
      );
      if (!eligible) {
        throw new DomainRuleError(
          'EXECUTOR_NOT_ELIGIBLE',
          'Executor is not active and authorized for this service area',
        );
      }
    }

    return this.repository.applyTransition({
      actorUserId: principal.userId,
      data: command.data,
      expectedVersion: command.expectedVersion,
      order,
      plan,
      ...(command.requestId ? { requestId: command.requestId } : {}),
    });
  }
}
