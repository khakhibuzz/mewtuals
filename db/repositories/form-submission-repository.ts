import { createHash } from "node:crypto";

import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";

import type { OpportunityBriefStatus } from "../../app/domain/opportunity-brief";
import type {
  FormSubmissionRepository,
  NewFormSubmission,
  StoredFormSubmission,
} from "../../app/server/form-notification-contracts";
import { getDb, type MewtualsDatabase } from "../client";
import { publicFormSubmissions } from "../schema";

type Transaction = Parameters<Parameters<MewtualsDatabase["transaction"]>[0]>[0];
type Database = MewtualsDatabase | Transaction;
const SUBMISSION_LOCK_NAMESPACE = 1_329_744_467;
const APPLICATION_REQUESTER_LOCK_NAMESPACE = 1_329_744_468;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1_000;
const MAX_APPLICATIONS_PER_WINDOW = 8;

async function lock(transaction: Transaction, namespace: number, value: string) {
  const key = createHash("sha256").update(value).digest().readInt32BE(0);
  await transaction.execute(sql`select pg_advisory_xact_lock(${namespace}, ${key})`);
}

export function lockFormSubmission(transaction: Transaction, id: string) {
  return lock(transaction, SUBMISSION_LOCK_NAMESPACE, id);
}

export async function findFormSubmission(database: Database, id: string): Promise<StoredFormSubmission | null> {
  const [submission] = await database.select().from(publicFormSubmissions)
    .where(eq(publicFormSubmissions.id, id)).limit(1);
  return submission ?? null;
}

export async function insertFormSubmission(
  transaction: Transaction,
  input: NewFormSubmission,
  requesterHash: string,
  request?: { id: string; status: OpportunityBriefStatus },
): Promise<StoredFormSubmission> {
  const [submission] = await transaction.insert(publicFormSubmissions).values({
    id: input.id,
    form: input.form,
    payloadHash: input.payloadHash,
    payload: input.payload,
    message: input.message,
    requesterHash,
    requestId: request?.id ?? null,
    status: request?.status ?? null,
    createdAt: input.createdAt,
  }).returning();
  if (!submission) throw new Error("Form submission was not persisted.");
  return submission;
}

export function createFormSubmissionRepository(database: MewtualsDatabase = getDb()): FormSubmissionRepository {
  return {
    async saveApplication(input, requesterHash) {
      if (input.form !== "apply") throw new Error("Expected an application submission.");
      return database.transaction(async (transaction) => {
        await lockFormSubmission(transaction, input.id);
        const existing = await findFormSubmission(transaction, input.id);
        if (existing) {
          return existing.form === input.form && existing.payloadHash === input.payloadHash
            ? { outcome: "accepted" as const, submission: existing }
            : { outcome: "idempotency_conflict" as const };
        }
        await lock(transaction, APPLICATION_REQUESTER_LOCK_NAMESPACE, requesterHash);
        const windowStart = new Date(input.createdAt.getTime() - RATE_LIMIT_WINDOW_MS);
        const [attempts] = await transaction.select({ count: sql<number>`count(*)::integer` })
          .from(publicFormSubmissions).where(and(
            eq(publicFormSubmissions.requesterHash, requesterHash),
            eq(publicFormSubmissions.form, "apply"),
            gt(publicFormSubmissions.createdAt, windowStart),
          ));
        if ((attempts?.count ?? 0) >= MAX_APPLICATIONS_PER_WINDOW) {
          return { outcome: "rate_limited" as const };
        }
        return { outcome: "accepted" as const, submission: await insertFormSubmission(transaction, input, requesterHash) };
      });
    },

    async startAttempt(id, at) {
      const [started] = await database.update(publicFormSubmissions).set({
        firstAttemptAt: sql`coalesce(${publicFormSubmissions.firstAttemptAt}, ${at.toISOString()}::timestamptz)`,
        attemptCount: sql`${publicFormSubmissions.attemptCount} + 1`,
      }).where(and(eq(publicFormSubmissions.id, id), isNull(publicFormSubmissions.acceptedAt))).returning();
      if (started) return started;
      const existing = await findFormSubmission(database, id);
      if (!existing) throw new Error("Form submission was not found.");
      return existing;
    },

    async recordAccepted(id, providerMessageId, at) {
      if (!providerMessageId.trim()) throw new Error("Email provider message ID is required.");
      const [recorded] = await database.update(publicFormSubmissions).set({
        acceptedAt: at,
        providerMessageId,
        lastError: null,
      }).where(and(eq(publicFormSubmissions.id, id), isNull(publicFormSubmissions.acceptedAt)))
        .returning({ id: publicFormSubmissions.id });
      if (recorded) return;
      const existing = await findFormSubmission(database, id);
      if (!existing?.acceptedAt) throw new Error("Email acceptance was not recorded.");
    },

    async recordFailure(id, error) {
      await database.update(publicFormSubmissions).set({ lastError: error.slice(0, 1_000) })
        .where(and(eq(publicFormSubmissions.id, id), isNull(publicFormSubmissions.acceptedAt)));
    },

    async listPending(limit) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("Pending submission limit must be between 1 and 100.");
      }
      return database.select().from(publicFormSubmissions)
        .where(isNull(publicFormSubmissions.acceptedAt))
        .orderBy(asc(publicFormSubmissions.createdAt), asc(publicFormSubmissions.id)).limit(limit);
    },
  };
}
