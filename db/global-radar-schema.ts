import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import {
  indiaRelevanceTypes,
  professionalResponsePathTypes,
  promotionEligibilityPaths,
  radarRunStatuses,
  radarRunTriggers,
  radarScanModes,
  requirementKinds,
  signalClasses,
  signalStatuses,
  sensitiveDataFlagStates,
} from "../app/domain/global-radar";
import { discoveryCandidates, discoveryRuns, users } from "./schema";

const radarId = () => uuid("id").defaultRandom().primaryKey();
const radarCreatedAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const radarUpdatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const radarCounter = (name: string) =>
  integer(name).default(0).notNull();

export const globalEntityStatusEnum = pgEnum("global_entity_status", [
  "observed",
  "watchlisted",
  "monitoring",
  "qualified",
  "archived",
  "promoted_to_candidate",
]);

export const globalRadarRunStatusEnum = pgEnum(
  "global_radar_run_status",
  radarRunStatuses,
);

export const globalRadarRunTriggerEnum = pgEnum(
  "global_radar_run_trigger",
  radarRunTriggers,
);

export const globalRadarScanModeEnum = pgEnum(
  "global_radar_scan_mode",
  radarScanModes,
);

export const globalRadarQueryStatusEnum = pgEnum("global_radar_query_status", [
  "planned",
  "succeeded",
  "failed",
]);

export const globalRadarSignalClassEnum = pgEnum(
  "global_radar_signal_class",
  signalClasses,
);

export const globalRadarSignalStatusEnum = pgEnum(
  "global_radar_signal_status",
  signalStatuses,
);

export const globalRadarIndiaRelevanceTypeEnum = pgEnum(
  "global_radar_india_relevance_type",
  indiaRelevanceTypes,
);

export const globalRadarRequirementKindEnum = pgEnum(
  "global_radar_requirement_kind",
  requirementKinds,
);

export const globalRadarSignalEntityRoleEnum = pgEnum(
  "global_radar_signal_entity_role",
  ["supporting", "contributor"],
);

export const globalRadarActorTypeEnum = pgEnum("global_radar_actor_type", [
  "worker",
  "administrator",
  "system",
]);

export const globalRadarWatchlistStateEnum = pgEnum(
  "global_radar_watchlist_state",
  ["enabled", "paused", "disabled"],
);

export const globalRadarPromotionStatusEnum = pgEnum(
  "global_radar_promotion_status",
  ["active", "reversed", "failed", "conflicted"],
);

export const globalRadarPromotionEligibilityPathEnum = pgEnum(
  "global_radar_promotion_eligibility_path",
  promotionEligibilityPaths,
);

