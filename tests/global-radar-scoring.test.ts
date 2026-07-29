import { describe, expect, it } from "vitest";

import {
  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
  assessDirectDemandActivity,
  calculateFreshness,
  calculateTimeHorizon,
  createGlobalRadarMomentumPolicy,
  deriveEcosystemMomentum,
  scoreDemandPrecursor,
  scoreDirectDemand,
  scoreEcosystemMomentum,
} from "../app/domain/global-radar";
import type {
  DirectDemandScoreResult,
  MomentumDerivationResult,
  PrecursorScoreResult,
} from "../app/domain/global-radar";

function assertDeeplyReadonlyScoreResults(
  direct: DirectDemandScoreResult,
  precursor: PrecursorScoreResult,
  momentum: MomentumDerivationResult,
): void {
  if (direct.valid) {
    // @ts-expect-error Successful result components are deeply readonly.
    direct.components.explicitness = 0;
  }
  if (precursor.valid) {
    // @ts-expect-error Successful result components are deeply readonly.
    precursor.components.indiaFit = 0;
  }
  if (momentum.valid) {
    // @ts-expect-error Successful derived components are deeply readonly.
    momentum.components.weightedVolume = 0;
    // @ts-expect-error Successful derived counts are deeply readonly.
    momentum.counts.evidenceItems = 0;
    // @ts-expect-error Successful derived windows are deeply readonly.
    momentum.windows.days7.recent = 0;
  }
}

void assertDeeplyReadonlyScoreResults;

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW = "2026-07-29T12:00:00.000Z";

function clockAt(isoTimestamp: string) {
  return Object.freeze({ now: () => new Date(isoTimestamp) });
}

function relativeIso(days: number, milliseconds = 0): string {
  return new Date(
    Date.parse(NOW) + days * DAY_MS + milliseconds,
  ).toISOString();
}

const completeDirectComponents = {
  explicitness: 0,
  evidenceConfidence: 0,
  freshness: 0,
  actionability: 0,
  indiaFit: 0,
  commercialPotential: 0,
  repeatability: 0,
  responseAccessibility: 0,
  strategicLearning: 0,
  complianceComplexity: 100,
} as const;

const completePrecursorComponents = {
  evidenceConfidence: 0,
  proximityToExternalDemand: 0,
  fundingDeploymentMomentum: 0,
  likelyDataHardwareIntensity: 0,
  indiaFit: 0,
  estimatedTimeHorizon: 0,
  strategicRelevance: 0,
} as const;

const zeroMomentumComponents = {
  independentEntityBreadth: 0,
  primarySourceDepth: 0,
  sourceDiversity: 0,
  weightedVolume: 0,
  growthVsPreceding: 0,
  taxonomyConsistency: 0,
  evidenceQuality: 0,
} as const;

const momentumPolicy = {
  version: "robot-learning-momentum-v1",
  taxonomy: "robot_learning_and_manipulation",
  volumeTargets: { days7: 2, days30: 4, days90: 6 },
  windowWeights: { days7: 50, days30: 30, days90: 20 },
} as const;

const sourceFamilies = [
  "official_company_material",
  "official_partner_supplier_pages",
  "public_procurement_and_rfp_portals",
  "official_research",
] as const;

function momentumObservation(
  id: string,
  ageDays: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    evidenceId: `evidence:${id}`,
    entityId: `entity:${id}`,
    corporateGroupId: `group:${id}`,
    sourceId: `source:${id}`,
    sourceFamily: sourceFamilies[Number(id) % sourceFamilies.length] ?? sourceFamilies[0],
    isPrimarySource: true,
    observedAt: relativeIso(-ageDays),
    ...overrides,
  };
}

function momentumInput(overrides: Record<string, unknown> = {}) {
  return {
    taxonomy: "robot_learning_and_manipulation",
    taxonomyConsistency: 100,
    evidenceQuality: 100,
    observations: [
      momentumObservation("0", 1),
      momentumObservation("1", 6),
      momentumObservation("2", 8),
      momentumObservation("3", 20),
      momentumObservation("4", 31),
      momentumObservation("5", 60),
      momentumObservation("6", 91),
      momentumObservation("7", 150),
    ],
    ...overrides,
  };
}

