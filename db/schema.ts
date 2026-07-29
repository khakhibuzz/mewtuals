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

import type { OpportunityBriefSourceMetadata } from "../app/domain/opportunity-brief";

export const profileStatusEnum = pgEnum("profile_status", [
  "draft",
  "pending",
  "verified",
  "waitlisted",
]);

export const identityKindEnum = pgEnum("identity_kind", [
  "organisation",
  "creator",
]);

export const organisationSubtypeEnum = pgEnum("organisation_subtype", [
  "company",
  "brand",
  "startup",
  "distribution_partner",
]);

export const creatorSubtypeEnum = pgEnum("creator_subtype", [
  "creator",
  "podcaster",
  "publication",
  "media_operator",
]);

export const availabilityEnum = pgEnum("availability", [
  "open_now",
  "open_selectively",
  "not_available",
]);

export const verificationDecisionEnum = pgEnum("verification_decision", [
  "verified",
  "waitlisted",
]);

export const introductionStateEnum = pgEnum("introduction_state", [
  "requested",
  "reviewing",
  "contacting",
  "connected",
  "closed",
]);

export const partnershipDirectionEnum = pgEnum("partnership_direction", [
  "brand_creator",
  "brand_brand",
  "creator_creator",
  "startup_distribution_partner",
]);

export const discoveryCandidateTypeEnum = pgEnum("discovery_candidate_type", [
  "company",
  "creator",
]);

export const discoveryCandidateStatusEnum = pgEnum(
  "discovery_candidate_status",
  ["discovered", "shortlisted", "rejected", "queued_for_profile"],
);

export const discoveryRunStatusEnum = pgEnum("discovery_run_status", [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
]);

export const discoveryRunTriggerEnum = pgEnum("discovery_run_trigger", [
  "scheduled",
  "manual",
  "trial",
]);

export const discoveryRunCandidateTypeEnum = pgEnum(
  "discovery_run_candidate_type",
  ["company", "creator", "both"],
);

export const discoveryIdentifierKindEnum = pgEnum(
  "discovery_identifier_kind",
  ["canonical", "website_host", "social_url", "linkedin_url"],
);

export const opportunityBriefStatusEnum = pgEnum("opportunity_brief_status", [
  "submitted",
  "researching",
  "brief_ready",
  "contacted",
  "invited_to_join",
  "converted",
  "rejected",
]);

