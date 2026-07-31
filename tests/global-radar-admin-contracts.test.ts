import { describe, expect, it } from "vitest";

import { canonicalizeGlobalRadarAdminClassification } from "../db/repositories/global-radar-admin-classification";
import {
  canonicalizeGlobalRadarAdminEvidence,
  isGlobalRadarEvidenceContributorEligible,
} from "../db/repositories/global-radar-admin-evidence";
import {
  createGlobalRadarClassificationGraph,
  createGlobalRadarDedupeLockKey,
  isGlobalRadarActiveDedupeConflict,
} from "../db/repositories/global-radar-admin-classification-transaction";
import {
  deriveGlobalRadarAdminMomentum,
  MAX_GLOBAL_RADAR_ADMIN_MOMENTUM_EVIDENCE,
} from "../db/repositories/global-radar-admin-momentum";
import {
  boundGlobalRadarCollisionCandidateIds,
  canonicalizeGlobalRadarWatchlistConfiguration,
} from "../db/repositories/global-radar-admin-watchlist";
import {
  assembleGlobalRadarWatchlistEnrichment,
  countGlobalRadarSignalsObservedToday,
  globalRadarAllowedActions,
  isGlobalRadarAdminSignalId,
  isGlobalRadarEntityQualifiableStatus,
} from "../db/repositories/global-radar-admin-read-model";

const now = new Date("2026-07-30T16:00:00.000Z");

