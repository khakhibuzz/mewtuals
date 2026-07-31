import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { drizzle } from "drizzle-orm/postgres-js";
import { asc, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
  createActiveScoreEvidenceSnapshot,
  createGlobalRadarMomentumPolicy,
  deriveEcosystemMomentum,
  deriveGlobalRadarReclassification,
  type ActiveScoreEvidenceSnapshot,
  type CandidateEvidence,
  type IndiaRelevanceType,
  type ScoreEvidenceSource,
} from "../app/domain/global-radar";
import { createGlobalRadarAdminService } from "../app/server/global-radar/admin-service";
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
import { createGlobalRadarAdminRepository } from "../db/repositories/global-radar-admin-repository";
import { createGlobalRadarPromotionRepository } from "../db/repositories/global-radar-promotion-repository";
import {
  createActiveScoreEvaluationMetadata,
  createStoredGlobalRadarScoreInputDigest,
  type ActiveScoreEvaluationMetadata,
} from "../db/repositories/global-radar-score-evidence";
import { validateStoredGlobalRadarScoreProvenanceSelection } from "../db/repositories/global-radar-stored-score-provenance";
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
  primaryClass?:
    | "direct_demand"
    | "demand_precursor"
    | "ecosystem_momentum";
  primaryIndiaRelevance?:
    | "explicit_India"
    | "existing_India_presence"
    | "globally_open"
    | "no_current_India_fit";
  primaryEvidenceSupportsIndia?: boolean;
  primaryEvidenceSupportedFieldPaths?: readonly string[];
  primaryEvidenceClaim?: string;
  primarySourceUrls?: readonly string[];
  primarySyndicatedSourceIndexes?: readonly number[];
  primaryTargetEntitySourceIndexes?: readonly number[];
  repeatedSignalCount?: number;
  nonIndiaCompatibleSignalIndexes?: readonly number[];
}>;

const promotionDirectScoringInput = {
  explicitness: 90,
  evidenceConfidence: 90,
  freshness: 90,
  actionability: 90,
  indiaFit: 90,
  commercialPotential: 90,
  repeatability: 80,
  responseAccessibility: 80,
  strategicLearning: 80,
  complianceComplexity: 20,
} as const;

const promotionPrecursorScoringInput = {
  evidenceConfidence: 90,
  proximityToExternalDemand: 80,
  fundingDeploymentMomentum: 80,
  likelyDataHardwareIntensity: 80,
  indiaFit: 90,
  estimatedTimeHorizon: 80,
  strategicRelevance: 80,
} as const;

const promotionMomentumScoringInput = {
  independentEntityBreadth: 80,
  primarySourceDepth: 80,
  sourceDiversity: 80,
  weightedVolume: 80,
  growthVsPreceding: 80,
  taxonomyConsistency: 85,
  evidenceQuality: 90,
} as const;

const promotionSensitiveDataAndCompliance = {
  sensitiveDataFlags: {
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
  },
  complianceFacts: {
    consent: null,
    deIdentification: null,
    legalReview: null,
    knownResidencyRequirements: null,
    participantRightsComplexity: null,
  },
} as const;

function promotionScoreEvidenceSnapshot(
  signalClass: "direct_demand" | "demand_precursor" | "ecosystem_momentum",
  signalType: string,
  indiaRelevanceType: IndiaRelevanceType,
  components: Readonly<Record<string, number | null>>,
  actionabilityInput: number | null,
  evidence: readonly ScoreEvidenceSource[],
  evaluationMetadata: ActiveScoreEvaluationMetadata,
  scoreInputDigest: string,
): ActiveScoreEvidenceSnapshot {
  return createActiveScoreEvidenceSnapshot({
    ...evaluationMetadata,
    scoreInputDigest,
    signalClass,
    signalType,
    indiaRelevanceType,
    scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
    momentumPolicyVersion:
      signalClass === "ecosystem_momentum"
        ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
        : null,
    assessmentAuthority: "worker",
    actionabilityInput,
    momentumContributorEntityIds:
      signalClass === "ecosystem_momentum"
        ? evidence.flatMap(({ contributorEntityId }) =>
            contributorEntityId === null ? [] : [contributorEntityId],
          )
        : undefined,
    freshnessEvidencePath:
      signalClass === "direct_demand" ? "signal.announcedAt" : undefined,
    components,
    evidence,
  });
}

function defaultIndiaEvidencePath(
  signalClass: "direct_demand" | "demand_precursor" | "ecosystem_momentum",
  indiaRelevanceType: IndiaRelevanceType,
): string {
  if (
    indiaRelevanceType === "globally_open" ||
    indiaRelevanceType === "inferred_India_compatible"
  ) {
    return `indiaRelevance.${indiaRelevanceType}.requirement_access`;
  }
  if (indiaRelevanceType === "no_current_India_fit") {
    return "indiaRelevance.no_current_India_fit.requirement_access";
  }
  const fact = signalClass === "direct_demand" ? "collection" : "manufacturing";
  return `indiaRelevance.${indiaRelevanceType}.${fact}`;
}

function promotionEvidenceSupportedFieldPaths(input: Readonly<{
  signalClass: "direct_demand" | "demand_precursor" | "ecosystem_momentum";
  signalType: string;
  indiaRelevanceType: IndiaRelevanceType;
  additionalPaths?: readonly string[];
}>): string[] {
  const classPaths =
    input.signalClass === "direct_demand"
      ? [
          `directDemandAsk.${input.signalType}`,
          "signal.announcedAt",
          "responsePath",
          "scoreComponents.actionability",
          "scoreComponents.commercialPotential",
          "scoreComponents.repeatability",
          "scoreComponents.strategicLearning",
          "scoreComponents.complianceComplexity",
        ]
      : input.signalClass === "demand_precursor"
        ? [
            `precursorDevelopment.${input.signalType}`,
            "signal.effectiveFrom",
            "scoreComponents.proximityToExternalDemand",
            "scoreComponents.fundingDeploymentMomentum",
            "scoreComponents.likelyDataHardwareIntensity",
            "scoreComponents.strategicRelevance",
          ]
        : [
            "momentumMetrics.taxonomyConsistency",
            "momentumMetrics.evidenceQuality",
          ];
  return [
    ...new Set([
      ...classPaths,
      defaultIndiaEvidencePath(
        input.signalClass,
        input.indiaRelevanceType,
      ),
      ...(input.additionalPaths ?? []),
    ]),
  ].sort();
}

