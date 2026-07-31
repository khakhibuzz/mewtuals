import {
  and,
  asc,
  desc,
  eq,
  inArray,
} from "drizzle-orm";

import type { DiscoveryBatchCandidate } from "../../app/domain/discovery";
import type { MewtualsDatabase } from "../client";
import {
  globalEntities,
  globalRadarAdminEvents,
  globalRadarPromotions,
  globalRadarSignalEntities,
  globalRadarSignals,
  globalSignalUpdates,
} from "../global-radar-schema";
import {
  discoveryCandidates,
  discoveryRuns,
  users,
} from "../schema";
import type {
  GlobalEntity,
  GlobalRadarPromotion,
  GlobalRadarSignal,
  GlobalSignalEvidence,
} from "../types";
import {
  findDiscoveryCandidateIdentityConflict,
  inspectDiscoveryCandidateIdentityConflict,
  upsertDiscoveryCandidateSources,
  writeDiscoveryCandidates,
  type DiscoveryCandidateSourceWrite,
  type DiscoveryTransaction,
} from "./discovery-candidate-writer";
import {
  PROMOTION_LOCK_NAMESPACE,
  REVERSAL_LOCK_NAMESPACE,
  GlobalRadarPromotionUnavailableError,
  canonicalPromotionContextSelection,
  canonicalPromotionInput,
  canonicalReversalInput,
  takePromotionIdempotencyLock,
  validPromotionConfiguration,
  type CanonicalPromotionInput,
  type CanonicalReversalInput,
  type GlobalRadarPromotionActor,
  type GlobalRadarPromotionConfiguration,
  type GlobalRadarPromotionRepository,
  type GlobalRadarPromotionSuccess,
  type LookupGlobalRadarPromotionReplayResult,
  type GlobalRadarReversalConflictReason,
  type LoadedGlobalRadarPromotionContext,
  type PromoteGlobalRadarEntityResult,
  type PromotionAttemptReason,
  type PromotionContext,
  type ReverseGlobalRadarPromotionResult,
  type SelectedPromotionEvidence,
} from "./global-radar-promotion-contracts";
import {
  discoveryCandidateIdentityProbe,
  entitySafeSnapshot,
  hasInvalidDocumentedIndianRelationshipClaim,
  mappedDiscoveryCandidate,
  promotionEligibilityMet,
  selectPromotionEvidence,
  signalSafeSnapshot,
  sourceSnapshotDigest,
  storedAttemptReason,
  storedSafeString,
} from "./global-radar-promotion-policy";
import {
  createStoredGlobalRadarScoreInputDigest,
  rebaseStoredScoreEvidenceSnapshot,
  storedScoreComponents,
} from "./global-radar-score-evidence";
import {
  validateStoredGlobalRadarScoreProvenance,
  validateStoredGlobalRadarScoreProvenanceSelection,
} from "./global-radar-stored-score-provenance";

type UnselectedPromotionContext = Omit<PromotionContext, "evidence"> &
  Readonly<{ evidence: GlobalSignalEvidence[] }>;

type ValidPromotionScoreProvenance = Extract<
  Awaited<ReturnType<typeof validateStoredGlobalRadarScoreProvenanceSelection>>,
  { valid: true }
>;

type ValidStoredScoreProvenance =
  ValidPromotionScoreProvenance["items"][number]["provenance"];

export {
  GlobalRadarPromotionUnavailableError,
  type GlobalRadarPromotionActor,
  type GlobalRadarPromotionConfiguration,
  type GlobalRadarPromotionConflictReason,
  type GlobalRadarPromotionRepository,
  type GlobalRadarPromotionSuccess,
  type GlobalRadarReversalConflictReason,
  type LoadGlobalRadarPromotionContextInput,
  type LoadGlobalRadarPromotionContextResult,
  type LoadedGlobalRadarPromotionContext,
  type PromoteGlobalRadarEntityInput,
  type PromoteGlobalRadarEntityResult,
  type ReverseGlobalRadarPromotionInput,
  type ReverseGlobalRadarPromotionResult,
} from "./global-radar-promotion-contracts";

async function actorIsPersistedAdministrator(
  transaction: DiscoveryTransaction,
  actor: GlobalRadarPromotionActor,
): Promise<boolean> {
  const [stored] = await transaction
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, actor.userId))
    .limit(1);
  return stored?.email.trim().toLowerCase() === actor.email;
}

async function loadPromotionSuccess(
  transaction: DiscoveryTransaction,
  promotion: GlobalRadarPromotion,
): Promise<GlobalRadarPromotionSuccess | null> {
  if (!promotion.discoveryRunId || !promotion.discoveryCandidateId) return null;
  const [[entity], [primarySignal], [run], [candidate]] = await Promise.all([
    transaction
      .select()
      .from(globalEntities)
      .where(eq(globalEntities.id, promotion.globalEntityId))
      .limit(1),
    transaction
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, promotion.primarySignalId))
      .limit(1),
    transaction
      .select()
      .from(discoveryRuns)
      .where(eq(discoveryRuns.id, promotion.discoveryRunId))
      .limit(1),
    transaction
      .select()
      .from(discoveryCandidates)
      .where(eq(discoveryCandidates.id, promotion.discoveryCandidateId))
      .limit(1),
  ]);
  return entity && primarySignal && run && candidate
    ? { promotion, entity, primarySignal, run, candidate }
    : null;
}

