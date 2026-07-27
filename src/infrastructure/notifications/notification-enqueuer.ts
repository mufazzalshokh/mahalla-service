import { and, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import type {
  NotificationAudience,
  NotificationPayload,
} from '../../domain/notifications/notification-policy.js';
import type { MckTransaction } from '../database/client.js';
import {
  notificationOutbox,
  orderRequestLinks,
  residentProfiles,
  roles,
  serviceRequests,
  userRoles,
  users,
} from '../database/schema.js';

export interface NotificationRecipient {
  readonly audience: NotificationAudience;
  readonly userId: string;
}

export interface NotificationIntent {
  readonly deduplicationKey: string;
  readonly payload: NotificationPayload;
  readonly serviceAreaId?: string;
}

export async function residentRecipientsForOrder(
  tx: MckTransaction,
  orderId: string,
): Promise<readonly NotificationRecipient[]> {
  const rows = await tx
    .selectDistinct({ userId: serviceRequests.requesterUserId })
    .from(orderRequestLinks)
    .innerJoin(serviceRequests, eq(serviceRequests.id, orderRequestLinks.requestId))
    .innerJoin(residentProfiles, eq(residentProfiles.userId, serviceRequests.requesterUserId))
    .where(eq(orderRequestLinks.orderId, orderId));
  return rows.map(({ userId }) => ({ audience: 'RESIDENT' as const, userId }));
}

export async function staffRecipientsForArea(
  tx: MckTransaction,
  serviceAreaId: string,
): Promise<readonly NotificationRecipient[]> {
  const rows = await tx
    .selectDistinct({ userId: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(
      and(
        eq(users.status, 'ACTIVE'),
        inArray(roles.code, ['operator_manager', 'administrator']),
        or(isNull(userRoles.serviceAreaId), eq(userRoles.serviceAreaId, serviceAreaId)),
      ),
    );
  return rows.map(({ userId }) => ({ audience: 'STAFF' as const, userId }));
}

export async function enqueueNotificationIntent(
  tx: MckTransaction,
  intent: NotificationIntent,
  recipients: readonly NotificationRecipient[],
): Promise<number> {
  let createdCount = 0;
  for (const recipient of recipients) {
    const sequenceRows = await tx.execute<{ value: string }>(
      sql`select nextval('notification_seq')::text as value`,
    );
    const sequence = sequenceRows[0]?.value;
    if (!sequence) throw new Error('Notification sequence returned no value');
    const [created] = await tx
      .insert(notificationOutbox)
      .values({
        audience: recipient.audience,
        code: `NTF-${new Date().getUTCFullYear()}-${sequence.padStart(8, '0')}`,
        deduplicationKey: `${intent.deduplicationKey}:${recipient.userId}`,
        eventType: intent.payload.templateKey,
        payload: intent.payload,
        recipientUserId: recipient.userId,
        ...(intent.serviceAreaId ? { serviceAreaId: intent.serviceAreaId } : {}),
      })
      .onConflictDoNothing({ target: notificationOutbox.deduplicationKey })
      .returning({ id: notificationOutbox.id });
    if (created) createdCount += 1;
  }
  return createdCount;
}