describe("Global Radar scoring", () => {
  it("publishes the immutable locked momentum policy for each taxonomy", () => {
    const policy = createGlobalRadarMomentumPolicy(
      "robot_learning_and_manipulation",
    );

    expect(policy).toEqual({
      version: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
      taxonomy: "robot_learning_and_manipulation",
      volumeTargets: { days7: 2, days30: 4, days90: 8 },
      windowWeights: { days7: 50, days30: 30, days90: 20 },
    });
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.volumeTargets)).toBe(true);
    expect(Object.isFrozen(policy.windowWeights)).toBe(true);
  });

  it("scores direct demand with the exact class-local weights", () => {
    expect(
      scoreDirectDemand({
        explicitness: 100,
        evidenceConfidence: 100,
        freshness: 100,
        actionability: 100,
        indiaFit: 100,
        commercialPotential: 100,
        repeatability: 100,
        responseAccessibility: 100,
        strategicLearning: 100,
        complianceComplexity: 0,
      }),
    ).toMatchObject({
      valid: true,
      signalClass: "direct_demand",
      scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
      score: 100,
      scoreCoverage: 100,
      qualificationGatesPassed: true,
    });
  });

  it.each([
    ["explicitness", 100, 18],
    ["evidenceConfidence", 100, 12],
    ["freshness", 100, 10],
    ["actionability", 100, 14],
    ["indiaFit", 100, 12],
    ["commercialPotential", 100, 12],
    ["repeatability", 100, 7],
    ["responseAccessibility", 100, 5],
    ["strategicLearning", 100, 5],
    ["complianceComplexity", 0, 5],
  ] as const)("applies the direct %s component weight", (field, value, score) => {
    expect(
      scoreDirectDemand({
        ...completeDirectComponents,
        [field]: value,
      }),
    ).toMatchObject({ valid: true, score, scoreCoverage: 100 });
  });

  it("normalizes known direct components at 80 percent coverage and preserves nulls", () => {
    const result = scoreDirectDemand({
      explicitness: 80,
      evidenceConfidence: 80,
      freshness: 80,
      actionability: 80,
      indiaFit: 80,
      commercialPotential: 80,
      repeatability: 80,
      responseAccessibility: null,
      strategicLearning: null,
      complianceComplexity: null,
    });

    expect(result).toMatchObject({
      valid: true,
      score: 80,
      scoreCoverage: 85,
      components: {
        responseAccessibility: null,
        strategicLearning: null,
        complianceComplexity: null,
      },
    });
    expect(result.valid && Object.isFrozen(result.components)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns a null direct composite below 80 percent coverage or with a missing required component", () => {
    expect({
      belowCoverage: scoreDirectDemand({
        explicitness: 80,
        evidenceConfidence: 80,
        freshness: null,
        actionability: 80,
        indiaFit: 80,
        commercialPotential: 80,
        repeatability: 80,
        responseAccessibility: null,
        strategicLearning: null,
        complianceComplexity: null,
      }),
      missingRequired: scoreDirectDemand({
        ...completeDirectComponents,
        explicitness: null,
      }),
    }).toMatchObject({
      belowCoverage: { valid: true, score: null, scoreCoverage: 75 },
      missingRequired: { valid: true, score: null, scoreCoverage: 82 },
    });
  });

  it.each([
    [75, 60, true],
    [74, 100, false],
    [100, 59, false],
  ] as const)(
    "enforces direct qualification gates for explicitness %i and evidence confidence %i",
    (explicitness, evidenceConfidence, qualificationGatesPassed) => {
      expect(
        scoreDirectDemand({
          ...completeDirectComponents,
          explicitness,
          evidenceConfidence,
        }),
      ).toMatchObject({ valid: true, qualificationGatesPassed });
    },
  );

  it("fails closed for malformed or non-strict direct component input", () => {
    expect([
      scoreDirectDemand({ ...completeDirectComponents, explicitness: 100.5 }),
      scoreDirectDemand({ ...completeDirectComponents, freshness: 101 }),
      scoreDirectDemand({ ...completeDirectComponents, extra: 1 }),
    ]).toEqual([
      { valid: false, reason: "invalid_direct_demand_components" },
      { valid: false, reason: "invalid_direct_demand_components" },
      { valid: false, reason: "invalid_direct_demand_components" },
    ]);
  });

  it.each([
    ["evidenceConfidence", 20],
    ["proximityToExternalDemand", 20],
    ["fundingDeploymentMomentum", 15],
    ["likelyDataHardwareIntensity", 15],
    ["indiaFit", 15],
    ["estimatedTimeHorizon", 5],
    ["strategicRelevance", 10],
  ] as const)("applies the precursor %s component weight", (field, score) => {
    expect(
      scoreDemandPrecursor({
        ...completePrecursorComponents,
        [field]: 100,
      }),
    ).toMatchObject({
      valid: true,
      signalClass: "demand_precursor",
      scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
      score,
      scoreCoverage: 100,
    });
  });

  it("normalizes precursor components at exact coverage and preserves unknowns", () => {
    const result = scoreDemandPrecursor({
      evidenceConfidence: 80,
      proximityToExternalDemand: 80,
      fundingDeploymentMomentum: 80,
      likelyDataHardwareIntensity: null,
      indiaFit: 80,
      estimatedTimeHorizon: null,
      strategicRelevance: 80,
    });

    expect(result).toMatchObject({
      valid: true,
      score: 80,
      scoreCoverage: 80,
      components: {
        likelyDataHardwareIntensity: null,
        estimatedTimeHorizon: null,
      },
    });
    expect(result.valid && Object.isFrozen(result.components)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("returns a null precursor composite below coverage or with a missing required component", () => {
    expect({
      belowCoverage: scoreDemandPrecursor({
        evidenceConfidence: 80,
        proximityToExternalDemand: 80,
        fundingDeploymentMomentum: 80,
        likelyDataHardwareIntensity: null,
        indiaFit: 80,
        estimatedTimeHorizon: 80,
        strategicRelevance: null,
      }),
      missingRequired: scoreDemandPrecursor({
        ...completePrecursorComponents,
        evidenceConfidence: null,
      }),
    }).toMatchObject({
      belowCoverage: { valid: true, score: null, scoreCoverage: 75 },
      missingRequired: { valid: true, score: null, scoreCoverage: 80 },
    });
  });

  it.each([
    [60, 50, true],
    [59, 100, false],
    [100, 49, false],
  ] as const)(
    "enforces precursor qualification gates for evidence confidence %i and proximity %i",
    (evidenceConfidence, proximityToExternalDemand, qualificationGatesPassed) => {
      expect(
        scoreDemandPrecursor({
          ...completePrecursorComponents,
          evidenceConfidence,
          proximityToExternalDemand,
        }),
      ).toMatchObject({ valid: true, qualificationGatesPassed });
    },
  );

  it("fails closed for malformed or non-strict precursor component input", () => {
    expect([
      scoreDemandPrecursor({
        ...completePrecursorComponents,
        evidenceConfidence: -1,
      }),
      scoreDemandPrecursor({
        ...completePrecursorComponents,
        proximityToExternalDemand: 50.5,
      }),
      scoreDemandPrecursor({ ...completePrecursorComponents, extra: 1 }),
    ]).toEqual([
      { valid: false, reason: "invalid_precursor_components" },
      { valid: false, reason: "invalid_precursor_components" },
      { valid: false, reason: "invalid_precursor_components" },
    ]);
  });

  it.each([
    [relativeIso(-7), 100],
    [relativeIso(-7, -1), 80],
    [relativeIso(-30), 80],
    [relativeIso(-30, -1), 50],
    [relativeIso(-90), 50],
    [relativeIso(-90, -1), 20],
    [relativeIso(-180), 20],
    [relativeIso(-180, -1), 0],
  ] as const)("scores freshness at the deterministic boundary %s", (anchorAt, score) => {
    expect(calculateFreshness({ anchorAt }, clockAt(NOW))).toEqual({
      valid: true,
      score,
    });
  });

  it("uses the injected clock once and fails closed for future or malformed freshness anchors", () => {
    let calls = 0;
    const clock = {
      now() {
        calls += 1;
        return new Date(NOW);
      },
    };

    expect(calculateFreshness({ anchorAt: relativeIso(-1) }, clock)).toEqual({
      valid: true,
      score: 100,
    });
    expect(calls).toBe(1);
    expect([
      calculateFreshness({ anchorAt: relativeIso(1) }, clockAt(NOW)),
      calculateFreshness({ anchorAt: "not-a-date" }, clockAt(NOW)),
      calculateFreshness({ anchorAt: NOW, extra: true }, clockAt(NOW)),
    ]).toEqual([
      { valid: false, reason: "invalid_freshness_input" },
      { valid: false, reason: "invalid_freshness_input" },
      { valid: false, reason: "invalid_freshness_input" },
    ]);
  });

  it.each([
    [relativeIso(30), 100],
    [relativeIso(30, 1), 80],
    [relativeIso(90), 80],
    [relativeIso(90, 1), 60],
    [relativeIso(180), 60],
    [relativeIso(180, 1), 35],
    [relativeIso(365), 35],
    [relativeIso(365, 1), null],
    [null, null],
  ] as const)("scores the supported time horizon %s", (estimatedAt, score) => {
    expect(calculateTimeHorizon({ estimatedAt }, clockAt(NOW))).toEqual({
      valid: true,
      score,
    });
  });

  it("treats past and malformed time horizons as unsupported or invalid", () => {
    expect({
      past: calculateTimeHorizon(
        { estimatedAt: relativeIso(-1) },
        clockAt(NOW),
      ),
      malformed: calculateTimeHorizon(
        { estimatedAt: "tomorrow" },
        clockAt(NOW),
      ),
    }).toEqual({
      past: { valid: true, score: null },
      malformed: { valid: false, reason: "invalid_time_horizon_input" },
    });
  });

  it("expires known-deadline demand at the boundary regardless of any prior score", () => {
    expect({
      before: assessDirectDemandActivity(
        { evergreen: false, expiresAt: relativeIso(0, 1), reobserveBy: null },
        clockAt(NOW),
      ),
      at: assessDirectDemandActivity(
        { evergreen: false, expiresAt: NOW, reobserveBy: null },
        clockAt(NOW),
      ),
      after: assessDirectDemandActivity(
        { evergreen: false, expiresAt: relativeIso(0, -1), reobserveBy: null },
        clockAt(NOW),
      ),
    }).toEqual({
      before: { valid: true, activity: "active", reason: null },
      at: {
        valid: true,
        activity: "expired",
        reason: "known_expiry_reached",
      },
      after: {
        valid: true,
        activity: "expired",
        reason: "known_expiry_reached",
      },
    });
  });

  it("requires evergreen demand to carry an explicit re-observation deadline", () => {
    expect({
      active: assessDirectDemandActivity(
        { evergreen: true, expiresAt: null, reobserveBy: relativeIso(1) },
        clockAt(NOW),
      ),
      due: assessDirectDemandActivity(
        { evergreen: true, expiresAt: null, reobserveBy: NOW },
        clockAt(NOW),
      ),
      missing: assessDirectDemandActivity(
        { evergreen: true, expiresAt: null, reobserveBy: null },
        clockAt(NOW),
      ),
      nonEvergreen: assessDirectDemandActivity(
        { evergreen: false, expiresAt: null, reobserveBy: null },
        clockAt(NOW),
      ),
    }).toEqual({
      active: { valid: true, activity: "active", reason: null },
      due: {
        valid: true,
        activity: "expired",
        reason: "evergreen_reobservation_due",
      },
      missing: {
        valid: false,
        reason: "invalid_direct_demand_activity_input",
      },
      nonEvergreen: { valid: true, activity: "active", reason: null },
    });
  });

  it("expires evergreen demand at a known deadline before considering re-observation", () => {
    expect(
      assessDirectDemandActivity(
        {
          evergreen: true,
          expiresAt: NOW,
          reobserveBy: relativeIso(30),
        },
        clockAt(NOW),
      ),
    ).toEqual({
      valid: true,
      activity: "expired",
      reason: "known_expiry_reached",
    });
  });

  it.each([
    ["independentEntityBreadth", 25],
    ["primarySourceDepth", 15],
    ["sourceDiversity", 10],
    ["weightedVolume", 15],
    ["growthVsPreceding", 15],
    ["taxonomyConsistency", 10],
    ["evidenceQuality", 10],
  ] as const)("applies the momentum %s component weight", (field, score) => {
    expect(
      scoreEcosystemMomentum({
        ...zeroMomentumComponents,
        [field]: 100,
      }),
    ).toMatchObject({
      valid: true,
      signalClass: "ecosystem_momentum",
      scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
      score,
      scoreCoverage: 100,
    });
  });

  it("derives distinct breadth, source depth, diversity, and deterministic windows", () => {
    const result = deriveEcosystemMomentum(
      momentumInput(),
      momentumPolicy,
      clockAt(NOW),
    );

    expect(result).toMatchObject({
      valid: true,
      signalClass: "ecosystem_momentum",
      policyVersion: momentumPolicy.version,
      score: 100,
      scoreCoverage: 100,
      qualificationGatesPassed: true,
      counts: {
        evidenceItems: 6,
        independentEntities: 6,
        primarySources: 6,
        sourceFamilies: 4,
      },
      windows: {
        days7: { recent: 2, preceding: 1 },
        days30: { recent: 4, preceding: 2 },
        days90: { recent: 6, preceding: 2 },
      },
      components: {
        independentEntityBreadth: 100,
        primarySourceDepth: 100,
        sourceDiversity: 100,
        weightedVolume: 100,
        growthVsPreceding: 100,
        taxonomyConsistency: 100,
        evidenceQuality: 100,
      },
    });
    expect(result.valid && Object.isFrozen(result.components)).toBe(true);
    expect(result.valid && Object.isFrozen(result.counts)).toBe(true);
    expect(result.valid && Object.isFrozen(result.windows.days7)).toBe(true);
    expect(result.valid && Object.isFrozen(result.windows)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("deduplicates replayed evidence and all distinct momentum dimensions", () => {
    const first = momentumObservation("0", 1, {
      entityId: "entity:shared",
      corporateGroupId: "group:shared",
      sourceId: "source:shared",
      sourceFamily: sourceFamilies[0],
    });
    const second = momentumObservation("1", 2, {
      entityId: "entity:shared",
      corporateGroupId: "group:shared",
      sourceId: "source:shared",
      sourceFamily: sourceFamilies[0],
    });
    const third = momentumObservation("2", 3, {
      sourceFamily: sourceFamilies[0],
      isPrimarySource: false,
    });
    const input = momentumInput({ observations: [first, second, third] });
    const baseline = deriveEcosystemMomentum(input, momentumPolicy, clockAt(NOW));
    const replayed = deriveEcosystemMomentum(
      momentumInput({ observations: [first, second, third, first, second] }),
      momentumPolicy,
      clockAt(NOW),
    );

    expect(baseline).toMatchObject({
      valid: true,
      counts: {
        evidenceItems: 3,
        independentEntities: 2,
        primarySources: 1,
        sourceFamilies: 1,
      },
    });
    expect(replayed).toEqual(baseline);
  });

  it("counts subsidiaries in one canonical corporate group as one independent organisation", () => {
    const observations = [
      {
        ...momentumObservation("0", 1),
        entityId: "entity:alpha-subsidiary",
        corporateGroupId: "group:shared",
      },
      {
        ...momentumObservation("1", 2),
        entityId: "entity:beta-subsidiary",
        corporateGroupId: "group:shared",
      },
    ];

    expect(
      deriveEcosystemMomentum(
        momentumInput({ observations }),
        momentumPolicy,
        clockAt(NOW),
      ),
    ).toMatchObject({
      valid: true,
      counts: { evidenceItems: 2, independentEntities: 1 },
      qualificationGatesPassed: false,
    });
  });

  it("fails closed when one entity maps to inconsistent corporate groups", () => {
    expect(
      deriveEcosystemMomentum(
        momentumInput({
          observations: [
            {
              ...momentumObservation("0", 1),
              entityId: "entity:shared",
              corporateGroupId: "group:alpha",
            },
            {
              ...momentumObservation("1", 2),
              entityId: "entity:shared",
              corporateGroupId: "group:beta",
            },
          ],
        }),
        momentumPolicy,
        clockAt(NOW),
      ),
    ).toEqual({
      valid: false,
      reason: "conflicting_momentum_entity_group",
    });
  });

  it("uses explicit policy weights for normalized 7, 30, and 90 day volume", () => {
    const input = momentumInput({
      observations: [momentumObservation("0", 1), momentumObservation("1", 20)],
    });

    expect({
      days7: deriveEcosystemMomentum(
        input,
        {
          ...momentumPolicy,
          windowWeights: { days7: 100, days30: 0, days90: 0 },
        },
        clockAt(NOW),
      ),
      days30: deriveEcosystemMomentum(
        input,
        {
          ...momentumPolicy,
          windowWeights: { days7: 0, days30: 100, days90: 0 },
        },
        clockAt(NOW),
      ),
      days90: deriveEcosystemMomentum(
        input,
        {
          ...momentumPolicy,
          windowWeights: { days7: 0, days30: 0, days90: 100 },
        },
        clockAt(NOW),
      ),
    }).toMatchObject({
      days7: { valid: true, components: { weightedVolume: 50 } },
      days30: { valid: true, components: { weightedVolume: 50 } },
      days90: { valid: true, components: { weightedVolume: 33 } },
    });
  });

  it("computes preceding-window growth and clamps falling or unbounded growth", () => {
    const growthPolicy = {
      ...momentumPolicy,
      windowWeights: { days7: 100, days30: 0, days90: 0 },
    } as const;

    expect({
      zeroBaseline: deriveEcosystemMomentum(
        momentumInput({ observations: [momentumObservation("0", 1)] }),
        growthPolicy,
        clockAt(NOW),
      ),
      equal: deriveEcosystemMomentum(
        momentumInput({
          observations: [momentumObservation("0", 1), momentumObservation("1", 8)],
        }),
        growthPolicy,
        clockAt(NOW),
      ),
      falling: deriveEcosystemMomentum(
        momentumInput({
          observations: [
            momentumObservation("0", 1),
            momentumObservation("1", 8),
            momentumObservation("2", 9),
          ],
        }),
        growthPolicy,
        clockAt(NOW),
      ),
      rising: deriveEcosystemMomentum(
        momentumInput({
          observations: [
            momentumObservation("0", 1),
            momentumObservation("1", 2),
            momentumObservation("2", 3),
            momentumObservation("3", 8),
          ],
        }),
        growthPolicy,
        clockAt(NOW),
      ),
    }).toMatchObject({
      zeroBaseline: { valid: true, components: { growthVsPreceding: 100 } },
      equal: { valid: true, components: { growthVsPreceding: 0 } },
      falling: { valid: true, components: { growthVsPreceding: 0 } },
      rising: { valid: true, components: { growthVsPreceding: 100 } },
    });
  });

  it("assigns exact window boundaries without double-counting", () => {
    const observations = [
      momentumObservation("0", 7),
      { ...momentumObservation("1", 7), observedAt: relativeIso(-7, -1) },
      momentumObservation("2", 14),
      { ...momentumObservation("3", 14), observedAt: relativeIso(-14, -1) },
      momentumObservation("4", 30),
      { ...momentumObservation("5", 30), observedAt: relativeIso(-30, -1) },
      momentumObservation("6", 60),
      { ...momentumObservation("7", 60), observedAt: relativeIso(-60, -1) },
      momentumObservation("8", 90),
      { ...momentumObservation("9", 90), observedAt: relativeIso(-90, -1) },
      momentumObservation("10", 180),
      { ...momentumObservation("11", 180), observedAt: relativeIso(-180, -1) },
    ];

    expect(
      deriveEcosystemMomentum(
        momentumInput({ observations }),
        momentumPolicy,
        clockAt(NOW),
      ),
    ).toMatchObject({
      valid: true,
      windows: {
        days7: { recent: 1, preceding: 2 },
        days30: { recent: 5, preceding: 2 },
        days90: { recent: 9, preceding: 2 },
      },
    });
  });

  it.each([
    [
      "independent entities",
      {
        observations: [
          momentumObservation("0", 1, { entityId: "entity:one" }),
          momentumObservation("1", 2, {
            entityId: "entity:one",
            corporateGroupId: "group:0",
          }),
        ],
      },
    ],
    ["deduplicated evidence", { observations: [momentumObservation("0", 1)] }],
    [
      "a primary source",
      {
        observations: [
          momentumObservation("0", 1, { isPrimarySource: false }),
          momentumObservation("1", 2, { isPrimarySource: false }),
        ],
      },
    ],
    ["taxonomy consistency", { taxonomyConsistency: 69 }],
    ["evidence quality", { evidenceQuality: 59 }],
  ] as const)("fails the momentum qualification gate without %s", (_label, overrides) => {
    expect(
      deriveEcosystemMomentum(
        momentumInput(overrides),
        momentumPolicy,
        clockAt(NOW),
      ),
    ).toMatchObject({ valid: true, qualificationGatesPassed: false });
  });

  it("requires a strict matching versioned momentum policy with positive targets", () => {
    const invalidPolicies = [
      undefined,
      { ...momentumPolicy, version: "" },
      { ...momentumPolicy, taxonomy: "spatial_ai_and_3d_data" },
      {
        ...momentumPolicy,
        volumeTargets: { ...momentumPolicy.volumeTargets, days7: 0 },
      },
      {
        ...momentumPolicy,
        windowWeights: { days7: 50, days30: 30, days90: 19 },
      },
      { ...momentumPolicy, extra: true },
    ];

    expect(
      invalidPolicies.map((policy) =>
        deriveEcosystemMomentum(momentumInput(), policy, clockAt(NOW)),
      ),
    ).toEqual([
      { valid: false, reason: "invalid_momentum_policy" },
      { valid: false, reason: "invalid_momentum_policy" },
      { valid: false, reason: "momentum_policy_taxonomy_mismatch" },
      { valid: false, reason: "invalid_momentum_policy" },
      { valid: false, reason: "invalid_momentum_policy" },
      { valid: false, reason: "invalid_momentum_policy" },
    ]);
  });

  it("fails closed for conflicting replay identities, future observations, and unknown fields", () => {
    const original = momentumObservation("0", 1);
    expect([
      deriveEcosystemMomentum(
        momentumInput({
          observations: [original, { ...original, entityId: "entity:changed" }],
        }),
        momentumPolicy,
        clockAt(NOW),
      ),
      deriveEcosystemMomentum(
        momentumInput({ observations: [momentumObservation("0", -1)] }),
        momentumPolicy,
        clockAt(NOW),
      ),
      deriveEcosystemMomentum(
        momentumInput({ extra: true }),
        momentumPolicy,
        clockAt(NOW),
      ),
    ]).toEqual([
      { valid: false, reason: "conflicting_momentum_evidence" },
      { valid: false, reason: "invalid_momentum_input" },
      { valid: false, reason: "invalid_momentum_input" },
    ]);
  });

  it.each([
    ["evidenceId", " evidence:0"],
    ["evidenceId", "evidence:0 "],
    ["entityId", " entity:0"],
    ["entityId", "entity:0 "],
    ["corporateGroupId", " group:0"],
    ["corporateGroupId", "group:0 "],
    ["sourceId", " source:0"],
    ["sourceId", "source:0 "],
  ] as const)("rejects non-canonical raw momentum %s %s", (field, value) => {
    expect(
      deriveEcosystemMomentum(
        momentumInput({
          observations: [momentumObservation("0", 1, { [field]: value })],
        }),
        momentumPolicy,
        clockAt(NOW),
      ),
    ).toEqual({ valid: false, reason: "invalid_momentum_input" });
  });

  it.each([
    " robot-learning-momentum-v1",
    "robot-learning-momentum-v1 ",
  ] as const)("rejects non-canonical raw momentum policy version %s", (version) => {
    expect(
      deriveEcosystemMomentum(
        momentumInput(),
        { ...momentumPolicy, version },
        clockAt(NOW),
      ),
    ).toEqual({ valid: false, reason: "invalid_momentum_policy" });
  });
});
