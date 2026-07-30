import { createHash, randomBytes, randomUUID } from "node:crypto";

import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GLOBAL_RADAR_DEDUPE_VERSION,
  GLOBAL_RADAR_PROMPT_VERSION,
  GLOBAL_RADAR_SCHEMA_VERSION,
  canonicalizeGlobalRadarPersistenceBatch,
  createEntityIdentity,
  createEvidenceFingerprint,
  createGlobalRadarFingerprint,
  createGlobalRadarPersistenceHash,
  createGlobalRadarSignalDedupeKey,
  deriveEcosystemMomentum,
  generateGlobalRadarQueries,
  normalizeRequirements,
  parseGlobalRadarPlanSnapshot,
  planGlobalRadarRun,
  persistableGlobalRadarBatchObjectSchema,
  scoreDirectDemand,
  type PersistableGlobalRadarBatch,
  type RadarPlan,
} from "../app/domain/global-radar";
import { hashGlobalRadarLeaseToken } from "../app/server/global-radar/worker-auth";
import { closeDb, getDb, type MewtualsDatabase } from "../db/client";
import * as globalRadarDatabaseSchema from "../db/global-radar-schema";
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
import {
  type CompleteGlobalRadarRunInput,
  createGlobalRadarRepository,
  type GlobalRadarRepository,
  type QueueGlobalRadarRunInput,
} from "../db/repositories/global-radar-repository";
import { createGlobalRadarAdminRepository } from "../db/repositories/global-radar-admin-repository";
import { persistGlobalRadarBatch } from "../db/repositories/global-radar-persistence";
import * as coreDatabaseSchema from "../db/schema";
import { discoveryRuns, users } from "../db/schema";

const db = getDb();
const testRun = randomUUID();
const userEmail = `global-radar-db-${testRun}@example.test`;
const HASH_A = "a".repeat(64);
function testRadarPlan(
  scanMode: QueueGlobalRadarRunInput["scanMode"] = "daily",
  administratorRequestId?: string,
  identityScope = "default",
) {
  const scope = createHash("sha256").update(identityScope).digest("hex").slice(0, 12);
  return planGlobalRadarRun({
    now: new Date("2026-07-29T04:00:00.000Z"),
    scanMode,
    administratorRequestId:
      scanMode === "manual"
        ? (administratorRequestId ?? "00000000-0000-4000-8000-000000000001")
        : undefined,
    config: {
    countries: ["United States", `Test-${scope}`],
    languages: ["en"],
    themes: ["robot_teleoperation_demonstrations"],
    enabledSourceAdapters: ["codex_public_web"],
    sourceFamilies: ["official_company_material"],
    resultLimit: 20,
    scoreVersion: "global-radar-score-v1",
    thresholds: {
      version: "global-radar-thresholds-v1",
      direct_demand: 70,
      demand_precursor: 65,
      ecosystem_momentum: 70,
    },
    },
    coverageState: {
      countryLastCoveredAt: {},
      themeLastCoveredAt: {},
      watchlistLastCoveredAt: {},
    },
    watchlist: [],
  });
}

const TEST_RADAR_PLAN = testRadarPlan();
const HASH_B = TEST_RADAR_PLAN.fingerprint;
const HASH_C = "c".repeat(64);
const LEASE_SECRET =
  "global-radar-integration-lease-secret-longer-than-32-characters";
const leaseCodec = {
  issueLeaseToken: () => randomBytes(32).toString("hex"),
  hashLeaseToken: hashLease,
};
const queuedPlansByRunId = new Map<string, RadarPlan>();
const claimedAtByRunId = new Map<string, Date>();
const baseRepository = createGlobalRadarRepository(db, leaseCodec);
const repository: GlobalRadarRepository = {
  ...baseRepository,
  async queueRun(input) {
    const result = await baseRepository.queueRun(input);
    if (result.outcome === "queued" || result.outcome === "replayed") {
      const plan = parseGlobalRadarPlanSnapshot(
        input.planSnapshot,
        input.planFingerprint,
      );
      if (!plan) throw new Error("Queued test plan was not canonical.");
      queuedPlansByRunId.set(result.run.id, plan);
    }
    return result;
  },
  async claimRun(input) {
    const result = await baseRepository.claimRun(input);
    if (result.outcome === "claimed") {
      claimedAtByRunId.set(result.run.id, new Date(input.now.getTime()));
    }
    return result;
  },
};
const PRIVATE_PERSISTENCE_FIELDS = [
  "leaseTokenHash",
  "submissionHash",
  "batchFingerprint",
  "errorSummary",
  "planSnapshot",
] as const;

let administratorUserId = "";

const databaseSchema = {
  ...coreDatabaseSchema,
  ...globalRadarDatabaseSchema,
};

type IndependentDatabase = {
  client: Sql;
  database: MewtualsDatabase;
};

function createIndependentDatabase(applicationName: string): IndependentDatabase {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests.");
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connection: { application_name: applicationName },
  });
  return {
    client,
    database: drizzle(client, { schema: databaseSchema }),
  };
}

async function closeIndependentDatabases(databases: IndependentDatabase[]) {
  await Promise.all(databases.map(({ client }) => client.end({ timeout: 5 })));
}

function queueInput(
  suffix: string,
  overrides: Partial<QueueGlobalRadarRunInput> = {},
): QueueGlobalRadarRunInput {
  const trigger = overrides.trigger ?? "scheduled";
  const plan = testRadarPlan(
    overrides.scanMode ?? "daily",
    overrides.administratorRequestId ?? undefined,
    suffix,
  );
  const queries = generateGlobalRadarQueries(plan);
  const unique = <Value>(values: readonly Value[]) => [...new Set(values)];
  return {
    externalRunKey: plan.identityKey,
    requestHash: createGlobalRadarFingerprint({
      version: "global-radar-run-request-v1",
      trigger,
      planFingerprint: plan.fingerprint,
    }),
    trigger,
    scanMode: plan.scanMode,
    planFingerprint: plan.fingerprint,
    planSnapshot: structuredClone(plan) as unknown as Record<
      string,
      unknown
    >,
    sourceCountries: unique(queries.map(({ sourceCountry }) => sourceCountry)),
    sourceLanguages: unique(queries.map(({ language }) => language)),
    targetDomains: unique(queries.map(({ theme }) => theme)),
    targetSignalTypes: unique(queries.map(({ signalIntent }) => signalIntent)),
    sourcesUsed: unique(queries.map(({ sourceAdapter }) => sourceAdapter)),
    promptVersion: GLOBAL_RADAR_PROMPT_VERSION,
    schemaVersion: GLOBAL_RADAR_SCHEMA_VERSION,
    taxonomyVersion: plan.taxonomyVersion,
    scoringVersion: plan.scoreVersion,
    now: new Date("2026-07-29T04:00:00.000Z"),
    ...overrides,
  };
}

function plainSha256(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function hashLease(rawToken: string) {
  return hashGlobalRadarLeaseToken(LEASE_SECRET, rawToken);
}

function expectSafeProjection(value: unknown) {
  const json = JSON.stringify(value);
  for (const forbidden of PRIVATE_PERSISTENCE_FIELDS) {
    expect(json).not.toContain(forbidden);
  }
}

function completionInput(
  runId: string,
  leaseToken: string,
  now: Date,
  overrides: Partial<CompleteGlobalRadarRunInput> = {},
): CompleteGlobalRadarRunInput {
  const batch = validPersistenceBatch(runId);
  return {
    runId,
    leaseToken,
    planFingerprint: batch.planFingerprint,
    submissionHash: batch.canonicalSubmissionHash,
    now,
    batch,
    ...overrides,
  };
}

const ALL_UNKNOWN_SENSITIVE_DATA = {
  faces: null,
  voices: null,
  biometrics: null,
  gaze: null,
  health: null,
  children: null,
  home_interiors: null,
  workplace_monitoring: null,
  precise_location: null,
  road_users: null,
  employee_data: null,
  industrial_secrets: null,
  defence_or_dual_use: null,
  copyrighted_material: null,
  export_controls: null,
} as const;

function validPersistenceBatch(
  runId: string,
  options: {
    entityRef?: string;
    entityName?: string;
    websiteUrl?: string;
    linkedinOrganizationUrl?: string | null;
    stableIdentifierValue?: string;
    observedAt?: string;
    sourceUrl?: string;
    externalSignalId?: string;
  } = {},
): PersistableGlobalRadarBatch {
  const entityRef = options.entityRef ?? "entity-acme";
  const observedAt = options.observedAt ?? "2026-07-29T18:01:00.000Z";
  const sourceUrl = options.sourceUrl ?? "https://acme.example/public-request";
  const normalizedRequirements = normalizeRequirements([
    {
      kind: "physical_data",
      capabilityTag: "teleoperated_trajectories",
      summary: "Teleoperated manipulation trajectories with reviewed outcomes.",
      dataFamilies: ["robot trajectories"],
      sensorModalities: ["rgb"],
      environments: ["warehouse"],
      taskFamilies: ["manipulation"],
      collectionMethods: ["teleoperation"],
      humanRoles: ["teleoperator"],
      robotEmbodiments: ["mobile manipulator"],
      indianExecutionArchetypes: ["robotics_data_company"],
      scaleSpecifications: null,
      technicalSpecifications: null,
      qualitySpecifications: null,
      rightsAndComplianceSpecifications: null,
      confidence: 85,
    },
  ]);
  if (!normalizedRequirements.valid) {
    throw new Error("Persistence fixture requirement did not normalize.");
  }
  const plan = queuedPlansByRunId.get(runId) ?? TEST_RADAR_PLAN;
  const executedAt = (
    claimedAtByRunId.get(runId) ?? new Date("2026-07-29T18:00:00.000Z")
  ).toISOString();
  const batch: PersistableGlobalRadarBatch = {
    runId,
    planFingerprint: plan.fingerprint,
    canonicalSubmissionHash: HASH_A,
    executedQueries: generateGlobalRadarQueries(plan).map((query) => ({
      ...query,
      executedAt,
      resultsExamined: 0,
      error: null,
    })),
    entities: [
      {
        entityRef,
        canonicalName: options.entityName ?? "Acme Robotics",
        websiteUrl: options.websiteUrl ?? "https://acme.example/about",
        linkedinOrganizationUrl:
          options.linkedinOrganizationUrl ??
          "https://www.linkedin.com/company/acme-robotics/",
        stablePublicIdentifiers: [
          {
            namespace: "official_registry",
            value: options.stableIdentifierValue ?? "acme-robotics",
          },
        ],
        canonicalCorporateGroupId: "group:acme-robotics",
        headquartersCountry: "United States",
        headquartersCity: "Austin",
        operatingCountries: ["United States", "India"],
        organisationType: "robotics_company",
        sector: "robotics",
        shortDescription: "Builds public robot-learning systems.",
        rawMetadata: {},
      },
    ],
    signals: [
      {
        externalSignalId: options.externalSignalId ?? "signal-acme-request",
        dedupeKey: HASH_A,
        signalClass: "direct_demand",
        primaryEntityRef: entityRef,
        associatedEntities: [],
        demandDomain: "robot_learning_and_manipulation",
        signalType: "data_collection_request",
        title: "Acme requests teleoperated robot trajectories",
        factualSummary:
          "Acme published a current request for teleoperated robot trajectories.",
        interpretationSummary:
          "Mewtuals interprets the public request as external physical-data demand.",
        theme: "robot_teleoperation_demonstrations",
        sourceCountry: "United States",
        targetGeographies: ["India"],
        collectionGeographies: ["India"],
        manufacturingGeographies: null,
        deliveryGeographies: ["Global"],
        industry: "robotics",
        targetModelOrSystem: "robot-learning model",
        targetCapabilityTags: ["teleoperated_trajectories"],
        requiredCounterpartyArchetypes: ["robotics_data_company"],
        indiaRelevance: {
          relevanceType: "explicit_India",
          basis: "exact_public_evidence",
          rationale: "The official request explicitly includes India.",
          reasons: ["India is named as an eligible collection geography."],
          constraints: [],
          unknowns: [],
          confidence: 90,
          regulatoryFacts: null,
          logisticsFacts: null,
        },
        score: {
          valid: true,
          signalClass: "direct_demand",
          scoreVersion: "global-radar-score-v1",
          score: 80,
          scoreCoverage: 100,
          qualificationGatesPassed: true,
          components: {
            explicitness: 80,
            evidenceConfidence: 80,
            freshness: 80,
            actionability: 80,
            indiaFit: 80,
            commercialPotential: 80,
            repeatability: 80,
            responseAccessibility: 80,
            strategicLearning: 80,
            complianceComplexity: 20,
          },
        },
        announcedAt: "2026-07-29T00:00:00.000Z",
        effectiveFrom: "2026-07-29T00:00:00.000Z",
        expiresAt: "2026-08-29T00:00:00.000Z",
        evergreen: false,
        reobserveBy: null,
        observedAt,
        initialStatus: "newly_discovered",
        responsePath: {
          type: "supplier_or_partner_registration",
          url: "https://acme.example/suppliers",
          businessEmail: null,
          evidenceUrl: sourceUrl,
        },
        partnerApplicationUrl: "https://acme.example/suppliers",
        sourceLanguage: "en",
        extractionMethod: "codex_public_web",
        taxonomyVersion: "global-radar-v1",
        systemsContext: {
          stackType: "physical_data",
          higherLevelSystemGoal: "Improve robot-learning model reliability.",
          relevantStackLayer: "annotation",
          lowerLevelInputsRequired: ["real_world_access", "sensor_capture"],
          transformationOrCapabilityAdded:
            "Convert captured trajectories into reviewed training examples.",
          downstreamModelOrRobotBehavior:
            "Robots generalize manipulation skills across environments.",
          whyTheRequirementMatters:
            "Reliable trajectories make physical policy learning measurable.",
          possibleIndianExecutionRole:
            "An Indian operator can run evidence-backed teleoperation workflows.",
          factualElements: ["The organisation requested trajectory data."],
          inferredElements: ["India could supply compliant operations."],
          systemsContextSummary: Array.from(
            { length: 80 },
            (_, index) => `context${index}`,
          ).join(" "),
        },
        sensitiveDataAndCompliance: {
          sensitiveDataFlags: ALL_UNKNOWN_SENSITIVE_DATA,
          complianceFacts: {
            consent: null,
            deIdentification: null,
            legalReview: null,
            knownResidencyRequirements: null,
            participantRightsComplexity: null,
          },
        },
        rawMetadata: {},
        requirements: [
          normalizedRequirements.requirements[0]!,
        ],
        evidence: [
          {
            contributorEntityRef: entityRef,
            sourceUrl,
            canonicalSourceUrl: sourceUrl,
            sourceName: "Acme Robotics",
            sourceType: "official_request",
            sourceLanguage: "en",
            sourceCountry: "United States",
            sourceFamily: "official_company_material",
            claim:
              "Acme requests teleoperated robot trajectories from eligible Indian operators.",
            sourceExcerpt: "Seeking teleoperation partners in India.",
            englishSummary:
              "Acme is seeking eligible Indian operators for teleoperated robot data.",
            publishedAt: "2026-07-29T00:00:00.000Z",
            observedAt,
            evidenceConfidence: 90,
            translationConfidence: null,
            isPrimarySource: true,
            isSyndicated: false,
            supportsDirectDemand: true,
            supportsIndiaRelevance: true,
            rawMetadata: {},
            evidenceFingerprint: createEvidenceFingerprint({
              sourceUrl,
              canonicalSourceUrl: sourceUrl,
              isPrimarySource: true,
            }),
            supportedFieldPaths: [
              "signal.title",
              "signal.indiaRelevance.relevanceType",
            ],
          },
        ],
      },
    ],
    sourceErrors: [],
    rejections: {},
  };
  return rehashPersistenceBatch(batch);
}

function rehashPersistenceBatch(
  input: PersistableGlobalRadarBatch,
): PersistableGlobalRadarBatch {
  const identitiesByRef = new Map(
    input.entities.map((entity) => [
      entity.entityRef,
      createEntityIdentity({
        name: entity.canonicalName,
        headquartersCountry: entity.headquartersCountry,
        websiteUrl: entity.websiteUrl,
        linkedinOrganizationUrl: entity.linkedinOrganizationUrl,
        stablePublicIdentifiers: entity.stablePublicIdentifiers,
      }),
    ]),
  );
  const parsed = persistableGlobalRadarBatchObjectSchema.parse({
    ...input,
    canonicalSubmissionHash: HASH_A,
    signals: input.signals.map((signal) => ({
      ...signal,
      dedupeKey: createGlobalRadarSignalDedupeKey(signal, identitiesByRef),
    })),
  });
  const { canonicalSubmissionHash, ...hashableBatch } = parsed;
  if (!canonicalSubmissionHash) {
    throw new Error("Persistence fixture hash placeholder was missing.");
  }
  return {
    ...parsed,
    canonicalSubmissionHash: createGlobalRadarPersistenceHash(hashableBatch),
  };
}

const MOMENTUM_POLICY = {
  version: "global-radar-momentum-v1",
  taxonomy: "robot_learning_and_manipulation",
  volumeTargets: { days7: 2, days30: 4, days90: 8 },
  windowWeights: { days7: 50, days30: 30, days90: 20 },
} as const;

function validMomentumPersistenceBatch(
  runId: string,
): PersistableGlobalRadarBatch {
  const batch = structuredClone(validPersistenceBatch(runId));
  batch.entities.push({
    ...batch.entities[0]!,
    entityRef: "entity-beta-robotics",
    canonicalName: "Beta Robotics",
    websiteUrl: "https://beta-robotics.example",
    linkedinOrganizationUrl: null,
    stablePublicIdentifiers: [
      { namespace: "official_registry", value: "beta-robotics" },
    ],
    canonicalCorporateGroupId: "group:beta-robotics",
  });
  batch.entities.push({
    ...batch.entities[0]!,
    entityRef: "entity-gamma-robotics",
    canonicalName: "Gamma Robotics",
    websiteUrl: "https://gamma-robotics.example",
    linkedinOrganizationUrl: null,
    stablePublicIdentifiers: [
      { namespace: "official_registry", value: "gamma-robotics" },
    ],
    canonicalCorporateGroupId: "group:gamma-robotics",
  });
  const firstUrl = "https://acme.example/momentum-observation";
  const secondUrl = "https://beta-robotics.example/momentum-observation";
  const syndicatedUrl = "https://mirror.example/gamma-momentum-copy";
  const firstObservedAt = "2026-07-30T14:00:00.000Z";
  const secondObservedAt = "2026-07-30T15:00:00.000Z";
  const derived = deriveEcosystemMomentum(
    {
      taxonomy: MOMENTUM_POLICY.taxonomy,
      taxonomyConsistency: 85,
      evidenceQuality: 80,
      observations: [
        {
          evidenceId: "evidence:acme",
          entityId: "entity:acme",
          corporateGroupId: "group:acme-robotics",
          sourceId: "source:acme",
          sourceFamily: "official_company_material",
          isPrimarySource: true,
          observedAt: firstObservedAt,
        },
        {
          evidenceId: "evidence:beta",
          entityId: "entity:beta",
          corporateGroupId: "group:beta-robotics",
          sourceId: "source:beta",
          sourceFamily: "official_research",
          isPrimarySource: false,
          observedAt: secondObservedAt,
        },
      ],
    },
    MOMENTUM_POLICY,
    { now: () => new Date("2026-07-31T14:00:00.000Z") },
  );
  if (!derived.valid) throw new Error("Momentum fixture did not derive.");
  const direct = batch.signals[0]!;
  batch.signals = [
    {
      ...direct,
      externalSignalId: "signal-robot-learning-momentum",
      signalClass: "ecosystem_momentum",
      primaryEntityRef: null,
      associatedEntities: [
        { entityRef: "entity-acme", role: "contributor", confidence: 90 },
        {
          entityRef: "entity-beta-robotics",
          role: "contributor",
          confidence: 90,
        },
        {
          entityRef: "entity-gamma-robotics",
          role: "contributor",
          confidence: 90,
        },
      ],
      signalType: "ecosystem_direction",
      title: "Multiple robotics groups invest in robot-learning data",
      factualSummary:
        "Two independent robotics groups published robot-learning data activity.",
      interpretationSummary:
        "Mewtuals interprets the independent activity as ecosystem momentum.",
      targetGeographies: null,
      collectionGeographies: null,
      deliveryGeographies: null,
      indiaRelevance: {
        relevanceType: "inferred_India_compatible",
        basis: "mewtuals_interpretation",
        rationale: "Indian execution capabilities may fit the observed direction.",
        reasons: ["The capability taxonomy maps to Indian operators."],
        constraints: [],
        unknowns: ["No public India request exists."],
        confidence: 60,
        regulatoryFacts: null,
        logisticsFacts: null,
      },
      score: {
        ...derived,
      },
      announcedAt: null,
      effectiveFrom: null,
      expiresAt: null,
      evergreen: null,
      reobserveBy: null,
      observedAt: "2026-07-31T14:00:00.000Z",
      responsePath: null,
      partnerApplicationUrl: null,
      systemsContext: null,
      evidence: [
        {
          ...direct.evidence[0]!,
          contributorEntityRef: "entity-acme",
          sourceUrl: firstUrl,
          canonicalSourceUrl: firstUrl,
          claim: "Acme published robot-learning data activity.",
          sourceExcerpt: "Robot-learning data programme launched.",
          englishSummary: "Acme launched robot-learning data activity.",
          observedAt: firstObservedAt,
          publishedAt: firstObservedAt,
          supportsDirectDemand: false,
          supportsIndiaRelevance: false,
          evidenceFingerprint: createEvidenceFingerprint({
            sourceUrl: firstUrl,
            canonicalSourceUrl: firstUrl,
            isPrimarySource: true,
          }),
          supportedFieldPaths: ["signal.factualSummary"],
        },
        {
          ...direct.evidence[0]!,
          contributorEntityRef: "entity-beta-robotics",
          sourceUrl: secondUrl,
          canonicalSourceUrl: secondUrl,
          sourceName: "Beta Robotics",
          sourceFamily: "official_research",
          claim: "Beta published independent robot-learning data activity.",
          sourceExcerpt: "Independent robot-learning research programme.",
          englishSummary: "Beta published robot-learning data activity.",
          observedAt: secondObservedAt,
          publishedAt: secondObservedAt,
          isPrimarySource: false,
          supportsDirectDemand: false,
          supportsIndiaRelevance: false,
          evidenceFingerprint: createEvidenceFingerprint({
            sourceUrl: secondUrl,
            canonicalSourceUrl: secondUrl,
            isPrimarySource: false,
          }),
          supportedFieldPaths: ["signal.factualSummary"],
        },
        {
          ...direct.evidence[0]!,
          contributorEntityRef: "entity-gamma-robotics",
          sourceUrl: syndicatedUrl,
          canonicalSourceUrl: syndicatedUrl,
          sourceName: "Syndicated Mirror",
          sourceFamily: "official_jobs",
          claim: "A syndicated copy repeats Gamma activity.",
          sourceExcerpt: "Repeated syndicated activity.",
          englishSummary: "This is a syndicated mirror and not independent evidence.",
          observedAt: secondObservedAt,
          publishedAt: secondObservedAt,
          isPrimarySource: true,
          isSyndicated: true,
          supportsDirectDemand: false,
          supportsIndiaRelevance: false,
          evidenceFingerprint: createEvidenceFingerprint({
            sourceUrl: syndicatedUrl,
            canonicalSourceUrl: syndicatedUrl,
            isPrimarySource: true,
          }),
          supportedFieldPaths: ["signal.factualSummary"],
        },
      ],
    },
  ];
  return rehashPersistenceBatch(batch);
}

function validPrecursorPersistenceBatch(
  runId: string,
): PersistableGlobalRadarBatch {
  const batch = structuredClone(validPersistenceBatch(runId));
  const direct = batch.signals[0]!;
  direct.externalSignalId = "signal-acme-precursor";
  direct.signalClass = "demand_precursor";
  direct.signalType = "funding";
  direct.title = "Acme funds a new robot-learning programme";
  direct.factualSummary =
    "Acme announced funding for a dated robot-learning programme.";
  direct.interpretationSummary =
    "Mewtuals interprets the programme as a precursor, not a public request.";
  direct.score = {
    valid: true,
    signalClass: "demand_precursor",
    scoreVersion: "global-radar-score-v1",
    score: 72,
    scoreCoverage: 100,
    qualificationGatesPassed: true,
    components: {
      evidenceConfidence: 80,
      proximityToExternalDemand: 70,
      fundingDeploymentMomentum: 80,
      likelyDataHardwareIntensity: 70,
      indiaFit: 70,
      estimatedTimeHorizon: 80,
      strategicRelevance: 70,
    },
  };
  direct.expiresAt = null;
  direct.evergreen = null;
  direct.reobserveBy = null;
  direct.responsePath = null;
  direct.partnerApplicationUrl = null;
  direct.evidence = direct.evidence.map((evidence) => ({
    ...evidence,
    sourceType: "official_funding_announcement",
    claim: "Acme announced funding for a dated robot-learning programme.",
    sourceExcerpt: "New funding supports the robot-learning programme.",
    englishSummary:
      "Acme announced a funded robot-learning programme without an external request.",
    supportsDirectDemand: false,
  }));
  return rehashPersistenceBatch(batch);
}

function withMomentumGateInputs(
  input: PersistableGlobalRadarBatch,
  gateInputs: { taxonomyConsistency: number; evidenceQuality: number },
): PersistableGlobalRadarBatch {
  const batch = structuredClone(input);
  const signal = batch.signals[0];
  if (!signal || signal.signalClass !== "ecosystem_momentum") {
    throw new Error("Momentum fixture was not classified.");
  }
  const entityByRef = new Map(
    batch.entities.map((entity) => [entity.entityRef, entity]),
  );
  const observations = signal.evidence.flatMap((evidence) => {
    if (evidence.isSyndicated || evidence.contributorEntityRef === null) {
      return [];
    }
    const entity = entityByRef.get(evidence.contributorEntityRef);
    if (!entity) throw new Error("Momentum contributor entity was missing.");
    return [
      {
        evidenceId: evidence.evidenceFingerprint,
        entityId: entity.entityRef,
        corporateGroupId:
          entity.canonicalCorporateGroupId ?? `group:${entity.entityRef}`,
        sourceId: evidence.evidenceFingerprint,
        sourceFamily: evidence.sourceFamily,
        isPrimarySource: evidence.isPrimarySource,
        observedAt: evidence.observedAt,
      },
    ];
  });
  const derived = deriveEcosystemMomentum(
    {
      taxonomy: signal.demandDomain,
      ...gateInputs,
      observations,
    },
    MOMENTUM_POLICY,
    { now: () => new Date(signal.observedAt) },
  );
  if (!derived.valid) throw new Error("Momentum gate fixture did not derive.");
  signal.score = structuredClone(derived);
  return rehashPersistenceBatch(batch);
}

async function graphRowCounts() {
  const tables = [
    globalEntities,
    globalRadarSearchQueries,
    globalRadarSignals,
    globalRadarSignalEntities,
    globalSignalRequirements,
    globalSignalEvidence,
    globalSignalUpdates,
  ] as const;
  return Promise.all(
    tables.map(async (table) => {
      const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
      return result?.count ?? 0;
    }),
  );
}

async function runningPersistenceSnapshot(runId: string) {
  const [run] = await db
    .select({
      status: globalRadarRuns.status,
      requestHash: globalRadarRuns.requestHash,
      planFingerprint: globalRadarRuns.planFingerprint,
      leaseTokenHash: globalRadarRuns.leaseTokenHash,
      submissionHash: globalRadarRuns.submissionHash,
      batchFingerprint: globalRadarRuns.batchFingerprint,
      numberResultsExamined: globalRadarRuns.numberResultsExamined,
      numberEntitiesObserved: globalRadarRuns.numberEntitiesObserved,
      numberSignalsFound: globalRadarRuns.numberSignalsFound,
      numberDirectDemands: globalRadarRuns.numberDirectDemands,
      numberPrecursors: globalRadarRuns.numberPrecursors,
      numberMomentumRecords: globalRadarRuns.numberMomentumRecords,
      numberNew: globalRadarRuns.numberNew,
      numberUpdated: globalRadarRuns.numberUpdated,
      numberDuplicates: globalRadarRuns.numberDuplicates,
      numberRejectedForWeakEvidence:
        globalRadarRuns.numberRejectedForWeakEvidence,
      numberSourceErrors: globalRadarRuns.numberSourceErrors,
      errorSummary: globalRadarRuns.errorSummary,
      updatedAt: globalRadarRuns.updatedAt,
    })
    .from(globalRadarRuns)
    .where(eq(globalRadarRuns.id, runId));
  if (!run) throw new Error("Running Radar fixture was not found.");
  return run;
}

async function expectRejectedSourceErrorsLeaveRunUnchanged(
  suffix: string,
  sourceErrors: readonly { sourceName: string; message: string }[],
) {
  const now = new Date("2026-07-30T01:00:00.000Z");
  await repository.queueRun(queueInput(suffix, { now }));
  const claim = await repository.claimRun({ now });
  if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
  const before = await runningPersistenceSnapshot(claim.run.id);
  const batch = structuredClone(validPersistenceBatch(claim.run.id));
  const invalidBatch = {
    ...batch,
    canonicalSubmissionHash: HASH_A,
    sourceErrors: sourceErrors.map((sourceError) => ({
      ...sourceError,
      queryFingerprint: null,
    })),
  } as unknown as PersistableGlobalRadarBatch;

  await expect(
    repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
      ),
      submissionHash: HASH_A,
      batch: invalidBatch,
    }),
  ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });

  expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(before);
}

