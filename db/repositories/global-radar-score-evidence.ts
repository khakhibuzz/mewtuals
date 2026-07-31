import {
  and,
  eq,
  gte,
  inArray,
  isNotNull,
  lte,
} from "drizzle-orm";

import {
  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
  createGlobalRadarScoreInputDigest,
  createGlobalRadarFingerprint,
  createActiveScoreEvidenceSnapshot,
  createActiveScoreEvidenceSnapshotFromAssociations,
  deriveScoreComponentEvidenceAssociations,
  directDemandFreshnessEvidencePathFromSnapshot,
  hasValidActiveScoreEvidenceCitations,
  parseActiveScoreEvidenceSnapshot,
  selectDirectDemandFreshnessEvidencePath,
  type ActiveScoreComponentEvidenceAssociation,
  type ActiveScoreEvidenceSnapshot,
  type DirectDemandFreshnessEvidencePath,
  type EmptyMomentumEvidenceWindow,
  type IndiaRelevanceType,
  type ScoreAssessmentAuthority,
  type ScoreEvidenceSource,
  type ScoreEvidenceComponent,
} from "../../app/domain/global-radar";
import type { PersistableRadarSignal } from "../../app/domain/global-radar/persistence";
import { globalSignalEvidence } from "../global-radar-schema";
import type { GlobalRadarSignal } from "../types";

function persistableScoreComponents(
  signal: PersistableRadarSignal,
): Readonly<Record<string, unknown>> {
  if (signal.signalClass === "direct_demand") {
    return {
      demandExplicitness: signal.score.components.explicitness,
      evidenceConfidence: signal.score.components.evidenceConfidence,
      freshness: signal.score.components.freshness,
      actionability: signal.score.components.actionability,
      indiaFit: signal.score.components.indiaFit,
      commercialPotential: signal.score.components.commercialPotential,
      repeatability: signal.score.components.repeatability,
      responseAccessibility: signal.score.components.responseAccessibility,
      strategicLearning: signal.score.components.strategicLearning,
      complianceComplexity: signal.score.components.complianceComplexity,
    };
  }
  if (signal.signalClass === "demand_precursor") {
    return { ...signal.score.components };
  }
  return {
    independentEntityCount: signal.score.counts.independentEntities,
    primarySourceCount: signal.score.counts.primarySources,
    sourceFamilyCount: signal.score.counts.sourceFamilies,
    volume7Days: signal.score.windows.days7.recent,
    volume30Days: signal.score.windows.days30.recent,
    volume90Days: signal.score.windows.days90.recent,
    independentEntityBreadth:
      signal.score.components.independentEntityBreadth,
    primarySourceDepth: signal.score.components.primarySourceDepth,
    sourceDiversity: signal.score.components.sourceDiversity,
    weightedVolume: signal.score.components.weightedVolume,
    growthVsPreviousPeriod: signal.score.components.growthVsPreceding,
    taxonomyConsistency: signal.score.components.taxonomyConsistency,
    evidenceQuality: signal.score.components.evidenceQuality,
  };
}

function persistableScoreEvidenceSources(
  signal: PersistableRadarSignal,
): readonly ScoreEvidenceSource[] {
  return signal.evidence.map((evidence) => ({
    id: evidence.evidenceFingerprint,
    sourceUrl: evidence.sourceUrl,
    sourceName: evidence.sourceName,
    evidenceClaim: evidence.claim,
    contributorEntityId: evidence.contributorEntityRef,
    evidenceConfidence: evidence.evidenceConfidence,
    publishedAt: evidence.publishedAt,
    observedAt: evidence.observedAt,
    isPrimarySource: evidence.isPrimarySource,
    isSyndicated: evidence.isSyndicated,
    sourceFamily: evidence.sourceFamily,
    supportedFieldPaths: evidence.supportedFieldPaths,
  }));
}

