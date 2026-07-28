import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

import { orderStatuses } from '../../domain/orders/order-state-machine.js';
import { requestStatuses } from '../../domain/requests/request-state-machine.js';
import type { IntakeDraft, IntakeResponse } from '../../application/intake/intake-types.js';
import type { InspectionItemInput } from '../../domain/quality/quality-policy.js';
import type { NotificationPayload } from '../../domain/notifications/notification-policy.js';

const createdAt = timestamp('created_at', { mode: 'date', withTimezone: true })
  .notNull()
  .defaultNow();
const updatedAt = timestamp('updated_at', { mode: 'date', withTimezone: true })
  .notNull()
  .defaultNow();

export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'DISABLED']);
export const staffAccessStatusEnum = pgEnum('staff_access_status', ['ACTIVE', 'SUSPENDED']);
export const commercialBillingTypeEnum = pgEnum('commercial_billing_type', [
  'NO_CHARGE',
  'FIXED_PRICE',
]);
export const quotationStatusEnum = pgEnum('quotation_status', [
  'ISSUED',
  'ACCEPTED',
  'REJECTED',
  'VOID',
]);
export const commercialContractStatusEnum = pgEnum('commercial_contract_status', [
  'RECORDED',
  'VOID',
]);
export const acceptanceCertificateStatusEnum = pgEnum('acceptance_certificate_status', [
  'ISSUED',
  'VOID',
]);
export const commercialPaymentStatusEnum = pgEnum('commercial_payment_status', [
  'CONFIRMED',
  'VOID',
]);
export const commercialPaymentMethodEnum = pgEnum('commercial_payment_method', [
  'CASH',
  'BANK_TRANSFER',
  'OTHER',
]);
export const commercialExpenseStatusEnum = pgEnum('commercial_expense_status', [
  'RECORDED',
  'VOID',
]);
export const commercialExpenseCategoryEnum = pgEnum('commercial_expense_category', [
  'LABOR',
  'MATERIAL',
  'TRANSPORT',
  'OTHER',
]);
export const commercialDocumentKindEnum = pgEnum('commercial_document_kind', [
  'QUOTATION',
  'CONTRACT_REFERENCE',
  'ACCEPTANCE_CERTIFICATE',
  'PAYMENT_RECEIPT',
]);
export const requestStatusEnum = pgEnum('request_status', requestStatuses);
export const orderStatusEnum = pgEnum('order_status', orderStatuses);
export const priorityBandEnum = pgEnum('priority_band', [
  'URGENT',
  'IMPORTANT',
  'PLANNED',
  'MONITOR',
]);
export const residentDeclaredUrgencyEnum = pgEnum('resident_declared_urgency', [
  'CRITICAL',
  'IMPORTANT',
  'PLANNED',
]);
export const duplicateMatchStatusEnum = pgEnum('duplicate_match_status', [
  'SUGGESTED',
  'CONFIRMED',
  'DISMISSED',
]);
export const informationMessageDirectionEnum = pgEnum('information_message_direction', [
  'REQUEST',
  'RESPONSE',
]);
export const assignmentStatusEnum = pgEnum('assignment_status', [
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'COMPLETED',
  'CANCELLED',
]);
export const workLogTypeEnum = pgEnum('work_log_type', [
  'PROGRESS',
  'BLOCKED',
  'UNBLOCKED',
  'COMPLETION',
]);
export const workEvidencePhaseEnum = pgEnum('work_evidence_phase', ['BEFORE', 'AFTER']);
export const escalationStatusEnum = pgEnum('escalation_status', [
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
]);
export const escalationTypeEnum = pgEnum('escalation_type', ['DEADLINE_OVERDUE']);
export const qualityAcceptanceModeEnum = pgEnum('quality_acceptance_mode', [
  'RESIDENT_OR_OPERATOR',
  'OPERATOR_ONLY',
]);
export const qualityInspectionOutcomeEnum = pgEnum('quality_inspection_outcome', ['PASS', 'FAIL']);
export const qualityAcceptanceSourceEnum = pgEnum('quality_acceptance_source', [
  'OPERATOR',
  'RESIDENT',
]);
export const qualityComplaintStatusEnum = pgEnum('quality_complaint_status', [
  'OPEN',
  'REOPENED',
  'RESOLVED',
  'REJECTED',
]);
export const qualityReworkSourceEnum = pgEnum('quality_rework_source', ['ACCEPTANCE', 'COMPLAINT']);
export const notificationAudienceEnum = pgEnum('notification_audience', ['RESIDENT', 'STAFF']);
export const notificationStatusEnum = pgEnum('notification_status', [
  'PENDING',
  'PROCESSING',
  'DELIVERED',
  'DEAD_LETTER',
]);
export const notificationAttemptOutcomeEnum = pgEnum('notification_attempt_outcome', [
  'DELIVERED',
  'RETRY_SCHEDULED',
  'DEAD_LETTER',
]);
export const pdcaStageEnum = pgEnum('pdca_stage', [
  'PLAN',
  'DO',
  'CHECK',
  'ACT',
  'COMPLETED',
  'CANCELLED',
]);
export const serviceRequestTicketSequence = pgSequence('service_request_ticket_seq', {
  startWith: 1,
});
export const orderPortfolioSequence = pgSequence('order_portfolio_seq', { startWith: 1 });
export const qualityComplaintSequence = pgSequence('quality_complaint_seq', { startWith: 1 });
export const notificationSequence = pgSequence('notification_seq', { startWith: 1 });
export const pdcaActionSequence = pgSequence('pdca_action_seq', { startWith: 1 });
export const staffProfileSequence = pgSequence('staff_profile_seq', { startWith: 1 });
export const commercialQuotationSequence = pgSequence('commercial_quotation_seq', {
  startWith: 1,
});
export const commercialContractSequence = pgSequence('commercial_contract_seq', { startWith: 1 });
export const acceptanceCertificateSequence = pgSequence('acceptance_certificate_seq', {
  startWith: 1,
});
export const commercialPaymentSequence = pgSequence('commercial_payment_seq', { startWith: 1 });
export const commercialExpenseSequence = pgSequence('commercial_expense_seq', { startWith: 1 });
export const commercialDocumentSequence = pgSequence('commercial_document_seq', { startWith: 1 });

export const serviceAreas = pgTable(
  'service_areas',
  {
    code: varchar('code', { length: 50 }).notNull(),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    isActive: boolean('is_active').notNull().default(true),
    nameUzCyrl: varchar('name_uz_cyrl', { length: 200 }).notNull(),
    nameUzLatn: varchar('name_uz_latn', { length: 200 }).notNull(),
    updatedAt,
  },
  (table) => [
    uniqueIndex('service_areas_code_uq').on(table.code),
    check('service_areas_code_nonempty_ck', sql`length(trim(${table.code})) > 0`),
  ],
);

