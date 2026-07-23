import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { OpportunityBriefSourceMetadata } from "../app/domain/opportunity-brief";
import { openToInterests } from "../app/domain/signal";
import type {
  NewOpportunityBriefRequest,
  NewOpportunityBriefSubmissionAttempt,
  OpportunityBriefRequest,
  OpportunityBriefSubmissionAttempt,
} from "../db/types";
import * as schema from "../db/schema";

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

const hasUniqueIndex = (
  table: Parameters<typeof getTableConfig>[0],
  name: string,
) =>
  configFor(table).indexes.some(
    (index) => index.config.name === name && index.config.unique,
  );

describe("Mewtuals PostgreSQL schema", () => {
  it("exposes the constrained opportunity brief vocabulary", () => {
    expect(schema.opportunityBriefStatusEnum?.enumValues).toEqual([
      "submitted",
      "researching",
      "brief_ready",
      "contacted",
      "invited_to_join",
      "converted",
      "rejected",
    ]);
    expect(
      schema.opportunityBriefAcknowledgementStatusEnum?.enumValues,
    ).toEqual(["not_requested", "pending", "sent", "failed"]);
  });

  it("models opportunity brief requests with durable identity and admin indexes", () => {
    const requests = schema.opportunityBriefRequests;

    expect(requests).toBeDefined();
    expect(configFor(requests).name).toBe("opportunity_brief_requests");
    expect(columnNames(requests)).toEqual(
      expect.arrayContaining([
        "participant_type",
        "profile_url",
        "normalized_profile_url",
        "email",
        "normalized_email",
        "phone_number",
        "normalized_phone_number",
        "open_to_text",
        "source",
        "utm",
        "source_history",
        "linked_candidate_id",
        "status",
        "admin_notes",
        "acknowledgement_status",
        "acknowledgement_email",
        "acknowledgement_delivery_token",
        "acknowledgement_error",
        "acknowledgement_sent_at",
        "submission_count",
        "last_submitted_at",
        "created_at",
        "updated_at",
      ]),
    );
    expect(requests.acknowledgementDeliveryToken.notNull).toBe(false);
    expect(requests.acknowledgementDeliveryToken.hasDefault).toBe(false);
    expect(uniqueConstraintNames(requests)).toContain(
      "opportunity_brief_requests_participant_profile_unique",
    );
    expect(checkNames(requests)).toContain(
      "opportunity_brief_requests_submission_count_check",
    );
    expect(checkNames(requests)).not.toContain(
      "opportunity_brief_requests_contact_check",
    );
    expect(foreignKeyNames(requests)).toEqual([
      "opportunity_brief_requests_linked_candidate_fk",
    ]);
    const [candidateForeignKey] = configFor(requests).foreignKeys;
    expect(candidateForeignKey?.onDelete).toBe("set null");
    expect(
      candidateForeignKey?.reference().foreignTable,
    ).toBe(discoveryCandidates);
    expect(indexNames(requests)).toEqual(
      expect.arrayContaining([
        "opportunity_brief_requests_status_last_submitted_at_idx",
        "opportunity_brief_requests_created_at_idx",
        "opportunity_brief_requests_participant_type_idx",
        "opportunity_brief_requests_source_idx",
        "opportunity_brief_requests_linked_candidate_idx",
        "opportunity_brief_requests_normalized_email_idx",
        "opportunity_brief_requests_normalized_phone_number_idx",
      ]),
    );
  });

  it("stores only hashed requester identity for submission attempts", () => {
    const attempts = schema.opportunityBriefSubmissionAttempts;

    expect(attempts).toBeDefined();
    expect(configFor(attempts).name).toBe(
      "opportunity_brief_submission_attempts",
    );
    expect(columnNames(attempts)).toEqual([
      "id",
      "requester_hash",
      "request_id",
      "created_at",
    ]);
    expect(indexNames(attempts)).toEqual(
      expect.arrayContaining([
        "opportunity_brief_submission_attempts_requester_created_at_idx",
        "opportunity_brief_submission_attempts_request_id_idx",
      ]),
    );
    const [requestForeignKey] = configFor(attempts).foreignKeys;
    expect(requestForeignKey?.onDelete).toBe("cascade");
    expect(requestForeignKey?.reference().foreignTable).toBe(
      schema.opportunityBriefRequests,
    );
  });

  it("exports inferred opportunity brief persistence types", () => {
    expectTypeOf<OpportunityBriefRequest["id"]>().toBeString();
    expectTypeOf<NewOpportunityBriefRequest>().toHaveProperty(
      "normalizedProfileUrl",
    );
    expectTypeOf<
      OpportunityBriefSubmissionAttempt["requesterHash"]
    >().toBeString();
    expectTypeOf<NewOpportunityBriefSubmissionAttempt>().toHaveProperty(
      "requestId",
    );
    expectTypeOf<OpportunityBriefRequest["utm"]>().toEqualTypeOf<
      OpportunityBriefSourceMetadata["utm"]
    >();
    expectTypeOf<OpportunityBriefRequest["sourceHistory"]>().toEqualTypeOf<
      OpportunityBriefSourceMetadata["history"]
    >();
  });

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
