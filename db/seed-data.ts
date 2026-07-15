import type { NewOpportunity } from "./types";

export type OpportunitySeed = Omit<
  NewOpportunity,
  "id" | "createdAt" | "updatedAt"
>;

export const opportunitySeedData = [
  {
    key: "brand-creator-audience-collaboration",
    title: "Audience-led brand collaboration",
    summary:
      "Pair a brand with a creator whose audience and editorial voice fit a useful campaign, launch, or recurring format.",
    direction: "brand_creator",
    counterpartyType: "Brand or creator with a complementary audience",
    eligibleIdentityKinds: ["organisation", "creator"],
    eligibleOrganisationSubtypes: ["company", "brand"],
    eligibleCreatorSubtypes: ["creator", "podcaster", "publication"],
    openToTags: ["sponsored_content", "audience_access", "product_collaboration"],
    active: true,
  },
  {
    key: "brand-brand-co-distribution",
    title: "Complementary brand distribution",
    summary:
      "Connect non-competing brands that can create shared customer value through co-distribution or a joint offer.",
    direction: "brand_brand",
    counterpartyType: "Non-competing brand serving an adjacent customer need",
    eligibleIdentityKinds: ["organisation"],
    eligibleOrganisationSubtypes: ["company", "brand"],
    eligibleCreatorSubtypes: [],
    openToTags: ["co_marketing", "bundled_offer", "shared_distribution"],
    active: true,
  },
  {
    key: "creator-creator-format-exchange",
    title: "Creator format exchange",
    summary:
      "Bring together creators with compatible audiences and distinct strengths for a useful shared format or channel exchange.",
    direction: "creator_creator",
    counterpartyType: "Creator or media operator with complementary expertise",
    eligibleIdentityKinds: ["creator"],
    eligibleOrganisationSubtypes: [],
    eligibleCreatorSubtypes: [
      "creator",
      "podcaster",
      "publication",
      "media_operator",
    ],
    openToTags: ["guest_exchange", "co_created_series", "audience_exchange"],
    active: true,
  },
  {
    key: "startup-distribution-partner-channel-pilot",
    title: "Startup distribution pilot",
    summary:
      "Match a startup with a distribution partner that can validate a channel through a focused, measurable pilot.",
    direction: "startup_distribution_partner",
    counterpartyType: "Distribution partner with relevant customer access",
    eligibleIdentityKinds: ["organisation"],
    eligibleOrganisationSubtypes: ["startup", "distribution_partner"],
    eligibleCreatorSubtypes: [],
    openToTags: ["channel_pilot", "customer_access", "embedded_distribution"],
    active: true,
  },
] satisfies OpportunitySeed[];
