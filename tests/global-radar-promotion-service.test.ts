import { describe, expect, it, vi } from "vitest";

import {
  createGlobalRadarPromotionService,
  evaluateGlobalRadarPromotionEligibility,
  type GlobalRadarPromotionContext,
  type GlobalRadarPromotionRepositoryPort,
} from "../app/server/global-radar/promotion-service";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const ACTOR = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: " ADMIN@Example.com ",
};
const ENTITY_ID = "00000000-0000-4000-8000-000000000002";
const PRIMARY_ID = "00000000-0000-4000-8000-000000000003";
const SUPPORTING_A = "00000000-0000-4000-8000-000000000004";
const SUPPORTING_B = "00000000-0000-4000-8000-000000000005";
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000006";

function qualifyingSignal(
  id: string,
  overrides: Partial<GlobalRadarPromotionContext["primarySignal"]> = {},
): GlobalRadarPromotionContext["primarySignal"] {
  return {
    id,
    revision: 2,
    status: "qualified",
    signalClass: "direct_demand",
    score: 82,
    scoreVersion: "global-radar-score-v1",
    hardGatesPassed: true,
    indiaRelevanceType: "globally_open",
    observedAt: new Date("2026-07-01T12:00:00.000Z"),
    ...overrides,
  };
}

function storedSignal(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    globalEntityId: ENTITY_ID,
    revision: 2,
    status: "qualified",
    signalClass: "direct_demand" as const,
    directDemandScore: 82,
    precursorScore: null,
    momentumScore: null,
    scorePolicyVersion: "global-radar-score-v1",
    demandExplicitness: 80,
    evidenceConfidence: 75,
    proximityToExternalDemand: null,
    momentumIndependentEntityCount: null,
    momentumPrimarySourceCount: null,
    momentumTaxonomyConsistency: null,
    momentumEvidenceQuality: null,
    momentumQualificationGatesPassed: null,
    evergreen: false,
    expiresAt: new Date("2026-08-31T12:00:00.000Z"),
    reobserveBy: null,
    indiaRelevanceType: "globally_open" as const,
    observedAt: new Date("2026-07-01T12:00:00.000Z"),
    ...overrides,
  };
}

function storedContext() {
  return {
    entity: {
      id: ENTITY_ID,
      revision: 3,
      entityStatus: "qualified",
    },
    primarySignal: storedSignal(PRIMARY_ID),
    supportingSignals: [storedSignal(PRIMARY_ID)],
    evidence: [
      {
        signalId: PRIMARY_ID,
        canonicalSourceUrl: "https://official.example/evidence",
        isPrimarySource: true,
        isSyndicated: false,
        supportsIndiaRelevance: true,
        supportedFieldPaths: [
          "indiaRelevance.existing_India_presence.manufacturing",
        ],
      },
    ],
    promotionSupportingSignalIds: [PRIMARY_ID],
    eligibilityFacts: {
      hasPublicIdentityEvidence: true,
      hasIdentifierConflict: false,
    },
  };
}

function context(
  overrides: Partial<GlobalRadarPromotionContext> = {},
): GlobalRadarPromotionContext {
  return {
    entity: {
      id: ENTITY_ID,
      revision: 3,
      status: "qualified",
      hasPublicIdentityEvidence: true,
      hasIdentifierConflict: false,
    },
    primarySignal: qualifyingSignal(PRIMARY_ID),
    supportingSignals: [
      qualifyingSignal(SUPPORTING_A),
      qualifyingSignal(SUPPORTING_B, { signalClass: "demand_precursor", score: 72 }),
    ],
    primaryEvidence: [
      {
        sourceKey: "official.example/a",
        isPrimarySource: true,
        isSyndicated: false,
        supportsDocumentedIndianRelationship: true,
      },
      {
        sourceKey: "official.example/b",
        isPrimarySource: true,
        isSyndicated: false,
        supportsDocumentedIndianRelationship: false,
      },
    ],
    promotionSupportingSignalIds: [PRIMARY_ID, SUPPORTING_A, SUPPORTING_B],
    ...overrides,
  };
}