export const opportunityBriefAcknowledgementStatusEnum = pgEnum(
  "opportunity_brief_acknowledgement_status",
  ["not_requested", "pending", "sent", "failed"],
);

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique("users_email_unique"),
  name: text("name"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const magicLinks = pgTable(
  "magic_links",
  {
    id: id(),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    requesterHash: text("requester_hash"),
    issued: boolean("issued").default(true).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("magic_links_token_hash_idx").on(table.tokenHash),
    index("magic_links_email_idx").on(table.email),
    index("magic_links_expires_at_idx").on(table.expiresAt),
    index("magic_links_requester_hash_created_at_idx").on(
      table.requesterHash,
      table.createdAt,
    ),
    index("magic_links_created_at_idx").on(table.createdAt),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const onboardingDrafts = pgTable(
  "onboarding_drafts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .unique("onboarding_drafts_user_id_unique")
      .references(() => users.id, { onDelete: "cascade" }),
    identityKind: identityKindEnum("identity_kind").notNull(),
    organisationSubtype: organisationSubtypeEnum("organisation_subtype"),
    creatorSubtype: creatorSubtypeEnum("creator_subtype"),
    websiteUrl: text("website_url"),
    linkedInUrl: text("linkedin_url"),
    socialUrl: text("social_url"),
    businessEmail: text("business_email"),
    generatedName: text("generated_name"),
    generatedOrganisationName: text("generated_organisation_name"),
    generatedDomain: text("generated_domain"),
    primaryUrl: text("primary_url"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check(
      "onboarding_drafts_identity_subtype_check",
      sql`(
        (${table.identityKind} = 'organisation' AND ${table.organisationSubtype} IS NOT NULL AND ${table.creatorSubtype} IS NULL)
        OR
        (${table.identityKind} = 'creator' AND ${table.creatorSubtype} IS NOT NULL AND ${table.organisationSubtype} IS NULL)
      )`,
    ),
  ],
);

export const profiles = pgTable(
  "profiles",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .unique("profiles_user_id_unique")
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    identityKind: identityKindEnum("identity_kind").notNull(),
    organisationName: text("organisation_name"),
    organisationSubtype: organisationSubtypeEnum("organisation_subtype"),
    creatorSubtype: creatorSubtypeEnum("creator_subtype"),
    domain: text("domain"),
    primaryUrl: text("primary_url").notNull(),
    websiteUrl: text("website_url"),
    linkedInUrl: text("linkedin_url"),
    socialUrl: text("social_url"),
    status: profileStatusEnum("status").default("draft").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("profiles_status_idx").on(table.status),
    index("profiles_domain_idx").on(table.domain),
    check(
      "profiles_identity_subtype_check",
      sql`(
        (${table.identityKind} = 'organisation' AND ${table.organisationSubtype} IS NOT NULL AND ${table.creatorSubtype} IS NULL)
        OR
        (${table.identityKind} = 'creator' AND ${table.creatorSubtype} IS NOT NULL AND ${table.organisationSubtype} IS NULL)
      )`,
    ),
  ],
);

export const verificationReviews = pgTable(
  "verification_reviews",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .unique("verification_reviews_profile_id_unique")
      .references(() => profiles.id, { onDelete: "cascade" }),
    reviewerEmail: text("reviewer_email").notNull(),
    decision: verificationDecisionEnum("decision").notNull(),
    notes: text("notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("verification_reviews_decision_idx").on(table.decision),
    index("verification_reviews_reviewer_email_idx").on(table.reviewerEmail),
  ],
);

export const signals = pgTable(
  "signals",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .unique("signals_profile_id_unique")
      .references(() => profiles.id, { onDelete: "cascade" }),
    availability: availabilityEnum("availability").default("open_now").notNull(),
    openTo: text("open_to").array().notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const opportunities = pgTable(
  "opportunities",
  {
    id: id(),
    key: text("key").notNull().unique("opportunities_key_unique"),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    direction: partnershipDirectionEnum("direction").notNull(),
    counterpartyType: text("counterparty_type").notNull(),
    reciprocalValue: text("reciprocal_value").notNull(),
    eligibleIdentityKinds: identityKindEnum("eligible_identity_kinds")
      .array()
      .notNull(),
    eligibleOrganisationSubtypes: organisationSubtypeEnum(
      "eligible_organisation_subtypes",
    )
      .array()
      .notNull(),
    eligibleCreatorSubtypes: creatorSubtypeEnum("eligible_creator_subtypes")
      .array()
      .notNull(),
    openToTags: text("open_to_tags").array().notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("opportunities_direction_idx").on(table.direction),
    index("opportunities_active_idx").on(table.active),
  ],
);

export const profileOpportunities = pgTable(
  "profile_opportunities",
  {
    id: id(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    fitSummary: text("fit_summary").notNull(),
    rank: integer("rank").notNull(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    seenAt: timestamp("seen_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    unique("profile_opportunities_profile_id_opportunity_id_unique").on(
      table.profileId,
      table.opportunityId,
    ),
    index("profile_opportunities_profile_id_idx").on(table.profileId),
    check("profile_opportunities_rank_check", sql`${table.rank} > 0`),
  ],
);

export const introductionRequests = pgTable(
  "introduction_requests",
  {
    id: id(),
    profileOpportunityId: uuid("profile_opportunity_id")
      .notNull()
      .unique("introduction_requests_profile_opportunity_id_unique")
      .references(() => profileOpportunities.id, { onDelete: "cascade" }),
    state: introductionStateEnum("state").default("requested").notNull(),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("introduction_requests_state_idx").on(table.state),
  ],
);

export const discoveryRuns = pgTable(
  "discovery_runs",
  {
    id: id(),
    externalRunKey: text("external_run_key")
      .notNull()
      .unique("discovery_runs_external_run_key_unique"),
    campaignKey: text("campaign_key").default("general_discovery").notNull(),
    trigger: discoveryRunTriggerEnum("trigger").notNull(),
    status: discoveryRunStatusEnum("status").default("queued").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    leaseTokenHash: text("lease_token_hash"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    submissionHash: text("submission_hash"),
    geography: text("geography").notNull(),
    candidateType: discoveryRunCandidateTypeEnum("candidate_type").notNull(),
    sourcesUsed: text("sources_used")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    requestedCount: integer("requested_count").notNull(),
    companyPercentage: integer("company_percentage").notNull(),
    foundCount: integer("found_count").default(0).notNull(),
    newCount: integer("new_count").default(0).notNull(),
    duplicateCount: integer("duplicate_count").default(0).notNull(),
    errorSummary: jsonb("error_summary").$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    requestedByEmail: text("requested_by_email"),
  },
  (table) => [
    uniqueIndex("discovery_runs_one_running_idx")
      .on(sql`(true)`)
      .where(sql`${table.status} = 'running'`),
    index("discovery_runs_claim_idx").on(
      table.status,
      table.trigger,
      table.createdAt,
    ),
    index("discovery_runs_lease_expiry_idx").on(
      table.status,
      table.leaseExpiresAt,
    ),
    check(
      "discovery_runs_requested_count_check",
      sql`${table.requestedCount} > 0 AND ${table.requestedCount} <= 50`,
    ),
    check(
      "discovery_runs_company_percentage_check",
      sql`${table.companyPercentage} >= 0 AND ${table.companyPercentage} <= 100`,
    ),
    check(
      "discovery_runs_counts_check",
      sql`${table.foundCount} >= 0 AND ${table.newCount} >= 0 AND ${table.duplicateCount} >= 0`,
    ),
    check(
      "discovery_runs_running_lease_check",
      sql`${table.status} <> 'running' OR (${table.startedAt} IS NOT NULL AND ${table.leaseTokenHash} IS NOT NULL AND ${table.leaseExpiresAt} IS NOT NULL AND ${table.completedAt} IS NULL)`,
    ),
  ],
);

export const discoveryCandidates = pgTable(
  "discovery_candidates",
  {
    id: id(),
    type: discoveryCandidateTypeEnum("type").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    canonicalIdentityKey: text("canonical_identity_key").notNull(),
    canonicalUrl: text("canonical_url").notNull(),
    websiteUrl: text("website_url"),
    primarySocialUrl: text("primary_social_url"),
    linkedinUrl: text("linkedin_url"),
    discoveredDescription: text("discovered_description").notNull(),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    geography: text("geography").notNull(),
    firstSourceName: text("first_source_name").notNull(),
    firstSourceUrl: text("first_source_url").notNull(),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    mostRecentRunId: uuid("most_recent_run_id").notNull(),
    discoveryScore: integer("discovery_score").notNull(),
    status: discoveryCandidateStatusEnum("status")
      .default("discovered")
      .notNull(),
    rawMetadata: jsonb("raw_metadata").$type<Record<string, unknown>>()
      .default({})
      .notNull(),
  },
  (table) => [
    unique("discovery_candidates_type_canonical_identity_unique").on(
      table.type,
      table.canonicalIdentityKey,
    ),
    unique("discovery_candidates_id_type_unique").on(table.id, table.type),
    foreignKey({
      name: "discovery_candidates_recent_run_fk",
      columns: [table.mostRecentRunId],
      foreignColumns: [discoveryRuns.id],
    }),
    index("discovery_candidates_type_idx").on(table.type),
    index("discovery_candidates_geography_idx").on(table.geography),
    index("discovery_candidates_category_idx").on(table.category),
    index("discovery_candidates_source_idx").on(table.firstSourceName),
    index("discovery_candidates_status_idx").on(table.status),
    index("discovery_candidates_discovered_at_idx").on(table.discoveredAt),
    index("discovery_candidates_recent_run_idx").on(table.mostRecentRunId),
    check(
      "discovery_candidates_score_check",
      sql`${table.discoveryScore} >= 0 AND ${table.discoveryScore} <= 100`,
    ),
    check(
      "discovery_candidates_name_check",
      sql`length(btrim(${table.name})) > 0 AND length(btrim(${table.normalizedName})) > 0`,
    ),
  ],
);

export const candidateResearchVersions = pgTable(
  "candidate_research_versions",
  {
    id: id(),
    candidateId: uuid("candidate_id").notNull(),
    discoveryRunId: uuid("discovery_run_id").notNull(),
    summary: text("summary").notNull(),
    findings: text("findings").notNull(),
    sourceUrls: jsonb("source_urls").$type<string[]>().notNull(),
    analysisVersion: text("analysis_version").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("candidate_research_versions_candidate_run_unique").on(
      table.candidateId,
      table.discoveryRunId,
    ),
    foreignKey({
      name: "candidate_research_versions_candidate_fk",
      columns: [table.candidateId],
      foreignColumns: [discoveryCandidates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "candidate_research_versions_run_fk",
      columns: [table.discoveryRunId],
      foreignColumns: [discoveryRuns.id],
    }),
    index("candidate_research_versions_candidate_created_idx").on(
      table.candidateId,
      table.createdAt,
    ),
    index("candidate_research_versions_run_idx").on(table.discoveryRunId),
    check(
      "candidate_research_versions_summary_check",
      sql`length(${table.summary}) between 80 and 1200`,
    ),
    check(
      "candidate_research_versions_findings_check",
      sql`length(${table.findings}) between 600 and 12000`,
    ),
    check(
      "candidate_research_versions_sources_check",
      sql`jsonb_typeof(${table.sourceUrls}) = 'array' and jsonb_array_length(${table.sourceUrls}) between 1 and 12`,
    ),
    check(
      "candidate_research_versions_analysis_check",
      sql`${table.analysisVersion} = 'physical-ai-v1'`,
    ),
  ],
);

export const candidateEcosystemClassifications = pgTable(
  "candidate_ecosystem_classifications",
  {
    id: id(),
    candidateId: uuid("candidate_id").notNull(),
    kind: text("kind").notNull(),
    termKey: text("term_key").notNull(),
    evidenceState: text("evidence_state").notNull(),
    confidence: integer("confidence").notNull(),
    basis: text("basis").notNull(),
    sourceUrls: jsonb("source_urls").$type<string[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique(
      "candidate_ecosystem_classifications_candidate_kind_term_unique",
    ).on(table.candidateId, table.kind, table.termKey),
    foreignKey({
      name: "candidate_ecosystem_classifications_candidate_fk",
      columns: [table.candidateId],
      foreignColumns: [discoveryCandidates.id],
    }).onDelete("cascade"),
    index("candidate_ecosystem_classifications_candidate_idx").on(
      table.candidateId,
    ),
    index("candidate_ecosystem_classifications_kind_term_idx").on(
      table.kind,
      table.termKey,
    ),
    index("candidate_ecosystem_classifications_evidence_state_idx").on(
      table.evidenceState,
    ),
    index("candidate_ecosystem_classifications_confidence_idx").on(
      table.confidence,
    ),
    check(
      "candidate_ecosystem_classifications_kind_term_check",
      sql`length(btrim(${table.kind})) > 0 AND length(btrim(${table.termKey})) > 0`,
    ),
    check(
      "candidate_ecosystem_classifications_evidence_state_check",
      sql`${table.evidenceState} IN ('evidence_backed', 'inferred')`,
    ),
    check(
      "candidate_ecosystem_classifications_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`,
    ),
    check(
      "candidate_ecosystem_classifications_basis_check",
      sql`length(btrim(${table.basis})) between 1 and 1000`,
    ),
    check(
      "candidate_ecosystem_classifications_sources_check",
      sql`jsonb_typeof(${table.sourceUrls}) = 'array' and jsonb_array_length(${table.sourceUrls}) between 1 and 12`,
    ),
  ],
);

export const candidateHeadquarters = pgTable(
  "candidate_headquarters",
  {
    id: id(),
    candidateId: uuid("candidate_id")
      .notNull()
      .unique("candidate_headquarters_candidate_unique"),
    countryCode: text("country_code").default("IN").notNull(),
    stateKey: text("state_key").notNull(),
    stateLabel: text("state_label").notNull(),
    cityKey: text("city_key").notNull(),
    cityLabel: text("city_label").notNull(),
    latitudeMicrodegrees: integer("latitude_microdegrees"),
    longitudeMicrodegrees: integer("longitude_microdegrees"),
    evidenceState: text("evidence_state").notNull(),
    confidence: integer("confidence").notNull(),
    sourceUrls: jsonb("source_urls").$type<string[]>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "candidate_headquarters_candidate_fk",
      columns: [table.candidateId],
      foreignColumns: [discoveryCandidates.id],
    }).onDelete("cascade"),
    index("candidate_headquarters_state_idx").on(table.stateKey),
    index("candidate_headquarters_city_idx").on(table.cityKey),
    index("candidate_headquarters_evidence_state_idx").on(
      table.evidenceState,
    ),
    index("candidate_headquarters_confidence_idx").on(table.confidence),
    check(
      "candidate_headquarters_country_check",
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    check(
      "candidate_headquarters_location_check",
      sql`length(btrim(${table.stateKey})) > 0 AND length(btrim(${table.stateLabel})) > 0 AND length(btrim(${table.cityKey})) > 0 AND length(btrim(${table.cityLabel})) > 0`,
    ),
    check(
      "candidate_headquarters_coordinates_check",
      sql`(${table.latitudeMicrodegrees} IS NULL AND ${table.longitudeMicrodegrees} IS NULL) OR (${table.latitudeMicrodegrees} IS NOT NULL AND ${table.longitudeMicrodegrees} IS NOT NULL)`,
    ),
    check(
      "candidate_headquarters_latitude_check",
      sql`${table.latitudeMicrodegrees} IS NULL OR (${table.latitudeMicrodegrees} >= -90000000 AND ${table.latitudeMicrodegrees} <= 90000000)`,
    ),
    check(
      "candidate_headquarters_longitude_check",
      sql`${table.longitudeMicrodegrees} IS NULL OR (${table.longitudeMicrodegrees} >= -180000000 AND ${table.longitudeMicrodegrees} <= 180000000)`,
    ),
    check(
      "candidate_headquarters_evidence_state_check",
      sql`${table.evidenceState} IN ('evidence_backed', 'inferred')`,
    ),
    check(
      "candidate_headquarters_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`,
    ),
    check(
      "candidate_headquarters_sources_check",
      sql`jsonb_typeof(${table.sourceUrls}) = 'array' and jsonb_array_length(${table.sourceUrls}) between 1 and 12`,
    ),
  ],
);

export const candidatePublicSignals = pgTable(
  "candidate_public_signals",
  {
    id: id(),
    candidateId: uuid("candidate_id").notNull(),
    signalType: text("signal_type").notNull(),
    title: text("title").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    sourceUrl: text("source_url").notNull(),
    confidence: integer("confidence").notNull(),
    evidenceKey: text("evidence_key").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "candidate_public_signals_candidate_fk",
      columns: [table.candidateId],
      foreignColumns: [discoveryCandidates.id],
    }).onDelete("cascade"),
    uniqueIndex("candidate_public_signals_evidence_key_idx").on(
      table.evidenceKey,
    ),
    index("candidate_public_signals_candidate_idx").on(table.candidateId),
    index("candidate_public_signals_type_idx").on(table.signalType),
    index("candidate_public_signals_occurred_at_idx").on(table.occurredAt),
    index("candidate_public_signals_expires_at_idx").on(table.expiresAt),
    check(
      "candidate_public_signals_signal_type_check",
      sql`length(btrim(${table.signalType})) between 1 and 100`,
    ),
    check(
      "candidate_public_signals_title_check",
      sql`length(btrim(${table.title})) between 1 and 300`,
    ),
    check(
      "candidate_public_signals_source_url_check",
      sql`length(btrim(${table.sourceUrl})) > 0 AND ${table.sourceUrl} ~ '^https?://'`,
    ),
    check(
      "candidate_public_signals_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`,
    ),
    check(
      "candidate_public_signals_evidence_key_check",
      sql`length(btrim(${table.evidenceKey})) > 0`,
    ),
    check(
      "candidate_public_signals_expiry_check",
      sql`${table.expiresAt} IS NULL OR ${table.expiresAt} >= ${table.occurredAt}`,
    ),
  ],
);

export const candidateRelationships = pgTable(
  "candidate_relationships",
  {
    id: id(),
    sourceCandidateId: uuid("source_candidate_id").notNull(),
    targetCandidateId: uuid("target_candidate_id"),
    targetPublicName: text("target_public_name"),
    relationshipType: text("relationship_type").notNull(),
    evidenceUrl: text("evidence_url").notNull(),
    confidence: integer("confidence").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    evidenceKey: text("evidence_key").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      name: "candidate_relationships_source_candidate_fk",
      columns: [table.sourceCandidateId],
      foreignColumns: [discoveryCandidates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "candidate_relationships_target_candidate_fk",
      columns: [table.targetCandidateId],
      foreignColumns: [discoveryCandidates.id],
    }).onDelete("no action"),
    uniqueIndex("candidate_relationships_evidence_key_idx").on(
      table.evidenceKey,
    ),
    index("candidate_relationships_source_candidate_idx").on(
      table.sourceCandidateId,
    ),
    index("candidate_relationships_target_candidate_idx").on(
      table.targetCandidateId,
    ),
    index("candidate_relationships_type_idx").on(table.relationshipType),
    index("candidate_relationships_observed_at_idx").on(table.observedAt),
    check(
      "candidate_relationships_target_check",
      sql`${table.targetCandidateId} IS NOT NULL OR (${table.targetPublicName} IS NOT NULL AND length(btrim(${table.targetPublicName})) > 0)`,
    ),
    check(
      "candidate_relationships_self_link_check",
      sql`${table.targetCandidateId} IS NULL OR ${table.sourceCandidateId} <> ${table.targetCandidateId}`,
    ),
    check(
      "candidate_relationships_type_check",
      sql`length(btrim(${table.relationshipType})) between 1 and 100`,
    ),
    check(
      "candidate_relationships_evidence_url_check",
      sql`length(btrim(${table.evidenceUrl})) > 0 AND ${table.evidenceUrl} ~ '^https?://'`,
    ),
    check(
      "candidate_relationships_confidence_check",
      sql`${table.confidence} >= 0 AND ${table.confidence} <= 100`,
    ),
    check(
      "candidate_relationships_evidence_key_check",
      sql`length(btrim(${table.evidenceKey})) > 0`,
    ),
  ],
);

export const discoveryCandidateIdentifiers = pgTable(
  "discovery_candidate_identifiers",
  {
    id: id(),
    candidateId: uuid("candidate_id").notNull(),
    candidateType: discoveryCandidateTypeEnum("candidate_type").notNull(),
    kind: discoveryIdentifierKindEnum("kind").notNull(),
    normalizedValue: text("normalized_value").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("discovery_candidate_identifiers_type_value_unique").on(
      table.candidateType,
      table.normalizedValue,
    ),
    foreignKey({
      name: "discovery_identifiers_candidate_type_fk",
      columns: [table.candidateId, table.candidateType],
      foreignColumns: [discoveryCandidates.id, discoveryCandidates.type],
    }).onDelete("cascade"),
    index("discovery_candidate_identifiers_candidate_idx").on(
      table.candidateId,
    ),
    check(
      "discovery_candidate_identifiers_value_check",
      sql`length(btrim(${table.normalizedValue})) > 0`,
    ),
  ],
);

export const discoveryCandidateSources = pgTable(
  "discovery_candidate_sources",
  {
    id: id(),
    candidateId: uuid("candidate_id").notNull(),
    discoveryRunId: uuid("discovery_run_id").notNull(),
    sourceName: text("source_name").notNull(),
    sourceUrl: text("source_url").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    rawMetadata: jsonb("raw_metadata").$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("discovery_candidate_sources_evidence_unique").on(
      table.candidateId,
      table.sourceName,
      table.sourceUrl,
    ),
    foreignKey({
      name: "discovery_sources_candidate_fk",
      columns: [table.candidateId],
      foreignColumns: [discoveryCandidates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "discovery_sources_run_fk",
      columns: [table.discoveryRunId],
      foreignColumns: [discoveryRuns.id],
    }),
    index("discovery_candidate_sources_candidate_idx").on(table.candidateId),
    index("discovery_candidate_sources_run_idx").on(table.discoveryRunId),
    index("discovery_candidate_sources_source_candidate_idx").on(
      table.sourceName,
      table.candidateId,
    ),
  ],
);

export const opportunityBriefRequests = pgTable(
  "opportunity_brief_requests",
  {
    id: id(),
    participantType: discoveryCandidateTypeEnum("participant_type").notNull(),
    profileUrl: text("profile_url").notNull(),
    normalizedProfileUrl: text("normalized_profile_url").notNull(),
    email: text("email"),
    normalizedEmail: text("normalized_email"),
    phoneNumber: text("phone_number"),
    normalizedPhoneNumber: text("normalized_phone_number"),
    openToText: text("open_to_text"),
    source: text("source"),
    utm: jsonb("utm")
      .$type<OpportunityBriefSourceMetadata["utm"]>()
      .default({})
      .notNull(),
    sourceHistory: jsonb("source_history")
      .$type<OpportunityBriefSourceMetadata["history"]>()
      .default([])
      .notNull(),
    linkedCandidateId: uuid("linked_candidate_id"),
    status: opportunityBriefStatusEnum("status")
      .default("submitted")
      .notNull(),
    adminNotes: text("admin_notes"),
    acknowledgementStatus: opportunityBriefAcknowledgementStatusEnum(
      "acknowledgement_status",
    )
      .default("not_requested")
      .notNull(),
    acknowledgementEmail: text("acknowledgement_email"),
    acknowledgementDeliveryToken: uuid("acknowledgement_delivery_token"),
    acknowledgementError: text("acknowledgement_error"),
    acknowledgementSentAt: timestamp("acknowledgement_sent_at", {
      withTimezone: true,
    }),
    submissionCount: integer("submission_count").default(1).notNull(),
    lastSubmittedAt: timestamp("last_submitted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("opportunity_brief_requests_participant_profile_unique").on(
      table.participantType,
      table.normalizedProfileUrl,
    ),
    foreignKey({
      name: "opportunity_brief_requests_linked_candidate_fk",
      columns: [table.linkedCandidateId],
      foreignColumns: [discoveryCandidates.id],
    }).onDelete("set null"),
    index("opportunity_brief_requests_status_last_submitted_at_idx").on(
      table.status,
      table.lastSubmittedAt,
    ),
    index("opportunity_brief_requests_created_at_idx").on(table.createdAt),
    index("opportunity_brief_requests_participant_type_idx").on(
      table.participantType,
    ),
    index("opportunity_brief_requests_source_idx").on(table.source),
    index("opportunity_brief_requests_linked_candidate_idx").on(
      table.linkedCandidateId,
    ),
    index("opportunity_brief_requests_normalized_email_idx").on(
      table.normalizedEmail,
    ),
    index("opportunity_brief_requests_normalized_phone_number_idx").on(
      table.normalizedPhoneNumber,
    ),
    check(
      "opportunity_brief_requests_submission_count_check",
      sql`${table.submissionCount} > 0`,
    ),
  ],
);

export const opportunityBriefSubmissionAttempts = pgTable(
  "opportunity_brief_submission_attempts",
  {
    id: id(),
    requesterHash: text("requester_hash").notNull(),
    requestId: uuid("request_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({
      name: "opportunity_brief_submission_attempts_request_fk",
      columns: [table.requestId],
      foreignColumns: [opportunityBriefRequests.id],
    }).onDelete("cascade"),
    index(
      "opportunity_brief_submission_attempts_requester_created_at_idx",
    ).on(table.requesterHash, table.createdAt),
    index("opportunity_brief_submission_attempts_request_id_idx").on(
      table.requestId,
    ),
  ],
);
