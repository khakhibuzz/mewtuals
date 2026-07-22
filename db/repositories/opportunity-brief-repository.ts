import { createHash } from "node:crypto";

import {
  and,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  MAX_OPPORTUNITY_BRIEF_METADATA_BYTES,
  MAX_OPPORTUNITY_BRIEF_SOURCE_HISTORY,
  type OpportunityBriefSourceHistoryEntry,
} from "../../app/domain/opportunity-brief";
import type {
  AdminRequest,
  OpportunityBriefRepository,
  SubmitRepositoryInput,
} from "../../app/server/opportunity-brief-service";
import type { MewtualsDatabase } from "../client";
import { getDb } from "../client";
import {
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryCandidateSources,
  opportunityBriefRequests,
  opportunityBriefSubmissionAttempts,
} from "../schema";

const MAX_ATTEMPTS = 8;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1_000;
const REQUESTER_LOCK_NAMESPACE = 1_329_744_465;
const PROFILE_LOCK_NAMESPACE = 1_329_744_466;

const adminRequestSelection = {
  id: opportunityBriefRequests.id,
  participantType: opportunityBriefRequests.participantType,
  profileUrl: opportunityBriefRequests.profileUrl,
  email: opportunityBriefRequests.email,
  phoneNumber: opportunityBriefRequests.phoneNumber,
  openToText: opportunityBriefRequests.openToText,
  source: opportunityBriefRequests.source,
  utm: opportunityBriefRequests.utm,
  linkedCandidateId: opportunityBriefRequests.linkedCandidateId,
  status: opportunityBriefRequests.status,
  adminNotes: opportunityBriefRequests.adminNotes,
  acknowledgementStatus: opportunityBriefRequests.acknowledgementStatus,
  acknowledgementSentAt: opportunityBriefRequests.acknowledgementSentAt,
  acknowledgementError: opportunityBriefRequests.acknowledgementError,
  submissionCount: opportunityBriefRequests.submissionCount,
  lastSubmittedAt: opportunityBriefRequests.lastSubmittedAt,
  createdAt: opportunityBriefRequests.createdAt,
  updatedAt: opportunityBriefRequests.updatedAt,
};

type OpportunityBriefTransaction = Parameters<
  Parameters<MewtualsDatabase["transaction"]>[0]
>[0];

function advisoryKey(value: string): number {
  return createHash("sha256").update(value).digest().readInt32BE(0);
}

