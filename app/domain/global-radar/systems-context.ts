import { z } from "zod";

import {
  boundedShortStringSchema,
  confidenceSchema,
  sensitiveDataAndComplianceSchema,
  signalClasses,
  signalStatuses,
} from "./contracts";

export const hardwareStackChain = [
  "raw_materials",
  "components",
  "structure",
  "actuators_and_joints",
  "power",
  "pcb_and_electronics",
  "compute_and_chips",
  "sensors",
  "connectivity",
  "embedded_software",
  "ai_and_control",
  "assembly",
  "testing",
  "integration",
  "deployment",
  "maintenance",
] as const;

export const physicalDataStackChain = [
  "real_world_access",
  "people_robots_environments",
  "sensor_capture",
  "calibration_and_synchronization",
  "ingestion",
  "curation",
  "annotation",
  "qa",
  "training",
  "evaluation",
  "deployment",
  "failures_and_corrections",
  "repeated_collection",
] as const;

export const systemsStackLayerSchema = z.union([
  z.enum(hardwareStackChain),
  z.enum(physicalDataStackChain),
]);

const descriptiveStringSchema = z.string().trim().min(1).max(2_000);
const descriptiveStringArraySchema = z
  .array(boundedShortStringSchema)
  .max(50);
const lowerLevelStackArraySchema = z.array(systemsStackLayerSchema).max(50);

function contextMatchesStack(
  stackType: "hardware" | "physical_data",
  context: SystemsContext,
): boolean {
  const chain: readonly string[] =
    stackType === "hardware" ? hardwareStackChain : physicalDataStackChain;
  const targetIndex = chain.indexOf(context.relevantStackLayer);
  const inputIndices = context.lowerLevelInputsRequired.map((stage) =>
    chain.indexOf(stage),
  );
  const hasRequiredInputs =
    targetIndex === 0
      ? context.lowerLevelInputsRequired.length === 0
      : context.lowerLevelInputsRequired.length > 0;
  return (
    targetIndex >= 0 &&
    hasRequiredInputs &&
    inputIndices.every(
      (inputIndex, index) =>
        inputIndex >= 0 &&
        inputIndex < targetIndex &&
        (index === 0 || inputIndices[index - 1]! < inputIndex),
    )
  );
}

function wordCount(value: string): number {
  return value.match(/\p{L}[\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

export const systemsContextSchema = z.strictObject({
  higherLevelSystemGoal: descriptiveStringSchema,
  relevantStackLayer: systemsStackLayerSchema,
  lowerLevelInputsRequired: lowerLevelStackArraySchema,
  transformationOrCapabilityAdded: descriptiveStringSchema,
  downstreamModelOrRobotBehavior: descriptiveStringSchema,
  whyTheRequirementMatters: descriptiveStringSchema,
  possibleIndianExecutionRole: descriptiveStringSchema,
  factualElements: descriptiveStringArraySchema.min(1),
  inferredElements: descriptiveStringArraySchema,
  systemsContextSummary: descriptiveStringSchema.refine(
    (value) => {
      const count = wordCount(value);
      return count >= 80 && count <= 150;
    },
    { message: "Systems context summary must contain 80 to 150 words." },
  ),
});

export const systemsContextValidationInputSchema = z.strictObject({
  signalClass: z.enum(signalClasses),
  eligibleForQualification: z.boolean(),
  classScore: confidenceSchema.nullable(),
  stackType: z.enum(["hardware", "physical_data"]),
  context: systemsContextSchema.nullable(),
});

export type SystemsStackLayer = z.output<typeof systemsStackLayerSchema>;
type ParsedSystemsContext = z.output<typeof systemsContextSchema>;
export type SystemsContext = Readonly<
  Omit<
    ParsedSystemsContext,
    "lowerLevelInputsRequired" | "factualElements" | "inferredElements"
  > & {
    lowerLevelInputsRequired: readonly string[];
    factualElements: readonly string[];
    inferredElements: readonly string[];
  }
>;
export type SystemsContextValidationInput = Readonly<
  z.input<typeof systemsContextValidationInputSchema>
>;
export type SystemsContextValidationResult =
  | Readonly<{ valid: true; context: SystemsContext | null }>
  | Readonly<{
      valid: false;
      reason:
        | "invalid_validation_input"
        | "systems_context_required"
        | "invalid_systems_context";
    }>;

export const complianceReviewInputSchema = z.strictObject({
  currentStatus: z.enum(signalStatuses),
  actionability: confidenceSchema,
  assessment: sensitiveDataAndComplianceSchema,
});

export const complianceReviewReasons = [
  "severe_sensitive_data_flag",
  "unresolved_sensitive_data_or_compliance",
] as const;

export const complianceReviewResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    status: z.enum(signalStatuses),
    actionability: confidenceSchema,
    actionabilityReduction: confidenceSchema,
    legalConclusion: z.null(),
    reviewReasons: z.array(z.enum(complianceReviewReasons)).max(2),
    assessment: sensitiveDataAndComplianceSchema,
  }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.literal("invalid_compliance_review_input"),
  }),
]);

