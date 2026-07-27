CREATE TYPE "public"."quality_acceptance_mode" AS ENUM('RESIDENT_OR_OPERATOR', 'OPERATOR_ONLY');--> statement-breakpoint
CREATE TYPE "public"."quality_acceptance_source" AS ENUM('OPERATOR', 'RESIDENT');--> statement-breakpoint
CREATE TYPE "public"."quality_complaint_status" AS ENUM('OPEN', 'REOPENED', 'RESOLVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."quality_inspection_outcome" AS ENUM('PASS', 'FAIL');--> statement-breakpoint
CREATE TYPE "public"."quality_rework_source" AS ENUM('ACCEPTANCE', 'COMPLAINT');--> statement-breakpoint
CREATE SEQUENCE "public"."quality_complaint_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "order_acceptances" (
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_id" uuid,
	"order_id" uuid NOT NULL,
	"order_version" integer NOT NULL,
	"source" "quality_acceptance_source" NOT NULL,
	CONSTRAINT "order_acceptances_version_ck" CHECK ("order_acceptances"."order_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "order_warranties" (
	"ends_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"warranty_days" integer NOT NULL,
	CONSTRAINT "order_warranties_days_ck" CHECK ("order_warranties"."warranty_days" between 0 and 365),
	CONSTRAINT "order_warranties_period_ck" CHECK ("order_warranties"."ends_at" >= "order_warranties"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "quality_checklist_items" (
	"code" varchar(50) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_required" boolean DEFAULT true NOT NULL,
	"label_uz_cyrl" varchar(300) NOT NULL,
	"label_uz_latn" varchar(300) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"template_id" uuid NOT NULL,
	CONSTRAINT "quality_checklist_items_code_ck" CHECK (length(trim("quality_checklist_items"."code")) > 0),
	CONSTRAINT "quality_checklist_items_sort_ck" CHECK ("quality_checklist_items"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quality_checklist_templates" (
	"acceptance_mode" "quality_acceptance_mode" DEFAULT 'RESIDENT_OR_OPERATOR' NOT NULL,
	"category_id" uuid NOT NULL,
	"complaint_review_hours" integer DEFAULT 48 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"name" varchar(200) NOT NULL,
	"rework_target_hours" integer DEFAULT 24 NOT NULL,
	"version" integer NOT NULL,
	"warranty_days" integer DEFAULT 7 NOT NULL,
	CONSTRAINT "quality_templates_name_ck" CHECK (length(trim("quality_checklist_templates"."name")) > 0),
	CONSTRAINT "quality_templates_version_ck" CHECK ("quality_checklist_templates"."version" > 0),
	CONSTRAINT "quality_templates_warranty_days_ck" CHECK ("quality_checklist_templates"."warranty_days" between 0 and 365),
	CONSTRAINT "quality_templates_rework_hours_ck" CHECK ("quality_checklist_templates"."rework_target_hours" between 1 and 720),
	CONSTRAINT "quality_templates_complaint_review_hours_ck" CHECK ("quality_checklist_templates"."complaint_review_hours" between 1 and 720)
);
--> statement-breakpoint
CREATE TABLE "quality_complaints" (
	"code" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"reopened_at" timestamp with time zone,
	"reopened_by_user_id" uuid,
	"requester_user_id" uuid NOT NULL,
	"review_due_at" timestamp with time zone NOT NULL,
	"status" "quality_complaint_status" DEFAULT 'OPEN' NOT NULL,
	"within_warranty" boolean NOT NULL,
	CONSTRAINT "quality_complaints_reason_ck" CHECK (length(trim("quality_complaints"."reason")) between 5 and 2000)
);
--> statement-breakpoint
CREATE TABLE "quality_feedback" (
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"requester_user_id" uuid NOT NULL,
	CONSTRAINT "quality_feedback_rating_ck" CHECK ("quality_feedback"."rating" between 1 and 5),
	CONSTRAINT "quality_feedback_comment_ck" CHECK ("quality_feedback"."comment" is null or length(trim("quality_feedback"."comment")) between 3 and 1000)
);
--> statement-breakpoint
CREATE TABLE "quality_inspections" (
	"actor_user_id" uuid NOT NULL,
	"attempt" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"outcome" "quality_inspection_outcome" NOT NULL,
	"results" jsonb NOT NULL,
	"summary" text NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	CONSTRAINT "quality_inspections_attempt_ck" CHECK ("quality_inspections"."attempt" > 0),
	CONSTRAINT "quality_inspections_summary_ck" CHECK (length(trim("quality_inspections"."summary")) between 3 and 1000)
);
--> statement-breakpoint
CREATE TABLE "quality_rework_decisions" (
	"actor_user_id" uuid NOT NULL,
	"complaint_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"source" "quality_rework_source" NOT NULL,
	CONSTRAINT "quality_rework_reason_ck" CHECK (length(trim("quality_rework_decisions"."reason")) between 3 and 1000)
);
--> statement-breakpoint
ALTER TABLE "order_acceptances" ADD CONSTRAINT "order_acceptances_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_acceptances" ADD CONSTRAINT "order_acceptances_inspection_id_quality_inspections_id_fk" FOREIGN KEY ("inspection_id") REFERENCES "public"."quality_inspections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_acceptances" ADD CONSTRAINT "order_acceptances_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_warranties" ADD CONSTRAINT "order_warranties_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_checklist_items" ADD CONSTRAINT "quality_checklist_items_template_id_quality_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quality_checklist_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_checklist_templates" ADD CONSTRAINT "quality_checklist_templates_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_complaints" ADD CONSTRAINT "quality_complaints_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_complaints" ADD CONSTRAINT "quality_complaints_reopened_by_user_id_users_id_fk" FOREIGN KEY ("reopened_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_complaints" ADD CONSTRAINT "quality_complaints_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_feedback" ADD CONSTRAINT "quality_feedback_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_feedback" ADD CONSTRAINT "quality_feedback_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_template_id_quality_checklist_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."quality_checklist_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_rework_decisions" ADD CONSTRAINT "quality_rework_decisions_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_rework_decisions" ADD CONSTRAINT "quality_rework_decisions_complaint_id_quality_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."quality_complaints"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_rework_decisions" ADD CONSTRAINT "quality_rework_decisions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_acceptances_order_version_uq" ON "order_acceptances" USING btree ("order_id","order_version");--> statement-breakpoint
CREATE UNIQUE INDEX "order_warranties_order_uq" ON "order_warranties" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_warranties_end_idx" ON "order_warranties" USING btree ("ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_checklist_items_template_code_uq" ON "quality_checklist_items" USING btree ("template_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_templates_category_version_uq" ON "quality_checklist_templates" USING btree ("category_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_templates_category_active_uq" ON "quality_checklist_templates" USING btree ("category_id") WHERE "quality_checklist_templates"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "quality_complaints_code_uq" ON "quality_complaints" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_complaints_requester_open_uq" ON "quality_complaints" USING btree ("order_id","requester_user_id") WHERE "quality_complaints"."status" = 'OPEN';--> statement-breakpoint
CREATE INDEX "quality_complaints_status_due_idx" ON "quality_complaints" USING btree ("status","review_due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_feedback_order_requester_uq" ON "quality_feedback" USING btree ("order_id","requester_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_inspections_order_attempt_uq" ON "quality_inspections" USING btree ("order_id","attempt");--> statement-breakpoint
CREATE INDEX "quality_inspections_order_outcome_idx" ON "quality_inspections" USING btree ("order_id","outcome","created_at");--> statement-breakpoint
CREATE INDEX "quality_rework_order_idx" ON "quality_rework_decisions" USING btree ("order_id","created_at");