function persistableAssessedScoreInputs(
  signal: PersistableRadarSignal,
): Readonly<Record<string, number | null>> {
  if (signal.signalClass === "direct_demand") {
    return {
      actionabilityInput: signal.actionabilityInput,
      commercialPotential: signal.score.components.commercialPotential,
      repeatability: signal.score.components.repeatability,
      strategicLearning: signal.score.components.strategicLearning,
      complianceComplexity: signal.score.components.complianceComplexity,
    };
  }
  if (signal.signalClass === "demand_precursor") {
    return {
      proximityToExternalDemand:
        signal.score.components.proximityToExternalDemand,
      fundingDeploymentMomentum:
        signal.score.components.fundingDeploymentMomentum,
      likelyDataHardwareIntensity:
        signal.score.components.likelyDataHardwareIntensity,
      strategicRelevance: signal.score.components.strategicRelevance,
    };
  }
  return {
    taxonomyConsistency: signal.score.components.taxonomyConsistency,
    evidenceQuality: signal.score.components.evidenceQuality,
  };
}

export function createPersistableGlobalRadarScoreInputDigest(
  signal: PersistableRadarSignal,
  entityIds: ReadonlyMap<string, string>,
  corporateGroupIdsByEntityRef: ReadonlyMap<string, string | null> = new Map(),
): string {
  const referencedEntityRefs = [
    ...(signal.primaryEntityRef === null ? [] : [signal.primaryEntityRef]),
    ...signal.associatedEntities.map(({ entityRef }) => entityRef),
    ...signal.evidence.flatMap(({ contributorEntityRef }) =>
      contributorEntityRef === null ? [] : [contributorEntityRef],
    ),
  ];
  const entityCorporateGroups = [
    ...new Map(
      referencedEntityRefs.map((entityRef) => {
        const entityId = entityIds.get(entityRef);
        if (!entityId) {
          throw new Error("Invalid Global Radar score-input entity mapping.");
        }
        return [
          entityId,
          {
            entityId,
            canonicalCorporateGroupId:
              corporateGroupIdsByEntityRef.get(entityRef) ?? null,
          },
        ] as const;
      }),
    ).values(),
  ];
  return createGlobalRadarScoreInputDigest({
    scoreAsOf: signal.scoreAsOf,
    signalClass: signal.signalClass,
    signalType: signal.signalType,
    demandDomain: signal.demandDomain,
    status: signal.initialStatus,
    temporalAnchors: {
      announcedAt: signal.announcedAt,
      effectiveFrom: signal.effectiveFrom,
      observedAt: signal.observedAt,
      expiresAt: signal.expiresAt,
    },
    responsePath:
      signal.responsePath === null
        ? null
        : {
            type: signal.responsePath.type,
            url: signal.responsePath.url,
            businessEmail: signal.responsePath.businessEmail,
          },
    indiaRelevance: {
      relevanceType: signal.indiaRelevance.relevanceType,
      rationale: signal.indiaRelevance.rationale,
      reasons: signal.indiaRelevance.reasons,
      constraints: signal.indiaRelevance.constraints,
      unknowns: signal.indiaRelevance.unknowns,
      confidence: signal.indiaRelevance.confidence,
      regulatoryFacts: signal.indiaRelevance.regulatoryFacts,
      logisticsFacts: signal.indiaRelevance.logisticsFacts,
    },
    sensitiveDataAndCompliance: signal.sensitiveDataAndCompliance,
    assessedInputs: persistableAssessedScoreInputs(signal),
    contributorRoles: signal.associatedEntities.map(({ entityRef, role }) => {
      const entityId = entityIds.get(entityRef);
      if (!entityId) {
        throw new Error("Invalid Global Radar score-input contributor mapping.");
      }
      return { entityId, role };
    }),
    entityCorporateGroups,
    scorePolicyVersion: signal.score.scoreVersion,
    momentumPolicyVersion:
      signal.signalClass === "ecosystem_momentum"
        ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
        : null,
  });
}

export type StoredScoreInputAssociation = Readonly<{
  globalEntityId: string;
  role: string;
}>;

export type StoredScoreInputEntity = Readonly<{
  id: string;
  canonicalCorporateGroupId: string | null;
}>;

