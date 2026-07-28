import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type {
  IntakeDraft,
  IntakeResponse,
  IntakeSession,
  ResidentUpdateCommand,
  SupportedLanguage,
} from '../../application/intake/intake-types.js';
import type {
  IntakePlanner,
  ResidentIntakeUnitOfWork,
} from '../../application/intake/resident-intake-unit-of-work.js';
import { DomainRuleError } from '../../domain/shared/domain-errors.js';
import type { MckDatabase } from '../database/client.js';
import {
  addresses,
  attachments,
  auditLogs,
  privacyConsents,
  requestSources,
  requestStatusHistory,
  residentProfiles,
  serviceAreas,
  serviceCategories,
  serviceRequests,
  telegramIntakeSessions,
  telegramUpdateReceipts,
  users,
} from '../database/schema.js';

const responseSchema = z.object({
  actionColumns: z.number().int().min(1).max(3).optional(),
  actions: z.array(z.object({ data: z.string(), labelKey: z.string() })).optional(),
  categories: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  key: z.enum([
    'choose_language',
    'privacy_notice',
    'consent_required',
    'enter_full_name',
    'invalid_full_name',
    'share_contact',
    'contact_must_be_own',
    'invalid_contact',
    'choose_category',
    'invalid_category',
    'choose_urgency',
    'invalid_urgency',
    'enter_description',
    'invalid_description',
    'enter_address',
    'enter_address_manual',
    'invalid_address',
    'choose_visit_date',
    'choose_visit_period',
    'choose_visit_slot',
    'invalid_visit_date',
    'invalid_visit_slot',
    'add_photos',
    'photo_added',
    'photo_invalid',
    'photo_limit',
    'review_request',
    'submitted',
    'status_result',
    'ticket_not_found',
    'start_required',
  ]),
  language: z.enum(['uz-Latn', 'uz-Cyrl', 'ru']),
  parameters: z.record(z.string(), z.string()).optional(),
  requestContact: z.boolean().optional(),
  requestLocation: z.boolean().optional(),
  showMainMenu: z.boolean().optional(),
});

const draftSchema = z.object({
  addressLine: z.string().optional(),
  categoryId: z.string().optional(),
  categoryLabel: z.string().optional(),
  description: z.string().optional(),
  fullName: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  phone: z.string().optional(),
  photos: z
    .array(
      z.object({
        fileId: z.string(),
        fileSize: z.number().int().positive(),
        fileUniqueId: z.string(),
      }),
    )
    .max(3),
  preferredVisitDate: z.string().optional(),
  preferredVisitEnd: z.string().datetime().optional(),
  preferredVisitPeriodStartHour: z.number().int().min(0).max(23).optional(),
  preferredVisitStart: z.string().datetime().optional(),
  residentDeclaredUrgency: z.enum(['CRITICAL', 'IMPORTANT', 'PLANNED']).optional(),
  visitAsSoonAsPossible: z.boolean().optional(),
});

function mapSession(row: typeof telegramIntakeSessions.$inferSelect): IntakeSession {
  const language = row.language as SupportedLanguage | null;
  return {
    draft: draftSchema.parse(row.draft),
    ...(language ? { language } : {}),
    step: row.step as IntakeSession['step'],
    version: row.version,
  };
}

interface CompleteDraft {
  readonly addressLine: string;
  readonly categoryId: string;
  readonly description: string;
  readonly fullName: string;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly phone: string;
  readonly photos: IntakeDraft['photos'];
  readonly preferredVisitEnd?: Date | undefined;
  readonly preferredVisitStart?: Date | undefined;
  readonly residentDeclaredUrgency: 'CRITICAL' | 'IMPORTANT' | 'PLANNED';
  readonly visitAsSoonAsPossible: boolean;
}

function requireCompleteDraft(draft: IntakeDraft): CompleteDraft {
  if (
    !draft.addressLine ||
    !draft.categoryId ||
    !draft.description ||
    !draft.fullName ||
    !draft.phone ||
    !draft.residentDeclaredUrgency ||
    (!draft.visitAsSoonAsPossible && (!draft.preferredVisitStart || !draft.preferredVisitEnd))
  ) {
    throw new DomainRuleError('INCOMPLETE_INTAKE', 'Intake draft is incomplete');
  }
  return {
    addressLine: draft.addressLine,
    categoryId: draft.categoryId,
    description: draft.description,
    fullName: draft.fullName,
    latitude: draft.latitude,
    longitude: draft.longitude,
    phone: draft.phone,
    photos: draft.photos,
    ...(draft.preferredVisitEnd ? { preferredVisitEnd: new Date(draft.preferredVisitEnd) } : {}),
    ...(draft.preferredVisitStart
      ? { preferredVisitStart: new Date(draft.preferredVisitStart) }
      : {}),
    residentDeclaredUrgency: draft.residentDeclaredUrgency,
    visitAsSoonAsPossible: draft.visitAsSoonAsPossible ?? false,
  };
}

