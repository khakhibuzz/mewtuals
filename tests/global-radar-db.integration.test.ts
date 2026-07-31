import { createHash, randomBytes, randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  GLOBAL_RADAR_DEDUPE_VERSION,
  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
  MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS,
  GLOBAL_RADAR_PROMPT_VERSION,
  GLOBAL_RADAR_SCHEMA_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
  assessComplianceReview,
  canonicalizeGlobalRadarPersistenceBatch,
  createEntityIdentity,
  createEvidenceFingerprint,
  createGlobalRadarFingerprint,
  createGlobalRadarPersistenceHash,
  createGlobalRadarSignalDedupeKey,
  createGlobalRadarSignalDedupeKeyFromIdentityAnchors,
  deriveEcosystemMomentum,
  deriveGlobalRadarReclassification,
  generateGlobalRadarQueries,
  normalizeRequirements,
  parseGlobalRadarPlanSnapshot,
  parseActiveScoreEvidenceSnapshot,
  planGlobalRadarRun,
  persistableGlobalRadarBatchObjectSchema,
  scoreDemandPrecursor,
  scoreDirectDemand,
  scoreEcosystemMomentum,
  type ActiveScoreEvidenceSnapshot,
  type PersistableGlobalRadarBatch,
  type RadarPlan,
} from "../app/domain/global-radar";
import { createGlobalRadarAdminService } from "../app/server/global-radar/admin-service";
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
import {
  createStoredGlobalRadarScoreInputDigest,
  rebaseStoredScoreEvidenceSnapshot,
  storedScoreComponents,
} from "../db/repositories/global-radar-score-evidence";
import { validateStoredGlobalRadarScoreProvenance } from "../db/repositories/global-radar-stored-score-provenance";
import * as coreDatabaseSchema from "../db/schema";
import { discoveryRuns, users } from "../db/schema";

const db = getDb();
const testRun = randomUUID();
const userEmail = `global-radar-db-${testRun}@example.test`;
const HASH_A = "a".repeat(64);

async function nextGlobalRadarEvidenceIngestOrdinal(signalId: string) {
  const [latestEvidence] = await db
    .select({ ingestOrdinal: globalSignalEvidence.ingestOrdinal })
    .from(globalSignalEvidence)
    .where(eq(globalSignalEvidence.signalId, signalId))
    .orderBy(desc(globalSignalEvidence.ingestOrdinal))
    .limit(1);
  return (latestEvidence?.ingestOrdinal ?? 0) + 1;
}

type MutableActiveScoreEvidenceAssociation = {
  -readonly [Key in keyof ActiveScoreEvidenceSnapshot["componentEvidence"][number]]:
    Key extends "evidence"
      ? Array<
          ActiveScoreEvidenceSnapshot["componentEvidence"][number]["evidence"][number]
        >
      : ActiveScoreEvidenceSnapshot["componentEvidence"][number][Key];
};
type MutableActiveScoreEvidenceSnapshot = {
  -readonly [Key in keyof ActiveScoreEvidenceSnapshot]:
    Key extends "componentEvidence"
      ? MutableActiveScoreEvidenceAssociation[]
      : ActiveScoreEvidenceSnapshot[Key];
};

async function rebaseGlobalRadarFixtureSignal(
  signalId: string,
  overrides: Partial<typeof globalRadarSignals.$inferSelect>,
) {
  const [signal] = await db
    .select()
    .from(globalRadarSignals)
    .where(eq(globalRadarSignals.id, signalId));
  if (!signal) throw new Error("Score-input rebase fixture signal is missing.");
  const provenance = await validateStoredGlobalRadarScoreProvenance(db, signal);
  if (!provenance.valid) {
    throw new Error(`Score-input rebase fixture is invalid: ${provenance.reason}.`);
  }
  const associations = await db
    .select({
      globalEntityId: globalRadarSignalEntities.globalEntityId,
      role: globalRadarSignalEntities.role,
    })
    .from(globalRadarSignalEntities)
    .where(eq(globalRadarSignalEntities.signalId, signal.id));
  const entityIds = [
    ...new Set([
      ...(signal.globalEntityId === null ? [] : [signal.globalEntityId]),
      ...associations.map(({ globalEntityId }) => globalEntityId),
      ...provenance.evaluationEvidence.flatMap(({ globalEntityId }) =>
        globalEntityId === null ? [] : [globalEntityId],
      ),
    ]),
  ];
  const entities = entityIds.length
    ? await db
        .select({
          id: globalEntities.id,
          canonicalCorporateGroupId: globalEntities.canonicalCorporateGroupId,
        })
        .from(globalEntities)
        .where(inArray(globalEntities.id, entityIds))
    : [];
  if (entities.length !== entityIds.length) {
    throw new Error("Score-input rebase fixture entity mapping is invalid.");
  }
  const nextSignal = { ...signal, ...overrides };
  const actionabilityInput =
    signal.signalClass === "direct_demand"
      ? (provenance.snapshot.componentEvidence.find(
          ({ component }) => component === "actionability",
        )?.inputValue ?? null)
      : null;
  const scoreInputDigest = createStoredGlobalRadarScoreInputDigest({
    scoreAsOf: new Date(provenance.snapshot.scoreAsOf),
    signal: nextSignal,
    actionabilityInput,
    associations,
    entities,
  });
  const scoreEvidenceSnapshot = rebaseStoredScoreEvidenceSnapshot({
    existingSnapshot: signal.scoreEvidenceSnapshot,
    signalClass: signal.signalClass,
    signalType: signal.signalType,
    currentIndiaRelevanceType: signal.indiaRelevanceType,
    nextIndiaRelevanceType: signal.indiaRelevanceType,
    scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
    momentumPolicyVersion:
      signal.signalClass === "ecosystem_momentum"
        ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
        : null,
    currentComponents: storedScoreComponents(signal),
    nextComponents: storedScoreComponents(signal),
    replacementComponents: [],
    momentumContributorEntityIds: provenance.momentumContributorEntityIds,
    announcedAt: signal.announcedAt,
    effectiveFrom: signal.effectiveFrom,
    existingEvidence: provenance.evaluationEvidence,
    evidence: provenance.evaluationEvidence,
    scoreInputDigest,
  });
  await db
    .update(globalRadarSignals)
    .set({ ...overrides, scoreEvidenceSnapshot })
    .where(eq(globalRadarSignals.id, signal.id));
}

