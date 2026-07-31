import {
  asc,
  and,
  eq,
  inArray,
  lte,
} from "drizzle-orm";

import {
  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
  MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS,
  MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS,
  assessComplianceReview,
  createGlobalRadarMomentumPolicy,
  deriveEcosystemMomentum,
  deriveGlobalRadarReclassification,
  directDemandFreshnessEvidencePathFromSnapshot,
  hasValidActiveScoreEvidenceCitations,
  isProfessionalResponsePathEvidenceField,
  parseActiveScoreEvidenceSnapshot,
  scoreDemandPrecursor,
  scoreDirectDemand,
  scoreEcosystemMomentum,
  type ActiveScoreEvidenceSnapshot,
  type CandidateEvidence,
  type MomentumPolicy,
  type ProfessionalResponsePath,
  type SensitiveDataAndCompliance,
} from "../../app/domain/global-radar";
import type { MewtualsDatabase } from "../client";
import {
  globalEntities,
  globalRadarSignalEntities,
  globalSignalEvidence,
} from "../global-radar-schema";
import type {
  GlobalRadarSignal,
  GlobalSignalEvidence,
} from "../types";
import {
  createActiveScoreEvaluationMetadata,
  createStoredGlobalRadarScoreInputDigest,
  emptyMomentumEvidenceWindowBounds,
  storedScoreComponents,
  storedScoreEvidenceSources,
} from "./global-radar-score-evidence";

type GlobalRadarScoreProvenanceReader = Pick<MewtualsDatabase, "select">;

export const globalRadarScoreProvenanceFailureReasons = Object.freeze([
  "scoring_policy_mismatch",
  "aggregate_score_mismatch",
  "active_snapshot_mismatch",
  "score_input_mismatch",
  "evidence_evaluation_mismatch",
  "cited_evidence_unresolved",
  "momentum_contributor_mismatch",
  "empty_momentum_window_mismatch",
  "freshness_anchor_mismatch",
  "time_horizon_anchor_mismatch",
  "actionability_mismatch",
  "citation_semantics_mismatch",
  "deterministic_score_mismatch",
] as const);

export type GlobalRadarScoreProvenanceFailureReason =
  (typeof globalRadarScoreProvenanceFailureReasons)[number];

export type GlobalRadarStoredScoreProvenanceResult =
  | Readonly<{
      valid: true;
      snapshot: ActiveScoreEvidenceSnapshot;
      evaluationEvidence: readonly GlobalSignalEvidence[];
      citedEvidence: readonly GlobalSignalEvidence[];
      momentumContributorEntityIds: readonly string[];
    }>
  | Readonly<{
      valid: false;
      reason: GlobalRadarScoreProvenanceFailureReason;
    }>;

type ValidGlobalRadarStoredScoreProvenance = Extract<
  GlobalRadarStoredScoreProvenanceResult,
  { valid: true }
>;

export type GlobalRadarStoredScoreProvenanceBatchResult =
  | Readonly<{ valid: true }>
  | Readonly<{
      valid: false;
      signalId: string;
      reason: GlobalRadarScoreProvenanceFailureReason;
    }>;

type GlobalRadarStoredScoreProvenanceChunkResult =
  | Readonly<{
      valid: true;
      items: readonly Readonly<{
        signalId: string;
        provenance: ValidGlobalRadarStoredScoreProvenance;
      }>[];
    }>
  | Extract<GlobalRadarStoredScoreProvenanceBatchResult, { valid: false }>;

const MAX_ACTIVE_SCORE_EVIDENCE_FINGERPRINTS =
  13 * MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS;
const MAX_STORED_SCORE_PROVENANCE_BATCH_SIGNALS = 100;
const MAX_STORED_SCORE_PROVENANCE_ASSOCIATIONS_PER_SIGNAL = 50;
export const MAX_STORED_SCORE_PROVENANCE_SELECTION_SIGNALS = 21;

export type GlobalRadarStoredScoreProvenanceSelectionResult =
  GlobalRadarStoredScoreProvenanceChunkResult;

function invalid(
  reason: GlobalRadarScoreProvenanceFailureReason,
): GlobalRadarStoredScoreProvenanceResult {
  return { valid: false, reason };
}

