CREATE TYPE "public"."discovery_candidate_status" AS ENUM('discovered', 'shortlisted', 'rejected', 'queued_for_profile');--> statement-breakpoint
CREATE TYPE "public"."discovery_candidate_type" AS ENUM('company', 'creator');--> statement-breakpoint
CREATE TYPE "public"."discovery_identifier_kind" AS ENUM('canonical', 'website_host', 'social_url', 'linkedin_url');--> statement-breakpoint
CREATE TYPE "public"."discovery_run_candidate_type" AS ENUM('company', 'creator', 'both');--> statement-breakpoint
CREATE TYPE "public"."discovery_run_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."discovery_run_trigger" AS ENUM('scheduled', 'manual', 'trial');--> statement-breakpoint
CREATE TABLE "discovery_candidate_identifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"candidate_type" "discovery_candidate_type" NOT NULL,
	"kind" "discovery_identifier_kind" NOT NULL,
	"normalized_value" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_candidate_identifiers_type_value_unique" UNIQUE("candidate_type","normalized_value"),
	CONSTRAINT "discovery_candidate_identifiers_value_check" CHECK (length(btrim("discovery_candidate_identifiers"."normalized_value")) > 0)
);
--> statement-breakpoint
CREATE TABLE "discovery_candidate_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"discovery_run_id" uuid NOT NULL,
	"source_name" text NOT NULL,
	"source_url" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discovery_candidate_sources_evidence_unique" UNIQUE("candidate_id","source_name","source_url")
);
--> statement-breakpoint
CREATE TABLE "discovery_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "discovery_candidate_type" NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"canonical_identity_key" text NOT NULL,
	"canonical_url" text NOT NULL,
	"website_url" text,
	"primary_social_url" text,
	"linkedin_url" text,
	"discovered_description" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"geography" text NOT NULL,
	"first_source_name" text NOT NULL,
	"first_source_url" text NOT NULL,
	"discovered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"most_recent_run_id" uuid NOT NULL,
	"discovery_score" integer NOT NULL,
	"status" "discovery_candidate_status" DEFAULT 'discovered' NOT NULL,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "discovery_candidates_type_canonical_identity_unique" UNIQUE("type","canonical_identity_key"),
	CONSTRAINT "discovery_candidates_score_check" CHECK ("discovery_candidates"."discovery_score" >= 0 AND "discovery_candidates"."discovery_score" <= 100),
	CONSTRAINT "discovery_candidates_name_check" CHECK (length(btrim("discovery_candidates"."name")) > 0 AND length(btrim("discovery_candidates"."normalized_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "discovery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_run_key" text NOT NULL,
	"trigger" "discovery_run_trigger" NOT NULL,
	"status" "discovery_run_status" DEFAULT 'queued' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_token_hash" text,
	"lease_expires_at" timestamp with time zone,
	"submission_hash" text,
	"geography" text NOT NULL,
	"candidate_type" "discovery_run_candidate_type" NOT NULL,
	"sources_used" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"requested_count" integer NOT NULL,
	"company_percentage" integer NOT NULL,
	"found_count" integer DEFAULT 0 NOT NULL,
	"new_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"requested_by_email" text,
	CONSTRAINT "discovery_runs_external_run_key_unique" UNIQUE("external_run_key"),
	CONSTRAINT "discovery_runs_requested_count_check" CHECK ("discovery_runs"."requested_count" > 0 AND "discovery_runs"."requested_count" <= 50),
	CONSTRAINT "discovery_runs_company_percentage_check" CHECK ("discovery_runs"."company_percentage" >= 0 AND "discovery_runs"."company_percentage" <= 100),
	CONSTRAINT "discovery_runs_counts_check" CHECK ("discovery_runs"."found_count" >= 0 AND "discovery_runs"."new_count" >= 0 AND "discovery_runs"."duplicate_count" >= 0),
	CONSTRAINT "discovery_runs_running_lease_check" CHECK ("discovery_runs"."status" <> 'running' OR ("discovery_runs"."started_at" IS NOT NULL AND "discovery_runs"."lease_token_hash" IS NOT NULL AND "discovery_runs"."lease_expires_at" IS NOT NULL AND "discovery_runs"."completed_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "discovery_candidate_identifiers" ADD CONSTRAINT "discovery_candidate_identifiers_candidate_id_discovery_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_candidate_sources" ADD CONSTRAINT "discovery_candidate_sources_candidate_id_discovery_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_candidate_sources" ADD CONSTRAINT "discovery_candidate_sources_discovery_run_id_discovery_runs_id_fk" FOREIGN KEY ("discovery_run_id") REFERENCES "public"."discovery_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_candidates" ADD CONSTRAINT "discovery_candidates_most_recent_run_id_discovery_runs_id_fk" FOREIGN KEY ("most_recent_run_id") REFERENCES "public"."discovery_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discovery_candidate_identifiers_candidate_idx" ON "discovery_candidate_identifiers" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "discovery_candidate_sources_candidate_idx" ON "discovery_candidate_sources" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "discovery_candidate_sources_run_idx" ON "discovery_candidate_sources" USING btree ("discovery_run_id");--> statement-breakpoint
CREATE INDEX "discovery_candidates_type_idx" ON "discovery_candidates" USING btree ("type");--> statement-breakpoint
CREATE INDEX "discovery_candidates_geography_idx" ON "discovery_candidates" USING btree ("geography");--> statement-breakpoint
CREATE INDEX "discovery_candidates_category_idx" ON "discovery_candidates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "discovery_candidates_source_idx" ON "discovery_candidates" USING btree ("first_source_name");--> statement-breakpoint
CREATE INDEX "discovery_candidates_status_idx" ON "discovery_candidates" USING btree ("status");--> statement-breakpoint
CREATE INDEX "discovery_candidates_discovered_at_idx" ON "discovery_candidates" USING btree ("discovered_at");--> statement-breakpoint
CREATE INDEX "discovery_candidates_recent_run_idx" ON "discovery_candidates" USING btree ("most_recent_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "discovery_runs_one_running_idx" ON "discovery_runs" USING btree ((true)) WHERE "discovery_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "discovery_runs_claim_idx" ON "discovery_runs" USING btree ("status","trigger","created_at");--> statement-breakpoint
CREATE INDEX "discovery_runs_lease_expiry_idx" ON "discovery_runs" USING btree ("status","lease_expires_at");