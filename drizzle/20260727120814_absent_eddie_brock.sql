CREATE TYPE "public"."pdca_stage" AS ENUM('PLAN', 'DO', 'CHECK', 'ACT', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE SEQUENCE "public"."pdca_action_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "pdca_action_history" (
	"action_id" uuid NOT NULL,
	"action_version" integer NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"from_stage" "pdca_stage",
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"to_stage" "pdca_stage" NOT NULL,
	CONSTRAINT "pdca_action_history_version_ck" CHECK ("pdca_action_history"."action_version" >= 0),
	CONSTRAINT "pdca_action_history_reason_ck" CHECK (length(trim("pdca_action_history"."reason")) between 3 and 1000)
);
--> statement-breakpoint
CREATE TABLE "pdca_actions" (
	"category_id" uuid,
	"code" varchar(30) NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"expected_outcome" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"planned_action" text NOT NULL,
	"problem_statement" text NOT NULL,
	"result" text,
	"service_area_id" uuid NOT NULL,
	"stage" "pdca_stage" DEFAULT 'PLAN' NOT NULL,
	"title" varchar(200) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pdca_actions_due_ck" CHECK ("pdca_actions"."due_at" > "pdca_actions"."created_at"),
	CONSTRAINT "pdca_actions_version_ck" CHECK ("pdca_actions"."version" >= 0),
	CONSTRAINT "pdca_actions_title_ck" CHECK (length(trim("pdca_actions"."title")) between 3 and 200),
	CONSTRAINT "pdca_actions_problem_ck" CHECK (length(trim("pdca_actions"."problem_statement")) between 3 and 2000),
	CONSTRAINT "pdca_actions_plan_ck" CHECK (length(trim("pdca_actions"."planned_action")) between 3 and 2000),
	CONSTRAINT "pdca_actions_expected_ck" CHECK (length(trim("pdca_actions"."expected_outcome")) between 3 and 1000),
	CONSTRAINT "pdca_actions_result_ck" CHECK ("pdca_actions"."result" is null or length(trim("pdca_actions"."result")) between 3 and 1000),
	CONSTRAINT "pdca_actions_completion_ck" CHECK (("pdca_actions"."stage" = 'COMPLETED' and "pdca_actions"."completed_at" is not null and "pdca_actions"."result" is not null) or ("pdca_actions"."stage" <> 'COMPLETED' and "pdca_actions"."completed_at" is null))
);
--> statement-breakpoint
ALTER TABLE "pdca_action_history" ADD CONSTRAINT "pdca_action_history_action_id_pdca_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."pdca_actions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdca_action_history" ADD CONSTRAINT "pdca_action_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdca_actions" ADD CONSTRAINT "pdca_actions_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdca_actions" ADD CONSTRAINT "pdca_actions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdca_actions" ADD CONSTRAINT "pdca_actions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdca_actions" ADD CONSTRAINT "pdca_actions_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pdca_action_history_version_uq" ON "pdca_action_history" USING btree ("action_id","action_version");--> statement-breakpoint
CREATE INDEX "pdca_action_history_timeline_idx" ON "pdca_action_history" USING btree ("action_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pdca_actions_code_uq" ON "pdca_actions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "pdca_actions_area_stage_due_idx" ON "pdca_actions" USING btree ("service_area_id","stage","due_at");--> statement-breakpoint
CREATE INDEX "pdca_actions_owner_stage_idx" ON "pdca_actions" USING btree ("owner_user_id","stage","due_at");