function storedSensitiveDataAndCompliance(
  signal: GlobalRadarSignal,
): SensitiveDataAndCompliance {
  return {
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
  };
}

function storedScoringPolicyMatches(signal: GlobalRadarSignal): boolean {
  return (
    signal.scorePolicyVersion === GLOBAL_RADAR_SCORE_VERSION &&
    (signal.signalClass === "ecosystem_momentum"
      ? signal.momentumPolicyVersion === GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
      : signal.momentumPolicyVersion === null)
  );
}

function storedAggregateScoreMatches(signal: GlobalRadarSignal): boolean {
  if (signal.signalClass === "direct_demand") {
    const score = scoreDirectDemand({
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
    });
    return (
      score.valid &&
      score.score === signal.directDemandScore &&
      score.scoreCoverage === signal.scoreCoverage
    );
  }
  if (signal.signalClass === "demand_precursor") {
    const score = scoreDemandPrecursor({
      evidenceConfidence: signal.evidenceConfidence,
      proximityToExternalDemand: signal.proximityToExternalDemand,
      fundingDeploymentMomentum: signal.fundingDeploymentMomentum,
      likelyDataHardwareIntensity: signal.likelyDataHardwareIntensity,
      indiaFit: signal.indiaFit,
      estimatedTimeHorizon: signal.estimatedTimeHorizon,
      strategicRelevance: signal.strategicRelevance,
    });
    return (
      score.valid &&
      score.score === signal.precursorScore &&
      score.scoreCoverage === signal.scoreCoverage
    );
  }
  const score = scoreEcosystemMomentum({
    independentEntityBreadth: signal.momentumIndependentEntityBreadth,
    primarySourceDepth: signal.momentumPrimarySourceDepth,
    sourceDiversity: signal.momentumSourceDiversity,
    weightedVolume: signal.momentumWeightedVolume,
    growthVsPreceding: signal.momentumGrowthVsPreviousPeriod,
    taxonomyConsistency: signal.momentumTaxonomyConsistency,
    evidenceQuality: signal.momentumEvidenceQuality,
  });
  const qualificationGatesPassed =
    (signal.momentumIndependentEntityCount ?? -1) >= 2 &&
    (signal.momentumVolume90Days ?? -1) >= 2 &&
    (signal.momentumPrimarySourceCount ?? -1) >= 1 &&
    (signal.momentumTaxonomyConsistency ?? -1) >= 70 &&
    (signal.momentumEvidenceQuality ?? -1) >= 60;
  return (
    score.valid &&
    score.score === signal.momentumScore &&
    score.scoreCoverage === signal.scoreCoverage &&
    signal.momentumQualificationGatesPassed === qualificationGatesPassed
  );
}

type StoredScoreEntityIdentity = Readonly<{
  id: string;
  canonicalCorporateGroupId: string | null;
}>;

function candidateEvidenceFromEvaluationSet(
  evidence: readonly GlobalSignalEvidence[],
  entityById: ReadonlyMap<string, StoredScoreEntityIdentity>,
): readonly CandidateEvidence[] {
  return evidence.map((item) => {
    const entity =
      item.globalEntityId === null
        ? null
        : (entityById.get(item.globalEntityId) ?? null);
    const unresolvedIdentity = item.evidenceFingerprint;
    return {
      sourceUrl: item.sourceUrl,
      canonicalSourceUrl: item.canonicalSourceUrl,
      sourceKind: "original",
      sourceLanguage: item.sourceLanguage,
      originalText: item.evidenceClaim,
      englishSummary: item.englishSummary,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      observedAt: item.observedAt.toISOString(),
      evidenceConfidence: item.evidenceConfidence,
      translationConfidence: item.translationConfidence,
      isPrimarySource: item.isPrimarySource,
      isOfficialProcurementSource:
        item.sourceFamily === "public_procurement_and_rfp_portals",
      supportsDirectDemand: item.supportsDirectDemand,
      isSyndicated: item.isSyndicated,
      organizationId: entity?.id ?? unresolvedIdentity,
      corporateGroupId:
        entity?.canonicalCorporateGroupId ??
        (entity === null ? unresolvedIdentity : `group:${entity.id}`),
      supportedFieldPaths: [...item.supportedFieldPaths],
    };
  });
}