export const users = pgTable(
  'users',
  {
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    status: userStatusEnum('status').notNull().default('ACTIVE'),
    telegramUserId: bigint('telegram_user_id', { mode: 'bigint' }),
    updatedAt,
  },
  (table) => [
    uniqueIndex('users_telegram_user_id_uq').on(table.telegramUserId),
    index('users_status_idx').on(table.status),
  ],
);

export const residentProfiles = pgTable(
  'resident_profiles',
  {
    fullName: varchar('full_name', { length: 120 }),
    language: varchar('language', { length: 20 }).notNull(),
    phone: varchar('phone', { length: 16 }),
    updatedAt,
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    check('resident_profiles_language_ck', sql`${table.language} in ('uz-Latn', 'uz-Cyrl', 'ru')`),
    check(
      'resident_profiles_phone_ck',
      sql`${table.phone} is null or ${table.phone} ~ '^\\+[1-9][0-9]{7,14}$'`,
    ),
    check(
      'resident_profiles_full_name_ck',
      sql`${table.fullName} is null or length(trim(${table.fullName})) between 3 and 120`,
    ),
  ],
);

export const privacyConsents = pgTable(
  'privacy_consents',
  {
    acceptedAt: timestamp('accepted_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid('id').primaryKey().defaultRandom(),
    noticeVersion: varchar('notice_version', { length: 50 }).notNull(),
    telegramUpdateId: bigint('telegram_update_id', { mode: 'bigint' }).notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (table) => [
    uniqueIndex('privacy_consents_user_version_uq').on(table.userId, table.noticeVersion),
    uniqueIndex('privacy_consents_update_uq').on(table.telegramUpdateId),
  ],
);

export const telegramIntakeSessions = pgTable(
  'telegram_intake_sessions',
  {
    draft: jsonb('draft').$type<IntakeDraft>().notNull().default({ photos: [] }),
    language: varchar('language', { length: 20 }),
    step: varchar('step', { length: 40 }).notNull(),
    updatedAt,
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(0),
  },
  (table) => [
    check(
      'telegram_intake_sessions_step_ck',
      sql`${table.step} in ('CHOOSE_LANGUAGE', 'ACCEPT_PRIVACY', 'ENTER_FULL_NAME', 'SHARE_CONTACT', 'CHOOSE_CATEGORY', 'CHOOSE_URGENCY', 'ENTER_DESCRIPTION', 'ENTER_ADDRESS', 'CHOOSE_VISIT_DATE', 'CHOOSE_VISIT_PERIOD', 'CHOOSE_VISIT_SLOT', 'ADD_PHOTOS', 'REVIEW', 'SUBMITTED')`,
    ),
    check(
      'telegram_intake_sessions_language_ck',
      sql`${table.language} is null or ${table.language} in ('uz-Latn', 'uz-Cyrl', 'ru')`,
    ),
    check('telegram_intake_sessions_version_ck', sql`${table.version} >= 0`),
  ],
);

export const telegramUpdateReceipts = pgTable(
  'telegram_update_receipts',
  {
    processedAt: timestamp('processed_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    response: jsonb('response').$type<IntakeResponse>().notNull(),
    telegramUserId: bigint('telegram_user_id', { mode: 'bigint' }).notNull(),
    updateId: bigint('update_id', { mode: 'bigint' }).primaryKey(),
  },
  (table) => [
    index('telegram_update_receipts_user_idx').on(table.telegramUserId, table.processedAt),
  ],
);

export const roles = pgTable(
  'roles',
  {
    code: varchar('code', { length: 80 }).notNull(),
    description: text('description').notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
  },
  (table) => [uniqueIndex('roles_code_uq').on(table.code)],
);

export const permissions = pgTable(
  'permissions',
  {
    code: varchar('code', { length: 120 }).notNull(),
    description: text('description').notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
  },
  (table) => [uniqueIndex('permissions_code_uq').on(table.code)],
);

export const rolePermissions = pgTable(
  'role_permissions',
  {
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'restrict' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.roleId, table.permissionId] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    createdAt,
    grantedByUserId: uuid('granted_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    id: uuid('id').primaryKey().defaultRandom(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    serviceAreaId: uuid('service_area_id').references(() => serviceAreas.id, {
      onDelete: 'restrict',
    }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('user_roles_global_uq')
      .on(table.userId, table.roleId)
      .where(sql`${table.serviceAreaId} is null`),
    uniqueIndex('user_roles_scoped_uq')
      .on(table.userId, table.roleId, table.serviceAreaId)
      .where(sql`${table.serviceAreaId} is not null`),
    index('user_roles_scope_idx').on(table.serviceAreaId, table.userId),
  ],
);

export const staffProfiles = pgTable(
  'staff_profiles',
  {
    code: varchar('code', { length: 30 }).notNull(),
    createdAt,
    displayName: varchar('display_name', { length: 120 }).notNull(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    serviceAreaId: uuid('service_area_id')
      .notNull()
      .references(() => serviceAreas.id, { onDelete: 'restrict' }),
    status: staffAccessStatusEnum('status').notNull().default('ACTIVE'),
    updatedAt,
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('staff_profiles_code_uq').on(table.code),
    index('staff_profiles_area_status_idx').on(table.serviceAreaId, table.status, table.code),
    check(
      'staff_profiles_display_name_ck',
      sql`length(trim(${table.displayName})) between 2 and 120`,
    ),
  ],
);

export const serviceCategories = pgTable(
  'service_categories',
  {
    code: varchar('code', { length: 80 }).notNull(),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    isActive: boolean('is_active').notNull().default(true),
    nameRu: varchar('name_ru', { length: 200 }).notNull(),
    nameUzCyrl: varchar('name_uz_cyrl', { length: 200 }).notNull(),
    nameUzLatn: varchar('name_uz_latn', { length: 200 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    updatedAt,
  },
  (table) => [
    uniqueIndex('service_categories_code_uq').on(table.code),
    check('service_categories_sort_order_ck', sql`${table.sortOrder} >= 0`),
  ],
);

export const executorProfiles = pgTable(
  'executor_profiles',
  {
    code: varchar('code', { length: 50 }).notNull(),
    displayName: varchar('display_name', { length: 200 }).notNull(),
    isAvailable: boolean('is_available').notNull().default(true),
    updatedAt,
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('executor_profiles_code_uq').on(table.code),
    check('executor_profiles_code_nonempty_ck', sql`length(trim(${table.code})) > 0`),
    check(
      'executor_profiles_display_name_nonempty_ck',
      sql`length(trim(${table.displayName})) > 0`,
    ),
  ],
);

export const executorCategoryCapabilities = pgTable(
  'executor_category_capabilities',
  {
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'cascade' }),
    executorUserId: uuid('executor_user_id')
      .notNull()
      .references(() => executorProfiles.userId, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.executorUserId, table.categoryId] })],
);

export const requestSources = pgTable(
  'request_sources',
  {
    code: varchar('code', { length: 80 }).notNull(),
    confidenceScore: integer('confidence_score').notNull().default(3),
    id: uuid('id').primaryKey().defaultRandom(),
    isActive: boolean('is_active').notNull().default(true),
    nameUzCyrl: varchar('name_uz_cyrl', { length: 200 }).notNull(),
    nameUzLatn: varchar('name_uz_latn', { length: 200 }).notNull(),
  },
  (table) => [
    uniqueIndex('request_sources_code_uq').on(table.code),
    check(
      'request_sources_confidence_score_ck',
      sql`${table.confidenceScore} >= 0 and ${table.confidenceScore} <= 5`,
    ),
  ],
);

export const addresses = pgTable(
  'addresses',
  {
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    landmark: varchar('landmark', { length: 300 }),
    latitude: numeric('latitude', { precision: 9, scale: 6 }),
    line1: varchar('line1', { length: 500 }).notNull(),
    longitude: numeric('longitude', { precision: 9, scale: 6 }),
    serviceAreaId: uuid('service_area_id')
      .notNull()
      .references(() => serviceAreas.id, { onDelete: 'restrict' }),
  },
  (table) => [
    index('addresses_service_area_idx').on(table.serviceAreaId),
    check(
      'addresses_coordinates_pair_ck',
      sql`(${table.latitude} is null and ${table.longitude} is null) or (${table.latitude} is not null and ${table.longitude} is not null)`,
    ),
    check(
      'addresses_latitude_ck',
      sql`${table.latitude} is null or (${table.latitude} >= -90 and ${table.latitude} <= 90)`,
    ),
    check(
      'addresses_longitude_ck',
      sql`${table.longitude} is null or (${table.longitude} >= -180 and ${table.longitude} <= 180)`,
    ),
  ],
);

export const serviceRequests = pgTable(
  'service_requests',
  {
    addressId: uuid('address_id')
      .notNull()
      .references(() => addresses.id, { onDelete: 'restrict' }),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'restrict' }),
    createdAt,
    cancellationReason: text('cancellation_reason'),
    description: text('description').notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    informationRequest: text('information_request'),
    preferredVisitEnd: timestamp('preferred_visit_end', { mode: 'date', withTimezone: true }),
    preferredVisitStart: timestamp('preferred_visit_start', { mode: 'date', withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    residentDeclaredUrgency: residentDeclaredUrgencyEnum('resident_declared_urgency'),
    requesterUserId: uuid('requester_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => requestSources.id, { onDelete: 'restrict' }),
    submissionUpdateId: bigint('submission_update_id', { mode: 'bigint' }),
    status: requestStatusEnum('status').notNull().default('RECEIVED'),
    submittedAt: timestamp('submitted_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    ticketNumber: varchar('ticket_number', { length: 30 }).notNull(),
    updatedAt,
    version: integer('version').notNull().default(0),
    visitAsSoonAsPossible: boolean('visit_as_soon_as_possible').notNull().default(false),
  },
  (table) => [
    uniqueIndex('service_requests_ticket_number_uq').on(table.ticketNumber),
    uniqueIndex('service_requests_submission_update_uq').on(table.submissionUpdateId),
    index('service_requests_status_submitted_idx').on(table.status, table.submittedAt),
    index('service_requests_requester_idx').on(table.requesterUserId, table.submittedAt),
    check('service_requests_version_ck', sql`${table.version} >= 0`),
    check('service_requests_description_ck', sql`length(trim(${table.description})) > 0`),
    check(
      'service_requests_visit_window_pair_ck',
      sql`(${table.preferredVisitStart} is null and ${table.preferredVisitEnd} is null) or (${table.preferredVisitStart} is not null and ${table.preferredVisitEnd} is not null and ${table.preferredVisitEnd} > ${table.preferredVisitStart})`,
    ),
    check(
      'service_requests_visit_choice_ck',
      sql`not ${table.visitAsSoonAsPossible} or (${table.preferredVisitStart} is null and ${table.preferredVisitEnd} is null)`,
    ),
  ],
);

export const requestInformationMessages = pgTable(
  'request_information_messages',
  {
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt,
    direction: informationMessageDirectionEnum('direction').notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    message: text('message').notNull(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'restrict' }),
  },
  (table) => [
    index('request_information_messages_timeline_idx').on(table.requestId, table.createdAt),
    check(
      'request_information_messages_message_ck',
      sql`length(trim(${table.message})) between 3 and 2000`,
    ),
  ],
);

export const requestDuplicateMatches = pgTable(
  'request_duplicate_matches',
  {
    candidateRequestId: uuid('candidate_request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'restrict' }),
    createdAt,
    decidedAt: timestamp('decided_at', { mode: 'date', withTimezone: true }),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    id: uuid('id').primaryKey().defaultRandom(),
    reasons: jsonb('reasons').$type<readonly string[]>().notNull(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'restrict' }),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    status: duplicateMatchStatusEnum('status').notNull().default('SUGGESTED'),
  },
  (table) => [
    uniqueIndex('request_duplicate_matches_pair_uq').on(table.requestId, table.candidateRequestId),
    index('request_duplicate_matches_candidate_idx').on(table.candidateRequestId, table.status),
    check(
      'request_duplicate_matches_distinct_ck',
      sql`${table.requestId} <> ${table.candidateRequestId}`,
    ),
    check('request_duplicate_matches_score_ck', sql`${table.score} >= 0 and ${table.score} <= 100`),
  ],
);

export const priorityModels = pgTable(
  'priority_models',
  {
    code: varchar('code', { length: 80 }).notNull(),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    isActive: boolean('is_active').notNull().default(false),
    version: integer('version').notNull(),
  },
  (table) => [
    uniqueIndex('priority_models_code_version_uq').on(table.code, table.version),
    uniqueIndex('priority_models_active_code_uq')
      .on(table.code)
      .where(sql`${table.isActive} = true`),
    check('priority_models_version_ck', sql`${table.version} > 0`),
  ],
);

export const priorityCriteria = pgTable(
  'priority_criteria',
  {
    code: varchar('code', { length: 80 }).notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    maximumValue: integer('maximum_value').notNull().default(5),
    modelId: uuid('model_id')
      .notNull()
      .references(() => priorityModels.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    weight: integer('weight').notNull(),
  },
  (table) => [
    uniqueIndex('priority_criteria_model_code_uq').on(table.modelId, table.code),
    check(
      'priority_criteria_code_ck',
      sql`${table.code} in ('SAFETY_RISK', 'URGENCY', 'RESIDENTS_AFFECTED', 'SOCIAL_IMPACT', 'SOURCE_CONFIDENCE')`,
    ),
    check(
      'priority_criteria_values_ck',
      sql`${table.maximumValue} > 0 and ${table.weight} > 0 and ${table.sortOrder} >= 0`,
    ),
  ],
);

export const priorityAssessments = pgTable(
  'priority_assessments',
  {
    assessedAt: timestamp('assessed_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    assessedByUserId: uuid('assessed_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    calculatedBand: priorityBandEnum('calculated_band').notNull(),
    calculatedScore: numeric('calculated_score', { precision: 5, scale: 2 }).notNull(),
    explanation: text('explanation').notNull(),
    factors: jsonb('factors').$type<Record<string, unknown>>().notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => priorityModels.id, { onDelete: 'restrict' }),
    overrideBand: priorityBandEnum('override_band'),
    overrideReason: text('override_reason'),
    overrideScore: numeric('override_score', { precision: 5, scale: 2 }),
    overriddenAt: timestamp('overridden_at', { mode: 'date', withTimezone: true }),
    overriddenByUserId: uuid('overridden_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'restrict' }),
  },
  (table) => [
    uniqueIndex('priority_assessments_request_uq').on(table.requestId),
    index('priority_assessments_band_score_idx').on(
      table.overrideBand,
      table.calculatedBand,
      table.calculatedScore,
    ),
    check(
      'priority_assessments_calculated_score_ck',
      sql`${table.calculatedScore} >= 0 and ${table.calculatedScore} <= 100`,
    ),
    check(
      'priority_assessments_override_complete_ck',
      sql`(${table.overrideScore} is null and ${table.overrideBand} is null and ${table.overrideReason} is null and ${table.overriddenByUserId} is null and ${table.overriddenAt} is null) or (${table.overrideScore} between 0 and 100 and ${table.overrideBand} is not null and length(trim(${table.overrideReason})) between 10 and 1000 and ${table.overriddenByUserId} is not null and ${table.overriddenAt} is not null)`,
    ),
  ],
);

export const attachments = pgTable(
  'attachments',
  {
    createdAt,
    fileSize: integer('file_size').notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    mediaType: varchar('media_type', { length: 100 }).notNull().default('image/jpeg'),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'cascade' }),
    telegramFileId: text('telegram_file_id').notNull(),
    telegramFileUniqueId: varchar('telegram_file_unique_id', { length: 200 }).notNull(),
  },
  (table) => [
    uniqueIndex('attachments_request_file_uq').on(table.requestId, table.telegramFileUniqueId),
    index('attachments_request_idx').on(table.requestId, table.createdAt),
    check('attachments_file_size_ck', sql`${table.fileSize} > 0 and ${table.fileSize} <= 10485760`),
    check('attachments_media_type_ck', sql`${table.mediaType} in ('image/jpeg', 'image/png')`),
  ],
);

export const orders = pgTable(
  'orders',
  {
    blockerReason: text('blocker_reason'),
    cancellationReason: text('cancellation_reason'),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'restrict' }),
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
    completionSummary: text('completion_summary'),
    createdAt,
    currentExecutorUserId: uuid('current_executor_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    dueAt: timestamp('due_at', { mode: 'date', withTimezone: true }),
    id: uuid('id').primaryKey().defaultRandom(),
    orderNumber: varchar('order_number', { length: 30 }).notNull(),
    priorityAssessmentId: uuid('priority_assessment_id').references(() => priorityAssessments.id, {
      onDelete: 'restrict',
    }),
    priorityBand: priorityBandEnum('priority_band'),
    priorityScore: numeric('priority_score', { precision: 5, scale: 2 }),
    reworkReason: text('rework_reason'),
    serviceAreaId: uuid('service_area_id')
      .notNull()
      .references(() => serviceAreas.id, { onDelete: 'restrict' }),
    status: orderStatusEnum('status').notNull().default('REGISTERED'),
    updatedAt,
    version: integer('version').notNull().default(0),
  },
  (table) => [
    uniqueIndex('orders_order_number_uq').on(table.orderNumber),
    index('orders_portfolio_idx').on(table.serviceAreaId, table.status, table.dueAt),
    index('orders_executor_idx').on(table.currentExecutorUserId, table.status),
    check('orders_version_ck', sql`${table.version} >= 0`),
    check(
      'orders_priority_score_ck',
      sql`${table.priorityScore} is null or (${table.priorityScore} >= 0 and ${table.priorityScore} <= 100)`,
    ),
  ],
);

export const assignments = pgTable(
  'assignments',
  {
    assignedAt: timestamp('assigned_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    assignedByUserId: uuid('assigned_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    dueAt: timestamp('due_at', { mode: 'date', withTimezone: true }).notNull(),
    executorUserId: uuid('executor_user_id')
      .notNull()
      .references(() => executorProfiles.userId, { onDelete: 'restrict' }),
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    responseReason: text('response_reason'),
    respondedAt: timestamp('responded_at', { mode: 'date', withTimezone: true }),
    status: assignmentStatusEnum('status').notNull().default('PENDING'),
  },
  (table) => [
    uniqueIndex('assignments_order_active_uq')
      .on(table.orderId)
      .where(sql`${table.status} in ('PENDING', 'ACCEPTED')`),
    index('assignments_executor_status_idx').on(table.executorUserId, table.status, table.dueAt),
    check('assignments_due_after_assigned_ck', sql`${table.dueAt} > ${table.assignedAt}`),
  ],
);

export const orderExecutionSlaClocks = pgTable(
  'order_execution_sla_clocks',
  {
    dueAt: timestamp('due_at', { mode: 'date', withTimezone: true }).notNull(),
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'cascade' }),
    pausedAt: timestamp('paused_at', { mode: 'date', withTimezone: true }),
    pausedSeconds: integer('paused_seconds').notNull().default(0),
    startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }),
    stoppedAt: timestamp('stopped_at', { mode: 'date', withTimezone: true }),
    updatedAt,
  },
  (table) => [
    index('order_execution_sla_due_idx').on(table.dueAt, table.stoppedAt),
    check('order_execution_sla_paused_seconds_ck', sql`${table.pausedSeconds} >= 0`),
  ],
);

