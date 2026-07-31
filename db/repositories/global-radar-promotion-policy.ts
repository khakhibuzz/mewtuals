import {
  discoveryCandidateInputSchema,
  type DiscoveryBatchCandidate,
} from "../../app/domain/discovery";
import {
  createGlobalRadarFingerprint,
  evidenceClaimSupportsPositiveIndiaPath,
  evidenceSupportsDocumentedIndianRelationship,
} from "../../app/domain/global-radar";
import type {
  GlobalEntity,
  GlobalRadarPromotion,
  GlobalRadarSignal,
  GlobalSignalEvidence,
} from "../types";
import {
  REPEATED_SIGNAL_WINDOW_MS,
  promotionAttemptReasons,
  type CanonicalPromotionInput,
  type GlobalRadarPromotionConfiguration,
  type PromotionEvidenceSelectionRole,
  type PromotionAttemptReason,
  type PromotionContext,
  type SelectedPromotionEvidence,
} from "./global-radar-promotion-contracts";

export function entitySafeSnapshot(
  entity: GlobalEntity,
  attemptReason?: "persistence_failure" | PromotionAttemptReason,
) {
  return {
    id: entity.id,
    canonicalName: entity.canonicalName,
    organisationType: entity.organisationType,
    headquartersCountry: entity.headquartersCountry,
    entityStatus: entity.entityStatus,
    promotedCandidateId: entity.promotedCandidateId,
    revision: entity.revision,
    ...(attemptReason ? { attemptReason } : {}),
  };
}

export function scoreForSignal(signal: GlobalRadarSignal): number | null {
  if (signal.signalClass === "direct_demand") {
    return signal.directDemandScore;
  }
  if (signal.signalClass === "demand_precursor") {
    return signal.precursorScore;
  }
  return signal.momentumScore;
}

export function signalSafeSnapshot(signal: GlobalRadarSignal) {
  return {
    id: signal.id,
    globalEntityId: signal.globalEntityId,
    signalClass: signal.signalClass,
    status: signal.status,
    indiaRelevanceType: signal.indiaRelevanceType,
    score: scoreForSignal(signal),
    scorePolicyVersion: signal.scorePolicyVersion,
    observedAt: signal.observedAt.toISOString(),
    revision: signal.revision,
  };
}

export const GLOBAL_RADAR_PROMOTION_SOURCE_SNAPSHOT_VERSION =
  "global-radar-promotion-source-snapshot-v2" as const;

function evidenceSafeSnapshot(evidence: readonly SelectedPromotionEvidence[]) {
  return evidence
    .map((item) => ({
      selectionRoles: [...new Set(item.selectionRoles)].sort(),
      signalId: item.signalId,
      ingestOrdinal: item.ingestOrdinal,
      runId: item.runId,
      globalEntityId: item.globalEntityId,
      evidenceFingerprint: item.evidenceFingerprint,
      evidenceClaim: item.evidenceClaim,
      evidenceConfidence: item.evidenceConfidence,
      translationConfidence: item.translationConfidence,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      observedAt: item.observedAt.toISOString(),
      isPrimarySource: item.isPrimarySource,
      isSyndicated: item.isSyndicated,
      supportsDirectDemand: item.supportsDirectDemand,
      supportsIndiaRelevance: item.supportsIndiaRelevance,
      supportedFieldPaths: [...item.supportedFieldPaths].sort(),
      canonicalSourceUrl: item.canonicalSourceUrl,
      sourceUrl: item.sourceUrl,
      sourceName: item.sourceName,
      sourceType: item.sourceType,
      sourceLanguage: item.sourceLanguage,
      sourceCountry: item.sourceCountry,
      sourceFamily: item.sourceFamily,
    }))
    .sort(
      (left, right) =>
        left.signalId.localeCompare(right.signalId) ||
        left.ingestOrdinal - right.ingestOrdinal ||
        left.evidenceFingerprint.localeCompare(right.evidenceFingerprint) ||
        left.selectionRoles.join("\n").localeCompare(
          right.selectionRoles.join("\n"),
        ),
    );
}

export function sourceSnapshotDigest(
  evidence: readonly SelectedPromotionEvidence[],
) {
  return createGlobalRadarFingerprint({
    version: GLOBAL_RADAR_PROMOTION_SOURCE_SNAPSHOT_VERSION,
    evidence: evidenceSafeSnapshot(evidence),
  });
}

