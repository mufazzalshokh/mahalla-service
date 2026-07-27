import { and, eq } from 'drizzle-orm';

import type { PrincipalProvider } from '../../application/identity/principal-provider.js';
import { isPermissionKey, type Principal } from '../../domain/identity/permissions.js';
import type { MckDatabase } from '../database/client.js';
import { permissions, rolePermissions, roles, userRoles, users } from '../database/schema.js';

export class PostgresPrincipalProvider implements PrincipalProvider {
  constructor(private readonly database: MckDatabase) {}

  async load(userId: string): Promise<Principal | undefined> {
    const [user] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.status, 'ACTIVE')))
      .limit(1);

    if (!user) return undefined;

    const grants = await this.database
      .select({
        permission: permissions.code,
        serviceAreaId: userRoles.serviceAreaId,
      })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, userId));

    return {
      grants: grants.map((grant) => {
        if (!isPermissionKey(grant.permission)) {
          throw new Error(`Unknown permission in database: ${grant.permission}`);
        }
        return {
          permission: grant.permission,
          serviceAreaId: grant.serviceAreaId,
        };
      }),
      userId,
    };
  }

  async loadByTelegramUserId(telegramUserId: bigint): Promise<Principal | undefined> {
    const [user] = await this.database
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.telegramUserId, telegramUserId), eq(users.status, 'ACTIVE')))
      .limit(1);
    return user ? this.load(user.id) : undefined;
  }
}
