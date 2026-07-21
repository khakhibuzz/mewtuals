import { describe, expect, it } from "vitest";

import {
  allocateCandidates,
  candidateIdentifiers,
  candidateStatusSchema,
  candidateStatuses,
  candidateTypes,
  discoveryBatchSchema,
  discoveryCandidateInputSchema,
  normalizeDiscoveryUrl,
} from "../app/domain/discovery";

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    type: "company",
    name: "Signal Studio",
    canonicalUrl: "https://signal-studio.com",
    websiteUrl: "https://signal-studio.com",
    primarySocialUrl: null,
    linkedinUrl: null,
    discoveredDescription: "An India-based collaboration platform.",
    category: "technology",
    subcategory: null,
    geography: "India",
    sourceName: "Example directory",
    sourceUrl: "https://directory.example.com/companies/signal-studio",
    discoveryScore: 80,
    ...overrides,
  };
}

function batch(overrides: Record<string, unknown> = {}) {
  return {
    runId: "019f85b2-f34f-7bf3-85a6-f84446175371",
    leaseToken: "opaque-lease-token",
    promptVersion: "codex-web-v1",
    candidates: [candidate()],
    sourceErrors: [],
    ...overrides,
  };
}

describe("discovery candidate vocabulary", () => {
  it("exports the approved candidate types and statuses", () => {
    expect(candidateTypes).toEqual(["company", "creator"]);
    expect(candidateStatuses).toEqual([
      "discovered",
      "shortlisted",
      "rejected",
      "queued_for_profile",
    ]);
  });

  it.each(candidateTypes)("accepts candidate type %s", (type) => {
    expect(discoveryCandidateInputSchema.parse(candidate({ type })).type).toBe(
      type,
    );
  });

  it.each(candidateStatuses)("accepts candidate status %s", (status) => {
    expect(candidateStatusSchema.parse(status)).toBe(status);
  });

});

