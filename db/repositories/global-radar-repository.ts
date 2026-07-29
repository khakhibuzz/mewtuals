import { and, asc, desc, eq, lte, sql } from "drizzle-orm";

import {
  radarRunTriggers,
  radarScanModes,
  type RadarRunStatus,
  type RadarRunTrigger,
  type RadarScanMode,
} from "../../app/domain/global-radar";
import type { MewtualsDatabase } from "../client";
import { globalRadarRuns } from "../global-radar-schema";
import { users } from "../schema";
import type { GlobalRadarRun } from "../types";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PLAN_BYTES = 8_192;
const MAX_ARRAY_ITEMS = 50;
const MAX_ARRAY_ITEM_LENGTH = 200;

export type QueueGlobalRadarRunInput = {
  externalRunKey: string;
  requestHash: string;
  trigger: RadarRunTrigger;
  scanMode: RadarScanMode;
  planFingerprint: string;
  planSnapshot: Record<string, unknown>;
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
};

export type SafeRadarFailure = {
  code: "lease_expired" | "worker_failed" | "abandoned" | "completion_failed";
  message: string;
};

export type SafeRadarSourceError = { sourceName: string; message: string };

export type SafeRadarRun = {
  id: string;
  externalRunKey: string;
  trigger: RadarRunTrigger;
  scanMode: RadarScanMode;
  status: RadarRunStatus;
  planFingerprint: string;
  startedAt: Date | null;
  completedAt: Date | null;
  sourceCountries: string[];
  sourceLanguages: string[];
  targetDomains: string[];
  targetSignalTypes: string[];
  sourcesUsed: string[];
  numberResultsExamined: number;
  numberEntitiesObserved: number;
  numberSignalsFound: number;
  numberDirectDemands: number;
  numberPrecursors: number;
  numberMomentumRecords: number;
  numberNew: number;
  numberUpdated: number;
  numberDuplicates: number;
  numberRejectedForWeakEvidence: number;
  numberSourceErrors: number;
  promptVersion: string;
  schemaVersion: string;
  taxonomyVersion: string;
  scoringVersion: string;
  createdAt: Date;
  updatedAt: Date;
  failure?: SafeRadarFailure;
  sourceErrors?: SafeRadarSourceError[];
};

export type QueueGlobalRadarRunResult =
  | { outcome: "queued" | "replayed"; run: SafeRadarRun }
  | {
      outcome: "conflict";
      reason: "invalid_input" | "request_mismatch";
      run?: SafeRadarRun;
    };

export type ClaimGlobalRadarRunInput = { now: Date };

export type GlobalRadarLeaseCodec = {
  issueLeaseToken(): string;
  hashLeaseToken(rawToken: string): string;
};

export type PrivateGlobalRadarClaim = {
  leaseToken: string;
  leaseExpiresAt: Date;
  planSnapshot: Record<string, unknown>;
};

export type ClaimGlobalRadarRunResult =
  | {
      outcome: "claimed";
      run: SafeRadarRun;
      privateClaim: PrivateGlobalRadarClaim;
    }
  | {
      outcome: "no_work";
      reason: "active_run" | "empty_queue" | "active_race";
      run?: SafeRadarRun;
    }
  | { outcome: "conflict"; reason: "invalid_input" };

export type FailGlobalRadarRunInput = {
  runId: string;
  leaseToken: string;
  now: Date;
  reason: string;
};

export type AbandonGlobalRadarRunInput = {
  runId: string;
  now: Date;
  reason: string;
};

export type SafeRadarCounters = {
  numberResultsExamined: number;
  numberEntitiesObserved: number;
  numberSignalsFound: number;
  numberDirectDemands: number;
  numberPrecursors: number;
  numberMomentumRecords: number;
  numberNew: number;
  numberUpdated: number;
  numberDuplicates: number;
  numberRejectedForWeakEvidence: number;
  numberSourceErrors: number;
};

