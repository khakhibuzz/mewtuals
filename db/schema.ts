import { sql } from "drizzle-orm";
import {
  boolean,
  check,
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
    mostRecentRunId: uuid("most_recent_run_id")
      .notNull()
      .references(() => discoveryRuns.id),
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

export const discoveryCandidateIdentifiers = pgTable(
  "discovery_candidate_identifiers",
  {
    id: id(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => discoveryCandidates.id, { onDelete: "cascade" }),
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
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => discoveryCandidates.id, { onDelete: "cascade" }),
    discoveryRunId: uuid("discovery_run_id")
      .notNull()
      .references(() => discoveryRuns.id),
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
    index("discovery_candidate_sources_candidate_idx").on(table.candidateId),
    index("discovery_candidate_sources_run_idx").on(table.discoveryRunId),
  ],
);
