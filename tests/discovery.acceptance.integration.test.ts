import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { eq, inArray, or, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DiscoveryCandidateInput } from "../app/domain/discovery";
import type { DiscoveryConfig } from "../app/server/discovery-config";
import {
  createWorkerClaimHandler,
  createWorkerCompleteHandler,
} from "../app/server/discovery-route";
import { createDiscoveryService } from "../app/server/discovery-service";
import { closeDb, getDb } from "../db/client";
import { createDiscoveryRepository } from "../db/repositories/discovery-repository";
import {
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryCandidateSources,
  discoveryRuns,
} from "../db/schema";
import { requireLocalTestDatabaseUrl } from "./support/acceptance-environment";

requireLocalTestDatabaseUrl(process.env.DATABASE_URL);

const database = getDb();
const testId = randomUUID();
const compactTestId = testId.replaceAll("-", "");
const geography = `Acceptance India ${testId}`;
const adminEmail = `discovery-admin-${testId}@example.test`;
const adminActor = { userId: `acceptance:${testId}`, email: adminEmail };
const workerSecret =
  "discovery-acceptance-worker-secret-longer-than-thirty-two-characters";
const createdRunIds = new Set<string>();
const createdCandidateIds = new Set<string>();

const discoveryConfig: DiscoveryConfig = {
  geographies: [geography],
  companyCategories: ["AI"],
  creatorCategories: ["technology"],
  totalCandidates: 3,
  companyPercentage: 67,
  enabledSources: ["codex_web"],
  workerSecret,
};

async function assertAcceptanceDatabase() {
  const [current] = await database.execute<{ databaseName: string }>(
    sql`select current_database() as "databaseName"`,
  );
  if (current?.databaseName !== "mewtuals_test") {
    throw new Error(
      `Refusing discovery acceptance cleanup in ${current?.databaseName ?? "an unknown database"}.`,
    );
  }
}

async function assertUniqueAcceptanceScopeIsClean() {
  await assertAcceptanceDatabase();
  const [runs, candidates] = await Promise.all([
    database
      .select({ id: discoveryRuns.id })
      .from(discoveryRuns)
      .where(eq(discoveryRuns.requestedByEmail, adminEmail))
      .limit(1),
    database
      .select({ id: discoveryCandidates.id })
      .from(discoveryCandidates)
      .where(eq(discoveryCandidates.geography, geography))
      .limit(1),
  ]);
  if (runs.length > 0 || candidates.length > 0) {
    throw new Error("Discovery acceptance scope is not clean.");
  }
}

async function cleanupDiscoveryAcceptanceRows() {
  await assertAcceptanceDatabase();
  const attributableRuns = await database
    .select({ id: discoveryRuns.id })
    .from(discoveryRuns)
    .where(eq(discoveryRuns.requestedByEmail, adminEmail));
  for (const { id } of attributableRuns) createdRunIds.add(id);

  const runIds = [...createdRunIds];
  const candidateConditions = [eq(discoveryCandidates.geography, geography)];
  if (runIds.length > 0) {
    candidateConditions.push(
      inArray(discoveryCandidates.mostRecentRunId, runIds),
    );
  }
  const attributableCandidates = await database
    .select({ id: discoveryCandidates.id })
    .from(discoveryCandidates)
    .where(or(...candidateConditions));
  for (const { id } of attributableCandidates) createdCandidateIds.add(id);

  const candidateIds = [...createdCandidateIds];
  if (candidateIds.length > 0 || runIds.length > 0) {
    const sourceConditions = [];
    if (candidateIds.length > 0) {
      sourceConditions.push(
        inArray(discoveryCandidateSources.candidateId, candidateIds),
      );
    }
    if (runIds.length > 0) {
      sourceConditions.push(
        inArray(discoveryCandidateSources.discoveryRunId, runIds),
      );
    }
    await database
      .delete(discoveryCandidateSources)
      .where(or(...sourceConditions));
  }
  if (candidateIds.length > 0) {
    await database
      .delete(discoveryCandidateIdentifiers)
      .where(inArray(discoveryCandidateIdentifiers.candidateId, candidateIds));
    await database
      .delete(discoveryCandidates)
      .where(inArray(discoveryCandidates.id, candidateIds));
  }
  if (runIds.length > 0) {
    await database.delete(discoveryRuns).where(inArray(discoveryRuns.id, runIds));
  }
}

