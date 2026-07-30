import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { and, count, eq, inArray, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createGlobalRadarApplication,
  createGlobalRadarApplicationDependencies,
} from "../app/server/global-radar";
import type { GlobalRadarConfig } from "../app/server/global-radar/config";
import { hashGlobalRadarLeaseToken } from "../app/server/global-radar/worker-auth";
import {
  globalRadarBatchProposalSchema,
  type SearchQuery,
} from "../app/domain/global-radar";
import type { DiscoveryConfig } from "../app/server/discovery-config";
import { createDiscoveryService } from "../app/server/discovery-service";
import { closeDb, getDb } from "../db/client";
import {
  globalEntities,
  globalRadarAdminEvents,
  globalRadarPromotions,
  globalRadarRuns,
  globalRadarSearchQueries,
  globalRadarSignalEntities,
  globalRadarSignals,
  globalRadarWatchlistEntries,
  globalSignalEvidence,
  globalSignalRequirements,
  globalSignalUpdates,
} from "../db/global-radar-schema";
import { createDiscoveryRepository } from "../db/repositories/discovery-repository";
import { createGlobalRadarRepository } from "../db/repositories/global-radar-repository";
import {
  candidateResearchVersions,
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryCandidateSources,
  discoveryRuns,
  users,
} from "../db/schema";
import {
  GLOBAL_RADAR_FICTIONAL_NOW,
  globalRadarFictionalFixtures,
} from "./fixtures/global-radar-fictional";
import { globalRadarTestEntity } from "./support/global-radar-test-data";
import { requireLocalTestDatabaseUrl } from "./support/acceptance-environment";

requireLocalTestDatabaseUrl(process.env.DATABASE_URL);

const database = getDb();
const ADMIN_ID = "70000000-0000-4000-8000-000000000019";
const ADMIN_EMAIL = "global-radar-acceptance-admin@example.test";
const ADMIN_ACTOR = { userId: ADMIN_ID, email: ADMIN_EMAIL } as const;
const RADAR_WORKER_SECRET =
  "radar-acceptance-worker-secret-distinct-and-longer-than-32-characters";
const DISCOVERY_WORKER_SECRET =
  "discovery-acceptance-worker-secret-distinct-and-longer-than-32-characters";
const DISCOVERY_CAMPAIGN = "global_radar_acceptance_india";
const DISCOVERY_CANDIDATE_URL =
  "https://saffron-navigation.example/about";
const ADMIN_NOTE = "Acceptance review recorded from the public evidence.";

const radarConfig: GlobalRadarConfig = {
  workerSecret: RADAR_WORKER_SECRET,
  countries: ["United Kingdom"],
  languages: ["en"],
  themes: ["autonomous_mobility_and_drones", "physical_ai_evaluation"],
  enabledSources: ["codex_public_web"],
  resultLimit: 10,
  thresholds: {
    direct_demand: 70,
    demand_precursor: 65,
    ecosystem_momentum: 70,
  },
};

const discoveryConfig: DiscoveryConfig = {
  campaignKey: DISCOVERY_CAMPAIGN,
  geographies: ["India"],
  companyCategories: ["autonomous mobility"],
  creatorCategories: ["robotics research"],
  totalCandidates: 1,
  companyPercentage: 100,
  enabledSources: ["codex_web"],
  workerSecret: DISCOVERY_WORKER_SECRET,
};

function at(iso: string): Date {
  return new Date(iso);
}

function executedQueries(
  queries: readonly SearchQuery[],
  executedAt: Date,
  withSourceError = false,
) {
  return queries.map((query, index) => ({
    ...query,
    executedAt: executedAt.toISOString(),
    resultsExamined: withSourceError && index === queries.length - 1 ? 0 : 2,
    error:
      withSourceError && index === queries.length - 1
        ? "Search request timed out."
        : null,
  }));
}

function partialDirectDemandProposal(input: {
  runId: string;
  planFingerprint: string;
  queries: readonly SearchQuery[];
  completedAt: Date;
}) {
  const fixture = structuredClone(
    globalRadarBatchProposalSchema.parse(
      globalRadarFictionalFixtures.indiaAutonomousNavigationDataDirectDemand
        .input,
    ),
  );
  const primarySignal = fixture.signals[0]!;
  const duplicateEntity = globalRadarTestEntity({
    entityRef: "entity-saffron-navigation-duplicate",
    canonicalName: "Saffron Navigation Research Duplicate",
    host: "saffron-navigation-duplicate",
    country: "United Kingdom",
    organisationType: "autonomy_company",
    sector: "autonomous mobility",
    group: "group:saffron-navigation-duplicate",
  });
  const duplicateEvidence = {
    ...primarySignal.evidence[0]!,
    contributorEntityRef: duplicateEntity.entityRef,
    sourceUrl:
      "https://saffron-navigation-duplicate.example/india-data-request",
    canonicalSourceUrl:
      "https://saffron-navigation-duplicate.example/india-data-request",
    sourceName: duplicateEntity.canonicalName,
    claim:
      "The duplicate fictional organisation seeks suppliers in India for autonomous-navigation data collection.",
    excerpt:
      "A second fictional public request names India for navigation data collection.",
    englishSummary:
      "The duplicate fictional organisation publicly requests Indian navigation-data suppliers.",
  };
  const duplicateSignal = {
    ...primarySignal,
    externalSignalId: "signal-saffron-india-navigation-data-duplicate",
    primaryEntityRef: duplicateEntity.entityRef,
    title: "Duplicate Saffron request for autonomous-navigation data",
    factualSummary:
      "A duplicate fictional organisation requests navigation observations on Indian roads.",
    evidence: [duplicateEvidence],
  };
  const queryOutcomes = executedQueries(
    input.queries,
    input.completedAt,
    true,
  );
  const failedQuery = queryOutcomes.at(-1)!;

  return {
    ...fixture,
    runId: input.runId,
    planFingerprint: input.planFingerprint,
    executedQueries: queryOutcomes,
    entities: [...fixture.entities, duplicateEntity],
    signals: [primarySignal, duplicateSignal],
    sourceErrors: [
      {
        sourceName: "Codex public web",
        message: "One public source did not respond before the timeout.",
        queryFingerprint: failedQuery.fingerprint,
      },
    ],
  };
}

