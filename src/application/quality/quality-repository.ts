import type { Principal } from '../../domain/identity/permissions.js';
import type { OrderSnapshot } from '../../domain/orders/order-state-machine.js';
import type {
  QualityChecklistItem,
  ValidatedInspection,
} from '../../domain/quality/quality-policy.js';

export interface QualityOrderRecord extends OrderSnapshot {
  readonly orderNumber: string;
  readonly requesterUserIds: readonly string[];
}

export interface QualityPolicyRecord {
  readonly acceptanceMode: 'RESIDENT_OR_OPERATOR' | 'OPERATOR_ONLY';
  readonly complaintReviewHours: number;
  readonly inspectionRequired: boolean;
  readonly items: readonly (QualityChecklistItem & {
    readonly labelRu: string;
    readonly labelUzCyrl: string;
    readonly labelUzLatn: string;
  })[];
  readonly latestPassingInspectionId: string | null;
  readonly reworkTargetHours: number;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly warrantyDays: number;
}

export interface InspectionRecord {
  readonly attempt: number;
  readonly id: string;
  readonly outcome: 'PASS' | 'FAIL';
}

export interface ComplaintRecord {
  readonly code: string;
  readonly id: string;
  readonly order: QualityOrderRecord;
  readonly reason: string;
  readonly reviewDueAt: Date;
  readonly status: 'OPEN' | 'REOPENED' | 'RESOLVED' | 'REJECTED';
  readonly withinWarranty: boolean;
}

export interface WarrantyRecord {
  readonly endsAt: Date;
  readonly startsAt: Date;
  readonly warrantyDays: number;
}

export interface QualityRepository {
  findOrderByNumber(orderNumber: string): Promise<QualityOrderRecord | undefined>;
  loadPolicy(order: QualityOrderRecord): Promise<QualityPolicyRecord | undefined>;
  recordInspection(
    order: QualityOrderRecord,
    policy: QualityPolicyRecord,
    inspection: ValidatedInspection,
    actor: Principal,
  ): Promise<InspectionRecord>;
  saveFeedback(
    order: QualityOrderRecord,
    rating: number,
    comment: string | null,
    requester: Principal,
  ): Promise<void>;
  createComplaint(
    order: QualityOrderRecord,
    reason: string,
    reviewDueAt: Date,
    requester: Principal,
    withinWarranty: boolean,
  ): Promise<ComplaintRecord>;
  findComplaintByCode(code: string): Promise<ComplaintRecord | undefined>;
  decideComplaint(
    complaint: ComplaintRecord,
    outcome: 'RESOLVED' | 'REJECTED',
    reason: string,
    actor: Principal,
  ): Promise<void>;
  listOpenComplaints(
    serviceAreaIds: readonly (string | null)[],
  ): Promise<readonly ComplaintRecord[]>;
  findWarranty(orderId: string): Promise<WarrantyRecord | undefined>;
}
