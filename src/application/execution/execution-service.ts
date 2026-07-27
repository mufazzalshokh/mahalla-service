import {
  validateWorkEvidence,
  validateWorkLogNote,
  type WorkEvidenceInput,
} from '../../domain/execution/work-evidence-policy.js';
import { hasPermission, type Principal } from '../../domain/identity/permissions.js';
import type { OrderStatus, OrderTransitionData } from '../../domain/orders/order-state-machine.js';
import {
  ActorConstraintError,
  AuthorizationError,
  DomainRuleError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';
import type { TransitionOrderService } from '../orders/transition-order-service.js';
import type {
  EscalationRecord,
  ExecutionOrderRecord,
  ExecutionRepository,
  ExecutorRecord,
} from './execution-repository.js';

async function requireOrder(
  repository: ExecutionRepository,
  orderNumber: string,
): Promise<ExecutionOrderRecord> {
  const order = await repository.findOrderByNumber(orderNumber.trim().toUpperCase());
  if (!order) throw new EntityNotFoundError('Order', orderNumber);
  return order;
}

export class ExecutionService {
  constructor(
    private readonly repository: ExecutionRepository,
    private readonly transitions: TransitionOrderService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async listEligibleExecutors(
    orderNumber: string,
    principal: Principal,
  ): Promise<readonly ExecutorRecord[]> {
    const order = await requireOrder(this.repository, orderNumber);
    if (!hasPermission(principal, 'order.assign', order.serviceAreaId)) {
      throw new AuthorizationError('order.assign');
    }
    return this.repository.listEligibleExecutors(order);
  }

  async assign(
    orderNumber: string,
    executorCode: string,
    dueAt: Date,
    principal: Principal,
  ): Promise<ExecutionOrderRecord> {
    const order = await requireOrder(this.repository, orderNumber);
    const executor = await this.repository.findExecutorByCode(executorCode.trim().toUpperCase());
    if (!executor) throw new EntityNotFoundError('Executor', executorCode);
    await this.transitions.execute(
      {
        data: { assigneeUserId: executor.userId, dueAt },
        expectedVersion: order.version,
        orderId: order.id,
        to: 'ASSIGNED',
      },
      principal,
    );
    const updated = await requireOrder(this.repository, orderNumber);
    return updated;
  }

  async transition(
    orderNumber: string,
    to: OrderStatus,
    data: OrderTransitionData,
    principal: Principal,
  ): Promise<ExecutionOrderRecord> {
    const order = await requireOrder(this.repository, orderNumber);
    await this.transitions.execute(
      { data, expectedVersion: order.version, orderId: order.id, to },
      principal,
    );
    return requireOrder(this.repository, orderNumber);
  }

  async listMine(principal: Principal): Promise<readonly ExecutionOrderRecord[]> {
    const scopes = principal.grants
      .filter(({ permission }) => permission === 'order.read.area')
      .map(({ serviceAreaId }) => serviceAreaId);
    if (scopes.length === 0) throw new AuthorizationError('order.read.area');
    return this.repository.listAssignedOrders(principal.userId, scopes);
  }

  async addProgress(orderNumber: string, note: string, principal: Principal): Promise<void> {
    const order = await requireOrder(this.repository, orderNumber);
    if (!hasPermission(principal, 'order.work_log.add', order.serviceAreaId)) {
      throw new AuthorizationError('order.work_log.add');
    }
    if (order.assignedExecutorUserId !== principal.userId) {
      throw new ActorConstraintError('Only the assigned executor may add a work log');
    }
    if (order.status !== 'IN_PROGRESS' && order.status !== 'BLOCKED') {
      throw new DomainRuleError(
        'WORK_LOG_STATE_INVALID',
        'Work logs require active or blocked work',
      );
    }
    await this.repository.appendProgressLog(order, validateWorkLogNote(note), principal);
  }

  async addEvidence(
    orderNumber: string,
    input: WorkEvidenceInput,
    principal: Principal,
  ): Promise<void> {
    const order = await requireOrder(this.repository, orderNumber);
    if (!hasPermission(principal, 'order.evidence.add', order.serviceAreaId)) {
      throw new AuthorizationError('order.evidence.add');
    }
    if (order.assignedExecutorUserId !== principal.userId) {
      throw new ActorConstraintError('Only the assigned executor may add work evidence');
    }
    const allowed =
      input.phase === 'BEFORE'
        ? ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED'].includes(order.status)
        : ['IN_PROGRESS', 'BLOCKED'].includes(order.status);
    if (!allowed) {
      throw new DomainRuleError('WORK_EVIDENCE_STATE_INVALID', 'Evidence phase is not valid now');
    }
    const existingCount = await this.repository.countEvidence(order.id, input.phase);
    validateWorkEvidence(input, existingCount);
    await this.repository.appendEvidence(order, input, principal);
  }

  async scanOverdue(principal: Principal): Promise<readonly EscalationRecord[]> {
    const scopes = principal.grants
      .filter(({ permission }) => permission === 'order.escalation.review')
      .map(({ serviceAreaId }) => serviceAreaId);
    if (scopes.length === 0) throw new AuthorizationError('order.escalation.review');
    return this.repository.scanOverdue(scopes, this.now(), principal);
  }
}