export const globalRadarUpdateTypeEnum = pgEnum("global_radar_update_type", [
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

export const globalRadarResponsePathTypeEnum = pgEnum(
  "global_radar_response_path_type",
  professionalResponsePathTypes,
);

export const globalRadarSensitiveDataFlagStateEnum = pgEnum(
  "global_radar_sensitive_data_flag_state",
  sensitiveDataFlagStates,
);

export const globalEntities = pgTable(
  "global_entities",
  {
    id: radarId(),
    canonicalName: text("canonical_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    canonicalDomain: text("canonical_domain"),
    websiteUrl: text("website_url"),
    linkedinUrl: text("linkedin_url"),
    canonicalCorporateGroupId: text("canonical_corporate_group_id"),
    stablePublicIdentifiers: text("stable_public_identifiers")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    publicIdentityAnchor: text("public_identity_anchor").notNull(),
    headquartersCountry: text("headquarters_country").notNull(),
    headquartersCity: text("headquarters_city"),
    operatingCountries: text("operating_countries").array(),
    organisationType: text("organisation_type").notNull(),
    sector: text("sector").notNull(),
    shortDescription: text("short_description").notNull(),
    entityStatus: globalEntityStatusEnum("entity_status")
      .default("observed")
      .notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    promotedCandidateId: uuid("promoted_candidate_id"),
    rawMetadata: jsonb("raw_metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    revision: integer("revision").default(0).notNull(),
    createdAt: radarCreatedAt(),
    updatedAt: radarUpdatedAt(),
  },
  (table) => [
    uniqueIndex("global_entities_canonical_domain_unique")
      .on(table.canonicalDomain)
      .where(sql`${table.canonicalDomain} IS NOT NULL`),
    uniqueIndex("global_entities_linkedin_url_unique")
      .on(table.linkedinUrl)
      .where(sql`${table.linkedinUrl} IS NOT NULL`),
    uniqueIndex("global_entities_public_identity_anchor_unique").on(
      table.publicIdentityAnchor,
    ),
    index("global_entities_stable_public_identifiers_idx").using(
      "gin",
      table.stablePublicIdentifiers,
    ),
    index("global_entities_name_country_idx").on(
      table.normalizedName,
      table.headquartersCountry,
    ),
    index("global_entities_status_idx").on(table.entityStatus),
    index("global_entities_country_idx").on(table.headquartersCountry),
    index("global_entities_sector_idx").on(table.sector),
    index("global_entities_promoted_candidate_idx").on(
      table.promotedCandidateId,
    ),
    foreignKey({
      name: "global_entities_promoted_candidate_fk",
      columns: [table.promotedCandidateId],
      foreignColumns: [discoveryCandidates.id],
    }).onDelete("restrict"),
    check(
      "global_entities_identity_text_check",
      sql`length(btrim(${table.canonicalName})) > 0
        AND length(btrim(${table.normalizedName})) > 0
        AND length(btrim(${table.headquartersCountry})) > 0
        AND length(btrim(${table.organisationType})) > 0
        AND length(btrim(${table.sector})) > 0
        AND length(btrim(${table.shortDescription})) > 0
        AND (${table.canonicalDomain} IS NULL OR length(btrim(${table.canonicalDomain})) > 0)
        AND (${table.websiteUrl} IS NULL OR length(btrim(${table.websiteUrl})) > 0)
        AND (${table.linkedinUrl} IS NULL OR length(btrim(${table.linkedinUrl})) > 0)`,
    ),
    check(
      "global_entities_corporate_group_check",
      sql`${table.canonicalCorporateGroupId} IS NULL OR (
        length(${table.canonicalCorporateGroupId}) <= 200
        AND ${table.canonicalCorporateGroupId} ~ '^[a-z0-9][a-z0-9._:-]*$'
      )`,
    ),
    check(
      "global_entities_stable_identifiers_count_check",
      sql`cardinality(${table.stablePublicIdentifiers}) <= 50
        AND array_position(${table.stablePublicIdentifiers}, NULL) IS NULL
        AND (
          cardinality(${table.stablePublicIdentifiers}) = 0
          OR (
            length(array_to_string(${table.stablePublicIdentifiers}, E'\\n')) <= 10000
            AND array_to_string(${table.stablePublicIdentifiers}, E'\\n')
              !~ '(^|\\n)[[:space:]]*($|\\n)'
          )
        )`,
    ),
    check(
      "global_entities_public_identity_anchor_check",
      sql`${table.publicIdentityAnchor} ~ '^[a-f0-9]{64}$'`,
    ),
    check("global_entities_revision_check", sql`${table.revision} >= 0`),
    check(
      "global_entities_seen_order_check",
      sql`${table.firstSeenAt} <= ${table.lastSeenAt}`,
    ),
  ],
);

export const globalRadarRuns = pgTable(
  "global_radar_runs",
  {
    id: radarId(),
    externalRunKey: text("external_run_key")
      .notNull()
      .unique("global_radar_runs_external_run_key_unique"),
    requestHash: text("request_hash").notNull(),
    trigger: globalRadarRunTriggerEnum("trigger").notNull(),
    scanMode: globalRadarScanModeEnum("scan_mode").notNull(),
    status: globalRadarRunStatusEnum("status").default("queued").notNull(),
    planFingerprint: text("plan_fingerprint").notNull(),
    planSnapshot: jsonb("plan_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    sourceCountries: text("source_countries")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    sourceLanguages: text("source_languages")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    targetDomains: text("target_domains")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    targetSignalTypes: text("target_signal_types")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    sourcesUsed: text("sources_used")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    numberResultsExamined: radarCounter("number_results_examined"),
    numberEntitiesObserved: radarCounter("number_entities_observed"),
    numberSignalsFound: radarCounter("number_signals_found"),
    numberDirectDemands: radarCounter("number_direct_demands"),
    numberPrecursors: radarCounter("number_precursors"),
    numberMomentumRecords: radarCounter("number_momentum_records"),
    numberNew: radarCounter("number_new"),
    numberUpdated: radarCounter("number_updated"),
    numberDuplicates: radarCounter("number_duplicates"),
    numberRejectedForWeakEvidence: radarCounter(
      "number_rejected_for_weak_evidence",
    ),
    numberSourceErrors: radarCounter("number_source_errors"),
    errorSummary: jsonb("error_summary")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    administratorRequestId: uuid("administrator_request_id"),
    requestedByUserId: uuid("requested_by_user_id"),
    requestedByEmail: text("requested_by_email"),
    promptVersion: text("prompt_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    taxonomyVersion: text("taxonomy_version").notNull(),
    scoringVersion: text("scoring_version").notNull(),
    leaseTokenHash: text("lease_token_hash"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    submissionHash: text("submission_hash"),
    batchFingerprint: text("batch_fingerprint"),
    createdAt: radarCreatedAt(),
    updatedAt: radarUpdatedAt(),
  },
  (table) => [
    uniqueIndex("global_radar_runs_one_running_idx")
      .on(sql`(true)`)
      .where(sql`${table.status} = 'running'`),
    index("global_radar_runs_claim_idx").on(
      table.status,
      table.trigger,
      table.createdAt,
    ),
    index("global_radar_runs_manual_claim_idx")
      .on(table.createdAt)
      .where(sql`${table.status} = 'queued' AND ${table.trigger} = 'manual'`),
    index("global_radar_runs_lease_expiry_idx").on(
      table.status,
      table.leaseExpiresAt,
    ),
    uniqueIndex("global_radar_runs_administrator_request_unique")
      .on(table.administratorRequestId)
      .where(sql`${table.administratorRequestId} IS NOT NULL`),
    foreignKey({
      name: "global_radar_runs_requested_by_user_fk",
      columns: [table.requestedByUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    check(
      "global_radar_runs_hashes_check",
      sql`${table.requestHash} ~ '^[a-f0-9]{64}$'
        AND ${table.planFingerprint} ~ '^[a-f0-9]{64}$'
        AND (${table.leaseTokenHash} IS NULL OR ${table.leaseTokenHash} ~ '^[a-f0-9]{64}$')
        AND (${table.submissionHash} IS NULL OR ${table.submissionHash} ~ '^[a-f0-9]{64}$')
        AND (${table.batchFingerprint} IS NULL OR ${table.batchFingerprint} ~ '^[a-f0-9]{64}$')
        AND length(btrim(${table.externalRunKey})) BETWEEN 1 AND 500
        AND length(btrim(${table.promptVersion})) BETWEEN 1 AND 200
        AND length(btrim(${table.schemaVersion})) BETWEEN 1 AND 200
        AND length(btrim(${table.taxonomyVersion})) BETWEEN 1 AND 200
        AND length(btrim(${table.scoringVersion})) BETWEEN 1 AND 200`,
    ),
    check(
      "global_radar_runs_counts_check",
      sql`${table.numberResultsExamined} >= 0
        AND ${table.numberEntitiesObserved} >= 0
        AND ${table.numberSignalsFound} >= 0
        AND ${table.numberDirectDemands} >= 0
        AND ${table.numberPrecursors} >= 0
        AND ${table.numberMomentumRecords} >= 0
        AND ${table.numberNew} >= 0
        AND ${table.numberUpdated} >= 0
        AND ${table.numberDuplicates} >= 0
        AND ${table.numberRejectedForWeakEvidence} >= 0
        AND ${table.numberSourceErrors} >= 0`,
    ),
    check(
      "global_radar_runs_lifecycle_check",
      sql`(
        ${table.status} = 'queued'
        AND ${table.startedAt} IS NULL
        AND ${table.completedAt} IS NULL
        AND ${table.leaseTokenHash} IS NULL
        AND ${table.leaseExpiresAt} IS NULL
        AND ${table.submissionHash} IS NULL
        AND ${table.batchFingerprint} IS NULL
      ) OR (
        ${table.status} = 'running'
        AND ${table.startedAt} IS NOT NULL
        AND ${table.completedAt} IS NULL
        AND ${table.leaseTokenHash} IS NOT NULL
        AND ${table.leaseExpiresAt} IS NOT NULL
        AND ${table.leaseExpiresAt} > ${table.startedAt}
        AND ${table.submissionHash} IS NULL
        AND ${table.batchFingerprint} IS NULL
      ) OR (
        ${table.status} IN ('succeeded', 'partial')
        AND ${table.startedAt} IS NOT NULL
        AND ${table.completedAt} IS NOT NULL
        AND ${table.completedAt} >= ${table.startedAt}
        AND ${table.leaseTokenHash} IS NOT NULL
        AND ${table.leaseExpiresAt} IS NOT NULL
        AND ${table.submissionHash} IS NOT NULL
        AND ${table.batchFingerprint} IS NOT NULL
      ) OR (
        ${table.status} = 'failed'
        AND ${table.startedAt} IS NOT NULL
        AND ${table.completedAt} IS NOT NULL
        AND ${table.completedAt} >= ${table.startedAt}
        AND ${table.leaseTokenHash} IS NOT NULL
        AND ${table.leaseExpiresAt} IS NOT NULL
        AND (
          (${table.submissionHash} IS NULL AND ${table.batchFingerprint} IS NULL)
          OR (${table.submissionHash} IS NOT NULL AND ${table.batchFingerprint} IS NOT NULL)
        )
      )`,
    ),
    check(
      "global_radar_runs_manual_requester_check",
      sql`(
        (
          ${table.trigger} = 'manual'
          AND ${table.scanMode} = 'manual'
          AND ${table.administratorRequestId} IS NOT NULL
          AND ${table.requestedByUserId} IS NOT NULL
          AND ${table.requestedByEmail} IS NOT NULL
        ) OR (
          ${table.trigger} <> 'manual'
          AND ${table.scanMode} <> 'manual'
          AND ${table.administratorRequestId} IS NULL
        )
      ) AND (
        ${table.requestedByEmail} IS NULL
        OR length(btrim(${table.requestedByEmail})) BETWEEN 3 AND 254
      )`,
    ),
  ],
);

export const globalRadarSearchQueries = pgTable(
  "global_radar_search_queries",
  {
    id: radarId(),
    runId: uuid("run_id").notNull(),
    queryText: text("query_text").notNull(),
    fingerprint: text("fingerprint").notNull(),
    language: text("language").notNull(),
    sourceCountry: text("source_country").notNull(),
    theme: text("theme").notNull(),
    signalClassIntent: globalRadarSignalClassEnum(
      "signal_class_intent",
    ).notNull(),
    sourceAdapter: text("source_adapter").notNull(),
    recencyDays: integer("recency_days").notNull(),
    ordinal: integer("ordinal").notNull(),
    status: globalRadarQueryStatusEnum("status").default("planned").notNull(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    resultsExamined: integer("results_examined").default(0).notNull(),
    errorSummary: text("error_summary"),
    createdAt: radarCreatedAt(),
  },
  (table) => [
    unique("global_radar_search_queries_run_fingerprint_unique").on(
      table.runId,
      table.fingerprint,
    ),
    index("global_radar_search_queries_run_ordinal_idx").on(
      table.runId,
      table.ordinal,
    ),
    index("global_radar_search_queries_run_status_idx").on(
      table.runId,
      table.status,
    ),
    foreignKey({
      name: "global_radar_search_queries_run_fk",
      columns: [table.runId],
      foreignColumns: [globalRadarRuns.id],
    }).onDelete("cascade"),
    check(
      "global_radar_search_queries_text_check",
      sql`length(btrim(${table.queryText})) BETWEEN 1 AND 1000
        AND ${table.fingerprint} ~ '^[a-f0-9]{64}$'
        AND length(btrim(${table.language})) BETWEEN 1 AND 35
        AND length(btrim(${table.sourceCountry})) BETWEEN 1 AND 100
        AND length(btrim(${table.theme})) BETWEEN 1 AND 200
        AND ${table.sourceAdapter} = 'codex_public_web'
        AND (${table.errorSummary} IS NULL OR length(btrim(${table.errorSummary})) BETWEEN 1 AND 1000)`,
    ),
    check(
      "global_radar_search_queries_execution_check",
      sql`(
        ${table.status} = 'planned'
        AND ${table.executedAt} IS NULL
        AND ${table.resultsExamined} = 0
        AND ${table.errorSummary} IS NULL
      ) OR (
        ${table.status} = 'succeeded'
        AND ${table.executedAt} IS NOT NULL
        AND ${table.errorSummary} IS NULL
      ) OR (
        ${table.status} = 'failed'
        AND ${table.executedAt} IS NOT NULL
        AND ${table.errorSummary} IS NOT NULL
      )`,
    ),
    check(
      "global_radar_search_queries_bounds_check",
      sql`${table.recencyDays} > 0 AND ${table.recencyDays} <= 365
        AND ${table.ordinal} >= 0 AND ${table.ordinal} < 120
        AND ${table.resultsExamined} >= 0 AND ${table.resultsExamined} <= 10000`,
    ),
  ],
);

export const globalRadarSignals = pgTable(
  "global_radar_signals",
  {
    id: radarId(),
    globalEntityId: uuid("global_entity_id"),
    signalClass: globalRadarSignalClassEnum("signal_class").notNull(),
    demandDomain: text("demand_domain").notNull(),
    signalType: text("signal_type").notNull(),
    title: text("title").notNull(),
    factualSummary: text("factual_summary").notNull(),
    interpretationSummary: text("interpretation_summary").notNull(),
    theme: text("theme").notNull(),
    systemsContextSummary: text("systems_context_summary"),
    sourceCountry: text("source_country").notNull(),
    targetGeographies: text("target_geographies").array(),
    collectionGeographies: text("collection_geographies").array(),
    manufacturingGeographies: text("manufacturing_geographies").array(),
    deliveryGeographies: text("delivery_geographies").array(),
    industry: text("industry").notNull(),
    targetModelOrSystem: text("target_model_or_system"),
    targetCapabilityTags: text("target_capability_tags").array(),
    requiredCounterpartyArchetypes: text(
      "required_counterparty_archetypes",
    ).array(),
    indiaRelevanceType: globalRadarIndiaRelevanceTypeEnum(
      "india_relevance_type",
    ).notNull(),
    indiaRelevanceRationale: text("india_relevance_rationale").notNull(),
    indiaFitReasons: text("india_fit_reasons")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    indiaFitConstraints: text("india_fit_constraints")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    indiaFitUnknowns: text("india_fit_unknowns")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    indiaFitConfidence: integer("india_fit_confidence").notNull(),
    indiaRegulatoryFacts: jsonb("india_regulatory_facts").$type<
      Record<string, unknown>
    >(),
    indiaLogisticsFacts: jsonb("india_logistics_facts").$type<
      Record<string, unknown>
    >(),
    demandExplicitness: integer("demand_explicitness"),
    evidenceConfidence: integer("evidence_confidence"),
    freshness: integer("freshness"),
    actionability: integer("actionability"),
    indiaFit: integer("india_fit"),
    commercialPotential: integer("commercial_potential"),
    repeatability: integer("repeatability"),
    responseAccessibility: integer("response_accessibility"),
    strategicLearning: integer("strategic_learning"),
    complianceComplexity: integer("compliance_complexity"),
    proximityToExternalDemand: integer("proximity_to_external_demand"),
    fundingDeploymentMomentum: integer("funding_deployment_momentum"),
    likelyDataHardwareIntensity: integer("likely_data_hardware_intensity"),
    estimatedTimeHorizon: integer("estimated_time_horizon"),
    strategicRelevance: integer("strategic_relevance"),
    momentumIndependentEntityCount: integer(
      "momentum_independent_entity_count",
    ),
    momentumPrimarySourceCount: integer("momentum_primary_source_count"),
    momentumSourceFamilyCount: integer("momentum_source_family_count"),
    momentumVolume7Days: integer("momentum_volume_7_days"),
    momentumVolume30Days: integer("momentum_volume_30_days"),
    momentumVolume90Days: integer("momentum_volume_90_days"),
    momentumIndependentEntityBreadth: integer(
      "momentum_independent_entity_breadth",
    ),
    momentumPrimarySourceDepth: integer("momentum_primary_source_depth"),
    momentumSourceDiversity: integer("momentum_source_diversity"),
    momentumWeightedVolume: integer("momentum_weighted_volume"),
    momentumGrowthVsPreviousPeriod: integer(
      "momentum_growth_vs_previous_period",
    ),
    momentumTaxonomyConsistency: integer("momentum_taxonomy_consistency"),
    momentumEvidenceQuality: integer("momentum_evidence_quality"),
    directDemandScore: integer("direct_demand_score"),
    precursorScore: integer("precursor_score"),
    momentumScore: integer("momentum_score"),
    scoreCoverage: integer("score_coverage").notNull(),
    scorePolicyVersion: text("score_policy_version").notNull(),
    momentumPolicyVersion: text("momentum_policy_version"),
    momentumQualificationGatesPassed: boolean(
      "momentum_qualification_gates_passed",
    ),
    announcedAt: timestamp("announced_at", { withTimezone: true }),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    evergreen: boolean("evergreen"),
    reobserveBy: timestamp("reobserve_by", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    status: globalRadarSignalStatusEnum("status")
      .default("newly_discovered")
      .notNull(),
    responsePathType: globalRadarResponsePathTypeEnum("response_path_type"),
    responsePathUrl: text("response_path_url"),
    responseBusinessEmail: text("response_business_email"),
    partnerApplicationUrl: text("partner_application_url"),
    sourceLanguage: text("source_language").notNull(),
    extractionMethod: text("extraction_method").notNull(),
    taxonomyVersion: text("taxonomy_version").notNull(),
    systemsContextStackType: text("systems_context_stack_type"),
    higherLevelSystemGoal: text("higher_level_system_goal"),
    relevantStackLayer: text("relevant_stack_layer"),
    lowerLevelInputsRequired: text("lower_level_inputs_required").array(),
    transformationOrCapabilityAdded: text(
      "transformation_or_capability_added",
    ),
    downstreamModelOrRobotBehavior: text(
      "downstream_model_or_robot_behavior",
    ),
    whyTheRequirementMatters: text("why_the_requirement_matters"),
    possibleIndianExecutionRole: text("possible_indian_execution_role"),
    factualElements: text("factual_elements").array(),
    inferredElements: text("inferred_elements").array(),
    faces: globalRadarSensitiveDataFlagStateEnum("faces"),
    voices: globalRadarSensitiveDataFlagStateEnum("voices"),
    biometrics: globalRadarSensitiveDataFlagStateEnum("biometrics"),
    gaze: globalRadarSensitiveDataFlagStateEnum("gaze"),
    health: globalRadarSensitiveDataFlagStateEnum("health"),
    children: globalRadarSensitiveDataFlagStateEnum("children"),
    homeInteriors: globalRadarSensitiveDataFlagStateEnum("home_interiors"),
    workplaceMonitoring: globalRadarSensitiveDataFlagStateEnum(
      "workplace_monitoring",
    ),
    preciseLocation: globalRadarSensitiveDataFlagStateEnum("precise_location"),
    roadUsers: globalRadarSensitiveDataFlagStateEnum("road_users"),
    employeeData: globalRadarSensitiveDataFlagStateEnum("employee_data"),
    industrialSecrets: globalRadarSensitiveDataFlagStateEnum(
      "industrial_secrets",
    ),
    defenceOrDualUse: globalRadarSensitiveDataFlagStateEnum(
      "defence_or_dual_use",
    ),
    copyrightedMaterial: globalRadarSensitiveDataFlagStateEnum(
      "copyrighted_material",
    ),
    exportControls: globalRadarSensitiveDataFlagStateEnum("export_controls"),
    consent: boolean("consent"),
    deIdentification: boolean("de_identification"),
    legalReview: boolean("legal_review"),
    knownResidencyRequirements: boolean("known_residency_requirements"),
    participantRightsComplexity: boolean("participant_rights_complexity"),
    rawMetadata: jsonb("raw_metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    dedupeVersion: text("dedupe_version").notNull(),
    revision: integer("revision").default(0).notNull(),
    firstRunId: uuid("first_run_id").notNull(),
    mostRecentRunId: uuid("most_recent_run_id").notNull(),
    mergedIntoSignalId: uuid("merged_into_signal_id"),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: radarCreatedAt(),
    updatedAt: radarUpdatedAt(),
  },
  (table) => [
    uniqueIndex("global_radar_signals_active_dedupe_unique")
      .on(table.dedupeVersion, table.dedupeKey)
      .where(sql`${table.mergedIntoSignalId} IS NULL`),
    index("global_radar_signals_entity_idx").on(table.globalEntityId),
    index("global_radar_signals_class_status_idx").on(
      table.signalClass,
      table.status,
      table.observedAt,
    ),
    index("global_radar_signals_source_country_idx").on(table.sourceCountry),
    index("global_radar_signals_india_relevance_idx").on(
      table.indiaRelevanceType,
    ),
    index("global_radar_signals_demand_domain_idx").on(table.demandDomain),
    index("global_radar_signals_theme_idx").on(table.theme),
    index("global_radar_signals_observed_at_idx").on(table.observedAt),
    index("global_radar_signals_direct_expiry_idx")
      .on(table.expiresAt)
      .where(sql`${table.signalClass} = 'direct_demand'`),
    index("global_radar_signals_direct_reobserve_idx")
      .on(table.reobserveBy)
      .where(sql`${table.signalClass} = 'direct_demand'`),
    index("global_radar_signals_target_capabilities_idx").using(
      "gin",
      table.targetCapabilityTags,
    ),
    index("global_radar_signals_direct_score_idx")
      .on(table.directDemandScore)
      .where(sql`${table.signalClass} = 'direct_demand'`),
    index("global_radar_signals_precursor_score_idx")
      .on(table.precursorScore)
      .where(sql`${table.signalClass} = 'demand_precursor'`),
    index("global_radar_signals_momentum_score_idx")
      .on(table.momentumScore)
      .where(sql`${table.signalClass} = 'ecosystem_momentum'`),
    index("global_radar_signals_first_run_idx").on(table.firstRunId),
    index("global_radar_signals_most_recent_run_idx").on(
      table.mostRecentRunId,
    ),
    index("global_radar_signals_merged_into_idx").on(table.mergedIntoSignalId),
    foreignKey({
      name: "global_radar_signals_entity_fk",
      columns: [table.globalEntityId],
      foreignColumns: [globalEntities.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_radar_signals_first_run_fk",
      columns: [table.firstRunId],
      foreignColumns: [globalRadarRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_radar_signals_most_recent_run_fk",
      columns: [table.mostRecentRunId],
      foreignColumns: [globalRadarRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_radar_signals_merged_into_fk",
      columns: [table.mergedIntoSignalId],
      foreignColumns: [table.id],
    }).onDelete("restrict"),
    check(
      "global_radar_signals_text_check",
      sql`length(btrim(${table.demandDomain})) BETWEEN 1 AND 200
        AND length(btrim(${table.signalType})) BETWEEN 1 AND 200
        AND length(btrim(${table.title})) BETWEEN 1 AND 300
        AND length(btrim(${table.factualSummary})) BETWEEN 1 AND 2000
        AND length(btrim(${table.interpretationSummary})) BETWEEN 1 AND 2000
        AND length(btrim(${table.theme})) BETWEEN 1 AND 200
        AND length(btrim(${table.sourceCountry})) BETWEEN 1 AND 100
        AND length(btrim(${table.industry})) BETWEEN 1 AND 200
        AND length(btrim(${table.indiaRelevanceRationale})) BETWEEN 1 AND 2000
        AND length(btrim(${table.sourceLanguage})) BETWEEN 1 AND 35
        AND length(btrim(${table.extractionMethod})) BETWEEN 1 AND 200
        AND ${table.dedupeKey} ~ '^[a-f0-9]{64}$'
        AND ${table.dedupeVersion} ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'
        AND ${table.scorePolicyVersion} ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'
        AND ${table.taxonomyVersion} ~ '^[a-z0-9][a-z0-9._:-]{0,199}$'
        AND (${table.momentumPolicyVersion} IS NULL OR ${table.momentumPolicyVersion} ~ '^[a-z0-9][a-z0-9._:-]{0,199}$')
        AND (${table.responsePathUrl} IS NULL OR length(btrim(${table.responsePathUrl})) BETWEEN 1 AND 2048)
        AND (${table.responseBusinessEmail} IS NULL OR length(btrim(${table.responseBusinessEmail})) BETWEEN 3 AND 254)
        AND (${table.partnerApplicationUrl} IS NULL OR length(btrim(${table.partnerApplicationUrl})) BETWEEN 1 AND 2048)`,
    ),
    check(
      "global_radar_signals_scores_check",
      sql`${table.indiaFitConfidence} BETWEEN 0 AND 100
        AND ${table.scoreCoverage} BETWEEN 0 AND 100
        AND (${table.demandExplicitness} IS NULL OR ${table.demandExplicitness} BETWEEN 0 AND 100)
        AND (${table.evidenceConfidence} IS NULL OR ${table.evidenceConfidence} BETWEEN 0 AND 100)
        AND (${table.freshness} IS NULL OR ${table.freshness} BETWEEN 0 AND 100)
        AND (${table.actionability} IS NULL OR ${table.actionability} BETWEEN 0 AND 100)
        AND (${table.indiaFit} IS NULL OR ${table.indiaFit} BETWEEN 0 AND 100)
        AND (${table.commercialPotential} IS NULL OR ${table.commercialPotential} BETWEEN 0 AND 100)
        AND (${table.repeatability} IS NULL OR ${table.repeatability} BETWEEN 0 AND 100)
        AND (${table.responseAccessibility} IS NULL OR ${table.responseAccessibility} BETWEEN 0 AND 100)
        AND (${table.strategicLearning} IS NULL OR ${table.strategicLearning} BETWEEN 0 AND 100)
        AND (${table.complianceComplexity} IS NULL OR ${table.complianceComplexity} BETWEEN 0 AND 100)
        AND (${table.proximityToExternalDemand} IS NULL OR ${table.proximityToExternalDemand} BETWEEN 0 AND 100)
        AND (${table.fundingDeploymentMomentum} IS NULL OR ${table.fundingDeploymentMomentum} BETWEEN 0 AND 100)
        AND (${table.likelyDataHardwareIntensity} IS NULL OR ${table.likelyDataHardwareIntensity} BETWEEN 0 AND 100)
        AND (${table.estimatedTimeHorizon} IS NULL OR ${table.estimatedTimeHorizon} BETWEEN 0 AND 100)
        AND (${table.strategicRelevance} IS NULL OR ${table.strategicRelevance} BETWEEN 0 AND 100)
        AND (${table.momentumIndependentEntityBreadth} IS NULL OR ${table.momentumIndependentEntityBreadth} BETWEEN 0 AND 100)
        AND (${table.momentumPrimarySourceDepth} IS NULL OR ${table.momentumPrimarySourceDepth} BETWEEN 0 AND 100)
        AND (${table.momentumSourceDiversity} IS NULL OR ${table.momentumSourceDiversity} BETWEEN 0 AND 100)
        AND (${table.momentumWeightedVolume} IS NULL OR ${table.momentumWeightedVolume} BETWEEN 0 AND 100)
        AND (${table.momentumGrowthVsPreviousPeriod} IS NULL OR ${table.momentumGrowthVsPreviousPeriod} BETWEEN 0 AND 100)
        AND (${table.momentumTaxonomyConsistency} IS NULL OR ${table.momentumTaxonomyConsistency} BETWEEN 0 AND 100)
        AND (${table.momentumEvidenceQuality} IS NULL OR ${table.momentumEvidenceQuality} BETWEEN 0 AND 100)
        AND (${table.directDemandScore} IS NULL OR ${table.directDemandScore} BETWEEN 0 AND 100)
        AND (${table.precursorScore} IS NULL OR ${table.precursorScore} BETWEEN 0 AND 100)
        AND (${table.momentumScore} IS NULL OR ${table.momentumScore} BETWEEN 0 AND 100)
        AND (${table.momentumIndependentEntityCount} IS NULL OR ${table.momentumIndependentEntityCount} >= 0)
        AND (${table.momentumPrimarySourceCount} IS NULL OR ${table.momentumPrimarySourceCount} >= 0)
        AND (${table.momentumSourceFamilyCount} IS NULL OR ${table.momentumSourceFamilyCount} >= 0)
        AND (${table.momentumVolume7Days} IS NULL OR ${table.momentumVolume7Days} >= 0)
        AND (${table.momentumVolume30Days} IS NULL OR ${table.momentumVolume30Days} >= 0)
        AND (${table.momentumVolume90Days} IS NULL OR ${table.momentumVolume90Days} >= 0)`,
    ),
    check(
      "global_radar_signals_class_matrix_check",
      sql`(
        ${table.signalClass} = 'direct_demand'
        AND ${table.globalEntityId} IS NOT NULL
        AND ${table.precursorScore} IS NULL
        AND ${table.momentumScore} IS NULL
        AND ${table.proximityToExternalDemand} IS NULL
        AND ${table.fundingDeploymentMomentum} IS NULL
        AND ${table.likelyDataHardwareIntensity} IS NULL
        AND ${table.estimatedTimeHorizon} IS NULL
        AND ${table.strategicRelevance} IS NULL
        AND ${table.momentumIndependentEntityCount} IS NULL
        AND ${table.momentumPrimarySourceCount} IS NULL
        AND ${table.momentumSourceFamilyCount} IS NULL
        AND ${table.momentumVolume7Days} IS NULL
        AND ${table.momentumVolume30Days} IS NULL
        AND ${table.momentumVolume90Days} IS NULL
        AND ${table.momentumIndependentEntityBreadth} IS NULL
        AND ${table.momentumPrimarySourceDepth} IS NULL
        AND ${table.momentumSourceDiversity} IS NULL
        AND ${table.momentumWeightedVolume} IS NULL
        AND ${table.momentumGrowthVsPreviousPeriod} IS NULL
        AND ${table.momentumTaxonomyConsistency} IS NULL
        AND ${table.momentumEvidenceQuality} IS NULL
        AND ${table.momentumPolicyVersion} IS NULL
        AND ${table.momentumQualificationGatesPassed} IS NULL
      ) OR (
        ${table.signalClass} = 'demand_precursor'
        AND ${table.globalEntityId} IS NOT NULL
        AND ${table.directDemandScore} IS NULL
        AND ${table.momentumScore} IS NULL
        AND ${table.demandExplicitness} IS NULL
        AND ${table.freshness} IS NULL
        AND ${table.actionability} IS NULL
        AND ${table.commercialPotential} IS NULL
        AND ${table.repeatability} IS NULL
        AND ${table.responseAccessibility} IS NULL
        AND ${table.strategicLearning} IS NULL
        AND ${table.complianceComplexity} IS NULL
        AND ${table.momentumIndependentEntityCount} IS NULL
        AND ${table.momentumPrimarySourceCount} IS NULL
        AND ${table.momentumSourceFamilyCount} IS NULL
        AND ${table.momentumVolume7Days} IS NULL
        AND ${table.momentumVolume30Days} IS NULL
        AND ${table.momentumVolume90Days} IS NULL
        AND ${table.momentumIndependentEntityBreadth} IS NULL
        AND ${table.momentumPrimarySourceDepth} IS NULL
        AND ${table.momentumSourceDiversity} IS NULL
        AND ${table.momentumWeightedVolume} IS NULL
        AND ${table.momentumGrowthVsPreviousPeriod} IS NULL
        AND ${table.momentumTaxonomyConsistency} IS NULL
        AND ${table.momentumEvidenceQuality} IS NULL
        AND ${table.momentumPolicyVersion} IS NULL
        AND ${table.momentumQualificationGatesPassed} IS NULL
      ) OR (
        ${table.signalClass} = 'ecosystem_momentum'
        AND ${table.directDemandScore} IS NULL
        AND ${table.precursorScore} IS NULL
        AND ${table.demandExplicitness} IS NULL
        AND ${table.evidenceConfidence} IS NULL
        AND ${table.freshness} IS NULL
        AND ${table.actionability} IS NULL
        AND ${table.indiaFit} IS NULL
        AND ${table.commercialPotential} IS NULL
        AND ${table.repeatability} IS NULL
        AND ${table.responseAccessibility} IS NULL
        AND ${table.strategicLearning} IS NULL
        AND ${table.complianceComplexity} IS NULL
        AND ${table.proximityToExternalDemand} IS NULL
        AND ${table.fundingDeploymentMomentum} IS NULL
        AND ${table.likelyDataHardwareIntensity} IS NULL
        AND ${table.estimatedTimeHorizon} IS NULL
        AND ${table.strategicRelevance} IS NULL
        AND ${table.momentumIndependentEntityCount} IS NOT NULL
        AND ${table.momentumPrimarySourceCount} IS NOT NULL
        AND ${table.momentumSourceFamilyCount} IS NOT NULL
        AND ${table.momentumVolume7Days} IS NOT NULL
        AND ${table.momentumVolume30Days} IS NOT NULL
        AND ${table.momentumVolume90Days} IS NOT NULL
        AND ${table.momentumIndependentEntityBreadth} IS NOT NULL
        AND ${table.momentumPrimarySourceDepth} IS NOT NULL
        AND ${table.momentumSourceDiversity} IS NOT NULL
        AND ${table.momentumWeightedVolume} IS NOT NULL
        AND ${table.momentumGrowthVsPreviousPeriod} IS NOT NULL
        AND ${table.momentumTaxonomyConsistency} IS NOT NULL
        AND ${table.momentumEvidenceQuality} IS NOT NULL
        AND ${table.momentumScore} IS NOT NULL
        AND ${table.scoreCoverage} = 100
        AND ${table.momentumPolicyVersion} IS NOT NULL
        AND ${table.momentumQualificationGatesPassed} IS NOT NULL
      )`,
    ),
    check(
      "global_radar_signals_activity_check",
      sql`(
        ${table.signalClass} = 'direct_demand'
        AND ${table.evergreen} IS NOT NULL
        AND (
          (${table.evergreen} = true AND ${table.reobserveBy} IS NOT NULL)
          OR (${table.evergreen} = false AND ${table.reobserveBy} IS NULL)
        )
      ) OR (
        ${table.signalClass} <> 'direct_demand'
        AND ${table.evergreen} IS NULL
        AND ${table.reobserveBy} IS NULL
      )`,
    ),
    check(
      "global_radar_signals_response_path_check",
      sql`(
        ${table.responsePathType} IS NULL
        AND ${table.responsePathUrl} IS NULL
        AND ${table.responseBusinessEmail} IS NULL
      ) OR (
        ${table.responsePathType} = 'official_business_email'
        AND ${table.responsePathUrl} IS NULL
        AND ${table.responseBusinessEmail} IS NOT NULL
      ) OR (
        ${table.responsePathType} IS NOT NULL
        AND ${table.responsePathType} <> 'official_business_email'
        AND ${table.responsePathUrl} IS NOT NULL
        AND ${table.responseBusinessEmail} IS NULL
      )`,
    ),
    check(
      "global_radar_signals_systems_context_check",
      sql`(
        ${table.systemsContextSummary} IS NULL
        AND ${table.systemsContextStackType} IS NULL
        AND ${table.higherLevelSystemGoal} IS NULL
        AND ${table.relevantStackLayer} IS NULL
        AND ${table.lowerLevelInputsRequired} IS NULL
        AND ${table.transformationOrCapabilityAdded} IS NULL
        AND ${table.downstreamModelOrRobotBehavior} IS NULL
        AND ${table.whyTheRequirementMatters} IS NULL
        AND ${table.possibleIndianExecutionRole} IS NULL
        AND ${table.factualElements} IS NULL
        AND ${table.inferredElements} IS NULL
      ) OR (
        ${table.systemsContextSummary} IS NOT NULL
        AND length(btrim(${table.systemsContextSummary})) > 0
        AND ${table.systemsContextStackType} IS NOT NULL
        AND ${table.systemsContextStackType} IN ('hardware', 'physical_data')
        AND ${table.higherLevelSystemGoal} IS NOT NULL
        AND length(btrim(${table.higherLevelSystemGoal})) > 0
        AND ${table.relevantStackLayer} IS NOT NULL
        AND length(btrim(${table.relevantStackLayer})) > 0
        AND ${table.lowerLevelInputsRequired} IS NOT NULL
        AND ${table.transformationOrCapabilityAdded} IS NOT NULL
        AND length(btrim(${table.transformationOrCapabilityAdded})) > 0
        AND ${table.downstreamModelOrRobotBehavior} IS NOT NULL
        AND length(btrim(${table.downstreamModelOrRobotBehavior})) > 0
        AND ${table.whyTheRequirementMatters} IS NOT NULL
        AND length(btrim(${table.whyTheRequirementMatters})) > 0
        AND ${table.possibleIndianExecutionRole} IS NOT NULL
        AND length(btrim(${table.possibleIndianExecutionRole})) > 0
        AND ${table.factualElements} IS NOT NULL
        AND cardinality(${table.factualElements}) > 0
        AND ${table.inferredElements} IS NOT NULL
      )`,
    ),
    check("global_radar_signals_revision_check", sql`${table.revision} >= 0`),
    check(
      "global_radar_signals_no_self_merge_check",
      sql`${table.mergedIntoSignalId} IS NULL OR ${table.mergedIntoSignalId} <> ${table.id}`,
    ),
    check(
      "global_radar_signals_seen_order_check",
      sql`${table.firstSeenAt} <= ${table.lastSeenAt}
        AND (${table.announcedAt} IS NULL OR ${table.expiresAt} IS NULL OR ${table.announcedAt} <= ${table.expiresAt})
        AND (${table.effectiveFrom} IS NULL OR ${table.expiresAt} IS NULL OR ${table.effectiveFrom} <= ${table.expiresAt})`,
    ),
  ],
);

export const globalRadarSignalEntities = pgTable(
  "global_radar_signal_entities",
  {
    id: radarId(),
    signalId: uuid("signal_id").notNull(),
    globalEntityId: uuid("global_entity_id").notNull(),
    role: globalRadarSignalEntityRoleEnum("role").notNull(),
    confidence: integer("confidence").notNull(),
    createdAt: radarCreatedAt(),
  },
  (table) => [
    unique("global_radar_signal_entities_identity_unique").on(
      table.signalId,
      table.globalEntityId,
      table.role,
    ),
    index("global_radar_signal_entities_entity_role_idx").on(
      table.globalEntityId,
      table.role,
    ),
    foreignKey({
      name: "global_radar_signal_entities_signal_fk",
      columns: [table.signalId],
      foreignColumns: [globalRadarSignals.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "global_radar_signal_entities_entity_fk",
      columns: [table.globalEntityId],
      foreignColumns: [globalEntities.id],
    }).onDelete("restrict"),
    check(
      "global_radar_signal_entities_confidence_check",
      sql`${table.confidence} BETWEEN 0 AND 100`,
    ),
  ],
);

export const globalSignalRequirements = pgTable(
  "global_signal_requirements",
  {
    id: radarId(),
    signalId: uuid("signal_id").notNull(),
    kind: globalRadarRequirementKindEnum("kind").notNull(),
    capabilityTag: text("capability_tag").notNull(),
    summary: text("summary").notNull(),
    dataFamilies: text("data_families").array(),
    sensorModalities: text("sensor_modalities").array(),
    environments: text("environments").array(),
    taskFamilies: text("task_families").array(),
    collectionMethods: text("collection_methods").array(),
    humanRoles: text("human_roles").array(),
    robotEmbodiments: text("robot_embodiments").array(),
    indianExecutionArchetypes: text("indian_execution_archetypes").array(),
    scaleSpecification: jsonb("scale_specification").$type<
      Record<string, unknown>
    >(),
    technicalSpecification: jsonb("technical_specification").$type<
      Record<string, unknown>
    >(),
    qualitySpecification: jsonb("quality_specification").$type<
      Record<string, unknown>
    >(),
    rightsAndComplianceSpecification: jsonb(
      "rights_and_compliance_specification",
    ).$type<Record<string, unknown>>(),
    confidence: integer("confidence").notNull(),
    requirementFingerprint: text("requirement_fingerprint").notNull(),
    createdAt: radarCreatedAt(),
    updatedAt: radarUpdatedAt(),
  },
  (table) => [
    unique("global_signal_requirements_signal_fingerprint_unique").on(
      table.signalId,
      table.requirementFingerprint,
    ),
    index("global_signal_requirements_signal_idx").on(table.signalId),
    index("global_signal_requirements_kind_idx").on(table.kind),
    index("global_signal_requirements_capability_idx").on(table.capabilityTag),
    index("global_signal_requirements_data_families_idx").using(
      "gin",
      table.dataFamilies,
    ),
    index("global_signal_requirements_sensor_modalities_idx").using(
      "gin",
      table.sensorModalities,
    ),
    index("global_signal_requirements_indian_archetypes_idx").using(
      "gin",
      table.indianExecutionArchetypes,
    ),
    foreignKey({
      name: "global_signal_requirements_signal_fk",
      columns: [table.signalId],
      foreignColumns: [globalRadarSignals.id],
    }).onDelete("cascade"),
    check(
      "global_signal_requirements_text_check",
      sql`length(btrim(${table.capabilityTag})) BETWEEN 1 AND 200
        AND length(btrim(${table.summary})) BETWEEN 1 AND 1000
        AND ${table.requirementFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "global_signal_requirements_bounds_check",
      sql`${table.confidence} BETWEEN 0 AND 100
        AND (${table.dataFamilies} IS NULL OR cardinality(${table.dataFamilies}) <= 50)
        AND (${table.sensorModalities} IS NULL OR cardinality(${table.sensorModalities}) <= 50)
        AND (${table.environments} IS NULL OR cardinality(${table.environments}) <= 50)
        AND (${table.taskFamilies} IS NULL OR cardinality(${table.taskFamilies}) <= 50)
        AND (${table.collectionMethods} IS NULL OR cardinality(${table.collectionMethods}) <= 50)
        AND (${table.humanRoles} IS NULL OR cardinality(${table.humanRoles}) <= 50)
        AND (${table.robotEmbodiments} IS NULL OR cardinality(${table.robotEmbodiments}) <= 50)
        AND (${table.indianExecutionArchetypes} IS NULL OR cardinality(${table.indianExecutionArchetypes}) <= 50)`,
    ),
  ],
);

export const globalSignalEvidence = pgTable(
  "global_signal_evidence",
  {
    id: radarId(),
    signalId: uuid("signal_id").notNull(),
    runId: uuid("run_id"),
    globalEntityId: uuid("global_entity_id"),
    sourceUrl: text("source_url").notNull(),
    canonicalSourceUrl: text("canonical_source_url").notNull(),
    sourceName: text("source_name").notNull(),
    sourceType: text("source_type").notNull(),
    sourceLanguage: text("source_language").notNull(),
    sourceCountry: text("source_country").notNull(),
    sourceFamily: text("source_family").notNull(),
    evidenceClaim: text("evidence_claim").notNull(),
    sourceExcerpt: text("source_excerpt"),
    englishSummary: text("english_summary").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    evidenceConfidence: integer("evidence_confidence").notNull(),
    translationConfidence: integer("translation_confidence"),
    isPrimarySource: boolean("is_primary_source").notNull(),
    isSyndicated: boolean("is_syndicated").notNull(),
    supportsDirectDemand: boolean("supports_direct_demand").notNull(),
    supportsIndiaRelevance: boolean("supports_india_relevance").notNull(),
    rawMetadata: jsonb("raw_metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    evidenceFingerprint: text("evidence_fingerprint").notNull(),
    supportedFieldPaths: text("supported_field_paths").array().notNull(),
    createdAt: radarCreatedAt(),
  },
  (table) => [
    unique("global_signal_evidence_signal_fingerprint_unique").on(
      table.signalId,
      table.evidenceFingerprint,
    ),
    index("global_signal_evidence_signal_idx").on(table.signalId),
    index("global_signal_evidence_run_idx").on(table.runId),
    index("global_signal_evidence_contributor_idx").on(table.globalEntityId),
    index("global_signal_evidence_canonical_url_idx").on(
      table.canonicalSourceUrl,
    ),
    index("global_signal_evidence_source_family_idx").on(table.sourceFamily),
    foreignKey({
      name: "global_signal_evidence_signal_fk",
      columns: [table.signalId],
      foreignColumns: [globalRadarSignals.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "global_signal_evidence_run_fk",
      columns: [table.runId],
      foreignColumns: [globalRadarRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_signal_evidence_entity_fk",
      columns: [table.globalEntityId],
      foreignColumns: [globalEntities.id],
    }).onDelete("restrict"),
    check(
      "global_signal_evidence_text_check",
      sql`length(btrim(${table.sourceUrl})) BETWEEN 1 AND 2048
        AND length(btrim(${table.canonicalSourceUrl})) BETWEEN 1 AND 2048
        AND length(btrim(${table.sourceName})) BETWEEN 1 AND 200
        AND length(btrim(${table.sourceType})) BETWEEN 1 AND 100
        AND length(btrim(${table.sourceLanguage})) BETWEEN 1 AND 35
        AND length(btrim(${table.sourceCountry})) BETWEEN 1 AND 100
        AND length(btrim(${table.sourceFamily})) BETWEEN 1 AND 200
        AND length(btrim(${table.evidenceClaim})) BETWEEN 1 AND 1000
        AND (${table.sourceExcerpt} IS NULL OR length(btrim(${table.sourceExcerpt})) BETWEEN 1 AND 500)
        AND length(btrim(${table.englishSummary})) BETWEEN 1 AND 2000
        AND ${table.evidenceFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      "global_signal_evidence_confidence_check",
      sql`${table.evidenceConfidence} BETWEEN 0 AND 100
        AND (${table.translationConfidence} IS NULL OR ${table.translationConfidence} BETWEEN 0 AND 100)`,
    ),
    check(
      "global_signal_evidence_paths_check",
      sql`cardinality(${table.supportedFieldPaths}) BETWEEN 1 AND 50
        AND length(array_to_string(${table.supportedFieldPaths}, E'\\n')) <= 10000
        AND array_to_string(${table.supportedFieldPaths}, E'\\n')
          !~ '(^|\\n)[[:space:]]*($|\\n)'`,
    ),
    check(
      "global_signal_evidence_dates_check",
      sql`${table.publishedAt} IS NULL OR ${table.publishedAt} <= ${table.observedAt}`,
    ),
  ],
);

export const globalSignalUpdates = pgTable(
  "global_signal_updates",
  {
    id: radarId(),
    signalId: uuid("signal_id").notNull(),
    updateType: globalRadarUpdateTypeEnum("update_type").notNull(),
    previousSafeState: jsonb("previous_safe_state").$type<
      Record<string, unknown>
    >(),
    newSafeState: jsonb("new_safe_state").$type<Record<string, unknown>>(),
    evidenceId: uuid("evidence_id"),
    actorType: globalRadarActorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email"),
    reason: text("reason").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: radarCreatedAt(),
  },
  (table) => [
    unique("global_signal_updates_signal_idempotency_unique").on(
      table.signalId,
      table.idempotencyKey,
    ),
    index("global_signal_updates_signal_observed_idx").on(
      table.signalId,
      table.observedAt,
    ),
    index("global_signal_updates_signal_created_idx").on(
      table.signalId,
      table.createdAt,
    ),
    index("global_signal_updates_type_idx").on(table.updateType),
    foreignKey({
      name: "global_signal_updates_signal_fk",
      columns: [table.signalId],
      foreignColumns: [globalRadarSignals.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_signal_updates_evidence_fk",
      columns: [table.evidenceId],
      foreignColumns: [globalSignalEvidence.id],
    }).onDelete("restrict"),
    check(
      "global_signal_updates_actor_check",
      sql`(
        ${table.actorType} = 'administrator'
        AND ${table.actorEmail} IS NOT NULL
      ) OR (
        ${table.actorType} <> 'administrator'
        AND ${table.actorEmail} IS NULL
      )`,
    ),
    check(
      "global_signal_updates_text_check",
      sql`length(btrim(${table.reason})) BETWEEN 1 AND 2000
        AND length(btrim(${table.actorId})) BETWEEN 1 AND 200
        AND length(btrim(${table.idempotencyKey})) BETWEEN 1 AND 500
        AND (${table.actorEmail} IS NULL OR length(btrim(${table.actorEmail})) BETWEEN 3 AND 254)`,
    ),
  ],
);

export const globalRadarWatchlistEntries = pgTable(
  "global_radar_watchlist_entries",
  {
    id: radarId(),
    globalEntityId: uuid("global_entity_id")
      .notNull()
      .unique("global_radar_watchlist_entity_unique"),
    state: globalRadarWatchlistStateEnum("state").default("enabled").notNull(),
    priority: integer("priority").default(0).notNull(),
    theme: text("theme").notNull(),
    category: text("category").notNull(),
    categorySearchTermEn: text("category_search_term_en").notNull(),
    categorySearchTermZhCn: text("category_search_term_zh_cn"),
    countries: text("countries").array().notNull(),
    languages: text("languages").array().notNull(),
    cadenceDays: integer("cadence_days").notNull(),
    nextScanAt: timestamp("next_scan_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    createdByUserId: uuid("created_by_user_id").notNull(),
    createdByEmail: text("created_by_email").notNull(),
    revision: integer("revision").default(0).notNull(),
    createdAt: radarCreatedAt(),
    updatedAt: radarUpdatedAt(),
  },
  (table) => [
    index("global_radar_watchlist_state_next_scan_idx").on(
      table.state,
      table.nextScanAt,
      table.priority,
    ),
    index("global_radar_watchlist_priority_idx").on(table.priority),
    index("global_radar_watchlist_theme_idx").on(table.theme),
    index("global_radar_watchlist_category_idx").on(table.category),
    index("global_radar_watchlist_countries_idx").using(
      "gin",
      table.countries,
    ),
    index("global_radar_watchlist_languages_idx").using(
      "gin",
      table.languages,
    ),
    foreignKey({
      name: "global_radar_watchlist_entity_fk",
      columns: [table.globalEntityId],
      foreignColumns: [globalEntities.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_radar_watchlist_creator_fk",
      columns: [table.createdByUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    check(
      "global_radar_watchlist_text_check",
      sql`length(btrim(${table.theme})) BETWEEN 1 AND 200
        AND length(btrim(${table.category})) BETWEEN 1 AND 200
        AND length(btrim(${table.categorySearchTermEn})) BETWEEN 1 AND 500
        AND (${table.categorySearchTermZhCn} IS NULL OR length(btrim(${table.categorySearchTermZhCn})) BETWEEN 1 AND 500)
        AND length(btrim(${table.reason})) BETWEEN 1 AND 2000
        AND length(btrim(${table.createdByEmail})) BETWEEN 3 AND 254`,
    ),
    check(
      "global_radar_watchlist_bounds_check",
      sql`${table.priority} BETWEEN 0 AND 100
        AND ${table.cadenceDays} > 0 AND ${table.cadenceDays} <= 365
        AND cardinality(${table.countries}) BETWEEN 1 AND 50
        AND cardinality(${table.languages}) BETWEEN 1 AND 50
        AND ${table.revision} >= 0`,
    ),
    check(
      "global_radar_watchlist_lifecycle_check",
      sql`${table.state} <> 'enabled' OR ${table.nextScanAt} IS NOT NULL`,
    ),
  ],
);

export const globalRadarPromotions = pgTable(
  "global_radar_promotions",
  {
    id: radarId(),
    idempotencyKey: text("idempotency_key")
      .notNull()
      .unique("global_radar_promotions_idempotency_key_unique"),
    requestHash: text("request_hash").notNull(),
    globalEntityId: uuid("global_entity_id").notNull(),
    primarySignalId: uuid("primary_signal_id").notNull(),
    supportingSignalIds: uuid("supporting_signal_ids").array().notNull(),
    eligibilityPath: globalRadarPromotionEligibilityPathEnum(
      "eligibility_path",
    ).notNull(),
    expectedEntityRevision: integer("expected_entity_revision").notNull(),
    expectedPrimarySignalRevision: integer(
      "expected_primary_signal_revision",
    ).notNull(),
    expectedSupportingSignalRevisions: jsonb(
      "expected_supporting_signal_revisions",
    )
      .$type<Record<string, number>>()
      .notNull(),
    promotedEntityRevision: integer("promoted_entity_revision"),
    promotedPrimarySignalRevision: integer("promoted_primary_signal_revision"),
    previousEntityStatus: globalEntityStatusEnum(
      "previous_entity_status",
    ).notNull(),
    previousPrimarySignalStatus: globalRadarSignalStatusEnum(
      "previous_primary_signal_status",
    ).notNull(),
    entitySnapshot: jsonb("entity_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    primarySignalSnapshot: jsonb("primary_signal_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    supportingSignalsSnapshot: jsonb("supporting_signals_snapshot")
      .$type<readonly Record<string, unknown>[]>()
      .notNull(),
    discoveryRunId: uuid("discovery_run_id"),
    discoveryCandidateId: uuid("discovery_candidate_id"),
    actorUserId: uuid("actor_user_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    reason: text("reason").notNull(),
    sourceSnapshotDigest: text("source_snapshot_digest").notNull(),
    status: globalRadarPromotionStatusEnum("status").notNull(),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    reversalIdempotencyKey: text("reversal_idempotency_key"),
    reversalRequestHash: text("reversal_request_hash"),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    reversedByUserId: uuid("reversed_by_user_id"),
    reversedByEmail: text("reversed_by_email"),
    reversalReason: text("reversal_reason"),
    createdAt: radarCreatedAt(),
    updatedAt: radarUpdatedAt(),
  },
  (table) => [
    uniqueIndex("global_radar_promotions_one_active_entity_idx")
      .on(table.globalEntityId)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("global_radar_promotions_reversal_idempotency_unique")
      .on(table.reversalIdempotencyKey)
      .where(sql`${table.reversalIdempotencyKey} IS NOT NULL`),
    index("global_radar_promotions_primary_signal_idx").on(
      table.primarySignalId,
    ),
    index("global_radar_promotions_discovery_run_idx").on(
      table.discoveryRunId,
    ),
    index("global_radar_promotions_discovery_candidate_idx").on(
      table.discoveryCandidateId,
    ),
    index("global_radar_promotions_status_idx").on(table.status),
    index("global_radar_promotions_supporting_signals_idx").using(
      "gin",
      table.supportingSignalIds,
    ),
    foreignKey({
      name: "global_radar_promotions_entity_fk",
      columns: [table.globalEntityId],
      foreignColumns: [globalEntities.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_radar_promotions_primary_signal_fk",
      columns: [table.primarySignalId],
      foreignColumns: [globalRadarSignals.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_radar_promotions_discovery_run_fk",
      columns: [table.discoveryRunId],
      foreignColumns: [discoveryRuns.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_radar_promotions_discovery_candidate_fk",
      columns: [table.discoveryCandidateId],
      foreignColumns: [discoveryCandidates.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_radar_promotions_actor_fk",
      columns: [table.actorUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "global_radar_promotions_reversed_by_fk",
      columns: [table.reversedByUserId],
      foreignColumns: [users.id],
    }).onDelete("restrict"),
    check(
      "global_radar_promotions_text_check",
      sql`length(btrim(${table.idempotencyKey})) BETWEEN 1 AND 500
        AND ${table.requestHash} ~ '^[a-f0-9]{64}$'
        AND ${table.sourceSnapshotDigest} ~ '^[a-f0-9]{64}$'
        AND length(btrim(${table.actorEmail})) BETWEEN 3 AND 254
        AND length(btrim(${table.reason})) BETWEEN 1 AND 2000
        AND (${table.reversalIdempotencyKey} IS NULL OR length(btrim(${table.reversalIdempotencyKey})) BETWEEN 1 AND 500)
        AND (${table.reversalRequestHash} IS NULL OR ${table.reversalRequestHash} ~ '^[a-f0-9]{64}$')
        AND (${table.reversedByEmail} IS NULL OR length(btrim(${table.reversedByEmail})) BETWEEN 3 AND 254)
        AND (${table.reversalReason} IS NULL OR length(btrim(${table.reversalReason})) BETWEEN 1 AND 2000)`,
    ),
    check(
      "global_radar_promotions_revisions_check",
      sql`${table.expectedEntityRevision} >= 0
        AND ${table.expectedPrimarySignalRevision} >= 0
        AND (${table.promotedEntityRevision} IS NULL OR ${table.promotedEntityRevision} >= 0)
        AND (${table.promotedPrimarySignalRevision} IS NULL OR ${table.promotedPrimarySignalRevision} >= 0)`,
    ),
    check(
      "global_radar_promotions_supporting_signals_check",
      sql`cardinality(${table.supportingSignalIds}) BETWEEN 1 AND 100
        AND array_position(${table.supportingSignalIds}, NULL) IS NULL
        AND ${table.primarySignalId} = ANY(${table.supportingSignalIds})`,
    ),
    check(
      "global_radar_promotions_lifecycle_check",
      sql`(
        ${table.status} = 'active'
        AND ${table.promotedAt} IS NOT NULL
        AND ${table.promotedEntityRevision} IS NOT NULL
        AND ${table.promotedPrimarySignalRevision} IS NOT NULL
        AND ${table.discoveryRunId} IS NOT NULL
        AND ${table.discoveryCandidateId} IS NOT NULL
        AND ${table.reversalIdempotencyKey} IS NULL
        AND ${table.reversalRequestHash} IS NULL
        AND ${table.reversedAt} IS NULL
        AND ${table.reversedByUserId} IS NULL
        AND ${table.reversedByEmail} IS NULL
        AND ${table.reversalReason} IS NULL
      ) OR (
        ${table.status} = 'reversed'
        AND ${table.promotedAt} IS NOT NULL
        AND ${table.promotedEntityRevision} IS NOT NULL
        AND ${table.promotedPrimarySignalRevision} IS NOT NULL
        AND ${table.discoveryRunId} IS NOT NULL
        AND ${table.discoveryCandidateId} IS NOT NULL
        AND ${table.reversalIdempotencyKey} IS NOT NULL
        AND ${table.reversalRequestHash} IS NOT NULL
        AND ${table.reversedAt} IS NOT NULL
        AND ${table.reversedAt} >= ${table.promotedAt}
        AND ${table.reversedByUserId} IS NOT NULL
        AND ${table.reversedByEmail} IS NOT NULL
        AND ${table.reversalReason} IS NOT NULL
      ) OR (
        ${table.status} IN ('failed', 'conflicted')
        AND ${table.promotedAt} IS NULL
        AND ${table.promotedEntityRevision} IS NULL
        AND ${table.promotedPrimarySignalRevision} IS NULL
        AND ${table.discoveryRunId} IS NULL
        AND ${table.discoveryCandidateId} IS NULL
        AND ${table.reversalIdempotencyKey} IS NULL
        AND ${table.reversalRequestHash} IS NULL
        AND ${table.reversedAt} IS NULL
        AND ${table.reversedByUserId} IS NULL
        AND ${table.reversedByEmail} IS NULL
        AND ${table.reversalReason} IS NULL
      )`,
    ),
  ],
);

export const globalRadarAdminEvents = pgTable(
  "global_radar_admin_events",
  {
    id: radarId(),
    actorType: globalRadarActorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email"),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    beforeSafeState: jsonb("before_safe_state").$type<
      Record<string, unknown>
    >(),
    afterSafeState: jsonb("after_safe_state").$type<Record<string, unknown>>(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: radarCreatedAt(),
  },
  (table) => [
    unique("global_radar_admin_events_target_idempotency_unique").on(
      table.targetType,
      table.targetId,
      table.idempotencyKey,
    ),
    index("global_radar_admin_events_target_created_idx").on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    index("global_radar_admin_events_actor_created_idx").on(
      table.actorType,
      table.actorId,
      table.createdAt,
    ),
    check(
      "global_radar_admin_events_actor_check",
      sql`(
        ${table.actorType} = 'administrator'
        AND ${table.actorEmail} IS NOT NULL
      ) OR (
        ${table.actorType} <> 'administrator'
        AND ${table.actorEmail} IS NULL
      )`,
    ),
    check(
      "global_radar_admin_events_text_check",
      sql`length(btrim(${table.actorId})) BETWEEN 1 AND 200
        AND (${table.actorEmail} IS NULL OR length(btrim(${table.actorEmail})) BETWEEN 3 AND 254)
        AND length(btrim(${table.targetType})) BETWEEN 1 AND 100
        AND length(btrim(${table.action})) BETWEEN 1 AND 200
        AND length(btrim(${table.reason})) BETWEEN 1 AND 2000
        AND length(btrim(${table.idempotencyKey})) BETWEEN 1 AND 500`,
    ),
  ],
);