export type ComplianceReviewInput = Readonly<
  z.input<typeof complianceReviewInputSchema>
>;
export type ComplianceReviewResult = Readonly<
  z.output<typeof complianceReviewResultSchema>
>;

function freezeSystemsContext(context: SystemsContext): SystemsContext {
  return Object.freeze({
    ...context,
    lowerLevelInputsRequired: Object.freeze([
      ...context.lowerLevelInputsRequired,
    ]),
    factualElements: Object.freeze([...context.factualElements]),
    inferredElements: Object.freeze([...context.inferredElements]),
  });
}

export function assessComplianceReview(
  input: ComplianceReviewInput | unknown,
): ComplianceReviewResult {
  const parsed = complianceReviewInputSchema.safeParse(input);
  if (!parsed.success) {
    return Object.freeze({
      valid: false,
      reason: "invalid_compliance_review_input",
    });
  }

  const sensitiveDataFlags = Object.freeze({
    ...parsed.data.assessment.sensitiveDataFlags,
  });
  const complianceFacts = Object.freeze({
    ...parsed.data.assessment.complianceFacts,
  });
  const assessment = Object.freeze({
    sensitiveDataFlags,
    complianceFacts,
  });
  const flagStates = Object.values(sensitiveDataFlags);
  const hasSevereFlag = flagStates.includes("severe");
  const hasUnresolvedCondition =
    flagStates.includes(null) || Object.values(complianceFacts).includes(null);
  const requiresReview = hasSevereFlag || hasUnresolvedCondition;
  const hasIngestionStatus =
    parsed.data.currentStatus === "newly_discovered" ||
    parsed.data.currentStatus === "needs_review";
  const nominalReduction = hasSevereFlag
    ? 20
    : hasUnresolvedCondition
      ? 10
      : 0;
  const actionabilityReduction = Math.min(
    parsed.data.actionability,
    nominalReduction,
  );
  const reviewReasons = Object.freeze(
    hasSevereFlag
      ? (["severe_sensitive_data_flag"] as const)
      : hasUnresolvedCondition
        ? (["unresolved_sensitive_data_or_compliance"] as const)
        : ([] as const),
  );
  const result = complianceReviewResultSchema.parse({
    valid: true,
    status:
      requiresReview && hasIngestionStatus
        ? "needs_review"
        : parsed.data.currentStatus,
    actionability: parsed.data.actionability - actionabilityReduction,
    actionabilityReduction,
    legalConclusion: null,
    reviewReasons,
    assessment,
  });
  if (!result.valid) {
    throw new Error("Compliance review success output failed validation.");
  }
  Object.freeze(result.reviewReasons);
  Object.freeze(result.assessment.sensitiveDataFlags);
  Object.freeze(result.assessment.complianceFacts);
  Object.freeze(result.assessment);
  return Object.freeze(result);
}

export function validateSystemsContext(
  input: SystemsContextValidationInput | unknown,
): SystemsContextValidationResult {
  const parsedInput = systemsContextValidationInputSchema.safeParse(input);
  if (!parsedInput.success) {
    const inputObject = input as { context?: unknown } | null;
    const contextOnly = systemsContextSchema.safeParse(inputObject?.context);
    return Object.freeze({
      valid: false,
      reason: contextOnly.success
        ? "invalid_validation_input"
        : "invalid_systems_context",
    });
  }

  const validation = parsedInput.data;
  const required =
    (validation.signalClass === "direct_demand" &&
      validation.eligibleForQualification) ||
    (validation.signalClass === "demand_precursor" &&
      validation.classScore !== null &&
      validation.classScore >= 70);
  if (required && validation.context === null) {
    return Object.freeze({ valid: false, reason: "systems_context_required" });
  }
  if (
    validation.context !== null &&
    !contextMatchesStack(validation.stackType, validation.context)
  ) {
    return Object.freeze({ valid: false, reason: "invalid_systems_context" });
  }
  return Object.freeze({
    valid: true,
    context:
      validation.context === null
        ? null
        : freezeSystemsContext(validation.context),
  });
}