function evidenceSelectionKey(evidence: GlobalSignalEvidence): string {
  return `${evidence.signalId}:${evidence.evidenceFingerprint}`;
}

function evidenceHasPositiveIndiaPath(
  evidence: GlobalSignalEvidence,
  signal: GlobalRadarSignal,
): boolean {
  const exactPrefix = `indiaRelevance.${signal.indiaRelevanceType}.`;
  return (
    evidence.supportsIndiaRelevance &&
    evidence.supportedFieldPaths.some(
      (supportedFieldPath) =>
        supportedFieldPath.startsWith(exactPrefix) &&
        evidenceClaimSupportsPositiveIndiaPath({
          supportedFieldPath,
          evidenceClaim: evidence.evidenceClaim,
        }),
    )
  );
}

function independentSourceOrigin(evidence: GlobalSignalEvidence): string {
  try {
    return new URL(evidence.canonicalSourceUrl).hostname
      .toLowerCase()
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

function comparePromotionEvidence(
  left: GlobalSignalEvidence,
  right: GlobalSignalEvidence,
): number {
  return (
    right.evidenceConfidence - left.evidenceConfidence ||
    (right.publishedAt?.getTime() ?? -1) -
      (left.publishedAt?.getTime() ?? -1) ||
    right.observedAt.getTime() - left.observedAt.getTime() ||
    left.canonicalSourceUrl.localeCompare(right.canonicalSourceUrl) ||
    left.evidenceFingerprint.localeCompare(right.evidenceFingerprint)
  );
}

export type PromotionScoreEvidenceSelection = Readonly<{
  signalId: string;
  evaluationEvidence: readonly GlobalSignalEvidence[];
  citedEvidence: readonly GlobalSignalEvidence[];
}>;

export function selectPromotionEvidence(input: Readonly<{
  eligibilityPath: CanonicalPromotionInput["eligibilityPath"];
  entity: GlobalEntity;
  primarySignal: GlobalRadarSignal;
  supportingSignals: readonly GlobalRadarSignal[];
  availableEvidence: readonly GlobalSignalEvidence[];
  scoreEvidence: readonly PromotionScoreEvidenceSelection[];
}>):
  | Readonly<{ valid: true; evidence: SelectedPromotionEvidence[] }>
  | Readonly<{ valid: false; reason: "score_evidence_owner_mismatch" }> {
  const availableByKey = new Map(
    input.availableEvidence.map((evidence) => [
      evidenceSelectionKey(evidence),
      evidence,
    ]),
  );
  const signalById = new Map(
    input.supportingSignals.map((signal) => [signal.id, signal]),
  );
  const selected = new Map<
    string,
    { evidence: GlobalSignalEvidence; roles: Set<PromotionEvidenceSelectionRole> }
  >();
  const add = (
    evidence: GlobalSignalEvidence,
    role: PromotionEvidenceSelectionRole,
  ) => {
    const key = evidenceSelectionKey(evidence);
    const existing = selected.get(key) ?? {
      evidence,
      roles: new Set<PromotionEvidenceSelectionRole>(),
    };
    existing.roles.add(role);
    selected.set(key, existing);
  };

  for (const selection of input.scoreEvidence) {
    const selectedSignal = signalById.get(selection.signalId);
    const evaluationKeys = new Set(
      selection.evaluationEvidence.map(evidenceSelectionKey),
    );
    let selectedCitationCount = 0;
    for (const citedEvidence of selection.citedEvidence) {
      if (!evaluationKeys.has(evidenceSelectionKey(citedEvidence))) {
        return { valid: false, reason: "score_evidence_owner_mismatch" };
      }
      const available = availableByKey.get(evidenceSelectionKey(citedEvidence));
      if (!available || available.signalId !== selection.signalId) {
        if (
          selectedSignal?.signalClass === "ecosystem_momentum" &&
          citedEvidence.globalEntityId !== input.entity.id
        ) {
          continue;
        }
        return { valid: false, reason: "score_evidence_owner_mismatch" };
      }
      add(available, "active_score_citation");
      selectedCitationCount += 1;
    }
    if (selectedCitationCount === 0) {
      return { valid: false, reason: "score_evidence_owner_mismatch" };
    }
  }

  const addIndiaEligibilityRole = (
    signal: GlobalRadarSignal,
    role: Extract<
      PromotionEvidenceSelectionRole,
      "qualified_india_direct_demand" | "repeated_india_compatible_signal"
    >,
  ) => {
    for (const entry of selected.values()) {
      if (
        entry.evidence.signalId === signal.id &&
        evidenceHasPositiveIndiaPath(entry.evidence, signal)
      ) {
        entry.roles.add(role);
      }
    }
  };

  if (input.eligibilityPath === "qualified_india_direct_demand") {
    addIndiaEligibilityRole(
      input.primarySignal,
      "qualified_india_direct_demand",
    );
  } else if (input.eligibilityPath === "repeated_india_compatible_signals") {
    for (const signal of input.supportingSignals) {
      addIndiaEligibilityRole(signal, "repeated_india_compatible_signal");
    }
  } else if (input.eligibilityPath === "documented_indian_relationship") {
    const relationshipEvidence = input.availableEvidence
      .filter(
        (evidence) =>
          evidence.signalId === input.primarySignal.id &&
          evidence.globalEntityId === input.entity.id &&
          evidence.isPrimarySource &&
          !evidence.isSyndicated &&
          evidence.supportsIndiaRelevance &&
          evidence.supportedFieldPaths.some(
            (supportedFieldPath) =>
              evidenceSupportsDocumentedIndianRelationship([
                supportedFieldPath,
              ]) &&
              evidenceClaimSupportsPositiveIndiaPath({
                supportedFieldPath,
                evidenceClaim: evidence.evidenceClaim,
              }),
          ),
      )
      .sort(comparePromotionEvidence)[0];
    if (relationshipEvidence) {
      add(relationshipEvidence, "documented_indian_relationship");
    }
  } else {
    const selectedOrigins = new Set<string>();
    const candidates = [...selected.values()]
      .map(({ evidence }) => evidence)
      .filter(
        (evidence) =>
          evidence.signalId === input.primarySignal.id &&
          evidence.isPrimarySource &&
          !evidence.isSyndicated,
      )
      .sort(comparePromotionEvidence);
    for (const evidence of candidates) {
      const origin = independentSourceOrigin(evidence);
      if (!origin || selectedOrigins.has(origin)) continue;
      selectedOrigins.add(origin);
      add(evidence, "exceptional_strategic_relevance");
      if (selectedOrigins.size === 2) break;
    }
  }

  return {
    valid: true,
    evidence: [...selected.values()]
      .map(({ evidence, roles }) => ({
        ...evidence,
        selectionRoles: [...roles].sort(),
      }))
      .sort(
        (left, right) =>
          left.signalId.localeCompare(right.signalId) ||
          left.evidenceFingerprint.localeCompare(right.evidenceFingerprint),
      ),
  };
}

export function storedAttemptReason(
  promotion: GlobalRadarPromotion,
): PromotionAttemptReason | null {
  const value = promotion.entitySnapshot?.attemptReason;
  return typeof value === "string" &&
    promotionAttemptReasons.has(value as PromotionAttemptReason)
    ? (value as PromotionAttemptReason)
    : null;
}

export function storedSafeString(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const candidate = value?.[key];
  return typeof candidate === "string" ? candidate : null;
}

function signalIsActive(signal: GlobalRadarSignal, now: Date): boolean {
  if (signal.signalClass !== "direct_demand") return true;
  return signal.evergreen === true
    ? signal.reobserveBy !== null && signal.reobserveBy > now
    : signal.expiresAt === null || signal.expiresAt > now;
}

export function signalPassesThresholdAndHardGates(
  signal: GlobalRadarSignal,
  now: Date,
  configuration: GlobalRadarPromotionConfiguration,
): boolean {
  const score = scoreForSignal(signal);
  if (
    signal.scorePolicyVersion !== configuration.scoreVersion ||
    score === null ||
    score < configuration.thresholds[signal.signalClass]
  ) return false;
  if (signal.signalClass === "direct_demand") {
    return (
      (signal.demandExplicitness ?? -1) >= 75 &&
      (signal.evidenceConfidence ?? -1) >= 60 &&
      signalIsActive(signal, now)
    );
  }
  if (signal.signalClass === "demand_precursor") {
    return (
      (signal.evidenceConfidence ?? -1) >= 60 &&
      (signal.proximityToExternalDemand ?? -1) >= 50
    );
  }
  return (
    (signal.momentumIndependentEntityCount ?? 0) >= 2 &&
    (signal.momentumPrimarySourceCount ?? 0) >= 1 &&
    (signal.momentumTaxonomyConsistency ?? -1) >= 70 &&
    (signal.momentumEvidenceQuality ?? -1) >= 60 &&
    signal.momentumQualificationGatesPassed === true
  );
}

function independentPrimarySourceCount(
  evidence: readonly SelectedPromotionEvidence[],
): number {
  const origins = new Set<string>();
  for (const source of evidence) {
    if (
      !source.selectionRoles.includes("exceptional_strategic_relevance") ||
      !source.isPrimarySource ||
      source.isSyndicated
    ) continue;
    try {
      const url = new URL(source.canonicalSourceUrl);
      origins.add(url.hostname.toLowerCase().replace(/^www\./, ""));
    } catch {
      // Persisted evidence should already be public and canonical. Invalid rows
      // simply cannot establish source independence.
    }
  }
  return origins.size;
}

export function hasDocumentedIndianRelationshipEvidence(
  context: PromotionContext,
): boolean {
  return context.evidence
    .filter(({ signalId }) => signalId === context.primarySignal.id)
    .some(
      (source) =>
        source.selectionRoles.includes("documented_indian_relationship") &&
        source.globalEntityId === context.entity.id &&
        source.isPrimarySource &&
        !source.isSyndicated &&
        source.supportsIndiaRelevance &&
        source.supportedFieldPaths.some(
          (supportedFieldPath) =>
            evidenceSupportsDocumentedIndianRelationship([
              supportedFieldPath,
            ]) &&
            evidenceClaimSupportsPositiveIndiaPath({
              supportedFieldPath,
              evidenceClaim: source.evidenceClaim,
            }),
        ),
    );
}

export function hasInvalidDocumentedIndianRelationshipClaim(
  input: Readonly<{
    entityId: string;
    primarySignalId: string;
    evidence: readonly GlobalSignalEvidence[];
  }>,
): boolean {
  return input.evidence
    .filter(
      ({ signalId, globalEntityId }) =>
        signalId === input.primarySignalId &&
        globalEntityId === input.entityId,
    )
    .some(
      (source) =>
        source.isPrimarySource &&
        !source.isSyndicated &&
        source.supportsIndiaRelevance &&
        source.supportedFieldPaths.some(
          (supportedFieldPath) =>
            evidenceSupportsDocumentedIndianRelationship([
              supportedFieldPath,
            ]) &&
            !evidenceClaimSupportsPositiveIndiaPath({
              supportedFieldPath,
              evidenceClaim: source.evidenceClaim,
            }),
        ),
    );
}

export function promotionEligibilityMet(
  input: CanonicalPromotionInput,
  context: PromotionContext,
  configuration: GlobalRadarPromotionConfiguration,
): boolean {
  const { primarySignal, supportingSignals, evidence, entity } = context;
  if (
    primarySignal.status !== "qualified" ||
    !signalPassesThresholdAndHardGates(
      primarySignal,
      input.now,
      configuration,
    )
  ) return false;
  if (input.eligibilityPath === "qualified_india_direct_demand") {
    return (
      primarySignal.signalClass === "direct_demand" &&
      primarySignal.indiaRelevanceType !== "no_current_India_fit" &&
      evidence.some(
        ({ signalId, selectionRoles }) =>
          signalId === primarySignal.id &&
          selectionRoles.includes("qualified_india_direct_demand"),
      )
    );
  }
  if (input.eligibilityPath === "repeated_india_compatible_signals") {
    const windowStart = new Date(input.now.getTime() - REPEATED_SIGNAL_WINDOW_MS);
    return (
      supportingSignals.length >= 3 &&
      supportingSignals.every(
        (signal) =>
          signal.globalEntityId === entity.id &&
          ["direct_demand", "demand_precursor"].includes(signal.signalClass) &&
          signal.status === "qualified" &&
          signal.observedAt >= windowStart &&
          signal.observedAt <= input.now &&
          signal.indiaRelevanceType !== "no_current_India_fit" &&
          signalPassesThresholdAndHardGates(signal, input.now, configuration) &&
          evidence.some(
            ({ signalId, selectionRoles }) =>
              signalId === signal.id &&
              selectionRoles.includes("repeated_india_compatible_signal"),
          ),
      )
    );
  }
  const primaryEvidence = evidence.filter(
    ({ signalId }) => signalId === primarySignal.id,
  );
  if (input.eligibilityPath === "documented_indian_relationship") {
    return hasDocumentedIndianRelationshipEvidence(context);
  }
  return (
    entity.entityStatus === "qualified" &&
    independentPrimarySourceCount(primaryEvidence) >= 2
  );
}

function candidateCanonicalUrl(entity: GlobalEntity): string | null {
  if (entity.websiteUrl) return entity.websiteUrl;
  if (entity.linkedinUrl) return entity.linkedinUrl;
  if (entity.canonicalDomain) return `https://${entity.canonicalDomain}/`;
  return null;
}

export function discoveryCandidateIdentityProbe(
  entity: GlobalEntity,
): DiscoveryBatchCandidate | null {
  const canonicalUrl = candidateCanonicalUrl(entity);
  if (!canonicalUrl) return null;
  const parsed = discoveryCandidateInputSchema.safeParse({
    type: entity.organisationType === "creator" ? "creator" : "company",
    name: entity.canonicalName,
    canonicalUrl,
    websiteUrl: entity.websiteUrl,
    primarySocialUrl: null,
    linkedinUrl: entity.linkedinUrl,
    discoveredDescription: "Public identity evidence probe.",
    category: "identity",
    subcategory: null,
    geography: "Global",
    sourceName: "Public identity",
    sourceUrl: canonicalUrl,
    discoveryScore: 0,
    rawMetadata: {},
  });
  return parsed.success ? parsed.data : null;
}

function primaryEvidenceForCandidate(
  primarySignalId: string,
  evidence: readonly GlobalSignalEvidence[],
): GlobalSignalEvidence | null {
  const candidates = evidence.filter(
    ({ signalId }) => signalId === primarySignalId,
  );
  candidates.sort((left, right) => {
    if (left.isPrimarySource !== right.isPrimarySource) {
      return left.isPrimarySource ? -1 : 1;
    }
    if (left.isSyndicated !== right.isSyndicated) {
      return left.isSyndicated ? 1 : -1;
    }
    if (left.supportsDirectDemand !== right.supportsDirectDemand) {
      return left.supportsDirectDemand ? -1 : 1;
    }
    return (
      right.observedAt.getTime() - left.observedAt.getTime() ||
      left.canonicalSourceUrl.localeCompare(right.canonicalSourceUrl)
    );
  });
  return candidates[0] ?? null;
}

export function mappedDiscoveryCandidate(
  input: CanonicalPromotionInput,
  context: PromotionContext,
):
  | { outcome: "mapped"; candidate: DiscoveryBatchCandidate }
  | {
      outcome: "conflict";
      reason:
        | "candidate_identity_missing"
        | "candidate_mapping_invalid"
        | "source_evidence_missing";
    } {
  const { entity, primarySignal, evidence } = context;
  const canonicalUrl = candidateCanonicalUrl(entity);
  if (!canonicalUrl) {
    return { outcome: "conflict", reason: "candidate_identity_missing" };
  }
  const primaryEvidence = primaryEvidenceForCandidate(primarySignal.id, evidence);
  if (!primaryEvidence) {
    return { outcome: "conflict", reason: "source_evidence_missing" };
  }
  const score = scoreForSignal(primarySignal);
  if (score === null) {
    return { outcome: "conflict", reason: "candidate_mapping_invalid" };
  }
  const parsed = discoveryCandidateInputSchema.safeParse({
    type: entity.organisationType === "creator" ? "creator" : "company",
    name: entity.canonicalName,
    canonicalUrl,
    websiteUrl: entity.websiteUrl,
    primarySocialUrl: null,
    linkedinUrl: entity.linkedinUrl,
    discoveredDescription: primarySignal.factualSummary.slice(0, 1_000),
    category: primarySignal.demandDomain,
    subcategory: entity.sector.slice(0, 100),
    geography: entity.headquartersCountry,
    sourceName: primaryEvidence.sourceName.slice(0, 100),
    sourceUrl: primaryEvidence.sourceUrl,
    discoveryScore: score,
    rawMetadata: {
      source: "global_demand_radar",
      globalRadarEntityId: entity.id,
      globalRadarPrimarySignalId: primarySignal.id,
      globalRadarSupportingSignalIds: input.supportingSignalIds,
      eligibilityPath: input.eligibilityPath,
      organisationType: entity.organisationType,
      signalClass: primarySignal.signalClass,
      scoreVersion: primarySignal.scorePolicyVersion,
    },
  });
  return parsed.success
    ? { outcome: "mapped", candidate: parsed.data }
    : { outcome: "conflict", reason: "candidate_mapping_invalid" };
}