function testRadarPlan(
  scanMode: QueueGlobalRadarRunInput["scanMode"] = "daily",
  administratorRequestId?: string,
  identityScope = "default",
  resultLimit = 20,
  thresholds: RadarPlan["thresholds"] = {
    version: "global-radar-thresholds-v1",
    direct_demand: 70,
    demand_precursor: 65,
    ecosystem_momentum: 70,
  },
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
    resultLimit,
    scoreVersion: "global-radar-score-v1",
    thresholds,
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
  options: {
    resultLimit?: number;
    thresholds?: RadarPlan["thresholds"];
  } = {},
): QueueGlobalRadarRunInput {
  const trigger = overrides.trigger ?? "scheduled";
  const plan = testRadarPlan(
    overrides.scanMode ?? "daily",
    overrides.administratorRequestId ?? undefined,
    suffix,
    options.resultLimit,
    options.thresholds,
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
    batchFingerprint: batch.canonicalSubmissionHash,
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

function persistenceFixtureCandidateEvidence(
  signal: PersistableGlobalRadarBatch["signals"][number],
) {
  return signal.evidence.map((item) => ({
    sourceUrl: item.sourceUrl,
    canonicalSourceUrl: item.canonicalSourceUrl,
    sourceKind: "original" as const,
    sourceLanguage: item.sourceLanguage,
    originalText: item.claim,
    englishSummary: item.englishSummary,
    publishedAt: item.publishedAt,
    observedAt: item.observedAt,
    evidenceConfidence: item.evidenceConfidence,
    translationConfidence: item.translationConfidence,
    isPrimarySource: item.isPrimarySource,
    isOfficialProcurementSource:
      item.sourceFamily === "public_procurement_and_rfp_portals",
    supportsDirectDemand: item.supportsDirectDemand,
    isSyndicated: item.isSyndicated,
    organizationId: item.contributorEntityRef ?? item.evidenceFingerprint,
    corporateGroupId: "group:acme-robotics",
    supportedFieldPaths: item.supportedFieldPaths,
  }));
}

function deriveDirectPersistenceFixtureScore(
  signal: PersistableGlobalRadarBatch["signals"][number],
) {
  if (signal.signalClass !== "direct_demand") {
    throw new Error("Direct persistence fixture was not produced.");
  }
  const derived = deriveGlobalRadarReclassification({
    signalClass: "direct_demand",
    signalType: signal.signalType,
    currentStatus: signal.initialStatus,
    indiaRelevanceType: signal.indiaRelevance.relevanceType,
    announcedAt: signal.announcedAt,
    effectiveFrom: signal.effectiveFrom,
    observedAt: signal.observedAt,
    expiresAt: signal.expiresAt,
    responsePath: signal.responsePath,
    sensitiveDataAndCompliance: signal.sensitiveDataAndCompliance,
    assessments: {
      actionability: signal.actionabilityInput,
      commercialPotential: signal.score.components.commercialPotential,
      repeatability: signal.score.components.repeatability,
      strategicLearning: signal.score.components.strategicLearning,
      complianceComplexity: signal.score.components.complianceComplexity,
    },
    evidence: persistenceFixtureCandidateEvidence(signal),
    now: new Date(signal.scoreAsOf),
  });
  if (!derived.valid || derived.signalClass !== "direct_demand") {
    throw new Error(
      `Direct persistence fixture score did not derive: ${
        "reason" in derived ? derived.reason : derived.signalClass
      }.`,
    );
  }
  return derived.score;
}

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
        actionabilityInput: 90,
        announcedAt: "2026-07-29T00:00:00.000Z",
        effectiveFrom: "2026-07-29T00:00:00.000Z",
        expiresAt: "2026-08-29T00:00:00.000Z",
        evergreen: false,
        reobserveBy: null,
        observedAt,
        scoreAsOf: observedAt,
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
              "Acme requests eligible Indian operators to collect teleoperated robot trajectories at https://acme.example/suppliers.",
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
              "signal.announcedAt",
              "directDemandAsk.data_collection_request",
              "indiaRelevance.explicit_India.collection",
              "responsePath",
              "scoreComponents.actionability",
              "scoreComponents.commercialPotential",
              "scoreComponents.repeatability",
              "scoreComponents.strategicLearning",
              "scoreComponents.complianceComplexity",
            ],
          },
        ],
      },
    ],
    sourceErrors: [],
    rejections: {},
  };
  const signal = batch.signals[0];
  if (!signal || signal.signalClass !== "direct_demand") {
    throw new Error("Direct persistence fixture was not produced.");
  }
  signal.score = deriveDirectPersistenceFixtureScore(signal);
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
  delete (direct as { actionabilityInput?: number | null }).actionabilityInput;
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
      scoreAsOf: "2026-07-31T14:00:00.000Z",
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
          supportedFieldPaths: [
            "signal.factualSummary",
            "momentumMetrics.taxonomyConsistency",
            "momentumMetrics.evidenceQuality",
          ],
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
          supportedFieldPaths: [
            "signal.factualSummary",
            "momentumMetrics.taxonomyConsistency",
            "momentumMetrics.evidenceQuality",
          ],
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
  delete (direct as { actionabilityInput?: number | null }).actionabilityInput;
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
    score: 74,
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
  direct.effectiveFrom = "2026-09-15T00:00:00.000Z";
  direct.expiresAt = null;
  direct.evergreen = null;
  direct.reobserveBy = null;
  direct.responsePath = null;
  direct.partnerApplicationUrl = null;
  direct.evidence = direct.evidence.map((evidence) => ({
    ...evidence,
    sourceType: "official_funding_announcement",
    claim:
      "Acme announced funding for a dated robot-learning programme that will collect data in India.",
    sourceExcerpt:
      "New funding supports an India data-collection programme.",
    englishSummary:
      "Acme announced a funded India data-collection programme without an external request.",
    supportsDirectDemand: false,
    supportedFieldPaths: [
      "signal.title",
      "signal.effectiveFrom",
      "precursorDevelopment.funding",
      "indiaRelevance.explicit_India.collection",
      "scoreComponents.proximityToExternalDemand",
      "scoreComponents.fundingDeploymentMomentum",
      "scoreComponents.likelyDataHardwareIntensity",
      "scoreComponents.strategicRelevance",
    ],
  }));
  const derived = deriveGlobalRadarReclassification({
    signalClass: "demand_precursor",
    signalType: direct.signalType,
    currentStatus: direct.initialStatus,
    indiaRelevanceType: direct.indiaRelevance.relevanceType,
    announcedAt: direct.announcedAt,
    effectiveFrom: direct.effectiveFrom,
    observedAt: direct.observedAt,
    responsePath: direct.responsePath,
    sensitiveDataAndCompliance: direct.sensitiveDataAndCompliance,
    assessments: {
      proximityToExternalDemand:
        direct.score.components.proximityToExternalDemand,
      fundingDeploymentMomentum:
        direct.score.components.fundingDeploymentMomentum,
      likelyDataHardwareIntensity:
        direct.score.components.likelyDataHardwareIntensity,
      strategicRelevance: direct.score.components.strategicRelevance,
    },
    evidence: persistenceFixtureCandidateEvidence(direct),
    now: new Date(direct.scoreAsOf),
  });
  if (!derived.valid || derived.signalClass !== "demand_precursor") {
    throw new Error("Precursor persistence fixture score did not derive.");
  }
  direct.score = structuredClone(derived.score);
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
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "invalid_input",
    });
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
  it("rejects sensitive terminal diagnostics without mutating the running row", async () => {
    const now = new Date("2026-07-29T13:00:00.000Z");
    await repository.queueRun(queueInput("sensitive-terminal-diagnostics", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const before = await runningPersistenceSnapshot(claim.run.id);

    for (const reason of [
      `Adapter stopped after ${claim.privateClaim.leaseToken}.`,
      "Authorization: Bearer private-worker-token-value",
      "claim_path=/private/tmp/global-radar-claim.json",
      "rejectedPayload={private}",
    ]) {
      await expect(
        repository.failRun({
          runId: claim.run.id,
          leaseToken: claim.privateClaim.leaseToken,
          now: new Date(now.getTime() + 1_000),
          reason,
        }),
      ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
      expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(before);
    }

    for (const reason of [
      "Authorization: Bearer private-worker-token-value",
      "claim_path=/private/tmp/global-radar-claim.json",
      "request_payload={private}",
    ]) {
      await expect(
        repository.abandonRun({
          runId: claim.run.id,
          now: new Date(now.getTime() + 1_000),
          reason,
        }),
      ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
      expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(before);
    }
  });

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
  it("rejects an exact lease token embedded in an otherwise valid batch without writes", async () => {
    const now = new Date("2026-07-29T17:10:00.000Z");
    await repository.queueRun(queueInput("sensitive-completion-batch", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const before = await runningPersistenceSnapshot(claim.run.id);
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.entities[0]!.shortDescription =
      `Public company summary followed by ${claim.privateClaim.leaseToken}.`;
    const rehashed = rehashPersistenceBatch(batch);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        batch: rehashed,
        submissionHash: rehashed.canonicalSubmissionHash,
        batchFingerprint: rehashed.canonicalSubmissionHash,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(before);
  });

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

  it("rejects canonical signals beyond the immutable planned result limit without writes", async () => {
    const now = new Date("2026-07-29T18:30:00.000Z");
    await repository.queueRun(
      queueInput("complete-result-limit", { now }, { resultLimit: 1 }),
    );
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");

    const first = validPersistenceBatch(claim.run.id);
    const second = validPersistenceBatch(claim.run.id, {
      entityRef: "entity-beta",
      entityName: "Beta Robotics",
      websiteUrl: "https://beta.example/about",
      linkedinOrganizationUrl: "https://www.linkedin.com/company/beta-robotics/",
      stableIdentifierValue: "beta-robotics",
      sourceUrl: "https://beta.example/public-request",
      externalSignalId: "signal-beta-request",
    });
    second.entities[0]!.canonicalCorporateGroupId = "group:beta-robotics";
    const overLimitBatch = rehashPersistenceBatch({
      ...first,
      entities: [...first.entities, ...second.entities],
      signals: [...first.signals, ...second.signals],
    });
    const graphBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 60_000),
        ),
        planFingerprint: overLimitBatch.planFingerprint,
        submissionHash: overLimitBatch.canonicalSubmissionHash,
        batchFingerprint: overLimitBatch.canonicalSubmissionHash,
        batch: overLimitBatch,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    expect(await graphRowCounts()).toEqual(graphBefore);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(runBefore);
  });

  it("replays an exact completion accepted at the immutable planned result limit", async () => {
    const now = new Date("2026-07-29T18:45:00.000Z");
    await repository.queueRun(
      queueInput("complete-result-limit-replay", { now }, { resultLimit: 1 }),
    );
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = validPersistenceBatch(claim.run.id);
    const input = {
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 60_000),
      ),
      planFingerprint: batch.planFingerprint,
      submissionHash: batch.canonicalSubmissionHash,
      batchFingerprint: batch.canonicalSubmissionHash,
      batch,
    };

    await expect(repository.completeRun(input)).resolves.toMatchObject({
      outcome: "completed",
      run: { numberSignalsFound: 1 },
    });
    const graphAfterCompletion = await graphRowCounts();
    const runAfterCompletion = await runningPersistenceSnapshot(claim.run.id);

    await expect(
      repository.completeRun({
        ...input,
        now: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    expect(await graphRowCounts()).toEqual(graphAfterCompletion);
    expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(
      runAfterCompletion,
    );
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

  it("looks up an exact durable completion before replay validation and rejects a changed saved batch", async () => {
    const now = new Date("2026-07-29T19:30:00.000Z");
    const plannedThresholds = {
      version: "global-radar-thresholds-v1" as const,
      direct_demand: 41,
      demand_precursor: 42,
      ecosystem_momentum: 43,
    };
    await repository.queueRun(
      queueInput(
        "complete-replay-lookup",
        { now },
        { thresholds: plannedThresholds },
      ),
    );
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batchFingerprint = HASH_B;
    const input = {
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 60_000),
      ),
      batchFingerprint,
    };

    await expect(
      repository.lookupCompletionReplay({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        planFingerprint: input.planFingerprint,
        batchFingerprint,
      }),
    ).resolves.toEqual({ outcome: "not_terminal", plannedThresholds });
    await expect(repository.completeRun(input)).resolves.toMatchObject({
      outcome: "completed",
    });
    const [beforeLookup] = await db
      .select({ updatedAt: globalRadarRuns.updatedAt })
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));

    await expect(
      repository.lookupCompletionReplay({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        planFingerprint: input.planFingerprint,
        batchFingerprint,
      }),
    ).resolves.toMatchObject({ outcome: "replayed", run: { status: "succeeded" } });
    await expect(
      repository.lookupCompletionReplay({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        planFingerprint: input.planFingerprint,
        batchFingerprint: HASH_C,
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "completion_identity_mismatch",
    });
    const [afterLookup] = await db
      .select({ updatedAt: globalRadarRuns.updatedAt })
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));
    expect(afterLookup?.updatedAt).toEqual(beforeLookup?.updatedAt);
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

  it("counts failed executed queries as source failures without double-counting a linked source error", async () => {
    const cases = [
      {
        suffix: "query-error-partial",
        signals: 1,
        sourceErrors: [],
        status: "partial",
        expectedErrors: 1,
      },
      {
        suffix: "query-error-failed",
        signals: 0,
        sourceErrors: [],
        status: "failed",
        expectedErrors: 1,
      },
      {
        suffix: "query-error-linked-summary",
        signals: 1,
        sourceErrors: [
          { sourceName: "Codex public web", message: "Timed out" },
        ],
        status: "partial",
        expectedErrors: 1,
      },
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const now = new Date(
        new Date("2026-07-29T22:00:00.000Z").getTime() + index * 60_000,
      );
      await repository.queueRun(queueInput(testCase.suffix, { now }));
      const claim = await repository.claimRun({ now });
      if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
      const batch = structuredClone(validPersistenceBatch(claim.run.id));
      const plannedQuery = batch.executedQueries[0];
      if (!plannedQuery) throw new Error("Test Radar plan generated no queries.");
      batch.executedQueries[0] = {
        ...plannedQuery,
        executedAt: new Date(now.getTime() + 500).toISOString(),
        error: "Search request timed out.",
      };
      if (testCase.signals === 0) {
        batch.entities = [];
        batch.signals = [];
      }
      batch.sourceErrors = testCase.sourceErrors.map((sourceError) => ({
        ...sourceError,
        queryFingerprint: plannedQuery.fingerprint,
      }));
      const canonicalBatch = rehashPersistenceBatch(batch);

      const completed = await repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: canonicalBatch.canonicalSubmissionHash,
        batchFingerprint: canonicalBatch.canonicalSubmissionHash,
        batch: canonicalBatch,
      });

      expect(completed).toMatchObject({
        outcome: "completed",
        run: {
          status: testCase.status,
          numberSourceErrors: testCase.expectedErrors,
          ...(testCase.status === "failed"
            ? {
                failure: {
                  code: "completion_failed",
                  message:
                    "Global Radar completed with source errors and no signals.",
                },
              }
            : {}),
        },
      });
    }
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

  it("allows a public technology source name while rejecting SQL diagnostics", async () => {
    const now = new Date("2026-07-30T00:05:00.000Z");
    await repository.queueRun(queueInput("public-technology-source-name", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.sourceErrors = [
      {
        sourceName: "PostgreSQL official documentation",
        message: "Temporarily unavailable",
        queryFingerprint: null,
      },
    ];
    const canonicalBatch = rehashPersistenceBatch(batch);

    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 1_000),
        ),
        submissionHash: canonicalBatch.canonicalSubmissionHash,
        batchFingerprint: canonicalBatch.canonicalSubmissionHash,
        batch: canonicalBatch,
      }),
    ).resolves.toMatchObject({
      outcome: "completed",
      run: {
        sourceErrors: [
          {
            sourceName: "PostgreSQL official documentation",
            message: "Temporarily unavailable",
          },
        ],
      },
    });

    const unsafe = structuredClone(validPersistenceBatch(claim.run.id));
    unsafe.sourceErrors = [
      {
        sourceName: "PostgreSQL official documentation",
        message: "SELECT secret FROM private_table WHERE id = 1",
        queryFingerprint: null,
      },
    ];
    expect(() => rehashPersistenceBatch(unsafe)).toThrow();
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

  it("recomputes rediscovery from the complete ordinal evidence prefix when the new proposal omits historical evidence", async () => {
    const firstNow = new Date("2026-07-30T05:35:00.000Z");
    await repository.queueRun(
      queueInput("full-prefix-rediscovery-first", { now: firstNow }),
    );
    const firstClaim = await repository.claimRun({ now: firstNow });
    if (firstClaim.outcome !== "claimed") {
      throw new Error("First full-prefix fixture was not claimed.");
    }
    const first = structuredClone(
      validPersistenceBatch(firstClaim.run.id, {
        observedAt: "2026-07-30T05:35:30.000Z",
        sourceUrl: "https://acme.example/full-prefix-primary",
      }),
    );
    const firstSignal = first.signals[0]!;
    const identityEvidence = firstSignal.evidence[0]!;
    identityEvidence.evidenceConfidence = 80;
    const historicalSourceUrl = "https://acme.example/full-prefix-old";
    const historicalEvidence = {
      ...structuredClone(identityEvidence),
      sourceUrl: historicalSourceUrl,
      canonicalSourceUrl: historicalSourceUrl,
      sourceName: "Historical supporting source",
      claim: "A historical supporting source confirms the public request.",
      englishSummary:
        "A historical supporting source confirms the public request.",
      evidenceConfidence: 60,
      isPrimarySource: false,
      supportedFieldPaths: ["signal.factualSummary"],
      evidenceFingerprint: createEvidenceFingerprint({
        sourceUrl: historicalSourceUrl,
        canonicalSourceUrl: historicalSourceUrl,
        isPrimarySource: false,
      }),
    };
    firstSignal.evidence = [identityEvidence, historicalEvidence].sort(
      (left, right) =>
        left.evidenceFingerprint.localeCompare(right.evidenceFingerprint),
    );
    firstSignal.score = deriveDirectPersistenceFixtureScore(firstSignal);
    const firstBatch = rehashPersistenceBatch(first);
    await expect(
      repository.completeRun({
        ...completionInput(
          firstClaim.run.id,
          firstClaim.privateClaim.leaseToken,
          new Date("2026-07-30T05:36:00.000Z"),
        ),
        submissionHash: firstBatch.canonicalSubmissionHash,
        batch: firstBatch,
      }),
    ).resolves.toMatchObject({ outcome: "completed", run: { numberNew: 1 } });
    const initialEvidence = await db
      .select({
        evidenceFingerprint: globalSignalEvidence.evidenceFingerprint,
        ingestOrdinal: globalSignalEvidence.ingestOrdinal,
      })
      .from(globalSignalEvidence)
      .orderBy(asc(globalSignalEvidence.ingestOrdinal));
    const identityOrdinal = initialEvidence.find(
      ({ evidenceFingerprint }) =>
        evidenceFingerprint === identityEvidence.evidenceFingerprint,
    )?.ingestOrdinal;
    expect(identityOrdinal).toBeDefined();

    const secondNow = new Date("2026-07-31T05:35:00.000Z");
    await repository.queueRun(
      queueInput("full-prefix-rediscovery-second", { now: secondNow }),
    );
    const secondClaim = await repository.claimRun({ now: secondNow });
    if (secondClaim.outcome !== "claimed") {
      throw new Error("Second full-prefix fixture was not claimed.");
    }
    const second = structuredClone(
      validPersistenceBatch(secondClaim.run.id, {
        observedAt: "2026-07-31T05:35:30.000Z",
        sourceUrl: "https://acme.example/full-prefix-primary",
      }),
    );
    const secondSignal = second.signals[0]!;
    const currentSourceUrl = "https://acme.example/full-prefix-new";
    const currentEvidence = {
      ...structuredClone(identityEvidence),
      sourceUrl: currentSourceUrl,
      canonicalSourceUrl: currentSourceUrl,
      sourceName: "Current supporting source",
      claim: "A current supporting source confirms the public request.",
      englishSummary: "A current supporting source confirms the public request.",
      observedAt: secondSignal.observedAt,
      evidenceConfidence: 100,
      isPrimarySource: false,
      supportedFieldPaths: ["signal.factualSummary"],
      evidenceFingerprint: createEvidenceFingerprint({
        sourceUrl: currentSourceUrl,
        canonicalSourceUrl: currentSourceUrl,
        isPrimarySource: false,
      }),
    };
    secondSignal.evidence = [
      structuredClone(identityEvidence),
      currentEvidence,
    ].sort((left, right) =>
      left.evidenceFingerprint.localeCompare(right.evidenceFingerprint),
    );
    secondSignal.score = deriveDirectPersistenceFixtureScore(secondSignal);
    const secondBatch = rehashPersistenceBatch(second);
    await expect(
      repository.completeRun({
        ...completionInput(
          secondClaim.run.id,
          secondClaim.privateClaim.leaseToken,
          new Date("2026-07-31T05:36:00.000Z"),
        ),
        submissionHash: secondBatch.canonicalSubmissionHash,
        batch: secondBatch,
      }),
    ).resolves.toMatchObject({
      outcome: "completed",
      run: { numberUpdated: 1, numberNew: 0 },
    });

    const [stored] = await db.select().from(globalRadarSignals);
    if (!stored) throw new Error("Full-prefix signal was not stored.");
    expect(stored.evidenceConfidence).toBe(80);
    expect(stored.scoreEvidenceSnapshot).toMatchObject({
      evidenceBoundaryOrdinal: 3,
      evidenceSetCount: 3,
    });
    const storedEvidence = await db
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, stored.id))
      .orderBy(asc(globalSignalEvidence.ingestOrdinal));
    expect(storedEvidence.map(({ ingestOrdinal }) => ingestOrdinal)).toEqual([
      1, 2, 3,
    ]);
    expect(
      storedEvidence.find(
        ({ evidenceFingerprint }) =>
          evidenceFingerprint === identityEvidence.evidenceFingerprint,
      )?.ingestOrdinal,
    ).toBe(identityOrdinal);
    const adminRepository = createGlobalRadarAdminRepository(db, {
      scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
      thresholds: {
        direct_demand: 70,
        demand_precursor: 65,
        ecosystem_momentum: 70,
      },
    });
    await expect(
      adminRepository.listSignals({
        signalClass: "direct_demand",
        filters: { page: 1 },
      }),
    ).resolves.toMatchObject({ outcome: "listed", total: 1 });
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
    await rebaseGlobalRadarFixtureSignal(createdSignal.id, {
      status: "qualified",
      expiresAt: humanExpiry,
      revision: 9,
    });
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
    if (signal.signalClass !== "direct_demand") {
      throw new Error("Mirrored evidence fixture was not direct demand.");
    }
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
    signal.sensitiveDataAndCompliance.sensitiveDataFlags.faces = "possible";
    signal.sensitiveDataAndCompliance.complianceFacts.consent = true;
    const reviewedActionability = assessComplianceReview({
      currentStatus: "newly_discovered",
      actionability: signal.actionabilityInput,
      assessment: signal.sensitiveDataAndCompliance,
    });
    if (!reviewedActionability.valid) {
      throw new Error("Refreshed compliance review was invalid.");
    }
    const refreshedScore = scoreDirectDemand({
      ...signal.score.components,
      freshness: 95,
      actionability: reviewedActionability.actionability,
      indiaFit: 92,
    });
    if (!refreshedScore.valid) throw new Error("Refreshed score was invalid.");
    signal.score = structuredClone(refreshedScore);
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
    expect(canonicalizeGlobalRadarPersistenceBatch(rehashed)).toMatchObject({
      valid: true,
    });
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
      freshness: 100,
      actionability: reviewedActionability.actionability,
      indiaFit: 100,
      directDemandScore: 90,
      scoreCoverage: refreshedScore.scoreCoverage,
      indiaFitConfidence: 95,
      responsePathUrl: "https://acme.example/suppliers",
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
            scoring: { freshness: 100, directDemandScore: 90 },
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
              freshness: 100,
              actionability: reviewedActionability.actionability,
              indiaFit: 100,
              directDemandScore: 90,
            },
            response: {
              url: "https://acme.example/suppliers",
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

  it("preserves and safely supersedes an administrator no-India-fit decision during worker rediscovery", async () => {
    const adminRepository = createGlobalRadarAdminRepository(db, {
      scoreVersion: "global-radar-score-v1",
      thresholds: {
        direct_demand: 70,
        demand_precursor: 65,
        ecosystem_momentum: 70,
      },
    });
    const actor = { userId: administratorUserId, email: userEmail };

    function twoSignalBatch(
      runId: string,
      observedAt: string,
      phase:
        | "initial"
        | "repeated"
        | "unrelated"
        | "positive"
        | "worker_no_fit"
        | "worker_no_fit_repeat",
      newEvidenceSuffix: string = phase,
    ) {
      const primaryUrl = "https://acme.example/primary-request";
      const batch = structuredClone(
        validPersistenceBatch(runId, { observedAt, sourceUrl: primaryUrl }),
      );
      const primary = batch.signals[0]!;
      primary.title =
        phase === "initial"
          ? "Acme primary request"
          : "Acme refreshed primary request";
      for (let index = 0; index < 10; index += 1) {
        const legacyEvidence = structuredClone(primary.evidence[0]!);
        const legacyEvidenceUrl =
          `https://acme.example/z-legacy-india-evidence-${index}`;
        legacyEvidence.sourceUrl = legacyEvidenceUrl;
        legacyEvidence.canonicalSourceUrl = legacyEvidenceUrl;
        legacyEvidence.sourceName = `Legacy India evidence ${index}`;
        legacyEvidence.claim =
          "Acme's official request explicitly accepts collection operations in India.";
        legacyEvidence.sourceExcerpt =
          "Collection operations in India are explicitly eligible.";
        legacyEvidence.englishSummary =
          "The official request explicitly accepts collection operations in India.";
        legacyEvidence.isPrimarySource = false;
        legacyEvidence.supportsDirectDemand = false;
        legacyEvidence.evidenceFingerprint = createEvidenceFingerprint({
          sourceUrl: legacyEvidenceUrl,
          canonicalSourceUrl: legacyEvidenceUrl,
          isPrimarySource: false,
        });
        legacyEvidence.supportedFieldPaths = [
          "indiaRelevance.explicit_India.collection",
        ];
        primary.evidence.push(legacyEvidence);
      }
      if (
        phase === "unrelated" ||
        phase === "positive" ||
        phase === "worker_no_fit" ||
        phase === "worker_no_fit_repeat"
      ) {
        const addedEvidence = structuredClone(primary.evidence[0]!);
        const addedEvidenceUrl =
          `https://acme.example/z-${newEvidenceSuffix}-primary-request`;
        addedEvidence.sourceUrl = addedEvidenceUrl;
        addedEvidence.canonicalSourceUrl = addedEvidenceUrl;
        addedEvidence.evidenceFingerprint = createEvidenceFingerprint({
          sourceUrl: addedEvidenceUrl,
          canonicalSourceUrl: addedEvidenceUrl,
          isPrimarySource: true,
        });
        addedEvidence.observedAt = observedAt;
        if (phase === "unrelated") {
          addedEvidence.claim =
            "Acme published a technical update about teleoperation workflows.";
          addedEvidence.englishSummary =
            "The update contains no new public India relevance statement.";
          addedEvidence.sourceExcerpt = "Teleoperation workflow update.";
          addedEvidence.supportsIndiaRelevance = false;
          addedEvidence.supportedFieldPaths = addedEvidence.supportedFieldPaths.filter(
            (path) => !path.startsWith("indiaRelevance."),
          );
        } else if (
          phase === "worker_no_fit" ||
          phase === "worker_no_fit_repeat"
        ) {
          addedEvidence.claim =
            "Acme's current public eligibility terms explicitly exclude India.";
          addedEvidence.englishSummary =
            "The current supplier eligibility terms explicitly exclude India.";
          addedEvidence.sourceExcerpt =
            "Supplier applications are not currently accepted from India.";
          addedEvidence.supportedFieldPaths = [
            "indiaRelevance.no_current_India_fit.requirement_access",
          ];
        }
        primary.evidence.push(addedEvidence);
      }
      if (phase === "worker_no_fit" || phase === "worker_no_fit_repeat") {
        primary.indiaRelevance = {
          ...primary.indiaRelevance,
          relevanceType: "no_current_India_fit",
          basis: "no_current_fit",
          rationale:
            phase === "worker_no_fit"
              ? "New public eligibility terms establish no current India fit."
              : "A later worker review reconfirmed no current India fit from the public terms.",
          reasons: [],
          constraints: ["The current public eligibility terms exclude India."],
          unknowns: ["Future eligibility may change."],
          confidence: 95,
        };
        const noFitScore = scoreDirectDemand({
          ...primary.score.components,
          indiaFit: 0,
        });
        if (!noFitScore.valid) {
          throw new Error("Worker no-India-fit score fixture was invalid.");
        }
        primary.score = structuredClone(noFitScore);
      }

      const secondary = structuredClone(primary);
      const secondaryUrl = "https://acme.example/secondary-request";
      secondary.externalSignalId = "signal-secondary-request";
      secondary.title =
        phase === "initial"
          ? "Acme secondary request"
          : "Acme refreshed secondary request";
      secondary.targetGeographies = ["Japan"];
      secondary.collectionGeographies = ["Japan"];
      secondary.evidence[0]!.sourceUrl = secondaryUrl;
      secondary.evidence[0]!.canonicalSourceUrl = secondaryUrl;
      secondary.evidence[0]!.evidenceFingerprint = createEvidenceFingerprint({
        sourceUrl: secondaryUrl,
        canonicalSourceUrl: secondaryUrl,
        isPrimarySource: true,
      });
      if (secondary.responsePath) {
        secondary.responsePath.evidenceUrl = secondaryUrl;
      }
      if (phase === "initial") {
        secondary.indiaRelevance = {
          ...secondary.indiaRelevance,
          relevanceType: "no_current_India_fit",
          basis: "no_current_fit",
          rationale:
            "The initial public evidence establishes no current India fit.",
          reasons: [],
          unknowns: ["Future India relevance remains open to new evidence."],
          confidence: 70,
        };
      }
      batch.signals = [primary, secondary];
      return rehashPersistenceBatch(batch);
    }

    const firstNow = new Date("2026-07-30T06:30:00.000Z");
    await repository.queueRun(
      queueInput("administrator-no-india-fit-first", { now: firstNow }),
    );
    const firstClaim = await repository.claimRun({ now: firstNow });
    if (firstClaim.outcome !== "claimed") {
      throw new Error("First no-India-fit fixture was not claimed.");
    }
    const firstBatch = twoSignalBatch(
      firstClaim.run.id,
      "2026-07-30T06:31:00.000Z",
      "initial",
    );
    await expect(
      repository.completeRun({
        ...completionInput(
          firstClaim.run.id,
          firstClaim.privateClaim.leaseToken,
          new Date("2026-07-30T06:32:00.000Z"),
        ),
        submissionHash: firstBatch.canonicalSubmissionHash,
        batch: firstBatch,
      }),
    ).resolves.toMatchObject({
      outcome: "completed",
      run: { numberNew: 2 },
    });

    const [primary] = await db
      .select()
      .from(globalRadarSignals)
      .where(
        eq(
          globalRadarSignals.dedupeKey,
          firstBatch.signals[0]!.dedupeKey,
        ),
      );
    const [secondary] = await db
      .select()
      .from(globalRadarSignals)
      .where(
        eq(
          globalRadarSignals.dedupeKey,
          firstBatch.signals[1]!.dedupeKey,
        ),
      );
    if (!primary || !secondary) {
      throw new Error("Both no-India-fit fixtures were not persisted.");
    }
    expect(secondary.indiaRelevanceType).toBe("no_current_India_fit");

    await expect(
      adminRepository.reviewSignal({
        signalId: primary.id,
        actor,
        envelope: {
          expectedRevision: 0,
          idempotencyKey: "30000000-0000-4000-8000-000000000001",
          reason:
            "Administrator audited the evidence and found no current India fit.",
          now: new Date("2026-07-30T06:33:00.000Z"),
        },
        command: { type: "mark_no_india_fit" },
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      detail: {
        signal: {
          status: "monitoring",
          indiaRelevanceType: "no_current_India_fit",
          revision: 1,
        },
      },
    });
    const [administratorMarkedPrimary] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, primary.id));
    if (!administratorMarkedPrimary) {
      throw new Error("Administrator no-India-fit score bundle was not persisted.");
    }
    const administratorScoreBundle = {
      demandExplicitness: administratorMarkedPrimary.demandExplicitness,
      evidenceConfidence: administratorMarkedPrimary.evidenceConfidence,
      freshness: administratorMarkedPrimary.freshness,
      actionability: administratorMarkedPrimary.actionability,
      indiaFit: administratorMarkedPrimary.indiaFit,
      commercialPotential: administratorMarkedPrimary.commercialPotential,
      repeatability: administratorMarkedPrimary.repeatability,
      responseAccessibility: administratorMarkedPrimary.responseAccessibility,
      strategicLearning: administratorMarkedPrimary.strategicLearning,
      complianceComplexity: administratorMarkedPrimary.complianceComplexity,
      directDemandScore: administratorMarkedPrimary.directDemandScore,
      scoreCoverage: administratorMarkedPrimary.scoreCoverage,
      scorePolicyVersion: administratorMarkedPrimary.scorePolicyVersion,
    };
    const administratorScoreEvidenceSnapshot =
      administratorMarkedPrimary.scoreEvidenceSnapshot;
    const administratorRelevanceBundle = {
      indiaRelevanceType: administratorMarkedPrimary.indiaRelevanceType,
      indiaRelevanceRationale:
        administratorMarkedPrimary.indiaRelevanceRationale,
      indiaFitReasons: administratorMarkedPrimary.indiaFitReasons,
      indiaFitConstraints: administratorMarkedPrimary.indiaFitConstraints,
      indiaFitUnknowns: administratorMarkedPrimary.indiaFitUnknowns,
      indiaFitConfidence: administratorMarkedPrimary.indiaFitConfidence,
      indiaRegulatoryFacts: administratorMarkedPrimary.indiaRegulatoryFacts,
      indiaLogisticsFacts: administratorMarkedPrimary.indiaLogisticsFacts,
    };
    const administratorScoreInputBundle = {
      announcedAt: administratorMarkedPrimary.announcedAt,
      effectiveFrom: administratorMarkedPrimary.effectiveFrom,
      responsePathType: administratorMarkedPrimary.responsePathType,
      responsePathUrl: administratorMarkedPrimary.responsePathUrl,
      responseBusinessEmail: administratorMarkedPrimary.responseBusinessEmail,
      partnerApplicationUrl: administratorMarkedPrimary.partnerApplicationUrl,
      faces: administratorMarkedPrimary.faces,
      voices: administratorMarkedPrimary.voices,
      biometrics: administratorMarkedPrimary.biometrics,
      gaze: administratorMarkedPrimary.gaze,
      health: administratorMarkedPrimary.health,
      children: administratorMarkedPrimary.children,
      homeInteriors: administratorMarkedPrimary.homeInteriors,
      workplaceMonitoring: administratorMarkedPrimary.workplaceMonitoring,
      preciseLocation: administratorMarkedPrimary.preciseLocation,
      roadUsers: administratorMarkedPrimary.roadUsers,
      employeeData: administratorMarkedPrimary.employeeData,
      industrialSecrets: administratorMarkedPrimary.industrialSecrets,
      defenceOrDualUse: administratorMarkedPrimary.defenceOrDualUse,
      copyrightedMaterial: administratorMarkedPrimary.copyrightedMaterial,
      exportControls: administratorMarkedPrimary.exportControls,
      consent: administratorMarkedPrimary.consent,
      deIdentification: administratorMarkedPrimary.deIdentification,
      legalReview: administratorMarkedPrimary.legalReview,
      knownResidencyRequirements:
        administratorMarkedPrimary.knownResidencyRequirements,
      participantRightsComplexity:
        administratorMarkedPrimary.participantRightsComplexity,
    };

    const secondNow = new Date("2026-07-30T07:30:00.000Z");
    await repository.queueRun(
      queueInput("administrator-no-india-fit-second", { now: secondNow }),
    );
    const secondClaim = await repository.claimRun({ now: secondNow });
    if (secondClaim.outcome !== "claimed") {
      throw new Error("Second no-India-fit fixture was not claimed.");
    }
    const secondBatch = twoSignalBatch(
      secondClaim.run.id,
      "2026-07-30T07:31:00.000Z",
      "repeated",
    );
    // Keep the identity's fixed seven-day announcement bucket stable while
    // proving that an automated refresh cannot rewrite reviewed score inputs.
    secondBatch.signals[0]!.announcedAt = "2026-07-29T12:00:00.000Z";
    secondBatch.signals[0]!.effectiveFrom = "2026-07-30T07:00:00.000Z";
    secondBatch.signals[0]!.responsePath = {
      ...secondBatch.signals[0]!.responsePath!,
      url: "https://acme.example/refreshed-suppliers",
    };
    secondBatch.signals[0]!.partnerApplicationUrl =
      "https://acme.example/refreshed-suppliers";
    secondBatch.signals[0]!.sensitiveDataAndCompliance = {
      sensitiveDataFlags: {
        ...secondBatch.signals[0]!.sensitiveDataAndCompliance.sensitiveDataFlags,
        faces: "not_observed",
      },
      complianceFacts: {
        ...secondBatch.signals[0]!.sensitiveDataAndCompliance.complianceFacts,
        consent: false,
      },
    };
    const rehashedSecondBatch = rehashPersistenceBatch(secondBatch);
    const completed = await repository.completeRun({
      ...completionInput(
        secondClaim.run.id,
        secondClaim.privateClaim.leaseToken,
        new Date("2026-07-30T07:32:00.000Z"),
      ),
      submissionHash: rehashedSecondBatch.canonicalSubmissionHash,
      batch: rehashedSecondBatch,
    });
    expect(completed).toMatchObject({
      outcome: "completed",
      run: { numberUpdated: 2, numberNew: 0 },
    });

    const [refreshedPrimary] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, primary.id));
    const [refreshedSecondary] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, secondary.id));
    expect(refreshedPrimary).toMatchObject({
      title: "Acme refreshed primary request",
      status: "monitoring",
      indiaRelevanceType: "no_current_India_fit",
      revision: 1,
      mostRecentRunId: secondClaim.run.id,
    });
    expect({
      demandExplicitness: refreshedPrimary?.demandExplicitness,
      evidenceConfidence: refreshedPrimary?.evidenceConfidence,
      freshness: refreshedPrimary?.freshness,
      actionability: refreshedPrimary?.actionability,
      indiaFit: refreshedPrimary?.indiaFit,
      commercialPotential: refreshedPrimary?.commercialPotential,
      repeatability: refreshedPrimary?.repeatability,
      responseAccessibility: refreshedPrimary?.responseAccessibility,
      strategicLearning: refreshedPrimary?.strategicLearning,
      complianceComplexity: refreshedPrimary?.complianceComplexity,
      directDemandScore: refreshedPrimary?.directDemandScore,
      scoreCoverage: refreshedPrimary?.scoreCoverage,
      scorePolicyVersion: refreshedPrimary?.scorePolicyVersion,
    }).toEqual(administratorScoreBundle);
    expect(refreshedPrimary?.scoreEvidenceSnapshot.componentEvidence).toEqual(
      administratorScoreEvidenceSnapshot.componentEvidence,
    );
    expect(refreshedPrimary?.scoreEvidenceSnapshot).toMatchObject({
      scoreAsOf: administratorScoreEvidenceSnapshot.scoreAsOf,
      evidenceBoundaryOrdinal:
        administratorScoreEvidenceSnapshot.evidenceBoundaryOrdinal,
      evidenceSetCount: administratorScoreEvidenceSnapshot.evidenceSetCount,
      evidenceSetDigest: administratorScoreEvidenceSnapshot.evidenceSetDigest,
      assessmentAuthority:
        administratorScoreEvidenceSnapshot.assessmentAuthority,
    });
    expect(refreshedPrimary?.scoreEvidenceSnapshot.scoreInputDigest).not.toBe(
      administratorScoreEvidenceSnapshot.scoreInputDigest,
    );
    expect({
      indiaRelevanceType: refreshedPrimary?.indiaRelevanceType,
      indiaRelevanceRationale: refreshedPrimary?.indiaRelevanceRationale,
      indiaFitReasons: refreshedPrimary?.indiaFitReasons,
      indiaFitConstraints: refreshedPrimary?.indiaFitConstraints,
      indiaFitUnknowns: refreshedPrimary?.indiaFitUnknowns,
      indiaFitConfidence: refreshedPrimary?.indiaFitConfidence,
      indiaRegulatoryFacts: refreshedPrimary?.indiaRegulatoryFacts,
      indiaLogisticsFacts: refreshedPrimary?.indiaLogisticsFacts,
    }).toEqual(administratorRelevanceBundle);
    expect({
      announcedAt: refreshedPrimary?.announcedAt,
      effectiveFrom: refreshedPrimary?.effectiveFrom,
      responsePathType: refreshedPrimary?.responsePathType,
      responsePathUrl: refreshedPrimary?.responsePathUrl,
      responseBusinessEmail: refreshedPrimary?.responseBusinessEmail,
      partnerApplicationUrl: refreshedPrimary?.partnerApplicationUrl,
      faces: refreshedPrimary?.faces,
      voices: refreshedPrimary?.voices,
      biometrics: refreshedPrimary?.biometrics,
      gaze: refreshedPrimary?.gaze,
      health: refreshedPrimary?.health,
      children: refreshedPrimary?.children,
      homeInteriors: refreshedPrimary?.homeInteriors,
      workplaceMonitoring: refreshedPrimary?.workplaceMonitoring,
      preciseLocation: refreshedPrimary?.preciseLocation,
      roadUsers: refreshedPrimary?.roadUsers,
      employeeData: refreshedPrimary?.employeeData,
      industrialSecrets: refreshedPrimary?.industrialSecrets,
      defenceOrDualUse: refreshedPrimary?.defenceOrDualUse,
      copyrightedMaterial: refreshedPrimary?.copyrightedMaterial,
      exportControls: refreshedPrimary?.exportControls,
      consent: refreshedPrimary?.consent,
      deIdentification: refreshedPrimary?.deIdentification,
      legalReview: refreshedPrimary?.legalReview,
      knownResidencyRequirements: refreshedPrimary?.knownResidencyRequirements,
      participantRightsComplexity: refreshedPrimary?.participantRightsComplexity,
    }).toEqual(administratorScoreInputBundle);
    expect(refreshedSecondary).toMatchObject({
      title: "Acme refreshed secondary request",
      status: "newly_discovered",
      indiaRelevanceType: "explicit_India",
      revision: 0,
      mostRecentRunId: secondClaim.run.id,
    });

    async function completeRediscoveryRun(input: Readonly<{
      suffix: string;
      now: string;
      observedAt: string;
      phase:
        | "unrelated"
        | "positive"
        | "worker_no_fit"
        | "worker_no_fit_repeat";
      evidenceSuffix: string;
    }>) {
      const now = new Date(input.now);
      await repository.queueRun(queueInput(input.suffix, { now }));
      const claim = await repository.claimRun({ now });
      if (claim.outcome !== "claimed") {
        throw new Error("No-India-fit rediscovery fixture was not claimed.");
      }
      const batch = twoSignalBatch(
        claim.run.id,
        input.observedAt,
        input.phase,
        input.evidenceSuffix,
      );
      await expect(
        repository.completeRun({
          ...completionInput(
            claim.run.id,
            claim.privateClaim.leaseToken,
            new Date(Date.parse(input.observedAt) + 60_000),
          ),
          submissionHash: batch.canonicalSubmissionHash,
          batch,
        }),
      ).resolves.toMatchObject({
        outcome: "completed",
        run: { numberUpdated: 2, numberNew: 0 },
      });
      return claim.run.id;
    }

    const unrelatedRunId = await completeRediscoveryRun({
      suffix: "administrator-no-india-fit-unrelated",
      now: "2026-07-30T08:30:00.000Z",
      observedAt: "2026-07-30T08:31:00.000Z",
      phase: "unrelated",
      evidenceSuffix: "unrelated-update",
    });
    const [afterUnrelatedEvidence] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, primary.id));
    expect(afterUnrelatedEvidence).toMatchObject({
      status: "monitoring",
      indiaRelevanceType: "no_current_India_fit",
      revision: 1,
      mostRecentRunId: unrelatedRunId,
    });
    expect({
      indiaRelevanceType: afterUnrelatedEvidence?.indiaRelevanceType,
      indiaRelevanceRationale: afterUnrelatedEvidence?.indiaRelevanceRationale,
      indiaFitReasons: afterUnrelatedEvidence?.indiaFitReasons,
      indiaFitConstraints: afterUnrelatedEvidence?.indiaFitConstraints,
      indiaFitUnknowns: afterUnrelatedEvidence?.indiaFitUnknowns,
      indiaFitConfidence: afterUnrelatedEvidence?.indiaFitConfidence,
      indiaRegulatoryFacts: afterUnrelatedEvidence?.indiaRegulatoryFacts,
      indiaLogisticsFacts: afterUnrelatedEvidence?.indiaLogisticsFacts,
    }).toEqual(administratorRelevanceBundle);
    expect({
      demandExplicitness: afterUnrelatedEvidence?.demandExplicitness,
      evidenceConfidence: afterUnrelatedEvidence?.evidenceConfidence,
      freshness: afterUnrelatedEvidence?.freshness,
      actionability: afterUnrelatedEvidence?.actionability,
      indiaFit: afterUnrelatedEvidence?.indiaFit,
      commercialPotential: afterUnrelatedEvidence?.commercialPotential,
      repeatability: afterUnrelatedEvidence?.repeatability,
      responseAccessibility: afterUnrelatedEvidence?.responseAccessibility,
      strategicLearning: afterUnrelatedEvidence?.strategicLearning,
      complianceComplexity: afterUnrelatedEvidence?.complianceComplexity,
      directDemandScore: afterUnrelatedEvidence?.directDemandScore,
      scoreCoverage: afterUnrelatedEvidence?.scoreCoverage,
      scorePolicyVersion: afterUnrelatedEvidence?.scorePolicyVersion,
    }).toEqual(administratorScoreBundle);
    expect(
      afterUnrelatedEvidence?.scoreEvidenceSnapshot.componentEvidence,
    ).toEqual(administratorScoreEvidenceSnapshot.componentEvidence);
    expect(afterUnrelatedEvidence?.scoreEvidenceSnapshot).toMatchObject({
      scoreAsOf: administratorScoreEvidenceSnapshot.scoreAsOf,
      evidenceBoundaryOrdinal:
        administratorScoreEvidenceSnapshot.evidenceBoundaryOrdinal,
      evidenceSetCount: administratorScoreEvidenceSnapshot.evidenceSetCount,
      evidenceSetDigest: administratorScoreEvidenceSnapshot.evidenceSetDigest,
      assessmentAuthority:
        administratorScoreEvidenceSnapshot.assessmentAuthority,
    });
    expect(
      afterUnrelatedEvidence?.scoreEvidenceSnapshot.scoreInputDigest,
    ).not.toBe(refreshedPrimary?.scoreEvidenceSnapshot.scoreInputDigest);
    await expect(
      adminRepository.getSignalDetail(primary.id),
    ).resolves.toMatchObject({
      outcome: "found",
      detail: {
        signal: {
          status: "monitoring",
          indiaRelevanceType: "no_current_India_fit",
          revision: 1,
        },
      },
    });

    const positiveRunId = await completeRediscoveryRun({
      suffix: "administrator-no-india-fit-positive",
      now: "2026-07-30T09:30:00.000Z",
      observedAt: "2026-07-30T09:31:00.000Z",
      phase: "positive",
      evidenceSuffix: "positive-india-evidence",
    });
    const [afterPositiveEvidence] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, primary.id));
    expect(afterPositiveEvidence).toMatchObject({
      status: "needs_review",
      indiaRelevanceType: "explicit_India",
      indiaRelevanceRationale:
        "The official request explicitly includes India.",
      indiaFitReasons: ["India is named as an eligible collection geography."],
      indiaFitConstraints: [],
      indiaFitUnknowns: [],
      indiaFitConfidence: 90,
      indiaFit: 100,
      directDemandScore: 90,
      revision: 2,
      mostRecentRunId: positiveRunId,
    });
    expect(afterPositiveEvidence?.scoreEvidenceSnapshot).toMatchObject({
      signalClass: "direct_demand",
      signalType: "data_collection_request",
      indiaRelevanceType: "explicit_India",
      assessmentAuthority: "worker",
    });
    const positiveEvidenceUrl =
      "https://acme.example/z-positive-india-evidence-primary-request";
    const positiveEvidenceFingerprint = createEvidenceFingerprint({
      sourceUrl: positiveEvidenceUrl,
      canonicalSourceUrl: positiveEvidenceUrl,
      isPrimarySource: true,
    });
    expect(
      afterPositiveEvidence?.scoreEvidenceSnapshot.componentEvidence
        .find(({ component }) => component === "indiaFit")
        ?.evidence.map(({ evidenceFingerprint }) => evidenceFingerprint),
    ).toContain(positiveEvidenceFingerprint);

    await expect(
      adminRepository.reviewSignal({
        signalId: primary.id,
        actor,
        envelope: {
          expectedRevision: 2,
          idempotencyKey: "30000000-0000-4000-8000-000000000002",
          reason:
            "Administrator reviewed the new evidence and again found no current India fit.",
          now: new Date("2026-07-30T09:33:00.000Z"),
        },
        command: { type: "mark_no_india_fit" },
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      detail: {
        signal: {
          status: "monitoring",
          indiaRelevanceType: "no_current_India_fit",
          revision: 3,
        },
      },
    });
    await rebaseGlobalRadarFixtureSignal(primary.id, { status: "promoted" });

    const promotedRunId = await completeRediscoveryRun({
      suffix: "administrator-no-india-fit-promoted-positive",
      now: "2026-07-30T10:30:00.000Z",
      observedAt: "2026-07-30T10:31:00.000Z",
      phase: "positive",
      evidenceSuffix: "positive-india-evidence-promoted",
    });
    const [afterPromotedPositiveEvidence] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, primary.id));
    expect(afterPromotedPositiveEvidence).toMatchObject({
      status: "promoted",
      indiaRelevanceType: "explicit_India",
      indiaFit: 100,
      revision: 4,
      mostRecentRunId: promotedRunId,
    });

    const workerNoFitRunId = await completeRediscoveryRun({
      suffix: "administrator-no-india-fit-worker-no-fit",
      now: "2026-07-30T11:30:00.000Z",
      observedAt: "2026-07-30T11:31:00.000Z",
      phase: "worker_no_fit",
      evidenceSuffix: "worker-no-fit-evidence",
    });
    const [afterWorkerNoFit] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, primary.id));
    expect(afterWorkerNoFit).toMatchObject({
      status: "promoted",
      indiaRelevanceType: "no_current_India_fit",
      indiaRelevanceRationale:
        "New public eligibility terms establish no current India fit.",
      indiaFit: 0,
      revision: 4,
      mostRecentRunId: workerNoFitRunId,
    });

    const repeatedWorkerNoFitRunId = await completeRediscoveryRun({
      suffix: "administrator-no-india-fit-worker-no-fit-repeat",
      now: "2026-07-30T12:30:00.000Z",
      observedAt: "2026-07-30T12:31:00.000Z",
      phase: "worker_no_fit_repeat",
      evidenceSuffix: "worker-no-fit-evidence",
    });
    const [afterRepeatedWorkerNoFit] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, primary.id));
    expect(afterRepeatedWorkerNoFit).toMatchObject({
      status: "promoted",
      indiaRelevanceType: "no_current_India_fit",
      indiaRelevanceRationale:
        "A later worker review reconfirmed no current India fit from the public terms.",
      indiaFit: 0,
      revision: 4,
      mostRecentRunId: repeatedWorkerNoFitRunId,
    });
    expect(
      await db
        .select()
        .from(globalRadarAdminEvents)
        .where(eq(globalRadarAdminEvents.action, "mark_no_india_fit")),
    ).toHaveLength(2);
  });

  it("rejects rediscovery that reuses an evidence fingerprint with changed canonical field provenance", async () => {
    const firstNow = new Date("2026-07-30T11:30:00.000Z");
    await repository.queueRun(
      queueInput("evidence-fingerprint-provenance-first", { now: firstNow }),
    );
    const firstClaim = await repository.claimRun({ now: firstNow });
    if (firstClaim.outcome !== "claimed") {
      throw new Error("First evidence-provenance fixture was not claimed.");
    }
    const sourceUrl = "https://acme.example/stable-evidence-source";
    const firstBatch = validPersistenceBatch(firstClaim.run.id, {
      observedAt: "2026-07-30T11:31:00.000Z",
      sourceUrl,
    });
    await expect(
      repository.completeRun({
        ...completionInput(
          firstClaim.run.id,
          firstClaim.privateClaim.leaseToken,
          new Date("2026-07-30T11:32:00.000Z"),
        ),
        submissionHash: firstBatch.canonicalSubmissionHash,
        batch: firstBatch,
      }),
    ).resolves.toMatchObject({ outcome: "completed", run: { numberNew: 1 } });
    const [storedBefore] = await db.select().from(globalRadarSignals).limit(1);
    if (!storedBefore) throw new Error("Evidence-provenance signal was not stored.");
    const evidenceBefore = await db
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, storedBefore.id));

    const secondNow = new Date("2026-07-30T12:30:00.000Z");
    await repository.queueRun(
      queueInput("evidence-fingerprint-provenance-second", { now: secondNow }),
    );
    const secondClaim = await repository.claimRun({ now: secondNow });
    if (secondClaim.outcome !== "claimed") {
      throw new Error("Second evidence-provenance fixture was not claimed.");
    }
    const changed = structuredClone(
      validPersistenceBatch(secondClaim.run.id, {
        observedAt: "2026-07-30T12:31:00.000Z",
        sourceUrl,
      }),
    );
    changed.signals[0]!.title = "Changed title must not bypass stored provenance.";
    changed.signals[0]!.evidence[0]!.supportedFieldPaths =
      changed.signals[0]!.evidence[0]!.supportedFieldPaths.filter(
        (path) => path !== "signal.title",
      );
    const changedBatch = rehashPersistenceBatch(changed);

    await expect(
      repository.completeRun({
        ...completionInput(
          secondClaim.run.id,
          secondClaim.privateClaim.leaseToken,
          new Date("2026-07-30T12:32:00.000Z"),
        ),
        submissionHash: changedBatch.canonicalSubmissionHash,
        batch: changedBatch,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      db.select().from(globalRadarSignals).where(eq(globalRadarSignals.id, storedBefore.id)),
    ).resolves.toEqual([storedBefore]);
    await expect(
      db
        .select()
        .from(globalSignalEvidence)
        .where(eq(globalSignalEvidence.signalId, storedBefore.id)),
    ).resolves.toEqual(evidenceBefore);
  });

  it("rejects a reused fingerprint that would move canonical observed-at score evidence", async () => {
    const firstNow = new Date("2026-07-30T13:30:00.000Z");
    await repository.queueRun(
      queueInput("evidence-observed-at-provenance-first", { now: firstNow }),
    );
    const firstClaim = await repository.claimRun({ now: firstNow });
    if (firstClaim.outcome !== "claimed") {
      throw new Error("First observed-at provenance fixture was not claimed.");
    }
    const sourceUrl = "https://acme.example/undated-stable-evidence";
    const initial = structuredClone(
      validPersistenceBatch(firstClaim.run.id, {
        observedAt: "2026-07-30T13:31:00.000Z",
        sourceUrl,
      }),
    );
    initial.signals[0]!.announcedAt = null;
    initial.signals[0]!.effectiveFrom = null;
    initial.signals[0]!.evidence[0]!.publishedAt = null;
    initial.signals[0]!.evidence[0]!.supportedFieldPaths =
      initial.signals[0]!.evidence[0]!.supportedFieldPaths.map((path) =>
        path === "signal.announcedAt" ? "evidence.observedAt" : path,
      );
    const initialBatch = rehashPersistenceBatch(initial);
    await expect(
      repository.completeRun({
        ...completionInput(
          firstClaim.run.id,
          firstClaim.privateClaim.leaseToken,
          new Date("2026-07-30T13:32:00.000Z"),
        ),
        submissionHash: initialBatch.canonicalSubmissionHash,
        batch: initialBatch,
      }),
    ).resolves.toMatchObject({ outcome: "completed", run: { numberNew: 1 } });
    const [storedBefore] = await db.select().from(globalRadarSignals).limit(1);
    if (!storedBefore) {
      throw new Error("Observed-at provenance signal was not stored.");
    }
    const evidenceBefore = await db
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, storedBefore.id));

    const secondNow = new Date("2026-07-30T14:30:00.000Z");
    await repository.queueRun(
      queueInput("evidence-observed-at-provenance-second", { now: secondNow }),
    );
    const secondClaim = await repository.claimRun({ now: secondNow });
    if (secondClaim.outcome !== "claimed") {
      throw new Error("Second observed-at provenance fixture was not claimed.");
    }
    const repeated = structuredClone(
      validPersistenceBatch(secondClaim.run.id, {
        observedAt: "2026-07-30T14:31:00.000Z",
        sourceUrl,
      }),
    );
    repeated.signals[0]!.announcedAt = null;
    repeated.signals[0]!.effectiveFrom = null;
    repeated.signals[0]!.evidence[0]!.publishedAt = null;
    repeated.signals[0]!.evidence[0]!.supportedFieldPaths =
      repeated.signals[0]!.evidence[0]!.supportedFieldPaths.map((path) =>
        path === "signal.announcedAt" ? "evidence.observedAt" : path,
      );
    const repeatedBatch = rehashPersistenceBatch(repeated);
    await expect(
      repository.completeRun({
        ...completionInput(
          secondClaim.run.id,
          secondClaim.privateClaim.leaseToken,
          new Date("2026-07-30T14:32:00.000Z"),
        ),
        submissionHash: repeatedBatch.canonicalSubmissionHash,
        batch: repeatedBatch,
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      db
        .select()
        .from(globalRadarSignals)
        .where(eq(globalRadarSignals.id, storedBefore.id)),
    ).resolves.toEqual([storedBefore]);
    await expect(
      db
        .select()
        .from(globalSignalEvidence)
        .where(eq(globalSignalEvidence.signalId, storedBefore.id)),
    ).resolves.toEqual(evidenceBefore);
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
    });
    expect(evidence?.supportedFieldPaths).toEqual(
      rehashed.signals[0]!.evidence[0]!.supportedFieldPaths,
    );
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
    const graphBefore = await graphRowCounts();
    const runBefore = await runningPersistenceSnapshot(claim.run.id);
    if (rehash) {
      expect(() =>
        rehashPersistenceBatch(
          batch as unknown as PersistableGlobalRadarBatch,
        ),
      ).toThrow();
      expect(await graphRowCounts()).toEqual(graphBefore);
      expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(
        runBefore,
      );
      return;
    }
    const submittedBatch = {
      ...batch,
      canonicalSubmissionHash: HASH_A,
    } as unknown as PersistableGlobalRadarBatch;

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
    const evidenceOrdinalsBeforeReplay = await db
      .select({
        evidenceFingerprint: globalSignalEvidence.evidenceFingerprint,
        ingestOrdinal: globalSignalEvidence.ingestOrdinal,
      })
      .from(globalSignalEvidence)
      .orderBy(asc(globalSignalEvidence.ingestOrdinal));
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
    expect(
      await db
        .select({
          evidenceFingerprint: globalSignalEvidence.evidenceFingerprint,
          ingestOrdinal: globalSignalEvidence.ingestOrdinal,
        })
        .from(globalSignalEvidence)
        .orderBy(asc(globalSignalEvidence.ingestOrdinal)),
    ).toEqual(evidenceOrdinalsBeforeReplay);
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
    await rebaseGlobalRadarFixtureSignal(qualified.id, {
      status: "qualified",
    });

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

  it("re-expires a reopened signal without colliding with the prior expiry transition", async () => {
    const queueAt = new Date("2026-07-30T14:30:00.000Z");
    await repository.queueRun(
      queueInput("expiry-reopen-cycle", { now: queueAt }),
    );
    const claim = await repository.claimRun({ now: queueAt });
    if (claim.outcome !== "claimed") {
      throw new Error("Expiry reopen fixture was not claimed.");
    }
    const batch = structuredClone(validPersistenceBatch(claim.run.id));
    batch.signals[0]!.expiresAt = "2026-07-31T00:00:00.000Z";
    const submitted = rehashPersistenceBatch(batch);
    await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(queueAt.getTime() + 1_000),
      ),
      submissionHash: submitted.canonicalSubmissionHash,
      batch: submitted,
    });
    const [signal] = await db.select().from(globalRadarSignals);
    if (!signal) throw new Error("Expiry reopen signal was not persisted.");

    const dueAt = new Date("2026-07-31T00:00:00.000Z");
    await expect(repository.expireDirectDemand({ now: dueAt })).resolves.toEqual(
      { outcome: "completed", expired: 1 },
    );
    await expect(repository.expireDirectDemand({ now: dueAt })).resolves.toEqual(
      { outcome: "completed", expired: 0 },
    );

    const adminRepository = createGlobalRadarAdminRepository(db, {
      scoreVersion: "global-radar-score-v1",
      thresholds: {
        direct_demand: 70,
        demand_precursor: 65,
        ecosystem_momentum: 70,
      },
    });
    await expect(
      adminRepository.reviewSignal({
        signalId: signal.id,
        actor: { userId: administratorUserId, email: userEmail },
        envelope: {
          expectedRevision: 1,
          idempotencyKey: "30000000-0000-4000-8000-000000000002",
          reason: "Reopen the demand for an explicit second expiry review.",
          now: new Date("2026-07-31T00:01:00.000Z"),
        },
        command: { type: "reopen" },
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      detail: { signal: { status: "needs_review", revision: 2 } },
    });

    const secondDueAt = new Date("2026-07-31T00:02:00.000Z");
    await expect(
      repository.expireDirectDemand({ now: secondDueAt }),
    ).resolves.toEqual({ outcome: "completed", expired: 1 });
    await expect(
      repository.expireDirectDemand({ now: secondDueAt }),
    ).resolves.toEqual({ outcome: "completed", expired: 0 });

    const [expiredAgain] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    expect(expiredAgain).toMatchObject({ status: "expired", revision: 3 });
    const expiryUpdates = await db
      .select({
        idempotencyKey: globalSignalUpdates.idempotencyKey,
        newSafeState: globalSignalUpdates.newSafeState,
      })
      .from(globalSignalUpdates)
      .where(eq(globalSignalUpdates.actorId, "global-radar:expiry"));
    expect(expiryUpdates).toHaveLength(2);
    expect(expiryUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey:
            `expiry:${signal.id}:revision:1:known_expiry_reached`,
          newSafeState: {
            status: "expired",
            reason: "known_expiry_reached",
          },
        }),
        expect.objectContaining({
          idempotencyKey:
            `expiry:${signal.id}:revision:3:known_expiry_reached`,
          newSafeState: {
            status: "expired",
            reason: "known_expiry_reached",
          },
        }),
      ]),
    );
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
    await rebaseGlobalRadarFixtureSignal(created.id, {
      status: "qualified",
      expiresAt: humanExpiry,
      revision: 11,
    });

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
    rediscovered.demandDomain = "spatial_ai_and_3d_data";
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
      demandDomain: "robot_learning_and_manipulation",
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
    const administratorSnapshot = structuredClone(
      initialSignal.scoreEvidenceSnapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    administratorSnapshot.assessmentAuthority = "administrator";
    for (const component of administratorSnapshot.componentEvidence) {
      if (
        component.component === "taxonomyConsistency" ||
        component.component === "evidenceQuality"
      ) {
        component.basis = "administrator_assessed";
        component.rationale =
          "Administrator metric is supported by public evidence cited for this momentum input.";
      }
    }
    const assessedAssociations = structuredClone(
      administratorSnapshot.componentEvidence.filter(
        ({ component }) =>
          component === "taxonomyConsistency" || component === "evidenceQuality",
      ),
    );
    await db
      .update(globalRadarSignals)
      .set({ scoreEvidenceSnapshot: administratorSnapshot })
      .where(eq(globalRadarSignals.id, initialSignal.id));

    const first = await repository.recomputeMomentum({
      now: new Date("2026-07-31T14:00:00.000Z"),
      policy: MOMENTUM_POLICY,
    });
    expect(first).toEqual({ outcome: "completed", recomputed: 0, unchanged: 1 });
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
    const refreshedSnapshot = signal?.scoreEvidenceSnapshot;
    expect(refreshedSnapshot?.assessmentAuthority).toBe("administrator");
    expect(
      refreshedSnapshot?.componentEvidence.filter(
        ({ component }) =>
          component === "taxonomyConsistency" || component === "evidenceQuality",
      ),
    ).toEqual(assessedAssociations);
    expect(
      refreshedSnapshot?.componentEvidence.find(
        ({ component }) => component === "volume7Days",
      ),
    ).toMatchObject({ value: 2, basis: "server_derived" });
    expect(
      await db
        .select()
        .from(globalSignalUpdates)
        .where(eq(globalSignalUpdates.updateType, "momentum_recomputed")),
    ).toHaveLength(0);

    const snapshotBeforeScoreNeutralAppend = signal?.scoreEvidenceSnapshot;
    const revisionBeforeScoreNeutralAppend = signal?.revision;
    const [evidenceTemplate] = evidence;
    if (!evidenceTemplate || !signal) {
      throw new Error("Score-neutral momentum append fixture is missing.");
    }
    const {
      id: _evidenceId,
      ingestOrdinal: _ingestOrdinal,
      evidenceFingerprint: _evidenceFingerprint,
      sourceUrl: _sourceUrl,
      canonicalSourceUrl: _canonicalSourceUrl,
      ...scoreNeutralEvidence
    } = evidenceTemplate;
    void _evidenceId;
    void _ingestOrdinal;
    void _evidenceFingerprint;
    void _sourceUrl;
    void _canonicalSourceUrl;
    const scoreNeutralUrl =
      "https://momentum-projection.example/syndicated-context";
    await db.insert(globalSignalEvidence).values({
      ...scoreNeutralEvidence,
      ingestOrdinal: 4,
      runId: null,
      sourceUrl: scoreNeutralUrl,
      canonicalSourceUrl: scoreNeutralUrl,
      evidenceFingerprint: createEvidenceFingerprint({
        sourceUrl: scoreNeutralUrl,
        canonicalSourceUrl: scoreNeutralUrl,
        isPrimarySource: false,
      }),
      isPrimarySource: false,
      isSyndicated: true,
      observedAt: new Date("2026-07-31T13:59:00.000Z"),
      createdAt: new Date("2026-07-31T14:00:01.000Z"),
    });
    const refreshedAt = new Date("2026-07-31T14:00:01.000Z");
    const second = await repository.recomputeMomentum({
      now: refreshedAt,
      policy: MOMENTUM_POLICY,
    });
    expect(second).toEqual({ outcome: "completed", recomputed: 1, unchanged: 0 });
    const [unchangedSignal] = await db
      .select({
        revision: globalRadarSignals.revision,
        scoreEvidenceSnapshot: globalRadarSignals.scoreEvidenceSnapshot,
      })
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, initialSignal.id));
    expect(unchangedSignal?.revision).toBe(revisionBeforeScoreNeutralAppend! + 1);
    expect(unchangedSignal?.scoreEvidenceSnapshot).toMatchObject({
      scoreAsOf: refreshedAt.toISOString(),
      evidenceBoundaryOrdinal: 4,
      evidenceSetCount: 4,
    });
    expect(unchangedSignal?.scoreEvidenceSnapshot).not.toEqual(
      snapshotBeforeScoreNeutralAppend,
    );
    expect(
      await db
        .select()
        .from(globalSignalUpdates)
        .where(eq(globalSignalUpdates.updateType, "momentum_recomputed")),
    ).toHaveLength(1);

    const third = await repository.recomputeMomentum({
      now: refreshedAt,
      policy: MOMENTUM_POLICY,
    });
    expect(third).toEqual({ outcome: "completed", recomputed: 0, unchanged: 1 });
  });

  it("preserves administrator-assessed momentum components while advancing an aged evaluation snapshot", async () => {
    const queueAt = new Date("2026-07-30T16:15:00.000Z");
    await repository.queueRun(
      queueInput("momentum-aged-assessed-citation", { now: queueAt }),
    );
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
    if (!signal) throw new Error("Momentum signal was not persisted.");
    const administratorSnapshot = structuredClone(
      signal.scoreEvidenceSnapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    administratorSnapshot.assessmentAuthority = "administrator";
    for (const component of administratorSnapshot.componentEvidence) {
      if (
        component.component === "taxonomyConsistency" ||
        component.component === "evidenceQuality"
      ) {
        component.basis = "administrator_assessed";
        component.rationale =
          "Administrator metric is supported by public evidence cited for this momentum input.";
      }
    }
    const assessedCitationFingerprint =
      administratorSnapshot.componentEvidence.find(
        ({ component }) => component === "taxonomyConsistency",
      )?.evidence[0]?.evidenceFingerprint;
    if (!assessedCitationFingerprint) {
      throw new Error("Assessed momentum citation fixture was incomplete.");
    }
    const [citedEvidence] = await db
      .select()
      .from(globalSignalEvidence)
      .where(
        sql`${globalSignalEvidence.signalId} = ${signal.id}
          AND ${globalSignalEvidence.evidenceFingerprint} = ${assessedCitationFingerprint}`,
      );
    if (!citedEvidence) {
      throw new Error("Assessed momentum evidence row was not persisted.");
    }
    const { id: _citedEvidenceId, ...replacementEvidence } = citedEvidence;
    void _citedEvidenceId;
    const replacementUrl = "https://evidence.example/active-replacement";
    const replacementIngestOrdinal =
      await nextGlobalRadarEvidenceIngestOrdinal(signal.id);
    await db.transaction(async (transaction) => {
      await transaction
        .update(globalRadarSignals)
        .set({ scoreEvidenceSnapshot: administratorSnapshot })
        .where(eq(globalRadarSignals.id, signal.id));
      await transaction.insert(globalSignalEvidence).values({
        ...replacementEvidence,
        ingestOrdinal: replacementIngestOrdinal,
        sourceUrl: replacementUrl,
        canonicalSourceUrl: replacementUrl,
        observedAt: new Date("2027-01-31T00:00:00.000Z"),
        publishedAt: new Date("2027-01-31T00:00:00.000Z"),
        evidenceFingerprint: createEvidenceFingerprint({
          sourceUrl: replacementUrl,
          canonicalSourceUrl: replacementUrl,
          isPrimarySource: replacementEvidence.isPrimarySource,
        }),
      });
    });
    const administratorAssessmentsBefore =
      administratorSnapshot.componentEvidence.filter(
        ({ component }) =>
          component === "taxonomyConsistency" ||
          component === "evidenceQuality",
      );
    const snapshotBefore = JSON.stringify(administratorSnapshot);

    await expect(
      repository.recomputeMomentum({
        now: new Date("2027-02-01T00:00:00.000Z"),
        policy: MOMENTUM_POLICY,
      }),
    ).resolves.toEqual({ outcome: "completed", recomputed: 1, unchanged: 0 });

    const [recomputed] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    expect(
      recomputed?.scoreEvidenceSnapshot.componentEvidence.filter(
        ({ component }) =>
          component === "taxonomyConsistency" ||
          component === "evidenceQuality",
      ),
    ).toEqual(administratorAssessmentsBefore);
    expect(recomputed?.scoreEvidenceSnapshot).toMatchObject({
      scoreAsOf: "2027-02-01T00:00:00.000Z",
      evidenceBoundaryOrdinal: replacementIngestOrdinal,
      evidenceSetCount: replacementIngestOrdinal,
      assessmentAuthority: "administrator",
    });
    expect(JSON.stringify(recomputed?.scoreEvidenceSnapshot)).not.toBe(
      snapshotBefore,
    );
    expect(recomputed?.revision).toBe(signal.revision + 1);
  });

  it("recomputes an all-aged momentum window to zero without reciting aged evidence", async () => {
    const queueAt = new Date("2026-07-30T16:18:00.000Z");
    await repository.queueRun(
      queueInput("momentum-all-evidence-aged", { now: queueAt }),
    );
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
    if (!signal) throw new Error("Momentum signal was not persisted.");
    const administratorSnapshot = structuredClone(
      signal.scoreEvidenceSnapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    administratorSnapshot.assessmentAuthority = "administrator";
    for (const component of administratorSnapshot.componentEvidence) {
      if (
        component.component === "taxonomyConsistency" ||
        component.component === "evidenceQuality"
      ) {
        component.basis = "administrator_assessed";
        component.rationale =
          "Administrator metric is supported by public evidence cited for this momentum input.";
      }
    }
    const assessedAssociations = structuredClone(
      administratorSnapshot.componentEvidence.filter(
        ({ component }) =>
          component === "taxonomyConsistency" || component === "evidenceQuality",
      ),
    );
    const agedFingerprints = new Set(
      administratorSnapshot.componentEvidence.flatMap(({ evidence }) =>
        evidence.map(({ evidenceFingerprint }) => evidenceFingerprint),
      ),
    );
    await db
      .update(globalRadarSignals)
      .set({ scoreEvidenceSnapshot: administratorSnapshot })
      .where(eq(globalRadarSignals.id, signal.id));

    const recomputedAt = new Date("2027-02-01T00:00:00.000Z");
    await expect(
      repository.recomputeMomentum({
        now: recomputedAt,
        policy: MOMENTUM_POLICY,
      }),
    ).resolves.toEqual({ outcome: "completed", recomputed: 1, unchanged: 0 });

    const [recomputed] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    expect(recomputed).toMatchObject({
      momentumIndependentEntityCount: 0,
      momentumPrimarySourceCount: 0,
      momentumSourceFamilyCount: 0,
      momentumVolume7Days: 0,
      momentumVolume30Days: 0,
      momentumVolume90Days: 0,
      momentumIndependentEntityBreadth: 0,
      momentumPrimarySourceDepth: 0,
      momentumSourceDiversity: 0,
      momentumWeightedVolume: 0,
      momentumGrowthVsPreviousPeriod: 0,
      momentumQualificationGatesPassed: false,
      revision: signal.revision + 1,
    });
    const refreshedSnapshot = recomputed?.scoreEvidenceSnapshot;
    expect(refreshedSnapshot?.assessmentAuthority).toBe("administrator");
    expect(refreshedSnapshot?.emptyMomentumEvidenceWindow).toEqual({
      asOf: recomputedAt.toISOString(),
      maximumAgeDays: 180,
      eligibleEvidenceCount: 0,
    });
    expect(
      refreshedSnapshot?.componentEvidence.filter(
        ({ component }) =>
          component === "taxonomyConsistency" || component === "evidenceQuality",
      ),
    ).toEqual(assessedAssociations);
    const derivedAssociations =
      refreshedSnapshot?.componentEvidence.filter(
        ({ basis }) => basis === "server_derived",
      ) ?? [];
    expect(derivedAssociations).toHaveLength(11);
    expect(
      derivedAssociations.every(
        ({ value, evidence }) =>
          value === 0 &&
          evidence.length === 0 &&
          evidence.every(
            ({ evidenceFingerprint }) =>
              !agedFingerprints.has(evidenceFingerprint),
          ),
      ),
    ).toBe(true);

    const adminRepository = createGlobalRadarAdminRepository(db, {
      scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
      thresholds: {
        direct_demand: 70,
        demand_precursor: 65,
        ecosystem_momentum: 70,
      },
    });
    await db
      .update(globalRadarSignals)
      .set({ updatedAt: new Date("2027-03-01T00:00:00.000Z") })
      .where(eq(globalRadarSignals.id, signal.id));
    await expect(
      adminRepository.getSignalDetail(signal.id),
    ).resolves.toMatchObject({ outcome: "found" });

    const [agedEvidence] = await db
      .select()
      .from(globalSignalEvidence)
      .where(
        and(
          eq(globalSignalEvidence.signalId, signal.id),
          eq(globalSignalEvidence.isSyndicated, false),
        ),
      )
      .orderBy(asc(globalSignalEvidence.ingestOrdinal))
      .limit(1);
    if (!agedEvidence) throw new Error("Aged evidence fixture was not persisted.");
    const { id: _agedEvidenceId, ...activeEvidence } = agedEvidence;
    void _agedEvidenceId;
    const activeUrl = "https://evidence.example/uncited-active-window-tamper";
    const activeIngestOrdinal =
      await nextGlobalRadarEvidenceIngestOrdinal(signal.id);
    await db.insert(globalSignalEvidence).values({
      ...activeEvidence,
      ingestOrdinal: activeIngestOrdinal,
      sourceUrl: activeUrl,
      canonicalSourceUrl: activeUrl,
      evidenceFingerprint: createEvidenceFingerprint({
        sourceUrl: activeUrl,
        canonicalSourceUrl: activeUrl,
        isPrimarySource: activeEvidence.isPrimarySource,
      }),
      observedAt: new Date("2027-01-31T00:00:00.000Z"),
      publishedAt: new Date("2027-01-31T00:00:00.000Z"),
    });
    await expect(adminRepository.getSignalDetail(signal.id)).rejects.toThrow(
      "Invalid stored Global Radar empty momentum evidence window.",
    );
    await expect(
      adminRepository.reviewSignal({
        signalId: signal.id,
        actor: { userId: administratorUserId, email: userEmail },
        envelope: {
          expectedRevision: signal.revision + 1,
          idempotencyKey: "30000000-0000-4000-8000-000000000040",
          reason: "Confirm the persisted empty evidence-window proof.",
          now: new Date("2027-03-01T00:01:00.000Z"),
        },
        command: { type: "request_review" },
      }),
    ).rejects.toThrow(
      "Invalid stored Global Radar empty momentum evidence window.",
    );
  });

  it.each([
    {
      boundary: "missing",
      mutate: async (evidenceId: string) => {
        await db
          .update(globalSignalUpdates)
          .set({ evidenceId: null })
          .where(eq(globalSignalUpdates.evidenceId, evidenceId));
        await db
          .delete(globalSignalEvidence)
          .where(eq(globalSignalEvidence.id, evidenceId));
      },
    },
    {
      boundary: "syndicated",
      mutate: async (evidenceId: string) => {
        await db
          .update(globalSignalEvidence)
          .set({ isSyndicated: true })
          .where(eq(globalSignalEvidence.id, evidenceId));
      },
    },
    {
      boundary: "detached from a contributor",
      mutate: async (evidenceId: string) => {
        await db
          .update(globalSignalEvidence)
          .set({ globalEntityId: null })
          .where(eq(globalSignalEvidence.id, evidenceId));
      },
    },
  ])(
    "fails closed without signal or history writes when cited momentum evidence is $boundary",
    async ({ boundary, mutate }) => {
      const queueAt = new Date("2026-07-30T16:20:00.000Z");
      await repository.queueRun(
        queueInput(`momentum-cited-evidence-${boundary}`, { now: queueAt }),
      );
      const claim = await repository.claimRun({ now: queueAt });
      if (claim.outcome !== "claimed") {
        throw new Error("Fixture was not claimed.");
      }
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
      const citedFingerprint =
        signal?.scoreEvidenceSnapshot.componentEvidence[0]?.evidence[0]
          ?.evidenceFingerprint;
      if (!signal || !citedFingerprint) {
        throw new Error("Momentum citation fixture was incomplete.");
      }
      const [citedEvidence] = await db
        .select({ id: globalSignalEvidence.id })
        .from(globalSignalEvidence)
        .where(
          sql`${globalSignalEvidence.signalId} = ${signal.id}
            AND ${globalSignalEvidence.evidenceFingerprint} = ${citedFingerprint}`,
        );
      if (!citedEvidence) {
        throw new Error("Cited momentum evidence row was not persisted.");
      }
      await mutate(citedEvidence.id);
      const [before] = await db
        .select()
        .from(globalRadarSignals)
        .where(eq(globalRadarSignals.id, signal.id));
      const updatesBefore = await db
        .select()
        .from(globalSignalUpdates)
        .where(eq(globalSignalUpdates.signalId, signal.id));

      await expect(
        repository.recomputeMomentum({
          now: new Date("2026-07-31T14:00:00.000Z"),
          policy: MOMENTUM_POLICY,
        }),
      ).rejects.toThrow(
        "Invalid stored Global Radar score provenance: evidence_evaluation_mismatch.",
      );

      const [after] = await db
        .select()
        .from(globalRadarSignals)
        .where(eq(globalRadarSignals.id, signal.id));
      const updatesAfter = await db
        .select()
        .from(globalSignalUpdates)
        .where(eq(globalSignalUpdates.signalId, signal.id));
      expect(after).toEqual(before);
      expect(updatesAfter).toEqual(updatesBefore);
    },
  );

  it("fails closed and rolls back momentum maintenance when stored score provenance is malformed", async () => {
    const queueAt = new Date("2026-07-30T16:30:00.000Z");
    await repository.queueRun(
      queueInput("momentum-malformed-score-provenance", { now: queueAt }),
    );
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
    if (!signal) throw new Error("Momentum signal was not persisted.");
    const malformedSnapshot = structuredClone(
      signal.scoreEvidenceSnapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    const volume7Days = malformedSnapshot.componentEvidence.find(
      ({ component }) => component === "volume7Days",
    );
    if (!volume7Days) throw new Error("Momentum provenance fixture was incomplete.");
    volume7Days.value = 99;
    await db
      .update(globalRadarSignals)
      .set({
        momentumVolume7Days: 0,
        scoreEvidenceSnapshot: malformedSnapshot,
      })
      .where(eq(globalRadarSignals.id, signal.id));
    const [before] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    const updatesBefore = await db
      .select()
      .from(globalSignalUpdates)
      .where(eq(globalSignalUpdates.signalId, signal.id));

    await expect(
      repository.recomputeMomentum({
        now: new Date("2026-07-31T14:00:00.000Z"),
        policy: MOMENTUM_POLICY,
      }),
    ).rejects.toThrow(
      "Invalid stored Global Radar score provenance: active_snapshot_mismatch.",
    );

    const [after] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    const updatesAfter = await db
      .select()
      .from(globalSignalUpdates)
      .where(eq(globalSignalUpdates.signalId, signal.id));
    expect(after).toEqual(before);
    expect(updatesAfter).toEqual(updatesBefore);
  });

  it.each([
    {
      drift: "status-only",
      tamper: async (signal: typeof globalRadarSignals.$inferSelect) => {
        await db
          .update(globalRadarSignals)
          .set({ status: "qualified" })
          .where(eq(globalRadarSignals.id, signal.id));
      },
    },
    {
      drift: "coherent assessed-input",
      tamper: async (signal: typeof globalRadarSignals.$inferSelect) => {
        if (signal.momentumTaxonomyConsistency === null) {
          throw new Error("Momentum drift fixture has no assessed input.");
        }
        const taxonomyConsistency =
          signal.momentumTaxonomyConsistency === 100
            ? 99
            : signal.momentumTaxonomyConsistency + 1;
        const rescored = scoreEcosystemMomentum({
          independentEntityBreadth: signal.momentumIndependentEntityBreadth,
          primarySourceDepth: signal.momentumPrimarySourceDepth,
          sourceDiversity: signal.momentumSourceDiversity,
          weightedVolume: signal.momentumWeightedVolume,
          growthVsPreceding: signal.momentumGrowthVsPreviousPeriod,
          taxonomyConsistency,
          evidenceQuality: signal.momentumEvidenceQuality,
        });
        if (!rescored.valid) {
          throw new Error("Momentum drift fixture did not rescore.");
        }
        const scoreEvidenceSnapshot = structuredClone(
          signal.scoreEvidenceSnapshot,
        ) as unknown as MutableActiveScoreEvidenceSnapshot;
        const association = scoreEvidenceSnapshot.componentEvidence.find(
          ({ component }) => component === "taxonomyConsistency",
        );
        if (!association) {
          throw new Error("Momentum drift fixture has no assessed input.");
        }
        association.value = taxonomyConsistency;
        await db
          .update(globalRadarSignals)
          .set({
            momentumTaxonomyConsistency: taxonomyConsistency,
            momentumScore: rescored.score,
            scoreCoverage: rescored.scoreCoverage,
            scoreEvidenceSnapshot,
          })
          .where(eq(globalRadarSignals.id, signal.id));
      },
    },
  ])(
    "fails closed with zero maintenance writes after $drift score provenance drift",
    async ({ drift, tamper }) => {
      const queueAt = new Date("2026-07-30T16:35:00.000Z");
      await repository.queueRun(
        queueInput(`momentum-${drift}-provenance-drift`, { now: queueAt }),
      );
      const claim = await repository.claimRun({ now: queueAt });
      if (claim.outcome !== "claimed") {
        throw new Error("Fixture was not claimed.");
      }
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
      if (!signal) throw new Error("Momentum signal was not persisted.");
      await tamper(signal);
      const [before] = await db
        .select()
        .from(globalRadarSignals)
        .where(eq(globalRadarSignals.id, signal.id));
      const updatesBefore = await db
        .select()
        .from(globalSignalUpdates)
        .where(eq(globalSignalUpdates.signalId, signal.id));

      await expect(
        repository.recomputeMomentum({
          now: new Date("2026-07-31T14:00:00.000Z"),
          policy: MOMENTUM_POLICY,
        }),
      ).rejects.toThrow(
        "Invalid stored Global Radar score provenance: score_input_mismatch.",
      );

      const [after] = await db
        .select()
        .from(globalRadarSignals)
        .where(eq(globalRadarSignals.id, signal.id));
      const updatesAfter = await db
        .select()
        .from(globalSignalUpdates)
        .where(eq(globalSignalUpdates.signalId, signal.id));
      expect(after).toEqual(before);
      expect(updatesAfter).toEqual(updatesBefore);
    },
  );

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
    const firstSyntheticIngestOrdinal =
      await nextGlobalRadarEvidenceIngestOrdinal(signal.id);
    const syntheticEvidence = [
      ...Array.from({ length: 101 }, (_, index) => ({
        ...templateValues,
        ingestOrdinal: firstSyntheticIngestOrdinal + index,
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
        ingestOrdinal: firstSyntheticIngestOrdinal + 101 + index,
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
    await rebaseGlobalRadarFixtureSignal(created.id, {
      status: "qualified",
      revision: 7,
    });

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
            observedAt: now.toISOString(),
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
    const duplicateId = "ffffffff-ffff-4fff-bfff-ffffffffffff";
    await db.insert(globalRadarSignals).values({
      ...owner,
      id: duplicateId,
      title: "Later lexical tie",
      dedupeKey: "d".repeat(64),
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
    const ownerEvidence = await db
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, owner.id));
    await db.insert(globalSignalEvidence).values(
      ownerEvidence.map(({ id, ...evidence }) => {
        void id;
        return { ...evidence, signalId: duplicateId };
      }),
    );
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

    await persistClassFixture("filters-precursor", "precursor");
    const [precursorSignal] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.signalClass, "demand_precursor"));
    if (!precursorSignal) {
      throw new Error("Admin precursor filter fixture was not persisted.");
    }
    const precursor = await adminRepository.listSignals({
      signalClass: "demand_precursor",
      filters: { horizon: "days_31_to_90", page: 1 },
    });
    expect(precursor).toMatchObject({
      outcome: "listed",
      total: 1,
      items: [{ id: precursorSignal.id }],
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
    const overview = await adminRepository.getOverviewMetrics({
      now: new Date("2026-07-30T12:00:00.000Z"),
    });
    expect(overview).toMatchObject({
      outcome: "listed",
      metrics: {
        newSignals: 1,
        activeDirectDemand: 1,
        highQualityPrecursors: 0,
        india: { explicit: 1, inferred: 0 },
        countries: { unitedStates: 1, china: 0, other: 0 },
        requirementMix: { physicalData: 1, hardware: 0 },
        capabilityFamilies: [
          { capability: expect.any(String), signals: 1 },
        ],
        expiringDirectDemand: 1,
        promotedEntities: 0,
        latestRun: { id: expect.any(String), status: "succeeded" },
        sourceErrors: 0,
        mergedDuplicates: 0,
      },
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
    const [detailEvidence] = await db
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, signal.id));
    if (!detailEvidence) throw new Error("Detail evidence fixture was not persisted.");
    const citedEvidenceFingerprint =
      signal.scoreEvidenceSnapshot.componentEvidence[0]?.evidence[0]
        ?.evidenceFingerprint;
    if (!citedEvidenceFingerprint) {
      throw new Error("Detail score evidence fixture was not persisted.");
    }
    expect(citedEvidenceFingerprint).toBe(detailEvidence.evidenceFingerprint);
    const scoreEvidenceSnapshotBefore = JSON.stringify(
      signal.scoreEvidenceSnapshot,
    );
    const { id: _detailRequirementId, ...detailRequirementValues } = detailRequirement;
    const { id: _detailEvidenceId, ...detailEvidenceValues } = detailEvidence;
    void _detailRequirementId;
    void _detailEvidenceId;
    const firstDetailEvidenceIngestOrdinal =
      await nextGlobalRadarEvidenceIngestOrdinal(signal.id);
    await db.insert(globalSignalRequirements).values(
      Array.from({ length: 101 }, (_, index) => ({
        ...detailRequirementValues,
        requirementFingerprint: plainSha256(`detail-requirement-${index}`),
      })),
    );
    await db.insert(globalSignalEvidence).values(
      Array.from({ length: 101 }, (_, index) => {
        const sourceUrl = `https://detail-evidence-${index}.example/update`;
        return {
          ...detailEvidenceValues,
          ingestOrdinal: firstDetailEvidenceIngestOrdinal + index,
          sourceUrl,
          canonicalSourceUrl: sourceUrl,
          sourceName: `Detail evidence ${index}`,
          evidenceClaim: `Newer uncited detail evidence ${index}.`,
          englishSummary: `Newer uncited detail evidence ${index}.`,
          publishedAt: new Date("2026-07-30T10:00:00.000Z"),
          observedAt: new Date("2026-07-30T11:00:00.000Z"),
          evidenceFingerprint: plainSha256(`detail-evidence-${index}`),
        };
      }),
    );
    const cappedDetail = await adminRepository.getSignalDetail(signal.id);
    expect(cappedDetail).toMatchObject({
      outcome: "found",
      detail: {
        requirements: { total: 102, truncated: true },
        evidence: { total: 102, truncated: true },
      },
    });
    if (cappedDetail.outcome !== "found") throw new Error("Detail was not found.");
    expect(cappedDetail.detail.requirements.items).toHaveLength(100);
    expect(cappedDetail.detail.evidence.items).toHaveLength(100);
    expect(
      cappedDetail.detail.evidence.items.some(
        ({ id }) => id === detailEvidence.id,
      ),
    ).toBe(false);
    expect(
      cappedDetail.detail.scoreRationale.componentEvidence.flatMap(
        ({ evidence }) => evidence,
      ),
    ).toContainEqual({
      id: detailEvidence.id,
      sourceUrl: detailEvidence.sourceUrl,
      sourceName: detailEvidence.sourceName,
      matchedFieldPaths: expect.any(Array),
    });
    const [signalAfterDetailReads] = await db
      .select({ scoreEvidenceSnapshot: globalRadarSignals.scoreEvidenceSnapshot })
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    expect(JSON.stringify(signalAfterDetailReads?.scoreEvidenceSnapshot)).toBe(
      scoreEvidenceSnapshotBefore,
    );
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

  it("validates cited momentum ownership across the bounded association set and rejects semantic tampering", async () => {
    await persistClassFixture("detail-ownership", "momentum");
    const [signal] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.signalClass, "ecosystem_momentum"));
    const [entityTemplate] = await db.select().from(globalEntities).limit(1);
    const evidenceRows = await db
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, signal?.id ?? randomUUID()));
    const evidenceTemplate = evidenceRows.find(
      ({ isSyndicated, supportedFieldPaths }) =>
        !isSyndicated &&
        supportedFieldPaths.includes("momentumMetrics.taxonomyConsistency"),
    );
    if (!signal || !entityTemplate || !evidenceTemplate) {
      throw new Error("Momentum detail ownership fixture was not persisted.");
    }
    const dummyEntities = await db
      .insert(globalEntities)
      .values(
        Array.from({ length: 46 }, (_, index) => {
          const id = randomUUID();
          const websiteUrl = `https://detail-owner-${index}.example`;
          return {
            ...entityTemplate,
            id,
            canonicalName: `Detail owner ${index}`,
            normalizedName: `detail owner ${index}`,
            canonicalDomain: `detail-owner-${index}.example`,
            websiteUrl,
            linkedinUrl: null,
            stablePublicIdentifiers: [`fixture:detail-owner-${index}`],
            publicIdentityAnchor: plainSha256(
              `detail-owner-anchor-${index}`,
            ),
            canonicalCorporateGroupId: `group:detail-owner-${index}`,
          };
        }),
      )
      .returning({ id: globalEntities.id });
    await db.insert(globalRadarSignalEntities).values(
      dummyEntities.map(({ id }, index) => ({
        id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, "0")}`,
        signalId: signal.id,
        globalEntityId: id,
        role: "contributor" as const,
        confidence: 80,
        createdAt: signal.observedAt,
      })),
    );
    const [citedOwner] = await db
      .insert(globalEntities)
      .values({
        ...entityTemplate,
        id: randomUUID(),
        canonicalName: "Cited owner beyond display limit",
        normalizedName: "cited owner beyond display limit",
        canonicalDomain: "cited-owner-beyond-limit.example",
        websiteUrl: "https://cited-owner-beyond-limit.example",
        linkedinUrl: null,
        stablePublicIdentifiers: ["fixture:cited-owner-beyond-limit"],
        publicIdentityAnchor: plainSha256("cited-owner-beyond-limit"),
        canonicalCorporateGroupId: "group:cited-owner-beyond-limit",
      })
      .returning();
    if (!citedOwner) throw new Error("Cited detail owner was not persisted.");
    await db.insert(globalRadarSignalEntities).values({
      id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
      signalId: signal.id,
      globalEntityId: citedOwner.id,
      role: "contributor",
      confidence: 95,
      createdAt: signal.observedAt,
    });
    const { id: _evidenceTemplateId, ...evidenceTemplateValues } =
      evidenceTemplate;
    void _evidenceTemplateId;
    const citedEvidence = evidenceTemplate;
    const citedFingerprint = citedEvidence.evidenceFingerprint;
    const manuallyCitedSnapshot = structuredClone(
      signal.scoreEvidenceSnapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    const taxonomyAssociation = manuallyCitedSnapshot.componentEvidence.find(
      ({ component }) => component === "taxonomyConsistency",
    );
    if (!taxonomyAssociation) {
      throw new Error("Momentum taxonomy provenance was not persisted.");
    }
    taxonomyAssociation.evidence = [
      {
        evidenceFingerprint: citedFingerprint,
        matchedFieldPaths: ["momentumMetrics.taxonomyConsistency"],
      },
    ];
    const associations = await db
      .select({
        globalEntityId: globalRadarSignalEntities.globalEntityId,
        role: globalRadarSignalEntities.role,
      })
      .from(globalRadarSignalEntities)
      .where(eq(globalRadarSignalEntities.signalId, signal.id));
    const entityIds = [
      ...new Set(associations.map(({ globalEntityId }) => globalEntityId)),
    ];
    const entities = await db
      .select({
        id: globalEntities.id,
        canonicalCorporateGroupId: globalEntities.canonicalCorporateGroupId,
      })
      .from(globalEntities)
      .where(inArray(globalEntities.id, entityIds));
    const evaluationEvidence = await db
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, signal.id))
      .orderBy(asc(globalSignalEvidence.ingestOrdinal));
    const scoreAsOf = new Date(manuallyCitedSnapshot.scoreAsOf);
    const scoreInputDigest = createStoredGlobalRadarScoreInputDigest({
      scoreAsOf,
      signal,
      actionabilityInput: null,
      associations,
      entities,
    });
    const snapshot = rebaseStoredScoreEvidenceSnapshot({
      scoreInputDigest,
      scoreAsOf,
      existingSnapshot: manuallyCitedSnapshot,
      signalClass: "ecosystem_momentum",
      signalType: signal.signalType,
      currentIndiaRelevanceType: signal.indiaRelevanceType,
      nextIndiaRelevanceType: signal.indiaRelevanceType,
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
      currentComponents: storedScoreComponents(signal),
      nextComponents: storedScoreComponents(signal),
      replacementComponents: [],
      momentumContributorEntityIds: associations.map(
        ({ globalEntityId }) => globalEntityId,
      ),
      announcedAt: signal.announcedAt,
      effectiveFrom: signal.effectiveFrom,
      existingEvidence: evaluationEvidence,
      evidence: evaluationEvidence,
      evaluationEvidence,
    });
    await db
      .update(globalRadarSignals)
      .set({ scoreEvidenceSnapshot: snapshot })
      .where(eq(globalRadarSignals.id, signal.id));

    const detail = await adminRepository.getSignalDetail(signal.id);
    expect(detail).toMatchObject({
      outcome: "found",
      detail: {
        associatedOrganisations: { total: 50, truncated: false },
        scoreRationale: {
          componentEvidence: expect.arrayContaining([
            expect.objectContaining({
              component: "taxonomyConsistency",
              evidence: [
                expect.objectContaining({ id: citedEvidence.id }),
              ],
            }),
          ]),
        },
      },
    });
    if (detail.outcome !== "found") throw new Error("Detail was not found.");
    expect(detail.detail.associatedOrganisations.items).toHaveLength(50);
    expect(
      detail.detail.associatedOrganisations.items.some(
        ({ organisation }) => organisation.id === citedOwner.id,
      ),
    ).toBe(true);

    const wrongPathSnapshot = structuredClone(
      snapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    const wrongPathAssociation = wrongPathSnapshot.componentEvidence.find(
      ({ component }) => component === "taxonomyConsistency",
    );
    if (!wrongPathAssociation) {
      throw new Error("Momentum tamper fixture was not persisted.");
    }
    wrongPathAssociation.evidence[0] = {
      evidenceFingerprint: citedFingerprint,
      matchedFieldPaths: ["momentumMetrics.evidenceQuality"],
    };
    await db
      .update(globalRadarSignals)
      .set({ scoreEvidenceSnapshot: wrongPathSnapshot })
      .where(eq(globalRadarSignals.id, signal.id));
    await expect(adminRepository.getSignalDetail(signal.id)).rejects.toThrow(
      "Invalid stored Global Radar score provenance: citation_semantics_mismatch.",
    );

    const unrelatedUrl = "https://cited-owner-beyond-limit.example/unrelated";
    const unrelatedFingerprint = createEvidenceFingerprint({
      sourceUrl: unrelatedUrl,
      canonicalSourceUrl: unrelatedUrl,
      isPrimarySource: true,
    });
    const unrelatedIngestOrdinal =
      await nextGlobalRadarEvidenceIngestOrdinal(signal.id);
    await db.insert(globalSignalEvidence).values({
      ...evidenceTemplateValues,
      ingestOrdinal: unrelatedIngestOrdinal,
      globalEntityId: citedOwner.id,
      sourceUrl: unrelatedUrl,
      canonicalSourceUrl: unrelatedUrl,
      sourceName: "Unrelated same-signal evidence",
      evidenceClaim: "The source reports an unrelated operational update.",
      englishSummary: "An unrelated operational update.",
      isPrimarySource: true,
      isSyndicated: false,
      evidenceFingerprint: unrelatedFingerprint,
      supportedFieldPaths: ["signal.factualSummary"],
    });
    const wrongFingerprintSnapshot = structuredClone(
      snapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    const wrongFingerprintAssociation =
      wrongFingerprintSnapshot.componentEvidence.find(
        ({ component }) => component === "taxonomyConsistency",
      );
    if (!wrongFingerprintAssociation) {
      throw new Error("Momentum fingerprint tamper fixture was not persisted.");
    }
    wrongFingerprintAssociation.evidence[0] = {
      evidenceFingerprint: unrelatedFingerprint,
      matchedFieldPaths: ["momentumMetrics.taxonomyConsistency"],
    };
    await db
      .update(globalRadarSignals)
      .set({ scoreEvidenceSnapshot: wrongFingerprintSnapshot })
      .where(eq(globalRadarSignals.id, signal.id));
    await expect(adminRepository.getSignalDetail(signal.id)).rejects.toThrow(
      "Invalid stored Global Radar score provenance: cited_evidence_unresolved.",
    );

    const overflowEntityId = randomUUID();
    await db.insert(globalEntities).values({
      ...entityTemplate,
      id: overflowEntityId,
      canonicalName: "Overflow association owner",
      normalizedName: "overflow association owner",
      canonicalDomain: "overflow-association-owner.example",
      websiteUrl: "https://overflow-association-owner.example",
      linkedinUrl: null,
      stablePublicIdentifiers: ["fixture:overflow-association-owner"],
      publicIdentityAnchor: plainSha256("overflow-association-owner"),
      canonicalCorporateGroupId: "group:overflow-association-owner",
    });
    await db.insert(globalRadarSignalEntities).values({
      id: "ffffffff-ffff-4fff-bfff-fffffffffffe",
      signalId: signal.id,
      globalEntityId: overflowEntityId,
      role: "contributor",
      confidence: 80,
      createdAt: signal.observedAt,
    });
    await expect(adminRepository.getSignalDetail(signal.id)).rejects.toThrow(
      "Invalid stored Global Radar score provenance: score_input_mismatch.",
    );
  });

  it("rejects precursor detail hydration when the scored horizon loses its date anchor", async () => {
    await persistClassFixture("detail-horizon", "precursor");
    const [signal] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.signalClass, "demand_precursor"));
    if (!signal) throw new Error("Precursor detail fixture was not persisted.");
    await db
      .update(globalRadarSignals)
      .set({ effectiveFrom: null })
      .where(eq(globalRadarSignals.id, signal.id));

    await expect(adminRepository.getSignalDetail(signal.id)).rejects.toThrow(
      "Invalid stored Global Radar score provenance: score_input_mismatch.",
    );
  });
});

describe("PostgreSQL Global Radar score provenance on aggregate reads", () => {
  const adminRepository = createGlobalRadarAdminRepository(db, {
    scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
    thresholds: {
      direct_demand: 70,
      demand_precursor: 65,
      ecosystem_momentum: 70,
    },
  });
  const readAt = new Date("2026-07-30T14:00:00.000Z");

  async function persistReadProvenanceFixture(
    suffix: string,
    signalClass:
      | "direct_demand"
      | "demand_precursor"
      | "ecosystem_momentum",
  ) {
    const queuedAt = new Date("2026-07-30T12:00:00.000Z");
    await repository.queueRun(
      queueInput(`read-provenance-${suffix}`, { now: queuedAt }),
    );
    const claim = await repository.claimRun({ now: queuedAt });
    if (claim.outcome !== "claimed") {
      throw new Error("Read provenance fixture was not claimed.");
    }
    const batch =
      signalClass === "direct_demand"
        ? validPersistenceBatch(claim.run.id, {
            externalSignalId: `read-provenance-${suffix}`,
            observedAt: queuedAt.toISOString(),
            sourceUrl: `https://read-provenance-${suffix}.example/direct`,
            stableIdentifierValue: `read-provenance-${suffix}`,
            websiteUrl: `https://read-provenance-${suffix}.example`,
            linkedinOrganizationUrl: null,
          })
        : signalClass === "demand_precursor"
          ? validPrecursorPersistenceBatch(claim.run.id)
          : validMomentumPersistenceBatch(claim.run.id);
    const completed = await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(queuedAt.getTime() + 1_000),
      ),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    if (completed.outcome !== "completed") {
      throw new Error("Read provenance fixture did not complete.");
    }
    const [signal] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.signalClass, signalClass));
    if (!signal) throw new Error("Read provenance signal was not persisted.");
    return signal;
  }

  it("uses bounded keyset aggregate scans and max-plus-one score-prefix reads", async () => {
    await persistReadProvenanceFixture("bounded-query-recording", "direct_demand");
    const recordedQueries: Array<{
      query: string;
      params: readonly unknown[];
    }> = [];
    const recordingClient = postgres(process.env.DATABASE_URL!, {
      max: 1,
      prepare: false,
      connect_timeout: 5,
      idle_timeout: 0,
    });
    const recordingDb = drizzle(recordingClient, {
      schema: { ...coreDatabaseSchema, ...globalRadarDatabaseSchema },
      logger: {
        logQuery(query, params) {
          recordedQueries.push({ query, params });
        },
      },
    });
    const recordingRepository = createGlobalRadarAdminRepository(
      recordingDb,
      {
        scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
        thresholds: {
          direct_demand: 70,
          demand_precursor: 65,
          ecosystem_momentum: 70,
        },
      },
    );
    try {
      await expect(
        recordingRepository.getClassMetrics({
          signalClass: "direct_demand",
          filters: {},
          now: readAt,
        }),
      ).resolves.toMatchObject({ outcome: "listed" });
      await expect(
        recordingRepository.getOverviewMetrics({ now: readAt }),
      ).resolves.toMatchObject({ outcome: "listed" });
    } finally {
      await recordingClient.end({ timeout: 5 });
    }

    const signalReads = recordedQueries.filter(({ query }) =>
      /select[\s\S]+from "global_radar_signals"/i.test(query),
    );
    expect(signalReads.length).toBeGreaterThanOrEqual(2);
    expect(signalReads.every(({ query }) => /order by[\s\S]+"id" asc[\s\S]+limit/i.test(query))).toBe(true);
    expect(
      signalReads.every(({ params }) =>
        params.some(
          (value) => Number(value) === 100,
        ),
      ),
    ).toBe(true);
    const prefixReads = recordedQueries.filter(({ query }) =>
      /from "global_signal_evidence"[\s\S]+"ingest_ordinal"[\s\S]+limit/i.test(
        query,
      ),
    );
    expect(prefixReads.length).toBeGreaterThan(0);
    expect(
      prefixReads.every(({ params }) =>
        params.some(
          (value) =>
            Number(value) ===
            MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS + 1,
        ),
      ),
    ).toBe(true);
    const associationReads = recordedQueries.filter(({ query }) =>
      /from "global_radar_signal_entities"[\s\S]+order by[\s\S]+"signal_id" asc[\s\S]+"global_entity_id" asc[\s\S]+limit/i.test(
        query,
      ),
    );
    expect(associationReads.length).toBeGreaterThan(0);
    expect(
      associationReads.every(({ params }) =>
        params.some((value) => Number(value) === 51),
      ),
    ).toBe(true);
  });

  const cases = [
    { surface: "list", signalClass: "direct_demand" },
    { surface: "class metrics", signalClass: "direct_demand" },
    { surface: "overview", signalClass: "demand_precursor" },
    { surface: "watchlist enrichment", signalClass: "direct_demand" },
  ] as const;
  const tampers = ["aggregate", "citation"] as const;

  it.each(
    cases.flatMap((readCase) =>
      tampers.map((tamper) => ({ ...readCase, tamper })),
    ),
  )(
    "rejects $tamper score tampering for the $surface without returning partial numbers",
    async ({ surface, signalClass, tamper }) => {
      const signal = await persistReadProvenanceFixture(
        `${surface.replaceAll(" ", "-")}-${tamper}`,
        signalClass,
      );
      if (tamper === "aggregate") {
        const storedScore =
          signalClass === "direct_demand"
            ? signal.directDemandScore
            : signal.precursorScore;
        if (storedScore === null) {
          throw new Error("Read provenance aggregate was not persisted.");
        }
        await db
          .update(globalRadarSignals)
          .set(
            signalClass === "direct_demand"
              ? { directDemandScore: storedScore === 100 ? 99 : storedScore + 1 }
              : { precursorScore: storedScore === 100 ? 99 : storedScore + 1 },
          )
          .where(eq(globalRadarSignals.id, signal.id));
      } else {
        const snapshot = structuredClone(
          signal.scoreEvidenceSnapshot,
        ) as unknown as MutableActiveScoreEvidenceSnapshot;
        const association = snapshot.componentEvidence[0];
        if (!association) {
          throw new Error("Read provenance citation was not persisted.");
        }
        association.rationale = "Tampered active score citation rationale.";
        await db
          .update(globalRadarSignals)
          .set({ scoreEvidenceSnapshot: snapshot })
          .where(eq(globalRadarSignals.id, signal.id));
      }

      const read =
        surface === "list"
          ? adminRepository.listSignals({
              signalClass: "direct_demand",
              filters: { page: 1 },
            })
          : surface === "class metrics"
            ? adminRepository.getClassMetrics({
                signalClass: "direct_demand",
                filters: {},
                now: readAt,
              })
            : surface === "overview"
              ? adminRepository.getOverviewMetrics({ now: readAt })
              : adminRepository.getWatchlistEnrichment({
                  globalEntityIds: signal.globalEntityId
                    ? [signal.globalEntityId]
                    : [],
                  now: readAt,
                });
      const outcome = await read;
      expect(outcome).toEqual({
        outcome: "conflict",
        reason: "score_provenance_invalid",
      });
      expect(JSON.stringify(outcome)).not.toMatch(
        /aggregate_score_mismatch|citation_semantics_mismatch|"metrics"|"items"|"score":/,
      );
    },
  );

  function differentScore(value: number | null): number {
    if (value === null) throw new Error("Deterministic score input is missing.");
    return value === 100 ? 99 : value + 1;
  }

  it("rejects one-second score clock drift even when the evidence set is unchanged", async () => {
    const signal = await persistReadProvenanceFixture(
      "score-clock-drift",
      "direct_demand",
    );
    const snapshot = structuredClone(
      signal.scoreEvidenceSnapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    snapshot.scoreAsOf = new Date(
      new Date(snapshot.scoreAsOf).getTime() + 1_000,
    ).toISOString();
    await db
      .update(globalRadarSignals)
      .set({ scoreEvidenceSnapshot: snapshot })
      .where(eq(globalRadarSignals.id, signal.id));

    await expect(
      adminRepository.listSignals({
        signalClass: "direct_demand",
        filters: { page: 1 },
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "score_provenance_invalid",
    });
  });

  it.each([
    {
      label: "announced-at anchor",
      values: (signal: typeof globalRadarSignals.$inferSelect) => ({
        announcedAt: new Date(signal.announcedAt!.getTime() + 1_000),
      }),
    },
    {
      label: "professional response URL",
      values: () => ({
        responsePathUrl: "https://alternate-response.example/respond",
      }),
    },
  ])("rejects unilateral direct-demand $label drift", async ({ label, values }) => {
    const signal = await persistReadProvenanceFixture(
      `direct.${label.toLowerCase().replaceAll(" ", ".")}`,
      "direct_demand",
    );
    if (signal.announcedAt === null || signal.responsePathUrl === null) {
      throw new Error("Direct score-input drift fixture is incomplete.");
    }
    await db
      .update(globalRadarSignals)
      .set(values(signal))
      .where(eq(globalRadarSignals.id, signal.id));

    await expect(adminRepository.getSignalDetail(signal.id)).rejects.toThrow(
      "Invalid stored Global Radar score provenance: score_input_mismatch.",
    );
  });

  it("rejects one-second precursor horizon-anchor drift on overview", async () => {
    const signal = await persistReadProvenanceFixture(
      "precursor-horizon-anchor-drift",
      "demand_precursor",
    );
    if (signal.effectiveFrom === null) {
      throw new Error("Precursor score-input drift fixture has no horizon anchor.");
    }
    await db
      .update(globalRadarSignals)
      .set({
        effectiveFrom: new Date(signal.effectiveFrom.getTime() + 1_000),
      })
      .where(eq(globalRadarSignals.id, signal.id));

    await expect(
      adminRepository.getOverviewMetrics({ now: readAt }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "score_provenance_invalid",
    });
  });

  it("rejects one-second direct expiry-anchor drift on overview", async () => {
    const signal = await persistReadProvenanceFixture(
      "direct-expiry-anchor-drift",
      "direct_demand",
    );
    if (signal.expiresAt === null) {
      throw new Error("Direct score-input drift fixture has no expiry anchor.");
    }
    await db
      .update(globalRadarSignals)
      .set({ expiresAt: new Date(signal.expiresAt.getTime() + 1_000) })
      .where(eq(globalRadarSignals.id, signal.id));

    await expect(
      adminRepository.getOverviewMetrics({ now: readAt }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "score_provenance_invalid",
    });
  });

  it("rejects a malformed direct freshness-evidence anchor on overview", async () => {
    const signal = await persistReadProvenanceFixture(
      "direct-malformed-freshness-anchor",
      "direct_demand",
    );
    const snapshot = structuredClone(
      signal.scoreEvidenceSnapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    const freshnessAssociation = snapshot.componentEvidence.find(
      ({ component }) => component === "freshness",
    );
    const freshnessEvidence = freshnessAssociation?.evidence[0];
    if (!freshnessAssociation || !freshnessEvidence) {
      throw new Error("Direct freshness-anchor fixture has no evidence citation.");
    }
    freshnessAssociation.evidence[0] = {
      ...freshnessEvidence,
      matchedFieldPaths: ["signal.announcedAt", "signal.effectiveFrom"],
    };
    await db
      .update(globalRadarSignals)
      .set({ scoreEvidenceSnapshot: snapshot })
      .where(eq(globalRadarSignals.id, signal.id));

    await expect(
      adminRepository.getOverviewMetrics({ now: readAt }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "score_provenance_invalid",
    });
  });

  it("rejects unilateral momentum taxonomy drift", async () => {
    const signal = await persistReadProvenanceFixture(
      "momentum-taxonomy-drift",
      "ecosystem_momentum",
    );
    await db
      .update(globalRadarSignals)
      .set({ demandDomain: `${signal.demandDomain}-tampered` })
      .where(eq(globalRadarSignals.id, signal.id));

    await expect(
      adminRepository.listSignals({
        signalClass: "ecosystem_momentum",
        filters: { page: 1 },
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "score_provenance_invalid",
    });
  });

  it("rejects unilateral momentum corporate-group mapping drift", async () => {
    const signal = await persistReadProvenanceFixture(
      "momentum-corporate-group-drift",
      "ecosystem_momentum",
    );
    const [contributor] = await db
      .select({
        id: globalEntities.id,
        canonicalCorporateGroupId: globalEntities.canonicalCorporateGroupId,
      })
      .from(globalRadarSignalEntities)
      .innerJoin(
        globalEntities,
        eq(globalRadarSignalEntities.globalEntityId, globalEntities.id),
      )
      .where(eq(globalRadarSignalEntities.signalId, signal.id))
      .limit(1);
    if (!contributor) {
      throw new Error("Momentum corporate-group drift fixture has no contributor.");
    }
    await db
      .update(globalEntities)
      .set({
        canonicalCorporateGroupId:
          contributor.canonicalCorporateGroupId === contributor.id
            ? null
            : contributor.id,
      })
      .where(eq(globalEntities.id, contributor.id));

    await expect(
      adminRepository.listSignals({
        signalClass: "ecosystem_momentum",
        filters: { page: 1 },
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "score_provenance_invalid",
    });
  });

  it.each([
    {
      component: "demandExplicitness",
      column: "demandExplicitness",
      scoreKey: "explicitness",
    },
    {
      component: "evidenceConfidence",
      column: "evidenceConfidence",
      scoreKey: "evidenceConfidence",
    },
    { component: "freshness", column: "freshness", scoreKey: "freshness" },
    { component: "indiaFit", column: "indiaFit", scoreKey: "indiaFit" },
    {
      component: "responseAccessibility",
      column: "responseAccessibility",
      scoreKey: "responseAccessibility",
    },
  ] as const)(
    "rejects coordinated direct $component row, aggregate, and snapshot tampering",
    async ({ component, column, scoreKey }) => {
      const signal = await persistReadProvenanceFixture(
        `coordinated-direct-${component.toLowerCase()}`,
        "direct_demand",
      );
      const components = {
        explicitness: signal.demandExplicitness,
        evidenceConfidence: signal.evidenceConfidence,
        freshness: signal.freshness,
        actionability: signal.actionability,
        indiaFit: signal.indiaFit,
        commercialPotential: signal.commercialPotential,
        repeatability: signal.repeatability,
        responseAccessibility: signal.responseAccessibility,
        strategicLearning: signal.strategicLearning,
        complianceComplexity: signal.complianceComplexity,
      };
      const tampered = differentScore(components[scoreKey]);
      components[scoreKey] = tampered;
      const recomputed = scoreDirectDemand(components);
      if (!recomputed.valid) throw new Error("Direct tamper did not rescore.");
      const snapshot = structuredClone(
        signal.scoreEvidenceSnapshot,
      ) as unknown as MutableActiveScoreEvidenceSnapshot;
      const association = snapshot.componentEvidence.find(
        (item) => item.component === component,
      );
      if (!association) throw new Error("Direct score association is missing.");
      association.value = tampered;
      await db
        .update(globalRadarSignals)
        .set({
          [column]: tampered,
          directDemandScore: recomputed.score,
          scoreCoverage: recomputed.scoreCoverage,
          momentumQualificationGatesPassed: null,
          scoreEvidenceSnapshot: snapshot,
        })
        .where(eq(globalRadarSignals.id, signal.id));

      await expect(
        adminRepository.listSignals({
          signalClass: "direct_demand",
          filters: { page: 1 },
        }),
      ).resolves.toEqual({
        outcome: "conflict",
        reason: "score_provenance_invalid",
      });
    },
  );

  it.each([
    { component: "evidenceConfidence", column: "evidenceConfidence" },
    { component: "indiaFit", column: "indiaFit" },
    {
      component: "estimatedTimeHorizon",
      column: "estimatedTimeHorizon",
    },
  ] as const)(
    "rejects coordinated precursor $component row, aggregate, and snapshot tampering",
    async ({ component, column }) => {
      const signal = await persistReadProvenanceFixture(
        `coordinated-precursor-${component}`,
        "demand_precursor",
      );
      const components = {
        evidenceConfidence: signal.evidenceConfidence,
        proximityToExternalDemand: signal.proximityToExternalDemand,
        fundingDeploymentMomentum: signal.fundingDeploymentMomentum,
        likelyDataHardwareIntensity: signal.likelyDataHardwareIntensity,
        indiaFit: signal.indiaFit,
        estimatedTimeHorizon: signal.estimatedTimeHorizon,
        strategicRelevance: signal.strategicRelevance,
      };
      const tampered = differentScore(components[component]);
      components[component] = tampered;
      const recomputed = scoreDemandPrecursor(components);
      if (!recomputed.valid) throw new Error("Precursor tamper did not rescore.");
      const snapshot = structuredClone(
        signal.scoreEvidenceSnapshot,
      ) as unknown as MutableActiveScoreEvidenceSnapshot;
      const association = snapshot.componentEvidence.find(
        (item) => item.component === component,
      );
      if (!association) {
        throw new Error("Precursor score association is missing.");
      }
      association.value = tampered;
      await db
        .update(globalRadarSignals)
        .set({
          [column]: tampered,
          precursorScore: recomputed.score,
          scoreCoverage: recomputed.scoreCoverage,
          scoreEvidenceSnapshot: snapshot,
        })
        .where(eq(globalRadarSignals.id, signal.id));

      await expect(
        adminRepository.listSignals({
          signalClass: "demand_precursor",
          filters: { page: 1 },
        }),
      ).resolves.toEqual({
        outcome: "conflict",
        reason: "score_provenance_invalid",
      });
    },
  );

  it.each([
    {
      component: "independentEntityCount",
      column: "momentumIndependentEntityCount",
      componentColumn: null,
    },
    {
      component: "volume7Days",
      column: "momentumVolume7Days",
      componentColumn: null,
    },
    {
      component: "independentEntityBreadth",
      column: "momentumIndependentEntityBreadth",
      componentColumn: "independentEntityBreadth",
    },
  ] as const)(
    "rejects coordinated momentum $component row, aggregate, and snapshot tampering",
    async ({ component, column, componentColumn }) => {
      const signal = await persistReadProvenanceFixture(
        `coordinated-momentum-${component}`,
        "ecosystem_momentum",
      );
      const current = signal[column];
      const tampered = differentScore(
        typeof current === "number" ? current : null,
      );
      const scoreComponents = {
        independentEntityBreadth: signal.momentumIndependentEntityBreadth,
        primarySourceDepth: signal.momentumPrimarySourceDepth,
        sourceDiversity: signal.momentumSourceDiversity,
        weightedVolume: signal.momentumWeightedVolume,
        growthVsPreceding: signal.momentumGrowthVsPreviousPeriod,
        taxonomyConsistency: signal.momentumTaxonomyConsistency,
        evidenceQuality: signal.momentumEvidenceQuality,
      };
      if (componentColumn !== null) scoreComponents[componentColumn] = tampered;
      const recomputed = scoreEcosystemMomentum(scoreComponents);
      if (!recomputed.valid) throw new Error("Momentum tamper did not rescore.");
      const snapshot = structuredClone(
        signal.scoreEvidenceSnapshot,
      ) as unknown as MutableActiveScoreEvidenceSnapshot;
      const association = snapshot.componentEvidence.find(
        (item) => item.component === component,
      );
      if (!association) {
        throw new Error("Momentum score association is missing.");
      }
      association.value = tampered;
      await db
        .update(globalRadarSignals)
        .set({
          [column]: tampered,
          momentumScore: recomputed.score,
          scoreCoverage: recomputed.scoreCoverage,
          scoreEvidenceSnapshot: snapshot,
        })
        .where(eq(globalRadarSignals.id, signal.id));

      await expect(
        adminRepository.listSignals({
          signalClass: "ecosystem_momentum",
          filters: { page: 1 },
        }),
      ).resolves.toEqual({
        outcome: "conflict",
        reason: "score_provenance_invalid",
      });
    },
  );
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
  const directWorkerScorePaths = [
    "scoreComponents.actionability",
    "scoreComponents.commercialPotential",
    "scoreComponents.repeatability",
    "scoreComponents.strategicLearning",
    "scoreComponents.complianceComplexity",
  ];
  const precursorWorkerScorePaths = [
    "scoreComponents.proximityToExternalDemand",
    "scoreComponents.fundingDeploymentMomentum",
    "scoreComponents.likelyDataHardwareIntensity",
    "scoreComponents.strategicRelevance",
  ];
  const momentumWorkerScorePaths = [
    "momentumMetrics.taxonomyConsistency",
    "momentumMetrics.evidenceQuality",
  ];

  async function persistedDirect(
    suffix: string,
    prepareBatch?: (batch: PersistableGlobalRadarBatch) => void,
  ) {
    const now = new Date("2026-07-30T13:00:00.000Z");
    await repository.queueRun(queueInput(`admin-review-${suffix}`, { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Admin review fixture was not claimed.");
    let batch = validPersistenceBatch(claim.run.id, {
      externalSignalId: `admin-review-${suffix}`,
      sourceUrl: `https://review-${suffix}.example/request`,
      stableIdentifierValue: `admin-review-${suffix}`,
      websiteUrl: `https://review-${suffix}.example`,
      linkedinOrganizationUrl: null,
    });
    if (prepareBatch) {
      prepareBatch(batch);
      batch = rehashPersistenceBatch(batch);
    }
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
    const [signal] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.firstRunId, claim.run.id));
    if (!signal) throw new Error("Admin review signal was not persisted.");
    return signal;
  }

  async function persistedMomentum(
    suffix: string,
    prepareBatch?: (batch: PersistableGlobalRadarBatch) => void,
  ) {
    const now = new Date("2026-07-30T13:00:00.000Z");
    await repository.queueRun(queueInput(`admin-review-${suffix}`, { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") {
      throw new Error("Admin momentum fixture was not claimed.");
    }
    let batch = validMomentumPersistenceBatch(claim.run.id);
    if (prepareBatch) {
      prepareBatch(batch);
      batch = rehashPersistenceBatch(batch);
    }
    const completed = await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
      ),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    if (completed.outcome !== "completed") {
      throw new Error("Admin momentum fixture failed.");
    }
    const [signal] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.firstRunId, claim.run.id));
    if (!signal) throw new Error("Admin momentum signal was not persisted.");
    return signal;
  }

  async function persistedPrecursor(suffix: string) {
    const now = new Date("2026-07-30T13:00:00.000Z");
    await repository.queueRun(
      queueInput(`admin-precursor-${suffix}`, { now }),
    );
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") {
      throw new Error("Admin precursor fixture was not claimed.");
    }
    const batch = validPrecursorPersistenceBatch(claim.run.id);
    const completed = await repository.completeRun({
      ...completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
      ),
      submissionHash: batch.canonicalSubmissionHash,
      batch,
    });
    if (completed.outcome !== "completed") {
      throw new Error("Admin precursor fixture failed.");
    }
    const [signal] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.firstRunId, claim.run.id));
    if (!signal) throw new Error("Admin precursor signal was not persisted.");
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

  function adminService(now = "2026-07-30T14:00:00.000Z") {
    return createGlobalRadarAdminService({
      repository: adminRepository,
      adminEmails: [userEmail],
      now: () => new Date(now),
      queueManualRun: async () => ({ outcome: "invalid" }),
      promote: async () => ({ outcome: "invalid" }),
      reversePromotion: async () => ({ outcome: "invalid" }),
    });
  }

  function serviceEnvelope(expectedRevision: number, suffix: string) {
    const { now: _now, ...value } = envelope(expectedRevision, suffix);
    void _now;
    return value;
  }

  function expectedAdministratorEvidence(paths: readonly string[]) {
    return paths.map((path) =>
      expect.objectContaining({
        component: path.split(".")[1],
        basis:
          path === "scoreComponents.actionability"
            ? "server_adjusted"
            : "administrator_assessed",
        ...(path === "scoreComponents.actionability"
          ? { assessmentBasis: "administrator_assessed", inputValue: 80 }
          : {}),
        evidence: expect.arrayContaining([
          expect.objectContaining({
            matchedFieldPaths: expect.arrayContaining([path]),
          }),
        ]),
      }),
    );
  }

  async function signalWriteSnapshot(signalId: string) {
    const [signal, updates, events, promotions] = await Promise.all([
      db
        .select()
        .from(globalRadarSignals)
        .where(eq(globalRadarSignals.id, signalId))
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(globalSignalUpdates)
        .where(eq(globalSignalUpdates.signalId, signalId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(globalRadarAdminEvents)
        .where(eq(globalRadarAdminEvents.targetId, signalId)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(globalRadarPromotions),
    ]);
    return {
      signal: signal[0],
      updates: updates[0]?.count ?? 0,
      events: events[0]?.count ?? 0,
      promotions: promotions[0]?.count ?? 0,
    };
  }

  async function setConsistentFixtureStatus(
    signalId: string,
    status: (typeof globalRadarSignals.$inferSelect)["status"],
    revision?: number,
  ) {
    await rebaseGlobalRadarFixtureSignal(signalId, {
      status,
      ...(revision === undefined ? {} : { revision }),
    });
  }

  it("qualifies safe entity states with optimistic idempotent audit semantics", async () => {
    const signal = await persistedDirect("entity-qualification");
    if (!signal.globalEntityId) {
      throw new Error("Entity qualification fixture has no primary entity.");
    }
    const service = adminService();
    await expect(
      adminRepository.reviewSignal({
        signalId: signal.id,
        actor,
        envelope: envelope(signal.revision, "938"),
        command: { type: "request_review" },
      }),
    ).resolves.toMatchObject({ outcome: "updated" });
    await expect(
      adminRepository.reviewSignal({
        signalId: signal.id,
        actor,
        envelope: envelope(signal.revision + 1, "939"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "updated" });
    await expect(adminRepository.getSignalDetail(signal.id)).resolves.toMatchObject({
      outcome: "found",
      detail: {
        signal: { status: "qualified" },
        allowedActions: expect.arrayContaining([
          "qualify_entity",
          "promote",
        ]),
      },
    });
    const input = {
      entityId: signal.globalEntityId,
      ...serviceEnvelope(0, "940"),
      reason: "Two independent primary sources support exceptional relevance.",
    };

    await expect(
      service.qualifyEntity(actor, signal.globalEntityId, input),
    ).resolves.toMatchObject({
      outcome: "updated",
      entity: {
        id: signal.globalEntityId,
        entityStatus: "qualified",
        revision: 1,
      },
    });
    const detailAfterQualification = await adminRepository.getSignalDetail(
      signal.id,
    );
    expect(detailAfterQualification).toMatchObject({
      outcome: "found",
      detail: {
        organisation: { entityStatus: "qualified", revision: 1 },
        allowedActions: expect.arrayContaining(["promote"]),
      },
    });
    if (detailAfterQualification.outcome !== "found") {
      throw new Error("Qualified entity detail was not found.");
    }
    expect(detailAfterQualification.detail.allowedActions).not.toContain(
      "qualify_entity",
    );
    await expect(
      service.qualifyEntity(actor, signal.globalEntityId, input),
    ).resolves.toMatchObject({
      outcome: "replayed",
      entity: { entityStatus: "qualified", revision: 1 },
    });
    await expect(
      service.qualifyEntity(actor, signal.globalEntityId, {
        ...input,
        reason: "Changed request must not reuse an idempotency key.",
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "idempotency_mismatch",
      entity: { entityStatus: "qualified", revision: 1 },
    });
    await expect(
      service.qualifyEntity(actor, signal.globalEntityId, {
        ...input,
        idempotencyKey: "00000000-0000-4000-8000-000000000941",
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "revision_mismatch",
      entity: { entityStatus: "qualified", revision: 1 },
    });

    const events = await db
      .select()
      .from(globalRadarAdminEvents)
      .where(eq(globalRadarAdminEvents.targetId, signal.globalEntityId));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actorType: "administrator",
      actorEmail: userEmail,
      targetType: "entity",
      targetId: signal.globalEntityId,
      action: "entity_qualified",
      reason: input.reason,
      beforeSafeState: {
        entityStatus: "observed",
        revision: 0,
      },
      afterSafeState: {
        entityStatus: "qualified",
        revision: 1,
        requestFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(JSON.stringify(events)).not.toContain("rawMetadata");

    const archivedSignal = await persistedDirect(
      "entity-qualification-archived",
    );
    if (!archivedSignal.globalEntityId) {
      throw new Error("Archived entity fixture has no primary entity.");
    }
    await db
      .update(globalEntities)
      .set({ entityStatus: "archived" })
      .where(eq(globalEntities.id, archivedSignal.globalEntityId));
    const [archivedEntity] = await db
      .select()
      .from(globalEntities)
      .where(eq(globalEntities.id, archivedSignal.globalEntityId));
    if (!archivedEntity) {
      throw new Error("Archived entity fixture was not persisted.");
    }
    const [eventCountBeforeRejectedTransition] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(globalRadarAdminEvents)
      .where(eq(globalRadarAdminEvents.targetId, archivedSignal.globalEntityId));
    await expect(
      service.qualifyEntity(actor, archivedSignal.globalEntityId, {
        entityId: archivedSignal.globalEntityId,
        ...serviceEnvelope(archivedEntity.revision, "942"),
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "transition_not_allowed",
      entity: {
        entityStatus: "archived",
        revision: archivedEntity.revision,
      },
    });
    const [archivedEventCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(globalRadarAdminEvents)
      .where(eq(globalRadarAdminEvents.targetId, archivedSignal.globalEntityId));
    expect(archivedEventCount?.count).toBe(
      eventCountBeforeRejectedTransition?.count,
    );
  });

  it("rejects an ordinary status review when stored score provenance is semantically invalid", async () => {
    const signal = await persistedDirect("status-provenance-rollback");
    const tamperedSnapshot = structuredClone(
      signal.scoreEvidenceSnapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    const [association] = tamperedSnapshot.componentEvidence;
    if (!association) {
      throw new Error("Status review provenance fixture has no association.");
    }
    association.rationale = "Tampered stored score rationale.";
    await db
      .update(globalRadarSignals)
      .set({ scoreEvidenceSnapshot: tamperedSnapshot })
      .where(eq(globalRadarSignals.id, signal.id));
    const before = await signalWriteSnapshot(signal.id);

    await expect(
      adminRepository.reviewSignal({
        signalId: signal.id,
        actor,
        envelope: envelope(signal.revision, "9490"),
        command: { type: "monitor" },
      }),
    ).rejects.toThrow(
      "Invalid stored Global Radar score provenance: citation_semantics_mismatch.",
    );
    expect(await signalWriteSnapshot(signal.id)).toEqual(before);
  });

  it("rejects an expiry edit when stored score provenance is semantically invalid", async () => {
    const signal = await persistedDirect("expiry-provenance-rollback");
    const tamperedSnapshot = structuredClone(
      signal.scoreEvidenceSnapshot,
    ) as unknown as MutableActiveScoreEvidenceSnapshot;
    const [association] = tamperedSnapshot.componentEvidence;
    if (!association) {
      throw new Error("Expiry provenance fixture has no association.");
    }
    association.rationale = "Tampered stored score rationale.";
    await db
      .update(globalRadarSignals)
      .set({ scoreEvidenceSnapshot: tamperedSnapshot })
      .where(eq(globalRadarSignals.id, signal.id));
    const before = await signalWriteSnapshot(signal.id);

    await expect(
      adminRepository.editDirectDemandExpiry({
        signalId: signal.id,
        actor,
        envelope: envelope(signal.revision, "9491"),
        expiry: {
          evergreen: false,
          expiresAt: "2026-09-30T00:00:00.000Z",
          reobserveBy: null,
        },
      }),
    ).rejects.toThrow(
      "Invalid stored Global Radar score provenance: citation_semantics_mismatch.",
    );
    expect(await signalWriteSnapshot(signal.id)).toEqual(before);
  });

  it("rejects unsupported direct score inputs before classification writes", async () => {
    const signal = await persistedDirect("direct-score-provenance");
    await rebaseGlobalRadarFixtureSignal(signal.id, { status: "monitoring" });
    const before = await signalWriteSnapshot(signal.id);

    await expect(
      adminService().editClassification(actor, signal.id, {
        ...serviceEnvelope(0, "901"),
        classification: {
          signalClass: "direct_demand",
          signalType: "procurement",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            actionability: 80,
            commercialPotential: 75,
            repeatability: 70,
            strategicLearning: 70,
            complianceComplexity: 20,
          },
          activity: {
            evergreen: false,
            expiresAt: "2026-09-30T00:00:00.000Z",
            reobserveBy: null,
          },
        },
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "classification_requirements_not_met",
      httpStatus: 409,
    });
    expect(await signalWriteSnapshot(signal.id)).toEqual(before);
  });

  it("rejects direct reclassification without exact subtype evidence", async () => {
    const signal = await persistedDirect("direct-subtype-provenance", (batch) => {
      const evidence = batch.signals[0]!.evidence[0]!;
      evidence.supportedFieldPaths = [
        ...new Set([
          ...evidence.supportedFieldPaths,
          ...directWorkerScorePaths,
          "signal.announcedAt",
          "signal.effectiveFrom",
          "indiaRelevance.explicit_India.collection",
          "responsePath",
        ]),
      ];
    });
    await rebaseGlobalRadarFixtureSignal(signal.id, { status: "monitoring" });
    const before = await signalWriteSnapshot(signal.id);

    await expect(
      adminService().editClassification(actor, signal.id, {
        ...serviceEnvelope(0, "9011"),
        classification: {
          signalClass: "direct_demand",
          signalType: "procurement",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            actionability: 80,
            commercialPotential: 75,
            repeatability: 70,
            strategicLearning: 70,
            complianceComplexity: 20,
          },
          activity: {
            evergreen: false,
            expiresAt: "2026-09-30T00:00:00.000Z",
            reobserveBy: null,
          },
        },
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "classification_requirements_not_met",
      httpStatus: 409,
    });
    expect(await signalWriteSnapshot(signal.id)).toEqual(before);
  });

  it("persists a below-threshold precursor score without auto-qualification", async () => {
    const signal = await persistedDirect("precursor-score-provenance", (batch) => {
      const direct = batch.signals[0];
      if (!direct || direct.signalClass !== "direct_demand") {
        throw new Error("Direct provenance fixture was not classified.");
      }
      direct.evidence[0]!.supportedFieldPaths = [
        ...new Set([
          ...direct.evidence[0]!.supportedFieldPaths,
          ...precursorWorkerScorePaths,
          "precursorDevelopment.funding",
          "signal.effectiveFrom",
        ]),
      ];
    });
    await rebaseGlobalRadarFixtureSignal(signal.id, { status: "monitoring" });
    const service = adminService();

    await expect(
      service.editClassification(actor, signal.id, {
        ...serviceEnvelope(0, "902"),
        classification: {
          signalClass: "demand_precursor",
          signalType: "funding",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            proximityToExternalDemand: 0,
            fundingDeploymentMomentum: 0,
            likelyDataHardwareIntensity: 0,
            strategicRelevance: 0,
          },
        },
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      detail: {
        signalClass: "demand_precursor",
        status: "monitoring",
        revision: 1,
      },
    });
    const [stored] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    expect(stored).toMatchObject({
      signalClass: "demand_precursor",
      status: "monitoring",
      directDemandScore: null,
      precursorScore: 35,
      revision: 1,
    });
  });

  it("rejects precursor reclassification without exact subtype evidence", async () => {
    const signal = await persistedDirect(
      "precursor-subtype-provenance",
      (batch) => {
        batch.signals[0]!.evidence[0]!.supportedFieldPaths.push(
          ...precursorWorkerScorePaths,
          "signal.effectiveFrom",
        );
        batch.signals[0]!.evidence[0]!.claim +=
          " Apply at https://acme.example/suppliers.";
      },
    );
    await rebaseGlobalRadarFixtureSignal(signal.id, { status: "monitoring" });
    const before = await signalWriteSnapshot(signal.id);

    await expect(
      adminService().editClassification(actor, signal.id, {
        ...serviceEnvelope(0, "9021"),
        classification: {
          signalClass: "demand_precursor",
          signalType: "funding",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            proximityToExternalDemand: 70,
            fundingDeploymentMomentum: 80,
            likelyDataHardwareIntensity: 70,
            strategicRelevance: 75,
          },
        },
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "classification_requirements_not_met",
      httpStatus: 409,
    });
    expect(await signalWriteSnapshot(signal.id)).toEqual(before);
  });

  it("rejects reclassification when a merged alias retains the target dedupe key", async () => {
    const signal = await persistedDirect(
      "classification-merged-alias-collision",
      (batch) => {
        batch.signals[0]!.evidence[0]!.supportedFieldPaths.push(
          ...precursorWorkerScorePaths,
          "precursorDevelopment.funding",
          "signal.effectiveFrom",
        );
        batch.signals[0]!.evidence[0]!.claim +=
          " Apply at https://acme.example/suppliers.";
      },
    );
    if (!signal.globalEntityId) {
      throw new Error("Classification alias fixture has no primary entity.");
    }
    await rebaseGlobalRadarFixtureSignal(signal.id, { status: "monitoring" });
    const [entityRow, requirements, evidenceRows] = await Promise.all([
      db
        .select({ publicIdentityAnchor: globalEntities.publicIdentityAnchor })
        .from(globalEntities)
        .where(eq(globalEntities.id, signal.globalEntityId))
        .limit(1),
      db
        .select({ fingerprint: globalSignalRequirements.requirementFingerprint })
        .from(globalSignalRequirements)
        .where(eq(globalSignalRequirements.signalId, signal.id)),
      db
        .select({
          canonicalSourceUrl: globalSignalEvidence.canonicalSourceUrl,
          isPrimarySource: globalSignalEvidence.isPrimarySource,
          isSyndicated: globalSignalEvidence.isSyndicated,
        })
        .from(globalSignalEvidence)
        .where(eq(globalSignalEvidence.signalId, signal.id)),
    ]);
    const publicIdentityAnchor = entityRow[0]?.publicIdentityAnchor;
    if (!publicIdentityAnchor) {
      throw new Error("Classification alias fixture has no identity anchor.");
    }
    const targetDedupeKey = createGlobalRadarSignalDedupeKeyFromIdentityAnchors(
      {
        signalClass: "demand_precursor",
        primaryEntityRef: signal.globalEntityId,
        associatedEntities: [],
        demandDomain: "robot_learning_and_manipulation",
        signalType: "funding",
        theme: signal.theme,
        requirements,
        announcedAt: signal.announcedAt?.toISOString() ?? null,
        observedAt: signal.observedAt.toISOString(),
        targetGeographies: signal.targetGeographies,
        evidence: evidenceRows,
      },
      new Map([[signal.globalEntityId, publicIdentityAnchor]]),
    );
    const aliasId = randomUUID();
    await db.insert(globalRadarSignals).values({
      ...signal,
      id: aliasId,
      dedupeKey: targetDedupeKey,
      mergedIntoSignalId: signal.id,
      status: "monitoring",
    });
    const before = await signalWriteSnapshot(signal.id);

    await expect(
      adminService().editClassification(actor, signal.id, {
        ...serviceEnvelope(0, "9022"),
        classification: {
          signalClass: "demand_precursor",
          signalType: "funding",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            proximityToExternalDemand: 70,
            fundingDeploymentMomentum: 80,
            likelyDataHardwareIntensity: 70,
            strategicRelevance: 75,
          },
        },
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "duplicate_signal",
      httpStatus: 409,
    });
    expect(await signalWriteSnapshot(signal.id)).toEqual(before);
    await expect(
      db
        .select({
          dedupeKey: globalRadarSignals.dedupeKey,
          mergedIntoSignalId: globalRadarSignals.mergedIntoSignalId,
          revision: globalRadarSignals.revision,
        })
        .from(globalRadarSignals)
        .where(eq(globalRadarSignals.id, aliasId)),
    ).resolves.toEqual([
      {
        dedupeKey: targetDedupeKey,
        mergedIntoSignalId: signal.id,
        revision: signal.revision,
      },
    ]);
  });

  it.each(["syndicated", "unrelated"] as const)(
    "rejects momentum assessments supported only by %s evidence before classification writes",
    async (ineligibleKind) => {
    const signal = await persistedMomentum(
      `momentum-score-provenance-${ineligibleKind}`,
    );
    await rebaseGlobalRadarFixtureSignal(signal.id, { status: "monitoring" });
    const evidenceRows = await db
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, signal.id));
    for (const evidence of evidenceRows) {
      await db
        .update(globalSignalEvidence)
        .set({
          supportedFieldPaths: evidence.supportedFieldPaths.filter(
            (path) => path !== "momentumMetrics.evidenceQuality",
          ),
        })
        .where(eq(globalSignalEvidence.id, evidence.id));
    }
    const carrier =
      evidenceRows.find(({ isSyndicated }) => isSyndicated) ?? evidenceRows[0];
    if (!carrier) throw new Error("Momentum metric carrier was not persisted.");
    let carrierEntityId = carrier.globalEntityId;
    if (ineligibleKind === "unrelated") {
      const [entity] = await db.select().from(globalEntities).limit(1);
      if (!entity) throw new Error("Momentum entity fixture was not persisted.");
      carrierEntityId = randomUUID();
      await db.insert(globalEntities).values({
        ...entity,
        id: carrierEntityId,
        canonicalName: "Unrelated Metric Carrier",
        normalizedName: "unrelated metric carrier",
        canonicalDomain: "unrelated-metric-carrier.example",
        websiteUrl: "https://unrelated-metric-carrier.example",
        linkedinUrl: null,
        stablePublicIdentifiers: [
          "official_registry:unrelated-metric-carrier",
        ],
        publicIdentityAnchor: plainSha256("unrelated-metric-carrier"),
        canonicalCorporateGroupId: "group:unrelated-metric-carrier",
      });
    }
    await db
      .update(globalSignalEvidence)
      .set({
        globalEntityId: carrierEntityId,
        isSyndicated: ineligibleKind === "syndicated",
        supportedFieldPaths: [
          ...carrier.supportedFieldPaths.filter(
            (path) => path !== "momentumMetrics.evidenceQuality",
          ),
          "momentumMetrics.evidenceQuality",
        ],
      })
      .where(eq(globalSignalEvidence.id, carrier.id));
    const before = await signalWriteSnapshot(signal.id);

    await expect(
      adminService("2026-07-31T16:00:00.000Z").editClassification(
        actor,
        signal.id,
        {
          ...serviceEnvelope(0, "904"),
          classification: {
            signalClass: "ecosystem_momentum",
            signalType: "ecosystem_direction",
            demandDomain: "robot_learning_and_manipulation",
            assessments: {
              taxonomyConsistency: 85,
              evidenceQuality: 80,
            },
          },
        },
      ),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "classification_requirements_not_met",
      httpStatus: 409,
    });
    expect(await signalWriteSnapshot(signal.id)).toEqual(before);
  });

  it("enforces allowed transitions, derives qualification, and preserves promoted no-India-fit status", async () => {
    const signal = await persistedDirect("transitions");
    const initialScoreInputDigest =
      signal.scoreEvidenceSnapshot.scoreInputDigest;
    const originalActionabilityEvidence = signal.scoreEvidenceSnapshot.componentEvidence.find(
      ({ component }) => component === "actionability",
    );
    const review = await adminRepository.reviewSignal({
      signalId: signal.id,
      actor,
      envelope: envelope(0, "1"),
      command: { type: "request_review" },
    });
    expect(review).toMatchObject({ outcome: "updated", detail: { signal: { status: "needs_review", revision: 1 } } });
    const [reviewedSignal] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    expect(reviewedSignal?.scoreEvidenceSnapshot.scoreInputDigest).not.toBe(
      initialScoreInputDigest,
    );
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
    const [monitoredSignal] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    expect(monitoredSignal?.scoreEvidenceSnapshot.scoreInputDigest).not.toBe(
      reviewedSignal?.scoreEvidenceSnapshot.scoreInputDigest,
    );
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

    await setConsistentFixtureStatus(signal.id, "promoted", 10);
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
    const [storedNoFit] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    if (!storedNoFit) throw new Error("No-India-fit signal was not stored.");
    expect(storedNoFit).toMatchObject({
      indiaRelevanceRationale:
        "An administrator reviewed the public evidence and marked this signal as having no current India fit.",
      indiaFitReasons: [
        "No current India fit was confirmed in the administrator review.",
      ],
      indiaFitConstraints: [],
      indiaFitUnknowns: [
        "India fit may change if new public evidence is added.",
      ],
      indiaFitConfidence: 100,
      indiaRegulatoryFacts: null,
      indiaLogisticsFacts: null,
      indiaFit: 0,
    });
    expect(storedNoFit.directDemandScore).not.toBe(signal.directDemandScore);
    const noFitSnapshot = parseActiveScoreEvidenceSnapshot(
      storedNoFit.scoreEvidenceSnapshot,
      {
        signalClass: "direct_demand",
        signalType: storedNoFit.signalType,
        indiaRelevanceType: storedNoFit.indiaRelevanceType,
        scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
        momentumPolicyVersion: null,
        components: storedScoreComponents(storedNoFit),
      },
    );
    expect(noFitSnapshot).not.toBeNull();
    expect(noFitSnapshot?.assessmentAuthority).toBe(
      signal.scoreEvidenceSnapshot.assessmentAuthority,
    );
    expect(
      noFitSnapshot?.componentEvidence.find(
        ({ component }) => component === "indiaFit",
      ),
    ).toMatchObject({ value: 0, basis: "server_derived" });
    expect(
      noFitSnapshot?.componentEvidence.find(
        ({ component }) => component === "actionability",
      ),
    ).toEqual(originalActionabilityEvidence);
    const forbidden = await adminRepository.reviewSignal({
      signalId: signal.id,
      actor,
      envelope: envelope(11, "7"),
      command: { type: "dismiss" },
    });
    expect(forbidden).toMatchObject({ outcome: "conflict", reason: "transition_not_allowed" });
  });

  it("rebases a momentum no-India-fit header without changing its score provenance", async () => {
    const signal = await persistedMomentum("momentum-no-india-fit");
    await setConsistentFixtureStatus(signal.id, "promoted");
    const originalComponents = structuredClone(
      signal.scoreEvidenceSnapshot.componentEvidence,
    );

    await expect(
      adminRepository.reviewSignal({
        signalId: signal.id,
        actor,
        envelope: envelope(0, "610"),
        command: { type: "mark_no_india_fit" },
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      detail: {
        signal: {
          signalClass: "ecosystem_momentum",
          status: "promoted",
          indiaRelevanceType: "no_current_India_fit",
          revision: 1,
        },
      },
    });

    const [stored] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    if (!stored) throw new Error("Momentum no-fit signal was not stored.");
    expect(stored).toMatchObject({
      momentumScore: signal.momentumScore,
      indiaRelevanceRationale:
        "An administrator reviewed the public evidence and marked this signal as having no current India fit.",
      indiaFitReasons: [
        "No current India fit was confirmed in the administrator review.",
      ],
      indiaFitConstraints: [],
      indiaFitUnknowns: [
        "India fit may change if new public evidence is added.",
      ],
      indiaFitConfidence: 100,
      indiaRegulatoryFacts: null,
      indiaLogisticsFacts: null,
    });
    expect(stored.scoreEvidenceSnapshot).toMatchObject({
      signalType: stored.signalType,
      indiaRelevanceType: "no_current_India_fit",
    });
    expect(stored.scoreEvidenceSnapshot.componentEvidence).toEqual(
      originalComponents,
    );
    await expect(adminRepository.getSignalDetail(signal.id)).resolves.toMatchObject({
      outcome: "found",
      detail: {
        signal: {
          signalClass: "ecosystem_momentum",
          indiaRelevanceType: "no_current_India_fit",
        },
      },
    });
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
    const originalDirectExplicitness = direct.demandExplicitness;
    await setConsistentFixtureStatus(direct.id, "needs_review");
    await db
      .update(globalRadarSignals)
      .set({ demandExplicitness: 74 })
      .where(eq(globalRadarSignals.id, direct.id));
    const directBeforeRejectedQualification = await signalWriteSnapshot(
      direct.id,
    );
    await expect(
      adminRepository.reviewSignal({
        signalId: direct.id,
        actor,
        envelope: envelope(0, "21"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "qualification_requirements_not_met" });
    expect(await signalWriteSnapshot(direct.id)).toEqual(
      directBeforeRejectedQualification,
    );
    await db
      .update(globalRadarSignals)
      .set({ demandExplicitness: originalDirectExplicitness })
      .where(eq(globalRadarSignals.id, direct.id));
    await expect(
      adminRepository.reviewSignal({
        signalId: direct.id,
        actor,
        envelope: envelope(0, "22"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "updated" });

    const precursor = await persistedPrecursor("qualification");
    const originalPrecursorConfidence = precursor.evidenceConfidence;
    await setConsistentFixtureStatus(precursor.id, "needs_review");
    await db
      .update(globalRadarSignals)
      .set({ evidenceConfidence: 59 })
      .where(eq(globalRadarSignals.id, precursor.id));
    await expect(
      adminRepository.reviewSignal({
        signalId: precursor.id,
        actor,
        envelope: envelope(0, "24"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "qualification_requirements_not_met" });
    await db
      .update(globalRadarSignals)
      .set({ evidenceConfidence: originalPrecursorConfidence })
      .where(eq(globalRadarSignals.id, precursor.id));
    await expect(
      adminRepository.reviewSignal({
        signalId: precursor.id,
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
    const originalMomentumEvidenceQuality = momentum.momentumEvidenceQuality;
    const originalMomentumScore = momentum.momentumScore;
    await setConsistentFixtureStatus(momentum.id, "needs_review");
    await db
      .update(globalRadarSignals)
      .set({
        momentumScore: 70,
        momentumEvidenceQuality: 59,
      })
      .where(eq(globalRadarSignals.id, momentum.id));
    await expect(
      adminRepository.reviewSignal({
        signalId: momentum.id,
        actor,
        envelope: envelope(0, "26", "2026-07-31T16:00:00.000Z"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "qualification_requirements_not_met" });
    await db
      .update(globalRadarSignals)
      .set({
        momentumEvidenceQuality: originalMomentumEvidenceQuality,
        momentumScore: originalMomentumScore,
      })
      .where(eq(globalRadarSignals.id, momentum.id));
    const [syndicatedEvidence] = await db
      .select()
      .from(globalSignalEvidence)
      .where(
        and(
          eq(globalSignalEvidence.signalId, momentum.id),
          eq(globalSignalEvidence.isSyndicated, true),
        ),
      );
    if (!syndicatedEvidence) {
      throw new Error("Momentum qualification evidence fixture is missing.");
    }
    const { id: _syndicatedEvidenceId, ...appendedEvidence } =
      syndicatedEvidence;
    void _syndicatedEvidenceId;
    const appendedEvidenceUrl =
      "https://gamma-robotics.example/momentum-observation";
    await db.insert(globalSignalEvidence).values({
      ...appendedEvidence,
      ingestOrdinal: await nextGlobalRadarEvidenceIngestOrdinal(momentum.id),
      sourceUrl: appendedEvidenceUrl,
      canonicalSourceUrl: appendedEvidenceUrl,
      sourceName: "Gamma Robotics",
      sourceFamily: "official_company_material",
      evidenceClaim:
        "Gamma published an original robot-learning activity update.",
      sourceExcerpt: "Gamma expanded its robot-learning data programme.",
      englishSummary: "Gamma published new robot-learning data activity.",
      evidenceFingerprint: createEvidenceFingerprint({
        sourceUrl: appendedEvidenceUrl,
        canonicalSourceUrl: appendedEvidenceUrl,
        isPrimarySource: appendedEvidence.isPrimarySource,
      }),
      isSyndicated: false,
      observedAt: new Date("2026-07-31T15:00:00.000Z"),
      publishedAt: new Date("2026-07-31T15:00:00.000Z"),
      createdAt: new Date("2026-07-31T15:00:00.000Z"),
    });
    await expect(
      repository.recomputeMomentum({
        now: new Date("2026-07-31T16:00:00.000Z"),
        policy: MOMENTUM_POLICY,
      }),
    ).resolves.toEqual({
      outcome: "completed",
      recomputed: 1,
      unchanged: 0,
    });
    await expect(
      adminRepository.reviewSignal({
        signalId: momentum.id,
        actor,
        envelope: envelope(1, "27", "2026-07-31T16:00:00.000Z"),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({ outcome: "updated" });
    const [qualifiedMomentum] = await db
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, momentum.id));
    if (!qualifiedMomentum) {
      throw new Error("Qualified momentum signal was not stored.");
    }
    const qualifiedMomentumSnapshot = parseActiveScoreEvidenceSnapshot(
      qualifiedMomentum.scoreEvidenceSnapshot,
      {
        signalClass: "ecosystem_momentum",
        signalType: qualifiedMomentum.signalType,
        indiaRelevanceType: qualifiedMomentum.indiaRelevanceType,
        scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
        momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
        components: storedScoreComponents(qualifiedMomentum),
      },
    );
    expect(qualifiedMomentumSnapshot?.assessmentAuthority).toBe(
      momentum.scoreEvidenceSnapshot.assessmentAuthority,
    );
    for (const component of ["taxonomyConsistency", "evidenceQuality"] as const) {
      expect(
        qualifiedMomentumSnapshot?.componentEvidence.find(
          (association) => association.component === component,
        ),
      ).toEqual(
        momentum.scoreEvidenceSnapshot.componentEvidence.find(
          (association) => association.component === component,
        ),
      );
    }
  });

  it("does not qualify momentum from future-dated contributor evidence", async () => {
    const signal = await persistedMomentum("future-evidence-qualification");
    await setConsistentFixtureStatus(signal.id, "needs_review");
    await db
      .update(globalSignalEvidence)
      .set({
        observedAt: new Date("2026-08-01T00:00:00.000Z"),
        publishedAt: new Date("2026-08-01T00:00:00.000Z"),
      })
      .where(eq(globalSignalEvidence.signalId, signal.id));
    const before = await signalWriteSnapshot(signal.id);

    await expect(
      adminRepository.reviewSignal({
        signalId: signal.id,
        actor,
        envelope: envelope(
          signal.revision,
          "28",
          "2026-07-30T15:00:00.000Z",
        ),
        command: { type: "qualify" },
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "qualification_requirements_not_met",
    });
    expect(await signalWriteSnapshot(signal.id)).toEqual(before);
  });

  it("edits direct expiry and cross-class classification without stale class fields", async () => {
    const signal = await persistedDirect("edits", (batch) => {
      batch.signals[0]!.evidence[0]!.supportedFieldPaths.push(
        ...precursorWorkerScorePaths,
        "directDemandAsk.procurement",
        "precursorDevelopment.funding",
        "signal.effectiveFrom",
      );
      batch.signals[0]!.evidence[0]!.claim +=
        " Apply at https://acme.example/suppliers.";
    });
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
    await rebaseGlobalRadarFixtureSignal(signal.id, { status: "monitoring" });
    const classification = await adminService().editClassification(
      actor,
      signal.id,
      {
        ...serviceEnvelope(1, "32"),
        classification: {
          signalClass: "demand_precursor",
          signalType: "funding",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            proximityToExternalDemand: 70,
            fundingDeploymentMomentum: 80,
            likelyDataHardwareIntensity: 70,
            strategicRelevance: 75,
          },
        },
      },
    );
    expect(classification).toMatchObject({
      outcome: "updated",
      detail: {
        signalClass: "demand_precursor",
        status: "monitoring",
        revision: 2,
        sections: expect.arrayContaining([
          expect.objectContaining({
            id: "score_rationale",
            data: expect.objectContaining({
              componentEvidence: expect.arrayContaining(
                expectedAdministratorEvidence(precursorWorkerScorePaths),
              ),
            }),
          }),
        ]),
      },
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

    const restoredDirect = await adminService().editClassification(
      actor,
      signal.id,
      {
        ...serviceEnvelope(2, "33"),
        classification: {
          signalClass: "direct_demand",
          signalType: "procurement",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            actionability: 80,
            commercialPotential: 75,
            repeatability: 70,
            strategicLearning: 70,
            complianceComplexity: 20,
          },
          activity: {
            evergreen: false,
            expiresAt: "2026-09-30T00:00:00.000Z",
            reobserveBy: null,
          },
        },
      },
    );
    expect(restoredDirect).toMatchObject({
      outcome: "updated",
      detail: {
        signalClass: "direct_demand",
        revision: 3,
        sections: expect.arrayContaining([
          expect.objectContaining({
            id: "score_rationale",
            data: expect.objectContaining({
              componentEvidence: expect.arrayContaining(
                expectedAdministratorEvidence(directWorkerScorePaths),
              ),
            }),
          }),
        ]),
      },
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

    await expect(
      adminRepository.editSignalClassification({
        signalId: signal.id,
        actor,
        envelope: envelope(3, "331"),
        classification: {
          signalClass: "direct_demand",
          signalType: "procurement",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            actionability: 80,
            commercialPotential: 75,
            repeatability: 70,
            strategicLearning: 70,
            complianceComplexity: 20,
          },
          activity: {
            evergreen: false,
            expiresAt: "2026-07-28T00:00:00.000Z",
            reobserveBy: null,
          },
        },
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "classification_requirements_not_met",
    });

    await rebaseGlobalRadarFixtureSignal(signal.id, { status: "qualified" });
    await expect(
      adminRepository.editSignalClassification({
        signalId: signal.id,
        actor,
        envelope: envelope(3, "34"),
        classification: {
          signalClass: "demand_precursor",
          signalType: "funding",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            proximityToExternalDemand: 70,
            fundingDeploymentMomentum: 80,
            likelyDataHardwareIntensity: 70,
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
    let batch = validMomentumPersistenceBatch(claim.run.id);
    batch.signals[0]!.evidence[0]!.supportedFieldPaths.push(
      ...precursorWorkerScorePaths,
      "precursorDevelopment.funding",
      "signal.effectiveFrom",
      "indiaRelevance.inferred_India_compatible.requirement_access",
    );
    batch.signals[0]!.evidence[0]!.claim +=
      " Applications are open to suppliers worldwide.";
    batch = rehashPersistenceBatch(batch);
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
    await rebaseGlobalRadarFixtureSignal(momentum.id, {
      status: "monitoring",
    });

    const service = adminService("2026-07-31T16:00:00.000Z");
    await expect(
      service.editClassification(actor, momentum.id, {
        ...serviceEnvelope(0, "35"),
        classification: {
          signalClass: "demand_precursor",
          primaryEntityId: contributor.globalEntityId,
          signalType: "funding",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            proximityToExternalDemand: 70,
            fundingDeploymentMomentum: 80,
            likelyDataHardwareIntensity: 70,
            strategicRelevance: 75,
          },
        },
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      detail: {
        signalClass: "demand_precursor",
        revision: 1,
        sections: expect.arrayContaining([
          expect.objectContaining({
            id: "score_rationale",
            data: expect.objectContaining({
              componentEvidence: expect.arrayContaining(
                expectedAdministratorEvidence(precursorWorkerScorePaths),
              ),
            }),
          }),
        ]),
      },
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
      service.editClassification(actor, momentum.id, {
        ...serviceEnvelope(1, "36"),
        classification: {
          signalClass: "ecosystem_momentum",
          signalType: "ecosystem_direction",
          demandDomain: "robot_learning_and_manipulation",
          assessments: {
            taxonomyConsistency: 85,
            evidenceQuality: 80,
          },
        },
      }),
    ).resolves.toMatchObject({
      outcome: "updated",
      detail: {
        signalClass: "ecosystem_momentum",
        revision: 2,
        sections: expect.arrayContaining([
          expect.objectContaining({
            id: "score_rationale",
            data: expect.objectContaining({
              componentEvidence: expect.arrayContaining(
                expectedAdministratorEvidence(momentumWorkerScorePaths),
              ),
            }),
          }),
        ]),
      },
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
      await rebaseGlobalRadarFixtureSignal(momentum.id, { status });
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
            assessments: {
              proximityToExternalDemand: 70,
              fundingDeploymentMomentum: 80,
              likelyDataHardwareIntensity: 70,
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
      linkedinUrl: null,
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
    const scoreEvidenceSnapshotBefore = JSON.stringify(
      signal.scoreEvidenceSnapshot,
    );
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
    expect(
      rows
        .map(({ ingestOrdinal }) => ingestOrdinal)
        .sort((left, right) => left - right),
    ).toEqual([1, 2]);
    const appended = rows.find(({ runId }) => runId === null);
    expect(appended).toMatchObject({
      ingestOrdinal: 2,
      runId: null,
      canonicalSourceUrl: "https://admin-evidence.example/public-update",
      observedAt: new Date("2026-07-30T16:00:00.000Z"),
      rawMetadata: {},
    });
    expect(JSON.stringify(appended)).not.toContain("clientControlled");
    const [signalAfterAppend] = await db
      .select({ scoreEvidenceSnapshot: globalRadarSignals.scoreEvidenceSnapshot })
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, signal.id));
    expect(JSON.stringify(signalAfterAppend?.scoreEvidenceSnapshot)).toBe(
      scoreEvidenceSnapshotBefore,
    );
    await expect(
      adminRepository.listSignals({
        signalClass: "direct_demand",
        filters: { page: 1 },
      }),
    ).resolves.toMatchObject({ outcome: "listed", total: 1 });
  });

  it("serializes concurrent evidence appends so one revision winner receives the next ordinal", async () => {
    const signal = await fixture();
    const results = await Promise.all([
      adminRepository.appendEvidence({
        signalId: signal.id,
        actor,
        envelope: envelope(0, "210"),
        evidence: evidence("https://admin-evidence.example/concurrent-a"),
      }),
      adminRepository.appendEvidence({
        signalId: signal.id,
        actor,
        envelope: envelope(0, "211"),
        evidence: evidence("https://admin-evidence.example/concurrent-b"),
      }),
    ]);
    expect(results.filter(({ outcome }) => outcome === "appended")).toHaveLength(
      1,
    );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ outcome: "appended", revision: 1 }),
        expect.objectContaining({
          outcome: "conflict",
          reason: "revision_mismatch",
        }),
      ]),
    );
    const rows = await db
      .select({ ingestOrdinal: globalSignalEvidence.ingestOrdinal })
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, signal.id))
      .orderBy(asc(globalSignalEvidence.ingestOrdinal));
    expect(rows.map(({ ingestOrdinal }) => ingestOrdinal)).toEqual([1, 2]);
    await expect(
      adminRepository.listSignals({
        signalClass: "direct_demand",
        filters: { page: 1 },
      }),
    ).resolves.toMatchObject({ outcome: "listed", total: 1 });
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

  it("rejects sensitive administrator reasons and note bodies without writes", async () => {
    const signal = await fixture();
    const updatesBefore = await db.select().from(globalSignalUpdates);
    const eventsBefore = await db.select().from(globalRadarAdminEvents);

    await expect(
      adminRepository.appendNote({
        signalId: signal.id,
        actor,
        envelope: {
          ...envelope(0, "301"),
          reason: "Authorization: Bearer private-administrator-token",
        },
        body: "Public administrator note.",
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      adminRepository.appendNote({
        signalId: signal.id,
        actor,
        envelope: envelope(0, "302"),
        body: "request_payload={private}",
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });

    expect(await db.select().from(globalSignalUpdates)).toEqual(updatesBefore);
    expect(await db.select().from(globalRadarAdminEvents)).toEqual(eventsBefore);
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

  it.each([
    { tamperedSide: "survivor", idempotencySuffix: "405" },
    { tamperedSide: "duplicate", idempotencySuffix: "406" },
  ] as const)(
    "fails closed without writing when the $tamperedSide score provenance is corrupt",
    async ({ tamperedSide, idempotencySuffix }) => {
      const { survivor, duplicateId } = await mergeFixture();
      const signalIds = [survivor.id, duplicateId];
      const tamperedSignalId =
        tamperedSide === "survivor" ? survivor.id : duplicateId;

      await db
        .update(globalRadarSignals)
        .set({ directDemandScore: 99 })
        .where(eq(globalRadarSignals.id, tamperedSignalId));

      async function readMergeMutationRows() {
        return {
          signals: await db
            .select()
            .from(globalRadarSignals)
            .where(inArray(globalRadarSignals.id, signalIds))
            .orderBy(globalRadarSignals.id),
          updates: await db
            .select()
            .from(globalSignalUpdates)
            .where(inArray(globalSignalUpdates.signalId, signalIds))
            .orderBy(globalSignalUpdates.id),
          adminEvents: await db
            .select()
            .from(globalRadarAdminEvents)
            .where(inArray(globalRadarAdminEvents.targetId, signalIds))
            .orderBy(globalRadarAdminEvents.id),
        };
      }

      const before = JSON.stringify(await readMergeMutationRows());
      await expect(
        adminRepository.mergeSignals(
          input(survivor.id, duplicateId, idempotencySuffix),
        ),
      ).resolves.toMatchObject({
        outcome: "conflict",
        reason: "classification_requirements_not_met",
      });
      const after = JSON.stringify(await readMergeMutationRows());

      expect(after).toBe(before);
    },
  );

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

  it("keeps both historical dedupe identities attached to the survivor after a real merge", async () => {
    async function persistObservation(input: {
      suffix: string;
      claimedAt: string;
      observedAt: string;
      sourceUrl: string;
    }) {
      const claimedAt = new Date(input.claimedAt);
      await repository.queueRun(queueInput(input.suffix, { now: claimedAt }));
      const claim = await repository.claimRun({ now: claimedAt });
      if (claim.outcome !== "claimed") {
        throw new Error(`Rediscovery fixture ${input.suffix} was not claimed.`);
      }
      const batch = validPersistenceBatch(claim.run.id, {
        observedAt: input.observedAt,
        sourceUrl: input.sourceUrl,
        externalSignalId: `signal-${input.suffix}`,
      });
      const completed = await repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(claimedAt.getTime() + 60_000),
        ),
        submissionHash: batch.canonicalSubmissionHash,
        batch,
      });
      expect(completed).toMatchObject({ outcome: "completed" });
      return { batch, claim, completed };
    }

    const survivorSource = "https://acme.example/public-request";
    const duplicateSource = "https://acme.example/duplicate-public-request";
    const first = await persistObservation({
      suffix: "merge-alias-survivor",
      claimedAt: "2026-07-30T16:00:00.000Z",
      observedAt: "2026-07-30T16:00:30.000Z",
      sourceUrl: survivorSource,
    });
    const second = await persistObservation({
      suffix: "merge-alias-duplicate",
      claimedAt: "2026-07-30T16:10:00.000Z",
      observedAt: "2026-07-30T16:10:30.000Z",
      sourceUrl: duplicateSource,
    });
    const initialSignals = await db
      .select()
      .from(globalRadarSignals);
    expect(initialSignals).toHaveLength(2);
    const survivor = initialSignals.find(
      ({ dedupeKey }) => dedupeKey === first.batch.signals[0]!.dedupeKey,
    );
    const duplicate = initialSignals.find(
      ({ dedupeKey }) => dedupeKey === second.batch.signals[0]!.dedupeKey,
    );
    if (!survivor || !duplicate) {
      throw new Error("Real merge alias fixture signals were not persisted.");
    }
    expect(survivor.id).not.toBe(duplicate.id);

    await expect(
      adminRepository.mergeSignals(input(survivor.id, duplicate.id, "403")),
    ).resolves.toMatchObject({
      outcome: "merged",
      survivor: { signal: { id: survivor.id, revision: 1 } },
      duplicate: {
        signal: {
          id: duplicate.id,
          mergedIntoSignalId: survivor.id,
          revision: 1,
        },
      },
    });

    const originalGraphIds = async (signalId: string) => {
      const [requirements, evidence, updates] = await Promise.all([
        db
          .select({ id: globalSignalRequirements.id })
          .from(globalSignalRequirements)
          .where(eq(globalSignalRequirements.signalId, signalId)),
        db
          .select({ id: globalSignalEvidence.id })
          .from(globalSignalEvidence)
          .where(eq(globalSignalEvidence.signalId, signalId)),
        db
          .select({ id: globalSignalUpdates.id })
          .from(globalSignalUpdates)
          .where(eq(globalSignalUpdates.signalId, signalId)),
      ]);
      return {
        requirements: requirements.map(({ id }) => id),
        evidence: evidence.map(({ id }) => id),
        updates: updates.map(({ id }) => id),
      };
    };
    const survivorGraph = await originalGraphIds(survivor.id);
    const duplicateGraph = await originalGraphIds(duplicate.id);

    const rediscoveredSurvivor = await persistObservation({
      suffix: "merge-alias-survivor-rediscovered",
      claimedAt: "2026-08-01T16:00:00.000Z",
      observedAt: "2026-08-01T16:00:30.000Z",
      sourceUrl: survivorSource,
    });
    const rediscoveredDuplicate = await persistObservation({
      suffix: "merge-alias-duplicate-rediscovered",
      claimedAt: "2026-08-02T16:00:00.000Z",
      observedAt: "2026-08-02T16:00:30.000Z",
      sourceUrl: duplicateSource,
    });
    expect(rediscoveredSurvivor.completed).toMatchObject({
      run: { numberUpdated: 1, numberNew: 0 },
    });
    expect(rediscoveredDuplicate.completed).toMatchObject({
      run: { numberUpdated: 1, numberNew: 0 },
    });

    const finalSignals = await db
      .select()
      .from(globalRadarSignals);
    expect(finalSignals).toHaveLength(2);
    expect(finalSignals.find(({ id }) => id === survivor.id)).toMatchObject({
      dedupeKey: first.batch.signals[0]!.dedupeKey,
      mergedIntoSignalId: null,
      mostRecentRunId: rediscoveredDuplicate.claim.run.id,
      lastSeenAt: new Date("2026-08-02T16:00:30.000Z"),
      revision: 1,
    });
    expect(finalSignals.find(({ id }) => id === duplicate.id)).toMatchObject({
      dedupeKey: second.batch.signals[0]!.dedupeKey,
      mergedIntoSignalId: survivor.id,
      mostRecentRunId: second.claim.run.id,
      lastSeenAt: new Date("2026-07-30T16:10:30.000Z"),
      revision: 1,
    });

    const finalSurvivorGraph = await originalGraphIds(survivor.id);
    const finalDuplicateGraph = await originalGraphIds(duplicate.id);
    for (const [graphName, ids] of Object.entries(survivorGraph)) {
      expect(finalSurvivorGraph[graphName as keyof typeof survivorGraph]).toEqual(
        expect.arrayContaining(ids),
      );
    }
    expect(finalDuplicateGraph).toEqual(duplicateGraph);
  });

  it("fails closed when a corrupted merge alias chain contains a cycle", async () => {
    const { survivor, duplicateId } = await mergeFixture();
    await expect(
      adminRepository.mergeSignals(input(survivor.id, duplicateId, "404")),
    ).resolves.toMatchObject({ outcome: "merged" });
    await db
      .update(globalRadarSignals)
      .set({ mergedIntoSignalId: duplicateId })
      .where(eq(globalRadarSignals.id, survivor.id));
    const before = await graphRowCounts();

    const now = new Date("2026-08-01T18:00:00.000Z");
    await repository.queueRun(queueInput("merge-alias-cycle", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") {
      throw new Error("Corrupt merge alias fixture was not claimed.");
    }
    const batch = validPersistenceBatch(claim.run.id, {
      observedAt: "2026-08-01T18:00:30.000Z",
    });
    await expect(
      repository.completeRun({
        ...completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 60_000),
        ),
        submissionHash: batch.canonicalSubmissionHash,
        batch,
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "invalid_input",
    });
    expect(await graphRowCounts()).toEqual(before);
    expect(await db.select().from(globalRadarSignals)).toHaveLength(2);
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