function workerRequest(
  path: string,
  body: unknown,
  bearer = workerSecret,
): Request {
  return new Request(`http://localhost:4000${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function companyCandidate(
  sourceName: string,
  sourceUrl: string,
  overrides: Partial<DiscoveryCandidateInput> = {},
): DiscoveryCandidateInput {
  const websiteUrl = `https://acceptance-company-${compactTestId}.example`;
  return {
    type: "company",
    name: "Acceptance AI Company",
    canonicalUrl: websiteUrl,
    websiteUrl,
    discoveredDescription:
      "An India-focused AI company used to verify the discovery control plane.",
    category: "AI",
    geography,
    sourceName,
    sourceUrl,
    discoveryScore: 82,
    rawMetadata: { acceptanceTestId: testId },
    ...overrides,
  };
}

function creatorCandidate(): DiscoveryCandidateInput {
  const primarySocialUrl =
    `https://www.youtube.com/@acceptancecreator${compactTestId}`;
  return {
    type: "creator",
    name: "Acceptance Technology Creator",
    canonicalUrl: primarySocialUrl,
    primarySocialUrl,
    discoveredDescription:
      "An India-focused technology creator used to verify discovery persistence.",
    category: "technology",
    geography,
    sourceName: "Acceptance Creator Directory",
    sourceUrl: `https://creator-directory-${compactTestId}.example/profile`,
    discoveryScore: 76,
    rawMetadata: { acceptanceTestId: testId },
  };
}

describe("Mewtuals discovery acceptance selection", () => {
  it("keeps PostgreSQL acceptance out of unit tests and in both database suites", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts["test:unit"]).toContain(
      "--exclude tests/discovery.acceptance.integration.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "tests/discovery.acceptance.integration.test.ts",
    );
    expect(packageJson.scripts["test:acceptance"]).toContain(
      "tests/discovery.acceptance.integration.test.ts",
    );
  });
});