export const workLogs = pgTable(
  'work_logs',
  {
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    logType: workLogTypeEnum('log_type').notNull(),
    note: text('note').notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
  },
  (table) => [
    index('work_logs_order_timeline_idx').on(table.orderId, table.createdAt),
    check('work_logs_note_ck', sql`length(trim(${table.note})) between 3 and 2000`),
  ],
);

export const workEvidence = pgTable(
  'work_evidence',
  {
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt,
    fileSize: integer('file_size').notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    mediaType: varchar('media_type', { length: 100 }).notNull().default('image/jpeg'),
    note: varchar('note', { length: 500 }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    phase: workEvidencePhaseEnum('phase').notNull(),
    telegramFileId: text('telegram_file_id').notNull(),
    telegramFileUniqueId: varchar('telegram_file_unique_id', { length: 200 }).notNull(),
  },
  (table) => [
    uniqueIndex('work_evidence_file_uq').on(table.orderId, table.telegramFileUniqueId),
    index('work_evidence_order_phase_idx').on(table.orderId, table.phase, table.createdAt),
    check(
      'work_evidence_file_size_ck',
      sql`${table.fileSize} > 0 and ${table.fileSize} <= 10485760`,
    ),
    check('work_evidence_media_type_ck', sql`${table.mediaType} in ('image/jpeg', 'image/png')`),
  ],
);

export const orderEscalations = pgTable(
  'order_escalations',
  {
    acknowledgedAt: timestamp('acknowledged_at', { mode: 'date', withTimezone: true }),
    acknowledgedByUserId: uuid('acknowledged_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    resolvedAt: timestamp('resolved_at', { mode: 'date', withTimezone: true }),
    status: escalationStatusEnum('status').notNull().default('OPEN'),
    type: escalationTypeEnum('type').notNull(),
  },
  (table) => [
    uniqueIndex('order_escalations_open_uq')
      .on(table.orderId, table.type)
      .where(sql`${table.status} in ('OPEN', 'ACKNOWLEDGED')`),
    index('order_escalations_status_idx').on(table.status, table.createdAt),
  ],
);

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    attemptCount: integer('attempt_count').notNull().default(0),
    audience: notificationAudienceEnum('audience').notNull(),
    availableAt: timestamp('available_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    code: varchar('code', { length: 30 }).notNull(),
    createdAt,
    deduplicationKey: varchar('deduplication_key', { length: 250 }).notNull(),
    deliveredAt: timestamp('delivered_at', { mode: 'date', withTimezone: true }),
    eventType: varchar('event_type', { length: 100 }).notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    lastErrorCode: varchar('last_error_code', { length: 100 }),
    lockedAt: timestamp('locked_at', { mode: 'date', withTimezone: true }),
    lockedBy: varchar('locked_by', { length: 100 }),
    maxAttempts: integer('max_attempts').notNull().default(5),
    payload: jsonb('payload').$type<NotificationPayload>().notNull(),
    recipientUserId: uuid('recipient_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    serviceAreaId: uuid('service_area_id').references(() => serviceAreas.id, {
      onDelete: 'restrict',
    }),
    status: notificationStatusEnum('status').notNull().default('PENDING'),
    updatedAt,
  },
  (table) => [
    uniqueIndex('notification_outbox_code_uq').on(table.code),
    uniqueIndex('notification_outbox_deduplication_uq').on(table.deduplicationKey),
    index('notification_outbox_claim_idx').on(table.status, table.availableAt, table.createdAt),
    index('notification_outbox_area_failure_idx').on(
      table.serviceAreaId,
      table.status,
      table.updatedAt,
    ),
    check('notification_outbox_attempt_count_ck', sql`${table.attemptCount} >= 0`),
    check('notification_outbox_max_attempts_ck', sql`${table.maxAttempts} between 1 and 20`),
  ],
);

