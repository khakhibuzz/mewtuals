import {
  globalRadarDemandFamilyLookup,
  scoreDemandPrecursor,
  scoreDirectDemand,
} from "../../app/domain/global-radar";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_CLASSIFICATION_VALUE_LENGTH = 200;

type ClassificationTarget = Readonly<{
  signalType: string;
  demandDomain: string;
}>;

type DirectClassificationInput = ClassificationTarget & Readonly<{
  signalClass: "direct_demand";
  primaryEntityId?: string;
  components: Readonly<{
    explicitness: number | null;
    evidenceConfidence: number | null;
    freshness: number | null;
    actionability: number | null;
    indiaFit: number | null;
    commercialPotential: number | null;
    repeatability: number | null;
    responseAccessibility: number | null;
    strategicLearning: number | null;
    complianceComplexity: number | null;
  }>;
  activity: Readonly<{
    evergreen: boolean;
    expiresAt: string | null;
    reobserveBy: string | null;
  }>;
}>;

type PrecursorClassificationInput = ClassificationTarget & Readonly<{
  signalClass: "demand_precursor";
  primaryEntityId?: string;
  components: Readonly<{
    evidenceConfidence: number | null;
    proximityToExternalDemand: number | null;
    fundingDeploymentMomentum: number | null;
    likelyDataHardwareIntensity: number | null;
    indiaFit: number | null;
    estimatedTimeHorizon: number | null;
    strategicRelevance: number | null;
  }>;
}>;

type MomentumClassificationInput = ClassificationTarget & Readonly<{
  signalClass: "ecosystem_momentum";
  components: Readonly<{
    taxonomyConsistency: number;
    evidenceQuality: number;
  }>;
}>;

export type GlobalRadarAdminClassificationInput =
  | DirectClassificationInput
  | PrecursorClassificationInput
  | MomentumClassificationInput;

export type CanonicalGlobalRadarAdminClassification =
  | Readonly<{
      signalClass: "direct_demand";
      signalType: string;
      demandDomain: string;
      primaryEntityId: string | null;
      components: Extract<
        ReturnType<typeof scoreDirectDemand>,
        { valid: true }
      >["components"];
      score: number;
      scoreCoverage: number;
      expiresAt: Date | null;
      evergreen: boolean;
      reobserveBy: Date | null;
    }>
  | Readonly<{
      signalClass: "demand_precursor";
      signalType: string;
      demandDomain: string;
      primaryEntityId: string | null;
      components: Extract<
        ReturnType<typeof scoreDemandPrecursor>,
        { valid: true }
      >["components"];
      score: number;
      scoreCoverage: number;
    }>
  | Readonly<{
      signalClass: "ecosystem_momentum";
      signalType: string;
      demandDomain: string;
      components: Readonly<{
        taxonomyConsistency: number;
        evidenceQuality: number;
      }>;
    }>;

function boundedValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 &&
    normalized.length <= MAX_CLASSIFICATION_VALUE_LENGTH
    ? normalized
    : null;
}

function timestamp(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function canonicalizeGlobalRadarAdminClassification(
  value: GlobalRadarAdminClassificationInput,
  now: Date,
): CanonicalGlobalRadarAdminClassification | null {
  if (!value || typeof value !== "object") return null;
  const signalType = boundedValue(value.signalType);
  if (
    !signalType ||
    !globalRadarDemandFamilyLookup[
      value.demandDomain as keyof typeof globalRadarDemandFamilyLookup
    ]
  ) return null;

  if (value.signalClass === "direct_demand") {
    if (
      Object.keys(value).some(
        (key) =>
          ![
            "signalClass",
            "signalType",
            "demandDomain",
            "primaryEntityId",
            "components",
            "activity",
          ].includes(key),
      ) ||
      !value.activity ||
      typeof value.activity.evergreen !== "boolean" ||
      Object.keys(value.activity).some(
        (key) => !["evergreen", "expiresAt", "reobserveBy"].includes(key),
      ) ||
      (value.primaryEntityId !== undefined &&
        !UUID_PATTERN.test(value.primaryEntityId))
    ) return null;
    const scored = scoreDirectDemand(value.components);
    const expiresAt =
      value.activity.expiresAt === null
        ? null
        : timestamp(value.activity.expiresAt);
    const reobserveBy =
      value.activity.reobserveBy === null
        ? null
        : timestamp(value.activity.reobserveBy);
    if (
      !scored.valid ||
      scored.score === null ||
      (value.activity.expiresAt !== null && expiresAt === null) ||
      (value.activity.reobserveBy !== null && reobserveBy === null) ||
      (value.activity.evergreen &&
        (expiresAt !== null || reobserveBy === null || reobserveBy <= now)) ||
      (!value.activity.evergreen && reobserveBy !== null)
    ) return null;
    return {
      signalClass: value.signalClass,
      signalType,
      demandDomain: value.demandDomain,
      primaryEntityId: value.primaryEntityId?.toLowerCase() ?? null,
      components: scored.components,
      score: scored.score,
      scoreCoverage: scored.scoreCoverage,
      expiresAt,
      evergreen: value.activity.evergreen,
      reobserveBy,
    };
  }

  if (value.signalClass === "demand_precursor") {
    if (
      Object.keys(value).some(
        (key) =>
          ![
            "signalClass",
            "signalType",
            "demandDomain",
            "primaryEntityId",
            "components",
          ].includes(key),
      ) ||
      (value.primaryEntityId !== undefined &&
        !UUID_PATTERN.test(value.primaryEntityId))
    ) return null;
    const scored = scoreDemandPrecursor(value.components);
    if (!scored.valid || scored.score === null) return null;
    return {
      signalClass: value.signalClass,
      signalType,
      demandDomain: value.demandDomain,
      primaryEntityId: value.primaryEntityId?.toLowerCase() ?? null,
      components: scored.components,
      score: scored.score,
      scoreCoverage: scored.scoreCoverage,
    };
  }

  if (value.signalClass === "ecosystem_momentum") {
    if (
      Object.keys(value).some(
        (key) =>
          !["signalClass", "signalType", "demandDomain", "components"].includes(
            key,
          ),
      )
    ) return null;
    const components = value.components;
    if (
      !components ||
      typeof components !== "object" ||
      Object.keys(components).some(
        (key) => !["taxonomyConsistency", "evidenceQuality"].includes(key),
      ) ||
      !Number.isInteger(components.taxonomyConsistency) ||
      components.taxonomyConsistency < 0 ||
      components.taxonomyConsistency > 100 ||
      !Number.isInteger(components.evidenceQuality) ||
      components.evidenceQuality < 0 ||
      components.evidenceQuality > 100
    ) return null;
    return {
      signalClass: value.signalClass,
      signalType,
      demandDomain: value.demandDomain,
      components: { ...components },
    };
  }
  return null;
}
