import { z } from "zod";

import {
  indiaRelevanceTypes,
  scoreComponentSchema,
  signalClasses,
  signalStatuses,
} from "./contracts";
import type { SignalStatus } from "./contracts";
import { GLOBAL_RADAR_SCORE_VERSION } from "./scoring";

export const initialSignalStatusInputSchema = z.strictObject({
  complianceRequiresReview: z.boolean(),
  score: scoreComponentSchema.nullable(),
  scoreCoverage: scoreComponentSchema,
});

export const initialSignalStatusResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    status: z.enum(["newly_discovered", "needs_review"]),
  }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.literal("invalid_initial_signal_status_input"),
  }),
]);

export const rediscoveredSignalStatusInputSchema = z.strictObject({
  currentStatus: z.enum(signalStatuses),
  proposedStatus: z.enum(signalStatuses),
});

export const rediscoveredSignalStatusResultSchema = z.discriminatedUnion(
  "valid",
  [
    z.strictObject({
      valid: z.literal(true),
      status: z.enum(signalStatuses),
    }),
    z.strictObject({
      valid: z.literal(false),
      reason: z.literal("invalid_rediscovery_status_input"),
    }),
  ],
);

export const qualificationAssessmentSchema = z.strictObject({
  signalClass: z.enum(signalClasses),
  scoreVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
  score: scoreComponentSchema.nullable(),
  threshold: scoreComponentSchema,
  hardGatesPassed: z.boolean(),
});

export const signalTransitionActionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("request_review") }),
  z.strictObject({ type: z.literal("monitor") }),
  z.strictObject({
    type: z.literal("qualify"),
    qualification: qualificationAssessmentSchema,
  }),
  z.strictObject({ type: z.literal("dismiss") }),
  z.strictObject({ type: z.literal("expire") }),
  z.strictObject({ type: z.literal("promote") }),
  z.strictObject({ type: z.literal("reverse_promotion") }),
  z.strictObject({
    type: z.literal("reopen"),
    hasNewEvidence: z.boolean(),
    reason: z.string().max(500).nullable(),
  }),
  z.strictObject({ type: z.literal("mark_no_india_fit") }),
]);

export const signalTransitionInputSchema = z.strictObject({
  currentStatus: z.enum(signalStatuses),
  currentIndiaRelevanceType: z.enum(indiaRelevanceTypes),
  action: signalTransitionActionSchema,
});

export const signalTransitionResultSchema = z.discriminatedUnion("valid", [
  z.strictObject({
    valid: z.literal(true),
    status: z.enum(signalStatuses),
    indiaRelevanceType: z.enum(indiaRelevanceTypes),
  }),
  z.strictObject({
    valid: z.literal(false),
    reason: z.enum([
      "invalid_transition_input",
      "transition_not_allowed",
      "qualification_requirements_not_met",
      "reopen_evidence_or_reason_required",
    ]),
  }),
]);

export type InitialSignalStatusInput = Readonly<
  z.input<typeof initialSignalStatusInputSchema>
>;
export type InitialSignalStatusResult = Readonly<
  z.output<typeof initialSignalStatusResultSchema>
>;
export type RediscoveredSignalStatusInput = Readonly<
  z.input<typeof rediscoveredSignalStatusInputSchema>
>;
export type RediscoveredSignalStatusResult = Readonly<
  z.output<typeof rediscoveredSignalStatusResultSchema>
>;
export type QualificationAssessment = Readonly<
  z.input<typeof qualificationAssessmentSchema>
>;
export type SignalTransitionAction = Readonly<
  z.input<typeof signalTransitionActionSchema>
>;
export type SignalTransitionInput = Readonly<
  z.input<typeof signalTransitionInputSchema>
>;
export type SignalTransitionResult = Readonly<
  z.output<typeof signalTransitionResultSchema>
>;

type SignalTransitionActionType = SignalTransitionAction["type"];

const allowedActions: Readonly<
  Record<SignalStatus, readonly SignalTransitionActionType[]>
> = {
  newly_discovered: [
    "request_review",
    "monitor",
    "dismiss",
    "expire",
    "mark_no_india_fit",
  ],
  needs_review: [
    "qualify",
    "monitor",
    "dismiss",
    "expire",
    "mark_no_india_fit",
  ],
  monitoring: [
    "request_review",
    "qualify",
    "dismiss",
    "expire",
    "mark_no_india_fit",
  ],
  qualified: [
    "monitor",
    "dismiss",
    "expire",
    "promote",
    "mark_no_india_fit",
  ],
  dismissed: ["reopen"],
  expired: ["reopen"],
  promoted: ["reverse_promotion"],
};

const nextStatusByAction: Readonly<
  Record<SignalTransitionActionType, SignalStatus>
> = {
  request_review: "needs_review",
  monitor: "monitoring",
  qualify: "qualified",
  dismiss: "dismissed",
  expire: "expired",
  promote: "promoted",
  reverse_promotion: "qualified",
  reopen: "needs_review",
  mark_no_india_fit: "monitoring",
};

export function determineInitialSignalStatus(
  input: InitialSignalStatusInput | unknown,
): InitialSignalStatusResult {
  const parsed = initialSignalStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    return Object.freeze({
      valid: false,
      reason: "invalid_initial_signal_status_input",
    });
  }
  const status =
    parsed.data.complianceRequiresReview ||
    parsed.data.score === null ||
    parsed.data.scoreCoverage < 80
      ? "needs_review"
      : "newly_discovered";
  return Object.freeze({ valid: true, status });
}

export function preserveRediscoveredSignalStatus(
  input: RediscoveredSignalStatusInput | unknown,
): RediscoveredSignalStatusResult {
  const parsed = rediscoveredSignalStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    return Object.freeze({
      valid: false,
      reason: "invalid_rediscovery_status_input",
    });
  }
  return Object.freeze({ valid: true, status: parsed.data.currentStatus });
}

function invalidTransition(
  reason:
    | "invalid_transition_input"
    | "transition_not_allowed"
    | "qualification_requirements_not_met"
    | "reopen_evidence_or_reason_required",
): SignalTransitionResult {
  return Object.freeze({ valid: false, reason });
}

export function transitionSignal(
  input: SignalTransitionInput | unknown,
): SignalTransitionResult {
  const parsed = signalTransitionInputSchema.safeParse(input);
  if (!parsed.success) return invalidTransition("invalid_transition_input");

  const { action, currentStatus, currentIndiaRelevanceType } = parsed.data;
  if (!allowedActions[currentStatus].includes(action.type)) {
    return invalidTransition("transition_not_allowed");
  }
  if (
    action.type === "qualify" &&
    (action.qualification.score === null ||
      action.qualification.score < action.qualification.threshold ||
      !action.qualification.hardGatesPassed)
  ) {
    return invalidTransition("qualification_requirements_not_met");
  }
  if (
    action.type === "reopen" &&
    !action.hasNewEvidence &&
    (action.reason === null || action.reason.trim().length === 0)
  ) {
    return invalidTransition("reopen_evidence_or_reason_required");
  }

  const result = signalTransitionResultSchema.parse({
    valid: true,
    status: nextStatusByAction[action.type],
    indiaRelevanceType:
      action.type === "mark_no_india_fit"
        ? "no_current_India_fit"
        : currentIndiaRelevanceType,
  });
  if (!result.valid) {
    throw new Error("Signal transition output failed validation.");
  }
  return Object.freeze(result);
}