function storedResponsePathCandidates(
  signal: GlobalRadarSignal,
  evidence: readonly GlobalSignalEvidence[],
): readonly (ProfessionalResponsePath | null)[] {
  if (
    signal.responsePathType === null &&
    signal.responsePathUrl === null &&
    signal.responseBusinessEmail === null
  ) {
    return [null];
  }
  const emailPath = signal.responsePathType === "official_business_email";
  if (
    signal.responsePathType === null ||
    (emailPath &&
      (signal.responseBusinessEmail === null || signal.responsePathUrl !== null)) ||
    (!emailPath &&
      (signal.responsePathUrl === null || signal.responseBusinessEmail !== null))
  ) {
    return [];
  }
  return evidence
    .filter(
      (item) =>
        item.isPrimarySource &&
        item.supportedFieldPaths.some(isProfessionalResponsePathEvidenceField),
    )
    .map((item) => ({
      type: signal.responsePathType!,
      url: emailPath ? null : signal.responsePathUrl,
      businessEmail: emailPath ? signal.responseBusinessEmail : null,
      evidenceUrl: item.sourceUrl,
    }));
}

function directDerivationMatches(
  signal: GlobalRadarSignal,
  snapshot: ActiveScoreEvidenceSnapshot,
  evidence: readonly GlobalSignalEvidence[],
  entityById: ReadonlyMap<string, StoredScoreEntityIdentity>,
): boolean {
  const actionabilityInput =
    snapshot.componentEvidence.find(
      ({ component }) => component === "actionability",
    )?.inputValue ?? null;
  const candidateEvidence = candidateEvidenceFromEvaluationSet(
    evidence,
    entityById,
  );
  const responsePaths = storedResponsePathCandidates(signal, evidence);
  for (const responsePath of responsePaths) {
    const derived = deriveGlobalRadarReclassification({
      signalClass: "direct_demand",
      signalType: signal.signalType,
      currentStatus: signal.status,
      indiaRelevanceType: signal.indiaRelevanceType,
      announcedAt: signal.announcedAt?.toISOString() ?? null,
      effectiveFrom: signal.effectiveFrom?.toISOString() ?? null,
      observedAt: signal.observedAt.toISOString(),
      expiresAt: signal.expiresAt?.toISOString() ?? null,
      responsePath,
      sensitiveDataAndCompliance: storedSensitiveDataAndCompliance(signal),
      assessments: {
        actionability: actionabilityInput,
        commercialPotential: signal.commercialPotential,
        repeatability: signal.repeatability,
        strategicLearning: signal.strategicLearning,
        complianceComplexity: signal.complianceComplexity,
      },
      evidence: candidateEvidence,
      now: new Date(snapshot.scoreAsOf),
    });
    if (
      derived.valid &&
      derived.signalClass === "direct_demand" &&
      derived.score.score === signal.directDemandScore &&
      derived.score.scoreCoverage === signal.scoreCoverage &&
      derived.score.components.explicitness === signal.demandExplicitness &&
      derived.score.components.evidenceConfidence === signal.evidenceConfidence &&
      derived.score.components.freshness === signal.freshness &&
      derived.score.components.actionability === signal.actionability &&
      derived.score.components.indiaFit === signal.indiaFit &&
      derived.score.components.commercialPotential === signal.commercialPotential &&
      derived.score.components.repeatability === signal.repeatability &&
      derived.score.components.responseAccessibility === signal.responseAccessibility &&
      derived.score.components.strategicLearning === signal.strategicLearning &&
      derived.score.components.complianceComplexity === signal.complianceComplexity
    ) {
      return true;
    }
  }
  return false;
}

