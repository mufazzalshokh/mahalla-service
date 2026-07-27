import { and, eq, isNull, or } from 'drizzle-orm';

import type { ExecutorEligibilityPort } from '../../application/orders/order-repository.js';
import type { MckDatabase } from '../database/client.js';
import {
  executorCategoryCapabilities,
  executorProfiles,
  roles,
  userRoles,
  users,
} from '../database/schema.js';

export class PostgresExecutorEligibility implements ExecutorEligibilityPort {
  constructor(private readonly database: MckDatabase) {}

  async isEligible(
    executorUserId: string,
    serviceAreaId: string,
    categoryId: string,
  ): Promise<boolean> {
    const [match] = await this.database
      .select({ id: users.id })
      .from(users)
      .innerJoin(executorProfiles, eq(executorProfiles.userId, users.id))
      .innerJoin(
        executorCategoryCapabilities,
        eq(executorCategoryCapabilities.executorUserId, users.id),
      )
      .innerJoin(userRoles, eq(userRoles.userId, users.id))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(users.id, executorUserId),
          eq(users.status, 'ACTIVE'),
          eq(executorProfiles.isAvailable, true),
          eq(executorCategoryCapabilities.categoryId, categoryId),
          eq(roles.code, 'executor'),
          or(isNull(userRoles.serviceAreaId), eq(userRoles.serviceAreaId, serviceAreaId)),
        ),
      )
      .limit(1);

    return Boolean(match);
  }
}