describe("Global Radar administrator classification contracts", () => {
  it("rebuilds every entity into the canonical target-class graph", () => {
    const current = {
      primaryEntityId: "00000000-0000-4000-8000-000000000001",
      associations: [
        { entityId: "00000000-0000-4000-8000-000000000002" },
        { entityId: "00000000-0000-4000-8000-000000000003" },
      ],
    };
    expect(
      createGlobalRadarClassificationGraph({
        ...current,
        targetClass: "ecosystem_momentum",
        requestedPrimaryEntityId: null,
      }),
    ).toEqual({
      primaryEntityId: null,
      associations: [
        {
          entityId: "00000000-0000-4000-8000-000000000001",
          role: "contributor",
        },
        {
          entityId: "00000000-0000-4000-8000-000000000002",
          role: "contributor",
        },
        {
          entityId: "00000000-0000-4000-8000-000000000003",
          role: "contributor",
        },
      ],
    });
    expect(
      createGlobalRadarClassificationGraph({
        primaryEntityId: null,
        associations: [
          { entityId: "00000000-0000-4000-8000-000000000001" },
          { entityId: "00000000-0000-4000-8000-000000000002" },
          { entityId: "00000000-0000-4000-8000-000000000003" },
        ],
        targetClass: "demand_precursor",
        requestedPrimaryEntityId:
          "00000000-0000-4000-8000-000000000002",
      }),
    ).toEqual({
      primaryEntityId: "00000000-0000-4000-8000-000000000002",
      associations: [
        {
          entityId: "00000000-0000-4000-8000-000000000001",
          role: "supporting",
        },
        {
          entityId: "00000000-0000-4000-8000-000000000003",
          role: "supporting",
        },
      ],
    });
  });

  it("derives a stable advisory key and recognizes only the active-dedupe constraint", () => {
    const key = createGlobalRadarDedupeLockKey("a".repeat(64));
    expect(key).toBe(createGlobalRadarDedupeLockKey("a".repeat(64)));
    expect(key).not.toBe(createGlobalRadarDedupeLockKey("b".repeat(64)));
    expect(isGlobalRadarActiveDedupeConflict({
      code: "23505",
      constraint_name: "global_radar_signals_active_dedupe_unique",
    })).toBe(true);
    expect(isGlobalRadarActiveDedupeConflict({ code: "23505" })).toBe(false);
    expect(
      isGlobalRadarActiveDedupeConflict({
        cause: {
          code: "23505",
          constraint: "global_radar_signals_active_dedupe_unique",
        },
      }),
    ).toBe(true);
  });

  it("recomputes class-local scores for every target class", () => {
    const direct = canonicalizeGlobalRadarAdminClassification(
      {
        signalClass: "direct_demand",
        signalType: "procurement",
        demandDomain: "robot_learning_and_manipulation",
        components: {
          explicitness: 90,
          evidenceConfidence: 85,
          freshness: 80,
          actionability: 80,
          indiaFit: 75,
          commercialPotential: 75,
          repeatability: 70,
          responseAccessibility: 70,
          strategicLearning: 70,
          complianceComplexity: 20,
        },
        activity: {
          evergreen: false,
          expiresAt: "2026-09-30T00:00:00.000Z",
          reobserveBy: null,
        },
      },
      now,
    );
    const precursor = canonicalizeGlobalRadarAdminClassification(
      {
        signalClass: "demand_precursor",
        signalType: "funding",
        demandDomain: "robot_learning_and_manipulation",
        components: {
          evidenceConfidence: 80,
          proximityToExternalDemand: 70,
          fundingDeploymentMomentum: 80,
          likelyDataHardwareIntensity: 70,
          indiaFit: 80,
          estimatedTimeHorizon: 80,
          strategicRelevance: 75,
        },
      },
      now,
    );
    const momentum = canonicalizeGlobalRadarAdminClassification(
      {
        signalClass: "ecosystem_momentum",
        signalType: "ecosystem_direction",
        demandDomain: "robot_learning_and_manipulation",
        components: {
          taxonomyConsistency: 85,
          evidenceQuality: 80,
        },
      },
      now,
    );

    expect(direct).toMatchObject({
      signalClass: "direct_demand",
      score: expect.any(Number),
      scoreCoverage: 100,
    });
    expect(precursor).toMatchObject({
      signalClass: "demand_precursor",
      score: expect.any(Number),
      scoreCoverage: 100,
    });
    expect(momentum).toMatchObject({
      signalClass: "ecosystem_momentum",
      components: { taxonomyConsistency: 85, evidenceQuality: 80 },
    });
    expect(canonicalizeGlobalRadarAdminClassification(
      {
        signalClass: "direct_demand",
        signalType: "funding",
        demandDomain: "robot_learning_and_manipulation",
        components: {
          explicitness: 90,
          evidenceConfidence: 85,
          freshness: 80,
          actionability: 80,
          indiaFit: 75,
          commercialPotential: 75,
          repeatability: 70,
          responseAccessibility: 70,
          strategicLearning: 70,
          complianceComplexity: 20,
        },
        activity: {
          evergreen: false,
          expiresAt: "2026-09-30T00:00:00.000Z",
          reobserveBy: null,
        },
      },
      now,
    )).toBeNull();
    expect(canonicalizeGlobalRadarAdminClassification(
      {
        signalClass: "demand_precursor",
        signalType: "supplier_registration",
        demandDomain: "robot_learning_and_manipulation",
        components: {
          evidenceConfidence: 80,
          proximityToExternalDemand: 70,
          fundingDeploymentMomentum: 80,
          likelyDataHardwareIntensity: 70,
          indiaFit: 80,
          estimatedTimeHorizon: 80,
          strategicRelevance: 75,
        },
      },
      now,
    )).toBeNull();
    expect(canonicalizeGlobalRadarAdminClassification(
      {
        signalClass: "ecosystem_momentum",
        signalType: "platform_launch",
        demandDomain: "robot_learning_and_manipulation",
        components: { taxonomyConsistency: 85, evidenceQuality: 80 },
      },
      now,
    )).toBeNull();
  });

  it("derives momentum windows, components, score, and gates from eligible evidence", () => {
    const result = deriveGlobalRadarAdminMomentum({
      taxonomy: "robot_learning_and_manipulation",
      taxonomyConsistency: 85,
      evidenceQuality: 80,
      now,
      associations: [
        { entityId: "entity-a", role: "contributor" },
        { entityId: "entity-b", role: "contributor" },
      ],
      entities: [
        { id: "entity-a", canonicalCorporateGroupId: "group-a" },
        { id: "entity-b", canonicalCorporateGroupId: "group-b" },
      ],
      evidence: [
        {
          id: "evidence-admin",
          runId: null,
          entityId: "entity-a",
          sourceId: "source-a",
          sourceFamily: "official_company_material",
          isPrimarySource: true,
          isSyndicated: false,
          observedAt: new Date("2026-07-29T16:00:00.000Z"),
        },
        {
          id: "evidence-run",
          runId: "run-1",
          entityId: "entity-b",
          sourceId: "source-b",
          sourceFamily: "official_research",
          isPrimarySource: false,
          isSyndicated: false,
          observedAt: new Date("2026-07-28T16:00:00.000Z"),
        },
        {
          id: "evidence-preceding",
          runId: "run-older",
          entityId: "entity-b",
          sourceId: "source-b-older",
          sourceFamily: "official_research",
          isPrimarySource: false,
          isSyndicated: false,
          observedAt: new Date("2026-04-21T16:00:00.000Z"),
        },
      ],
    });
    expect(result).toMatchObject({
      outcome: "derived",
      derivation: {
        counts: {
          evidenceItems: 2,
          independentEntities: 2,
          primarySources: 1,
          sourceFamilies: 2,
        },
        windows: {
          days7: { recent: 2 },
          days30: { recent: 2 },
          days90: { recent: 2, preceding: 1 },
        },
        qualificationGatesPassed: true,
        score: expect.any(Number),
      },
    });
  });

  it("rejects momentum evidence beyond the bounded 25k plus sentinel read", () => {
    const evidence = Array.from(
      { length: MAX_GLOBAL_RADAR_ADMIN_MOMENTUM_EVIDENCE + 1 },
      (_, index) => ({
        id: `evidence-${index}`,
        runId: null,
        entityId: "entity-a",
        sourceId: `source-${index}`,
        sourceFamily: "official_company_material",
        isPrimarySource: index === 0,
        isSyndicated: false,
        observedAt: new Date("2026-07-29T16:00:00.000Z"),
      }),
    );
    expect(
      deriveGlobalRadarAdminMomentum({
        taxonomy: "robot_learning_and_manipulation",
        taxonomyConsistency: 85,
        evidenceQuality: 80,
        now,
        associations: [{ entityId: "entity-a", role: "contributor" }],
        entities: [
          { id: "entity-a", canonicalCorporateGroupId: "group-a" },
        ],
        evidence,
      }),
    ).toEqual({ outcome: "conflict", reason: "invalid_input" });
  });
});