function storedAssessedScoreInputs(
  signal: GlobalRadarSignal,
  actionabilityInput: number | null,
): Readonly<Record<string, number | null>> {
  if (signal.signalClass === "direct_demand") {
    return {
      actionabilityInput,
      commercialPotential: signal.commercialPotential,
      repeatability: signal.repeatability,
      strategicLearning: signal.strategicLearning,
      complianceComplexity: signal.complianceComplexity,
    };
  }
  if (signal.signalClass === "demand_precursor") {
    return {
      proximityToExternalDemand: signal.proximityToExternalDemand,
      fundingDeploymentMomentum: signal.fundingDeploymentMomentum,
      likelyDataHardwareIntensity: signal.likelyDataHardwareIntensity,
      strategicRelevance: signal.strategicRelevance,
    };
  }
  return {
    taxonomyConsistency: signal.momentumTaxonomyConsistency,
    evidenceQuality: signal.momentumEvidenceQuality,
  };
}

export function createStoredGlobalRadarScoreInputDigest(input: Readonly<{
  scoreAsOf: Date;
  signal: GlobalRadarSignal;
  actionabilityInput: number | null;
  associations: readonly StoredScoreInputAssociation[];
  entities: readonly StoredScoreInputEntity[];
}>): string {
  const signal = input.signal;
  if (
    signal.scorePolicyVersion !== "global-radar-score-v1" ||
    (signal.signalClass === "ecosystem_momentum"
      ? signal.momentumPolicyVersion !== GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
      : signal.momentumPolicyVersion !== null)
  ) {
    throw new Error("Invalid Global Radar score-input policy version.");
  }
  return createGlobalRadarScoreInputDigest({
    scoreAsOf: input.scoreAsOf.toISOString(),
    signalClass: signal.signalClass,
    signalType: signal.signalType,
    demandDomain: signal.demandDomain,
    status: signal.status,
    temporalAnchors: {
      announcedAt: signal.announcedAt?.toISOString() ?? null,
      effectiveFrom: signal.effectiveFrom?.toISOString() ?? null,
      observedAt: signal.observedAt.toISOString(),
      expiresAt: signal.expiresAt?.toISOString() ?? null,
    },
    responsePath:
      signal.responsePathType === null &&
      signal.responsePathUrl === null &&
      signal.responseBusinessEmail === null
        ? null
        : {
            type: signal.responsePathType ?? "",
            url: signal.responsePathUrl,
            businessEmail: signal.responseBusinessEmail,
          },
    indiaRelevance: {
      relevanceType: signal.indiaRelevanceType,
      rationale: signal.indiaRelevanceRationale,
      reasons: signal.indiaFitReasons,
      constraints: signal.indiaFitConstraints,
      unknowns: signal.indiaFitUnknowns,
      confidence: signal.indiaFitConfidence,
      regulatoryFacts: signal.indiaRegulatoryFacts,
      logisticsFacts: signal.indiaLogisticsFacts,
    },
    sensitiveDataAndCompliance: {
      sensitiveDataFlags: {
        faces: signal.faces,
        voices: signal.voices,
        biometrics: signal.biometrics,
        gaze: signal.gaze,
        health: signal.health,
        children: signal.children,
        home_interiors: signal.homeInteriors,
        workplace_monitoring: signal.workplaceMonitoring,
        precise_location: signal.preciseLocation,
        road_users: signal.roadUsers,
        employee_data: signal.employeeData,
        industrial_secrets: signal.industrialSecrets,
        defence_or_dual_use: signal.defenceOrDualUse,
        copyrighted_material: signal.copyrightedMaterial,
        export_controls: signal.exportControls,
      },
      complianceFacts: {
        consent: signal.consent,
        deIdentification: signal.deIdentification,
        legalReview: signal.legalReview,
        knownResidencyRequirements: signal.knownResidencyRequirements,
        participantRightsComplexity: signal.participantRightsComplexity,
      },
    },
    assessedInputs: storedAssessedScoreInputs(
      signal,
      input.actionabilityInput,
    ),
    contributorRoles: input.associations.map(({ globalEntityId, role }) => ({
      entityId: globalEntityId,
      role,
    })),
    entityCorporateGroups: input.entities.map(
      ({ id, canonicalCorporateGroupId }) => ({
        entityId: id,
        canonicalCorporateGroupId,
      }),
    ),
    scorePolicyVersion: "global-radar-score-v1",
    momentumPolicyVersion:
      signal.signalClass === "ecosystem_momentum"
        ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
        : null,
  });
}

