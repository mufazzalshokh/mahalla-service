CREATE TYPE "public"."notification_attempt_outcome" AS ENUM('DELIVERED', 'RETRY_SCHEDULED', 'DEAD_LETTER');--> statement-breakpoint
CREATE TYPE "public"."notification_audience" AS ENUM('RESIDENT', 'STAFF');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('PENDING', 'PROCESSING', 'DELIVERED', 'DEAD_LETTER');--> statement-breakpoint
CREATE SEQUENCE "public"."notification_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "notification_delivery_attempts" (
	"attempt_number" integer NOT NULL,
	"error_code" varchar(100),
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notification_id" uuid NOT NULL,
	"outcome" "notification_attempt_outcome" NOT NULL,
	"provider_message_id" varchar(100),
	CONSTRAINT "notification_attempt_number_ck" CHECK ("notification_delivery_attempts"."attempt_number" > 0)
);
--> statement-breakpoint
CREATE TABLE "notification_outbox" (
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"audience" "notification_audience" NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deduplication_key" varchar(250) NOT NULL,
	"delivered_at" timestamp with time zone,
	"event_type" varchar(100) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"last_error_code" varchar(100),
	"locked_at" timestamp with time zone,
	"locked_by" varchar(100),
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"payload" jsonb NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"service_area_id" uuid,
	"status" "notification_status" DEFAULT 'PENDING' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_outbox_attempt_count_ck" CHECK ("notification_outbox"."attempt_count" >= 0),
	CONSTRAINT "notification_outbox_max_attempts_ck" CHECK ("notification_outbox"."max_attempts" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_notification_id_notification_outbox_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification_outbox"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_attempt_number_uq" ON "notification_delivery_attempts" USING btree ("notification_id","attempt_number");--> statement-breakpoint
CREATE INDEX "notification_attempt_outcome_idx" ON "notification_delivery_attempts" USING btree ("outcome","finished_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_code_uq" ON "notification_outbox" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_outbox_deduplication_uq" ON "notification_outbox" USING btree ("deduplication_key");--> statement-breakpoint
CREATE INDEX "notification_outbox_claim_idx" ON "notification_outbox" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "notification_outbox_area_failure_idx" ON "notification_outbox" USING btree ("service_area_id","status","updated_at");