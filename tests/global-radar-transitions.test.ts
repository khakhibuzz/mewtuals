import { describe, expect, it } from "vitest";

import {
  GLOBAL_RADAR_SCORE_VERSION,
  determineInitialSignalStatus,
  preserveRediscoveredSignalStatus,
  resolveDirectDemandExpiryStatus,
  resolveRediscoveredReobserveBy,
  transitionSignal,
} from "../app/domain/global-radar";

const signalStatuses = [
  "newly_discovered",
  "needs_review",
  "monitoring",
  "qualified",
  "dismissed",
  "expired",
  "promoted",
] as const;

const qualification = {
  signalClass: "direct_demand",
  scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
  score: 70,
  threshold: 70,
  hardGatesPassed: true,
} as const;

const transitionActions = [
  { action: { type: "request_review" }, next: "needs_review" },
  { action: { type: "monitor" }, next: "monitoring" },
  { action: { type: "qualify", qualification }, next: "qualified" },
  { action: { type: "dismiss" }, next: "dismissed" },
  { action: { type: "expire" }, next: "expired" },
  { action: { type: "promote" }, next: "promoted" },
  { action: { type: "reverse_promotion" }, next: "qualified" },
  {
    action: { type: "reopen", hasNewEvidence: true, reason: null },
    next: "needs_review",
  },
] as const;

const allowedTransitions = new Set([
  "newly_discovered:request_review",
  "newly_discovered:monitor",
  "newly_discovered:dismiss",
  "newly_discovered:expire",
  "needs_review:qualify",
  "needs_review:monitor",
  "needs_review:dismiss",
  "needs_review:expire",
  "monitoring:request_review",
  "monitoring:qualify",
  "monitoring:dismiss",
  "monitoring:expire",
  "qualified:monitor",
  "qualified:dismiss",
  "qualified:expire",
  "qualified:promote",
  "dismissed:reopen",
  "expired:reopen",
  "promoted:reverse_promotion",
]);