function precursorDerivationMatches(
  signal: GlobalRadarSignal,
  snapshot: ActiveScoreEvidenceSnapshot,
  evidence: readonly GlobalSignalEvidence[],
  entityById: ReadonlyMap<string, StoredScoreEntityIdentity>,
): boolean {
  const candidateEvidence = candidateEvidenceFromEvaluationSet(
    evidence,
    entityById,
  );
  const responsePaths = storedResponsePathCandidates(signal, evidence);
  for (const responsePath of responsePaths) {
    const derived = deriveGlobalRadarReclassification({
      signalClass: "demand_precursor",
      signalType: signal.signalType,
      currentStatus: signal.status,
      indiaRelevanceType: signal.indiaRelevanceType,
      announcedAt: signal.announcedAt?.toISOString() ?? null,
      effectiveFrom: signal.effectiveFrom?.toISOString() ?? null,
      observedAt: signal.observedAt.toISOString(),
      responsePath,
      sensitiveDataAndCompliance: storedSensitiveDataAndCompliance(signal),
      assessments: {
        proximityToExternalDemand: signal.proximityToExternalDemand,
        fundingDeploymentMomentum: signal.fundingDeploymentMomentum,
        likelyDataHardwareIntensity: signal.likelyDataHardwareIntensity,
        strategicRelevance: signal.strategicRelevance,
      },
      evidence: candidateEvidence,
      now: new Date(snapshot.scoreAsOf),
    });
    if (
      derived.valid &&
      derived.signalClass === "demand_precursor" &&
      derived.score.score === signal.precursorScore &&
      derived.score.scoreCoverage === signal.scoreCoverage &&
      derived.score.components.evidenceConfidence === signal.evidenceConfidence &&
      derived.score.components.proximityToExternalDemand === signal.proximityToExternalDemand &&
      derived.score.components.fundingDeploymentMomentum === signal.fundingDeploymentMomentum &&
      derived.score.components.likelyDataHardwareIntensity === signal.likelyDataHardwareIntensity &&
      derived.score.components.indiaFit === signal.indiaFit &&
      derived.score.components.estimatedTimeHorizon === signal.estimatedTimeHorizon &&
      derived.score.components.strategicRelevance === signal.strategicRelevance
    ) {
      return true;
    }
  }
  return false;
}

function momentumDerivationMatches(
  signal: GlobalRadarSignal,
  snapshot: ActiveScoreEvidenceSnapshot,
  evidence: readonly GlobalSignalEvidence[],
  contributorEntityIds: readonly string[],
  entityById: ReadonlyMap<string, StoredScoreEntityIdentity>,
): boolean {
  const contributors = new Set(contributorEntityIds);
  const observations = evidence.flatMap((item) => {
    if (
      item.isSyndicated ||
      item.globalEntityId === null ||
      !contributors.has(item.globalEntityId)
    ) {
      return [];
    }
    const entity = entityById.get(item.globalEntityId);
    if (!entity) return [];
    return [
      {
        evidenceId: item.evidenceFingerprint,
        entityId: entity.id,
        corporateGroupId:
          entity.canonicalCorporateGroupId ?? `group:${entity.id}`,
        sourceId: item.evidenceFingerprint,
        sourceFamily: item.sourceFamily,
        isPrimarySource: item.isPrimarySource,
        observedAt: item.observedAt.toISOString(),
      },
    ];
  });
  const derived = deriveEcosystemMomentum(
    {
      taxonomy: signal.demandDomain,
      taxonomyConsistency: signal.momentumTaxonomyConsistency,
      evidenceQuality: signal.momentumEvidenceQuality,
      observations,
    },
    createGlobalRadarMomentumPolicy(
      signal.demandDomain as MomentumPolicy["taxonomy"],
    ),
    { now: () => new Date(snapshot.scoreAsOf) },
  );
  return (
    derived.valid &&
    derived.score === signal.momentumScore &&
    derived.scoreCoverage === signal.scoreCoverage &&
    derived.qualificationGatesPassed ===
      signal.momentumQualificationGatesPassed &&
    derived.counts.independentEntities ===
      signal.momentumIndependentEntityCount &&
    derived.counts.primarySources === signal.momentumPrimarySourceCount &&
    derived.counts.sourceFamilies === signal.momentumSourceFamilyCount &&
    derived.windows.days7.recent === signal.momentumVolume7Days &&
    derived.windows.days30.recent === signal.momentumVolume30Days &&
    derived.windows.days90.recent === signal.momentumVolume90Days &&
    derived.components.independentEntityBreadth ===
      signal.momentumIndependentEntityBreadth &&
    derived.components.primarySourceDepth ===
      signal.momentumPrimarySourceDepth &&
    derived.components.sourceDiversity === signal.momentumSourceDiversity &&
    derived.components.weightedVolume === signal.momentumWeightedVolume &&
    derived.components.growthVsPreceding ===
      signal.momentumGrowthVsPreviousPeriod &&
    derived.components.taxonomyConsistency ===
      signal.momentumTaxonomyConsistency &&
    derived.components.evidenceQuality === signal.momentumEvidenceQuality
  );
}

