import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeDb, getDb } from "../db/client";
import * as radarSchema from "../db/global-radar-schema";
import {
  globalEntities,
  globalRadarAdminEvents,
  globalRadarPromotions,
  globalRadarRuns,
  globalRadarSignalEntities,
  globalRadarSignals,
  globalRadarWatchlistEntries,
  globalSignalEvidence,
  globalSignalRequirements,
  globalSignalUpdates,
} from "../db/global-radar-schema";
import { createDiscoveryRepository } from "../db/repositories/discovery-repository";
import { createGlobalRadarPromotionRepository } from "../db/repositories/global-radar-promotion-repository";
import * as coreSchema from "../db/schema";
import {
  candidateResearchVersions,
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryCandidateSources,
  discoveryRuns,
  users,
} from "../db/schema";
import { requireLocalTestDatabaseUrl } from "./support/acceptance-environment";

requireLocalTestDatabaseUrl(process.env.DATABASE_URL);

const db = getDb();
const concurrentClient = postgres(process.env.DATABASE_URL!, {
  max: 1,
  prepare: false,
  connect_timeout: 5,
  idle_timeout: 0,
});
const concurrentDb = drizzle(concurrentClient, {
  schema: { ...coreSchema, ...radarSchema },
});
const scope = randomUUID();
const actorEmail = `radar-promotion-${scope}@example.test`;
let actorUserId = "";
let sequence = 0;

const configuration = {
  scoreVersion: "global-radar-score-v1" as const,
  thresholds: {
    direct_demand: 70,
    demand_precursor: 65,
    ecosystem_momentum: 70,
  },
};

function hash(value: string): string {
  return createHash("sha256").update(`${scope}:${value}`).digest("hex");
}

function nextIdempotencyKey(): string {
  return randomUUID();
}

async function cleanPromotionRows() {
  await db.delete(globalRadarAdminEvents);
  await db.delete(globalSignalUpdates);
  await db.delete(globalRadarPromotions);
  await db.delete(globalSignalEvidence);
  await db.delete(globalSignalRequirements);
  await db.delete(globalRadarSignalEntities);
  await db.delete(globalRadarWatchlistEntries);
  await db.delete(globalRadarSignals);
  await db.delete(globalEntities);
  await db.delete(globalRadarRuns);
  await db.delete(candidateResearchVersions);
  await db.delete(discoveryCandidateSources);
  await db.delete(discoveryCandidateIdentifiers);
  await db.delete(discoveryCandidates);
  await db.delete(discoveryRuns);
  await db.delete(users).where(eq(users.email, actorEmail));
}

beforeEach(async () => {
  await cleanPromotionRows();
  const [actor] = await db
    .insert(users)
    .values({ email: actorEmail, name: "Radar Promotion Administrator" })
    .returning({ id: users.id });
  if (!actor) throw new Error("Promotion test administrator was not created.");
  actorUserId = actor.id;
});

afterAll(async () => {
  try {
    await cleanPromotionRows();
  } finally {
    await Promise.all([closeDb(), concurrentClient.end({ timeout: 5 })]);
  }
});

type SeedOptions = Readonly<{
  organisationType?: string;
  entityStatus?: "observed" | "monitoring" | "qualified";
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  primaryClass?: "direct_demand" | "demand_precursor";
  primaryIndiaRelevance?:
    | "explicit_India"
    | "existing_India_presence"
    | "globally_open"
    | "no_current_India_fit";
  primaryEvidenceSupportsIndia?: boolean;
  primarySourceUrls?: readonly string[];
  repeatedSignalCount?: number;
}>;