describe("discovery candidate normalization", () => {
  it("trims and collapses candidate names", () => {
    expect(
      discoveryCandidateInputSchema.parse(
        candidate({ name: "  Signal   Studio\nIndia  " }),
      ).name,
    ).toBe("Signal Studio India");
  });

  it("accepts a complete candidate with nullable URLs and default metadata", () => {
    expect(discoveryCandidateInputSchema.parse(candidate())).toMatchObject({
      ...candidate(),
      rawMetadata: {},
    });
  });

  it("enforces integer discovery scores from 0 through 100", () => {
    expect(discoveryCandidateInputSchema.parse(candidate({ discoveryScore: 0 })).discoveryScore).toBe(0);
    expect(discoveryCandidateInputSchema.parse(candidate({ discoveryScore: 100 })).discoveryScore).toBe(100);

    for (const discoveryScore of [-1, 50.5, 101]) {
      const result = discoveryCandidateInputSchema.safeParse(
        candidate({ discoveryScore }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Discovery score must be an integer from 0 to 100.",
        );
      }
    }
  });

  it("enforces documented candidate string lengths", () => {
    const invalidFields = [
      ["name", " ", "Candidate name is required."],
      ["name", "n".repeat(201), "Candidate name must be at most 200 characters."],
      ["discoveredDescription", " ", "Discovered description is required."],
      ["discoveredDescription", "d".repeat(1_001), "Discovered description must be at most 1000 characters."],
      ["category", " ", "Candidate category is required."],
      ["category", "c".repeat(101), "Candidate category must be at most 100 characters."],
      ["subcategory", "s".repeat(101), "Candidate subcategory must be at most 100 characters."],
      ["geography", " ", "Candidate geography is required."],
      ["geography", "g".repeat(101), "Candidate geography must be at most 100 characters."],
      ["sourceName", " ", "Candidate source name is required."],
      ["sourceName", "s".repeat(101), "Candidate source name must be at most 100 characters."],
    ] as const;

    for (const [field, value, message] of invalidFields) {
      const result = discoveryCandidateInputSchema.safeParse(
        candidate({ [field]: value }),
      );
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toBe(message);
    }
  });

  it("requires every candidate URL to use a public HTTP(S) host", () => {
    for (const field of [
      "canonicalUrl",
      "websiteUrl",
      "primarySocialUrl",
      "linkedinUrl",
      "sourceUrl",
    ]) {
      const result = discoveryCandidateInputSchema.safeParse(
        candidate({ [field]: "http://127.0.0.1/private" }),
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          "Discovery URL must use a public host.",
        );
      }
    }

    expect(
      discoveryCandidateInputSchema.parse(
        candidate({
          sourceUrl: "https://techcrunch.com/2026/07/22/signal-studio-launches/",
        }),
      ).sourceUrl,
    ).toBe("https://techcrunch.com/2026/07/22/signal-studio-launches");
  });

  it("limits raw metadata to 20 keys", () => {
    const rawMetadata = Object.fromEntries(
      Array.from({ length: 21 }, (_, index) => [`key${index}`, index]),
    );
    const result = discoveryCandidateInputSchema.safeParse(
      candidate({ rawMetadata }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Candidate raw metadata must contain at most 20 keys.",
      );
    }
  });

  it("limits raw metadata keys to 64 characters", () => {
    const result = discoveryCandidateInputSchema.safeParse(
      candidate({ rawMetadata: { nested: { ["k".repeat(65)]: true } } }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Candidate raw metadata keys must be at most 64 characters.",
      );
    }
  });

  it("limits raw metadata JSON depth to 3", () => {
    expect(
      discoveryCandidateInputSchema.safeParse(
        candidate({ rawMetadata: { one: { two: { value: true } } } }),
      ).success,
    ).toBe(true);

    const result = discoveryCandidateInputSchema.safeParse(
      candidate({
        rawMetadata: { one: { two: { three: { value: true } } } },
      }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Candidate raw metadata must have JSON depth at most 3.",
      );
    }
  });

  it("limits serialized raw metadata to 8 KiB", () => {
    const result = discoveryCandidateInputSchema.safeParse(
      candidate({ rawMetadata: { evidence: "x".repeat(8_192) } }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Candidate raw metadata must be at most 8192 bytes.",
      );
    }
  });

  it("rejects non-JSON raw metadata values", () => {
    const result = discoveryCandidateInputSchema.safeParse(
      candidate({ rawMetadata: { unavailable: undefined } }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Candidate raw metadata must contain only JSON-compatible values.",
      );
    }
  });
});