function honestZeroProposal(input: {
  runId: string;
  planFingerprint: string;
  queries: readonly SearchQuery[];
  completedAt: Date;
}) {
  return {
    schemaVersion: "global-radar-batch-v1",
    promptVersion: "codex-public-web-v1",
    taxonomyVersion: "global-radar-v1",
    runId: input.runId,
    planFingerprint: input.planFingerprint,
    executedQueries: executedQueries(input.queries, input.completedAt),
    entities: [],
    signals: [],
    sourceErrors: [],
  };
}

function momentumProposal(input: {
  runId: string;
  planFingerprint: string;
  queries: readonly SearchQuery[];
  completedAt: Date;
}) {
  const fixture = structuredClone(
    globalRadarBatchProposalSchema.parse(
      globalRadarFictionalFixtures.multiOrganisationPhysicalAiPlatformMomentum
        .input,
    ),
  );
  return {
    ...fixture,
    runId: input.runId,
    planFingerprint: input.planFingerprint,
    executedQueries: executedQueries(input.queries, input.completedAt),
  };
}

async function radarGraphCounts() {
  const [
    [runs],
    [queries],
    [entities],
    [signals],
    [associations],
    [requirements],
    [evidence],
    [updates],
  ] = await Promise.all([
    database.select({ value: count() }).from(globalRadarRuns),
    database.select({ value: count() }).from(globalRadarSearchQueries),
    database.select({ value: count() }).from(globalEntities),
    database.select({ value: count() }).from(globalRadarSignals),
    database.select({ value: count() }).from(globalRadarSignalEntities),
    database.select({ value: count() }).from(globalSignalRequirements),
    database.select({ value: count() }).from(globalSignalEvidence),
    database.select({ value: count() }).from(globalSignalUpdates),
  ]);
  return {
    runs: runs!.value,
    queries: queries!.value,
    entities: entities!.value,
    signals: signals!.value,
    associations: associations!.value,
    requirements: requirements!.value,
    evidence: evidence!.value,
    updates: updates!.value,
  };
}

async function cleanupAcceptanceRows() {
  requireLocalTestDatabaseUrl(process.env.DATABASE_URL);

  await database.delete(globalRadarAdminEvents);
  await database.delete(globalSignalUpdates);
  await database.delete(globalRadarPromotions);
  await database.delete(globalSignalEvidence);
  await database.delete(globalSignalRequirements);
  await database.delete(globalRadarSignalEntities);
  await database.delete(globalRadarWatchlistEntries);
  await database.delete(globalRadarSignals);
  await database.delete(globalEntities);
  await database.delete(globalRadarSearchQueries);
  await database.delete(globalRadarRuns);

  const attributableRuns = await database
    .select({ id: discoveryRuns.id })
    .from(discoveryRuns)
    .where(
      or(
        eq(discoveryRuns.campaignKey, DISCOVERY_CAMPAIGN),
        eq(discoveryRuns.requestedByEmail, ADMIN_EMAIL),
      ),
    );
  const runIds = attributableRuns.map(({ id }) => id);
  const attributableCandidates = await database
    .select({ id: discoveryCandidates.id })
    .from(discoveryCandidates)
    .where(
      runIds.length > 0
        ? or(
            eq(discoveryCandidates.canonicalUrl, DISCOVERY_CANDIDATE_URL),
            inArray(discoveryCandidates.mostRecentRunId, runIds),
          )
        : eq(discoveryCandidates.canonicalUrl, DISCOVERY_CANDIDATE_URL),
    );
  const candidateIds = attributableCandidates.map(({ id }) => id);
  if (candidateIds.length > 0) {
    await database
      .delete(candidateResearchVersions)
      .where(inArray(candidateResearchVersions.candidateId, candidateIds));
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
    await database.delete(discoveryRuns).where(inArray(discoveryRuns.id, runIds));
  }
  await database.delete(users).where(eq(users.email, ADMIN_EMAIL));
}

