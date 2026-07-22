import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  candidateIdentifiers,
  candidateStatuses,
  type DiscoveryCandidate as DomainDiscoveryCandidate,
} from "../../app/domain/discovery";
import type { MewtualsDatabase } from "../client";
import { getDb } from "../client";
import {
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryCandidateSources,
  discoveryRuns,
} from "../schema";
import type {
  DiscoveryCandidate as StoredDiscoveryCandidate,
  DiscoveryCandidateSource,
  DiscoveryRun,
} from "../types";

export const MAX_DISCOVERY_ADMIN_PAGE = 100;

export type QueueDiscoveryRunInput = {
  externalRunKey: string;
  trigger: "scheduled" | "manual" | "trial";
  now: Date;
  geography: string;
  candidateType: "company" | "creator" | "both";
  sourcesUsed: readonly string[];
  requestedCount: number;
  companyPercentage: number;
  requestedByEmail?: string | null;
};

export type ClaimDiscoveryRunInput = {
  now: Date;
  leaseTokenHash: string;
  leaseExpiresAt: Date;
  triggers?: readonly DiscoveryRun["trigger"][];
  externalRunKey?: string;
  fallbackExternalRunKey?: string;
  queueIfMissing?: QueueDiscoveryRunInput;
};

export type ClaimedDiscoveryRun = DiscoveryRun;

export type DiscoverySourceError = {
  sourceName: string;
  message: string;
};

export type CompleteDiscoveryRunInput = {
  runId: string;
  leaseTokenHash: string;
  submissionHash: string;
  now: Date;
  candidates: readonly DomainDiscoveryCandidate[];
  sourceErrors: readonly DiscoverySourceError[];
};

export type FailDiscoveryRunInput = {
  runId: string;
  leaseTokenHash: string;
  now: Date;
  message: string;
};

export type UpdateCandidateStatusInput = {
  candidateId: string;
  status: (typeof candidateStatuses)[number];
  expectedUpdatedAt: Date;
  now: Date;
};

export type UpdateCandidateStatusResult =
  | { outcome: "updated"; candidate: StoredDiscoveryCandidate }
  | { outcome: "conflict"; candidate: StoredDiscoveryCandidate }
  | { outcome: "not_found" };

export type DiscoveryFilters = {
  type?: DomainDiscoveryCandidate["type"];
  geography?: string;
  category?: string;
  source?: string;
  status?: (typeof candidateStatuses)[number];
  discoveredFrom?: Date;
  discoveredTo?: Date;
  todayStart: Date;
  page?: number;
  pageSize?: number;
  runLimit?: number;
};

export type DiscoveryAdminRun = Omit<
  DiscoveryRun,
  "leaseTokenHash" | "leaseExpiresAt" | "submissionHash"
>;

export type DiscoveryAdminSnapshot = {
  summary: {
    totalCompanies: number;
    totalCreators: number;
    discoveredToday: number;
    latestRunStatus: DiscoveryRun["status"] | null;
    latestRunCompletedAt: Date | null;
    latestRunDuplicateCount: number;
  };
  candidates: {
    items: StoredDiscoveryCandidate[];
    total: number;
    page: number;
    pageSize: number;
  };
  runs: DiscoveryAdminRun[];
  evidence: DiscoveryCandidateSource[];
};

export type DiscoveryRunConflictReason =
  | "invalid_state"
  | "failure_mismatch"
  | "lease_expired"
  | "lease_mismatch"
  | "submission_mismatch";

export type DiscoveryRunResult =
  | { outcome: "completed" | "replayed" | "failed"; run: DiscoveryRun }
  | {
      outcome: "conflict";
      reason: DiscoveryRunConflictReason;
      run: DiscoveryRun;
    }
  | { outcome: "not_found" };

