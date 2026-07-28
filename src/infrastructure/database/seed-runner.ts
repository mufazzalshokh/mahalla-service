import { and, eq, sql } from 'drizzle-orm';

import { permissionKeys, type PermissionKey } from '../../domain/identity/permissions.js';
import type { MckDatabase } from './client.js';
import {
  permissions,
  priorityCriteria,
  priorityModels,
  qualityChecklistItems,
  qualityChecklistTemplates,
  revenueSources,
  requestSources,
  rolePermissions,
  roles,
  serviceAreas,
  serviceCategories,
} from './schema.js';

const rolePermissionMap: Readonly<Record<string, readonly PermissionKey[]>> = {
  administrator: permissionKeys,
  executor: [
    'order.read.area',
    'assignment.respond',
    'order.update_progress',
    'order.work_log.add',
    'order.evidence.add',
    'order.submit_completion',
    'order.start_rework',
  ],
  operator_manager: [
    'request.read.area',
    'request.validate',
    'request.request_information',
    'request.provide_information',
    'request.register',
    'request.reject',
    'request.triage',
    'request.duplicate.review',
    'order.read.area',
    'order.assign',
    'order.cancel',
    'order.escalation.review',
    'order.escalation.manage',
    'notification.manage',
    'report.read',
    'report.export',
    'finance.read',
    'finance.manage',
    'document.read',
    'pdca.manage',
    'quality.inspect',
    'quality.accept',
    'quality.require_rework',
    'quality.complaint.review',
    'quality.reopen',
    'priority.override',
    'audit.read',
  ],
  resident: ['request.read.own', 'request.provide_information', 'request.cancel.own'],
};

