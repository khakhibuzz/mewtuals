import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { and, eq, inArray, like, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { discoveryCandidateInputSchema } from "../app/domain/discovery";
import { createOpportunityBriefPostHandler } from "../app/server/opportunity-brief-route";
import { createOpportunityBriefService } from "../app/server/opportunity-brief-service";
import { closeDb, getDb } from "../db/client";
import { createDiscoveryRepository } from "../db/repositories/discovery-repository";
import { createOpportunityBriefRepository } from "../db/repositories/opportunity-brief-repository";
import {
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryCandidateSources,
  discoveryRuns,
  onboardingDrafts,
  opportunityBriefRequests,
  profiles,
  users,
} from "../db/schema";
import { requireLocalTestDatabaseUrl } from "./support/acceptance-environment";

requireLocalTestDatabaseUrl(process.env.DATABASE_URL);

const database = getDb();
const opportunityBriefRepository = createOpportunityBriefRepository(database);
const discoveryRepository = createDiscoveryRepository(database);
const testId = randomUUID();
const compactTestId = testId.replaceAll("-", "");
const profileHost = `task7-${compactTestId}.example`;
const profilePattern = `%${profileHost}%`;
const unmatchedProfileUrl = `https://${profileHost}/unmatched`;
const matchedProfileUrl = `https://${profileHost}`;
const memberEmail = `task7-member-${testId}@example.test`;
const adminEmail = `task7-admin-${testId}@example.test`;
const geography = `Task 7 acceptance ${testId}`;
const source = "bengaluru-meetup";
const baseTime = new Date("2026-07-22T08:30:00.000Z");
const adminActor = { userId: `task7:${testId}`, email: adminEmail };
const createdDiscoveryRunIds = new Set<string>();
let now = baseTime;

function advanceTime(milliseconds = 1_000) {
  now = new Date(now.getTime() + milliseconds);
}

async function assertAcceptanceDatabase() {
  const [current] = await database.execute<{ databaseName: string }>(
    sql`select current_database() as "databaseName"`,
  );
  if (current?.databaseName !== "mewtuals_test") {
    throw new Error(
      `Refusing Task 7 cleanup in ${current?.databaseName ?? "an unknown database"}.`,
    );
  }
}

async function cleanupAcceptanceRows() {
  await assertAcceptanceDatabase();
  await database
    .delete(opportunityBriefRequests)
    .where(like(opportunityBriefRequests.normalizedProfileUrl, profilePattern));

  const candidates = await database
    .select({ id: discoveryCandidates.id, runId: discoveryCandidates.mostRecentRunId })
    .from(discoveryCandidates)
    .where(eq(discoveryCandidates.geography, geography));
  const candidateIds = candidates.map(({ id }) => id);
  const runIds = [
    ...new Set([
      ...candidates.map(({ runId }) => runId),
      ...createdDiscoveryRunIds,
    ]),
  ];
  if (candidateIds.length > 0) {
    await database
      .delete(discoveryCandidateSources)
      .where(inArray(discoveryCandidateSources.candidateId, candidateIds));
    await database
      .delete(discoveryCandidateIdentifiers)
      .where(inArray(discoveryCandidateIdentifiers.candidateId, candidateIds));
    await database
      .delete(discoveryCandidates)
      .where(inArray(discoveryCandidates.id, candidateIds));
  }
  if (runIds.length > 0) {
    const ownedRuns = await database
      .select({ id: discoveryRuns.id })
      .from(discoveryRuns)
      .where(
        and(
          inArray(discoveryRuns.id, runIds),
          eq(discoveryRuns.geography, geography),
          like(discoveryRuns.externalRunKey, `task7-${testId}-%`),
        ),
      );
    const ownedRunIds = ownedRuns.map(({ id }) => id);
    if (ownedRunIds.length !== runIds.length) {
      throw new Error(
        "Refusing Task 7 Discovery cleanup because a tracked run is outside the test allowlist.",
      );
    }
    if (ownedRunIds.length > 0) {
      await database
        .delete(discoveryRuns)
        .where(inArray(discoveryRuns.id, ownedRunIds));
      const remainingRuns = await database
        .select({ id: discoveryRuns.id })
        .from(discoveryRuns)
        .where(inArray(discoveryRuns.id, ownedRunIds));
      if (remainingRuns.length > 0) {
        throw new Error("Task 7 Discovery cleanup left a tracked run behind.");
      }
    }
  }
  createdDiscoveryRunIds.clear();
  await database.delete(users).where(eq(users.email, memberEmail));
}

async function createMemberSentinel() {
  const [user] = await database
    .insert(users)
    .values({
      email: memberEmail,
      name: "Task 7 member sentinel",
      createdAt: baseTime,
      updatedAt: baseTime,
    })
    .returning();
  if (!user) throw new Error("Task 7 member sentinel was not created.");

  await database.insert(onboardingDrafts).values({
    userId: user.id,
    identityKind: "organisation",
    organisationSubtype: "startup",
    websiteUrl: `https://${profileHost}/member-source`,
    generatedName: "Task 7 sentinel",
    generatedOrganisationName: "Task 7 sentinel",
    generatedDomain: profileHost,
    primaryUrl: `https://${profileHost}/member-source`,
    createdAt: baseTime,
    updatedAt: baseTime,
  });
  await database.insert(profiles).values({
    userId: user.id,
    name: "Task 7 member sentinel",
    identityKind: "organisation",
    organisationName: "Task 7 sentinel",
    organisationSubtype: "startup",
    domain: profileHost,
    primaryUrl: `https://${profileHost}/member-profile`,
    websiteUrl: `https://${profileHost}/member-profile`,
    status: "draft",
    createdAt: baseTime,
    updatedAt: baseTime,
  });
  return user.id;
}

async function memberSnapshot(userId: string) {
  const [member, draft, profile] = await Promise.all([
    database.select().from(users).where(eq(users.id, userId)),
    database
      .select()
      .from(onboardingDrafts)
      .where(eq(onboardingDrafts.userId, userId)),
    database.select().from(profiles).where(eq(profiles.userId, userId)),
  ]);
  return { member, draft, profile };
}

async function submitPublicRequest(body: Record<string, unknown>, ip: string) {
  const service = createOpportunityBriefService({
    repository: opportunityBriefRepository,
    acknowledgementSender: {
      async sendAcknowledgement() {
        return { status: "pending" as const };
      },
    },
    adminEmails: [adminEmail],
    now: () => now,
  });
  const handler = createOpportunityBriefPostHandler({
    environment: "test",
    sessionSecret: "task7-acceptance-session-secret-longer-than-32-characters",
    submit: (input, requesterHash) => service.submit(input, requesterHash),
  });
  const response = await handler(
    new Request("http://localhost:4000/api/opportunity-briefs", {
      method: "POST",
      headers: {
        "cf-connecting-ip": ip,
        "Content-Type": "application/json",
        Origin: "http://localhost:4000",
      },
      body: JSON.stringify(body),
    }),
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<Record<string, unknown>>;
}

async function createSourceSupportedCandidate() {
  const externalRunKey = `task7-${testId}-${randomUUID()}`;
  const leaseTokenHash = `task7-lease-${testId}`;
  const run = await discoveryRepository.queueRun({
    externalRunKey,
    trigger: "manual",
    now,
    geography,
    candidateType: "company",
    sourcesUsed: ["Task 7 acceptance source"],
    requestedCount: 1,
    companyPercentage: 100,
    requestedByEmail: adminEmail,
  });
  createdDiscoveryRunIds.add(run.id);
  advanceTime();
  const claimed = await discoveryRepository.claimRun({
    now,
    leaseTokenHash,
    leaseExpiresAt: new Date(now.getTime() + 60_000),
    externalRunKey,
  });
  if (!claimed || claimed.id !== run.id) {
    throw new Error("Task 7 Discovery run was not claimed.");
  }
  advanceTime();
  const candidate = discoveryCandidateInputSchema.parse({
    type: "company",
    name: "Task 7 source-supported company",
    canonicalUrl: matchedProfileUrl,
    websiteUrl: matchedProfileUrl,
    discoveredDescription:
      "A source-supported Discovery candidate used by the Task 7 acceptance journey.",
    category: "acceptance",
    geography,
    sourceName: "Task 7 acceptance source",
    sourceUrl: `https://${profileHost}/source-evidence`,
    discoveryScore: 88,
    rawMetadata: { acceptanceTestId: testId },
  });
  const completed = await discoveryRepository.completeRun({
    runId: run.id,
    leaseTokenHash,
    submissionHash: `task7-submission-${testId}`,
    now,
    candidates: [candidate],
    sourceErrors: [],
  });
  expect(completed.outcome).toBe("completed");

  const [stored] = await database
    .select({ id: discoveryCandidates.id })
    .from(discoveryCandidates)
    .where(eq(discoveryCandidates.geography, geography));
  if (!stored) throw new Error("Task 7 Discovery candidate was not stored.");
  const [evidence] = await database
    .select({ id: discoveryCandidateSources.id })
    .from(discoveryCandidateSources)
    .where(eq(discoveryCandidateSources.candidateId, stored.id));
  expect(evidence).toBeDefined();
  return { candidateId: stored.id, runId: run.id };
}

beforeAll(async () => {
  await cleanupAcceptanceRows();
});

afterAll(async () => {
  try {
    await cleanupAcceptanceRows();
  } finally {
    await closeDb();
  }
});

describe("Opportunity Brief Task 7 suite selection", () => {
  it("runs only in the guarded database and acceptance suites", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["test:unit"]).toContain(
      "--exclude tests/opportunity-brief.acceptance.integration.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "tests/opportunity-brief.acceptance.integration.test.ts",
    );
    expect(packageJson.scripts["test:acceptance"]).toContain(
      "tests/opportunity-brief.acceptance.integration.test.ts",
    );
  });
});