export type StoredScoreEvaluationEvidenceRow = Readonly<{
  ingestOrdinal: number;
  evidenceFingerprint: string;
  globalEntityId: string | null;
  sourceUrl: string;
  canonicalSourceUrl: string;
  sourceName: string;
  sourceType: string;
  sourceLanguage: string;
  sourceCountry: string;
  sourceFamily: string;
  evidenceClaim: string;
  sourceExcerpt: string | null;
  englishSummary: string;
  publishedAt: Date | null;
  observedAt: Date;
  evidenceConfidence: number;
  translationConfidence: number | null;
  isPrimarySource: boolean;
  isSyndicated: boolean;
  supportsDirectDemand: boolean;
  supportsIndiaRelevance: boolean;
  supportedFieldPaths: readonly string[];
}>;

export type ActiveScoreEvaluationMetadata = Readonly<{
  scoreAsOf: string;
  evidenceBoundaryOrdinal: number;
  evidenceSetCount: number;
  evidenceSetDigest: string;
}>;

function canonicalScoreEvaluationEvidenceRow(
  item: StoredScoreEvaluationEvidenceRow,
) {
  return {
    ingestOrdinal: item.ingestOrdinal,
    evidenceFingerprint: item.evidenceFingerprint,
    globalEntityId: item.globalEntityId,
    sourceUrl: item.sourceUrl,
    canonicalSourceUrl: item.canonicalSourceUrl,
    sourceName: item.sourceName,
    sourceType: item.sourceType,
    sourceLanguage: item.sourceLanguage,
    sourceCountry: item.sourceCountry,
    sourceFamily: item.sourceFamily,
    evidenceClaim: item.evidenceClaim,
    sourceExcerpt: item.sourceExcerpt,
    englishSummary: item.englishSummary,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    observedAt: item.observedAt.toISOString(),
    evidenceConfidence: item.evidenceConfidence,
    translationConfidence: item.translationConfidence,
    isPrimarySource: item.isPrimarySource,
    isSyndicated: item.isSyndicated,
    supportsDirectDemand: item.supportsDirectDemand,
    supportsIndiaRelevance: item.supportsIndiaRelevance,
    supportedFieldPaths: [...item.supportedFieldPaths].sort(),
  };
}

export function createActiveScoreEvaluationMetadata(input: Readonly<{
  scoreAsOf: Date;
  evidence: readonly StoredScoreEvaluationEvidenceRow[];
}>): ActiveScoreEvaluationMetadata {
  const scoreAsOf = new Date(input.scoreAsOf.getTime());
  if (!Number.isFinite(scoreAsOf.getTime()) || input.evidence.length === 0) {
    throw new Error("Invalid active Global Radar score evaluation set.");
  }
  const evidence = [...input.evidence].sort(
    (left, right) => left.ingestOrdinal - right.ingestOrdinal,
  );
  if (
    evidence.some(
      (item, index) =>
        item.ingestOrdinal !== index + 1 ||
        item.observedAt.getTime() > scoreAsOf.getTime(),
    )
  ) {
    throw new Error("Invalid active Global Radar score evaluation set.");
  }
  return Object.freeze({
    scoreAsOf: scoreAsOf.toISOString(),
    evidenceBoundaryOrdinal: evidence.at(-1)!.ingestOrdinal,
    evidenceSetCount: evidence.length,
    evidenceSetDigest: createGlobalRadarFingerprint({
      version: "global-radar-score-evaluation-set-v1",
      evidence: evidence.map(canonicalScoreEvaluationEvidenceRow),
    }),
  });
}

