import { randomUUID } from "node:crypto";

import { and, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { candidateIdentifierForProfileUrl } from "../app/domain/discovery";
import type { NewFormSubmission } from "../app/server/form-notification-contracts";
import type { SubmitRepositoryInput } from "../app/server/opportunity-brief-service";
import { createFormSubmissionRepository } from "../db/repositories/form-submission-repository";
import { createOpportunityBriefRepository } from "../db/repositories/opportunity-brief-repository";
import * as coreSchema from "../db/schema";
import * as radarSchema from "../db/global-radar-schema";
import { opportunityBriefRequests, opportunityBriefSubmissionAttempts, publicFormSubmissions } from "../db/schema";
import { requireLocalTestDatabaseUrl } from "./support/acceptance-environment";

const databaseUrl = requireLocalTestDatabaseUrl(process.env.DATABASE_URL);
const client = postgres(databaseUrl!, { max: 12, prepare: false });
const database = drizzle(client, { schema: { ...coreSchema, ...radarSchema } });
const forms = createFormSubmissionRepository(database);
const opportunities = createOpportunityBriefRepository(database);
const testId = randomUUID();
const submissionIds: string[] = [];
const profileUrls: string[] = [];
const now = new Date("1990-11-19T06:00:00.000Z");

function notification(form: "apply" | "join" = "apply", overrides: Partial<NewFormSubmission> = {}): NewFormSubmission {
  const id = overrides.id ?? randomUUID();
  submissionIds.push(id);
  return {
    id,
    form,
    payloadHash: "a".repeat(64),
    payload: { companyUrl: "https://example.test/", workEmail: "founder@example.test", phone: "+918872052031" },
    message: {
      from: "Mewtuals <forms@mewtuals.com>",
      to: "keshav@mewtuals.com",
      replyTo: "founder@example.test",
      subject: `Form ledger test ${testId}`,
      text: "A distribution partner",
      html: "<p>A distribution partner</p>",
    },
    createdAt: now,
    ...overrides,
  };
}

function requester(label: string = randomUUID()) {
  return `form-ledger-${testId}-${label}`;
}

function opportunity(input: NewFormSubmission, overrides: Partial<SubmitRepositoryInput> = {}): SubmitRepositoryInput {
  const profileUrl = `https://form-ledger-${randomUUID()}.example/`;
  profileUrls.push(profileUrl);
  return {
    participantType: "company",
    profileUrl,
    email: "founder@example.test",
    phoneNumber: null,
    openToText: "A distribution partner",
    source: "form-ledger-test",
    utm: {},
    requesterHash: requester(),
    submittedAt: now,
    candidateIdentifier: candidateIdentifierForProfileUrl(profileUrl),
    notification: input,
    ...overrides,
  };
}

async function cleanup() {
  const [current] = await database.execute<{ name: string }>(sql`select current_database() as name`);
  if (current.name !== "mewtuals_test") throw new Error("Refusing form-ledger cleanup outside the test database.");
  if (submissionIds.length) await database.delete(publicFormSubmissions).where(inArray(publicFormSubmissions.id, submissionIds));
  if (profileUrls.length) await database.delete(opportunityBriefRequests).where(inArray(opportunityBriefRequests.profileUrl, profileUrls));
  submissionIds.length = 0;
  profileUrls.length = 0;
}

beforeEach(cleanup);
afterAll(async () => {
  try { await cleanup(); } finally { await client.end({ timeout: 5 }); }
});

describe("application submission ledger", () => {
  it("saves the exact snapshot and reuses it when a retry supplies regenerated email formatting", async () => {
    const input = notification();
    const first = await forms.saveApplication(input, requester());
    expect(first).toMatchObject({ outcome: "accepted", submission: { ...input, requestId: null, acceptedAt: null, attemptCount: 0 } });
    const replay = await forms.saveApplication({ ...input, message: { ...input.message, subject: "Changed template" }, createdAt: new Date(now.getTime() + 10_000) }, requester());
    expect(replay).toEqual(first);
  });

  it("rejects an idempotency key reused with another payload or form", async () => {
    const input = notification();
    await forms.saveApplication(input, requester());
    expect(await forms.saveApplication({ ...input, payloadHash: "b".repeat(64) }, requester())).toEqual({ outcome: "idempotency_conflict" });
    const join = opportunity(notification("join", { id: input.id }));
    expect(await opportunities.submit(join)).toEqual({ outcome: "idempotency_conflict" });
    expect(await database.select().from(opportunityBriefRequests).where(eq(opportunityBriefRequests.profileUrl, join.profileUrl))).toHaveLength(0);
  });

  it("serializes concurrent retries into one immutable submission", async () => {
    const input = notification();
    const results = await Promise.all(Array.from({ length: 6 }, () => forms.saveApplication(input, requester())));
    for (const result of results) expect(result).toEqual(results[0]);
    expect(await database.select().from(publicFormSubmissions).where(eq(publicFormSubmissions.id, input.id))).toHaveLength(1);
  });

  it("enforces eight applications per requester under concurrency without rate-limiting an exact replay", async () => {
    const identity = requester("limited");
    const inputs = Array.from({ length: 12 }, () => notification());
    const results = await Promise.all(inputs.map((input) => forms.saveApplication(input, identity)));
    expect(results.filter((result) => result.outcome === "accepted")).toHaveLength(8);
    expect(results.filter((result) => result.outcome === "rate_limited")).toHaveLength(4);
    const acceptedIndex = results.findIndex((result) => result.outcome === "accepted");
    expect(await forms.saveApplication(inputs[acceptedIndex], identity)).toEqual(results[acceptedIndex]);
    expect(await forms.saveApplication(notification("apply", { createdAt: new Date(now.getTime() + 15 * 60 * 1_000) }), identity)).toMatchObject({ outcome: "accepted" });
  });
});

describe("Opportunity Brief notification transaction", () => {
  it("atomically saves a notification and replays without another submission or applicant acknowledgement", async () => {
    const input = opportunity(notification("join"));
    const initial = await opportunities.submit(input);
    expect(initial).toMatchObject({ outcome: "accepted", notification: { id: input.notification!.id } });
    const replay = await opportunities.submit(input);
    expect(replay).toMatchObject({ outcome: "accepted", acknowledgement: { delivery: null }, notification: { id: input.notification!.id } });
    if (initial.outcome !== "accepted" || replay.outcome !== "accepted") throw new Error("Expected accepted submissions.");
    expect(replay.requestId).toBe(initial.requestId);
    const [request] = await database.select().from(opportunityBriefRequests).where(eq(opportunityBriefRequests.id, initial.requestId));
    expect(request.submissionCount).toBe(1);
    expect(await database.select().from(opportunityBriefSubmissionAttempts).where(eq(opportunityBriefSubmissionAttempts.requestId, request.id))).toHaveLength(1);
  });

  it("serializes concurrent notification retries before mutating the Opportunity Brief", async () => {
    const input = opportunity(notification("join"));
    const results = await Promise.all(Array.from({ length: 6 }, () => opportunities.submit(input)));
    expect(results.every((result) => result.outcome === "accepted")).toBe(true);
    const [request] = await database.select().from(opportunityBriefRequests).where(eq(opportunityBriefRequests.profileUrl, input.profileUrl));
    expect(request.submissionCount).toBe(1);
    expect(results.filter((result) => result.outcome === "accepted" && result.acknowledgement.delivery)).toHaveLength(1);
  });

  it("permits an exact replay after the requester has reached the join rate limit", async () => {
    const identity = requester("join-limit");
    const inputs = Array.from({ length: 8 }, () => opportunity(notification("join"), { requesterHash: identity }));
    for (const input of inputs) expect(await opportunities.submit(input)).toMatchObject({ outcome: "accepted" });
    expect(await opportunities.submit(opportunity(notification("join"), { requesterHash: identity }))).toEqual({ outcome: "rate_limited" });
    expect(await opportunities.submit(inputs[0])).toMatchObject({ outcome: "accepted", acknowledgement: { delivery: null } });
  });

  it("rolls back the Opportunity Brief and rate-limit attempt if the immutable notification cannot be saved", async () => {
    const input = opportunity(notification("join", { payloadHash: "invalid" }));
    await expect(opportunities.submit(input)).rejects.toThrow();
    expect(await database.select().from(opportunityBriefRequests).where(eq(opportunityBriefRequests.profileUrl, input.profileUrl))).toHaveLength(0);
    expect(await database.select().from(opportunityBriefSubmissionAttempts).where(eq(opportunityBriefSubmissionAttempts.requesterHash, input.requesterHash))).toHaveLength(0);
  });

  it("retains each submitted payload when the same Opportunity Brief is updated by another submission", async () => {
    const first = opportunity(notification("join"));
    const secondNotification = notification("join", { payloadHash: "b".repeat(64), payload: { email: "second@example.test" } });
    await opportunities.submit(first);
    await opportunities.submit({ ...first, email: "second@example.test", notification: secondNotification });
    const rows = await database.select().from(publicFormSubmissions).where(inArray(publicFormSubmissions.id, [first.notification!.id, secondNotification.id]));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === first.notification!.id)?.payload).toEqual(first.notification!.payload);
    expect(rows.find((row) => row.id === secondNotification.id)?.payload).toEqual(secondNotification.payload);
  });
});