function parsedActiveSnapshot(
  signal: GlobalRadarSignal,
  scoreInputDigest?: string,
): ActiveScoreEvidenceSnapshot | null {
  return parseActiveScoreEvidenceSnapshot(signal.scoreEvidenceSnapshot, {
    signalClass: signal.signalClass,
    signalType: signal.signalType,
    indiaRelevanceType: signal.indiaRelevanceType,
    scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
    momentumPolicyVersion:
      signal.signalClass === "ecosystem_momentum"
        ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
        : null,
    scoreInputDigest,
    components: storedScoreComponents(signal),
  });
}

type PreparedStoredScoreProvenance = Readonly<{
  signal: GlobalRadarSignal;
  snapshot: ActiveScoreEvidenceSnapshot;
  fingerprints: readonly string[];
}>;

function prepareStoredScoreProvenance(
  signal: GlobalRadarSignal,
):
  | Readonly<{ valid: true; prepared: PreparedStoredScoreProvenance }>
  | Readonly<{
      valid: false;
      reason: GlobalRadarScoreProvenanceFailureReason;
    }> {
  if (!storedScoringPolicyMatches(signal)) {
    return { valid: false, reason: "scoring_policy_mismatch" };
  }
  if (!storedAggregateScoreMatches(signal)) {
    return { valid: false, reason: "aggregate_score_mismatch" };
  }
  const snapshot = parsedActiveSnapshot(signal);
  if (!snapshot) return { valid: false, reason: "active_snapshot_mismatch" };
  if (
    snapshot.evidenceBoundaryOrdinal >
      MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS ||
    snapshot.evidenceSetCount > MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS
  ) {
    return { valid: false, reason: "evidence_evaluation_mismatch" };
  }
  const fingerprints = [
    ...new Set(
      snapshot.componentEvidence.flatMap(({ evidence }) =>
        evidence.map(({ evidenceFingerprint }) => evidenceFingerprint),
      ),
    ),
  ];
  if (
    fingerprints.length === 0 ||
    fingerprints.length > MAX_ACTIVE_SCORE_EVIDENCE_FINGERPRINTS
  ) {
    return { valid: false, reason: "cited_evidence_unresolved" };
  }
  return {
    valid: true,
    prepared: { signal, snapshot, fingerprints },
  };
}