describe("Opportunity Brief complete durable journey", () => {
  it("cleans a scheduled Discovery run when candidate setup stops early", async () => {
    const externalRunKey = `task7-${testId}-early-failure`;
    const run = await discoveryRepository.queueRun({
      externalRunKey,
      trigger: "manual",
      now,
      geography,
      candidateType: "company",
      sourcesUsed: ["Task 7 induced failure source"],
      requestedCount: 1,
      companyPercentage: 100,
      requestedByEmail: adminEmail,
    });
    createdDiscoveryRunIds.add(run.id);

    try {
      await cleanupAcceptanceRows();
      const remaining = await database
        .select({ id: discoveryRuns.id })
        .from(discoveryRuns)
        .where(eq(discoveryRuns.id, run.id));
      expect(remaining).toHaveLength(0);
    } finally {
      await database.delete(discoveryRuns).where(eq(discoveryRuns.id, run.id));
    }
  });

  it("deduplicates public intake, links only source-supported candidates, and preserves member data", async () => {
    const memberId = await createMemberSentinel();
    const memberBefore = await memberSnapshot(memberId);
    const baseline = await opportunityBriefRepository.getAdminSnapshot(now, {});
    const [candidateCountBefore] = await database
      .select({ count: sql<number>`count(*)::integer` })
      .from(discoveryCandidates);

    const first = await submitPublicRequest(
      {
        participantType: "company",
        profileUrl: unmatchedProfileUrl,
        email: memberEmail,
        phoneNumber: "",
        openToText: "Distribution and creator partnerships",
        source,
        utm: { source: "meetup", campaign: "task-7" },
        website: "",
      },
      "203.0.113.71",
    );
    expect(first).toEqual({
      ok: true,
      submission: {
        participantType: "company",
        profileUrl: unmatchedProfileUrl,
        email: memberEmail,
        phoneNumber: null,
        openToText: "Distribution and creator partnerships",
        source,
        utm: { source: "meetup", campaign: "task-7" },
      },
    });

    advanceTime();
    const second = await submitPublicRequest(
      {
        participantType: "company",
        profileUrl: ` HTTPS://${profileHost.toUpperCase()}/unmatched/?utm_medium=qr#profile `,
        email: "",
        phoneNumber: "+919876543210",
        openToText: "Current partnership context",
        source,
        utm: { source: "meetup", campaign: "task-7-repeat" },
        website: "",
      },
      "203.0.113.72",
    );
    expect(second).toEqual({
      ok: true,
      submission: {
        participantType: "company",
        profileUrl: unmatchedProfileUrl,
        email: null,
        phoneNumber: "+919876543210",
        openToText: "Current partnership context",
        source,
        utm: { source: "meetup", campaign: "task-7-repeat" },
      },
    });
    expect(JSON.stringify(second)).not.toMatch(
      /requestId|requesterHash|linkedCandidateId|acknowledgementStatus|adminNotes|"status"/,
    );

    const unmatchedRows = await database
      .select()
      .from(opportunityBriefRequests)
      .where(
        and(
          eq(opportunityBriefRequests.participantType, "company"),
          eq(opportunityBriefRequests.normalizedProfileUrl, unmatchedProfileUrl),
        ),
      );
    expect(unmatchedRows).toHaveLength(1);
    expect(unmatchedRows[0]).toMatchObject({
      email: memberEmail,
      phoneNumber: "+919876543210",
      source,
      utm: { source: "meetup", campaign: "task-7-repeat" },
      sourceHistory: [
        { source, utm: { source: "meetup", campaign: "task-7" } },
        { source, utm: { source: "meetup", campaign: "task-7-repeat" } },
      ],
      linkedCandidateId: null,
      acknowledgementStatus: "pending",
      acknowledgementEmail: memberEmail,
      submissionCount: 2,
    });
    const [candidateCountAfterUnmatched] = await database
      .select({ count: sql<number>`count(*)::integer` })
      .from(discoveryCandidates);
    expect(candidateCountAfterUnmatched?.count).toBe(candidateCountBefore?.count);

    const { candidateId, runId } = await createSourceSupportedCandidate();
    advanceTime();
    await submitPublicRequest(
      {
        participantType: "company",
        profileUrl: matchedProfileUrl,
        email: "",
        phoneNumber: "+919811111111",
        openToText: "Exact source-supported match",
        source,
        utm: { medium: "qr", campaign: "task-7-exact" },
        website: "",
      },
      "203.0.113.73",
    );
    const [matched] = await database
      .select()
      .from(opportunityBriefRequests)
      .where(eq(opportunityBriefRequests.normalizedProfileUrl, matchedProfileUrl));
    expect(matched).toMatchObject({
      linkedCandidateId: candidateId,
      acknowledgementStatus: "not_requested",
      submissionCount: 1,
    });

    const service = createOpportunityBriefService({
      repository: opportunityBriefRepository,
      adminEmails: [adminEmail],
      now: () => now,
    });
    const snapshot = await service.getAdminSnapshot(adminActor, {});
    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) throw new Error(snapshot.error);
    expect(snapshot.snapshot.summary).toMatchObject({
      total: baseline.summary.total + 2,
      companies: baseline.summary.companies + 2,
      awaitingResearch: baseline.summary.awaitingResearch + 2,
      linkedCandidates: baseline.summary.linkedCandidates + 1,
      pendingAcknowledgements: baseline.summary.pendingAcknowledgements + 1,
      failedAcknowledgements: baseline.summary.failedAcknowledgements,
    });
    expect(snapshot.snapshot.summary.sources[source]).toBe(
      (baseline.summary.sources[source] ?? 0) + 2,
    );

    const filtered = await service.getAdminSnapshot(adminActor, {
      participantType: "company",
      status: "submitted",
      source,
      linked: false,
      pageSize: 100,
    });
    expect(filtered.ok).toBe(true);
    if (!filtered.ok) throw new Error(filtered.error);
    expect(filtered.snapshot.requests.map(({ id }) => id)).toContain(
      unmatchedRows[0]?.id,
    );
    expect(
      filtered.snapshot.requests.every(
        (request) =>
          request.participantType === "company" &&
          request.status === "submitted" &&
          request.source === source &&
          request.linkedCandidateId === null,
      ),
    ).toBe(true);

    const requestId = unmatchedRows[0]?.id;
    const initialUpdatedAt = unmatchedRows[0]?.updatedAt;
    if (!requestId || !initialUpdatedAt) {
      throw new Error("Unmatched Task 7 request was not stored.");
    }
    advanceTime();
    const statusUpdate = await service.updateStatus(adminActor, requestId, {
      status: "researching",
      expectedUpdatedAt: initialUpdatedAt.toISOString(),
    });
    expect(statusUpdate).toMatchObject({
      ok: true,
      request: { status: "researching" },
    });
    if (!statusUpdate.ok) throw new Error(statusUpdate.error);

    advanceTime();
    const notesUpdate = await service.updateNotes(adminActor, requestId, {
      notes: "Source checked; ready for exact candidate review.",
      expectedUpdatedAt: statusUpdate.request.updatedAt.toISOString(),
    });
    expect(notesUpdate).toMatchObject({
      ok: true,
      request: { adminNotes: "Source checked; ready for exact candidate review." },
    });
    if (!notesUpdate.ok) throw new Error(notesUpdate.error);

    advanceTime();
    const staleLink = await service.linkCandidate(adminActor, requestId, {
      candidateId,
      expectedUpdatedAt: statusUpdate.request.updatedAt.toISOString(),
    });
    expect(staleLink).toMatchObject({ ok: false, status: 409 });

    advanceTime();
    const linked = await service.linkCandidate(adminActor, requestId, {
      candidateId,
      expectedUpdatedAt: notesUpdate.request.updatedAt.toISOString(),
    });
    expect(linked).toMatchObject({
      ok: true,
      request: { linkedCandidateId: candidateId },
    });
    if (!linked.ok) throw new Error(linked.error);

    advanceTime();
    const unlinked = await service.unlinkCandidate(adminActor, requestId, {
      expectedUpdatedAt: linked.request.updatedAt.toISOString(),
    });
    expect(unlinked).toMatchObject({
      ok: true,
      request: { linkedCandidateId: null },
    });

    expect(await memberSnapshot(memberId)).toEqual(memberBefore);

    await cleanupAcceptanceRows();
    const remainingRun = await database
      .select({ id: discoveryRuns.id })
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, runId));
    expect(remainingRun).toHaveLength(0);
  });
});
