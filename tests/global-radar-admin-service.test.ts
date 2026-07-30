import { describe, expect, it, vi } from "vitest";

import {
  createGlobalRadarAdminService,
  type GlobalRadarAdminRepositoryPort,
} from "../app/server/global-radar/admin-service";

const NOW = new Date("2026-07-31T12:00:00.000Z");
const ACTOR = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: " Admin@Example.com ",
};
const SIGNAL_ID = "00000000-0000-4000-8000-000000000002";
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000003";

function signalListItem() {
  return {
    id: SIGNAL_ID,
    signalClass: "direct_demand",
    title: "Fictional public request",
    factualSummary: "A fictional organisation published a public request.",
    theme: "robotics_manufacturing",
    sourceCountry: "China",
    demandDomain: "robot_hardware_and_components",
    indiaRelevanceType: "globally_open",
    status: "qualified",
    score: 82,
    expiresAt: null,
    reobserveBy: new Date("2026-08-31T04:00:00.000Z"),
    observedAt: NOW,
    revision: 4,
    entity: {
      id: "00000000-0000-4000-8000-000000000004",
      canonicalName: "Fictional Robotics",
      headquartersCountry: "China",
    },
  };
}

function runReadModel() {
  return {
    id: "00000000-0000-4000-8000-000000000005",
    trigger: "scheduled",
    scanMode: "daily",
    status: "succeeded",
    startedAt: NOW,
    completedAt: NOW,
    sourceCountries: ["China"],
    sourceLanguages: ["zh-CN"],
    targetDomains: ["robotics_manufacturing"],
    targetSignalTypes: ["direct_demand"],
    sourcesUsed: ["codex_public_web"],
    numberResultsExamined: 1,
    numberEntitiesObserved: 1,
    numberSignalsFound: 1,
    numberDirectDemands: 1,
    numberPrecursors: 0,
    numberMomentumRecords: 0,
    numberNew: 1,
    numberUpdated: 0,
    numberDuplicates: 0,
    numberRejectedForWeakEvidence: 0,
    numberSourceErrors: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function watchlistReadModel() {
  return {
    id: "00000000-0000-4000-8000-000000000006",
    globalEntityId: "00000000-0000-4000-8000-000000000004",
    state: "enabled",
    priority: 90,
    theme: "robotics_manufacturing",
    category: "robot components",
    categorySearchTermEn: "robot components",
    categorySearchTermZhCn: "机器人组件",
    countries: ["China"],
    languages: ["en", "zh-CN"],
    cadenceDays: 7,
    nextScanAt: new Date("2026-08-07T04:00:00.000Z"),
    reason: "Monitor public evidence.",
    revision: 2,
    entity: {
      canonicalName: "Fictional Robotics",
      headquartersCountry: "China",
      entityStatus: "watchlisted",
      revision: 3,
    },
  };
}

function signalDetailReadModel() {
  return {
    organisation: null,
    associatedOrganisations: { total: 0, truncated: false, items: [] },
    signal: {
      ...signalListItem(),
      signalType: "supplier_registration",
      interpretationSummary: "Mewtuals can review the public response path.",
      industry: "robotics",
      targetGeographies: ["Global"],
      collectionGeographies: null,
      manufacturingGeographies: ["India"],
      deliveryGeographies: ["China"],
      targetModelOrSystem: "industrial robot",
      requiredCounterpartyArchetypes: ["contract_manufacturer"],
      indiaRelevanceRationale: "The public request is globally open.",
      indiaFitReasons: ["Global supplier route"],
      indiaFitConstraints: ["Public qualification required"],
      indiaFitUnknowns: ["Volume"],
      indiaFitConfidence: 75,
      indiaRegulatoryFacts: null,
      indiaLogisticsFacts: null,
      targetCapabilityTags: ["contract_manufacturing"],
      responsePathType: "supplier_or_partner_registration",
      responsePathUrl: "https://example.com/suppliers",
      responseBusinessEmail: null,
      partnerApplicationUrl: "https://example.com/suppliers",
      firstSeenAt: NOW,
      lastSeenAt: NOW,
      workerSecret: "private-worker-secret",
    },
    scoreRationale: {
      directDemand: { score: 82, evidenceConfidence: 80 },
      precursor: { score: null },
      momentum: { score: null },
      coverage: 100,
      policyVersion: "global-radar-score-v1",
    },
    timeline: {
      announcedAt: NOW,
      effectiveFrom: NOW,
      expiresAt: null,
      evergreen: true,
      reobserveBy: new Date("2026-08-31T04:00:00.000Z"),
      observedAt: NOW,
    },
    systemsContext: {},
    compliance: { sensitiveDataFlags: {}, facts: {} },
    requirements: { total: 0, truncated: false, items: [] },
    evidence: { total: 0, truncated: false, items: [] },
    history: { total: 0, truncated: false, items: [] },
    notes: { total: 0, truncated: false, items: [] },
    watchlist: null,
    promotion: null,
    allowedActions: ["append_note"],
    rawPayload: "private-raw-payload",
  };
}

function watchlistMutationReadModels() {
  const { entity: _entity, ...entry } = watchlistReadModel();
  void _entity;
  return {
    entity: {
      id: entry.globalEntityId,
      canonicalName: "Fictional Robotics",
      headquartersCountry: "China",
      entityStatus: "watchlisted",
      revision: 3,
      workerSecret: "private-worker-secret",
    },
    entry: {
      ...entry,
      rawPayload: "private-raw-payload",
    },
  };
}

function repositoryDouble(
  overrides: Partial<GlobalRadarAdminRepositoryPort> = {},
): GlobalRadarAdminRepositoryPort {
  return {
    listSignals: vi.fn(),
    getClassMetrics: vi.fn(),
    getOverviewMetrics: vi.fn(),
    getSignalDetail: vi.fn(),
    listWatchlist: vi.fn(),
    getWatchlistEnrichment: vi.fn(),
    listRuns: vi.fn(),
    reviewSignal: vi.fn(),
    editSignalClassification: vi.fn(),
    editDirectDemandExpiry: vi.fn(),
    appendEvidence: vi.fn(),
    appendNote: vi.fn(),
    mergeSignals: vi.fn(),
    upsertWatchlist: vi.fn(),
    ...overrides,
  };
}

function createService(
  repository: GlobalRadarAdminRepositoryPort,
  overrides: Record<string, unknown> = {},
) {
  return createGlobalRadarAdminService({
    repository,
    adminEmails: ["admin@example.com"],
    now: () => NOW,
    queueManualRun: vi.fn(),
    promote: vi.fn(),
    reversePromotion: vi.fn(),
    ...overrides,
  });
}

describe("Global Radar administrator service", () => {
  it("rechecks normalized administrator authorization on every read", async () => {
    const repository = repositoryDouble({
      getSignalDetail: vi.fn(async () => ({ outcome: "not_found" })),
    });
    const service = createService(repository);

    await expect(service.getSignalDetail(null, SIGNAL_ID)).resolves.toEqual({
      outcome: "forbidden",
    });
    await expect(
      service.getSignalDetail(
        { ...ACTOR, email: "outsider@example.com" },
        SIGNAL_ID,
      ),
    ).resolves.toEqual({ outcome: "forbidden" });
    await expect(service.getSignalDetail(ACTOR, SIGNAL_ID)).resolves.toEqual({
      outcome: "not_found",
    });
    expect(repository.getSignalDetail).toHaveBeenCalledTimes(1);
  });

  it("validates class filters and converts Kolkata calendar dates to half-open instants", async () => {
    const repository = repositoryDouble({
      listSignals: vi.fn(async () => ({
        outcome: "listed",
        page: 2,
        pageSize: 25,
        total: 26,
        items: [signalListItem()],
      })),
      getClassMetrics: vi.fn(async () => ({
        outcome: "listed",
        metrics: {
          total: 26,
          highQuality: 10,
          byStatus: { qualified: 5 },
          india: { explicit: 2, inferred: 3, other: 21 },
          countries: { unitedStates: 10, china: 10, other: 6 },
          requirementMix: { physicalData: 5, hardware: 6 },
          demandFamilies: { robot_hardware_and_components: 8 },
          active: 20,
          expiring: 3,
          horizon: {
            within30Days: 0,
            days31To90: 0,
            days91To180: 0,
            days181To365: 0,
            unknown: 0,
          },
          qualified: 5,
        },
      })),
      getOverviewMetrics: vi.fn(async () => ({
        outcome: "listed",
        metrics: {
          newSignals: 4,
          activeDirectDemand: 20,
          highQualityPrecursors: 8,
          india: { explicit: 2, inferred: 3 },
          countries: { unitedStates: 10, china: 10, other: 6 },
          requirementMix: { physicalData: 5, hardware: 6 },
          capabilityFamilies: [{ capability: "contract_manufacturing", signals: 6 }],
          expiringDirectDemand: 3,
          promotedEntities: 2,
          latestRun: {
            id: "00000000-0000-4000-8000-000000000005",
            status: "succeeded",
            completedAt: NOW,
            createdAt: NOW,
          },
          sourceErrors: 1,
          mergedDuplicates: 2,
        },
      })),
    });
    const service = createService(repository);

    await expect(
      service.getClassSummary(ACTOR, {
        signalClass: "direct_demand",
        filters: {
          observedFrom: "2026-07-30",
          observedTo: "2026-07-31",
          expiresBefore: "2026-08-01",
          page: "2",
        },
      }),
    ).resolves.toMatchObject({
      outcome: "listed",
      page: 2,
      pageSize: 25,
      total: 26,
      items: [{ organisation: { canonicalName: "Fictional Robotics" } }],
      metrics: {
        class: { total: 26, highQuality: 10 },
        capabilityFamilies: [{ capability: "contract_manufacturing", signals: 6 }],
        promotionCount: 2,
        latestRun: { status: "succeeded", completedAt: NOW.toISOString() },
        sourceErrors: 1,
        mergedDuplicates: 2,
      },
    });
    expect(repository.listSignals).toHaveBeenCalledWith({
      signalClass: "direct_demand",
      filters: {
        observedFrom: "2026-07-29T18:30:00.000Z",
        observedTo: "2026-07-31T18:30:00.000Z",
        expiresBefore: "2026-08-01T18:30:00.000Z",
        page: 2,
      },
    });
    await expect(
      service.getClassSummary(ACTOR, {
        signalClass: "direct_demand",
        filters: { theme: "robotics_manufacturing" },
      }),
    ).resolves.toEqual({ outcome: "invalid" });
  });

  it("distinguishes an empty filtered result from an honestly empty signal class", async () => {
    const getClassMetrics = vi
      .fn()
      .mockResolvedValueOnce({
        outcome: "listed",
        metrics: {
          total: 0,
          highQuality: 0,
          byStatus: {},
          india: { explicit: 0, inferred: 0, other: 0 },
          countries: { unitedStates: 0, china: 0, other: 0 },
          requirementMix: { physicalData: 0, hardware: 0 },
          demandFamilies: {},
          active: 0,
          expiring: 0,
          horizon: {
            within30Days: 0,
            days31To90: 0,
            days91To180: 0,
            days181To365: 0,
            unknown: 0,
          },
          qualified: 0,
        },
      })
      .mockResolvedValueOnce({
        outcome: "listed",
        metrics: {
          total: 4,
          highQuality: 1,
          byStatus: { monitoring: 4 },
          india: { explicit: 0, inferred: 1, other: 3 },
          countries: { unitedStates: 2, china: 1, other: 1 },
          requirementMix: { physicalData: 1, hardware: 1 },
          demandFamilies: {},
          active: 4,
          expiring: 0,
          horizon: {
            within30Days: 0,
            days31To90: 0,
            days91To180: 0,
            days181To365: 0,
            unknown: 0,
          },
          qualified: 0,
        },
      });
    const service = createService(
      repositoryDouble({
        listSignals: vi.fn(async () => ({
          outcome: "listed",
          page: 1,
          pageSize: 25,
          total: 0,
          items: [],
        })),
        getClassMetrics,
        getOverviewMetrics: vi.fn(async () => ({
          outcome: "listed",
          metrics: {
            capabilityFamilies: [],
            promotedEntities: 0,
            latestRun: null,
            sourceErrors: 0,
            mergedDuplicates: 0,
          },
        })),
      }),
    );

    await expect(
      service.getClassSummary(ACTOR, {
        signalClass: "direct_demand",
        filters: { country: "Japan" },
      }),
    ).resolves.toMatchObject({
      outcome: "listed",
      total: 0,
      hasAnySignals: true,
    });
    expect(getClassMetrics).toHaveBeenNthCalledWith(1, {
      signalClass: "direct_demand",
      filters: { country: "Japan" },
      now: NOW,
    });
    expect(getClassMetrics).toHaveBeenNthCalledWith(2, {
      signalClass: "direct_demand",
      filters: {},
      now: NOW,
    });
  });

  it("returns paginated run and enriched watchlist DTOs", async () => {
    const entry = watchlistReadModel();
    const repository = repositoryDouble({
      listRuns: vi.fn(async () => ({
        outcome: "listed",
        page: 3,
        pageSize: 25,
        total: 60,
        runs: [runReadModel()],
      })),
      listWatchlist: vi.fn(async () => ({
        outcome: "listed",
        page: 1,
        pageSize: 25,
        total: 1,
        entries: [entry],
      })),
      getWatchlistEnrichment: vi.fn(async () => ({
        outcome: "listed",
        items: [
          {
            globalEntityId: entry.globalEntityId,
            latestSignal: signalListItem(),
            expiry: {
              expiresAt: null,
              reobserveBy: new Date("2026-08-31T04:00:00.000Z"),
            },
            promotion: {
              id: "00000000-0000-4000-8000-000000000008",
              status: "reversed",
              discoveryCandidateId: "00000000-0000-4000-8000-000000000009",
              promotedAt: NOW,
              reversedAt: NOW,
            },
          },
        ],
      })),
    });
    const service = createService(repository);

    await expect(service.listRuns(ACTOR, { page: "3" })).resolves.toMatchObject({
      outcome: "listed",
      page: 3,
      pageSize: 25,
      total: 60,
      runs: [{ status: "succeeded" }],
    });
    await expect(service.listWatchlist(ACTOR, { page: 1 })).resolves.toMatchObject({
      outcome: "listed",
      page: 1,
      pageSize: 25,
      total: 1,
      entries: [
        {
          latestSignal: { id: SIGNAL_ID, status: "qualified" },
          expiry: { reobserveBy: "2026-08-31T04:00:00.000Z" },
          promotion: { status: "reversed" },
        },
      ],
    });
  });

  it("derives actors, enforces strict mutation envelopes, and returns HTTP-ready conflicts", async () => {
    const repository = repositoryDouble({
      reviewSignal: vi.fn(async () => ({
        outcome: "conflict",
        reason: "revision_mismatch",
      })),
      editSignalClassification: vi.fn(async () => ({ outcome: "updated" })),
      editDirectDemandExpiry: vi.fn(async () => ({ outcome: "updated" })),
      appendEvidence: vi.fn(async () => ({ outcome: "appended", revision: 5 })),
      appendNote: vi.fn(async () => ({ outcome: "appended", revision: 5 })),
      mergeSignals: vi.fn(async () => ({ outcome: "merged" })),
      upsertWatchlist: vi.fn(async () => ({
        outcome: "created",
        ...watchlistMutationReadModels(),
      })),
    });
    const queueManualRun = vi.fn(async () => ({ outcome: "queued" }));
    const promote = vi.fn(async () => ({ outcome: "promoted" }));
    const reversePromotion = vi.fn(async () => ({ outcome: "reversed" }));
    const service = createService(repository, {
      queueManualRun,
      promote,
      reversePromotion,
    });
    const envelope = {
      expectedRevision: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Administrator reviewed current public evidence.",
    };

    await expect(
      service.reviewSignal(ACTOR, SIGNAL_ID, {
        ...envelope,
        command: { type: "monitor" },
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "revision_mismatch",
      httpStatus: 409,
    });
    expect(repository.reviewSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        signalId: SIGNAL_ID,
        actor: { userId: ACTOR.userId, email: "admin@example.com" },
        envelope: expect.objectContaining({ now: NOW }),
        command: { type: "monitor" },
      }),
    );

    await service.editClassification(ACTOR, SIGNAL_ID, {
      ...envelope,
      classification: { signalClass: "ecosystem_momentum" },
    });
    await service.editExpiry(ACTOR, SIGNAL_ID, {
      ...envelope,
      expiry: { evergreen: false, expiresAt: null, reobserveBy: null },
    });
    await service.appendEvidence(ACTOR, SIGNAL_ID, {
      ...envelope,
      evidence: { sourceUrl: "https://example.com/evidence" },
    });
    await service.appendNote(ACTOR, SIGNAL_ID, {
      ...envelope,
      body: "Append-only administrator note.",
    });
    await service.mergeSignals(ACTOR, {
      survivorSignalId: SIGNAL_ID,
      duplicateSignalId: "00000000-0000-4000-8000-000000000010",
      expectedSurvivorRevision: 4,
      expectedDuplicateRevision: 2,
      confirmed: true,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: envelope.reason,
    });
    await service.upsertWatchlist(ACTOR, {
      entity: { type: "existing", entityId: entryId(), expectedRevision: 3 },
      expectedEntryRevision: 2,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: envelope.reason,
      configuration: { state: "paused" },
    });
    await service.queueManual(ACTOR, {
      requestId: "00000000-0000-4000-8000-000000000011",
    });
    await service.promote(ACTOR, { entityId: entryId() });
    await service.reversePromotion(ACTOR, { entityId: entryId() });

    for (const call of [
      repository.editSignalClassification,
      repository.editDirectDemandExpiry,
      repository.appendEvidence,
      repository.appendNote,
      repository.mergeSignals,
      repository.upsertWatchlist,
      queueManualRun,
      promote,
      reversePromotion,
    ]) {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({
          actor: { userId: ACTOR.userId, email: "admin@example.com" },
        }),
      );
    }

    await expect(
      service.reviewSignal(ACTOR, SIGNAL_ID, {
        ...envelope,
        command: { type: "monitor" },
        rawPayload: { private: true },
      }),
    ).resolves.toEqual({ outcome: "invalid" });
  });

  it("returns exact allowlisted mutation DTOs for success and conflict outcomes", async () => {
    const detail = signalDetailReadModel();
    const watchlist = watchlistMutationReadModels();
    const repository = repositoryDouble({
      reviewSignal: vi
        .fn()
        .mockResolvedValueOnce({ outcome: "updated", detail })
        .mockResolvedValueOnce({
          outcome: "conflict",
          reason: "revision_mismatch",
          detail,
        }),
      appendEvidence: vi
        .fn()
        .mockResolvedValueOnce({ outcome: "appended", revision: 5 })
        .mockResolvedValueOnce({
          outcome: "conflict",
          reason: "revision_mismatch",
          detail,
        }),
      mergeSignals: vi
        .fn()
        .mockResolvedValueOnce({
          outcome: "merged",
          survivor: detail,
          duplicate: detail,
        })
        .mockResolvedValueOnce({
          outcome: "conflict",
          reason: "revision_mismatch",
          survivor: detail,
          duplicate: detail,
        }),
      upsertWatchlist: vi
        .fn()
        .mockResolvedValueOnce({ outcome: "updated", ...watchlist })
        .mockResolvedValueOnce({
          outcome: "conflict",
          reason: "revision_mismatch",
          ...watchlist,
        }),
    });
    const service = createService(repository);
    const envelope = {
      expectedRevision: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Administrator reviewed current public evidence.",
    };
    const reviewInput = { ...envelope, command: { type: "monitor" as const } };
    const evidenceInput = {
      ...envelope,
      evidence: { sourceUrl: "https://example.com/evidence" },
    };
    const mergeInput = {
      survivorSignalId: SIGNAL_ID,
      duplicateSignalId: "00000000-0000-4000-8000-000000000010",
      expectedSurvivorRevision: 4,
      expectedDuplicateRevision: 2,
      confirmed: true,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: envelope.reason,
    };
    const watchlistInput = {
      entity: { type: "existing", entityId: entryId(), expectedRevision: 3 },
      expectedEntryRevision: 2,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: envelope.reason,
      configuration: { state: "paused" },
    };

    const signalSuccess = await service.reviewSignal(
      ACTOR,
      SIGNAL_ID,
      reviewInput,
    );
    const signalConflict = await service.reviewSignal(
      ACTOR,
      SIGNAL_ID,
      reviewInput,
    );
    const evidenceSuccess = await service.appendEvidence(
      ACTOR,
      SIGNAL_ID,
      evidenceInput,
    );
    const evidenceConflict = await service.appendEvidence(
      ACTOR,
      SIGNAL_ID,
      evidenceInput,
    );
    const mergeSuccess = await service.mergeSignals(ACTOR, mergeInput);
    const mergeConflict = await service.mergeSignals(ACTOR, mergeInput);
    const watchlistSuccess = await service.upsertWatchlist(ACTOR, watchlistInput);
    const watchlistConflict = await service.upsertWatchlist(ACTOR, watchlistInput);

    expect(Object.keys(signalSuccess)).toEqual(["outcome", "detail"]);
    if (!("detail" in signalSuccess) || !signalSuccess.detail) {
      throw new Error("Expected a serialized signal mutation detail.");
    }
    expect(Object.keys(signalSuccess.detail)).toEqual([
      "id",
      "revision",
      "signalClass",
      "status",
      "allowedActions",
      "sections",
    ]);
    expect(Object.keys(signalConflict)).toEqual([
      "outcome",
      "reason",
      "httpStatus",
      "latest",
    ]);
    expect(Object.keys(evidenceSuccess)).toEqual(["outcome", "revision"]);
    expect(Object.keys(evidenceConflict)).toEqual([
      "outcome",
      "reason",
      "httpStatus",
      "latest",
    ]);
    expect(Object.keys(mergeSuccess)).toEqual([
      "outcome",
      "survivor",
      "duplicate",
    ]);
    expect(Object.keys(mergeConflict)).toEqual([
      "outcome",
      "reason",
      "httpStatus",
      "survivor",
      "duplicate",
    ]);
    expect(Object.keys(watchlistSuccess)).toEqual([
      "outcome",
      "entity",
      "entry",
    ]);
    expect(Object.keys(watchlistConflict)).toEqual([
      "outcome",
      "reason",
      "httpStatus",
      "entity",
      "entry",
    ]);
    if (
      !("entity" in watchlistSuccess) ||
      !watchlistSuccess.entity ||
      !("entry" in watchlistSuccess) ||
      !watchlistSuccess.entry
    ) {
      throw new Error("Expected serialized watchlist mutation DTOs.");
    }
    expect(Object.keys(watchlistSuccess.entity)).toEqual([
      "id",
      "canonicalName",
      "headquartersCountry",
      "entityStatus",
      "revision",
    ]);
    expect(Object.keys(watchlistSuccess.entry)).toEqual([
      "id",
      "globalEntityId",
      "state",
      "priority",
      "theme",
      "category",
      "categorySearchTermEn",
      "categorySearchTermZhCn",
      "countries",
      "languages",
      "cadenceDays",
      "nextScanAt",
      "reason",
      "revision",
    ]);
    for (const result of [
      signalSuccess,
      signalConflict,
      evidenceSuccess,
      evidenceConflict,
      mergeSuccess,
      mergeConflict,
      watchlistSuccess,
      watchlistConflict,
    ]) {
      expect(JSON.stringify(result)).not.toMatch(
        /private-worker-secret|private-raw-payload/,
      );
    }
  });
});

function entryId() {
  return "00000000-0000-4000-8000-000000000004";
}