export function createWorkerScoreEvidenceSnapshot(
  signal: PersistableRadarSignal,
  entityIds: ReadonlyMap<string, string>,
  corporateGroupIdsByEntityRef?: ReadonlyMap<string, string | null>,
): ActiveScoreEvidenceSnapshot {
  const evidence = persistableScoreEvidenceSources(signal);
  const ingestOrdinalByFingerprint = new Map(
    [...signal.evidence]
      .sort((left, right) =>
        left.evidenceFingerprint.localeCompare(right.evidenceFingerprint),
      )
      .map((item, index) => [item.evidenceFingerprint, index + 1] as const),
  );
  if (ingestOrdinalByFingerprint.size !== signal.evidence.length) {
    throw new Error("Invalid duplicate Global Radar score evidence.");
  }
  const evaluationEvidence: StoredScoreEvaluationEvidenceRow[] = signal.evidence.map(
    (item) => {
      const globalEntityId =
        item.contributorEntityRef === null
          ? null
          : (entityIds.get(item.contributorEntityRef) ?? null);
      if (item.contributorEntityRef !== null && globalEntityId === null) {
        throw new Error("Invalid active Global Radar score evaluation entity.");
      }
      return {
        ingestOrdinal: ingestOrdinalByFingerprint.get(
          item.evidenceFingerprint,
        )!,
        evidenceFingerprint: item.evidenceFingerprint,
        globalEntityId,
        sourceUrl: item.sourceUrl,
        canonicalSourceUrl: item.canonicalSourceUrl,
        sourceName: item.sourceName,
        sourceType: item.sourceType,
        sourceLanguage: item.sourceLanguage,
        sourceCountry: item.sourceCountry,
        sourceFamily: item.sourceFamily,
        evidenceClaim: item.claim,
        sourceExcerpt: item.sourceExcerpt,
        englishSummary: item.englishSummary,
        publishedAt: item.publishedAt === null ? null : new Date(item.publishedAt),
        observedAt: new Date(item.observedAt),
        evidenceConfidence: item.evidenceConfidence,
        translationConfidence: item.translationConfidence,
        isPrimarySource: item.isPrimarySource,
        isSyndicated: item.isSyndicated,
        supportsDirectDemand: item.supportsDirectDemand,
        supportsIndiaRelevance: item.supportsIndiaRelevance,
        supportedFieldPaths: item.supportedFieldPaths,
      };
    },
  );
  const evaluation = createActiveScoreEvaluationMetadata({
    scoreAsOf: new Date(signal.scoreAsOf),
    evidence: evaluationEvidence,
  });
  return createActiveScoreEvidenceSnapshot({
    ...evaluation,
    scoreInputDigest: createPersistableGlobalRadarScoreInputDigest(
      signal,
      entityIds,
      corporateGroupIdsByEntityRef,
    ),
    signalClass: signal.signalClass,
    signalType: signal.signalType,
    indiaRelevanceType: signal.indiaRelevance.relevanceType,
    scorePolicyVersion: signal.score.scoreVersion,
    momentumPolicyVersion:
      signal.signalClass === "ecosystem_momentum"
        ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
        : null,
    assessmentAuthority: "worker",
    actionabilityInput:
      signal.signalClass === "direct_demand"
        ? signal.actionabilityInput
        : null,
    momentumContributorEntityIds:
      signal.signalClass === "ecosystem_momentum"
        ? signal.associatedEntities.flatMap(({ entityRef, role }) =>
            role === "contributor" ? [entityRef] : [],
          )
        : undefined,
    freshnessEvidencePath:
      signal.signalClass === "direct_demand"
        ? selectDirectDemandFreshnessEvidencePath({
            announcedAt: signal.announcedAt,
            effectiveFrom: signal.effectiveFrom,
            evidence,
          })
        : undefined,
    components: persistableScoreComponents(signal),
    evidence,
  });
}

