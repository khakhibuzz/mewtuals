import {
  directDemandAskTypeLookup,
  globalRadarDemandFamilyLookup,
  precursorDevelopmentTypeLookup,
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
  assessments: Readonly<{
    actionability: number | null;
    commercialPotential: number | null;
    repeatability: number | null;
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
  assessments: Readonly<{
    proximityToExternalDemand: number | null;
    fundingDeploymentMomentum: number | null;
    likelyDataHardwareIntensity: number | null;
    strategicRelevance: number | null;
  }>;
}>;

type MomentumClassificationInput = ClassificationTarget & Readonly<{
  signalClass: "ecosystem_momentum";
  assessments: Readonly<{
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
      assessments: DirectClassificationInput["assessments"];
      expiresAt: Date | null;
      evergreen: boolean;
      reobserveBy: Date | null;
    }>
  | Readonly<{
      signalClass: "demand_precursor";
      signalType: string;
      demandDomain: string;
      primaryEntityId: string | null;
      assessments: PrecursorClassificationInput["assessments"];
    }>
  | Readonly<{
      signalClass: "ecosystem_momentum";
      signalType: string;
      demandDomain: string;
      assessments: MomentumClassificationInput["assessments"];
    }>;

const directAssessmentKeys = [
  "actionability",
  "commercialPotential",
  "repeatability",
  "strategicLearning",
  "complianceComplexity",
] as const;

const precursorAssessmentKeys = [
  "proximityToExternalDemand",
  "fundingDeploymentMomentum",
  "likelyDataHardwareIntensity",
  "strategicRelevance",
] as const;

const momentumAssessmentKeys = [
  "taxonomyConsistency",
  "evidenceQuality",
] as const;

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

function canonicalAssessmentValues(
  value: unknown,
  keys: readonly string[],
  nullable: boolean,
): Readonly<Record<string, number | null>> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const assessments = value as Record<string, unknown>;
  if (
    Object.keys(assessments).length !== keys.length ||
    Object.keys(assessments).some((key) => !keys.includes(key)) ||
    keys.some((key) => !Object.prototype.hasOwnProperty.call(assessments, key))
  ) return null;
  for (const key of keys) {
    const assessment = assessments[key];
    if (nullable && assessment === null) continue;
    if (
      typeof assessment !== "number" ||
      !Number.isInteger(assessment) ||
      assessment < 0 ||
      assessment > 100
    ) return null;
  }
  return { ...assessments } as Readonly<Record<string, number | null>>;
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
      !Object.prototype.hasOwnProperty.call(directDemandAskTypeLookup, signalType) ||
      Object.keys(value).some(
        (key) =>
          ![
            "signalClass",
            "signalType",
            "demandDomain",
            "primaryEntityId",
            "assessments",
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
    const assessments = canonicalAssessmentValues(
      value.assessments,
      directAssessmentKeys,
      true,
    ) as DirectClassificationInput["assessments"] | null;
    const expiresAt =
      value.activity.expiresAt === null
        ? null
        : timestamp(value.activity.expiresAt);
    const reobserveBy =
      value.activity.reobserveBy === null
        ? null
        : timestamp(value.activity.reobserveBy);
    if (
      !assessments ||
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
      assessments,
      expiresAt,
      evergreen: value.activity.evergreen,
      reobserveBy,
    };
  }

  if (value.signalClass === "demand_precursor") {
    if (
      !Object.prototype.hasOwnProperty.call(precursorDevelopmentTypeLookup, signalType) ||
      Object.keys(value).some(
        (key) =>
          ![
            "signalClass",
            "signalType",
            "demandDomain",
            "primaryEntityId",
            "assessments",
          ].includes(key),
      ) ||
      (value.primaryEntityId !== undefined &&
        !UUID_PATTERN.test(value.primaryEntityId))
    ) return null;
    const assessments = canonicalAssessmentValues(
      value.assessments,
      precursorAssessmentKeys,
      true,
    ) as PrecursorClassificationInput["assessments"] | null;
    if (!assessments) return null;
    return {
      signalClass: value.signalClass,
      signalType,
      demandDomain: value.demandDomain,
      primaryEntityId: value.primaryEntityId?.toLowerCase() ?? null,
      assessments,
    };
  }

  if (value.signalClass === "ecosystem_momentum") {
    if (
      signalType !== "ecosystem_direction" ||
      Object.keys(value).some(
        (key) =>
          !["signalClass", "signalType", "demandDomain", "assessments"].includes(
            key,
          ),
      )
    ) return null;
    const assessments = canonicalAssessmentValues(
      value.assessments,
      momentumAssessmentKeys,
      false,
    ) as MomentumClassificationInput["assessments"] | null;
    if (!assessments) return null;
    return {
      signalClass: value.signalClass,
      signalType,
      demandDomain: value.demandDomain,
      assessments,
    };
  }
  return null;
}
