import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
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
