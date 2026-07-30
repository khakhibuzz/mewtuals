import {
  discoveryCandidateInputSchema,
  type DiscoveryBatchCandidate,
} from "../../app/domain/discovery";
import { createGlobalRadarFingerprint } from "../../app/domain/global-radar";
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
  type PromotionAttemptReason,
  type PromotionContext,
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

function evidenceSafeSnapshot(evidence: readonly GlobalSignalEvidence[]) {
  return evidence.map((item) => ({
    signalId: item.signalId,
    canonicalSourceUrl: item.canonicalSourceUrl,
    sourceName: item.sourceName,
    sourceFamily: item.sourceFamily,
    evidenceFingerprint: item.evidenceFingerprint,
    isPrimarySource: item.isPrimarySource,
    isSyndicated: item.isSyndicated,
    supportsDirectDemand: item.supportsDirectDemand,
    supportsIndiaRelevance: item.supportsIndiaRelevance,
    observedAt: item.observedAt.toISOString(),
  }));
}

export function sourceSnapshotDigest(evidence: readonly GlobalSignalEvidence[]) {
  return createGlobalRadarFingerprint({
    version: "global-radar-promotion-source-snapshot-v1",
    evidence: evidenceSafeSnapshot(evidence),
  });
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
  evidence: readonly GlobalSignalEvidence[],
): number {
  const origins = new Set<string>();
  for (const source of evidence) {
    if (!source.isPrimarySource || source.isSyndicated) continue;
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
      primarySignal.indiaRelevanceType !== "no_current_India_fit"
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
          signalPassesThresholdAndHardGates(signal, input.now, configuration),
      )
    );
  }
  const primaryEvidence = evidence.filter(
    ({ signalId }) => signalId === primarySignal.id,
  );
  if (input.eligibilityPath === "documented_indian_relationship") {
    return primaryEvidence.some(
      (source) =>
        source.isPrimarySource &&
        !source.isSyndicated &&
        source.supportsIndiaRelevance,
    );
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
