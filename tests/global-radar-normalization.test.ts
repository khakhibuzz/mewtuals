import { describe, expect, it } from "vitest";

import {
  canonicalizeEvidenceUrl,
  compareEntityIdentities,
  createEntityIdentity,
  createEvidenceFingerprint,
  createQueryFingerprint,
  createRequirementFingerprint,
  normalizeEntityDomain,
  normalizeLinkedInOrganizationUrl,
  normalizeOfficialWebsiteUrl,
} from "../app/domain/global-radar/normalization";

describe("Global Radar normalization", () => {
  it("normalizes entity domains and official public identities", () => {
    expect(normalizeEntityDomain("WWW.Example.COM.")).toBe("example.com");
    expect(
      normalizeOfficialWebsiteUrl(
        "http://www.Example.com/about/?utm_source=radar#team",
      ),
    ).toBe("https://example.com");
    expect(
      normalizeLinkedInOrganizationUrl(
        "http://www.linkedin.com/company/Example-Robotics/?utm_source=radar",
      ),
    ).toBe("https://linkedin.com/company/example-robotics");
    expect(() =>
      normalizeLinkedInOrganizationUrl("https://linkedin.com/in/person"),
    ).toThrow("organization");
  });

  it("canonicalizes evidence URLs without collapsing distinct resources", () => {
    expect(
      canonicalizeEvidenceUrl(
        "http://www.Example.com/rfp?id=7&utm_campaign=radar#scope",
      ),
    ).toBe("https://example.com/rfp?id=7");
    expect(
      canonicalizeEvidenceUrl("https://example.com/rfp?id=8"),
    ).not.toBe(canonicalizeEvidenceUrl("https://example.com/rfp?id=7"));
  });

  it("uses stable public identifiers for automatic identity and names only for collision review", () => {
    const first = createEntityIdentity({
      name: "  Example Robotics, Inc. ",
      headquartersCountry: "US",
      websiteUrl: "https://www.example.com/about",
      linkedinOrganizationUrl: null,
      stablePublicIdentifiers: [],
    });
    const sameDomain = createEntityIdentity({
      name: "Example Robotics",
      headquartersCountry: "United States",
      websiteUrl: "http://example.com",
      linkedinOrganizationUrl: null,
      stablePublicIdentifiers: [],
    });
    const sameNameOnly = createEntityIdentity({
      name: "Example Robotics Inc",
      headquartersCountry: "US",
      websiteUrl: "https://different.example",
      linkedinOrganizationUrl: null,
      stablePublicIdentifiers: [],
    });

    expect(first.stableIdentifiers).toContain("domain:example.com");
    expect(compareEntityIdentities(first, sameDomain)).toBe("same_entity");
    expect(first.collisionCandidateKey).toBe(
      sameNameOnly.collisionCandidateKey,
    );
    expect(compareEntityIdentities(first, sameNameOnly)).toBe(
      "collision_candidate",
    );
    expect(first.stableIdentifiers).not.toContain(
      first.collisionCandidateKey,
    );
  });

  it("normalizes LinkedIn and named public identifiers into stable entity identifiers", () => {
    const identity = createEntityIdentity({
      name: "Example Robotics",
      headquartersCountry: "US",
      websiteUrl: null,
      linkedinOrganizationUrl:
        "https://www.linkedin.com/company/Example-Robotics/",
      stablePublicIdentifiers: [{ namespace: "LEI", value: " 549300ABC " }],
    });

    expect(identity.stableIdentifiers).toEqual([
      "linkedin:https://linkedin.com/company/example-robotics",
      "public:lei:549300abc",
    ]);
  });

  it("creates deterministic query and requirement fingerprints from normalized meaning", () => {
    const query = {
      query: "  robot   supplier registration ",
      language: "EN",
      sourceCountry: " us ",
      theme: "robotics_manufacturing",
      signalIntent: "direct_demand",
      sourceAdapter: "codex_public_web",
    };
    const requirement = {
      kind: "manufacturing",
      summary: "  Contract   manufacturing capacity ",
    };

    expect(createQueryFingerprint(query)).toBe(
      createQueryFingerprint({
        ...query,
        query: "robot supplier registration",
        language: "en",
        sourceCountry: "US",
      }),
    );
    expect(createRequirementFingerprint(requirement)).toBe(
      createRequirementFingerprint({
        kind: "manufacturing",
        summary: "contract manufacturing capacity",
      }),
    );
    expect(createQueryFingerprint(query)).toMatch(/^[a-f0-9]{64}$/);
    expect(createRequirementFingerprint(requirement)).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });

  it("deduplicates mirrors of one canonical source but preserves distinct primary sources", () => {
    const shared = {
      publishedAt: "2026-07-29T00:00:00.000Z",
    };
    const primaryUrl = "https://example.com/suppliers";
    const original = createEvidenceFingerprint({
      ...shared,
      sourceUrl: `${primaryUrl}?utm_source=newsletter`,
      canonicalSourceUrl: primaryUrl,
      isPrimarySource: true,
    });
    const mirror = createEvidenceFingerprint({
      sourceUrl: "https://mirror.example/story/123",
      canonicalSourceUrl: primaryUrl,
      publishedAt: shared.publishedAt,
      isPrimarySource: false,
    });
    const independentPrimary = createEvidenceFingerprint({
      ...shared,
      sourceUrl: "https://procurement.example/notices/456",
      canonicalSourceUrl: primaryUrl,
      isPrimarySource: true,
    });

    expect(mirror).toBe(original);
    expect(independentPrimary).not.toBe(original);
  });
});
