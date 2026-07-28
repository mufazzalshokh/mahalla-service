import { and, eq, inArray, sql } from 'drizzle-orm';

import type {
  ManagedStaffRole,
  StaffAccessRecord,
  StaffAccessRepository,
  StaffAreaRecord,
} from '../../application/identity/staff-access-service.js';
import { DomainRuleError } from '../../domain/shared/domain-errors.js';
import type { MckDatabase } from '../database/client.js';
import {
  auditLogs,
  executorCategoryCapabilities,
  executorProfiles,
  roles,
  serviceAreas,
  serviceCategories,
  staffProfiles,
  userRoles,
  users,
} from '../database/schema.js';

const allowedRoles = ['operator_manager', 'executor'] as const;

function managedRole(value: string): ManagedStaffRole {
  if (!allowedRoles.includes(value as ManagedStaffRole)) {
    throw new DomainRuleError('STAFF_ROLE_INVALID', `Role cannot be managed: ${value}`);
  }
  return value as ManagedStaffRole;
}

function mapRecord(row: {
  code: string;
  displayName: string;
  role: string;
  serviceAreaCode: string;
  serviceAreaId: string;
  status: 'ACTIVE' | 'SUSPENDED';
  telegramUserId: bigint | null;
  userId: string;
}): StaffAccessRecord {
  if (!row.telegramUserId) throw new Error(`Staff Telegram ID missing: ${row.code}`);
  return { ...row, role: managedRole(row.role), telegramUserId: row.telegramUserId };
}

const projection = {
  code: staffProfiles.code,
  displayName: staffProfiles.displayName,
  role: roles.code,
  serviceAreaCode: serviceAreas.code,
  serviceAreaId: staffProfiles.serviceAreaId,
  status: staffProfiles.status,
  telegramUserId: users.telegramUserId,
  userId: staffProfiles.userId,
};

export class PostgresStaffAccessRepository implements StaffAccessRepository {
  constructor(private readonly database: MckDatabase) {}

  async findArea(code: string): Promise<StaffAreaRecord | undefined> {
    const [area] = await this.database
      .select({ code: serviceAreas.code, id: serviceAreas.id })
      .from(serviceAreas)
      .where(and(eq(serviceAreas.code, code), eq(serviceAreas.isActive, true)))
      .limit(1);
    return area;
  }

  async findByCode(code: string): Promise<StaffAccessRecord | undefined> {
    const [row] = await this.database
      .select(projection)
      .from(staffProfiles)
      .innerJoin(users, eq(users.id, staffProfiles.userId))
      .innerJoin(roles, eq(roles.id, staffProfiles.roleId))
      .innerJoin(serviceAreas, eq(serviceAreas.id, staffProfiles.serviceAreaId))
      .where(eq(staffProfiles.code, code))
      .limit(1);
    return row ? mapRecord(row) : undefined;
  }

  async list(serviceAreaIds: readonly (string | null)[]): Promise<readonly StaffAccessRecord[]> {
    const scoped = serviceAreaIds.filter((value): value is string => value !== null);
    const query = this.database
      .select(projection)
      .from(staffProfiles)
      .innerJoin(users, eq(users.id, staffProfiles.userId))
      .innerJoin(roles, eq(roles.id, staffProfiles.roleId))
      .innerJoin(serviceAreas, eq(serviceAreas.id, staffProfiles.serviceAreaId));
    const rows = serviceAreaIds.includes(null)
      ? await query.orderBy(staffProfiles.code)
      : await query.where(inArray(staffProfiles.serviceAreaId, scoped)).orderBy(staffProfiles.code);
    return rows.map(mapRecord);
  }