function withTicket(response: IntakeResponse, ticketNumber: string): IntakeResponse {
  return {
    ...response,
    ...(response.actions
      ? {
          actions: response.actions.map((action) => ({
            ...action,
            data: action.data.replace('__GENERATED_TICKET__', ticketNumber),
          })),
        }
      : {}),
    parameters: { ...response.parameters, ticketNumber },
  };
}

export class PostgresResidentIntakeUnitOfWork implements ResidentIntakeUnitOfWork {
  constructor(private readonly database: MckDatabase) {}

  async process(command: ResidentUpdateCommand, planner: IntakePlanner): Promise<IntakeResponse> {
    return this.database.transaction(async (tx) => {
      const [claimed] = await tx
        .insert(telegramUpdateReceipts)
        .values({
          response: { key: 'start_required', language: 'uz-Latn' },
          telegramUserId: command.telegramUserId,
          updateId: command.updateId,
        })
        .onConflictDoNothing({ target: telegramUpdateReceipts.updateId })
        .returning({ updateId: telegramUpdateReceipts.updateId });

      if (!claimed) {
        const [receipt] = await tx
          .select({
            response: telegramUpdateReceipts.response,
            telegramUserId: telegramUpdateReceipts.telegramUserId,
          })
          .from(telegramUpdateReceipts)
          .where(eq(telegramUpdateReceipts.updateId, command.updateId));
        if (!receipt || receipt.telegramUserId !== command.telegramUserId) {
          throw new DomainRuleError(
            'UPDATE_IDENTITY_MISMATCH',
            'Telegram update identity mismatch',
          );
        }
        return responseSchema.parse(receipt.response);
      }

      await tx.execute(sql`select pg_advisory_xact_lock(${command.telegramUserId})`);

      const [user] = await tx
        .insert(users)
        .values({ telegramUserId: command.telegramUserId })
        .onConflictDoUpdate({
          set: { updatedAt: new Date() },
          target: users.telegramUserId,
        })
        .returning({ id: users.id, status: users.status });
      if (!user || user.status !== 'ACTIVE') {
        throw new DomainRuleError('USER_INACTIVE', 'Telegram user is not active');
      }

      const [sessionRow] = await tx
        .select()
        .from(telegramIntakeSessions)
        .where(eq(telegramIntakeSessions.userId, user.id))
        .for('update');
      const session = sessionRow ? mapSession(sessionRow) : undefined;
      const categoryRows = await tx
        .select({
          id: serviceCategories.id,
          nameRu: serviceCategories.nameRu,
          nameUzCyrl: serviceCategories.nameUzCyrl,
          nameUzLatn: serviceCategories.nameUzLatn,
        })
        .from(serviceCategories)
        .where(eq(serviceCategories.isActive, true))
        .orderBy(serviceCategories.sortOrder);
      const language = session?.language ?? 'uz-Latn';
      const categories = categoryRows.map((category) => ({
        id: category.id,
        label:
          language === 'ru'
            ? category.nameRu
            : language === 'uz-Cyrl'
              ? category.nameUzCyrl
              : category.nameUzLatn,
      }));

      const ticket =
        command.input.kind === 'status'
          ? (
              await tx
                .select({
                  status: serviceRequests.status,
                  ticketNumber: serviceRequests.ticketNumber,
                })
                .from(serviceRequests)
                .where(
                  and(
                    eq(serviceRequests.requesterUserId, user.id),
                    eq(serviceRequests.ticketNumber, command.input.ticketNumber),
                  ),
                )
                .limit(1)
            )[0]
          : undefined;

      const plan = planner({
        categories,
        now: new Date(),
        ...(session ? { session } : {}),
        ...(ticket ? { ticket } : {}),
      });
      let finalResponse = plan.response;

      if (plan.session.language) {
        await tx
          .insert(residentProfiles)
          .values({
            fullName: plan.session.draft.fullName,
            language: plan.session.language,
            phone: plan.session.draft.phone,
            userId: user.id,
          })
          .onConflictDoUpdate({
            set: {
              fullName: plan.session.draft.fullName,
              language: plan.session.language,
              phone: plan.session.draft.phone,
              updatedAt: new Date(),
            },
            target: residentProfiles.userId,
          });
      }

      if (plan.acceptPrivacyVersion) {
        await tx
          .insert(privacyConsents)
          .values({
            noticeVersion: plan.acceptPrivacyVersion,
            telegramUpdateId: command.updateId,
            userId: user.id,
          })
          .onConflictDoNothing({ target: [privacyConsents.userId, privacyConsents.noticeVersion] });
      }

      if (plan.submit) {
        const draft = requireCompleteDraft(plan.session.draft);
        const [area] = await tx
          .select({ id: serviceAreas.id })
          .from(serviceAreas)
          .where(eq(serviceAreas.code, 'DEMO'));
        const [source] = await tx
          .select({ id: requestSources.id })
          .from(requestSources)
          .where(eq(requestSources.code, 'TELEGRAM'));
        if (!area || !source) throw new Error('Required intake reference data is missing');

        const [address] = await tx
          .insert(addresses)
          .values({
            line1: draft.addressLine,
            serviceAreaId: area.id,
            ...(draft.latitude !== undefined && draft.longitude !== undefined
              ? {
                  latitude: draft.latitude.toString(),
                  longitude: draft.longitude.toString(),
                }
              : {}),
          })
          .returning({ id: addresses.id });
        const [sequence] = await tx
          .select({ value: sql<number>`ticket_sequence.value` })
          .from(
            sql`(select nextval('service_request_ticket_seq')::int as value) as ticket_sequence`,
          );
        if (!address || !sequence) throw new Error('Request identifiers could not be generated');
        const ticketNumber = `MCK-${new Date().getUTCFullYear()}-${String(sequence.value).padStart(8, '0')}`;
        const [created] = await tx
          .insert(serviceRequests)
          .values({
            addressId: address.id,
            categoryId: draft.categoryId,
            description: draft.description,
            preferredVisitEnd: draft.preferredVisitEnd,
            preferredVisitStart: draft.preferredVisitStart,
            requesterUserId: user.id,
            residentDeclaredUrgency: draft.residentDeclaredUrgency,
            sourceId: source.id,
            submissionUpdateId: command.updateId,
            ticketNumber,
            visitAsSoonAsPossible: draft.visitAsSoonAsPossible,
          })
          .returning({ id: serviceRequests.id });
        if (!created) throw new Error('Service request was not created');

        await tx.insert(requestStatusHistory).values({
          actorUserId: user.id,
          metadata: {
            residentDeclaredUrgency: draft.residentDeclaredUrgency,
            source: 'TELEGRAM',
            visitAsSoonAsPossible: draft.visitAsSoonAsPossible,
          },
          requestId: created.id,
          requestVersion: 0,
          toStatus: 'RECEIVED',
          transitionKey: 'SUBMITTED',
        });
        await tx.insert(auditLogs).values({
          action: 'request.submitted',
          actorUserId: user.id,
          after: {
            residentDeclaredUrgency: draft.residentDeclaredUrgency,
            source: 'TELEGRAM',
            status: 'RECEIVED',
            ticketNumber,
            version: 0,
            visitAsSoonAsPossible: draft.visitAsSoonAsPossible,
          },
          entityId: created.id,
          entityType: 'service_request',
          requestId: command.updateId.toString(),
        });
        if (draft.photos.length > 0) {
          await tx.insert(attachments).values(
            draft.photos.map((photo) => ({
              fileSize: photo.fileSize,
              requestId: created.id,
              telegramFileId: photo.fileId,
              telegramFileUniqueId: photo.fileUniqueId,
            })),
          );
        }
        finalResponse = withTicket(finalResponse, ticketNumber);
      }

      const storedSession = plan.submit ? { ...plan.session, draft: { photos: [] } } : plan.session;

      await tx
        .insert(telegramIntakeSessions)
        .values({
          draft: storedSession.draft,
          language: storedSession.language,
          step: storedSession.step,
          userId: user.id,
          version: storedSession.version,
        })
        .onConflictDoUpdate({
          set: {
            draft: storedSession.draft,
            language: storedSession.language,
            step: storedSession.step,
            updatedAt: new Date(),
            version: storedSession.version,
          },
          target: telegramIntakeSessions.userId,
        });

      await tx
        .update(telegramUpdateReceipts)
        .set({ response: finalResponse })
        .where(eq(telegramUpdateReceipts.updateId, command.updateId));
      return finalResponse;
    });
  }
}
