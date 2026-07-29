import { z } from "zod";

import { isoTimestampSchema, scoreComponentSchema } from "./contracts";
import {
  globalRadarDemandFamilies,
  globalRadarSourceFamilies,
} from "../taxonomies/global-radar-v1";

export const GLOBAL_RADAR_SCORE_VERSION = "global-radar-score-v1" as const;
export const GLOBAL_RADAR_MOMENTUM_POLICY_VERSION =
  "global-radar-momentum-v1" as const;

const nullableScoreComponentSchema = scoreComponentSchema.nullable();
const DAY_MS = 24 * 60 * 60 * 1_000;

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export type RadarClock = Readonly<{ now(): Date }>;

export const freshnessInputSchema = z.strictObject({
  anchorAt: isoTimestampSchema,
});

export const timeHorizonInputSchema = z.strictObject({
  estimatedAt: isoTimestampSchema.nullable(),
});

export const directDemandActivityInputSchema = z
  .strictObject({
    evergreen: z.boolean(),
    expiresAt: isoTimestampSchema.nullable(),
    reobserveBy: isoTimestampSchema.nullable(),
  })
  .superRefine((input, context) => {
    if (input.evergreen && input.reobserveBy === null) {
      context.addIssue({
        code: "custom",
        message: "Evergreen demand requires a re-observation deadline.",
      });
    }
    if (!input.evergreen && input.reobserveBy !== null) {
      context.addIssue({
        code: "custom",
        message: "Non-evergreen demand cannot carry a re-observation deadline.",
      });
    }
  });

export const freshnessResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({ valid: z.literal(true), score: scoreComponentSchema }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.literal("invalid_freshness_input"),
  }),
]);

export const timeHorizonResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    score: scoreComponentSchema.nullable(),
  }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.literal("invalid_time_horizon_input"),
  }),
]);

export const directDemandActivityResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    activity: z.enum(["active", "expired"]),
    reason: z
      .enum(["known_expiry_reached", "evergreen_reobservation_due"])
      .nullable(),
  }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.literal("invalid_direct_demand_activity_input"),
  }),
]);

const momentumIdentifierSchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-z0-9][a-z0-9._:-]*$/);

export const momentumObservationSchema = z.strictObject({
  evidenceId: momentumIdentifierSchema,
  entityId: momentumIdentifierSchema,
  corporateGroupId: momentumIdentifierSchema,
  sourceId: momentumIdentifierSchema,
  sourceFamily: z.enum(globalRadarSourceFamilies),
  isPrimarySource: z.boolean(),
  observedAt: isoTimestampSchema,
});

export const MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS = 25_000;

export const momentumDerivationInputSchema = z.strictObject({
  taxonomy: z.enum(globalRadarDemandFamilies),
  taxonomyConsistency: scoreComponentSchema,
  evidenceQuality: scoreComponentSchema,
  observations: z
    .array(momentumObservationSchema)
    .max(MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS),
});

export const momentumPolicySchema = z
  .strictObject({
    version: momentumIdentifierSchema,
    taxonomy: z.enum(globalRadarDemandFamilies),
    volumeTargets: z.strictObject({
      days7: z.number().int().positive(),
      days30: z.number().int().positive(),
      days90: z.number().int().positive(),
    }),
    windowWeights: z.strictObject({
      days7: z.number().int().min(0).max(100),
      days30: z.number().int().min(0).max(100),
      days90: z.number().int().min(0).max(100),
    }),
  })
  .superRefine((policy, context) => {
    const weight = Object.values(policy.windowWeights).reduce(
      (total, value) => total + value,
      0,
    );
    if (weight !== 100) {
      context.addIssue({
        code: "custom",
        message: "Momentum window weights must total 100.",
        path: ["windowWeights"],
      });
    }
  });

export const momentumComponentsSchema = z.strictObject({
  independentEntityBreadth: scoreComponentSchema,
  primarySourceDepth: scoreComponentSchema,
  sourceDiversity: scoreComponentSchema,
  weightedVolume: scoreComponentSchema,
  growthVsPreceding: scoreComponentSchema,
  taxonomyConsistency: scoreComponentSchema,
  evidenceQuality: scoreComponentSchema,
});