export const notificationDeliveryAttempts = pgTable(
  'notification_delivery_attempts',
  {
    attemptNumber: integer('attempt_number').notNull(),
    errorCode: varchar('error_code', { length: 100 }),
    finishedAt: timestamp('finished_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    id: uuid('id').primaryKey().defaultRandom(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notificationOutbox.id, { onDelete: 'cascade' }),
    outcome: notificationAttemptOutcomeEnum('outcome').notNull(),
    providerMessageId: varchar('provider_message_id', { length: 100 }),
  },
  (table) => [
    uniqueIndex('notification_attempt_number_uq').on(table.notificationId, table.attemptNumber),
    index('notification_attempt_outcome_idx').on(table.outcome, table.finishedAt),
    check('notification_attempt_number_ck', sql`${table.attemptNumber} > 0`),
  ],
);

export const pdcaActions = pgTable(
  'pdca_actions',
  {
    categoryId: uuid('category_id').references(() => serviceCategories.id, {
      onDelete: 'restrict',
    }),
    code: varchar('code', { length: 30 }).notNull(),
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
    createdAt,
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    dueAt: timestamp('due_at', { mode: 'date', withTimezone: true }).notNull(),
    expectedOutcome: text('expected_outcome').notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    plannedAction: text('planned_action').notNull(),
    problemStatement: text('problem_statement').notNull(),
    result: text('result'),
    serviceAreaId: uuid('service_area_id')
      .notNull()
      .references(() => serviceAreas.id, { onDelete: 'restrict' }),
    stage: pdcaStageEnum('stage').notNull().default('PLAN'),
    title: varchar('title', { length: 200 }).notNull(),
    updatedAt,
    version: integer('version').notNull().default(0),
  },
  (table) => [
    uniqueIndex('pdca_actions_code_uq').on(table.code),
    index('pdca_actions_area_stage_due_idx').on(table.serviceAreaId, table.stage, table.dueAt),
    index('pdca_actions_owner_stage_idx').on(table.ownerUserId, table.stage, table.dueAt),
    check('pdca_actions_due_ck', sql`${table.dueAt} > ${table.createdAt}`),
    check('pdca_actions_version_ck', sql`${table.version} >= 0`),
    check('pdca_actions_title_ck', sql`length(trim(${table.title})) between 3 and 200`),
    check(
      'pdca_actions_problem_ck',
      sql`length(trim(${table.problemStatement})) between 3 and 2000`,
    ),
    check('pdca_actions_plan_ck', sql`length(trim(${table.plannedAction})) between 3 and 2000`),
    check(
      'pdca_actions_expected_ck',
      sql`length(trim(${table.expectedOutcome})) between 3 and 1000`,
    ),
    check(
      'pdca_actions_result_ck',
      sql`${table.result} is null or length(trim(${table.result})) between 3 and 1000`,
    ),
    check(
      'pdca_actions_completion_ck',
      sql`(${table.stage} = 'COMPLETED' and ${table.completedAt} is not null and ${table.result} is not null) or (${table.stage} <> 'COMPLETED' and ${table.completedAt} is null)`,
    ),
  ],
);

export const pdcaActionHistory = pgTable(
  'pdca_action_history',
  {
    actionId: uuid('action_id')
      .notNull()
      .references(() => pdcaActions.id, { onDelete: 'restrict' }),
    actionVersion: integer('action_version').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    fromStage: pdcaStageEnum('from_stage'),
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    reason: text('reason').notNull(),
    toStage: pdcaStageEnum('to_stage').notNull(),
  },
  (table) => [
    uniqueIndex('pdca_action_history_version_uq').on(table.actionId, table.actionVersion),
    index('pdca_action_history_timeline_idx').on(table.actionId, table.occurredAt),
    check('pdca_action_history_version_ck', sql`${table.actionVersion} >= 0`),
    check('pdca_action_history_reason_ck', sql`length(trim(${table.reason})) between 3 and 1000`),
  ],
);

export const qualityChecklistTemplates = pgTable(
  'quality_checklist_templates',
  {
    acceptanceMode: qualityAcceptanceModeEnum('acceptance_mode')
      .notNull()
      .default('RESIDENT_OR_OPERATOR'),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => serviceCategories.id, { onDelete: 'restrict' }),
    complaintReviewHours: integer('complaint_review_hours').notNull().default(48),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    inspectionRequired: boolean('inspection_required').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    name: varchar('name', { length: 200 }).notNull(),
    reworkTargetHours: integer('rework_target_hours').notNull().default(24),
    version: integer('version').notNull(),
    warrantyDays: integer('warranty_days').notNull().default(7),
  },
  (table) => [
    uniqueIndex('quality_templates_category_version_uq').on(table.categoryId, table.version),
    uniqueIndex('quality_templates_category_active_uq')
      .on(table.categoryId)
      .where(sql`${table.isActive} = true`),
    check('quality_templates_name_ck', sql`length(trim(${table.name})) > 0`),
    check('quality_templates_version_ck', sql`${table.version} > 0`),
    check('quality_templates_warranty_days_ck', sql`${table.warrantyDays} between 0 and 365`),
    check('quality_templates_rework_hours_ck', sql`${table.reworkTargetHours} between 1 and 720`),
    check(
      'quality_templates_complaint_review_hours_ck',
      sql`${table.complaintReviewHours} between 1 and 720`,
    ),
  ],
);

