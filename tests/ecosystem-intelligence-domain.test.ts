import { describe, expect, it } from "vitest";

import {
  ECOSYSTEM_TAXONOMY,
  ECOSYSTEM_TAXONOMY_VERSION,
  PHYSICAL_AI_ANALYSIS_VERSION,
  PHYSICAL_AI_CAMPAIGN_KEY,
  categoryInferencesFor,
  normalizeIndiaCity,
  normalizeIndiaState,
} from "../app/domain/ecosystem-intelligence-taxonomy";
import {
  DEFAULT_ECOSYSTEM_FILTERS,
  activeUntilForSignal,
  applyEcosystemFilterChanges,
  buildResearchGapInsights,
  calculateEvidenceCoverage,
  filtersFromSearchParams,
  isActiveSignal,
  isStrongEvidence,
  parseEcosystemFilters,
  relationshipReadiness,
  serializeEcosystemFilters,
} from "../app/domain/ecosystem-intelligence";

describe("ecosystem intelligence taxonomy", () => {
  it("keeps the approved versioned Physical AI corpus vocabulary", () => {
    expect(ECOSYSTEM_TAXONOMY_VERSION).toBe("ecosystem-intelligence-v1");
    expect(PHYSICAL_AI_CAMPAIGN_KEY).toBe("robotics_hardware_india");
    expect(PHYSICAL_AI_ANALYSIS_VERSION).toBe("physical-ai-v1");
    expect(ECOSYSTEM_TAXONOMY.physicalAiCategories).toHaveLength(8);
  });

  it("uses unique ordered stable keys with complete display metadata", () => {
    for (const kind of ECOSYSTEM_TAXONOMY.kinds) {
      const terms = ECOSYSTEM_TAXONOMY.termsByKind[kind];
      expect(new Set(terms.map((term) => term.key)).size).toBe(terms.length);
      expect(terms.map((term) => term.order)).toEqual(
        [...terms.map((term) => term.order)].sort((left, right) => left - right),
      );
      for (const term of terms) {
        expect(term.key).toMatch(/^[a-z0-9]+(?:_[a-z0-9]+)*$/);
        expect(term.label).not.toBe("");
        expect(term.shortLabel).not.toBe("");
        expect(term.description).not.toBe("");
      }
    }
  });

  it("defines business and technical context without claiming verified flows", () => {
    for (const stage of ECOSYSTEM_TAXONOMY.termsByKind.business_stage) {
      expect(stage.upstreamInputs.length).toBeGreaterThan(0);
      expect(stage.downstreamOutputs.length).toBeGreaterThan(0);
    }
    for (const layer of ECOSYSTEM_TAXONOMY.termsByKind.technical_layer) {
      expect(layer.underlyingMaterialsOrProcesses.length).toBeGreaterThan(0);
      expect(layer.robotBehaviorContribution).not.toBe("");
    }
  });

  it("gives every public signal a finite positive default freshness window", () => {
    for (const signal of ECOSYSTEM_TAXONOMY.termsByKind.signal_type) {
      expect(signal.defaultFreshnessDays).toBeGreaterThan(0);
      expect(Number.isFinite(signal.defaultFreshnessDays)).toBe(true);
    }
  });

  it("normalizes only registered state and city aliases", () => {
    expect(normalizeIndiaState("  Karnataka ")).toBe("karnataka");
    expect(normalizeIndiaState("orissa")).toBe("odisha");
    expect(normalizeIndiaCity("Bangalore")).toBe("bengaluru");
    expect(normalizeIndiaCity("Unmapped place")).toBeUndefined();
  });

  it("returns only registered inferred classifications for a Physical AI category", () => {
    const classifications = categoryInferencesFor("components and actuation");
    expect(classifications.length).toBeGreaterThan(0);
    for (const classification of classifications) {
      expect(
        ECOSYSTEM_TAXONOMY.termsByKind[classification.kind].some(
          (term) => term.key === classification.termKey,
        ),
      ).toBe(true);
      expect(classification.evidenceState).toBe("inferred");
    }
    expect(categoryInferencesFor("unregistered category")).toEqual([]);
  });
});

