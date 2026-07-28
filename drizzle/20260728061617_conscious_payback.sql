CREATE TYPE "public"."staff_access_status" AS ENUM('ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE SEQUENCE "public"."staff_profile_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "staff_profiles" (
	"code" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"role_id" uuid NOT NULL,
	"service_area_id" uuid NOT NULL,
	"status" "staff_access_status" DEFAULT 'ACTIVE' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" uuid PRIMARY KEY NOT NULL,
	CONSTRAINT "staff_profiles_display_name_ck" CHECK (length(trim("staff_profiles"."display_name")) between 2 and 120)
);
--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "staff_profiles_code_uq" ON "staff_profiles" USING btree ("code");--> statement-breakpoint
CREATE INDEX "staff_profiles_area_status_idx" ON "staff_profiles" USING btree ("service_area_id","status","code");