export const qualityChecklistItems = pgTable(
  'quality_checklist_items',
  {
    code: varchar('code', { length: 50 }).notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    isRequired: boolean('is_required').notNull().default(true),
    labelRu: varchar('label_ru', { length: 300 }).notNull(),
    labelUzCyrl: varchar('label_uz_cyrl', { length: 300 }).notNull(),
    labelUzLatn: varchar('label_uz_latn', { length: 300 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    templateId: uuid('template_id')
      .notNull()
      .references(() => qualityChecklistTemplates.id, { onDelete: 'cascade' }),
  },
  (table) => [
    uniqueIndex('quality_checklist_items_template_code_uq').on(table.templateId, table.code),
    check('quality_checklist_items_code_ck', sql`length(trim(${table.code})) > 0`),
    check('quality_checklist_items_sort_ck', sql`${table.sortOrder} >= 0`),
  ],
);

export const qualityInspections = pgTable(
  'quality_inspections',
  {
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    attempt: integer('attempt').notNull(),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    orderVersion: integer('order_version').notNull(),
    outcome: qualityInspectionOutcomeEnum('outcome').notNull(),
    results: jsonb('results').$type<readonly InspectionItemInput[]>().notNull(),
    summary: text('summary').notNull(),
    templateId: uuid('template_id')
      .notNull()
      .references(() => qualityChecklistTemplates.id, { onDelete: 'restrict' }),
    templateVersion: integer('template_version').notNull(),
  },
  (table) => [
    uniqueIndex('quality_inspections_order_attempt_uq').on(table.orderId, table.attempt),
    index('quality_inspections_order_outcome_idx').on(
      table.orderId,
      table.outcome,
      table.createdAt,
    ),
    check('quality_inspections_attempt_ck', sql`${table.attempt} > 0`),
    check('quality_inspections_order_version_ck', sql`${table.orderVersion} >= 0`),
    check('quality_inspections_summary_ck', sql`length(trim(${table.summary})) between 3 and 1000`),
  ],
);

export const orderAcceptances = pgTable(
  'order_acceptances',
  {
    acceptedAt: timestamp('accepted_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    id: uuid('id').primaryKey().defaultRandom(),
    inspectionId: uuid('inspection_id').references(() => qualityInspections.id, {
      onDelete: 'restrict',
    }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    orderVersion: integer('order_version').notNull(),
    source: qualityAcceptanceSourceEnum('source').notNull(),
  },
  (table) => [
    uniqueIndex('order_acceptances_order_version_uq').on(table.orderId, table.orderVersion),
    check('order_acceptances_version_ck', sql`${table.orderVersion} > 0`),
  ],
);

export const revenueSources = pgTable(
  'revenue_sources',
  {
    code: varchar('code', { length: 50 }).notNull(),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    isActive: boolean('is_active').notNull().default(true),
    nameRu: varchar('name_ru', { length: 200 }).notNull(),
    nameUzLatn: varchar('name_uz_latn', { length: 200 }).notNull(),
    updatedAt,
  },
  (table) => [
    uniqueIndex('revenue_sources_code_uq').on(table.code),
    check('revenue_sources_code_ck', sql`length(trim(${table.code})) between 2 and 50`),
  ],
);

export const orderCommercialProfiles = pgTable(
  'order_commercial_profiles',
  {
    billingType: commercialBillingTypeEnum('billing_type').notNull(),
    contractRequired: boolean('contract_required').notNull().default(false),
    createdAt,
    currency: varchar('currency', { length: 3 }).notNull().default('UZS'),
    orderId: uuid('order_id')
      .primaryKey()
      .references(() => orders.id, { onDelete: 'restrict' }),
    revenueSourceId: uuid('revenue_source_id')
      .notNull()
      .references(() => revenueSources.id, { onDelete: 'restrict' }),
    setByUserId: uuid('set_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    updatedAt,
  },
  (table) => [
    index('order_commercial_profiles_source_idx').on(table.revenueSourceId, table.billingType),
    check('order_commercial_profiles_currency_ck', sql`${table.currency} = 'UZS'`),
    check(
      'order_commercial_profiles_contract_ck',
      sql`not ${table.contractRequired} or ${table.billingType} = 'FIXED_PRICE'`,
    ),
  ],
);

export const commercialQuotations = pgTable(
  'commercial_quotations',
  {
    acceptedAt: timestamp('accepted_at', { mode: 'date', withTimezone: true }),
    acceptedByUserId: uuid('accepted_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    approvalReference: varchar('approval_reference', { length: 500 }),
    code: varchar('code', { length: 30 }).notNull(),
    createdAt,
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    id: uuid('id').primaryKey().defaultRandom(),
    laborAmount: bigint('labor_amount', { mode: 'bigint' }).notNull(),
    materialAmount: bigint('material_amount', { mode: 'bigint' }).notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    otherAmount: bigint('other_amount', { mode: 'bigint' }).notNull(),
    scope: text('scope').notNull(),
    status: quotationStatusEnum('status').notNull().default('ISSUED'),
    totalAmount: bigint('total_amount', { mode: 'bigint' }).notNull(),
    validUntil: timestamp('valid_until', { mode: 'date', withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('commercial_quotations_code_uq').on(table.code),
    uniqueIndex('commercial_quotations_order_active_uq')
      .on(table.orderId)
      .where(sql`${table.status} in ('ISSUED', 'ACCEPTED')`),
    index('commercial_quotations_status_valid_idx').on(table.status, table.validUntil),
    check(
      'commercial_quotations_amounts_ck',
      sql`${table.laborAmount} >= 0 and ${table.materialAmount} >= 0 and ${table.otherAmount} >= 0 and ${table.totalAmount} > 0 and ${table.totalAmount} = ${table.laborAmount} + ${table.materialAmount} + ${table.otherAmount}`,
    ),
    check('commercial_quotations_scope_ck', sql`length(trim(${table.scope})) between 3 and 2000`),
    check('commercial_quotations_valid_ck', sql`${table.validUntil} > ${table.createdAt}`),
    check(
      'commercial_quotations_acceptance_ck',
      sql`(${table.status} = 'ACCEPTED' and ${table.acceptedAt} is not null and ${table.acceptedByUserId} is not null and ${table.approvalReference} is not null) or (${table.status} <> 'ACCEPTED' and ${table.acceptedAt} is null and ${table.acceptedByUserId} is null and ${table.approvalReference} is null)`,
    ),
  ],
);

export const commercialContracts = pgTable(
  'commercial_contracts',
  {
    code: varchar('code', { length: 30 }).notNull(),
    createdAt,
    externalReference: varchar('external_reference', { length: 200 }).notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    quotationId: uuid('quotation_id')
      .notNull()
      .references(() => commercialQuotations.id, { onDelete: 'restrict' }),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: commercialContractStatusEnum('status').notNull().default('RECORDED'),
    termsSummary: text('terms_summary').notNull(),
  },
  (table) => [
    uniqueIndex('commercial_contracts_code_uq').on(table.code),
    uniqueIndex('commercial_contracts_external_reference_uq').on(table.externalReference),
    uniqueIndex('commercial_contracts_order_active_uq')
      .on(table.orderId)
      .where(sql`${table.status} = 'RECORDED'`),
    check(
      'commercial_contracts_reference_ck',
      sql`length(trim(${table.externalReference})) between 3 and 200`,
    ),
    check(
      'commercial_contracts_terms_ck',
      sql`length(trim(${table.termsSummary})) between 3 and 2000`,
    ),
  ],
);

export const acceptanceCertificates = pgTable(
  'acceptance_certificates',
  {
    acceptanceId: uuid('acceptance_id')
      .notNull()
      .references(() => orderAcceptances.id, { onDelete: 'restrict' }),
    code: varchar('code', { length: 30 }).notNull(),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    issuedByUserId: uuid('issued_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    status: acceptanceCertificateStatusEnum('status').notNull().default('ISSUED'),
    summary: text('summary').notNull(),
  },
  (table) => [
    uniqueIndex('acceptance_certificates_code_uq').on(table.code),
    uniqueIndex('acceptance_certificates_acceptance_uq').on(table.acceptanceId),
    index('acceptance_certificates_order_idx').on(table.orderId, table.createdAt),
    check(
      'acceptance_certificates_summary_ck',
      sql`length(trim(${table.summary})) between 3 and 2000`,
    ),
  ],
);

export const commercialPayments = pgTable(
  'commercial_payments',
  {
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    code: varchar('code', { length: 30 }).notNull(),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    method: commercialPaymentMethodEnum('method').notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    paidAt: timestamp('paid_at', { mode: 'date', withTimezone: true }).notNull(),
    proofReference: varchar('proof_reference', { length: 500 }).notNull(),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: commercialPaymentStatusEnum('status').notNull().default('CONFIRMED'),
  },
  (table) => [
    uniqueIndex('commercial_payments_code_uq').on(table.code),
    index('commercial_payments_order_status_idx').on(table.orderId, table.status, table.paidAt),
    check('commercial_payments_amount_ck', sql`${table.amount} > 0`),
    check(
      'commercial_payments_reference_ck',
      sql`length(trim(${table.proofReference})) between 3 and 500`,
    ),
  ],
);

export const commercialExpenses = pgTable(
  'commercial_expenses',
  {
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    category: commercialExpenseCategoryEnum('category').notNull(),
    code: varchar('code', { length: 30 }).notNull(),
    createdAt,
    description: text('description').notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    incurredAt: timestamp('incurred_at', { mode: 'date', withTimezone: true }).notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    recordedByUserId: uuid('recorded_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: commercialExpenseStatusEnum('status').notNull().default('RECORDED'),
  },
  (table) => [
    uniqueIndex('commercial_expenses_code_uq').on(table.code),
    index('commercial_expenses_order_status_idx').on(table.orderId, table.status, table.incurredAt),
    check('commercial_expenses_amount_ck', sql`${table.amount} > 0`),
    check(
      'commercial_expenses_description_ck',
      sql`length(trim(${table.description})) between 3 and 1000`,
    ),
  ],
);

export const commercialDocuments = pgTable(
  'commercial_documents',
  {
    acceptanceCertificateId: uuid('acceptance_certificate_id').references(
      () => acceptanceCertificates.id,
      { onDelete: 'restrict' },
    ),
    checksumSha256: varchar('checksum_sha256', { length: 64 }).notNull(),
    code: varchar('code', { length: 30 }).notNull(),
    content: text('content').notNull(),
    contractId: uuid('contract_id').references(() => commercialContracts.id, {
      onDelete: 'restrict',
    }),
    createdAt,
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    id: uuid('id').primaryKey().defaultRandom(),
    kind: commercialDocumentKindEnum('kind').notNull(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    paymentId: uuid('payment_id').references(() => commercialPayments.id, {
      onDelete: 'restrict',
    }),
    quotationId: uuid('quotation_id').references(() => commercialQuotations.id, {
      onDelete: 'restrict',
    }),
    storageProvider: varchar('storage_provider', { length: 30 })
      .notNull()
      .default('INTERNAL_DATABASE'),
  },
  (table) => [
    uniqueIndex('commercial_documents_code_uq').on(table.code),
    index('commercial_documents_order_kind_idx').on(table.orderId, table.kind, table.createdAt),
    check('commercial_documents_checksum_ck', sql`${table.checksumSha256} ~ '^[0-9a-f]{64}$'`),
    check('commercial_documents_content_ck', sql`length(${table.content}) between 20 and 20000`),
    check('commercial_documents_storage_ck', sql`${table.storageProvider} = 'INTERNAL_DATABASE'`),
    check(
      'commercial_documents_single_source_ck',
      sql`num_nonnulls(${table.quotationId}, ${table.contractId}, ${table.acceptanceCertificateId}, ${table.paymentId}) = 1`,
    ),
  ],
);

export const orderWarranties = pgTable(
  'order_warranties',
  {
    endsAt: timestamp('ends_at', { mode: 'date', withTimezone: true }).notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    startsAt: timestamp('starts_at', { mode: 'date', withTimezone: true }).notNull(),
    warrantyDays: integer('warranty_days').notNull(),
  },
  (table) => [
    uniqueIndex('order_warranties_order_uq').on(table.orderId),
    index('order_warranties_end_idx').on(table.endsAt),
    check('order_warranties_days_ck', sql`${table.warrantyDays} between 0 and 365`),
    check('order_warranties_period_ck', sql`${table.endsAt} >= ${table.startsAt}`),
  ],
);

export const qualityFeedback = pgTable(
  'quality_feedback',
  {
    comment: text('comment'),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    rating: integer('rating').notNull(),
    requesterUserId: uuid('requester_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
  },
  (table) => [
    uniqueIndex('quality_feedback_order_requester_uq').on(table.orderId, table.requesterUserId),
    check('quality_feedback_rating_ck', sql`${table.rating} between 1 and 5`),
    check(
      'quality_feedback_comment_ck',
      sql`${table.comment} is null or length(trim(${table.comment})) between 3 and 1000`,
    ),
  ],
);

export const qualityComplaints = pgTable(
  'quality_complaints',
  {
    code: varchar('code', { length: 30 }).notNull(),
    createdAt,
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    reopenedAt: timestamp('reopened_at', { mode: 'date', withTimezone: true }),
    reopenedByUserId: uuid('reopened_by_user_id').references(() => users.id, {
      onDelete: 'restrict',
    }),
    requesterUserId: uuid('requester_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    reviewDueAt: timestamp('review_due_at', { mode: 'date', withTimezone: true }).notNull(),
    status: qualityComplaintStatusEnum('status').notNull().default('OPEN'),
    withinWarranty: boolean('within_warranty').notNull(),
  },
  (table) => [
    uniqueIndex('quality_complaints_code_uq').on(table.code),
    uniqueIndex('quality_complaints_requester_open_uq')
      .on(table.orderId, table.requesterUserId)
      .where(sql`${table.status} = 'OPEN'`),
    index('quality_complaints_status_due_idx').on(table.status, table.reviewDueAt),
    check('quality_complaints_reason_ck', sql`length(trim(${table.reason})) between 5 and 2000`),
  ],
);

export const qualityReworkDecisions = pgTable(
  'quality_rework_decisions',
  {
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    complaintId: uuid('complaint_id').references(() => qualityComplaints.id, {
      onDelete: 'restrict',
    }),
    createdAt,
    dueAt: timestamp('due_at', { mode: 'date', withTimezone: true }).notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    reason: text('reason').notNull(),
    source: qualityReworkSourceEnum('source').notNull(),
  },
  (table) => [
    index('quality_rework_order_idx').on(table.orderId, table.createdAt),
    check('quality_rework_reason_ck', sql`length(trim(${table.reason})) between 3 and 1000`),
  ],
);

export const orderRequestLinks = pgTable(
  'order_request_links',
  {
    linkedAt: timestamp('linked_at', { mode: 'date', withTimezone: true }).notNull().defaultNow(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'restrict' }),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.requestId] }),
    uniqueIndex('order_request_links_request_uq').on(table.requestId),
  ],
);

export const requestStatusHistory = pgTable(
  'request_status_history',
  {
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }),
    fromStatus: requestStatusEnum('from_status'),
    id: uuid('id').primaryKey().defaultRandom(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    reason: text('reason'),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id, { onDelete: 'restrict' }),
    requestVersion: integer('request_version').notNull(),
    toStatus: requestStatusEnum('to_status').notNull(),
    transitionKey: varchar('transition_key', { length: 100 }).notNull(),
  },
  (table) => [
    uniqueIndex('request_status_history_version_uq').on(table.requestId, table.requestVersion),
    index('request_status_history_timeline_idx').on(table.requestId, table.occurredAt),
  ],
);

export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    fromStatus: orderStatusEnum('from_status').notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),
    orderVersion: integer('order_version').notNull(),
    reason: text('reason'),
    toStatus: orderStatusEnum('to_status').notNull(),
    transitionKey: varchar('transition_key', { length: 100 }).notNull(),
  },
  (table) => [
    uniqueIndex('order_status_history_version_uq').on(table.orderId, table.orderVersion),
    index('order_status_history_timeline_idx').on(table.orderId, table.occurredAt),
  ],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    action: varchar('action', { length: 150 }).notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }),
    after: jsonb('after').$type<Record<string, unknown>>(),
    before: jsonb('before').$type<Record<string, unknown>>(),
    entityId: uuid('entity_id').notNull(),
    entityType: varchar('entity_type', { length: 80 }).notNull(),
    id: uuid('id').primaryKey().defaultRandom(),
    occurredAt: timestamp('occurred_at', { mode: 'date', withTimezone: true })
      .notNull()
      .defaultNow(),
    reason: text('reason'),
    requestId: varchar('request_id', { length: 100 }),
  },
  (table) => [
    index('audit_logs_entity_timeline_idx').on(table.entityType, table.entityId, table.occurredAt),
    index('audit_logs_actor_timeline_idx').on(table.actorUserId, table.occurredAt),
  ],
);
