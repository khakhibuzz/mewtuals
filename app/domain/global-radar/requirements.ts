import { z } from "zod";

import {
  globalRadarLeafIdentifiers,
} from "../taxonomies/global-radar-v1";
import { indianExecutionArchetypes } from "../taxonomies/indian-execution-archetypes";
import {
  boundedRecordSchema,
  boundedShortStringSchema,
  confidenceSchema,
  requirementKinds,
} from "./contracts";
import { createGlobalRadarFingerprint } from "./normalization";

const stringArraySchema = z.array(boundedShortStringSchema).max(50);

export const normalizedRequirementInputSchema = z.strictObject({
  kind: z.enum(requirementKinds),
  capabilityTag: z.enum(globalRadarLeafIdentifiers, {
    message: "Capability tag must use the Global Radar taxonomy.",
  }),
  summary: z.string().trim().min(1).max(1_000),
  dataFamilies: stringArraySchema,
  sensorModalities: stringArraySchema,
  environments: stringArraySchema,
  taskFamilies: stringArraySchema,
  collectionMethods: stringArraySchema,
  humanRoles: stringArraySchema,
  robotEmbodiments: stringArraySchema,
  indianExecutionArchetypes: z
    .array(z.enum(indianExecutionArchetypes))
    .max(indianExecutionArchetypes.length),
  scaleSpecifications: boundedRecordSchema.nullable(),
  technicalSpecifications: boundedRecordSchema.nullable(),
  qualitySpecifications: boundedRecordSchema.nullable(),
  rightsAndComplianceSpecifications: boundedRecordSchema.nullable(),
  confidence: confidenceSchema,
});

export const normalizedRequirementSchema =
  normalizedRequirementInputSchema.extend({
    fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  });

export type NormalizedRequirementInput = Readonly<
  z.input<typeof normalizedRequirementInputSchema>
>;
export type NormalizedRequirement = Readonly<
  z.output<typeof normalizedRequirementSchema>
>;
export type RequirementNormalizationResult =
  | Readonly<{
      valid: true;
      requirements: readonly NormalizedRequirement[];
    }>
  | Readonly<{
      valid: false;
      reason: "invalid_requirement" | "duplicate_requirement_fingerprint";
    }>;

const dimensionKeys = [
  "dataFamilies",
  "sensorModalities",
  "environments",
  "taskFamilies",
  "collectionMethods",
  "humanRoles",
  "robotEmbodiments",
] as const;
const specificationKeys = [
  "scaleSpecifications",
  "technicalSpecifications",
  "qualitySpecifications",
  "rightsAndComplianceSpecifications",
] as const;

function normalizePhrase(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = [...left];
  const rightPoints = [...right];
  const sharedLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference =
      leftPoints[index]!.codePointAt(0)! - rightPoints[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function normalizeDimension(values: readonly string[]): string[] {
  return [...new Set(values.map(normalizePhrase))].sort(compareCodePoints);
}

function cloneAndFreezeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(cloneAndFreezeJson));
  }
  if (value !== null && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
          key,
          cloneAndFreezeJson(item),
        ]),
      ),
    );
  }
  return value;
}

function omitConfidence<T extends { confidence: unknown }>(
  value: T,
): Omit<T, "confidence"> {
  const copy: Partial<T> = { ...value };
  delete copy.confidence;
  return copy as Omit<T, "confidence">;
}

export function normalizeRequirements(
  input: unknown,
): RequirementNormalizationResult {
  const parsed = z
    .array(normalizedRequirementInputSchema)
    .min(1)
    .max(100)
    .safeParse(input);
  if (!parsed.success) {
    return Object.freeze({ valid: false, reason: "invalid_requirement" });
  }

  const requirements = parsed.data.map((requirement) => {
    const normalized = {
      ...requirement,
      ...Object.fromEntries(
        dimensionKeys.map((key) => [
          key,
          Object.freeze(normalizeDimension(requirement[key])),
        ]),
      ),
      indianExecutionArchetypes: Object.freeze(
        [...new Set(requirement.indianExecutionArchetypes)].sort(
          compareCodePoints,
        ),
      ),
      ...Object.fromEntries(
        specificationKeys.map((key) => [
          key,
          requirement[key] === null
            ? null
            : cloneAndFreezeJson(requirement[key]),
        ]),
      ),
    } as typeof requirement;
    const identity = omitConfidence(normalized);
    return Object.freeze({
      ...normalized,
      fingerprint: createGlobalRadarFingerprint({
        version: "global-radar-normalized-requirement-v1",
        requirement: {
          ...identity,
          summary: normalizePhrase(identity.summary),
        },
      }),
    });
  });
  if (
    new Set(requirements.map(({ fingerprint }) => fingerprint)).size !==
    requirements.length
  ) {
    return Object.freeze({
      valid: false,
      reason: "duplicate_requirement_fingerprint",
    });
  }

  return Object.freeze({
    valid: true,
    requirements: Object.freeze(requirements),
  });
}
