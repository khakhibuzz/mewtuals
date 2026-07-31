import { describe, expect, it } from "vitest";

import {
  canonicalPromotionInput,
  canonicalReversalInput,
} from "../db/repositories/global-radar-promotion-contracts";

const ENTITY_ID = "00000000-0000-4000-8000-000000000101";
const SIGNAL_ID = "00000000-0000-4000-8000-000000000102";
const ACTOR_ID = "00000000-0000-4000-8000-000000000103";
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000104";
const NOW = new Date("2026-07-31T12:00:00.000Z");

function promotion(reason: string) {
  return {
    globalEntityId: ENTITY_ID,
    primarySignalId: SIGNAL_ID,
    supportingSignalIds: [SIGNAL_ID],
    eligibilityPath: "qualified_india_direct_demand" as const,
    expectedEntityRevision: 1,
    expectedPrimarySignalRevision: 2,
    expectedSupportingSignalRevisions: { [SIGNAL_ID]: 2 },
    actor: { userId: ACTOR_ID, email: "admin@example.com" },
    idempotencyKey: IDEMPOTENCY_KEY,
    reason,
    now: NOW,
  };
}

function reversal(reason: string) {
  return {
    globalEntityId: ENTITY_ID,
    expectedEntityRevision: 1,
    expectedPrimarySignalRevision: 2,
    actor: { userId: ACTOR_ID, email: "admin@example.com" },
    idempotencyKey: IDEMPOTENCY_KEY,
    reason,
    now: NOW,
  };
}

describe("Global Radar promotion persistence safety", () => {
  it("rejects sensitive authored reasons before repository writes", () => {
    const unsafeReasons = [
      "Authorization: Bearer private-radar-secret",
      "claim_path=/private/tmp/radar/claim.json",
      "rejectedPayload: private upstream body",
    ];
    const publicReason = Array.from(
      { length: 100 },
      (_, index) => `public-evidence-${index}`,
    ).join(" ");

    expect({
      unsafePromotions: unsafeReasons.map((reason) =>
        canonicalPromotionInput(promotion(reason)),
      ),
      unsafeReversals: unsafeReasons.map((reason) =>
        canonicalReversalInput(reversal(reason)),
      ),
      publicPromotion: canonicalPromotionInput(promotion(publicReason)) !== null,
      publicReversal: canonicalReversalInput(reversal(publicReason)) !== null,
    }).toEqual({
      unsafePromotions: unsafeReasons.map(() => null),
      unsafeReversals: unsafeReasons.map(() => null),
      publicPromotion: true,
      publicReversal: true,
    });
  });
});