export const momentumScoreResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    signalClass: z.literal("ecosystem_momentum"),
    scoreVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
    score: scoreComponentSchema,
    scoreCoverage: z.literal(100),
    components: momentumComponentsSchema,
  }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.literal("invalid_momentum_components"),
  }),
]);

const momentumCountsSchema = z.strictObject({
  evidenceItems: z.number().int().min(0),
  independentEntities: z.number().int().min(0),
  primarySources: z.number().int().min(0),
  sourceFamilies: z.number().int().min(0),
});
const momentumWindowCountSchema = z.strictObject({
  recent: z.number().int().min(0),
  preceding: z.number().int().min(0),
});
const momentumWindowsSchema = z.strictObject({
  days7: momentumWindowCountSchema,
  days30: momentumWindowCountSchema,
  days90: momentumWindowCountSchema,
});

export const momentumDerivationResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    signalClass: z.literal("ecosystem_momentum"),
    scoreVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
    policyVersion: momentumIdentifierSchema,
    taxonomy: z.enum(globalRadarDemandFamilies),
    score: scoreComponentSchema,
    scoreCoverage: z.literal(100),
    qualificationGatesPassed: z.boolean(),
    counts: momentumCountsSchema,
    windows: momentumWindowsSchema,
    components: momentumComponentsSchema,
  }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.enum([
      "invalid_momentum_input",
      "invalid_momentum_policy",
      "momentum_policy_taxonomy_mismatch",
      "conflicting_momentum_evidence",
      "conflicting_momentum_entity_group",
    ]),
  }),
]);

export const directDemandComponentsSchema = z.strictObject({
  explicitness: nullableScoreComponentSchema,
  evidenceConfidence: nullableScoreComponentSchema,
  freshness: nullableScoreComponentSchema,
  actionability: nullableScoreComponentSchema,
  indiaFit: nullableScoreComponentSchema,
  commercialPotential: nullableScoreComponentSchema,
  repeatability: nullableScoreComponentSchema,
  responseAccessibility: nullableScoreComponentSchema,
  strategicLearning: nullableScoreComponentSchema,
  complianceComplexity: nullableScoreComponentSchema,
});

export const precursorComponentsSchema = z.strictObject({
  evidenceConfidence: nullableScoreComponentSchema,
  proximityToExternalDemand: nullableScoreComponentSchema,
  fundingDeploymentMomentum: nullableScoreComponentSchema,
  likelyDataHardwareIntensity: nullableScoreComponentSchema,
  indiaFit: nullableScoreComponentSchema,
  estimatedTimeHorizon: nullableScoreComponentSchema,
  strategicRelevance: nullableScoreComponentSchema,
});

export const directDemandScoreResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    signalClass: z.literal("direct_demand"),
    scoreVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
    score: scoreComponentSchema.nullable(),
    scoreCoverage: scoreComponentSchema,
    qualificationGatesPassed: z.boolean(),
    components: directDemandComponentsSchema,
  }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.literal("invalid_direct_demand_components"),
  }),
]);

export const precursorScoreResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    signalClass: z.literal("demand_precursor"),
    scoreVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
    score: scoreComponentSchema.nullable(),
    scoreCoverage: scoreComponentSchema,
    qualificationGatesPassed: z.boolean(),
    components: precursorComponentsSchema,
  }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.literal("invalid_precursor_components"),
  }),
]);

export type DirectDemandComponents = Readonly<
  z.input<typeof directDemandComponentsSchema>
>;
export type DirectDemandScoreResult = Readonly<
  DeepReadonly<z.output<typeof directDemandScoreResultSchema>>
>;
export type PrecursorComponents = Readonly<
  z.input<typeof precursorComponentsSchema>
>;
export type PrecursorScoreResult = Readonly<
  DeepReadonly<z.output<typeof precursorScoreResultSchema>>
>;
export type FreshnessResult = Readonly<
  z.output<typeof freshnessResultSchema>
>;
export type TimeHorizonResult = Readonly<
  z.output<typeof timeHorizonResultSchema>
