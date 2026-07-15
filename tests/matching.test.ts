import { describe, expect, it } from "vitest";

import {
  curateOpportunities,
  opportunityCandidateSchema,
  partnershipDirectionSchema,
  type OpportunityCandidate,
} from "../app/domain/matching";
import { signalSchema } from "../app/domain/signal";
import { opportunitySeedData } from "../db/seed-data";

const opportunities = [
  {
    key: "brand-creator",
    title: "Audience-led brand collaboration",
    summary: "A focused creator collaboration.",
    direction: "brand_creator",
    counterpartyType: "Creator with a complementary audience",
    eligibleIdentityKinds: ["organisation", "creator"],
    eligibleOrganisationSubtypes: ["brand"],
    eligibleCreatorSubtypes: ["creator"],
    openToTags: ["creator_collaborations", "product_reviews"],
    active: true,
  },
  {
    key: "brand-brand",
    title: "Complementary brand distribution",
    summary: "A joint launch with an adjacent brand.",
    direction: "brand_brand",
    counterpartyType: "Non-competing adjacent brand",
    eligibleIdentityKinds: ["organisation"],
    eligibleOrganisationSubtypes: ["brand"],
    eligibleCreatorSubtypes: [],
    openToTags: ["co_marketing"],
    active: true,
  },
  {
    key: "creator-creator",
    title: "Creator format exchange",
    summary: "A useful shared format.",
    direction: "creator_creator",
    counterpartyType: "Creator with complementary expertise",
    eligibleIdentityKinds: ["creator"],
    eligibleOrganisationSubtypes: [],
    eligibleCreatorSubtypes: ["creator", "podcaster"],
    openToTags: ["podcasts", "creator_collaborations"],
    active: true,
  },
  {
    key: "startup-distribution",
    title: "Startup distribution pilot",
    summary: "A measurable channel pilot.",
    direction: "startup_distribution_partner",
    counterpartyType: "Distribution partner with customer access",
    eligibleIdentityKinds: ["organisation"],
    eligibleOrganisationSubtypes: ["startup", "distribution_partner"],
    eligibleCreatorSubtypes: [],
    openToTags: ["distribution_partnerships"],
    active: true,
  },
] satisfies OpportunityCandidate[];

describe("signals", () => {
  it("accepts the curated interest vocabulary and trims notes", () => {
    expect(
      signalSchema.parse({
        availability: "open_selectively",
        openTo: ["podcasts", "founder_stories"],
        notes: "  Prefer founder-led formats.  ",
      }),
    ).toEqual({
      availability: "open_selectively",
      openTo: ["podcasts", "founder_stories"],
      notes: "Prefer founder-led formats.",
    });
  });

  it("rejects empty, duplicate, and unknown interests", () => {
    expect(() =>
      signalSchema.parse({ availability: "open_now", openTo: [] }),
    ).toThrow();
    expect(() =>
      signalSchema.parse({
        availability: "open_now",
        openTo: ["podcasts", "podcasts"],
      }),
    ).toThrow();
    expect(() =>
      signalSchema.parse({ availability: "open_now", openTo: ["anything"] }),
    ).toThrow();
  });
});

describe("curated opportunity fit", () => {
  it("rejects catalogue tags outside the member signal vocabulary", () => {
    expect(() =>
      opportunityCandidateSchema.parse({
        ...opportunities[0],
        openToTags: ["unsupported_internal_tag"],
      }),
    ).toThrow();
  });

  it("supports all four partnership directions", () => {
    expect(
      opportunities.map((opportunity) =>
        partnershipDirectionSchema.parse(opportunity.direction),
      ),
    ).toEqual([
      "brand_creator",
      "brand_brand",
      "creator_creator",
      "startup_distribution_partner",
    ]);
  });

  it("requires identity, subtype, and interest compatibility", () => {
    const picks = curateOpportunities(
      { kind: "organisation", subtype: "brand" },
      {
        availability: "open_now",
        openTo: ["creator_collaborations", "co_marketing"],
      },
      opportunities,
    );

    expect(picks.map((pick) => pick.key)).toEqual([
      "brand-brand",
      "brand-creator",
    ]);
    expect(picks.every((pick) => pick.score > 0)).toBe(true);
  });

  it("returns a valid no-match result", () => {
    expect(
      curateOpportunities(
        { kind: "organisation", subtype: "company" },
        { availability: "open_now", openTo: ["media_interviews"] },
        opportunities,
      ),
    ).toEqual([]);

    expect(
      curateOpportunities(
        { kind: "creator", subtype: "creator" },
        {
          availability: "not_available",
          openTo: ["creator_collaborations"],
        },
        opportunities,
      ),
    ).toEqual([]);
  });

  it("sorts deterministically and returns at most three picks", () => {
    const candidates = Array.from({ length: 5 }, (_, index) => ({
      ...opportunities[0],
      key: `candidate-${index + 1}`,
    }));

    const picks = curateOpportunities(
      { kind: "organisation", subtype: "brand" },
      {
        availability: "open_now",
        openTo: ["creator_collaborations", "product_reviews"],
      },
      candidates,
    );

    expect(picks).toHaveLength(3);
    expect(picks.map((pick) => pick.key)).toEqual([
      "candidate-1",
      "candidate-2",
      "candidate-3",
    ]);
  });

  it.each([
    [
      "brand_creator",
      { kind: "organisation", subtype: "brand" },
      "creator_collaborations",
    ],
    [
      "brand_brand",
      { kind: "organisation", subtype: "brand" },
      "co_marketing",
    ],
    [
      "creator_creator",
      { kind: "creator", subtype: "creator" },
      "podcasts",
    ],
    [
      "startup_distribution_partner",
      { kind: "organisation", subtype: "startup" },
      "distribution_partnerships",
    ],
  ] as const)(
    "makes the seeded %s direction reachable from an allowed signal",
    (direction, identity, interest) => {
      expect(
        curateOpportunities(
          identity,
          { availability: "open_now", openTo: [interest] },
          opportunitySeedData,
        ).map((pick) => pick.direction),
      ).toContain(direction);
    },
  );
});
