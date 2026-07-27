import type { PrincipalProvider } from '../identity/principal-provider.js';
import type { TransitionOrderService } from '../orders/transition-order-service.js';
import {
  hasPermission,
  type PermissionKey,
  type Principal,
} from '../../domain/identity/permissions.js';
import {
  ActorConstraintError,
  AuthorizationError,
  DomainRuleError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';
import {
  validateComplaint,
  validateFeedback,
  validateInspection,
  validateReworkReason,
  type InspectionItemInput,
} from '../../domain/quality/quality-policy.js';
import type {
  ComplaintRecord,
  InspectionRecord,
  QualityOrderRecord,
  QualityPolicyRecord,
  QualityRepository,
  WarrantyRecord,
} from './quality-repository.js';

async function requireOrder(
  repository: QualityRepository,
  orderNumber: string,
): Promise<QualityOrderRecord> {
  const order = await repository.findOrderByNumber(orderNumber.trim().toUpperCase());
  if (!order) throw new EntityNotFoundError('Order', orderNumber);
  return order;
}

async function requirePolicy(
  repository: QualityRepository,
  order: QualityOrderRecord,
): Promise<QualityPolicyRecord> {
  const policy = await repository.loadPolicy(order);
  if (!policy) {
    throw new DomainRuleError('QUALITY_POLICY_MISSING', 'No active quality policy is configured');
  }
  return policy;
}

function requireOwner(order: QualityOrderRecord, principal: Principal): void {
  if (!order.requesterUserIds.includes(principal.userId)) {
    throw new ActorConstraintError('Only a resident linked to this order may perform this action');
  }
}

function withScopedPermission(
  principal: Principal,
  permission: PermissionKey,
  serviceAreaId: string,
): Principal {
  return {
    ...principal,
    grants: [...principal.grants, { permission, serviceAreaId }],
  };
}

export class QualityService {
  constructor(
    private readonly repository: QualityRepository,
    private readonly transitions: TransitionOrderService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async checklist(orderNumber: string, principal: Principal): Promise<QualityPolicyRecord> {
    const order = await requireOrder(this.repository, orderNumber);
    if (!hasPermission(principal, 'quality.inspect', order.serviceAreaId)) {
      throw new AuthorizationError('quality.inspect');
    }
    return requirePolicy(this.repository, order);
  }

  async inspect(
    orderNumber: string,
    results: readonly InspectionItemInput[],
    summary: string,
    principal: Principal,
  ): Promise<InspectionRecord> {
    const order = await requireOrder(this.repository, orderNumber);
    if (!hasPermission(principal, 'quality.inspect', order.serviceAreaId)) {
      throw new AuthorizationError('quality.inspect');
    }
    if (order.status !== 'AWAITING_ACCEPTANCE') {
      throw new DomainRuleError(
        'INSPECTION_STATE_INVALID',
        'Inspection requires awaiting acceptance',
      );
    }
    const policy = await requirePolicy(this.repository, order);
    return this.repository.recordInspection(
      order,
      policy,
      validateInspection(policy.items, results, summary),
      principal,
    );
  }

  async accept(
    orderNumber: string,
    source: 'OPERATOR' | 'RESIDENT',
    principal: Principal,
  ): Promise<QualityOrderRecord> {
    const order = await requireOrder(this.repository, orderNumber);
    const policy = await requirePolicy(this.repository, order);
    let transitionPrincipal = principal;
    if (source === 'RESIDENT') {
      requireOwner(order, principal);
      if (policy.acceptanceMode === 'OPERATOR_ONLY') {
        throw new AuthorizationError('operator acceptance required by category policy');
      }
      transitionPrincipal = withScopedPermission(principal, 'quality.accept', order.serviceAreaId);
    } else if (!hasPermission(principal, 'quality.accept', order.serviceAreaId)) {
      throw new AuthorizationError('quality.accept');
    }
    if (policy.inspectionRequired && !policy.latestPassingInspectionId) {
      throw new DomainRuleError(
        'PASSING_INSPECTION_REQUIRED',
        'This category requires a passing inspection before acceptance',
      );
    }
    await this.transitions.execute(
      {
        data: {
          acceptanceSource: source,
          ...(policy.latestPassingInspectionId
            ? { inspectionId: policy.latestPassingInspectionId }
            : {}),
          warrantyDays: policy.warrantyDays,
        },
        expectedVersion: order.version,
        orderId: order.id,
        to: 'COMPLETED',
      },
      transitionPrincipal,
    );
    return requireOrder(this.repository, orderNumber);
  }

  async requireRework(
    orderNumber: string,
    reason: string,
    source: 'OPERATOR' | 'RESIDENT',
    principal: Principal,
  ): Promise<QualityOrderRecord> {
    const order = await requireOrder(this.repository, orderNumber);
    const policy = await requirePolicy(this.repository, order);
    let transitionPrincipal = principal;
    if (source === 'RESIDENT') {
      requireOwner(order, principal);
      if (policy.acceptanceMode === 'OPERATOR_ONLY') {
        throw new AuthorizationError('operator quality decision required by category policy');
      }
      transitionPrincipal = withScopedPermission(
        principal,
        'quality.require_rework',
        order.serviceAreaId,
      );
    } else if (!hasPermission(principal, 'quality.require_rework', order.serviceAreaId)) {
      throw new AuthorizationError('quality.require_rework');
    }
    const reworkDueAt = new Date(this.now().getTime() + policy.reworkTargetHours * 60 * 60 * 1000);
    await this.transitions.execute(
      {
        data: { reworkDueAt, reworkReason: validateReworkReason(reason) },
        expectedVersion: order.version,
        orderId: order.id,
        to: 'REWORK_REQUIRED',
      },
      transitionPrincipal,
    );
    return requireOrder(this.repository, orderNumber);
  }

  async feedback(
    orderNumber: string,
    rating: number,
    comment: string | undefined,
    principal: Principal,
  ): Promise<void> {
    const order = await requireOrder(this.repository, orderNumber);
    requireOwner(order, principal);
    if (order.status !== 'COMPLETED') {
      throw new DomainRuleError('FEEDBACK_STATE_INVALID', 'Feedback requires a completed order');
    }
    const validated = validateFeedback(rating, comment);
    await this.repository.saveFeedback(order, validated.rating, validated.comment, principal);
  }

  async complaint(
    orderNumber: string,
    reason: string,
    principal: Principal,
  ): Promise<ComplaintRecord> {
    const order = await requireOrder(this.repository, orderNumber);
    requireOwner(order, principal);
    if (order.status !== 'COMPLETED') {
      throw new DomainRuleError('COMPLAINT_STATE_INVALID', 'Complaint requires a completed order');
    }
    const policy = await requirePolicy(this.repository, order);
    const warranty = await this.repository.findWarranty(order.id);
    const now = this.now();
    return this.repository.createComplaint(
      order,
      validateComplaint(reason),
      new Date(now.getTime() + policy.complaintReviewHours * 60 * 60 * 1000),
      principal,
      Boolean(warranty && now <= warranty.endsAt),
    );
  }

  async warranty(orderNumber: string, principal: Principal): Promise<WarrantyRecord> {
    const order = await requireOrder(this.repository, orderNumber);
    requireOwner(order, principal);
    const warranty = await this.repository.findWarranty(order.id);
    if (!warranty) throw new EntityNotFoundError('Warranty', orderNumber);
    return warranty;
  }

  async listComplaints(principal: Principal): Promise<readonly ComplaintRecord[]> {
    const scopes = principal.grants
      .filter(({ permission }) => permission === 'quality.complaint.review')
      .map(({ serviceAreaId }) => serviceAreaId);
    if (scopes.length === 0) throw new AuthorizationError('quality.complaint.review');
    return this.repository.listOpenComplaints(scopes);
  }

  async reopen(
    complaintCode: string,
    reason: string,
    principal: Principal,
  ): Promise<QualityOrderRecord> {
    const complaint = await this.repository.findComplaintByCode(complaintCode.trim().toUpperCase());
    if (!complaint) throw new EntityNotFoundError('Complaint', complaintCode);
    if (!hasPermission(principal, 'quality.reopen', complaint.order.serviceAreaId)) {
      throw new AuthorizationError('quality.reopen');
    }
    if (complaint.status !== 'OPEN') {
      throw new DomainRuleError('COMPLAINT_NOT_OPEN', 'Only an open complaint may reopen work');
    }
    const policy = await requirePolicy(this.repository, complaint.order);
    const reworkDueAt = new Date(this.now().getTime() + policy.reworkTargetHours * 60 * 60 * 1000);
    await this.transitions.execute(
      {
        data: {
          complaintId: complaint.id,
          reworkDueAt,
          reworkReason: validateReworkReason(reason),
        },
        expectedVersion: complaint.order.version,
        orderId: complaint.order.id,
        to: 'REWORK_REQUIRED',
      },
      principal,
    );
    return requireOrder(this.repository, complaint.order.orderNumber);
  }

  async decideComplaint(
    complaintCode: string,
    outcome: 'RESOLVED' | 'REJECTED',
    reason: string,
    principal: Principal,
  ): Promise<void> {
    const complaint = await this.repository.findComplaintByCode(complaintCode.trim().toUpperCase());
    if (!complaint) throw new EntityNotFoundError('Complaint', complaintCode);
    if (!hasPermission(principal, 'quality.complaint.review', complaint.order.serviceAreaId)) {
      throw new AuthorizationError('quality.complaint.review');
    }
    if (complaint.status !== 'OPEN' && complaint.status !== 'REOPENED') {
      throw new DomainRuleError('COMPLAINT_NOT_REVIEWABLE', 'Complaint is already closed');
    }
    if (complaint.status === 'REOPENED' && complaint.order.status !== 'COMPLETED') {
      throw new DomainRuleError(
        'REWORK_NOT_COMPLETED',
        'A reopened complaint can be resolved only after corrected work is completed',
      );
    }
    await this.repository.decideComplaint(complaint, outcome, validateComplaint(reason), principal);
  }
}

export class ResidentQualityService {
  constructor(
    private readonly principals: PrincipalProvider,
    private readonly quality: QualityService,
  ) {}

  private async principal(telegramUserId: bigint): Promise<Principal> {
    const principal = await this.principals.loadByTelegramUserId(telegramUserId);
    if (!principal) throw new EntityNotFoundError('TelegramUser', String(telegramUserId));
    return principal;
  }

  async accept(telegramUserId: bigint, orderNumber: string): Promise<QualityOrderRecord> {
    return this.quality.accept(orderNumber, 'RESIDENT', await this.principal(telegramUserId));
  }

  async requireRework(
    telegramUserId: bigint,
    orderNumber: string,
    reason: string,
  ): Promise<QualityOrderRecord> {
    return this.quality.requireRework(
      orderNumber,
      reason,
      'RESIDENT',
      await this.principal(telegramUserId),
    );
  }

  async feedback(
    telegramUserId: bigint,
    orderNumber: string,
    rating: number,
    comment?: string,
  ): Promise<void> {
    return this.quality.feedback(
      orderNumber,
      rating,
      comment,
      await this.principal(telegramUserId),
    );
  }

  async complaint(
    telegramUserId: bigint,
    orderNumber: string,
    reason: string,
  ): Promise<ComplaintRecord> {
    return this.quality.complaint(orderNumber, reason, await this.principal(telegramUserId));
  }

  async warranty(telegramUserId: bigint, orderNumber: string): Promise<WarrantyRecord> {
    return this.quality.warranty(orderNumber, await this.principal(telegramUserId));
  }
}