function promotionReadModel() {
  return {
    id: "00000000-0000-4000-8000-000000000007",
    globalEntityId: ENTITY_ID,
    primarySignalId: PRIMARY_ID,
    supportingSignalIds: [SUPPORTING_A, SUPPORTING_B],
    eligibilityPath: "repeated_india_compatible_signals",
    discoveryRunId: "00000000-0000-4000-8000-000000000008",
    discoveryCandidateId: "00000000-0000-4000-8000-000000000009",
    status: "active",
    promotedAt: NOW,
    reversedAt: null,
    revisionContext: {
      expectedEntity: 3,
      expectedPrimarySignal: 2,
      promotedEntity: 4,
      promotedPrimarySignal: 3,
    },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function repositoryDouble(
  overrides: Partial<Record<keyof GlobalRadarPromotionRepositoryPort, unknown>> = {},
): GlobalRadarPromotionRepositoryPort {
  return {
    lookupPromotionReplay: vi.fn(async () => ({ outcome: "not_found" })),
    loadContext: vi.fn(),
    promote: vi.fn(),
    reverse: vi.fn(),
    ...overrides,
  } as GlobalRadarPromotionRepositoryPort;
}

function service(repository: GlobalRadarPromotionRepositoryPort) {
  return createGlobalRadarPromotionService({
    repository,
    adminEmails: ["admin@example.com"],
    thresholds: {
      direct_demand: 70,
      demand_precursor: 65,
      ecosystem_momentum: 70,
    },
    scoreVersion: "global-radar-score-v1",
    now: () => NOW,
  });
}

function promotionInput(
  path:
    | "qualified_india_direct_demand"
    | "repeated_india_compatible_signals"
    | "documented_indian_relationship"
    | "exceptional_strategic_relevance",
) {
  return {
    entityId: ENTITY_ID,
    primarySignalId: PRIMARY_ID,
    supportingSignalIds:
      path === "repeated_india_compatible_signals"
        ? [SUPPORTING_A, SUPPORTING_B]
        : [],
    eligibilityPath: path,
    expectedEntityRevision: 3,
    expectedPrimarySignalRevision: 2,
    expectedSupportingSignalRevisions:
      path === "repeated_india_compatible_signals"
        ? [
            { signalId: SUPPORTING_A, revision: 2 },
            { signalId: SUPPORTING_B, revision: 2 },
          ]
        : [],
    idempotencyKey: IDEMPOTENCY_KEY,
    reason: "Create a controlled Discovery candidate from public evidence.",
    rationale: "The selected path is supported by current public evidence.",
  };
}

describe("Global Radar promotion service", () => {
  it("recomputes each approved path from repository facts", () => {
    const cases = [
      "qualified_india_direct_demand",
      "repeated_india_compatible_signals",
      "documented_indian_relationship",
      "exceptional_strategic_relevance",
    ] as const;
    for (const eligibilityPath of cases) {
      expect(
        evaluateGlobalRadarPromotionEligibility({
          eligibilityPath,
          context: context(),
          thresholds: {
            direct_demand: 70,
            demand_precursor: 65,
            ecosystem_momentum: 70,
          },
          scoreVersion: "global-radar-score-v1",
          now: NOW,
        }),
      ).toEqual({ eligible: true, path: eligibilityPath });
    }
  });

  it("refuses failed common gates and path-specific evidence", () => {
    expect(
      evaluateGlobalRadarPromotionEligibility({
        eligibilityPath: "qualified_india_direct_demand",
        context: context({
          entity: {
            ...context().entity,
            hasPublicIdentityEvidence: false,
          },
        }),
        thresholds: {
          direct_demand: 70,
          demand_precursor: 65,
          ecosystem_momentum: 70,
        },
        scoreVersion: "global-radar-score-v1",
        now: NOW,
      }),
    ).toEqual({ eligible: false, reason: "missing_public_identity_evidence" });
    expect(
      evaluateGlobalRadarPromotionEligibility({
        eligibilityPath: "repeated_india_compatible_signals",
        context: context({ supportingSignals: [qualifyingSignal(SUPPORTING_A)] }),
        thresholds: {
          direct_demand: 70,
          demand_precursor: 65,
          ecosystem_momentum: 70,
        },
        scoreVersion: "global-radar-score-v1",
        now: NOW,
      }),
    ).toEqual({ eligible: false, reason: "insufficient_repeated_signals" });
    expect(
      evaluateGlobalRadarPromotionEligibility({
        eligibilityPath: "exceptional_strategic_relevance",
        context: context({ primaryEvidence: [context().primaryEvidence[0]!] }),
        thresholds: {
          direct_demand: 70,
          demand_precursor: 65,
          ecosystem_momentum: 70,
        },
        scoreVersion: "global-radar-score-v1",
        now: NOW,
      }),
    ).toEqual({ eligible: false, reason: "insufficient_independent_primary_sources" });
  });

  it("authorizes, checks revisions, and passes only server-evaluated promotion facts", async () => {
    const repository = repositoryDouble({
      loadContext: vi.fn(async () => ({
        outcome: "found",
        context: context(),
      })),
      promote: vi.fn(async () => ({
        outcome: "promoted",
        promotion: promotionReadModel(),
      })),
    });
    const promotionService = service(repository);

    await expect(
      promotionService.promote(ACTOR, promotionInput("repeated_india_compatible_signals")),
    ).resolves.toMatchObject({
      outcome: "promoted",
      promotion: {
        status: "active",
        discoveryCandidateId: "00000000-0000-4000-8000-000000000009",
      },
    });
    expect(repository.loadContext).toHaveBeenCalledWith({
      globalEntityId: ENTITY_ID,
      primarySignalId: PRIMARY_ID,
      supportingSignalIds: [SUPPORTING_A, SUPPORTING_B],
    });
    expect(repository.promote).toHaveBeenCalledWith(
      expect.objectContaining({
        globalEntityId: ENTITY_ID,
        supportingSignalIds: [PRIMARY_ID, SUPPORTING_A, SUPPORTING_B],
        actor: { userId: ACTOR.userId, email: "admin@example.com" },
        expectedSupportingSignalRevisions: {
          [PRIMARY_ID]: 2,
          [SUPPORTING_A]: 2,
          [SUPPORTING_B]: 2,
        },
        reason:
          "Create a controlled Discovery candidate from public evidence.\n" +
          "Rationale: The selected path is supported by current public evidence.",
      }),
    );

    await expect(
      promotionService.promote(
        { ...ACTOR, email: "outsider@example.com" },
        promotionInput("qualified_india_direct_demand"),
      ),
    ).resolves.toEqual({ outcome: "forbidden" });
    await expect(
      promotionService.promote(ACTOR, {
        ...promotionInput("qualified_india_direct_demand"),
        supportingCount: 99,
        score: 100,
      }),
    ).resolves.toEqual({ outcome: "invalid" });
  });

  it("adapts the Task 11 stored context and recomputes hard gates", async () => {
    const repository = repositoryDouble({
      loadContext: vi.fn(async () => ({
        outcome: "found",
        context: storedContext(),
      })),
      promote: vi.fn(async () => ({
        outcome: "promoted",
        promotion: promotionReadModel(),
      })),
    });

    await expect(
      service(repository).promote(
        ACTOR,
        promotionInput("qualified_india_direct_demand"),
      ),
    ).resolves.toMatchObject({ outcome: "promoted" });
    expect(repository.promote).toHaveBeenCalledTimes(1);

    repository.loadContext = vi.fn(async () => ({
      outcome: "found" as const,
      context: {
        ...storedContext(),
        primarySignal: storedSignal(PRIMARY_ID, {
          expiresAt: new Date("2026-07-30T12:00:00.000Z"),
        }),
        supportingSignals: [
          storedSignal(PRIMARY_ID, {
            expiresAt: new Date("2026-07-30T12:00:00.000Z"),
          }),
        ],
      },
    }));
    repository.promote = vi.fn(async () => ({
      outcome: "conflict" as const,
      reason: "eligibility_not_met",
    }));
    await expect(
      service(repository).promote(
        ACTOR,
        promotionInput("qualified_india_direct_demand"),
      ),
    ).resolves.toEqual({
      outcome: "ineligible",
      reason: "primary_signal_hard_gates_failed",
    });
    expect(repository.promote).toHaveBeenCalledTimes(1);
  });

  it("does not treat expansion or request evidence as a documented Indian relationship", async () => {
    const repository = repositoryDouble({
      loadContext: vi.fn(async () => ({
        outcome: "found",
        context: {
          ...storedContext(),
          evidence: [
            {
              ...storedContext().evidence[0]!,
              supportedFieldPaths: [
                "indiaRelevance.India_expansion.manufacturing",
                "indiaRelevance.explicit_India.suppliers",
              ],
            },
          ],
        },
      })),
      promote: vi.fn(async () => ({
        outcome: "conflict" as const,
        reason: "eligibility_not_met",
      })),
    });

    await expect(
      service(repository).promote(
        ACTOR,
        promotionInput("documented_indian_relationship"),
      ),
    ).resolves.toEqual({
      outcome: "ineligible",
      reason: "missing_documented_indian_relationship",
    });
    expect(repository.promote).toHaveBeenCalledTimes(1);
  });

  it("replays an exact completed promotion before checking post-promotion revisions", async () => {
    const repository = repositoryDouble({
      lookupPromotionReplay: vi.fn(async () => ({
        outcome: "replayed",
        promotion: promotionReadModel(),
      })),
      loadContext: vi.fn(),
      promote: vi.fn(),
    });

    await expect(
      service(repository).promote(
        ACTOR,
        promotionInput("qualified_india_direct_demand"),
      ),
    ).resolves.toMatchObject({
      outcome: "replayed",
      promotion: { status: "active" },
    });
    expect(repository.loadContext).not.toHaveBeenCalled();
    expect(repository.promote).not.toHaveBeenCalled();
  });

  it("lets the repository durably record revision conflicts and maps safe failures", async () => {
    const repository = repositoryDouble({
      loadContext: vi.fn(async () => ({
        outcome: "found",
        context: context({
          entity: { ...context().entity, revision: 4 },
          supportingSignals: [],
          promotionSupportingSignalIds: [PRIMARY_ID],
        }),
      })),
      promote: vi.fn(async () => ({
        outcome: "conflict" as const,
        reason: "revision_mismatch",
      })),
    });
    const promotionService = service(repository);

    await expect(
      promotionService.promote(ACTOR, promotionInput("qualified_india_direct_demand")),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "revision_mismatch",
      httpStatus: 409,
    });
    expect(repository.promote).toHaveBeenCalledTimes(1);

    repository.loadContext = vi.fn(async () => ({
      outcome: "found" as const,
      context: context({
        supportingSignals: [],
        promotionSupportingSignalIds: [PRIMARY_ID],
      }),
    }));
    repository.promote = vi.fn(async () => ({
      outcome: "failed" as const,
      reason: "persistence_failure",
    }));
    await expect(
      promotionService.promote(ACTOR, promotionInput("qualified_india_direct_demand")),
    ).resolves.toEqual({
      outcome: "failed",
      reason: "persistence_failure",
    });
  });

  it("performs compensating reversal without accepting restoration guesses", async () => {
    const repository = repositoryDouble({
      reverse: vi.fn(async () => ({
        outcome: "replayed",
        promotion: {
          ...promotionReadModel(),
          status: "reversed",
          reversedAt: NOW,
        },
      })),
    });
    const promotionService = service(repository);
    const input = {
      entityId: ENTITY_ID,
      expectedEntityRevision: 4,
      expectedPrimarySignalRevision: 3,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Reverse after administrator review.",
    };

    await expect(promotionService.reversePromotion(ACTOR, input)).resolves.toMatchObject({
      outcome: "replayed",
      promotion: { status: "reversed" },
    });
    expect(repository.reverse).toHaveBeenCalledWith({
      globalEntityId: ENTITY_ID,
      expectedEntityRevision: input.expectedEntityRevision,
      expectedPrimarySignalRevision: input.expectedPrimarySignalRevision,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      actor: { userId: ACTOR.userId, email: "admin@example.com" },
      now: NOW,
    });
    await expect(
      promotionService.reversePromotion(ACTOR, {
        ...input,
        restoreStatus: "qualified",
      }),
    ).resolves.toEqual({ outcome: "invalid" });
  });
});