>;
export type DirectDemandActivityResult = Readonly<
  z.output<typeof directDemandActivityResultSchema>
>;
export type MomentumComponents = Readonly<
  z.input<typeof momentumComponentsSchema>
>;
export type MomentumPolicy = Readonly<z.input<typeof momentumPolicySchema>>;
export type MomentumDerivationInput = Readonly<
  DeepReadonly<z.input<typeof momentumDerivationInputSchema>>
>;
export type MomentumScoreResult = Readonly<
  DeepReadonly<z.output<typeof momentumScoreResultSchema>>
>;
export type MomentumDerivationResult = Readonly<
  DeepReadonly<z.output<typeof momentumDerivationResultSchema>>
>;

export function createGlobalRadarMomentumPolicy(
  taxonomy: MomentumPolicy["taxonomy"],
): MomentumPolicy {
  const policy = momentumPolicySchema.parse({
    version: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
    taxonomy,
    volumeTargets: { days7: 2, days30: 4, days90: 8 },
    windowWeights: { days7: 50, days30: 30, days90: 20 },
  });
  Object.freeze(policy.volumeTargets);
  Object.freeze(policy.windowWeights);
  return Object.freeze(policy);
}

const directDemandWeights = {
  explicitness: 18,
  evidenceConfidence: 12,
  freshness: 10,
  actionability: 14,
  indiaFit: 12,
  commercialPotential: 12,
  repeatability: 7,
  responseAccessibility: 5,
  strategicLearning: 5,
  complianceComplexity: 5,
} as const satisfies Record<keyof DirectDemandComponents, number>;

const directDemandRequiredComponents = [
  "explicitness",
  "evidenceConfidence",
  "actionability",
  "indiaFit",
] as const satisfies readonly (keyof DirectDemandComponents)[];

const precursorWeights = {
  evidenceConfidence: 20,
  proximityToExternalDemand: 20,
  fundingDeploymentMomentum: 15,
  likelyDataHardwareIntensity: 15,
  indiaFit: 15,
  estimatedTimeHorizon: 5,
  strategicRelevance: 10,
} as const satisfies Record<keyof PrecursorComponents, number>;

const precursorRequiredComponents = [
  "evidenceConfidence",
  "proximityToExternalDemand",
  "indiaFit",
] as const satisfies readonly (keyof PrecursorComponents)[];

const momentumWeights = {
  independentEntityBreadth: 25,
  primarySourceDepth: 15,
  sourceDiversity: 10,
  weightedVolume: 15,
  growthVsPreceding: 15,
  taxonomyConsistency: 10,
  evidenceQuality: 10,
} as const satisfies Record<keyof MomentumComponents, number>;

const momentumWindows = [
  { key: "days7", days: 7 },
  { key: "days30", days: 30 },
  { key: "days90", days: 90 },
] as const;

function invalidDirectDemandScore(): DirectDemandScoreResult {
  return Object.freeze({
    valid: false,
    reason: "invalid_direct_demand_components",
  });
}

export function scoreDirectDemand(
  input: DirectDemandComponents | unknown,
): DirectDemandScoreResult {
  const parsed = directDemandComponentsSchema.safeParse(input);
  if (!parsed.success) return invalidDirectDemandScore();

  const components = Object.freeze({ ...parsed.data });
  let scoreCoverage = 0;
  let weightedTotal = 0;
  for (const [component, weight] of Object.entries(directDemandWeights) as [
    keyof DirectDemandComponents,
    number,
  ][]) {
    const value = components[component];
    if (value === null) continue;
    scoreCoverage += weight;
    weightedTotal +=
      weight * (component === "complianceComplexity" ? 100 - value : value);
  }

  const hasRequiredComponents = directDemandRequiredComponents.every(
    (component) => components[component] !== null,
  );
  const score =
    scoreCoverage >= 80 && hasRequiredComponents
      ? Math.round(weightedTotal / scoreCoverage)
      : null;
  const qualificationGatesPassed =
    components.explicitness !== null &&
    components.explicitness >= 75 &&
    components.evidenceConfidence !== null &&
    components.evidenceConfidence >= 60;
  const result = directDemandScoreResultSchema.parse({
    valid: true,
    signalClass: "direct_demand",
    scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
    score,
    scoreCoverage,
    qualificationGatesPassed,
    components,
  });
  if (!result.valid) {
    throw new Error("Direct-demand score output failed validation.");
  }
  Object.freeze(result.components);
  return Object.freeze(result);
}

