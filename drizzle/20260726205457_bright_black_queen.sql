CREATE TYPE "public"."order_status" AS ENUM('REGISTERED', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'AWAITING_ACCEPTANCE', 'REWORK_REQUIRED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('RECEIVED', 'VALIDATING', 'NEEDS_INFORMATION', 'REGISTERED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'SUSPENDED', 'DISABLED');--> statement-breakpoint
CREATE TABLE "addresses" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"landmark" varchar(300),
	"latitude" numeric(9, 6),
	"line1" varchar(500) NOT NULL,
	"longitude" numeric(9, 6),
	"service_area_id" uuid NOT NULL,
	CONSTRAINT "addresses_coordinates_pair_ck" CHECK (("addresses"."latitude" is null and "addresses"."longitude" is null) or ("addresses"."latitude" is not null and "addresses"."longitude" is not null)),
	CONSTRAINT "addresses_latitude_ck" CHECK ("addresses"."latitude" is null or ("addresses"."latitude" >= -90 and "addresses"."latitude" <= 90)),
	CONSTRAINT "addresses_longitude_ck" CHECK ("addresses"."longitude" is null or ("addresses"."longitude" >= -180 and "addresses"."longitude" <= 180))
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"action" varchar(150) NOT NULL,
	"actor_user_id" uuid,
	"after" jsonb,
	"before" jsonb,
	"entity_id" uuid NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"request_id" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "order_request_links" (
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	CONSTRAINT "order_request_links_order_id_request_id_pk" PRIMARY KEY("order_id","request_id")
);
--> statement-breakpoint
CREATE TABLE "order_status_history" (
	"actor_user_id" uuid NOT NULL,
	"from_status" "order_status" NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"order_id" uuid NOT NULL,
	"order_version" integer NOT NULL,
	"reason" text,
	"to_status" "order_status" NOT NULL,
	"transition_key" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"blocker_reason" text,
	"cancellation_reason" text,
	"category_id" uuid NOT NULL,
	"completed_at" timestamp with time zone,
	"completion_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"current_executor_user_id" uuid,
	"due_at" timestamp with time zone,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_number" varchar(30) NOT NULL,
	"rework_reason" text,
	"service_area_id" uuid NOT NULL,
	"status" "order_status" DEFAULT 'REGISTERED' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "orders_version_ck" CHECK ("orders"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "permissions" (
	"code" varchar(120) NOT NULL,
	"description" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_sources" (
	"code" varchar(80) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"name_uz_cyrl" varchar(200) NOT NULL,
	"name_uz_latn" varchar(200) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "request_status_history" (
	"actor_user_id" uuid,
	"from_status" "request_status",
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text,
	"request_id" uuid NOT NULL,
	"request_version" integer NOT NULL,
	"to_status" "request_status" NOT NULL,
	"transition_key" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"permission_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	CONSTRAINT "role_permissions_role_id_permission_id_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"code" varchar(80) NOT NULL,
	"description" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_areas" (
	"code" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"name_uz_cyrl" varchar(200) NOT NULL,
	"name_uz_latn" varchar(200) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_areas_code_nonempty_ck" CHECK (length(trim("service_areas"."code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "service_categories" (
	"code" varchar(80) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"name_uz_cyrl" varchar(200) NOT NULL,
	"name_uz_latn" varchar(200) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_categories_sort_order_ck" CHECK ("service_categories"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"address_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"status" "request_status" DEFAULT 'RECEIVED' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ticket_number" varchar(30) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "service_requests_version_ck" CHECK ("service_requests"."version" >= 0),
	CONSTRAINT "service_requests_description_ck" CHECK (length(trim("service_requests"."description")) > 0)
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by_user_id" uuid,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_id" uuid NOT NULL,
	"service_area_id" uuid,
	"user_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"telegram_user_id" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_request_links" ADD CONSTRAINT "order_request_links_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_request_links" ADD CONSTRAINT "order_request_links_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_current_executor_user_id_users_id_fk" FOREIGN KEY ("current_executor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_status_history" ADD CONSTRAINT "request_status_history_request_id_service_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."service_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_address_id_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."addresses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_source_id_request_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."request_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_granted_by_user_id_users_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addresses_service_area_idx" ON "addresses" USING btree ("service_area_id");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_timeline_idx" ON "audit_logs" USING btree ("entity_type","entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_timeline_idx" ON "audit_logs" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "order_request_links_request_uq" ON "order_request_links" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_status_history_version_uq" ON "order_status_history" USING btree ("order_id","order_version");--> statement-breakpoint
CREATE INDEX "order_status_history_timeline_idx" ON "order_status_history" USING btree ("order_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_order_number_uq" ON "orders" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "orders_portfolio_idx" ON "orders" USING btree ("service_area_id","status","due_at");--> statement-breakpoint
CREATE INDEX "orders_executor_idx" ON "orders" USING btree ("current_executor_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_uq" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "request_sources_code_uq" ON "request_sources" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "request_status_history_version_uq" ON "request_status_history" USING btree ("request_id","request_version");--> statement-breakpoint
CREATE INDEX "request_status_history_timeline_idx" ON "request_status_history" USING btree ("request_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_uq" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "service_areas_code_uq" ON "service_areas" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "service_categories_code_uq" ON "service_categories" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "service_requests_ticket_number_uq" ON "service_requests" USING btree ("ticket_number");--> statement-breakpoint
CREATE INDEX "service_requests_status_submitted_idx" ON "service_requests" USING btree ("status","submitted_at");--> statement-breakpoint
CREATE INDEX "service_requests_requester_idx" ON "service_requests" USING btree ("requester_user_id","submitted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_global_uq" ON "user_roles" USING btree ("user_id","role_id") WHERE "user_roles"."service_area_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_scoped_uq" ON "user_roles" USING btree ("user_id","role_id","service_area_id") WHERE "user_roles"."service_area_id" is not null;--> statement-breakpoint
CREATE INDEX "user_roles_scope_idx" ON "user_roles" USING btree ("service_area_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_telegram_user_id_uq" ON "users" USING btree ("telegram_user_id");--> statement-breakpoint
CREATE INDEX "users_status_idx" ON "users" USING btree ("status");--> statement-breakpoint
CREATE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit_logs are append-only' USING ERRCODE = '55000';
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
	BEFORE UPDATE OR DELETE ON "audit_logs"
	FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
