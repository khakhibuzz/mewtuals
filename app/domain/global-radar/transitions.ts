import { z } from "zod";

import {
  indiaRelevanceTypes,
  isoTimestampSchema,
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

export const rediscoveredReobservationInputSchema = z
  .strictObject({
    currentEvergreen: z.boolean(),
    currentReobserveBy: isoTimestampSchema.nullable(),
    proposedEvergreen: z.boolean(),
    proposedReobserveBy: isoTimestampSchema.nullable(),
    proposedObservedAt: isoTimestampSchema,
    isNewerObservation: z.boolean(),
  })
  .superRefine((input, context) => {
    if (input.currentEvergreen !== (input.currentReobserveBy !== null)) {
      context.addIssue({
        code: "custom",
        message: "Current evergreen classification and deadline disagree.",
        path: ["currentReobserveBy"],
      });
    }
    if (input.proposedEvergreen !== (input.proposedReobserveBy !== null)) {
      context.addIssue({
        code: "custom",
        message: "Proposed evergreen classification and deadline disagree.",
        path: ["proposedReobserveBy"],
      });
    }
  });

export const rediscoveredReobservationResultSchema = z.discriminatedUnion(
  "valid",
  [
    z.strictObject({
      valid: z.literal(true),
      reobserveBy: isoTimestampSchema.nullable(),
      advanced: z.boolean(),
    }),
    z.strictObject({
      valid: z.literal(false),
      reason: z.literal("invalid_rediscovery_reobservation_input"),
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

const directDemandExpiryStatusInputSchema = z.strictObject({
  currentStatus: z.enum(signalStatuses),
  currentIndiaRelevanceType: z.enum(indiaRelevanceTypes),
  evergreen: z.boolean(),
  expiresAt: isoTimestampSchema.nullable(),
  reobserveBy: isoTimestampSchema.nullable(),
  announcedAt: isoTimestampSchema.nullable(),
  effectiveFrom: isoTimestampSchema.nullable(),
  now: isoTimestampSchema,
});

export type DirectDemandExpiryStatusResult = Readonly<
  | { valid: true; status: SignalStatus }
  | { valid: false; reason: "invalid_expiry_edit" }
>;

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
export type RediscoveredReobservationInput = Readonly<
  z.input<typeof rediscoveredReobservationInputSchema>
>;
export type RediscoveredReobservationResult = Readonly<
  z.output<typeof rediscoveredReobservationResultSchema>
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
  promoted: ["reverse_promotion", "mark_no_india_fit"],
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

export function resolveRediscoveredReobserveBy(
  input: RediscoveredReobservationInput | unknown,
): RediscoveredReobservationResult {
  const parsed = rediscoveredReobservationInputSchema.safeParse(input);
  if (!parsed.success) {
    return Object.freeze({
      valid: false,
      reason: "invalid_rediscovery_reobservation_input",
    });
  }
  const current = parsed.data.currentReobserveBy;
  const proposed = parsed.data.proposedReobserveBy;
  const advanced =
    parsed.data.currentEvergreen &&
    parsed.data.proposedEvergreen &&
    parsed.data.isNewerObservation &&
    proposed !== null &&
    current !== null &&
    Date.parse(parsed.data.proposedObservedAt) <= Date.parse(current) &&
    Date.parse(proposed) > Date.parse(parsed.data.proposedObservedAt) &&
    Date.parse(proposed) > Date.parse(current);
  return Object.freeze({
    valid: true,
    reobserveBy: advanced ? proposed : current,
    advanced,
  });
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
    status:
      action.type === "mark_no_india_fit" && currentStatus === "promoted"
        ? "promoted"
        : nextStatusByAction[action.type],
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

export function resolveDirectDemandExpiryStatus(
  input: unknown,
): DirectDemandExpiryStatusResult {
  const parsed = directDemandExpiryStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    return Object.freeze({ valid: false, reason: "invalid_expiry_edit" });
  }
  const value = parsed.data;
  if (
    (value.evergreen &&
      (value.expiresAt !== null || value.reobserveBy === null)) ||
    (!value.evergreen && value.reobserveBy !== null) ||
    (value.expiresAt !== null &&
      ((value.announcedAt !== null &&
        Date.parse(value.expiresAt) < Date.parse(value.announcedAt)) ||
        (value.effectiveFrom !== null &&
          Date.parse(value.expiresAt) < Date.parse(value.effectiveFrom))))
  ) {
    return Object.freeze({ valid: false, reason: "invalid_expiry_edit" });
  }
  const due = value.evergreen
    ? Date.parse(value.reobserveBy!) <= Date.parse(value.now)
    : value.expiresAt !== null &&
      Date.parse(value.expiresAt) <= Date.parse(value.now);
  if (!due) return Object.freeze({ valid: true, status: value.currentStatus });
  const transition = transitionSignal({
    currentStatus: value.currentStatus,
    currentIndiaRelevanceType: value.currentIndiaRelevanceType,
    action: { type: "expire" },
  });
  return Object.freeze({
    valid: true,
    status: transition.valid ? transition.status : value.currentStatus,
  });
}
