import { z } from "zod";

import {
  GLOBAL_RADAR_PLAN_VERSION,
  GLOBAL_RADAR_PROMPT_VERSION,
  GLOBAL_RADAR_QUERY_VERSION,
  GLOBAL_RADAR_SCHEMA_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
  GLOBAL_RADAR_THRESHOLD_VERSION,
  GLOBAL_RADAR_TAXONOMY_VERSION,
  createGlobalRadarFingerprint,
  generateGlobalRadarQueries,
  globalRadarSourceFamilies,
  globalRadarThemes,
  parseGlobalRadarPlanSnapshot,
  planGlobalRadarRun,
  type GlobalRadarTheme,
  type RadarCoverageState,
  type RadarPlan,
  type PersistableGlobalRadarBatch,
  type RadarRunTrigger,
  type RadarScanMode,
  type WatchlistPlanningInput,
} from "../../domain/global-radar";
import {
  publicGlobalRadarConfig,
  type GlobalRadarConfig,
} from "./config";
import { serializeGlobalRadarRun } from "./dto";
import { verifyGlobalRadarBearer } from "./worker-auth";

const uuidSchema = z.string().uuid();
const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
const safeReasonSchema = z.string().trim().min(1).max(1_000);

const claimSelectorSchema = z
  .strictObject({
    trigger: z.enum(["scheduled", "trial"]).default("scheduled"),
    scanMode: z
      .enum(["daily", "thematic", "watchlist_refresh"])
      .default("daily"),
  })
  .default({ trigger: "scheduled", scanMode: "daily" });

const manualQueueSchema = z.strictObject({
  requestId: uuidSchema,
  theme: z.enum(globalRadarThemes).optional(),
});

const failSchema = z.strictObject({
  runId: uuidSchema,
  leaseToken: z.string().trim().min(1).max(512),
  reason: safeReasonSchema,
});

const abandonSchema = z.strictObject({
  runId: uuidSchema,
  reason: safeReasonSchema,
});

export type GlobalRadarAdminActor = Readonly<{
  userId: string;
  email: string;
}>;

export type GlobalRadarWorkerAuthorization = Readonly<{
  scope: "global-radar-worker";
}>;

export type GlobalRadarValidatedBatchPort = PersistableGlobalRadarBatch;

export type GlobalRadarValidationContextPort = Readonly<{
  runId: string;
  now: Date;
  config: ReturnType<typeof publicGlobalRadarConfig>;
}>;

export type GlobalRadarQueueRunPortInput = Readonly<{
  externalRunKey: string;
  requestHash: string;
  trigger: RadarRunTrigger;
  scanMode: RadarScanMode;
  planFingerprint: string;
  planSnapshot: RadarPlan;
  sourceCountries: readonly string[];
  sourceLanguages: readonly string[];
  targetDomains: readonly string[];
  targetSignalTypes: readonly string[];
  sourcesUsed: readonly string[];
  promptVersion: string;
  schemaVersion: string;
  taxonomyVersion: string;
  scoringVersion: string;
  now: Date;
  administratorRequestId?: string | null;
  requestedByUserId?: string | null;
  requestedByEmail?: string | null;
}>;

type RunMutationResult =
  | { outcome: "completed" | "replayed"; run: unknown }
  | { outcome: "not_found" }
  | { outcome: "conflict"; reason: string; run?: unknown };

export type GlobalRadarRunRepositoryPort = Readonly<{
  queueRun(
    input: GlobalRadarQueueRunPortInput,
  ): Promise<
    | { outcome: "queued" | "replayed"; run: unknown }
    | { outcome: "conflict"; reason: string; run?: unknown }
  >;
  claimRun(input: { now: Date }): Promise<
    | {
        outcome: "claimed";
        run: unknown;
        privateClaim: {
          leaseToken: string;
          leaseExpiresAt: Date;
          planSnapshot: Record<string, unknown>;
        };
      }
    | {
        outcome: "no_work";
        reason: "active_run" | "empty_queue" | "active_race";
        run?: unknown;
      }
    | { outcome: "conflict"; reason: string }
  >;
  completeRun(input: {
    runId: string;
    leaseToken: string;
    planFingerprint: string;
    submissionHash: string;
    now: Date;
    batch: GlobalRadarValidatedBatchPort;
  }): Promise<RunMutationResult>;
  failRun(input: {
    runId: string;
    leaseToken: string;
    now: Date;
    reason: string;
  }): Promise<RunMutationResult>;
  abandonRun(input: {
    runId: string;
    now: Date;
    reason: string;
  }): Promise<RunMutationResult>;
}>;

