import { describe, expect, it, vi } from "vitest";

import {
  GLOBAL_RADAR_SCORE_VERSION,
  createGlobalRadarMomentumPolicy,
  generateGlobalRadarQueries,
  globalRadarDemandFamilies,
  globalRadarLeafIdentifiers,
  globalRadarSourceFamilies,
  globalRadarThemes,
  planGlobalRadarRun,
  type RadarPlan,
} from "../app/domain/global-radar";
import {
  createGlobalRadarConfig,
  type GlobalRadarConfig,
} from "../app/server/global-radar/config";
import {
  createGlobalRadarRunService,
  type GlobalRadarRunRepositoryPort,
  type GlobalRadarValidatedBatchPort,
} from "../app/server/global-radar/run-service";
import {
  createGlobalRadarApplication,
  createGlobalRadarApplicationDependencies,
  shouldCacheGlobalRadarApplication,
} from "../app/server/global-radar";

const NOW = new Date("2026-07-31T04:00:00.000Z");
const ADMIN = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: " ADMIN@Example.com ",
};

const config: GlobalRadarConfig = createGlobalRadarConfig({
  workerSecret: "radar-worker-secret-that-is-longer-than-32-characters",
  countries: ["United States", "China"],
  languages: ["en", "zh-CN"] as const,
  themes: globalRadarThemes,
  enabledSources: ["codex_public_web"] as const,
  resultLimit: 20,
  thresholds: {
    direct_demand: 70,
    demand_precursor: 65,
    ecosystem_momentum: 70,
  },
});

const PLANNED_THRESHOLDS = Object.freeze({
  version: "global-radar-thresholds-v1" as const,
  ...config.thresholds,
});

function planningInput(scanMode: RadarPlan["scanMode"] = "daily") {
  return {
    now: NOW,
    scanMode,
    config: {
      countries: config.countries,
      languages: config.languages,
      themes: config.themes,
      enabledSourceAdapters: config.enabledSources,
      sourceFamilies: globalRadarSourceFamilies,
      resultLimit: config.resultLimit,
      scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
      thresholds: {
        version: "global-radar-thresholds-v1" as const,
        ...config.thresholds,
      },
    },
    coverageState: {
      countryLastCoveredAt: {},
      themeLastCoveredAt: {},
      watchlistLastCoveredAt: {},
    },
    watchlist: [],
  };
}

