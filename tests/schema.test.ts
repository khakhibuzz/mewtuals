import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { openToInterests } from "../app/domain/signal";

import {
  availabilityEnum,
  creatorSubtypeEnum,
  discoveryCandidates,
  discoveryCandidateStatusEnum,
  discoveryCandidateTypeEnum,
  discoveryCandidateIdentifiers,
  discoveryCandidateSources,
  discoveryIdentifierKindEnum,
  discoveryRuns,
  discoveryRunCandidateTypeEnum,
  discoveryRunStatusEnum,
  discoveryRunTriggerEnum,
  identityKindEnum,
  introductionRequests,
  introductionStateEnum,
  magicLinks,
  onboardingDrafts,
  opportunities,
  organisationSubtypeEnum,
  partnershipDirectionEnum,
  profileOpportunities,
  profileStatusEnum,
  profiles,
  sessions,
  signals,
  users,
  verificationDecisionEnum,
  verificationReviews,
} from "../db/schema";
import {
  globalEntities,
  globalEntityStatusEnum,
  globalRadarActorTypeEnum,
  globalRadarAdminEvents,
  globalRadarIndiaRelevanceTypeEnum,
  globalRadarPromotionEligibilityPathEnum,
  globalRadarPromotions,
  globalRadarPromotionStatusEnum,
  globalRadarQueryStatusEnum,
  globalRadarRequirementKindEnum,
  globalRadarResponsePathTypeEnum,
  globalRadarRuns,
  globalRadarSearchQueries,
  globalRadarSensitiveDataFlagStateEnum,
  globalRadarSignalEntities,
  globalRadarSignals,
  globalRadarWatchlistEntries,
  globalRadarRunStatusEnum,
  globalRadarRunTriggerEnum,
  globalRadarScanModeEnum,
  globalRadarSignalClassEnum,
  globalRadarSignalEntityRoleEnum,
  globalRadarSignalStatusEnum,
  globalRadarUpdateTypeEnum,
  globalRadarWatchlistStateEnum,
  globalSignalEvidence,
  globalSignalRequirements,
  globalSignalUpdates,
} from "../db/global-radar-schema";
import { opportunitySeedData } from "../db/seed-data";

const configFor = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table);

const columnNames = (table: Parameters<typeof getTableConfig>[0]) =>
  configFor(table).columns.map((column) => column.name);

const indexNames = (table: Parameters<typeof getTableConfig>[0]) =>
  configFor(table).indexes.map((index) => index.config.name);

const uniqueConstraintNames = (table: Parameters<typeof getTableConfig>[0]) =>
  configFor(table).uniqueConstraints.map((constraint) => constraint.name);

const foreignKeyNames = (table: Parameters<typeof getTableConfig>[0]) =>
  configFor(table).foreignKeys.map((foreignKey) => foreignKey.getName());

const checkNames = (table: Parameters<typeof getTableConfig>[0]) =>
  configFor(table).checks.map((constraint) => constraint.name);

const checkSql = (
  table: Parameters<typeof getTableConfig>[0],
  name: string,
) => {
  const constraint = configFor(table).checks.find(
    (candidate) => candidate.name === name,
  );
  if (!constraint) throw new Error(`Missing check constraint ${name}.`);
  return new PgDialect().sqlToQuery(constraint.value).sql;
};

const hasUniqueIndex = (
  table: Parameters<typeof getTableConfig>[0],
  name: string,
) =>
  configFor(table).indexes.some(
    (index) => index.config.name === name && index.config.unique,
  );

const indexWhereSql = (
  table: Parameters<typeof getTableConfig>[0],
  name: string,
) => {
  const candidate = configFor(table).indexes.find(
    (index) => index.config.name === name,
  );
  if (!candidate?.config.where) throw new Error(`Missing index predicate ${name}.`);
  return new PgDialect().sqlToQuery(candidate.config.where).sql;
};