export type DiscoveryRepository = {
  queueRun(input: QueueDiscoveryRunInput): Promise<DiscoveryRun>;
  claimRun(input: ClaimDiscoveryRunInput): Promise<ClaimedDiscoveryRun | null>;
  getRun(runId: string): Promise<DiscoveryRun | null>;
  completeRun(input: CompleteDiscoveryRunInput): Promise<DiscoveryRunResult>;
  failRun(input: FailDiscoveryRunInput): Promise<DiscoveryRunResult>;
  updateCandidateStatus(
    input: UpdateCandidateStatusInput,
  ): Promise<UpdateCandidateStatusResult>;
  getAdminSummary(filters: DiscoveryFilters): Promise<DiscoveryAdminSnapshot>;
};

function queuedRunValues(input: QueueDiscoveryRunInput) {
  return {
    externalRunKey: input.externalRunKey,
    trigger: input.trigger,
    status: "queued" as const,
    geography: input.geography,
    candidateType: input.candidateType,
    sourcesUsed: [...input.sourcesUsed],
    requestedCount: input.requestedCount,
    companyPercentage: input.companyPercentage,
    requestedByEmail: input.requestedByEmail ?? null,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function isActiveRunUniqueViolation(error: unknown): boolean {
  let current = error;
  while (current && typeof current === "object") {
    const candidate = current as {
      code?: unknown;
      constraint_name?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (
      candidate.code === "23505" &&
      (candidate.constraint_name === "discovery_runs_one_running_idx" ||
        candidate.constraint === "discovery_runs_one_running_idx")
    ) {
      return true;
    }
    current = candidate.cause;
  }
  return false;
}

function normalizedCandidateName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function canonicalIdentityKey(
  identifier: ReturnType<typeof candidateIdentifiers>[number],
): string {
  return `${identifier.kind}:${identifier.value}`;
}

function displayCanonicalUrl(
  candidate: DomainDiscoveryCandidate,
  primaryKind: ReturnType<typeof candidateIdentifiers>[number]["kind"],
): string {
  if (primaryKind === "website_host") {
    return candidate.websiteUrl ?? candidate.canonicalUrl;
  }
  if (primaryKind === "linkedin_url") {
    return candidate.linkedinUrl ?? candidate.canonicalUrl;
  }
  if (primaryKind === "social_url") {
    return candidate.primarySocialUrl ?? candidate.canonicalUrl;
  }
  return candidate.canonicalUrl;
}

function identifierRank(
  candidateType: DomainDiscoveryCandidate["type"],
  kind: ReturnType<typeof candidateIdentifiers>[number]["kind"],
): number {
  const priorities =
    candidateType === "company"
      ? ["website_host", "linkedin_url", "social_url", "canonical"]
      : ["social_url", "canonical", "linkedin_url", "website_host"];
  return priorities.indexOf(kind);
}

function boundedSourceErrors(sourceErrors: readonly DiscoverySourceError[]) {
  return sourceErrors.slice(0, 20).map((sourceError) => ({
    sourceName: sourceError.sourceName.slice(0, 100),
    message: sourceError.message.slice(0, 1_000),
  }));
}

function storedFailureMessage(run: DiscoveryRun): string | null {
  const summary = run.errorSummary;
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }
  const failure = (summary as { failure?: unknown }).failure;
  if (!failure || typeof failure !== "object" || Array.isArray(failure)) {
    return null;
  }
  const message = (failure as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

function boundedAdminInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: "page" | "pageSize" | "runLimit",
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || !Number.isInteger(resolved)) {
    throw new Error(`Discovery admin ${label} must be a finite integer.`);
  }
  return Math.min(maximum, Math.max(1, resolved));
}

const adminRunSelection = {
  id: discoveryRuns.id,
  externalRunKey: discoveryRuns.externalRunKey,
  trigger: discoveryRuns.trigger,
  status: discoveryRuns.status,
  startedAt: discoveryRuns.startedAt,
  completedAt: discoveryRuns.completedAt,
  createdAt: discoveryRuns.createdAt,
  updatedAt: discoveryRuns.updatedAt,
  geography: discoveryRuns.geography,
  candidateType: discoveryRuns.candidateType,
  sourcesUsed: discoveryRuns.sourcesUsed,
  requestedCount: discoveryRuns.requestedCount,
  companyPercentage: discoveryRuns.companyPercentage,
  foundCount: discoveryRuns.foundCount,
  newCount: discoveryRuns.newCount,
  duplicateCount: discoveryRuns.duplicateCount,
  errorSummary: discoveryRuns.errorSummary,
  requestedByEmail: discoveryRuns.requestedByEmail,
};

export function createDiscoveryRepository(
  database: MewtualsDatabase = getDb(),
): DiscoveryRepository {
  return {
    async queueRun(input) {
      const [created] = await database
        .insert(discoveryRuns)
        .values(queuedRunValues(input))
        .onConflictDoNothing({ target: discoveryRuns.externalRunKey })
        .returning();
      if (created) return created;

      const [existing] = await database
        .select()
        .from(discoveryRuns)
        .where(eq(discoveryRuns.externalRunKey, input.externalRunKey))
        .limit(1);
      if (!existing) {
        throw new Error("Discovery run could not be read after queueing.");
      }
      return existing;
    },

    async claimRun(input) {
      if (input.triggers?.length === 0) return null;
      try {
        return await database.transaction(async (transaction) => {
          await transaction.execute(
            sql`select pg_advisory_xact_lock(1296385841, 1)`,
          );

          await transaction
            .update(discoveryRuns)
            .set({
              status: "failed",
              completedAt: input.now,
              updatedAt: input.now,
              errorSummary: {
                failure: {
                  code: "lease_expired",
                  message: "Discovery run lease expired before completion.",
                },
              },
            })
            .where(
              and(
                eq(discoveryRuns.status, "running"),
                lte(discoveryRuns.leaseExpiresAt, input.now),
              ),
            );

          const [active] = await transaction
            .select({ id: discoveryRuns.id })
            .from(discoveryRuns)
            .where(eq(discoveryRuns.status, "running"))
            .limit(1);
          if (active) return null;

          const claimQueuedRun = async (selectors: readonly SQL[]) => {
            const [claimable] = await transaction
              .select({ id: discoveryRuns.id })
              .from(discoveryRuns)
              .where(
                and(eq(discoveryRuns.status, "queued"), ...selectors),
              )
              .orderBy(
                sql`case ${discoveryRuns.trigger}
                  when 'manual' then 0
                  when 'scheduled' then 1
                  else 2
                end`,
                asc(discoveryRuns.createdAt),
                asc(discoveryRuns.id),
              )
              .for("update", { skipLocked: true })
              .limit(1);
            if (!claimable) return null;

            const [claimed] = await transaction
              .update(discoveryRuns)
              .set({
                status: "running",
                startedAt: input.now,
                completedAt: null,
                leaseTokenHash: input.leaseTokenHash,
                leaseExpiresAt: input.leaseExpiresAt,
                updatedAt: input.now,
                errorSummary: {},
              })
              .where(
                and(
                  eq(discoveryRuns.id, claimable.id),
                  eq(discoveryRuns.status, "queued"),
                ),
              )
              .returning();
            return claimed ?? null;
          };

          if (input.fallbackExternalRunKey) {
            if (input.triggers?.length) {
              const triggeredRun = await claimQueuedRun([
                inArray(discoveryRuns.trigger, [...input.triggers]),
              ]);
              if (triggeredRun) return triggeredRun;
            }

            if (input.queueIfMissing) {
              await transaction
                .insert(discoveryRuns)
                .values(queuedRunValues(input.queueIfMissing))
                .onConflictDoNothing({ target: discoveryRuns.externalRunKey });
            }
            return claimQueuedRun([
              eq(
                discoveryRuns.externalRunKey,
                input.fallbackExternalRunKey,
              ),
            ]);
          }

          if (input.queueIfMissing) {
            await transaction
              .insert(discoveryRuns)
              .values(queuedRunValues(input.queueIfMissing))
              .onConflictDoNothing({ target: discoveryRuns.externalRunKey });
          }

          const selectors: SQL[] = [];
          if (input.triggers) {
            selectors.push(inArray(discoveryRuns.trigger, [...input.triggers]));
          }
          if (input.externalRunKey) {
            selectors.push(
              eq(discoveryRuns.externalRunKey, input.externalRunKey),
            );
          }
          return claimQueuedRun(selectors);
        });
      } catch (error) {
        if (isActiveRunUniqueViolation(error)) return null;
        throw error;
      }
    },

    async getRun(runId) {
      const [run] = await database
        .select()
        .from(discoveryRuns)
        .where(eq(discoveryRuns.id, runId))
        .limit(1);
      return run ?? null;
    },

    async completeRun(input) {
      return database.transaction(async (transaction) => {
        const [run] = await transaction
          .select()
          .from(discoveryRuns)
          .where(eq(discoveryRuns.id, input.runId))
          .for("update")
          .limit(1);
        if (!run) return { outcome: "not_found" as const };
        if (run.status !== "running") {
          if (
            run.submissionHash === input.submissionHash &&
            run.leaseTokenHash === input.leaseTokenHash
          ) {
            return { outcome: "replayed" as const, run };
          }
          return {
            outcome: "conflict" as const,
            reason:
              run.submissionHash && run.submissionHash !== input.submissionHash
                ? ("submission_mismatch" as const)
                : ("invalid_state" as const),
            run,
          };
        }
        if (run.leaseTokenHash !== input.leaseTokenHash) {
          return {
            outcome: "conflict" as const,
            reason: "lease_mismatch" as const,
            run,
          };
        }
        if (!run.leaseExpiresAt || run.leaseExpiresAt <= input.now) {
          return {
            outcome: "conflict" as const,
            reason: "lease_expired" as const,
            run,
          };
        }

        let newCount = 0;
        let duplicateCount = 0;
        const identityConflicts: Array<{
          candidateType: DomainDiscoveryCandidate["type"];
          identifiers: string[];
          candidateIds: string[];
        }> = [];
        for (const candidate of input.candidates) {
          const identifiers = candidateIdentifiers(candidate);
          const primaryIdentifier = identifiers[0];
          if (!primaryIdentifier) {
            throw new Error("Discovery candidate has no stable identifier.");
          }

          const matchedIdentifiers = await transaction
            .select({
              candidateId: discoveryCandidateIdentifiers.candidateId,
              kind: discoveryCandidateIdentifiers.kind,
              normalizedValue: discoveryCandidateIdentifiers.normalizedValue,
            })
            .from(discoveryCandidateIdentifiers)
            .where(
              and(
                eq(discoveryCandidateIdentifiers.candidateType, candidate.type),
                inArray(
                  discoveryCandidateIdentifiers.normalizedValue,
                  identifiers.map(({ value }) => value),
                ),
              ),
            );
          const matchedCandidateIds = [
            ...new Set(matchedIdentifiers.map(({ candidateId }) => candidateId)),
          ].sort();
          if (matchedCandidateIds.length > 1) {
            if (identityConflicts.length < 20) {
              identityConflicts.push({
                candidateType: candidate.type,
                identifiers: identifiers
                  .map(({ value }) => value.slice(0, 512))
                  .slice(0, 4),
                candidateIds: matchedCandidateIds.slice(0, 4),
              });
            }
            continue;
          }

          let candidateId: string;
          if (matchedCandidateIds.length === 1) {
            candidateId = matchedCandidateIds[0]!;
            const [existing] = await transaction
              .select()
              .from(discoveryCandidates)
              .where(eq(discoveryCandidates.id, candidateId))
              .for("update")
              .limit(1);
            if (!existing) {
              throw new Error("Discovery identifier owner could not be read.");
            }
            const storedIdentifiers = await transaction
              .select({ kind: discoveryCandidateIdentifiers.kind })
              .from(discoveryCandidateIdentifiers)
              .where(eq(discoveryCandidateIdentifiers.candidateId, candidateId));
            const currentBestRank = Math.min(
              ...storedIdentifiers.map(({ kind }) =>
                identifierRank(candidate.type, kind),
              ),
            );
            const incomingRank = identifierRank(
              candidate.type,
              primaryIdentifier.kind,
            );
            await transaction
              .update(discoveryCandidates)
              .set({
                name: candidate.name,
                normalizedName: normalizedCandidateName(candidate.name),
                canonicalUrl:
                  incomingRank < currentBestRank
                    ? displayCanonicalUrl(candidate, primaryIdentifier.kind)
                    : existing.canonicalUrl,
                websiteUrl: candidate.websiteUrl ?? existing.websiteUrl,
                primarySocialUrl:
                  candidate.primarySocialUrl ?? existing.primarySocialUrl,
                linkedinUrl: candidate.linkedinUrl ?? existing.linkedinUrl,
                discoveredDescription: candidate.discoveredDescription,
                category: candidate.category,
                subcategory: candidate.subcategory ?? existing.subcategory,
                geography: candidate.geography,
                lastSeenAt: input.now,
                updatedAt: input.now,
                mostRecentRunId: run.id,
                discoveryScore: Math.max(
                  existing.discoveryScore,
                  candidate.discoveryScore,
                ),
                rawMetadata: candidate.rawMetadata,
              })
              .where(eq(discoveryCandidates.id, candidateId));
            duplicateCount += 1;
          } else {
            const [created] = await transaction
              .insert(discoveryCandidates)
              .values({
                type: candidate.type,
                name: candidate.name,
                normalizedName: normalizedCandidateName(candidate.name),
                canonicalIdentityKey: canonicalIdentityKey(primaryIdentifier),
                canonicalUrl: displayCanonicalUrl(
                  candidate,
                  primaryIdentifier.kind,
                ),
                websiteUrl: candidate.websiteUrl ?? null,
                primarySocialUrl: candidate.primarySocialUrl ?? null,
                linkedinUrl: candidate.linkedinUrl ?? null,
                discoveredDescription: candidate.discoveredDescription,
                category: candidate.category,
                subcategory: candidate.subcategory ?? null,
                geography: candidate.geography,
                firstSourceName: candidate.sourceName,
                firstSourceUrl: candidate.sourceUrl,
                discoveredAt: input.now,
                lastSeenAt: input.now,
                createdAt: input.now,
                updatedAt: input.now,
                mostRecentRunId: run.id,
                discoveryScore: candidate.discoveryScore,
                status: "discovered",
                rawMetadata: candidate.rawMetadata,
              })
              .returning();
            if (!created) {
              throw new Error("Discovery candidate was not created.");
            }
            candidateId = created.id;
            newCount += 1;
          }

          await transaction
            .insert(discoveryCandidateIdentifiers)
            .values(
              identifiers.map((identifier) => ({
                candidateId,
                candidateType: candidate.type,
                kind: identifier.kind,
                normalizedValue: identifier.value,
                createdAt: input.now,
              })),
            )
            .onConflictDoNothing({
              target: [
                discoveryCandidateIdentifiers.candidateType,
                discoveryCandidateIdentifiers.normalizedValue,
              ],
            });
          await transaction
            .insert(discoveryCandidateSources)
            .values({
              candidateId,
              discoveryRunId: run.id,
              sourceName: candidate.sourceName,
              sourceUrl: candidate.sourceUrl,
              firstSeenAt: input.now,
              lastSeenAt: input.now,
              rawMetadata: candidate.rawMetadata,
              createdAt: input.now,
            })
            .onConflictDoUpdate({
              target: [
                discoveryCandidateSources.candidateId,
                discoveryCandidateSources.sourceName,
                discoveryCandidateSources.sourceUrl,
              ],
              set: {
                discoveryRunId: run.id,
                lastSeenAt: input.now,
                rawMetadata: candidate.rawMetadata,
              },
            });
        }

        const sourceErrors = boundedSourceErrors(input.sourceErrors);
        const status =
          input.candidates.length === 0
            ? "failed"
            : sourceErrors.length > 0 || identityConflicts.length > 0
              ? "partial"
              : "succeeded";
        const [completed] = await transaction
          .update(discoveryRuns)
          .set({
            status,
            completedAt: input.now,
            updatedAt: input.now,
            submissionHash: input.submissionHash,
            foundCount: input.candidates.length,
            newCount,
            duplicateCount,
            errorSummary: {
              ...(input.candidates.length === 0
                ? {
                    failure: {
                      code: "empty_submission",
                      message: "No valid discovery candidates were submitted.",
                    },
                  }
                : {}),
              sourceErrors,
              identityConflicts,
            },
          })
          .where(eq(discoveryRuns.id, run.id))
          .returning();
        if (!completed) throw new Error("Discovery run was not completed.");
        return { outcome: "completed" as const, run: completed };
      });
    },

    async failRun(input) {
      return database.transaction(async (transaction) => {
        const [run] = await transaction
          .select()
          .from(discoveryRuns)
          .where(eq(discoveryRuns.id, input.runId))
          .for("update")
          .limit(1);
        if (!run) return { outcome: "not_found" as const };

        const message = input.message.trim().slice(0, 1_000);
        if (run.status === "failed") {
          if (
            run.leaseTokenHash === input.leaseTokenHash &&
            storedFailureMessage(run) === message
          ) {
            return { outcome: "replayed" as const, run };
          }
          return {
            outcome: "conflict" as const,
            reason: "failure_mismatch" as const,
            run,
          };
        }
        if (run.status !== "running") {
          return {
            outcome: "conflict" as const,
            reason: "invalid_state" as const,
            run,
          };
        }
        if (run.leaseTokenHash !== input.leaseTokenHash) {
          return {
            outcome: "conflict" as const,
            reason: "lease_mismatch" as const,
            run,
          };
        }
        if (!run.leaseExpiresAt || run.leaseExpiresAt <= input.now) {
          return {
            outcome: "conflict" as const,
            reason: "lease_expired" as const,
            run,
          };
        }

        const [failed] = await transaction
          .update(discoveryRuns)
          .set({
            status: "failed",
            completedAt: input.now,
            updatedAt: input.now,
            errorSummary: {
              failure: { code: "worker_failed", message },
            },
          })
          .where(eq(discoveryRuns.id, run.id))
          .returning();
        if (!failed) throw new Error("Discovery run was not failed.");
        return { outcome: "failed" as const, run: failed };
      });
    },

    async updateCandidateStatus(input) {
      const [updated] = await database
        .update(discoveryCandidates)
        .set({
          status: input.status,
          updatedAt: sql`greatest(
            ${input.now.toISOString()}::timestamptz,
            ${discoveryCandidates.updatedAt} + interval '1 millisecond'
          )`,
        })
        .where(
          and(
            eq(discoveryCandidates.id, input.candidateId),
            eq(discoveryCandidates.updatedAt, input.expectedUpdatedAt),
          ),
        )
        .returning();
      if (updated) return { outcome: "updated" as const, candidate: updated };

      const [latest] = await database
        .select()
        .from(discoveryCandidates)
        .where(eq(discoveryCandidates.id, input.candidateId))
        .limit(1);
      return latest
        ? { outcome: "conflict" as const, candidate: latest }
        : { outcome: "not_found" as const };
    },

    async getAdminSummary(filters) {
      const page = boundedAdminInteger(
        filters.page,
        1,
        MAX_DISCOVERY_ADMIN_PAGE,
        "page",
      );
      const pageSize = boundedAdminInteger(filters.pageSize, 25, 100, "pageSize");
      const runLimit = boundedAdminInteger(filters.runLimit, 20, 100, "runLimit");
      const candidateConditions: SQL[] = [];
      if (filters.type) {
        candidateConditions.push(eq(discoveryCandidates.type, filters.type));
      }
      if (filters.geography) {
        candidateConditions.push(
          eq(discoveryCandidates.geography, filters.geography),
        );
      }
      if (filters.category) {
        candidateConditions.push(
          eq(discoveryCandidates.category, filters.category),
        );
      }
      if (filters.status) {
        candidateConditions.push(
          eq(discoveryCandidates.status, filters.status),
        );
      }
      if (filters.discoveredFrom) {
        candidateConditions.push(
          gte(discoveryCandidates.discoveredAt, filters.discoveredFrom),
        );
      }
      if (filters.discoveredTo) {
        candidateConditions.push(
          lt(discoveryCandidates.discoveredAt, filters.discoveredTo),
        );
      }
      if (filters.source) {
        candidateConditions.push(sql`exists (
          select 1
          from ${discoveryCandidateSources}
          where ${discoveryCandidateSources.candidateId} = ${discoveryCandidates.id}
            and ${discoveryCandidateSources.sourceName} = ${filters.source}
        )`);
      }
      const candidateWhere =
        candidateConditions.length > 0 ? and(...candidateConditions) : undefined;

      return database.transaction(async (transaction) => {
        const [counts] = await transaction
          .select({
            totalCompanies: sql<number>`count(*) filter (where ${discoveryCandidates.type} = 'company')::integer`,
            totalCreators: sql<number>`count(*) filter (where ${discoveryCandidates.type} = 'creator')::integer`,
            discoveredToday: sql<number>`count(*) filter (where ${gte(discoveryCandidates.discoveredAt, filters.todayStart)})::integer`,
          })
          .from(discoveryCandidates);
        const [latestRun] = await transaction
          .select({
            status: discoveryRuns.status,
            completedAt: discoveryRuns.completedAt,
            duplicateCount: discoveryRuns.duplicateCount,
          })
          .from(discoveryRuns)
          .orderBy(desc(discoveryRuns.createdAt), desc(discoveryRuns.id))
          .limit(1);
        const [candidateTotal] = await transaction
          .select({ count: sql<number>`count(*)::integer` })
          .from(discoveryCandidates)
          .where(candidateWhere);
        const candidateItems = await transaction
          .select()
          .from(discoveryCandidates)
          .where(candidateWhere)
          .orderBy(
            desc(discoveryCandidates.discoveredAt),
            desc(discoveryCandidates.id),
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize);
        const runs = await transaction
          .select(adminRunSelection)
          .from(discoveryRuns)
          .orderBy(desc(discoveryRuns.createdAt), desc(discoveryRuns.id))
          .limit(runLimit);
        const candidateIds = candidateItems.map(({ id }) => id);
        const evidence =
          candidateIds.length === 0
            ? []
            : await transaction
                .select()
                .from(discoveryCandidateSources)
                .where(
                  inArray(discoveryCandidateSources.candidateId, candidateIds),
                )
                .orderBy(
                  asc(discoveryCandidateSources.candidateId),
                  asc(discoveryCandidateSources.sourceName),
                  asc(discoveryCandidateSources.sourceUrl),
                );

        return {
          summary: {
            totalCompanies: counts?.totalCompanies ?? 0,
            totalCreators: counts?.totalCreators ?? 0,
            discoveredToday: counts?.discoveredToday ?? 0,
            latestRunStatus: latestRun?.status ?? null,
            latestRunCompletedAt: latestRun?.completedAt ?? null,
            latestRunDuplicateCount: latestRun?.duplicateCount ?? 0,
          },
          candidates: {
            items: candidateItems,
            total: candidateTotal?.count ?? 0,
            page,
            pageSize,
          },
          runs,
          evidence,
        };
      });
    },
  };
}