function assertClaimedRadar(
  result: Awaited<
    ReturnType<
      ReturnType<typeof createGlobalRadarApplication>["run"]["claim"]
    >
  >,
) {
  if (result.outcome !== "claimed") {
    throw new Error(`Expected a claimed Radar run, received ${result.outcome}.`);
  }
  return result.claim;
}

describe("Global Demand Radar PostgreSQL acceptance", () => {
  beforeAll(async () => {
    await cleanupAcceptanceRows();
    await database.insert(users).values({
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      name: "Global Radar Acceptance Administrator",
    });
  });

  afterAll(async () => {
    try {
      await cleanupAcceptanceRows();
    } finally {
      await closeDb();
    }
  });

  it("keeps the complete Radar lifecycle durable and isolated from India Discovery", async () => {
    let currentTime = at(GLOBAL_RADAR_FICTIONAL_NOW);
    const radarLeaseTokens = [
      "radar-acceptance-partial-lease-token",
      "radar-acceptance-zero-lease-token",
      "radar-acceptance-momentum-lease-token",
    ];
    const radarRepository = createGlobalRadarRepository(database, {
      issueLeaseToken: () => {
        const token = radarLeaseTokens.shift();
        if (!token) throw new Error("Radar acceptance lease fixture exhausted.");
        return token;
      },
      hashLeaseToken: (token) =>
        hashGlobalRadarLeaseToken(RADAR_WORKER_SECRET, token),
    });
    const baseDependencies = createGlobalRadarApplicationDependencies({
      database,
      config: radarConfig,
      adminEmails: [ADMIN_EMAIL],
      now: () => currentTime,
      issueLeaseToken: () => "unused-composition-lease-token",
    });
    const radar = createGlobalRadarApplication({
      ...baseDependencies,
      runRepository: radarRepository,
      loadPlanningContext: (input) =>
        radarRepository.loadPlanningContext(input),
    });
    const discovery = createDiscoveryService({
      repository: createDiscoveryRepository(database),
      adminEmails: [ADMIN_EMAIL],
      workerSecret: DISCOVERY_WORKER_SECRET,
      config: discoveryConfig,
      now: () => currentTime,
      token: () => "discovery-acceptance-scheduled-lease-token",
    });

    expect(
      radar.run.authorizeWorker(`Bearer ${DISCOVERY_WORKER_SECRET}`),
    ).toBeNull();
    expect(
      discovery.authenticateWorker(`Bearer ${RADAR_WORKER_SECRET}`),
    ).toBe(false);
    const radarWorker = radar.run.authorizeWorker(
      `Bearer ${RADAR_WORKER_SECRET}`,
    );
    expect(radarWorker).toEqual({ scope: "global-radar-worker" });
    expect(
      discovery.authenticateWorker(`Bearer ${DISCOVERY_WORKER_SECRET}`),
    ).toBe(true);

    const queuedPartial = await radar.run.queueManual(ADMIN_ACTOR, {
      requestId: "70000000-0000-4000-8000-000000000101",
      theme: "autonomous_mobility_and_drones",
    });
    expect(queuedPartial).toMatchObject({
      outcome: "queued",
      run: { trigger: "manual", status: "queued" },
    });
    if (queuedPartial.outcome !== "queued") {
      throw new Error("Partial Radar acceptance run was not queued.");
    }

    currentTime = at("2026-07-31T00:00:01.000Z");
    const partialClaim = assertClaimedRadar(
      await radar.run.claim(radarWorker, {}),
    );
    expect(partialClaim.runId).toBe(queuedPartial.run.id);
    expect(partialClaim.config).toMatchObject({
      countries: ["United Kingdom"],
      languages: ["en"],
      enabledSources: ["codex_public_web"],
    });
    expect(partialClaim.config).not.toHaveProperty("campaignKey");
    expect(JSON.stringify(partialClaim)).not.toContain(RADAR_WORKER_SECRET);
    expect(JSON.stringify(partialClaim)).not.toContain(DISCOVERY_WORKER_SECRET);

    currentTime = at("2026-07-31T00:00:02.000Z");
    const discoveryClaim = await discovery.claimRun("scheduled");
    expect(discoveryClaim).toMatchObject({
      ok: true,
      claimed: true,
      promptVersion: "codex-web-v1",
      config: {
        campaignKey: DISCOVERY_CAMPAIGN,
        geographies: ["India"],
        allocation: { companies: 1, creators: 0 },
      },
    });
    if (!discoveryClaim.ok || !discoveryClaim.claimed) {
      throw new Error("India Discovery scheduled run was not claimed.");
    }
    expect(discoveryClaim.config).not.toHaveProperty("thresholds");
    expect(JSON.stringify(discoveryClaim)).not.toContain(RADAR_WORKER_SECRET);
    expect(JSON.stringify(discoveryClaim)).not.toContain(
      DISCOVERY_WORKER_SECRET,
    );
    expect(discoveryClaim.runId).not.toBe(partialClaim.runId);

    currentTime = at("2026-07-31T00:00:03.000Z");
    const partialBatch = partialDirectDemandProposal({
      runId: partialClaim.runId,
      planFingerprint: partialClaim.plan.fingerprint,
      queries: partialClaim.queries,
      completedAt: currentTime,
    });
    const completedPartial = await radar.run.complete(radarWorker, {
      runId: partialClaim.runId,
      leaseToken: partialClaim.leaseToken,
      batch: partialBatch,
    });
    expect(completedPartial).toMatchObject({
      outcome: "completed",
      run: {
        id: partialClaim.runId,
        status: "partial",
        counts: {
          signalsFound: 2,
          directDemands: 2,
          sourceErrors: 1,
        },
        notices: [
          {
            code: "source_errors",
            message: "One or more public sources could not be processed.",
            count: 1,
          },
        ],
      },
    });

    const beforeReplay = await radarGraphCounts();
    currentTime = at("2026-07-31T00:00:04.000Z");
    const replayedPartial = await radar.run.complete(radarWorker, {
      runId: partialClaim.runId,
      leaseToken: partialClaim.leaseToken,
      batch: partialBatch,
    });
    expect(replayedPartial).toMatchObject({
      outcome: "replayed",
      run: { id: partialClaim.runId, status: "partial" },
    });
    expect(await radarGraphCounts()).toEqual(beforeReplay);

    const queuedZero = await radar.run.queueManual(ADMIN_ACTOR, {
      requestId: "70000000-0000-4000-8000-000000000102",
      theme: "autonomous_mobility_and_drones",
    });
    if (queuedZero.outcome !== "queued") {
      throw new Error("Honest-zero Radar acceptance run was not queued.");
    }
    currentTime = at("2026-07-31T00:00:05.000Z");
    const zeroClaim = assertClaimedRadar(
      await radar.run.claim(radarWorker, {}),
    );
    expect(zeroClaim.runId).toBe(queuedZero.run.id);
    expect(zeroClaim.runId).not.toBe(discoveryClaim.runId);
    const [stillRunningDiscovery] = await database
      .select({ status: discoveryRuns.status })
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, discoveryClaim.runId));
    expect(stillRunningDiscovery).toEqual({ status: "running" });

    currentTime = at("2026-07-31T00:00:06.000Z");
    const completedZero = await radar.run.complete(radarWorker, {
      runId: zeroClaim.runId,
      leaseToken: zeroClaim.leaseToken,
      batch: honestZeroProposal({
        runId: zeroClaim.runId,
        planFingerprint: zeroClaim.plan.fingerprint,
        queries: zeroClaim.queries,
        completedAt: currentTime,
      }),
    });
    expect(completedZero).toMatchObject({
      outcome: "completed",
      run: {
        status: "succeeded",
        counts: {
          entitiesObserved: 0,
          signalsFound: 0,
          directDemands: 0,
          precursors: 0,
          momentumRecords: 0,
          sourceErrors: 0,
        },
        notices: [],
      },
    });

    currentTime = at("2026-07-31T00:00:07.000Z");
    const discoveryCompletedAt = new Date(currentTime.getTime());
    const completedDiscovery = await discovery.completeRun(
      discoveryClaim.runId,
      {
        runId: discoveryClaim.runId,
        leaseToken: discoveryClaim.leaseToken,
        promptVersion: discoveryClaim.promptVersion,
        candidates: [
          {
            type: "company",
            name: "Saffron Navigation Research",
            canonicalUrl: DISCOVERY_CANDIDATE_URL,
            websiteUrl: DISCOVERY_CANDIDATE_URL,
            discoveredDescription:
              "A fictional India-relevant autonomy organisation used only for acceptance testing.",
            category: "autonomous mobility",
            geography: "India",
            sourceName: "Acceptance public registry",
            sourceUrl:
              "https://acceptance-public-registry.example/saffron-navigation",
            discoveryScore: 95,
            rawMetadata: { fixture: "global-radar-acceptance" },
          },
        ],
        sourceErrors: [],
      },
    );
    expect(completedDiscovery).toMatchObject({
      ok: true,
      outcome: "completed",
      run: { id: discoveryClaim.runId, status: "succeeded" },
    });
    const [discoveryCandidate] = await database
      .select()
      .from(discoveryCandidates)
      .where(eq(discoveryCandidates.canonicalUrl, DISCOVERY_CANDIDATE_URL));
    if (!discoveryCandidate) {
      throw new Error("Discovery acceptance candidate was not persisted.");
    }
    currentTime = at("2026-07-31T00:00:08.000Z");
    const shortlisted = await discovery.updateCandidateStatus(
      ADMIN_ACTOR,
      discoveryCandidate.id,
      {
        status: "shortlisted",
        expectedUpdatedAt: discoveryCandidate.updatedAt.toISOString(),
      },
    );
    expect(shortlisted).toMatchObject({
      ok: true,
      candidate: {
        id: discoveryCandidate.id,
        status: "shortlisted",
        discoveryScore: 95,
      },
    });

    const queuedMomentum = await radar.run.queueManual(ADMIN_ACTOR, {
      requestId: "70000000-0000-4000-8000-000000000103",
      theme: "physical_ai_evaluation",
    });
    if (queuedMomentum.outcome !== "queued") {
      throw new Error("Momentum Radar acceptance run was not queued.");
    }
    currentTime = at("2026-07-31T00:00:09.000Z");
    const momentumClaim = assertClaimedRadar(
      await radar.run.claim(radarWorker, {}),
    );
    currentTime = at("2026-07-31T00:00:10.000Z");
    const completedMomentum = await radar.run.complete(radarWorker, {
      runId: momentumClaim.runId,
      leaseToken: momentumClaim.leaseToken,
      batch: momentumProposal({
        runId: momentumClaim.runId,
        planFingerprint: momentumClaim.plan.fingerprint,
        queries: momentumClaim.queries,
        completedAt: currentTime,
      }),
    });
    expect(completedMomentum).toMatchObject({
      outcome: "completed",
      run: {
        status: "succeeded",
        counts: { momentumRecords: 1, sourceErrors: 0 },
      },
    });
    const [storedMomentum] = await database
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.signalClass, "ecosystem_momentum"));
    expect(storedMomentum).toMatchObject({
      momentumIndependentEntityCount: 2,
      momentumPrimarySourceCount: 2,
      momentumSourceFamilyCount: 2,
      momentumQualificationGatesPassed: true,
    });
    if (!storedMomentum) {
      throw new Error("Momentum acceptance signal was not persisted.");
    }
    const momentumContributors = await database
      .select({ globalEntityId: globalRadarSignalEntities.globalEntityId })
      .from(globalRadarSignalEntities)
      .where(eq(globalRadarSignalEntities.signalId, storedMomentum.id));
    expect(new Set(momentumContributors.map(({ globalEntityId }) => globalEntityId)).size)
      .toBe(2);

    const directSummary = await radar.admin.getClassSummary(ADMIN_ACTOR, {
      signalClass: "direct_demand",
      filters: { page: 1 },
    });
    expect(directSummary).toMatchObject({
      outcome: "listed",
      total: 2,
      hasAnySignals: true,
      metrics: {
        class: { total: 2 },
        sourceErrors: 1,
      },
    });
    if (directSummary.outcome !== "listed") {
      throw new Error("Direct-demand acceptance list was unavailable.");
    }
    const primaryListItem = directSummary.items.find(
      ({ organisation }) =>
        organisation?.canonicalName === "Saffron Navigation Research",
    );
    const duplicateListItem = directSummary.items.find(
      ({ organisation }) =>
        organisation?.canonicalName ===
        "Saffron Navigation Research Duplicate",
    );
    if (!primaryListItem?.organisation || !duplicateListItem?.organisation) {
      throw new Error("Direct-demand acceptance signals were not listed.");
    }
    const detail = await radar.admin.getSignalDetail(
      ADMIN_ACTOR,
      primaryListItem.id,
    );
    expect(detail).toMatchObject({
      outcome: "found",
      detail: {
        id: primaryListItem.id,
        revision: 0,
        signalClass: "direct_demand",
        status: "newly_discovered",
        sections: expect.arrayContaining([
          { id: "organisation", title: "Organisation" },
          { id: "supporting_evidence", title: "Supporting evidence" },
          { id: "admin_notes_and_actions", title: "Admin notes and actions" },
        ]),
      },
    });
    if (detail.outcome !== "found") {
      throw new Error("Direct-demand acceptance detail was unavailable.");
    }
    expect(detail.detail.sections).toHaveLength(20);
    expect(JSON.stringify(detail)).not.toMatch(
      /leaseTokenHash|submissionHash|rawMetadata|workerSecret/u,
    );

    const beforeMerge = await radarGraphCounts();
    const duplicateRequirementsBefore = await database
      .select({ id: globalSignalRequirements.id })
      .from(globalSignalRequirements)
      .where(eq(globalSignalRequirements.signalId, duplicateListItem.id));
    const duplicateEvidenceBefore = await database
      .select({ id: globalSignalEvidence.id })
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, duplicateListItem.id));
    currentTime = at("2026-07-31T00:00:11.000Z");
    const merged = await radar.admin.mergeSignals(ADMIN_ACTOR, {
      survivorSignalId: primaryListItem.id,
      duplicateSignalId: duplicateListItem.id,
      expectedSurvivorRevision: 0,
      expectedDuplicateRevision: 0,
      confirmed: true,
      idempotencyKey: "70000000-0000-4000-8000-000000000201",
      reason: "Confirmed duplicate fictional public signal.",
    });
    expect(merged).toMatchObject({
      outcome: "merged",
      survivor: { id: primaryListItem.id, revision: 1 },
      duplicate: {
        id: duplicateListItem.id,
        revision: 1,
        status: "newly_discovered",
      },
    });
    const afterMerge = await radarGraphCounts();
    expect(afterMerge).toMatchObject({
      entities: beforeMerge.entities,
      signals: beforeMerge.signals,
      requirements: beforeMerge.requirements,
      evidence: beforeMerge.evidence,
    });
    expect(
      await database
        .select({ id: globalSignalRequirements.id })
        .from(globalSignalRequirements)
        .where(eq(globalSignalRequirements.signalId, duplicateListItem.id)),
    ).toEqual(duplicateRequirementsBefore);
    expect(
      await database
        .select({ id: globalSignalEvidence.id })
        .from(globalSignalEvidence)
        .where(eq(globalSignalEvidence.signalId, duplicateListItem.id)),
    ).toEqual(duplicateEvidenceBefore);
    const [mergedDuplicate] = await database
      .select({ mergedIntoSignalId: globalRadarSignals.mergedIntoSignalId })
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, duplicateListItem.id));
    expect(mergedDuplicate).toEqual({ mergedIntoSignalId: primaryListItem.id });

    currentTime = at("2026-07-31T00:00:12.000Z");
    const note = await radar.admin.appendNote(
      ADMIN_ACTOR,
      primaryListItem.id,
      {
        expectedRevision: 1,
        idempotencyKey: "70000000-0000-4000-8000-000000000202",
        reason: "Record the acceptance review decision.",
        body: ADMIN_NOTE,
      },
    );
    expect(note).toEqual({ outcome: "appended", revision: 2 });
    expect(JSON.stringify(note)).not.toContain(ADMIN_NOTE);

    currentTime = at("2026-07-31T00:00:13.000Z");
    const appendedEvidence = await radar.admin.appendEvidence(
      ADMIN_ACTOR,
      primaryListItem.id,
      {
        expectedRevision: 2,
        idempotencyKey: "70000000-0000-4000-8000-000000000203",
        reason: "Append a dated public acceptance follow-up.",
        evidence: {
          globalEntityId: primaryListItem.organisation.id,
          sourceUrl:
            "https://saffron-navigation.example/public-follow-up?utm_source=acceptance",
          canonicalSourceUrl:
            "https://client-proposal.example/non-authoritative",
          sourceName: "Saffron Navigation Research",
          sourceType: "official_update",
          sourceLanguage: "en",
          sourceCountry: "United Kingdom",
          sourceFamily: "official_company_material",
          claim:
            "Saffron published a dated follow-up to its fictional public navigation-data request.",
          sourceExcerpt: "A dated fictional public follow-up.",
          englishSummary:
            "Saffron published a follow-up to the fictional navigation-data request.",
          publishedAt: "2026-07-30T12:00:00.000Z",
          observedAt: "2026-07-31T00:00:12.000Z",
          evidenceConfidence: 90,
          translationConfidence: null,
          isPrimarySource: true,
          isSyndicated: false,
          supportsDirectDemand: true,
          supportsIndiaRelevance: true,
          supportedFieldPaths: ["signal.factualSummary"],
          rawMetadata: { clientControlled: "must not persist" },
        },
      },
    );
    expect(appendedEvidence).toEqual({ outcome: "appended", revision: 3 });
    const notes = await database
      .select()
      .from(globalSignalUpdates)
      .where(eq(globalSignalUpdates.updateType, "note_appended"));
    expect(notes).toMatchObject([{ signalId: primaryListItem.id, reason: ADMIN_NOTE }]);
    const primaryEvidence = await database
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, primaryListItem.id));
    expect(primaryEvidence).toHaveLength(2);
    expect(primaryEvidence.map(({ canonicalSourceUrl }) => canonicalSourceUrl))
      .toContain("https://saffron-navigation.example/public-follow-up");
    expect(JSON.stringify(primaryEvidence)).not.toContain("clientControlled");

    currentTime = at("2026-07-31T00:00:14.000Z");
    const staleReview = await radar.admin.reviewSignal(
      ADMIN_ACTOR,
      primaryListItem.id,
      {
        expectedRevision: 1,
        idempotencyKey: "70000000-0000-4000-8000-000000000204",
        reason: "Prove stale review conflict behavior.",
        command: { type: "request_review" },
      },
    );
    expect(staleReview).toMatchObject({
      outcome: "conflict",
      reason: "revision_mismatch",
      httpStatus: 409,
      latest: { id: primaryListItem.id, revision: 3 },
    });
    expect(JSON.stringify(staleReview)).not.toMatch(
      /leaseTokenHash|submissionHash|rawMetadata|workerSecret/u,
    );

    const requestedReview = await radar.admin.reviewSignal(
      ADMIN_ACTOR,
      primaryListItem.id,
      {
        expectedRevision: 3,
        idempotencyKey: "70000000-0000-4000-8000-000000000205",
        reason: "Move the evidence-backed signal into review.",
        command: { type: "request_review" },
      },
    );
    expect(requestedReview).toMatchObject({
      outcome: "updated",
      detail: { revision: 4, status: "needs_review" },
    });
    const qualified = await radar.admin.reviewSignal(
      ADMIN_ACTOR,
      primaryListItem.id,
      {
        expectedRevision: 4,
        idempotencyKey: "70000000-0000-4000-8000-000000000206",
        reason: "Qualify only after the public evidence review.",
        command: { type: "qualify" },
      },
    );
    expect(qualified).toMatchObject({
      outcome: "updated",
      detail: { revision: 5, status: "qualified" },
    });
    const editedExpiry = await radar.admin.editExpiry(
      ADMIN_ACTOR,
      primaryListItem.id,
      {
        expectedRevision: 5,
        idempotencyKey: "70000000-0000-4000-8000-000000000207",
        reason: "Record the verified fictional request deadline.",
        expiry: {
          evergreen: false,
          expiresAt: "2026-08-15T00:00:00.000Z",
          reobserveBy: null,
        },
      },
    );
    expect(editedExpiry).toMatchObject({
      outcome: "updated",
      detail: { revision: 6, status: "qualified" },
    });

    currentTime = at("2026-07-31T00:00:15.000Z");
    const [entityBeforeWatchlist] = await database
      .select()
      .from(globalEntities)
      .where(eq(globalEntities.id, primaryListItem.organisation.id));
    if (!entityBeforeWatchlist) {
      throw new Error("Primary Global Radar entity was not persisted.");
    }
    const watchlisted = await radar.admin.upsertWatchlist(ADMIN_ACTOR, {
      entity: {
        type: "existing",
        entityId: entityBeforeWatchlist.id,
        expectedRevision: entityBeforeWatchlist.revision,
      },
      expectedEntryRevision: null,
      idempotencyKey: "70000000-0000-4000-8000-000000000208",
      reason: "Monitor the fictional public request through its deadline.",
      configuration: {
        state: "enabled",
        priority: 90,
        theme: "autonomous_mobility_and_drones",
        category: "autonomy_data_buyers",
        categorySearchTermEn: "autonomous navigation data buyers",
        categorySearchTermZhCn: null,
        countries: ["United Kingdom"],
        languages: ["en"],
        cadenceDays: 7,
        nextScanAt: "2026-08-07T00:00:00.000Z",
      },
    });
    expect(watchlisted).toMatchObject({
      outcome: "created",
      entity: {
        id: entityBeforeWatchlist.id,
        entityStatus: "watchlisted",
        revision: entityBeforeWatchlist.revision + 1,
      },
      entry: { state: "enabled", priority: 90, revision: 0 },
    });
    const watchlist = await radar.admin.listWatchlist(ADMIN_ACTOR, { page: 1 });
    expect(watchlist).toMatchObject({
      outcome: "listed",
      total: 1,
      entries: [
        {
          globalEntityId: entityBeforeWatchlist.id,
          state: "enabled",
          latestSignal: { id: primaryListItem.id, status: "qualified" },
        },
      ],
    });

    currentTime = at("2026-07-31T00:00:16.000Z");
    const [entityBeforePromotion] = await database
      .select()
      .from(globalEntities)
      .where(eq(globalEntities.id, entityBeforeWatchlist.id));
    const [signalBeforePromotion] = await database
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, primaryListItem.id));
    if (!entityBeforePromotion || !signalBeforePromotion) {
      throw new Error("Promotion revisions were not available.");
    }
    const promoted = await radar.admin.promote(ADMIN_ACTOR, {
      entityId: entityBeforePromotion.id,
      primarySignalId: signalBeforePromotion.id,
      supportingSignalIds: [],
      eligibilityPath: "qualified_india_direct_demand",
      expectedEntityRevision: entityBeforePromotion.revision,
      expectedPrimarySignalRevision: signalBeforePromotion.revision,
      expectedSupportingSignalRevisions: [],
      idempotencyKey: "70000000-0000-4000-8000-000000000209",
      reason: "Approve the evidence-backed candidate intake.",
      rationale:
        "The fictional direct-demand signal is qualified and explicitly India relevant.",
    });
    expect(promoted).toMatchObject({
      outcome: "promoted",
      promotion: {
        status: "active",
        globalEntityId: entityBeforePromotion.id,
        primarySignalId: signalBeforePromotion.id,
        discoveryCandidateId: discoveryCandidate.id,
      },
    });
    const [candidateAfterPromotion] = await database
      .select()
      .from(discoveryCandidates)
      .where(eq(discoveryCandidates.id, discoveryCandidate.id));
    expect(candidateAfterPromotion).toMatchObject({
      status: "shortlisted",
      discoveryScore: 95,
    });
    expect(
      await database
        .select({ id: discoveryCandidates.id })
        .from(discoveryCandidates)
        .where(eq(discoveryCandidates.canonicalUrl, DISCOVERY_CANDIDATE_URL)),
    ).toHaveLength(1);

    currentTime = at("2026-07-31T00:00:17.000Z");
    const [entityAfterPromotion] = await database
      .select()
      .from(globalEntities)
      .where(eq(globalEntities.id, entityBeforePromotion.id));
    const [signalAfterPromotion] = await database
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signalBeforePromotion.id));
    if (!entityAfterPromotion || !signalAfterPromotion) {
      throw new Error("Promoted Radar revisions were not persisted.");
    }
    const reversed = await radar.admin.reversePromotion(ADMIN_ACTOR, {
      entityId: entityAfterPromotion.id,
      expectedEntityRevision: entityAfterPromotion.revision,
      expectedPrimarySignalRevision: signalAfterPromotion.revision,
      idempotencyKey: "70000000-0000-4000-8000-000000000210",
      reason: "Reverse the acceptance-only promotion without deleting intake.",
    });
    expect(reversed).toMatchObject({
      outcome: "reversed",
      promotion: {
        status: "reversed",
        discoveryCandidateId: discoveryCandidate.id,
      },
    });
    const [candidateAfterReversal] = await database
      .select()
      .from(discoveryCandidates)
      .where(eq(discoveryCandidates.id, discoveryCandidate.id));
    expect(candidateAfterReversal).toMatchObject({
      status: "shortlisted",
      discoveryScore: 95,
    });

    const [promotionRun] = await database
      .select()
      .from(discoveryRuns)
      .where(
        and(
          eq(discoveryRuns.trigger, "radar_promotion"),
          eq(discoveryRuns.requestedByEmail, ADMIN_EMAIL),
        ),
      );
    expect(promotionRun).toMatchObject({
      campaignKey: "general_discovery",
      status: "succeeded",
      leaseTokenHash: null,
      leaseExpiresAt: null,
      submissionHash: null,
      requestedByEmail: ADMIN_EMAIL,
    });
    const noDiscoveryWork = await discovery.claimRun("scheduled");
    expect(noDiscoveryWork).toEqual({ ok: true, claimed: false });
    const discoverySummary = await discovery.getAdminSummary(ADMIN_ACTOR);
    expect(discoverySummary).toMatchObject({
      ok: true,
      snapshot: {
        summary: {
          latestRunStatus: "succeeded",
          latestRunCompletedAt: discoveryCompletedAt,
        },
        runs: expect.arrayContaining([
          { id: discoveryClaim.runId, trigger: "scheduled" },
          { trigger: "radar_promotion", status: "succeeded" },
        ]),
      },
    });

    expect(
      await database
        .select({ id: globalRadarRuns.id })
        .from(globalRadarRuns)
        .where(eq(globalRadarRuns.id, discoveryClaim.runId)),
    ).toEqual([]);
    expect(
      await database
        .select({ id: discoveryRuns.id })
        .from(discoveryRuns)
        .where(inArray(discoveryRuns.id, [
          partialClaim.runId,
          zeroClaim.runId,
          momentumClaim.runId,
        ])),
    ).toEqual([]);

    currentTime = at("2026-08-15T00:00:00.000Z");
    expect(await radarRepository.expireDirectDemand({ now: currentTime }))
      .toEqual({ outcome: "completed", expired: 1 });
    const expired = await radar.admin.getSignalDetail(
      ADMIN_ACTOR,
      primaryListItem.id,
    );
    expect(expired).toMatchObject({
      outcome: "found",
      detail: { id: primaryListItem.id, status: "expired" },
    });
    expect(await radarRepository.expireDirectDemand({ now: currentTime }))
      .toEqual({ outcome: "completed", expired: 0 });
  });
});