export function scoreDemandPrecursor(
  input: PrecursorComponents | unknown,
): PrecursorScoreResult {
  const parsed = precursorComponentsSchema.safeParse(input);
  if (!parsed.success) {
    return Object.freeze({
      valid: false,
      reason: "invalid_precursor_components",
    });
  }

  const components = Object.freeze({ ...parsed.data });
  let scoreCoverage = 0;
  let weightedTotal = 0;
  for (const [component, weight] of Object.entries(precursorWeights) as [
    keyof PrecursorComponents,
    number,
  ][]) {
    const value = components[component];
    if (value === null) continue;
    scoreCoverage += weight;
    weightedTotal += weight * value;
  }

  const hasRequiredComponents = precursorRequiredComponents.every(
    (component) => components[component] !== null,
  );
  const score =
    scoreCoverage >= 80 && hasRequiredComponents
      ? Math.round(weightedTotal / scoreCoverage)
      : null;
  const qualificationGatesPassed =
    components.evidenceConfidence !== null &&
    components.evidenceConfidence >= 60 &&
    components.proximityToExternalDemand !== null &&
    components.proximityToExternalDemand >= 50;
  const result = precursorScoreResultSchema.parse({
    valid: true,
    signalClass: "demand_precursor",
    scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
    score,
    scoreCoverage,
    qualificationGatesPassed,
    components,
  });
  if (!result.valid) {
    throw new Error("Precursor score output failed validation.");
  }
  Object.freeze(result.components);
  return Object.freeze(result);
}

