import type { Principal } from '../../domain/identity/permissions.js';
import type { OrderSnapshot } from '../../domain/orders/order-state-machine.js';
import type {
  WorkEvidenceInput,
  WorkEvidencePhase,
} from '../../domain/execution/work-evidence-policy.js';

export interface ExecutionOrderRecord extends OrderSnapshot {
  readonly dueAt: Date | null;
  readonly orderNumber: string;
  readonly priorityBand: 'URGENT' | 'IMPORTANT' | 'PLANNED' | 'MONITOR' | null;
}

export interface ExecutorRecord {
  readonly code: string;
  readonly displayName: string;
  readonly userId: string;
}

export interface EscalationRecord {
  readonly dueAt: Date;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
}

export interface ExecutionRepository {
  findOrderByNumber(orderNumber: string): Promise<ExecutionOrderRecord | undefined>;
  findExecutorByCode(code: string): Promise<ExecutorRecord | undefined>;
  listEligibleExecutors(order: ExecutionOrderRecord): Promise<readonly ExecutorRecord[]>;
  listAssignedOrders(
    executorUserId: string,
    serviceAreaIds: readonly (string | null)[],
  ): Promise<readonly ExecutionOrderRecord[]>;
  appendProgressLog(order: ExecutionOrderRecord, note: string, actor: Principal): Promise<void>;
  countEvidence(orderId: string, phase: WorkEvidencePhase): Promise<number>;
  appendEvidence(
    order: ExecutionOrderRecord,
    input: WorkEvidenceInput,
    actor: Principal,
  ): Promise<void>;
  scanOverdue(
    serviceAreaIds: readonly (string | null)[],
    now: Date,
    actor: Principal,
  ): Promise<readonly EscalationRecord[]>;
}