export type CompleteGlobalRadarRunInput = {
  runId: string;
  leaseToken: string;
  planFingerprint: string;
  submissionHash: string;
  batchFingerprint: string;
  now: Date;
  counters: SafeRadarCounters;
  sourceErrors: readonly SafeRadarSourceError[];
};

export type RadarRunConflictReason =
  | "invalid_input"
  | "invalid_state"
  | "request_mismatch"
  | "lease_mismatch"
  | "lease_expired"
  | "failure_mismatch"
  | "completion_identity_mismatch";

export type RadarRunMutationResult =
  | {
      outcome: "completed" | "replayed";
      run: SafeRadarRun;
    }
  | { outcome: "conflict"; reason: RadarRunConflictReason; run?: SafeRadarRun }
  | { outcome: "not_found" };

export type GetGlobalRadarRunResult =
  | { outcome: "found"; run: SafeRadarRun }
  | { outcome: "not_found" }
  | { outcome: "conflict"; reason: "invalid_input" };

export type ListGlobalRadarRunsResult =
  | { outcome: "listed"; runs: SafeRadarRun[] }
  | { outcome: "conflict"; reason: "invalid_input" };

export type GlobalRadarRepository = {
  queueRun(input: QueueGlobalRadarRunInput): Promise<QueueGlobalRadarRunResult>;
  claimRun(input: ClaimGlobalRadarRunInput): Promise<ClaimGlobalRadarRunResult>;
  completeRun(input: CompleteGlobalRadarRunInput): Promise<RadarRunMutationResult>;
  failRun(input: FailGlobalRadarRunInput): Promise<RadarRunMutationResult>;
  abandonRun(input: AbandonGlobalRadarRunInput): Promise<RadarRunMutationResult>;
  getRun(runId: string): Promise<GetGlobalRadarRunResult>;
  listRuns(input: { limit: number }): Promise<ListGlobalRadarRunsResult>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maximum
  );
}

function boundedArray(values: readonly string[]): string[] | null {
  if (!Array.isArray(values) || values.length > MAX_ARRAY_ITEMS) return null;
  if (values.some((value) => typeof value !== "string")) return null;
  const normalized = values.map((value) => value.trim());
  return normalized.every(
    (value) => value.length > 0 && value.length <= MAX_ARRAY_ITEM_LENGTH,
  )
    ? normalized
    : null;
}

function planSnapshotIsValid(value: unknown): value is Record<string, unknown> {
  if (!isPlainObject(value)) return false;
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_PLAN_BYTES;
  } catch {
    return false;
  }
}

