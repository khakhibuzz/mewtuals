import { z } from "zod";

import {
  containsKnownGlobalRadarSecret,
  globalRadarAuthoredAuditTextSchema,
  promotionEligibilityPaths,
  type IndiaRelevanceType,
  type PromotionEligibilityPath,
  type SignalClass,
} from "../../domain/global-radar";
import { serializeGlobalRadarPromotion } from "./dto";
import type { GlobalRadarAdminActor } from "./run-service";

const uuidSchema = z.string().uuid();
const boundedReasonSchema = globalRadarAuthoredAuditTextSchema;

export type GlobalRadarPromotionSignal = Readonly<{
  id: string;
  revision: number;
  status: string;
  signalClass: SignalClass;
  score: number | null;
  scoreVersion: string;
  hardGatesPassed: boolean;
  indiaRelevanceType: IndiaRelevanceType;
  hasIndiaEligibilityEvidence: boolean;
  observedAt: Date;
}>;

export type GlobalRadarPromotionContext = Readonly<{
  entity: Readonly<{
    id: string;
    revision: number;
    status: string;
    hasPublicIdentityEvidence: boolean;
    hasIdentifierConflict: boolean;
  }>;
  primarySignal: GlobalRadarPromotionSignal;
  supportingSignals: readonly GlobalRadarPromotionSignal[];
  primaryEvidence: readonly Readonly<{
    sourceKey: string;
    isPrimarySource: boolean;
    isSyndicated: boolean;
    supportsDocumentedIndianRelationship: boolean;
    supportsExceptionalStrategicRelevance: boolean;
  }>[];
  /** Complete persisted selection, including the primary exactly once. */
  promotionSupportingSignalIds: readonly string[];
}>;

type StoredGlobalRadarPromotionSignal = Readonly<{
  id: string;
  globalEntityId: string | null;
  revision: number;
  status: string;
  signalClass: SignalClass;
  directDemandScore: number | null;
  precursorScore: number | null;
  momentumScore: number | null;
  scorePolicyVersion: string;
  demandExplicitness: number | null;
  evidenceConfidence: number | null;
  proximityToExternalDemand: number | null;
  momentumIndependentEntityCount: number | null;
  momentumPrimarySourceCount: number | null;
  momentumTaxonomyConsistency: number | null;
  momentumEvidenceQuality: number | null;
  momentumQualificationGatesPassed: boolean | null;
  evergreen: boolean | null;
  expiresAt: Date | null;
  reobserveBy: Date | null;
  indiaRelevanceType: IndiaRelevanceType;
  observedAt: Date;
}>;

type StoredGlobalRadarPromotionContext = Readonly<{
  entity: Readonly<{
    id: string;
    revision: number;
    entityStatus: string;
  }>;
  primarySignal: StoredGlobalRadarPromotionSignal;
  supportingSignals: readonly StoredGlobalRadarPromotionSignal[];
  evidence: readonly Readonly<{
    signalId: string;
    globalEntityId: string | null;
    canonicalSourceUrl: string;
    evidenceClaim: string;
    isPrimarySource: boolean;
    isSyndicated: boolean;
    supportsIndiaRelevance: boolean;
    supportedFieldPaths: readonly string[];
    selectionRoles: readonly string[];
  }>[];
  promotionSupportingSignalIds: readonly string[];
  eligibilityFacts: Readonly<{
    hasPublicIdentityEvidence: boolean;
    hasIdentifierConflict: boolean;
  }>;
}>;

export type GlobalRadarPromotionEligibility = Readonly<
  | { eligible: true; path: PromotionEligibilityPath }
  | {
      eligible: false;
      reason:
        | "missing_public_identity_evidence"
        | "identifier_conflict"
        | "primary_signal_not_qualified"
        | "primary_signal_below_threshold"
        | "primary_signal_hard_gates_failed"
        | "primary_signal_not_india_compatible"
        | "primary_signal_not_direct_demand"
        | "insufficient_repeated_signals"
        | "missing_documented_indian_relationship"
        | "entity_not_qualified"
        | "insufficient_independent_primary_sources";
    }
>;

type GlobalRadarPromotionRepositoryInput = Readonly<{
  globalEntityId: string;
  primarySignalId: string;
  supportingSignalIds: readonly string[];
  eligibilityPath: PromotionEligibilityPath;
  expectedEntityRevision: number;
  expectedPrimarySignalRevision: number;
  expectedSupportingSignalRevisions: Readonly<Record<string, number>>;
  actor: GlobalRadarAdminActor;
  idempotencyKey: string;
  reason: string;
  now: Date;
}>;

