import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import type { Principal } from '../../domain/identity/permissions.js';
import type { RetryDecision } from '../../domain/notifications/notification-policy.js';
import type {
  ClaimedNotification,
  FailedNotification,
  NotificationRepository,
} from '../../application/notifications/notification-repository.js';
import type { MckDatabase } from '../database/client.js';
import {
  auditLogs,
  notificationDeliveryAttempts,
  notificationOutbox,
  residentProfiles,
  users,
} from '../database/schema.js';

export class PostgresNotificationRepository implements NotificationRepository {
  constructor(private readonly database: MckDatabase) {}

  async claimBatch(
    workerId: string,
    now: Date,
    limit: number,
    leaseSeconds: number,
  ): Promise<readonly ClaimedNotification[]> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const leaseExpiredAt = new Date(now.getTime() - Math.max(30, leaseSeconds) * 1_000);
    return this.database.transaction(async (tx) => {
      const claimedRows = await tx.execute<{ id: string }>(sql`
        with candidates as (
          select id
          from notification_outbox
          where available_at <= ${now.toISOString()}::timestamptz
            and (
              status = 'PENDING'
              or (status = 'PROCESSING' and locked_at < ${leaseExpiredAt.toISOString()}::timestamptz)
            )
          order by available_at, created_at
          for update skip locked
          limit ${safeLimit}
        )
        update notification_outbox as outbox
        set status = 'PROCESSING',
            locked_at = ${now.toISOString()}::timestamptz,
            locked_by = ${workerId},
            attempt_count = outbox.attempt_count + 1,
            updated_at = ${now.toISOString()}::timestamptz
        from candidates
        where outbox.id = candidates.id
        returning outbox.id
      `);
      const ids = claimedRows.map(({ id }) => id);
      if (ids.length === 0) return [];
      const rows = await tx
        .select({
          attemptNumber: notificationOutbox.attemptCount,
          audience: notificationOutbox.audience,
          id: notificationOutbox.id,
          language: residentProfiles.language,
          maxAttempts: notificationOutbox.maxAttempts,
          payload: notificationOutbox.payload,
          recipientTelegramUserId: users.telegramUserId,
        })
        .from(notificationOutbox)
        .innerJoin(users, eq(users.id, notificationOutbox.recipientUserId))
        .leftJoin(residentProfiles, eq(residentProfiles.userId, users.id))
        .where(inArray(notificationOutbox.id, ids));
      return rows.map((row) => ({
        ...row,
        language: row.language === 'uz-Cyrl' ? 'uz-Cyrl' : 'uz-Latn',
      }));
    });
  }

  async markDelivered(
    notification: ClaimedNotification,
    workerId: string,
    deliveredAt: Date,
    providerMessageId?: string,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const [updated] = await tx
        .update(notificationOutbox)
        .set({
          deliveredAt,
          lastErrorCode: null,
          lockedAt: null,
          lockedBy: null,
          status: 'DELIVERED',
          updatedAt: deliveredAt,
        })
        .where(
          and(
            eq(notificationOutbox.id, notification.id),
            eq(notificationOutbox.status, 'PROCESSING'),
            eq(notificationOutbox.lockedBy, workerId),
            eq(notificationOutbox.attemptCount, notification.attemptNumber),
          ),
        )
        .returning({ id: notificationOutbox.id });
      if (!updated) return;
      await tx.insert(notificationDeliveryAttempts).values({
        attemptNumber: notification.attemptNumber,
        finishedAt: deliveredAt,
        notificationId: notification.id,
        outcome: 'DELIVERED',
        ...(providerMessageId ? { providerMessageId } : {}),
      });
    });
  }

  async markFailed(
    notification: ClaimedNotification,
    workerId: string,
    failedAt: Date,
    errorCode: string,
    decision: RetryDecision,
  ): Promise<void> {
    await this.database.transaction(async (tx) => {
      const [updated] = await tx
        .update(notificationOutbox)
        .set({
          availableAt: decision.retryAt ?? failedAt,
          lastErrorCode: errorCode,
          lockedAt: null,
          lockedBy: null,
          status: decision.deadLetter ? 'DEAD_LETTER' : 'PENDING',
          updatedAt: failedAt,
        })
        .where(
          and(
            eq(notificationOutbox.id, notification.id),
            eq(notificationOutbox.status, 'PROCESSING'),
            eq(notificationOutbox.lockedBy, workerId),
            eq(notificationOutbox.attemptCount, notification.attemptNumber),
          ),
        )
        .returning({ id: notificationOutbox.id });
      if (!updated) return;
      await tx.insert(notificationDeliveryAttempts).values({
        attemptNumber: notification.attemptNumber,
        errorCode,
        finishedAt: failedAt,
        notificationId: notification.id,
        outcome: decision.deadLetter ? 'DEAD_LETTER' : 'RETRY_SCHEDULED',
      });
    });
  }

  async listDeadLetters(principal: Principal): Promise<readonly FailedNotification[]> {
    const scopes = principal.grants
      .filter(({ permission }) => permission === 'notification.manage')
      .map(({ serviceAreaId }) => serviceAreaId);
    const areaIds = scopes.filter((id): id is string => id !== null);
    return this.database
      .select({
        attemptCount: notificationOutbox.attemptCount,
        code: notificationOutbox.code,
        eventType: notificationOutbox.eventType,
        lastErrorCode: notificationOutbox.lastErrorCode,
        updatedAt: notificationOutbox.updatedAt,
      })
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.status, 'DEAD_LETTER'),
          ...(scopes.includes(null) ? [] : [inArray(notificationOutbox.serviceAreaId, areaIds)]),
        ),
      )
      .orderBy(desc(notificationOutbox.updatedAt))
      .limit(50);
  }

  async recoverDeadLetter(code: string, principal: Principal, now: Date): Promise<boolean> {
    const scopes = principal.grants
      .filter(({ permission }) => permission === 'notification.manage')
      .map(({ serviceAreaId }) => serviceAreaId);
    const areaIds = scopes.filter((id): id is string => id !== null);
    return this.database.transaction(async (tx) => {
      const [updated] = await tx
        .update(notificationOutbox)
        .set({
          attemptCount: 0,
          availableAt: now,
          lastErrorCode: null,
          status: 'PENDING',
          updatedAt: now,
        })
        .where(
          and(
            eq(notificationOutbox.code, code),
            eq(notificationOutbox.status, 'DEAD_LETTER'),
            ...(scopes.includes(null) ? [] : [inArray(notificationOutbox.serviceAreaId, areaIds)]),
          ),
        )
        .returning({ id: notificationOutbox.id });
      if (!updated) return false;
      await tx.insert(auditLogs).values({
        action: 'notification.dead_letter_recovered',
        actorUserId: principal.userId,
        after: { code, status: 'PENDING' },
        entityId: updated.id,
        entityType: 'notification',
      });
      return true;
    });
  }
}
