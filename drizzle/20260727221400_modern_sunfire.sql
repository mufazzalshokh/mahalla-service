ALTER TABLE "resident_profiles" DROP CONSTRAINT "resident_profiles_language_ck";--> statement-breakpoint
ALTER TABLE "telegram_intake_sessions" DROP CONSTRAINT "telegram_intake_sessions_language_ck";--> statement-breakpoint
ALTER TABLE "quality_checklist_items" ADD COLUMN "label_ru" varchar(300);--> statement-breakpoint
ALTER TABLE "service_categories" ADD COLUMN "name_ru" varchar(200);--> statement-breakpoint
UPDATE "service_categories"
SET "name_ru" = CASE "code"
  WHEN 'PLUMBING' THEN 'Сантехника'
  WHEN 'ELECTRICAL' THEN 'Электрические услуги'
  WHEN 'REPAIR' THEN 'Ремонт'
  WHEN 'LANDSCAPING' THEN 'Благоустройство'
  ELSE "name_uz_latn"
END;--> statement-breakpoint
UPDATE "quality_checklist_items"
SET "label_ru" = CASE "code"
  WHEN 'WORK_COMPLETE' THEN 'Работа выполнена в согласованном объёме'
  WHEN 'RESULT_TESTED' THEN 'Результат безопасно проверен'
  WHEN 'AREA_CLEAN' THEN 'Место работы оставлено чистым'
  ELSE "label_uz_latn"
END;--> statement-breakpoint
ALTER TABLE "service_categories" ALTER COLUMN "name_ru" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_checklist_items" ALTER COLUMN "label_ru" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "resident_profiles" ADD CONSTRAINT "resident_profiles_language_ck" CHECK ("resident_profiles"."language" in ('uz-Latn', 'uz-Cyrl', 'ru'));--> statement-breakpoint
ALTER TABLE "telegram_intake_sessions" ADD CONSTRAINT "telegram_intake_sessions_language_ck" CHECK ("telegram_intake_sessions"."language" is null or "telegram_intake_sessions"."language" in ('uz-Latn', 'uz-Cyrl', 'ru'));