describe("notification delivery records", () => {
  it("retains the first attempt time and counts concurrent attempts atomically", async () => {
    const input = notification();
    await forms.saveApplication(input, requester());
    const first = await forms.startAttempt(input.id, now);
    expect(first).toMatchObject({ firstAttemptAt: now, attemptCount: 1 });
    await Promise.all(Array.from({ length: 6 }, () => forms.startAttempt(input.id, new Date(now.getTime() + 1_000))));
    const [recorded] = await database.select().from(publicFormSubmissions).where(eq(publicFormSubmissions.id, input.id));
    expect(recorded).toMatchObject({ firstAttemptAt: now, attemptCount: 7 });
  });

  it("bounds failure details and never lets a late failure or acceptance overwrite accepted delivery", async () => {
    const input = notification();
    await forms.saveApplication(input, requester());
    await forms.startAttempt(input.id, now);
    await forms.recordFailure(input.id, "x".repeat(2_000));
    const [failed] = await database.select().from(publicFormSubmissions).where(eq(publicFormSubmissions.id, input.id));
    expect(failed.lastError).toHaveLength(1_000);
    await forms.recordAccepted(input.id, "provider-1", now);
    await Promise.all([
      forms.recordFailure(input.id, "Late timeout"),
      forms.recordAccepted(input.id, "provider-2", new Date(now.getTime() + 1_000)),
    ]);
    expect(await forms.startAttempt(input.id, new Date())).toMatchObject({ acceptedAt: now, providerMessageId: "provider-1", lastError: null, attemptCount: 1 });
  });

  it("throws when acceptance cannot be recorded for a missing submission", async () => {
    await expect(forms.recordAccepted(randomUUID(), "provider-1", now)).rejects.toThrow("Email acceptance was not recorded.");
    await expect(forms.startAttempt(randomUUID(), now)).rejects.toThrow("Form submission was not found.");
  });

  it("lists only pending submissions with a bounded oldest-first batch", async () => {
    const pending = notification();
    const accepted = notification("apply", { createdAt: new Date(now.getTime() - 1_000) });
    await forms.saveApplication(pending, requester());
    await forms.saveApplication(accepted, requester());
    await forms.recordAccepted(accepted.id, "provider-1", now);
    const batch = await forms.listPending(1);
    expect(batch).toHaveLength(1);
    expect(batch[0].id).toBe(pending.id);
    await expect(forms.listPending(0)).rejects.toThrow();
    await expect(forms.listPending(101)).rejects.toThrow();
    await expect(forms.listPending(1.5)).rejects.toThrow();
  });

  it("preserves the notification when its Opportunity Brief is deleted and blocks stale replay", async () => {
    const input = opportunity(notification("join"));
    const initial = await opportunities.submit(input);
    if (initial.outcome !== "accepted") throw new Error("Expected accepted submission.");
    await database.delete(opportunityBriefRequests).where(eq(opportunityBriefRequests.id, initial.requestId));
    const [stored] = await database.select().from(publicFormSubmissions).where(and(eq(publicFormSubmissions.id, input.notification!.id), eq(publicFormSubmissions.form, "join")));
    expect(stored.requestId).toBeNull();
    expect(stored.payload).toEqual(input.notification!.payload);
    expect(await opportunities.submit(input)).toEqual({ outcome: "idempotency_conflict" });
  });
});