export function storedScoreComponents(
  signal: GlobalRadarSignal,
): Readonly<Record<string, unknown>> {
  if (signal.signalClass === "direct_demand") {
    return {
      demandExplicitness: signal.demandExplicitness,
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
  }
  if (signal.signalClass === "demand_precursor") {
    return {
      evidenceConfidence: signal.evidenceConfidence,
      proximityToExternalDemand: signal.proximityToExternalDemand,
      fundingDeploymentMomentum: signal.fundingDeploymentMomentum,
      likelyDataHardwareIntensity: signal.likelyDataHardwareIntensity,
      indiaFit: signal.indiaFit,
      estimatedTimeHorizon: signal.estimatedTimeHorizon,
      strategicRelevance: signal.strategicRelevance,
    };
  }
  return {
    independentEntityCount: signal.momentumIndependentEntityCount,
    primarySourceCount: signal.momentumPrimarySourceCount,
    sourceFamilyCount: signal.momentumSourceFamilyCount,
    volume7Days: signal.momentumVolume7Days,
    volume30Days: signal.momentumVolume30Days,
    volume90Days: signal.momentumVolume90Days,
    independentEntityBreadth: signal.momentumIndependentEntityBreadth,
    primarySourceDepth: signal.momentumPrimarySourceDepth,
    sourceDiversity: signal.momentumSourceDiversity,
    weightedVolume: signal.momentumWeightedVolume,
    growthVsPreviousPeriod: signal.momentumGrowthVsPreviousPeriod,
    taxonomyConsistency: signal.momentumTaxonomyConsistency,
    evidenceQuality: signal.momentumEvidenceQuality,
  };
}

export function emptyMomentumEvidenceWindowBounds(
  snapshot: ActiveScoreEvidenceSnapshot,
): Readonly<{ asOf: Date; cutoff: Date }> | null {
  const window = snapshot.emptyMomentumEvidenceWindow;
  if (window === undefined) return null;
  const asOf = new Date(window.asOf);
  return {
    asOf,
    cutoff: new Date(
      asOf.getTime() - window.maximumAgeDays * 24 * 60 * 60 * 1_000,
    ),
  };
}

export function eligibleMomentumEvidenceInWindowConditions(input: Readonly<{
  signalId: string;
  contributorEntityIds: readonly string[];
  cutoff: Date;
  asOf: Date;
}>) {
  if (input.contributorEntityIds.length === 0) {
    throw new Error(
      "Cannot validate a momentum evidence window without contributors.",
    );
  }
  return and(
    eq(globalSignalEvidence.signalId, input.signalId),
    eq(globalSignalEvidence.isSyndicated, false),
    isNotNull(globalSignalEvidence.globalEntityId),
    inArray(
      globalSignalEvidence.globalEntityId,
      input.contributorEntityIds,
    ),
    gte(globalSignalEvidence.observedAt, input.cutoff),
    lte(globalSignalEvidence.observedAt, input.asOf),
  );
}

export type StoredScoreEvidenceRow = Readonly<{
  evidenceFingerprint: string;
  sourceUrl: string;
  sourceName: string;
  evidenceClaim: string;
  globalEntityId: string | null;
  evidenceConfidence: number;
  publishedAt: Date | null;
  observedAt: Date;
  isPrimarySource: boolean;
  isSyndicated: boolean;
  sourceFamily: string;
  supportedFieldPaths: readonly string[];
}>;

export function storedScoreEvidenceSources(
  evidence: readonly StoredScoreEvidenceRow[],
): readonly ScoreEvidenceSource[] {
  return evidence.map((item) => ({
    id: item.evidenceFingerprint,
    sourceUrl: item.sourceUrl,
    sourceName: item.sourceName,
    evidenceClaim: item.evidenceClaim,
    contributorEntityId: item.globalEntityId,
    evidenceConfidence: item.evidenceConfidence,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    observedAt: item.observedAt.toISOString(),
    isPrimarySource: item.isPrimarySource,
    isSyndicated: item.isSyndicated,
    sourceFamily: item.sourceFamily,
    supportedFieldPaths: item.supportedFieldPaths,
  }));
}

export function createStoredScoreEvidenceSnapshot(input: Readonly<{
  scoreInputDigest: string;
  scoreAsOf: Date;
  signalClass: "direct_demand" | "demand_precursor" | "ecosystem_momentum";
  signalType: string;
  indiaRelevanceType: IndiaRelevanceType;
  scorePolicyVersion: "global-radar-score-v1";
  momentumPolicyVersion: "global-radar-momentum-v1" | null;
  assessmentAuthority: ScoreAssessmentAuthority;
  actionabilityInput: number | null;
  momentumContributorEntityIds?: readonly string[];
  announcedAt: Date | null;
  effectiveFrom: Date | null;
  components: Readonly<Record<string, unknown>>;
  evidence: readonly StoredScoreEvaluationEvidenceRow[];
  freshnessEvidencePath?: DirectDemandFreshnessEvidencePath;
}>): ActiveScoreEvidenceSnapshot {
  if (
    input.signalClass === "demand_precursor" &&
    typeof input.components.estimatedTimeHorizon === "number" &&
    input.effectiveFrom === null
  ) {
    throw new Error("Invalid stored Global Radar time-horizon provenance.");
  }
  const evidence = storedScoreEvidenceSources(input.evidence);
  const evaluation = createActiveScoreEvaluationMetadata({
    scoreAsOf: input.scoreAsOf,
    evidence: input.evidence,
  });
  return createActiveScoreEvidenceSnapshot({
    ...evaluation,
    scoreInputDigest: input.scoreInputDigest,
    signalClass: input.signalClass,
    signalType: input.signalType,
    indiaRelevanceType: input.indiaRelevanceType,
    scorePolicyVersion: input.scorePolicyVersion,
    momentumPolicyVersion: input.momentumPolicyVersion,
    assessmentAuthority: input.assessmentAuthority,
    actionabilityInput: input.actionabilityInput,
    momentumContributorEntityIds: input.momentumContributorEntityIds,
    freshnessEvidencePath:
      input.freshnessEvidencePath ??
      (input.signalClass === "direct_demand"
        ? selectDirectDemandFreshnessEvidencePath({
            announcedAt: input.announcedAt?.toISOString() ?? null,
            effectiveFrom: input.effectiveFrom?.toISOString() ?? null,
            evidence,
          })
        : undefined),
    components: input.components,
    evidence,
  });
}

export function rebaseStoredScoreEvidenceSnapshot(input: Readonly<{
  scoreInputDigest: string;
  scoreAsOf?: Date;
  existingSnapshot: unknown;
  signalClass: "direct_demand" | "demand_precursor" | "ecosystem_momentum";
  signalType: string;
  currentIndiaRelevanceType: IndiaRelevanceType;
  nextIndiaRelevanceType: IndiaRelevanceType;
  scorePolicyVersion: "global-radar-score-v1";
  momentumPolicyVersion: "global-radar-momentum-v1" | null;
  currentComponents: Readonly<Record<string, unknown>>;
  nextComponents: Readonly<Record<string, unknown>>;
  replacementComponents: readonly ScoreEvidenceComponent[];
  momentumContributorEntityIds?: readonly string[];
  announcedAt: Date | null;
  effectiveFrom: Date | null;
  existingEvidence: readonly StoredScoreEvidenceRow[];
  evidence: readonly StoredScoreEvidenceRow[];
  evaluationEvidence?: readonly StoredScoreEvaluationEvidenceRow[];
  emptyMomentumEvidenceWindow?: EmptyMomentumEvidenceWindow;
}>): ActiveScoreEvidenceSnapshot {
  const existing = parseActiveScoreEvidenceSnapshot(input.existingSnapshot, {
    signalClass: input.signalClass,
    signalType: input.signalType,
    indiaRelevanceType: input.currentIndiaRelevanceType,
    scorePolicyVersion: input.scorePolicyVersion,
    momentumPolicyVersion: input.momentumPolicyVersion,
    components: input.currentComponents,
  });
  if (!existing) {
    throw new Error("Invalid stored Global Radar score-evidence snapshot.");
  }
  if (
    input.signalClass === "demand_precursor" &&
    (typeof input.currentComponents.estimatedTimeHorizon === "number" ||
      typeof input.nextComponents.estimatedTimeHorizon === "number") &&
    input.effectiveFrom === null
  ) {
    throw new Error("Invalid stored Global Radar time-horizon provenance.");
  }
  const replacementNames = new Set(input.replacementComponents);
  const replacementValues = Object.fromEntries(
    input.replacementComponents.map((component) => [
      component,
      input.nextComponents[component],
    ]),
  );
  const existingEvidence = storedScoreEvidenceSources(input.existingEvidence);
  const replacementEvidence = storedScoreEvidenceSources(input.evidence);
  const finalEvidenceByFingerprint = new Map(
    existingEvidence.map((source) => [source.id, source]),
  );
  for (const source of replacementEvidence) {
    if (!finalEvidenceByFingerprint.has(source.id)) {
      finalEvidenceByFingerprint.set(source.id, source);
    }
  }
  const finalEvidence = [...finalEvidenceByFingerprint.values()];
  const freshnessEvidencePath =
    input.signalClass === "direct_demand"
      ? directDemandFreshnessEvidencePathFromSnapshot(existing)
      : undefined;
  if (
    input.signalClass === "direct_demand" &&
    (freshnessEvidencePath === null ||
      (freshnessEvidencePath === "signal.announcedAt" &&
        input.announcedAt === null) ||
      (freshnessEvidencePath === "signal.effectiveFrom" &&
        input.effectiveFrom === null))
  ) {
    throw new Error("Invalid stored Global Radar freshness provenance.");
  }
  const semanticFreshnessEvidencePath = freshnessEvidencePath ?? undefined;
  if (
    !hasValidActiveScoreEvidenceCitations({
      snapshot: existing,
      signalType: input.signalType,
      indiaRelevanceType: input.currentIndiaRelevanceType,
      actionabilityInput:
        existing.componentEvidence.find(
          ({ component }) => component === "actionability",
        )?.inputValue ?? null,
      momentumContributorEntityIds: input.momentumContributorEntityIds,
      freshnessEvidencePath: semanticFreshnessEvidencePath,
      evidence: existingEvidence,
    })
  ) {
    throw new Error("Invalid stored Global Radar score-evidence citations.");
  }
  const actionabilityInput =
    existing.componentEvidence.find(
      ({ component }) => component === "actionability",
    )?.inputValue ?? null;
  const replacements = deriveScoreComponentEvidenceAssociations({
    signalClass: input.signalClass,
    signalType: input.signalType,
    indiaRelevanceType: input.nextIndiaRelevanceType,
    assessmentAuthority: existing.assessmentAuthority,
    actionabilityInput,
    momentumContributorEntityIds: input.momentumContributorEntityIds,
    freshnessEvidencePath: semanticFreshnessEvidencePath,
    components: replacementValues,
    evidence: replacementEvidence,
    emptyMomentumEvidenceWindow: input.emptyMomentumEvidenceWindow,
  }).map(
    (association): ActiveScoreComponentEvidenceAssociation => ({
      ...association,
      evidence: association.evidence.map(({ id, matchedFieldPaths }) => ({
        evidenceFingerprint: id,
        matchedFieldPaths: [...matchedFieldPaths],
      })),
    }),
  );
  const componentEvidence = [
    ...existing.componentEvidence.filter(
      ({ component }) => !replacementNames.has(component),
    ),
    ...replacements,
  ];
  const replacesDeterministicMomentumComponent =
    input.signalClass === "ecosystem_momentum" &&
    input.replacementComponents.some(
      (component) =>
        component !== "taxonomyConsistency" &&
        component !== "evidenceQuality",
    );
  const emptyMomentumEvidenceWindow = replacesDeterministicMomentumComponent
    ? input.emptyMomentumEvidenceWindow
    : existing.emptyMomentumEvidenceWindow;
  const evaluation =
    input.scoreAsOf === undefined && input.evaluationEvidence === undefined
      ? {
          scoreAsOf: existing.scoreAsOf,
          evidenceBoundaryOrdinal: existing.evidenceBoundaryOrdinal,
          evidenceSetCount: existing.evidenceSetCount,
          evidenceSetDigest: existing.evidenceSetDigest,
          scoreInputDigest: existing.scoreInputDigest,
        }
      : input.scoreAsOf !== undefined && input.evaluationEvidence !== undefined
        ? createActiveScoreEvaluationMetadata({
            scoreAsOf: input.scoreAsOf,
            evidence: input.evaluationEvidence,
          })
        : null;
  if (evaluation === null) {
    throw new Error("Invalid active Global Radar score evaluation set.");
  }
  return createActiveScoreEvidenceSnapshotFromAssociations({
    ...evaluation,
    scoreInputDigest: input.scoreInputDigest,
    signalClass: input.signalClass,
    signalType: input.signalType,
    indiaRelevanceType: input.nextIndiaRelevanceType,
    scorePolicyVersion: input.scorePolicyVersion,
    momentumPolicyVersion: input.momentumPolicyVersion,
    assessmentAuthority: existing.assessmentAuthority,
    emptyMomentumEvidenceWindow,
    actionabilityInput,
    momentumContributorEntityIds: input.momentumContributorEntityIds,
    freshnessEvidencePath: semanticFreshnessEvidencePath,
    components: input.nextComponents,
    componentEvidence,
    evidence: finalEvidence,
  });
}