function copyPlanSnapshot(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function safeErrorSummary(run: GlobalRadarRun): Pick<SafeRadarRun, "failure" | "sourceErrors"> {
  const summary = run.errorSummary;
  if (!isPlainObject(summary)) return {};
  const result: Pick<SafeRadarRun, "failure" | "sourceErrors"> = {};
  const failure = summary.failure;
  if (isPlainObject(failure)) {
    const code = failure.code;
    const message = failure.message;
    if (
      (code === "lease_expired" ||
        code === "worker_failed" ||
        code === "abandoned" ||
        code === "completion_failed") &&
      isBoundedString(message, 1_000)
    ) {
      result.failure = { code, message: message.trim() };
    }
  }
  if (Array.isArray(summary.sourceErrors)) {
    result.sourceErrors = summary.sourceErrors
      .slice(0, 50)
      .flatMap((entry) =>
        isPlainObject(entry) &&
        isBoundedString(entry.sourceName, 200) &&
        isBoundedString(entry.message, 1_000)
          ? [{ sourceName: entry.sourceName.trim(), message: entry.message.trim() }]
          : [],
      );
  }
  return result;
}

function toSafeRun(run: GlobalRadarRun): SafeRadarRun {
  return {
    id: run.id,
    externalRunKey: run.externalRunKey,
    trigger: run.trigger,
    scanMode: run.scanMode,
    status: run.status,
    planFingerprint: run.planFingerprint,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    sourceCountries: [...run.sourceCountries],
    sourceLanguages: [...run.sourceLanguages],
    targetDomains: [...run.targetDomains],
    targetSignalTypes: [...run.targetSignalTypes],
    sourcesUsed: [...run.sourcesUsed],
    numberResultsExamined: run.numberResultsExamined,
    numberEntitiesObserved: run.numberEntitiesObserved,
    numberSignalsFound: run.numberSignalsFound,
    numberDirectDemands: run.numberDirectDemands,
    numberPrecursors: run.numberPrecursors,
    numberMomentumRecords: run.numberMomentumRecords,
    numberNew: run.numberNew,
    numberUpdated: run.numberUpdated,
    numberDuplicates: run.numberDuplicates,
    numberRejectedForWeakEvidence: run.numberRejectedForWeakEvidence,
    numberSourceErrors: run.numberSourceErrors,
    promptVersion: run.promptVersion,
    schemaVersion: run.schemaVersion,
    taxonomyVersion: run.taxonomyVersion,
    scoringVersion: run.scoringVersion,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...safeErrorSummary(run),
  };
}

type ValidatedQueueInput = Omit<QueueGlobalRadarRunInput, "sourceCountries" | "sourceLanguages" | "targetDomains" | "targetSignalTypes" | "sourcesUsed"> & {
  externalRunKey: string;
  sourceCountries: string[];
  sourceLanguages: string[];
  targetDomains: string[];
  targetSignalTypes: string[];
  sourcesUsed: string[];
  requestedByEmail: string | null;
};

function validateQueueInput(input: QueueGlobalRadarRunInput): ValidatedQueueInput | null {
  const sourceCountries = boundedArray(input.sourceCountries);
  const sourceLanguages = boundedArray(input.sourceLanguages);
  const targetDomains = boundedArray(input.targetDomains);
  const targetSignalTypes = boundedArray(input.targetSignalTypes);
  const sourcesUsed = boundedArray(input.sourcesUsed);
  if (
    !isBoundedString(input.externalRunKey, 500) ||
    !radarRunTriggers.includes(input.trigger) ||
    !radarScanModes.includes(input.scanMode) ||
    !SHA256_PATTERN.test(input.requestHash) ||
    !SHA256_PATTERN.test(input.planFingerprint) ||
    !planSnapshotIsValid(input.planSnapshot) ||
    !sourceCountries ||
    !sourceLanguages ||
    !targetDomains ||
    !targetSignalTypes ||
    !sourcesUsed ||
    !isBoundedString(input.promptVersion, 200) ||
    !isBoundedString(input.schemaVersion, 200) ||
    !isBoundedString(input.taxonomyVersion, 200) ||
    !isBoundedString(input.scoringVersion, 200) ||
    !(input.now instanceof Date) ||
    Number.isNaN(input.now.getTime())
  ) {
    return null;
  }
  const email = input.requestedByEmail?.trim() ?? null;
  const isManual = input.trigger === "manual";
  if (
    (isManual &&
      (input.scanMode !== "manual" ||
        !input.administratorRequestId ||
        !UUID_PATTERN.test(input.administratorRequestId) ||
        !input.requestedByUserId ||
        !UUID_PATTERN.test(input.requestedByUserId) ||
        !email ||
        email.length < 3 ||
        email.length > 254)) ||
    (!isManual &&
      (input.scanMode === "manual" ||
        input.administratorRequestId != null ||
        input.requestedByUserId != null ||
        input.requestedByEmail != null))
  ) {
    return null;
  }
  return {
    ...input,
    externalRunKey: input.externalRunKey.trim(),
    sourceCountries,
    sourceLanguages,
    targetDomains,
    targetSignalTypes,
    sourcesUsed,
    requestedByEmail: email,
  };
}

function requireLeaseHash(
  leaseCodec: GlobalRadarLeaseCodec,
  rawToken: string,
): string {
  const hash = leaseCodec.hashLeaseToken(rawToken);
  if (!SHA256_PATTERN.test(hash)) {
    throw new Error(
      "Global Radar lease codec must return a lowercase hexadecimal SHA-256 HMAC digest.",
    );
  }
  return hash;
}

function canonicalReason(reason: unknown): string | null {
  if (typeof reason !== "string") return null;
  const normalized = reason.trim().replace(/\s+/g, " ");
  return normalized.length > 0 && normalized.length <= 1_000
    ? normalized
    : null;
}

function storedFailure(run: GlobalRadarRun): SafeRadarFailure | null {
  return safeErrorSummary(run).failure ?? null;
}

function validateCounters(counters: SafeRadarCounters): boolean {
  const values = Object.values(counters);
  return (
    values.length === 11 &&
    values.every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) &&
    counters.numberDirectDemands +
      counters.numberPrecursors +
      counters.numberMomentumRecords ===
      counters.numberSignalsFound
  );
}