export async function seedFoundation(database: MckDatabase): Promise<void> {
  await database.transaction(async (tx) => {
    await tx
      .insert(serviceAreas)
      .values({
        code: 'DEMO',
        nameUzCyrl: 'Намойиш маҳалласи',
        nameUzLatn: 'Namoyish mahallasi',
      })
      .onConflictDoNothing({ target: serviceAreas.code });

    await tx
      .insert(serviceCategories)
      .values([
        {
          code: 'PLUMBING',
          nameRu: 'Сантехника',
          nameUzCyrl: 'Сантехника',
          nameUzLatn: 'Santexnika',
          sortOrder: 10,
        },
        {
          code: 'ELECTRICAL',
          nameRu: 'Электрические услуги',
          nameUzCyrl: 'Электр хизмати',
          nameUzLatn: 'Elektr xizmati',
          sortOrder: 20,
        },
        {
          code: 'REPAIR',
          nameRu: 'Ремонт',
          nameUzCyrl: 'Таъмирлаш',
          nameUzLatn: "Ta'mirlash",
          sortOrder: 30,
        },
        {
          code: 'LANDSCAPING',
          nameRu: 'Благоустройство',
          nameUzCyrl: 'Ободонлаштириш',
          nameUzLatn: 'Obodonlashtirish',
          sortOrder: 40,
        },
      ])
      .onConflictDoNothing({ target: serviceCategories.code });

    const categoryRows = await tx
      .select({ code: serviceCategories.code, id: serviceCategories.id })
      .from(serviceCategories);
    for (const category of categoryRows) {
      await tx
        .insert(qualityChecklistTemplates)
        .values({
          categoryId: category.id,
          inspectionRequired: category.code === 'ELECTRICAL',
          name: `${category.code} pilot quality checklist`,
          version: 1,
        })
        .onConflictDoNothing({
          target: [qualityChecklistTemplates.categoryId, qualityChecklistTemplates.version],
        });
      const [template] = await tx
        .select({ id: qualityChecklistTemplates.id })
        .from(qualityChecklistTemplates)
        .where(
          and(
            eq(qualityChecklistTemplates.categoryId, category.id),
            eq(qualityChecklistTemplates.version, 1),
          ),
        );
      if (!template) throw new Error(`Quality template not found: ${category.code}`);
      await tx
        .insert(qualityChecklistItems)
        .values([
          {
            code: 'WORK_COMPLETE',
            labelRu: 'Работа выполнена в согласованном объёме',
            labelUzCyrl: 'Иш келишилган ҳажмда бажарилди',
            labelUzLatn: 'Ish kelishilgan hajmda bajarildi',
            sortOrder: 10,
            templateId: template.id,
          },
          {
            code: 'RESULT_TESTED',
            labelRu: 'Результат безопасно проверен',
            labelUzCyrl: 'Натижа хавфсиз текширилди',
            labelUzLatn: 'Natija xavfsiz tekshirildi',
            sortOrder: 20,
            templateId: template.id,
          },
          {
            code: 'AREA_CLEAN',
            labelRu: 'Место работы оставлено чистым',
            labelUzCyrl: 'Иш жойи тоза қолдирилди',
            labelUzLatn: 'Ish joyi toza qoldirildi',
            sortOrder: 30,
            templateId: template.id,
          },
        ])
        .onConflictDoNothing({
          target: [qualityChecklistItems.templateId, qualityChecklistItems.code],
        });
    }

    await tx
      .insert(requestSources)
      .values([
        { code: 'TELEGRAM', confidenceScore: 4, nameUzCyrl: 'Telegram', nameUzLatn: 'Telegram' },
        { code: 'TELEPHONE', confidenceScore: 3, nameUzCyrl: 'Телефон', nameUzLatn: 'Telefon' },
        {
          code: 'HOUSEHOLD_SURVEY',
          confidenceScore: 5,
          nameUzCyrl: 'Хонадонбай сўров',
          nameUzLatn: "Xonadonbay so'rov",
        },
        {
          code: 'STREET_LEADER',
          confidenceScore: 4,
          nameUzCyrl: 'Кўчабоши',
          nameUzLatn: "Ko'chaboshi",
        },
        {
          code: 'BUILDING_REPRESENTATIVE',
          confidenceScore: 4,
          nameUzCyrl: 'Уйбоши',
          nameUzLatn: 'Uyboshi',
        },
        { code: 'OPERATOR', confidenceScore: 3, nameUzCyrl: 'Оператор', nameUzLatn: 'Operator' },
      ])
      .onConflictDoUpdate({
        set: { confidenceScore: sql`excluded.confidence_score` },
        target: requestSources.code,
      });

    await tx
      .insert(revenueSources)
      .values([
        { code: 'RESIDENT', nameRu: 'Житель', nameUzLatn: "Aholi to'lovi" },
        { code: 'ORGANIZATION', nameRu: 'Организация', nameUzLatn: 'Tashkilot' },
        { code: 'GRANT', nameRu: 'Грант', nameUzLatn: 'Grant' },
        {
          code: 'SOCIAL_FUNDING',
          nameRu: 'Социальное финансирование',
          nameUzLatn: "Ijtimoiy mablag'",
        },
        {
          code: 'ADDITIONAL_SERVICE',
          nameRu: 'Дополнительная услуга',
          nameUzLatn: "Qo'shimcha xizmat",
        },
      ])
      .onConflictDoUpdate({
        set: {
          isActive: true,
          nameRu: sql`excluded.name_ru`,
          nameUzLatn: sql`excluded.name_uz_latn`,
          updatedAt: sql`now()`,
        },
        target: revenueSources.code,
      });

    await tx
      .insert(permissions)
      .values(permissionKeys.map((code) => ({ code, description: code })))
      .onConflictDoNothing({ target: permissions.code });

    await tx
      .insert(roles)
      .values([
        { code: 'resident', description: 'Resident self-service permissions' },
        { code: 'operator_manager', description: 'Pilot operator and manager permissions' },
        { code: 'executor', description: 'Assigned executor permissions' },
        { code: 'administrator', description: 'System administration permissions' },
      ])
      .onConflictDoNothing({ target: roles.code });

    await tx
      .insert(priorityModels)
      .values({ code: 'IMPACT_V1', isActive: true, version: 1 })
      .onConflictDoUpdate({
        set: { isActive: true },
        target: [priorityModels.code, priorityModels.version],
      });
    const [priorityModel] = await tx
      .select({ id: priorityModels.id })
      .from(priorityModels)
      .where(eq(priorityModels.code, 'IMPACT_V1'));
    if (!priorityModel) throw new Error('Seed priority model not found');
    await tx
      .insert(priorityCriteria)
      .values([
        {
          code: 'SAFETY_RISK',
          maximumValue: 5,
          modelId: priorityModel.id,
          sortOrder: 10,
          weight: 30,
        },
        { code: 'URGENCY', maximumValue: 5, modelId: priorityModel.id, sortOrder: 20, weight: 25 },
        {
          code: 'RESIDENTS_AFFECTED',
          maximumValue: 5,
          modelId: priorityModel.id,
          sortOrder: 30,
          weight: 20,
        },
        {
          code: 'SOCIAL_IMPACT',
          maximumValue: 5,
          modelId: priorityModel.id,
          sortOrder: 40,
          weight: 15,
        },
        {
          code: 'SOURCE_CONFIDENCE',
          maximumValue: 5,
          modelId: priorityModel.id,
          sortOrder: 50,
          weight: 10,
        },
      ])
      .onConflictDoUpdate({
        set: {
          maximumValue: sql`excluded.maximum_value`,
          sortOrder: sql`excluded.sort_order`,
          weight: sql`excluded.weight`,
        },
        target: [priorityCriteria.modelId, priorityCriteria.code],
      });

    for (const [roleCode, rolePermissionCodes] of Object.entries(rolePermissionMap)) {
      const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.code, roleCode));
      if (!role) throw new Error(`Seed role not found: ${roleCode}`);
      const permissionRows = await tx
        .select({ id: permissions.id, code: permissions.code })
        .from(permissions);
      const selected = permissionRows.filter((row) =>
        rolePermissionCodes.includes(row.code as PermissionKey),
      );
      await tx
        .insert(rolePermissions)
        .values(selected.map((permission) => ({ permissionId: permission.id, roleId: role.id })))
        .onConflictDoNothing();
    }
  });
}
