CREATE TYPE "public"."global_entity_status" AS ENUM('observed', 'watchlisted', 'monitoring', 'qualified', 'archived', 'promoted_to_candidate');--> statement-breakpoint
CREATE TYPE "public"."global_radar_actor_type" AS ENUM('worker', 'administrator', 'system');--> statement-breakpoint
CREATE TYPE "public"."global_radar_india_relevance_type" AS ENUM('explicit_India', 'existing_India_presence', 'India_expansion', 'globally_open', 'inferred_India_compatible', 'no_current_India_fit');--> statement-breakpoint
CREATE TYPE "public"."global_radar_promotion_eligibility_path" AS ENUM('qualified_india_direct_demand', 'repeated_india_compatible_signals', 'documented_indian_relationship', 'exceptional_strategic_relevance');--> statement-breakpoint
CREATE TYPE "public"."global_radar_promotion_status" AS ENUM('active', 'reversed', 'failed', 'conflicted');--> statement-breakpoint
CREATE TYPE "public"."global_radar_query_status" AS ENUM('planned', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."global_radar_requirement_kind" AS ENUM('physical_data', 'robotics_hardware', 'manufacturing', 'deployment', 'market_access', 'research', 'operational_service');--> statement-breakpoint
CREATE TYPE "public"."global_radar_response_path_type" AS ENUM('supplier_or_partner_registration', 'procurement_or_rfp_portal', 'distributor_application', 'official_enquiry_or_india_contact', 'research_form', 'official_business_email');--> statement-breakpoint
CREATE TYPE "public"."global_radar_run_status" AS ENUM('queued', 'running', 'succeeded', 'partial', 'failed');--> statement-breakpoint
CREATE TYPE "public"."global_radar_run_trigger" AS ENUM('scheduled', 'manual', 'trial');--> statement-breakpoint
CREATE TYPE "public"."global_radar_scan_mode" AS ENUM('daily', 'thematic', 'watchlist_refresh', 'manual');--> statement-breakpoint
CREATE TYPE "public"."global_radar_sensitive_data_flag_state" AS ENUM('not_observed', 'possible', 'severe');--> statement-breakpoint
CREATE TYPE "public"."global_radar_signal_class" AS ENUM('direct_demand', 'demand_precursor', 'ecosystem_momentum');--> statement-breakpoint
CREATE TYPE "public"."global_radar_signal_entity_role" AS ENUM('supporting', 'contributor');--> statement-breakpoint
CREATE TYPE "public"."global_radar_signal_status" AS ENUM('newly_discovered', 'needs_review', 'monitoring', 'qualified', 'dismissed', 'expired', 'promoted');--> statement-breakpoint
CREATE TYPE "public"."global_radar_update_type" AS ENUM('created', 'rediscovered', 'evidence_appended', 'note_appended', 'status_changed', 'classification_changed', 'expiry_changed', 'india_fit_changed', 'merged', 'momentum_recomputed', 'promoted', 'promotion_reversed');--> statement-breakpoint
CREATE TYPE "public"."global_radar_watchlist_state" AS ENUM('enabled', 'paused', 'disabled');--> statement-breakpoint
ALTER TYPE "public"."discovery_run_trigger" ADD VALUE 'radar_promotion';--> statement-breakpoint
CREATE TABLE "global_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"canonical_domain" text,
	"website_url" text,
	"linkedin_url" text,
	"canonical_corporate_group_id" text,
	"stable_public_identifiers" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"public_identity_anchor" text NOT NULL,
	"headquarters_country" text NOT NULL,
	"headquarters_city" text,
	"operating_countries" text[],
	"organisation_type" text NOT NULL,
	"sector" text NOT NULL,
	"short_description" text NOT NULL,
	"entity_status" "global_entity_status" DEFAULT 'observed' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"promoted_candidate_id" uuid,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_entities_identity_text_check" CHECK (length(btrim("global_entities"."canonical_name")) > 0
        AND length(btrim("global_entities"."normalized_name")) > 0
        AND length(btrim("global_entities"."headquarters_country")) > 0
        AND length(btrim("global_entities"."organisation_type")) > 0
        AND length(btrim("global_entities"."sector")) > 0
        AND length(btrim("global_entities"."short_description")) > 0
        AND ("global_entities"."canonical_domain" IS NULL OR length(btrim("global_entities"."canonical_domain")) > 0)
        AND ("global_entities"."website_url" IS NULL OR length(btrim("global_entities"."website_url")) > 0)
        AND ("global_entities"."linkedin_url" IS NULL OR length(btrim("global_entities"."linkedin_url")) > 0)),
	CONSTRAINT "global_entities_corporate_group_check" CHECK ("global_entities"."canonical_corporate_group_id" IS NULL OR (
        length("global_entities"."canonical_corporate_group_id") <= 200
        AND "global_entities"."canonical_corporate_group_id" ~ '^[a-z0-9][a-z0-9._:-]*$'
      )),
	CONSTRAINT "global_entities_stable_identifiers_count_check" CHECK (cardinality("global_entities"."stable_public_identifiers") <= 50
        AND array_position("global_entities"."stable_public_identifiers", NULL) IS NULL
        AND (
          cardinality("global_entities"."stable_public_identifiers") = 0
          OR (
            length(array_to_string("global_entities"."stable_public_identifiers", E'\n')) <= 10000
            AND array_to_string("global_entities"."stable_public_identifiers", E'\n')
              !~ '(^|\n)[[:space:]]*($|\n)'
          )
        )),
	CONSTRAINT "global_entities_public_identity_anchor_check" CHECK ("global_entities"."public_identity_anchor" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "global_entities_revision_check" CHECK ("global_entities"."revision" >= 0),
	CONSTRAINT "global_entities_seen_order_check" CHECK ("global_entities"."first_seen_at" <= "global_entities"."last_seen_at")
);
--> statement-breakpoint
CREATE TABLE "global_radar_admin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" "global_radar_actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"before_safe_state" jsonb,
	"after_safe_state" jsonb,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_radar_admin_events_target_idempotency_unique" UNIQUE("target_type","target_id","idempotency_key"),
	CONSTRAINT "global_radar_admin_events_actor_check" CHECK ((
        "global_radar_admin_events"."actor_type" = 'administrator'
        AND "global_radar_admin_events"."actor_email" IS NOT NULL
      ) OR (
        "global_radar_admin_events"."actor_type" <> 'administrator'
        AND "global_radar_admin_events"."actor_email" IS NULL
      )),
	CONSTRAINT "global_radar_admin_events_text_check" CHECK (length(btrim("global_radar_admin_events"."actor_id")) BETWEEN 1 AND 200
        AND ("global_radar_admin_events"."actor_email" IS NULL OR length(btrim("global_radar_admin_events"."actor_email")) BETWEEN 3 AND 254)
        AND length(btrim("global_radar_admin_events"."target_type")) BETWEEN 1 AND 100
        AND length(btrim("global_radar_admin_events"."action")) BETWEEN 1 AND 200
        AND length(btrim("global_radar_admin_events"."reason")) BETWEEN 1 AND 2000
        AND length(btrim("global_radar_admin_events"."idempotency_key")) BETWEEN 1 AND 500)
);
--> statement-breakpoint
CREATE TABLE "global_radar_promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"global_entity_id" uuid NOT NULL,
	"primary_signal_id" uuid NOT NULL,
	"supporting_signal_ids" uuid[] NOT NULL,
	"eligibility_path" "global_radar_promotion_eligibility_path" NOT NULL,
	"expected_entity_revision" integer NOT NULL,
	"expected_primary_signal_revision" integer NOT NULL,
	"expected_supporting_signal_revisions" jsonb NOT NULL,
	"promoted_entity_revision" integer,
	"promoted_primary_signal_revision" integer,
	"previous_entity_status" "global_entity_status" NOT NULL,
	"previous_primary_signal_status" "global_radar_signal_status" NOT NULL,
	"entity_snapshot" jsonb NOT NULL,
	"primary_signal_snapshot" jsonb NOT NULL,
	"supporting_signals_snapshot" jsonb NOT NULL,
	"discovery_run_id" uuid,
	"discovery_candidate_id" uuid,
	"actor_user_id" uuid NOT NULL,
	"actor_email" text NOT NULL,
	"reason" text NOT NULL,
	"source_snapshot_digest" text NOT NULL,
	"status" "global_radar_promotion_status" NOT NULL,
	"promoted_at" timestamp with time zone,
	"reversal_idempotency_key" text,
	"reversal_request_hash" text,
	"reversed_at" timestamp with time zone,
	"reversed_by_user_id" uuid,
	"reversed_by_email" text,
	"reversal_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_radar_promotions_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "global_radar_promotions_text_check" CHECK (length(btrim("global_radar_promotions"."idempotency_key")) BETWEEN 1 AND 500
        AND "global_radar_promotions"."request_hash" ~ '^[a-f0-9]{64}$'
        AND "global_radar_promotions"."source_snapshot_digest" ~ '^[a-f0-9]{64}$'
        AND length(btrim("global_radar_promotions"."actor_email")) BETWEEN 3 AND 254
        AND length(btrim("global_radar_promotions"."reason")) BETWEEN 1 AND 2000
        AND ("global_radar_promotions"."reversal_idempotency_key" IS NULL OR length(btrim("global_radar_promotions"."reversal_idempotency_key")) BETWEEN 1 AND 500)
        AND ("global_radar_promotions"."reversal_request_hash" IS NULL OR "global_radar_promotions"."reversal_request_hash" ~ '^[a-f0-9]{64}$')
        AND ("global_radar_promotions"."reversed_by_email" IS NULL OR length(btrim("global_radar_promotions"."reversed_by_email")) BETWEEN 3 AND 254)
        AND ("global_radar_promotions"."reversal_reason" IS NULL OR length(btrim("global_radar_promotions"."reversal_reason")) BETWEEN 1 AND 2000)),
	CONSTRAINT "global_radar_promotions_revisions_check" CHECK ("global_radar_promotions"."expected_entity_revision" >= 0
        AND "global_radar_promotions"."expected_primary_signal_revision" >= 0
        AND ("global_radar_promotions"."promoted_entity_revision" IS NULL OR "global_radar_promotions"."promoted_entity_revision" >= 0)
        AND ("global_radar_promotions"."promoted_primary_signal_revision" IS NULL OR "global_radar_promotions"."promoted_primary_signal_revision" >= 0)),
	CONSTRAINT "global_radar_promotions_supporting_signals_check" CHECK (cardinality("global_radar_promotions"."supporting_signal_ids") BETWEEN 1 AND 100
        AND array_position("global_radar_promotions"."supporting_signal_ids", NULL) IS NULL
        AND "global_radar_promotions"."primary_signal_id" = ANY("global_radar_promotions"."supporting_signal_ids")),
	CONSTRAINT "global_radar_promotions_lifecycle_check" CHECK ((
        "global_radar_promotions"."status" = 'active'
        AND "global_radar_promotions"."promoted_at" IS NOT NULL
        AND "global_radar_promotions"."promoted_entity_revision" IS NOT NULL
        AND "global_radar_promotions"."promoted_primary_signal_revision" IS NOT NULL
        AND "global_radar_promotions"."discovery_run_id" IS NOT NULL
        AND "global_radar_promotions"."discovery_candidate_id" IS NOT NULL
        AND "global_radar_promotions"."reversal_idempotency_key" IS NULL
        AND "global_radar_promotions"."reversal_request_hash" IS NULL
        AND "global_radar_promotions"."reversed_at" IS NULL
        AND "global_radar_promotions"."reversed_by_user_id" IS NULL
        AND "global_radar_promotions"."reversed_by_email" IS NULL
        AND "global_radar_promotions"."reversal_reason" IS NULL
      ) OR (
        "global_radar_promotions"."status" = 'reversed'
        AND "global_radar_promotions"."promoted_at" IS NOT NULL
        AND "global_radar_promotions"."promoted_entity_revision" IS NOT NULL
        AND "global_radar_promotions"."promoted_primary_signal_revision" IS NOT NULL
        AND "global_radar_promotions"."discovery_run_id" IS NOT NULL
        AND "global_radar_promotions"."discovery_candidate_id" IS NOT NULL
        AND "global_radar_promotions"."reversal_idempotency_key" IS NOT NULL
        AND "global_radar_promotions"."reversal_request_hash" IS NOT NULL
        AND "global_radar_promotions"."reversed_at" IS NOT NULL
        AND "global_radar_promotions"."reversed_at" >= "global_radar_promotions"."promoted_at"
        AND "global_radar_promotions"."reversed_by_user_id" IS NOT NULL
        AND "global_radar_promotions"."reversed_by_email" IS NOT NULL
        AND "global_radar_promotions"."reversal_reason" IS NOT NULL
      ) OR (
        "global_radar_promotions"."status" IN ('failed', 'conflicted')
        AND "global_radar_promotions"."promoted_at" IS NULL
        AND "global_radar_promotions"."promoted_entity_revision" IS NULL
        AND "global_radar_promotions"."promoted_primary_signal_revision" IS NULL
        AND "global_radar_promotions"."discovery_run_id" IS NULL
        AND "global_radar_promotions"."discovery_candidate_id" IS NULL
        AND "global_radar_promotions"."reversal_idempotency_key" IS NULL
        AND "global_radar_promotions"."reversal_request_hash" IS NULL
        AND "global_radar_promotions"."reversed_at" IS NULL
        AND "global_radar_promotions"."reversed_by_user_id" IS NULL
        AND "global_radar_promotions"."reversed_by_email" IS NULL
        AND "global_radar_promotions"."reversal_reason" IS NULL
      ))
);
--> statement-breakpoint
CREATE TABLE "global_radar_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_run_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"trigger" "global_radar_run_trigger" NOT NULL,
	"scan_mode" "global_radar_scan_mode" NOT NULL,
	"status" "global_radar_run_status" DEFAULT 'queued' NOT NULL,
	"plan_fingerprint" text NOT NULL,
	"plan_snapshot" jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"source_countries" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"source_languages" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"target_domains" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"target_signal_types" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"sources_used" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"number_results_examined" integer DEFAULT 0 NOT NULL,
	"number_entities_observed" integer DEFAULT 0 NOT NULL,
	"number_signals_found" integer DEFAULT 0 NOT NULL,
	"number_direct_demands" integer DEFAULT 0 NOT NULL,
	"number_precursors" integer DEFAULT 0 NOT NULL,
	"number_momentum_records" integer DEFAULT 0 NOT NULL,
	"number_new" integer DEFAULT 0 NOT NULL,
	"number_updated" integer DEFAULT 0 NOT NULL,
	"number_duplicates" integer DEFAULT 0 NOT NULL,
	"number_rejected_for_weak_evidence" integer DEFAULT 0 NOT NULL,
	"number_source_errors" integer DEFAULT 0 NOT NULL,
	"error_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"administrator_request_id" uuid,
	"requested_by_user_id" uuid,
	"requested_by_email" text,
	"prompt_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"taxonomy_version" text NOT NULL,
	"scoring_version" text NOT NULL,
	"lease_token_hash" text,
	"lease_expires_at" timestamp with time zone,
	"submission_hash" text,
	"batch_fingerprint" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_radar_runs_external_run_key_unique" UNIQUE("external_run_key"),
	CONSTRAINT "global_radar_runs_hashes_check" CHECK ("global_radar_runs"."request_hash" ~ '^[a-f0-9]{64}$'
        AND "global_radar_runs"."plan_fingerprint" ~ '^[a-f0-9]{64}$'
        AND ("global_radar_runs"."lease_token_hash" IS NULL OR "global_radar_runs"."lease_token_hash" ~ '^[a-f0-9]{64}$')
        AND ("global_radar_runs"."submission_hash" IS NULL OR "global_radar_runs"."submission_hash" ~ '^[a-f0-9]{64}$')
        AND ("global_radar_runs"."batch_fingerprint" IS NULL OR "global_radar_runs"."batch_fingerprint" ~ '^[a-f0-9]{64}$')
        AND length(btrim("global_radar_runs"."external_run_key")) BETWEEN 1 AND 500
        AND length(btrim("global_radar_runs"."prompt_version")) BETWEEN 1 AND 200
        AND length(btrim("global_radar_runs"."schema_version")) BETWEEN 1 AND 200
        AND length(btrim("global_radar_runs"."taxonomy_version")) BETWEEN 1 AND 200
        AND length(btrim("global_radar_runs"."scoring_version")) BETWEEN 1 AND 200),
	CONSTRAINT "global_radar_runs_counts_check" CHECK ("global_radar_runs"."number_results_examined" >= 0
        AND "global_radar_runs"."number_entities_observed" >= 0
        AND "global_radar_runs"."number_signals_found" >= 0
        AND "global_radar_runs"."number_direct_demands" >= 0
        AND "global_radar_runs"."number_precursors" >= 0
        AND "global_radar_runs"."number_momentum_records" >= 0
        AND "global_radar_runs"."number_new" >= 0
        AND "global_radar_runs"."number_updated" >= 0
        AND "global_radar_runs"."number_duplicates" >= 0
        AND "global_radar_runs"."number_rejected_for_weak_evidence" >= 0
        AND "global_radar_runs"."number_source_errors" >= 0),
	CONSTRAINT "global_radar_runs_lifecycle_check" CHECK ((
        "global_radar_runs"."status" = 'queued'
        AND "global_radar_runs"."started_at" IS NULL
        AND "global_radar_runs"."completed_at" IS NULL
        AND "global_radar_runs"."lease_token_hash" IS NULL
        AND "global_radar_runs"."lease_expires_at" IS NULL
        AND "global_radar_runs"."submission_hash" IS NULL
        AND "global_radar_runs"."batch_fingerprint" IS NULL
      ) OR (
        "global_radar_runs"."status" = 'running'
        AND "global_radar_runs"."started_at" IS NOT NULL
        AND "global_radar_runs"."completed_at" IS NULL
        AND "global_radar_runs"."lease_token_hash" IS NOT NULL
        AND "global_radar_runs"."lease_expires_at" IS NOT NULL
        AND "global_radar_runs"."lease_expires_at" > "global_radar_runs"."started_at"
        AND "global_radar_runs"."submission_hash" IS NULL
        AND "global_radar_runs"."batch_fingerprint" IS NULL
      ) OR (
        "global_radar_runs"."status" IN ('succeeded', 'partial')
        AND "global_radar_runs"."started_at" IS NOT NULL
        AND "global_radar_runs"."completed_at" IS NOT NULL
        AND "global_radar_runs"."completed_at" >= "global_radar_runs"."started_at"
        AND "global_radar_runs"."lease_token_hash" IS NOT NULL
        AND "global_radar_runs"."lease_expires_at" IS NOT NULL
        AND "global_radar_runs"."submission_hash" IS NOT NULL
        AND "global_radar_runs"."batch_fingerprint" IS NOT NULL
      ) OR (
        "global_radar_runs"."status" = 'failed'
        AND "global_radar_runs"."started_at" IS NOT NULL
        AND "global_radar_runs"."completed_at" IS NOT NULL
        AND "global_radar_runs"."completed_at" >= "global_radar_runs"."started_at"
        AND "global_radar_runs"."lease_token_hash" IS NOT NULL
        AND "global_radar_runs"."lease_expires_at" IS NOT NULL
        AND (
          ("global_radar_runs"."submission_hash" IS NULL AND "global_radar_runs"."batch_fingerprint" IS NULL)
          OR ("global_radar_runs"."submission_hash" IS NOT NULL AND "global_radar_runs"."batch_fingerprint" IS NOT NULL)
        )
      )),
	CONSTRAINT "global_radar_runs_manual_requester_check" CHECK ((
        (
          "global_radar_runs"."trigger" = 'manual'
          AND "global_radar_runs"."scan_mode" = 'manual'
          AND "global_radar_runs"."administrator_request_id" IS NOT NULL
          AND "global_radar_runs"."requested_by_user_id" IS NOT NULL
          AND "global_radar_runs"."requested_by_email" IS NOT NULL
        ) OR (
          "global_radar_runs"."trigger" <> 'manual'
          AND "global_radar_runs"."scan_mode" <> 'manual'
          AND "global_radar_runs"."administrator_request_id" IS NULL
        )
      ) AND (
        "global_radar_runs"."requested_by_email" IS NULL
        OR length(btrim("global_radar_runs"."requested_by_email")) BETWEEN 3 AND 254
      ))
);
--> statement-breakpoint
CREATE TABLE "global_radar_search_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"query_text" text NOT NULL,
	"fingerprint" text NOT NULL,
	"language" text NOT NULL,
	"source_country" text NOT NULL,
	"theme" text NOT NULL,
	"signal_class_intent" "global_radar_signal_class" NOT NULL,
	"source_adapter" text NOT NULL,
	"recency_days" integer NOT NULL,
	"ordinal" integer NOT NULL,
	"status" "global_radar_query_status" DEFAULT 'planned' NOT NULL,
	"executed_at" timestamp with time zone,
	"results_examined" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_radar_search_queries_run_fingerprint_unique" UNIQUE("run_id","fingerprint"),
	CONSTRAINT "global_radar_search_queries_text_check" CHECK (length(btrim("global_radar_search_queries"."query_text")) BETWEEN 1 AND 1000
        AND "global_radar_search_queries"."fingerprint" ~ '^[a-f0-9]{64}$'
        AND length(btrim("global_radar_search_queries"."language")) BETWEEN 1 AND 35
        AND length(btrim("global_radar_search_queries"."source_country")) BETWEEN 1 AND 100
        AND length(btrim("global_radar_search_queries"."theme")) BETWEEN 1 AND 200
        AND "global_radar_search_queries"."source_adapter" = 'codex_public_web'
        AND ("global_radar_search_queries"."error_summary" IS NULL OR length(btrim("global_radar_search_queries"."error_summary")) BETWEEN 1 AND 1000)),
	CONSTRAINT "global_radar_search_queries_execution_check" CHECK ((
        "global_radar_search_queries"."status" = 'planned'
        AND "global_radar_search_queries"."executed_at" IS NULL
        AND "global_radar_search_queries"."results_examined" = 0
        AND "global_radar_search_queries"."error_summary" IS NULL
      ) OR (
        "global_radar_search_queries"."status" = 'succeeded'
        AND "global_radar_search_queries"."executed_at" IS NOT NULL
        AND "global_radar_search_queries"."error_summary" IS NULL
      ) OR (
        "global_radar_search_queries"."status" = 'failed'
        AND "global_radar_search_queries"."executed_at" IS NOT NULL
        AND "global_radar_search_queries"."error_summary" IS NOT NULL
      )),
	CONSTRAINT "global_radar_search_queries_bounds_check" CHECK ("global_radar_search_queries"."recency_days" > 0 AND "global_radar_search_queries"."recency_days" <= 365
        AND "global_radar_search_queries"."ordinal" >= 0 AND "global_radar_search_queries"."ordinal" < 120
        AND "global_radar_search_queries"."results_examined" >= 0 AND "global_radar_search_queries"."results_examined" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "global_radar_signal_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"global_entity_id" uuid NOT NULL,
	"role" "global_radar_signal_entity_role" NOT NULL,
	"confidence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_radar_signal_entities_identity_unique" UNIQUE("signal_id","global_entity_id","role"),
	CONSTRAINT "global_radar_signal_entities_confidence_check" CHECK ("global_radar_signal_entities"."confidence" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "global_radar_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_entity_id" uuid,
	"signal_class" "global_radar_signal_class" NOT NULL,
	"demand_domain" text NOT NULL,
	"signal_type" text NOT NULL,
	"title" text NOT NULL,
	"factual_summary" text NOT NULL,
	"interpretation_summary" text NOT NULL,
	"theme" text NOT NULL,
	"systems_context_summary" text,
	"source_country" text NOT NULL,
	"target_geographies" text[],
	"collection_geographies" text[],
	"manufacturing_geographies" text[],
	"delivery_geographies" text[],
	"industry" text NOT NULL,
	"target_model_or_system" text,
	"target_capability_tags" text[],
	"required_counterparty_archetypes" text[],
	"india_relevance_type" "global_radar_india_relevance_type" NOT NULL,
	"india_relevance_rationale" text NOT NULL,
	"india_fit_reasons" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"india_fit_constraints" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"india_fit_unknowns" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"india_fit_confidence" integer NOT NULL,
	"india_regulatory_facts" jsonb,
	"india_logistics_facts" jsonb,
	"demand_explicitness" integer,
	"evidence_confidence" integer,
	"freshness" integer,
	"actionability" integer,
	"india_fit" integer,
	"commercial_potential" integer,
	"repeatability" integer,
	"response_accessibility" integer,
	"strategic_learning" integer,
	"compliance_complexity" integer,
	"proximity_to_external_demand" integer,
	"funding_deployment_momentum" integer,
	"likely_data_hardware_intensity" integer,
	"estimated_time_horizon" integer,
	"strategic_relevance" integer,
	"momentum_independent_entity_count" integer,
	"momentum_primary_source_count" integer,
	"momentum_source_family_count" integer,
	"momentum_volume_7_days" integer,
	"momentum_volume_30_days" integer,
	"momentum_volume_90_days" integer,
	"momentum_independent_entity_breadth" integer,
	"momentum_primary_source_depth" integer,
	"momentum_source_diversity" integer,
	"momentum_weighted_volume" integer,
	"momentum_growth_vs_previous_period" integer,
	"momentum_taxonomy_consistency" integer,
	"momentum_evidence_quality" integer,
	"direct_demand_score" integer,
	"precursor_score" integer,
	"momentum_score" integer,
	"score_coverage" integer NOT NULL,
	"score_policy_version" text NOT NULL,
	"momentum_policy_version" text,
	"momentum_qualification_gates_passed" boolean,
	"announced_at" timestamp with time zone,
	"effective_from" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"evergreen" boolean,
	"reobserve_by" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL,
	"status" "global_radar_signal_status" DEFAULT 'newly_discovered' NOT NULL,
	"response_path_type" "global_radar_response_path_type",
	"response_path_url" text,
	"response_business_email" text,
	"partner_application_url" text,
	"source_language" text NOT NULL,
	"extraction_method" text NOT NULL,
	"taxonomy_version" text NOT NULL,
	"systems_context_stack_type" text,
	"higher_level_system_goal" text,
	"relevant_stack_layer" text,
	"lower_level_inputs_required" text[],
	"transformation_or_capability_added" text,
	"downstream_model_or_robot_behavior" text,
	"why_the_requirement_matters" text,
	"possible_indian_execution_role" text,
	"factual_elements" text[],
	"inferred_elements" text[],
	"faces" "global_radar_sensitive_data_flag_state",
	"voices" "global_radar_sensitive_data_flag_state",
	"biometrics" "global_radar_sensitive_data_flag_state",
	"gaze" "global_radar_sensitive_data_flag_state",
	"health" "global_radar_sensitive_data_flag_state",
	"children" "global_radar_sensitive_data_flag_state",
	"home_interiors" "global_radar_sensitive_data_flag_state",
	"workplace_monitoring" "global_radar_sensitive_data_flag_state",
	"precise_location" "global_radar_sensitive_data_flag_state",
	"road_users" "global_radar_sensitive_data_flag_state",
	"employee_data" "global_radar_sensitive_data_flag_state",
	"industrial_secrets" "global_radar_sensitive_data_flag_state",
	"defence_or_dual_use" "global_radar_sensitive_data_flag_state",
	"copyrighted_material" "global_radar_sensitive_data_flag_state",
	"export_controls" "global_radar_sensitive_data_flag_state",
	"consent" boolean,
	"de_identification" boolean,
	"legal_review" boolean,
	"known_residency_requirements" boolean,
	"participant_rights_complexity" boolean,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"dedupe_version" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"first_run_id" uuid NOT NULL,
	"most_recent_run_id" uuid NOT NULL,
	"merged_into_signal_id" uuid,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_radar_signals_text_check" CHECK (length(btrim("global_radar_signals"."demand_domain")) BETWEEN 1 AND 200
        AND length(btrim("global_radar_signals"."signal_type")) BETWEEN 1 AND 200
        AND length(btrim("global_radar_signals"."title")) BETWEEN 1 AND 300
        AND length(btrim("global_radar_signals"."factual_summary")) BETWEEN 1 AND 2000
        AND length(btrim("global_radar_signals"."interpretation_summary")) BETWEEN 1 AND 2000
        AND length(btrim("global_radar_signals"."theme")) BETWEEN 1 AND 200
        AND length(btrim("global_radar_signals"."source_country")) BETWEEN 1 AND 100
        AND length(btrim("global_radar_signals"."industry")) BETWEEN 1 AND 200
        AND length(btrim("global_radar_signals"."india_relevance_rationale")) BETWEEN 1 AND 2000
        AND length(btrim("global_radar_signals"."source_language")) BETWEEN 1 AND 35
        AND length(btrim("global_radar_signals"."extraction_method")) BETWEEN 1 AND 200
        AND "global_radar_signals"."dedupe_key" ~ '^[a-f0-9]{64}$'
        AND "global_radar_signals"."dedupe_version" ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'
        AND "global_radar_signals"."score_policy_version" ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'
        AND "global_radar_signals"."taxonomy_version" ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'
        AND ("global_radar_signals"."momentum_policy_version" IS NULL OR "global_radar_signals"."momentum_policy_version" ~ '^[a-z0-9][a-z0-9._:-]{0,199}$')
        AND ("global_radar_signals"."response_path_url" IS NULL OR length(btrim("global_radar_signals"."response_path_url")) BETWEEN 1 AND 2048)
        AND ("global_radar_signals"."response_business_email" IS NULL OR length(btrim("global_radar_signals"."response_business_email")) BETWEEN 3 AND 254)
        AND ("global_radar_signals"."partner_application_url" IS NULL OR length(btrim("global_radar_signals"."partner_application_url")) BETWEEN 1 AND 2048)),
	CONSTRAINT "global_radar_signals_scores_check" CHECK ("global_radar_signals"."india_fit_confidence" BETWEEN 0 AND 100
        AND "global_radar_signals"."score_coverage" BETWEEN 0 AND 100
        AND ("global_radar_signals"."demand_explicitness" IS NULL OR "global_radar_signals"."demand_explicitness" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."evidence_confidence" IS NULL OR "global_radar_signals"."evidence_confidence" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."freshness" IS NULL OR "global_radar_signals"."freshness" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."actionability" IS NULL OR "global_radar_signals"."actionability" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."india_fit" IS NULL OR "global_radar_signals"."india_fit" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."commercial_potential" IS NULL OR "global_radar_signals"."commercial_potential" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."repeatability" IS NULL OR "global_radar_signals"."repeatability" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."response_accessibility" IS NULL OR "global_radar_signals"."response_accessibility" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."strategic_learning" IS NULL OR "global_radar_signals"."strategic_learning" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."compliance_complexity" IS NULL OR "global_radar_signals"."compliance_complexity" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."proximity_to_external_demand" IS NULL OR "global_radar_signals"."proximity_to_external_demand" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."funding_deployment_momentum" IS NULL OR "global_radar_signals"."funding_deployment_momentum" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."likely_data_hardware_intensity" IS NULL OR "global_radar_signals"."likely_data_hardware_intensity" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."estimated_time_horizon" IS NULL OR "global_radar_signals"."estimated_time_horizon" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."strategic_relevance" IS NULL OR "global_radar_signals"."strategic_relevance" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."momentum_independent_entity_breadth" IS NULL OR "global_radar_signals"."momentum_independent_entity_breadth" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."momentum_primary_source_depth" IS NULL OR "global_radar_signals"."momentum_primary_source_depth" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."momentum_source_diversity" IS NULL OR "global_radar_signals"."momentum_source_diversity" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."momentum_weighted_volume" IS NULL OR "global_radar_signals"."momentum_weighted_volume" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."momentum_growth_vs_previous_period" IS NULL OR "global_radar_signals"."momentum_growth_vs_previous_period" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."momentum_taxonomy_consistency" IS NULL OR "global_radar_signals"."momentum_taxonomy_consistency" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."momentum_evidence_quality" IS NULL OR "global_radar_signals"."momentum_evidence_quality" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."direct_demand_score" IS NULL OR "global_radar_signals"."direct_demand_score" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."precursor_score" IS NULL OR "global_radar_signals"."precursor_score" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."momentum_score" IS NULL OR "global_radar_signals"."momentum_score" BETWEEN 0 AND 100)
        AND ("global_radar_signals"."momentum_independent_entity_count" IS NULL OR "global_radar_signals"."momentum_independent_entity_count" >= 0)
        AND ("global_radar_signals"."momentum_primary_source_count" IS NULL OR "global_radar_signals"."momentum_primary_source_count" >= 0)
        AND ("global_radar_signals"."momentum_source_family_count" IS NULL OR "global_radar_signals"."momentum_source_family_count" >= 0)
        AND ("global_radar_signals"."momentum_volume_7_days" IS NULL OR "global_radar_signals"."momentum_volume_7_days" >= 0)
        AND ("global_radar_signals"."momentum_volume_30_days" IS NULL OR "global_radar_signals"."momentum_volume_30_days" >= 0)
        AND ("global_radar_signals"."momentum_volume_90_days" IS NULL OR "global_radar_signals"."momentum_volume_90_days" >= 0)),
	CONSTRAINT "global_radar_signals_class_matrix_check" CHECK ((
        "global_radar_signals"."signal_class" = 'direct_demand'
        AND "global_radar_signals"."global_entity_id" IS NOT NULL
        AND "global_radar_signals"."precursor_score" IS NULL
        AND "global_radar_signals"."momentum_score" IS NULL
        AND "global_radar_signals"."proximity_to_external_demand" IS NULL
        AND "global_radar_signals"."funding_deployment_momentum" IS NULL
        AND "global_radar_signals"."likely_data_hardware_intensity" IS NULL
        AND "global_radar_signals"."estimated_time_horizon" IS NULL
        AND "global_radar_signals"."strategic_relevance" IS NULL
        AND "global_radar_signals"."momentum_independent_entity_count" IS NULL
        AND "global_radar_signals"."momentum_primary_source_count" IS NULL
        AND "global_radar_signals"."momentum_source_family_count" IS NULL
        AND "global_radar_signals"."momentum_volume_7_days" IS NULL
        AND "global_radar_signals"."momentum_volume_30_days" IS NULL
        AND "global_radar_signals"."momentum_volume_90_days" IS NULL
        AND "global_radar_signals"."momentum_independent_entity_breadth" IS NULL
        AND "global_radar_signals"."momentum_primary_source_depth" IS NULL
        AND "global_radar_signals"."momentum_source_diversity" IS NULL
        AND "global_radar_signals"."momentum_weighted_volume" IS NULL
        AND "global_radar_signals"."momentum_growth_vs_previous_period" IS NULL
        AND "global_radar_signals"."momentum_taxonomy_consistency" IS NULL
        AND "global_radar_signals"."momentum_evidence_quality" IS NULL
        AND "global_radar_signals"."momentum_policy_version" IS NULL
        AND "global_radar_signals"."momentum_qualification_gates_passed" IS NULL
      ) OR (
        "global_radar_signals"."signal_class" = 'demand_precursor'
        AND "global_radar_signals"."global_entity_id" IS NOT NULL
        AND "global_radar_signals"."direct_demand_score" IS NULL
        AND "global_radar_signals"."momentum_score" IS NULL
        AND "global_radar_signals"."demand_explicitness" IS NULL
        AND "global_radar_signals"."freshness" IS NULL
        AND "global_radar_signals"."actionability" IS NULL
        AND "global_radar_signals"."commercial_potential" IS NULL
        AND "global_radar_signals"."repeatability" IS NULL
        AND "global_radar_signals"."response_accessibility" IS NULL
        AND "global_radar_signals"."strategic_learning" IS NULL
        AND "global_radar_signals"."compliance_complexity" IS NULL
        AND "global_radar_signals"."momentum_independent_entity_count" IS NULL
        AND "global_radar_signals"."momentum_primary_source_count" IS NULL
        AND "global_radar_signals"."momentum_source_family_count" IS NULL
        AND "global_radar_signals"."momentum_volume_7_days" IS NULL
        AND "global_radar_signals"."momentum_volume_30_days" IS NULL
        AND "global_radar_signals"."momentum_volume_90_days" IS NULL
        AND "global_radar_signals"."momentum_independent_entity_breadth" IS NULL
        AND "global_radar_signals"."momentum_primary_source_depth" IS NULL
        AND "global_radar_signals"."momentum_source_diversity" IS NULL
        AND "global_radar_signals"."momentum_weighted_volume" IS NULL
        AND "global_radar_signals"."momentum_growth_vs_previous_period" IS NULL
        AND "global_radar_signals"."momentum_taxonomy_consistency" IS NULL
        AND "global_radar_signals"."momentum_evidence_quality" IS NULL
        AND "global_radar_signals"."momentum_policy_version" IS NULL
        AND "global_radar_signals"."momentum_qualification_gates_passed" IS NULL
      ) OR (
        "global_radar_signals"."signal_class" = 'ecosystem_momentum'
        AND "global_radar_signals"."global_entity_id" IS NULL
        AND "global_radar_signals"."direct_demand_score" IS NULL
        AND "global_radar_signals"."precursor_score" IS NULL
        AND "global_radar_signals"."demand_explicitness" IS NULL
        AND "global_radar_signals"."evidence_confidence" IS NULL
        AND "global_radar_signals"."freshness" IS NULL
        AND "global_radar_signals"."actionability" IS NULL
        AND "global_radar_signals"."india_fit" IS NULL
        AND "global_radar_signals"."commercial_potential" IS NULL
        AND "global_radar_signals"."repeatability" IS NULL
        AND "global_radar_signals"."response_accessibility" IS NULL
        AND "global_radar_signals"."strategic_learning" IS NULL
        AND "global_radar_signals"."compliance_complexity" IS NULL
        AND "global_radar_signals"."proximity_to_external_demand" IS NULL
        AND "global_radar_signals"."funding_deployment_momentum" IS NULL
        AND "global_radar_signals"."likely_data_hardware_intensity" IS NULL
        AND "global_radar_signals"."estimated_time_horizon" IS NULL
        AND "global_radar_signals"."strategic_relevance" IS NULL
        AND "global_radar_signals"."momentum_independent_entity_count" IS NOT NULL
        AND "global_radar_signals"."momentum_primary_source_count" IS NOT NULL
        AND "global_radar_signals"."momentum_source_family_count" IS NOT NULL
        AND "global_radar_signals"."momentum_volume_7_days" IS NOT NULL
        AND "global_radar_signals"."momentum_volume_30_days" IS NOT NULL
        AND "global_radar_signals"."momentum_volume_90_days" IS NOT NULL
        AND "global_radar_signals"."momentum_independent_entity_breadth" IS NOT NULL
        AND "global_radar_signals"."momentum_primary_source_depth" IS NOT NULL
        AND "global_radar_signals"."momentum_source_diversity" IS NOT NULL
        AND "global_radar_signals"."momentum_weighted_volume" IS NOT NULL
        AND "global_radar_signals"."momentum_growth_vs_previous_period" IS NOT NULL
        AND "global_radar_signals"."momentum_taxonomy_consistency" IS NOT NULL
        AND "global_radar_signals"."momentum_evidence_quality" IS NOT NULL
        AND "global_radar_signals"."momentum_score" IS NOT NULL
        AND "global_radar_signals"."score_coverage" = 100
        AND "global_radar_signals"."momentum_policy_version" IS NOT NULL
        AND "global_radar_signals"."momentum_qualification_gates_passed" IS NOT NULL
      )),
	CONSTRAINT "global_radar_signals_activity_check" CHECK ((
        "global_radar_signals"."signal_class" = 'direct_demand'
        AND "global_radar_signals"."evergreen" IS NOT NULL
        AND (
          ("global_radar_signals"."evergreen" = true AND "global_radar_signals"."reobserve_by" IS NOT NULL)
          OR ("global_radar_signals"."evergreen" = false AND "global_radar_signals"."reobserve_by" IS NULL)
        )
      ) OR (
        "global_radar_signals"."signal_class" <> 'direct_demand'
        AND "global_radar_signals"."evergreen" IS NULL
        AND "global_radar_signals"."reobserve_by" IS NULL
      )),
	CONSTRAINT "global_radar_signals_response_path_check" CHECK ((
        "global_radar_signals"."response_path_type" IS NULL
        AND "global_radar_signals"."response_path_url" IS NULL
        AND "global_radar_signals"."response_business_email" IS NULL
      ) OR (
        "global_radar_signals"."response_path_type" = 'official_business_email'
        AND "global_radar_signals"."response_path_url" IS NULL
        AND "global_radar_signals"."response_business_email" IS NOT NULL
      ) OR (
        "global_radar_signals"."response_path_type" IS NOT NULL
        AND "global_radar_signals"."response_path_type" <> 'official_business_email'
        AND "global_radar_signals"."response_path_url" IS NOT NULL
        AND "global_radar_signals"."response_business_email" IS NULL
      )),
	CONSTRAINT "global_radar_signals_systems_context_check" CHECK ((
        "global_radar_signals"."systems_context_summary" IS NULL
        AND "global_radar_signals"."systems_context_stack_type" IS NULL
        AND "global_radar_signals"."higher_level_system_goal" IS NULL
        AND "global_radar_signals"."relevant_stack_layer" IS NULL
        AND "global_radar_signals"."lower_level_inputs_required" IS NULL
        AND "global_radar_signals"."transformation_or_capability_added" IS NULL
        AND "global_radar_signals"."downstream_model_or_robot_behavior" IS NULL
        AND "global_radar_signals"."why_the_requirement_matters" IS NULL
        AND "global_radar_signals"."possible_indian_execution_role" IS NULL
        AND "global_radar_signals"."factual_elements" IS NULL
        AND "global_radar_signals"."inferred_elements" IS NULL
      ) OR (
        "global_radar_signals"."systems_context_summary" IS NOT NULL
        AND length(btrim("global_radar_signals"."systems_context_summary")) > 0
        AND "global_radar_signals"."systems_context_stack_type" IS NOT NULL
        AND "global_radar_signals"."systems_context_stack_type" IN ('hardware', 'physical_data')
        AND "global_radar_signals"."higher_level_system_goal" IS NOT NULL
        AND length(btrim("global_radar_signals"."higher_level_system_goal")) > 0
        AND "global_radar_signals"."relevant_stack_layer" IS NOT NULL
        AND length(btrim("global_radar_signals"."relevant_stack_layer")) > 0
        AND "global_radar_signals"."lower_level_inputs_required" IS NOT NULL
        AND "global_radar_signals"."transformation_or_capability_added" IS NOT NULL
        AND length(btrim("global_radar_signals"."transformation_or_capability_added")) > 0
        AND "global_radar_signals"."downstream_model_or_robot_behavior" IS NOT NULL
        AND length(btrim("global_radar_signals"."downstream_model_or_robot_behavior")) > 0
        AND "global_radar_signals"."why_the_requirement_matters" IS NOT NULL
        AND length(btrim("global_radar_signals"."why_the_requirement_matters")) > 0
        AND "global_radar_signals"."possible_indian_execution_role" IS NOT NULL
        AND length(btrim("global_radar_signals"."possible_indian_execution_role")) > 0
        AND "global_radar_signals"."factual_elements" IS NOT NULL
        AND cardinality("global_radar_signals"."factual_elements") > 0
        AND "global_radar_signals"."inferred_elements" IS NOT NULL
      )),
	CONSTRAINT "global_radar_signals_revision_check" CHECK ("global_radar_signals"."revision" >= 0),
	CONSTRAINT "global_radar_signals_no_self_merge_check" CHECK ("global_radar_signals"."merged_into_signal_id" IS NULL OR "global_radar_signals"."merged_into_signal_id" <> "global_radar_signals"."id"),
	CONSTRAINT "global_radar_signals_seen_order_check" CHECK ("global_radar_signals"."first_seen_at" <= "global_radar_signals"."last_seen_at"
        AND ("global_radar_signals"."announced_at" IS NULL OR "global_radar_signals"."expires_at" IS NULL OR "global_radar_signals"."announced_at" <= "global_radar_signals"."expires_at")
        AND ("global_radar_signals"."effective_from" IS NULL OR "global_radar_signals"."expires_at" IS NULL OR "global_radar_signals"."effective_from" <= "global_radar_signals"."expires_at"))
);
--> statement-breakpoint
CREATE TABLE "global_radar_watchlist_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"global_entity_id" uuid NOT NULL,
	"state" "global_radar_watchlist_state" DEFAULT 'enabled' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"theme" text NOT NULL,
	"category" text NOT NULL,
	"category_search_term_en" text NOT NULL,
	"category_search_term_zh_cn" text,
	"countries" text[] NOT NULL,
	"languages" text[] NOT NULL,
	"cadence_days" integer NOT NULL,
	"next_scan_at" timestamp with time zone,
	"reason" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_by_email" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_radar_watchlist_entity_unique" UNIQUE("global_entity_id"),
	CONSTRAINT "global_radar_watchlist_text_check" CHECK (length(btrim("global_radar_watchlist_entries"."theme")) BETWEEN 1 AND 200
        AND length(btrim("global_radar_watchlist_entries"."category")) BETWEEN 1 AND 200
        AND length(btrim("global_radar_watchlist_entries"."category_search_term_en")) BETWEEN 1 AND 500
        AND ("global_radar_watchlist_entries"."category_search_term_zh_cn" IS NULL OR length(btrim("global_radar_watchlist_entries"."category_search_term_zh_cn")) BETWEEN 1 AND 500)
        AND length(btrim("global_radar_watchlist_entries"."reason")) BETWEEN 1 AND 2000
        AND length(btrim("global_radar_watchlist_entries"."created_by_email")) BETWEEN 3 AND 254),
	CONSTRAINT "global_radar_watchlist_bounds_check" CHECK ("global_radar_watchlist_entries"."priority" BETWEEN 0 AND 100
        AND "global_radar_watchlist_entries"."cadence_days" > 0 AND "global_radar_watchlist_entries"."cadence_days" <= 365
        AND cardinality("global_radar_watchlist_entries"."countries") BETWEEN 1 AND 50
        AND cardinality("global_radar_watchlist_entries"."languages") BETWEEN 1 AND 50
        AND "global_radar_watchlist_entries"."revision" >= 0),
	CONSTRAINT "global_radar_watchlist_lifecycle_check" CHECK ("global_radar_watchlist_entries"."state" <> 'enabled' OR "global_radar_watchlist_entries"."next_scan_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "global_signal_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"run_id" uuid,
	"global_entity_id" uuid,
	"source_url" text NOT NULL,
	"canonical_source_url" text NOT NULL,
	"source_name" text NOT NULL,
	"source_type" text NOT NULL,
	"source_language" text NOT NULL,
	"source_country" text NOT NULL,
	"source_family" text NOT NULL,
	"evidence_claim" text NOT NULL,
	"source_excerpt" text,
	"english_summary" text NOT NULL,
	"published_at" timestamp with time zone,
	"observed_at" timestamp with time zone NOT NULL,
	"evidence_confidence" integer NOT NULL,
	"translation_confidence" integer,
	"is_primary_source" boolean NOT NULL,
	"is_syndicated" boolean NOT NULL,
	"supports_direct_demand" boolean NOT NULL,
	"supports_india_relevance" boolean NOT NULL,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_fingerprint" text NOT NULL,
	"supported_field_paths" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_signal_evidence_signal_fingerprint_unique" UNIQUE("signal_id","evidence_fingerprint"),
	CONSTRAINT "global_signal_evidence_text_check" CHECK (length(btrim("global_signal_evidence"."source_url")) BETWEEN 1 AND 2048
        AND length(btrim("global_signal_evidence"."canonical_source_url")) BETWEEN 1 AND 2048
        AND length(btrim("global_signal_evidence"."source_name")) BETWEEN 1 AND 200
        AND length(btrim("global_signal_evidence"."source_type")) BETWEEN 1 AND 100
        AND length(btrim("global_signal_evidence"."source_language")) BETWEEN 1 AND 35
        AND length(btrim("global_signal_evidence"."source_country")) BETWEEN 1 AND 100
        AND length(btrim("global_signal_evidence"."source_family")) BETWEEN 1 AND 200
        AND length(btrim("global_signal_evidence"."evidence_claim")) BETWEEN 1 AND 1000
        AND ("global_signal_evidence"."source_excerpt" IS NULL OR length(btrim("global_signal_evidence"."source_excerpt")) BETWEEN 1 AND 500)
        AND length(btrim("global_signal_evidence"."english_summary")) BETWEEN 1 AND 2000
        AND "global_signal_evidence"."evidence_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "global_signal_evidence_confidence_check" CHECK ("global_signal_evidence"."evidence_confidence" BETWEEN 0 AND 100
        AND ("global_signal_evidence"."translation_confidence" IS NULL OR "global_signal_evidence"."translation_confidence" BETWEEN 0 AND 100)),
	CONSTRAINT "global_signal_evidence_paths_check" CHECK (cardinality("global_signal_evidence"."supported_field_paths") BETWEEN 1 AND 50
        AND length(array_to_string("global_signal_evidence"."supported_field_paths", E'\n')) <= 10000
        AND array_to_string("global_signal_evidence"."supported_field_paths", E'\n')
          !~ '(^|\n)[[:space:]]*($|\n)'),
	CONSTRAINT "global_signal_evidence_dates_check" CHECK ("global_signal_evidence"."published_at" IS NULL OR "global_signal_evidence"."published_at" <= "global_signal_evidence"."observed_at")
);
--> statement-breakpoint
CREATE TABLE "global_signal_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"kind" "global_radar_requirement_kind" NOT NULL,
	"capability_tag" text NOT NULL,
	"summary" text NOT NULL,
	"data_families" text[],
	"sensor_modalities" text[],
	"environments" text[],
	"task_families" text[],
	"collection_methods" text[],
	"human_roles" text[],
	"robot_embodiments" text[],
	"indian_execution_archetypes" text[],
	"scale_specification" jsonb,
	"technical_specification" jsonb,
	"quality_specification" jsonb,
	"rights_and_compliance_specification" jsonb,
	"confidence" integer NOT NULL,
	"requirement_fingerprint" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_signal_requirements_signal_fingerprint_unique" UNIQUE("signal_id","requirement_fingerprint"),
	CONSTRAINT "global_signal_requirements_text_check" CHECK (length(btrim("global_signal_requirements"."capability_tag")) BETWEEN 1 AND 200
        AND length(btrim("global_signal_requirements"."summary")) BETWEEN 1 AND 1000
        AND "global_signal_requirements"."requirement_fingerprint" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "global_signal_requirements_bounds_check" CHECK ("global_signal_requirements"."confidence" BETWEEN 0 AND 100
        AND ("global_signal_requirements"."data_families" IS NULL OR cardinality("global_signal_requirements"."data_families") <= 50)
        AND ("global_signal_requirements"."sensor_modalities" IS NULL OR cardinality("global_signal_requirements"."sensor_modalities") <= 50)
        AND ("global_signal_requirements"."environments" IS NULL OR cardinality("global_signal_requirements"."environments") <= 50)
        AND ("global_signal_requirements"."task_families" IS NULL OR cardinality("global_signal_requirements"."task_families") <= 50)
        AND ("global_signal_requirements"."collection_methods" IS NULL OR cardinality("global_signal_requirements"."collection_methods") <= 50)
        AND ("global_signal_requirements"."human_roles" IS NULL OR cardinality("global_signal_requirements"."human_roles") <= 50)
        AND ("global_signal_requirements"."robot_embodiments" IS NULL OR cardinality("global_signal_requirements"."robot_embodiments") <= 50)
        AND ("global_signal_requirements"."indian_execution_archetypes" IS NULL OR cardinality("global_signal_requirements"."indian_execution_archetypes") <= 50))
);
--> statement-breakpoint
CREATE TABLE "global_signal_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"signal_id" uuid NOT NULL,
	"update_type" "global_radar_update_type" NOT NULL,
	"previous_safe_state" jsonb,
	"new_safe_state" jsonb,
	"evidence_id" uuid,
	"actor_type" "global_radar_actor_type" NOT NULL,
	"actor_id" text NOT NULL,
	"actor_email" text,
	"reason" text NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "global_signal_updates_signal_idempotency_unique" UNIQUE("signal_id","idempotency_key"),
	CONSTRAINT "global_signal_updates_actor_check" CHECK ((
        "global_signal_updates"."actor_type" = 'administrator'
        AND "global_signal_updates"."actor_email" IS NOT NULL
      ) OR (
        "global_signal_updates"."actor_type" <> 'administrator'
        AND "global_signal_updates"."actor_email" IS NULL
      )),
	CONSTRAINT "global_signal_updates_text_check" CHECK (length(btrim("global_signal_updates"."reason")) BETWEEN 1 AND 2000
        AND length(btrim("global_signal_updates"."actor_id")) BETWEEN 1 AND 200
        AND length(btrim("global_signal_updates"."idempotency_key")) BETWEEN 1 AND 500
        AND ("global_signal_updates"."actor_email" IS NULL OR length(btrim("global_signal_updates"."actor_email")) BETWEEN 3 AND 254))
);
--> statement-breakpoint
ALTER TABLE "global_entities" ADD CONSTRAINT "global_entities_promoted_candidate_fk" FOREIGN KEY ("promoted_candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_promotions" ADD CONSTRAINT "global_radar_promotions_entity_fk" FOREIGN KEY ("global_entity_id") REFERENCES "public"."global_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_promotions" ADD CONSTRAINT "global_radar_promotions_primary_signal_fk" FOREIGN KEY ("primary_signal_id") REFERENCES "public"."global_radar_signals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_promotions" ADD CONSTRAINT "global_radar_promotions_discovery_run_fk" FOREIGN KEY ("discovery_run_id") REFERENCES "public"."discovery_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_promotions" ADD CONSTRAINT "global_radar_promotions_discovery_candidate_fk" FOREIGN KEY ("discovery_candidate_id") REFERENCES "public"."discovery_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_promotions" ADD CONSTRAINT "global_radar_promotions_actor_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_promotions" ADD CONSTRAINT "global_radar_promotions_reversed_by_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_runs" ADD CONSTRAINT "global_radar_runs_requested_by_user_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_search_queries" ADD CONSTRAINT "global_radar_search_queries_run_fk" FOREIGN KEY ("run_id") REFERENCES "public"."global_radar_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_signal_entities" ADD CONSTRAINT "global_radar_signal_entities_signal_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."global_radar_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_signal_entities" ADD CONSTRAINT "global_radar_signal_entities_entity_fk" FOREIGN KEY ("global_entity_id") REFERENCES "public"."global_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_signals" ADD CONSTRAINT "global_radar_signals_entity_fk" FOREIGN KEY ("global_entity_id") REFERENCES "public"."global_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_signals" ADD CONSTRAINT "global_radar_signals_first_run_fk" FOREIGN KEY ("first_run_id") REFERENCES "public"."global_radar_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_signals" ADD CONSTRAINT "global_radar_signals_most_recent_run_fk" FOREIGN KEY ("most_recent_run_id") REFERENCES "public"."global_radar_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_signals" ADD CONSTRAINT "global_radar_signals_merged_into_fk" FOREIGN KEY ("merged_into_signal_id") REFERENCES "public"."global_radar_signals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_watchlist_entries" ADD CONSTRAINT "global_radar_watchlist_entity_fk" FOREIGN KEY ("global_entity_id") REFERENCES "public"."global_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_radar_watchlist_entries" ADD CONSTRAINT "global_radar_watchlist_creator_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_signal_evidence" ADD CONSTRAINT "global_signal_evidence_signal_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."global_radar_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_signal_evidence" ADD CONSTRAINT "global_signal_evidence_run_fk" FOREIGN KEY ("run_id") REFERENCES "public"."global_radar_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_signal_evidence" ADD CONSTRAINT "global_signal_evidence_entity_fk" FOREIGN KEY ("global_entity_id") REFERENCES "public"."global_entities"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_signal_requirements" ADD CONSTRAINT "global_signal_requirements_signal_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."global_radar_signals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_signal_updates" ADD CONSTRAINT "global_signal_updates_signal_fk" FOREIGN KEY ("signal_id") REFERENCES "public"."global_radar_signals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_signal_updates" ADD CONSTRAINT "global_signal_updates_evidence_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."global_signal_evidence"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "global_entities_canonical_domain_unique" ON "global_entities" USING btree ("canonical_domain") WHERE "global_entities"."canonical_domain" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "global_entities_linkedin_url_unique" ON "global_entities" USING btree ("linkedin_url") WHERE "global_entities"."linkedin_url" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "global_entities_public_identity_anchor_unique" ON "global_entities" USING btree ("public_identity_anchor");--> statement-breakpoint
CREATE INDEX "global_entities_stable_public_identifiers_idx" ON "global_entities" USING gin ("stable_public_identifiers");--> statement-breakpoint
CREATE INDEX "global_entities_name_country_idx" ON "global_entities" USING btree ("normalized_name","headquarters_country");--> statement-breakpoint
CREATE INDEX "global_entities_status_idx" ON "global_entities" USING btree ("entity_status");--> statement-breakpoint
CREATE INDEX "global_entities_country_idx" ON "global_entities" USING btree ("headquarters_country");--> statement-breakpoint
CREATE INDEX "global_entities_sector_idx" ON "global_entities" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "global_entities_promoted_candidate_idx" ON "global_entities" USING btree ("promoted_candidate_id");--> statement-breakpoint
CREATE INDEX "global_radar_admin_events_target_created_idx" ON "global_radar_admin_events" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "global_radar_admin_events_actor_created_idx" ON "global_radar_admin_events" USING btree ("actor_type","actor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "global_radar_promotions_one_active_entity_idx" ON "global_radar_promotions" USING btree ("global_entity_id") WHERE "global_radar_promotions"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "global_radar_promotions_reversal_idempotency_unique" ON "global_radar_promotions" USING btree ("reversal_idempotency_key") WHERE "global_radar_promotions"."reversal_idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "global_radar_promotions_primary_signal_idx" ON "global_radar_promotions" USING btree ("primary_signal_id");--> statement-breakpoint
CREATE INDEX "global_radar_promotions_discovery_run_idx" ON "global_radar_promotions" USING btree ("discovery_run_id");--> statement-breakpoint
CREATE INDEX "global_radar_promotions_discovery_candidate_idx" ON "global_radar_promotions" USING btree ("discovery_candidate_id");--> statement-breakpoint
CREATE INDEX "global_radar_promotions_status_idx" ON "global_radar_promotions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "global_radar_promotions_supporting_signals_idx" ON "global_radar_promotions" USING gin ("supporting_signal_ids");--> statement-breakpoint
CREATE UNIQUE INDEX "global_radar_runs_one_running_idx" ON "global_radar_runs" USING btree ((true)) WHERE "global_radar_runs"."status" = 'running';--> statement-breakpoint
CREATE INDEX "global_radar_runs_claim_idx" ON "global_radar_runs" USING btree ("status","trigger","created_at");--> statement-breakpoint
CREATE INDEX "global_radar_runs_manual_claim_idx" ON "global_radar_runs" USING btree ("created_at") WHERE "global_radar_runs"."status" = 'queued' AND "global_radar_runs"."trigger" = 'manual';--> statement-breakpoint
CREATE INDEX "global_radar_runs_lease_expiry_idx" ON "global_radar_runs" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "global_radar_runs_administrator_request_unique" ON "global_radar_runs" USING btree ("administrator_request_id") WHERE "global_radar_runs"."administrator_request_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "global_radar_search_queries_run_ordinal_idx" ON "global_radar_search_queries" USING btree ("run_id","ordinal");--> statement-breakpoint
CREATE INDEX "global_radar_search_queries_run_status_idx" ON "global_radar_search_queries" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "global_radar_signal_entities_entity_role_idx" ON "global_radar_signal_entities" USING btree ("global_entity_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "global_radar_signals_active_dedupe_unique" ON "global_radar_signals" USING btree ("dedupe_version","dedupe_key") WHERE "global_radar_signals"."merged_into_signal_id" IS NULL;--> statement-breakpoint
CREATE INDEX "global_radar_signals_entity_idx" ON "global_radar_signals" USING btree ("global_entity_id");--> statement-breakpoint
CREATE INDEX "global_radar_signals_class_status_idx" ON "global_radar_signals" USING btree ("signal_class","status","observed_at");--> statement-breakpoint
CREATE INDEX "global_radar_signals_source_country_idx" ON "global_radar_signals" USING btree ("source_country");--> statement-breakpoint
CREATE INDEX "global_radar_signals_india_relevance_idx" ON "global_radar_signals" USING btree ("india_relevance_type");--> statement-breakpoint
CREATE INDEX "global_radar_signals_demand_domain_idx" ON "global_radar_signals" USING btree ("demand_domain");--> statement-breakpoint
CREATE INDEX "global_radar_signals_theme_idx" ON "global_radar_signals" USING btree ("theme");--> statement-breakpoint
CREATE INDEX "global_radar_signals_observed_at_idx" ON "global_radar_signals" USING btree ("observed_at");--> statement-breakpoint
CREATE INDEX "global_radar_signals_direct_expiry_idx" ON "global_radar_signals" USING btree ("expires_at") WHERE "global_radar_signals"."signal_class" = 'direct_demand';--> statement-breakpoint
CREATE INDEX "global_radar_signals_direct_reobserve_idx" ON "global_radar_signals" USING btree ("reobserve_by") WHERE "global_radar_signals"."signal_class" = 'direct_demand';--> statement-breakpoint
CREATE INDEX "global_radar_signals_target_capabilities_idx" ON "global_radar_signals" USING gin ("target_capability_tags");--> statement-breakpoint
CREATE INDEX "global_radar_signals_direct_score_idx" ON "global_radar_signals" USING btree ("direct_demand_score") WHERE "global_radar_signals"."signal_class" = 'direct_demand';--> statement-breakpoint
CREATE INDEX "global_radar_signals_precursor_score_idx" ON "global_radar_signals" USING btree ("precursor_score") WHERE "global_radar_signals"."signal_class" = 'demand_precursor';--> statement-breakpoint
CREATE INDEX "global_radar_signals_momentum_score_idx" ON "global_radar_signals" USING btree ("momentum_score") WHERE "global_radar_signals"."signal_class" = 'ecosystem_momentum';--> statement-breakpoint
CREATE INDEX "global_radar_signals_first_run_idx" ON "global_radar_signals" USING btree ("first_run_id");--> statement-breakpoint
CREATE INDEX "global_radar_signals_most_recent_run_idx" ON "global_radar_signals" USING btree ("most_recent_run_id");--> statement-breakpoint
CREATE INDEX "global_radar_signals_merged_into_idx" ON "global_radar_signals" USING btree ("merged_into_signal_id");--> statement-breakpoint
CREATE INDEX "global_radar_watchlist_state_next_scan_idx" ON "global_radar_watchlist_entries" USING btree ("state","next_scan_at","priority");--> statement-breakpoint
CREATE INDEX "global_radar_watchlist_priority_idx" ON "global_radar_watchlist_entries" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "global_radar_watchlist_theme_idx" ON "global_radar_watchlist_entries" USING btree ("theme");--> statement-breakpoint
CREATE INDEX "global_radar_watchlist_category_idx" ON "global_radar_watchlist_entries" USING btree ("category");--> statement-breakpoint
CREATE INDEX "global_radar_watchlist_countries_idx" ON "global_radar_watchlist_entries" USING gin ("countries");--> statement-breakpoint
CREATE INDEX "global_radar_watchlist_languages_idx" ON "global_radar_watchlist_entries" USING gin ("languages");--> statement-breakpoint
CREATE INDEX "global_signal_evidence_signal_idx" ON "global_signal_evidence" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "global_signal_evidence_run_idx" ON "global_signal_evidence" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "global_signal_evidence_contributor_idx" ON "global_signal_evidence" USING btree ("global_entity_id");--> statement-breakpoint
CREATE INDEX "global_signal_evidence_canonical_url_idx" ON "global_signal_evidence" USING btree ("canonical_source_url");--> statement-breakpoint
CREATE INDEX "global_signal_evidence_source_family_idx" ON "global_signal_evidence" USING btree ("source_family");--> statement-breakpoint
CREATE INDEX "global_signal_requirements_signal_idx" ON "global_signal_requirements" USING btree ("signal_id");--> statement-breakpoint
CREATE INDEX "global_signal_requirements_kind_idx" ON "global_signal_requirements" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "global_signal_requirements_capability_idx" ON "global_signal_requirements" USING btree ("capability_tag");--> statement-breakpoint
CREATE INDEX "global_signal_requirements_data_families_idx" ON "global_signal_requirements" USING gin ("data_families");--> statement-breakpoint
CREATE INDEX "global_signal_requirements_sensor_modalities_idx" ON "global_signal_requirements" USING gin ("sensor_modalities");--> statement-breakpoint
CREATE INDEX "global_signal_requirements_indian_archetypes_idx" ON "global_signal_requirements" USING gin ("indian_execution_archetypes");--> statement-breakpoint
CREATE INDEX "global_signal_updates_signal_observed_idx" ON "global_signal_updates" USING btree ("signal_id","observed_at");--> statement-breakpoint
CREATE INDEX "global_signal_updates_signal_created_idx" ON "global_signal_updates" USING btree ("signal_id","created_at");--> statement-breakpoint
CREATE INDEX "global_signal_updates_type_idx" ON "global_signal_updates" USING btree ("update_type");