function validatePreparedStoredScoreProvenance(input: Readonly<{
  prepared: PreparedStoredScoreProvenance;
  evidence: readonly GlobalSignalEvidence[];
  momentumContributorEntityIds: readonly string[];
  associations: readonly Readonly<{
    globalEntityId: string;
    role: string;
  }>[];
  entityById: ReadonlyMap<string, StoredScoreEntityIdentity>;
}>): GlobalRadarStoredScoreProvenanceResult {
  const { signal, snapshot, fingerprints } = input.prepared;
  let evaluation;
  try {
    evaluation = createActiveScoreEvaluationMetadata({
      scoreAsOf: new Date(snapshot.scoreAsOf),
      evidence: input.evidence,
    });
  } catch {
    return invalid("evidence_evaluation_mismatch");
  }
  if (
    evaluation.evidenceBoundaryOrdinal !== snapshot.evidenceBoundaryOrdinal ||
    evaluation.evidenceSetCount !== snapshot.evidenceSetCount ||
    evaluation.evidenceSetDigest !== snapshot.evidenceSetDigest
  ) {
    return invalid("evidence_evaluation_mismatch");
  }
  const actionabilityInput =
    signal.signalClass === "direct_demand"
      ? (snapshot.componentEvidence.find(
          ({ component }) => component === "actionability",
        )?.inputValue ?? null)
      : null;
  const scoreInputEntityIds = new Set([
    ...(signal.globalEntityId === null ? [] : [signal.globalEntityId]),
    ...input.associations.map(({ globalEntityId }) => globalEntityId),
    ...input.evidence.flatMap(({ globalEntityId }) =>
      globalEntityId === null ? [] : [globalEntityId],
    ),
  ]);
  const scoreInputEntities = [...scoreInputEntityIds].flatMap((entityId) => {
    const entity = input.entityById.get(entityId);
    return entity ? [entity] : [];
  });
  if (scoreInputEntities.length !== scoreInputEntityIds.size) {
    return invalid("score_input_mismatch");
  }
  let scoreInputDigest: string;
  try {
    scoreInputDigest = createStoredGlobalRadarScoreInputDigest({
      scoreAsOf: new Date(snapshot.scoreAsOf),
      signal,
      actionabilityInput,
      associations: input.associations,
      entities: scoreInputEntities,
    });
  } catch {
    return invalid("score_input_mismatch");
  }
  if (parsedActiveSnapshot(signal, scoreInputDigest) === null) {
    return invalid("score_input_mismatch");
  }
  const evaluationFingerprints = new Set(
    input.evidence.map(({ evidenceFingerprint }) => evidenceFingerprint),
  );
  if (
    fingerprints.some((fingerprint) => !evaluationFingerprints.has(fingerprint))
  ) {
    return invalid("cited_evidence_unresolved");
  }
  if (
    signal.signalClass === "ecosystem_momentum" &&
    input.momentumContributorEntityIds.length === 0
  ) {
    return invalid("momentum_contributor_mismatch");
  }
  const emptyWindowBounds = emptyMomentumEvidenceWindowBounds(snapshot);
  if (
    emptyWindowBounds !== null &&
    input.evidence.some(
      (item) =>
        !item.isSyndicated &&
        item.globalEntityId !== null &&
        input.momentumContributorEntityIds.includes(item.globalEntityId) &&
        item.observedAt >= emptyWindowBounds.cutoff &&
        item.observedAt <= emptyWindowBounds.asOf,
    )
  ) {
    return invalid("empty_momentum_window_mismatch");
  }

  const freshnessEvidencePath =
    signal.signalClass === "direct_demand"
      ? directDemandFreshnessEvidencePathFromSnapshot(snapshot)
      : undefined;
  if (
    signal.signalClass === "direct_demand" &&
    (freshnessEvidencePath === null ||
      (freshnessEvidencePath === "signal.announcedAt" &&
        signal.announcedAt === null) ||
      (freshnessEvidencePath === "signal.effectiveFrom" &&
        signal.effectiveFrom === null))
  ) {
    return invalid("freshness_anchor_mismatch");
  }
  if (
    signal.signalClass === "demand_precursor" &&
    typeof storedScoreComponents(signal).estimatedTimeHorizon === "number" &&
    signal.effectiveFrom === null
  ) {
    return invalid("time_horizon_anchor_mismatch");
  }

  let validatedActionabilityInput: number | null | undefined;
  if (signal.signalClass === "direct_demand") {
    validatedActionabilityInput = actionabilityInput;
    if (validatedActionabilityInput === null) {
      if (signal.actionability !== null) {
        return invalid("actionability_mismatch");
      }
    } else {
      const reviewed = assessComplianceReview({
        currentStatus: signal.status,
        actionability: validatedActionabilityInput,
        assessment: storedSensitiveDataAndCompliance(signal),
      });
      if (!reviewed.valid || reviewed.actionability !== signal.actionability) {
        return invalid("actionability_mismatch");
      }
    }
  }

  if (
    !hasValidActiveScoreEvidenceCitations({
      snapshot,
      signalType: signal.signalType,
      indiaRelevanceType: signal.indiaRelevanceType,
      actionabilityInput: validatedActionabilityInput,
      momentumContributorEntityIds: input.momentumContributorEntityIds,
      freshnessEvidencePath: freshnessEvidencePath ?? undefined,
      evidence: storedScoreEvidenceSources(input.evidence),
    })
  ) {
    return invalid("citation_semantics_mismatch");
  }

  const deterministicScoreMatches =
    signal.signalClass === "direct_demand"
      ? directDerivationMatches(
          signal,
          snapshot,
          input.evidence,
          input.entityById,
        )
      : signal.signalClass === "demand_precursor"
        ? precursorDerivationMatches(
            signal,
            snapshot,
            input.evidence,
            input.entityById,
          )
        : momentumDerivationMatches(
            signal,
            snapshot,
            input.evidence,
            input.momentumContributorEntityIds,
            input.entityById,
          );
  if (!deterministicScoreMatches) {
    return invalid("deterministic_score_mismatch");
  }

  return {
    valid: true,
    snapshot,
    evaluationEvidence: input.evidence,
    citedEvidence: input.evidence.filter(({ evidenceFingerprint }) =>
      fingerprints.includes(evidenceFingerprint),
    ),
    momentumContributorEntityIds: input.momentumContributorEntityIds,
  };
}