async function existingPromotionOutcome(
  transaction: DiscoveryTransaction,
  existing: GlobalRadarPromotion,
  requestHash: string,
): Promise<PromoteGlobalRadarEntityResult> {
  if (existing.requestHash !== requestHash) {
    return { outcome: "conflict", reason: "idempotency_mismatch" };
  }
  if (existing.status === "failed") {
    return {
      outcome: "failed",
      reason: "persistence_failure",
      promotion: existing,
    };
  }
  if (existing.status === "conflicted") {
    return {
      outcome: "conflict",
      reason: storedAttemptReason(existing) ?? "eligibility_not_met",
      promotion: existing,
    };
  }
  if (existing.status === "reversed") {
    return {
      outcome: "conflict",
      reason: "promotion_reversed",
      promotion: existing,
    };
  }
  const success = await loadPromotionSuccess(transaction, existing);
  if (!success) throw new Error("Stored promotion result is incomplete.");
  return { outcome: "replayed", ...success };
}

async function loadPromotionContext(
  transaction: DiscoveryTransaction,
  input: CanonicalPromotionInput,
): Promise<
  | { outcome: "not_found"; entity?: GlobalEntity }
  | { outcome: "found"; context: PromotionContext }
> {
  const [entity] = await transaction
    .select()
    .from(globalEntities)
    .where(eq(globalEntities.id, input.globalEntityId))
    .limit(1)
    .for("update");
  if (!entity) return { outcome: "not_found" };

  const supportingSignals = await transaction
    .select()
    .from(globalRadarSignals)
    .where(inArray(globalRadarSignals.id, input.supportingSignalIds))
    .orderBy(asc(globalRadarSignals.id))
    .for("update");
  const primarySignal = supportingSignals.find(
    ({ id }) => id === input.primarySignalId,
  );
  if (!primarySignal || supportingSignals.length !== input.supportingSignalIds.length) {
    return { outcome: "not_found", entity };
  }
  const contextWithoutEvidence: UnselectedPromotionContext = {
    entity,
    primarySignal,
    supportingSignals,
    evidence: [],
  };
  const scoreProvenance = await promotionScoreProvenance(
    transaction,
    input,
    contextWithoutEvidence,
  );
  if (!scoreProvenance.valid) return { outcome: "not_found", entity };
  const rawContext = contextWithEvaluationEvidence(
    contextWithoutEvidence,
    scoreProvenance,
  );
  const context = selectedPromotionContext(input, rawContext, scoreProvenance);
  return context === null
    ? { outcome: "not_found", entity }
    : { outcome: "found", context };
}

function evidenceForPromotionEntity(
  entityId: string,
  signals: readonly GlobalRadarSignal[],
  evidence: readonly GlobalSignalEvidence[],
): GlobalSignalEvidence[] {
  const momentumSignalIds = new Set(
    signals
      .filter(({ signalClass }) => signalClass === "ecosystem_momentum")
      .map(({ id }) => id),
  );
  return evidence.filter(
    ({ signalId, globalEntityId }) =>
      (globalEntityId === null || globalEntityId === entityId) &&
      (!momentumSignalIds.has(signalId) || globalEntityId === entityId),
  );
}

function contextWithEvaluationEvidence(
  context: UnselectedPromotionContext,
  scoreProvenance: ValidPromotionScoreProvenance,
): UnselectedPromotionContext {
  return {
    ...context,
    evidence: evidenceForPromotionEntity(
      context.entity.id,
      context.supportingSignals,
      scoreProvenance.items.flatMap(
        ({ provenance }) => provenance.evaluationEvidence,
      ),
    ),
  };
}

function scoreBearingSignalsForPromotion(
  input: Pick<CanonicalPromotionInput, "eligibilityPath">,
  context: Pick<UnselectedPromotionContext, "primarySignal" | "supportingSignals">,
): readonly GlobalRadarSignal[] {
  return input.eligibilityPath === "repeated_india_compatible_signals"
    ? context.supportingSignals
    : [context.primarySignal];
}

async function promotionScoreProvenance(
  transaction: DiscoveryTransaction,
  input: Pick<CanonicalPromotionInput, "eligibilityPath">,
  context: Pick<UnselectedPromotionContext, "primarySignal" | "supportingSignals">,
) {
  const signals = [...scoreBearingSignalsForPromotion(input, context)].sort(
    (left, right) => left.id.localeCompare(right.id),
  );
  return validateStoredGlobalRadarScoreProvenanceSelection(
    transaction,
    signals,
  );
}