async function cleanRadarRows() {
  const [database] = await db.execute<{ databaseName: string }>(
    sql`select current_database() as "databaseName"`,
  );
  if (database?.databaseName !== "mewtuals_test") {
    throw new Error(
      `Refusing Global Radar integration cleanup in ${database?.databaseName ?? "an unknown database"}.`,
    );
  }
  await db.delete(globalRadarAdminEvents);
  await db.delete(globalSignalUpdates);
  await db.delete(globalSignalEvidence);
  await db.delete(globalSignalRequirements);
  await db.delete(globalRadarSignalEntities);
  await db.delete(globalRadarPromotions);
  await db.delete(globalRadarSignals);
  await db.delete(globalRadarSearchQueries);
  await db.delete(globalRadarWatchlistEntries);
  await db.delete(globalEntities);
  await db.delete(globalRadarRuns);
  await db.delete(discoveryRuns);
}

type StrictMutationBatch = {
  signals: Array<{
    externalSignalId: string;
    rawMetadata: Record<string, unknown>;
    demandDomain: string;
    signalType: string;
    score: Record<string, unknown>;
    evidence: Array<{
      rawMetadata: Record<string, unknown>;
      claim: string;
    }>;
  }>;
};

beforeAll(async () => {
  await cleanRadarRows();
  const [administrator] = await db
    .insert(users)
    .values({ email: userEmail, name: "Radar test administrator" })
    .returning({ id: users.id });
  if (!administrator) throw new Error("Radar test administrator was not created.");
  administratorUserId = administrator.id;
});

beforeEach(async () => {
  queuedPlansByRunId.clear();
  claimedAtByRunId.clear();
  await cleanRadarRows();
});

afterAll(async () => {
  await cleanRadarRows();
  await db.delete(users).where(eq(users.id, administratorUserId));
  await closeDb();
});

describe("PostgreSQL Global Radar repository queue", () => {
  it("replays the same canonical run identity and rejects a changed request projection", async () => {
    const input = queueInput("idempotency");

    const queued = await repository.queueRun(input);
    const replayed = await repository.queueRun(input);
    const mismatch = await repository.queueRun({
      ...input,
      requestHash: HASH_C,
    });
    if (queued.outcome === "conflict") throw new Error("Fixture was not queued.");

    expect(queued).toMatchObject({ outcome: "queued" });
    expect(queued).toMatchObject({
      run: {
        promptVersion: GLOBAL_RADAR_PROMPT_VERSION,
        schemaVersion: GLOBAL_RADAR_SCHEMA_VERSION,
      },
    });
    expect(queued.run.promptVersion).not.toBe(
      (input.planSnapshot as { queryVersion: string }).queryVersion,
    );
    expect(queued.run.schemaVersion).not.toBe(
      (input.planSnapshot as { version: string }).version,
    );
    expect(replayed).toMatchObject({
      outcome: "replayed",
      run: { id: queued.run.id, externalRunKey: input.externalRunKey },
    });
    expect(mismatch).toEqual({ outcome: "conflict", reason: "invalid_input" });
    expect(JSON.stringify(mismatch)).not.toContain(HASH_A);
    expectSafeProjection(queued);
    expectSafeProjection(replayed);
    expectSafeProjection(mismatch);
  });

  it("returns invalid-input conflicts for malformed plans and manual identity", async () => {
    const administratorRequestId = randomUUID();
    const manual = queueInput("manual-valid", {
      trigger: "manual",
      scanMode: "manual",
      administratorRequestId,
      requestedByUserId: administratorUserId,
      requestedByEmail: userEmail,
    });

    await expect(repository.queueRun(manual)).resolves.toMatchObject({
      outcome: "queued",
    });
    await expect(
      repository.queueRun(
        queueInput("manual-missing", {
          trigger: "manual",
          scanMode: "manual",
        }),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun(
        queueInput("nonmanual-manual-mode", { scanMode: "manual" }),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun(
        queueInput("unknown-user", {
          trigger: "manual",
          scanMode: "manual",
          administratorRequestId: randomUUID(),
          requestedByUserId: randomUUID(),
          requestedByEmail: userEmail,
        }),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun(
        queueInput("oversized-plan", {
          planSnapshot: { value: "x".repeat(8_193) },
        }),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun(
        queueInput("uppercase-hash", { requestHash: HASH_A.toUpperCase() }),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun({
        ...queueInput("invalid-enum"),
        trigger: "unexpected",
      } as unknown as QueueGlobalRadarRunInput),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun({
        ...queueInput("invalid-array"),
        sourceCountries: [7],
      } as unknown as QueueGlobalRadarRunInput),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
  });

  it("rejects non-canonical, stale, and fingerprint-mismatched plans before writing", async () => {
    const cases = [
      {
        suffix: "plan-unknown-key",
        mutate(input: QueueGlobalRadarRunInput) {
          input.planSnapshot.unexpected = "not-in-the-published-plan";
        },
      },
      {
        suffix: "plan-stale-fingerprint",
        mutate(input: QueueGlobalRadarRunInput) {
          input.planSnapshot.resultLimit = 7;
        },
      },
      {
        suffix: "plan-supplied-fingerprint-mismatch",
        mutate(input: QueueGlobalRadarRunInput) {
          input.planFingerprint = HASH_C;
        },
      },
      {
        suffix: "plan-threshold-mutation",
        mutate(input: QueueGlobalRadarRunInput) {
          const thresholds = input.planSnapshot.thresholds as Record<
            string,
            unknown
          >;
          thresholds.direct_demand = 1;
        },
      },
    ] as const;

    for (const testCase of cases) {
      const input = queueInput(testCase.suffix);
      testCase.mutate(input);
      const [before] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(globalRadarRuns);

      await expect(repository.queueRun(input)).resolves.toEqual({
        outcome: "conflict",
        reason: "invalid_input",
      });
      const [after] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(globalRadarRuns);
      expect(after?.count).toBe(before?.count);
    }
  });

  it.each([
    ["external run key", (input: QueueGlobalRadarRunInput) => {
      input.externalRunKey = `${input.externalRunKey}:changed`;
    }],
    ["request hash", (input: QueueGlobalRadarRunInput) => {
      input.requestHash = HASH_C;
    }],
    ["source countries", (input: QueueGlobalRadarRunInput) => {
      input.sourceCountries = [...input.sourceCountries].reverse();
    }],
    ["source languages", (input: QueueGlobalRadarRunInput) => {
      input.sourceLanguages = [...input.sourceLanguages, "fr"];
    }],
    ["target domains", (input: QueueGlobalRadarRunInput) => {
      input.targetDomains = ["robotics"];
    }],
    ["target signal types", (input: QueueGlobalRadarRunInput) => {
      input.targetSignalTypes = ["direct_demand"];
    }],
    ["sources", (input: QueueGlobalRadarRunInput) => {
      input.sourcesUsed = ["public_web"];
    }],
    ["prompt version", (input: QueueGlobalRadarRunInput) => {
      input.promptVersion = "stale-query-v0";
    }],
    ["schema version", (input: QueueGlobalRadarRunInput) => {
      input.schemaVersion = "stale-plan-v0";
    }],
    ["taxonomy version", (input: QueueGlobalRadarRunInput) => {
      input.taxonomyVersion = "stale-taxonomy-v0";
    }],
    ["scoring version", (input: QueueGlobalRadarRunInput) => {
      input.scoringVersion = "stale-score-v0";
    }],
    ["trigger projection", (input: QueueGlobalRadarRunInput) => {
      input.trigger = "trial";
    }],
  ] as const)("rejects a mismatched canonical plan %s projection with zero writes", async (_field, mutate) => {
    const input = queueInput(`plan-projection-${_field}`);
    mutate(input);
    const [before] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(globalRadarRuns);

    await expect(repository.queueRun(input)).resolves.toEqual({
      outcome: "conflict",
      reason: "invalid_input",
    });
    const [after] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(globalRadarRuns);
    expect(after?.count).toBe(before?.count);
  });

  it("keeps Radar and Discovery external keys independent", async () => {
    const radarInput = queueInput("independent-key");
    const externalRunKey = radarInput.externalRunKey;
    const radar = await repository.queueRun(radarInput);

    const discovery = createDiscoveryRepository(db);
    await discovery.queueRun({
      externalRunKey,
      trigger: "scheduled",
      now: new Date("2026-07-29T04:00:00.000Z"),
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["public_web"],
      requestedCount: 1,
      companyPercentage: 100,
    });

    expect(radar).toMatchObject({
      outcome: "queued",
      run: { externalRunKey },
    });
    expect(
      await db
        .select({ id: globalRadarRuns.id })
        .from(globalRadarRuns)
        .where(eq(globalRadarRuns.externalRunKey, externalRunKey)),
    ).toHaveLength(1);
    expect(
      await db
        .select({ id: discoveryRuns.id })
        .from(discoveryRuns)
        .where(eq(discoveryRuns.externalRunKey, externalRunKey)),
    ).toHaveLength(1);
  });

});

describe("PostgreSQL Global Radar repository claiming", () => {
  it("prioritizes manual work and returns a one-time two-hour lease without public leakage", async () => {
    const now = new Date("2026-07-29T06:00:00.000Z");
    const manualInput = queueInput("manual", {
      trigger: "manual",
      scanMode: "manual",
      administratorRequestId: randomUUID(),
      requestedByUserId: administratorUserId,
      requestedByEmail: userEmail,
      now: new Date(now.getTime() + 1_000),
    });
    const privatePlanSnapshot = structuredClone(manualInput.planSnapshot);
    await repository.queueRun(queueInput("scheduled", { now }));
    await repository.queueRun(manualInput);
    await repository.queueRun(
      queueInput("trial", {
        trigger: "trial",
        scanMode: "thematic",
        now: new Date(now.getTime() - 1_000),
      }),
    );

    const claimed = await repository.claimRun({ now });

    expect(claimed).toMatchObject({
      outcome: "claimed",
      run: { trigger: "manual", status: "running" },
    });
    if (claimed.outcome !== "claimed") throw new Error("Radar run was not claimed.");
    expect(claimed.privateClaim).toMatchObject({
      leaseToken: expect.stringMatching(/^[a-f0-9]{64}$/),
      leaseExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
      planSnapshot: privatePlanSnapshot,
    });
    expect(claimed.privateClaim.planSnapshot).not.toBe(privatePlanSnapshot);
    expect(claimed.privateClaim.planSnapshot.thresholds).not.toBe(
      privatePlanSnapshot.thresholds,
    );
    const [stored] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claimed.run.id));
    expect(stored?.leaseTokenHash).toBe(
      hashLease(claimed.privateClaim.leaseToken),
    );
    expect(stored?.leaseTokenHash).not.toBe(
      plainSha256(claimed.privateClaim.leaseToken),
    );
    expect(stored?.leaseTokenHash).not.toBe(claimed.privateClaim.leaseToken);
    expect(stored?.leaseExpiresAt).toEqual(
      new Date(now.getTime() + 2 * 60 * 60 * 1_000),
    );
    const publicJson = JSON.stringify(claimed.run);
    for (const forbidden of [
      ...PRIVATE_PERSISTENCE_FIELDS,
      "requestedByUserId",
      stored?.leaseTokenHash,
    ]) {
      expect(publicJson).not.toContain(forbidden ?? "never-present");
    }
    (
      claimed.privateClaim.planSnapshot.thresholds as Record<string, unknown>
    ).direct_demand = 1;
    const [storedAfterMutation] = await db
      .select({ planSnapshot: globalRadarRuns.planSnapshot })
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claimed.run.id));
    expect(storedAfterMutation?.planSnapshot).toEqual(privatePlanSnapshot);
  });

  it("blocks on an active lease, then terminalizes expiry without requeueing", async () => {
    const now = new Date("2026-07-29T08:00:00.000Z");
    const firstQueue = await repository.queueRun(queueInput("expiring", { now }));
    if (firstQueue.outcome === "conflict") throw new Error("Fixture was not queued.");
    const firstClaim = await repository.claimRun({ now });
    expect(firstClaim.outcome).toBe("claimed");
    const secondQueue = await repository.queueRun(
      queueInput("after-expiry", { now: new Date(now.getTime() + 1_000) }),
    );
    if (secondQueue.outcome === "conflict") throw new Error("Fixture was not queued.");

    await expect(
      repository.claimRun({ now: new Date(now.getTime() + 60_000) }),
    ).resolves.toMatchObject({ outcome: "no_work", reason: "active_run" });

    const atExpiry = new Date(now.getTime() + 2 * 60 * 60 * 1_000);
    const secondClaim = await repository.claimRun({ now: atExpiry });
    expect(secondClaim).toMatchObject({
      outcome: "claimed",
      run: { id: secondQueue.run.id, externalRunKey: secondQueue.run.externalRunKey },
    });
    const [expired] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, firstQueue.run.id));
    expect(expired).toMatchObject({
      status: "failed",
      completedAt: atExpiry,
      errorSummary: {
        failure: {
          code: "lease_expired",
          message: "Global Radar run lease expired before completion.",
        },
      },
    });
    expect(expired?.status).not.toBe("queued");
  });

  it("allows only one of two concurrent Radar claims", async () => {
    const now = new Date("2026-07-29T10:00:00.000Z");
    await repository.queueRun(queueInput("concurrent-a", { now }));
    await repository.queueRun(
      queueInput("concurrent-b", { now: new Date(now.getTime() + 1) }),
    );
    const databases = [
      createIndependentDatabase(`radar-claim-a-${testRun}`),
      createIndependentDatabase(`radar-claim-b-${testRun}`),
    ];
    try {
      const results = await Promise.all(
        databases.map(({ database }) =>
          createGlobalRadarRepository(database, leaseCodec).claimRun({ now }),
        ),
      );
      expect(results.filter(({ outcome }) => outcome === "claimed")).toHaveLength(1);
      expect(results.filter(({ outcome }) => outcome === "no_work")).toHaveLength(1);
      expect(
        await db
          .select({ id: globalRadarRuns.id })
          .from(globalRadarRuns)
          .where(eq(globalRadarRuns.status, "running")),
      ).toHaveLength(1);
    } finally {
      await closeIndependentDatabases(databases);
    }
  });

  it("claims Radar while the Discovery advisory transaction lock remains held", async () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    await repository.queueRun(queueInput("cross-context", { now }));
    const databases = [
      createIndependentDatabase(`discovery-lock-holder-${testRun}`),
      createIndependentDatabase(`radar-independent-${testRun}`),
    ];
    let releaseDiscoveryLock!: () => void;
    let resolveDiscoveryLock!: () => void;
    let rejectDiscoveryLock!: (error: unknown) => void;
    const releaseSignal = new Promise<void>((resolve) => {
      releaseDiscoveryLock = resolve;
    });
    const lockAcquired = new Promise<void>((resolve, reject) => {
      resolveDiscoveryLock = resolve;
      rejectDiscoveryLock = reject;
    });
    const discoveryLockTransaction = databases[0]!.database
      .transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(1296385841, 1)`,
        );
        resolveDiscoveryLock();
        await releaseSignal;
      })
      .catch((error: unknown) => {
        rejectDiscoveryLock(error);
        throw error;
      });
    try {
      await lockAcquired;
      await databases[1]!.database.execute(sql`set lock_timeout = '500ms'`);
      const radarClaim = await createGlobalRadarRepository(
        databases[1]!.database,
        leaseCodec,
      ).claimRun({ now });
      expect(radarClaim.outcome).toBe("claimed");
    } finally {
      releaseDiscoveryLock();
      await discoveryLockTransaction;
      await closeIndependentDatabases(databases);
    }
  });
});

describe("PostgreSQL Global Radar repository failure and abandonment", () => {
  it("rejects pre-start fail and abandon clocks without lifecycle writes", async () => {
    const startedAt = new Date("2026-07-29T13:30:00.000Z");
    await repository.queueRun(queueInput("pre-start-terminal-clock", { now: startedAt }));
    const claim = await repository.claimRun({ now: startedAt });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const before = await runningPersistenceSnapshot(claim.run.id);
    const invalidNow = new Date(startedAt.getTime() - 1);

    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        now: invalidNow,
        reason: "clock moved backwards",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.abandonRun({
        runId: claim.run.id,
        now: invalidNow,
        reason: "clock moved backwards",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(before);
  });

  it("fails only an unexpired matching lease and replays the same canonical failure after expiry", async () => {
    const now = new Date("2026-07-29T14:00:00.000Z");
    await repository.queueRun(queueInput("worker-fail", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const failedAt = new Date(now.getTime() + 60_000);
    const queuedOther = await repository.queueRun(
      queueInput("worker-fail-queued", { now: failedAt }),
    );
    if (queuedOther.outcome === "conflict") throw new Error("Fixture was not queued.");

    await expect(
      repository.failRun({
        runId: queuedOther.run.id,
        leaseToken: "d".repeat(64),
        now: failedAt,
        reason: "cannot fail queued work",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_state" });

    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: "d".repeat(64),
        now: failedAt,
        reason: "worker stopped",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "lease_mismatch" });
    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: "malformed-token",
        now: failedAt,
        reason: "worker stopped",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    const failed = await repository.failRun({
      runId: claim.run.id,
      leaseToken: claim.privateClaim.leaseToken,
      now: failedAt,
      reason: "  worker   stopped  ",
    });
    expect(failed).toMatchObject({
      outcome: "completed",
      run: {
        status: "failed",
        failure: { code: "worker_failed", message: "worker stopped" },
      },
    });

    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        now: new Date(now.getTime() - 1),
        reason: "worker stopped",
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });

    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        now: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
        reason: "worker stopped",
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        now: failedAt,
        reason: "different reason",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "failure_mismatch" });
  });

  it("rejects expired fail leases and leaves Discovery runs unchanged", async () => {
    const now = new Date("2026-07-29T15:00:00.000Z");
    await repository.queueRun(queueInput("expired-fail", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const discoveryRepository = createDiscoveryRepository(db);
    const discovery = await discoveryRepository.queueRun({
      externalRunKey: `discovery-fail-unchanged-${testRun}`,
      trigger: "scheduled",
      now,
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["public_web"],
      requestedCount: 1,
      companyPercentage: 100,
    });

    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        now: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
        reason: "too late",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "lease_expired" });
    expect(await discoveryRepository.getRun(discovery.id)).toMatchObject({
      id: discovery.id,
      status: "queued",
    });
  });

  it("abandons only running Radar rows and replays only the same canonical reason", async () => {
    const now = new Date("2026-07-29T16:00:00.000Z");
    const queued = await repository.queueRun(queueInput("abandon", { now }));
    if (queued.outcome === "conflict") throw new Error("Fixture was not queued.");
    await expect(
      repository.abandonRun({
        runId: queued.run.id,
        now,
        reason: "lost claim file",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_state" });

    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const discoveryRepository = createDiscoveryRepository(db);
    const discovery = await discoveryRepository.queueRun({
      externalRunKey: `discovery-abandon-unchanged-${testRun}`,
      trigger: "scheduled",
      now,
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["public_web"],
      requestedCount: 1,
      companyPercentage: 100,
    });
    const abandoned = await repository.abandonRun({
      runId: claim.run.id,
      now: new Date(now.getTime() + 30_000),
      reason: "  lost   claim file ",
    });
    expect(abandoned).toMatchObject({
      outcome: "completed",
      run: {
        status: "failed",
        failure: { code: "abandoned", message: "lost claim file" },
      },
    });
    await expect(
      repository.abandonRun({
        runId: claim.run.id,
        now: new Date(now.getTime() - 1),
        reason: "lost claim file",
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      repository.abandonRun({
        runId: claim.run.id,
        now: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
        reason: "lost claim file",
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      repository.abandonRun({
        runId: claim.run.id,
        now,
        reason: "different reason",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "failure_mismatch" });
    expect(await discoveryRepository.getRun(discovery.id)).toMatchObject({
      id: discovery.id,
      status: "queued",
    });

    const terminalQueue = await repository.queueRun(
      queueInput("abandon-terminal", { now: new Date(now.getTime() + 60_000) }),
    );
    if (terminalQueue.outcome === "conflict") throw new Error("Fixture was not queued.");
    const terminalClaim = await repository.claimRun({
      now: new Date(now.getTime() + 60_000),
    });
    if (terminalClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    await repository.completeRun(
      completionInput(
        terminalClaim.run.id,
        terminalClaim.privateClaim.leaseToken,
        new Date(now.getTime() + 61_000),
      ),
    );
    await expect(
      repository.abandonRun({
        runId: terminalClaim.run.id,
        now: new Date(now.getTime() + 62_000),
        reason: "cannot abandon succeeded work",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_state" });
  });

  it("returns tagged expected conflicts without throwing", async () => {
    await expect(
      repository.failRun({
        runId: randomUUID(),
        leaseToken: "d".repeat(64),
        now: new Date("2026-07-29T17:00:00.000Z"),
        reason: "missing run",
      }),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      repository.abandonRun({
        runId: "not-a-uuid",
        now: new Date("2026-07-29T17:00:00.000Z"),
        reason: "missing run",
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
  });
});

describe("PostgreSQL Global Radar repository completion and safe reads", () => {
  it("rejects a pre-start completion clock for an honest-zero batch without writes", async () => {
    const startedAt = new Date("2026-07-29T17:15:00.000Z");
    await repository.queueRun(queueInput("complete-pre-start", { now: startedAt }));
    const claim = await repository.claimRun({ now: startedAt });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.entities = [];
    batch.signals = [];
    const canonicalBatch = rehashPersistenceBatch(batch);
    const graphBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(startedAt.getTime() - 1),
        ),
        submissionHash: canonicalBatch.canonicalSubmissionHash,
        batch: canonicalBatch,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    expect(await graphRowCounts()).toEqual(graphBefore);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(runBefore);
  });

  it("rejects completion of a queued nonterminal run as invalid state", async () => {
    const now = new Date("2026-07-29T17:30:00.000Z");
    const queued = await repository.queueRun(
      queueInput("complete-queued", { now }),
    );
    if (queued.outcome === "conflict") throw new Error("Fixture was not queued.");

    await expect(
      repository.completeRun(
        completionInput(queued.run.id, "d".repeat(64), now),
      ),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_state" });
    const [stored] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, queued.run.id));
    expect(stored).toMatchObject({
      status: "queued",
      submissionHash: null,
      batchFingerprint: null,
      errorSummary: {},
    });
  });

  it("validates the running lease, plan, hashes, counters, and expiry", async () => {
    const now = new Date("2026-07-29T18:00:00.000Z");
    await repository.queueRun(queueInput("complete-validation", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const completeAt = new Date(now.getTime() + 60_000);

    await expect(
      repository.completeRun(
        completionInput(claim.run.id, "d".repeat(64), completeAt),
      ),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "lease_mismatch" });
    await expect(
      repository.completeRun(
        completionInput(claim.run.id, "malformed-token", completeAt),
      ),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.completeRun(
        completionInput(claim.run.id, claim.privateClaim.leaseToken, completeAt, {
          planFingerprint: HASH_C,
        }),
      ),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "completion_identity_mismatch",
    });
    await expect(
      repository.completeRun(
        completionInput(claim.run.id, claim.privateClaim.leaseToken, completeAt, {
          submissionHash: HASH_A.toUpperCase(),
        }),
      ),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.completeRun(
        completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 2 * 60 * 60 * 1_000),
        ),
      ),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "lease_expired" });
  });

  it("replays exact terminal completion identity after expiry and rejects every changed identity", async () => {
    const now = new Date("2026-07-29T19:00:00.000Z");
    await repository.queueRun(queueInput("complete-replay", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const input = completionInput(
      claim.run.id,
      claim.privateClaim.leaseToken,
      new Date(now.getTime() + 60_000),
    );
    const completed = await repository.completeRun(input);
    expect(completed).toMatchObject({ outcome: "completed" });
    const [beforeReplay] = await db
      .select({ updatedAt: globalRadarRuns.updatedAt })
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));

    await expect(
      repository.completeRun({
        ...input,
        now: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      repository.completeRun({
        ...input,
        now: new Date(now.getTime() - 1),
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      repository.completeRun({
        ...input,
        now: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
        batch: { fictionalExample: true } as unknown as PersistableGlobalRadarBatch,
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      repository.completeRun({
        ...input,
        submissionHash: HASH_B,
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "completion_identity_mismatch",
    });
    for (const changed of [
      { leaseToken: "d".repeat(64) },
      { planFingerprint: HASH_C },
      { submissionHash: HASH_B },
    ]) {
      await expect(
        repository.completeRun({ ...input, ...changed }),
      ).resolves.toMatchObject({
        outcome: "conflict",
        reason: "completion_identity_mismatch",
      });
    }
    const [afterReplay] = await db
      .select({ updatedAt: globalRadarRuns.updatedAt })
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));
    expect(afterReplay?.updatedAt).toEqual(beforeReplay?.updatedAt);
  });

  it("derives all four terminal status cases, counters, and summaries from canonical batches", async () => {
    const cases = [
      { suffix: "zero-clean", signals: 0, errors: [], status: "succeeded" },
      {
        suffix: "zero-errors",
        signals: 0,
        errors: [{ sourceName: "Official source", message: "Timed out" }],
        status: "failed",
      },
      {
        suffix: "signals-errors",
        signals: 1,
        errors: [{ sourceName: "Official source", message: "Timed out" }],
        status: "partial",
      },
      { suffix: "signals-clean", signals: 1, errors: [], status: "succeeded" },
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const now = new Date(
        new Date("2026-07-29T20:00:00.000Z").getTime() + index * 60_000,
      );
      await repository.queueRun(queueInput(testCase.suffix, { now }));
      const claim = await repository.claimRun({ now });
      if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
      const batch = structuredClone(
        validPersistenceBatch(claim.run.id, {
          sourceUrl: `https://acme.example/${testCase.suffix}`,
          externalSignalId: `signal-${testCase.suffix}`,
        }),
      );
      if (testCase.signals === 0) {
        batch.entities = [];
        batch.signals = [];
      }
      const plannedQuery = batch.executedQueries[0];
      if (!plannedQuery) throw new Error("Test Radar plan generated no queries.");
      batch.executedQueries[0] = {
        ...plannedQuery,
        executedAt: new Date(now.getTime() + 500).toISOString(),
        resultsExamined: 5,
        error: null,
      };
      batch.sourceErrors = testCase.errors.map((sourceError) => ({
        ...sourceError,
        queryFingerprint: plannedQuery.fingerprint,
      }));
      batch.rejections = { insufficient_evidence: 1 };
      const canonicalBatch = rehashPersistenceBatch(batch);
      const result = await repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: canonicalBatch.canonicalSubmissionHash,
        batch: canonicalBatch,
      });
      expect(result).toMatchObject({
        outcome: "completed",
        run: {
          status: testCase.status,
          numberResultsExamined: 5,
          numberSignalsFound: testCase.signals,
          numberSourceErrors: testCase.errors.length,
          numberRejectedForWeakEvidence: 1,
          ...(testCase.errors.length > 0
            ? { sourceErrors: testCase.errors }
            : {}),
        },
      });
      const [stored] = await db
        .select()
        .from(globalRadarRuns)
        .where(eq(globalRadarRuns.id, claim.run.id));
      expect(stored).toMatchObject({
        status: testCase.status,
        numberSignalsFound: testCase.signals,
        numberSourceErrors: testCase.errors.length,
        errorSummary: {
          ...(testCase.status === "failed"
            ? {
                failure: {
                  code: "completion_failed",
                  message: "Global Radar completed with source errors and no signals.",
                },
              }
            : {}),
          sourceErrors: testCase.errors,
          rejections: { insufficient_evidence: 1 },
        },
      });
    }
    expect(await db.select().from(globalRadarSearchQueries)).toHaveLength(
      cases.length * generateGlobalRadarQueries(TEST_RADAR_PLAN).length,
    );
    expect(await db.select().from(globalRadarSignals)).toHaveLength(2);
  });

  it("accepts exactly fifty bounded source errors with exact counters and summary", async () => {
    const now = new Date("2026-07-30T00:00:00.000Z");
    const sourceErrors = Array.from({ length: 50 }, (_, index) => ({
      sourceName: `Source ${index}`,
      message: "Temporarily unavailable",
    }));
    const queued = await repository.queueRun(
      queueInput("source-errors-fifty", { now }),
    );
    if (queued.outcome === "conflict") throw new Error("Fixture was not queued.");
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.sourceErrors = sourceErrors.map((sourceError) => ({
      ...sourceError,
      queryFingerprint: null,
    }));
    const canonicalBatch = rehashPersistenceBatch(batch);

    const result = await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
      ),
      submissionHash: canonicalBatch.canonicalSubmissionHash,
      batch: canonicalBatch,
    });
    expect(result).toMatchObject({
      outcome: "completed",
      run: {
        status: "partial",
        numberSourceErrors: 50,
        sourceErrors,
      },
    });
    expectSafeProjection(result);
    const [stored] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));
    expect(stored).toMatchObject({
      status: "partial",
      numberSourceErrors: 50,
      errorSummary: { sourceErrors },
    });
  });

  it("rejects fifty-one source errors without mutating the running row", async () => {
    await expectRejectedSourceErrorsLeaveRunUnchanged(
      "source-errors-fifty-one",
      Array.from({ length: 51 }, (_, index) => ({
        sourceName: `Source ${index}`,
        message: "Unavailable",
      })),
    );
  });

  it.each([
    {
      boundary: "source name over 200 characters",
      sourceError: { sourceName: "s".repeat(201), message: "Unavailable" },
    },
    {
      boundary: "message over 1000 characters",
      sourceError: { sourceName: "Source", message: "m".repeat(1_001) },
    },
  ])("rejects $boundary without mutating the running row", async ({ sourceError }) => {
    await expectRejectedSourceErrorsLeaveRunUnchanged(
      `source-error-field-${sourceError.sourceName.length}-${sourceError.message.length}`,
      [sourceError],
    );
  });

  it("rejects an individually valid source-error summary over 8192 bytes without mutation", async () => {
    await expectRejectedSourceErrorsLeaveRunUnchanged(
      "source-errors-summary-bytes",
      Array.from({ length: 9 }, (_, index) => ({
        sourceName: `Source ${index}`,
        message: "m".repeat(1_000),
      })),
    );
  });

  it("returns bounded safe get/list models and tagged read conflicts", async () => {
    const now = new Date("2026-07-29T22:00:00.000Z");
    const first = await repository.queueRun(queueInput("read-a", { now }));
    const second = await repository.queueRun(
      queueInput("read-b", { now: new Date(now.getTime() + 1_000) }),
    );
    const third = await repository.queueRun(
      queueInput("read-c", { now: new Date(now.getTime() + 2_000) }),
    );
    if (
      first.outcome === "conflict" ||
      second.outcome === "conflict" ||
      third.outcome === "conflict"
    ) {
      throw new Error("Fixture was not queued.");
    }

    const found = await repository.getRun(first.run.id);
    expect(found).toMatchObject({
      outcome: "found",
      run: { id: first.run.id },
    });
    expectSafeProjection(found);
    await expect(repository.getRun(randomUUID())).resolves.toEqual({
      outcome: "not_found",
    });
    await expect(repository.getRun("bad-id")).resolves.toEqual({
      outcome: "conflict",
      reason: "invalid_input",
    });
    const listed = await repository.listRuns({ limit: 2 });
    expect(listed).toMatchObject({ outcome: "listed" });
    if (listed.outcome !== "listed") throw new Error("Runs were not listed.");
    expectSafeProjection(listed);
    expect(listed.runs).toHaveLength(2);
    expect(listed.runs.map(({ externalRunKey }) => externalRunKey)).toEqual([
      third.run.externalRunKey,
      second.run.externalRunKey,
    ]);
    await expect(repository.listRuns({ limit: 101 })).resolves.toEqual({
      outcome: "conflict",
      reason: "invalid_input",
    });
    for (const run of listed.runs) {
      expectSafeProjection(run);
    }
  });
});