describe("ecosystem intelligence filters", () => {
  it("uses the bounded corpus and default analytical view", () => {
    expect(DEFAULT_ECOSYSTEM_FILTERS).toMatchObject({
      participantType: "company",
      analysisVersion: "physical-ai-v1",
      reviewStatuses: ["discovered", "shortlisted", "queued_for_profile"],
      page: 1,
      pageSize: 25,
    });
  });

  it("accepts unknown, multi-value taxonomy filters, ordered dates, and valid score semantics", () => {
    const filters = parseEcosystemFilters({
      ecosystemDomain: ["drones", "robotics"],
      businessStage: ["system_integration", "component_manufacturing"],
      headquartersState: "unknown",
      evidenceFreshness: "stale",
      minimumDiscoveryConfidence: "75",
      discoveredAfter: "2026-01-01",
      discoveredBefore: "2026-07-29",
      page: "3",
      pageSize: "100",
      sort: "name",
      direction: "asc",
    });

    expect(filters).toMatchObject({
      ecosystemDomains: ["robotics", "drones"],
      businessStages: ["component_manufacturing", "system_integration"],
      headquartersStates: ["unknown"],
      evidenceFreshness: "stale",
      minimumDiscoveryConfidence: 75,
      discoveredAfter: "2026-01-01",
      discoveredBefore: "2026-07-29",
      page: 3,
      pageSize: 100,
      sort: "name",
      direction: "asc",
    });
  });

  it("rejects invalid taxonomy keys, unknown fields, invalid confidence, reversed dates, and page sizes above 100", () => {
    for (const value of [
      { ecosystemDomain: "not_a_domain" },
      { unexpected: "filter" },
      { minimumDiscoveryConfidence: "50.5" },
      { discoveredAfter: "2026-07-30", discoveredBefore: "2026-07-29" },
      { pageSize: "101" },
    ]) {
      expect(() => parseEcosystemFilters(value)).toThrow();
    }
  });

  it.each(["current", "stale", "unknown"] as const)(
    "accepts the %s evidence freshness bucket",
    (evidenceFreshness) => {
      expect(parseEcosystemFilters({ evidenceFreshness }).evidenceFreshness).toBe(
        evidenceFreshness,
      );
    },
  );

  it("parses URLSearchParams and serializes a stable minimal canonical URL", () => {
    const filters = filtersFromSearchParams(
      new URLSearchParams(
        "businessStage=system_integration&businessStage=component_manufacturing&ecosystemDomain=drones&ecosystemDomain=robotics&page=4",
      ),
    );
    const serialized = serializeEcosystemFilters(filters);
    expect(serialized).toBe(
      "businessStage=component_manufacturing&businessStage=system_integration&ecosystemDomain=robotics&ecosystemDomain=drones&page=4",
    );
    expect(
      serializeEcosystemFilters(
        parseEcosystemFilters({
          ecosystemDomain: ["robotics", "drones"],
          businessStage: ["component_manufacturing", "system_integration"],
          page: "4",
        }),
      ),
    ).toBe(serialized);
  });

  it("resets the page when an analytical filter changes", () => {
    const filters = applyEcosystemFilterChanges(
      parseEcosystemFilters({ page: "6" }),
      { ecosystemDomains: ["robotics"] },
    );
    expect(filters.page).toBe(1);
  });
});

describe("ecosystem intelligence evidence and readiness", () => {
  it("calculates the five evidence dimensions and distinguishes inferred classification", () => {
    expect(
      calculateEvidenceCoverage({
        candidateSourceEvidence: true,
        currentSystemsContext: true,
        classification: "inferred",
        resolvedHeadquarters: true,
        publicProfessionalContact: true,
      }),
    ).toMatchObject({ score: 90, numerator: 90, denominator: 100 });
  });

  it("requires an evidence-backed classification for strong evidence", () => {
    expect(
      isStrongEvidence(
        calculateEvidenceCoverage({
          candidateSourceEvidence: true,
          currentSystemsContext: true,
          classification: "inferred",
          resolvedHeadquarters: true,
          publicProfessionalContact: true,
        }),
      ),
    ).toBe(false);
    expect(
      isStrongEvidence(
        calculateEvidenceCoverage({
          candidateSourceEvidence: true,
          currentSystemsContext: true,
          classification: "evidence_backed",
          resolvedHeadquarters: true,
          publicProfessionalContact: true,
        }),
      ),
    ).toBe(true);
  });

  it("uses the earlier explicit or default signal expiry at the supplied clock", () => {
    const signal = { type: "product_launch", occurredAt: "2026-01-01", expiresAt: "2026-01-10" } as const;
    expect(activeUntilForSignal(signal)?.toISOString().slice(0, 10)).toBe("2026-01-10");
    expect(isActiveSignal(signal, new Date("2026-01-10T00:00:00.000Z"))).toBe(false);
    expect(
      isActiveSignal(
        { type: "product_launch", occurredAt: "2026-01-01" },
        new Date("2026-01-02T00:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("reports relationship readiness only at eight evidenced edges spanning five candidates", () => {
    expect(relationshipReadiness({ evidencedEdges: 7, candidates: 5 }).ready).toBe(false);
    expect(relationshipReadiness({ evidencedEdges: 8, candidates: 5 })).toMatchObject({
      ready: true,
      evidencedEdges: 8,
      candidates: 5,
    });
  });

  it("builds thresholded, safe research-gap insights with preserved counts", () => {
    const insights = buildResearchGapInsights({
      representation: { numerator: 2, denominator: 10, targetPercent: 40, label: "Technical layers" },
      geographicConcentration: { numerator: 4, denominator: 5, label: "Karnataka" },
      missingData: { numerator: 3, denominator: 10, label: "Resolved headquarters" },
      publicContacts: { numerator: 1, denominator: 4, label: "Public professional contacts" },
      dependencySignals: { numerator: 3, denominator: 3, label: "Dependency-related signals" },
      staleEvidence: { numerator: 3, denominator: 10, label: "Current evidence" },
    });
    expect(insights.length).toBe(6);
    for (const insight of insights) {
      expect(insight.numerator).toBeGreaterThanOrEqual(0);
      expect(insight.denominator).toBeGreaterThan(0);
      expect(`${insight.title} ${insight.copy}`.toLowerCase()).not.toMatch(
        /shortage|does not exist|opportunity/,
      );
    }
  });
});
