CREATE TYPE "public"."duplicate_match_status" AS ENUM('SUGGESTED', 'CONFIRMED', 'DISMISSED');--> statement-breakpoint
CREATE TYPE "public"."information_message_direction" AS ENUM('REQUEST', 'RESPONSE');--> statement-breakpoint
CREATE TYPE "public"."priority_band" AS ENUM('URGENT', 'IMPORTANT', 'PLANNED', 'MONITOR');--> statement-breakpoint
CREATE SEQUENCE "public"."order_portfolio_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "priority_assessments" (
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assessed_by_user_id" uuid NOT NULL,
	"calculated_band" "priority_band" NOT NULL,
	"calculated_score" numeric(5, 2) NOT NULL,
	"explanation" text NOT NULL,
	"factors" jsonb NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"override_band" "priority_band",
	"override_reason" text,
	"override_score" numeric(5, 2),
	"overridden_at" timestamp with time zone,
	"overridden_by_user_id" uuid,
	"request_id" uuid NOT NULL,
	CONSTRAINT "priority_assessments_calculated_score_ck" CHECK ("priority_assessments"."calculated_score" >= 0 and "priority_assessments"."calculated_score" <= 100),
	CONSTRAINT "priority_assessments_override_complete_ck" CHECK (("priority_assessments"."override_score" is null and "priority_assessments"."override_band" is null and "priority_assessments"."override_reason" is null and "priority_assessments"."overridden_by_user_id" is null and "priority_assessments"."overridden_at" is null) or ("priority_assessments"."override_score" between 0 and 100 and "priority_assessments"."override_band" is not null and length(trim("priority_assessments"."override_reason")) between 10 and 1000 and "priority_assessments"."overridden_by_user_id" is not null and "priority_assessments"."overridden_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "priority_criteria" (
	"code" varchar(80) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"maximum_value" integer DEFAULT 5 NOT NULL,
	"model_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"weight" integer NOT NULL,
	CONSTRAINT "priority_criteria_code_ck" CHECK ("priority_criteria"."code" in ('SAFETY_RISK', 'URGENCY', 'RESIDENTS_AFFECTED', 'SOCIAL_IMPACT', 'SOURCE_CONFIDENCE')),
	CONSTRAINT "priority_criteria_values_ck" CHECK ("priority_criteria"."maximum_value" > 0 and "priority_criteria"."weight" > 0 and "priority_criteria"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "priority_models" (
	"code" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"version" integer NOT NULL,
	CONSTRAINT "priority_models_version_ck" CHECK ("priority_models"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "request_duplicate_matches" (
	"candidate_request_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by_user_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reasons" jsonb NOT NULL,
	"request_id" uuid NOT NULL,
	"score" numeric(5, 2) NOT NULL,
	"status" "duplicate_match_status" DEFAULT 'SUGGESTED' NOT NULL,
	CONSTRAINT "request_duplicate_matches_distinct_ck" CHECK ("request_duplicate_matches"."request_id" <> "request_duplicate_matches"."candidate_request_id"),
	CONSTRAINT "request_duplicate_matches_score_ck" CHECK ("request_duplicate_matches"."score" >= 0 and "request_duplicate_matches"."score" <= 100)
);
--> statement-breakpoint
CREATE TABLE "request_information_messages" (
	"actor_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"direction" "information_message_direction" NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message" text NOT NULL,
	"request_id" uuid NOT NULL,
	CONSTRAINT "request_information_messages_message_ck" CHECK (length(trim("request_information_messages"."message")) between 3 and 2000)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "priority_assessment_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "priority_band" "priority_band";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "priority_score" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "request_sources" ADD COLUMN "confidence_score" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "information_request" text;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "priority_assessments" ADD CONSTRAINT "priority_assessments_assessed_by_user_id_users_id_fk" FOREIGN KEY ("assessed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_assessments" ADD CONSTRAINT "priority_assessments_model_id_priority_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."priority_models"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_assessments" ADD CONSTRAINT "priority_assessments_overridden_by_user_id_users_id_fk" FOREIGN KEY ("overridden_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_assessments" ADD CONSTRAINT "priority_assessments_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_criteria" ADD CONSTRAINT "priority_criteria_model_id_priority_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."priority_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_duplicate_matches" ADD CONSTRAINT "request_duplicate_matches_candidate_request_id_service_requests_id_fk" FOREIGN KEY ("candidate_request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_duplicate_matches" ADD CONSTRAINT "request_duplicate_matches_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_duplicate_matches" ADD CONSTRAINT "request_duplicate_matches_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_information_messages" ADD CONSTRAINT "request_information_messages_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_information_messages" ADD CONSTRAINT "request_information_messages_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "priority_assessments_request_uq" ON "priority_assessments" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "priority_assessments_band_score_idx" ON "priority_assessments" USING btree ("override_band","calculated_band","calculated_score");--> statement-breakpoint
CREATE UNIQUE INDEX "priority_criteria_model_code_uq" ON "priority_criteria" USING btree ("model_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "priority_models_code_version_uq" ON "priority_models" USING btree ("code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "priority_models_active_code_uq" ON "priority_models" USING btree ("code") WHERE "priority_models"."is_active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "request_duplicate_matches_pair_uq" ON "request_duplicate_matches" USING btree ("request_id","candidate_request_id");--> statement-breakpoint
CREATE INDEX "request_duplicate_matches_candidate_idx" ON "request_duplicate_matches" USING btree ("candidate_request_id","status");--> statement-breakpoint
CREATE INDEX "request_information_messages_timeline_idx" ON "request_information_messages" USING btree ("request_id","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_priority_assessment_id_priority_assessments_id_fk" FOREIGN KEY ("priority_assessment_id") REFERENCES "public"."priority_assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_priority_score_ck" CHECK ("orders"."priority_score" is null or ("orders"."priority_score" >= 0 and "orders"."priority_score" <= 100));--> statement-breakpoint
ALTER TABLE "request_sources" ADD CONSTRAINT "request_sources_confidence_score_ck" CHECK ("request_sources"."confidence_score" >= 0 and "request_sources"."confidence_score" <= 5);