describe("Global Radar administrator evidence contracts", () => {
  function evidence() {
    return {
      globalEntityId: null,
      sourceUrl: "https://public-evidence.example/update?utm_source=client",
      canonicalSourceUrl: "https://client-proposal.example/not-authoritative",
      sourceName: "Public update",
      sourceType: "official_update",
      sourceLanguage: "en",
      sourceCountry: "United States",
      sourceFamily: "official_company_material" as const,
      claim: "The organisation published a concise dated update.",
      sourceExcerpt: "A concise public update.",
      englishSummary: "The organisation published a concise dated update.",
      publishedAt: "2026-07-30T12:00:00.000Z",
      observedAt: "2026-07-30T15:30:00.000Z",
      evidenceConfidence: 85,
      translationConfidence: null,
      isPrimarySource: true,
      isSyndicated: false,
      supportsDirectDemand: false,
      supportsIndiaRelevance: false,
      supportedFieldPaths: ["signal.factualSummary"],
      rawMetadata: { clientControlled: "must not persist" },
    };
  }

  it("derives canonical URL, observation time, and raw metadata on the server", () => {
    expect(canonicalizeGlobalRadarAdminEvidence(evidence(), now)).toMatchObject({
      sourceUrl: "https://public-evidence.example/update",
      canonicalSourceUrl: "https://public-evidence.example/update",
      observedAt: now.toISOString(),
      rawMetadata: {},
    });
  });

  it("derives support flags from field provenance instead of caller booleans", () => {
    expect(
      canonicalizeGlobalRadarAdminEvidence(
        {
          ...evidence(),
          supportsDirectDemand: true,
          supportsIndiaRelevance: true,
          supportedFieldPaths: ["signal.factualSummary"],
        },
        now,
      ),
    ).toMatchObject({
      supportsDirectDemand: false,
      supportsIndiaRelevance: false,
    });
    expect(
      canonicalizeGlobalRadarAdminEvidence(
        {
          ...evidence(),
          supportsDirectDemand: false,
          supportsIndiaRelevance: false,
          supportedFieldPaths: [
            "directDemandAsk.data_collection_request",
            "indiaRelevance.existing_India_presence.manufacturing",
          ],
        },
        now,
      ),
    ).toMatchObject({
      supportsDirectDemand: true,
      supportsIndiaRelevance: true,
    });
    expect(
      canonicalizeGlobalRadarAdminEvidence(
        {
          ...evidence(),
          supportsDirectDemand: true,
          supportedFieldPaths: ["directDemandAsk.not_a_real_type"],
        },
        now,
      ),
    ).toBeNull();
  });

  it("still rejects a future client observation proposal", () => {
    expect(
      canonicalizeGlobalRadarAdminEvidence(
        { ...evidence(), observedAt: "2026-07-31T00:00:00.000Z" },
        now,
      ),
    ).toBeNull();
  });

  it("rejects publication after server observation and unrelated contributors", () => {
    expect(
      canonicalizeGlobalRadarAdminEvidence(
        { ...evidence(), publishedAt: "2026-07-31T00:00:00.000Z" },
        now,
      ),
    ).toBeNull();
    expect(
      isGlobalRadarEvidenceContributorEligible({
        contributorEntityId: "entity-unrelated",
        primaryEntityId: "entity-primary",
        associatedEntityIds: ["entity-supporting"],
      }),
    ).toBe(false);
    expect(
      isGlobalRadarEvidenceContributorEligible({
        contributorEntityId: "entity-supporting",
        primaryEntityId: "entity-primary",
        associatedEntityIds: ["entity-supporting"],
      }),
    ).toBe(true);
  });
});

