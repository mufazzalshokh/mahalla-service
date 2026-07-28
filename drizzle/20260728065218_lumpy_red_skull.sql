CREATE TYPE "public"."acceptance_certificate_status" AS ENUM('ISSUED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."commercial_billing_type" AS ENUM('NO_CHARGE', 'FIXED_PRICE');--> statement-breakpoint
CREATE TYPE "public"."commercial_contract_status" AS ENUM('RECORDED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."commercial_document_kind" AS ENUM('QUOTATION', 'CONTRACT_REFERENCE', 'ACCEPTANCE_CERTIFICATE', 'PAYMENT_RECEIPT');--> statement-breakpoint
CREATE TYPE "public"."commercial_expense_category" AS ENUM('LABOR', 'MATERIAL', 'TRANSPORT', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."commercial_expense_status" AS ENUM('RECORDED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."commercial_payment_method" AS ENUM('CASH', 'BANK_TRANSFER', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."commercial_payment_status" AS ENUM('CONFIRMED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."quotation_status" AS ENUM('ISSUED', 'ACCEPTED', 'REJECTED', 'VOID');--> statement-breakpoint
CREATE SEQUENCE "public"."acceptance_certificate_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."commercial_contract_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."commercial_document_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."commercial_expense_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."commercial_payment_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "public"."commercial_quotation_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "acceptance_certificates" (
	"acceptance_id" uuid NOT NULL,
	"code" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issued_by_user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "acceptance_certificate_status" DEFAULT 'ISSUED' NOT NULL,
	"summary" text NOT NULL,
	CONSTRAINT "acceptance_certificates_summary_ck" CHECK (length(trim("acceptance_certificates"."summary")) between 3 and 2000)
);
--> statement-breakpoint
CREATE TABLE "commercial_contracts" (
	"code" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"external_reference" varchar(200) NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"status" "commercial_contract_status" DEFAULT 'RECORDED' NOT NULL,
	"terms_summary" text NOT NULL,
	CONSTRAINT "commercial_contracts_reference_ck" CHECK (length(trim("commercial_contracts"."external_reference")) between 3 and 200),
	CONSTRAINT "commercial_contracts_terms_ck" CHECK (length(trim("commercial_contracts"."terms_summary")) between 3 and 2000)
);
--> statement-breakpoint
CREATE TABLE "commercial_documents" (
	"acceptance_certificate_id" uuid,
	"checksum_sha256" varchar(64) NOT NULL,
	"code" varchar(30) NOT NULL,
	"content" text NOT NULL,
	"contract_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "commercial_document_kind" NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"quotation_id" uuid,
	"storage_provider" varchar(30) DEFAULT 'INTERNAL_DATABASE' NOT NULL,
	CONSTRAINT "commercial_documents_checksum_ck" CHECK ("commercial_documents"."checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "commercial_documents_content_ck" CHECK (length("commercial_documents"."content") between 20 and 20000),
	CONSTRAINT "commercial_documents_storage_ck" CHECK ("commercial_documents"."storage_provider" = 'INTERNAL_DATABASE'),
	CONSTRAINT "commercial_documents_single_source_ck" CHECK (num_nonnulls("commercial_documents"."quotation_id", "commercial_documents"."contract_id", "commercial_documents"."acceptance_certificate_id", "commercial_documents"."payment_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "commercial_expenses" (
	"amount" bigint NOT NULL,
	"category" "commercial_expense_category" NOT NULL,
	"code" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"description" text NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incurred_at" timestamp with time zone NOT NULL,
	"order_id" uuid NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"status" "commercial_expense_status" DEFAULT 'RECORDED' NOT NULL,
	CONSTRAINT "commercial_expenses_amount_ck" CHECK ("commercial_expenses"."amount" > 0),
	CONSTRAINT "commercial_expenses_description_ck" CHECK (length(trim("commercial_expenses"."description")) between 3 and 1000)
);
--> statement-breakpoint
CREATE TABLE "commercial_payments" (
	"amount" bigint NOT NULL,
	"code" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method" "commercial_payment_method" NOT NULL,
	"order_id" uuid NOT NULL,
	"paid_at" timestamp with time zone NOT NULL,
	"proof_reference" varchar(500) NOT NULL,
	"recorded_by_user_id" uuid NOT NULL,
	"status" "commercial_payment_status" DEFAULT 'CONFIRMED' NOT NULL,
	CONSTRAINT "commercial_payments_amount_ck" CHECK ("commercial_payments"."amount" > 0),
	CONSTRAINT "commercial_payments_reference_ck" CHECK (length(trim("commercial_payments"."proof_reference")) between 3 and 500)
);
--> statement-breakpoint
CREATE TABLE "commercial_quotations" (
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"approval_reference" varchar(500),
	"code" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"labor_amount" bigint NOT NULL,
	"material_amount" bigint NOT NULL,
	"order_id" uuid NOT NULL,
	"other_amount" bigint NOT NULL,
	"scope" text NOT NULL,
	"status" "quotation_status" DEFAULT 'ISSUED' NOT NULL,
	"total_amount" bigint NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	CONSTRAINT "commercial_quotations_amounts_ck" CHECK ("commercial_quotations"."labor_amount" >= 0 and "commercial_quotations"."material_amount" >= 0 and "commercial_quotations"."other_amount" >= 0 and "commercial_quotations"."total_amount" > 0 and "commercial_quotations"."total_amount" = "commercial_quotations"."labor_amount" + "commercial_quotations"."material_amount" + "commercial_quotations"."other_amount"),
	CONSTRAINT "commercial_quotations_scope_ck" CHECK (length(trim("commercial_quotations"."scope")) between 3 and 2000),
	CONSTRAINT "commercial_quotations_valid_ck" CHECK ("commercial_quotations"."valid_until" > "commercial_quotations"."created_at"),
	CONSTRAINT "commercial_quotations_acceptance_ck" CHECK (("commercial_quotations"."status" = 'ACCEPTED' and "commercial_quotations"."accepted_at" is not null and "commercial_quotations"."accepted_by_user_id" is not null and "commercial_quotations"."approval_reference" is not null) or ("commercial_quotations"."status" <> 'ACCEPTED' and "commercial_quotations"."accepted_at" is null and "commercial_quotations"."accepted_by_user_id" is null and "commercial_quotations"."approval_reference" is null))
);
--> statement-breakpoint
CREATE TABLE "order_commercial_profiles" (
	"billing_type" "commercial_billing_type" NOT NULL,
	"contract_required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"currency" varchar(3) DEFAULT 'UZS' NOT NULL,
	"order_id" uuid PRIMARY KEY NOT NULL,
	"revenue_source_id" uuid NOT NULL,
	"set_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_commercial_profiles_currency_ck" CHECK ("order_commercial_profiles"."currency" = 'UZS'),
	CONSTRAINT "order_commercial_profiles_contract_ck" CHECK (not "order_commercial_profiles"."contract_required" or "order_commercial_profiles"."billing_type" = 'FIXED_PRICE')
);
--> statement-breakpoint
CREATE TABLE "revenue_sources" (
	"code" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"name_ru" varchar(200) NOT NULL,
	"name_uz_latn" varchar(200) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_sources_code_ck" CHECK (length(trim("revenue_sources"."code")) between 2 and 50)
);
--> statement-breakpoint
ALTER TABLE "acceptance_certificates" ADD CONSTRAINT "acceptance_certificates_acceptance_id_order_acceptances_id_fk" FOREIGN KEY ("acceptance_id") REFERENCES "public"."order_acceptances"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_certificates" ADD CONSTRAINT "acceptance_certificates_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acceptance_certificates" ADD CONSTRAINT "acceptance_certificates_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_contracts" ADD CONSTRAINT "commercial_contracts_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_contracts" ADD CONSTRAINT "commercial_contracts_quotation_id_commercial_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."commercial_quotations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_contracts" ADD CONSTRAINT "commercial_contracts_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_acceptance_certificate_id_acceptance_certificates_id_fk" FOREIGN KEY ("acceptance_certificate_id") REFERENCES "public"."acceptance_certificates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_contract_id_commercial_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."commercial_contracts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_payment_id_commercial_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."commercial_payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_documents" ADD CONSTRAINT "commercial_documents_quotation_id_commercial_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."commercial_quotations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_expenses" ADD CONSTRAINT "commercial_expenses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_expenses" ADD CONSTRAINT "commercial_expenses_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_payments" ADD CONSTRAINT "commercial_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_payments" ADD CONSTRAINT "commercial_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_quotations" ADD CONSTRAINT "commercial_quotations_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_quotations" ADD CONSTRAINT "commercial_quotations_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_quotations" ADD CONSTRAINT "commercial_quotations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_commercial_profiles" ADD CONSTRAINT "order_commercial_profiles_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_commercial_profiles" ADD CONSTRAINT "order_commercial_profiles_revenue_source_id_revenue_sources_id_fk" FOREIGN KEY ("revenue_source_id") REFERENCES "public"."revenue_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_commercial_profiles" ADD CONSTRAINT "order_commercial_profiles_set_by_user_id_users_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acceptance_certificates_code_uq" ON "acceptance_certificates" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "acceptance_certificates_acceptance_uq" ON "acceptance_certificates" USING btree ("acceptance_id");--> statement-breakpoint
CREATE INDEX "acceptance_certificates_order_idx" ON "acceptance_certificates" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_contracts_code_uq" ON "commercial_contracts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_contracts_external_reference_uq" ON "commercial_contracts" USING btree ("external_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_contracts_order_active_uq" ON "commercial_contracts" USING btree ("order_id") WHERE "commercial_contracts"."status" = 'RECORDED';--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_documents_code_uq" ON "commercial_documents" USING btree ("code");--> statement-breakpoint
CREATE INDEX "commercial_documents_order_kind_idx" ON "commercial_documents" USING btree ("order_id","kind","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_expenses_code_uq" ON "commercial_expenses" USING btree ("code");--> statement-breakpoint
CREATE INDEX "commercial_expenses_order_status_idx" ON "commercial_expenses" USING btree ("order_id","status","incurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_payments_code_uq" ON "commercial_payments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "commercial_payments_order_status_idx" ON "commercial_payments" USING btree ("order_id","status","paid_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_quotations_code_uq" ON "commercial_quotations" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_quotations_order_active_uq" ON "commercial_quotations" USING btree ("order_id") WHERE "commercial_quotations"."status" in ('ISSUED', 'ACCEPTED');--> statement-breakpoint
CREATE INDEX "commercial_quotations_status_valid_idx" ON "commercial_quotations" USING btree ("status","valid_until");--> statement-breakpoint
CREATE INDEX "order_commercial_profiles_source_idx" ON "order_commercial_profiles" USING btree ("revenue_source_id","billing_type");--> statement-breakpoint
CREATE UNIQUE INDEX "revenue_sources_code_uq" ON "revenue_sources" USING btree ("code");
--> statement-breakpoint
CREATE FUNCTION prevent_commercial_document_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'commercial documents are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER commercial_documents_immutable_trg
BEFORE UPDATE OR DELETE ON commercial_documents
FOR EACH ROW EXECUTE FUNCTION prevent_commercial_document_mutation();