describe("Mewtuals discovery control-plane acceptance", () => {
  beforeAll(assertUniqueAcceptanceScopeIsClean);

  afterAll(async () => {
    try {
      await cleanupDiscoveryAcceptanceRows();
    } finally {
      await closeDb();
    }
  });

  it("preserves an administrator decision across a complete Codex-worker discovery journey", async () => {
    let currentTime = new Date("2026-07-22T06:30:00.000Z");
    const tokens = [
      `manual-one-${testId}`,
      `lease-one-${testId}`,
      `manual-two-${testId}`,
      `lease-two-${testId}`,
    ];
    const service = createDiscoveryService({
      repository: createDiscoveryRepository(database),
      adminEmails: [adminEmail],
      workerSecret,
      config: discoveryConfig,
      now: () => currentTime,
      token: () => {
        const next = tokens.shift();
        if (!next) throw new Error("Discovery acceptance token fixture exhausted.");
        return next;
      },
    });
    const claimWorkerRun = createWorkerClaimHandler({
      authenticateWorker: (authorization) =>
        service.authenticateWorker(authorization),
      claim: (trigger) => service.claimRun(trigger),
    });
    const completeWorkerRun = createWorkerCompleteHandler({
      authenticateWorker: (authorization) =>
        service.authenticateWorker(authorization),
      complete: (runId, body) => service.completeRun(runId, body),
    });

    const queued = await service.queueManualRun(adminActor);
    expect(queued).toMatchObject({
      ok: true,
      run: { trigger: "manual", status: "queued" },
    });
    if (!queued.ok) throw new Error("Administrator run was not queued.");
    createdRunIds.add(queued.run.id);

    currentTime = new Date(currentTime.getTime() + 1_000);
    const unauthorizedClaim = await claimWorkerRun(
      workerRequest("/api/discovery/worker/claim", { trigger: "scheduled" }, "wrong-secret"),
    );
    expect(unauthorizedClaim.status).toBe(401);
    expect(unauthorizedClaim.headers.get("content-type")).toContain(
      "application/json",
    );
    await expect(unauthorizedClaim.json()).resolves.toEqual({
      ok: false,
      error: "Worker authentication is required.",
    });

    const claimedResponse = await claimWorkerRun(
      workerRequest("/api/discovery/worker/claim", { trigger: "scheduled" }),
    );
    expect(claimedResponse.status).toBe(200);
    expect(claimedResponse.headers.get("content-type")).toContain(
      "application/json",
    );
    const claimed = await claimedResponse.json();
    expect(claimed).toMatchObject({
      ok: true,
      claimed: true,
      runId: queued.run.id,
      promptVersion: "codex-web-v1",
      config: {
        geographies: [geography],
        allocation: { companies: 2, creators: 1 },
      },
    });
    if (!claimed.claimed) throw new Error("Manual run was not claimed.");

    const firstBatch = {
      runId: claimed.runId,
      leaseToken: claimed.leaseToken,
      promptVersion: claimed.promptVersion,
      candidates: [
        companyCandidate(
          "Acceptance Registry Alpha",
          `https://registry-alpha-${compactTestId}.example/company`,
        ),
        creatorCandidate(),
        companyCandidate(
          "Acceptance Registry Beta",
          `https://registry-beta-${compactTestId}.example/company`,
          {
            name: "Acceptance AI Company (confirmed)",
            discoveryScore: 91,
          },
        ),
      ],
      sourceErrors: [],
    } as const;

    currentTime = new Date(currentTime.getTime() + 1_000);
    const completedResponse = await completeWorkerRun(
      workerRequest(
        `/api/discovery/worker/runs/${claimed.runId}/complete`,
        firstBatch,
      ),
      { params: Promise.resolve({ runId: claimed.runId }) },
    );
    expect(completedResponse.status).toBe(200);
    expect(completedResponse.headers.get("content-type")).toContain(
      "application/json",
    );
    const completed = await completedResponse.json();
    expect(completed).toMatchObject({
      ok: true,
      outcome: "completed",
      run: {
        id: claimed.runId,
        status: "succeeded",
        foundCount: 3,
        newCount: 2,
        duplicateCount: 1,
      },
    });

    const creatorOnly = await service.getAdminSummary(adminActor, {
      geography,
      type: "creator",
      pageSize: 10,
    });
    expect(creatorOnly).toMatchObject({
      ok: true,
      snapshot: {
        candidates: {
          total: 1,
          items: [{ type: "creator", name: "Acceptance Technology Creator" }],
        },
      },
    });
    if (!creatorOnly.ok) throw new Error("Creator filter was not available.");
    createdCandidateIds.add(creatorOnly.snapshot.candidates.items[0]!.id);

    const technologyCategory = await service.getAdminSummary(adminActor, {
      geography,
      category: "technology",
      pageSize: 10,
    });
    expect(technologyCategory).toMatchObject({
      ok: true,
      snapshot: {
        candidates: {
          total: 1,
          items: [{ type: "creator", category: "technology" }],
        },
      },
    });

    const betaSource = await service.getAdminSummary(adminActor, {
      geography,
      source: "Acceptance Registry Beta",
      pageSize: 10,
    });
    expect(betaSource).toMatchObject({
      ok: true,
      snapshot: {
        candidates: {
          total: 1,
          items: [{ type: "company", category: "AI" }],
        },
      },
    });

    const nonmatchingGeography = await service.getAdminSummary(adminActor, {
      geography: `${geography} Missing`,
      pageSize: 10,
    });
    expect(nonmatchingGeography).toMatchObject({
      ok: true,
      snapshot: { candidates: { total: 0, items: [] } },
    });

    const rejectedStatus = await service.getAdminSummary(adminActor, {
      geography,
      status: "rejected",
      pageSize: 10,
    });
    expect(rejectedStatus).toMatchObject({
      ok: true,
      snapshot: { candidates: { total: 0, items: [] } },
    });

    const filtered = await service.getAdminSummary(adminActor, {
      type: "company",
      geography,
      category: "AI",
      source: "Acceptance Registry Beta",
      status: "discovered",
      page: 1,
      pageSize: 10,
    });
    expect(filtered).toMatchObject({
      ok: true,
      snapshot: {
        summary: {
          totalCompanies: 1,
          totalCreators: 1,
          discoveredToday: 2,
          latestRunStatus: "succeeded",
          latestRunDuplicateCount: 1,
        },
        candidates: { total: 1, page: 1, pageSize: 10 },
      },
    });
    if (!filtered.ok) throw new Error("Admin snapshot was not available.");
    expect(filtered.snapshot.candidates.items).toHaveLength(1);
    createdCandidateIds.add(filtered.snapshot.candidates.items[0]!.id);
    expect(filtered.snapshot.evidence).toHaveLength(2);
    expect(
      filtered.snapshot.evidence.map(
        ({ sourceName, sourceUrl, discoveryRunId }) => ({
          sourceName,
          sourceUrl,
          discoveryRunId,
        }),
      ),
    ).toEqual([
      {
        sourceName: "Acceptance Registry Alpha",
        sourceUrl: `https://registry-alpha-${compactTestId}.example/company`,
        discoveryRunId: claimed.runId,
      },
      {
        sourceName: "Acceptance Registry Beta",
        sourceUrl: `https://registry-beta-${compactTestId}.example/company`,
        discoveryRunId: claimed.runId,
      },
    ]);

    const company = filtered.snapshot.candidates.items[0]!;
    const staleUpdatedAt = company.updatedAt;
    currentTime = new Date(currentTime.getTime() + 1_000);
    const shortlisted = await service.updateCandidateStatus(
      adminActor,
      company.id,
      {
        status: "shortlisted",
        expectedUpdatedAt: staleUpdatedAt.toISOString(),
      },
    );
    expect(shortlisted).toMatchObject({
      ok: true,
      candidate: { id: company.id, status: "shortlisted" },
    });
    if (!shortlisted.ok) throw new Error("Candidate was not shortlisted.");

    const staleConflict = await service.updateCandidateStatus(
      adminActor,
      company.id,
      {
        status: "rejected",
        expectedUpdatedAt: staleUpdatedAt.toISOString(),
      },
    );
    expect(staleConflict).toMatchObject({
      ok: false,
      status: 409,
      candidate: {
        id: company.id,
        status: "shortlisted",
        updatedAt: shortlisted.candidate.updatedAt,
      },
    });

    const shortlistedStatus = await service.getAdminSummary(adminActor, {
      geography,
      status: "shortlisted",
      pageSize: 10,
    });
    expect(shortlistedStatus).toMatchObject({
      ok: true,
      snapshot: {
        candidates: {
          total: 1,
          items: [{ id: company.id, type: "company", status: "shortlisted" }],
        },
      },
    });

    currentTime = new Date(currentTime.getTime() + 1_000);
    const secondQueued = await service.queueManualRun(adminActor);
    expect(secondQueued).toMatchObject({
      ok: true,
      run: { trigger: "manual", status: "queued" },
    });
    if (!secondQueued.ok) throw new Error("Second run was not queued.");
    createdRunIds.add(secondQueued.run.id);

    currentTime = new Date(currentTime.getTime() + 1_000);
    const secondClaimedResponse = await claimWorkerRun(
      workerRequest("/api/discovery/worker/claim", { trigger: "scheduled" }),
    );
    expect(secondClaimedResponse.status).toBe(200);
    expect(secondClaimedResponse.headers.get("content-type")).toContain(
      "application/json",
    );
    const secondClaimed = await secondClaimedResponse.json();
    expect(secondClaimed).toMatchObject({
      ok: true,
      claimed: true,
      runId: secondQueued.run.id,
    });
    if (!secondClaimed.claimed) throw new Error("Second run was not claimed.");

    currentTime = new Date(currentTime.getTime() + 1_000);
    const secondBatch = {
      runId: secondClaimed.runId,
      leaseToken: secondClaimed.leaseToken,
      promptVersion: secondClaimed.promptVersion,
      candidates: [
        companyCandidate(
          "Acceptance Registry Gamma",
          `https://registry-gamma-${compactTestId}.example/company`,
          { discoveryScore: 95 },
        ),
      ],
      sourceErrors: [],
    } as const;
    const rediscoveredResponse = await completeWorkerRun(
      workerRequest(
        `/api/discovery/worker/runs/${secondClaimed.runId}/complete`,
        secondBatch,
      ),
      { params: Promise.resolve({ runId: secondClaimed.runId }) },
    );
    expect(rediscoveredResponse.status).toBe(200);
    expect(rediscoveredResponse.headers.get("content-type")).toContain(
      "application/json",
    );
    const rediscovered = await rediscoveredResponse.json();
    expect(rediscovered).toMatchObject({
      ok: true,
      outcome: "completed",
      run: {
        status: "succeeded",
        foundCount: 1,
        newCount: 0,
        duplicateCount: 1,
      },
    });

    const persistedDecision = await service.getAdminSummary(adminActor, {
      type: "company",
      geography,
      source: "Acceptance Registry Gamma",
      status: "shortlisted",
      pageSize: 10,
    });
    expect(persistedDecision).toMatchObject({
      ok: true,
      snapshot: {
        summary: {
          totalCompanies: 1,
          totalCreators: 1,
          latestRunStatus: "succeeded",
          latestRunDuplicateCount: 1,
        },
        candidates: {
          total: 1,
          items: [
            {
              id: company.id,
              status: "shortlisted",
              discoveryScore: 95,
              mostRecentRunId: secondClaimed.runId,
            },
          ],
        },
      },
    });
    if (!persistedDecision.ok) {
      throw new Error("Rediscovered candidate was not available to admin.");
    }
    expect(persistedDecision.snapshot.evidence).toHaveLength(3);
    expect(
      persistedDecision.snapshot.evidence.map(
        ({ sourceName, sourceUrl, discoveryRunId }) => ({
          sourceName,
          sourceUrl,
          discoveryRunId,
        }),
      ),
    ).toEqual([
      {
        sourceName: "Acceptance Registry Alpha",
        sourceUrl: `https://registry-alpha-${compactTestId}.example/company`,
        discoveryRunId: claimed.runId,
      },
      {
        sourceName: "Acceptance Registry Beta",
        sourceUrl: `https://registry-beta-${compactTestId}.example/company`,
        discoveryRunId: claimed.runId,
      },
      {
        sourceName: "Acceptance Registry Gamma",
        sourceUrl: `https://registry-gamma-${compactTestId}.example/company`,
        discoveryRunId: secondClaimed.runId,
      },
    ]);
    expect(tokens).toEqual([]);
  });
});
