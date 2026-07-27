import type {
  OrderSnapshot,
  OrderTransitionData,
} from '../../domain/orders/order-state-machine.js';
import type { TransitionPlan } from '../../domain/workflow/transition-types.js';
import type { OrderDataKey, OrderStatus } from '../../domain/orders/order-state-machine.js';

export interface PersistOrderTransition {
  readonly actorUserId: string;
  readonly data: OrderTransitionData;
  readonly expectedVersion: number;
  readonly order: OrderSnapshot;
  readonly plan: TransitionPlan<OrderStatus, OrderDataKey>;
  readonly requestId?: string;
}

export interface OrderRepository {
  findById(id: string): Promise<OrderSnapshot | undefined>;
  applyTransition(command: PersistOrderTransition): Promise<OrderSnapshot>;
}

export interface ExecutorEligibilityPort {
  isEligible(executorUserId: string, serviceAreaId: string, categoryId: string): Promise<boolean>;
}