  async grant(command: {
    readonly actorUserId: string;
    readonly area: StaffAreaRecord;
    readonly displayName: string;
    readonly role: ManagedStaffRole;
    readonly telegramUserId: bigint;
  }): Promise<StaffAccessRecord> {
    const code = await this.database.transaction(async (tx) => {
      const [role] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.code, command.role));
      if (!role) throw new Error(`Seeded role missing: ${command.role}`);
      const [user] = await tx
        .insert(users)
        .values({ telegramUserId: command.telegramUserId })
        .onConflictDoUpdate({ set: { updatedAt: new Date() }, target: users.telegramUserId })
        .returning({ id: users.id, status: users.status });
      if (!user || user.status !== 'ACTIVE') {
        throw new DomainRuleError('STAFF_USER_INACTIVE', 'Target Telegram account is inactive');
      }
      const [existing] = await tx
        .select({
          code: staffProfiles.code,
          roleId: staffProfiles.roleId,
          serviceAreaId: staffProfiles.serviceAreaId,
        })
        .from(staffProfiles)
        .where(eq(staffProfiles.userId, user.id))
        .for('update');
      let profileCode = existing?.code;
      if (existing && existing.serviceAreaId !== command.area.id) {
        throw new DomainRuleError(
          'STAFF_AREA_CHANGE_FORBIDDEN',
          'Cross-area staff changes require explicit administrative migration',
        );
      }
      if (!profileCode) {
        const [sequence] = await tx
          .select({ value: sql<number>`staff_sequence.value` })
          .from(sql`(select nextval('staff_profile_seq')::int as value) as staff_sequence`);
        if (!sequence) throw new Error('Staff profile sequence failed');
        profileCode = `STF-${new Date().getUTCFullYear()}-${String(sequence.value).padStart(8, '0')}`;
      }
      if (existing) {
        await tx
          .delete(userRoles)
          .where(
            and(
              eq(userRoles.userId, user.id),
              eq(userRoles.roleId, existing.roleId),
              eq(userRoles.serviceAreaId, existing.serviceAreaId),
            ),
          );
      }
      await tx
        .insert(staffProfiles)
        .values({
          code: profileCode,
          displayName: command.displayName,
          roleId: role.id,
          serviceAreaId: command.area.id,
          status: 'ACTIVE',
          userId: user.id,
        })
        .onConflictDoUpdate({
          set: {
            displayName: command.displayName,
            roleId: role.id,
            serviceAreaId: command.area.id,
            status: 'ACTIVE',
            updatedAt: new Date(),
          },
          target: staffProfiles.userId,
        });
      await tx
        .insert(userRoles)
        .values({
          grantedByUserId: command.actorUserId,
          roleId: role.id,
          serviceAreaId: command.area.id,
          userId: user.id,
        })
        .onConflictDoNothing();

      if (command.role === 'executor') {
        await tx
          .insert(executorProfiles)
          .values({
            code: profileCode,
            displayName: command.displayName,
            isAvailable: true,
            userId: user.id,
          })
          .onConflictDoUpdate({
            set: { displayName: command.displayName, isAvailable: true, updatedAt: new Date() },
            target: executorProfiles.userId,
          });
        const categories = await tx
          .select({ id: serviceCategories.id })
          .from(serviceCategories)
          .where(eq(serviceCategories.isActive, true));
        if (categories.length > 0) {
          await tx
            .insert(executorCategoryCapabilities)
            .values(categories.map(({ id }) => ({ categoryId: id, executorUserId: user.id })))
            .onConflictDoNothing();
        }
      } else {
        await tx
          .update(executorProfiles)
          .set({ isAvailable: false, updatedAt: new Date() })
          .where(eq(executorProfiles.userId, user.id));
      }
      await tx.insert(auditLogs).values({
        action: existing ? 'staff.access_changed' : 'staff.access_granted',
        actorUserId: command.actorUserId,
        after: { role: command.role, serviceAreaCode: command.area.code, status: 'ACTIVE' },
        before: existing ? { roleId: existing.roleId } : undefined,
        entityId: user.id,
        entityType: 'staff_profile',
      });
      return profileCode;
    });
    const record = await this.findByCode(code);
    if (!record) throw new Error('Granted staff profile could not be reloaded');
    return record;
  }

  async suspend(
    record: StaffAccessRecord,
    actorUserId: string,
    reason: string,
  ): Promise<StaffAccessRecord> {
    await this.database.transaction(async (tx) => {
      const [role] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.code, record.role));
      if (!role) throw new Error(`Role missing: ${record.role}`);
      await tx
        .delete(userRoles)
        .where(
          and(
            eq(userRoles.userId, record.userId),
            eq(userRoles.roleId, role.id),
            eq(userRoles.serviceAreaId, record.serviceAreaId),
          ),
        );
      await tx
        .update(staffProfiles)
        .set({ status: 'SUSPENDED', updatedAt: new Date() })
        .where(eq(staffProfiles.userId, record.userId));
      if (record.role === 'executor') {
        await tx
          .update(executorProfiles)
          .set({ isAvailable: false, updatedAt: new Date() })
          .where(eq(executorProfiles.userId, record.userId));
      }
      await tx.insert(auditLogs).values({
        action: 'staff.access_suspended',
        actorUserId,
        after: { status: 'SUSPENDED' },
        before: { role: record.role, status: record.status },
        entityId: record.userId,
        entityType: 'staff_profile',
        reason,
      });
    });
    return { ...record, status: 'SUSPENDED' };
  }

  async restore(record: StaffAccessRecord, actorUserId: string): Promise<StaffAccessRecord> {
    await this.database.transaction(async (tx) => {
      const [role] = await tx
        .select({ id: roles.id })
        .from(roles)
        .where(eq(roles.code, record.role));
      if (!role) throw new Error(`Role missing: ${record.role}`);
      await tx
        .insert(userRoles)
        .values({
          grantedByUserId: actorUserId,
          roleId: role.id,
          serviceAreaId: record.serviceAreaId,
          userId: record.userId,
        })
        .onConflictDoNothing();
      await tx
        .update(staffProfiles)
        .set({ status: 'ACTIVE', updatedAt: new Date() })
        .where(eq(staffProfiles.userId, record.userId));
      if (record.role === 'executor') {
        await tx
          .update(executorProfiles)
          .set({ isAvailable: true, updatedAt: new Date() })
          .where(eq(executorProfiles.userId, record.userId));
      }
      await tx.insert(auditLogs).values({
        action: 'staff.access_restored',
        actorUserId,
        after: { role: record.role, status: 'ACTIVE' },
        before: { status: record.status },
        entityId: record.userId,
        entityType: 'staff_profile',
      });
    });
    return { ...record, status: 'ACTIVE' };
  }
}