describe("Global Radar administrator watchlist contracts", () => {
  function configuration() {
    return {
      state: "enabled" as const,
      priority: 80,
      theme: "robotics_manufacturing",
      category: "component_suppliers",
      categorySearchTermEn: "robotics component suppliers",
      categorySearchTermZhCn: "机器人零部件供应商",
      countries: ["United States"],
      languages: ["en"],
      cadenceDays: 7,
      nextScanAt: "2026-08-01T00:00:00.000Z",
    };
  }

  it("requires a strict future ISO timestamp for enabled scans", () => {
    expect(
      canonicalizeGlobalRadarWatchlistConfiguration(
        { ...configuration(), nextScanAt: "2026-08-01" },
        now,
      ),
    ).toBeNull();
    expect(
      canonicalizeGlobalRadarWatchlistConfiguration(configuration(), now),
    ).toMatchObject({
      nextScanAt: new Date("2026-08-01T00:00:00.000Z"),
    });
  });

  it("enforces China localization case-insensitively", () => {
    expect(
      canonicalizeGlobalRadarWatchlistConfiguration(
        {
          ...configuration(),
          countries: ["china"],
          categorySearchTermZhCn: null,
        },
        now,
      ),
    ).toBeNull();
    expect(
      canonicalizeGlobalRadarWatchlistConfiguration(
        {
          ...configuration(),
          countries: ["cn"],
          categorySearchTermZhCn: null,
        },
        now,
      ),
    ).toBeNull();
  });

  it("deduplicates and bounds collision-candidate metadata", () => {
    const ids = Array.from(
      { length: 150 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    expect(boundGlobalRadarCollisionCandidateIds([ids[0]!, ...ids])).toEqual(
      ids.slice(0, 100),
    );
  });
});

describe("Global Radar watchlist read enrichment", () => {
  it("selects the latest safe signal, expiry, and successful promotion per entity", () => {
    const signal = (id: string, observedAt: string) => ({
      id,
      signalClass: "direct_demand" as const,
      title: `Signal ${id}`,
      factualSummary: "Publicly supported fact.",
      theme: "robotics_manufacturing",
      sourceCountry: "China",
      demandDomain: "robotics_manufacturing",
      indiaRelevanceType: "globally_open" as const,
      status: "qualified" as const,
      score: 80,
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      reobserveBy: null,
      observedAt: new Date(observedAt),
      revision: 2,
      entity: null,
    });

    expect(
      assembleGlobalRadarWatchlistEnrichment({
        globalEntityIds: ["entity-a", "entity-b"],
        signals: [
          {
            signal: signal("new", "2026-07-30T00:00:00.000Z"),
            globalEntityIds: ["entity-a"],
          },
          {
            signal: signal("old", "2026-07-01T00:00:00.000Z"),
            globalEntityIds: ["entity-a", "entity-b"],
          },
        ],
        promotions: [
          {
            id: "promotion-a",
            globalEntityId: "entity-a",
            status: "reversed",
            discoveryCandidateId: "candidate-a",
            promotedAt: new Date("2026-07-20T00:00:00.000Z"),
            reversedAt: new Date("2026-07-29T00:00:00.000Z"),
            updatedAt: new Date("2026-07-29T00:00:00.000Z"),
          },
        ],
      }),
    ).toEqual([
      {
        globalEntityId: "entity-a",
        latestSignal: expect.objectContaining({ id: "new" }),
        expiry: {
          expiresAt: new Date("2026-09-01T00:00:00.000Z"),
          reobserveBy: null,
        },
        promotion: expect.objectContaining({
          id: "promotion-a",
          status: "reversed",
        }),
      },
      {
        globalEntityId: "entity-b",
        latestSignal: expect.objectContaining({ id: "old" }),
        expiry: {
          expiresAt: new Date("2026-09-01T00:00:00.000Z"),
          reobserveBy: null,
        },
        promotion: null,
      },
    ]);
  });
});

describe("Global Radar administrator safe read contracts", () => {
  it("counts new signals in the current Asia/Kolkata calendar day", () => {
    expect(
      countGlobalRadarSignalsObservedToday(
        [
          new Date("2026-07-29T18:29:59.999Z"),
          new Date("2026-07-29T18:30:00.000Z"),
          new Date("2026-07-30T12:00:00.000Z"),
          new Date("2026-07-30T18:30:00.000Z"),
        ],
        new Date("2026-07-30T16:00:00.000Z"),
      ),
    ).toBe(2);
  });

  it("accepts only structurally valid UUID signal identifiers", () => {
    expect(
      isGlobalRadarAdminSignalId("00000000-0000-4000-8000-000000000001"),
    ).toBe(true);
    expect(isGlobalRadarAdminSignalId("00000000-0000-0000-0000-000000000001")).toBe(false);
    expect(isGlobalRadarAdminSignalId("------------------------------------")).toBe(false);
  });

  it("limits explicit entity qualification to safe pre-promotion states", () => {
    for (const status of ["observed", "watchlisted", "monitoring"]) {
      expect(isGlobalRadarEntityQualifiableStatus(status)).toBe(true);
    }
    for (const status of [
      "qualified",
      "archived",
      "promoted_to_candidate",
      "unknown",
      null,
    ]) {
      expect(isGlobalRadarEntityQualifiableStatus(status)).toBe(false);
    }
  });

  it("derives actions from current safe state and disables merged history", () => {
    expect(
      globalRadarAllowedActions({
        signalClass: "direct_demand",
        status: "qualified",
        mergedIntoSignalId: null,
        hasOrganisation: true,
        hasQualifiablePromotionEntity: true,
        hasActivePromotion: false,
      }),
    ).toEqual(
      expect.arrayContaining([
        "monitor",
        "edit_expiry",
        "edit_watchlist",
        "qualify_entity",
        "promote",
      ]),
    );
    expect(
      globalRadarAllowedActions({
        signalClass: "demand_precursor",
        status: "dismissed",
        mergedIntoSignalId: "00000000-0000-4000-8000-000000000002",
        hasOrganisation: true,
        hasActivePromotion: false,
      }),
    ).toEqual([]);
    expect(
      globalRadarAllowedActions({
        signalClass: "demand_precursor",
        status: "dismissed",
        mergedIntoSignalId: null,
        hasOrganisation: true,
        hasActivePromotion: false,
      }),
    ).not.toContain("edit_classification");
    expect(
      globalRadarAllowedActions({
        signalClass: "demand_precursor",
        status: "monitoring",
        mergedIntoSignalId: null,
        hasOrganisation: true,
        hasQualifiablePromotionEntity: true,
        hasActivePromotion: false,
      }),
    ).toContain("edit_classification");
    expect(
      globalRadarAllowedActions({
        signalClass: "demand_precursor",
        status: "monitoring",
        mergedIntoSignalId: null,
        hasOrganisation: true,
        hasQualifiablePromotionEntity: true,
        hasActivePromotion: false,
      }),
    ).not.toContain("qualify_entity");
    expect(
      globalRadarAllowedActions({
        signalClass: "ecosystem_momentum",
        status: "qualified",
        mergedIntoSignalId: null,
        hasOrganisation: false,
        hasPromotionEntity: true,
        hasQualifiablePromotionEntity: true,
        hasActivePromotion: false,
      }),
    ).toEqual(expect.arrayContaining(["qualify_entity", "promote"]));
  });
});