async function takeAdvisoryLock(
  transaction: OpportunityBriefTransaction,
  namespace: number,
  value: string,
): Promise<void> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(${namespace}, ${advisoryKey(value)})`,
  );
}

function boundedAdminInteger(
  value: number | undefined,
  fallback: number,
  maximum: number,
  label: "page" | "pageSize",
): number {
  const resolved = value ?? fallback;
  if (!Number.isFinite(resolved) || !Number.isInteger(resolved)) {
    throw new Error(`Opportunity Brief admin ${label} must be a finite integer.`);
  }
  return Math.min(maximum, Math.max(1, resolved));
}

function indiaDayBounds(at: Date): { start: Date; end: Date } {
  const indiaOffsetMs = 330 * 60 * 1_000;
  const indiaTime = new Date(at.getTime() + indiaOffsetMs);
  const start = new Date(
    Date.UTC(
      indiaTime.getUTCFullYear(),
      indiaTime.getUTCMonth(),
      indiaTime.getUTCDate(),
    ) - indiaOffsetMs,
  );
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1_000) };
}

function sourceHistoryEntry(
  input: SubmitRepositoryInput,
): OpportunityBriefSourceHistoryEntry {
  return {
    ...(input.source ? { source: input.source } : {}),
    utm: input.utm,
  };
}

function serializedByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function boundedSourceHistory(
  existing: readonly OpportunityBriefSourceHistoryEntry[],
  input: SubmitRepositoryInput,
): OpportunityBriefSourceHistoryEntry[] {
  const history = [...existing, sourceHistoryEntry(input)].slice(
    -MAX_OPPORTUNITY_BRIEF_SOURCE_HISTORY,
  );
  while (
    history.length > 1 &&
    serializedByteLength({ utm: input.utm, history }) >
      MAX_OPPORTUNITY_BRIEF_METADATA_BYTES
  ) {
    history.shift();
  }
  return history;
}

async function findAdminRequest(
  database: MewtualsDatabase | OpportunityBriefTransaction,
  requestId: string,
): Promise<AdminRequest | null> {
  const [request] = await database
    .select(adminRequestSelection)
    .from(opportunityBriefRequests)
    .where(eq(opportunityBriefRequests.id, requestId))
    .limit(1);
  return request ?? null;
}

async function exactCandidateId(
  transaction: OpportunityBriefTransaction,
  input: SubmitRepositoryInput,
): Promise<string | null> {
  const [candidate] = await transaction
    .select({ id: discoveryCandidates.id })
    .from(discoveryCandidateIdentifiers)
    .innerJoin(
      discoveryCandidates,
      eq(discoveryCandidates.id, discoveryCandidateIdentifiers.candidateId),
    )
    .innerJoin(
      discoveryCandidateSources,
      eq(
        discoveryCandidateSources.candidateId,
        discoveryCandidateIdentifiers.candidateId,
      ),
    )
    .where(
      and(
        eq(discoveryCandidateIdentifiers.candidateType, input.participantType),
        eq(discoveryCandidates.type, input.participantType),
        eq(discoveryCandidateIdentifiers.kind, input.candidateIdentifier.kind),
        eq(
          discoveryCandidateIdentifiers.normalizedValue,
          input.candidateIdentifier.value,
        ),
      ),
    )
    .limit(1);
  return candidate?.id ?? null;
}

function submissionUpdate(
  input: SubmitRepositoryInput,
  linkedCandidateId: string | null,
  emailChanged: boolean,
  sourceHistory: OpportunityBriefSourceHistoryEntry[],
) {
  return {
    profileUrl: input.profileUrl,
    email: sql`coalesce(${input.email}, ${opportunityBriefRequests.email})`,
    normalizedEmail: sql`coalesce(${input.email}, ${opportunityBriefRequests.normalizedEmail})`,
    phoneNumber: sql`coalesce(${input.phoneNumber}, ${opportunityBriefRequests.phoneNumber})`,
    normalizedPhoneNumber: sql`coalesce(${input.phoneNumber}, ${opportunityBriefRequests.normalizedPhoneNumber})`,
    openToText: sql`coalesce(${input.openToText}, ${opportunityBriefRequests.openToText})`,
    source: sql`coalesce(${input.source}, ${opportunityBriefRequests.source})`,
    utm: input.utm,
    sourceHistory,
    linkedCandidateId: linkedCandidateId
      ? linkedCandidateId
      : sql`${opportunityBriefRequests.linkedCandidateId}`,
    ...(emailChanged
      ? {
          acknowledgementStatus: "pending" as const,
          acknowledgementEmail: input.email,
          acknowledgementError: null,
          acknowledgementSentAt: null,
        }
      : {}),
    submissionCount: sql`${opportunityBriefRequests.submissionCount} + 1`,
    lastSubmittedAt: input.submittedAt,
    updatedAt: sql`greatest(
      ${input.submittedAt.toISOString()}::timestamptz,
      ${opportunityBriefRequests.updatedAt} + interval '1 millisecond'
    )`,
  };
}

export function createOpportunityBriefRepository(
  database: MewtualsDatabase = getDb(),
): OpportunityBriefRepository {
  return {
    async submit(input) {
      return database.transaction(async (transaction) => {
        await takeAdvisoryLock(
          transaction,
          REQUESTER_LOCK_NAMESPACE,
          input.requesterHash,
        );
        const windowStart = new Date(
          input.submittedAt.getTime() - RATE_LIMIT_WINDOW_MS,
        );
        const [attempts] = await transaction
          .select({ count: sql<number>`count(*)::integer` })
          .from(opportunityBriefSubmissionAttempts)
          .where(
            and(
              eq(
                opportunityBriefSubmissionAttempts.requesterHash,
                input.requesterHash,
              ),
              gte(opportunityBriefSubmissionAttempts.createdAt, windowStart),
            ),
          );
        if ((attempts?.count ?? 0) >= MAX_ATTEMPTS) {
          return { outcome: "rate_limited" as const };
        }

        await takeAdvisoryLock(
          transaction,
          PROFILE_LOCK_NAMESPACE,
          `${input.participantType}\u0000${input.profileUrl}`,
        );
        const [existing] = await transaction
          .select({
            id: opportunityBriefRequests.id,
            normalizedEmail: opportunityBriefRequests.normalizedEmail,
            sourceHistory: opportunityBriefRequests.sourceHistory,
          })
          .from(opportunityBriefRequests)
          .where(
            and(
              eq(
                opportunityBriefRequests.participantType,
                input.participantType,
              ),
              eq(
                opportunityBriefRequests.normalizedProfileUrl,
                input.profileUrl,
              ),
            ),
          )
          .limit(1);
        const linkedCandidateId = await exactCandidateId(transaction, input);
        const emailChanged = Boolean(
          input.email && input.email !== existing?.normalizedEmail,
        );
        const sourceHistory = boundedSourceHistory(
          existing?.sourceHistory ?? [],
          input,
        );
        const initialAcknowledgementStatus = input.email
          ? ("pending" as const)
          : ("not_requested" as const);
        const [request] = await transaction
          .insert(opportunityBriefRequests)
          .values({
            participantType: input.participantType,
            profileUrl: input.profileUrl,
            normalizedProfileUrl: input.profileUrl,
            email: input.email,
            normalizedEmail: input.email,
            phoneNumber: input.phoneNumber,
            normalizedPhoneNumber: input.phoneNumber,
            openToText: input.openToText,
            source: input.source,
            utm: input.utm,
            sourceHistory,
            linkedCandidateId,
            acknowledgementStatus: initialAcknowledgementStatus,
            acknowledgementEmail: input.email,
            submissionCount: 1,
            lastSubmittedAt: input.submittedAt,
            createdAt: input.submittedAt,
            updatedAt: input.submittedAt,
          })
          .onConflictDoUpdate({
            target: [
              opportunityBriefRequests.participantType,
              opportunityBriefRequests.normalizedProfileUrl,
            ],
            set: submissionUpdate(
              input,
              linkedCandidateId,
              emailChanged,
              sourceHistory,
            ),
          })
          .returning({
            id: opportunityBriefRequests.id,
            status: opportunityBriefRequests.status,
            linkedCandidateId: opportunityBriefRequests.linkedCandidateId,
            acknowledgementStatus:
              opportunityBriefRequests.acknowledgementStatus,
            updatedAt: opportunityBriefRequests.updatedAt,
          });
        if (!request) {
          throw new Error("Opportunity Brief request was not persisted.");
        }

        await transaction.insert(opportunityBriefSubmissionAttempts).values({
          requesterHash: input.requesterHash,
          requestId: request.id,
          createdAt: input.submittedAt,
        });

        return {
          outcome: "accepted" as const,
          requestId: request.id,
          status: request.status,
          linkedCandidateId: request.linkedCandidateId,
          persistence: existing ? ("merged" as const) : ("created" as const),
          acknowledgement: {
            status: request.acknowledgementStatus,
            delivery:
              emailChanged && input.email
                ? {
                    email: input.email,
                    expectedUpdatedAt: request.updatedAt,
                  }
                : null,
          },
        };
      });
    },

    async recordAcknowledgement(input) {
      const values =
        input.outcome.status === "sent"
          ? {
              acknowledgementStatus: "sent" as const,
              acknowledgementSentAt: input.outcome.at ?? new Date(),
              acknowledgementError: null,
            }
          : input.outcome.status === "failed"
            ? {
                acknowledgementStatus: "failed" as const,
                acknowledgementSentAt: null,
                acknowledgementError: input.outcome.error,
              }
            : {
                acknowledgementStatus: "pending" as const,
                acknowledgementSentAt: null,
                acknowledgementError: null,
              };
      const [updated] = await database
        .update(opportunityBriefRequests)
        .set(values)
        .where(
          and(
            eq(opportunityBriefRequests.id, input.requestId),
            eq(opportunityBriefRequests.acknowledgementStatus, "pending"),
            eq(
              opportunityBriefRequests.acknowledgementEmail,
              input.attemptedEmail,
            ),
            eq(opportunityBriefRequests.updatedAt, input.expectedUpdatedAt),
          ),
        )
        .returning({ id: opportunityBriefRequests.id });
      return { outcome: updated ? ("recorded" as const) : ("stale" as const) };
    },

    async getAdminSnapshot(actorTime, filters) {
      const page = boundedAdminInteger(filters.page, 1, 1_000_000, "page");
      const pageSize = boundedAdminInteger(filters.pageSize, 25, 100, "pageSize");
      const conditions: SQL[] = [];
      if (filters.participantType) {
        conditions.push(
          eq(
            opportunityBriefRequests.participantType,
            filters.participantType,
          ),
        );
      }
      if (filters.status) {
        conditions.push(eq(opportunityBriefRequests.status, filters.status));
      }
      if (filters.source) {
        conditions.push(eq(opportunityBriefRequests.source, filters.source));
      }
      if (filters.submittedAtGte) {
        conditions.push(
          gte(
            opportunityBriefRequests.lastSubmittedAt,
            filters.submittedAtGte,
          ),
        );
      }
      if (filters.submittedAtLt) {
        conditions.push(
          lt(opportunityBriefRequests.lastSubmittedAt, filters.submittedAtLt),
        );
      }
      if (filters.linked === true) {
        conditions.push(isNotNull(opportunityBriefRequests.linkedCandidateId));
      } else if (filters.linked === false) {
        conditions.push(isNull(opportunityBriefRequests.linkedCandidateId));
      }
      const requestWhere =
        conditions.length > 0 ? and(...conditions) : undefined;
      const today = indiaDayBounds(actorTime);

      return database.transaction(async (transaction) => {
        const [counts] = await transaction
          .select({
            total: sql<number>`count(*)::integer`,
            newToday: sql<number>`count(*) filter (
              where ${opportunityBriefRequests.createdAt} >= ${today.start.toISOString()}::timestamptz
                and ${opportunityBriefRequests.createdAt} < ${today.end.toISOString()}::timestamptz
            )::integer`,
            companies: sql<number>`count(*) filter (
              where ${opportunityBriefRequests.participantType} = 'company'
            )::integer`,
            creators: sql<number>`count(*) filter (
              where ${opportunityBriefRequests.participantType} = 'creator'
            )::integer`,
            awaitingResearch: sql<number>`count(*) filter (
              where ${opportunityBriefRequests.status} = 'submitted'
            )::integer`,
            linkedCandidates: sql<number>`count(*) filter (
              where ${opportunityBriefRequests.linkedCandidateId} is not null
            )::integer`,
          })
          .from(opportunityBriefRequests);
        const sourceCounts = await transaction
          .select({
            source: opportunityBriefRequests.source,
            count: sql<number>`count(*)::integer`,
          })
          .from(opportunityBriefRequests)
          .where(isNotNull(opportunityBriefRequests.source))
          .groupBy(opportunityBriefRequests.source)
          .orderBy(opportunityBriefRequests.source);
        const [filteredCount] = await transaction
          .select({ count: sql<number>`count(*)::integer` })
          .from(opportunityBriefRequests)
          .where(requestWhere);
        const requests = await transaction
          .select(adminRequestSelection)
          .from(opportunityBriefRequests)
          .where(requestWhere)
          .orderBy(
            desc(opportunityBriefRequests.lastSubmittedAt),
            desc(opportunityBriefRequests.id),
          )
          .limit(pageSize)
          .offset((page - 1) * pageSize);
        const total = filteredCount?.count ?? 0;

        return {
          summary: {
            total: counts?.total ?? 0,
            newToday: counts?.newToday ?? 0,
            companies: counts?.companies ?? 0,
            creators: counts?.creators ?? 0,
            awaitingResearch: counts?.awaitingResearch ?? 0,
            linkedCandidates: counts?.linkedCandidates ?? 0,
            sources: Object.fromEntries(
              sourceCounts
                .filter(
                  (entry): entry is { source: string; count: number } =>
                    entry.source !== null,
                )
                .map(({ source, count }) => [source, count]),
            ),
          },
          requests,
          page,
          pageSize,
          totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
        };
      });
    },

    getAdminRequest(requestId) {
      return findAdminRequest(database, requestId);
    },

    async getCandidateType(candidateId) {
      const [candidate] = await database
        .select({ type: discoveryCandidates.type })
        .from(discoveryCandidates)
        .where(eq(discoveryCandidates.id, candidateId))
        .limit(1);
      return candidate?.type ?? null;
    },

    async applyAdminMutation(input) {
      const conditions = [
        eq(opportunityBriefRequests.id, input.requestId),
        eq(opportunityBriefRequests.updatedAt, input.expectedUpdatedAt),
      ];
      if (input.kind === "status") {
        conditions.push(
          eq(opportunityBriefRequests.status, input.expectedStatus),
        );
      }
      const mutation =
        input.kind === "status"
          ? { status: input.status }
          : input.kind === "candidate"
            ? { linkedCandidateId: input.candidateId }
            : { adminNotes: input.notes };
      const [updated] = await database
        .update(opportunityBriefRequests)
        .set({
          ...mutation,
          updatedAt: sql`greatest(
            ${input.updatedAt.toISOString()}::timestamptz,
            ${opportunityBriefRequests.updatedAt} + interval '1 millisecond'
          )`,
        })
        .where(and(...conditions))
        .returning(adminRequestSelection);
      if (updated) return { outcome: "updated" as const, request: updated };
      return {
        outcome: "conflict" as const,
        request: await findAdminRequest(database, input.requestId),
      };
    },
  };
}