describe("Mewtuals PostgreSQL schema", () => {
  it("defines every product table with UUID primary keys and timestamps", () => {
    const tables = [
      users,
      magicLinks,
      sessions,
      onboardingDrafts,
      profiles,
      verificationReviews,
      signals,
      opportunities,
      profileOpportunities,
      introductionRequests,
    ];

    expect(tables.map((table) => configFor(table).name)).toEqual([
      "users",
      "magic_links",
      "sessions",
      "onboarding_drafts",
      "profiles",
      "verification_reviews",
      "signals",
      "opportunities",
      "profile_opportunities",
      "introduction_requests",
    ]);

    for (const table of tables) {
      const config = configFor(table);
      const id = config.columns.find((column) => column.name === "id");

      expect(id?.columnType).toBe("PgUUID");
      expect(id?.primary).toBe(true);
      expect(columnNames(table)).toContain("created_at");
    }
  });

  it("exposes the constrained product vocabulary", () => {
    expect(profileStatusEnum.enumValues).toEqual([
      "draft",
      "pending",
      "verified",
      "waitlisted",
    ]);
    expect(identityKindEnum.enumValues).toEqual(["organisation", "creator"]);
    expect(organisationSubtypeEnum.enumValues).toEqual([
      "company",
      "brand",
      "startup",
      "distribution_partner",
    ]);
    expect(creatorSubtypeEnum.enumValues).toEqual([
      "creator",
      "podcaster",
      "publication",
      "media_operator",
    ]);
    expect(availabilityEnum.enumValues).toEqual([
      "open_now",
      "open_selectively",
      "not_available",
    ]);
    expect(verificationDecisionEnum.enumValues).toEqual([
      "verified",
      "waitlisted",
    ]);
    expect(introductionStateEnum.enumValues).toEqual([
      "requested",
      "reviewing",
      "contacting",
      "connected",
      "closed",
    ]);
    expect(partnershipDirectionEnum.enumValues).toEqual([
      "brand_creator",
      "brand_brand",
      "creator_creator",
      "startup_distribution_partner",
    ]);
  });

  it("exposes the constrained discovery vocabulary", () => {
    expect(discoveryCandidateTypeEnum.enumValues).toEqual(["company", "creator"]);
    expect(discoveryCandidateStatusEnum.enumValues).toEqual([
      "discovered",
      "shortlisted",
      "rejected",
      "queued_for_profile",
    ]);
    expect(discoveryRunStatusEnum.enumValues).toEqual([
      "queued",
      "running",
      "succeeded",
      "partial",
      "failed",
    ]);
    expect(discoveryRunTriggerEnum.enumValues).toEqual([
      "scheduled",
      "manual",
      "trial",
      "radar_promotion",
    ]);
    expect(discoveryRunCandidateTypeEnum.enumValues).toEqual([
      "company",
      "creator",
      "both",
    ]);
    expect(discoveryIdentifierKindEnum.enumValues).toEqual([
      "canonical",
      "website_host",
      "social_url",
      "linkedin_url",
    ]);
  });

  it("exposes the exact Global Radar storage vocabulary", () => {
    expect(globalEntityStatusEnum.enumValues).toEqual([
      "observed",
      "watchlisted",
      "monitoring",
      "qualified",
      "archived",
      "promoted_to_candidate",
    ]);
    expect(globalRadarRunStatusEnum.enumValues).toEqual([
      "queued",
      "running",
      "succeeded",
      "partial",
      "failed",
    ]);
    expect(globalRadarRunTriggerEnum.enumValues).toEqual([
      "scheduled",
      "manual",
      "trial",
    ]);
    expect(globalRadarScanModeEnum.enumValues).toEqual([
      "daily",
      "thematic",
      "watchlist_refresh",
      "manual",
    ]);
    expect(globalRadarQueryStatusEnum.enumValues).toEqual([
      "planned",
      "succeeded",
      "failed",
    ]);
    expect(globalRadarSignalClassEnum.enumValues).toEqual([
      "direct_demand",
      "demand_precursor",
      "ecosystem_momentum",
    ]);
    expect(globalRadarSignalStatusEnum.enumValues).toEqual([
      "newly_discovered",
      "needs_review",
      "monitoring",
      "qualified",
      "dismissed",
      "expired",
      "promoted",
    ]);
    expect(globalRadarIndiaRelevanceTypeEnum.enumValues).toEqual([
      "explicit_India",
      "existing_India_presence",
      "India_expansion",
      "globally_open",
      "inferred_India_compatible",
      "no_current_India_fit",
    ]);
    expect(globalRadarRequirementKindEnum.enumValues).toEqual([
      "physical_data",
      "robotics_hardware",
      "manufacturing",
      "deployment",
      "market_access",
      "research",
      "operational_service",
    ]);
    expect(globalRadarSignalEntityRoleEnum.enumValues).toEqual([
      "supporting",
      "contributor",
    ]);
    expect(globalRadarActorTypeEnum.enumValues).toEqual([
      "worker",
      "administrator",
      "system",
    ]);
    expect(globalRadarWatchlistStateEnum.enumValues).toEqual([
      "enabled",
      "paused",
      "disabled",
    ]);
    expect(globalRadarPromotionStatusEnum.enumValues).toEqual([
      "active",
      "reversed",
      "failed",
      "conflicted",
    ]);
    expect(globalRadarPromotionEligibilityPathEnum.enumValues).toEqual([
      "qualified_india_direct_demand",
      "repeated_india_compatible_signals",
      "documented_indian_relationship",
      "exceptional_strategic_relevance",
    ]);
    expect(globalRadarUpdateTypeEnum.enumValues).toEqual([
      "created",
      "rediscovered",
      "evidence_appended",
      "note_appended",
      "status_changed",
      "classification_changed",
      "expiry_changed",
      "india_fit_changed",
      "merged",
      "momentum_recomputed",
      "promoted",
      "promotion_reversed",
    ]);
    expect(globalRadarResponsePathTypeEnum.enumValues).toEqual([
      "supplier_or_partner_registration",
      "procurement_or_rfp_portal",
      "distributor_application",
      "official_enquiry_or_india_contact",
      "research_form",
      "official_business_email",
    ]);
    expect(globalRadarSensitiveDataFlagStateEnum.enumValues).toEqual([
      "not_observed",
      "possible",
      "severe",
    ]);
  });

  it("defines global entities", () => {
    expect(configFor(globalEntities).name).toBe("global_entities");
    expect(columnNames(globalEntities)).toEqual([
      "id",
      "canonical_name",
      "normalized_name",
      "canonical_domain",
      "website_url",
      "linkedin_url",
      "canonical_corporate_group_id",
      "stable_public_identifiers",
      "headquarters_country",
      "headquarters_city",
      "operating_countries",
      "organisation_type",
      "sector",
      "short_description",
      "entity_status",
      "first_seen_at",
      "last_seen_at",
      "promoted_candidate_id",
      "raw_metadata",
      "revision",
      "created_at",
      "updated_at",
    ]);
    expect(globalEntities.id.columnType).toBe("PgUUID");
    expect(globalEntities.id.primary).toBe(true);
    expect(globalEntities.stablePublicIdentifiers.notNull).toBe(true);
    expect(globalEntities.stablePublicIdentifiers.hasDefault).toBe(true);
    expect(globalEntities.operatingCountries.notNull).toBe(false);
    expect(globalEntities.canonicalCorporateGroupId.notNull).toBe(false);
    expect(globalEntities.revision.default).toBe(0);
    expect(indexNames(globalEntities)).toEqual(
      expect.arrayContaining([
        "global_entities_canonical_domain_unique",
        "global_entities_linkedin_url_unique",
        "global_entities_stable_public_identifiers_idx",
        "global_entities_name_country_idx",
        "global_entities_status_idx",
        "global_entities_country_idx",
        "global_entities_sector_idx",
        "global_entities_promoted_candidate_idx",
      ]),
    );
    expect(hasUniqueIndex(globalEntities, "global_entities_canonical_domain_unique")).toBe(
      true,
    );
    expect(hasUniqueIndex(globalEntities, "global_entities_linkedin_url_unique")).toBe(
      true,
    );
    expect(
      configFor(globalEntities).indexes.find(
        (candidate) =>
          candidate.config.name ===
          "global_entities_stable_public_identifiers_idx",
      )?.config.method,
    ).toBe("gin");
    expect(foreignKeyNames(globalEntities)).toEqual([
      "global_entities_promoted_candidate_fk",
    ]);
    expect(configFor(globalEntities).foreignKeys[0]?.onDelete).toBe("restrict");
    expect(checkNames(globalEntities)).toEqual(
      expect.arrayContaining([
        "global_entities_identity_text_check",
        "global_entities_corporate_group_check",
        "global_entities_stable_identifiers_count_check",
        "global_entities_revision_check",
        "global_entities_seen_order_check",
      ]),
    );
    expect(
      checkSql(globalEntities, "global_entities_corporate_group_check"),
    ).toContain("<= 200");
    expect(
      checkSql(globalEntities, "global_entities_corporate_group_check"),
    ).toContain("~ '^[a-z0-9][a-z0-9._:-]*$'");
    expect(
      checkSql(globalEntities, "global_entities_revision_check"),
    ).toContain(">= 0");
    expect(
      checkSql(
        globalEntities,
        "global_entities_stable_identifiers_count_check",
      ),
    ).toContain("[[:space:]]");
    expect(
      checkSql(
        globalEntities,
        "global_entities_stable_identifiers_count_check",
      ),
    ).toContain("<= 10000");
    expect(
      checkSql(
        globalEntities,
        "global_entities_stable_identifiers_count_check",
      ),
    ).toContain("array_position");
  });

  it("defines independently leased Global Radar runs", () => {
    expect(configFor(globalRadarRuns).name).toBe("global_radar_runs");
    expect(columnNames(globalRadarRuns)).toEqual([
      "id",
      "external_run_key",
      "request_hash",
      "trigger",
      "scan_mode",
      "status",
      "plan_fingerprint",
      "plan_snapshot",
      "started_at",
      "completed_at",
      "source_countries",
      "source_languages",
      "target_domains",
      "target_signal_types",
      "sources_used",
      "number_results_examined",
      "number_entities_observed",
      "number_signals_found",
      "number_direct_demands",
      "number_precursors",
      "number_momentum_records",
      "number_new",
      "number_updated",
      "number_duplicates",
      "number_rejected_for_weak_evidence",
      "number_source_errors",
      "error_summary",
      "administrator_request_id",
      "requested_by_user_id",
      "requested_by_email",
      "prompt_version",
      "schema_version",
      "taxonomy_version",
      "scoring_version",
      "lease_token_hash",
      "lease_expires_at",
      "submission_hash",
      "batch_fingerprint",
      "created_at",
      "updated_at",
    ]);
    expect(globalRadarRuns.externalRunKey.isUnique).toBe(true);
    expect(globalRadarRuns.planSnapshot.notNull).toBe(true);
    expect(globalRadarRuns.requestedByUserId.notNull).toBe(false);
    expect(indexNames(globalRadarRuns)).toEqual(
      expect.arrayContaining([
        "global_radar_runs_one_running_idx",
        "global_radar_runs_claim_idx",
        "global_radar_runs_manual_claim_idx",
        "global_radar_runs_lease_expiry_idx",
        "global_radar_runs_administrator_request_unique",
      ]),
    );
    expect(
      hasUniqueIndex(globalRadarRuns, "global_radar_runs_one_running_idx"),
    ).toBe(true);
    expect(
      hasUniqueIndex(
        globalRadarRuns,
        "global_radar_runs_administrator_request_unique",
      ),
    ).toBe(true);
    expect(foreignKeyNames(globalRadarRuns)).toEqual([
      "global_radar_runs_requested_by_user_fk",
    ]);
    expect(configFor(globalRadarRuns).foreignKeys[0]?.onDelete).toBe("restrict");
    expect(checkNames(globalRadarRuns)).toEqual(
      expect.arrayContaining([
        "global_radar_runs_hashes_check",
        "global_radar_runs_counts_check",
        "global_radar_runs_lifecycle_check",
        "global_radar_runs_manual_requester_check",
      ]),
    );
    expect(checkSql(globalRadarRuns, "global_radar_runs_hashes_check")).toContain(
      "{64}",
    );
    expect(checkSql(globalRadarRuns, "global_radar_runs_hashes_check")).toContain(
      "lease_token_hash",
    );
    const lifecycleCheck = checkSql(
      globalRadarRuns,
      "global_radar_runs_lifecycle_check",
    );
    expect(lifecycleCheck.match(/lease_expires_at\" IS NOT NULL/g)).toHaveLength(
      3,
    );
    expect(lifecycleCheck.match(/completed_at\" IS NOT NULL/g)).toHaveLength(2);
    expect(
      checkSql(globalRadarRuns, "global_radar_runs_manual_requester_check"),
    ).toContain("requested_by_user_id");
    expect(
      checkSql(globalRadarRuns, "global_radar_runs_manual_requester_check"),
    ).toContain("administrator_request_id");
    expect(
      checkSql(globalRadarRuns, "global_radar_runs_manual_requester_check"),
    ).toContain("requested_by_email");
    expect(
      checkSql(globalRadarRuns, "global_radar_runs_manual_requester_check"),
    ).toContain("scan_mode");
  });

  it("defines immutable Global Radar search-plan queries", () => {
    expect(configFor(globalRadarSearchQueries).name).toBe(
      "global_radar_search_queries",
    );
    expect(columnNames(globalRadarSearchQueries)).toEqual([
      "id",
      "run_id",
      "query_text",
      "fingerprint",
      "language",
      "source_country",
      "theme",
      "signal_class_intent",
      "source_adapter",
      "recency_days",
      "ordinal",
      "status",
      "executed_at",
      "results_examined",
      "error_summary",
      "created_at",
    ]);
    expect(columnNames(globalRadarSearchQueries)).not.toContain("target_market");
    expect(uniqueConstraintNames(globalRadarSearchQueries)).toContain(
      "global_radar_search_queries_run_fingerprint_unique",
    );
    expect(indexNames(globalRadarSearchQueries)).toEqual(
      expect.arrayContaining([
        "global_radar_search_queries_run_ordinal_idx",
        "global_radar_search_queries_run_status_idx",
      ]),
    );
    expect(foreignKeyNames(globalRadarSearchQueries)).toEqual([
      "global_radar_search_queries_run_fk",
    ]);
    expect(configFor(globalRadarSearchQueries).foreignKeys[0]?.onDelete).toBe(
      "cascade",
    );
    expect(checkNames(globalRadarSearchQueries)).toEqual(
      expect.arrayContaining([
        "global_radar_search_queries_text_check",
        "global_radar_search_queries_execution_check",
        "global_radar_search_queries_bounds_check",
      ]),
    );
    expect(
      checkSql(globalRadarSearchQueries, "global_radar_search_queries_bounds_check"),
    ).toContain("recency_days");
    expect(
      checkSql(globalRadarSearchQueries, "global_radar_search_queries_bounds_check"),
    ).toContain("> 0");
    expect(
      checkSql(globalRadarSearchQueries, "global_radar_search_queries_text_check"),
    ).toContain("= 'codex_public_web'");
  });

  it("defines the discriminated Global Radar signal contract", () => {
    expect(configFor(globalRadarSignals).name).toBe("global_radar_signals");
    expect(columnNames(globalRadarSignals)).toEqual([
      "id",
      "global_entity_id",
      "signal_class",
      "demand_domain",
      "signal_type",
      "title",
      "factual_summary",
      "interpretation_summary",
      "theme",
      "systems_context_summary",
      "source_country",
      "target_geographies",
      "collection_geographies",
      "manufacturing_geographies",
      "delivery_geographies",
      "industry",
      "target_model_or_system",
      "target_capability_tags",
      "required_counterparty_archetypes",
      "india_relevance_type",
      "india_relevance_rationale",
      "india_fit_reasons",
      "india_fit_constraints",
      "india_fit_unknowns",
      "india_fit_confidence",
      "india_regulatory_facts",
      "india_logistics_facts",
      "demand_explicitness",
      "evidence_confidence",
      "freshness",
      "actionability",
      "india_fit",
      "commercial_potential",
      "repeatability",
      "response_accessibility",
      "strategic_learning",
      "compliance_complexity",
      "proximity_to_external_demand",
      "funding_deployment_momentum",
      "likely_data_hardware_intensity",
      "estimated_time_horizon",
      "strategic_relevance",
      "momentum_independent_entity_count",
      "momentum_primary_source_count",
      "momentum_source_family_count",
      "momentum_volume_7_days",
      "momentum_volume_30_days",
      "momentum_volume_90_days",
      "momentum_independent_entity_breadth",
      "momentum_primary_source_depth",
      "momentum_source_diversity",
      "momentum_weighted_volume",
      "momentum_growth_vs_previous_period",
      "momentum_taxonomy_consistency",
      "momentum_evidence_quality",
      "direct_demand_score",
      "precursor_score",
      "momentum_score",
      "score_coverage",
      "score_policy_version",
      "momentum_policy_version",
      "announced_at",
      "effective_from",
      "expires_at",
      "evergreen",
      "reobserve_by",
      "observed_at",
      "status",
      "response_path_type",
      "response_path_url",
      "response_business_email",
      "partner_application_url",
      "source_language",
      "extraction_method",
      "taxonomy_version",
      "systems_context_stack_type",
      "higher_level_system_goal",
      "relevant_stack_layer",
      "lower_level_inputs_required",
      "transformation_or_capability_added",
      "downstream_model_or_robot_behavior",
      "why_the_requirement_matters",
      "possible_indian_execution_role",
      "factual_elements",
      "inferred_elements",
      "faces",
      "voices",
      "biometrics",
      "gaze",
      "health",
      "children",
      "home_interiors",
      "workplace_monitoring",
      "precise_location",
      "road_users",
      "employee_data",
      "industrial_secrets",
      "defence_or_dual_use",
      "copyrighted_material",
      "export_controls",
      "consent",
      "de_identification",
      "legal_review",
      "known_residency_requirements",
      "participant_rights_complexity",
      "raw_metadata",
      "dedupe_key",
      "dedupe_version",
      "revision",
      "first_run_id",
      "most_recent_run_id",
      "merged_into_signal_id",
      "first_seen_at",
      "last_seen_at",
      "created_at",
      "updated_at",
    ]);
    expect(globalRadarSignals.dedupeVersion.notNull).toBe(true);
    expect(globalRadarSignals.revision.default).toBe(0);
    expect(globalRadarSignals.evergreen.notNull).toBe(false);
    expect(indexNames(globalRadarSignals)).toEqual(
      expect.arrayContaining([
        "global_radar_signals_active_dedupe_unique",
        "global_radar_signals_entity_idx",
        "global_radar_signals_class_status_idx",
        "global_radar_signals_source_country_idx",
        "global_radar_signals_india_relevance_idx",
        "global_radar_signals_demand_domain_idx",
        "global_radar_signals_theme_idx",
        "global_radar_signals_observed_at_idx",
        "global_radar_signals_direct_expiry_idx",
        "global_radar_signals_direct_reobserve_idx",
        "global_radar_signals_target_capabilities_idx",
        "global_radar_signals_first_run_idx",
        "global_radar_signals_most_recent_run_idx",
        "global_radar_signals_merged_into_idx",
      ]),
    );
    expect(
      hasUniqueIndex(globalRadarSignals, "global_radar_signals_active_dedupe_unique"),
    ).toBe(true);
    expect(
      indexWhereSql(globalRadarSignals, "global_radar_signals_active_dedupe_unique"),
    ).toBe('"global_radar_signals"."merged_into_signal_id" IS NULL');
    expect(foreignKeyNames(globalRadarSignals)).toEqual([
      "global_radar_signals_entity_fk",
      "global_radar_signals_first_run_fk",
      "global_radar_signals_most_recent_run_fk",
      "global_radar_signals_merged_into_fk",
    ]);
    expect(
      configFor(globalRadarSignals).foreignKeys.map((foreignKey) => foreignKey.onDelete),
    ).toEqual(["restrict", "restrict", "restrict", "restrict"]);
    expect(checkNames(globalRadarSignals)).toEqual(
      expect.arrayContaining([
        "global_radar_signals_text_check",
        "global_radar_signals_scores_check",
        "global_radar_signals_class_matrix_check",
        "global_radar_signals_activity_check",
        "global_radar_signals_response_path_check",
        "global_radar_signals_systems_context_check",
        "global_radar_signals_revision_check",
        "global_radar_signals_seen_order_check",
        "global_radar_signals_no_self_merge_check",
      ]),
    );
    const classMatrix = checkSql(
      globalRadarSignals,
      "global_radar_signals_class_matrix_check",
    );
    expect(classMatrix).toContain("direct_demand");
    expect(classMatrix).toContain("demand_precursor");
    expect(classMatrix).toContain("ecosystem_momentum");
    expect(classMatrix).toContain("momentum_policy_version");
    expect(classMatrix).toContain("global_entity_id");
    expect(
      checkSql(globalRadarSignals, "global_radar_signals_activity_check"),
    ).toContain("reobserve_by");
    expect(
      checkSql(globalRadarSignals, "global_radar_signals_response_path_check"),
    ).toContain("official_business_email");
    expect(
      checkSql(globalRadarSignals, "global_radar_signals_scores_check"),
    ).toContain("score_coverage");
    expect(
      checkSql(globalRadarSignals, "global_radar_signals_systems_context_check"),
    ).toContain("systems_context_stack_type");
    const systemsContextCheck = checkSql(
      globalRadarSignals,
      "global_radar_signals_systems_context_check",
    );
    for (const column of [
      "systems_context_summary",
      "systems_context_stack_type",
      "higher_level_system_goal",
      "relevant_stack_layer",
      "lower_level_inputs_required",
      "transformation_or_capability_added",
      "downstream_model_or_robot_behavior",
      "why_the_requirement_matters",
      "possible_indian_execution_role",
      "factual_elements",
      "inferred_elements",
    ]) {
      expect(systemsContextCheck).toContain(`${column}\" IS NOT NULL`);
    }
    expect(
      checkSql(globalRadarSignals, "global_radar_signals_no_self_merge_check"),
    ).toContain("merged_into_signal_id");
    expect(
      configFor(globalRadarSignals).indexes.find(
        (candidate) =>
          candidate.config.name === "global_radar_signals_target_capabilities_idx",
      )?.config.method,
    ).toBe("gin");
  });

  it("defines inspectable supporting and contributor associations", () => {
    expect(configFor(globalRadarSignalEntities).name).toBe(
      "global_radar_signal_entities",
    );
    expect(columnNames(globalRadarSignalEntities)).toEqual([
      "id",
      "signal_id",
      "global_entity_id",
      "role",
      "confidence",
      "created_at",
    ]);
    expect(uniqueConstraintNames(globalRadarSignalEntities)).toContain(
      "global_radar_signal_entities_identity_unique",
    );
    expect(indexNames(globalRadarSignalEntities)).toContain(
      "global_radar_signal_entities_entity_role_idx",
    );
    expect(foreignKeyNames(globalRadarSignalEntities)).toEqual([
      "global_radar_signal_entities_signal_fk",
      "global_radar_signal_entities_entity_fk",
    ]);
    expect(
      configFor(globalRadarSignalEntities).foreignKeys.map(
        (foreignKey) => foreignKey.onDelete,
      ),
    ).toEqual(["cascade", "restrict"]);
    expect(
      checkSql(
        globalRadarSignalEntities,
        "global_radar_signal_entities_confidence_check",
      ),
    ).toContain("BETWEEN 0 AND 100");
  });

  it("defines normalized Global Radar signal requirements", () => {
    expect(configFor(globalSignalRequirements).name).toBe(
      "global_signal_requirements",
    );
    expect(columnNames(globalSignalRequirements)).toEqual([
      "id",
      "signal_id",
      "kind",
      "capability_tag",
      "summary",
      "data_families",
      "sensor_modalities",
      "environments",
      "task_families",
      "collection_methods",
      "human_roles",
      "robot_embodiments",
      "indian_execution_archetypes",
      "scale_specification",
      "technical_specification",
      "quality_specification",
      "rights_and_compliance_specification",
      "confidence",
      "requirement_fingerprint",
      "created_at",
      "updated_at",
    ]);
    expect(globalSignalRequirements.summary.notNull).toBe(true);
    expect(uniqueConstraintNames(globalSignalRequirements)).toContain(
      "global_signal_requirements_signal_fingerprint_unique",
    );
    expect(indexNames(globalSignalRequirements)).toEqual(
      expect.arrayContaining([
        "global_signal_requirements_signal_idx",
        "global_signal_requirements_kind_idx",
        "global_signal_requirements_capability_idx",
        "global_signal_requirements_data_families_idx",
        "global_signal_requirements_sensor_modalities_idx",
        "global_signal_requirements_indian_archetypes_idx",
      ]),
    );
    expect(foreignKeyNames(globalSignalRequirements)).toEqual([
      "global_signal_requirements_signal_fk",
    ]);
    expect(configFor(globalSignalRequirements).foreignKeys[0]?.onDelete).toBe(
      "cascade",
    );
    expect(
      checkSql(globalSignalRequirements, "global_signal_requirements_text_check"),
    ).toContain("requirement_fingerprint");
    expect(
      checkSql(globalSignalRequirements, "global_signal_requirements_bounds_check"),
    ).toContain("BETWEEN 0 AND 100");
    for (const name of [
      "global_signal_requirements_data_families_idx",
      "global_signal_requirements_sensor_modalities_idx",
      "global_signal_requirements_indian_archetypes_idx",
    ]) {
      expect(
        configFor(globalSignalRequirements).indexes.find(
          (candidate) => candidate.config.name === name,
        )?.config.method,
      ).toBe("gin");
    }
  });

  it("defines append-only evidence with provenance and contributor binding", () => {
    expect(configFor(globalSignalEvidence).name).toBe("global_signal_evidence");
    expect(columnNames(globalSignalEvidence)).toEqual([
      "id",
      "signal_id",
      "run_id",
      "global_entity_id",
      "source_url",
      "canonical_source_url",
      "source_name",
      "source_type",
      "source_language",
      "source_country",
      "source_family",
      "evidence_claim",
      "source_excerpt",
      "english_summary",
      "published_at",
      "observed_at",
      "evidence_confidence",
      "translation_confidence",
      "is_primary_source",
      "is_syndicated",
      "supports_direct_demand",
      "supports_india_relevance",
      "raw_metadata",
      "evidence_fingerprint",
      "supported_field_paths",
      "created_at",
    ]);
    expect(globalSignalEvidence.globalEntityId.notNull).toBe(false);
    expect(globalSignalEvidence.runId.notNull).toBe(false);
    expect(globalSignalEvidence.sourceFamily.notNull).toBe(true);
    expect(globalSignalEvidence.isSyndicated.notNull).toBe(true);
    expect(uniqueConstraintNames(globalSignalEvidence)).toContain(
      "global_signal_evidence_signal_fingerprint_unique",
    );
    expect(indexNames(globalSignalEvidence)).toEqual(
      expect.arrayContaining([
        "global_signal_evidence_signal_idx",
        "global_signal_evidence_run_idx",
        "global_signal_evidence_contributor_idx",
        "global_signal_evidence_canonical_url_idx",
        "global_signal_evidence_source_family_idx",
      ]),
    );
    expect(foreignKeyNames(globalSignalEvidence)).toEqual([
      "global_signal_evidence_signal_fk",
      "global_signal_evidence_run_fk",
      "global_signal_evidence_entity_fk",
    ]);
    expect(
      configFor(globalSignalEvidence).foreignKeys.map(
        (foreignKey) => foreignKey.onDelete,
      ),
    ).toEqual(["cascade", "restrict", "restrict"]);
    expect(
      checkSql(globalSignalEvidence, "global_signal_evidence_confidence_check"),
    ).toContain("translation_confidence");
    expect(
      checkSql(globalSignalEvidence, "global_signal_evidence_paths_check"),
    ).toContain("cardinality");
  });

  it("defines idempotent append-only signal updates", () => {
    expect(configFor(globalSignalUpdates).name).toBe("global_signal_updates");
    expect(columnNames(globalSignalUpdates)).toEqual([
      "id",
      "signal_id",
      "update_type",
      "previous_safe_state",
      "new_safe_state",
      "evidence_id",
      "actor_type",
      "actor_id",
      "actor_email",
      "reason",
      "observed_at",
      "idempotency_key",
      "created_at",
    ]);
    expect(globalSignalUpdates.idempotencyKey.isUnique).toBe(false);
    expect(uniqueConstraintNames(globalSignalUpdates)).toContain(
      "global_signal_updates_signal_idempotency_unique",
    );
    expect(indexNames(globalSignalUpdates)).toEqual(
      expect.arrayContaining([
        "global_signal_updates_signal_observed_idx",
        "global_signal_updates_signal_created_idx",
        "global_signal_updates_type_idx",
      ]),
    );
    expect(foreignKeyNames(globalSignalUpdates)).toEqual([
      "global_signal_updates_signal_fk",
      "global_signal_updates_evidence_fk",
    ]);
    expect(
      configFor(globalSignalUpdates).foreignKeys.map(
        (foreignKey) => foreignKey.onDelete,
      ),
    ).toEqual(["restrict", "restrict"]);
    expect(
      checkSql(globalSignalUpdates, "global_signal_updates_actor_check"),
    ).toContain("administrator");
    expect(
      checkSql(globalSignalUpdates, "global_signal_updates_text_check"),
    ).toContain("idempotency_key");
  });

  it("defines configurable entity watchlist entries", () => {
    expect(configFor(globalRadarWatchlistEntries).name).toBe(
      "global_radar_watchlist_entries",
    );
    expect(columnNames(globalRadarWatchlistEntries)).toEqual([
      "id",
      "global_entity_id",
      "state",
      "priority",
      "theme",
      "category",
      "category_search_term_en",
      "category_search_term_zh_cn",
      "countries",
      "languages",
      "cadence_days",
      "next_scan_at",
      "reason",
      "created_by_user_id",
      "created_by_email",
      "revision",
      "created_at",
      "updated_at",
    ]);
    expect(globalRadarWatchlistEntries.globalEntityId.isUnique).toBe(true);
    expect(globalRadarWatchlistEntries.theme.dataType).toBe("string");
    expect(columnNames(globalRadarWatchlistEntries)).not.toContain("themes");
    expect(globalRadarWatchlistEntries.categorySearchTermEn.notNull).toBe(true);
    expect(indexNames(globalRadarWatchlistEntries)).toEqual(
      expect.arrayContaining([
        "global_radar_watchlist_state_next_scan_idx",
        "global_radar_watchlist_priority_idx",
        "global_radar_watchlist_theme_idx",
        "global_radar_watchlist_category_idx",
        "global_radar_watchlist_countries_idx",
        "global_radar_watchlist_languages_idx",
      ]),
    );
    expect(foreignKeyNames(globalRadarWatchlistEntries)).toEqual([
      "global_radar_watchlist_entity_fk",
      "global_radar_watchlist_creator_fk",
    ]);
    expect(
      configFor(globalRadarWatchlistEntries).foreignKeys.map(
        (foreignKey) => foreignKey.onDelete,
      ),
    ).toEqual(["restrict", "restrict"]);
    expect(globalRadarWatchlistEntries.revision.default).toBe(0);
    expect(
      checkSql(globalRadarWatchlistEntries, "global_radar_watchlist_bounds_check"),
    ).toContain("cadence_days");
    expect(
      checkSql(globalRadarWatchlistEntries, "global_radar_watchlist_text_check"),
    ).toContain("category_search_term_en");
    expect(
      checkSql(
        globalRadarWatchlistEntries,
        "global_radar_watchlist_lifecycle_check",
      ),
    ).toContain("next_scan_at");
    for (const name of [
      "global_radar_watchlist_countries_idx",
      "global_radar_watchlist_languages_idx",
    ]) {
      expect(
        configFor(globalRadarWatchlistEntries).indexes.find(
          (candidate) => candidate.config.name === name,
        )?.config.method,
      ).toBe("gin");
    }
    expect(
      configFor(globalRadarWatchlistEntries).indexes.find(
        (candidate) =>
          candidate.config.name === "global_radar_watchlist_state_next_scan_idx",
      )?.config.columns.length,
    ).toBe(3);
  });

  it("defines idempotent and reversible Radar promotions", () => {
    expect(configFor(globalRadarPromotions).name).toBe(
      "global_radar_promotions",
    );
    expect(columnNames(globalRadarPromotions)).toEqual([
      "id",
      "idempotency_key",
      "request_hash",
      "global_entity_id",
      "primary_signal_id",
      "supporting_signal_ids",
      "eligibility_path",
      "expected_entity_revision",
      "expected_primary_signal_revision",
      "expected_supporting_signal_revisions",
      "promoted_entity_revision",
      "promoted_primary_signal_revision",
      "previous_entity_status",
      "previous_primary_signal_status",
      "entity_snapshot",
      "primary_signal_snapshot",
      "supporting_signals_snapshot",
      "discovery_run_id",
      "discovery_candidate_id",
      "actor_user_id",
      "actor_email",
      "reason",
      "source_snapshot_digest",
      "status",
      "promoted_at",
      "reversal_idempotency_key",
      "reversal_request_hash",
      "reversed_at",
      "reversed_by_user_id",
      "reversed_by_email",
      "reversal_reason",
      "created_at",
      "updated_at",
    ]);
    expect(globalRadarPromotions.idempotencyKey.isUnique).toBe(true);
    expect(indexNames(globalRadarPromotions)).toEqual(
      expect.arrayContaining([
        "global_radar_promotions_one_active_entity_idx",
        "global_radar_promotions_primary_signal_idx",
        "global_radar_promotions_discovery_run_idx",
        "global_radar_promotions_discovery_candidate_idx",
        "global_radar_promotions_status_idx",
        "global_radar_promotions_supporting_signals_idx",
      ]),
    );
    expect(
      hasUniqueIndex(
        globalRadarPromotions,
        "global_radar_promotions_one_active_entity_idx",
      ),
    ).toBe(true);
    expect(
      indexWhereSql(
        globalRadarPromotions,
        "global_radar_promotions_one_active_entity_idx",
      ),
    ).toContain("status");
    expect(foreignKeyNames(globalRadarPromotions)).toEqual([
      "global_radar_promotions_entity_fk",
      "global_radar_promotions_primary_signal_fk",
      "global_radar_promotions_discovery_run_fk",
      "global_radar_promotions_discovery_candidate_fk",
      "global_radar_promotions_actor_fk",
      "global_radar_promotions_reversed_by_fk",
    ]);
    expect(
      configFor(globalRadarPromotions).foreignKeys.map(
        (foreignKey) => foreignKey.onDelete,
      ),
    ).toEqual([
      "restrict",
      "restrict",
      "restrict",
      "restrict",
      "restrict",
      "restrict",
    ]);
    expect(checkNames(globalRadarPromotions)).toEqual(
      expect.arrayContaining([
        "global_radar_promotions_text_check",
        "global_radar_promotions_revisions_check",
        "global_radar_promotions_supporting_signals_check",
        "global_radar_promotions_lifecycle_check",
      ]),
    );
    expect(
      checkSql(globalRadarPromotions, "global_radar_promotions_lifecycle_check"),
    ).toContain("reversal_request_hash");
    expect(
      checkSql(
        globalRadarPromotions,
        "global_radar_promotions_supporting_signals_check",
      ),
    ).toContain("ANY");
    expect(
      checkSql(
        globalRadarPromotions,
        "global_radar_promotions_supporting_signals_check",
      ),
    ).toContain("array_position");
  });

  it("defines idempotent append-only Radar administrator events", () => {
    expect(configFor(globalRadarAdminEvents).name).toBe(
      "global_radar_admin_events",
    );
    expect(columnNames(globalRadarAdminEvents)).toEqual([
      "id",
      "actor_type",
      "actor_id",
      "actor_email",
      "target_type",
      "target_id",
      "action",
      "reason",
      "before_safe_state",
      "after_safe_state",
      "idempotency_key",
      "created_at",
    ]);
    expect(uniqueConstraintNames(globalRadarAdminEvents)).toContain(
      "global_radar_admin_events_target_idempotency_unique",
    );
    expect(indexNames(globalRadarAdminEvents)).toEqual(
      expect.arrayContaining([
        "global_radar_admin_events_target_created_idx",
        "global_radar_admin_events_actor_created_idx",
      ]),
    );
    expect(foreignKeyNames(globalRadarAdminEvents)).toEqual([]);
    expect(
      checkSql(globalRadarAdminEvents, "global_radar_admin_events_actor_check"),
    ).toContain("administrator");
    expect(
      checkSql(globalRadarAdminEvents, "global_radar_admin_events_text_check"),
    ).toContain("idempotency_key");
  });

  it("models leased discovery runs with one global active-run backstop", () => {
    expect(configFor(discoveryRuns).name).toBe("discovery_runs");
    expect(columnNames(discoveryRuns)).toEqual(
      expect.arrayContaining([
        "external_run_key",
        "trigger",
        "status",
        "lease_token_hash",
        "lease_expires_at",
        "submission_hash",
        "sources_used",
        "requested_count",
        "company_percentage",
        "found_count",
        "new_count",
        "duplicate_count",
        "error_summary",
      ]),
    );
    expect(discoveryRuns.externalRunKey.isUnique).toBe(true);
    expect(indexNames(discoveryRuns)).toEqual(
      expect.arrayContaining([
        "discovery_runs_one_running_idx",
        "discovery_runs_claim_idx",
        "discovery_runs_lease_expiry_idx",
      ]),
    );
    expect(hasUniqueIndex(discoveryRuns, "discovery_runs_one_running_idx")).toBe(
      true,
    );
  });

  it("models discovery candidates with immutable identity and review indexes", () => {
    expect(configFor(discoveryCandidates).name).toBe("discovery_candidates");
    expect(columnNames(discoveryCandidates)).toEqual(
      expect.arrayContaining([
        "type",
        "name",
        "normalized_name",
        "canonical_identity_key",
        "canonical_url",
        "website_url",
        "primary_social_url",
        "linkedin_url",
        "discovered_description",
        "category",
        "subcategory",
        "geography",
        "first_source_name",
        "first_source_url",
        "discovered_at",
        "last_seen_at",
        "most_recent_run_id",
        "discovery_score",
        "status",
        "raw_metadata",
      ]),
    );
    expect(uniqueConstraintNames(discoveryCandidates)).toContain(
      "discovery_candidates_type_canonical_identity_unique",
    );
    expect(uniqueConstraintNames(discoveryCandidates)).toContain(
      "discovery_candidates_id_type_unique",
    );
    expect(foreignKeyNames(discoveryCandidates)).toEqual([
      "discovery_candidates_recent_run_fk",
    ]);
    expect(indexNames(discoveryCandidates)).toEqual(
      expect.arrayContaining([
        "discovery_candidates_type_idx",
        "discovery_candidates_geography_idx",
        "discovery_candidates_category_idx",
        "discovery_candidates_source_idx",
        "discovery_candidates_status_idx",
        "discovery_candidates_discovered_at_idx",
        "discovery_candidates_recent_run_idx",
      ]),
    );
  });

  it("assigns each stable discovery identifier to one candidate", () => {
    expect(configFor(discoveryCandidateIdentifiers).name).toBe(
      "discovery_candidate_identifiers",
    );
    expect(columnNames(discoveryCandidateIdentifiers)).toEqual(
      expect.arrayContaining([
        "candidate_id",
        "candidate_type",
        "kind",
        "normalized_value",
      ]),
    );
    expect(uniqueConstraintNames(discoveryCandidateIdentifiers)).toContain(
      "discovery_candidate_identifiers_type_value_unique",
    );
    expect(indexNames(discoveryCandidateIdentifiers)).toContain(
      "discovery_candidate_identifiers_candidate_idx",
    );
    expect(
      configFor(discoveryCandidateIdentifiers).foreignKeys[0]?.onDelete,
    ).toBe("cascade");
    expect(foreignKeyNames(discoveryCandidateIdentifiers)).toEqual([
      "discovery_identifiers_candidate_type_fk",
    ]);
    expect(
      configFor(discoveryCandidateIdentifiers).foreignKeys[0]?.reference()
        .columns.map((column) => column.name),
    ).toEqual(["candidate_id", "candidate_type"]);
  });

  it("retains per-run discovery source evidence", () => {
    expect(configFor(discoveryCandidateSources).name).toBe(
      "discovery_candidate_sources",
    );
    expect(columnNames(discoveryCandidateSources)).toEqual(
      expect.arrayContaining([
        "candidate_id",
        "discovery_run_id",
        "source_name",
        "source_url",
        "first_seen_at",
        "last_seen_at",
        "raw_metadata",
      ]),
    );
    expect(uniqueConstraintNames(discoveryCandidateSources)).toContain(
      "discovery_candidate_sources_evidence_unique",
    );
    expect(indexNames(discoveryCandidateSources)).toEqual(
      expect.arrayContaining([
        "discovery_candidate_sources_candidate_idx",
        "discovery_candidate_sources_run_idx",
        "discovery_candidate_sources_source_candidate_idx",
      ]),
    );
    expect(
      configFor(discoveryCandidateSources).foreignKeys.some(
        (foreignKey) => foreignKey.onDelete === "cascade",
      ),
    ).toBe(true);
    expect(foreignKeyNames(discoveryCandidateSources)).toEqual([
      "discovery_sources_candidate_fk",
      "discovery_sources_run_fk",
    ]);
  });

  it("enforces identity ownership and idempotent workflow writes", () => {
    expect(users.email.isUnique).toBe(true);
    expect(hasUniqueIndex(magicLinks, "magic_links_token_hash_idx")).toBe(true);
    expect(hasUniqueIndex(sessions, "sessions_token_hash_idx")).toBe(true);
    expect(profiles.userId.isUnique).toBe(true);
    expect(onboardingDrafts.userId.isUnique).toBe(true);
    expect(signals.profileId.isUnique).toBe(true);
    expect(opportunities.key.isUnique).toBe(true);
    expect(uniqueConstraintNames(profileOpportunities)).toContain(
      "profile_opportunities_profile_id_opportunity_id_unique",
    );
    expect(introductionRequests.profileOpportunityId.isUnique).toBe(true);
  });

  it("indexes authentication tokens and workflow status lookups", () => {
    expect(indexNames(magicLinks)).toContain("magic_links_token_hash_idx");
    expect(indexNames(magicLinks)).toContain(
      "magic_links_requester_hash_created_at_idx",
    );
    expect(indexNames(magicLinks)).toContain("magic_links_created_at_idx");
    expect(indexNames(sessions)).toContain("sessions_token_hash_idx");
    expect(indexNames(profiles)).toContain("profiles_status_idx");
    expect(indexNames(verificationReviews)).toContain(
      "verification_reviews_decision_idx",
    );
    expect(indexNames(opportunities)).toContain("opportunities_direction_idx");
    expect(indexNames(introductionRequests)).toContain(
      "introduction_requests_state_idx",
    );
  });

  it("records durable abuse-control attempts without requiring legacy requester data", () => {
    expect(columnNames(magicLinks)).toEqual(
      expect.arrayContaining(["requester_hash", "issued"]),
    );
    expect(magicLinks.requesterHash.notNull).toBe(false);
    expect(magicLinks.issued.notNull).toBe(true);
    expect(magicLinks.issued.default).toBe(true);
  });

  it("models matching inputs and eligibility explicitly", () => {
    expect(signals.openTo.dataType).toBe("array");
    expect(columnNames(opportunities)).toEqual(
      expect.arrayContaining([
        "direction",
        "counterparty_type",
        "reciprocal_value",
        "eligible_identity_kinds",
        "eligible_organisation_subtypes",
        "eligible_creator_subtypes",
      ]),
    );
  });

  it("keeps every seeded opportunity inside the shared signal vocabulary", () => {
    const allowedInterests = new Set<string>(openToInterests);

    expect(opportunitySeedData).toHaveLength(4);
    for (const opportunity of opportunitySeedData) {
      expect(opportunity.openToTags.length).toBeGreaterThan(0);
      expect(opportunity.reciprocalValue).toContain("↔");
      expect(
        opportunity.openToTags.every((tag) => allowedInterests.has(tag)),
      ).toBe(true);
    }
  });

  it("uses cascading foreign keys for owned product records", () => {
    const ownedTables = [
      sessions,
      onboardingDrafts,
      profiles,
      verificationReviews,
      signals,
      profileOpportunities,
      introductionRequests,
    ];

    for (const table of ownedTables) {
      const foreignKeys = configFor(table).foreignKeys;

      expect(foreignKeys.length).toBeGreaterThan(0);
      expect(foreignKeys.every((foreignKey) => foreignKey.onDelete === "cascade")).toBe(
        true,
      );
    }
  });
});
