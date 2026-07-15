import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  availabilityEnum,
  creatorSubtypeEnum,
  identityKindEnum,
  introductionRequests,
  introductionStateEnum,
  magicLinks,
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

const configFor = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table);

const columnNames = (table: Parameters<typeof getTableConfig>[0]) =>
  configFor(table).columns.map((column) => column.name);

const indexNames = (table: Parameters<typeof getTableConfig>[0]) =>
  configFor(table).indexes.map((index) => index.config.name);

const uniqueConstraintNames = (table: Parameters<typeof getTableConfig>[0]) =>
  configFor(table).uniqueConstraints.map((constraint) => constraint.name);

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

  it("enforces identity ownership and idempotent workflow writes", () => {
    expect(users.email.isUnique).toBe(true);
    expect(hasUniqueIndex(magicLinks, "magic_links_token_hash_idx")).toBe(true);
    expect(hasUniqueIndex(sessions, "sessions_token_hash_idx")).toBe(true);
    expect(profiles.userId.isUnique).toBe(true);
    expect(signals.profileId.isUnique).toBe(true);
    expect(opportunities.key.isUnique).toBe(true);
    expect(uniqueConstraintNames(profileOpportunities)).toContain(
      "profile_opportunities_profile_id_opportunity_id_unique",
    );
    expect(introductionRequests.profileOpportunityId.isUnique).toBe(true);
  });

  it("indexes authentication tokens and workflow status lookups", () => {
    expect(indexNames(magicLinks)).toContain("magic_links_token_hash_idx");
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

  it("models matching inputs and eligibility explicitly", () => {
    expect(signals.openTo.dataType).toBe("array");
    expect(columnNames(opportunities)).toEqual(
      expect.arrayContaining([
        "direction",
        "counterparty_type",
        "eligible_identity_kinds",
        "eligible_organisation_subtypes",
        "eligible_creator_subtypes",
      ]),
    );
  });

  it("uses cascading foreign keys for owned product records", () => {
    const ownedTables = [
      sessions,
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