type GlobalRadarPromotionRepositoryResult =
  | { outcome: "promoted" | "replayed"; promotion: unknown }
  | { outcome: "conflict"; reason: string; promotion?: unknown }
  | { outcome: "failed"; reason: string; promotion?: unknown };

export type GlobalRadarPromotionRepositoryPort = {
  lookupPromotionReplay(
    input: GlobalRadarPromotionRepositoryInput,
  ): Promise<GlobalRadarPromotionRepositoryResult | { outcome: "not_found" }>;
  loadContext(input: {
    globalEntityId: string;
    primarySignalId: string;
    supportingSignalIds: readonly string[];
    eligibilityPath: PromotionEligibilityPath;
  }): Promise<
    | {
        outcome: "found";
        context: GlobalRadarPromotionContext | StoredGlobalRadarPromotionContext;
      }
    | { outcome: "invalid_input" }
    | { outcome: "not_found" }
  >;
  promote(
    input: GlobalRadarPromotionRepositoryInput,
  ): Promise<GlobalRadarPromotionRepositoryResult>;
  reverse(input: {
    globalEntityId: string;
    expectedEntityRevision: number;
    expectedPrimarySignalRevision: number;
    actor: GlobalRadarAdminActor;
    idempotencyKey: string;
    reason: string;
    now: Date;
  }): Promise<
    | { outcome: "reversed" | "replayed"; promotion: unknown }
    | { outcome: "conflict"; reason: string; promotion?: unknown }
  >;
};

export type GlobalRadarPromotionServiceDependencies = Readonly<{
  repository: GlobalRadarPromotionRepositoryPort;
  adminEmails: readonly string[];
  knownSecrets?: readonly (string | null | undefined)[];
  containsKnownSecret?(value: unknown): boolean;
  thresholds: Readonly<Record<SignalClass, number>>;
  scoreVersion: string;
  now?: () => Date;
}>;

export type EvaluateGlobalRadarPromotionEligibilityInput = Readonly<{
  eligibilityPath: PromotionEligibilityPath;
  context: GlobalRadarPromotionContext;
  thresholds: Readonly<Record<SignalClass, number>>;
  scoreVersion: string;
  now: Date;
}>;

function storedSignalScore(signal: StoredGlobalRadarPromotionSignal) {
  if (signal.signalClass === "direct_demand") return signal.directDemandScore;
  if (signal.signalClass === "demand_precursor") return signal.precursorScore;
  return signal.momentumScore;
}