async function rebindScoreSnapshotForStatus(
  transaction: DiscoveryTransaction,
  signal: GlobalRadarSignal,
  nextStatus: GlobalRadarSignal["status"],
  provenance: ValidStoredScoreProvenance,
) {
  const associations = await transaction
    .select({
      globalEntityId: globalRadarSignalEntities.globalEntityId,
      role: globalRadarSignalEntities.role,
    })
    .from(globalRadarSignalEntities)
    .where(eq(globalRadarSignalEntities.signalId, signal.id))
    .orderBy(
      asc(globalRadarSignalEntities.globalEntityId),
      asc(globalRadarSignalEntities.role),
    )
    .for("share");
  const referencedEntityIds = [
    ...new Set([
      ...(signal.globalEntityId === null ? [] : [signal.globalEntityId]),
      ...associations.map(({ globalEntityId }) => globalEntityId),
      ...provenance.evaluationEvidence.flatMap(({ globalEntityId }) =>
        globalEntityId === null ? [] : [globalEntityId],
      ),
    ]),
  ].sort();
  const entities =
    referencedEntityIds.length === 0
      ? []
      : await transaction
          .select({
            id: globalEntities.id,
            canonicalCorporateGroupId:
              globalEntities.canonicalCorporateGroupId,
          })
          .from(globalEntities)
          .where(inArray(globalEntities.id, referencedEntityIds))
          .orderBy(asc(globalEntities.id))
          .for("share");
  if (entities.length !== referencedEntityIds.length) {
    throw new Error("Radar promotion score-input entities are incomplete.");
  }

  const nextSignal = { ...signal, status: nextStatus };
  const scoreAsOf = new Date(provenance.snapshot.scoreAsOf);
  const actionabilityInput =
    signal.signalClass === "direct_demand"
      ? (provenance.snapshot.componentEvidence.find(
          ({ component }) => component === "actionability",
        )?.inputValue ?? null)
      : null;
  const scoreInputDigest = createStoredGlobalRadarScoreInputDigest({
    scoreAsOf,
    signal: nextSignal,
    actionabilityInput,
    associations,
    entities,
  });
  const components = storedScoreComponents(signal);
  return rebaseStoredScoreEvidenceSnapshot({
    scoreInputDigest,
    scoreAsOf,
    existingSnapshot: provenance.snapshot,
    signalClass: signal.signalClass,
    signalType: signal.signalType,
    currentIndiaRelevanceType: signal.indiaRelevanceType,
    nextIndiaRelevanceType: signal.indiaRelevanceType,
    scorePolicyVersion: "global-radar-score-v1",
    momentumPolicyVersion:
      signal.signalClass === "ecosystem_momentum"
        ? "global-radar-momentum-v1"
        : null,
    currentComponents: components,
    nextComponents: components,
    replacementComponents: [],
    momentumContributorEntityIds:
      signal.signalClass === "ecosystem_momentum"
        ? provenance.momentumContributorEntityIds
        : undefined,
    announcedAt: signal.announcedAt,
    effectiveFrom: signal.effectiveFrom,
    existingEvidence: provenance.evaluationEvidence,
    evidence: provenance.evaluationEvidence,
    evaluationEvidence: provenance.evaluationEvidence,
  });
}

function selectedPromotionContext(
  input: Pick<CanonicalPromotionInput, "eligibilityPath">,
  context: UnselectedPromotionContext,
  scoreProvenance: ValidPromotionScoreProvenance,
): PromotionContext | null {
  const selection = selectPromotionEvidence({
    eligibilityPath: input.eligibilityPath,
    entity: context.entity,
    primarySignal: context.primarySignal,
    supportingSignals: context.supportingSignals,
    availableEvidence: context.evidence,
    scoreEvidence: scoreProvenance.items.map(({ signalId, provenance }) => ({
      signalId,
      evaluationEvidence: provenance.evaluationEvidence,
      citedEvidence: provenance.citedEvidence,
    })),
  });
  return selection.valid
    ? { ...context, evidence: selection.evidence }
    : null;
}

async function readPromotionContext(
  database: MewtualsDatabase,
  input: Readonly<{
    globalEntityId: string;
    primarySignalId: string;
    promotionSupportingSignalIds: string[];
    eligibilityPath: CanonicalPromotionInput["eligibilityPath"];
  }>,
): Promise<LoadedGlobalRadarPromotionContext | null> {
  return database.transaction(async (transaction) => {
    const [entity] = await transaction
      .select()
      .from(globalEntities)
      .where(eq(globalEntities.id, input.globalEntityId))
      .limit(1);
    if (!entity) return null;
    const supportingSignals = await transaction
      .select()
      .from(globalRadarSignals)
      .where(
        inArray(
          globalRadarSignals.id,
          input.promotionSupportingSignalIds,
        ),
      )
      .orderBy(asc(globalRadarSignals.id));
    const primarySignal = supportingSignals.find(
      ({ id }) => id === input.primarySignalId,
    );
    if (
      !primarySignal ||
      supportingSignals.length !== input.promotionSupportingSignalIds.length
    ) return null;
    const identityProbe = discoveryCandidateIdentityProbe(entity);
    const identityConflict = identityProbe
      ? await inspectDiscoveryCandidateIdentityConflict(
          transaction,
          identityProbe,
        )
      : null;
    const contextWithoutEvidence: UnselectedPromotionContext = {
      entity,
      primarySignal,
      supportingSignals,
      evidence: [],
    };
    const scoreProvenance = await promotionScoreProvenance(
      transaction,
      input,
      contextWithoutEvidence,
    );
    if (!scoreProvenance.valid) return null;
    const rawContext = contextWithEvaluationEvidence(
      contextWithoutEvidence,
      scoreProvenance,
    );
    const context = selectedPromotionContext(input, rawContext, scoreProvenance);
    if (!context) return null;
    return {
      ...context,
      promotionSupportingSignalIds: input.promotionSupportingSignalIds,
      eligibilityFacts: {
        hasPublicIdentityEvidence: identityProbe !== null,
        hasIdentifierConflict: identityConflict !== null,
      },
    };
  });
}