describe("PostgreSQL Global Radar transactional entity resolution", () => {
  it("creates an automatically observed entity only with its first valid signal", async () => {
    const now = new Date("2026-07-30T02:00:00.000Z");
    await repository.queueRun(queueInput("entity-first-signal", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = validPersistenceBatch(claim.run.id);
    const parsedBatch = persistableGlobalRadarBatchObjectSchema.safeParse(batch);
    if (!parsedBatch.success) {
      throw new Error(JSON.stringify(parsedBatch.error.issues, null, 2));
    }
    expect(canonicalizeGlobalRadarPersistenceBatch(batch)).toMatchObject({
      valid: true,
    });

    const completed = await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 60_000),
      ),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });

    expect(completed).toMatchObject({
      outcome: "completed",
      run: {
        numberEntitiesObserved: 1,
        numberSignalsFound: 1,
        numberDirectDemands: 1,
        numberNew: 1,
      },
    });
    const [entity] = await db.select().from(globalEntities);
    const [signal] = await db.select().from(globalRadarSignals);
    expect(entity).toMatchObject({
      canonicalName: "Acme Robotics",
      canonicalDomain: "acme.example",
      websiteUrl: "https://acme.example",
      linkedinUrl: "https://linkedin.com/company/acme-robotics",
      stablePublicIdentifiers: expect.arrayContaining([
        "domain:acme.example",
        "linkedin:https://linkedin.com/company/acme-robotics",
        "public:official_registry:acme-robotics",
      ]),
    });
    expect(signal).toMatchObject({
      globalEntityId: entity?.id,
      signalClass: "direct_demand",
      dedupeVersion: GLOBAL_RADAR_DEDUPE_VERSION,
      firstRunId: claim.run.id,
      mostRecentRunId: claim.run.id,
    });
  });

  it("reuses one canonical identity owner and updates only safe automated entity fields", async () => {
    const firstNow = new Date("2026-07-30T03:00:00.000Z");
    await repository.queueRun(queueInput("entity-owner-first", { now: firstNow }));
    const firstClaim = await repository.claimRun({ now: firstNow });
    if (firstClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const firstBatch = validPersistenceBatch(firstClaim.run.id);
    await repository.completeRun({
      ...completionInput(
        firstClaim.run.id,
        firstClaim.privateClaim.leaseToken,
        new Date(firstNow.getTime() + 1_000),
      ),
      submissionHash: firstBatch.canonicalSubmissionHash,
      batch: firstBatch,
    });
    const [firstEntity] = await db.select().from(globalEntities);
    if (!firstEntity) throw new Error("First entity was not persisted.");
    await db
      .update(globalEntities)
      .set({ entityStatus: "monitoring", revision: 7 })
      .where(eq(globalEntities.id, firstEntity.id));

    const secondNow = new Date("2026-08-06T03:00:00.000Z");
    await repository.queueRun(queueInput("entity-owner-second", { now: secondNow }));
    const secondClaim = await repository.claimRun({ now: secondNow });
    if (secondClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const secondBatch = validPersistenceBatch(secondClaim.run.id, {
      entityName: "Acme Robotics Incorporated",
      websiteUrl: "http://www.acme.example/news",
      linkedinOrganizationUrl: null,
      stableIdentifierValue: "acme-second-source",
      observedAt: "2026-08-06T03:01:00.000Z",
      sourceUrl: "https://acme.example/public-request-update",
      externalSignalId: "signal-acme-request-week-two",
    });
    await repository.completeRun({
      ...completionInput(
        secondClaim.run.id,
        secondClaim.privateClaim.leaseToken,
        new Date(secondNow.getTime() + 1_000),
      ),
      submissionHash: secondBatch.canonicalSubmissionHash,
      batch: secondBatch,
    });

    const entities = await db.select().from(globalEntities);
    expect(entities).toHaveLength(1);
    expect(entities[0]).toMatchObject({
      id: firstEntity.id,
      canonicalName: "Acme Robotics Incorporated",
      entityStatus: "monitoring",
      revision: 7,
      lastSeenAt: new Date("2026-08-06T03:01:00.000Z"),
      stablePublicIdentifiers: expect.arrayContaining([
        "public:official_registry:acme-robotics",
        "public:official_registry:acme-second-source",
      ]),
    });
  });

  it("merges proven aliases from a late older observation without rolling canonical entity facts or timestamps backward", async () => {
    const newerRunAt = new Date("2026-08-06T03:00:00.000Z");
    await repository.queueRun(queueInput("entity-newer-facts", { now: newerRunAt }));
    const newerClaim = await repository.claimRun({ now: newerRunAt });
    if (newerClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const newerBatch = structuredClone(
      validPersistenceBatch(newerClaim.run.id, {
        entityName: "Acme Robotics Current",
        observedAt: "2026-08-06T03:01:00.000Z",
        externalSignalId: "signal-current-entity-facts",
      }),
    );
    const newerEntity = newerBatch.entities[0]!;
    newerEntity.headquartersCity = "Bengaluru";
    newerEntity.operatingCountries = ["India", "United States"];
    newerEntity.organisationType = "robotics_company";
    newerEntity.sector = "embodied_ai";
    newerEntity.shortDescription = "Current evidence-backed entity description.";
    newerEntity.rawMetadata = { factVersion: "newer" };
    const canonicalNewerBatch = rehashPersistenceBatch(newerBatch);
    await repository.completeRun({
      ...completionInput(
        newerClaim.run.id,
        newerClaim.privateClaim.leaseToken,
        new Date("2026-08-06T03:02:00.000Z"),
      ),
      submissionHash: canonicalNewerBatch.canonicalSubmissionHash,
      batch: canonicalNewerBatch,
    });
    const [currentOwner] = await db.select().from(globalEntities);
    if (!currentOwner) throw new Error("Current entity owner was not persisted.");

    const lateRunAt = new Date("2026-08-07T03:00:00.000Z");
    await repository.queueRun(queueInput("entity-late-older-facts", { now: lateRunAt }));
    const lateClaim = await repository.claimRun({ now: lateRunAt });
    if (lateClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const lateBatch = structuredClone(
      validPersistenceBatch(lateClaim.run.id, {
        entityName: "Acme Robotics Stale Name",
        observedAt: "2026-07-30T03:01:00.000Z",
        externalSignalId: "signal-late-older-entity-facts",
      }),
    );
    const lateEntity = lateBatch.entities[0]!;
    lateEntity.websiteUrl = null;
    lateEntity.linkedinOrganizationUrl = null;
    lateEntity.stablePublicIdentifiers = [
      { namespace: "official_registry", value: "acme-robotics" },
      { namespace: "official_registry", value: "acme-late-proven-alias" },
    ];
    lateEntity.headquartersCountry = "Canada";
    lateEntity.headquartersCity = "Toronto";
    lateEntity.operatingCountries = ["Canada"];
    lateEntity.organisationType = "stale_company_type";
    lateEntity.sector = "stale_sector";
    lateEntity.shortDescription = "Stale late-arriving entity description.";
    lateEntity.rawMetadata = { factVersion: "older" };
    const canonicalLateBatch = rehashPersistenceBatch(lateBatch);
    await repository.completeRun({
      ...completionInput(
        lateClaim.run.id,
        lateClaim.privateClaim.leaseToken,
        new Date("2026-08-07T03:02:00.000Z"),
      ),
      submissionHash: canonicalLateBatch.canonicalSubmissionHash,
      batch: canonicalLateBatch,
    });

    const [ownerAfterLateArrival] = await db.select().from(globalEntities);
    expect(ownerAfterLateArrival).toMatchObject({
      id: currentOwner.id,
      canonicalName: "Acme Robotics Current",
      normalizedName: "acme robotics current",
      headquartersCountry: "us",
      headquartersCity: "Bengaluru",
      operatingCountries: ["India", "United States"],
      organisationType: "robotics_company",
      sector: "embodied_ai",
      shortDescription: "Current evidence-backed entity description.",
      rawMetadata: { factVersion: "newer" },
      stablePublicIdentifiers: expect.arrayContaining([
        "public:official_registry:acme-robotics",
        "public:official_registry:acme-late-proven-alias",
      ]),
      publicIdentityAnchor: currentOwner.publicIdentityAnchor,
      lastSeenAt: new Date("2026-08-06T03:01:00.000Z"),
      updatedAt: new Date("2026-08-06T03:01:00.000Z"),
    });
  });

  it("keeps a same-name same-country observation distinct and records explicit merge candidates", async () => {
    const firstNow = new Date("2026-07-30T04:00:00.000Z");
    await repository.queueRun(queueInput("name-candidate-first", { now: firstNow }));
    const firstClaim = await repository.claimRun({ now: firstNow });
    if (firstClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const firstBatch = validPersistenceBatch(firstClaim.run.id);
    await repository.completeRun({
      ...completionInput(
        firstClaim.run.id,
        firstClaim.privateClaim.leaseToken,
        new Date(firstNow.getTime() + 1_000),
      ),
      submissionHash: firstBatch.canonicalSubmissionHash,
      batch: firstBatch,
    });
    const [firstEntity] = await db.select().from(globalEntities);
    if (!firstEntity) throw new Error("First entity was not persisted.");

    const secondNow = new Date("2026-08-06T04:00:00.000Z");
    await repository.queueRun(queueInput("name-candidate-second", { now: secondNow }));
    const secondClaim = await repository.claimRun({ now: secondNow });
    if (secondClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const secondBatch = validPersistenceBatch(secondClaim.run.id, {
      entityRef: "entity-acme-distinct",
      websiteUrl: "https://acme-distinct.example",
      linkedinOrganizationUrl:
        "https://www.linkedin.com/company/acme-distinct-robotics/",
      stableIdentifierValue: "acme-distinct-robotics",
      observedAt: "2026-08-06T04:01:00.000Z",
      sourceUrl: "https://acme-distinct.example/public-request",
      externalSignalId: "signal-acme-distinct-request",
    });
    await repository.completeRun({
      ...completionInput(
        secondClaim.run.id,
        secondClaim.privateClaim.leaseToken,
        new Date(secondNow.getTime() + 1_000),
      ),
      submissionHash: secondBatch.canonicalSubmissionHash,
      batch: secondBatch,
    });

    const entities = await db
      .select()
      .from(globalEntities)
      .orderBy(globalEntities.createdAt);
    expect(entities).toHaveLength(2);
    expect(entities[1]).toMatchObject({
      normalizedName: entities[0]?.normalizedName,
      headquartersCountry: entities[0]?.headquartersCountry,
      rawMetadata: {
        identityMergeCandidateEntityIds: [firstEntity.id],
      },
    });
  });

  it("counts distinct resolved canonical owners rather than worker entity references", async () => {
    const now = new Date("2026-07-30T04:30:00.000Z");
    await repository.queueRun(queueInput("entity-owner-count", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.entities.push({
      ...batch.entities[0]!,
      entityRef: "entity-acme-alias",
    });
    const aliasSignal = structuredClone(batch.signals[0]!);
    aliasSignal.externalSignalId = "signal-acme-alias";
    aliasSignal.primaryEntityRef = "entity-acme-alias";
    aliasSignal.evidence.forEach((evidence) => {
      evidence.contributorEntityRef = "entity-acme-alias";
    });
    batch.signals.push(aliasSignal);
    const canonicalBatch = rehashPersistenceBatch(batch);

    const completed = await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
      ),
      submissionHash: canonicalBatch.canonicalSubmissionHash,
      batch: canonicalBatch,
    });

    expect(completed).toMatchObject({
      outcome: "completed",
      run: {
        numberEntitiesObserved: 1,
        numberSignalsFound: 2,
      },
    });
    expect(await db.select().from(globalEntities)).toHaveLength(1);
    expect(await db.select().from(globalRadarSignals)).toHaveLength(1);
  });

  it("serializes concurrent stable-identifier resolution to one owner", async () => {
    const now = new Date("2026-07-30T04:45:00.000Z");
    const firstRun = await repository.queueRun(
      queueInput("entity-stable-race-a", { now }),
    );
    const secondRun = await repository.queueRun(
      queueInput("entity-stable-race-b", {
        now: new Date(now.getTime() + 1),
      }),
    );
    if (firstRun.outcome === "conflict" || secondRun.outcome === "conflict") {
      throw new Error("Concurrent entity fixtures were not queued.");
    }
    const batches = [firstRun.run.id, secondRun.run.id].map((runId, index) => {
      const batch = structuredClone(
        validPersistenceBatch(runId, {
          entityRef: `stable-owner-${index}`,
          websiteUrl: `https://temporary-${index}.example`,
          linkedinOrganizationUrl: null,
          stableIdentifierValue: "shared-stable-owner",
          sourceUrl: `https://source-${index}.example/request`,
          externalSignalId: `stable-race-signal-${index}`,
        }),
      );
      batch.entities[0]!.websiteUrl = null;
      return rehashPersistenceBatch(batch);
    });
    const canonicalBatches = batches.map((batch) => {
      const canonical = canonicalizeGlobalRadarPersistenceBatch(batch);
      if (!canonical.valid) throw new Error("Concurrent batch was not canonical.");
      return canonical.batch;
    });
    const databases = [
      createIndependentDatabase(`global-radar-stable-a-${testRun}`),
      createIndependentDatabase(`global-radar-stable-b-${testRun}`),
    ];
    let releaseFirst = () => {};
    let markFirstReady = () => {};
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstReady = new Promise<void>((resolve) => {
      markFirstReady = resolve;
    });

    try {
      const first = databases[0]!.database.transaction(async (transaction) => {
        const result = await persistGlobalRadarBatch(
          transaction,
          canonicalBatches[0]!,
        );
        markFirstReady();
        await firstGate;
        return result;
      });
      await firstReady;
      const second = databases[1]!.database.transaction((transaction) =>
        persistGlobalRadarBatch(transaction, canonicalBatches[1]!),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      releaseFirst();
      await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    } finally {
      releaseFirst();
      await closeIndependentDatabases(databases);
    }

    const owners = await db
      .select()
      .from(globalEntities)
      .where(
        sql`${globalEntities.stablePublicIdentifiers} && ARRAY['public:official_registry:shared-stable-owner']::text[]`,
      );
    expect(owners).toHaveLength(1);
  });

  it("rolls back the whole completion when canonical identifiers have multiple owners", async () => {
    const now = new Date("2026-07-30T05:00:00.000Z");
    const [domainOwner] = await db
      .insert(globalEntities)
      .values({
        canonicalName: "Domain Owner",
        normalizedName: "domain owner",
        canonicalDomain: "acme.example",
        websiteUrl: "https://acme.example",
        stablePublicIdentifiers: ["domain:acme.example"],
        publicIdentityAnchor: createGlobalRadarFingerprint({
          version: "global-radar-public-identity-anchor-v1",
          publicIdentifier: "domain:acme.example",
        }),
        headquartersCountry: "us",
        organisationType: "company",
        sector: "robotics",
        shortDescription: "Owns the canonical domain.",
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    const [linkedinOwner] = await db
      .insert(globalEntities)
      .values({
        canonicalName: "LinkedIn Owner",
        normalizedName: "linkedin owner",
        linkedinUrl: "https://linkedin.com/company/acme-robotics",
        stablePublicIdentifiers: [
          "linkedin:https://linkedin.com/company/acme-robotics",
        ],
        publicIdentityAnchor: createGlobalRadarFingerprint({
          version: "global-radar-public-identity-anchor-v1",
          publicIdentifier:
            "linkedin:https://linkedin.com/company/acme-robotics",
        }),
        headquartersCountry: "us",
        organisationType: "company",
        sector: "robotics",
        shortDescription: "Owns the canonical LinkedIn identity.",
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!domainOwner || !linkedinOwner) throw new Error("Owners were not created.");
    await repository.queueRun(queueInput("entity-owner-conflict", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = validPersistenceBatch(claim.run.id);
    const rowsBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: batch.canonicalSubmissionHash,
        batch,
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "entity_identity_conflict",
      run: { id: claim.run.id, status: "running" },
    });
    expect(await graphRowCounts()).toEqual(rowsBefore);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(runBefore);
  });
});

describe("PostgreSQL Global Radar signal deduplication and history", () => {
  it("derives the same pure key across entity-reference and input ordering changes", () => {
    const batch = structuredClone(validPersistenceBatch(randomUUID()));
    for (const [entityRef, name, domain] of [
      ["entity-beta", "Beta Robotics", "beta.example"],
      ["entity-gamma", "Gamma Robotics", "gamma.example"],
    ] as const) {
      batch.entities.push({
        ...batch.entities[0]!,
        entityRef,
        canonicalName: name,
        websiteUrl: `https://${domain}`,
        linkedinOrganizationUrl: null,
        stablePublicIdentifiers: [
          { namespace: "official_registry", value: entityRef },
        ],
        canonicalCorporateGroupId: `group:${entityRef}`,
      });
      batch.signals[0]!.associatedEntities.push({
        entityRef,
        role: "supporting",
        confidence: 80,
      });
    }
    const secondPrimaryUrl = "https://zeta.example/acme-primary-source";
    batch.signals[0]!.evidence.push({
      ...batch.signals[0]!.evidence[0]!,
      sourceUrl: secondPrimaryUrl,
      canonicalSourceUrl: secondPrimaryUrl,
      evidenceFingerprint: createEvidenceFingerprint({
        sourceUrl: secondPrimaryUrl,
        canonicalSourceUrl: secondPrimaryUrl,
        isPrimarySource: true,
      }),
    });
    const canonical = rehashPersistenceBatch(batch);
    const aliased = structuredClone(canonical);
    const aliases = new Map([
      ["entity-acme", "observed-primary"],
      ["entity-beta", "observed-support-b"],
      ["entity-gamma", "observed-support-a"],
    ]);
    aliased.entities.forEach((entity) => {
      entity.entityRef = aliases.get(entity.entityRef) ?? entity.entityRef;
    });
    aliased.entities.reverse();
    const signal = aliased.signals[0]!;
    signal.primaryEntityRef = aliases.get(signal.primaryEntityRef ?? "") ?? null;
    signal.associatedEntities.forEach((association) => {
      association.entityRef = aliases.get(association.entityRef) ?? association.entityRef;
    });
    signal.associatedEntities.reverse();
    signal.evidence.forEach((evidence) => {
      if (evidence.contributorEntityRef !== null) {
        evidence.contributorEntityRef =
          aliases.get(evidence.contributorEntityRef) ??
          evidence.contributorEntityRef;
      }
    });
    signal.evidence.reverse();
    const reAliased = rehashPersistenceBatch(aliased);
    const enriched = structuredClone(canonical);
    enriched.entities.find(({ entityRef }) => entityRef === "entity-acme")!
      .stablePublicIdentifiers.push({
        namespace: "official_registry",
        value: "newly-observed-alias",
      });
    const reEnriched = rehashPersistenceBatch(enriched);

    expect(reAliased.signals[0]?.dedupeKey).toBe(
      canonical.signals[0]?.dedupeKey,
    );
    expect(reEnriched.signals[0]?.dedupeKey).toBe(
      canonical.signals[0]?.dedupeKey,
    );
    expect(canonicalizeGlobalRadarPersistenceBatch(reAliased)).toMatchObject({
      valid: true,
    });
  });

  it("rejects a caller-provided dedupe key even when the outer batch hash matches", () => {
    const batch = structuredClone(validPersistenceBatch(randomUUID()));
    batch.signals[0]!.dedupeKey = HASH_C;
    const { canonicalSubmissionHash, ...hashableBatch } = batch;
    if (!canonicalSubmissionHash) throw new Error("Fixture hash was missing.");
    batch.canonicalSubmissionHash =
      createGlobalRadarPersistenceHash(hashableBatch);

    expect(canonicalizeGlobalRadarPersistenceBatch(batch)).toEqual({
      valid: false,
      reason: "invalid_batch",
    });
  });

  it("deduplicates through the resolved durable owner when a later observation has only an alternate alias", async () => {
    const firstNow = new Date("2026-07-30T05:30:00.000Z");
    await repository.queueRun(queueInput("resolved-owner-dedupe-first", { now: firstNow }));
    const firstClaim = await repository.claimRun({ now: firstNow });
    if (firstClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const firstBatch = validPersistenceBatch(firstClaim.run.id, {
      observedAt: "2026-07-30T05:30:30.000Z",
      sourceUrl: "https://acme.example/public-request",
    });
    await repository.completeRun({
      ...completionInput(
        firstClaim.run.id,
        firstClaim.privateClaim.leaseToken,
        new Date("2026-07-30T05:31:00.000Z"),
      ),
      submissionHash: firstBatch.canonicalSubmissionHash,
      batch: firstBatch,
    });
    const [firstOwner] = await db.select().from(globalEntities);
    if (!firstOwner) throw new Error("Resolved owner was not persisted.");

    const secondNow = new Date("2026-08-01T05:30:00.000Z");
    await repository.queueRun(queueInput("resolved-owner-dedupe-second", { now: secondNow }));
    const secondClaim = await repository.claimRun({ now: secondNow });
    if (secondClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const secondBatch = structuredClone(
      validPersistenceBatch(secondClaim.run.id, {
        observedAt: "2026-08-01T05:30:30.000Z",
        sourceUrl: "https://acme.example/public-request",
        externalSignalId: "signal-acme-request-alternate-alias",
      }),
    );
    secondBatch.entities[0]!.websiteUrl = null;
    secondBatch.entities[0]!.linkedinOrganizationUrl = null;
    const alternateAliasBatch = rehashPersistenceBatch(secondBatch);
    expect(alternateAliasBatch.signals[0]!.dedupeKey).not.toBe(
      firstBatch.signals[0]!.dedupeKey,
    );

    await repository.completeRun({
      ...completionInput(
        secondClaim.run.id,
        secondClaim.privateClaim.leaseToken,
        new Date("2026-08-01T05:31:00.000Z"),
      ),
      submissionHash: alternateAliasBatch.canonicalSubmissionHash,
      batch: alternateAliasBatch,
    });

    const owners = await db.select().from(globalEntities);
    expect(owners).toHaveLength(1);
    expect(owners[0]?.publicIdentityAnchor).toBe(
      firstOwner.publicIdentityAnchor,
    );
    expect(await db.select().from(globalRadarSignals)).toHaveLength(1);
    const updates = await db.select().from(globalSignalUpdates);
    expect(updates.map(({ updateType }) => updateType)).toEqual(
      expect.arrayContaining(["created", "rediscovered"]),
    );
  });

  it("rediscovery updates the active owner when a merged row retains the same dedupe key", async () => {
    const firstNow = new Date("2026-07-30T05:40:00.000Z");
    await repository.queueRun(queueInput("active-dedupe-owner-first", { now: firstNow }));
    const firstClaim = await repository.claimRun({ now: firstNow });
    if (firstClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const firstBatch = validPersistenceBatch(firstClaim.run.id, {
      observedAt: "2026-07-30T05:40:30.000Z",
    });
    await repository.completeRun({
      ...completionInput(
        firstClaim.run.id,
        firstClaim.privateClaim.leaseToken,
        new Date("2026-07-30T05:41:00.000Z"),
      ),
      submissionHash: firstBatch.canonicalSubmissionHash,
      batch: firstBatch,
    });
    const [mergedRow] = await db.select().from(globalRadarSignals);
    if (!mergedRow) throw new Error("Initial signal was not persisted.");
    const { id: _mergedId, ...activeCopy } = mergedRow;
    void _mergedId;
    const [activeOwner] = await db
      .insert(globalRadarSignals)
      .values({ ...activeCopy, dedupeKey: HASH_C })
      .returning();
    if (!activeOwner) throw new Error("Active dedupe owner was not created.");
    await db
      .update(globalRadarSignals)
      .set({ mergedIntoSignalId: activeOwner.id })
      .where(eq(globalRadarSignals.id, mergedRow.id));
    await db
      .update(globalRadarSignals)
      .set({ dedupeKey: mergedRow.dedupeKey })
      .where(eq(globalRadarSignals.id, activeOwner.id));

    const secondNow = new Date("2026-08-01T05:40:00.000Z");
    await repository.queueRun(queueInput("active-dedupe-owner-second", { now: secondNow }));
    const secondClaim = await repository.claimRun({ now: secondNow });
    if (secondClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const secondBatch = validPersistenceBatch(secondClaim.run.id, {
      observedAt: "2026-08-01T05:40:30.000Z",
      externalSignalId: "signal-active-owner-refresh",
    });
    const completed = await repository.completeRun({
      ...completionInput(
        secondClaim.run.id,
        secondClaim.privateClaim.leaseToken,
        new Date("2026-08-01T05:41:00.000Z"),
      ),
      submissionHash: secondBatch.canonicalSubmissionHash,
      batch: secondBatch,
    });
    expect(completed).toMatchObject({
      outcome: "completed",
      run: { numberUpdated: 1, numberNew: 0 },
    });

    const [unchangedMerged] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, mergedRow.id));
    const [updatedActive] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, activeOwner.id));
    expect(unchangedMerged).toMatchObject({
      mostRecentRunId: firstClaim.run.id,
      mergedIntoSignalId: activeOwner.id,
    });
    expect(updatedActive).toMatchObject({
      mostRecentRunId: secondClaim.run.id,
      mergedIntoSignalId: null,
      lastSeenAt: new Date("2026-08-01T05:40:30.000Z"),
    });
  });

  it("attaches mirrored evidence and preserves human-owned status, expiry, revision, and notes", async () => {
    const firstNow = new Date("2026-07-30T06:00:00.000Z");
    await repository.queueRun(queueInput("signal-history-first", { now: firstNow }));
    const firstClaim = await repository.claimRun({ now: firstNow });
    if (firstClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const firstBatch = validPersistenceBatch(firstClaim.run.id, {
      observedAt: "2026-07-30T06:01:00.000Z",
    });
    await repository.completeRun({
      ...completionInput(
        firstClaim.run.id,
        firstClaim.privateClaim.leaseToken,
        new Date(firstNow.getTime() + 1_000),
      ),
      submissionHash: firstBatch.canonicalSubmissionHash,
      batch: firstBatch,
    });
    const [createdSignal] = await db.select().from(globalRadarSignals);
    if (!createdSignal) throw new Error("Signal was not persisted.");
    const humanExpiry = new Date("2026-08-15T00:00:00.000Z");
    await db
      .update(globalRadarSignals)
      .set({
        status: "qualified",
        expiresAt: humanExpiry,
        revision: 9,
      })
      .where(eq(globalRadarSignals.id, createdSignal.id));
    const [note] = await db
      .insert(globalSignalUpdates)
      .values({
        signalId: createdSignal.id,
        updateType: "note_appended",
        actorType: "administrator",
        actorId: administratorUserId,
        actorEmail: userEmail,
        reason: "Keep the qualified review decision.",
        observedAt: new Date("2026-07-30T06:02:00.000Z"),
        idempotencyKey: `note:${testRun}`,
      })
      .returning();
    if (!note) throw new Error("Admin note fixture was not created.");

    const secondNow = new Date("2026-07-30T07:00:00.000Z");
    await repository.queueRun(queueInput("signal-history-second", { now: secondNow }));
    const secondClaim = await repository.claimRun({ now: secondNow });
    if (secondClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const secondBatch = structuredClone(
      validPersistenceBatch(secondClaim.run.id, {
        observedAt: "2026-07-30T07:01:00.000Z",
      }),
    );
    const signal = secondBatch.signals[0]!;
    signal.factualSummary =
      "Acme expanded its public request to cover a second reviewed workflow.";
    signal.interpretationSummary =
      "Mewtuals interprets the expanded request as a broader current demand.";
    signal.title = "Acme expands its reviewed teleoperation request";
    signal.collectionGeographies = ["India", "United States"];
    signal.deliveryGeographies = ["Global", "Asia"];
    signal.industry = "robotics and embodied AI";
    signal.targetModelOrSystem = "multimodal robot-learning model";
    signal.targetCapabilityTags = [
      "teleoperated_trajectories",
      "successful_failed_executions",
    ];
    signal.requiredCounterpartyArchetypes = [
      "robotics_data_company",
      "robotics_lab",
    ];
    signal.indiaRelevance.rationale =
      "The refreshed official request names India and reviewed local operations.";
    signal.indiaRelevance.reasons = [
      "India remains an explicitly eligible collection geography.",
      "Reviewed local operations are now named.",
    ];
    signal.indiaRelevance.confidence = 95;
    const refreshedScore = scoreDirectDemand({
      ...signal.score.components,
      freshness: 95,
      actionability: 90,
      indiaFit: 92,
    });
    if (!refreshedScore.valid) throw new Error("Refreshed score was invalid.");
    signal.score = structuredClone(refreshedScore);
    signal.responsePath = {
      ...signal.responsePath!,
      url: "https://acme.example/partners/robot-learning",
    };
    signal.partnerApplicationUrl =
      "https://acme.example/partners/robot-learning";
    const refreshedSystemsSummary = Array.from(
      { length: 80 },
      (_, index) => `refreshed-context-${index}`,
    ).join(" ");
    signal.systemsContext = {
      ...signal.systemsContext!,
      higherLevelSystemGoal:
        "Improve multimodal robot-learning reliability across workflows.",
      relevantStackLayer: "training",
      lowerLevelInputsRequired: [
        "real_world_access",
        "sensor_capture",
        "curation",
      ],
      systemsContextSummary: refreshedSystemsSummary,
    };
    signal.sensitiveDataAndCompliance.sensitiveDataFlags.faces = "possible";
    signal.sensitiveDataAndCompliance.complianceFacts.consent = true;
    signal.rawMetadata = { refreshSource: "official_request_v2" };
    signal.expiresAt = "2026-09-30T00:00:00.000Z";
    const mirrorUrl = "https://industry.example/acme-request-report";
    signal.evidence.push({
      ...signal.evidence[0]!,
      contributorEntityRef: signal.primaryEntityRef,
      sourceUrl: mirrorUrl,
      canonicalSourceUrl: mirrorUrl,
      sourceName: "Industry Report",
      sourceType: "technical_publication",
      sourceFamily: "reputable_technical_business_publications",
      claim: "A report mirrors Acme's public request.",
      sourceExcerpt: "Acme published a partner request.",
      englishSummary: "The report mirrors Acme's public request.",
      isPrimarySource: false,
      supportsIndiaRelevance: false,
      evidenceFingerprint: createEvidenceFingerprint({
        sourceUrl: mirrorUrl,
        canonicalSourceUrl: mirrorUrl,
        isPrimarySource: false,
      }),
      supportedFieldPaths: ["signal.factualSummary"],
    });
    const rehashed = rehashPersistenceBatch(secondBatch);
    const result = await repository.completeRun({
      ...completionInput(
        secondClaim.run.id,
        secondClaim.privateClaim.leaseToken,
        new Date(secondNow.getTime() + 1_000),
      ),
      submissionHash: rehashed.canonicalSubmissionHash,
      batch: rehashed,
    });

    expect(result).toMatchObject({
      outcome: "completed",
      run: { numberSignalsFound: 1, numberUpdated: 1, numberNew: 0 },
    });
    const signals = await db.select().from(globalRadarSignals);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      id: createdSignal.id,
      signalClass: "direct_demand",
      status: "qualified",
      expiresAt: humanExpiry,
      revision: 9,
      mostRecentRunId: secondClaim.run.id,
      title: "Acme expands its reviewed teleoperation request",
      factualSummary:
        "Acme expanded its public request to cover a second reviewed workflow.",
      interpretationSummary:
        "Mewtuals interprets the expanded request as a broader current demand.",
      collectionGeographies: ["India", "United States"],
      deliveryGeographies: ["Global", "Asia"],
      industry: "robotics and embodied AI",
      targetModelOrSystem: "multimodal robot-learning model",
      freshness: 95,
      actionability: 90,
      indiaFit: 92,
      directDemandScore: refreshedScore.score,
      scoreCoverage: refreshedScore.scoreCoverage,
      indiaFitConfidence: 95,
      responsePathUrl: "https://acme.example/partners/robot-learning",
      systemsContextSummary: refreshedSystemsSummary,
      faces: "possible",
      consent: true,
      rawMetadata: { refreshSource: "official_request_v2" },
    });
    expect(
      await db
        .select()
        .from(globalSignalEvidence)
        .where(eq(globalSignalEvidence.signalId, createdSignal.id)),
    ).toHaveLength(2);
    expect(
      await db
        .select()
        .from(globalSignalRequirements)
        .where(eq(globalSignalRequirements.signalId, createdSignal.id)),
    ).toHaveLength(1);
    const updates = await db
      .select()
      .from(globalSignalUpdates)
      .where(eq(globalSignalUpdates.signalId, createdSignal.id));
    expect(updates.map(({ updateType }) => updateType)).toEqual(
      expect.arrayContaining(["created", "rediscovered", "note_appended"]),
    );
    expect(updates.find(({ updateType }) => updateType === "rediscovered"))
      .toMatchObject({
        previousSafeState: {
          humanOwned: {
            status: "qualified",
            expiresAt: humanExpiry.toISOString(),
            revision: 9,
            signalClass: "direct_demand",
            dedupeKey: createdSignal.dedupeKey,
          },
          automated: {
            factualSummary:
              "Acme published a current request for teleoperated robot trajectories.",
            scoring: { freshness: 80, directDemandScore: 80 },
            compliance: { faces: null, consent: null },
          },
        },
        newSafeState: {
          humanOwned: {
            status: "qualified",
            expiresAt: humanExpiry.toISOString(),
            revision: 9,
            signalClass: "direct_demand",
            dedupeKey: createdSignal.dedupeKey,
          },
          proposedHumanOwned: {
            expiresAt: "2026-09-30T00:00:00.000Z",
          },
          automatedRefreshed: true,
          automated: {
            title: "Acme expands its reviewed teleoperation request",
            factualSummary:
              "Acme expanded its public request to cover a second reviewed workflow.",
            scoring: {
              freshness: 95,
              actionability: 90,
              indiaFit: 92,
              directDemandScore: refreshedScore.score,
            },
            response: {
              url: "https://acme.example/partners/robot-learning",
            },
            compliance: { faces: "possible", consent: true },
          },
        },
      });
    const rediscovered = updates.find(
      ({ updateType }) => updateType === "rediscovered",
    );
    expect(
      new TextEncoder().encode(JSON.stringify(rediscovered?.previousSafeState))
        .byteLength,
    ).toBeLessThanOrEqual(8_192);
    expect(
      new TextEncoder().encode(JSON.stringify(rediscovered?.newSafeState))
        .byteLength,
    ).toBeLessThanOrEqual(8_192);
    expect(updates.find(({ id }) => id === note.id)).toMatchObject({
      reason: "Keep the qualified review decision.",
    });
  });

  it("uses material requirements and target geography in the versioned signal identity", async () => {
    const now = new Date("2026-07-30T08:00:00.000Z");
    await repository.queueRun(queueInput("signal-dedupe-dimensions", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    const geographyVariant = structuredClone(batch.signals[0]!);
    geographyVariant.externalSignalId = "signal-geography-variant";
    geographyVariant.targetGeographies = ["Japan"];
    const requirementVariant = structuredClone(batch.signals[0]!);
    requirementVariant.externalSignalId = "signal-requirement-variant";
    const { fingerprint, ...requirementInput } =
      requirementVariant.requirements[0]!;
    if (!fingerprint) throw new Error("Fixture requirement fingerprint was missing.");
    const normalized = normalizeRequirements([
      {
        ...requirementInput,
        summary: "Bimanual trajectories with force torque measurements.",
        capabilityTag: "force_torque_feedback",
      },
    ]);
    if (!normalized.valid) throw new Error("Variant requirement was invalid.");
    requirementVariant.requirements = [...normalized.requirements];
    batch.signals = [batch.signals[0]!, geographyVariant, requirementVariant];
    const rehashed = rehashPersistenceBatch(batch);

    await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
      ),
      submissionHash: rehashed.canonicalSubmissionHash,
      batch: rehashed,
    });

    const signals = await db.select().from(globalRadarSignals);
    expect(signals).toHaveLength(3);
    expect(new Set(signals.map(({ dedupeKey }) => dedupeKey)).size).toBe(3);
    expect(signals.every(({ dedupeVersion }) => dedupeVersion === GLOBAL_RADAR_DEDUPE_VERSION)).toBe(true);
  });
});

describe("PostgreSQL Global Radar full graph persistence", () => {
  it("persists query outcomes, associations, requirements, evidence provenance, updates, and derived counters atomically", async () => {
    const now = new Date("2026-07-30T09:00:00.000Z");
    await repository.queueRun(queueInput("full-graph", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.entities.push({
      ...batch.entities[0]!,
      entityRef: "entity-supporting-lab",
      canonicalName: "Supporting Robotics Lab",
      websiteUrl: "https://supporting-lab.example",
      linkedinOrganizationUrl: null,
      stablePublicIdentifiers: [
        { namespace: "official_registry", value: "supporting-lab" },
      ],
      canonicalCorporateGroupId: "group:supporting-lab",
    });
    batch.signals[0]!.associatedEntities.push({
      entityRef: "entity-supporting-lab",
      role: "supporting",
      confidence: 85,
    });
    const plannedQuery = batch.executedQueries[0];
    if (!plannedQuery) throw new Error("Test Radar plan generated no queries.");
    const query = {
      ...plannedQuery,
      executedAt: "2026-07-30T09:00:30.000Z",
      resultsExamined: 7,
      error: "One secondary source timed out.",
    };
    batch.executedQueries[0] = query;
    batch.sourceErrors = [
      {
        sourceName: "Secondary source",
        message: "Timed out.",
        queryFingerprint: plannedQuery.fingerprint,
      },
    ];
    batch.rejections = { insufficient_evidence: 2 };
    const rehashed = rehashPersistenceBatch(batch);

    const completed = await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 60_000),
      ),
      submissionHash: rehashed.canonicalSubmissionHash,
      batch: rehashed,
    });

    expect(completed).toMatchObject({
      outcome: "completed",
      run: {
        status: "partial",
        numberResultsExamined: 7,
        numberEntitiesObserved: 2,
        numberSignalsFound: 1,
        numberDirectDemands: 1,
        numberNew: 1,
        numberRejectedForWeakEvidence: 2,
        numberSourceErrors: 1,
        sourceErrors: [
          { sourceName: "Secondary source", message: "Timed out." },
        ],
      },
    });
    expect(await db.select().from(globalRadarSearchQueries)).toHaveLength(
      batch.executedQueries.length,
    );
    expect(await db.select().from(globalEntities)).toHaveLength(2);
    expect(await db.select().from(globalRadarSignals)).toHaveLength(1);
    expect(await db.select().from(globalRadarSignalEntities)).toHaveLength(1);
    expect(await db.select().from(globalSignalRequirements)).toHaveLength(1);
    const [evidence] = await db.select().from(globalSignalEvidence);
    expect(evidence).toMatchObject({
      runId: claim.run.id,
      supportedFieldPaths: [
        "signal.title",
        "signal.indiaRelevance.relevanceType",
      ],
    });
    expect(await db.select().from(globalSignalUpdates)).toHaveLength(1);
    const [storedRun] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));
    expect(storedRun?.errorSummary).toEqual({
      sourceErrors: [
        { sourceName: "Secondary source", message: "Timed out." },
      ],
      rejections: { insufficient_evidence: 2 },
    });
  });

  it.each([
    {
      boundary: "before the locked run start",
      executedAt: "2026-07-30T08:59:59.999Z",
    },
    {
      boundary: "after the completion clock",
      executedAt: "2026-07-30T09:00:01.001Z",
    },
  ])("rolls back a planned query executed $boundary", async ({ boundary, executedAt }) => {
    const now = new Date("2026-07-30T09:00:00.000Z");
    await repository.queueRun(queueInput(`query-time-${boundary}`, { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    const plannedQuery = batch.executedQueries[0];
    if (!plannedQuery) throw new Error("Test Radar plan generated no queries.");
    batch.executedQueries[0] = {
      ...plannedQuery,
      executedAt,
      resultsExamined: 1,
      error: null,
    };
    const canonicalBatch = rehashPersistenceBatch(batch);
    const graphBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date("2026-07-30T09:00:01.000Z"),
        ),
        submissionHash: canonicalBatch.canonicalSubmissionHash,
        batch: canonicalBatch,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    expect(await graphRowCounts()).toEqual(graphBefore);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(runBefore);
  });

  it("rejects a genuine planned fingerprint paired with changed query fields", async () => {
    const now = new Date("2026-07-30T09:30:00.000Z");
    await repository.queueRun(queueInput("query-plan-membership", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    const plannedQuery = batch.executedQueries[0];
    if (!plannedQuery) throw new Error("Test Radar plan generated no queries.");
    batch.executedQueries[0] = {
      ...plannedQuery,
      recencyDays: plannedQuery.recencyDays + 1,
      executedAt: "2026-07-30T09:30:00.500Z",
      resultsExamined: 1,
      error: null,
    };
    const canonicalBatch = rehashPersistenceBatch(batch);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date("2026-07-30T09:30:01.000Z"),
        ),
        submissionHash: canonicalBatch.canonicalSubmissionHash,
        batch: canonicalBatch,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    expect(await db.select().from(globalRadarSearchQueries)).toHaveLength(0);
  });

  it.each([
    ["empty", () => []],
    [
      "proper subset",
      (queries: PersistableGlobalRadarBatch["executedQueries"]) =>
        queries.slice(0, -1),
    ],
    [
      "extra query",
      (queries: PersistableGlobalRadarBatch["executedQueries"]) => [
        ...queries,
        {
          ...queries[0]!,
          fingerprint: HASH_C,
          ordinal: queries.length,
        },
      ],
    ],
    [
      "duplicate query",
      (queries: PersistableGlobalRadarBatch["executedQueries"]) => [
        ...queries,
        structuredClone(queries[0]!),
      ],
    ],
  ] as const)("rejects an %s executed-query set atomically", async (_case, mutate) => {
    const now = new Date("2026-07-30T09:40:00.000Z");
    await repository.queueRun(queueInput(`query-set-${_case}`, { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.executedQueries = mutate(batch.executedQueries);
    const canonicalBatch = rehashPersistenceBatch(batch);
    const graphBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: canonicalBatch.canonicalSubmissionHash,
        batch: canonicalBatch,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    expect(await graphRowCounts()).toEqual(graphBefore);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(runBefore);
  });

  it("accepts the exact generated query set in a different outcome order", async () => {
    const now = new Date("2026-07-30T09:50:00.000Z");
    await repository.queueRun(queueInput("query-set-reordered", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.executedQueries.reverse();
    const canonicalBatch = rehashPersistenceBatch(batch);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: canonicalBatch.canonicalSubmissionHash,
        batch: canonicalBatch,
      }),
    ).resolves.toMatchObject({ outcome: "completed" });
    expect(await db.select().from(globalRadarSearchQueries)).toHaveLength(
      batch.executedQueries.length,
    );
  });

  it.each([
    {
      boundary: "fictional fixture marker",
      mutate(batch: StrictMutationBatch) {
        batch.signals[1]!.rawMetadata = { fictionalExample: true };
      },
    },
    {
      boundary: "full-page metadata",
      mutate(batch: StrictMutationBatch) {
        batch.signals[1]!.evidence[0]!.rawMetadata = {
          fullPageContent: "complete page",
        };
      },
    },
    {
      boundary: "document markup in evidence",
      rehash: true,
      mutate(batch: StrictMutationBatch) {
        batch.signals[1]!.evidence[0]!.claim = "<html>complete page</html>";
      },
    },
    {
      boundary: "unknown taxonomy value",
      mutate(batch: StrictMutationBatch) {
        batch.signals[1]!.demandDomain = "unknown_taxonomy";
      },
    },
    {
      boundary: "unknown direct-demand subtype",
      mutate(batch: StrictMutationBatch) {
        batch.signals[1]!.signalType = "bespoke_request";
      },
    },
    {
      boundary: "precursor subtype on direct demand",
      mutate(batch: StrictMutationBatch) {
        batch.signals[1]!.signalType = "funding";
      },
    },
    {
      boundary: "non-applicable momentum field on direct demand",
      mutate(batch: StrictMutationBatch) {
        batch.signals[1]!.score.momentumPolicyVersion = "not-applicable";
      },
    },
  ])("rejects $boundary before any graph or terminal write", async ({ boundary, mutate, rehash }) => {
    const now = new Date("2026-07-30T10:00:00.000Z");
    await repository.queueRun(queueInput(`strict-${boundary}`, { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(
      validPersistenceBatch(claim.run.id),
    ) as unknown as StrictMutationBatch;
    batch.signals.push(structuredClone(batch.signals[0]!));
    batch.signals[1]!.externalSignalId = "invalid-second-signal";
    mutate(batch);
    const submittedBatch = rehash
      ? rehashPersistenceBatch(batch as unknown as PersistableGlobalRadarBatch)
      : ({ ...batch, canonicalSubmissionHash: HASH_A } as unknown as PersistableGlobalRadarBatch);
    const graphBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: submittedBatch.canonicalSubmissionHash,
        batch: submittedBatch,
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "invalid_input",
      run: { id: claim.run.id, status: "running" },
    });
    expect(await graphRowCounts()).toEqual(graphBefore);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(runBefore);
  });
});

describe("PostgreSQL Global Radar graph replay and bounded summaries", () => {
  it("replays exact terminal identity with zero writes and conflicts on a changed canonical batch", async () => {
    const now = new Date("2026-07-30T11:00:00.000Z");
    await repository.queueRun(queueInput("graph-exact-replay", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = validPersistenceBatch(claim.run.id);
    const input = {
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
      ),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    };
    await expect(repository.completeRun(input)).resolves.toMatchObject({
      outcome: "completed",
    });
    const graphBeforeReplay = await graphRowCounts();
    const [runBeforeReplay] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));

    await expect(
      repository.completeRun({
        ...input,
        now: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
        batch: { fictionalExample: true } as unknown as PersistableGlobalRadarBatch,
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    expect(await graphRowCounts()).toEqual(graphBeforeReplay);
    const [runAfterReplay] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));
    expect(runAfterReplay).toEqual(runBeforeReplay);

    const changed = structuredClone(batch);
    changed.signals[0]!.title = "Materially changed canonical title";
    const changedCanonicalBatch = rehashPersistenceBatch(changed);
    await expect(
      repository.completeRun({
        ...input,
        submissionHash: changedCanonicalBatch.canonicalSubmissionHash,
        batch: changedCanonicalBatch,
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "completion_identity_mismatch",
    });
    expect(await graphRowCounts()).toEqual(graphBeforeReplay);
  });

  it("accepts fifty short source errors and stores rejection counts only", async () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    await repository.queueRun(queueInput("graph-bounded-fifty", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.sourceErrors = Array.from({ length: 50 }, (_, index) => ({
      sourceName: `Source ${index}`,
      message: "Unavailable",
      queryFingerprint: null,
    }));
    batch.rejections = {
      insufficient_evidence: 3,
      invalid_evidence: 2,
    };
    const rehashed = rehashPersistenceBatch(batch);

    const completed = await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
      ),
      submissionHash: rehashed.canonicalSubmissionHash,
      batch: rehashed,
    });
    expect(completed).toMatchObject({
      outcome: "completed",
      run: {
        status: "partial",
        numberSourceErrors: 50,
        numberRejectedForWeakEvidence: 5,
      },
    });
    const [stored] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));
    expect(stored?.errorSummary).toEqual({
      sourceErrors: batch.sourceErrors.map(({ sourceName, message }) => ({
        sourceName,
        message,
      })),
      rejections: batch.rejections,
    });
    expect(JSON.stringify(stored?.errorSummary)).not.toContain("signals");
    expect(JSON.stringify(stored?.errorSummary)).not.toContain("payload");
  });

  it("rolls back a source-error summary over the safe byte bound", async () => {
    const now = new Date("2026-07-30T13:00:00.000Z");
    await repository.queueRun(queueInput("graph-summary-overflow", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.sourceErrors = Array.from({ length: 9 }, (_, index) => ({
      sourceName: `Source ${index}`,
      message: "m".repeat(1_000),
      queryFingerprint: null,
    }));
    const rehashed = rehashPersistenceBatch(batch);
    const graphBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: rehashed.canonicalSubmissionHash,
        batch: rehashed,
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "invalid_input",
      run: { status: "running" },
    });
    expect(await graphRowCounts()).toEqual(graphBefore);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(runBefore);
  });
});

describe("PostgreSQL Global Radar expiry and momentum projections", () => {
  it("derives momentum only from canonical contributor associations and conflicting evidence identities", () => {
    const aliased = structuredClone(validMomentumPersistenceBatch(randomUUID()));
    const acme = aliased.entities.find(({ entityRef }) => entityRef === "entity-acme");
    const beta = aliased.entities.find(
      ({ entityRef }) => entityRef === "entity-beta-robotics",
    );
    if (!acme || !beta) throw new Error("Momentum entities were missing.");
    beta.websiteUrl = acme.websiteUrl;
    beta.canonicalCorporateGroupId = acme.canonicalCorporateGroupId;
    const aliasedCanonical = rehashPersistenceBatch(aliased);
    expect(canonicalizeGlobalRadarPersistenceBatch(aliasedCanonical)).toEqual({
      valid: false,
      reason: "invalid_batch",
    });

    const conflictingEvidence = structuredClone(
      validMomentumPersistenceBatch(randomUUID()),
    );
    const momentum = conflictingEvidence.signals[0];
    if (!momentum || momentum.signalClass !== "ecosystem_momentum") {
      throw new Error("Momentum signal was missing.");
    }
    const [firstEvidence, secondEvidence] = momentum.evidence;
    if (!firstEvidence || !secondEvidence) {
      throw new Error("Momentum evidence was missing.");
    }
    secondEvidence.sourceUrl = firstEvidence.sourceUrl;
    secondEvidence.canonicalSourceUrl = firstEvidence.canonicalSourceUrl;
    secondEvidence.isPrimarySource = firstEvidence.isPrimarySource;
    secondEvidence.evidenceFingerprint = firstEvidence.evidenceFingerprint;
    const conflictingCanonical = rehashPersistenceBatch(conflictingEvidence);
    expect(
      canonicalizeGlobalRadarPersistenceBatch(conflictingCanonical),
    ).toEqual({ valid: false, reason: "invalid_batch" });

    const unassociated = structuredClone(
      validMomentumPersistenceBatch(randomUUID()),
    );
    const unassociatedSignal = unassociated.signals[0];
    if (!unassociatedSignal || unassociatedSignal.signalClass !== "ecosystem_momentum") {
      throw new Error("Momentum signal was missing.");
    }
    unassociatedSignal.associatedEntities =
      unassociatedSignal.associatedEntities.filter(
        ({ entityRef }) => entityRef !== "entity-beta-robotics",
      );
    expect(canonicalizeGlobalRadarPersistenceBatch(unassociated)).toEqual({
      valid: false,
      reason: "invalid_batch",
    });
  });

  it("rolls back when payload-distinct contributors resolve to one historical owner", async () => {
    const now = new Date("2026-07-31T14:00:00.000Z");
    const historicalIdentifierA = "public:official_registry:historical-owner-a";
    const historicalIdentifierB = "public:official_registry:historical-owner-b";
    const [historicalOwner] = await db
      .insert(globalEntities)
      .values({
        canonicalName: "Historical Robotics Owner",
        normalizedName: "historical robotics owner",
        canonicalCorporateGroupId: "group:historical-robotics-owner",
        stablePublicIdentifiers: [historicalIdentifierA, historicalIdentifierB],
        publicIdentityAnchor: createGlobalRadarFingerprint({
          version: "global-radar-public-identity-anchor-v1",
          publicIdentifier: historicalIdentifierA,
        }),
        headquartersCountry: "us",
        organisationType: "robotics_company",
        sector: "robotics",
        shortDescription: "Historical canonical owner for alias resolution.",
        firstSeenAt: now,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (!historicalOwner) throw new Error("Historical owner was not created.");
    await repository.queueRun(queueInput("momentum-historical-owner-collapse", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validMomentumPersistenceBatch(claim.run.id));
    batch.entities = batch.entities.filter(
      ({ entityRef }) => entityRef !== "entity-gamma-robotics",
    );
    const momentum = batch.signals[0];
    if (!momentum || momentum.signalClass !== "ecosystem_momentum") {
      throw new Error("Momentum fixture was not classified.");
    }
    momentum.associatedEntities = momentum.associatedEntities.filter(
      ({ entityRef }) => entityRef !== "entity-gamma-robotics",
    );
    momentum.evidence = momentum.evidence.filter(
      ({ contributorEntityRef }) =>
        contributorEntityRef !== "entity-gamma-robotics",
    );
    const acme = batch.entities.find(({ entityRef }) => entityRef === "entity-acme");
    const beta = batch.entities.find(
      ({ entityRef }) => entityRef === "entity-beta-robotics",
    );
    if (!acme || !beta) throw new Error("Momentum contributors were missing.");
    for (const [entity, value] of [
      [acme, "historical-owner-a"],
      [beta, "historical-owner-b"],
    ] as const) {
      entity.websiteUrl = null;
      entity.linkedinOrganizationUrl = null;
      entity.stablePublicIdentifiers = [
        { namespace: "official_registry", value },
      ];
      entity.canonicalCorporateGroupId = null;
    }
    const submitted = rehashPersistenceBatch(batch);
    expect(canonicalizeGlobalRadarPersistenceBatch(submitted)).toMatchObject({
      valid: true,
    });
    const graphBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);
    const [ownerBefore] = await db
      .select()
      .from(globalEntities)
      .where(eq(globalEntities.id, historicalOwner.id));

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: submitted.canonicalSubmissionHash,
        batch: submitted,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    expect(await graphRowCounts()).toEqual(graphBefore);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(runBefore);
    const [ownerAfter] = await db
      .select()
      .from(globalEntities)
      .where(eq(globalEntities.id, historicalOwner.id));
    expect(ownerAfter).toEqual(ownerBefore);
  });

  it("rolls back an exactly rederived momentum record whose hard gates fail", async () => {
    const now = new Date("2026-07-31T14:30:00.000Z");
    await repository.queueRun(queueInput("momentum-hard-gate-failure", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const submitted = withMomentumGateInputs(
      validMomentumPersistenceBatch(claim.run.id),
      { taxonomyConsistency: 69, evidenceQuality: 80 },
    );
    const signal = submitted.signals[0];
    expect(signal?.signalClass).toBe("ecosystem_momentum");
    expect(signal?.score.qualificationGatesPassed).toBe(false);
    const graphBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: submitted.canonicalSubmissionHash,
        batch: submitted,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    expect(await graphRowCounts()).toEqual(graphBefore);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(runBefore);
  });

  it("expires known deadlines and overdue evergreen re-observation exactly once", async () => {
    const queueAt = new Date("2026-07-30T14:00:00.000Z");
    await repository.queueRun(queueInput("expiry-projection", { now: queueAt }));
    const claim = await repository.claimRun({ now: queueAt });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    const knownDeadline = batch.signals[0]!;
    knownDeadline.externalSignalId = "signal-known-deadline";
    knownDeadline.expiresAt = "2026-07-31T00:00:00.000Z";
    const evergreen = structuredClone(knownDeadline);
    evergreen.externalSignalId = "signal-evergreen-reobserve";
    evergreen.evergreen = true;
    evergreen.expiresAt = null;
    evergreen.reobserveBy = "2026-07-31T00:00:00.000Z";
    evergreen.evidence[0]!.sourceUrl = "https://acme.example/evergreen-intake";
    evergreen.evidence[0]!.canonicalSourceUrl =
      "https://acme.example/evergreen-intake";
    evergreen.evidence[0]!.evidenceFingerprint = createEvidenceFingerprint({
      sourceUrl: evergreen.evidence[0]!.sourceUrl,
      canonicalSourceUrl: evergreen.evidence[0]!.canonicalSourceUrl,
      isPrimarySource: true,
    });
    if (evergreen.responsePath) {
      evergreen.responsePath.evidenceUrl = evergreen.evidence[0]!.sourceUrl;
    }
    const future = structuredClone(knownDeadline);
    future.externalSignalId = "signal-future-deadline";
    future.expiresAt = "2026-08-31T00:00:00.000Z";
    future.evidence[0]!.sourceUrl = "https://acme.example/future-request";
    future.evidence[0]!.canonicalSourceUrl =
      "https://acme.example/future-request";
    future.evidence[0]!.evidenceFingerprint = createEvidenceFingerprint({
      sourceUrl: future.evidence[0]!.sourceUrl,
      canonicalSourceUrl: future.evidence[0]!.canonicalSourceUrl,
      isPrimarySource: true,
    });
    if (future.responsePath) {
      future.responsePath.evidenceUrl = future.evidence[0]!.sourceUrl;
    }
    batch.signals = [knownDeadline, evergreen, future];
    const rehashed = rehashPersistenceBatch(batch);
    await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(queueAt.getTime() + 1_000),
      ),
      submissionHash: rehashed.canonicalSubmissionHash,
      batch: rehashed,
    });
    const [qualified] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.expiresAt, new Date("2026-07-31T00:00:00.000Z")));
    if (!qualified) throw new Error("Known-deadline signal was not created.");
    await db
      .update(globalRadarSignals)
      .set({ status: "qualified" })
      .where(eq(globalRadarSignals.id, qualified.id));

    const first = await repository.expireDirectDemand({
      now: new Date("2026-07-31T00:00:00.000Z"),
    });
    expect(first).toEqual({ outcome: "completed", expired: 2 });
    const rows = await db.select().from(globalRadarSignals);
    expect(rows.filter(({ status }) => status === "expired")).toHaveLength(2);
    expect(
      rows.find(
        ({ expiresAt }) =>
          expiresAt?.toISOString() === "2026-08-31T00:00:00.000Z",
      )?.status,
    ).toBe("newly_discovered");
    const expiryUpdates = await db
      .select()
      .from(globalSignalUpdates)
      .where(eq(globalSignalUpdates.updateType, "status_changed"));
    expect(expiryUpdates).toHaveLength(2);

    const second = await repository.expireDirectDemand({
      now: new Date("2026-07-31T00:00:00.000Z"),
    });
    expect(second).toEqual({ outcome: "completed", expired: 0 });
    expect(
      await db
        .select()
        .from(globalSignalUpdates)
        .where(eq(globalSignalUpdates.updateType, "status_changed")),
    ).toHaveLength(2);
  });

  it("advances a newer evergreen re-observation deadline without overwriting human state", async () => {
    const firstNow = new Date("2026-07-30T16:00:00.000Z");
    await repository.queueRun(queueInput("evergreen-reobserve-first", { now: firstNow }));
    const firstClaim = await repository.claimRun({ now: firstNow });
    if (firstClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const firstBatch = structuredClone(
      validPersistenceBatch(firstClaim.run.id, {
        observedAt: "2026-07-30T16:01:00.000Z",
      }),
    );
    firstBatch.signals[0]!.evergreen = true;
    firstBatch.signals[0]!.expiresAt = null;
    firstBatch.signals[0]!.reobserveBy = "2026-07-31T00:00:00.000Z";
    const firstCanonical = rehashPersistenceBatch(firstBatch);
    await repository.completeRun({
      ...completionInput(
        firstClaim.run.id,
        firstClaim.privateClaim.leaseToken,
        new Date("2026-07-30T16:02:00.000Z"),
      ),
      submissionHash: firstCanonical.canonicalSubmissionHash,
      batch: firstCanonical,
    });
    const [created] = await db.select().from(globalRadarSignals);
    if (!created) throw new Error("Evergreen signal was not created.");
    const humanExpiry = new Date("2026-09-30T00:00:00.000Z");
    await db
      .update(globalRadarSignals)
      .set({ status: "qualified", expiresAt: humanExpiry, revision: 11 })
      .where(eq(globalRadarSignals.id, created.id));

    const secondNow = new Date("2026-07-30T17:00:00.000Z");
    await repository.queueRun(queueInput("evergreen-reobserve-second", { now: secondNow }));
    const secondClaim = await repository.claimRun({ now: secondNow });
    if (secondClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const secondBatch = structuredClone(
      validPersistenceBatch(secondClaim.run.id, {
        observedAt: "2026-07-30T17:01:00.000Z",
      }),
    );
    const rediscovered = secondBatch.signals[0]!;
    rediscovered.evergreen = true;
    rediscovered.expiresAt = "2026-08-01T00:00:00.000Z";
    rediscovered.reobserveBy = "2026-08-07T00:00:00.000Z";
    rediscovered.factualSummary =
      "Acme publicly reconfirmed that the evergreen partner intake remains open.";
    rediscovered.interpretationSummary =
      "Mewtuals treats the newer public observation as extending the review window.";
    const secondCanonical = rehashPersistenceBatch(secondBatch);
    await expect(
      repository.completeRun({
        ...completionInput(
          secondClaim.run.id,
          secondClaim.privateClaim.leaseToken,
          new Date("2026-07-30T17:02:00.000Z"),
        ),
        submissionHash: secondCanonical.canonicalSubmissionHash,
        batch: secondCanonical,
      }),
    ).resolves.toMatchObject({ outcome: "completed" });

    const [updated] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, created.id));
    expect(updated).toMatchObject({
      status: "qualified",
      expiresAt: humanExpiry,
      reobserveBy: new Date("2026-08-07T00:00:00.000Z"),
      revision: 11,
      factualSummary:
        "Acme publicly reconfirmed that the evergreen partner intake remains open.",
      interpretationSummary:
        "Mewtuals treats the newer public observation as extending the review window.",
    });
    const rediscoveryUpdates = await db
      .select()
      .from(globalSignalUpdates)
      .where(eq(globalSignalUpdates.updateType, "rediscovered"));
    expect(rediscoveryUpdates.at(-1)).toMatchObject({
      previousSafeState: {
        reobserveBy: "2026-07-31T00:00:00.000Z",
        automated: {
          factualSummary:
            "Acme published a current request for teleoperated robot trajectories.",
        },
      },
      newSafeState: {
        proposedReobserveBy: "2026-08-07T00:00:00.000Z",
        appliedReobserveBy: "2026-08-07T00:00:00.000Z",
        automated: {
          factualSummary:
            "Acme publicly reconfirmed that the evergreen partner intake remains open.",
        },
      },
    });

    await expect(
      repository.expireDirectDemand({
        now: new Date("2026-07-31T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "completed", expired: 0 });
    await expect(
      repository.expireDirectDemand({
        now: new Date("2026-08-07T00:00:00.000Z"),
      }),
    ).resolves.toEqual({ outcome: "completed", expired: 1 });
    const [expired] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, created.id));
    expect(expired?.status).toBe("expired");
  });

  it.each([
    {
      boundary: "worker momentum counts",
      mutate(score: Extract<PersistableGlobalRadarBatch["signals"][number], { signalClass: "ecosystem_momentum" }>["score"]) {
        score.counts.evidenceItems += 1;
      },
    },
    {
      boundary: "worker momentum windows",
      mutate(score: Extract<PersistableGlobalRadarBatch["signals"][number], { signalClass: "ecosystem_momentum" }>["score"]) {
        score.windows.days7.recent += 1;
      },
    },
    {
      boundary: "worker momentum qualification gate",
      mutate(score: Extract<PersistableGlobalRadarBatch["signals"][number], { signalClass: "ecosystem_momentum" }>["score"]) {
        score.qualificationGatesPassed = !score.qualificationGatesPassed;
      },
    },
    {
      boundary: "worker momentum policy",
      mutate(score: Extract<PersistableGlobalRadarBatch["signals"][number], { signalClass: "ecosystem_momentum" }>["score"]) {
        score.policyVersion = "global-radar-momentum-v2";
      },
    },
    {
      boundary: "worker momentum taxonomy",
      mutate(score: Extract<PersistableGlobalRadarBatch["signals"][number], { signalClass: "ecosystem_momentum" }>["score"]) {
        score.taxonomy = "egocentric_and_human_activity_data";
      },
    },
    {
      boundary: "worker-derived momentum component",
      mutate(score: Extract<PersistableGlobalRadarBatch["signals"][number], { signalClass: "ecosystem_momentum" }>["score"]) {
        score.components.weightedVolume =
          score.components.weightedVolume === 100
            ? 99
            : score.components.weightedVolume + 1;
      },
    },
  ])("rejects manipulated $boundary with no graph or terminal writes", async ({ boundary, mutate }) => {
    const now = new Date("2026-07-31T14:00:00.000Z");
    await repository.queueRun(queueInput(`momentum-manipulated-${boundary}`, { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validMomentumPersistenceBatch(claim.run.id));
    const momentum = batch.signals[0];
    if (!momentum || momentum.signalClass !== "ecosystem_momentum") {
      throw new Error("Momentum fixture was not classified.");
    }
    mutate(momentum.score);
    const submitted = rehashPersistenceBatch(batch);
    const graphBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: submitted.canonicalSubmissionHash,
        batch: submitted,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    expect(await graphRowCounts()).toEqual(graphBefore);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(runBefore);
  });

  it("recomputes 7/30/90-day momentum from run-linked contributors without auto-qualifying", async () => {
    const queueAt = new Date("2026-07-30T16:00:00.000Z");
    await repository.queueRun(queueInput("momentum-projection", { now: queueAt }));
    const claim = await repository.claimRun({ now: queueAt });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = validMomentumPersistenceBatch(claim.run.id);
    await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(queueAt.getTime() + 1_000),
      ),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    const evidence = await db.select().from(globalSignalEvidence);
    expect(evidence).toHaveLength(3);
    expect(evidence.every(({ runId, globalEntityId }) => runId && globalEntityId)).toBe(true);
    const [initialSignal] = await db.select().from(globalRadarSignals);
    expect(initialSignal).toMatchObject({
      signalClass: "ecosystem_momentum",
      status: "newly_discovered",
      momentumIndependentEntityCount: 2,
      momentumPrimarySourceCount: 1,
      momentumSourceFamilyCount: 2,
      momentumVolume7Days: 2,
      momentumVolume30Days: 2,
      momentumVolume90Days: 2,
      momentumPolicyVersion: MOMENTUM_POLICY.version,
      momentumQualificationGatesPassed: true,
    });
    if (!initialSignal) throw new Error("Momentum signal was not persisted.");
    await db
      .update(globalRadarSignals)
      .set({ momentumVolume7Days: 0 })
      .where(eq(globalRadarSignals.id, initialSignal.id));

    const first = await repository.recomputeMomentum({
      now: new Date("2026-07-31T14:00:00.000Z"),
      policy: MOMENTUM_POLICY,
    });
    expect(first).toEqual({ outcome: "completed", recomputed: 1, unchanged: 0 });
    const [signal] = await db.select().from(globalRadarSignals);
    expect(signal).toMatchObject({
      signalClass: "ecosystem_momentum",
      status: "newly_discovered",
      momentumIndependentEntityCount: 2,
      momentumPrimarySourceCount: 1,
      momentumSourceFamilyCount: 2,
      momentumVolume7Days: 2,
      momentumVolume30Days: 2,
      momentumVolume90Days: 2,
      momentumPolicyVersion: MOMENTUM_POLICY.version,
    });
    expect(signal?.status).not.toBe("qualified");
    expect(
      await db
        .select()
        .from(globalSignalUpdates)
        .where(eq(globalSignalUpdates.updateType, "momentum_recomputed")),
    ).toHaveLength(1);

    const second = await repository.recomputeMomentum({
      now: new Date("2026-07-31T14:00:00.000Z"),
      policy: MOMENTUM_POLICY,
    });
    expect(second).toEqual({ outcome: "completed", recomputed: 0, unchanged: 1 });
    expect(
      await db
        .select()
        .from(globalSignalUpdates)
        .where(eq(globalSignalUpdates.updateType, "momentum_recomputed")),
    ).toHaveLength(1);
  });

  it("recomputes every eligible item in the full 180-day horizon without a newest-100 cutoff", async () => {
    const queueAt = new Date("2026-07-30T17:00:00.000Z");
    await repository.queueRun(queueInput("momentum-complete-horizon", { now: queueAt }));
    const claim = await repository.claimRun({ now: queueAt });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = validMomentumPersistenceBatch(claim.run.id);
    await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(queueAt.getTime() + 1_000),
      ),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    const [signal] = await db.select().from(globalRadarSignals);
    const [template] = await db
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.isSyndicated, false))
      .limit(1);
    if (!signal || !template || !template.globalEntityId || !template.runId) {
      throw new Error("Momentum evidence template was not persisted.");
    }
    const { id: _templateId, ...templateValues } = template;
    void _templateId;
    const syntheticEvidence = [
      ...Array.from({ length: 101 }, (_, index) => ({
        ...templateValues,
        sourceUrl: `https://evidence.example/recent-${index}`,
        canonicalSourceUrl: `https://evidence.example/recent-${index}`,
        observedAt: new Date("2026-08-01T00:00:00.000Z"),
        publishedAt: new Date("2026-08-01T00:00:00.000Z"),
        evidenceFingerprint: createEvidenceFingerprint({
          sourceUrl: `https://evidence.example/recent-${index}`,
          canonicalSourceUrl: `https://evidence.example/recent-${index}`,
          isPrimarySource: template.isPrimarySource,
        }),
      })),
      ...Array.from({ length: 5 }, (_, index) => ({
        ...templateValues,
        sourceUrl: `https://evidence.example/aged-out-${index}`,
        canonicalSourceUrl: `https://evidence.example/aged-out-${index}`,
        observedAt: new Date("2026-01-01T00:00:00.000Z"),
        publishedAt: null,
        evidenceFingerprint: createEvidenceFingerprint({
          sourceUrl: `https://evidence.example/aged-out-${index}`,
          canonicalSourceUrl: `https://evidence.example/aged-out-${index}`,
          isPrimarySource: template.isPrimarySource,
        }),
      })),
    ];
    await db.insert(globalSignalEvidence).values(syntheticEvidence);

    await expect(
      repository.recomputeMomentum({
        now: new Date("2026-08-02T00:00:00.000Z"),
        policy: MOMENTUM_POLICY,
      }),
    ).resolves.toEqual({ outcome: "completed", recomputed: 1, unchanged: 0 });
    const [recomputed] = await db.select().from(globalRadarSignals);
    expect(recomputed).toMatchObject({
      momentumVolume7Days: 103,
      momentumVolume30Days: 103,
      momentumVolume90Days: 103,
      momentumQualificationGatesPassed: true,
      status: "newly_discovered",
    });

    await expect(
      repository.recomputeMomentum({
        now: new Date("2026-08-02T00:00:00.000Z"),
        policy: MOMENTUM_POLICY,
      }),
    ).resolves.toEqual({ outcome: "completed", recomputed: 0, unchanged: 1 });
  });

  it("persists failed momentum gates and demotes qualified records to monitoring exactly once", async () => {
    const queueAt = new Date("2026-07-30T18:00:00.000Z");
    await repository.queueRun(queueInput("momentum-gate-demotion", { now: queueAt }));
    const claim = await repository.claimRun({ now: queueAt });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = validMomentumPersistenceBatch(claim.run.id);
    await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(queueAt.getTime() + 1_000),
      ),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    const [created] = await db.select().from(globalRadarSignals);
    if (!created) throw new Error("Momentum signal was not persisted.");
    await db
      .update(globalRadarSignals)
      .set({ status: "qualified", revision: 7 })
      .where(eq(globalRadarSignals.id, created.id));

    const recomputeAt = new Date("2027-02-01T00:00:00.000Z");
    await expect(
      repository.recomputeMomentum({
        now: recomputeAt,
        policy: MOMENTUM_POLICY,
      }),
    ).resolves.toEqual({ outcome: "completed", recomputed: 1, unchanged: 0 });
    const [demoted] = await db.select().from(globalRadarSignals);
    expect(demoted).toMatchObject({
      status: "monitoring",
      momentumQualificationGatesPassed: false,
      momentumIndependentEntityCount: 0,
      momentumVolume90Days: 0,
      revision: 8,
    });
    const maintenanceUpdates = await db
      .select()
      .from(globalSignalUpdates)
      .where(
        inArray(globalSignalUpdates.updateType, [
          "momentum_recomputed",
          "status_changed",
        ]),
      );
    expect(maintenanceUpdates.map(({ updateType }) => updateType)).toEqual(
      expect.arrayContaining(["momentum_recomputed", "status_changed"]),
    );
    expect(
      maintenanceUpdates.find(({ updateType }) => updateType === "status_changed"),
    ).toMatchObject({
      previousSafeState: {
        status: "qualified",
        qualificationGatesPassed: true,
      },
      newSafeState: {
        status: "monitoring",
        qualificationGatesPassed: false,
      },
    });

    await expect(
      repository.recomputeMomentum({
        now: recomputeAt,
        policy: MOMENTUM_POLICY,
      }),
    ).resolves.toEqual({ outcome: "completed", recomputed: 0, unchanged: 1 });
    expect(
      await db
        .select()
        .from(globalSignalUpdates)
        .where(
          inArray(globalSignalUpdates.updateType, [
            "momentum_recomputed",
            "status_changed",
          ]),
        ),
    ).toHaveLength(2);
  });
});

describe("PostgreSQL Global Radar administrator safe reads", () => {
  const adminRepository = createGlobalRadarAdminRepository(db, {
    scoreVersion: "global-radar-score-v1",
    thresholds: {
      direct_demand: 70,
      demand_precursor: 65,
      ecosystem_momentum: 70,
    },
  });

  async function persistClassFixture(
    suffix: string,
    kind: "direct" | "precursor" | "momentum",
  ) {
    const now = new Date(`2026-07-30T${kind === "direct" ? "10" : kind === "precursor" ? "11" : "12"}:00:00.000Z`);
    await repository.queueRun(queueInput(`admin-read-${suffix}`, { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Admin read fixture was not claimed.");
    const batch =
      kind === "direct"
        ? validPersistenceBatch(claim.run.id, {
            externalSignalId: `admin-direct-${suffix}`,
            sourceUrl: `https://admin-${suffix}.example/direct`,
            stableIdentifierValue: `admin-direct-${suffix}`,
            websiteUrl: `https://admin-${suffix}.example`,
            linkedinOrganizationUrl: null,
          })
        : kind === "precursor"
          ? validPrecursorPersistenceBatch(claim.run.id)
          : validMomentumPersistenceBatch(claim.run.id);
    const result = await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
      ),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    if (result.outcome !== "completed") {
      throw new Error(`Admin class fixture failed: ${JSON.stringify(result)}`);
    }
  }

  it("rejects unknown, class-inapplicable, and out-of-range list filters before SQL", async () => {
    await expect(
      adminRepository.listSignals({
        signalClass: "direct_demand",
        filters: { page: 1, horizon: "within_30_days" },
      } as never),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      adminRepository.listSignals({
        signalClass: "demand_precursor",
        filters: { page: 1, expiresBefore: "2026-08-01T00:00:00.000Z" },
      } as never),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      adminRepository.listSignals({
        signalClass: "ecosystem_momentum",
        filters: { page: 101 },
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      adminRepository.listSignals({
        signalClass: "direct_demand",
        filters: { page: 1, unexpected: "private" },
      } as never),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
  });

  it("applies exact class filters, stable ordering, fixed pagination, and excludes merged rows", async () => {
    await persistClassFixture("filters", "direct");
    const [owner] = await db.select().from(globalRadarSignals);
    if (!owner) throw new Error("Admin direct fixture was not persisted.");
    const duplicateId = randomUUID();
    await db.insert(globalRadarSignals).values({
      ...owner,
      id: duplicateId,
      title: "Earlier tie",
      dedupeKey: "d".repeat(64),
      observedAt: new Date(owner.observedAt.getTime() - 1_000),
      firstSeenAt: new Date(owner.firstSeenAt.getTime() - 1_000),
      lastSeenAt: new Date(owner.lastSeenAt.getTime() - 1_000),
      createdAt: new Date(owner.createdAt.getTime() - 1_000),
      updatedAt: new Date(owner.updatedAt.getTime() - 1_000),
    });
    const [requirementTemplate] = await db
      .select()
      .from(globalSignalRequirements)
      .where(eq(globalSignalRequirements.signalId, owner.id));
    if (!requirementTemplate) throw new Error("Admin requirement fixture was not persisted.");
    const { id: _requirementId, ...requirementValues } = requirementTemplate;
    void _requirementId;
    await db.insert(globalSignalRequirements).values({
      ...requirementValues,
      signalId: duplicateId,
    });
    const mergedId = randomUUID();
    await db.insert(globalRadarSignals).values({
      ...owner,
      id: mergedId,
      title: "Merged hidden row",
      dedupeKey: "e".repeat(64),
      mergedIntoSignalId: owner.id,
    });

    const listed = await adminRepository.listSignals({
      signalClass: "direct_demand",
      filters: {
        status: "newly_discovered",
        country: "United States",
        indiaRelevance: "explicit_India",
        demandDomain: "robot_learning_and_manipulation",
        capability: "teleoperated_trajectories",
        observedFrom: "2026-07-01T00:00:00.000Z",
        observedTo: "2026-08-01T00:00:00.000Z",
        expiresBefore: "2026-09-01T00:00:00.000Z",
        page: 1,
      },
    });
    expect(listed).toMatchObject({
      outcome: "listed",
      page: 1,
      pageSize: 25,
      total: 2,
      items: [{ id: owner.id }, { id: duplicateId }],
    });
    expect(JSON.stringify(listed)).not.toContain("rawMetadata");
    expect(JSON.stringify(listed)).not.toContain("note_appended");

    const precursorId = randomUUID();
    await db.insert(globalRadarSignals).values({
      ...owner,
      id: precursorId,
      signalClass: "demand_precursor",
      title: "Acme funds a robot-learning programme",
      signalType: "funding",
      dedupeKey: "f".repeat(64),
      demandExplicitness: null,
      freshness: null,
      actionability: null,
      commercialPotential: null,
      repeatability: null,
      responseAccessibility: null,
      strategicLearning: null,
      complianceComplexity: null,
      directDemandScore: null,
      proximityToExternalDemand: 70,
      fundingDeploymentMomentum: 80,
      likelyDataHardwareIntensity: 70,
      estimatedTimeHorizon: 80,
      strategicRelevance: 70,
      precursorScore: 72,
      expiresAt: null,
      evergreen: null,
      reobserveBy: null,
      responsePathType: null,
      responsePathUrl: null,
      responseBusinessEmail: null,
      partnerApplicationUrl: null,
    });
    const precursor = await adminRepository.listSignals({
      signalClass: "demand_precursor",
      filters: { horizon: "days_31_to_90", page: 1 },
    });
    expect(precursor).toMatchObject({
      outcome: "listed",
      total: 1,
      items: [{ id: precursorId }],
    });

    await persistClassFixture("theme", "momentum");
    const momentum = await adminRepository.listSignals({
      signalClass: "ecosystem_momentum",
      filters: { theme: "robot_teleoperation_demonstrations", page: 1 },
    });
    expect(momentum).toMatchObject({ outcome: "listed", total: 1 });
  });

  it("returns bounded class metrics, safe detail children, watchlist rows, and generic run notices", async () => {
    await persistClassFixture("metrics", "direct");
    const [signal] = await db.select().from(globalRadarSignals);
    if (!signal) throw new Error("Admin metrics fixture was not persisted.");
    const metrics = await adminRepository.getClassMetrics({
      signalClass: "direct_demand",
      now: new Date("2026-07-30T12:00:00.000Z"),
      filters: {},
    });
    expect(metrics).toMatchObject({
      outcome: "listed",
      metrics: {
        total: 1,
        highQuality: 1,
        byStatus: { newly_discovered: 1 },
        india: { explicit: 1, inferred: 0, other: 0 },
        countries: { unitedStates: 1, china: 0, other: 0 },
        requirementMix: { physicalData: 1, hardware: 0 },
        active: 1,
        expiring: 1,
      },
    });
    expect(metrics.outcome === "listed" ? metrics.metrics.demandFamilies : {}).toEqual({
      robot_learning_and_manipulation: 1,
    });
    await db.insert(globalRadarSignals).values({
      ...signal,
      id: randomUUID(),
      dedupeKey: "6".repeat(64),
      demandDomain: "unbounded_private_family",
    });
    const boundedMetrics = await adminRepository.getClassMetrics({
      signalClass: "direct_demand",
      now: new Date("2026-07-30T12:00:00.000Z"),
      filters: {},
    });
    expect(
      boundedMetrics.outcome === "listed"
        ? boundedMetrics.metrics.demandFamilies
        : {},
    ).not.toHaveProperty("unbounded_private_family");

    const overview = await adminRepository.getOverviewMetrics({
      now: new Date("2026-07-30T12:00:00.000Z"),
    });
    expect(overview).toMatchObject({
      outcome: "listed",
      metrics: {
        newSignals: 2,
        activeDirectDemand: 2,
        highQualityPrecursors: 0,
        india: { explicit: 2, inferred: 0 },
        countries: { unitedStates: 2, china: 0, other: 0 },
        requirementMix: { physicalData: 1, hardware: 0 },
        capabilityFamilies: [
          { capability: expect.any(String), signals: 1 },
        ],
        expiringDirectDemand: 2,
        promotedEntities: 0,
        latestRun: { id: expect.any(String), status: "succeeded" },
        sourceErrors: 0,
        mergedDuplicates: 0,
      },
    });

    const detail = await adminRepository.getSignalDetail(signal.id);
    expect(detail).toMatchObject({
      outcome: "found",
      detail: {
        organisation: {
          id: signal.globalEntityId,
          canonicalName: expect.any(String),
          stablePublicIdentifiers: expect.any(Array),
        },
        associatedOrganisations: { total: 0, truncated: false, items: [] },
        signal: {
          id: signal.id,
          signalType: expect.any(String),
          sourceLanguage: "en",
          firstRunId: expect.any(String),
        },
        scoreRationale: {
          directDemand: { score: expect.any(Number) },
          precursor: { score: null },
          momentum: { score: null },
          coverage: 100,
        },
        timeline: { observedAt: expect.any(Date) },
        systemsContext: { summary: expect.any(String) },
        compliance: {
          sensitiveDataFlags: { faces: null },
          facts: { consent: null },
        },
        requirements: {
          total: 1,
          truncated: false,
          items: [
            {
              kind: "physical_data",
              collectionMethods: expect.any(Array),
              scaleSpecification: null,
            },
          ],
        },
        evidence: {
          total: 1,
          truncated: false,
          items: [
            {
              canonicalSourceUrl: expect.any(String),
              isSyndicated: false,
              supportedFieldPaths: expect.any(Array),
            },
          ],
        },
        history: { total: 1, truncated: false },
        notes: { total: 0, truncated: false, items: [] },
        watchlist: null,
        promotion: null,
        allowedActions: expect.arrayContaining([
          "append_evidence",
          "append_note",
          "edit_expiry",
          "edit_watchlist",
        ]),
      },
    });
    expect(JSON.stringify(detail)).not.toContain("rawMetadata");
    expect(JSON.stringify(detail)).not.toContain("requirementFingerprint");
    expect(JSON.stringify(detail)).not.toContain("evidenceFingerprint");
    await expect(
      adminRepository.getSignalDetail("------------------------------------"),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    const [detailRequirement] = await db
      .select()
      .from(globalSignalRequirements)
      .where(eq(globalSignalRequirements.signalId, signal.id));
    if (!detailRequirement) throw new Error("Detail requirement fixture was not persisted.");
    const { id: _detailRequirementId, ...detailRequirementValues } = detailRequirement;
    void _detailRequirementId;
    await db.insert(globalSignalRequirements).values(
      Array.from({ length: 101 }, (_, index) => ({
        ...detailRequirementValues,
        requirementFingerprint: plainSha256(`detail-requirement-${index}`),
      })),
    );
    const cappedDetail = await adminRepository.getSignalDetail(signal.id);
    expect(cappedDetail).toMatchObject({
      outcome: "found",
      detail: {
        requirements: { total: 102, truncated: true },
      },
    });
    if (cappedDetail.outcome !== "found") throw new Error("Detail was not found.");
    expect(cappedDetail.detail.requirements.items).toHaveLength(100);
    await db
      .update(globalRadarSignals)
      .set({ mergedIntoSignalId: randomUUID() })
      .where(eq(globalRadarSignals.id, signal.id))
      .catch(() => undefined);

    const [run] = await db.select().from(globalRadarRuns).limit(1);
    if (!run) throw new Error("Admin run fixture was not persisted.");
    await db
      .update(globalRadarRuns)
      .set({
        errorSummary: {
          failure: { code: "private_provider_error", message: "secret provider stack" },
          sourceErrors: [{ sourceName: "private source", message: "private failure body" }],
          leaseTokenHash: "secret",
        },
      })
      .where(eq(globalRadarRuns.id, run.id));
    const runs = await adminRepository.listRuns({ page: 1 });
    expect(runs).toMatchObject({
      outcome: "listed",
      page: 1,
      pageSize: 25,
      total: 1,
      runs: [{ notices: expect.any(Array) }],
    });
    const runJson = JSON.stringify(runs);
    expect(runJson).not.toContain("secret provider stack");
    expect(runJson).not.toContain("private failure body");
    expect(runJson).not.toContain("leaseTokenHash");
    expect(runJson).not.toContain("externalRunKey");

    const watchlist = await adminRepository.listWatchlist({ page: 1 });
    expect(watchlist).toEqual({
      outcome: "listed",
      page: 1,
      pageSize: 25,
      total: 0,
      entries: [],
    });
    if (!signal.globalEntityId) throw new Error("Detail entity was not persisted.");
    await expect(
      adminRepository.getWatchlistByEntityId(signal.globalEntityId),
    ).resolves.toEqual({ outcome: "not_found" });
  });
});

describe("PostgreSQL Global Radar optimistic administrator review", () => {
  const adminRepository = createGlobalRadarAdminRepository(db, {
    scoreVersion: "global-radar-score-v1",
    thresholds: {
      direct_demand: 70,
      demand_precursor: 65,
      ecosystem_momentum: 70,
    },
  });
  const actor = { userId: "00000000-0000-4000-8000-000000000099", email: userEmail };

  async function persistedDirect(suffix: string) {
    const now = new Date("2026-07-30T13:00:00.000Z");
    await repository.queueRun(queueInput(`admin-review-${suffix}`, { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Admin review fixture was not claimed.");
    const batch = validPersistenceBatch(claim.run.id, {
      externalSignalId: `admin-review-${suffix}`,
      sourceUrl: `https://review-${suffix}.example/request`,
      stableIdentifierValue: `admin-review-${suffix}`,
      websiteUrl: `https://review-${suffix}.example`,
      linkedinOrganizationUrl: null,
    });
    const completed = await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
      ),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    if (completed.outcome !== "completed") throw new Error("Admin review fixture failed.");
    const [signal] = await db.select().from(globalRadarSignals);
    if (!signal) throw new Error("Admin review signal was not persisted.");
    return signal;
  }

  function envelope(
    expectedRevision: number,
    suffix: string,
    now = "2026-07-30T14:00:00.000Z",
  ) {
    return {
      expectedRevision,
      idempotencyKey: `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`,
      reason: `Administrator review ${suffix}`,
      now: new Date(now),
    };
  }

  it("enforces allowed transitions, derives qualification, and preserves promoted no-India-fit status", async () => {
    const signal = await persistedDirect("transitions");
    const review = await adminRepository.reviewSignal({
      signalId: signal.id,
      actor,
      envelope: envelope(0, "1"),
      command: { type: "request_review" },
    });
    expect(review).toMatchObject({ outcome: "updated", detail: { signal: { status: "needs_review", revision: 1 } } });
    const qualify = await adminRepository.reviewSignal({
      signalId: signal.id,
      actor,
      envelope: envelope(1, "2"),
      command: { type: "qualify" },
    });
    expect(qualify).toMatchObject({ outcome: "updated", detail: { signal: { status: "qualified", revision: 2 } } });
    const monitor = await adminRepository.reviewSignal({
      signalId: signal.id,
      actor,
      envelope: envelope(2, "3"),
      command: { type: "monitor" },
    });
    expect(monitor).toMatchObject({ outcome: "updated", detail: { signal: { status: "monitoring", revision: 3 } } });
    const dismiss = await adminRepository.reviewSignal({
      signalId: signal.id,
      actor,
      envelope: envelope(3, "4"),
      command: { type: "dismiss" },
    });
    expect(dismiss).toMatchObject({ outcome: "updated", detail: { signal: { status: "dismissed", revision: 4 } } });
    const reopen = await adminRepository.reviewSignal({
      signalId: signal.id,
      actor,
      envelope: envelope(4, "5"),
      command: { type: "reopen" },
    });
    expect(reopen).toMatchObject({ outcome: "updated", detail: { signal: { status: "needs_review", revision: 5 } } });

    await db.update(globalRadarSignals).set({ status: "promoted", revision: 10 }).where(eq(globalRadarSignals.id, signal.id));
    const noFit = await adminRepository.reviewSignal({
      signalId: signal.id,
      actor,
      envelope: envelope(10, "6"),
      command: { type: "mark_no_india_fit" },
    });
    expect(noFit).toMatchObject({
      outcome: "updated",
      detail: { signal: { status: "promoted", indiaRelevanceType: "no_current_India_fit", revision: 11 } },
    });
    const forbidden = await adminRepository.reviewSignal({
      signalId: signal.id,
      actor,
      envelope: envelope(11, "7"),
      command: { type: "dismiss" },
    });
    expect(forbidden).toMatchObject({ outcome: "conflict", reason: "transition_not_allowed" });
  });

  it("checks idempotency before revision, rejects changed reuse, returns latest safe detail, and allows one concurrent winner", async () => {
    const signal = await persistedDirect("idempotency");
    const firstInput = {
      signalId: signal.id,
      actor,
      envelope: envelope(0, "11"),
      command: { type: "monitor" as const },
    };
    await expect(adminRepository.reviewSignal(firstInput)).resolves.toMatchObject({ outcome: "updated" });
    await expect(
      adminRepository.reviewSignal({
        ...firstInput,
        envelope: {
          ...firstInput.envelope,
          now: new Date("2026-07-30T15:00:00.000Z"),
        },
      }),
    ).resolves.toMatchObject({
      outcome: "replayed",
      detail: { signal: { revision: 1 } },
    });
    await expect(
      adminRepository.reviewSignal({ ...firstInput, command: { type: "dismiss" } }),
    ).resolves.toEqual({ outcome: "conflict", reason: "idempotency_mismatch" });
    await expect(
      adminRepository.reviewSignal({
        ...firstInput,
        envelope: envelope(0, "12"),
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "revision_mismatch",
      detail: { signal: { revision: 1, status: "monitoring" } },
    });

    const concurrent = await Promise.all([
      adminRepository.reviewSignal({
        signalId: signal.id,
        actor,
        envelope: envelope(1, "13"),
        command: { type: "dismiss" },
      }),
      adminRepository.reviewSignal({
        signalId: signal.id,
        actor,
        envelope: envelope(1, "14"),
        command: { type: "request_review" },
      }),
    ]);
    expect(concurrent.filter(({ outcome }) => outcome === "updated")).toHaveLength(1);
    expect(concurrent.filter(({ outcome }) => outcome === "conflict")).toHaveLength(1);
    expect(await db.select().from(globalRadarAdminEvents)).toHaveLength(2);
  });

  it("enforces server-derived qualification boundaries for all three classes", async () => {
    const direct = await persistedDirect("qualification");
    await db
      .update(globalRadarSignals)
      .set({ status: "needs_review", demandExplicitness: 74 })
      .where(eq(globalRadarSignals.id, direct.id));
    await expect(
      adminRepository.reviewSignal({
        signalId: direct.id,
        actor,
        envelope: envelope(0, "21"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "qualification_requirements_not_met" });
    await db.update(globalRadarSignals).set({ demandExplicitness: 75 }).where(eq(globalRadarSignals.id, direct.id));
    await expect(
      adminRepository.reviewSignal({
        signalId: direct.id,
        actor,
        envelope: envelope(0, "22"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "updated" });

    await db
      .update(globalRadarSignals)
      .set({ status: "needs_review", revision: 2, scorePolicyVersion: "global-radar-score-v0" })
      .where(eq(globalRadarSignals.id, direct.id));
    await expect(
      adminRepository.reviewSignal({
        signalId: direct.id,
        actor,
        envelope: envelope(2, "23"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "qualification_requirements_not_met" });

    const [directTemplate] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, direct.id));
    if (!directTemplate) throw new Error("Qualification template missing.");
    const precursorId = randomUUID();
    await db.insert(globalRadarSignals).values({
      ...directTemplate,
      id: precursorId,
      signalClass: "demand_precursor",
      signalType: "funding",
      title: "Qualification precursor boundary",
      status: "needs_review",
      revision: 0,
      dedupeKey: "7".repeat(64),
      scorePolicyVersion: "global-radar-score-v1",
      demandExplicitness: null,
      freshness: null,
      actionability: null,
      commercialPotential: null,
      repeatability: null,
      responseAccessibility: null,
      strategicLearning: null,
      complianceComplexity: null,
      directDemandScore: null,
      evidenceConfidence: 59,
      proximityToExternalDemand: 50,
      fundingDeploymentMomentum: 80,
      likelyDataHardwareIntensity: 80,
      estimatedTimeHorizon: 80,
      strategicRelevance: 80,
      precursorScore: 72,
      expiresAt: null,
      evergreen: null,
      reobserveBy: null,
      responsePathType: null,
      responsePathUrl: null,
      responseBusinessEmail: null,
      partnerApplicationUrl: null,
    });
    await expect(
      adminRepository.reviewSignal({
        signalId: precursorId,
        actor,
        envelope: envelope(0, "24"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "qualification_requirements_not_met" });
    await db.update(globalRadarSignals).set({ evidenceConfidence: 60 }).where(eq(globalRadarSignals.id, precursorId));
    await expect(
      adminRepository.reviewSignal({
        signalId: precursorId,
        actor,
        envelope: envelope(0, "25"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "updated" });

    const momentumNow = new Date("2026-07-30T15:00:00.000Z");
    await repository.queueRun(queueInput("admin-momentum-qualification", { now: momentumNow }));
    const momentumClaim = await repository.claimRun({ now: momentumNow });
    if (momentumClaim.outcome !== "claimed") throw new Error("Momentum qualification fixture was not claimed.");
    const momentumBatch = validMomentumPersistenceBatch(momentumClaim.run.id);
    const momentumComplete = await repository.completeRun({
      ...completionInput(
        momentumClaim.run.id,
        momentumClaim.privateClaim.leaseToken,
        new Date(momentumNow.getTime() + 1_000),
      ),
      submissionHash: momentumBatch.canonicalSubmissionHash,
      batch: momentumBatch,
    });
    if (momentumComplete.outcome !== "completed") throw new Error("Momentum qualification fixture failed.");
    const [momentum] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.signalClass, "ecosystem_momentum"));
    if (!momentum) throw new Error("Momentum qualification signal missing.");
    await db
      .update(globalRadarSignals)
      .set({
        status: "needs_review",
        momentumScore: 70,
        momentumEvidenceQuality: 59,
      })
      .where(eq(globalRadarSignals.id, momentum.id));
    await expect(
      adminRepository.reviewSignal({
        signalId: momentum.id,
        actor,
        envelope: envelope(0, "26"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "qualification_requirements_not_met" });
    await db.update(globalRadarSignals).set({ momentumEvidenceQuality: 60 }).where(eq(globalRadarSignals.id, momentum.id));
    await expect(
      adminRepository.reviewSignal({
        signalId: momentum.id,
        actor,
        envelope: envelope(0, "27"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "updated" });
  });

  it("edits direct expiry and cross-class classification without stale class fields", async () => {
    const signal = await persistedDirect("edits");
    const expiry = await adminRepository.editDirectDemandExpiry({
      signalId: signal.id,
      actor,
      envelope: envelope(0, "31"),
      expiry: {
        evergreen: true,
        expiresAt: null,
        reobserveBy: "2026-08-30T00:00:00.000Z",
      },
    });
    expect(expiry).toMatchObject({
      outcome: "updated",
      detail: { signal: { revision: 1, reobserveBy: new Date("2026-08-30T00:00:00.000Z") } },
    });
    await db.update(globalRadarSignals).set({ status: "monitoring" }).where(eq(globalRadarSignals.id, signal.id));
    const classification = await adminRepository.editSignalClassification({
      signalId: signal.id,
      actor,
      envelope: envelope(1, "32"),
      classification: {
        signalClass: "demand_precursor",
        signalType: "funding",
        demandDomain: "robot_learning_and_manipulation",
        components: {
          evidenceConfidence: 80,
          proximityToExternalDemand: 70,
          fundingDeploymentMomentum: 80,
          likelyDataHardwareIntensity: 70,
          indiaFit: 80,
          estimatedTimeHorizon: 80,
          strategicRelevance: 75,
        },
      },
    });
    expect(classification).toMatchObject({
      outcome: "updated",
      detail: { signal: { signalClass: "demand_precursor", status: "monitoring", revision: 2 } },
    });
    const [stored] = await db.select().from(globalRadarSignals).where(eq(globalRadarSignals.id, signal.id));
    expect(stored).toMatchObject({
      signalClass: "demand_precursor",
      directDemandScore: null,
      demandExplicitness: null,
      evergreen: null,
      reobserveBy: null,
      precursorScore: expect.any(Number),
    });

    const restoredDirect = await adminRepository.editSignalClassification({
      signalId: signal.id,
      actor,
      envelope: envelope(2, "33"),
      classification: {
        signalClass: "direct_demand",
        signalType: "procurement",
        demandDomain: "robot_learning_and_manipulation",
        components: {
          explicitness: 90,
          evidenceConfidence: 85,
          freshness: 80,
          actionability: 80,
          indiaFit: 75,
          commercialPotential: 75,
          repeatability: 70,
          responseAccessibility: 70,
          strategicLearning: 70,
          complianceComplexity: 20,
        },
        activity: {
          evergreen: false,
          expiresAt: "2026-09-30T00:00:00.000Z",
          reobserveBy: null,
        },
      },
    });
    expect(restoredDirect).toMatchObject({
      outcome: "updated",
      detail: { signal: { signalClass: "direct_demand", revision: 3 } },
    });
    const [restored] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    expect(restored).toMatchObject({
      signalClass: "direct_demand",
      globalEntityId: signal.globalEntityId,
      directDemandScore: expect.any(Number),
      precursorScore: null,
      proximityToExternalDemand: null,
      expiresAt: new Date("2026-09-30T00:00:00.000Z"),
      evergreen: false,
      momentumScore: null,
    });

    const classificationEvents = await db
      .select({
        beforeSafeState: globalRadarAdminEvents.beforeSafeState,
        afterSafeState: globalRadarAdminEvents.afterSafeState,
      })
      .from(globalRadarAdminEvents)
      .where(eq(globalRadarAdminEvents.action, "classification_changed"));
    expect(classificationEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          beforeSafeState: expect.objectContaining({
            classification: expect.objectContaining({
              signalClass: "direct_demand",
              primaryEntityId: signal.globalEntityId,
              associations: expect.any(Array),
            }),
            score: expect.objectContaining({ directDemand: expect.any(Number) }),
          }),
          afterSafeState: expect.objectContaining({
            classification: expect.objectContaining({
              signalClass: "demand_precursor",
              primaryEntityId: signal.globalEntityId,
              associations: expect.any(Array),
            }),
            score: expect.objectContaining({ precursor: expect.any(Number) }),
          }),
        }),
      ]),
    );

    await db
      .update(globalRadarSignals)
      .set({ announcedAt: new Date("2026-09-01T00:00:00.000Z") })
      .where(eq(globalRadarSignals.id, signal.id));
    await expect(
      adminRepository.editSignalClassification({
        signalId: signal.id,
        actor,
        envelope: envelope(3, "331"),
        classification: {
          signalClass: "direct_demand",
          signalType: "procurement",
          demandDomain: "robot_learning_and_manipulation",
          components: {
            explicitness: 90,
            evidenceConfidence: 85,
            freshness: 80,
            actionability: 80,
            indiaFit: 75,
            commercialPotential: 75,
            repeatability: 70,
            responseAccessibility: 70,
            strategicLearning: 70,
            complianceComplexity: 20,
          },
          activity: {
            evergreen: false,
            expiresAt: "2026-08-31T00:00:00.000Z",
            reobserveBy: null,
          },
        },
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });

    await db
      .update(globalRadarSignals)
      .set({ status: "qualified" })
      .where(eq(globalRadarSignals.id, signal.id));
    await expect(
      adminRepository.editSignalClassification({
        signalId: signal.id,
        actor,
        envelope: envelope(3, "34"),
        classification: {
          signalClass: "demand_precursor",
          signalType: "funding",
          demandDomain: "robot_learning_and_manipulation",
          components: {
            evidenceConfidence: 80,
            proximityToExternalDemand: 70,
            fundingDeploymentMomentum: 80,
            likelyDataHardwareIntensity: 70,
            indiaFit: 80,
            estimatedTimeHorizon: 80,
            strategicRelevance: 75,
          },
        },
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "classification_requirements_not_met",
    });
  });

  it("reclassifies momentum through precursor and back from preserved target graph facts", async () => {
    const now = new Date("2026-07-30T15:00:00.000Z");
    await repository.queueRun(queueInput("admin-momentum-classification", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Momentum classification fixture was not claimed.");
    const batch = validMomentumPersistenceBatch(claim.run.id);
    const completed = await repository.completeRun({
      ...completionInput(claim.run.id, claim.privateClaim.leaseToken, new Date(now.getTime() + 1_000)),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    if (completed.outcome !== "completed") throw new Error("Momentum classification fixture failed.");
    const [momentum] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.signalClass, "ecosystem_momentum"));
    if (!momentum) throw new Error("Momentum classification signal missing.");
    const [contributor] = await db
      .select({ globalEntityId: globalRadarSignalEntities.globalEntityId })
      .from(globalRadarSignalEntities)
      .where(eq(globalRadarSignalEntities.signalId, momentum.id));
    if (!contributor) throw new Error("Momentum contributor missing.");
    await db
      .update(globalRadarSignals)
      .set({ status: "monitoring" })
      .where(eq(globalRadarSignals.id, momentum.id));

    await expect(
      adminRepository.editSignalClassification({
        signalId: momentum.id,
        actor,
        envelope: envelope(0, "35", "2026-07-31T16:00:00.000Z"),
        classification: {
          signalClass: "demand_precursor",
          primaryEntityId: contributor.globalEntityId,
          signalType: "funding",
          demandDomain: "robot_learning_and_manipulation",
          components: {
            evidenceConfidence: 80,
            proximityToExternalDemand: 70,
            fundingDeploymentMomentum: 80,
            likelyDataHardwareIntensity: 70,
            indiaFit: 80,
            estimatedTimeHorizon: 80,
            strategicRelevance: 75,
          },
        },
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      detail: { signal: { signalClass: "demand_precursor", revision: 1 } },
    });
    const precursorGraph = await db
      .select({
        globalEntityId: globalRadarSignalEntities.globalEntityId,
        role: globalRadarSignalEntities.role,
      })
      .from(globalRadarSignalEntities)
      .where(eq(globalRadarSignalEntities.signalId, momentum.id));
    expect(precursorGraph).toHaveLength(2);
    expect(precursorGraph.every(({ role }) => role === "supporting")).toBe(true);
    expect(
      precursorGraph.some(
        ({ globalEntityId }) => globalEntityId === contributor.globalEntityId,
      ),
    ).toBe(false);

    await expect(
      adminRepository.editSignalClassification({
        signalId: momentum.id,
        actor,
        envelope: envelope(1, "36", "2026-07-31T16:00:00.000Z"),
        classification: {
          signalClass: "ecosystem_momentum",
          signalType: "ecosystem_direction",
          demandDomain: "robot_learning_and_manipulation",
          components: {
            taxonomyConsistency: 85,
            evidenceQuality: 80,
          },
        },
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      detail: { signal: { signalClass: "ecosystem_momentum", revision: 2 } },
    });
    const [restoredMomentum] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, momentum.id));
    expect(restoredMomentum).toMatchObject({
      signalClass: "ecosystem_momentum",
      globalEntityId: null,
      precursorScore: null,
      evidenceConfidence: null,
      momentumIndependentEntityCount: 2,
      momentumPrimarySourceCount: 1,
      momentumSourceFamilyCount: 2,
      momentumScore: expect.any(Number),
      momentumQualificationGatesPassed: true,
    });
    const momentumGraph = await db
      .select({
        globalEntityId: globalRadarSignalEntities.globalEntityId,
        role: globalRadarSignalEntities.role,
      })
      .from(globalRadarSignalEntities)
      .where(eq(globalRadarSignalEntities.signalId, momentum.id));
    expect(momentumGraph).toHaveLength(3);
    expect(momentumGraph.every(({ role }) => role === "contributor")).toBe(true);
    expect(
      momentumGraph.some(
        ({ globalEntityId }) => globalEntityId === contributor.globalEntityId,
      ),
    ).toBe(true);

    for (const [status, suffix] of [["qualified", "37"], ["promoted", "38"]] as const) {
      await db
        .update(globalRadarSignals)
        .set({ status })
        .where(eq(globalRadarSignals.id, momentum.id));
      await expect(
        adminRepository.editSignalClassification({
          signalId: momentum.id,
          actor,
          envelope: envelope(2, suffix, "2026-07-31T16:00:00.000Z"),
          classification: {
            signalClass: "demand_precursor",
            primaryEntityId: contributor.globalEntityId,
            signalType: "funding",
            demandDomain: "robot_learning_and_manipulation",
            components: {
              evidenceConfidence: 80,
              proximityToExternalDemand: 70,
              fundingDeploymentMomentum: 80,
              likelyDataHardwareIntensity: 70,
              indiaFit: 80,
              estimatedTimeHorizon: 80,
              strategicRelevance: 75,
            },
          },
        }),
      ).resolves.toEqual({
        outcome: "conflict",
        reason: "classification_requirements_not_met",
      });
    }
  });
});

describe("PostgreSQL Global Radar administrator evidence and notes", () => {
  const adminRepository = createGlobalRadarAdminRepository(db, {
    scoreVersion: "global-radar-score-v1",
    thresholds: { direct_demand: 70, demand_precursor: 65, ecosystem_momentum: 70 },
  });
  const actor = { userId: "00000000-0000-4000-8000-000000000099", email: userEmail };

  async function fixture() {
    const now = new Date("2026-07-30T15:00:00.000Z");
    await repository.queueRun(queueInput("admin-evidence", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Evidence fixture was not claimed.");
    const batch = validPersistenceBatch(claim.run.id);
    const completed = await repository.completeRun({
      ...completionInput(claim.run.id, claim.privateClaim.leaseToken, new Date(now.getTime() + 1_000)),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    if (completed.outcome !== "completed") throw new Error("Evidence fixture failed.");
    const [signal] = await db.select().from(globalRadarSignals);
    if (!signal) throw new Error("Evidence signal missing.");
    return signal;
  }

  function envelope(expectedRevision: number, id: string, now = "2026-07-30T16:00:00.000Z") {
    return {
      expectedRevision,
      idempotencyKey: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
      reason: "Evidence review",
      now: new Date(now),
    };
  }

  function evidence(sourceUrl = "https://admin-evidence.example/public-update") {
    return {
      globalEntityId: null,
      sourceUrl,
      canonicalSourceUrl: sourceUrl,
      sourceName: "Public update",
      sourceType: "official_update",
      sourceLanguage: "en",
      sourceCountry: "United States",
      sourceFamily: "official_company_material" as const,
      claim: "The organisation published a concise dated update.",
      sourceExcerpt: "A concise public update.",
      englishSummary: "The organisation published a concise dated update.",
      publishedAt: "2026-07-30T12:00:00.000Z",
      observedAt: "2026-07-30T15:30:00.000Z",
      evidenceConfidence: 85,
      translationConfidence: null,
      isPrimarySource: true,
      isSyndicated: false,
      supportsDirectDemand: false,
      supportsIndiaRelevance: false,
      supportedFieldPaths: ["signal.factualSummary"],
      rawMetadata: {},
    };
  }

  it("rejects private, search-only, full-page, future, and invalid translation evidence atomically", async () => {
    const signal = await fixture();
    const invalid = [
      evidence("http://127.0.0.1/private"),
      evidence("https://www.google.com/search?q=robotics"),
      { ...evidence(), claim: "<html><body>full page</body></html>" },
      { ...evidence(), observedAt: "2026-07-31T00:00:00.000Z" },
      { ...evidence(), publishedAt: "2026-07-31T00:00:00.000Z" },
      {
        ...evidence(),
        sourceLanguage: "zh-CN",
        claim: "机器人公司发布了公开更新。",
        translationConfidence: null,
      },
    ];
    for (const [index, item] of invalid.entries()) {
      await expect(
        adminRepository.appendEvidence({
          signalId: signal.id,
          actor,
          envelope: envelope(0, String(100 + index)),
          evidence: item,
        }),
      ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    }
    const [primaryEntity] = await db.select().from(globalEntities).limit(1);
    if (!primaryEntity) throw new Error("Evidence primary entity missing.");
    const unrelatedEntityId = randomUUID();
    await db.insert(globalEntities).values({
      ...primaryEntity,
      id: unrelatedEntityId,
      canonicalName: "Unrelated Evidence Entity",
      normalizedName: "unrelated evidence entity",
      canonicalDomain: "unrelated-evidence.example",
      websiteUrl: "https://unrelated-evidence.example",
      stablePublicIdentifiers: ["official_registry:unrelated-evidence"],
      publicIdentityAnchor: "e".repeat(64),
    });
    await expect(
      adminRepository.appendEvidence({
        signalId: signal.id,
        actor,
        envelope: envelope(0, "199"),
        evidence: { ...evidence(), globalEntityId: unrelatedEntityId },
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    expect(await db.select().from(globalSignalEvidence)).toHaveLength(1);
    expect(await db.select().from(globalRadarAdminEvents)).toHaveLength(0);
  });

  it("canonicalizes and appends evidence once, replays before revision with later now, and rejects changed reuse", async () => {
    const signal = await fixture();
    const input = {
      signalId: signal.id,
      actor,
      envelope: envelope(0, "200"),
      evidence: {
        ...evidence("https://admin-evidence.example/public-update?utm_source=test"),
        canonicalSourceUrl: "https://client-proposal.example/not-authoritative",
        rawMetadata: { clientControlled: "must not persist" },
      },
    };
    await expect(adminRepository.appendEvidence(input)).resolves.toMatchObject({ outcome: "appended", revision: 1 });
    await expect(
      adminRepository.appendEvidence({
        ...input,
        envelope: { ...input.envelope, now: new Date("2026-07-30T17:00:00.000Z") },
      }),
    ).resolves.toMatchObject({ outcome: "replayed", revision: 1 });
    await expect(
      adminRepository.appendEvidence({
        ...input,
        evidence: { ...input.evidence, claim: "Changed claim under the same key." },
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "idempotency_mismatch" });
    const rows = await db.select().from(globalSignalEvidence);
    expect(rows).toHaveLength(2);
    const appended = rows.find(({ runId }) => runId === null);
    expect(appended).toMatchObject({
      runId: null,
      canonicalSourceUrl: "https://admin-evidence.example/public-update",
      observedAt: new Date("2026-07-30T16:00:00.000Z"),
      rawMetadata: {},
    });
    expect(JSON.stringify(appended)).not.toContain("clientControlled");
  });

  it("stores notes only in append-only history and never echoes note text from the mutation or audit", async () => {
    const signal = await fixture();
    const body = "Private administrator note for later review.";
    const result = await adminRepository.appendNote({
      signalId: signal.id,
      actor,
      envelope: envelope(0, "300"),
      body,
    });
    expect(result).toEqual({ outcome: "appended", revision: 1 });
    expect(JSON.stringify(result)).not.toContain(body);
    const notes = await db
      .select()
      .from(globalSignalUpdates)
      .where(eq(globalSignalUpdates.updateType, "note_appended"));
    expect(notes).toHaveLength(1);
    expect(notes[0]?.reason).toBe(body);
    const [audit] = await db.select().from(globalRadarAdminEvents);
    expect(JSON.stringify(audit)).not.toContain(body);
    const list = await adminRepository.listSignals({
      signalClass: "direct_demand",
      filters: { page: 1 },
    });
    expect(JSON.stringify(list)).not.toContain(body);
    const detail = await adminRepository.getSignalDetail(signal.id);
    expect(JSON.stringify(detail)).toContain(body);
  });
});

describe("PostgreSQL Global Radar transactional administrator merge", () => {
  const adminRepository = createGlobalRadarAdminRepository(db, {
    scoreVersion: "global-radar-score-v1",
    thresholds: { direct_demand: 70, demand_precursor: 65, ecosystem_momentum: 70 },
  });
  const actor = { userId: "00000000-0000-4000-8000-000000000099", email: userEmail };

  async function mergeFixture() {
    const now = new Date("2026-07-30T17:00:00.000Z");
    await repository.queueRun(queueInput("admin-merge", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Merge fixture was not claimed.");
    const batch = validPersistenceBatch(claim.run.id);
    const completed = await repository.completeRun({
      ...completionInput(claim.run.id, claim.privateClaim.leaseToken, new Date(now.getTime() + 1_000)),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    if (completed.outcome !== "completed") throw new Error("Merge fixture failed.");
    const [survivor] = await db.select().from(globalRadarSignals);
    if (!survivor) throw new Error("Merge survivor missing.");
    const duplicateId = randomUUID();
    await db.insert(globalRadarSignals).values({
      ...survivor,
      id: duplicateId,
      title: "Duplicate signal version",
      dedupeKey: "9".repeat(64),
    });
    const [requirement] = await db.select().from(globalSignalRequirements);
    const [evidenceRow] = await db.select().from(globalSignalEvidence);
    const [update] = await db.select().from(globalSignalUpdates);
    if (!requirement || !evidenceRow || !update) throw new Error("Merge children missing.");
    const { id: _requirementId, ...requirementValues } = requirement;
    const { id: _evidenceId, ...evidenceValues } = evidenceRow;
    const { id: _updateId, ...updateValues } = update;
    void _requirementId;
    void _evidenceId;
    void _updateId;
    await db.insert(globalSignalRequirements).values({ ...requirementValues, signalId: duplicateId });
    const [duplicateEvidence] = await db
      .insert(globalSignalEvidence)
      .values({ ...evidenceValues, signalId: duplicateId })
      .returning({ id: globalSignalEvidence.id });
    await db.insert(globalSignalUpdates).values({
      ...updateValues,
      signalId: duplicateId,
      evidenceId: duplicateEvidence?.id ?? null,
    });
    return { survivor, duplicateId };
  }

  function input(survivorSignalId: string, duplicateSignalId: string, id: string) {
    return {
      survivorSignalId,
      duplicateSignalId,
      expectedSurvivorRevision: 0,
      expectedDuplicateRevision: 0,
      confirmed: true,
      actor,
      idempotencyKey: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
      reason: "Confirmed duplicate public signal",
      now: new Date("2026-07-30T18:00:00.000Z"),
    };
  }

  it("merges without deleting or reparenting either signal graph and replays exactly", async () => {
    const { survivor, duplicateId } = await mergeFixture();
    const before = await graphRowCounts();
    const request = input(survivor.id, duplicateId, "400");
    await expect(adminRepository.mergeSignals(request)).resolves.toMatchObject({
      outcome: "merged",
      survivor: { signal: { id: survivor.id, revision: 1 } },
      duplicate: { signal: { id: duplicateId, mergedIntoSignalId: survivor.id, revision: 1 } },
    });
    await expect(
      adminRepository.mergeSignals({ ...request, now: new Date("2026-07-30T19:00:00.000Z") }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      adminRepository.mergeSignals({ ...request, reason: "Changed reuse" }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "idempotency_mismatch",
      survivor: { signal: { id: survivor.id, revision: 1 } },
      duplicate: {
        signal: {
          id: duplicateId,
          mergedIntoSignalId: survivor.id,
          revision: 1,
        },
      },
    });
    const after = await graphRowCounts();
    expect(after.slice(0, 6)).toEqual(before.slice(0, 6));
    expect(
      await db.select().from(globalSignalRequirements).where(eq(globalSignalRequirements.signalId, duplicateId)),
    ).toHaveLength(1);
    expect(
      await db.select().from(globalSignalEvidence).where(eq(globalSignalEvidence.signalId, duplicateId)),
    ).toHaveLength(1);
    expect(
      await db.select().from(globalSignalUpdates).where(eq(globalSignalUpdates.updateType, "merged")),
    ).toHaveLength(2);
  });

  it("locks lexical UUID order so opposite-order concurrent merges have one winner without deadlock", async () => {
    const { survivor, duplicateId } = await mergeFixture();
    const results = await Promise.all([
      adminRepository.mergeSignals(input(survivor.id, duplicateId, "401")),
      adminRepository.mergeSignals(input(duplicateId, survivor.id, "402")),
    ]);
    expect(results.filter(({ outcome }) => outcome === "merged")).toHaveLength(1);
    expect(
      results.filter(
        (result) =>
          result.outcome === "conflict" &&
          ["revision_mismatch", "already_merged"].includes(result.reason),
      ),
    ).toHaveLength(1);
    expect(
      results.find(({ outcome }) => outcome === "conflict"),
    ).toMatchObject({
      survivor: { signal: { revision: 1 } },
      duplicate: { signal: { revision: 1 } },
    });
  });
});

describe("PostgreSQL Global Radar administrator watchlist persistence", () => {
  const adminRepository = createGlobalRadarAdminRepository(db, {
    scoreVersion: "global-radar-score-v1",
    thresholds: { direct_demand: 70, demand_precursor: 65, ecosystem_momentum: 70 },
  });

  async function existingEntityFixture() {
    const now = new Date("2026-07-30T19:00:00.000Z");
    await repository.queueRun(queueInput("admin-watchlist", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Watchlist fixture was not claimed.");
    const batch = validPersistenceBatch(claim.run.id);
    const completed = await repository.completeRun({
      ...completionInput(claim.run.id, claim.privateClaim.leaseToken, new Date(now.getTime() + 1_000)),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    if (completed.outcome !== "completed") throw new Error("Watchlist fixture failed.");
    const [entity] = await db.select().from(globalEntities);
    if (!entity) throw new Error("Watchlist entity missing.");
    return entity;
  }

  const actor = () => ({ userId: administratorUserId, email: userEmail });
  function configuration(state: "enabled" | "paused" | "disabled" = "enabled") {
    return {
      state,
      priority: 80,
      theme: "robotics_manufacturing" as const,
      category: "component_suppliers",
      categorySearchTermEn: "robotics component suppliers",
      categorySearchTermZhCn: null,
      countries: ["United States"],
      languages: ["en"],
      cadenceDays: 7,
      nextScanAt: state === "enabled" ? "2026-08-01T00:00:00.000Z" : null,
    };
  }
  function envelope(id: string, now = "2026-07-30T20:00:00.000Z") {
    return {
      idempotencyKey: `00000000-0000-4000-8000-${id.padStart(12, "0")}`,
      reason: "Administrator watchlist configuration",
      now: new Date(now),
    };
  }

  it("creates, pauses, and disables one preserved entry with optimistic revisions and exact replay", async () => {
    const entity = await existingEntityFixture();
    const createInput = {
      entity: { type: "existing" as const, entityId: entity.id, expectedRevision: 0 },
      expectedEntryRevision: null,
      actor: actor(),
      envelope: envelope("500"),
      configuration: configuration(),
    };
    await expect(adminRepository.upsertWatchlist(createInput)).resolves.toMatchObject({
      outcome: "created",
      entity: { id: entity.id, entityStatus: "watchlisted", revision: 1 },
      entry: { state: "enabled", revision: 0 },
    });
    await expect(
      adminRepository.upsertWatchlist({
        ...createInput,
        envelope: envelope("500", "2026-07-30T21:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    const paused = await adminRepository.upsertWatchlist({
      entity: { type: "existing", entityId: entity.id, expectedRevision: 1 },
      expectedEntryRevision: 0,
      actor: actor(),
      envelope: envelope("501"),
      configuration: { ...configuration("paused"), nextScanAt: "2026-08-02T00:00:00.000Z" },
    });
    expect(paused).toMatchObject({ outcome: "updated", entry: { state: "paused", nextScanAt: null, revision: 1 } });
    const disabled = await adminRepository.upsertWatchlist({
      entity: { type: "existing", entityId: entity.id, expectedRevision: 1 },
      expectedEntryRevision: 1,
      actor: actor(),
      envelope: envelope("502"),
      configuration: configuration("disabled"),
    });
    expect(disabled).toMatchObject({ outcome: "updated", entry: { state: "disabled", revision: 2 } });
    await db
      .update(globalEntities)
      .set({ entityStatus: "qualified" })
      .where(eq(globalEntities.id, entity.id));
    const reenabled = await adminRepository.upsertWatchlist({
      entity: { type: "existing", entityId: entity.id, expectedRevision: 1 },
      expectedEntryRevision: 2,
      actor: actor(),
      envelope: envelope("503"),
      configuration: {
        ...configuration(),
        priority: 95,
        cadenceDays: 14,
        nextScanAt: "2026-08-15T00:00:00.000Z",
      },
    });
    expect(reenabled).toMatchObject({
      outcome: "updated",
      entity: { entityStatus: "qualified", revision: 1 },
      entry: {
        state: "enabled",
        priority: 95,
        cadenceDays: 14,
        nextScanAt: new Date("2026-08-15T00:00:00.000Z"),
        revision: 3,
      },
    });
    await expect(
      adminRepository.getWatchlistByEntityId(entity.id),
    ).resolves.toMatchObject({
      outcome: "found",
      entry: {
        globalEntityId: entity.id,
        state: "enabled",
        priority: 95,
        revision: 3,
        entity: { entityStatus: "qualified", revision: 1 },
      },
    });
    expect(await db.select().from(globalRadarWatchlistEntries)).toHaveLength(1);
  });

  it("enforces China localization, cadence, identity ownership, and signal-free strong identity creation", async () => {
    const entity = await existingEntityFixture();
    await expect(
      adminRepository.upsertWatchlist({
        entity: { type: "existing", entityId: entity.id, expectedRevision: 0 },
        expectedEntryRevision: null,
        actor: actor(),
        envelope: envelope("510"),
        configuration: {
          ...configuration(),
          countries: ["China"],
          languages: ["en", "zh-CN"],
          cadenceDays: 366,
        },
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      adminRepository.upsertWatchlist({
        entity: { type: "existing", entityId: entity.id, expectedRevision: 0 },
        expectedEntryRevision: null,
        actor: actor(),
        envelope: envelope("511"),
        configuration: {
          ...configuration(),
          countries: ["China"],
          languages: ["en", "zh-CN"],
        },
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });

    const proposedId = randomUUID();
    const created = await adminRepository.upsertWatchlist({
      entity: {
        type: "create",
        entityId: proposedId,
        canonicalName: "Signal Free Robotics",
        websiteUrl: "https://signal-free.example",
        linkedinOrganizationUrl: null,
        stablePublicIdentifiers: [],
        canonicalCorporateGroupId: null,
        headquartersCountry: "India",
        headquartersCity: "Bengaluru",
        operatingCountries: ["India"],
        organisationType: "robotics_company",
        sector: "robotics",
        shortDescription: "A public robotics organisation identity.",
      },
      expectedEntryRevision: null,
      actor: actor(),
      envelope: envelope("512"),
      configuration: configuration(),
    });
    expect(created).toMatchObject({
      outcome: "created",
      entity: { id: proposedId, entityStatus: "watchlisted", revision: 0 },
    });
    await expect(
      adminRepository.upsertWatchlist({
        entity: {
          type: "create",
          entityId: randomUUID(),
          canonicalName: "Different Name",
          websiteUrl: "https://signal-free.example",
          linkedinOrganizationUrl: null,
          stablePublicIdentifiers: [],
          canonicalCorporateGroupId: null,
          headquartersCountry: "India",
          headquartersCity: null,
          operatingCountries: null,
          organisationType: "robotics_company",
          sector: "robotics",
          shortDescription: "Conflicting identity owner.",
        },
        expectedEntryRevision: null,
        actor: actor(),
        envelope: envelope("513"),
        configuration: configuration(),
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "entity_identity_conflict" });
  });

  it("allows exactly one optimistic concurrent entry update", async () => {
    const entity = await existingEntityFixture();
    await adminRepository.upsertWatchlist({
      entity: { type: "existing", entityId: entity.id, expectedRevision: 0 },
      expectedEntryRevision: null,
      actor: actor(),
      envelope: envelope("520"),
      configuration: configuration(),
    });
    const results = await Promise.all([
      adminRepository.upsertWatchlist({
        entity: { type: "existing", entityId: entity.id, expectedRevision: 1 },
        expectedEntryRevision: 0,
        actor: actor(),
        envelope: envelope("521"),
        configuration: configuration("paused"),
      }),
      adminRepository.upsertWatchlist({
        entity: { type: "existing", entityId: entity.id, expectedRevision: 1 },
        expectedEntryRevision: 0,
        actor: actor(),
        envelope: envelope("522"),
        configuration: configuration("disabled"),
      }),
    ]);
    expect(results.filter(({ outcome }) => outcome === "updated")).toHaveLength(1);
    expect(results.filter(({ outcome }) => outcome === "conflict")).toHaveLength(1);
    expect(results.find(({ outcome }) => outcome === "conflict")).toMatchObject({
      reason: "revision_mismatch",
      entity: { id: entity.id, revision: 1 },
      entry: { revision: 1 },
    });
  });
});
