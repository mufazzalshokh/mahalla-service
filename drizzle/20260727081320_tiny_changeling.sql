CREATE TYPE "public"."assignment_status" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."escalation_status" AS ENUM('OPEN', 'ACKNOWLEDGED', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."escalation_type" AS ENUM('DEADLINE_OVERDUE');--> statement-breakpoint
CREATE TYPE "public"."work_evidence_phase" AS ENUM('BEFORE', 'AFTER');--> statement-breakpoint
CREATE TYPE "public"."work_log_type" AS ENUM('PROGRESS', 'BLOCKED', 'UNBLOCKED', 'COMPLETION');--> statement-breakpoint
CREATE TABLE "assignments" (
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_by_user_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"executor_user_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"response_reason" text,
	"responded_at" timestamp with time zone,
	"status" "assignment_status" DEFAULT 'PENDING' NOT NULL,
	CONSTRAINT "assignments_due_after_assigned_ck" CHECK ("assignments"."due_at" > "assignments"."assigned_at")
);
--> statement-breakpoint
CREATE TABLE "executor_category_capabilities" (
	"category_id" uuid NOT NULL,
	"executor_user_id" uuid NOT NULL,
	CONSTRAINT "executor_category_capabilities_executor_user_id_category_id_pk" PRIMARY KEY("executor_user_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "executor_profiles" (
	"code" varchar(50) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "executor_profiles_code_nonempty_ck" CHECK (length(trim("executor_profiles"."code")) > 0),
	CONSTRAINT "executor_profiles_display_name_nonempty_ck" CHECK (length(trim("executor_profiles"."display_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "order_escalations" (
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"resolved_at" timestamp with time zone,
	"status" "escalation_status" DEFAULT 'OPEN' NOT NULL,
	"type" "escalation_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_execution_sla_clocks" (
	"due_at" timestamp with time zone NOT NULL,
	"order_id" uuid PRIMARY KEY NOT NULL,
	"paused_at" timestamp with time zone,
	"paused_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"stopped_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_execution_sla_paused_seconds_ck" CHECK ("order_execution_sla_clocks"."paused_seconds" >= 0)
);
--> statement-breakpoint
CREATE TABLE "work_evidence" (
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_size" integer NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_type" varchar(100) DEFAULT 'image/jpeg' NOT NULL,
	"note" varchar(500),
	"order_id" uuid NOT NULL,
	"phase" "work_evidence_phase" NOT NULL,
	"telegram_file_id" text NOT NULL,
	"telegram_file_unique_id" varchar(200) NOT NULL,
	CONSTRAINT "work_evidence_file_size_ck" CHECK ("work_evidence"."file_size" > 0 and "work_evidence"."file_size" <= 10485760),
	CONSTRAINT "work_evidence_media_type_ck" CHECK ("work_evidence"."media_type" in ('image/jpeg', 'image/png'))
);
--> statement-breakpoint
CREATE TABLE "work_logs" (
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_type" "work_log_type" NOT NULL,
	"note" text NOT NULL,
	"order_id" uuid NOT NULL,
	CONSTRAINT "work_logs_note_ck" CHECK (length(trim("work_logs"."note")) between 3 and 2000)
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_executor_user_id_executor_profiles_user_id_fk" FOREIGN KEY ("executor_user_id") REFERENCES "public"."executor_profiles"("user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executor_category_capabilities" ADD CONSTRAINT "executor_category_capabilities_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executor_category_capabilities" ADD CONSTRAINT "executor_category_capabilities_executor_user_id_executor_profiles_user_id_fk" FOREIGN KEY ("executor_user_id") REFERENCES "public"."executor_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executor_profiles" ADD CONSTRAINT "executor_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_escalations" ADD CONSTRAINT "order_escalations_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_escalations" ADD CONSTRAINT "order_escalations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_execution_sla_clocks" ADD CONSTRAINT "order_execution_sla_clocks_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_evidence" ADD CONSTRAINT "work_evidence_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_evidence" ADD CONSTRAINT "work_evidence_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_logs" ADD CONSTRAINT "work_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_order_active_uq" ON "assignments" USING btree ("order_id") WHERE "assignments"."status" in ('PENDING', 'ACCEPTED');--> statement-breakpoint
CREATE INDEX "assignments_executor_status_idx" ON "assignments" USING btree ("executor_user_id","status","due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "executor_profiles_code_uq" ON "executor_profiles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "order_escalations_open_uq" ON "order_escalations" USING btree ("order_id","type") WHERE "order_escalations"."status" in ('OPEN', 'ACKNOWLEDGED');--> statement-breakpoint
CREATE INDEX "order_escalations_status_idx" ON "order_escalations" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "order_execution_sla_due_idx" ON "order_execution_sla_clocks" USING btree ("due_at","stopped_at");--> statement-breakpoint
CREATE UNIQUE INDEX "work_evidence_file_uq" ON "work_evidence" USING btree ("order_id","telegram_file_unique_id");--> statement-breakpoint
CREATE INDEX "work_evidence_order_phase_idx" ON "work_evidence" USING btree ("order_id","phase","created_at");--> statement-breakpoint
CREATE INDEX "work_logs_order_timeline_idx" ON "work_logs" USING btree ("order_id","created_at");