async function recordPromotionAttempt(
  transaction: DiscoveryTransaction,
  input: CanonicalPromotionInput,
  context: PromotionContext,
  status: "conflicted" | "failed",
  reason: PromotionAttemptReason | "persistence_failure",
): Promise<GlobalRadarPromotion> {
  const [promotion] = await transaction
    .insert(globalRadarPromotions)
    .values({
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      globalEntityId: context.entity.id,
      primarySignalId: context.primarySignal.id,
      supportingSignalIds: input.supportingSignalIds,
      eligibilityPath: input.eligibilityPath,
      expectedEntityRevision: input.expectedEntityRevision,
      expectedPrimarySignalRevision: input.expectedPrimarySignalRevision,
      expectedSupportingSignalRevisions:
        input.expectedSupportingSignalRevisions,
      previousEntityStatus: context.entity.entityStatus,
      previousPrimarySignalStatus: context.primarySignal.status,
      entitySnapshot: entitySafeSnapshot(context.entity, reason),
      primarySignalSnapshot: signalSafeSnapshot(context.primarySignal),
      supportingSignalsSnapshot: context.supportingSignals.map(
        signalSafeSnapshot,
      ),
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      reason: input.reason,
      sourceSnapshotDigest: sourceSnapshotDigest(context.evidence),
      status,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  if (!promotion) throw new Error("Promotion attempt was not recorded.");
  await transaction.insert(globalRadarAdminEvents).values({
    actorType: "administrator",
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    targetType: "promotion_attempt",
    targetId: promotion.id,
    action: status === "failed" ? "promotion_failed" : "promotion_conflicted",
    reason:
      status === "failed"
        ? "Global Radar promotion persistence failed."
        : `Global Radar promotion conflicted: ${reason}.`,
    beforeSafeState: {
      entity: entitySafeSnapshot(context.entity),
      primarySignal: signalSafeSnapshot(context.primarySignal),
    },
    afterSafeState: {
      promotionId: promotion.id,
      status,
      reasonCode: reason,
      requestFingerprint: input.requestHash,
    },
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
  });
  return promotion;
}

async function conflictPromotion(
  transaction: DiscoveryTransaction,
  input: CanonicalPromotionInput,
  context: PromotionContext,
  reason: PromotionAttemptReason,
): Promise<PromoteGlobalRadarEntityResult> {
  const promotion = await recordPromotionAttempt(
    transaction,
    input,
    context,
    "conflicted",
    reason,
  );
  return { outcome: "conflict", reason, promotion };
}

function revisionsMatch(
  input: CanonicalPromotionInput,
  context: PromotionContext,
): boolean {
  return (
    context.entity.revision === input.expectedEntityRevision &&
    context.primarySignal.revision === input.expectedPrimarySignalRevision &&
    context.supportingSignals.every(
      ({ id, revision }) =>
        input.expectedSupportingSignalRevisions[id] === revision,
    )
  );
}

async function signalsBelongToEntity(
  transaction: DiscoveryTransaction,
  context: PromotionContext,
): Promise<boolean> {
  const associatedMomentumSignalIds = context.supportingSignals
    .filter(
      ({ globalEntityId, signalClass }) =>
        globalEntityId === null && signalClass === "ecosystem_momentum",
    )
    .map(({ id }) => id);
  const contributorMemberships = associatedMomentumSignalIds.length === 0
    ? []
    : await transaction
        .select({ signalId: globalRadarSignalEntities.signalId })
        .from(globalRadarSignalEntities)
        .where(
          and(
            inArray(
              globalRadarSignalEntities.signalId,
              associatedMomentumSignalIds,
            ),
            eq(
              globalRadarSignalEntities.globalEntityId,
              context.entity.id,
            ),
            eq(globalRadarSignalEntities.role, "contributor"),
          ),
        );
  const contributorSignalIds = new Set(
    contributorMemberships.map(({ signalId }) => signalId),
  );
  return context.supportingSignals.every(
    ({ id, globalEntityId, signalClass, mergedIntoSignalId }) =>
      mergedIntoSignalId === null &&
      (globalEntityId === context.entity.id ||
        (globalEntityId === null &&
          signalClass === "ecosystem_momentum" &&
          contributorSignalIds.has(id) &&
          context.evidence.some(({ signalId }) => signalId === id))),
  );
}

function discoverySources(
  evidence: readonly SelectedPromotionEvidence[],
  candidateId: string,
): DiscoveryCandidateSourceWrite[] {
  const sourceByIdentity = new Map<string, DiscoveryCandidateSourceWrite>();
  for (const source of evidence) {
    const sourceName = source.sourceName.trim().slice(0, 100);
    if (!sourceName) continue;
    const row = {
      candidateId,
      sourceName,
      sourceUrl: source.sourceUrl,
      rawMetadata: {
        source: "global_demand_radar",
        globalRadarSignalId: source.signalId,
        globalRadarEvidenceIngestOrdinal: source.ingestOrdinal,
        evidenceFingerprint: source.evidenceFingerprint,
        sourceFamily: source.sourceFamily,
        isPrimarySource: source.isPrimarySource,
        supportsIndiaRelevance: source.supportsIndiaRelevance,
        selectionRoles: source.selectionRoles,
      },
    };
    sourceByIdentity.set(`${sourceName}\n${source.sourceUrl}`, row);
  }
  return [...sourceByIdentity.values()].slice(0, 100);
}

function discoverySourceNames(evidence: readonly SelectedPromotionEvidence[]) {
  return [
    ...new Set(
      evidence
        .map(({ sourceName }) => sourceName.trim().slice(0, 100))
        .filter(Boolean),
    ),
  ].sort().slice(0, 50);
}

async function persistPromotion(
  transaction: DiscoveryTransaction,
  input: CanonicalPromotionInput,
  context: PromotionContext,
  candidate: DiscoveryBatchCandidate,
  primaryScoreProvenance: ValidStoredScoreProvenance,
): Promise<GlobalRadarPromotionSuccess> {
  const [run] = await transaction
    .insert(discoveryRuns)
    .values({
      externalRunKey: `radar-promotion:${input.idempotencyKey}`,
      campaignKey: "general_discovery",
      trigger: "radar_promotion",
      status: "succeeded",
      startedAt: input.now,
      completedAt: input.now,
      geography: candidate.geography,
      candidateType: candidate.type,
      sourcesUsed: discoverySourceNames(context.evidence),
      requestedCount: 1,
      companyPercentage: candidate.type === "company" ? 100 : 0,
      foundCount: 1,
      newCount: 0,
      duplicateCount: 0,
      errorSummary: {},
      requestedByEmail: input.actor.email,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  if (!run) throw new Error("Radar promotion intake run was not created.");
  const candidateWrite = await writeDiscoveryCandidates(transaction, {
    runId: run.id,
    now: input.now,
    candidates: [candidate],
  });
  if (
    candidateWrite.outcome !== "written" ||
    candidateWrite.identityConflicts.length > 0 ||
    candidateWrite.candidates.length !== 1
  ) throw new Error("Radar promotion candidate identity changed while locked.");
  const candidateId = candidateWrite.candidates[0]!.candidateId;
  await upsertDiscoveryCandidateSources(transaction, {
    runId: run.id,
    now: input.now,
    sources: discoverySources(context.evidence, candidateId),
  });
  const [completedRun] = await transaction
    .update(discoveryRuns)
    .set({
      newCount: candidateWrite.newCount,
      duplicateCount: candidateWrite.duplicateCount,
      updatedAt: input.now,
    })
    .where(eq(discoveryRuns.id, run.id))
    .returning();
  if (!completedRun) throw new Error("Radar promotion intake run was not completed.");

  const promotedEntityRevision = context.entity.revision + 1;
  const promotedPrimarySignalRevision = context.primarySignal.revision + 1;
  const promotedScoreEvidenceSnapshot = await rebindScoreSnapshotForStatus(
    transaction,
    context.primarySignal,
    "promoted",
    primaryScoreProvenance,
  );
  const [promotion] = await transaction
    .insert(globalRadarPromotions)
    .values({
      idempotencyKey: input.idempotencyKey,
      requestHash: input.requestHash,
      globalEntityId: context.entity.id,
      primarySignalId: context.primarySignal.id,
      supportingSignalIds: input.supportingSignalIds,
      eligibilityPath: input.eligibilityPath,
      expectedEntityRevision: input.expectedEntityRevision,
      expectedPrimarySignalRevision: input.expectedPrimarySignalRevision,
      expectedSupportingSignalRevisions:
        input.expectedSupportingSignalRevisions,
      promotedEntityRevision,
      promotedPrimarySignalRevision,
      previousEntityStatus: context.entity.entityStatus,
      previousPrimarySignalStatus: context.primarySignal.status,
      entitySnapshot: entitySafeSnapshot(context.entity),
      primarySignalSnapshot: signalSafeSnapshot(context.primarySignal),
      supportingSignalsSnapshot: context.supportingSignals.map(
        signalSafeSnapshot,
      ),
      discoveryRunId: completedRun.id,
      discoveryCandidateId: candidateId,
      actorUserId: input.actor.userId,
      actorEmail: input.actor.email,
      reason: input.reason,
      sourceSnapshotDigest: sourceSnapshotDigest(context.evidence),
      status: "active",
      promotedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  if (!promotion) throw new Error("Radar promotion was not recorded.");
  const [entity] = await transaction
    .update(globalEntities)
    .set({
      entityStatus: "promoted_to_candidate",
      promotedCandidateId: candidateId,
      revision: promotedEntityRevision,
      updatedAt: input.now,
    })
    .where(eq(globalEntities.id, context.entity.id))
    .returning();
  const [primarySignal] = await transaction
    .update(globalRadarSignals)
    .set({
      status: "promoted",
      scoreEvidenceSnapshot: promotedScoreEvidenceSnapshot,
      revision: promotedPrimarySignalRevision,
      updatedAt: input.now,
    })
    .where(eq(globalRadarSignals.id, context.primarySignal.id))
    .returning();
  if (!entity || !primarySignal) {
    throw new Error("Radar promotion state was not updated.");
  }
  await transaction.insert(globalSignalUpdates).values({
    signalId: context.primarySignal.id,
    updateType: "promoted",
    previousSafeState: signalSafeSnapshot(context.primarySignal),
    newSafeState: signalSafeSnapshot(primarySignal),
    actorType: "administrator",
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    reason: input.reason,
    observedAt: input.now,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
  });
  await transaction.insert(globalRadarAdminEvents).values({
    actorType: "administrator",
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    targetType: "promotion",
    targetId: promotion.id,
    action: "promoted_to_discovery",
    reason: input.reason,
    beforeSafeState: {
      entity: entitySafeSnapshot(context.entity),
      primarySignal: signalSafeSnapshot(context.primarySignal),
    },
    afterSafeState: {
      promotionId: promotion.id,
      discoveryRunId: completedRun.id,
      discoveryCandidateId: candidateId,
      eligibilityPath: input.eligibilityPath,
      entity: entitySafeSnapshot(entity),
      primarySignal: signalSafeSnapshot(primarySignal),
      requestFingerprint: input.requestHash,
    },
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
  });
  const [storedCandidate] = await transaction
    .select()
    .from(discoveryCandidates)
    .where(eq(discoveryCandidates.id, candidateId))
    .limit(1);
  if (!storedCandidate) throw new Error("Promoted candidate could not be read.");
  return {
    promotion,
    entity,
    primarySignal,
    run: completedRun,
    candidate: storedCandidate,
  };
}

async function failedPromotionAttempt(
  database: MewtualsDatabase,
  input: CanonicalPromotionInput,
): Promise<PromoteGlobalRadarEntityResult> {
  try {
    return await database.transaction(async (transaction) => {
      await takePromotionIdempotencyLock(
        transaction,
        PROMOTION_LOCK_NAMESPACE,
        input.idempotencyKey,
      );
      const [existing] = await transaction
        .select()
        .from(globalRadarPromotions)
        .where(eq(globalRadarPromotions.idempotencyKey, input.idempotencyKey))
        .limit(1);
      if (existing) {
        return existingPromotionOutcome(transaction, existing, input.requestHash);
      }
      const loaded = await loadPromotionContext(transaction, input);
      if (loaded.outcome !== "found") {
        throw new GlobalRadarPromotionUnavailableError();
      }
      const promotion = await recordPromotionAttempt(
        transaction,
        input,
        loaded.context,
        "failed",
        "persistence_failure",
      );
      return {
        outcome: "failed" as const,
        reason: "persistence_failure" as const,
        promotion,
      };
    });
  } catch {
    throw new GlobalRadarPromotionUnavailableError();
  }
}

async function loadReversalRows(
  transaction: DiscoveryTransaction,
  promotion: GlobalRadarPromotion,
) {
  const [[entity], [primarySignal]] = await Promise.all([
    transaction
      .select()
      .from(globalEntities)
      .where(eq(globalEntities.id, promotion.globalEntityId))
      .limit(1),
    transaction
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, promotion.primarySignalId))
      .limit(1),
  ]);
  return entity && primarySignal ? { entity, primarySignal } : null;
}

async function reversalConflictEvent(
  transaction: DiscoveryTransaction,
  input: CanonicalReversalInput,
  promotion: GlobalRadarPromotion,
  entity: GlobalEntity,
  primarySignal: GlobalRadarSignal,
  reason: Exclude<
    GlobalRadarReversalConflictReason,
    "invalid_input" | "not_found" | "idempotency_mismatch"
  >,
) {
  await transaction.insert(globalRadarAdminEvents).values({
    actorType: "administrator",
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    targetType: "promotion_reversal",
    targetId: promotion.id,
    action: "promotion_reversal_conflicted",
    reason: `Global Radar promotion reversal conflicted: ${reason}.`,
    beforeSafeState: {
      entity: entitySafeSnapshot(entity),
      primarySignal: signalSafeSnapshot(primarySignal),
    },
    afterSafeState: {
      promotionId: promotion.id,
      reasonCode: reason,
      requestFingerprint: input.requestHash,
    },
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
  });
}

async function persistReversal(
  transaction: DiscoveryTransaction,
  input: CanonicalReversalInput,
  promotion: GlobalRadarPromotion,
  entity: GlobalEntity,
  primarySignal: GlobalRadarSignal,
  primaryScoreProvenance: ValidStoredScoreProvenance,
): Promise<ReverseGlobalRadarPromotionResult> {
  const restoredEntityRevision = entity.revision + 1;
  const restoredPrimarySignalRevision = primarySignal.revision + 1;
  const restoredScoreEvidenceSnapshot = await rebindScoreSnapshotForStatus(
    transaction,
    primarySignal,
    promotion.previousPrimarySignalStatus,
    primaryScoreProvenance,
  );
  const [reversedPromotion] = await transaction
    .update(globalRadarPromotions)
    .set({
      status: "reversed",
      reversalIdempotencyKey: input.idempotencyKey,
      reversalRequestHash: input.requestHash,
      reversedAt: input.now,
      reversedByUserId: input.actor.userId,
      reversedByEmail: input.actor.email,
      reversalReason: input.reason,
      updatedAt: input.now,
    })
    .where(eq(globalRadarPromotions.id, promotion.id))
    .returning();
  const [restoredEntity] = await transaction
    .update(globalEntities)
    .set({
      entityStatus: promotion.previousEntityStatus,
      promotedCandidateId: null,
      revision: restoredEntityRevision,
      updatedAt: input.now,
    })
    .where(eq(globalEntities.id, entity.id))
    .returning();
  const [restoredPrimarySignal] = await transaction
    .update(globalRadarSignals)
    .set({
      status: promotion.previousPrimarySignalStatus,
      scoreEvidenceSnapshot: restoredScoreEvidenceSnapshot,
      revision: restoredPrimarySignalRevision,
      updatedAt: input.now,
    })
    .where(eq(globalRadarSignals.id, primarySignal.id))
    .returning();
  if (!reversedPromotion || !restoredEntity || !restoredPrimarySignal) {
    throw new Error("Radar promotion reversal was not persisted.");
  }
  await transaction.insert(globalSignalUpdates).values({
    signalId: primarySignal.id,
    updateType: "promotion_reversed",
    previousSafeState: signalSafeSnapshot(primarySignal),
    newSafeState: signalSafeSnapshot(restoredPrimarySignal),
    actorType: "administrator",
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    reason: input.reason,
    observedAt: input.now,
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
  });
  await transaction.insert(globalRadarAdminEvents).values({
    actorType: "administrator",
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    targetType: "promotion",
    targetId: promotion.id,
    action: "promotion_reversed",
    reason: input.reason,
    beforeSafeState: {
      entity: entitySafeSnapshot(entity),
      primarySignal: signalSafeSnapshot(primarySignal),
    },
    afterSafeState: {
      promotionId: promotion.id,
      entity: entitySafeSnapshot(restoredEntity),
      primarySignal: signalSafeSnapshot(restoredPrimarySignal),
      discoveryCandidatePreserved: promotion.discoveryCandidateId,
      requestFingerprint: input.requestHash,
    },
    idempotencyKey: input.idempotencyKey,
    createdAt: input.now,
  });
  return {
    outcome: "reversed",
    promotion: reversedPromotion,
    entity: restoredEntity,
    primarySignal: restoredPrimarySignal,
  };
}

export function createGlobalRadarPromotionRepository(
  database: MewtualsDatabase,
  configuration: GlobalRadarPromotionConfiguration,
): GlobalRadarPromotionRepository {
  if (!validPromotionConfiguration(configuration)) {
    throw new Error("Global Radar promotion configuration is invalid.");
  }

  return {
    async lookupPromotionReplay(rawInput): Promise<LookupGlobalRadarPromotionReplayResult> {
      const input = canonicalPromotionInput(rawInput);
      if (!input) return { outcome: "conflict", reason: "invalid_input" };
      return database.transaction(async (transaction) => {
        const [existing] = await transaction
          .select()
          .from(globalRadarPromotions)
          .where(
            eq(globalRadarPromotions.idempotencyKey, input.idempotencyKey),
          )
          .limit(1);
        return existing
          ? existingPromotionOutcome(transaction, existing, input.requestHash)
          : { outcome: "not_found" as const };
      });
    },

    async loadContext(rawInput) {
      const input = canonicalPromotionContextSelection(rawInput);
      if (!input) return { outcome: "invalid_input" };
      const context = await readPromotionContext(database, input);
      return context
        ? { outcome: "found", context }
        : { outcome: "not_found" };
    },

    async promote(rawInput) {
      const input = canonicalPromotionInput(rawInput);
      if (!input) return { outcome: "conflict", reason: "invalid_input" };
      try {
        return await database.transaction(async (transaction) => {
          await takePromotionIdempotencyLock(
            transaction,
            PROMOTION_LOCK_NAMESPACE,
            input.idempotencyKey,
          );
          const [existing] = await transaction
            .select()
            .from(globalRadarPromotions)
            .where(
              eq(globalRadarPromotions.idempotencyKey, input.idempotencyKey),
            )
            .limit(1);
          if (existing) {
            return existingPromotionOutcome(
              transaction,
              existing,
              input.requestHash,
            );
          }

          const [entity] = await transaction
            .select()
            .from(globalEntities)
            .where(eq(globalEntities.id, input.globalEntityId))
            .limit(1)
            .for("update");
          if (!entity) return { outcome: "conflict", reason: "not_found" };
          const [activePromotion] = await transaction
            .select()
            .from(globalRadarPromotions)
            .where(
              and(
                eq(globalRadarPromotions.globalEntityId, entity.id),
                eq(globalRadarPromotions.status, "active"),
              ),
            )
            .limit(1)
            .for("update");

          const supportingSignals = await transaction
            .select()
            .from(globalRadarSignals)
            .where(inArray(globalRadarSignals.id, input.supportingSignalIds))
            .orderBy(asc(globalRadarSignals.id))
            .for("update");
          const primarySignal = supportingSignals.find(
            ({ id }) => id === input.primarySignalId,
          );
          if (!primarySignal) {
            return { outcome: "conflict", reason: "not_found" };
          }
          const contextWithoutEvidence: UnselectedPromotionContext = {
            entity,
            primarySignal,
            supportingSignals,
            evidence: [],
          };
          const scoreProvenance = await promotionScoreProvenance(
            transaction,
            input,
            contextWithoutEvidence,
          );
          if (!scoreProvenance.valid) {
            return { outcome: "conflict", reason: "eligibility_not_met" };
          }
          const rawContext = contextWithEvaluationEvidence(
            contextWithoutEvidence,
            scoreProvenance,
          );
          if (
            input.eligibilityPath === "documented_indian_relationship" &&
            hasInvalidDocumentedIndianRelationshipClaim({
              entityId: entity.id,
              primarySignalId: primarySignal.id,
              evidence: rawContext.evidence,
            })
          ) {
            return { outcome: "conflict", reason: "eligibility_not_met" };
          }
          const context = selectedPromotionContext(
            input,
            rawContext,
            scoreProvenance,
          );
          if (!context) {
            return { outcome: "conflict", reason: "eligibility_not_met" };
          }
          const primaryScoreProvenance = scoreProvenance.items.find(
            ({ signalId }) => signalId === primarySignal.id,
          )?.provenance;
          if (!primaryScoreProvenance) {
            return { outcome: "conflict", reason: "eligibility_not_met" };
          }
          if (activePromotion) {
            return conflictPromotion(
              transaction,
              input,
              context,
              "active_promotion_exists",
            );
          }
          if (supportingSignals.length !== input.supportingSignalIds.length) {
            return conflictPromotion(
              transaction,
              input,
              context,
              "supporting_signal_invalid",
            );
          }
          if (!revisionsMatch(input, context)) {
            return conflictPromotion(
              transaction,
              input,
              context,
              "revision_mismatch",
            );
          }
          if (!(await actorIsPersistedAdministrator(transaction, input.actor))) {
            return conflictPromotion(
              transaction,
              input,
              context,
              "administrator_required",
            );
          }
          if (primarySignal.status !== "qualified") {
            return conflictPromotion(
              transaction,
              input,
              context,
              "primary_signal_not_qualified",
            );
          }
          if (!(await signalsBelongToEntity(transaction, context))) {
            return conflictPromotion(
              transaction,
              input,
              context,
              "signal_entity_mismatch",
            );
          }
          if (!promotionEligibilityMet(input, context, configuration)) {
            return {
              outcome: "conflict" as const,
              reason: "eligibility_not_met" as const,
            };
          }
          const mappedCandidate = mappedDiscoveryCandidate(input, context);
          if (mappedCandidate.outcome === "conflict") {
            return conflictPromotion(
              transaction,
              input,
              context,
              mappedCandidate.reason,
            );
          }
          const identityConflict = await findDiscoveryCandidateIdentityConflict(
            transaction,
            mappedCandidate.candidate,
          );
          if (identityConflict) {
            return conflictPromotion(
              transaction,
              input,
              context,
              "candidate_identity_conflict",
            );
          }
          const success = await persistPromotion(
            transaction,
            input,
            context,
            mappedCandidate.candidate,
            primaryScoreProvenance,
          );
          return { outcome: "promoted" as const, ...success };
        });
      } catch (error) {
        if (error instanceof GlobalRadarPromotionUnavailableError) throw error;
        return failedPromotionAttempt(database, input);
      }
    },

    async reverse(rawInput) {
      const input = canonicalReversalInput(rawInput);
      if (!input) return { outcome: "conflict", reason: "invalid_input" };
      return database.transaction(async (transaction) => {
        await takePromotionIdempotencyLock(
          transaction,
          REVERSAL_LOCK_NAMESPACE,
          input.idempotencyKey,
        );
        const [existingReversal] = await transaction
          .select()
          .from(globalRadarPromotions)
          .where(
            eq(
              globalRadarPromotions.reversalIdempotencyKey,
              input.idempotencyKey,
            ),
          )
          .limit(1);
        if (existingReversal) {
          if (existingReversal.reversalRequestHash !== input.requestHash) {
            return { outcome: "conflict", reason: "idempotency_mismatch" };
          }
          const rows = await loadReversalRows(transaction, existingReversal);
          if (!rows) return { outcome: "conflict", reason: "not_found" };
          return {
            outcome: "replayed",
            promotion: existingReversal,
            ...rows,
          };
        }
        const [existingConflictEvent] = await transaction
          .select({
            targetId: globalRadarAdminEvents.targetId,
            afterSafeState: globalRadarAdminEvents.afterSafeState,
          })
          .from(globalRadarAdminEvents)
          .where(
            and(
              eq(globalRadarAdminEvents.targetType, "promotion_reversal"),
              eq(globalRadarAdminEvents.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (existingConflictEvent) {
          if (
            storedSafeString(
              existingConflictEvent.afterSafeState,
              "requestFingerprint",
            ) !== input.requestHash
          ) {
            return { outcome: "conflict", reason: "idempotency_mismatch" };
          }
          const reason = storedSafeString(
            existingConflictEvent.afterSafeState,
            "reasonCode",
          );
          const replayableReasons = new Set<GlobalRadarReversalConflictReason>([
            "administrator_required",
            "revision_mismatch",
            "restoration_not_safe",
          ]);
          const [promotion] = await transaction
            .select()
            .from(globalRadarPromotions)
            .where(eq(globalRadarPromotions.id, existingConflictEvent.targetId))
            .limit(1);
          return {
            outcome: "conflict",
            reason:
              reason && replayableReasons.has(
                reason as GlobalRadarReversalConflictReason,
              )
                ? (reason as GlobalRadarReversalConflictReason)
                : "restoration_not_safe",
            ...(promotion ? { promotion } : {}),
          };
        }

        const [entity] = await transaction
          .select()
          .from(globalEntities)
          .where(eq(globalEntities.id, input.globalEntityId))
          .limit(1)
          .for("update");
        if (!entity) return { outcome: "conflict", reason: "not_found" };
        const [promotion] = await transaction
          .select()
          .from(globalRadarPromotions)
          .where(
            and(
              eq(globalRadarPromotions.globalEntityId, entity.id),
              eq(globalRadarPromotions.status, "active"),
            ),
          )
          .orderBy(desc(globalRadarPromotions.createdAt))
          .limit(1)
          .for("update");
        if (!promotion) {
          return { outcome: "conflict", reason: "no_active_promotion" };
        }
        const [primarySignal] = await transaction
          .select()
          .from(globalRadarSignals)
          .where(eq(globalRadarSignals.id, promotion.primarySignalId))
          .limit(1)
          .for("update");
        if (!primarySignal) return { outcome: "conflict", reason: "not_found" };
        const primaryScoreProvenance =
          await validateStoredGlobalRadarScoreProvenance(
            transaction,
            primarySignal,
          );
        if (!primaryScoreProvenance.valid) {
          return {
            outcome: "conflict",
            reason: "restoration_not_safe",
            promotion,
          };
        }
        if (!(await actorIsPersistedAdministrator(transaction, input.actor))) {
          await reversalConflictEvent(
            transaction,
            input,
            promotion,
            entity,
            primarySignal,
            "administrator_required",
          );
          return {
            outcome: "conflict",
            reason: "administrator_required",
            promotion,
          };
        }
        if (
          entity.revision !== input.expectedEntityRevision ||
          primarySignal.revision !== input.expectedPrimarySignalRevision ||
          promotion.promotedEntityRevision !== entity.revision ||
          promotion.promotedPrimarySignalRevision !== primarySignal.revision
        ) {
          await reversalConflictEvent(
            transaction,
            input,
            promotion,
            entity,
            primarySignal,
            "revision_mismatch",
          );
          return {
            outcome: "conflict",
            reason: "revision_mismatch",
            promotion,
          };
        }
        if (
          entity.entityStatus !== "promoted_to_candidate" ||
          primarySignal.status !== "promoted" ||
          entity.promotedCandidateId !== promotion.discoveryCandidateId
        ) {
          await reversalConflictEvent(
            transaction,
            input,
            promotion,
            entity,
            primarySignal,
            "restoration_not_safe",
          );
          return {
            outcome: "conflict",
            reason: "restoration_not_safe",
            promotion,
          };
        }
        return persistReversal(
          transaction,
          input,
          promotion,
          entity,
          primarySignal,
          primaryScoreProvenance,
        );
      });
    },
  };
}
