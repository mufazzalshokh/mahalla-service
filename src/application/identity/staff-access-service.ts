import { hasPermission, type Principal } from '../../domain/identity/permissions.js';
import {
  AuthorizationError,
  DomainRuleError,
  EntityNotFoundError,
} from '../../domain/shared/domain-errors.js';

export const managedStaffRoles = ['operator_manager', 'executor'] as const;
export type ManagedStaffRole = (typeof managedStaffRoles)[number];

export interface StaffAccessRecord {
  readonly code: string;
  readonly displayName: string;
  readonly role: ManagedStaffRole;
  readonly serviceAreaCode: string;
  readonly serviceAreaId: string;
  readonly status: 'ACTIVE' | 'SUSPENDED';
  readonly telegramUserId: bigint;
  readonly userId: string;
}

export interface StaffAreaRecord {
  readonly code: string;
  readonly id: string;
}

export interface StaffAccessRepository {
  findArea(code: string): Promise<StaffAreaRecord | undefined>;
  findByCode(code: string): Promise<StaffAccessRecord | undefined>;
  grant(command: {
    readonly actorUserId: string;
    readonly area: StaffAreaRecord;
    readonly displayName: string;
    readonly role: ManagedStaffRole;
    readonly telegramUserId: bigint;
  }): Promise<StaffAccessRecord>;
  list(serviceAreaIds: readonly (string | null)[]): Promise<readonly StaffAccessRecord[]>;
  restore(record: StaffAccessRecord, actorUserId: string): Promise<StaffAccessRecord>;
  suspend(
    record: StaffAccessRecord,
    actorUserId: string,
    reason: string,
  ): Promise<StaffAccessRecord>;
}

function displayName(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, ' ');
  if (
    normalized.length < 2 ||
    normalized.length > 120 ||
    !normalized.split(' ').every((part) => /\p{L}/u.test(part))
  ) {
    throw new DomainRuleError('STAFF_NAME_INVALID', 'Staff name must contain 2–120 letters');
  }
  return normalized;
}

function telegramId(value: bigint): bigint {
  if (value <= 0n) {
    throw new DomainRuleError('TELEGRAM_ID_INVALID', 'Telegram user ID must be positive');
  }
  return value;
}

function authorize(principal: Principal, serviceAreaId: string): void {
  if (!hasPermission(principal, 'staff.manage', serviceAreaId)) {
    throw new AuthorizationError('staff.manage');
  }
}

export class StaffAccessService {
  constructor(private readonly repository: StaffAccessRepository) {}

  async list(principal: Principal): Promise<readonly StaffAccessRecord[]> {
    const scopes = principal.grants
      .filter(({ permission }) => permission === 'staff.manage')
      .map(({ serviceAreaId }) => serviceAreaId);
    if (scopes.length === 0) throw new AuthorizationError('staff.manage');
    return this.repository.list(scopes);
  }

  async grant(
    targetTelegramUserId: bigint,
    targetDisplayName: string,
    role: ManagedStaffRole,
    serviceAreaCode: string,
    principal: Principal,
  ): Promise<StaffAccessRecord> {
    if (!managedStaffRoles.includes(role)) {
      throw new DomainRuleError('STAFF_ROLE_INVALID', 'Managed role is not allowed');
    }
    const area = await this.repository.findArea(serviceAreaCode.trim().toUpperCase());
    if (!area) throw new EntityNotFoundError('ServiceArea', serviceAreaCode);
    authorize(principal, area.id);
    return this.repository.grant({
      actorUserId: principal.userId,
      area,
      displayName: displayName(targetDisplayName),
      role,
      telegramUserId: telegramId(targetTelegramUserId),
    });
  }

  async suspend(code: string, reason: string, principal: Principal): Promise<StaffAccessRecord> {
    const record = await this.requireRecord(code);
    authorize(principal, record.serviceAreaId);
    if (record.userId === principal.userId) {
      throw new DomainRuleError('STAFF_SELF_SUSPEND', 'You cannot suspend your own access');
    }
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 500) {
      throw new DomainRuleError('STAFF_REASON_INVALID', 'Reason must contain 3–500 characters');
    }
    if (record.status === 'SUSPENDED') return record;
    return this.repository.suspend(record, principal.userId, normalizedReason);
  }

  async restore(code: string, principal: Principal): Promise<StaffAccessRecord> {
    const record = await this.requireRecord(code);
    authorize(principal, record.serviceAreaId);
    if (record.status === 'ACTIVE') return record;
    return this.repository.restore(record, principal.userId);
  }

  private async requireRecord(code: string): Promise<StaffAccessRecord> {
    const normalized = code.trim().toUpperCase();
    const record = await this.repository.findByCode(normalized);
    if (!record) throw new EntityNotFoundError('StaffProfile', normalized);
    return record;
  }
}
