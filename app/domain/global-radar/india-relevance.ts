import { z } from "zod";

import {
  boundedRecordSchema,
  boundedShortStringSchema,
  candidateEvidenceSchema,
  confidenceSchema,
  indiaRelevanceTypes,
} from "./contracts";
import { normalizedRequirementSchema } from "./requirements";

export const indiaEvidenceFactKinds = [
  "suppliers",
  "participants",
  "languages",
  "roads_or_environments",
  "manufacturing",
  "distribution",
  "collection",
  "installation",
  "service",
] as const;
const exactEvidenceRelevanceTypes = new Set([
  "explicit_India",
  "existing_India_presence",
  "India_expansion",
]);

const assessedRequirementSchema = z.strictObject({
  requirement: normalizedRequirementSchema,
  globallyDeliverable: z.boolean().nullable(),
  openToExternalCounterparties: z.boolean().nullable(),
});

const boundedAssessmentStrings = z.array(boundedShortStringSchema).max(50);

export const indiaRelevanceInputSchema = z.strictObject({
  proposedType: z.enum(indiaRelevanceTypes),
  evidence: z.array(candidateEvidenceSchema).max(100),
  exclusionEvidence: z.array(candidateEvidenceSchema).max(100),
  requirements: z.array(assessedRequirementSchema).max(100),
  reasons: boundedAssessmentStrings,
  constraints: boundedAssessmentStrings,
  unknowns: boundedAssessmentStrings,
  confidence: confidenceSchema,
  regulatoryFacts: boundedRecordSchema.nullable(),
  logisticsFacts: boundedRecordSchema.nullable(),
});

export const indiaRelevanceAssessmentFailureReasons = [
  "invalid_assessment_input",
  "missing_exact_original_evidence",
  "missing_global_openness_evidence",
  "missing_open_requirement",
  "missing_indian_execution_archetype",
  "india_exclusion_present",
] as const;

export const indiaRelevanceAssessmentSchema = z.discriminatedUnion(
  "assessed",
  [
    z.strictObject({
      assessed: z.literal(true),
      relevanceType: z.enum(indiaRelevanceTypes),
      basis: z.enum([
        "exact_public_evidence",
        "mewtuals_interpretation",
        "globally_open",
        "no_current_fit",
      ]),
      reasons: boundedAssessmentStrings,
      constraints: boundedAssessmentStrings,
      unknowns: boundedAssessmentStrings,
      confidence: confidenceSchema,
      supportedEvidencePaths: z
        .array(boundedShortStringSchema)
        .max(100),
      regulatoryFacts: boundedRecordSchema.nullable(),
      logisticsFacts: boundedRecordSchema.nullable(),
      monitorable: z.boolean(),
    }),
    z.strictObject({
      assessed: z.literal(false),
      reason: z.enum(indiaRelevanceAssessmentFailureReasons),
    }),
  ],
);

export type IndiaRelevanceInput = Readonly<
  z.input<typeof indiaRelevanceInputSchema>
>;
export type IndiaRelevanceAssessment = Readonly<
  z.output<typeof indiaRelevanceAssessmentSchema>
>;

function rejectIndiaAssessment(
  reason: (typeof indiaRelevanceAssessmentFailureReasons)[number],
): IndiaRelevanceAssessment {
  return Object.freeze({ assessed: false, reason });
}

function cloneJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]),
    );
  }
  return value;
}

function deepFreezeJson(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  for (const item of Object.values(value)) deepFreezeJson(item);
  Object.freeze(value);
}