describe("Global Demand Radar release-suite selection", () => {
  it("keeps the database acceptance journey in the exact guarded suites", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    const scripts = packageJson.scripts;

    for (const excluded of [
      "tests/db.integration.test.ts",
      "tests/global-radar-schema.integration.test.ts",
      "tests/global-radar-db.integration.test.ts",
      "tests/global-radar-promotion-db.integration.test.ts",
      "tests/global-radar.acceptance.integration.test.ts",
      "tests/product-v1.acceptance.integration.test.ts",
      "tests/discovery.acceptance.integration.test.ts",
      "tests/opportunity-brief-repository.integration.test.ts",
      "tests/opportunity-brief.acceptance.integration.test.ts",
      "tests/migration-harness-forward-compat.test.mjs",
      "tests/e2e/**",
    ]) {
      expect(scripts["test:unit"], excluded).toContain(excluded);
    }
    for (const databaseTest of [
      "tests/db.integration.test.ts",
      "tests/product-v1.acceptance.integration.test.ts",
      "tests/discovery.acceptance.integration.test.ts",
      "tests/opportunity-brief-repository.integration.test.ts",
      "tests/opportunity-brief.acceptance.integration.test.ts",
      "tests/global-radar-schema.integration.test.ts",
      "tests/global-radar-db.integration.test.ts",
      "tests/global-radar-promotion-db.integration.test.ts",
    ]) {
      expect(scripts["test:db"], databaseTest).toContain(databaseTest);
    }
    expect(scripts["test:db"]).not.toContain(
      "tests/global-radar.acceptance.integration.test.ts",
    );
    for (const acceptanceTest of [
      "tests/product-v1.acceptance.integration.test.ts",
      "tests/discovery.acceptance.integration.test.ts",
      "tests/opportunity-brief-repository.integration.test.ts",
      "tests/opportunity-brief.acceptance.integration.test.ts",
      "tests/global-radar.acceptance.integration.test.ts",
    ]) {
      expect(scripts["test:acceptance"], acceptanceTest).toContain(
        acceptanceTest,
      );
    }
    expect(scripts["test:e2e"]).toBe(
      "playwright test tests/e2e/product-v1.spec.ts tests/e2e/mobile-pwa.spec.ts tests/e2e/opportunity-brief.spec.ts tests/e2e/global-radar.spec.ts",
    );
    expect(scripts["test:migrations"]).toBe(
      "npm run db:start && npm run test:migrations:forward && node scripts/test-migrations.mjs",
    );
    expect(scripts["test:migrations:forward"]).toBe(
      "node --test tests/migration-harness-forward-compat.test.mjs",
    );
    expect(scripts.typecheck).toBe("tsc --noEmit");
    for (const context of ["discovery", "global-radar"] as const) {
      for (const command of [
        "claim",
        "validate",
        "submit",
        "fail",
        "abandon",
      ] as const) {
        expect(scripts[`${context}:${command}`]).toBeTypeOf("string");
      }
    }
  });
});
