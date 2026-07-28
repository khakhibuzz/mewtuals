import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { openToInterests } from "../app/domain/signal";

import {
  availabilityEnum,
  candidateResearchVersions,
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

const hasUniqueIndex = (
  table: Parameters<typeof getTableConfig>[0],
  name: string,
) =>
  configFor(table).indexes.some(
    (index) => index.config.name === name && index.config.unique,
  );

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

  it("models leased discovery runs with one global active-run backstop", () => {
    expect(configFor(discoveryRuns).name).toBe("discovery_runs");
    expect(columnNames(discoveryRuns)).toEqual(
      expect.arrayContaining([
        "campaign_key",
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
    expect(discoveryRuns.campaignKey.notNull).toBe(true);
    expect(discoveryRuns.campaignKey.hasDefault).toBe(true);
  });

  it("stores append-only candidate research versions with bounded indexes", () => {
    expect(configFor(candidateResearchVersions).name).toBe(
      "candidate_research_versions",
    );
    expect(columnNames(candidateResearchVersions)).toEqual([
      "id",
      "candidate_id",
      "discovery_run_id",
      "summary",
      "findings",
      "source_urls",
      "analysis_version",
      "created_at",
    ]);
    expect(uniqueConstraintNames(candidateResearchVersions)).toContain(
      "candidate_research_versions_candidate_run_unique",
    );
    expect(indexNames(candidateResearchVersions)).toEqual(
      expect.arrayContaining([
        "candidate_research_versions_candidate_created_idx",
        "candidate_research_versions_run_idx",
      ]),
    );
    expect(foreignKeyNames(candidateResearchVersions)).toEqual([
      "candidate_research_versions_candidate_fk",
      "candidate_research_versions_run_fk",
    ]);
    expect(
      configFor(candidateResearchVersions).foreignKeys.some(
        (foreignKey) => foreignKey.onDelete === "cascade",
      ),
    ).toBe(true);
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
