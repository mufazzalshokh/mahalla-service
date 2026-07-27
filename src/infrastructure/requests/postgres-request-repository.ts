import { and, eq, sql } from 'drizzle-orm';

import type {
  PersistRequestTransition,
  RequestRecord,
  RequestRepository,
} from '../../application/requests/request-repository.js';
import { ConcurrencyConflictError } from '../../domain/shared/domain-errors.js';
import type { MckDatabase } from '../database/client.js';
import {
  addresses,
  auditLogs,
  requestInformationMessages,
  requestStatusHistory,
  serviceRequests,
} from '../database/schema.js';
import { enqueueNotificationIntent } from '../notifications/notification-enqueuer.js';

function metadataFrom(data: PersistRequestTransition['data']): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

export class PostgresRequestRepository implements RequestRepository {
  constructor(private readonly database: MckDatabase) {}

  async findByTicket(ticketNumber: string): Promise<RequestRecord | undefined> {
    const [row] = await this.database
      .select({
        id: serviceRequests.id,
        requesterUserId: serviceRequests.requesterUserId,
        serviceAreaId: addresses.serviceAreaId,
        status: serviceRequests.status,
        ticketNumber: serviceRequests.ticketNumber,
        version: serviceRequests.version,
      })
      .from(serviceRequests)
      .innerJoin(addresses, eq(addresses.id, serviceRequests.addressId))
      .where(eq(serviceRequests.ticketNumber, ticketNumber))
      .limit(1);
    return row;
  }

  async applyTransition(command: PersistRequestTransition): Promise<RequestRecord> {
    return this.database.transaction(async (tx) => {
      const changes: Record<string, unknown> = {
        status: command.plan.to,
        updatedAt: new Date(),
        version: sql`${serviceRequests.version} + 1`,
      };
      if (command.plan.to === 'NEEDS_INFORMATION') {
        changes.informationRequest = command.data.informationRequest;
      }
      if (command.plan.from === 'NEEDS_INFORMATION' && command.plan.to === 'VALIDATING') {
        changes.informationRequest = null;
      }
      if (command.plan.to === 'REJECTED') changes.rejectionReason = command.data.rejectionReason;
      if (command.plan.to === 'CANCELLED') {
        changes.cancellationReason = command.data.cancellationReason;
      }

      const [updated] = await tx
        .update(serviceRequests)
        .set(changes)
        .where(
          and(
            eq(serviceRequests.id, command.request.id),
            eq(serviceRequests.version, command.request.version),
            eq(serviceRequests.status, command.plan.from),
          ),
        )
        .returning({
          id: serviceRequests.id,
          requesterUserId: serviceRequests.requesterUserId,
          status: serviceRequests.status,
          ticketNumber: serviceRequests.ticketNumber,
          version: serviceRequests.version,
        });
      if (!updated) throw new ConcurrencyConflictError('ServiceRequest', command.request.id);

      if (command.plan.to === 'NEEDS_INFORMATION' && command.data.informationRequest) {
        await tx.insert(requestInformationMessages).values({
          actorUserId: command.actorUserId,
          direction: 'REQUEST',
          message: command.data.informationRequest,
          requestId: command.request.id,
        });
      }
      if (command.plan.from === 'NEEDS_INFORMATION' && command.plan.to === 'VALIDATING') {
        const response = command.data.providedInformation;
        if (!response) throw new Error('Provided information is missing after domain validation');
        await tx.insert(requestInformationMessages).values({
          actorUserId: command.actorUserId,
          direction: 'RESPONSE',
          message: response,
          requestId: command.request.id,
        });
      }

      const reason =
        command.data.rejectionReason ??
        command.data.cancellationReason ??
        command.data.informationRequest ??
        command.data.providedInformation;
      await tx.insert(requestStatusHistory).values({
        actorUserId: command.actorUserId,
        fromStatus: command.plan.from,
        metadata: metadataFrom(command.data),
        ...(reason ? { reason } : {}),
        requestId: command.request.id,
        requestVersion: updated.version,
        toStatus: command.plan.to,
        transitionKey: `${command.plan.from}->${command.plan.to}`,
      });
      await tx.insert(auditLogs).values({
        action: command.plan.definition.auditEvent,
        actorUserId: command.actorUserId,
        after: { status: updated.status, version: updated.version },
        before: { status: command.request.status, version: command.request.version },
        entityId: command.request.id,
        entityType: 'service_request',
        ...(reason ? { reason } : {}),
        ...(command.requestId ? { requestId: command.requestId } : {}),
      });
      const effect = command.plan.definition.notification;
      if (effect !== 'none') {
        await enqueueNotificationIntent(
          tx,
          {
            deduplicationKey: `request:${command.request.id}:v${updated.version}:${effect}`,
            payload: {
              reference: updated.ticketNumber,
              status: updated.status,
              templateKey: effect,
            },
            serviceAreaId: command.request.serviceAreaId,
          },
          [{ audience: 'RESIDENT', userId: command.request.requesterUserId }],
        );
      }
      return { ...updated, serviceAreaId: command.request.serviceAreaId };
    });
  }
}