async function seedPromotionFixture(options: SeedOptions = {}) {
  sequence += 1;
  const suffix = `${sequence}-${scope}`;
  const now = new Date("2026-07-31T06:00:00.000Z");
  const [radarRun] = await db
    .insert(globalRadarRuns)
    .values({
      externalRunKey: `promotion-fixture:${suffix}`,
      requestHash: hash(`request:${suffix}`),
      trigger: "scheduled",
      scanMode: "daily",
      status: "queued",
      planFingerprint: hash(`plan:${suffix}`),
      planSnapshot: {},
      sourceCountries: ["United States"],
      sourceLanguages: ["en"],
      targetDomains: ["robot_learning_and_manipulation"],
      targetSignalTypes: ["data_collection_request"],
      sourcesUsed: ["official_company_material"],
      promptVersion: "global-radar-codex-web-v1",
      schemaVersion: "global-radar-schema-v1",
      taxonomyVersion: "global-radar-v1",
      scoringVersion: configuration.scoreVersion,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!radarRun) throw new Error("Promotion Radar run was not created.");

  const websiteUrl =
    options.websiteUrl === undefined
      ? `https://promotion-${sequence}.example`
      : options.websiteUrl;
  const [entity] = await db
    .insert(globalEntities)
    .values({
      canonicalName: `Promotion Entity ${sequence}`,
      normalizedName: `promotion entity ${sequence}`,
      canonicalDomain: websiteUrl ? new URL(websiteUrl).hostname : null,
      websiteUrl,
      linkedinUrl: options.linkedinUrl ?? null,
      stablePublicIdentifiers: [`fixture:${suffix}`],
      publicIdentityAnchor: hash(`entity:${suffix}`),
      headquartersCountry: "United States",
      headquartersCity: "Austin",
      operatingCountries: ["United States", "India"],
      organisationType: options.organisationType ?? "robotics_company",
      sector: "robotics",
      shortDescription: "Builds evidence-backed public robotics systems.",
      entityStatus: options.entityStatus ?? "qualified",
      firstSeenAt: now,
      lastSeenAt: now,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!entity) throw new Error("Promotion entity was not created.");

  const primaryClass = options.primaryClass ?? "direct_demand";
  const signalCount = Math.max(1, options.repeatedSignalCount ?? 1);
  const signals = [];
  for (let index = 0; index < signalCount; index += 1) {
    const signalClass = index === 0 ? primaryClass : "demand_precursor";
    const observedAt = new Date(now.getTime() - index * 24 * 60 * 60 * 1_000);
    const [signal] = await db
      .insert(globalRadarSignals)
      .values({
        globalEntityId: entity.id,
        signalClass,
        demandDomain: "robot_learning_and_manipulation",
        signalType:
          signalClass === "direct_demand"
            ? "data_collection_request"
            : "research_or_hiring_pattern",
        title: `Qualified promotion signal ${index + 1}`,
        factualSummary:
          "The organisation published evidence of a current robotics requirement.",
        interpretationSummary:
          "The public evidence supports a bounded Radar qualification decision.",
        theme: "robot_teleoperation_demonstrations",
        sourceCountry: "United States",
        targetGeographies: ["India"],
        collectionGeographies: ["India"],
        industry: "robotics",
        targetCapabilityTags: ["teleoperated_trajectories"],
        requiredCounterpartyArchetypes: ["robotics_data_company"],
        indiaRelevanceType:
          index === 0
            ? (options.primaryIndiaRelevance ?? "explicit_India")
            : "inferred_India_compatible",
        indiaRelevanceRationale:
          "Public evidence supports India-compatible execution.",
        indiaFitReasons: ["India is compatible with the published scope."],
        indiaFitConstraints: [],
        indiaFitUnknowns: [],
        indiaFitConfidence: 90,
        demandExplicitness: signalClass === "direct_demand" ? 90 : null,
        evidenceConfidence: 90,
        freshness: signalClass === "direct_demand" ? 90 : null,
        actionability: signalClass === "direct_demand" ? 90 : null,
        indiaFit: signalClass === "direct_demand" ? 90 : null,
        commercialPotential: signalClass === "direct_demand" ? 90 : null,
        repeatability: signalClass === "direct_demand" ? 80 : null,
        responseAccessibility: signalClass === "direct_demand" ? 80 : null,
        strategicLearning: signalClass === "direct_demand" ? 80 : null,
        complianceComplexity: signalClass === "direct_demand" ? 20 : null,
        proximityToExternalDemand:
          signalClass === "demand_precursor" ? 80 : null,
        fundingDeploymentMomentum:
          signalClass === "demand_precursor" ? 80 : null,
        likelyDataHardwareIntensity:
          signalClass === "demand_precursor" ? 80 : null,
        estimatedTimeHorizon:
          signalClass === "demand_precursor" ? 80 : null,
        strategicRelevance: signalClass === "demand_precursor" ? 80 : null,
        directDemandScore: signalClass === "direct_demand" ? 88 : null,
        precursorScore: signalClass === "demand_precursor" ? 82 : null,
        scoreCoverage: 100,
        scorePolicyVersion: configuration.scoreVersion,
        announcedAt: signalClass === "direct_demand" ? observedAt : null,
        effectiveFrom: signalClass === "direct_demand" ? observedAt : null,
        expiresAt:
          signalClass === "direct_demand"
            ? new Date("2026-12-31T00:00:00.000Z")
            : null,
        evergreen: signalClass === "direct_demand" ? false : null,
        reobserveBy: null,
        observedAt,
        status: "qualified",
        sourceLanguage: "en",
        extractionMethod: "codex_public_web",
        taxonomyVersion: "global-radar-v1",
        rawMetadata: {},
        dedupeKey: hash(`signal:${suffix}:${index}`),
        dedupeVersion: "global-radar-dedupe-v1",
        revision: 0,
        firstRunId: radarRun.id,
        mostRecentRunId: radarRun.id,
        firstSeenAt: observedAt,
        lastSeenAt: observedAt,
        createdAt: observedAt,
        updatedAt: observedAt,
      })
      .returning();
    if (!signal) throw new Error("Promotion signal was not created.");
    signals.push(signal);
  }

  const sourceUrls =
    options.primarySourceUrls ??
    ([`https://source-${sequence}.example/public-requirement`] as const);
  for (const [index, sourceUrl] of sourceUrls.entries()) {
    await db.insert(globalSignalEvidence).values({
      signalId: signals[0]!.id,
      runId: radarRun.id,
      globalEntityId: entity.id,
      sourceUrl,
      canonicalSourceUrl: sourceUrl,
      sourceName: `Official source ${index + 1}`,
      sourceType: "official_request",
      sourceLanguage: "en",
      sourceCountry: "United States",
      sourceFamily: "official_company_material",
      evidenceClaim: "The organisation published a qualified robotics requirement.",
      sourceExcerpt: "Seeking qualified robotics execution partners.",
      englishSummary:
        "The source documents a current robotics requirement and public response path.",
      publishedAt: new Date("2026-07-30T00:00:00.000Z"),
      observedAt: now,
      evidenceConfidence: 90,
      translationConfidence: null,
      isPrimarySource: true,
      isSyndicated: false,
      supportsDirectDemand: true,
      supportsIndiaRelevance:
        options.primaryEvidenceSupportsIndia ?? true,
      rawMetadata: {},
      evidenceFingerprint: hash(`evidence:${suffix}:${index}`),
      supportedFieldPaths: ["signal.factualSummary", "signal.indiaRelevance"],
      createdAt: now,
    });
  }

  return { now, radarRun, entity, signals };
}

function promotionInput(
  fixture: Awaited<ReturnType<typeof seedPromotionFixture>>,
  eligibilityPath:
    | "qualified_india_direct_demand"
    | "repeated_india_compatible_signals"
    | "documented_indian_relationship"
    | "exceptional_strategic_relevance",
  idempotencyKey = nextIdempotencyKey(),
) {
  const supportingSignalIds = fixture.signals.map(({ id }) => id).sort();
  return {
    globalEntityId: fixture.entity.id,
    primarySignalId: fixture.signals[0]!.id,
    supportingSignalIds,
    eligibilityPath,
    expectedEntityRevision: fixture.entity.revision,
    expectedPrimarySignalRevision: fixture.signals[0]!.revision,
    expectedSupportingSignalRevisions: Object.fromEntries(
      fixture.signals.map(({ id, revision }) => [id, revision]),
    ),
    actor: { userId: actorUserId, email: actorEmail },
    idempotencyKey,
    reason: "Administrator approved an evidence-backed Discovery promotion.",
    now: fixture.now,
  } as const;
}

describe("Global Demand Radar promotion bridge selection", () => {
  it("keeps the PostgreSQL bridge out of unit and acceptance suites", async () => {
    const packageJson = JSON.parse(
      await readFile(resolve(process.cwd(), "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts["test:unit"]).toContain(
      "--exclude tests/global-radar-promotion-db.integration.test.ts",
    );
    expect(packageJson.scripts["test:db"]).toContain(
      "tests/global-radar-promotion-db.integration.test.ts",
    );
    expect(packageJson.scripts["test:acceptance"]).not.toContain(
      "tests/global-radar-promotion-db.integration.test.ts",
    );
  });
});

describe("Global Demand Radar controlled promotion bridge", () => {
  it("loads a read-only promotion context and adds the separately selected primary", async () => {
    const fixture = await seedPromotionFixture({ repeatedSignalCount: 3 });
    const repository = createGlobalRadarPromotionRepository(db, configuration);

    const result = await repository.loadContext({
      globalEntityId: fixture.entity.id,
      primarySignalId: fixture.signals[0]!.id,
      supportingSignalIds: fixture.signals.slice(1).map(({ id }) => id),
    });

    expect(result).toMatchObject({
      outcome: "found",
      context: {
        entity: { id: fixture.entity.id },
        primarySignal: { id: fixture.signals[0]!.id },
        promotionSupportingSignalIds: fixture.signals
          .map(({ id }) => id)
          .sort(),
        eligibilityFacts: {
          hasPublicIdentityEvidence: true,
          hasIdentifierConflict: false,
        },
      },
    });
    if (result.outcome === "found") {
      expect(result.context.supportingSignals).toHaveLength(3);
    }
  });

  it.each([
    ["qualified_india_direct_demand", { primaryClass: "direct_demand" }],
    [
      "repeated_india_compatible_signals",
      { primaryClass: "direct_demand", repeatedSignalCount: 3 },
    ],
    [
      "documented_indian_relationship",
      { primaryClass: "demand_precursor", primaryEvidenceSupportsIndia: true },
    ],
    [
      "exceptional_strategic_relevance",
      {
        primaryClass: "demand_precursor",
        entityStatus: "qualified",
        primarySourceUrls: [
          "https://exceptional-a.example/public-case",
          "https://exceptional-b.example/public-case",
        ],
      },
    ],
  ] as const)("promotes through %s", async (eligibilityPath, options) => {
    const fixture = await seedPromotionFixture(options);
    const repository = createGlobalRadarPromotionRepository(db, configuration);

    const result = await repository.promote(
      promotionInput(fixture, eligibilityPath),
    );

    expect(result).toMatchObject({
      outcome: "promoted",
      promotion: { eligibilityPath, status: "active" },
      entity: { entityStatus: "promoted_to_candidate", revision: 1 },
      primarySignal: { status: "promoted", revision: 1 },
      run: {
        campaignKey: "general_discovery",
        trigger: "radar_promotion",
        status: "succeeded",
        foundCount: 1,
      },
      candidate: {
        type: "company",
        name: fixture.entity.canonicalName,
        category: fixture.signals[0]!.demandDomain,
        subcategory: fixture.entity.sector,
        geography: fixture.entity.headquartersCountry,
        discoveryScore:
          fixture.signals[0]!.directDemandScore ??
          fixture.signals[0]!.precursorScore,
        status: "discovered",
      },
    });
    expect(await db.select().from(candidateResearchVersions)).toEqual([]);
    expect(await db.select().from(globalSignalUpdates)).toMatchObject([
      { updateType: "promoted", actorType: "administrator" },
    ]);
    expect(await db.select().from(globalRadarAdminEvents)).toMatchObject([
      { action: "promoted_to_discovery", actorType: "administrator" },
    ]);
  });

  it("maps exact creator entities and preserves an existing Discovery decision and maximum score", async () => {
    const fixture = await seedPromotionFixture({ organisationType: "creator" });
    const intake = await db
      .insert(discoveryRuns)
      .values({
        externalRunKey: `existing-candidate:${scope}`,
        trigger: "trial",
        status: "succeeded",
        startedAt: fixture.now,
        completedAt: fixture.now,
        geography: fixture.entity.headquartersCountry,
        candidateType: "creator",
        sourcesUsed: ["fixture"],
        requestedCount: 1,
        companyPercentage: 0,
        foundCount: 1,
        newCount: 1,
        duplicateCount: 0,
        errorSummary: {},
        createdAt: fixture.now,
        updatedAt: fixture.now,
      })
      .returning();
    const [existing] = await db
      .insert(discoveryCandidates)
      .values({
        type: "creator",
        name: fixture.entity.canonicalName,
        normalizedName: fixture.entity.normalizedName,
        canonicalIdentityKey: `website_host:${fixture.entity.canonicalDomain}`,
        canonicalUrl: fixture.entity.websiteUrl!,
        websiteUrl: fixture.entity.websiteUrl,
        discoveredDescription: "Existing Discovery candidate.",
        category: "creator",
        geography: fixture.entity.headquartersCountry,
        firstSourceName: "fixture",
        firstSourceUrl: "https://existing.example/source",
        mostRecentRunId: intake[0]!.id,
        discoveryScore: 99,
        status: "shortlisted",
      })
      .returning();
    await db.insert(discoveryCandidateIdentifiers).values({
      candidateId: existing!.id,
      candidateType: "creator",
      kind: "website_host",
      normalizedValue: fixture.entity.canonicalDomain!,
    });

    const result = await createGlobalRadarPromotionRepository(
      db,
      configuration,
    ).promote(promotionInput(fixture, "qualified_india_direct_demand"));

    expect(result).toMatchObject({
      outcome: "promoted",
      candidate: {
        id: existing!.id,
        type: "creator",
        status: "shortlisted",
        discoveryScore: 99,
      },
      run: { newCount: 0, duplicateCount: 1, companyPercentage: 0 },
    });
    expect((result.outcome === "promoted" && result.candidate.rawMetadata) || {})
      .toMatchObject({ organisationType: "creator" });
  });

  it("replays the same promotion and conflicts a changed request without writing twice", async () => {
    const fixture = await seedPromotionFixture();
    const repository = createGlobalRadarPromotionRepository(db, configuration);
    const input = promotionInput(
      fixture,
      "qualified_india_direct_demand",
    );
    const first = await repository.promote(input);
    const replay = await repository.promote({
      ...input,
      now: new Date(input.now.getTime() + 1_000),
    });
    const changed = await repository.promote({
      ...input,
      reason: "A changed request must not reuse the idempotency key.",
    });

    expect(first).toMatchObject({ outcome: "promoted" });
    expect(replay).toMatchObject({ outcome: "replayed" });
    expect(changed).toEqual({
      outcome: "conflict",
      reason: "idempotency_mismatch",
    });
    expect(await db.select().from(globalRadarPromotions)).toHaveLength(1);
    expect(await db.select().from(discoveryRuns)).toHaveLength(1);
    expect(await db.select().from(discoveryCandidates)).toHaveLength(1);
  });

  it("serializes promotion against ordinary Discovery ingestion for the same identity", async () => {
    const fixture = await seedPromotionFixture();
    const discoveryRepository = createDiscoveryRepository(concurrentDb);
    const promotionRepository = createGlobalRadarPromotionRepository(
      db,
      configuration,
    );
    const externalRunKey = `promotion-race:${scope}`;
    const leaseTokenHash = hash("promotion-race-lease");
    const queued = await discoveryRepository.queueRun({
      externalRunKey,
      trigger: "trial",
      now: new Date(fixture.now.getTime() - 2_000),
      geography: fixture.entity.headquartersCountry,
      candidateType: "company",
      sourcesUsed: ["ordinary_discovery"],
      requestedCount: 1,
      companyPercentage: 100,
    });
    const claimed = await discoveryRepository.claimRun({
      now: new Date(fixture.now.getTime() - 1_000),
      leaseTokenHash,
      leaseExpiresAt: new Date(fixture.now.getTime() + 60_000),
      externalRunKey,
    });
    expect(claimed?.id).toBe(queued.id);

    const [promotion, completion] = await Promise.all([
      promotionRepository.promote(
        promotionInput(fixture, "qualified_india_direct_demand"),
      ),
      discoveryRepository.completeRun({
        runId: queued.id,
        leaseTokenHash,
        submissionHash: hash("promotion-race-submission"),
        now: fixture.now,
        candidates: [
          {
            type: "company",
            name: `${fixture.entity.canonicalName} via Discovery`,
            canonicalUrl: fixture.entity.websiteUrl!,
            websiteUrl: fixture.entity.websiteUrl,
            primarySocialUrl: null,
            linkedinUrl: null,
            discoveredDescription:
              "An ordinary Discovery ingestion racing an administrator promotion.",
            category: "robotics",
            subcategory: "robotics",
            geography: fixture.entity.headquartersCountry,
            sourceName: "Ordinary Discovery",
            sourceUrl: `https://ordinary-${scope}.example/public-result`,
            discoveryScore: 45,
            rawMetadata: { source: "ordinary_discovery" },
          },
        ],
        sourceErrors: [],
      }),
    ]);

    expect(promotion).toMatchObject({ outcome: "promoted" });
    expect(completion).toMatchObject({ outcome: "completed" });
    if (promotion.outcome !== "promoted") {
      throw new Error("Concurrent promotion did not complete.");
    }
    const candidates = await db.select().from(discoveryCandidates);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: promotion.candidate.id,
      status: "discovered",
      discoveryScore: 88,
    });
    expect(
      await db.select().from(discoveryCandidateIdentifiers),
    ).not.toHaveLength(0);
    expect(await db.select().from(discoveryRuns)).toHaveLength(2);
  });

  it("records a bounded conflicted attempt without changing Radar or Discovery state", async () => {
    const fixture = await seedPromotionFixture();
    const repository = createGlobalRadarPromotionRepository(db, configuration);
    const result = await repository.promote({
      ...promotionInput(fixture, "qualified_india_direct_demand"),
      expectedPrimarySignalRevision: 7,
    });

    expect(result).toMatchObject({
      outcome: "conflict",
      reason: "revision_mismatch",
      promotion: { status: "conflicted" },
    });
    expect(await db.select().from(discoveryRuns)).toEqual([]);
    expect(await db.select().from(discoveryCandidates)).toEqual([]);
    expect(await db.select().from(globalEntities)).toMatchObject([
      { id: fixture.entity.id, entityStatus: "qualified", revision: 0 },
    ]);
    expect(await db.select().from(globalRadarSignals)).toMatchObject([
      { id: fixture.signals[0]!.id, status: "qualified", revision: 0 },
    ]);
    const [event] = await db.select().from(globalRadarAdminEvents);
    expect(event).toMatchObject({ action: "promotion_conflicted" });
    expect(JSON.stringify(event)).not.toMatch(/payload|sql|secret|lease|exception/i);
  });

  it("compensates a promotion while preserving every Discovery row and replays reversal", async () => {
    const fixture = await seedPromotionFixture();
    const repository = createGlobalRadarPromotionRepository(db, configuration);
    const request = promotionInput(fixture, "qualified_india_direct_demand");
    const promoted = await repository.promote(request);
    if (promoted.outcome !== "promoted") {
      throw new Error("Promotion fixture did not promote.");
    }
    const reversalIdempotencyKey = nextIdempotencyKey();
    const reversal = {
      globalEntityId: fixture.entity.id,
      expectedEntityRevision: promoted.entity.revision,
      expectedPrimarySignalRevision: promoted.primarySignal.revision,
      actor: { userId: actorUserId, email: actorEmail },
      idempotencyKey: reversalIdempotencyKey,
      reason: "Administrator approved a compensating reversal.",
      now: new Date(fixture.now.getTime() + 1_000),
    } as const;
    const first = await repository.reverse(reversal);
    const replay = await repository.reverse({
      ...reversal,
      now: new Date(reversal.now.getTime() + 1_000),
    });
    const replayedPromotion = await repository.promote({
      ...request,
      now: new Date(reversal.now.getTime() + 2_000),
    });

    expect(first).toMatchObject({
      outcome: "reversed",
      promotion: { status: "reversed" },
      entity: { entityStatus: fixture.entity.entityStatus, revision: 2 },
      primarySignal: { status: "qualified", revision: 2 },
    });
    expect(replay).toMatchObject({ outcome: "replayed" });
    expect(replayedPromotion).toMatchObject({
      outcome: "conflict",
      reason: "promotion_reversed",
      promotion: { status: "reversed" },
    });
    expect(await db.select().from(discoveryCandidates)).toHaveLength(1);
    expect(await db.select().from(discoveryCandidateSources)).not.toHaveLength(0);
    expect(await db.select().from(discoveryRuns)).toHaveLength(1);
  });

  it("replays an inspectable reversal conflict and rejects a changed same-key request", async () => {
    const fixture = await seedPromotionFixture();
    const repository = createGlobalRadarPromotionRepository(db, configuration);
    const promoted = await repository.promote(
      promotionInput(fixture, "qualified_india_direct_demand"),
    );
    if (promoted.outcome !== "promoted") {
      throw new Error("Promotion fixture did not promote.");
    }
    const conflictInput = {
      globalEntityId: fixture.entity.id,
      expectedEntityRevision: promoted.entity.revision + 1,
      expectedPrimarySignalRevision: promoted.primarySignal.revision,
      actor: { userId: actorUserId, email: actorEmail },
      idempotencyKey: nextIdempotencyKey(),
      reason: "This stale reversal must remain inspectable.",
      now: new Date(fixture.now.getTime() + 1_000),
    } as const;

    const first = await repository.reverse(conflictInput);
    const replay = await repository.reverse({
      ...conflictInput,
      now: new Date(conflictInput.now.getTime() + 1_000),
    });
    const changed = await repository.reverse({
      ...conflictInput,
      reason: "A changed reversal cannot reuse the conflict idempotency key.",
    });

    expect(first).toMatchObject({
      outcome: "conflict",
      reason: "revision_mismatch",
    });
    expect(replay).toMatchObject({
      outcome: "conflict",
      reason: "revision_mismatch",
    });
    expect(changed).toEqual({
      outcome: "conflict",
      reason: "idempotency_mismatch",
    });
    expect(
      await db
        .select()
        .from(globalRadarAdminEvents)
        .where(eq(globalRadarAdminEvents.action, "promotion_reversal_conflicted")),
    ).toHaveLength(1);
  });

  it("keeps terminal promotion intake out of claiming and India latest-run metrics", async () => {
    const fixture = await seedPromotionFixture();
    const promotionRepository = createGlobalRadarPromotionRepository(
      db,
      configuration,
    );
    const discoveryRepository = createDiscoveryRepository(db);
    await discoveryRepository.queueRun({
      externalRunKey: `coverage:${scope}`,
      trigger: "trial",
      now: new Date(fixture.now.getTime() - 60_000),
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["codex_web"],
      requestedCount: 1,
      companyPercentage: 100,
    });
    const ordinary = await discoveryRepository.claimRun({
      now: new Date(fixture.now.getTime() - 59_000),
      leaseTokenHash: "coverage-lease",
      leaseExpiresAt: new Date(fixture.now.getTime() + 60_000),
      externalRunKey: `coverage:${scope}`,
    });
    await discoveryRepository.completeRun({
      runId: ordinary!.id,
      leaseTokenHash: "coverage-lease",
      submissionHash: "coverage-submission",
      now: new Date(fixture.now.getTime() - 58_000),
      candidates: [],
      sourceErrors: [],
    });
    await promotionRepository.promote(
      promotionInput(fixture, "qualified_india_direct_demand"),
    );

    const claim = await discoveryRepository.claimRun({
      now: new Date(fixture.now.getTime() + 1_000),
      leaseTokenHash: "should-not-claim-promotion",
      leaseExpiresAt: new Date(fixture.now.getTime() + 60_000),
      triggers: ["scheduled", "manual", "trial"],
    });
    const snapshot = await discoveryRepository.getAdminSummary({
      todayStart: new Date("2026-07-31T00:00:00.000Z"),
    });
    expect(claim).toBeNull();
    expect(snapshot.summary.latestRunStatus).toBe("succeeded");
    expect(snapshot.summary.latestRunCompletedAt).toEqual(
      new Date(fixture.now.getTime() - 58_000),
    );
    expect(snapshot.runs.map(({ trigger }) => trigger)).toContain(
      "radar_promotion",
    );
    expect(
      await db
        .select()
        .from(discoveryRuns)
        .where(eq(discoveryRuns.trigger, "radar_promotion")),
    ).toMatchObject([
      {
        status: "succeeded",
        leaseTokenHash: null,
        leaseExpiresAt: null,
        submissionHash: null,
      },
    ]);
  });

  it("never claims a queued radar-promotion row through the Discovery worker", async () => {
    const now = new Date("2026-07-31T06:30:00.000Z");
    await db.insert(discoveryRuns).values({
      externalRunKey: `guarded-radar-promotion:${scope}`,
      campaignKey: "general_discovery",
      trigger: "radar_promotion",
      status: "queued",
      geography: "United States",
      candidateType: "company",
      sourcesUsed: ["official_company_material"],
      requestedCount: 1,
      companyPercentage: 100,
      errorSummary: {},
      createdAt: now,
      updatedAt: now,
    });

    const claim = await createDiscoveryRepository(db).claimRun({
      now,
      leaseTokenHash: "radar-promotion-must-remain-unclaimed",
      leaseExpiresAt: new Date(now.getTime() + 60_000),
    });

    expect(claim).toBeNull();
    expect(await db.select().from(discoveryRuns)).toMatchObject([
      { trigger: "radar_promotion", status: "queued" },
    ]);
  });
});
