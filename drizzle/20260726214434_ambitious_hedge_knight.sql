CREATE SEQUENCE "public"."service_request_ticket_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "attachments" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"file_size" integer NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"media_type" varchar(100) DEFAULT 'image/jpeg' NOT NULL,
	"request_id" uuid NOT NULL,
	"telegram_file_id" text NOT NULL,
	"telegram_file_unique_id" varchar(200) NOT NULL,
	CONSTRAINT "attachments_file_size_ck" CHECK ("attachments"."file_size" > 0 and "attachments"."file_size" <= 10485760),
	CONSTRAINT "attachments_media_type_ck" CHECK ("attachments"."media_type" in ('image/jpeg', 'image/png'))
);
--> statement-breakpoint
CREATE TABLE "privacy_consents" (
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notice_version" varchar(50) NOT NULL,
	"telegram_update_id" bigint NOT NULL,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resident_profiles" (
	"language" varchar(20) NOT NULL,
	"phone" varchar(16),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "resident_profiles_language_ck" CHECK ("resident_profiles"."language" in ('uz-Latn', 'uz-Cyrl')),
	CONSTRAINT "resident_profiles_phone_ck" CHECK ("resident_profiles"."phone" is null or "resident_profiles"."phone" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE TABLE "telegram_intake_sessions" (
	"draft" jsonb DEFAULT '{"photos":[]}'::jsonb NOT NULL,
	"language" varchar(20),
	"step" varchar(40) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "telegram_intake_sessions_step_ck" CHECK ("telegram_intake_sessions"."step" in ('CHOOSE_LANGUAGE', 'ACCEPT_PRIVACY', 'SHARE_CONTACT', 'CHOOSE_CATEGORY', 'ENTER_DESCRIPTION', 'ENTER_ADDRESS', 'ADD_PHOTOS', 'REVIEW', 'SUBMITTED')),
	CONSTRAINT "telegram_intake_sessions_language_ck" CHECK ("telegram_intake_sessions"."language" is null or "telegram_intake_sessions"."language" in ('uz-Latn', 'uz-Cyrl')),
	CONSTRAINT "telegram_intake_sessions_version_ck" CHECK ("telegram_intake_sessions"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "telegram_update_receipts" (
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"response" jsonb NOT NULL,
	"telegram_user_id" bigint NOT NULL,
	"update_id" bigint PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "submission_update_id" bigint;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_consents" ADD CONSTRAINT "privacy_consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resident_profiles" ADD CONSTRAINT "resident_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_intake_sessions" ADD CONSTRAINT "telegram_intake_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_request_file_uq" ON "attachments" USING btree ("request_id","telegram_file_unique_id");--> statement-breakpoint
CREATE INDEX "attachments_request_idx" ON "attachments" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_consents_user_version_uq" ON "privacy_consents" USING btree ("user_id","notice_version");--> statement-breakpoint
CREATE UNIQUE INDEX "privacy_consents_update_uq" ON "privacy_consents" USING btree ("telegram_update_id");--> statement-breakpoint
CREATE INDEX "telegram_update_receipts_user_idx" ON "telegram_update_receipts" USING btree ("telegram_user_id","processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_requests_submission_update_uq" ON "service_requests" USING btree ("submission_update_id");