function canonicalSourceErrors(
  sourceErrors: readonly SafeRadarSourceError[],
): SafeRadarSourceError[] | null {
  if (!Array.isArray(sourceErrors) || sourceErrors.length > 50) return null;
  const normalized: SafeRadarSourceError[] = [];
  for (const sourceError of sourceErrors) {
    if (!isPlainObject(sourceError)) return null;
    if (
      typeof sourceError.sourceName !== "string" ||
      typeof sourceError.message !== "string"
    ) {
      return null;
    }
    const sourceName = sourceError.sourceName.trim().replace(/\s+/g, " ");
    const message = sourceError.message.trim().replace(/\s+/g, " ");
    if (
      !sourceName ||
      sourceName.length > 200 ||
      !message ||
      message.length > 1_000
    ) {
      return null;
    }
    normalized.push({ sourceName, message });
  }
  return normalized;
}

function completionSummary(
  numberSignalsFound: number,
  sourceErrors: SafeRadarSourceError[],
): Record<string, unknown> | null {
  const summary: Record<string, unknown> = {
    ...(numberSignalsFound === 0 && sourceErrors.length > 0
      ? {
          failure: {
            code: "completion_failed",
            message: "Global Radar completed with source errors and no signals.",
          },
        }
      : {}),
    sourceErrors,
  };
  return Buffer.byteLength(JSON.stringify(summary), "utf8") <= MAX_PLAN_BYTES
    ? summary
    : null;
}