export type GlobalRadarPlanningContext = Readonly<{
  coverageState: RadarCoverageState;
  watchlist: readonly WatchlistPlanningInput[];
}>;

export type GlobalRadarBatchValidatorPort = (
  batch: unknown,
  context: GlobalRadarValidationContextPort,
) => GlobalRadarValidatedBatchPort;

export type GlobalRadarRunServiceDependencies = Readonly<{
  repository: GlobalRadarRunRepositoryPort;
  config: GlobalRadarConfig;
  adminEmails: readonly string[];
  validateBatch: GlobalRadarBatchValidatorPort;
  workerOutputSchema: Readonly<Record<string, unknown>>;
  loadPlanningContext(input: {
    now: Date;
    scanMode: RadarScanMode;
  }): Promise<GlobalRadarPlanningContext>;
  now?: () => Date;
}>;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function validDate(value: Date): boolean {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function normalizedAdminActor(
  actor: GlobalRadarAdminActor | null | undefined,
  adminEmails: ReadonlySet<string>,
): GlobalRadarAdminActor | null {
  if (!actor || !uuidSchema.safeParse(actor.userId).success) return null;
  const email = actor.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success || !adminEmails.has(email)) {
    return null;
  }
  return { userId: actor.userId.toLowerCase(), email };
}