function safeRun(
  overrides: Record<string, unknown> = {},
) {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    externalRunKey: "private-external-key",
    trigger: "scheduled" as const,
    scanMode: "daily" as const,
    status: "running" as const,
    planFingerprint: "a".repeat(64),
    startedAt: NOW,
    completedAt: null,
    sourceCountries: ["United States", "China"],
    sourceLanguages: ["en", "zh-CN"],
    targetDomains: ["robotics_manufacturing"],
    targetSignalTypes: ["direct_demand"],
    sourcesUsed: ["codex_public_web"],
    numberResultsExamined: 0,
    numberEntitiesObserved: 0,
    numberSignalsFound: 0,
    numberDirectDemands: 0,
    numberPrecursors: 0,
    numberMomentumRecords: 0,
    numberNew: 0,
    numberUpdated: 0,
    numberDuplicates: 0,
    numberRejectedForWeakEvidence: 0,
    numberSourceErrors: 0,
    promptVersion: "codex-public-web-v1",
    schemaVersion: "global-radar-batch-v1",
    taxonomyVersion: "global-radar-v1",
    scoringVersion: "global-radar-score-v1",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function repositoryDouble(
  overrides: Partial<Record<keyof GlobalRadarRunRepositoryPort, unknown>> = {},
): GlobalRadarRunRepositoryPort {
  return {
    queueRun: vi.fn(),
    claimRun: vi.fn(),
    lookupCompletionReplay: vi.fn(async () => ({
      outcome: "not_terminal",
      plannedThresholds: PLANNED_THRESHOLDS,
    })),
    completeRun: vi.fn(),
    failRun: vi.fn(),
    abandonRun: vi.fn(),
    expireDirectDemand: vi.fn(async () => ({
      outcome: "completed" as const,
      expired: 0,
    })),
    recomputeMomentum: vi.fn(async () => ({
      outcome: "completed" as const,
      recomputed: 0,
      unchanged: 0,
    })),
    ...overrides,
  } as GlobalRadarRunRepositoryPort;
}

function createService(
  repository: GlobalRadarRunRepositoryPort,
  validateBatch = vi.fn(),
  serviceConfig: GlobalRadarConfig = config,
  clock: () => Date = () => NOW,
) {
  return createGlobalRadarRunService({
    repository,
    config: serviceConfig,
    adminEmails: ["admin@example.com"],
    now: clock,
    validateBatch,
    workerOutputSchema: {
      schemaId: "global-radar-rich-worker-proposal-v1",
      additionalProperties: false,
    },
    loadPlanningContext: vi.fn(async () => ({
      coverageState: planningInput().coverageState,
      watchlist: [],
    })),
  });
}

describe("Global Radar run service", () => {
  it("runs all deterministic maintenance at one trusted time before claiming", async () => {
    const callOrder: string[] = [];
    const expireDirectDemand = vi.fn(async (input: { now: Date }) => {
      expect(input.now).toEqual(NOW);
      callOrder.push("expire");
      return { outcome: "completed" as const, expired: 0 };
    });
    const recomputeMomentum = vi.fn(async (input: {
      now: Date;
      policy: ReturnType<typeof createGlobalRadarMomentumPolicy>;
    }) => {
      callOrder.push(`momentum:${input.policy.taxonomy}`);
      return {
        outcome: "completed" as const,
        recomputed: 0,
        unchanged: 0,
      };
    });
    const claimRun = vi.fn(async () => {
      callOrder.push("claim");
      return { outcome: "no_work" as const, reason: "active_run" as const };
    });
    const repository = repositoryDouble({
      expireDirectDemand,
      recomputeMomentum,
      claimRun,
    });
    const service = createService(repository);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );

    await expect(service.claim(authorization, {})).resolves.toMatchObject({
      outcome: "no_work",
      reason: "active_run",
    });
    expect(expireDirectDemand).toHaveBeenCalledWith({ now: NOW });
    expect(recomputeMomentum).toHaveBeenCalledTimes(
      globalRadarDemandFamilies.length,
    );
    expect(recomputeMomentum.mock.calls.map(([input]) => input)).toEqual(
      globalRadarDemandFamilies.map((taxonomy) => ({
        now: NOW,
        policy: createGlobalRadarMomentumPolicy(taxonomy),
      })),
    );
    expect(callOrder).toEqual([
      "expire",
      ...globalRadarDemandFamilies.map((taxonomy) => `momentum:${taxonomy}`),
      "claim",
    ]);
  });

  it("does not mutate maintenance state for unauthorized or invalid claims", async () => {
    const repository = repositoryDouble();
    const service = createService(repository);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );

    await expect(service.claim(null, {})).resolves.toEqual({
      outcome: "unauthorized",
    });
    await expect(
      service.claim(authorization, { scanMode: "manual" }),
    ).resolves.toEqual({ outcome: "invalid" });
    expect(repository.expireDirectDemand).not.toHaveBeenCalled();
    expect(repository.recomputeMomentum).not.toHaveBeenCalled();
    expect(repository.claimRun).not.toHaveBeenCalled();
    expect(repository.queueRun).not.toHaveBeenCalled();
  });

  it("fails closed before claiming when maintenance conflicts or throws", async () => {
    const conflicted = repositoryDouble({
      expireDirectDemand: vi.fn(async () => ({
        outcome: "conflict" as const,
        reason: "invalid_input" as const,
      })),
    });
    const conflictedService = createService(conflicted);
    const conflictedAuthorization = conflictedService.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );
    await expect(
      conflictedService.claim(conflictedAuthorization, {}),
    ).resolves.toEqual({ outcome: "conflict", reason: "maintenance_failed" });
    expect(conflicted.claimRun).not.toHaveBeenCalled();
    expect(conflicted.queueRun).not.toHaveBeenCalled();

    const failed = repositoryDouble({
      recomputeMomentum: vi.fn(async () => {
        throw new Error("database unavailable");
      }),
    });
    const failedService = createService(failed);
    const failedAuthorization = failedService.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );
    await expect(failedService.claim(failedAuthorization, {})).resolves.toEqual({
      outcome: "conflict",
      reason: "maintenance_failed",
    });
    expect(failed.claimRun).not.toHaveBeenCalled();
    expect(failed.queueRun).not.toHaveBeenCalled();
  });

  it("authenticates the Radar worker and claims already-queued manual work first", async () => {
    const plan = planGlobalRadarRun({
      ...planningInput("manual"),
      administratorRequestId: "00000000-0000-4000-8000-000000000011",
    });
    const repository = repositoryDouble({
      claimRun: vi.fn(async () => ({
        outcome: "claimed",
        run: safeRun({
          trigger: "manual",
          scanMode: "manual",
          planFingerprint: plan.fingerprint,
        }),
        privateClaim: {
          leaseToken: "raw-lease-token",
          leaseExpiresAt: new Date("2026-07-31T06:00:00.000Z"),
          planSnapshot: structuredClone(plan),
        },
      })),
    });
    const service = createService(repository);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );

    expect(authorization).not.toBeNull();
    const result = await service.claim(authorization, {});

    expect(result).toMatchObject({
      outcome: "claimed",
      claim: {
        runId: "00000000-0000-4000-8000-000000000010",
        leaseToken: "raw-lease-token",
        leaseExpiresAt: "2026-07-31T06:00:00.000Z",
        versions: {
          prompt: "codex-public-web-v1",
          schema: "global-radar-batch-v1",
          taxonomy: "global-radar-v1",
          scoring: "global-radar-score-v1",
          plan: "global-radar-plan-v1",
          query: "global-radar-query-v1",
        },
        plan: { scanMode: "manual", fingerprint: plan.fingerprint },
        queries: generateGlobalRadarQueries(plan),
        config: expect.not.objectContaining({ workerSecret: expect.anything() }),
        outputSchema: expect.objectContaining({
          schemaId: "global-radar-rich-worker-proposal-v1",
          additionalProperties: false,
        }),
      },
    });
    expect(repository.queueRun).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain("private-external-key");
    expect(JSON.stringify(result)).not.toContain(config.workerSecret);
  });

  it("returns claim configuration from the persisted plan after runtime config drift", async () => {
    const persistedPlan = planGlobalRadarRun({
      ...planningInput("manual"),
      administratorRequestId: "00000000-0000-4000-8000-000000000012",
      config: {
        ...planningInput("manual").config,
        countries: ["China"],
        languages: ["zh-CN"],
        themes: ["industrial_robotics_data"],
        resultLimit: 3,
        thresholds: {
          version: "global-radar-thresholds-v1",
          direct_demand: 41,
          demand_precursor: 42,
          ecosystem_momentum: 43,
        },
      },
    });
    const driftedConfig: GlobalRadarConfig = Object.freeze({
      ...config,
      countries: ["United States"],
      languages: ["en"] as const,
      themes: ["robot_teleoperation_demonstrations"] as const,
      resultLimit: 19,
      thresholds: {
        direct_demand: 91,
        demand_precursor: 92,
        ecosystem_momentum: 93,
      },
    });
    const repository = repositoryDouble({
      claimRun: vi.fn(async () => ({
        outcome: "claimed" as const,
        run: safeRun({
          trigger: "manual",
          scanMode: "manual",
          planFingerprint: persistedPlan.fingerprint,
        }),
        privateClaim: {
          leaseToken: "raw-lease-token",
          leaseExpiresAt: new Date("2026-07-31T06:00:00.000Z"),
          planSnapshot: structuredClone(persistedPlan),
        },
      })),
    });
    const service = createService(repository, vi.fn(), driftedConfig);
    const authorization = service.authorizeWorker(
      `Bearer ${driftedConfig.workerSecret}`,
    );

    const result = await service.claim(authorization, {});

    expect(result).toMatchObject({
      outcome: "claimed",
      claim: {
        plan: {
          countries: ["China"],
          languages: ["zh-CN"],
          themes: ["industrial_robotics_data"],
          resultLimit: 3,
          thresholds: {
            direct_demand: 41,
            demand_precursor: 42,
            ecosystem_momentum: 43,
          },
        },
        config: {
          countries: ["China"],
          languages: ["zh-CN"],
          themes: ["industrial_robotics_data"],
          enabledSources: ["codex_public_web"],
          resultLimit: 3,
          thresholds: {
            direct_demand: 41,
            demand_precursor: 42,
            ecosystem_momentum: 43,
          },
        },
      },
    });
    expect(result).not.toMatchObject({
      claim: {
        config: {
          resultLimit: driftedConfig.resultLimit,
          thresholds: driftedConfig.thresholds,
        },
      },
    });
  });

  it("queues and claims one deterministic scheduled or trial plan with strict selectors", async () => {
    let calls = 0;
    let queuedPlan: RadarPlan | undefined;
    const repository = repositoryDouble({
      queueRun: vi.fn(async (input) => {
        queuedPlan = input.planSnapshot;
        return { outcome: "queued", run: safeRun({ trigger: input.trigger }) };
      }),
      claimRun: vi.fn(async () => {
        calls += 1;
        if (calls === 1) return { outcome: "no_work", reason: "empty_queue" };
        return {
          outcome: "claimed",
          run: safeRun({
            trigger: "trial",
            scanMode: "thematic",
            planFingerprint: queuedPlan!.fingerprint,
          }),
          privateClaim: {
            leaseToken: "raw-lease-token",
            leaseExpiresAt: new Date("2026-07-31T06:00:00.000Z"),
            planSnapshot: structuredClone(queuedPlan!),
          },
        };
      }),
    });
    const service = createService(repository);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );

    await expect(
      service.claim(authorization, {
        trigger: "trial",
        scanMode: "thematic",
      }),
    ).resolves.toMatchObject({
      outcome: "claimed",
      claim: { plan: { scanMode: "thematic", themes: [expect.any(String)] } },
    });
    expect(repository.queueRun).toHaveBeenCalledWith(
      expect.objectContaining({
        externalRunKey: queuedPlan!.identityKey,
        trigger: "trial",
        scanMode: "thematic",
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        planFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
    await expect(
      service.claim(authorization, { scanMode: "manual" }),
    ).resolves.toEqual({ outcome: "invalid" });
    await expect(
      service.claim(null, { trigger: "trial" }),
    ).resolves.toEqual({ outcome: "unauthorized" });
  });

  it("authenticates before validation and passes only a server-validated batch to completion", async () => {
    const validated: GlobalRadarValidatedBatchPort = {
      runId: "00000000-0000-4000-8000-000000000010",
      planFingerprint: "b".repeat(64),
      canonicalSubmissionHash: "c".repeat(64),
      executedQueries: [],
      entities: [],
      signals: [],
      sourceErrors: [],
      rejections: {},
    };
    const validateBatch = vi.fn(() => validated);
    const repository = repositoryDouble({
      completeRun: vi.fn(async (input) => ({
        outcome: "completed",
        run: safeRun({
          status: "succeeded",
          completedAt: input.now,
          planFingerprint: input.planFingerprint,
        }),
      })),
    });
    const service = createService(repository, validateBatch);
    const body = {
      schemaVersion: "global-radar-batch-v1",
      promptVersion: "codex-public-web-v1",
      taxonomyVersion: "global-radar-v1",
      runId: validated.runId,
      planFingerprint: validated.planFingerprint,
      executedQueries: [],
      entities: [],
      sourceErrors: [],
      signals: [],
    };

    await expect(
      service.complete(null, {
        runId: validated.runId,
        leaseToken: "raw-lease-token",
        batch: body,
      }),
    ).resolves.toEqual({ outcome: "unauthorized" });
    expect(validateBatch).not.toHaveBeenCalled();

    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );
    await expect(
      service.complete(authorization, {
        runId: "00000000-0000-4000-8000-000000000099",
        leaseToken: "raw-lease-token",
        batch: body,
      }),
    ).resolves.toEqual({ outcome: "invalid" });
    expect(validateBatch).not.toHaveBeenCalled();

    await expect(
      service.complete(authorization, {
        runId: validated.runId,
        leaseToken: "raw-lease-token",
        batch: body,
      }),
    ).resolves.toMatchObject({
      outcome: "completed",
      run: { status: "succeeded", counts: { signalsFound: 0, sourceErrors: 0 } },
    });
    expect(validateBatch).toHaveBeenCalledWith(
      body,
      {
        runId: validated.runId,
        now: NOW,
        thresholds: PLANNED_THRESHOLDS,
      },
    );
    expect(repository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        batch: validated,
        batchFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        submissionHash: validated.canonicalSubmissionHash,
      }),
    );
  });

  it("rejects exact worker credentials embedded in a completion before validation", async () => {
    const validateBatch = vi.fn();
    const repository = repositoryDouble();
    const service = createService(repository, validateBatch);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );
    const runId = "00000000-0000-4000-8000-000000000010";
    const leaseToken = "opaque-claim-capability-that-must-remain-private";
    const baseBatch = {
      schemaVersion: "global-radar-batch-v1",
      promptVersion: "codex-public-web-v1",
      taxonomyVersion: "global-radar-v1",
      runId,
      planFingerprint: "b".repeat(64),
      entities: [],
      sourceErrors: [],
      signals: [],
    };

    for (const credential of [leaseToken, config.workerSecret]) {
      await expect(
        service.complete(authorization, {
          runId,
          leaseToken,
          batch: {
            ...baseBatch,
            executedQueries: [
              {
                fingerprint: "c".repeat(64),
                query: `robotics supplier registration ${credential}`,
                language: "en",
                sourceCountry: "United States",
                theme: "robotics_manufacturing",
                signalIntent: "direct_demand",
                sourceAdapter: "codex_public_web",
                recencyDays: 30,
                ordinal: 0,
                executedAt: "2026-07-31T04:00:00.000Z",
                resultsExamined: 0,
                error: null,
              },
            ],
          },
        }),
      ).resolves.toEqual({ outcome: "invalid" });
    }

    expect(validateBatch).not.toHaveBeenCalled();
    expect(repository.lookupCompletionReplay).not.toHaveBeenCalled();
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("projects a fresh completion and keeps exact terminal replay write-free", async () => {
    const validated: GlobalRadarValidatedBatchPort = {
      runId: "00000000-0000-4000-8000-000000000010",
      planFingerprint: "b".repeat(64),
      canonicalSubmissionHash: "c".repeat(64),
      executedQueries: [],
      entities: [],
      signals: [],
      sourceErrors: [],
      rejections: {},
    };
    const terminalRun = safeRun({
      status: "succeeded",
      completedAt: NOW,
      planFingerprint: validated.planFingerprint,
    });
    const callOrder: string[] = [];
    let replayLookups = 0;
    const repository = repositoryDouble({
      lookupCompletionReplay: vi.fn(async () => {
        replayLookups += 1;
        return replayLookups === 1
          ? {
              outcome: "not_terminal" as const,
              plannedThresholds: PLANNED_THRESHOLDS,
            }
          : { outcome: "replayed" as const, run: terminalRun };
      }),
      completeRun: vi.fn(async () => {
        callOrder.push("complete");
        return { outcome: "completed" as const, run: terminalRun };
      }),
      expireDirectDemand: vi.fn(async ({ now }) => {
        callOrder.push(`expire:${now.toISOString()}`);
        return { outcome: "completed" as const, expired: 0 };
      }),
      recomputeMomentum: vi.fn(async ({ now, policy }) => {
        callOrder.push(`momentum:${now.toISOString()}:${policy.taxonomy}`);
        return {
          outcome: "completed" as const,
          recomputed: 0,
          unchanged: 0,
        };
      }),
    });
    const validateBatch = vi.fn(() => validated);
    const clock = vi.fn<() => Date>(() => NOW);
    const service = createService(repository, validateBatch, config, clock);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );
    const request = {
      runId: validated.runId,
      leaseToken: "raw-lease-token",
      batch: {
        schemaVersion: "global-radar-batch-v1",
        promptVersion: "codex-public-web-v1",
        taxonomyVersion: "global-radar-v1",
        runId: validated.runId,
        planFingerprint: validated.planFingerprint,
        executedQueries: [],
        entities: [],
        sourceErrors: [],
        signals: [],
      },
    };

    await expect(service.complete(authorization, request)).resolves.toMatchObject({
      outcome: "completed",
      run: { status: "succeeded" },
    });
    await expect(service.complete(authorization, request)).resolves.toMatchObject({
      outcome: "replayed",
      run: { status: "succeeded" },
    });
    expect(repository.completeRun).toHaveBeenCalledTimes(1);
    expect(validateBatch).toHaveBeenCalledTimes(1);
    expect(clock).toHaveBeenCalledTimes(1);
    expect(repository.recomputeMomentum).toHaveBeenCalledTimes(
      globalRadarDemandFamilies.length,
    );
    expect(callOrder).toEqual([
      "complete",
      `expire:${NOW.toISOString()}`,
      ...globalRadarDemandFamilies.map(
        (taxonomy) => `momentum:${NOW.toISOString()}:${taxonomy}`,
      ),
    ]);
  });

  it("repairs failed completion maintenance on the next claim, not exact replay", async () => {
    const claimAt = new Date("2026-07-31T04:05:00.000Z");
    const validated: GlobalRadarValidatedBatchPort = {
      runId: "00000000-0000-4000-8000-000000000010",
      planFingerprint: "b".repeat(64),
      canonicalSubmissionHash: "c".repeat(64),
      executedQueries: [],
      entities: [],
      signals: [],
      sourceErrors: [],
      rejections: {},
    };
    const terminalRun = safeRun({
      status: "succeeded",
      completedAt: NOW,
      planFingerprint: validated.planFingerprint,
    });
    const callOrder: string[] = [];
    let replayLookups = 0;
    let expiryAttempts = 0;
    const repository = repositoryDouble({
      lookupCompletionReplay: vi.fn(async () => {
        replayLookups += 1;
        return replayLookups === 1
          ? {
              outcome: "not_terminal" as const,
              plannedThresholds: PLANNED_THRESHOLDS,
            }
          : { outcome: "replayed" as const, run: terminalRun };
      }),
      completeRun: vi.fn(async () => {
        callOrder.push("complete");
        return { outcome: "completed" as const, run: terminalRun };
      }),
      expireDirectDemand: vi.fn(async ({ now }) => {
        callOrder.push(`expire:${now.toISOString()}`);
        expiryAttempts += 1;
        return expiryAttempts === 1
          ? { outcome: "conflict" as const, reason: "invalid_input" as const }
          : { outcome: "completed" as const, expired: 0 };
      }),
      recomputeMomentum: vi.fn(async ({ now, policy }) => {
        callOrder.push(`momentum:${now.toISOString()}:${policy.taxonomy}`);
        return {
          outcome: "completed" as const,
          recomputed: 0,
          unchanged: 0,
        };
      }),
      claimRun: vi.fn(async () => {
        callOrder.push("claim");
        return { outcome: "no_work" as const, reason: "active_run" as const };
      }),
    });
    const validateBatch = vi.fn(() => validated);
    const clock = vi
      .fn<() => Date>()
      .mockReturnValueOnce(NOW)
      .mockReturnValueOnce(claimAt);
    const service = createService(repository, validateBatch, config, clock);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );
    const request = {
      runId: validated.runId,
      leaseToken: "raw-lease-token",
      batch: {
        schemaVersion: "global-radar-batch-v1",
        promptVersion: "codex-public-web-v1",
        taxonomyVersion: "global-radar-v1",
        runId: validated.runId,
        planFingerprint: validated.planFingerprint,
        executedQueries: [],
        entities: [],
        sourceErrors: [],
        signals: [],
      },
    };

    await expect(service.complete(authorization, request)).resolves.toMatchObject({
      outcome: "conflict",
      reason: "maintenance_failed",
      run: { status: "succeeded" },
    });
    await expect(service.complete(authorization, request)).resolves.toMatchObject({
      outcome: "replayed",
      run: { status: "succeeded" },
    });
    await expect(service.claim(authorization, {})).resolves.toMatchObject({
      outcome: "no_work",
      reason: "active_run",
    });
    expect(repository.completeRun).toHaveBeenCalledTimes(1);
    expect(validateBatch).toHaveBeenCalledTimes(1);
    expect(clock).toHaveBeenCalledTimes(2);
    expect(repository.recomputeMomentum).toHaveBeenCalledTimes(
      globalRadarDemandFamilies.length,
    );
    expect(callOrder).toEqual([
      "complete",
      `expire:${NOW.toISOString()}`,
      `expire:${claimAt.toISOString()}`,
      ...globalRadarDemandFamilies.map(
        (taxonomy) => `momentum:${claimAt.toISOString()}:${taxonomy}`,
      ),
      "claim",
    ]);
  });

  it("validates a fresh completion with immutable planned thresholds after runtime config drift", async () => {
    const plannedThresholds = Object.freeze({
      version: "global-radar-thresholds-v1" as const,
      direct_demand: 41,
      demand_precursor: 42,
      ecosystem_momentum: 43,
    });
    const driftedConfig: GlobalRadarConfig = Object.freeze({
      ...config,
      thresholds: Object.freeze({
        direct_demand: 91,
        demand_precursor: 92,
        ecosystem_momentum: 93,
      }),
    });
    const validated: GlobalRadarValidatedBatchPort = {
      runId: "00000000-0000-4000-8000-000000000010",
      planFingerprint: "b".repeat(64),
      canonicalSubmissionHash: "c".repeat(64),
      executedQueries: [],
      entities: [],
      signals: [],
      sourceErrors: [],
      rejections: {},
    };
    const repository = repositoryDouble({
      lookupCompletionReplay: vi.fn(async () => ({
        outcome: "not_terminal" as const,
        plannedThresholds,
      })),
      completeRun: vi.fn(async (input) => ({
        outcome: "completed" as const,
        run: safeRun({
          status: "succeeded",
          completedAt: input.now,
          planFingerprint: input.planFingerprint,
        }),
      })),
    });
    const validateBatch = vi.fn(() => validated);
    const service = createService(repository, validateBatch, driftedConfig);
    const authorization = service.authorizeWorker(
      `Bearer ${driftedConfig.workerSecret}`,
    );
    const body = {
      schemaVersion: "global-radar-batch-v1",
      promptVersion: "codex-public-web-v1",
      taxonomyVersion: "global-radar-v1",
      runId: validated.runId,
      planFingerprint: validated.planFingerprint,
      executedQueries: [],
      entities: [],
      signals: [],
      sourceErrors: [],
    };

    await expect(
      service.complete(authorization, {
        runId: validated.runId,
        leaseToken: "raw-lease-token",
        batch: body,
      }),
    ).resolves.toMatchObject({ outcome: "completed" });
    expect(validateBatch).toHaveBeenCalledWith(body, {
      runId: validated.runId,
      now: NOW,
      thresholds: plannedThresholds,
    });
  });

  it("replays an exact durable completion before a later clock can revalidate the saved batch", async () => {
    const terminal = safeRun({
      status: "partial",
      completedAt: NOW,
      numberSignalsFound: 1,
      numberSourceErrors: 1,
    });
    const lookupCompletionReplay = vi.fn(async () => ({
      outcome: "replayed" as const,
      run: terminal,
    }));
    const repository = repositoryDouble({ lookupCompletionReplay });
    const validateBatch = vi.fn(() => {
      throw new Error("The saved evidence is outside the later freshness horizon.");
    });
    const service = createService(repository, validateBatch);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );
    const savedBatch = {
      schemaVersion: "global-radar-batch-v1",
      promptVersion: "codex-public-web-v1",
      taxonomyVersion: "global-radar-v1",
      runId: terminal.id,
      planFingerprint: terminal.planFingerprint,
      executedQueries: [],
      entities: [],
      signals: [],
      sourceErrors: [],
    };

    await expect(
      service.complete(authorization, {
        runId: terminal.id,
        leaseToken: "raw-lease-token",
        batch: savedBatch,
      }),
    ).resolves.toMatchObject({
      outcome: "replayed",
      run: { id: terminal.id, status: "partial" },
    });
    expect(lookupCompletionReplay).toHaveBeenCalledWith({
      runId: terminal.id,
      leaseToken: "raw-lease-token",
      planFingerprint: terminal.planFingerprint,
      batchFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(validateBatch).not.toHaveBeenCalled();
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("returns a durable changed-completion conflict without revalidating the changed retry", async () => {
    const lookupCompletionReplay = vi.fn(async () => ({
      outcome: "conflict" as const,
      reason: "completion_identity_mismatch",
      run: safeRun({ status: "partial", completedAt: NOW }),
    }));
    const repository = repositoryDouble({ lookupCompletionReplay });
    const validateBatch = vi.fn();
    const service = createService(repository, validateBatch);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );

    await expect(
      service.complete(authorization, {
        runId: "00000000-0000-4000-8000-000000000010",
        leaseToken: "raw-lease-token",
        batch: {
          schemaVersion: "global-radar-batch-v1",
          promptVersion: "codex-public-web-v1",
          taxonomyVersion: "global-radar-v1",
          runId: "00000000-0000-4000-8000-000000000010",
          planFingerprint: "b".repeat(64),
          executedQueries: [],
          entities: [],
          signals: [],
          sourceErrors: [],
        },
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "completion_identity_mismatch",
    });
    expect(validateBatch).not.toHaveBeenCalled();
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("maps terminal replay/conflicts and keeps fail and abandon inputs bounded", async () => {
    const repository = repositoryDouble({
      failRun: vi.fn(async () => ({
        outcome: "replayed",
        run: safeRun({ status: "failed", completedAt: NOW }),
      })),
      abandonRun: vi.fn(async () => ({
        outcome: "conflict",
        reason: "invalid_state",
        run: safeRun(),
      })),
    });
    const service = createService(repository);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );

    await expect(
      service.fail(authorization, {
        runId: "00000000-0000-4000-8000-000000000010",
        leaseToken: "raw-lease-token",
        reason: "Public source adapter failed.",
      }),
    ).resolves.toMatchObject({ outcome: "replayed", run: { status: "failed" } });
    await expect(
      service.abandon(authorization, {
        runId: "00000000-0000-4000-8000-000000000010",
        reason: "Claim artifact was irrecoverably lost.",
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "invalid_state",
      run: { id: "00000000-0000-4000-8000-000000000010" },
    });
    expect(repository.abandonRun).toHaveBeenCalledWith(
      expect.not.objectContaining({ leaseToken: expect.anything() }),
    );
    await expect(
      service.fail(authorization, {
        runId: "bad-id",
        leaseToken: "x",
        reason: "x".repeat(1_001),
      }),
    ).resolves.toEqual({ outcome: "invalid" });
  });

  it("rejects exact worker credentials in fail and abandon diagnostics", async () => {
    const failRun = vi.fn(async () => ({
      outcome: "completed" as const,
      run: safeRun({ status: "failed", completedAt: NOW }),
    }));
    const abandonRun = vi.fn(async () => ({
      outcome: "completed" as const,
      run: safeRun({ status: "failed", completedAt: NOW }),
    }));
    const repository = repositoryDouble({ failRun, abandonRun });
    const service = createService(repository);
    const authorization = service.authorizeWorker(
      `Bearer ${config.workerSecret}`,
    );
    const leaseToken = "opaque-claim-capability-that-must-remain-private";
    const runId = "00000000-0000-4000-8000-000000000010";

    for (const credential of [leaseToken, config.workerSecret]) {
      await expect(
        service.fail(authorization, {
          runId,
          leaseToken,
          reason: `The adapter stopped after receiving ${credential}.`,
        }),
      ).resolves.toEqual({ outcome: "invalid" });
    }
    await expect(
      service.abandon(authorization, {
        runId,
        reason: `The claim could not be recovered after ${config.workerSecret}.`,
      }),
    ).resolves.toEqual({ outcome: "invalid" });

    expect(failRun).not.toHaveBeenCalled();
    expect(abandonRun).not.toHaveBeenCalled();
  });

  it("rejects the Discovery credential before complete, fail, or abandon reaches a repository", async () => {
    const discoverySecret =
      "discovery-worker-secret-that-must-never-reach-a-port";
    const guardedConfig = createGlobalRadarConfig(config, [discoverySecret]);
    const repository = repositoryDouble();
    const validateBatch = vi.fn();
    const service = createService(repository, validateBatch, guardedConfig);
    const authorization = service.authorizeWorker(
      `Bearer ${guardedConfig.workerSecret}`,
    );
    const runId = "00000000-0000-4000-8000-000000000010";
    const leaseToken = "opaque-claim-capability-that-must-remain-private";
    const batch = {
      schemaVersion: "global-radar-batch-v1",
      promptVersion: "codex-public-web-v1",
      taxonomyVersion: "global-radar-v1",
      runId,
      planFingerprint: "b".repeat(64),
      executedQueries: [],
      entities: [
        {
          entityRef: "entity-private",
          canonicalName: "Private test entity",
          websiteUrl: "https://example.com",
          linkedinOrganizationUrl: null,
          stablePublicIdentifiers: [],
          canonicalCorporateGroupId: null,
          headquartersCountry: "United States",
          headquartersCity: null,
          operatingCountries: ["United States"],
          organisationType: "company",
          sector: "robotics",
          shortDescription: `Public summary ${discoverySecret}`,
          rawMetadata: {},
        },
      ],
      signals: [],
      sourceErrors: [],
    };

    await expect(
      service.complete(authorization, { runId, leaseToken, batch }),
    ).resolves.toEqual({ outcome: "invalid" });
    await expect(
      service.fail(authorization, {
        runId,
        leaseToken,
        reason: `Adapter stopped after ${discoverySecret}.`,
      }),
    ).resolves.toEqual({ outcome: "invalid" });
    await expect(
      service.abandon(authorization, {
        runId,
        reason: `Claim stopped after ${discoverySecret}.`,
      }),
    ).resolves.toEqual({ outcome: "invalid" });

    expect(validateBatch).not.toHaveBeenCalled();
    expect(repository.lookupCompletionReplay).not.toHaveBeenCalled();
    expect(repository.completeRun).not.toHaveBeenCalled();
    expect(repository.failRun).not.toHaveBeenCalled();
    expect(repository.abandonRun).not.toHaveBeenCalled();
  });

  it("never projects a Discovery credential returned by a repository", async () => {
    const discoverySecret =
      "discovery-worker-secret-that-must-never-be-public";
    const guardedConfig = createGlobalRadarConfig(config, [discoverySecret]);
    const repository = repositoryDouble({
      failRun: vi.fn(async () => ({
        outcome: "completed" as const,
        run: safeRun({ sourceCountries: [discoverySecret] }),
      })),
    });
    const service = createService(repository, vi.fn(), guardedConfig);
    const authorization = service.authorizeWorker(
      `Bearer ${guardedConfig.workerSecret}`,
    );

    const result = await service.fail(authorization, {
      runId: "00000000-0000-4000-8000-000000000010",
      leaseToken: "opaque-claim-capability-that-must-remain-private",
      reason: "The public source adapter stopped.",
    });

    expect(result).toEqual({ outcome: "conflict", reason: "invalid_input" });
    expect(JSON.stringify(result)).not.toContain(discoverySecret);
  });

  it("queues only a UUID-keyed manual plan for an authorized administrator", async () => {
    const repository = repositoryDouble({
      queueRun: vi.fn(async (input) => ({
        outcome: "queued",
        run: safeRun({
          trigger: input.trigger,
          scanMode: input.scanMode,
          status: "queued",
          startedAt: null,
        }),
      })),
    });
    const service = createService(repository);

    await expect(
      service.queueManual(ADMIN, {
        requestId: "00000000-0000-4000-8000-000000000011",
      }),
    ).resolves.toMatchObject({
      outcome: "queued",
      run: { trigger: "manual", scanMode: "manual", status: "queued" },
    });
    expect(repository.queueRun).toHaveBeenCalledWith(
      expect.objectContaining({
        trigger: "manual",
        scanMode: "manual",
        administratorRequestId: "00000000-0000-4000-8000-000000000011",
        requestedByUserId: ADMIN.userId,
        requestedByEmail: "admin@example.com",
        planSnapshot: expect.objectContaining({
          themes: globalRadarThemes,
        }),
      }),
    );
    await expect(
      service.queueManual(
        { ...ADMIN, email: "outsider@example.com" },
        { requestId: "00000000-0000-4000-8000-000000000011" },
      ),
    ).resolves.toEqual({ outcome: "forbidden" });
    await expect(
      service.queueManual(ADMIN, {
        requestId: "bad-id",
        theme: "not-a-theme",
        rawConfig: { countries: ["private"] },
      }),
    ).resolves.toEqual({ outcome: "invalid" });
  });

  it("composes injected ports, propagates known secrets, and keeps Cloudflare applications request-scoped", async () => {
    const runRepository = repositoryDouble();
    const appendNote = vi.fn();
    const reverse = vi.fn();
    const application = createGlobalRadarApplication({
      config,
      adminEmails: ["admin@example.com"],
      runRepository,
      adminRepository: {
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
        appendNote,
        mergeSignals: vi.fn(),
        upsertWatchlist: vi.fn(),
        qualifyEntity: vi.fn(),
      },
      promotionRepository: {
        lookupPromotionReplay: vi.fn(),
        loadContext: vi.fn(),
        promote: vi.fn(),
        reverse,
      },
      validateBatch: vi.fn(),
      workerOutputSchema: {
        schemaId: "global-radar-rich-worker-proposal-v1",
      },
      loadPlanningContext: vi.fn(async () => ({
        coverageState: planningInput().coverageState,
        watchlist: [],
      })),
      now: () => NOW,
    });

    expect(application).toMatchObject({
      run: expect.objectContaining({ claim: expect.any(Function) }),
      admin: expect.objectContaining({ getClassSummary: expect.any(Function) }),
      promotion: expect.objectContaining({ promote: expect.any(Function) }),
    });
    expect(shouldCacheGlobalRadarApplication({})).toBe(true);
    expect(shouldCacheGlobalRadarApplication({ Cloudflare: {} })).toBe(false);

    await expect(
      application.admin.appendNote(
        ADMIN,
        "00000000-0000-4000-8000-000000000010",
        {
          expectedRevision: 0,
          idempotencyKey: "00000000-0000-4000-8000-000000000012",
          reason: "Administrator reviewed public evidence.",
          body: `Administrator note ${config.workerSecret}`,
        },
      ),
    ).resolves.toEqual({ outcome: "invalid" });
    await expect(
      application.promotion.reversePromotion(ADMIN, {
        entityId: "00000000-0000-4000-8000-000000000013",
        expectedEntityRevision: 1,
        expectedPrimarySignalRevision: 1,
        idempotencyKey: "00000000-0000-4000-8000-000000000014",
        reason: `Reverse after review ${config.workerSecret}`,
      }),
    ).resolves.toEqual({ outcome: "invalid" });
    expect(appendNote).not.toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();
  });

  it("builds the production dependency graph without route-owned queries", () => {
    const dependencies = createGlobalRadarApplicationDependencies({
      database: {} as never,
      config,
      adminEmails: ["admin@example.com"],
      issueLeaseToken: () => "a".repeat(64),
      now: () => NOW,
    });

    expect(dependencies).toMatchObject({
      runRepository: expect.objectContaining({
        claimRun: expect.any(Function),
      }),
      adminRepository: expect.objectContaining({
        getWatchlistEnrichment: expect.any(Function),
      }),
      promotionRepository: expect.objectContaining({
        loadContext: expect.any(Function),
        promote: expect.any(Function),
        reverse: expect.any(Function),
      }),
      loadPlanningContext: expect.any(Function),
      validateBatch: expect.any(Function),
      workerOutputSchema: expect.objectContaining({
        type: "object",
        additionalProperties: false,
      }),
    });

    const capabilityEnums: unknown[][] = [];
    const visitSchema = (value: unknown): void => {
      if (value === null || typeof value !== "object") return;
      if (!Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        const capabilityTag = record.capabilityTag;
        if (
          capabilityTag !== null &&
          typeof capabilityTag === "object" &&
          Array.isArray((capabilityTag as Record<string, unknown>).enum)
        ) {
          capabilityEnums.push(
            (capabilityTag as { enum: unknown[] }).enum,
          );
        }
      }
      Object.values(value).forEach(visitSchema);
    };
    visitSchema(dependencies.workerOutputSchema);

    expect(globalRadarLeafIdentifiers).toHaveLength(163);
    expect(capabilityEnums).toHaveLength(3);
    capabilityEnums.forEach((values) =>
      expect(values).toEqual(globalRadarLeafIdentifiers),
    );
    expect(JSON.stringify(dependencies.workerOutputSchema)).not.toContain(
      config.workerSecret,
    );
  });
});