function readClock(clock: RadarClock | unknown): number | null {
  if (
    clock === null ||
    typeof clock !== "object" ||
    !("now" in clock) ||
    typeof clock.now !== "function"
  ) {
    return null;
  }
  try {
    const now = clock.now();
    if (!(now instanceof Date)) return null;
    const timestamp = now.getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

export function calculateFreshness(
  input: unknown,
  clock: RadarClock | unknown,
): FreshnessResult {
  const parsed = freshnessInputSchema.safeParse(input);
  const now = readClock(clock);
  if (!parsed.success || now === null) {
    return Object.freeze({ valid: false, reason: "invalid_freshness_input" });
  }
  const elapsed = now - Date.parse(parsed.data.anchorAt);
  if (elapsed < 0) {
    return Object.freeze({ valid: false, reason: "invalid_freshness_input" });
  }
  const score =
    elapsed <= 7 * DAY_MS
      ? 100
      : elapsed <= 30 * DAY_MS
        ? 80
        : elapsed <= 90 * DAY_MS
          ? 50
          : elapsed <= 180 * DAY_MS
            ? 20
            : 0;
  return Object.freeze({ valid: true, score });
}

export function calculateTimeHorizon(
  input: unknown,
  clock: RadarClock | unknown,
): TimeHorizonResult {
  const parsed = timeHorizonInputSchema.safeParse(input);
  const now = readClock(clock);
  if (!parsed.success || now === null) {
    return Object.freeze({
      valid: false,
      reason: "invalid_time_horizon_input",
    });
  }
  if (parsed.data.estimatedAt === null) {
    return Object.freeze({ valid: true, score: null });
  }
  const remaining = Date.parse(parsed.data.estimatedAt) - now;
  const score =
    remaining < 0 || remaining > 365 * DAY_MS
      ? null
      : remaining <= 30 * DAY_MS
        ? 100
        : remaining <= 90 * DAY_MS
          ? 80
          : remaining <= 180 * DAY_MS
            ? 60
            : 35;
  return Object.freeze({ valid: true, score });
}

export function assessDirectDemandActivity(
  input: unknown,
  clock: RadarClock | unknown,
): DirectDemandActivityResult {
  const parsed = directDemandActivityInputSchema.safeParse(input);
  const now = readClock(clock);
  if (!parsed.success || now === null) {
    return Object.freeze({
      valid: false,
      reason: "invalid_direct_demand_activity_input",
    });
  }

  if (
    parsed.data.expiresAt !== null &&
    Date.parse(parsed.data.expiresAt) <= now
  ) {
    return Object.freeze({
      valid: true,
      activity: "expired",
      reason: "known_expiry_reached",
    });
  }
  if (
    parsed.data.evergreen &&
    parsed.data.reobserveBy !== null &&
    Date.parse(parsed.data.reobserveBy) <= now
  ) {
    return Object.freeze({
      valid: true,
      activity: "expired",
      reason: "evergreen_reobservation_due",
    });
  }
  return Object.freeze({ valid: true, activity: "active", reason: null });
}

export function scoreEcosystemMomentum(
  input: MomentumComponents | unknown,
): MomentumScoreResult {
  const parsed = momentumComponentsSchema.safeParse(input);
  if (!parsed.success) {
    return Object.freeze({
      valid: false,
      reason: "invalid_momentum_components",
    });
  }
  const components = Object.freeze({ ...parsed.data });
  const weightedTotal = (
    Object.entries(momentumWeights) as [keyof MomentumComponents, number][]
  ).reduce(
    (total, [component, weight]) => total + components[component] * weight,
    0,
  );
  const result = momentumScoreResultSchema.parse({
    valid: true,
    signalClass: "ecosystem_momentum",
    scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
    score: Math.round(weightedTotal / 100),
    scoreCoverage: 100,
    components,
  });
  if (!result.valid) {
    throw new Error("Momentum score output failed validation.");
  }
  Object.freeze(result.components);
  return Object.freeze(result);
}

function sameMomentumObservation(
  left: z.output<typeof momentumObservationSchema>,
  right: z.output<typeof momentumObservationSchema>,
): boolean {
  return (
    left.evidenceId === right.evidenceId &&
    left.entityId === right.entityId &&
    left.corporateGroupId === right.corporateGroupId &&
    left.sourceId === right.sourceId &&
    left.sourceFamily === right.sourceFamily &&
    left.isPrimarySource === right.isPrimarySource &&
    left.observedAt === right.observedAt
  );
}

function normalizedTargetScore(count: number, target: number): number {
  return Math.min(100, (count / target) * 100);
}

function growthScore(recent: number, preceding: number): number {
  if (preceding === 0) return recent > 0 ? 100 : 0;
  return Math.min(100, Math.max(0, ((recent - preceding) / preceding) * 100));
}

function invalidMomentum(
  reason:
    | "invalid_momentum_input"
    | "invalid_momentum_policy"
    | "momentum_policy_taxonomy_mismatch"
    | "conflicting_momentum_evidence"
    | "conflicting_momentum_entity_group",
): MomentumDerivationResult {
  return Object.freeze({ valid: false, reason });
}

export function deriveEcosystemMomentum(
  input: MomentumDerivationInput | unknown,
  policyInput: MomentumPolicy | unknown,
  clock: RadarClock | unknown,
): MomentumDerivationResult {
  const parsedInput = momentumDerivationInputSchema.safeParse(input);
  if (!parsedInput.success) return invalidMomentum("invalid_momentum_input");
  const parsedPolicy = momentumPolicySchema.safeParse(policyInput);
  if (!parsedPolicy.success) return invalidMomentum("invalid_momentum_policy");
  if (parsedPolicy.data.taxonomy !== parsedInput.data.taxonomy) {
    return invalidMomentum("momentum_policy_taxonomy_mismatch");
  }
  const now = readClock(clock);
  if (now === null) return invalidMomentum("invalid_momentum_input");

  const deduplicated = new Map<
    string,
    z.output<typeof momentumObservationSchema>
  >();
  const entityGroups = new Map<string, string>();
  for (const observation of parsedInput.data.observations) {
    const observedAt = Date.parse(observation.observedAt);
    if (observedAt > now) return invalidMomentum("invalid_momentum_input");
    const knownGroup = entityGroups.get(observation.entityId);
    if (
      knownGroup !== undefined &&
      knownGroup !== observation.corporateGroupId
    ) {
      return invalidMomentum("conflicting_momentum_entity_group");
    }
    entityGroups.set(observation.entityId, observation.corporateGroupId);
    const existing = deduplicated.get(observation.evidenceId);
    if (existing && !sameMomentumObservation(existing, observation)) {
      return invalidMomentum("conflicting_momentum_evidence");
    }
    deduplicated.set(observation.evidenceId, observation);
  }
  const observations = [...deduplicated.values()];
  const windows = Object.fromEntries(
    momentumWindows.map(({ key, days }) => {
      const duration = days * DAY_MS;
      let recent = 0;
      let preceding = 0;
      for (const observation of observations) {
        const age = now - Date.parse(observation.observedAt);
        if (age <= duration) recent += 1;
        else if (age <= duration * 2) preceding += 1;
      }
      return [key, Object.freeze({ recent, preceding })];
    }),
  ) as Record<
    (typeof momentumWindows)[number]["key"],
    Readonly<{ recent: number; preceding: number }>
  >;
  Object.freeze(windows);

  const activeObservations = observations.filter(
    (observation) =>
      now - Date.parse(observation.observedAt) <= 90 * DAY_MS,
  );
  const corporateGroupIds = new Set(
    activeObservations.map((observation) => observation.corporateGroupId),
  );
  const primarySourceIds = new Set(
    activeObservations
      .filter((observation) => observation.isPrimarySource)
      .map((observation) => observation.sourceId),
  );
  const sourceFamilyValues = new Set(
    activeObservations.map((observation) => observation.sourceFamily),
  );
  const counts = Object.freeze({
    evidenceItems: activeObservations.length,
    independentEntities: corporateGroupIds.size,
    primarySources: primarySourceIds.size,
    sourceFamilies: sourceFamilyValues.size,
  });

  let weightedVolume = 0;
  let weightedGrowth = 0;
  for (const { key } of momentumWindows) {
    const weight = parsedPolicy.data.windowWeights[key];
    weightedVolume +=
      normalizedTargetScore(
        windows[key].recent,
        parsedPolicy.data.volumeTargets[key],
      ) * weight;
    weightedGrowth +=
      growthScore(windows[key].recent, windows[key].preceding) * weight;
  }
  const components = Object.freeze({
    independentEntityBreadth: Math.round(
      normalizedTargetScore(counts.independentEntities, 5),
    ),
    primarySourceDepth: Math.round(
      normalizedTargetScore(counts.primarySources, 5),
    ),
    sourceDiversity: Math.round(
      normalizedTargetScore(counts.sourceFamilies, 4),
    ),
    weightedVolume: Math.round(weightedVolume / 100),
    growthVsPreceding: Math.round(weightedGrowth / 100),
    taxonomyConsistency: parsedInput.data.taxonomyConsistency,
    evidenceQuality: parsedInput.data.evidenceQuality,
  });
  const scored = scoreEcosystemMomentum(components);
  if (!scored.valid) {
    throw new Error("Derived momentum components failed validation.");
  }
  const result = momentumDerivationResultSchema.parse({
    valid: true,
    signalClass: "ecosystem_momentum",
    scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
    policyVersion: parsedPolicy.data.version,
    taxonomy: parsedInput.data.taxonomy,
    score: scored.score,
    scoreCoverage: 100,
    qualificationGatesPassed:
      counts.independentEntities >= 2 &&
      counts.evidenceItems >= 2 &&
      counts.primarySources >= 1 &&
      components.taxonomyConsistency >= 70 &&
      components.evidenceQuality >= 60,
    counts,
    windows,
    components,
  });
  if (!result.valid) {
    throw new Error("Momentum derivation output failed validation.");
  }
  Object.freeze(result.counts);
  Object.freeze(result.windows.days7);
  Object.freeze(result.windows.days30);
  Object.freeze(result.windows.days90);
  Object.freeze(result.windows);
  Object.freeze(result.components);
  return Object.freeze(result);
}