function isActiveRunUniqueViolation(error: unknown): boolean {
  let current = error;
  while (current && typeof current === "object") {
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      constraint_name?: unknown;
      cause?: unknown;
    };
    if (
      candidate.code === "23505" &&
      (candidate.constraint === "global_radar_runs_one_running_idx" ||
        candidate.constraint_name === "global_radar_runs_one_running_idx")
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

export function createGlobalRadarRepository(
  database: MewtualsDatabase,
  leaseCodec: GlobalRadarLeaseCodec,
): GlobalRadarRepository {
  return {
    async queueRun(input) {
      const validated = validateQueueInput(input);
      if (!validated) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      if (validated.trigger === "manual") {
        const [requester] = await database
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, validated.requestedByUserId!))
          .limit(1);
        if (!requester) {
          return { outcome: "conflict", reason: "invalid_input" };
        }
      }

      const [created] = await database
        .insert(globalRadarRuns)
        .values({
          externalRunKey: validated.externalRunKey,
          requestHash: validated.requestHash,
          trigger: validated.trigger,
          scanMode: validated.scanMode,
          planFingerprint: validated.planFingerprint,
          planSnapshot: validated.planSnapshot,
          sourceCountries: validated.sourceCountries,
          sourceLanguages: validated.sourceLanguages,
          targetDomains: validated.targetDomains,
          targetSignalTypes: validated.targetSignalTypes,
          sourcesUsed: validated.sourcesUsed,
          administratorRequestId: validated.administratorRequestId ?? null,
          requestedByUserId: validated.requestedByUserId ?? null,
          requestedByEmail: validated.requestedByEmail,
          promptVersion: validated.promptVersion.trim(),
          schemaVersion: validated.schemaVersion.trim(),
          taxonomyVersion: validated.taxonomyVersion.trim(),
          scoringVersion: validated.scoringVersion.trim(),
          createdAt: validated.now,
          updatedAt: validated.now,
        })
        .onConflictDoNothing()
        .returning();
      if (created) return { outcome: "queued", run: toSafeRun(created) };

      const [externalIdentity] = await database
        .select()
        .from(globalRadarRuns)
        .where(eq(globalRadarRuns.externalRunKey, validated.externalRunKey))
        .limit(1);
      const [administratorIdentity] = validated.administratorRequestId
        ? await database
            .select()
            .from(globalRadarRuns)
            .where(
              eq(
                globalRadarRuns.administratorRequestId,
                validated.administratorRequestId,
              ),
            )
            .limit(1)
        : [];
      const conflictRun = externalIdentity ?? administratorIdentity;
      if (!conflictRun) {
        throw new Error("Global Radar run could not be read after queueing.");
      }
      if (
        externalIdentity &&
        externalIdentity.requestHash === validated.requestHash &&
        (!validated.administratorRequestId ||
          administratorIdentity?.id === externalIdentity.id)
      ) {
        return { outcome: "replayed", run: toSafeRun(externalIdentity) };
      }
      return {
        outcome: "conflict",
        reason: "request_mismatch",
        run: toSafeRun(conflictRun),
      };
    },

    async claimRun(input) {
      if (
        !(input.now instanceof Date) ||
        Number.isNaN(input.now.getTime())
      ) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      const leaseToken = leaseCodec.issueLeaseToken();
      if (!SHA256_PATTERN.test(leaseToken)) {
        throw new Error(
          "Global Radar lease codec must issue a 64-character lowercase hexadecimal token.",
        );
      }
      const leaseTokenHash = requireLeaseHash(leaseCodec, leaseToken);
      const leaseExpiresAt = new Date(
        input.now.getTime() + 2 * 60 * 60 * 1_000,
      );
      try {
        return await database.transaction(async (transaction) => {
          await transaction.execute(
            sql`select pg_advisory_xact_lock(1296385841, 2)`,
          );

          await transaction
            .update(globalRadarRuns)
            .set({
              status: "failed",
              completedAt: input.now,
              updatedAt: input.now,
              errorSummary: {
                failure: {
                  code: "lease_expired",
                  message: "Global Radar run lease expired before completion.",
                },
              },
            })
            .where(
              and(
                eq(globalRadarRuns.status, "running"),
                lte(globalRadarRuns.leaseExpiresAt, input.now),
              ),
            );

          const [active] = await transaction
            .select()
            .from(globalRadarRuns)
            .where(eq(globalRadarRuns.status, "running"))
            .limit(1);
          if (active) {
            return {
              outcome: "no_work" as const,
              reason: "active_run" as const,
              run: toSafeRun(active),
            };
          }

          const [claimable] = await transaction
            .select({ id: globalRadarRuns.id })
            .from(globalRadarRuns)
            .where(eq(globalRadarRuns.status, "queued"))
            .orderBy(
              sql`case ${globalRadarRuns.trigger}
                when 'manual' then 0
                when 'scheduled' then 1
                else 2
              end`,
              asc(globalRadarRuns.createdAt),
              asc(globalRadarRuns.id),
            )
            .for("update", { skipLocked: true })
            .limit(1);
          if (!claimable) {
            return { outcome: "no_work" as const, reason: "empty_queue" as const };
          }

          const [claimed] = await transaction
            .update(globalRadarRuns)
            .set({
              status: "running",
              startedAt: input.now,
              completedAt: null,
              leaseTokenHash,
              leaseExpiresAt,
              updatedAt: input.now,
              errorSummary: {},
            })
            .where(
              and(
                eq(globalRadarRuns.id, claimable.id),
                eq(globalRadarRuns.status, "queued"),
              ),
            )
            .returning();
          if (!claimed) {
            return { outcome: "no_work" as const, reason: "active_race" as const };
          }
          return {
            outcome: "claimed" as const,
            run: toSafeRun(claimed),
            privateClaim: {
              leaseToken,
              leaseExpiresAt: new Date(claimed.leaseExpiresAt!.getTime()),
              planSnapshot: copyPlanSnapshot(claimed.planSnapshot),
            },
          };
        });
      } catch (error) {
        if (isActiveRunUniqueViolation(error)) {
          return { outcome: "no_work", reason: "active_race" };
        }
        throw error;
      }
    },

    async completeRun(input) {
      if (
        !UUID_PATTERN.test(input.runId) ||
        !SHA256_PATTERN.test(input.leaseToken) ||
        !SHA256_PATTERN.test(input.planFingerprint) ||
        !SHA256_PATTERN.test(input.submissionHash) ||
        !SHA256_PATTERN.test(input.batchFingerprint) ||
        !(input.now instanceof Date) ||
        Number.isNaN(input.now.getTime())
      ) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      const inputLeaseHash = requireLeaseHash(leaseCodec, input.leaseToken);

      return database.transaction(async (transaction) => {
        const [run] = await transaction
          .select()
          .from(globalRadarRuns)
          .where(eq(globalRadarRuns.id, input.runId))
          .for("update")
          .limit(1);
        if (!run) return { outcome: "not_found" as const };

        if (run.status === "queued") {
          return {
            outcome: "conflict" as const,
            reason: "invalid_state" as const,
            run: toSafeRun(run),
          };
        }
        if (run.status !== "running") {
          if (
            run.leaseTokenHash === inputLeaseHash &&
            run.planFingerprint === input.planFingerprint &&
            run.submissionHash === input.submissionHash &&
            run.batchFingerprint === input.batchFingerprint
          ) {
            return { outcome: "replayed" as const, run: toSafeRun(run) };
          }
          return {
            outcome: "conflict" as const,
            reason: "completion_identity_mismatch" as const,
            run: toSafeRun(run),
          };
        }
        if (run.leaseTokenHash !== inputLeaseHash) {
          return {
            outcome: "conflict" as const,
            reason: "lease_mismatch" as const,
            run: toSafeRun(run),
          };
        }
        if (!run.leaseExpiresAt || run.leaseExpiresAt <= input.now) {
          return {
            outcome: "conflict" as const,
            reason: "lease_expired" as const,
            run: toSafeRun(run),
          };
        }
        if (run.planFingerprint !== input.planFingerprint) {
          return {
            outcome: "conflict" as const,
            reason: "completion_identity_mismatch" as const,
            run: toSafeRun(run),
          };
        }

        const sourceErrors = canonicalSourceErrors(input.sourceErrors);
        if (
          !validateCounters(input.counters) ||
          !sourceErrors ||
          input.counters.numberSourceErrors !== sourceErrors.length
        ) {
          return { outcome: "conflict" as const, reason: "invalid_input" as const };
        }
        const errorSummary = completionSummary(
          input.counters.numberSignalsFound,
          sourceErrors,
        );
        if (!errorSummary) {
          return { outcome: "conflict" as const, reason: "invalid_input" as const };
        }

        const status =
          input.counters.numberSignalsFound === 0 && sourceErrors.length > 0
            ? "failed"
            : input.counters.numberSignalsFound > 0 && sourceErrors.length > 0
              ? "partial"
              : "succeeded";
        const [completed] = await transaction
          .update(globalRadarRuns)
          .set({
            status,
            completedAt: input.now,
            updatedAt: input.now,
            submissionHash: input.submissionHash,
            batchFingerprint: input.batchFingerprint,
            ...input.counters,
            errorSummary,
          })
          .where(eq(globalRadarRuns.id, run.id))
          .returning();
        if (!completed) throw new Error("Global Radar run was not completed.");
        return { outcome: "completed" as const, run: toSafeRun(completed) };
      });
    },

    async failRun(input) {
      const reason = canonicalReason(input.reason);
      if (
        !UUID_PATTERN.test(input.runId) ||
        !reason ||
        !SHA256_PATTERN.test(input.leaseToken) ||
        !(input.now instanceof Date) ||
        Number.isNaN(input.now.getTime())
      ) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      const inputLeaseHash = requireLeaseHash(leaseCodec, input.leaseToken);
      return database.transaction(async (transaction) => {
        const [run] = await transaction
          .select()
          .from(globalRadarRuns)
          .where(eq(globalRadarRuns.id, input.runId))
          .for("update")
          .limit(1);
        if (!run) return { outcome: "not_found" as const };

        if (run.status === "failed") {
          const failure = storedFailure(run);
          if (
            run.leaseTokenHash === inputLeaseHash &&
            failure?.code === "worker_failed" &&
            failure.message === reason
          ) {
            return { outcome: "replayed" as const, run: toSafeRun(run) };
          }
          return {
            outcome: "conflict" as const,
            reason: "failure_mismatch" as const,
            run: toSafeRun(run),
          };
        }
        if (run.status !== "running") {
          return {
            outcome: "conflict" as const,
            reason: "invalid_state" as const,
            run: toSafeRun(run),
          };
        }
        if (run.leaseTokenHash !== inputLeaseHash) {
          return {
            outcome: "conflict" as const,
            reason: "lease_mismatch" as const,
            run: toSafeRun(run),
          };
        }
        if (!run.leaseExpiresAt || run.leaseExpiresAt <= input.now) {
          return {
            outcome: "conflict" as const,
            reason: "lease_expired" as const,
            run: toSafeRun(run),
          };
        }

        const [failed] = await transaction
          .update(globalRadarRuns)
          .set({
            status: "failed",
            completedAt: input.now,
            updatedAt: input.now,
            errorSummary: {
              failure: { code: "worker_failed", message: reason },
            },
          })
          .where(eq(globalRadarRuns.id, run.id))
          .returning();
        if (!failed) throw new Error("Global Radar run was not failed.");
        return { outcome: "completed" as const, run: toSafeRun(failed) };
      });
    },

    async abandonRun(input) {
      const reason = canonicalReason(input.reason);
      if (
        !UUID_PATTERN.test(input.runId) ||
        !reason ||
        !(input.now instanceof Date) ||
        Number.isNaN(input.now.getTime())
      ) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      return database.transaction(async (transaction) => {
        const [run] = await transaction
          .select()
          .from(globalRadarRuns)
          .where(eq(globalRadarRuns.id, input.runId))
          .for("update")
          .limit(1);
        if (!run) return { outcome: "not_found" as const };

        if (run.status === "failed") {
          const failure = storedFailure(run);
          if (failure?.code === "abandoned" && failure.message === reason) {
            return { outcome: "replayed" as const, run: toSafeRun(run) };
          }
          return {
            outcome: "conflict" as const,
            reason: "failure_mismatch" as const,
            run: toSafeRun(run),
          };
        }
        if (run.status !== "running") {
          return {
            outcome: "conflict" as const,
            reason: "invalid_state" as const,
            run: toSafeRun(run),
          };
        }

        const [abandoned] = await transaction
          .update(globalRadarRuns)
          .set({
            status: "failed",
            completedAt: input.now,
            updatedAt: input.now,
            errorSummary: {
              failure: { code: "abandoned", message: reason },
            },
          })
          .where(eq(globalRadarRuns.id, run.id))
          .returning();
        if (!abandoned) throw new Error("Global Radar run was not abandoned.");
        return { outcome: "completed" as const, run: toSafeRun(abandoned) };
      });
    },

    async getRun(runId) {
      if (!UUID_PATTERN.test(runId)) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      const [run] = await database
        .select()
        .from(globalRadarRuns)
        .where(eq(globalRadarRuns.id, runId))
        .limit(1);
      return run
        ? { outcome: "found", run: toSafeRun(run) }
        : { outcome: "not_found" };
    },

    async listRuns(input) {
      if (
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 100
      ) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      const runs = await database
        .select()
        .from(globalRadarRuns)
        .orderBy(desc(globalRadarRuns.createdAt), desc(globalRadarRuns.id))
        .limit(input.limit);
      return { outcome: "listed", runs: runs.map(toSafeRun) };
    },
  };
}