describe("discovery candidate identity", () => {
  it("prioritizes company website host, LinkedIn, then stable social identity", () => {
    const identifiers = candidateIdentifiers({
      type: "company",
      name: "Signal Studio",
      canonicalUrl: "https://directory.example.com/companies/signal-studio",
      websiteUrl: "https://www.Signal-Studio.com/about",
      primarySocialUrl: "https://x.com/SignalStudio",
      linkedinUrl: "https://www.linkedin.com/company/signal-studio/",
      discoveredDescription: "An India-based collaboration platform.",
      category: "technology",
      subcategory: null,
      geography: "India",
      sourceName: "Example directory",
      sourceUrl: "https://directory.example.com/companies/signal-studio",
      discoveryScore: 80,
      rawMetadata: {},
    });

    expect(identifiers.slice(0, 3)).toEqual([
      { kind: "website_host", value: "signal-studio.com" },
      {
        kind: "linkedin_url",
        value: "https://linkedin.com/company/signal-studio",
      },
      { kind: "social_url", value: "https://x.com/SignalStudio" },
    ]);
  });

  it("prioritizes creator profile, LinkedIn, then website host", () => {
    const identifiers = candidateIdentifiers({
      type: "creator",
      name: "Ada Builds",
      canonicalUrl: "https://youtube.com/@AdaBuilds",
      websiteUrl: "https://www.adabuilds.in/work",
      primarySocialUrl: "https://youtube.com/@AdaBuilds",
      linkedinUrl: "https://linkedin.com/in/ada-builds",
      discoveredDescription: "A technology creator in India.",
      category: "technology",
      subcategory: null,
      geography: "India",
      sourceName: "YouTube",
      sourceUrl: "https://youtube.com/@AdaBuilds",
      discoveryScore: 75,
      rawMetadata: {},
    });

    expect(identifiers.slice(0, 3)).toEqual([
      { kind: "social_url", value: "https://youtube.com/@AdaBuilds" },
      {
        kind: "linkedin_url",
        value: "https://linkedin.com/in/ada-builds",
      },
      { kind: "website_host", value: "adabuilds.in" },
    ]);
  });

  it("derives a company website-host identifier from its canonical site", () => {
    const identifiers = candidateIdentifiers({
      ...candidate({
        canonicalUrl: "https://www.signal-studio.com/About",
        websiteUrl: null,
      }),
      type: "company",
      rawMetadata: {},
    });

    expect(identifiers[0]).toEqual({
      kind: "website_host",
      value: "signal-studio.com",
    });
  });

  it("prioritizes an unknown-host creator canonical profile before LinkedIn and website", () => {
    const identifiers = candidateIdentifiers({
      ...candidate({
        type: "creator",
        canonicalUrl:
          "https://podcasts.apple.com/in/podcast/signal-studio/id1234567890",
        primarySocialUrl: null,
        linkedinUrl: "https://linkedin.com/in/signal-studio",
        websiteUrl: "https://signal-studio.com/about",
      }),
      type: "creator",
      rawMetadata: {},
    });

    expect(identifiers.slice(0, 3)).toEqual([
      {
        kind: "canonical",
        value:
          "https://podcasts.apple.com/in/podcast/signal-studio/id1234567890",
      },
      {
        kind: "linkedin_url",
        value: "https://linkedin.com/in/signal-studio",
      },
      { kind: "website_host", value: "signal-studio.com" },
    ]);
  });
});

describe("candidate allocation", () => {
  it.each([
    [1, { companies: 1, creators: 0 }],
    [19, { companies: 10, creators: 9 }],
    [20, { companies: 10, creators: 10 }],
    [21, { companies: 11, creators: 10 }],
  ])("allocates %i total candidates by rounded percentage", (total, expected) => {
    expect(allocateCandidates(total, 50)).toEqual(expected);
  });
});

describe("discovery batch validation", () => {
  it("accepts the approved worker completion envelope", () => {
    expect(discoveryBatchSchema.parse(batch())).toMatchObject({
      runId: "019f85b2-f34f-7bf3-85a6-f84446175371",
      leaseToken: "opaque-lease-token",
      promptVersion: "codex-web-v1",
      sourceErrors: [],
    });
  });

  it("rejects an unapproved discovery prompt version", () => {
    const result = discoveryBatchSchema.safeParse(
      batch({ promptVersion: "wrong-version" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Discovery prompt version must be codex-web-v1.",
      );
    }
  });

  it("limits a batch to 50 candidates", () => {
    const result = discoveryBatchSchema.safeParse(
      batch({ candidates: Array.from({ length: 51 }, () => candidate()) }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Discovery batch must contain at most 50 candidates.",
      );
    }
  });

  it("limits a batch to 20 source errors", () => {
    const result = discoveryBatchSchema.safeParse(
      batch({
        sourceErrors: Array.from({ length: 21 }, (_, index) => ({
          sourceName: `source-${index}`,
          message: "Timed out while loading public results.",
        })),
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Discovery batch must contain at most 20 source errors.",
      );
    }
  });

  it("bounds source error names and messages", () => {
    for (const sourceError of [
      { sourceName: " ", message: "Timed out" },
      { sourceName: "s".repeat(101), message: "Timed out" },
      { sourceName: "Search", message: " " },
      { sourceName: "Search", message: "m".repeat(1_001) },
    ]) {
      expect(
        discoveryBatchSchema.safeParse(batch({ sourceErrors: [sourceError] }))
          .success,
      ).toBe(false);
    }
  });

  it("requires bounded lease and prompt completion data", () => {
    for (const values of [
      { leaseToken: "" },
      { leaseToken: "l".repeat(513) },
      { promptVersion: "" },
      { promptVersion: "p".repeat(101) },
    ]) {
      expect(discoveryBatchSchema.safeParse(batch(values)).success).toBe(false);
    }
  });

  it("limits a serialized batch to 512 KiB", () => {
    const candidates = Array.from({ length: 50 }, (_, index) =>
      candidate({
        name: `Signal Studio ${index}`,
        sourceUrl: `https://directory.example.com/${"s".repeat(4_000)}${index}`,
        rawMetadata: { evidence: "e".repeat(7_000) },
      }),
    );
    const result = discoveryBatchSchema.safeParse(batch({ candidates }));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.at(-1)?.message).toBe(
        "Discovery batch must be at most 524288 bytes.",
      );
    }
  });

  it("measures serialized limits before unknown fields are stripped", () => {
    const result = discoveryBatchSchema.safeParse(
      batch({ diagnostic: "x".repeat(512 * 1_024) }),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        "Discovery batch must be at most 524288 bytes.",
      );
    }
  });
});