describe("Global Radar signal transitions", () => {
  it.each([
    [false, 80, 80, "newly_discovered"],
    [true, 80, 80, "needs_review"],
    [false, null, 100, "needs_review"],
    [false, 80, 79, "needs_review"],
  ] as const)(
    "determines an ingestion-only start state for compliance=%s score=%s coverage=%i",
    (complianceRequiresReview, score, scoreCoverage, status) => {
      expect(
        determineInitialSignalStatus({
          complianceRequiresReview,
          score,
          scoreCoverage,
        }),
      ).toEqual({ valid: true, status });
    },
  );

  it("strictly validates the initial-status inputs", () => {
    expect([
      determineInitialSignalStatus({
        complianceRequiresReview: false,
        score: 80,
        scoreCoverage: 101,
      }),
      determineInitialSignalStatus({
        complianceRequiresReview: false,
        score: 80,
        scoreCoverage: 80,
        proposedStatus: "qualified",
      }),
    ]).toEqual([
      { valid: false, reason: "invalid_initial_signal_status_input" },
      { valid: false, reason: "invalid_initial_signal_status_input" },
    ]);
  });

  it.each([
    "newly_discovered",
    "needs_review",
    "monitoring",
    "qualified",
    "dismissed",
    "expired",
    "promoted",
  ] as const)("preserves the human status %s during rediscovery", (currentStatus) => {
    expect(
      preserveRediscoveredSignalStatus({
        currentStatus,
        proposedStatus: currentStatus === "promoted" ? "needs_review" : "promoted",
      }),
    ).toEqual({ valid: true, status: currentStatus });
  });

  it("fails closed for malformed rediscovery status input", () => {
    expect(
      preserveRediscoveredSignalStatus({
        currentStatus: "qualified",
        proposedStatus: "archived",
      }),
    ).toEqual({
      valid: false,
      reason: "invalid_rediscovery_status_input",
    });
  });

  it("advances only a newer evergreen re-observation to a later deadline", () => {
    expect(
      resolveRediscoveredReobserveBy({
        currentEvergreen: true,
        currentReobserveBy: "2026-07-31T00:00:00.000Z",
        proposedEvergreen: true,
        proposedReobserveBy: "2026-08-07T00:00:00.000Z",
        proposedObservedAt: "2026-07-30T00:00:00.000Z",
        isNewerObservation: true,
      }),
    ).toEqual({
      valid: true,
      reobserveBy: "2026-08-07T00:00:00.000Z",
      advanced: true,
    });
  });

  it.each([
    [false, true, "2026-08-07T00:00:00.000Z"],
    [true, true, "2026-07-30T00:00:00.000Z"],
    [true, false, null],
  ] as const)(
    "preserves the current re-observation deadline for newer=%s proposedEvergreen=%s proposed=%s",
    (isNewerObservation, proposedEvergreen, proposedReobserveBy) => {
      expect(
        resolveRediscoveredReobserveBy({
          currentEvergreen: true,
          currentReobserveBy: "2026-07-31T00:00:00.000Z",
          proposedEvergreen,
          proposedReobserveBy,
          proposedObservedAt: "2026-07-30T00:00:00.000Z",
          isNewerObservation,
        }),
      ).toEqual({
        valid: true,
        reobserveBy: "2026-07-31T00:00:00.000Z",
        advanced: false,
      });
    },
  );

  it("does not retroactively advance an overdue evergreen observation", () => {
    expect(
      resolveRediscoveredReobserveBy({
        currentEvergreen: true,
        currentReobserveBy: "2026-07-31T00:00:00.000Z",
        proposedEvergreen: true,
        proposedReobserveBy: "2026-08-07T00:00:00.000Z",
        proposedObservedAt: "2026-08-01T00:00:00.000Z",
        isNewerObservation: true,
      }),
    ).toEqual({
      valid: true,
      reobserveBy: "2026-07-31T00:00:00.000Z",
      advanced: false,
    });
  });

  it.each(
    signalStatuses.flatMap((currentStatus) =>
      transitionActions.map(({ action, next }) => ({
        currentStatus,
        action,
        next,
        allowed: allowedTransitions.has(`${currentStatus}:${action.type}`),
      })),
    ),
  )(
    "enforces $currentStatus -> $action.type as allowed=$allowed",
    ({ currentStatus, action, next, allowed }) => {
      const result = transitionSignal({
        currentStatus,
        currentIndiaRelevanceType: "explicit_India",
        action,
      });

      expect(result).toEqual(
        allowed
          ? {
              valid: true,
              status: next,
              indiaRelevanceType: "explicit_India",
            }
          : { valid: false, reason: "transition_not_allowed" },
      );
      expect(Object.isFrozen(result)).toBe(true);
    },
  );

  it.each([
    ["direct_demand", 70, 70],
    ["demand_precursor", 65, 65],
    ["ecosystem_momentum", 70, 70],
  ] as const)(
    "qualifies %s only through an explicit threshold-bound human action",
    (signalClass, score, threshold) => {
      expect(
        transitionSignal({
          currentStatus: "needs_review",
          currentIndiaRelevanceType: "globally_open",
          action: {
            type: "qualify",
            qualification: {
              signalClass,
              scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
              score,
              threshold,
              hardGatesPassed: true,
            },
          },
        }),
      ).toEqual({
        valid: true,
        status: "qualified",
        indiaRelevanceType: "globally_open",
      });
    },
  );

  it.each([
    [null, 70, true],
    [69, 70, true],
    [100, 70, false],
  ] as const)(
    "blocks qualification for score %s threshold %i gates=%s",
    (score, threshold, hardGatesPassed) => {
      expect(
        transitionSignal({
          currentStatus: "monitoring",
          currentIndiaRelevanceType: "inferred_India_compatible",
          action: {
            type: "qualify",
            qualification: {
              ...qualification,
              score,
              threshold,
              hardGatesPassed,
            },
          },
        }),
      ).toEqual({
        valid: false,
        reason: "qualification_requirements_not_met",
      });
    },
  );

  it("requires new evidence or a bounded explicit reason to reopen dismissed or expired signals", () => {
    expect({
      evidence: transitionSignal({
        currentStatus: "dismissed",
        currentIndiaRelevanceType: "no_current_India_fit",
        action: { type: "reopen", hasNewEvidence: true, reason: null },
      }),
      reason: transitionSignal({
        currentStatus: "expired",
        currentIndiaRelevanceType: "globally_open",
        action: {
          type: "reopen",
          hasNewEvidence: false,
          reason: "A new administrator review is required.",
        },
      }),
      missing: transitionSignal({
        currentStatus: "dismissed",
        currentIndiaRelevanceType: "globally_open",
        action: { type: "reopen", hasNewEvidence: false, reason: null },
      }),
      blank: transitionSignal({
        currentStatus: "expired",
        currentIndiaRelevanceType: "globally_open",
        action: { type: "reopen", hasNewEvidence: false, reason: "   " },
      }),
    }).toEqual({
      evidence: {
        valid: true,
        status: "needs_review",
        indiaRelevanceType: "no_current_India_fit",
      },
      reason: {
        valid: true,
        status: "needs_review",
        indiaRelevanceType: "globally_open",
      },
      missing: {
        valid: false,
        reason: "reopen_evidence_or_reason_required",
      },
      blank: {
        valid: false,
        reason: "reopen_evidence_or_reason_required",
      },
    });
  });

  it.each([
    "newly_discovered",
    "needs_review",
    "monitoring",
    "qualified",
  ] as const)("marks %s as no India fit and normally monitors it", (currentStatus) => {
    expect(
      transitionSignal({
        currentStatus,
        currentIndiaRelevanceType: "explicit_India",
        action: { type: "mark_no_india_fit" },
      }),
    ).toEqual({
      valid: true,
      status: "monitoring",
      indiaRelevanceType: "no_current_India_fit",
    });
  });

  it.each(["dismissed", "expired"] as const)(
    "does not let mark-no-India-fit bypass the protected %s state",
    (currentStatus) => {
      expect(
        transitionSignal({
          currentStatus,
          currentIndiaRelevanceType: "explicit_India",
          action: { type: "mark_no_india_fit" },
        }),
      ).toEqual({ valid: false, reason: "transition_not_allowed" });
    },
  );

  it("marks a promoted signal no-India-fit through the pure lifecycle without demotion", () => {
    expect(
      transitionSignal({
        currentStatus: "promoted",
        currentIndiaRelevanceType: "explicit_India",
        action: { type: "mark_no_india_fit" },
      }),
    ).toEqual({
      valid: true,
      status: "promoted",
      indiaRelevanceType: "no_current_India_fit",
    });
  });

  it("resolves expiry edits through lifecycle protection and validates source dates", () => {
    const activity = {
      evergreen: false,
      expiresAt: "2026-07-29T00:00:00.000Z",
      reobserveBy: null,
      now: "2026-07-30T00:00:00.000Z",
      announcedAt: "2026-07-01T00:00:00.000Z",
      effectiveFrom: "2026-07-15T00:00:00.000Z",
    } as const;
    expect(
      resolveDirectDemandExpiryStatus({
        ...activity,
        currentStatus: "monitoring",
        currentIndiaRelevanceType: "globally_open",
      }),
    ).toEqual({ valid: true, status: "expired" });
    expect(
      resolveDirectDemandExpiryStatus({
        ...activity,
        currentStatus: "dismissed",
        currentIndiaRelevanceType: "globally_open",
      }),
    ).toEqual({ valid: true, status: "dismissed" });
    expect(
      resolveDirectDemandExpiryStatus({
        ...activity,
        currentStatus: "monitoring",
        currentIndiaRelevanceType: "globally_open",
        expiresAt: "2026-06-30T00:00:00.000Z",
      }),
    ).toEqual({ valid: false, reason: "invalid_expiry_edit" });
  });

  it("fails closed for unknown actions, stale scoring versions, and extra fields", () => {
    expect([
      transitionSignal({
        currentStatus: "monitoring",
        currentIndiaRelevanceType: "globally_open",
        action: { type: "archive" },
      }),
      transitionSignal({
        currentStatus: "monitoring",
        currentIndiaRelevanceType: "globally_open",
        action: {
          type: "qualify",
          qualification: { ...qualification, scoreVersion: "old-score-v0" },
        },
      }),
      transitionSignal({
        currentStatus: "monitoring",
        currentIndiaRelevanceType: "globally_open",
        action: { type: "dismiss" },
        extra: true,
      }),
    ]).toEqual([
      { valid: false, reason: "invalid_transition_input" },
      { valid: false, reason: "invalid_transition_input" },
      { valid: false, reason: "invalid_transition_input" },
    ]);
  });
});