function promotionEvidenceClaim(
  supportedFieldPaths: readonly string[],
): string {
  const facts = [
    "The organisation published a qualified robotics requirement",
  ];
  if (
    supportedFieldPaths.some((path) =>
      path.includes("existing_India_presence.manufacturing"),
    )
  ) facts.push("it operates manufacturing facilities in India");
  if (
    supportedFieldPaths.some((path) =>
      path.includes("India_expansion.manufacturing"),
    )
  ) facts.push("it is expanding manufacturing operations into India");
  if (
    supportedFieldPaths.some((path) => path.includes("explicit_India.suppliers"))
  ) facts.push("it is seeking suppliers in India");
  if (
    supportedFieldPaths.some((path) => path.includes("explicit_India.collection"))
  ) facts.push("it will collect robotics data in India");
  if (
    supportedFieldPaths.some((path) =>
      path.includes("explicit_India.manufacturing"),
    )
  ) facts.push("it operates manufacturing programs in India");
  if (
    supportedFieldPaths.some(
      (path) =>
        path.includes("globally_open.requirement_access") ||
        path.includes("inferred_India_compatible.requirement_access"),
    )
  ) facts.push("applications are open to qualified organisations worldwide");
  return `${facts.join("; ")}.`;
}

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
  let secondMomentumContributor: typeof entity | null = null;
  if (primaryClass === "ecosystem_momentum") {
    const { id: _entityId, ...secondContributorValues } = entity;
    void _entityId;
    [secondMomentumContributor] = await db
      .insert(globalEntities)
      .values({
        ...secondContributorValues,
        canonicalName: `Promotion Contributor ${sequence}`,
        normalizedName: `promotion contributor ${sequence}`,
        canonicalDomain: `promotion-contributor-${sequence}.example`,
        websiteUrl: `https://promotion-contributor-${sequence}.example`,
        linkedinUrl: null,
        stablePublicIdentifiers: [`fixture-contributor:${suffix}`],
        publicIdentityAnchor: hash(`entity-contributor:${suffix}`),
      })
      .returning();
    if (!secondMomentumContributor) {
      throw new Error("Second momentum contributor was not created.");
    }
  }
  const signalCount = Math.max(1, options.repeatedSignalCount ?? 1);
  const signals: Array<typeof globalRadarSignals.$inferSelect> = [];
  const snapshotInputBySignalId = new Map<
    string,
    Readonly<{
      signalClass: "direct_demand" | "demand_precursor" | "ecosystem_momentum";
      signalType: string;
      indiaRelevanceType: IndiaRelevanceType;
      components: Readonly<Record<string, number | null>>;
      actionabilityInput: number | null;
      evidence: readonly ScoreEvidenceSource[];
      evaluationMetadata: ActiveScoreEvaluationMetadata;
      scoreAsOf: Date;
    }>
  >();
  for (let index = 0; index < signalCount; index += 1) {
    const signalClass = index === 0 ? primaryClass : "demand_precursor";
    const signalType =
      signalClass === "direct_demand"
        ? "data_collection_request"
        : signalClass === "demand_precursor"
          ? "funding"
          : "ecosystem_acceleration";
    const indiaRelevanceType =
      options.nonIndiaCompatibleSignalIndexes?.includes(index)
        ? "no_current_India_fit"
        : index === 0
        ? (options.primaryIndiaRelevance ?? "explicit_India")
        : "inferred_India_compatible";
    const observedAt = new Date(now.getTime() - index * 24 * 60 * 60 * 1_000);
    const sourceUrls =
      index === 0 && options.primarySourceUrls
        ? options.primarySourceUrls
        : signalClass === "ecosystem_momentum"
          ? [
              `https://source-${sequence}-${index}.example/public-requirement`,
              `https://source-${sequence}-${index}-peer.example/public-research`,
              `https://source-${sequence}-${index}-peer.example/public-jobs`,
            ]
          : [`https://source-${sequence}-${index}.example/public-requirement`];
    const supportedFieldPaths = promotionEvidenceSupportedFieldPaths({
      signalClass,
      signalType,
      indiaRelevanceType,
      additionalPaths:
        index === 0
          ? options.primaryEvidenceSupportedFieldPaths
          : undefined,
    });
    const evidenceClaim =
      index === 0 && options.primaryEvidenceClaim !== undefined
        ? options.primaryEvidenceClaim
        : promotionEvidenceClaim(supportedFieldPaths);
    const evidenceSources = sourceUrls.map((sourceUrl, sourceIndex) => {
      const contributorEntityId =
        signalClass === "ecosystem_momentum" &&
        sourceIndex > 0 &&
        !options.primaryTargetEntitySourceIndexes?.includes(sourceIndex)
          ? secondMomentumContributor?.id
          : entity.id;
      if (!contributorEntityId) {
        throw new Error("Momentum evidence contributor is missing.");
      }
      return {
        id:
          index === 0
            ? hash(`evidence:${suffix}:${sourceIndex}`)
            : hash(`evidence:${suffix}:signal-${index}:${sourceIndex}`),
        sourceUrl,
        sourceName: `Official source ${sourceIndex + 1}`,
        evidenceClaim,
        contributorEntityId,
        evidenceConfidence: 90,
        publishedAt: new Date(
          observedAt.getTime() - 24 * 60 * 60 * 1_000,
        ).toISOString(),
        observedAt: observedAt.toISOString(),
        isPrimarySource: true,
        isSyndicated:
          index === 0 &&
          options.primarySyndicatedSourceIndexes?.includes(sourceIndex) === true,
        sourceFamily:
          signalClass !== "ecosystem_momentum" || sourceIndex === 0
            ? "official_company_material"
            : sourceIndex === 1
              ? "official_research"
              : "official_jobs",
        supportedFieldPaths,
      };
    }) satisfies readonly ScoreEvidenceSource[];
    const evaluationEvidence = evidenceSources.map((source, sourceIndex) => ({
      ingestOrdinal: sourceIndex + 1,
      evidenceFingerprint: source.id,
      globalEntityId: source.contributorEntityId,
      sourceUrl: source.sourceUrl,
      canonicalSourceUrl: source.sourceUrl,
      sourceName: source.sourceName,
      sourceType: "official_request",
      sourceLanguage: "en",
      sourceCountry: "United States",
      sourceFamily: source.sourceFamily,
      evidenceClaim: source.evidenceClaim,
      sourceExcerpt: "Seeking qualified robotics execution partners.",
      englishSummary:
        "The source documents a current robotics requirement and public response path.",
      publishedAt:
        source.publishedAt === null ? null : new Date(source.publishedAt),
      observedAt: new Date(source.observedAt),
      evidenceConfidence: source.evidenceConfidence,
      translationConfidence: null,
      isPrimarySource: source.isPrimarySource,
      isSyndicated: source.isSyndicated,
      supportsDirectDemand: signalClass === "direct_demand",
      supportsIndiaRelevance:
        index === 0
          ? (options.primaryEvidenceSupportsIndia ?? true)
          : true,
      supportedFieldPaths: [...source.supportedFieldPaths],
    }));
    const evaluationMetadata = createActiveScoreEvaluationMetadata({
      scoreAsOf: observedAt,
      evidence: evaluationEvidence,
    });
    const announcedAt = signalClass === "direct_demand" ? observedAt : null;
    const effectiveFrom =
      signalClass === "direct_demand"
        ? observedAt
        : signalClass === "demand_precursor"
          ? new Date(now.getTime() + 60 * 24 * 60 * 60 * 1_000)
          : null;
    const expiresAt =
      signalClass === "direct_demand"
        ? new Date("2026-12-31T00:00:00.000Z")
        : null;
    const candidateEvidence = evaluationEvidence.map(
      (source): CandidateEvidence => ({
        sourceUrl: source.sourceUrl,
        canonicalSourceUrl: source.canonicalSourceUrl,
        sourceKind: "original",
        sourceLanguage: source.sourceLanguage,
        originalText: source.evidenceClaim,
        englishSummary: source.englishSummary,
        publishedAt: source.publishedAt?.toISOString() ?? null,
        observedAt: source.observedAt.toISOString(),
        evidenceConfidence: source.evidenceConfidence,
        translationConfidence: source.translationConfidence,
        isPrimarySource: source.isPrimarySource,
        isOfficialProcurementSource: false,
        supportsDirectDemand: source.supportsDirectDemand,
        isSyndicated: source.isSyndicated,
        organizationId:
          source.globalEntityId ?? source.evidenceFingerprint,
        corporateGroupId:
          source.globalEntityId === null
            ? source.evidenceFingerprint
            : `group:${source.globalEntityId}`,
        supportedFieldPaths: source.supportedFieldPaths,
      }),
    );
    let scoreColumnValues: Pick<
      typeof globalRadarSignals.$inferInsert,
      "scoreCoverage"
    > &
      Partial<typeof globalRadarSignals.$inferInsert>;
    let snapshotComponents: Readonly<Record<string, number | null>>;
    let snapshotActionabilityInput: number | null = null;
    if (signalClass === "direct_demand") {
      const derived = deriveGlobalRadarReclassification({
        signalClass,
        signalType,
        currentStatus: "qualified",
        indiaRelevanceType,
        announcedAt: announcedAt?.toISOString() ?? null,
        effectiveFrom: effectiveFrom?.toISOString() ?? null,
        observedAt: observedAt.toISOString(),
        expiresAt: expiresAt?.toISOString() ?? null,
        responsePath: null,
        sensitiveDataAndCompliance: promotionSensitiveDataAndCompliance,
        assessments: {
          actionability: promotionDirectScoringInput.actionability,
          commercialPotential:
            promotionDirectScoringInput.commercialPotential,
          repeatability: promotionDirectScoringInput.repeatability,
          strategicLearning: promotionDirectScoringInput.strategicLearning,
          complianceComplexity:
            promotionDirectScoringInput.complianceComplexity,
        },
        evidence: candidateEvidence,
        now: observedAt,
      });
      if (!derived.valid) {
        throw new Error(
          `Direct promotion fixture did not derive: ${derived.reason}.`,
        );
      }
      if (derived.signalClass !== "direct_demand") {
        throw new Error("Direct promotion fixture derived the wrong class.");
      }
      const components = derived.score.components;
      scoreColumnValues = {
        demandExplicitness: components.explicitness,
        evidenceConfidence: components.evidenceConfidence,
        freshness: components.freshness,
        actionability: components.actionability,
        indiaFit: components.indiaFit,
        commercialPotential: components.commercialPotential,
        repeatability: components.repeatability,
        responseAccessibility: components.responseAccessibility,
        strategicLearning: components.strategicLearning,
        complianceComplexity: components.complianceComplexity,
        directDemandScore: derived.score.score,
        scoreCoverage: derived.score.scoreCoverage,
      };
      snapshotComponents = {
        demandExplicitness: components.explicitness,
        evidenceConfidence: components.evidenceConfidence,
        freshness: components.freshness,
        actionability: components.actionability,
        indiaFit: components.indiaFit,
        commercialPotential: components.commercialPotential,
        repeatability: components.repeatability,
        responseAccessibility: components.responseAccessibility,
        strategicLearning: components.strategicLearning,
        complianceComplexity: components.complianceComplexity,
      };
      snapshotActionabilityInput = derived.actionabilityInput;
    } else if (signalClass === "demand_precursor") {
      const derived = deriveGlobalRadarReclassification({
        signalClass,
        signalType,
        currentStatus: "qualified",
        indiaRelevanceType,
        announcedAt: null,
        effectiveFrom: effectiveFrom?.toISOString() ?? null,
        observedAt: observedAt.toISOString(),
        responsePath: null,
        sensitiveDataAndCompliance: promotionSensitiveDataAndCompliance,
        assessments: {
          proximityToExternalDemand:
            promotionPrecursorScoringInput.proximityToExternalDemand,
          fundingDeploymentMomentum:
            promotionPrecursorScoringInput.fundingDeploymentMomentum,
          likelyDataHardwareIntensity:
            promotionPrecursorScoringInput.likelyDataHardwareIntensity,
          strategicRelevance:
            promotionPrecursorScoringInput.strategicRelevance,
        },
        evidence: candidateEvidence,
        now: observedAt,
      });
      if (!derived.valid) {
        throw new Error(
          `Precursor promotion fixture did not derive: ${derived.reason}.`,
        );
      }
      if (derived.signalClass !== "demand_precursor") {
        throw new Error("Precursor promotion fixture derived the wrong class.");
      }
      const components = derived.score.components;
      scoreColumnValues = {
        evidenceConfidence: components.evidenceConfidence,
        indiaFit: components.indiaFit,
        proximityToExternalDemand: components.proximityToExternalDemand,
        fundingDeploymentMomentum: components.fundingDeploymentMomentum,
        likelyDataHardwareIntensity: components.likelyDataHardwareIntensity,
        estimatedTimeHorizon: components.estimatedTimeHorizon,
        strategicRelevance: components.strategicRelevance,
        precursorScore: derived.score.score,
        scoreCoverage: derived.score.scoreCoverage,
      };
      snapshotComponents = { ...components };
    } else {
      const derived = deriveEcosystemMomentum(
        {
          taxonomy: "robot_learning_and_manipulation",
          taxonomyConsistency:
            promotionMomentumScoringInput.taxonomyConsistency,
          evidenceQuality: promotionMomentumScoringInput.evidenceQuality,
          observations: evaluationEvidence
            .filter(({ isSyndicated }) => !isSyndicated)
            .map((source) => ({
              evidenceId: source.evidenceFingerprint,
              entityId:
                source.globalEntityId ?? source.evidenceFingerprint,
              corporateGroupId:
                source.globalEntityId === null
                  ? source.evidenceFingerprint
                  : `group:${source.globalEntityId}`,
              sourceId: source.evidenceFingerprint,
              sourceFamily: source.sourceFamily,
              isPrimarySource: source.isPrimarySource,
              observedAt: source.observedAt.toISOString(),
            })),
        },
        createGlobalRadarMomentumPolicy(
          "robot_learning_and_manipulation",
        ),
        { now: () => new Date(observedAt.getTime()) },
      );
      if (!derived.valid) {
        throw new Error("Momentum promotion fixture did not derive.");
      }
      scoreColumnValues = {
        momentumIndependentEntityCount: derived.counts.independentEntities,
        momentumPrimarySourceCount: derived.counts.primarySources,
        momentumSourceFamilyCount: derived.counts.sourceFamilies,
        momentumVolume7Days: derived.windows.days7.recent,
        momentumVolume30Days: derived.windows.days30.recent,
        momentumVolume90Days: derived.windows.days90.recent,
        momentumIndependentEntityBreadth:
          derived.components.independentEntityBreadth,
        momentumPrimarySourceDepth: derived.components.primarySourceDepth,
        momentumSourceDiversity: derived.components.sourceDiversity,
        momentumWeightedVolume: derived.components.weightedVolume,
        momentumGrowthVsPreviousPeriod:
          derived.components.growthVsPreceding,
        momentumTaxonomyConsistency:
          derived.components.taxonomyConsistency,
        momentumEvidenceQuality: derived.components.evidenceQuality,
        momentumScore: derived.score,
        scoreCoverage: derived.scoreCoverage,
        momentumQualificationGatesPassed:
          derived.qualificationGatesPassed,
      };
      snapshotComponents = {
        independentEntityCount: derived.counts.independentEntities,
        primarySourceCount: derived.counts.primarySources,
        sourceFamilyCount: derived.counts.sourceFamilies,
        volume7Days: derived.windows.days7.recent,
        volume30Days: derived.windows.days30.recent,
        volume90Days: derived.windows.days90.recent,
        independentEntityBreadth:
          derived.components.independentEntityBreadth,
        primarySourceDepth: derived.components.primarySourceDepth,
        sourceDiversity: derived.components.sourceDiversity,
        weightedVolume: derived.components.weightedVolume,
        growthVsPreviousPeriod: derived.components.growthVsPreceding,
        taxonomyConsistency: derived.components.taxonomyConsistency,
        evidenceQuality: derived.components.evidenceQuality,
      };
    }
    const [signal] = await db
      .insert(globalRadarSignals)
      .values({
        globalEntityId:
          signalClass === "ecosystem_momentum" ? null : entity.id,
        signalClass,
        demandDomain: "robot_learning_and_manipulation",
        signalType,
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
        indiaRelevanceType,
        indiaRelevanceRationale:
          "Public evidence supports India-compatible execution.",
        indiaFitReasons: ["India is compatible with the published scope."],
        indiaFitConstraints: [],
        indiaFitUnknowns: [],
        indiaFitConfidence: 90,
        ...scoreColumnValues,
        scorePolicyVersion: configuration.scoreVersion,
        scoreEvidenceSnapshot: promotionScoreEvidenceSnapshot(
          signalClass,
          signalType,
          indiaRelevanceType,
          snapshotComponents,
          snapshotActionabilityInput,
          evidenceSources,
          evaluationMetadata,
          hash(`provisional-score-input:${suffix}:${index}`),
        ),
        momentumPolicyVersion:
          signalClass === "ecosystem_momentum"
            ? "global-radar-momentum-v1"
            : null,
        announcedAt,
        effectiveFrom,
        expiresAt,
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
    snapshotInputBySignalId.set(signal.id, {
      signalClass,
      signalType,
      indiaRelevanceType,
      components: snapshotComponents,
      actionabilityInput: snapshotActionabilityInput,
      evidence: evidenceSources,
      evaluationMetadata,
      scoreAsOf: observedAt,
    });
    await db.insert(globalSignalEvidence).values(
      evaluationEvidence.map((source) => ({
        signalId: signal.id,
        ingestOrdinal: source.ingestOrdinal,
        runId: radarRun.id,
        globalEntityId: source.globalEntityId,
        sourceUrl: source.sourceUrl,
        canonicalSourceUrl: source.canonicalSourceUrl,
        sourceName: source.sourceName,
        sourceType: source.sourceType,
        sourceLanguage: source.sourceLanguage,
        sourceCountry: source.sourceCountry,
        sourceFamily: source.sourceFamily,
        evidenceClaim: source.evidenceClaim,
        sourceExcerpt: source.sourceExcerpt,
        englishSummary: source.englishSummary,
        publishedAt: source.publishedAt,
        observedAt: source.observedAt,
        evidenceConfidence: source.evidenceConfidence,
        translationConfidence: source.translationConfidence,
        isPrimarySource: source.isPrimarySource,
        isSyndicated: source.isSyndicated,
        supportsDirectDemand: source.supportsDirectDemand,
        supportsIndiaRelevance: source.supportsIndiaRelevance,
        rawMetadata: {},
        evidenceFingerprint: source.evidenceFingerprint,
        supportedFieldPaths: [...source.supportedFieldPaths],
        createdAt: observedAt,
      })),
    );
  }

  if (primaryClass === "ecosystem_momentum") {
    if (!secondMomentumContributor) {
      throw new Error("Second momentum contributor is missing.");
    }
    await db.insert(globalRadarSignalEntities).values(
      [entity.id, secondMomentumContributor.id].map((globalEntityId) => ({
        signalId: signals[0]!.id,
        globalEntityId,
        role: "contributor" as const,
        confidence: 95,
        createdAt: now,
      })),
    );
  }

  const scoreInputEntities = [entity, secondMomentumContributor].flatMap(
    (item) =>
      item === null
        ? []
        : [
            {
              id: item.id,
              canonicalCorporateGroupId: item.canonicalCorporateGroupId,
            },
          ],
  );
  for (const [index, signal] of signals.entries()) {
    const snapshotInput = snapshotInputBySignalId.get(signal.id);
    if (!snapshotInput) {
      throw new Error("Promotion score snapshot input is missing.");
    }
    const associations =
      signal.signalClass === "ecosystem_momentum"
        ? scoreInputEntities.map(({ id }) => ({
            globalEntityId: id,
            role: "contributor",
          }))
        : [];
    const scoreInputDigest = createStoredGlobalRadarScoreInputDigest({
      scoreAsOf: snapshotInput.scoreAsOf,
      signal,
      actionabilityInput: snapshotInput.actionabilityInput,
      associations,
      entities: scoreInputEntities,
    });
    const [updatedSignal] = await db
      .update(globalRadarSignals)
      .set({
        scoreEvidenceSnapshot: promotionScoreEvidenceSnapshot(
          snapshotInput.signalClass,
          snapshotInput.signalType,
          snapshotInput.indiaRelevanceType,
          snapshotInput.components,
          snapshotInput.actionabilityInput,
          snapshotInput.evidence,
          snapshotInput.evaluationMetadata,
          scoreInputDigest,
        ),
      })
      .where(eq(globalRadarSignals.id, signal.id))
      .returning();
    if (!updatedSignal) {
      throw new Error("Promotion score snapshot was not finalized.");
    }
    signals[index] = updatedSignal;
  }

  const provenance = await validateStoredGlobalRadarScoreProvenanceSelection(
    db,
    signals,
  );
  if (!provenance.valid) {
    throw new Error(
      `Invalid promotion fixture provenance for ${primaryClass}: ${provenance.reason}.`,
    );
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

async function insertPromotionEvidence(
  fixture: Awaited<ReturnType<typeof seedPromotionFixture>>,
  input: Readonly<{
    sourceName: string;
    sourceUrl: string;
    evidenceClaim: string;
    supportedFieldPaths: readonly string[];
    globalEntityId?: string | null;
    isPrimarySource?: boolean;
    isSyndicated?: boolean;
    supportsIndiaRelevance?: boolean;
  }>,
) {
  const signal = fixture.signals[0]!;
  const existingEvidence = await db
    .select()
    .from(globalSignalEvidence)
    .where(eq(globalSignalEvidence.signalId, signal.id));
  const [template] = existingEvidence;
  if (!template) throw new Error("Promotion evidence template is missing.");
  const { id: _id, ...values } = template;
  void _id;
  const [inserted] = await db
    .insert(globalSignalEvidence)
    .values({
      ...values,
      ingestOrdinal:
        Math.max(...existingEvidence.map(({ ingestOrdinal }) => ingestOrdinal)) +
        1,
      globalEntityId:
        input.globalEntityId === undefined
          ? fixture.entity.id
          : input.globalEntityId,
      sourceName: input.sourceName,
      sourceUrl: input.sourceUrl,
      canonicalSourceUrl: input.sourceUrl,
      evidenceClaim: input.evidenceClaim,
      englishSummary: input.evidenceClaim,
      supportedFieldPaths: [...input.supportedFieldPaths],
      isPrimarySource: input.isPrimarySource ?? true,
      isSyndicated: input.isSyndicated ?? false,
      supportsIndiaRelevance: input.supportsIndiaRelevance ?? true,
      evidenceFingerprint: hash(
        `promotion-evidence:${signal.id}:${input.sourceUrl}`,
      ),
    })
    .returning();
  if (!inserted) throw new Error("Promotion evidence was not inserted.");
  return inserted;
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
  it.each([
    "qualified_india_direct_demand",
    "documented_indian_relationship",
    "exceptional_strategic_relevance",
  ] as const)(
    "rejects extra selected signals without writes for %s",
    async (eligibilityPath) => {
      const fixture = await seedPromotionFixture({ repeatedSignalCount: 3 });

      await expect(
        createGlobalRadarPromotionRepository(db, configuration).promote(
          promotionInput(fixture, eligibilityPath),
        ),
      ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
      expect(await db.select().from(globalRadarPromotions)).toEqual([]);
      expect(await db.select().from(globalRadarAdminEvents)).toEqual([]);
      expect(await db.select().from(discoveryRuns)).toEqual([]);
      expect(await db.select().from(discoveryCandidates)).toEqual([]);
    },
  );

  it("rejects a repeated path with fewer than three exactly selected signals without writes", async () => {
    const fixture = await seedPromotionFixture();

    await expect(
      createGlobalRadarPromotionRepository(db, configuration).promote(
        promotionInput(fixture, "repeated_india_compatible_signals"),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    expect(await db.select().from(globalRadarPromotions)).toEqual([]);
    expect(await db.select().from(globalRadarAdminEvents)).toEqual([]);
    expect(await db.select().from(discoveryRuns)).toEqual([]);
    expect(await db.select().from(discoveryCandidates)).toEqual([]);
  });

  it("rejects a repeated selection containing one non-India-compatible signal without writes", async () => {
    const fixture = await seedPromotionFixture({
      repeatedSignalCount: 4,
      nonIndiaCompatibleSignalIndexes: [3],
    });

    await expect(
      createGlobalRadarPromotionRepository(db, configuration).promote(
        promotionInput(fixture, "repeated_india_compatible_signals"),
      ),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "eligibility_not_met",
    });
    expect(await db.select().from(globalRadarPromotions)).toEqual([]);
    expect(await db.select().from(globalRadarAdminEvents)).toEqual([]);
    expect(await db.select().from(discoveryRuns)).toEqual([]);
    expect(await db.select().from(discoveryCandidates)).toEqual([]);
    expect(await db.select().from(globalEntities)).toMatchObject([
      { id: fixture.entity.id, entityStatus: "qualified", revision: 0 },
    ]);
    expect(await db.select().from(globalRadarSignals)).toEqual(
      expect.arrayContaining(
        fixture.signals.map(({ id }) =>
          expect.objectContaining({ id, status: "qualified", revision: 0 }),
        ),
      ),
    );
  });

  it("rejects documented relationship evidence owned by another entity without exporting it", async () => {
    const fixture = await seedPromotionFixture({
      primaryClass: "demand_precursor",
      primaryIndiaRelevance: "explicit_India",
    });
    const unrelated = await seedPromotionFixture();
    await insertPromotionEvidence(fixture, {
      sourceName: "Wrong-owner relationship source",
      sourceUrl: "https://wrong-owner.example/india-operations",
      evidenceClaim:
        "The unrelated organisation operates manufacturing facilities in India.",
      supportedFieldPaths: [
        "indiaRelevance.existing_India_presence.manufacturing",
      ],
      globalEntityId: unrelated.entity.id,
    });

    await expect(
      createGlobalRadarPromotionRepository(db, configuration).promote(
        promotionInput(fixture, "documented_indian_relationship"),
      ),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "eligibility_not_met",
    });
    expect(await db.select().from(globalRadarPromotions)).toEqual([]);
    expect(await db.select().from(globalRadarAdminEvents)).toEqual([]);
    expect(await db.select().from(discoveryRuns)).toEqual([]);
    expect(await db.select().from(discoveryCandidates)).toEqual([]);
  });

  it("copies only a validated exact score citation with path eligibility into Discovery", async () => {
    const relationshipSourceUrl =
      "https://relationship.example/india-operations";
    const fixture = await seedPromotionFixture({
      primaryClass: "demand_precursor",
      primaryIndiaRelevance: "existing_India_presence",
      primarySourceUrls: [relationshipSourceUrl],
      primaryEvidenceClaim:
        "The organisation operates manufacturing facilities in India.",
      primaryEvidenceSupportedFieldPaths: [
        "indiaRelevance.existing_India_presence.manufacturing",
      ],
    });
    const unrelated = await insertPromotionEvidence(fixture, {
      sourceName: "Unrelated press coverage",
      sourceUrl: "https://press.example/unrelated-profile",
      evidenceClaim:
        "A profile describes the organisation without substantiating this promotion path.",
      supportedFieldPaths: ["signal.title"],
      isPrimarySource: false,
      supportsIndiaRelevance: false,
    });

    const result = await createGlobalRadarPromotionRepository(
      db,
      configuration,
    ).promote(promotionInput(fixture, "documented_indian_relationship"));
    expect(result).toMatchObject({ outcome: "promoted" });

    const [run] = await db.select().from(discoveryRuns);
    const sources = await db
      .select()
      .from(discoveryCandidateSources)
      .orderBy(asc(discoveryCandidateSources.sourceName));
    expect(run?.sourcesUsed).toEqual(["Official source 1"]);
    expect(
      sources.map(({ sourceName, sourceUrl }) => ({ sourceName, sourceUrl })),
    ).toEqual([
      {
        sourceName: "Official source 1",
        sourceUrl: relationshipSourceUrl,
      },
    ]);
    expect(JSON.stringify(sources)).toContain(
      "documented_indian_relationship",
    );
    expect(JSON.stringify(sources)).toContain("active_score_citation");
    expect(JSON.stringify([run, sources])).not.toContain(unrelated.sourceUrl);
    expect(JSON.stringify([run, sources])).not.toContain(
      unrelated.evidenceClaim,
    );
  });

  it("does not export an unrelated extra primary source for the exceptional path", async () => {
    const fixture = await seedPromotionFixture({
      primaryClass: "demand_precursor",
      primarySourceUrls: [
        "https://exceptional-a.example/public-case",
        "https://exceptional-b.example/public-case",
      ],
    });
    const unrelated = await insertPromotionEvidence(fixture, {
      sourceName: "Unrelated extra primary source",
      sourceUrl: "https://unrelated-primary.example/profile",
      evidenceClaim:
        "An unrelated profile is not cited by the active score snapshot.",
      supportedFieldPaths: ["signal.title"],
      isPrimarySource: true,
      supportsIndiaRelevance: false,
    });

    await expect(
      createGlobalRadarPromotionRepository(db, configuration).promote(
        promotionInput(fixture, "exceptional_strategic_relevance"),
      ),
    ).resolves.toMatchObject({ outcome: "promoted" });

    const [run] = await db.select().from(discoveryRuns);
    const sources = await db
      .select()
      .from(discoveryCandidateSources)
      .orderBy(asc(discoveryCandidateSources.sourceName));
    expect(run?.sourcesUsed).toEqual([
      "Official source 1",
      "Official source 2",
    ]);
    expect(sources).toHaveLength(2);
    expect(JSON.stringify([run, sources])).not.toContain(unrelated.sourceUrl);
    expect(JSON.stringify([run, sources])).not.toContain(
      unrelated.evidenceClaim,
    );
  });

  it("exports only exact component citations from an eleven-row evaluation prefix", async () => {
    const sourceUrls = Array.from(
      { length: 11 },
      (_, index) => `https://evaluation-${index + 1}.example/public-case`,
    );
    const fixture = await seedPromotionFixture({
      primaryClass: "demand_precursor",
      primarySourceUrls: sourceUrls,
    });
    const evidence = await db
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, fixture.signals[0]!.id))
      .orderBy(asc(globalSignalEvidence.ingestOrdinal));
    if (evidence.length !== 11) {
      throw new Error("Exceptional citation fixture evidence is incomplete.");
    }
    const citedFingerprints = new Set(
      fixture.signals[0]!.scoreEvidenceSnapshot.componentEvidence.flatMap(
        ({ evidence: citations }) =>
          citations.map(({ evidenceFingerprint }) => evidenceFingerprint),
      ),
    );
    const uncitedEvidence = evidence.filter(
      ({ evidenceFingerprint }) =>
        !citedFingerprints.has(evidenceFingerprint),
    );
    expect(citedFingerprints.size).toBe(10);
    expect(uncitedEvidence).toHaveLength(1);

    const result = await createGlobalRadarPromotionRepository(
      db,
      configuration,
    ).promote(
      promotionInput(fixture, "exceptional_strategic_relevance"),
    );
    expect(result).toMatchObject({ outcome: "promoted" });

    const [run] = await db.select().from(discoveryRuns);
    const sources = await db.select().from(discoveryCandidateSources);
    expect(run?.sourcesUsed).toHaveLength(10);
    expect(sources).toHaveLength(10);
    expect(JSON.stringify([run, sources])).not.toContain(
      uncitedEvidence[0]!.sourceUrl,
    );
  });

  it("keeps a momentum evaluation prefix for replay but exports only target-owned exact citations", async () => {
    const sourceUrls = [
      "https://target-cited.example/india-operations",
      "https://contributor-one.example/public-research",
      "https://contributor-two.example/public-jobs",
      "https://target-uncited-b.example/syndicated-profile",
      "https://target-uncited-c.example/syndicated-profile",
    ];
    const fixture = await seedPromotionFixture({
      primaryClass: "ecosystem_momentum",
      primarySourceUrls: sourceUrls,
      primarySyndicatedSourceIndexes: [3, 4],
      primaryTargetEntitySourceIndexes: [3, 4],
      primaryEvidenceSupportsIndia: true,
      primaryEvidenceSupportedFieldPaths: [
        "indiaRelevance.existing_India_presence.manufacturing",
      ],
    });
    const provenance = await validateStoredGlobalRadarScoreProvenanceSelection(
      db,
      [fixture.signals[0]!],
    );
    if (!provenance.valid) {
      throw new Error(`Momentum provenance was invalid: ${provenance.reason}.`);
    }
    const stored = provenance.items[0]?.provenance;
    if (!stored) throw new Error("Momentum provenance item is missing.");
    const targetEvaluationEvidence = stored.evaluationEvidence.filter(
      ({ globalEntityId }) => globalEntityId === fixture.entity.id,
    );
    const targetCitedEvidence = stored.citedEvidence.filter(
      ({ globalEntityId }) => globalEntityId === fixture.entity.id,
    );
    expect(targetEvaluationEvidence.map(({ sourceUrl }) => sourceUrl)).toEqual([
      sourceUrls[0],
      sourceUrls[3],
      sourceUrls[4],
    ]);
    expect(targetCitedEvidence.map(({ sourceUrl }) => sourceUrl)).toEqual([
      sourceUrls[0],
    ]);

    await expect(
      createGlobalRadarPromotionRepository(db, configuration).promote(
        promotionInput(fixture, "documented_indian_relationship"),
      ),
    ).resolves.toMatchObject({ outcome: "promoted" });
    const [run] = await db.select().from(discoveryRuns);
    const sources = await db.select().from(discoveryCandidateSources);
    expect(run?.sourcesUsed).toEqual(["Official source 1"]);
    expect(sources).toHaveLength(1);
    expect(JSON.stringify([run, sources])).toContain(sourceUrls[0]);
    expect(JSON.stringify([run, sources])).not.toContain(sourceUrls[3]);
    expect(JSON.stringify([run, sources])).not.toContain(sourceUrls[4]);
  });

  it("promotes qualified momentum for a selected contributor and rejects an unrelated entity", async () => {
    const momentum = await seedPromotionFixture({
      primaryClass: "ecosystem_momentum",
      primaryEvidenceSupportsIndia: true,
      primaryEvidenceSupportedFieldPaths: [
        "indiaRelevance.existing_India_presence.manufacturing",
      ],
    });
    const unrelated = await seedPromotionFixture();
    const repository = createGlobalRadarPromotionRepository(db, configuration);
    const detail = await createGlobalRadarAdminRepository(
      db,
      configuration,
    ).getSignalDetail(momentum.signals[0]!.id);
    const request = promotionInput(
      momentum,
      "documented_indian_relationship",
    );

    expect(detail).toMatchObject({
      outcome: "found",
      detail: {
        organisation: null,
        allowedActions: expect.arrayContaining(["promote"]),
      },
    });
    if (detail.outcome === "found") {
      expect(detail.detail.associatedOrganisations.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: "contributor",
            organisation: expect.objectContaining({
              id: momentum.entity.id,
              revision: 0,
            }),
          }),
        ]),
      );
    }

    const originalEvidenceOwners = await db
      .select({
        id: globalSignalEvidence.id,
        globalEntityId: globalSignalEvidence.globalEntityId,
      })
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, momentum.signals[0]!.id));
    await db
      .update(globalSignalEvidence)
      .set({ globalEntityId: unrelated.entity.id })
      .where(eq(globalSignalEvidence.signalId, momentum.signals[0]!.id));
    await expect(
      repository.promote({
        ...request,
        idempotencyKey: nextIdempotencyKey(),
      }),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "eligibility_not_met",
    });
    expect(await db.select().from(globalRadarPromotions)).toEqual([]);
    expect(await db.select().from(globalRadarAdminEvents)).toEqual([]);
    for (const evidence of originalEvidenceOwners) {
      await db
        .update(globalSignalEvidence)
        .set({ globalEntityId: evidence.globalEntityId })
        .where(eq(globalSignalEvidence.id, evidence.id));
    }
    await expect(
      validateStoredGlobalRadarScoreProvenanceSelection(db, [
        momentum.signals[0]!,
      ]),
    ).resolves.toMatchObject({ valid: true });
    await expect(
      repository.loadContext({
        globalEntityId: momentum.entity.id,
        primarySignalId: momentum.signals[0]!.id,
        supportingSignalIds: [],
        eligibilityPath: "documented_indian_relationship",
      }),
    ).resolves.toMatchObject({ outcome: "found" });

    await expect(
      repository.promote({
        ...request,
        globalEntityId: unrelated.entity.id,
        expectedEntityRevision: unrelated.entity.revision,
        idempotencyKey: nextIdempotencyKey(),
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "eligibility_not_met",
    });
    expect(await db.select().from(globalRadarPromotions)).toEqual([]);
    expect(await db.select().from(globalRadarAdminEvents)).toEqual([]);
    const promoted = await repository.promote(request);
    if (promoted.outcome !== "promoted") {
      throw new Error(
        `Momentum promotion did not complete: ${promoted.outcome}:${"reason" in promoted ? promoted.reason : "unknown"}.`,
      );
    }
    expect(promoted).toMatchObject({
      outcome: "promoted",
      entity: { id: momentum.entity.id, entityStatus: "promoted_to_candidate" },
      primarySignal: {
        id: momentum.signals[0]!.id,
        signalClass: "ecosystem_momentum",
        status: "promoted",
      },
      candidate: {
        name: momentum.entity.canonicalName,
        discoveryScore: momentum.signals[0]!.momentumScore,
      },
    });
    expect(await db.select().from(discoveryCandidates)).toHaveLength(1);
  });

  it("loads a read-only promotion context and adds the separately selected primary", async () => {
    const fixture = await seedPromotionFixture({ repeatedSignalCount: 3 });
    const repository = createGlobalRadarPromotionRepository(db, configuration);

    const result = await repository.loadContext({
      globalEntityId: fixture.entity.id,
      primarySignalId: fixture.signals[0]!.id,
      supportingSignalIds: fixture.signals.slice(1).map(({ id }) => id),
      eligibilityPath: "repeated_india_compatible_signals",
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
      {
        primaryClass: "demand_precursor",
        primaryEvidenceSupportsIndia: true,
        primaryEvidenceSupportedFieldPaths: [
          "indiaRelevance.existing_India_presence.manufacturing",
        ],
      },
    ],
    [
      "exceptional_strategic_relevance",
      {
        primaryClass: "demand_precursor",
        entityStatus: "monitoring",
        primarySourceUrls: [
          "https://exceptional-a.example/public-case",
          "https://exceptional-b.example/public-case",
        ],
      },
    ],
  ] as const)("promotes through %s", async (eligibilityPath, options) => {
    const fixture = await seedPromotionFixture(options);
    const repository = createGlobalRadarPromotionRepository(db, configuration);
    let promotionFixture = fixture;
    if (eligibilityPath === "exceptional_strategic_relevance") {
      const qualification = await createGlobalRadarAdminService({
        repository: createGlobalRadarAdminRepository(db, configuration),
        adminEmails: [actorEmail],
        now: () => fixture.now,
        queueManualRun: async () => ({ outcome: "invalid" }),
        promote: async () => ({ outcome: "invalid" }),
        reversePromotion: async () => ({ outcome: "invalid" }),
      }).qualifyEntity(
        { userId: actorUserId, email: actorEmail },
        fixture.entity.id,
        {
          entityId: fixture.entity.id,
          expectedRevision: fixture.entity.revision,
          idempotencyKey: nextIdempotencyKey(),
          reason:
            "Administrator confirmed exceptional strategic relevance from public evidence.",
        },
      );
      expect(qualification).toMatchObject({
        outcome: "updated",
        entity: { entityStatus: "qualified", revision: 1 },
      });
      const [qualifiedEntity] = await db
        .select()
        .from(globalEntities)
        .where(eq(globalEntities.id, fixture.entity.id));
      if (!qualifiedEntity) {
        throw new Error("Qualified promotion entity was not persisted.");
      }
      promotionFixture = { ...fixture, entity: qualifiedEntity };
    }

    const result = await repository.promote(
      promotionInput(promotionFixture, eligibilityPath),
    );

    expect(result).toMatchObject({
      outcome: "promoted",
      promotion: { eligibilityPath, status: "active" },
      entity: {
        entityStatus: "promoted_to_candidate",
        revision:
          eligibilityPath === "exceptional_strategic_relevance" ? 2 : 1,
      },
      primarySignal: { status: "promoted", revision: 1 },
      run: {
        campaignKey: "general_discovery",
        trigger: "radar_promotion",
        status: "succeeded",
        foundCount: 1,
      },
      candidate: {
        type: "company",
        name: promotionFixture.entity.canonicalName,
        category: promotionFixture.signals[0]!.demandDomain,
        subcategory: promotionFixture.entity.sector,
        geography: promotionFixture.entity.headquartersCountry,
        discoveryScore:
          promotionFixture.signals[0]!.directDemandScore ??
          promotionFixture.signals[0]!.precursorScore,
        status: "discovered",
      },
    });
    expect(await db.select().from(candidateResearchVersions)).toEqual([]);
    expect(await db.select().from(globalSignalUpdates)).toMatchObject([
      { updateType: "promoted", actorType: "administrator" },
    ]);
    const adminEvents = await db.select().from(globalRadarAdminEvents);
    expect(adminEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "promoted_to_discovery",
          actorType: "administrator",
        }),
      ]),
    );
    if (eligibilityPath === "exceptional_strategic_relevance") {
      expect(adminEvents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: "entity_qualified",
            actorType: "administrator",
          }),
        ]),
      );
    }
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
    await expect(repository.lookupPromotionReplay(input)).resolves.toEqual({
      outcome: "not_found",
    });
    const first = await repository.promote(input);
    const lookupReplay = await repository.lookupPromotionReplay({
      ...input,
      now: new Date(input.now.getTime() + 500),
    });
    const lookupChanged = await repository.lookupPromotionReplay({
      ...input,
      reason: "A changed request must not reuse the idempotency key.",
    });
    const replay = await repository.promote({
      ...input,
      now: new Date(input.now.getTime() + 1_000),
    });
    const changed = await repository.promote({
      ...input,
      reason: "A changed request must not reuse the idempotency key.",
    });

    expect(first).toMatchObject({ outcome: "promoted" });
    expect(lookupReplay).toMatchObject({ outcome: "replayed" });
    expect(lookupChanged).toEqual({
      outcome: "conflict",
      reason: "idempotency_mismatch",
    });
    expect(replay).toMatchObject({ outcome: "replayed" });
    expect(changed).toEqual({
      outcome: "conflict",
      reason: "idempotency_mismatch",
    });
    expect(await db.select().from(globalRadarPromotions)).toHaveLength(1);
    expect(await db.select().from(discoveryRuns)).toHaveLength(1);
    expect(await db.select().from(discoveryCandidates)).toHaveLength(1);
  });

  it.each([
    "indiaRelevance.India_expansion.manufacturing",
    "indiaRelevance.explicit_India.suppliers",
    "indiaRelevance.inferred_India_compatible.requirement_access",
  ])(
    "does not treat %s as a documented existing Indian relationship",
    async (supportedFieldPath) => {
      const fixture = await seedPromotionFixture({
        primaryClass: "demand_precursor",
        primaryEvidenceSupportsIndia: true,
        primaryEvidenceSupportedFieldPaths: [supportedFieldPath],
      });
      const result = await createGlobalRadarPromotionRepository(
        db,
        configuration,
      ).promote(
        promotionInput(fixture, "documented_indian_relationship"),
      );

      expect(result).toEqual({
        outcome: "conflict",
        reason: "eligibility_not_met",
      });
      expect(await db.select().from(globalRadarPromotions)).toEqual([]);
      expect(await db.select().from(globalRadarAdminEvents)).toEqual([]);
      expect(await db.select().from(discoveryCandidates)).toHaveLength(0);
      expect(await db.select().from(discoveryRuns)).toHaveLength(0);
    },
  );

  it("fails closed without writes when documented-relationship evidence negates the claimed India fact", async () => {
    const fixture = await seedPromotionFixture({
      primaryClass: "demand_precursor",
      primaryIndiaRelevance: "globally_open",
      primaryEvidenceSupportsIndia: true,
      primaryEvidenceSupportedFieldPaths: [
        "indiaRelevance.existing_India_presence.manufacturing",
      ],
      primaryEvidenceClaim:
        "Applications are open to qualified organisations worldwide, but the organisation does not operate manufacturing facilities in India.",
    });

    await expect(
      createGlobalRadarPromotionRepository(db, configuration).promote(
        promotionInput(fixture, "documented_indian_relationship"),
      ),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "eligibility_not_met",
    });
    expect(await db.select().from(globalRadarPromotions)).toEqual([]);
    expect(await db.select().from(globalRadarAdminEvents)).toEqual([]);
    expect(await db.select().from(discoveryRuns)).toEqual([]);
    expect(await db.select().from(discoveryCandidates)).toEqual([]);
    expect(await db.select().from(globalEntities)).toMatchObject([
      { id: fixture.entity.id, entityStatus: "qualified", revision: 0 },
    ]);
    expect(await db.select().from(globalRadarSignals)).toMatchObject([
      { id: fixture.signals[0]!.id, status: "qualified", revision: 0 },
    ]);
  });

  it.each([
    [
      "aggregate score",
      async (fixture: Awaited<ReturnType<typeof seedPromotionFixture>>) => {
        await db
          .update(globalRadarSignals)
          .set({ directDemandScore: 99 })
          .where(eq(globalRadarSignals.id, fixture.signals[0]!.id));
      },
    ],
    [
      "active score snapshot",
      async (fixture: Awaited<ReturnType<typeof seedPromotionFixture>>) => {
        const snapshot = fixture.signals[0]!.scoreEvidenceSnapshot;
        await db
          .update(globalRadarSignals)
          .set({
            scoreEvidenceSnapshot: {
              ...snapshot,
              componentEvidence: snapshot.componentEvidence.map(
                (association, index) =>
                  index === 0
                    ? { ...association, value: association.value - 1 }
                    : association,
              ),
            },
          })
          .where(eq(globalRadarSignals.id, fixture.signals[0]!.id));
      },
    ],
    [
      "exact cited evidence fingerprint",
      async (fixture: Awaited<ReturnType<typeof seedPromotionFixture>>) => {
        await db
          .update(globalSignalEvidence)
          .set({ evidenceFingerprint: hash("replacement-evidence") })
          .where(eq(globalSignalEvidence.signalId, fixture.signals[0]!.id));
      },
    ],
  ])(
    "fails closed without writes when promotion provenance has a tampered %s",
    async (_case, tamper) => {
      const fixture = await seedPromotionFixture();
      await tamper(fixture);

      await expect(
        createGlobalRadarPromotionRepository(db, configuration).promote(
          promotionInput(fixture, "qualified_india_direct_demand"),
        ),
      ).resolves.toEqual({
        outcome: "conflict",
        reason: "eligibility_not_met",
      });
      expect(await db.select().from(globalRadarPromotions)).toEqual([]);
      expect(await db.select().from(globalRadarAdminEvents)).toEqual([]);
      expect(await db.select().from(discoveryRuns)).toEqual([]);
      expect(await db.select().from(discoveryCandidates)).toEqual([]);
      expect(await db.select().from(globalEntities)).toMatchObject([
        { id: fixture.entity.id, entityStatus: "qualified", revision: 0 },
      ]);
      expect(await db.select().from(globalRadarSignals)).toMatchObject([
        { id: fixture.signals[0]!.id, status: "qualified", revision: 0 },
      ]);
    },
  );

  it("validates every repeated-path supporting score before any promotion write", async () => {
    const fixture = await seedPromotionFixture({ repeatedSignalCount: 3 });
    const nonPrimarySupportingSignal = fixture.signals[1]!;
    await db
      .update(globalRadarSignals)
      .set({ precursorScore: 99 })
      .where(eq(globalRadarSignals.id, nonPrimarySupportingSignal.id));

    await expect(
      createGlobalRadarPromotionRepository(db, configuration).promote(
        promotionInput(fixture, "repeated_india_compatible_signals"),
      ),
    ).resolves.toEqual({
      outcome: "conflict",
      reason: "eligibility_not_met",
    });
    expect(await db.select().from(globalRadarPromotions)).toEqual([]);
    expect(await db.select().from(globalRadarAdminEvents)).toEqual([]);
    expect(await db.select().from(discoveryRuns)).toEqual([]);
    expect(await db.select().from(discoveryCandidates)).toEqual([]);
    expect(await db.select().from(globalEntities)).toMatchObject([
      { id: fixture.entity.id, entityStatus: "qualified", revision: 0 },
    ]);
    expect(await db.select().from(globalRadarSignals)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: nonPrimarySupportingSignal.id,
          status: "qualified",
          revision: 0,
          precursorScore: 99,
        }),
      ]),
    );
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
      discoveryScore: fixture.signals[0]!.directDemandScore,
    });
    expect(
      await db.select().from(discoveryCandidateIdentifiers),
    ).not.toHaveLength(0);
    expect(await db.select().from(discoveryRuns)).toHaveLength(2);
  });

  it("records a bounded conflicted attempt without changing Radar or Discovery state", async () => {
    const fixture = await seedPromotionFixture();
    const repository = createGlobalRadarPromotionRepository(db, configuration);
    const input = promotionInput(fixture, "qualified_india_direct_demand");
    const result = await repository.promote({
      ...input,
      expectedPrimarySignalRevision: 7,
      expectedSupportingSignalRevisions: {
        ...input.expectedSupportingSignalRevisions,
        [input.primarySignalId]: 7,
      },
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
    await expect(
      validateStoredGlobalRadarScoreProvenanceSelection(db, [
        promoted.primarySignal,
      ]),
    ).resolves.toMatchObject({ valid: true });
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
    if (first.outcome !== "reversed") {
      throw new Error("Promotion fixture did not reverse.");
    }
    await expect(
      validateStoredGlobalRadarScoreProvenanceSelection(db, [
        first.primarySignal,
      ]),
    ).resolves.toMatchObject({ valid: true });
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

  it("fails a reversal closed without writes when the promoted score provenance was tampered", async () => {
    const fixture = await seedPromotionFixture();
    const repository = createGlobalRadarPromotionRepository(db, configuration);
    const promoted = await repository.promote(
      promotionInput(fixture, "qualified_india_direct_demand"),
    );
    if (promoted.outcome !== "promoted") {
      throw new Error("Promotion fixture did not promote.");
    }
    const eventsBeforeReversal = await db.select().from(globalRadarAdminEvents);
    await db
      .update(globalRadarSignals)
      .set({ directDemandScore: 99 })
      .where(eq(globalRadarSignals.id, promoted.primarySignal.id));

    await expect(
      repository.reverse({
        globalEntityId: fixture.entity.id,
        expectedEntityRevision: promoted.entity.revision,
        expectedPrimarySignalRevision: promoted.primarySignal.revision,
        actor: { userId: actorUserId, email: actorEmail },
        idempotencyKey: nextIdempotencyKey(),
        reason: "A corrupted score cannot be restored to qualified state.",
        now: new Date(fixture.now.getTime() + 1_000),
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "restoration_not_safe",
      promotion: { status: "active" },
    });
    expect(await db.select().from(globalRadarAdminEvents)).toHaveLength(
      eventsBeforeReversal.length,
    );
    expect(await db.select().from(globalRadarPromotions)).toMatchObject([
      { status: "active" },
    ]);
    expect(await db.select().from(globalEntities)).toMatchObject([
      { entityStatus: "promoted_to_candidate", revision: 1 },
    ]);
    expect(await db.select().from(globalRadarSignals)).toMatchObject([
      { status: "promoted", revision: 1, directDemandScore: 99 },
    ]);
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