describe("discovery URL normalization", () => {
  it("lower-cases URL hosts", () => {
    expect(normalizeDiscoveryUrl("https://EXAMPLE.COM/Profile")).toBe(
      "https://example.com/Profile",
    );
  });

  it("preserves case-sensitive URL paths", () => {
    expect(normalizeDiscoveryUrl("https://example.com/Creators/AdaLovelace")).toBe(
      "https://example.com/Creators/AdaLovelace",
    );
  });

  it("removes the www host prefix", () => {
    expect(normalizeDiscoveryUrl("https://www.example.com/team")).toBe(
      "https://example.com/team",
    );
  });

  it("removes URL fragments", () => {
    expect(normalizeDiscoveryUrl("https://example.com/team#leadership")).toBe(
      "https://example.com/team",
    );
  });

  it("removes default ports and tracking parameters", () => {
    expect(
      normalizeDiscoveryUrl(
        "https://example.com:443/team?utm_source=newsletter&fbclid=token",
      ),
    ).toBe("https://example.com/team");
  });

  it("sorts retained query parameters", () => {
    expect(normalizeDiscoveryUrl("https://example.com/team?z=2&a=1&z=1")).toBe(
      "https://example.com/team?a=1&z=1&z=2",
    );
  });

  it("removes duplicate trailing path slashes", () => {
    expect(normalizeDiscoveryUrl("https://example.com/Creators/Ada///")).toBe(
      "https://example.com/Creators/Ada",
    );
  });

  it("rejects non-HTTP(S) canonical URLs", () => {
    for (const value of ["ftp://example.com/profile", "mailto:team@example.com"]) {
      expect(() => normalizeDiscoveryUrl(value)).toThrow(
        "Discovery URL must use HTTP or HTTPS.",
      );
    }
  });

  it("rejects private and loopback canonical URLs", () => {
    for (const value of [
      "http://localhost/profile",
      "http://127.0.0.1/profile",
      "http://10.0.0.1/profile",
      "http://172.16.0.1/profile",
      "http://192.168.1.1/profile",
      "http://[::1]/profile",
      "http://service.local/profile",
    ]) {
      expect(() => normalizeDiscoveryUrl(value)).toThrow(
        "Discovery URL must use a public host.",
      );
    }
  });

  it("rejects IPv4-mapped loopback canonical URLs", () => {
    expect(() =>
      normalizeDiscoveryUrl("http://[::ffff:127.0.0.1]/profile"),
    ).toThrow("Discovery URL must use a public host.");
  });

  it("rejects search-result canonical URLs", () => {
    expect(() =>
      normalizeDiscoveryUrl("https://www.google.com/search?q=signal+studio"),
    ).toThrow("Canonical URL must identify a stable public profile.");
  });

  it("rejects article-only canonical URLs", () => {
    expect(() =>
      normalizeDiscoveryUrl(
        "https://techcrunch.com/2026/07/22/signal-studio-launches/",
      ),
    ).toThrow("Canonical URL must identify a stable public profile.");
  });
});