export function createGlobalRadarRunService(
  dependencies: GlobalRadarRunServiceDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  const adminEmails = new Set(
    dependencies.adminEmails.map((email) => email.trim().toLowerCase()),
  );
  const authorizations = new WeakSet<object>();
  const publicConfig = publicGlobalRadarConfig(dependencies.config);

  function authorizeWorker(
    authorization: string | null,
  ): GlobalRadarWorkerAuthorization | null {
    if (
      !verifyGlobalRadarBearer(
        authorization,
        dependencies.config.workerSecret,
      )
    ) {
      return null;
    }
    const token = Object.freeze({
      scope: "global-radar-worker" as const,
    });
    authorizations.add(token);
    return token;
  }

  function authorized(
    authorization: GlobalRadarWorkerAuthorization | null | undefined,
  ): authorization is GlobalRadarWorkerAuthorization {
    return (
      authorization !== null &&
      typeof authorization === "object" &&
      authorizations.has(authorization)
    );
  }

  async function buildPlan(
    scanMode: RadarScanMode,
    options: Readonly<{
      requestedTheme?: GlobalRadarTheme;
      administratorRequestId?: string;
    }> = {},
  ): Promise<RadarPlan> {
    const plannedAt = now();
    if (!validDate(plannedAt)) {
      throw new Error("Global Radar run clock is invalid.");
    }
    const context = await dependencies.loadPlanningContext({
      now: plannedAt,
      scanMode,
    });
    return planGlobalRadarRun({
      now: plannedAt,
      scanMode,
      config: {
        countries: publicConfig.countries,
        languages: publicConfig.languages,
        themes: publicConfig.themes,
        enabledSourceAdapters: publicConfig.enabledSources,
        sourceFamilies: globalRadarSourceFamilies,
        resultLimit: publicConfig.resultLimit,
        scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
        thresholds: {
          version: GLOBAL_RADAR_THRESHOLD_VERSION,
          ...publicConfig.thresholds,
        },
      },
      requestedTheme: options.requestedTheme,
      administratorRequestId: options.administratorRequestId,
      coverageState: context.coverageState,
      watchlist: context.watchlist,
    });
  }

  async function queuePlan(
    trigger: RadarRunTrigger,
    plan: RadarPlan,
    actor?: GlobalRadarAdminActor,
  ) {
    const queuedAt = now();
    if (!validDate(queuedAt)) return { outcome: "invalid" as const };
    const queries = generateGlobalRadarQueries(plan);
    const requestHash = createGlobalRadarFingerprint({
      version: "global-radar-run-request-v1",
      trigger,
      planFingerprint: plan.fingerprint,
    });
    const result = await dependencies.repository.queueRun({
      externalRunKey: plan.identityKey,
      requestHash,
      trigger,
      scanMode: plan.scanMode,
      planFingerprint: plan.fingerprint,
      planSnapshot: structuredClone(plan),
      sourceCountries: unique(queries.map(({ sourceCountry }) => sourceCountry)),
      sourceLanguages: unique(queries.map(({ language }) => language)),
      targetDomains: unique(queries.map(({ theme }) => theme)),
      targetSignalTypes: unique(queries.map(({ signalIntent }) => signalIntent)),
      sourcesUsed: unique(queries.map(({ sourceAdapter }) => sourceAdapter)),
      promptVersion: GLOBAL_RADAR_PROMPT_VERSION,
      schemaVersion: GLOBAL_RADAR_SCHEMA_VERSION,
      taxonomyVersion: plan.taxonomyVersion,
      scoringVersion: plan.scoreVersion,
      now: queuedAt,
      ...(trigger === "manual" && actor
        ? {
            administratorRequestId: plan.identityKey.split(":").at(-1),
            requestedByUserId: actor.userId,
            requestedByEmail: actor.email,
          }
        : {}),
    });
    if (result.outcome === "conflict") {
      return {
        outcome: "conflict" as const,
        reason: result.reason,
        ...(result.run ? { run: serializeGlobalRadarRun(result.run) } : {}),
      };
    }
    return {
      outcome: result.outcome,
      run: serializeGlobalRadarRun(result.run),
    };
  }

  function claimedResult(
    result: Extract<
      Awaited<ReturnType<GlobalRadarRunRepositoryPort["claimRun"]>>,
      { outcome: "claimed" }
    >,
  ) {
    const run = readRunIdentity(result.run);
    const plan = parseGlobalRadarPlanSnapshot(
      result.privateClaim.planSnapshot,
      run.planFingerprint,
    );
    if (!plan) return { outcome: "conflict" as const, reason: "invalid_plan" };
    return {
      outcome: "claimed" as const,
      claim: {
        runId: run.id,
        leaseToken: result.privateClaim.leaseToken,
        leaseExpiresAt: result.privateClaim.leaseExpiresAt.toISOString(),
        versions: {
          prompt: GLOBAL_RADAR_PROMPT_VERSION,
          schema: GLOBAL_RADAR_SCHEMA_VERSION,
          taxonomy: GLOBAL_RADAR_TAXONOMY_VERSION,
          scoring: GLOBAL_RADAR_SCORE_VERSION,
          plan: GLOBAL_RADAR_PLAN_VERSION,
          query: GLOBAL_RADAR_QUERY_VERSION,
        },
        plan,
        queries: generateGlobalRadarQueries(plan),
        config: publicConfig,
        outputSchema: dependencies.workerOutputSchema,
      },
    };
  }

  async function claim(
    authorization: GlobalRadarWorkerAuthorization | null,
    value: unknown,
  ) {
    if (!authorized(authorization)) return { outcome: "unauthorized" as const };
    const selector = claimSelectorSchema.safeParse(value ?? {});
    if (!selector.success) return { outcome: "invalid" as const };
    const claimed = await dependencies.repository.claimRun({ now: now() });
    if (claimed.outcome === "claimed") return claimedResult(claimed);
    if (
      claimed.outcome === "conflict" ||
      claimed.reason === "active_run" ||
      claimed.reason === "active_race"
    ) {
      return {
        outcome: claimed.outcome,
        reason: claimed.reason,
        ...(claimed.outcome === "no_work" && claimed.run
          ? { run: serializeGlobalRadarRun(claimed.run) }
          : {}),
      };
    }
    let plan: RadarPlan;
    try {
      plan = await buildPlan(selector.data.scanMode);
    } catch {
      return { outcome: "invalid" as const };
    }
    const queued = await queuePlan(selector.data.trigger, plan);
    if (queued.outcome === "invalid" || queued.outcome === "conflict") {
      return queued;
    }
    const next = await dependencies.repository.claimRun({ now: now() });
    if (next.outcome === "claimed") return claimedResult(next);
    return {
      outcome: next.outcome,
      reason: next.reason,
      ...(next.outcome === "no_work" && next.run
        ? { run: serializeGlobalRadarRun(next.run) }
        : {}),
    };
  }

  function mutationResult(result: RunMutationResult) {
    if (result.outcome === "not_found") return result;
    return {
      outcome: result.outcome,
      ...(result.outcome === "conflict" ? { reason: result.reason } : {}),
      ...(result.run ? { run: serializeGlobalRadarRun(result.run) } : {}),
    };
  }

  async function complete(
    authorization: GlobalRadarWorkerAuthorization | null,
    value: unknown,
  ) {
    if (!authorized(authorization)) return { outcome: "unauthorized" as const };
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { outcome: "invalid" as const };
    }
    const input = value as Record<string, unknown>;
    const runId = uuidSchema.safeParse(input.runId);
    const leaseToken = z.string().trim().min(1).max(512).safeParse(
      input.leaseToken,
    );
    if (!runId.success || !leaseToken.success) {
      return { outcome: "invalid" as const };
    }
    if (
      !input.batch ||
      typeof input.batch !== "object" ||
      Array.isArray(input.batch) ||
      (input.batch as Record<string, unknown>).runId !== runId.data
    ) {
      return { outcome: "invalid" as const };
    }
    const completedAt = now();
    let batch: GlobalRadarValidatedBatchPort;
    try {
      batch = dependencies.validateBatch(input.batch, {
        runId: runId.data,
        now: completedAt,
        config: publicConfig,
      });
    } catch {
      return { outcome: "invalid" as const };
    }
    if (
      batch.runId !== runId.data ||
      !fingerprintSchema.safeParse(batch.planFingerprint).success ||
      !fingerprintSchema.safeParse(batch.canonicalSubmissionHash).success
    ) {
      return { outcome: "invalid" as const };
    }
    return mutationResult(
      await dependencies.repository.completeRun({
        runId: runId.data,
        leaseToken: leaseToken.data,
        planFingerprint: batch.planFingerprint,
        submissionHash: batch.canonicalSubmissionHash,
        now: completedAt,
        batch,
      }),
    );
  }

  async function fail(
    authorization: GlobalRadarWorkerAuthorization | null,
    value: unknown,
  ) {
    if (!authorized(authorization)) return { outcome: "unauthorized" as const };
    const parsed = failSchema.safeParse(value);
    if (!parsed.success) return { outcome: "invalid" as const };
    return mutationResult(
      await dependencies.repository.failRun({
        ...parsed.data,
        now: now(),
      }),
    );
  }

  async function abandon(
    authorization: GlobalRadarWorkerAuthorization | null,
    value: unknown,
  ) {
    if (!authorized(authorization)) return { outcome: "unauthorized" as const };
    const parsed = abandonSchema.safeParse(value);
    if (!parsed.success) return { outcome: "invalid" as const };
    return mutationResult(
      await dependencies.repository.abandonRun({
        ...parsed.data,
        now: now(),
      }),
    );
  }

  async function queueManual(
    actor: GlobalRadarAdminActor | null,
    value: unknown,
  ) {
    const administrator = normalizedAdminActor(actor, adminEmails);
    if (!administrator) return { outcome: "forbidden" as const };
    const parsed = manualQueueSchema.safeParse(value);
    if (!parsed.success) return { outcome: "invalid" as const };
    let plan: RadarPlan;
    try {
      plan = await buildPlan("manual", {
        administratorRequestId: parsed.data.requestId,
        requestedTheme: parsed.data.theme,
      });
    } catch {
      return { outcome: "invalid" as const };
    }
    return queuePlan("manual", plan, administrator);
  }

  return {
    authorizeWorker,
    claim,
    complete,
    fail,
    abandon,
    queueManual,
  };
}

function readRunIdentity(value: unknown): {
  id: string;
  planFingerprint: string;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid Global Radar claimed run.");
  }
  const source = value as Record<string, unknown>;
  const id = uuidSchema.parse(source.id);
  const planFingerprint = fingerprintSchema.parse(source.planFingerprint);
  return { id, planFingerprint };
}

export type GlobalRadarRunService = ReturnType<
  typeof createGlobalRadarRunService
>;