async function validateStoredGlobalRadarScoreProvenanceChunk(
  reader: GlobalRadarScoreProvenanceReader,
  signals: readonly GlobalRadarSignal[],
): Promise<GlobalRadarStoredScoreProvenanceChunkResult> {
  if (signals.length === 0) return { valid: true, items: [] };

  const prepared: PreparedStoredScoreProvenance[] = [];
  for (const signal of signals) {
    const result = prepareStoredScoreProvenance(signal);
    if (!result.valid) {
      return { valid: false, signalId: signal.id, reason: result.reason };
    }
    prepared.push(result.prepared);
  }

  const signalIds = prepared.map(({ signal }) => signal.id);
  const associationReadLimit =
    signals.length * MAX_STORED_SCORE_PROVENANCE_ASSOCIATIONS_PER_SIGNAL + 1;
  const [evidenceSets, associations] = await Promise.all([
    Promise.all(
      prepared.map(({ signal, snapshot }) =>
        reader
          .select()
          .from(globalSignalEvidence)
          .where(
            and(
              eq(globalSignalEvidence.signalId, signal.id),
              lte(
                globalSignalEvidence.ingestOrdinal,
                snapshot.evidenceBoundaryOrdinal,
              ),
            ),
          )
          .orderBy(asc(globalSignalEvidence.ingestOrdinal))
          .limit(MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS + 1)
          .for("share"),
      ),
    ),
    reader
      .select({
        signalId: globalRadarSignalEntities.signalId,
        globalEntityId: globalRadarSignalEntities.globalEntityId,
        role: globalRadarSignalEntities.role,
      })
      .from(globalRadarSignalEntities)
      .where(inArray(globalRadarSignalEntities.signalId, signalIds))
      .orderBy(
        asc(globalRadarSignalEntities.signalId),
        asc(globalRadarSignalEntities.globalEntityId),
        asc(globalRadarSignalEntities.role),
      )
      .limit(associationReadLimit)
      .for("share"),
  ]);

  const evidenceBySignalId = new Map<string, GlobalSignalEvidence[]>();
  for (const [index, evidence] of evidenceSets.entries()) {
    if (evidence.length > MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS) {
      return {
        valid: false,
        signalId: prepared[index]!.signal.id,
        reason: "evidence_evaluation_mismatch",
      };
    }
    evidenceBySignalId.set(prepared[index]!.signal.id, evidence);
  }
  const associationsBySignalId = new Map<string, typeof associations>();
  for (const association of associations) {
    const rows = associationsBySignalId.get(association.signalId) ?? [];
    rows.push(association);
    associationsBySignalId.set(association.signalId, rows);
  }
  for (const { signal } of prepared) {
    if (
      (associationsBySignalId.get(signal.id)?.length ?? 0) >
      MAX_STORED_SCORE_PROVENANCE_ASSOCIATIONS_PER_SIGNAL
    ) {
      return {
        valid: false,
        signalId: signal.id,
        reason: "score_input_mismatch",
      };
    }
  }
  const referencedEntityIds = [
    ...new Set([
      ...prepared.flatMap(({ signal }) =>
        signal.globalEntityId === null ? [] : [signal.globalEntityId],
      ),
      ...evidenceSets.flatMap((evidence) =>
        evidence.flatMap(({ globalEntityId }) =>
          globalEntityId === null ? [] : [globalEntityId],
        ),
      ),
      ...associations.map(({ globalEntityId }) => globalEntityId),
    ]),
  ];
  const entities =
    referencedEntityIds.length === 0
      ? []
      : await reader
          .select({
            id: globalEntities.id,
            canonicalCorporateGroupId:
              globalEntities.canonicalCorporateGroupId,
          })
          .from(globalEntities)
          .where(inArray(globalEntities.id, referencedEntityIds))
          .for("share");
  if (entities.length !== referencedEntityIds.length) {
    return {
      valid: false,
      signalId: signalIds[0]!,
      reason: "score_input_mismatch",
    };
  }
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));

  const items: Array<{
    signalId: string;
    provenance: ValidGlobalRadarStoredScoreProvenance;
  }> = [];
  for (const item of prepared) {
    const signalAssociations =
      associationsBySignalId.get(item.signal.id) ?? [];
    const contributorIds = [
      ...new Set(
        signalAssociations.flatMap(({ globalEntityId, role }) =>
          role === "contributor" ? [globalEntityId] : [],
        ),
      ),
    ];
    const validation = validatePreparedStoredScoreProvenance({
      prepared: item,
      evidence: evidenceBySignalId.get(item.signal.id) ?? [],
      momentumContributorEntityIds: contributorIds,
      associations: signalAssociations,
      entityById,
    });
    if (!validation.valid) {
      return {
        valid: false,
        signalId: item.signal.id,
        reason: validation.reason,
      };
    }
    items.push({ signalId: item.signal.id, provenance: validation });
  }
  return { valid: true, items };
}