function storedSignalHardGatesPassed(
  signal: StoredGlobalRadarPromotionSignal,
  now: Date,
): boolean {
  if (signal.signalClass === "direct_demand") {
    const active = signal.evergreen === true
      ? signal.reobserveBy !== null && signal.reobserveBy > now
      : signal.expiresAt === null || signal.expiresAt > now;
    return (
      (signal.demandExplicitness ?? -1) >= 75 &&
      (signal.evidenceConfidence ?? -1) >= 60 &&
      active
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

function independentSourceKey(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function isStoredPromotionContext(
  value: GlobalRadarPromotionContext | StoredGlobalRadarPromotionContext,
): value is StoredGlobalRadarPromotionContext {
  return "eligibilityFacts" in value;
}

function promotionContext(
  value: GlobalRadarPromotionContext | StoredGlobalRadarPromotionContext,
  now: Date,
): GlobalRadarPromotionContext {
  if (!isStoredPromotionContext(value)) return value;
  const mapSignal = (
    signal: StoredGlobalRadarPromotionSignal,
  ): GlobalRadarPromotionSignal => ({
    id: signal.id,
    revision: signal.revision,
    status: signal.status,
    signalClass: signal.signalClass,
    score: storedSignalScore(signal),
    scoreVersion: signal.scorePolicyVersion,
    hardGatesPassed: storedSignalHardGatesPassed(signal, now),
    indiaRelevanceType: signal.indiaRelevanceType,
    hasIndiaEligibilityEvidence: value.evidence.some(
      ({ signalId, selectionRoles }) =>
        signalId === signal.id &&
        (selectionRoles.includes("qualified_india_direct_demand") ||
          selectionRoles.includes("repeated_india_compatible_signal")),
    ),
    observedAt: signal.observedAt,
  });
  return {
    entity: {
      id: value.entity.id,
      revision: value.entity.revision,
      status: value.entity.entityStatus,
      hasPublicIdentityEvidence:
        value.eligibilityFacts.hasPublicIdentityEvidence,
      hasIdentifierConflict: value.eligibilityFacts.hasIdentifierConflict,
    },
    primarySignal: mapSignal(value.primarySignal),
    supportingSignals: value.supportingSignals
      .filter(({ id }) => id !== value.primarySignal.id)
      .map(mapSignal),
    primaryEvidence: value.evidence
      .filter(({ signalId }) => signalId === value.primarySignal.id)
      .map((evidence) => ({
        sourceKey: independentSourceKey(evidence.canonicalSourceUrl),
        isPrimarySource: evidence.isPrimarySource,
        isSyndicated: evidence.isSyndicated,
        supportsDocumentedIndianRelationship:
          evidence.globalEntityId === value.entity.id &&
          evidence.supportsIndiaRelevance &&
          evidence.selectionRoles.includes(
            "documented_indian_relationship",
          ),
        supportsExceptionalStrategicRelevance:
          evidence.selectionRoles.includes(
            "exceptional_strategic_relevance",
          ),
      })),
    promotionSupportingSignalIds: [...value.promotionSupportingSignalIds],
  };
}

function qualifiesAtCurrentPolicy(
  signal: GlobalRadarPromotionSignal,
  input: EvaluateGlobalRadarPromotionEligibilityInput,
): boolean {
  return (
    signal.status === "qualified" &&
    signal.scoreVersion === input.scoreVersion &&
    signal.score !== null &&
    Number.isInteger(signal.score) &&
    signal.score >= input.thresholds[signal.signalClass] &&
    signal.hardGatesPassed
  );
}

export function evaluateGlobalRadarPromotionEligibility(
  input: EvaluateGlobalRadarPromotionEligibilityInput,
): GlobalRadarPromotionEligibility {
  const { entity, primarySignal, supportingSignals, primaryEvidence } =
    input.context;
  if (!entity.hasPublicIdentityEvidence) {
    return { eligible: false, reason: "missing_public_identity_evidence" };
  }
  if (entity.hasIdentifierConflict) {
    return { eligible: false, reason: "identifier_conflict" };
  }
  if (primarySignal.status !== "qualified") {
    return { eligible: false, reason: "primary_signal_not_qualified" };
  }
  if (
    primarySignal.scoreVersion !== input.scoreVersion ||
    primarySignal.score === null ||
    primarySignal.score < input.thresholds[primarySignal.signalClass]
  ) {
    return { eligible: false, reason: "primary_signal_below_threshold" };
  }
  if (!primarySignal.hardGatesPassed) {
    return { eligible: false, reason: "primary_signal_hard_gates_failed" };
  }

  if (input.eligibilityPath === "qualified_india_direct_demand") {
    if (primarySignal.signalClass !== "direct_demand") {
      return { eligible: false, reason: "primary_signal_not_direct_demand" };
    }
    if (primarySignal.indiaRelevanceType === "no_current_India_fit") {
      return { eligible: false, reason: "primary_signal_not_india_compatible" };
    }
    if (!primarySignal.hasIndiaEligibilityEvidence) {
      return { eligible: false, reason: "primary_signal_not_india_compatible" };
    }
  } else if (input.eligibilityPath === "repeated_india_compatible_signals") {
    const cutoff = input.now.getTime() - 180 * 24 * 60 * 60 * 1_000;
    const selectedSignals = [primarySignal, ...supportingSignals];
    const everySelectedSignalQualifies = selectedSignals.every(
      (signal) =>
        ["direct_demand", "demand_precursor"].includes(signal.signalClass) &&
        signal.indiaRelevanceType !== "no_current_India_fit" &&
        signal.hasIndiaEligibilityEvidence &&
        signal.observedAt.getTime() >= cutoff &&
        signal.observedAt <= input.now &&
        qualifiesAtCurrentPolicy(signal, input),
    );
    if (
      selectedSignals.length < 3 ||
      new Set(selectedSignals.map(({ id }) => id)).size !==
        selectedSignals.length ||
      !everySelectedSignalQualifies
    ) {
      return { eligible: false, reason: "insufficient_repeated_signals" };
    }
  } else if (input.eligibilityPath === "documented_indian_relationship") {
    if (
      !primaryEvidence.some(
        (evidence) =>
          evidence.isPrimarySource &&
          !evidence.isSyndicated &&
          evidence.supportsDocumentedIndianRelationship,
      )
    ) {
      return {
        eligible: false,
        reason: "missing_documented_indian_relationship",
      };
    }
  } else {
    if (entity.status !== "qualified") {
      return { eligible: false, reason: "entity_not_qualified" };
    }
    const independentPrimarySources = new Set(
      primaryEvidence
        .filter(
          (evidence) =>
            evidence.isPrimarySource &&
            !evidence.isSyndicated &&
            evidence.supportsExceptionalStrategicRelevance,
        )
        .map(({ sourceKey }) => sourceKey.trim().toLowerCase())
        .filter(Boolean),
    );
    if (independentPrimarySources.size < 2) {
      return {
        eligible: false,
        reason: "insufficient_independent_primary_sources",
      };
    }
  }
  return { eligible: true, path: input.eligibilityPath };
}

const promotionInputSchema = z
  .strictObject({
    entityId: uuidSchema,
    primarySignalId: uuidSchema,
    supportingSignalIds: z.array(uuidSchema).max(20),
    eligibilityPath: z.enum(promotionEligibilityPaths),
    expectedEntityRevision: z.number().int().min(0),
    expectedPrimarySignalRevision: z.number().int().min(0),
    expectedSupportingSignalRevisions: z
      .array(
        z.strictObject({
          signalId: uuidSchema,
          revision: z.number().int().min(0),
        }),
      )
      .max(20),
    idempotencyKey: uuidSchema,
    reason: boundedReasonSchema,
    rationale: boundedReasonSchema,
  })
  .superRefine((value, context) => {
    const supportingIds = new Set(value.supportingSignalIds);
    const revisionIds = new Set(
      value.expectedSupportingSignalRevisions.map(({ signalId }) => signalId),
    );
    if (
      supportingIds.size !== value.supportingSignalIds.length ||
      revisionIds.size !== value.expectedSupportingSignalRevisions.length ||
      supportingIds.has(value.primarySignalId) ||
      supportingIds.size !== revisionIds.size ||
      [...supportingIds].some((id) => !revisionIds.has(id))
    ) {
      context.addIssue({
        code: "custom",
        message: "Supporting signal revisions must exactly match selected signals.",
      });
    }
    const isRepeatedPath =
      value.eligibilityPath === "repeated_india_compatible_signals";
    if (
      (isRepeatedPath && supportingIds.size < 2) ||
      (!isRepeatedPath && supportingIds.size !== 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "The eligibility path must use its exact signal selection.",
      });
    }
    if (`${value.reason}\nRationale: ${value.rationale}`.length > 2_000) {
      context.addIssue({
        code: "custom",
        message: "The promotion reason and rationale must fit the audit limit.",
      });
    }
  });

const reversalInputSchema = z.strictObject({
  entityId: uuidSchema,
  expectedEntityRevision: z.number().int().min(0),
  expectedPrimarySignalRevision: z.number().int().min(0),
  idempotencyKey: uuidSchema,
  reason: boundedReasonSchema,
});

function normalizedActor(
  actor: GlobalRadarAdminActor | null | undefined,
  allowlist: ReadonlySet<string>,
): GlobalRadarAdminActor | null {
  if (!actor || !uuidSchema.safeParse(actor.userId).success) return null;
  const email = actor.email.trim().toLowerCase();
  if (!z.string().email().safeParse(email).success || !allowlist.has(email)) {
    return null;
  }
  return { userId: actor.userId.toLowerCase(), email };
}

const safeRepositoryReasons = new Set([
  "active_promotion_exists",
  "administrator_required",
  "candidate_identity_conflict",
  "candidate_identity_missing",
  "candidate_mapping_invalid",
  "eligibility_not_met",
  "idempotency_mismatch",
  "invalid_input",
  "no_active_promotion",
  "not_found",
  "persistence_failure",
  "primary_signal_not_qualified",
  "promotion_reversed",
  "revision_mismatch",
  "restoration_not_safe",
  "signal_entity_mismatch",
  "source_evidence_missing",
  "supporting_signal_invalid",
]);

function safeReason(reason: string): string {
  return safeRepositoryReasons.has(reason) ? reason : "persistence_failure";
}

function mappedRepositoryResult(
  result:
    | Awaited<ReturnType<GlobalRadarPromotionRepositoryPort["promote"]>>
    | Awaited<ReturnType<GlobalRadarPromotionRepositoryPort["reverse"]>>,
) {
  if (result.outcome === "conflict") {
    return {
      outcome: "conflict" as const,
      reason: safeReason(result.reason),
      httpStatus: 409 as const,
      ...(result.promotion
        ? { promotion: serializeGlobalRadarPromotion(result.promotion) }
        : {}),
    };
  }
  if (result.outcome === "failed") {
    return {
      outcome: "failed" as const,
      reason: safeReason(result.reason),
      ...(result.promotion
        ? { promotion: serializeGlobalRadarPromotion(result.promotion) }
        : {}),
    };
  }
  return {
    outcome: result.outcome,
    promotion: serializeGlobalRadarPromotion(result.promotion),
  };
}

export function createGlobalRadarPromotionService(
  dependencies: GlobalRadarPromotionServiceDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  const adminEmails = new Set(
    dependencies.adminEmails.map((email) => email.trim().toLowerCase()),
  );
  const containsKnownSecret = (value: unknown): boolean =>
    dependencies.containsKnownSecret?.(value) === true ||
    containsKnownGlobalRadarSecret(
      value,
      dependencies.knownSecrets ?? [],
    );

  async function promote(
    actor: GlobalRadarAdminActor | null,
    value: unknown,
  ) {
    const administrator = normalizedActor(actor, adminEmails);
    if (!administrator) return { outcome: "forbidden" as const };
    const parsed = promotionInputSchema.safeParse(value);
    if (
      !parsed.success ||
      containsKnownSecret(parsed.data)
    ) {
      return { outcome: "invalid" as const };
    }
    const input = parsed.data;
    const evaluatedAt = now();
    const selectedSignalIds = [
      ...new Set([input.primarySignalId, ...input.supportingSignalIds]),
    ].sort();
    const expectedSupportingSignalRevisions = Object.fromEntries([
      [input.primarySignalId, input.expectedPrimarySignalRevision],
      ...input.expectedSupportingSignalRevisions.map(
        ({ signalId, revision }) => [signalId, revision] as const,
      ),
    ]);
    const repositoryInput: GlobalRadarPromotionRepositoryInput = {
      globalEntityId: input.entityId,
      primarySignalId: input.primarySignalId,
      supportingSignalIds: selectedSignalIds,
      eligibilityPath: input.eligibilityPath,
      expectedEntityRevision: input.expectedEntityRevision,
      expectedPrimarySignalRevision: input.expectedPrimarySignalRevision,
      expectedSupportingSignalRevisions,
      idempotencyKey: input.idempotencyKey.toLowerCase(),
      reason: `${input.reason}\nRationale: ${input.rationale}`,
      actor: administrator,
      now: evaluatedAt,
    };
    const replay = await dependencies.repository.lookupPromotionReplay(
      repositoryInput,
    );
    if (replay.outcome !== "not_found") {
      return mappedRepositoryResult(replay);
    }
    const loaded = await dependencies.repository.loadContext({
      globalEntityId: input.entityId,
      primarySignalId: input.primarySignalId,
      supportingSignalIds: input.supportingSignalIds,
      eligibilityPath: input.eligibilityPath,
    });
    if (loaded.outcome === "not_found") return loaded;
    if (loaded.outcome === "invalid_input") {
      return { outcome: "invalid" as const };
    }
    const context = promotionContext(loaded.context, evaluatedAt);
    const eligibility = evaluateGlobalRadarPromotionEligibility({
      eligibilityPath: input.eligibilityPath,
      context,
      thresholds: dependencies.thresholds,
      scoreVersion: dependencies.scoreVersion,
      now: evaluatedAt,
    });
    const result = await dependencies.repository.promote(repositoryInput);
    if (
      !eligibility.eligible &&
      result.outcome === "conflict" &&
      result.reason === "eligibility_not_met"
    ) {
      return {
        outcome: "ineligible" as const,
        reason: eligibility.reason,
      };
    }
    return mappedRepositoryResult(result);
  }

  async function reversePromotion(
    actor: GlobalRadarAdminActor | null,
    value: unknown,
  ) {
    const administrator = normalizedActor(actor, adminEmails);
    if (!administrator) return { outcome: "forbidden" as const };
    const parsed = reversalInputSchema.safeParse(value);
    if (
      !parsed.success ||
      containsKnownSecret(parsed.data)
    ) {
      return { outcome: "invalid" as const };
    }
    return mappedRepositoryResult(
      await dependencies.repository.reverse({
        globalEntityId: parsed.data.entityId,
        expectedEntityRevision: parsed.data.expectedEntityRevision,
        expectedPrimarySignalRevision:
          parsed.data.expectedPrimarySignalRevision,
        idempotencyKey: parsed.data.idempotencyKey.toLowerCase(),
        reason: parsed.data.reason,
        actor: administrator,
        now: now(),
      }),
    );
  }

  return { promote, reversePromotion };
}

export type GlobalRadarPromotionService = ReturnType<
  typeof createGlobalRadarPromotionService
>;