function acceptIndiaAssessment(
  assessment: z.output<typeof indiaRelevanceInputSchema>,
  basis:
    | "exact_public_evidence"
    | "globally_open"
    | "mewtuals_interpretation"
    | "no_current_fit",
  supportedEvidencePaths: readonly string[],
): IndiaRelevanceAssessment {
  const result = indiaRelevanceAssessmentSchema.parse({
    assessed: true,
    relevanceType: assessment.proposedType,
    basis,
    reasons: Object.freeze(assessment.reasons),
    constraints: Object.freeze(assessment.constraints),
    unknowns: Object.freeze(assessment.unknowns),
    confidence: assessment.confidence,
    supportedEvidencePaths,
    regulatoryFacts: cloneJsonValue(assessment.regulatoryFacts),
    logisticsFacts: cloneJsonValue(assessment.logisticsFacts),
    monitorable: true,
  });
  if (!result.assessed) {
    throw new Error("India relevance success output failed validation.");
  }
  Object.freeze(result.reasons);
  Object.freeze(result.constraints);
  Object.freeze(result.unknowns);
  Object.freeze(result.supportedEvidencePaths);
  deepFreezeJson(result.regulatoryFacts);
  deepFreezeJson(result.logisticsFacts);
  return Object.freeze(result);
}

function exactEvidencePaths(
  input: z.output<typeof indiaRelevanceInputSchema>,
): readonly string[] {
  const allowedPaths = new Set(
    indiaEvidenceFactKinds.map(
      (factKind) => `indiaRelevance.${input.proposedType}.${factKind}`,
    ),
  );
  return Object.freeze([
    ...new Set(
      input.evidence.flatMap((item) =>
        item.sourceKind === "original"
          ? item.supportedFieldPaths.filter((path) => allowedPaths.has(path))
          : [],
      ),
    ),
  ]);
}

export function assessIndiaRelevance(
  input: IndiaRelevanceInput | unknown,
): IndiaRelevanceAssessment {
  const parsed = indiaRelevanceInputSchema.safeParse(input);
  if (!parsed.success) {
    return rejectIndiaAssessment("invalid_assessment_input");
  }

  const assessment = parsed.data;
  const supportedEvidencePaths = exactEvidencePaths(assessment);
  if (assessment.proposedType === "no_current_India_fit") {
    return acceptIndiaAssessment(assessment, "no_current_fit", []);
  }
  if (assessment.proposedType === "globally_open") {
    const hasOpenRequirement = assessment.requirements.some(
      (item) =>
        item.globallyDeliverable === true ||
        item.openToExternalCounterparties === true,
    );
    if (!hasOpenRequirement) {
      return rejectIndiaAssessment("missing_open_requirement");
    }
    const opennessPath = "indiaRelevance.globally_open.requirement_access";
    const hasOriginalOpennessEvidence = assessment.evidence.some(
      (item) =>
        item.sourceKind === "original" &&
        item.supportedFieldPaths.includes(opennessPath),
    );
    if (!hasOriginalOpennessEvidence) {
      return rejectIndiaAssessment("missing_global_openness_evidence");
    }
    return acceptIndiaAssessment(
      assessment,
      "globally_open",
      Object.freeze([opennessPath]),
    );
  }
  if (assessment.proposedType === "inferred_India_compatible") {
    const hasOriginalExclusion = assessment.exclusionEvidence.some(
      (item) =>
        item.sourceKind === "original" &&
        item.supportedFieldPaths.some((path) =>
          path.startsWith("indiaRelevance.no_current_India_fit."),
        ),
    );
    if (hasOriginalExclusion) {
      return rejectIndiaAssessment("india_exclusion_present");
    }
    const openRequirements = assessment.requirements.filter(
      (item) =>
        item.globallyDeliverable === true ||
        item.openToExternalCounterparties === true,
    );
    if (openRequirements.length === 0) {
      return rejectIndiaAssessment("missing_open_requirement");
    }
    if (
      !openRequirements.some(
        (item) => item.requirement.indianExecutionArchetypes.length > 0,
      )
    ) {
      return rejectIndiaAssessment("missing_indian_execution_archetype");
    }
    return acceptIndiaAssessment(
      assessment,
      "mewtuals_interpretation",
      supportedEvidencePaths,
    );
  }
  if (
    !exactEvidenceRelevanceTypes.has(assessment.proposedType) ||
    supportedEvidencePaths.length === 0
  ) {
    return rejectIndiaAssessment("missing_exact_original_evidence");
  }
  return acceptIndiaAssessment(
    assessment,
    "exact_public_evidence",
    supportedEvidencePaths,
  );
}