/**
 * Validates score-bearing rows in deterministic fixed-size chunks. Stored
 * corruption identifies the first signal deterministically; database failures
 * throw. Callers must collapse the detailed reason at public seams.
 */
export async function validateStoredGlobalRadarScoreProvenanceBatch(
  reader: GlobalRadarScoreProvenanceReader,
  inputSignals: readonly GlobalRadarSignal[],
): Promise<GlobalRadarStoredScoreProvenanceBatchResult> {
  const signals = [
    ...new Map(inputSignals.map((signal) => [signal.id, signal])).values(),
  ].sort((left, right) => left.id.localeCompare(right.id));
  if (signals.length === 0) return { valid: true };

  for (
    let offset = 0;
    offset < signals.length;
    offset += MAX_STORED_SCORE_PROVENANCE_BATCH_SIGNALS
  ) {
    const result = await validateStoredGlobalRadarScoreProvenanceChunk(
      reader,
      signals.slice(
        offset,
        offset + MAX_STORED_SCORE_PROVENANCE_BATCH_SIGNALS,
      ),
    );
    if (!result.valid) return result;
  }
  return { valid: true };
}

/**
 * Validates a bounded caller-selected set and retains its exact provenance.
 * The hard cap keeps this API unsuitable for unbounded aggregate reads, whose
 * batch validator deliberately releases every completed chunk.
 */
export async function validateStoredGlobalRadarScoreProvenanceSelection(
  reader: GlobalRadarScoreProvenanceReader,
  inputSignals: readonly GlobalRadarSignal[],
): Promise<GlobalRadarStoredScoreProvenanceSelectionResult> {
  const signals = [
    ...new Map(inputSignals.map((signal) => [signal.id, signal])).values(),
  ].sort((left, right) => left.id.localeCompare(right.id));
  if (signals.length > MAX_STORED_SCORE_PROVENANCE_SELECTION_SIGNALS) {
    throw new RangeError(
      `Global Radar score provenance selection exceeds ${MAX_STORED_SCORE_PROVENANCE_SELECTION_SIGNALS} signals.`,
    );
  }
  return validateStoredGlobalRadarScoreProvenanceChunk(reader, signals);
}

/**
 * Resolves and validates every durable input that authorizes use of a stored
 * score. Stored corruption returns `valid: false`; database failures throw.
 */
export async function validateStoredGlobalRadarScoreProvenance(
  reader: GlobalRadarScoreProvenanceReader,
  signal: GlobalRadarSignal,
): Promise<GlobalRadarStoredScoreProvenanceResult> {
  const chunk = await validateStoredGlobalRadarScoreProvenanceChunk(reader, [
    signal,
  ]);
  if (!chunk.valid) return invalid(chunk.reason);
  const provenance = chunk.items[0]?.provenance;
  return provenance ?? invalid("active_snapshot_mismatch");
}
