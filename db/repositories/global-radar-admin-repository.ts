import {
  and,
  arrayOverlaps,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  max,
  or,
  sql,
} from "drizzle-orm";

import {
  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
  GLOBAL_RADAR_MOMENTUM_EVIDENCE_MAXIMUM_AGE_DAYS,
  GLOBAL_RADAR_SCORE_VERSION,
  createEntityIdentity,
  createGlobalRadarPublicIdentityAnchor,
  createGlobalRadarFingerprint,
  createGlobalRadarSignalDedupeKeyFromIdentityAnchors,
  deriveGlobalRadarReclassification,
  globalRadarAuthoredAuditTextSchema,
  globalRadarDemandFamilyLookup,
  hasCompleteScoreComponentEvidenceAssociations,
  isProfessionalResponsePathEvidenceField,
  isoTimestampSchema,
  missingMomentumWorkerScoredMetricEvidencePaths,
  missingWorkerScoredComponentEvidencePaths,
  resolveDirectDemandExpiryStatus,
  scoreDemandPrecursor,
  scoreDirectDemand,
  selectDirectDemandFreshnessEvidencePath,
  signalClassLookup,
  transitionSignal,
  type CandidateEvidence,
  type IndiaRelevanceType,
  type ProfessionalResponsePath,
  type SensitiveDataAndCompliance,
  type SignalClass,
  type SignalStatus,
} from "../../app/domain/global-radar";
import type { MewtualsDatabase } from "../client";
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
} from "../global-radar-schema";
import { users } from "../schema";
import {
  canonicalizeGlobalRadarAdminClassification,
  type GlobalRadarAdminClassificationInput,
} from "./global-radar-admin-classification";
import {
  createGlobalRadarClassificationGraph,
  createGlobalRadarDedupeLockKey,
  isGlobalRadarActiveDedupeConflict,
} from "./global-radar-admin-classification-transaction";
import {
  canonicalizeGlobalRadarAdminEvidence,
  isGlobalRadarEvidenceContributorEligible,
  type GlobalRadarAdminEvidenceInput,
} from "./global-radar-admin-evidence";
import {
  deriveGlobalRadarAdminMomentum,
  MAX_GLOBAL_RADAR_ADMIN_MOMENTUM_EVIDENCE,
} from "./global-radar-admin-momentum";
import {
  createStoredGlobalRadarScoreInputDigest,
  createStoredScoreEvidenceSnapshot,
  eligibleMomentumEvidenceInWindowConditions,
  rebaseStoredScoreEvidenceSnapshot,
  storedScoreComponents,
  type StoredScoreEvidenceRow,
  type StoredScoreEvaluationEvidenceRow,
} from "./global-radar-score-evidence";
import {
  validateStoredGlobalRadarScoreProvenance,
  validateStoredGlobalRadarScoreProvenanceBatch,
} from "./global-radar-stored-score-provenance";

import {
  createGlobalRadarAdminDetailRepository,
} from "./global-radar-admin-detail-repository";
import {
  boundGlobalRadarCollisionCandidateIds,
  canonicalizeGlobalRadarWatchlistConfiguration,
  toSafeGlobalRadarEntity,
  toSafeGlobalRadarWatchlistEntry,
  type GlobalRadarWatchlistConfigurationInput,
  type GlobalRadarWatchlistEntityInput,
} from "./global-radar-admin-watchlist";
import {
  GLOBAL_RADAR_ADMIN_MAX_PAGE as MAX_PAGE,
  GLOBAL_RADAR_ADMIN_PAGE_SIZE as PAGE_SIZE,
  assembleGlobalRadarWatchlistEnrichment,
  countGlobalRadarSignalsObservedToday,
  globalRadarSafeListSelection as safeListSelection,
  globalRadarSignalFilterConditions as filterConditions,
  globalRadarSignalOrder as signalOrder,
  parseGlobalRadarSignalFilters as parseSignalFilters,
  isGlobalRadarAdminSignalId,
  isGlobalRadarEntityQualifiableStatus,
  toSafeGlobalRadarSignalListItem as toSafeListItem,
  type GlobalRadarAdminConfiguration,
  type GlobalRadarClassMetrics,
  type GlobalRadarCommonFilters,
  type GlobalRadarReadConflictReason,
  type GlobalRadarSignalListInput,
  type ListGlobalRadarSignalsResult,
  type SafeGlobalRadarAdminRun,
  type SafeGlobalRadarRunNotice,
  type SafeGlobalRadarOverviewMetrics,
  type SafeGlobalRadarSignalDetail,
  type SafeGlobalRadarWatchlistItem,
  type SafeGlobalRadarWatchlistEnrichment,
} from "./global-radar-admin-read-model";

const GLOBAL_RADAR_ADMIN_AGGREGATE_CHUNK_SIZE = 100;

export type { GlobalRadarAdminClassificationInput } from "./global-radar-admin-classification";
export type { GlobalRadarAdminEvidenceInput } from "./global-radar-admin-evidence";
export type {
  GlobalRadarWatchlistConfigurationInput,
  GlobalRadarWatchlistEntityInput,
} from "./global-radar-admin-watchlist";
export type {
  GlobalRadarAdminConfiguration,
  GlobalRadarClassMetrics,
  GlobalRadarCommonFilters,
  GlobalRadarHorizon,
  GlobalRadarSignalListInput,
  ListGlobalRadarSignalsResult,
  SafeGlobalRadarAdminRun,
  SafeGlobalRadarAdminNote,
  SafeGlobalRadarAssociatedOrganisation,
  SafeGlobalRadarEvidence,
  SafeGlobalRadarHistoryItem,
  SafeGlobalRadarOrganisation,
  SafeGlobalRadarOverviewMetrics,
  SafeGlobalRadarPromotionContext,
  SafeGlobalRadarRequirement,
  SafeGlobalRadarRunNotice,
  SafeGlobalRadarSignalDetail,
  SafeGlobalRadarSignalListItem,
  SafeGlobalRadarWatchlistEnrichment,
  SafeGlobalRadarWatchlistItem,
} from "./global-radar-admin-read-model";

type GlobalRadarAdminTransaction = Parameters<
  Parameters<MewtualsDatabase["transaction"]>[0]
>[0];

class InvalidStoredScoreEvidenceError extends Error {}

const administratorNoCurrentIndiaFitValues = Object.freeze({
  indiaRelevanceRationale:
    "An administrator reviewed the public evidence and marked this signal as having no current India fit.",
  indiaFitReasons: Object.freeze([
    "No current India fit was confirmed in the administrator review.",
  ]),
  indiaFitConstraints: Object.freeze([] as string[]),
  indiaFitUnknowns: Object.freeze([
    "India fit may change if new public evidence is added.",
  ]),
  indiaFitConfidence: 100,
  indiaRegulatoryFacts: null,
  indiaLogisticsFacts: null,
});

async function validateStoredScoreEvidenceForReview(
  transaction: GlobalRadarAdminTransaction,
  signal: typeof globalRadarSignals.$inferSelect,
) {
  const validation = await validateStoredGlobalRadarScoreProvenance(
    transaction,
    signal,
  );
  if (!validation.valid) {
    throw new InvalidStoredScoreEvidenceError(
      `Invalid stored Global Radar score provenance: ${validation.reason}.`,
    );
  }
  return validation;
}

async function createAdminGlobalRadarScoreInputDigest(
  transaction: GlobalRadarAdminTransaction,
  input: Readonly<{
    signal: typeof globalRadarSignals.$inferSelect;
    scoreAsOf: Date;
    actionabilityInput: number | null;
    evidence: readonly Readonly<{ globalEntityId: string | null }>[];
    overrides?: Partial<typeof globalRadarSignals.$inferSelect>;
  }>,
): Promise<string> {
  const scoreInputSignal = { ...input.signal, ...input.overrides };
  const associations = await transaction
    .select({
      globalEntityId: globalRadarSignalEntities.globalEntityId,
      role: globalRadarSignalEntities.role,
    })
    .from(globalRadarSignalEntities)
    .where(eq(globalRadarSignalEntities.signalId, input.signal.id));
  const entityIds = [
    ...new Set([
      ...(scoreInputSignal.globalEntityId === null
        ? []
        : [scoreInputSignal.globalEntityId]),
      ...associations.map(({ globalEntityId }) => globalEntityId),
      ...input.evidence.flatMap(({ globalEntityId }) =>
        globalEntityId === null ? [] : [globalEntityId],
      ),
    ]),
  ];
  const entities = entityIds.length
    ? await transaction
        .select({
          id: globalEntities.id,
          canonicalCorporateGroupId:
            globalEntities.canonicalCorporateGroupId,
        })
        .from(globalEntities)
        .where(inArray(globalEntities.id, entityIds))
    : [];
  if (entities.length !== entityIds.length) {
    throw new InvalidStoredScoreEvidenceError(
      "Invalid stored Global Radar score-input entity mapping.",
    );
  }
  return createStoredGlobalRadarScoreInputDigest({
    scoreAsOf: input.scoreAsOf,
    signal: scoreInputSignal,
    actionabilityInput: input.actionabilityInput,
    associations,
    entities,
  });
}

function parseTimestamp(value: unknown): Date | null {
  const parsed = isoTimestampSchema.safeParse(value);
  return parsed.success ? new Date(parsed.data) : null;
}

function validConfiguration(
  configuration: GlobalRadarAdminConfiguration,
): boolean {
  return (
    configuration.scoreVersion === GLOBAL_RADAR_SCORE_VERSION &&
    Object.entries(configuration.thresholds).every(
      ([signalClass, threshold]) =>
        signalClassLookup[signalClass as SignalClass] &&
        Number.isInteger(threshold) &&
        threshold >= 0 &&
        threshold <= 100,
    ) &&
    Object.keys(configuration.thresholds).length === 3
  );
}

function hasExactSignalIdParity(
  expectedIds: readonly string[],
  signals: readonly Readonly<{ id: string }>[],
): boolean {
  const expected = new Set(expectedIds);
  const actual = new Set(signals.map(({ id }) => id));
  return (
    expected.size === expectedIds.length &&
    actual.size === signals.length &&
    signals.length === expectedIds.length &&
    [...expected].every((id) => actual.has(id))
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type GlobalRadarAdminActor = Readonly<{
  userId: string;
  email: string;
}>;

export type GlobalRadarAdminEnvelope = Readonly<{
  expectedRevision: number;
  idempotencyKey: string;
  reason: string;
  now: Date;
}>;

export type GlobalRadarReviewCommand = Readonly<
  | { type: "request_review" }
  | { type: "monitor" }
  | { type: "qualify" }
  | { type: "dismiss" }
  | { type: "expire" }
  | { type: "reopen" }
  | { type: "mark_no_india_fit" }
>;

export type GlobalRadarSignalMutationConflictReason =
  | "invalid_input"
  | "not_found"
  | "revision_mismatch"
  | "idempotency_mismatch"
  | "transition_not_allowed"
  | "qualification_requirements_not_met"
  | "classification_requirements_not_met"
  | "duplicate_signal";

export type GlobalRadarSignalMutationResult =
  | { outcome: "updated" | "replayed"; detail: SafeGlobalRadarSignalDetail }
  | {
      outcome: "conflict";
      reason: GlobalRadarSignalMutationConflictReason;
      detail?: SafeGlobalRadarSignalDetail;
    };

type CanonicalAdminEnvelope = Readonly<{
  actor: GlobalRadarAdminActor;
  expectedRevision: number;
  idempotencyKey: string;
  reason: string;
  now: Date;
}>;

function canonicalAdminEnvelope(
  actor: GlobalRadarAdminActor,
  envelope: GlobalRadarAdminEnvelope,
): CanonicalAdminEnvelope | null {
  if (
    !actor ||
    !UUID_PATTERN.test(actor.userId) ||
    typeof actor.email !== "string" ||
    actor.email.trim().length < 3 ||
    actor.email.trim().length > 254 ||
    !Number.isInteger(envelope.expectedRevision) ||
    envelope.expectedRevision < 0 ||
    typeof envelope.idempotencyKey !== "string" ||
    !UUID_PATTERN.test(envelope.idempotencyKey) ||
    !(envelope.now instanceof Date) ||
    Number.isNaN(envelope.now.getTime())
  ) return null;
  const reason = globalRadarAuthoredAuditTextSchema.safeParse(envelope.reason);
  if (!reason.success) return null;
  return {
    actor: { userId: actor.userId.toLowerCase(), email: actor.email.trim() },
    expectedRevision: envelope.expectedRevision,
    idempotencyKey: envelope.idempotencyKey.toLowerCase(),
    reason: reason.data,
    now: new Date(envelope.now.getTime()),
  };
}

function requestFingerprint(value: Record<string, unknown>): string {
  return createGlobalRadarFingerprint({
    version: "global-radar-admin-request-v1",
    ...value,
  });
}

function storedRequestFingerprint(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fingerprint = (value as Record<string, unknown>).requestFingerprint;
  return typeof fingerprint === "string" && /^[a-f0-9]{64}$/.test(fingerprint)
    ? fingerprint
    : null;
}

type StoredAdminEvidenceRow = StoredScoreEvidenceRow & Readonly<{
  id: string;
  runId: string | null;
  canonicalSourceUrl: string;
  sourceType: string;
  sourceLanguage: string;
  evidenceClaim: string;
  sourceExcerpt: string | null;
  englishSummary: string;
  translationConfidence: number | null;
  supportsDirectDemand: boolean;
}>;

type StoredEntityIdentity = Readonly<{
  id: string;
  canonicalCorporateGroupId: string | null;
}>;

function candidateEvidenceFromStoredRows(
  evidence: readonly StoredAdminEvidenceRow[],
  entities: readonly StoredEntityIdentity[],
): readonly CandidateEvidence[] {
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  return evidence.map((item) => {
    const entity =
      item.globalEntityId === null
        ? null
        : (entityById.get(item.globalEntityId) ?? null);
    const unresolvedIdentity = item.evidenceFingerprint;
    return {
      sourceUrl: item.sourceUrl,
      canonicalSourceUrl: item.canonicalSourceUrl,
      // Summary and search-result proposals are rejected before persistence.
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
        entity?.canonicalCorporateGroupId ?? entity?.id ?? unresolvedIdentity,
      supportedFieldPaths: [...item.supportedFieldPaths],
    };
  });
}

function storedResponsePathCandidates(
  signal: Pick<
    typeof globalRadarSignals.$inferSelect,
    | "responsePathType"
    | "responsePathUrl"
    | "responseBusinessEmail"
  >,
  evidence: readonly StoredAdminEvidenceRow[],
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

function storedSensitiveDataAndCompliance(
  signal: typeof globalRadarSignals.$inferSelect,
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

function directSnapshotComponents(
  components: Readonly<{
    explicitness: number | null;
    evidenceConfidence: number | null;
    freshness: number | null;
    actionability: number | null;
    indiaFit: number | null;
    commercialPotential: number | null;
    repeatability: number | null;
    responseAccessibility: number | null;
    strategicLearning: number | null;
    complianceComplexity: number | null;
  }>,
): Readonly<Record<string, number | null>> {
  return {
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
}

function momentumSnapshotComponents(
  momentum: Extract<
    ReturnType<typeof deriveGlobalRadarAdminMomentum>,
    { outcome: "derived" }
  >["derivation"],
): Readonly<Record<string, number>> {
  return {
    independentEntityCount: momentum.counts.independentEntities,
    primarySourceCount: momentum.counts.primarySources,
    sourceFamilyCount: momentum.counts.sourceFamilies,
    volume7Days: momentum.windows.days7.recent,
    volume30Days: momentum.windows.days30.recent,
    volume90Days: momentum.windows.days90.recent,
    independentEntityBreadth: momentum.components.independentEntityBreadth,
    primarySourceDepth: momentum.components.primarySourceDepth,
    sourceDiversity: momentum.components.sourceDiversity,
    weightedVolume: momentum.components.weightedVolume,
    growthVsPreviousPeriod: momentum.components.growthVsPreceding,
    taxonomyConsistency: momentum.components.taxonomyConsistency,
    evidenceQuality: momentum.components.evidenceQuality,
  };
}

function isDirectDemandActive(
  signal: {
    evergreen: boolean | null;
    expiresAt: Date | null;
    reobserveBy: Date | null;
  },
  now: Date,
): boolean {
  return signal.evergreen === true
    ? signal.reobserveBy !== null && signal.reobserveBy > now
    : signal.expiresAt === null || signal.expiresAt > now;
}

function signalSafeState(signal: {
  signalClass: SignalClass;
  status: SignalStatus;
  indiaRelevanceType: IndiaRelevanceType;
  expiresAt: Date | null;
  evergreen: boolean | null;
  reobserveBy: Date | null;
  revision: number;
}) {
  return {
    signalClass: signal.signalClass,
    status: signal.status,
    indiaRelevanceType: signal.indiaRelevanceType,
    expiresAt: signal.expiresAt?.toISOString() ?? null,
    evergreen: signal.evergreen,
    reobserveBy: signal.reobserveBy?.toISOString() ?? null,
    revision: signal.revision,
  };
}

function classificationSafeState(
  signal: typeof globalRadarSignals.$inferSelect,
  associations: readonly Readonly<{
    globalEntityId: string;
    role: "supporting" | "contributor";
    confidence: number;
  }>[],
) {
  return {
    classification: {
      signalClass: signal.signalClass,
      signalType: signal.signalType,
      demandDomain: signal.demandDomain,
      primaryEntityId: signal.globalEntityId,
      associations: associations
        .map(({ globalEntityId, role, confidence }) => ({
          entityId: globalEntityId,
          role,
          confidence,
        }))
        .sort((left, right) => left.entityId.localeCompare(right.entityId)),
    },
    status: signal.status,
    indiaRelevanceType: signal.indiaRelevanceType,
    activity: {
      expiresAt: signal.expiresAt?.toISOString() ?? null,
      evergreen: signal.evergreen,
      reobserveBy: signal.reobserveBy?.toISOString() ?? null,
      responsePathType: signal.responsePathType,
      responsePathUrl: signal.responsePathUrl,
      responseBusinessEmail: signal.responseBusinessEmail,
      partnerApplicationUrl: signal.partnerApplicationUrl,
    },
    score: {
      coverage: signal.scoreCoverage,
      policyVersion: signal.scorePolicyVersion,
      directDemand: signal.directDemandScore,
      precursor: signal.precursorScore,
      momentum: signal.momentumScore,
      directComponents: {
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
      },
      precursorComponents: {
        proximityToExternalDemand: signal.proximityToExternalDemand,
        fundingDeploymentMomentum: signal.fundingDeploymentMomentum,
        likelyDataHardwareIntensity: signal.likelyDataHardwareIntensity,
        estimatedTimeHorizon: signal.estimatedTimeHorizon,
        strategicRelevance: signal.strategicRelevance,
      },
      momentumComponents: {
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
        policyVersion: signal.momentumPolicyVersion,
        qualificationGatesPassed: signal.momentumQualificationGatesPassed,
      },
    },
    dedupeKey: signal.dedupeKey,
    revision: signal.revision,
  };
}

export function createGlobalRadarAdminRepository(
  database: MewtualsDatabase,
  configuration: GlobalRadarAdminConfiguration,
) {
  if (!validConfiguration(configuration)) {
    throw new Error("Global Radar administrator configuration is invalid.");
  }

  const detailRepository = createGlobalRadarAdminDetailRepository(database);
  const getDetail = detailRepository.getSignalDetail;
  const repository = {
    ...detailRepository,
    async listSignals(input: GlobalRadarSignalListInput): Promise<ListGlobalRadarSignalsResult> {
      if (!signalClassLookup[input.signalClass]) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      const filters = parseSignalFilters(input.signalClass, input.filters);
      if (!filters) return { outcome: "conflict", reason: "invalid_input" };
      const conditions = filterConditions(input.signalClass, filters);
      const [countRow] = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(globalRadarSignals)
        .where(and(...conditions));
      const rows = await database
        .select(safeListSelection())
        .from(globalRadarSignals)
        .leftJoin(globalEntities, eq(globalRadarSignals.globalEntityId, globalEntities.id))
        .where(and(...conditions))
        .orderBy(...signalOrder(input.signalClass))
        .limit(PAGE_SIZE)
        .offset((filters.page - 1) * PAGE_SIZE);
      const storedSignals = rows.length
        ? await database
            .select()
            .from(globalRadarSignals)
            .where(inArray(globalRadarSignals.id, rows.map(({ id }) => id)))
        : [];
      if (!hasExactSignalIdParity(rows.map(({ id }) => id), storedSignals)) {
        return {
          outcome: "conflict",
          reason: "score_provenance_invalid",
        };
      }
      const scoreProvenance =
        await validateStoredGlobalRadarScoreProvenanceBatch(
          database,
          storedSignals,
        );
      if (!scoreProvenance.valid) {
        return {
          outcome: "conflict",
          reason: "score_provenance_invalid",
        };
      }
      return {
        outcome: "listed",
        page: filters.page,
        pageSize: PAGE_SIZE,
        total: countRow?.count ?? 0,
        items: rows.map(toSafeListItem),
      };
    },

    async getClassMetrics(input: {
      signalClass: SignalClass;
      filters: GlobalRadarCommonFilters;
      now: Date;
    }): Promise<
      | { outcome: "listed"; metrics: GlobalRadarClassMetrics }
      | { outcome: "conflict"; reason: GlobalRadarReadConflictReason }
    > {
      if (
        !signalClassLookup[input.signalClass] ||
        !(input.now instanceof Date) ||
        Number.isNaN(input.now.getTime())
      ) return { outcome: "conflict", reason: "invalid_input" };
      const filters = parseSignalFilters(input.signalClass, input.filters);
      if (!filters) return { outcome: "conflict", reason: "invalid_input" };
      const byStatus: Partial<Record<SignalStatus, number>> = {};
      const demandFamilies: Record<string, number> = {};
      const horizon = {
        within30Days: 0,
        days31To90: 0,
        days91To180: 0,
        days181To365: 0,
        unknown: 0,
      };
      let highQuality = 0;
      let explicit = 0;
      let inferred = 0;
      let unitedStates = 0;
      let china = 0;
      let physicalData = 0;
      let hardware = 0;
      let active = 0;
      let expiring = 0;
      let qualified = 0;
      let total = 0;
      let cursor: string | null = null;
      while (true) {
        const rows = await database
          .select()
          .from(globalRadarSignals)
          .where(
            and(
              ...filterConditions(input.signalClass, filters),
              cursor === null ? undefined : gt(globalRadarSignals.id, cursor),
            ),
          )
          .orderBy(asc(globalRadarSignals.id))
          .limit(GLOBAL_RADAR_ADMIN_AGGREGATE_CHUNK_SIZE);
        if (rows.length === 0) break;
        const scoreProvenance =
          await validateStoredGlobalRadarScoreProvenanceBatch(database, rows);
        if (!scoreProvenance.valid) {
          return {
            outcome: "conflict",
            reason: "score_provenance_invalid",
          };
        }
        const requirements = await database
          .select({
            signalId: globalSignalRequirements.signalId,
            kind: globalSignalRequirements.kind,
          })
          .from(globalSignalRequirements)
          .where(
            inArray(
              globalSignalRequirements.signalId,
              rows.map(({ id }) => id),
            ),
          );
        const kindsBySignal = new Map<string, Set<string>>();
        requirements.forEach(({ signalId, kind }) => {
          const kinds = kindsBySignal.get(signalId) ?? new Set<string>();
          kinds.add(kind);
          kindsBySignal.set(signalId, kinds);
        });
        total += rows.length;
        for (const row of rows) {
        byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
        if (
          globalRadarDemandFamilyLookup[
            row.demandDomain as keyof typeof globalRadarDemandFamilyLookup
          ]
        ) {
          demandFamilies[row.demandDomain] =
            (demandFamilies[row.demandDomain] ?? 0) + 1;
        }
        if (row.indiaRelevanceType === "explicit_India") explicit += 1;
        else if (row.indiaRelevanceType === "inferred_India_compatible") inferred += 1;
        if (["United States", "US"].includes(row.sourceCountry)) unitedStates += 1;
        else if (["China", "CN"].includes(row.sourceCountry)) china += 1;
        const kinds = kindsBySignal.get(row.id) ?? new Set<string>();
        if (kinds.has("physical_data")) physicalData += 1;
        if (kinds.has("robotics_hardware")) hardware += 1;
        if (row.status === "qualified") qualified += 1;
        const isActiveStatus = !["dismissed", "expired", "promoted"].includes(row.status);
        const isDirectActive =
          input.signalClass !== "direct_demand" ||
          (row.evergreen
            ? row.reobserveBy !== null && row.reobserveBy > input.now
            : row.expiresAt === null || row.expiresAt > input.now);
        if (isActiveStatus && isDirectActive) active += 1;
        if (
          input.signalClass === "direct_demand" &&
          ((row.expiresAt !== null && row.expiresAt > input.now) ||
            (row.reobserveBy !== null && row.reobserveBy > input.now))
        ) expiring += 1;
        if (input.signalClass === "demand_precursor") {
          if (row.estimatedTimeHorizon === 100) horizon.within30Days += 1;
          else if (row.estimatedTimeHorizon === 80) horizon.days31To90 += 1;
          else if (row.estimatedTimeHorizon === 60) horizon.days91To180 += 1;
          else if (row.estimatedTimeHorizon === 35) horizon.days181To365 += 1;
          else horizon.unknown += 1;
        }
        const score =
          input.signalClass === "direct_demand"
            ? row.directDemandScore
            : input.signalClass === "demand_precursor"
              ? row.precursorScore
              : row.momentumScore;
        const hardGates =
          input.signalClass === "direct_demand"
            ? (row.demandExplicitness ?? -1) >= 75 &&
              (row.evidenceConfidence ?? -1) >= 60 &&
              isDirectActive
            : input.signalClass === "demand_precursor"
              ? (row.evidenceConfidence ?? -1) >= 60 &&
                (row.proximityToExternalDemand ?? -1) >= 50
              : (row.momentumIndependentEntityCount ?? 0) >= 2 &&
                (row.momentumPrimarySourceCount ?? 0) >= 1 &&
                (row.momentumTaxonomyConsistency ?? -1) >= 70 &&
                (row.momentumEvidenceQuality ?? -1) >= 60 &&
                row.momentumQualificationGatesPassed === true;
        if (
          row.scorePolicyVersion === configuration.scoreVersion &&
          score !== null &&
          score >= configuration.thresholds[input.signalClass] &&
          hardGates
        ) highQuality += 1;
        }
        cursor = rows.at(-1)!.id;
        if (rows.length < GLOBAL_RADAR_ADMIN_AGGREGATE_CHUNK_SIZE) break;
      }
      return {
        outcome: "listed",
        metrics: {
          total,
          highQuality,
          byStatus,
          india: { explicit, inferred, other: total - explicit - inferred },
          countries: {
            unitedStates,
            china,
            other: total - unitedStates - china,
          },
          requirementMix: { physicalData, hardware },
          demandFamilies,
          active,
          expiring,
          horizon,
          qualified,
        },
      };
    },

    async getOverviewMetrics(input: { now: Date }): Promise<
      | { outcome: "listed"; metrics: SafeGlobalRadarOverviewMetrics }
      | { outcome: "conflict"; reason: GlobalRadarReadConflictReason }
    > {
      if (
        !(input.now instanceof Date) ||
        Number.isNaN(input.now.getTime())
      ) return { outcome: "conflict", reason: "invalid_input" };
      const [latestRuns, promotedRows] = await Promise.all([
        database
          .select({
            id: globalRadarRuns.id,
            status: globalRadarRuns.status,
            completedAt: globalRadarRuns.completedAt,
            numberSourceErrors: globalRadarRuns.numberSourceErrors,
            createdAt: globalRadarRuns.createdAt,
          })
          .from(globalRadarRuns)
          .orderBy(desc(globalRadarRuns.createdAt), desc(globalRadarRuns.id))
          .limit(1),
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(globalEntities)
          .where(eq(globalEntities.entityStatus, "promoted_to_candidate")),
      ]);
      const capabilitySignals = new Map<string, Set<string>>();
      let activeDirectDemand = 0;
      let highQualityPrecursors = 0;
      let explicitIndia = 0;
      let inferredIndia = 0;
      let unitedStates = 0;
      let china = 0;
      let physicalData = 0;
      let hardware = 0;
      let expiringDirectDemand = 0;
      let newSignals = 0;
      let activeSignalCount = 0;
      let mergedDuplicates = 0;
      const expiryWindowEnd = new Date(
        input.now.getTime() + 30 * 24 * 60 * 60 * 1_000,
      );
      let cursor: string | null = null;
      while (true) {
        const rows = await database
          .select()
          .from(globalRadarSignals)
          .where(
            cursor === null ? undefined : gt(globalRadarSignals.id, cursor),
          )
          .orderBy(asc(globalRadarSignals.id))
          .limit(GLOBAL_RADAR_ADMIN_AGGREGATE_CHUNK_SIZE);
        if (rows.length === 0) break;
        const activeSignals = rows.filter(
          ({ mergedIntoSignalId }) => mergedIntoSignalId === null,
        );
        mergedDuplicates += rows.length - activeSignals.length;
        activeSignalCount += activeSignals.length;
        newSignals += countGlobalRadarSignalsObservedToday(
          activeSignals.map(({ observedAt }) => observedAt),
          input.now,
        );
        const overviewScoreProvenance =
          await validateStoredGlobalRadarScoreProvenanceBatch(
            database,
            activeSignals.filter(
              ({ signalClass }) =>
                signalClass === "direct_demand" ||
                signalClass === "demand_precursor",
            ),
          );
        if (!overviewScoreProvenance.valid) {
          return {
            outcome: "conflict",
            reason: "score_provenance_invalid",
          };
        }
        const requirements = activeSignals.length
          ? await database
              .select({
                signalId: globalSignalRequirements.signalId,
                kind: globalSignalRequirements.kind,
                capabilityTag: globalSignalRequirements.capabilityTag,
              })
              .from(globalSignalRequirements)
              .where(
                inArray(
                  globalSignalRequirements.signalId,
                  activeSignals.map(({ id }) => id),
                ),
              )
          : [];
        const requirementKindsBySignal = new Map<string, Set<string>>();
        for (const requirement of requirements) {
          const kinds =
            requirementKindsBySignal.get(requirement.signalId) ??
            new Set<string>();
          kinds.add(requirement.kind);
          requirementKindsBySignal.set(requirement.signalId, kinds);
          const capabilitySet =
            capabilitySignals.get(requirement.capabilityTag) ??
            new Set<string>();
          capabilitySet.add(requirement.signalId);
          capabilitySignals.set(requirement.capabilityTag, capabilitySet);
        }
        for (const signal of activeSignals) {
        if (signal.indiaRelevanceType === "explicit_India") explicitIndia += 1;
        if (signal.indiaRelevanceType === "inferred_India_compatible") {
          inferredIndia += 1;
        }
        const country = signal.sourceCountry.trim().toLowerCase();
        if (["united states", "us"].includes(country)) unitedStates += 1;
        else if (["china", "cn"].includes(country)) china += 1;
        const requirementKinds =
          requirementKindsBySignal.get(signal.id) ?? new Set<string>();
        if (requirementKinds.has("physical_data")) physicalData += 1;
        if (requirementKinds.has("robotics_hardware")) hardware += 1;
        if (signal.signalClass === "direct_demand") {
          const active =
            !["dismissed", "expired", "promoted"].includes(signal.status) &&
            isDirectDemandActive(signal, input.now);
          if (active) activeDirectDemand += 1;
          const deadline = signal.evergreen
            ? signal.reobserveBy
            : signal.expiresAt;
          if (
            active &&
            deadline !== null &&
            deadline > input.now &&
            deadline <= expiryWindowEnd
          ) expiringDirectDemand += 1;
        }
        if (
          signal.signalClass === "demand_precursor" &&
          signal.scorePolicyVersion === configuration.scoreVersion &&
          (signal.precursorScore ?? -1) >=
            configuration.thresholds.demand_precursor &&
          (signal.evidenceConfidence ?? -1) >= 60 &&
          (signal.proximityToExternalDemand ?? -1) >= 50
        ) highQualityPrecursors += 1;
        }
        cursor = rows.at(-1)!.id;
        if (rows.length < GLOBAL_RADAR_ADMIN_AGGREGATE_CHUNK_SIZE) break;
      }
      const latestRun = latestRuns[0];
      return {
        outcome: "listed",
        metrics: {
          newSignals,
          activeDirectDemand,
          highQualityPrecursors,
          india: { explicit: explicitIndia, inferred: inferredIndia },
          countries: {
            unitedStates,
            china,
            other: activeSignalCount - unitedStates - china,
          },
          requirementMix: { physicalData, hardware },
          capabilityFamilies: [...capabilitySignals.entries()]
            .map(([capability, ids]) => ({ capability, signals: ids.size }))
            .sort(
              (left, right) =>
                right.signals - left.signals ||
                left.capability.localeCompare(right.capability),
            )
            .slice(0, 50),
          expiringDirectDemand,
          promotedEntities: promotedRows[0]?.count ?? 0,
          latestRun: latestRun
            ? {
                id: latestRun.id,
                status: latestRun.status,
                completedAt: latestRun.completedAt,
                createdAt: latestRun.createdAt,
              }
            : null,
          sourceErrors: latestRun?.numberSourceErrors ?? 0,
          mergedDuplicates,
        },
      };
    },

    async reviewSignal(input: {
      signalId: string;
      actor: GlobalRadarAdminActor;
      envelope: GlobalRadarAdminEnvelope;
      command: GlobalRadarReviewCommand;
    }): Promise<GlobalRadarSignalMutationResult> {
      const canonical = canonicalAdminEnvelope(input.actor, input.envelope);
      const allowedCommands = new Set([
        "request_review",
        "monitor",
        "qualify",
        "dismiss",
        "expire",
        "reopen",
        "mark_no_india_fit",
      ]);
      if (
        !canonical ||
        !UUID_PATTERN.test(input.signalId) ||
        !input.command ||
        typeof input.command !== "object" ||
        Object.keys(input.command).length !== 1 ||
        !allowedCommands.has(input.command.type)
      ) return { outcome: "conflict", reason: "invalid_input" };
      const fingerprint = requestFingerprint({
        action: "signal_review",
        signalId: input.signalId.toLowerCase(),
        actorUserId: canonical.actor.userId,
        actorEmail: canonical.actor.email,
        expectedRevision: canonical.expectedRevision,
        idempotencyKey: canonical.idempotencyKey,
        reason: canonical.reason,
        command: input.command.type,
      });
      const transactionResult = await database.transaction(async (tx) => {
        const [signal] = await tx
          .select()
          .from(globalRadarSignals)
          .where(eq(globalRadarSignals.id, input.signalId))
          .limit(1)
          .for("update");
        if (!signal) return { outcome: "not_found" as const };
        const [existingEvent] = await tx
          .select({ afterSafeState: globalRadarAdminEvents.afterSafeState })
          .from(globalRadarAdminEvents)
          .where(
            and(
              eq(globalRadarAdminEvents.targetType, "signal"),
              eq(globalRadarAdminEvents.targetId, signal.id),
              eq(globalRadarAdminEvents.idempotencyKey, canonical.idempotencyKey),
            ),
          )
          .limit(1);
        if (existingEvent) {
          return storedRequestFingerprint(existingEvent.afterSafeState) === fingerprint
            ? { outcome: "replayed" as const }
            : { outcome: "idempotency_mismatch" as const };
        }
        if (signal.revision !== canonical.expectedRevision) {
          return { outcome: "revision_mismatch" as const };
        }
        if (signal.mergedIntoSignalId !== null) {
          return { outcome: "transition_not_allowed" as const };
        }
        let validatedExistingScore: Awaited<
          ReturnType<typeof validateStoredScoreEvidenceForReview>
        >;
        try {
          validatedExistingScore =
            await validateStoredScoreEvidenceForReview(tx, signal);
        } catch (error) {
          if (
            input.command.type === "qualify" &&
            error instanceof InvalidStoredScoreEvidenceError
          ) {
            return {
              outcome: "qualification_requirements_not_met" as const,
            };
          }
          throw error;
        }

        let hardGatesPassed = false;
        let score =
          signal.signalClass === "direct_demand"
            ? signal.directDemandScore
            : signal.signalClass === "demand_precursor"
              ? signal.precursorScore
              : signal.momentumScore;
        let refreshedMomentum: Extract<
          ReturnType<typeof deriveGlobalRadarAdminMomentum>,
          { outcome: "derived" }
        >["derivation"] | null = null;
        let refreshedMomentumEvidence: readonly (StoredScoreEvidenceRow &
          Readonly<{ runId: string | null }>)[] = [];
        let refreshedMomentumEvaluationEvidence: readonly StoredScoreEvaluationEvidenceRow[] = [];
        let refreshedMomentumContributorIds: readonly string[] = [];
        if (signal.signalClass === "direct_demand") {
          hardGatesPassed =
            (signal.demandExplicitness ?? -1) >= 75 &&
            (signal.evidenceConfidence ?? -1) >= 60 &&
            isDirectDemandActive(signal, canonical.now);
        } else if (signal.signalClass === "demand_precursor") {
          hardGatesPassed =
            (signal.evidenceConfidence ?? -1) >= 60 &&
            (signal.proximityToExternalDemand ?? -1) >= 50;
        } else if (input.command.type === "qualify") {
          const associations = await tx
            .select({
              entityId: globalRadarSignalEntities.globalEntityId,
              role: globalRadarSignalEntities.role,
            })
            .from(globalRadarSignalEntities)
            .where(eq(globalRadarSignalEntities.signalId, signal.id));
          const contributorIds = associations
            .filter(({ role }) => role === "contributor")
            .map(({ entityId }) => entityId);
          refreshedMomentumContributorIds = contributorIds;
          const [entities, evidence] = contributorIds.length > 0
            ? await Promise.all([
                tx
                  .select({
                    id: globalEntities.id,
                    canonicalCorporateGroupId:
                      globalEntities.canonicalCorporateGroupId,
                  })
                  .from(globalEntities)
                  .where(inArray(globalEntities.id, contributorIds)),
                tx
                  .select({
                    evidenceFingerprint:
                      globalSignalEvidence.evidenceFingerprint,
                    runId: globalSignalEvidence.runId,
                    globalEntityId: globalSignalEvidence.globalEntityId,
                    sourceUrl: globalSignalEvidence.sourceUrl,
                    sourceName: globalSignalEvidence.sourceName,
                    evidenceClaim: globalSignalEvidence.evidenceClaim,
                    sourceFamily: globalSignalEvidence.sourceFamily,
                    publishedAt: globalSignalEvidence.publishedAt,
                    isPrimarySource: globalSignalEvidence.isPrimarySource,
                    isSyndicated: globalSignalEvidence.isSyndicated,
                    observedAt: globalSignalEvidence.observedAt,
                    evidenceConfidence:
                      globalSignalEvidence.evidenceConfidence,
                    supportedFieldPaths:
                      globalSignalEvidence.supportedFieldPaths,
                  })
                  .from(globalSignalEvidence)
                  .where(
                    eligibleMomentumEvidenceInWindowConditions({
                      signalId: signal.id,
                      contributorEntityIds: contributorIds,
                      cutoff: new Date(
                        canonical.now.getTime() -
                          GLOBAL_RADAR_MOMENTUM_EVIDENCE_MAXIMUM_AGE_DAYS *
                            24 *
                            60 *
                            60 *
                            1_000,
                      ),
                      asOf: canonical.now,
                    }),
                  )
                  .orderBy(
                    desc(globalSignalEvidence.observedAt),
                    desc(globalSignalEvidence.id),
                  )
                  .limit(MAX_GLOBAL_RADAR_ADMIN_MOMENTUM_EVIDENCE + 1),
              ])
            : [[], []];
          const momentum = deriveGlobalRadarAdminMomentum({
            taxonomy: signal.demandDomain,
            taxonomyConsistency: signal.momentumTaxonomyConsistency ?? -1,
            evidenceQuality: signal.momentumEvidenceQuality ?? -1,
            now: canonical.now,
            associations,
            entities,
            evidence: evidence.map((item) => ({
              id: item.evidenceFingerprint,
              runId: item.runId,
              entityId: item.globalEntityId,
              sourceId: item.evidenceFingerprint,
              sourceFamily: item.sourceFamily,
              isPrimarySource: item.isPrimarySource,
              isSyndicated: item.isSyndicated,
              observedAt: item.observedAt,
            })),
          });
          if (momentum.outcome === "conflict") {
            return { outcome: "qualification_requirements_not_met" as const };
          }
          refreshedMomentum = momentum.derivation;
          refreshedMomentumEvidence = evidence;
          refreshedMomentumEvaluationEvidence = await tx
            .select()
            .from(globalSignalEvidence)
            .where(eq(globalSignalEvidence.signalId, signal.id))
            .orderBy(asc(globalSignalEvidence.ingestOrdinal))
            .limit(MAX_GLOBAL_RADAR_ADMIN_MOMENTUM_EVIDENCE + 1);
          if (
            refreshedMomentumEvaluationEvidence.length >
            MAX_GLOBAL_RADAR_ADMIN_MOMENTUM_EVIDENCE
          ) {
            return { outcome: "qualification_requirements_not_met" as const };
          }
          score = refreshedMomentum.score;
          hardGatesPassed = refreshedMomentum.qualificationGatesPassed;
        }

        const transition = transitionSignal({
                currentStatus: signal.status,
                currentIndiaRelevanceType: signal.indiaRelevanceType,
                action:
                  input.command.type === "qualify"
                    ? {
                        type: "qualify",
                        qualification: {
                          signalClass: signal.signalClass,
                          scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
                          score:
                            signal.scorePolicyVersion === configuration.scoreVersion
                              ? score
                              : null,
                          threshold: configuration.thresholds[signal.signalClass],
                          hardGatesPassed,
                        },
                      }
                    : input.command.type === "reopen"
                      ? {
                          type: "reopen",
                          hasNewEvidence: false,
                          reason: canonical.reason,
                        }
                      : { type: input.command.type },
              });
        if (!transition.valid) {
          return {
            outcome:
              transition.reason === "qualification_requirements_not_met"
                ? ("qualification_requirements_not_met" as const)
                : ("transition_not_allowed" as const),
            };
        }
        let reviewScoreValues: Partial<
          typeof globalRadarSignals.$inferInsert
        > = {};
        if (refreshedMomentum) {
          const existingEvidence = validatedExistingScore.evaluationEvidence;
          const nextComponents = momentumSnapshotComponents(refreshedMomentum);
          const scoreEvidenceSnapshot = rebaseStoredScoreEvidenceSnapshot({
            existingSnapshot: signal.scoreEvidenceSnapshot,
            signalClass: "ecosystem_momentum",
            signalType: signal.signalType,
            currentIndiaRelevanceType: signal.indiaRelevanceType,
            nextIndiaRelevanceType: signal.indiaRelevanceType,
            scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
            momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
            currentComponents: storedScoreComponents(signal),
            nextComponents,
            replacementComponents: [
              "independentEntityCount",
              "primarySourceCount",
              "sourceFamilyCount",
              "volume7Days",
              "volume30Days",
              "volume90Days",
              "independentEntityBreadth",
              "primarySourceDepth",
              "sourceDiversity",
              "weightedVolume",
              "growthVsPreviousPeriod",
            ],
            momentumContributorEntityIds: refreshedMomentumContributorIds,
            announcedAt: signal.announcedAt,
            effectiveFrom: signal.effectiveFrom,
            existingEvidence,
            evidence: refreshedMomentumEvidence,
            scoreAsOf: canonical.now,
            evaluationEvidence: refreshedMomentumEvaluationEvidence,
            scoreInputDigest:
              validatedExistingScore.snapshot.scoreInputDigest,
          });
          reviewScoreValues = {
            momentumIndependentEntityCount:
              refreshedMomentum.counts.independentEntities,
            momentumPrimarySourceCount:
              refreshedMomentum.counts.primarySources,
            momentumSourceFamilyCount:
              refreshedMomentum.counts.sourceFamilies,
            momentumVolume7Days: refreshedMomentum.windows.days7.recent,
            momentumVolume30Days: refreshedMomentum.windows.days30.recent,
            momentumVolume90Days: refreshedMomentum.windows.days90.recent,
            momentumIndependentEntityBreadth:
              refreshedMomentum.components.independentEntityBreadth,
            momentumPrimarySourceDepth:
              refreshedMomentum.components.primarySourceDepth,
            momentumSourceDiversity:
              refreshedMomentum.components.sourceDiversity,
            momentumWeightedVolume:
              refreshedMomentum.components.weightedVolume,
            momentumGrowthVsPreviousPeriod:
              refreshedMomentum.components.growthVsPreceding,
            momentumTaxonomyConsistency:
              refreshedMomentum.components.taxonomyConsistency,
            momentumEvidenceQuality:
              refreshedMomentum.components.evidenceQuality,
            momentumScore: refreshedMomentum.score,
            scoreCoverage: refreshedMomentum.scoreCoverage,
            scorePolicyVersion: refreshedMomentum.scoreVersion,
            momentumPolicyVersion: refreshedMomentum.policyVersion,
            momentumQualificationGatesPassed:
              refreshedMomentum.qualificationGatesPassed,
            scoreEvidenceSnapshot,
          };
        } else if (input.command.type === "mark_no_india_fit") {
          const existingEvidence = validatedExistingScore.evaluationEvidence;
          const noFitNarrative = {
            ...administratorNoCurrentIndiaFitValues,
            indiaFitReasons: [
              ...administratorNoCurrentIndiaFitValues.indiaFitReasons,
            ],
            indiaFitConstraints: [
              ...administratorNoCurrentIndiaFitValues.indiaFitConstraints,
            ],
            indiaFitUnknowns: [
              ...administratorNoCurrentIndiaFitValues.indiaFitUnknowns,
            ],
          };
          const currentComponents = storedScoreComponents(signal);
          if (signal.signalClass === "direct_demand") {
            const recomputed = scoreDirectDemand({
              explicitness: signal.demandExplicitness,
              evidenceConfidence: signal.evidenceConfidence,
              freshness: signal.freshness,
              actionability: signal.actionability,
              indiaFit: 0,
              commercialPotential: signal.commercialPotential,
              repeatability: signal.repeatability,
              responseAccessibility: signal.responseAccessibility,
              strategicLearning: signal.strategicLearning,
              complianceComplexity: signal.complianceComplexity,
            });
            if (!recomputed.valid) {
              throw new Error("Invalid stored Global Radar direct-demand score.");
            }
            const nextComponents = directSnapshotComponents(
              recomputed.components,
            );
            reviewScoreValues = {
              ...noFitNarrative,
              indiaFit: 0,
              directDemandScore: recomputed.score,
              scoreCoverage: recomputed.scoreCoverage,
              scoreEvidenceSnapshot: rebaseStoredScoreEvidenceSnapshot({
                existingSnapshot: signal.scoreEvidenceSnapshot,
                signalClass: signal.signalClass,
                signalType: signal.signalType,
                currentIndiaRelevanceType: signal.indiaRelevanceType,
                nextIndiaRelevanceType: "no_current_India_fit",
                scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
                momentumPolicyVersion: null,
                currentComponents,
                nextComponents,
                replacementComponents: ["indiaFit"],
                announcedAt: signal.announcedAt,
                effectiveFrom: signal.effectiveFrom,
                existingEvidence,
                evidence: existingEvidence,
                scoreInputDigest:
                  validatedExistingScore.snapshot.scoreInputDigest,
              }),
            };
          } else if (signal.signalClass === "demand_precursor") {
            const recomputed = scoreDemandPrecursor({
              evidenceConfidence: signal.evidenceConfidence,
              proximityToExternalDemand: signal.proximityToExternalDemand,
              fundingDeploymentMomentum: signal.fundingDeploymentMomentum,
              likelyDataHardwareIntensity: signal.likelyDataHardwareIntensity,
              indiaFit: 0,
              estimatedTimeHorizon: signal.estimatedTimeHorizon,
              strategicRelevance: signal.strategicRelevance,
            });
            if (!recomputed.valid) {
              throw new Error("Invalid stored Global Radar precursor score.");
            }
            reviewScoreValues = {
              ...noFitNarrative,
              indiaFit: 0,
              precursorScore: recomputed.score,
              scoreCoverage: recomputed.scoreCoverage,
              scoreEvidenceSnapshot: rebaseStoredScoreEvidenceSnapshot({
                existingSnapshot: signal.scoreEvidenceSnapshot,
                signalClass: signal.signalClass,
                signalType: signal.signalType,
                currentIndiaRelevanceType: signal.indiaRelevanceType,
                nextIndiaRelevanceType: "no_current_India_fit",
                scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
                momentumPolicyVersion: null,
                currentComponents,
                nextComponents: recomputed.components,
                replacementComponents: ["indiaFit"],
                announcedAt: signal.announcedAt,
                effectiveFrom: signal.effectiveFrom,
                existingEvidence,
                evidence: existingEvidence,
                scoreInputDigest:
                  validatedExistingScore.snapshot.scoreInputDigest,
              }),
            };
          } else {
            const contributorAssociations = await tx
              .select({
                globalEntityId: globalRadarSignalEntities.globalEntityId,
              })
              .from(globalRadarSignalEntities)
              .where(
                and(
                  eq(globalRadarSignalEntities.signalId, signal.id),
                  eq(globalRadarSignalEntities.role, "contributor"),
                ),
              );
            reviewScoreValues = {
              ...noFitNarrative,
              scoreEvidenceSnapshot: rebaseStoredScoreEvidenceSnapshot({
                existingSnapshot: signal.scoreEvidenceSnapshot,
                signalClass: signal.signalClass,
                signalType: signal.signalType,
                currentIndiaRelevanceType: signal.indiaRelevanceType,
                nextIndiaRelevanceType: "no_current_India_fit",
                scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
                momentumPolicyVersion:
                  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
                currentComponents,
                nextComponents: currentComponents,
                replacementComponents: [],
                momentumContributorEntityIds:
                  contributorAssociations.map(
                    ({ globalEntityId }) => globalEntityId,
                  ),
                announcedAt: signal.announcedAt,
                effectiveFrom: signal.effectiveFrom,
                existingEvidence,
                evidence: existingEvidence,
                scoreInputDigest:
                  validatedExistingScore.snapshot.scoreInputDigest,
              }),
            };
          }
        }
        const nextSignal = {
          ...signal,
          ...reviewScoreValues,
          status: transition.status,
          indiaRelevanceType: transition.indiaRelevanceType,
        } as typeof signal;
        const nextEvaluationEvidence = refreshedMomentum
          ? refreshedMomentumEvaluationEvidence
          : validatedExistingScore.evaluationEvidence;
        const nextScoreAsOf = refreshedMomentum
          ? canonical.now
          : new Date(validatedExistingScore.snapshot.scoreAsOf);
        const actionabilityInput =
          signal.signalClass === "direct_demand"
            ? (validatedExistingScore.snapshot.componentEvidence.find(
                ({ component }) => component === "actionability",
              )?.inputValue ?? null)
            : null;
        const scoreInputDigest = await createAdminGlobalRadarScoreInputDigest(
          tx,
          {
            signal,
            scoreAsOf: nextScoreAsOf,
            actionabilityInput,
            evidence: nextEvaluationEvidence,
            overrides: nextSignal,
          },
        );
        reviewScoreValues.scoreEvidenceSnapshot =
          rebaseStoredScoreEvidenceSnapshot({
            existingSnapshot:
              reviewScoreValues.scoreEvidenceSnapshot ??
              signal.scoreEvidenceSnapshot,
            signalClass: nextSignal.signalClass,
            signalType: nextSignal.signalType,
            currentIndiaRelevanceType: nextSignal.indiaRelevanceType,
            nextIndiaRelevanceType: nextSignal.indiaRelevanceType,
            scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
            momentumPolicyVersion:
              nextSignal.signalClass === "ecosystem_momentum"
                ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
                : null,
            currentComponents: storedScoreComponents(nextSignal),
            nextComponents: storedScoreComponents(nextSignal),
            replacementComponents: [],
            momentumContributorEntityIds:
              nextSignal.signalClass === "ecosystem_momentum"
                ? validatedExistingScore.momentumContributorEntityIds
                : undefined,
            announcedAt: nextSignal.announcedAt,
            effectiveFrom: nextSignal.effectiveFrom,
            existingEvidence: nextEvaluationEvidence,
            evidence: nextEvaluationEvidence,
            scoreInputDigest,
          });
        const previousSafeState = signalSafeState(signal);
        const revision = signal.revision + 1;
        const [updated] = await tx
          .update(globalRadarSignals)
          .set({
            ...reviewScoreValues,
            ...(refreshedMomentum
              ? {
                  momentumIndependentEntityCount:
                    refreshedMomentum.counts.independentEntities,
                  momentumPrimarySourceCount:
                    refreshedMomentum.counts.primarySources,
                  momentumSourceFamilyCount:
                    refreshedMomentum.counts.sourceFamilies,
                  momentumVolume7Days: refreshedMomentum.windows.days7.recent,
                  momentumVolume30Days:
                    refreshedMomentum.windows.days30.recent,
                  momentumVolume90Days:
                    refreshedMomentum.windows.days90.recent,
                  momentumIndependentEntityBreadth:
                    refreshedMomentum.components.independentEntityBreadth,
                  momentumPrimarySourceDepth:
                    refreshedMomentum.components.primarySourceDepth,
                  momentumSourceDiversity:
                    refreshedMomentum.components.sourceDiversity,
                  momentumWeightedVolume:
                    refreshedMomentum.components.weightedVolume,
                  momentumGrowthVsPreviousPeriod:
                    refreshedMomentum.components.growthVsPreceding,
                  momentumTaxonomyConsistency:
                    refreshedMomentum.components.taxonomyConsistency,
                  momentumEvidenceQuality:
                    refreshedMomentum.components.evidenceQuality,
                  momentumScore: refreshedMomentum.score,
                  scoreCoverage: refreshedMomentum.scoreCoverage,
                  scorePolicyVersion: refreshedMomentum.scoreVersion,
                  momentumPolicyVersion: refreshedMomentum.policyVersion,
                  momentumQualificationGatesPassed:
                    refreshedMomentum.qualificationGatesPassed,
                }
              : {}),
            status: transition.status,
            indiaRelevanceType: transition.indiaRelevanceType,
            revision,
            updatedAt: canonical.now,
          })
          .where(eq(globalRadarSignals.id, signal.id))
          .returning();
        if (!updated) throw new Error("Locked Global Radar signal disappeared.");
        const newSafeState = signalSafeState(updated);
        const updateType =
          input.command.type === "mark_no_india_fit"
            ? "india_fit_changed"
            : "status_changed";
        await tx.insert(globalSignalUpdates).values({
          signalId: signal.id,
          updateType,
          previousSafeState,
          newSafeState,
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          reason: canonical.reason,
          observedAt: canonical.now,
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        await tx.insert(globalRadarAdminEvents).values({
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          targetType: "signal",
          targetId: signal.id,
          action: input.command.type,
          reason: canonical.reason,
          beforeSafeState: previousSafeState,
          afterSafeState: {
            message: "Global Radar signal review completed.",
            requestFingerprint: fingerprint,
            ...newSafeState,
          },
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        return { outcome: "updated" as const };
      });

      if (transactionResult.outcome === "not_found") {
        return { outcome: "conflict", reason: "not_found" };
      }
      if (transactionResult.outcome === "idempotency_mismatch") {
        return { outcome: "conflict", reason: "idempotency_mismatch" };
      }
      if (
        transactionResult.outcome === "transition_not_allowed" ||
        transactionResult.outcome === "qualification_requirements_not_met"
      ) {
        return { outcome: "conflict", reason: transactionResult.outcome };
      }
      const detail = await getDetail(input.signalId);
      if (detail.outcome !== "found") {
        return { outcome: "conflict", reason: "not_found" };
      }
      if (transactionResult.outcome === "revision_mismatch") {
        return {
          outcome: "conflict",
          reason: "revision_mismatch",
          detail: detail.detail,
        };
      }
      return { outcome: transactionResult.outcome, detail: detail.detail };
    },

    async editDirectDemandExpiry(input: {
      signalId: string;
      actor: GlobalRadarAdminActor;
      envelope: GlobalRadarAdminEnvelope;
      expiry: Readonly<{
        evergreen: boolean;
        expiresAt: string | null;
        reobserveBy: string | null;
      }>;
    }): Promise<GlobalRadarSignalMutationResult> {
      const canonical = canonicalAdminEnvelope(input.actor, input.envelope);
      if (
        !canonical ||
        !UUID_PATTERN.test(input.signalId) ||
        !input.expiry ||
        typeof input.expiry.evergreen !== "boolean" ||
        Object.keys(input.expiry).some(
          (key) => !["evergreen", "expiresAt", "reobserveBy"].includes(key),
        )
      ) return { outcome: "conflict", reason: "invalid_input" };
      const expiresAt =
        input.expiry.expiresAt === null
          ? null
          : parseTimestamp(input.expiry.expiresAt);
      const reobserveBy =
        input.expiry.reobserveBy === null
          ? null
          : parseTimestamp(input.expiry.reobserveBy);
      if (
        (input.expiry.expiresAt !== null && !expiresAt) ||
        (input.expiry.reobserveBy !== null && !reobserveBy) ||
        (input.expiry.evergreen &&
          (expiresAt !== null || reobserveBy === null || reobserveBy <= canonical.now)) ||
        (!input.expiry.evergreen && reobserveBy !== null)
      ) return { outcome: "conflict", reason: "invalid_input" };
      const fingerprint = requestFingerprint({
        action: "expiry_edit",
        signalId: input.signalId.toLowerCase(),
        actorUserId: canonical.actor.userId,
        actorEmail: canonical.actor.email,
        expectedRevision: canonical.expectedRevision,
        idempotencyKey: canonical.idempotencyKey,
        reason: canonical.reason,
        evergreen: input.expiry.evergreen,
        expiresAt: expiresAt?.toISOString() ?? null,
        reobserveBy: reobserveBy?.toISOString() ?? null,
      });
      const transactionResult = await database.transaction(async (tx) => {
        const [signal] = await tx
          .select()
          .from(globalRadarSignals)
          .where(eq(globalRadarSignals.id, input.signalId))
          .limit(1)
          .for("update");
        if (!signal) return { outcome: "not_found" as const };
        const [existingEvent] = await tx
          .select({ afterSafeState: globalRadarAdminEvents.afterSafeState })
          .from(globalRadarAdminEvents)
          .where(
            and(
              eq(globalRadarAdminEvents.targetType, "signal"),
              eq(globalRadarAdminEvents.targetId, signal.id),
              eq(globalRadarAdminEvents.idempotencyKey, canonical.idempotencyKey),
            ),
          )
          .limit(1);
        if (existingEvent) {
          return storedRequestFingerprint(existingEvent.afterSafeState) === fingerprint
            ? { outcome: "replayed" as const }
            : { outcome: "idempotency_mismatch" as const };
        }
        if (signal.revision !== canonical.expectedRevision) {
          return { outcome: "revision_mismatch" as const };
        }
        if (
          signal.signalClass !== "direct_demand" ||
          signal.mergedIntoSignalId !== null ||
          signal.status === "promoted"
        ) return { outcome: "transition_not_allowed" as const };
        const expiryStatus = resolveDirectDemandExpiryStatus({
          currentStatus: signal.status,
          currentIndiaRelevanceType: signal.indiaRelevanceType,
          evergreen: input.expiry.evergreen,
          expiresAt: expiresAt?.toISOString() ?? null,
          reobserveBy: reobserveBy?.toISOString() ?? null,
          announcedAt: signal.announcedAt?.toISOString() ?? null,
          effectiveFrom: signal.effectiveFrom?.toISOString() ?? null,
          now: canonical.now.toISOString(),
        });
        if (!expiryStatus.valid) {
          return { outcome: "invalid_input" as const };
        }
        const validatedScore = await validateStoredScoreEvidenceForReview(
          tx,
          signal,
        );
        const nextSignal = {
          ...signal,
          evergreen: input.expiry.evergreen,
          expiresAt,
          reobserveBy,
          status: expiryStatus.status,
        };
        const actionabilityInput =
          validatedScore.snapshot.componentEvidence.find(
            ({ component }) => component === "actionability",
          )?.inputValue ?? null;
        const scoreInputDigest = await createAdminGlobalRadarScoreInputDigest(
          tx,
          {
            signal,
            scoreAsOf: new Date(validatedScore.snapshot.scoreAsOf),
            actionabilityInput,
            evidence: validatedScore.evaluationEvidence,
            overrides: nextSignal,
          },
        );
        const scoreEvidenceSnapshot = rebaseStoredScoreEvidenceSnapshot({
          existingSnapshot: signal.scoreEvidenceSnapshot,
          signalClass: signal.signalClass,
          signalType: signal.signalType,
          currentIndiaRelevanceType: signal.indiaRelevanceType,
          nextIndiaRelevanceType: signal.indiaRelevanceType,
          scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
          momentumPolicyVersion: null,
          currentComponents: storedScoreComponents(signal),
          nextComponents: storedScoreComponents(signal),
          replacementComponents: [],
          announcedAt: signal.announcedAt,
          effectiveFrom: signal.effectiveFrom,
          existingEvidence: validatedScore.evaluationEvidence,
          evidence: validatedScore.evaluationEvidence,
          scoreInputDigest,
        });
        const previousSafeState = signalSafeState(signal);
        const [updated] = await tx
          .update(globalRadarSignals)
          .set({
            evergreen: input.expiry.evergreen,
            expiresAt,
            reobserveBy,
            status: expiryStatus.status,
            scoreEvidenceSnapshot,
            revision: signal.revision + 1,
            updatedAt: canonical.now,
          })
          .where(eq(globalRadarSignals.id, signal.id))
          .returning();
        if (!updated) throw new Error("Locked Global Radar signal disappeared.");
        const newSafeState = signalSafeState(updated);
        await tx.insert(globalSignalUpdates).values({
          signalId: signal.id,
          updateType: "expiry_changed",
          previousSafeState,
          newSafeState,
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          reason: canonical.reason,
          observedAt: canonical.now,
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        await tx.insert(globalRadarAdminEvents).values({
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          targetType: "signal",
          targetId: signal.id,
          action: "expiry_changed",
          reason: canonical.reason,
          beforeSafeState: previousSafeState,
          afterSafeState: {
            message: "Global Radar direct-demand expiry updated.",
            requestFingerprint: fingerprint,
            ...newSafeState,
          },
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        return { outcome: "updated" as const };
      });
      if (transactionResult.outcome === "not_found") {
        return { outcome: "conflict", reason: "not_found" };
      }
      if (transactionResult.outcome === "idempotency_mismatch") {
        return { outcome: "conflict", reason: "idempotency_mismatch" };
      }
      if (transactionResult.outcome === "invalid_input") {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      if (transactionResult.outcome === "transition_not_allowed") {
        return { outcome: "conflict", reason: "transition_not_allowed" };
      }
      const detail = await getDetail(input.signalId);
      if (detail.outcome !== "found") {
        return { outcome: "conflict", reason: "not_found" };
      }
      if (transactionResult.outcome === "revision_mismatch") {
        return {
          outcome: "conflict",
          reason: "revision_mismatch",
          detail: detail.detail,
        };
      }
      return { outcome: transactionResult.outcome, detail: detail.detail };
    },

    async editSignalClassification(input: {
      signalId: string;
      actor: GlobalRadarAdminActor;
      envelope: GlobalRadarAdminEnvelope;
      classification: GlobalRadarAdminClassificationInput;
    }): Promise<GlobalRadarSignalMutationResult> {
      const canonical = canonicalAdminEnvelope(input.actor, input.envelope);
      const classification = canonical
        ? canonicalizeGlobalRadarAdminClassification(
            input.classification,
            canonical.now,
          )
        : null;
      if (
        !canonical ||
        !UUID_PATTERN.test(input.signalId) ||
        !classification
      ) return { outcome: "conflict", reason: "invalid_input" };
      const normalizedClassification = {
        ...classification,
        ...(classification.signalClass === "direct_demand"
          ? {
              expiresAt: classification.expiresAt?.toISOString() ?? null,
              reobserveBy: classification.reobserveBy?.toISOString() ?? null,
            }
          : {}),
      };
      const fingerprint = requestFingerprint({
        action: "classification_edit",
        signalId: input.signalId.toLowerCase(),
        actorUserId: canonical.actor.userId,
        actorEmail: canonical.actor.email,
        expectedRevision: canonical.expectedRevision,
        idempotencyKey: canonical.idempotencyKey,
        reason: canonical.reason,
        classification: normalizedClassification,
      });
      const transactionResult = await database.transaction(async (tx) => {
        const [signal] = await tx
          .select()
          .from(globalRadarSignals)
          .where(eq(globalRadarSignals.id, input.signalId))
          .limit(1)
          .for("update");
        if (!signal) return { outcome: "not_found" as const };
        const [existingEvent] = await tx
          .select({ afterSafeState: globalRadarAdminEvents.afterSafeState })
          .from(globalRadarAdminEvents)
          .where(
            and(
              eq(globalRadarAdminEvents.targetType, "signal"),
              eq(globalRadarAdminEvents.targetId, signal.id),
              eq(globalRadarAdminEvents.idempotencyKey, canonical.idempotencyKey),
            ),
          )
          .limit(1);
        if (existingEvent) {
          return storedRequestFingerprint(existingEvent.afterSafeState) === fingerprint
            ? { outcome: "replayed" as const }
            : { outcome: "idempotency_mismatch" as const };
        }
        if (signal.revision !== canonical.expectedRevision) {
          return { outcome: "revision_mismatch" as const };
        }
        if (
          signal.mergedIntoSignalId !== null ||
          signal.status !== "monitoring"
        ) return { outcome: "classification_requirements_not_met" as const };
        const [requirements, evidence, associations] = await Promise.all([
          tx
            .select({ fingerprint: globalSignalRequirements.requirementFingerprint })
            .from(globalSignalRequirements)
            .where(eq(globalSignalRequirements.signalId, signal.id))
            .orderBy(asc(globalSignalRequirements.requirementFingerprint)),
          tx
            .select({
              id: globalSignalEvidence.id,
              ingestOrdinal: globalSignalEvidence.ingestOrdinal,
              runId: globalSignalEvidence.runId,
              globalEntityId: globalSignalEvidence.globalEntityId,
              evidenceFingerprint: globalSignalEvidence.evidenceFingerprint,
              sourceUrl: globalSignalEvidence.sourceUrl,
              sourceName: globalSignalEvidence.sourceName,
              canonicalSourceUrl: globalSignalEvidence.canonicalSourceUrl,
              sourceType: globalSignalEvidence.sourceType,
              sourceLanguage: globalSignalEvidence.sourceLanguage,
              sourceCountry: globalSignalEvidence.sourceCountry,
              sourceFamily: globalSignalEvidence.sourceFamily,
              evidenceClaim: globalSignalEvidence.evidenceClaim,
              sourceExcerpt: globalSignalEvidence.sourceExcerpt,
              englishSummary: globalSignalEvidence.englishSummary,
              publishedAt: globalSignalEvidence.publishedAt,
              observedAt: globalSignalEvidence.observedAt,
              evidenceConfidence: globalSignalEvidence.evidenceConfidence,
              translationConfidence:
                globalSignalEvidence.translationConfidence,
              isPrimarySource: globalSignalEvidence.isPrimarySource,
              isSyndicated: globalSignalEvidence.isSyndicated,
              supportsDirectDemand: globalSignalEvidence.supportsDirectDemand,
              supportsIndiaRelevance:
                globalSignalEvidence.supportsIndiaRelevance,
              supportedFieldPaths: globalSignalEvidence.supportedFieldPaths,
            })
            .from(globalSignalEvidence)
            .where(eq(globalSignalEvidence.signalId, signal.id))
            .orderBy(asc(globalSignalEvidence.canonicalSourceUrl))
            .limit(MAX_GLOBAL_RADAR_ADMIN_MOMENTUM_EVIDENCE + 1),
          tx
            .select({
              globalEntityId: globalRadarSignalEntities.globalEntityId,
              role: globalRadarSignalEntities.role,
              confidence: globalRadarSignalEntities.confidence,
            })
            .from(globalRadarSignalEntities)
            .where(eq(globalRadarSignalEntities.signalId, signal.id)),
        ]);
        if (evidence.length > MAX_GLOBAL_RADAR_ADMIN_MOMENTUM_EVIDENCE) {
          return { outcome: "classification_requirements_not_met" as const };
        }
        const targetGraph = createGlobalRadarClassificationGraph({
          primaryEntityId: signal.globalEntityId,
          associations: associations.map(({ globalEntityId }) => ({
            entityId: globalEntityId,
          })),
          targetClass: classification.signalClass,
          requestedPrimaryEntityId:
            classification.signalClass === "ecosystem_momentum"
              ? null
              : classification.primaryEntityId,
        });
        if (
          !targetGraph ||
          (classification.signalClass === "ecosystem_momentum" &&
            targetGraph.associations.length < 2)
        ) {
          return { outcome: "classification_requirements_not_met" as const };
        }
        const missingScoreEvidencePaths =
          classification.signalClass === "ecosystem_momentum"
            ? missingMomentumWorkerScoredMetricEvidencePaths({
                momentumMetrics: classification.assessments,
                momentumContributorEntityIds:
                  targetGraph.associations.flatMap(({ entityId, role }) =>
                    role === "contributor" ? [entityId] : [],
                  ),
                evidence: evidence.map((item) => ({
                  supportedFieldPaths: item.supportedFieldPaths,
                  contributorEntityId: item.globalEntityId,
                  isSyndicated: item.isSyndicated,
                })),
              })
            : missingWorkerScoredComponentEvidencePaths({
                signalClass: classification.signalClass,
                scoreComponents: classification.assessments,
                evidence,
              });
        if (missingScoreEvidencePaths.length > 0) {
          return { outcome: "classification_requirements_not_met" as const };
        }
        const targetEntityIds = [...new Set([
          ...(targetGraph.primaryEntityId === null
            ? []
            : [targetGraph.primaryEntityId]),
          ...targetGraph.associations.map(({ entityId }) => entityId),
        ])];
        if (targetEntityIds.length === 0) {
          return { outcome: "classification_requirements_not_met" as const };
        }
        const entityIds = [...new Set([
          ...targetEntityIds,
          ...evidence.flatMap(({ globalEntityId }) =>
            globalEntityId === null ? [] : [globalEntityId],
          ),
        ])];
        const entityAnchors = await tx
          .select({
            id: globalEntities.id,
            publicIdentityAnchor: globalEntities.publicIdentityAnchor,
            canonicalCorporateGroupId: globalEntities.canonicalCorporateGroupId,
          })
          .from(globalEntities)
          .where(inArray(globalEntities.id, entityIds))
          .for("key share");
        if (entityAnchors.length !== entityIds.length) {
          return { outcome: "classification_requirements_not_met" as const };
        }
        const candidateEvidence = candidateEvidenceFromStoredRows(
          evidence,
          entityAnchors,
        );
        const primaryPublicEvidence = evidence.some(
          ({ isPrimarySource, isSyndicated }) =>
            isPrimarySource && !isSyndicated,
        );
        const exactSubtypePath =
          classification.signalClass === "direct_demand"
            ? `directDemandAsk.${classification.signalType}`
            : classification.signalClass === "demand_precursor"
              ? `precursorDevelopment.${classification.signalType}`
              : null;
        if (
          classification.signalClass === "direct_demand" &&
          (requirements.length === 0 ||
            !evidence.some(
              ({
                isPrimarySource,
                isSyndicated,
                sourceFamily,
                supportsDirectDemand,
                supportedFieldPaths,
              }) =>
                (isPrimarySource ||
                  sourceFamily === "public_procurement_and_rfp_portals") &&
                !isSyndicated &&
                supportsDirectDemand &&
                supportedFieldPaths.includes(exactSubtypePath!),
            ))
        ) {
          return { outcome: "classification_requirements_not_met" as const };
        }
        if (
          classification.signalClass === "demand_precursor" &&
          (requirements.length === 0 ||
            !primaryPublicEvidence ||
            !evidence.some(
              ({ publishedAt, supportedFieldPaths }) =>
                publishedAt !== null &&
                publishedAt <= canonical.now &&
                supportedFieldPaths.includes(exactSubtypePath!),
            ))
        ) {
          return { outcome: "classification_requirements_not_met" as const };
        }
        const momentumResult =
          classification.signalClass === "ecosystem_momentum"
            ? deriveGlobalRadarAdminMomentum({
                taxonomy: classification.demandDomain,
                taxonomyConsistency:
                  classification.assessments.taxonomyConsistency,
                evidenceQuality: classification.assessments.evidenceQuality,
                now: canonical.now,
                associations: targetGraph.associations,
                entities: entityAnchors,
                evidence: evidence.map((item) => ({
                  id: item.evidenceFingerprint,
                  runId: item.runId,
                  entityId: item.globalEntityId,
                  sourceId: item.evidenceFingerprint,
                  sourceFamily: item.sourceFamily,
                  isPrimarySource: item.isPrimarySource,
                  isSyndicated: item.isSyndicated,
                  observedAt: item.observedAt,
                })),
              })
            : null;
        if (
          momentumResult?.outcome === "conflict" ||
          (momentumResult?.outcome === "derived" &&
            (momentumResult.derivation.counts.independentEntities < 2 ||
              momentumResult.derivation.counts.evidenceItems < 2 ||
              momentumResult.derivation.counts.primarySources < 1))
        ) {
          return { outcome: "classification_requirements_not_met" as const };
        }
        const momentumDerivation =
          momentumResult?.outcome === "derived"
            ? momentumResult.derivation
            : null;
        let reclassification: Extract<
          ReturnType<typeof deriveGlobalRadarReclassification>,
          { valid: true }
        > | null = null;
        let reclassificationFailure:
          | "classification_requirements_not_met"
          | "invalid_input" = "classification_requirements_not_met";
        if (classification.signalClass !== "ecosystem_momentum") {
          const responsePaths = storedResponsePathCandidates(signal, evidence);
          if (responsePaths.length === 0) {
            return { outcome: "classification_requirements_not_met" as const };
          }
          for (const responsePath of responsePaths) {
            const result =
              classification.signalClass === "direct_demand"
                ? deriveGlobalRadarReclassification({
                    signalClass: "direct_demand",
                    signalType: classification.signalType,
                    currentStatus: signal.status,
                    indiaRelevanceType: signal.indiaRelevanceType,
                    announcedAt: signal.announcedAt?.toISOString() ?? null,
                    effectiveFrom: signal.effectiveFrom?.toISOString() ?? null,
                    observedAt: signal.observedAt.toISOString(),
                    expiresAt: classification.expiresAt?.toISOString() ?? null,
                    responsePath,
                    sensitiveDataAndCompliance:
                      storedSensitiveDataAndCompliance(signal),
                    assessments: classification.assessments,
                    evidence: candidateEvidence,
                    now: canonical.now,
                  })
                : deriveGlobalRadarReclassification({
                    signalClass: "demand_precursor",
                    signalType: classification.signalType,
                    currentStatus: signal.status,
                    indiaRelevanceType: signal.indiaRelevanceType,
                    announcedAt: signal.announcedAt?.toISOString() ?? null,
                    effectiveFrom: signal.effectiveFrom?.toISOString() ?? null,
                    observedAt: signal.observedAt.toISOString(),
                    responsePath,
                    sensitiveDataAndCompliance:
                      storedSensitiveDataAndCompliance(signal),
                    assessments: classification.assessments,
                    evidence: candidateEvidence,
                    now: canonical.now,
                  });
            if (result.valid) {
              reclassification = result;
              break;
            }
            if (result.reason === "invalid_input") {
              reclassificationFailure = result.reason;
            }
          }
          if (!reclassification) {
            return { outcome: reclassificationFailure };
          }
        }
        const scoreComponents =
          reclassification?.signalClass === "direct_demand"
            ? directSnapshotComponents(reclassification.score.components)
            : reclassification?.signalClass === "demand_precursor"
              ? reclassification.score.components
              : momentumSnapshotComponents(momentumDerivation!);
        const directReclassification =
          reclassification?.signalClass === "direct_demand"
            ? reclassification
            : null;
        const precursorReclassification =
          reclassification?.signalClass === "demand_precursor"
            ? reclassification
            : null;
        const freshnessEvidencePath =
          classification.signalClass === "direct_demand"
            ? selectDirectDemandFreshnessEvidencePath({
                announcedAt: signal.announcedAt?.toISOString() ?? null,
                effectiveFrom: signal.effectiveFrom?.toISOString() ?? null,
                evidence: evidence.map(({ publishedAt }) => ({
                  publishedAt: publishedAt?.toISOString() ?? null,
                })),
              })
            : undefined;
        const contributorEntityIds = targetGraph.associations.flatMap(
          ({ entityId, role }) => (role === "contributor" ? [entityId] : []),
        );
        if (
          !hasCompleteScoreComponentEvidenceAssociations({
            signalClass: classification.signalClass,
            signalType: classification.signalType,
            indiaRelevanceType: signal.indiaRelevanceType,
            assessmentAuthority: "administrator",
            momentumContributorEntityIds: contributorEntityIds,
            freshnessEvidencePath,
            components: scoreComponents,
            evidence: evidence.map(
              ({
                evidenceFingerprint,
                globalEntityId,
                sourceUrl,
                sourceName,
                evidenceClaim,
                evidenceConfidence,
                publishedAt,
                observedAt,
                isPrimarySource,
                isSyndicated,
                sourceFamily,
                supportedFieldPaths,
              }) => ({
                id: evidenceFingerprint,
                sourceUrl,
                sourceName,
                evidenceClaim,
                contributorEntityId: globalEntityId,
                evidenceConfidence,
                publishedAt: publishedAt?.toISOString() ?? null,
                observedAt: observedAt.toISOString(),
                isPrimarySource,
                isSyndicated,
                sourceFamily,
                supportedFieldPaths,
              }),
            ),
          })
        ) {
          return { outcome: "classification_requirements_not_met" as const };
        }
        const directExpiryStatus =
          classification.signalClass === "direct_demand"
            ? resolveDirectDemandExpiryStatus({
                currentStatus: signal.status,
                currentIndiaRelevanceType: signal.indiaRelevanceType,
                evergreen: classification.evergreen,
                expiresAt: classification.expiresAt?.toISOString() ?? null,
                reobserveBy: classification.reobserveBy?.toISOString() ?? null,
                announcedAt: signal.announcedAt?.toISOString() ?? null,
                effectiveFrom: signal.effectiveFrom?.toISOString() ?? null,
                now: canonical.now.toISOString(),
              })
            : null;
        if (directExpiryStatus !== null && !directExpiryStatus.valid) {
          return { outcome: "invalid_input" as const };
        }
        const dedupeKey = createGlobalRadarSignalDedupeKeyFromIdentityAnchors({
          signalClass: classification.signalClass,
          primaryEntityRef: targetGraph.primaryEntityId,
          associatedEntities: targetGraph.associations.map(({ entityId, role }) => ({
            entityRef: entityId,
            role,
          })),
          demandDomain: classification.demandDomain,
          signalType: classification.signalType,
          theme: signal.theme,
          requirements,
          announcedAt: signal.announcedAt?.toISOString() ?? null,
          observedAt: signal.observedAt.toISOString(),
          targetGeographies: signal.targetGeographies,
          evidence: evidence.map(
            ({ canonicalSourceUrl, isPrimarySource, isSyndicated }) => ({
              canonicalSourceUrl,
              isPrimarySource,
              isSyndicated,
            }),
          ),
        }, new Map(entityAnchors.map(({ id, publicIdentityAnchor }) => [
          id,
          publicIdentityAnchor,
        ])));
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${createGlobalRadarDedupeLockKey(dedupeKey)}, 0))`,
        );
        const [duplicate] = await tx
          .select({ id: globalRadarSignals.id })
          .from(globalRadarSignals)
          .where(
            and(
              eq(globalRadarSignals.dedupeVersion, signal.dedupeVersion),
              eq(globalRadarSignals.dedupeKey, dedupeKey),
              sql`${globalRadarSignals.id} <> ${signal.id}`,
            ),
          )
          .limit(1);
        if (duplicate) return { outcome: "duplicate_signal" as const };
        const confidenceByEntityId = new Map(
          associations.map(({ globalEntityId, confidence }) => [
            globalEntityId,
            confidence,
          ]),
        );
        await tx
          .delete(globalRadarSignalEntities)
          .where(eq(globalRadarSignalEntities.signalId, signal.id));
        if (targetGraph.associations.length > 0) {
          await tx.insert(globalRadarSignalEntities).values(
            targetGraph.associations.map(({ entityId, role }) => ({
              signalId: signal.id,
              globalEntityId: entityId,
              role,
              confidence: confidenceByEntityId.get(entityId) ?? 100,
              createdAt: canonical.now,
            })),
          );
        }
        const previousSafeState = classificationSafeState(
          signal,
          associations,
        );
        const clearedClassValues = {
          globalEntityId: targetGraph.primaryEntityId,
          demandExplicitness: null,
          evidenceConfidence: null,
          freshness: null,
          actionability: null,
          indiaFit: null,
          commercialPotential: null,
          repeatability: null,
          responseAccessibility: null,
          strategicLearning: null,
          complianceComplexity: null,
          proximityToExternalDemand: null,
          fundingDeploymentMomentum: null,
          likelyDataHardwareIntensity: null,
          estimatedTimeHorizon: null,
          strategicRelevance: null,
          momentumIndependentEntityCount: null,
          momentumPrimarySourceCount: null,
          momentumSourceFamilyCount: null,
          momentumVolume7Days: null,
          momentumVolume30Days: null,
          momentumVolume90Days: null,
          momentumIndependentEntityBreadth: null,
          momentumPrimarySourceDepth: null,
          momentumSourceDiversity: null,
          momentumWeightedVolume: null,
          momentumGrowthVsPreviousPeriod: null,
          momentumTaxonomyConsistency: null,
          momentumEvidenceQuality: null,
          directDemandScore: null,
          precursorScore: null,
          momentumScore: null,
          momentumPolicyVersion: null,
          momentumQualificationGatesPassed: null,
          expiresAt: null,
          evergreen: null,
          reobserveBy: null,
        };
        const targetClassValues =
          classification.signalClass === "direct_demand"
            ? {
                demandExplicitness:
                  directReclassification!.score.components.explicitness,
                evidenceConfidence:
                  directReclassification!.score.components.evidenceConfidence,
                freshness: directReclassification!.score.components.freshness,
                actionability:
                  directReclassification!.score.components.actionability,
                indiaFit: directReclassification!.score.components.indiaFit,
                commercialPotential:
                  directReclassification!.score.components.commercialPotential,
                repeatability:
                  directReclassification!.score.components.repeatability,
                responseAccessibility:
                  directReclassification!.score.components.responseAccessibility,
                strategicLearning:
                  directReclassification!.score.components.strategicLearning,
                complianceComplexity:
                  directReclassification!.score.components.complianceComplexity,
                directDemandScore: directReclassification!.score.score,
                expiresAt: classification.expiresAt,
                evergreen: classification.evergreen,
                reobserveBy: classification.reobserveBy,
              }
            : classification.signalClass === "demand_precursor"
              ? {
                  evidenceConfidence:
                    precursorReclassification!.score.components.evidenceConfidence,
                  indiaFit:
                    precursorReclassification!.score.components.indiaFit,
                  proximityToExternalDemand:
                    precursorReclassification!.score.components
                      .proximityToExternalDemand,
                  fundingDeploymentMomentum:
                    precursorReclassification!.score.components
                      .fundingDeploymentMomentum,
                  likelyDataHardwareIntensity:
                    precursorReclassification!.score.components
                      .likelyDataHardwareIntensity,
                  estimatedTimeHorizon:
                    precursorReclassification!.score.components
                      .estimatedTimeHorizon,
                  strategicRelevance:
                    precursorReclassification!.score.components
                      .strategicRelevance,
                  precursorScore: precursorReclassification!.score.score,
                }
              : {
                  globalEntityId: null,
                  momentumIndependentEntityCount:
                    momentumDerivation!.counts.independentEntities,
                  momentumPrimarySourceCount:
                    momentumDerivation!.counts.primarySources,
                  momentumSourceFamilyCount:
                    momentumDerivation!.counts.sourceFamilies,
                  momentumVolume7Days: momentumDerivation!.windows.days7.recent,
                  momentumVolume30Days:
                    momentumDerivation!.windows.days30.recent,
                  momentumVolume90Days:
                    momentumDerivation!.windows.days90.recent,
                  momentumIndependentEntityBreadth:
                    momentumDerivation!.components.independentEntityBreadth,
                  momentumPrimarySourceDepth:
                    momentumDerivation!.components.primarySourceDepth,
                  momentumSourceDiversity:
                    momentumDerivation!.components.sourceDiversity,
                  momentumWeightedVolume:
                    momentumDerivation!.components.weightedVolume,
                  momentumGrowthVsPreviousPeriod:
                    momentumDerivation!.components.growthVsPreceding,
                  momentumTaxonomyConsistency:
                    momentumDerivation!.components.taxonomyConsistency,
                  momentumEvidenceQuality:
                    momentumDerivation!.components.evidenceQuality,
                  momentumScore: momentumDerivation!.score,
                  momentumPolicyVersion:
                    momentumDerivation!.policyVersion,
                  momentumQualificationGatesPassed:
                    momentumDerivation!.qualificationGatesPassed,
                };
        const classValues = {
          ...clearedClassValues,
          ...targetClassValues,
        };
        const nextStatus =
          directExpiryStatus?.valid === true
            ? directExpiryStatus.status
            : signal.status;
        const scoreInputSignal = {
          ...signal,
          ...classValues,
          signalClass: classification.signalClass,
          signalType: classification.signalType,
          demandDomain: classification.demandDomain,
          scoreCoverage:
            classification.signalClass === "ecosystem_momentum"
              ? momentumDerivation!.scoreCoverage
              : directReclassification?.score.scoreCoverage ??
                precursorReclassification!.score.scoreCoverage,
          scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
          status: nextStatus,
        } as typeof signal;
        const scoreInputDigest = createStoredGlobalRadarScoreInputDigest({
          scoreAsOf: canonical.now,
          signal: scoreInputSignal,
          actionabilityInput:
            directReclassification?.actionabilityInput ?? null,
          associations: targetGraph.associations.map(({ entityId, role }) => ({
            globalEntityId: entityId,
            role,
          })),
          entities: entityAnchors,
        });
        const scoreEvidenceSnapshot = createStoredScoreEvidenceSnapshot({
          scoreInputDigest,
          scoreAsOf: canonical.now,
          signalClass: classification.signalClass,
          signalType: classification.signalType,
          indiaRelevanceType: signal.indiaRelevanceType,
          scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
          momentumPolicyVersion:
            classification.signalClass === "ecosystem_momentum"
              ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
              : null,
          assessmentAuthority: "administrator",
          actionabilityInput:
            directReclassification?.actionabilityInput ?? null,
          momentumContributorEntityIds: contributorEntityIds,
          announcedAt: signal.announcedAt,
          effectiveFrom: signal.effectiveFrom,
          freshnessEvidencePath,
          components: scoreComponents,
          evidence,
        });
        const [updated] = await tx
          .update(globalRadarSignals)
          .set({
            ...classValues,
            signalClass: classification.signalClass,
            signalType: classification.signalType,
            demandDomain: classification.demandDomain,
            scoreCoverage:
              classification.signalClass === "ecosystem_momentum"
                ? momentumDerivation!.scoreCoverage
                : directReclassification?.score.scoreCoverage ??
                  precursorReclassification!.score.scoreCoverage,
            scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
            scoreEvidenceSnapshot,
            responsePathType: signal.responsePathType,
            responsePathUrl: signal.responsePathUrl,
            responseBusinessEmail: signal.responseBusinessEmail,
            partnerApplicationUrl: signal.partnerApplicationUrl,
            status: nextStatus,
            dedupeKey,
            revision: signal.revision + 1,
            updatedAt: canonical.now,
          })
          .where(eq(globalRadarSignals.id, signal.id))
          .returning();
        if (!updated) throw new Error("Locked Global Radar signal disappeared.");
        const newSafeState = classificationSafeState(
          updated,
          targetGraph.associations.map(({ entityId, role }) => ({
            globalEntityId: entityId,
            role,
            confidence: confidenceByEntityId.get(entityId) ?? 100,
          })),
        );
        await tx.insert(globalSignalUpdates).values({
          signalId: signal.id,
          updateType: "classification_changed",
          previousSafeState,
          newSafeState,
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          reason: canonical.reason,
          observedAt: canonical.now,
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        await tx.insert(globalRadarAdminEvents).values({
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          targetType: "signal",
          targetId: signal.id,
          action: "classification_changed",
          reason: canonical.reason,
          beforeSafeState: previousSafeState,
          afterSafeState: {
            message: "Global Radar signal classification updated.",
            requestFingerprint: fingerprint,
            ...newSafeState,
          },
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        return { outcome: "updated" as const };
      }).catch((error: unknown) => {
        if (isGlobalRadarActiveDedupeConflict(error)) {
          return { outcome: "duplicate_signal" as const };
        }
        throw error;
      });
      if (transactionResult.outcome === "not_found") {
        return { outcome: "conflict", reason: "not_found" };
      }
      if (
        transactionResult.outcome === "invalid_input" ||
        transactionResult.outcome === "idempotency_mismatch" ||
        transactionResult.outcome === "classification_requirements_not_met" ||
        transactionResult.outcome === "duplicate_signal"
      ) return { outcome: "conflict", reason: transactionResult.outcome };
      const detail = await getDetail(input.signalId);
      if (detail.outcome !== "found") {
        return { outcome: "conflict", reason: "not_found" };
      }
      if (transactionResult.outcome === "revision_mismatch") {
        return {
          outcome: "conflict",
          reason: "revision_mismatch",
          detail: detail.detail,
        };
      }
      return { outcome: transactionResult.outcome, detail: detail.detail };
    },

    async appendEvidence(input: {
      signalId: string;
      actor: GlobalRadarAdminActor;
      envelope: GlobalRadarAdminEnvelope;
      evidence: GlobalRadarAdminEvidenceInput;
    }): Promise<
      | { outcome: "appended" | "replayed"; revision: number }
      | {
          outcome: "conflict";
          reason: "invalid_input" | "not_found" | "revision_mismatch" | "idempotency_mismatch";
          detail?: SafeGlobalRadarSignalDetail;
        }
    > {
      const canonical = canonicalAdminEnvelope(input.actor, input.envelope);
      const evidence = canonical
        ? canonicalizeGlobalRadarAdminEvidence(input.evidence, canonical.now)
        : null;
      if (
        !canonical ||
        !evidence ||
        !UUID_PATTERN.test(input.signalId) ||
        (evidence.globalEntityId !== null && !UUID_PATTERN.test(evidence.globalEntityId))
      ) return { outcome: "conflict", reason: "invalid_input" };
      const { observedAt: _serverObservedAt, ...fingerprintEvidence } = evidence;
      void _serverObservedAt;
      const fingerprint = requestFingerprint({
        action: "evidence_appended",
        signalId: input.signalId.toLowerCase(),
        actorUserId: canonical.actor.userId,
        actorEmail: canonical.actor.email,
        expectedRevision: canonical.expectedRevision,
        idempotencyKey: canonical.idempotencyKey,
        reason: canonical.reason,
        evidence: fingerprintEvidence,
      });
      const result = await database.transaction(async (tx) => {
        const [signal] = await tx
          .select()
          .from(globalRadarSignals)
          .where(eq(globalRadarSignals.id, input.signalId))
          .limit(1)
          .for("update");
        if (!signal) return { outcome: "not_found" as const };
        const [existingEvent] = await tx
          .select({ afterSafeState: globalRadarAdminEvents.afterSafeState })
          .from(globalRadarAdminEvents)
          .where(
            and(
              eq(globalRadarAdminEvents.targetType, "signal"),
              eq(globalRadarAdminEvents.targetId, signal.id),
              eq(globalRadarAdminEvents.idempotencyKey, canonical.idempotencyKey),
            ),
          )
          .limit(1);
        if (existingEvent) {
          return storedRequestFingerprint(existingEvent.afterSafeState) === fingerprint
            ? { outcome: "replayed" as const, revision: signal.revision }
            : { outcome: "idempotency_mismatch" as const };
        }
        if (signal.revision !== canonical.expectedRevision) {
          return { outcome: "revision_mismatch" as const };
        }
        if (evidence.globalEntityId !== null) {
          const associatedEntities = await tx
            .select({ globalEntityId: globalRadarSignalEntities.globalEntityId })
            .from(globalRadarSignalEntities)
            .where(eq(globalRadarSignalEntities.signalId, signal.id));
          if (
            !isGlobalRadarEvidenceContributorEligible({
              contributorEntityId: evidence.globalEntityId,
              primaryEntityId: signal.globalEntityId,
              associatedEntityIds: associatedEntities.map(
                ({ globalEntityId }) => globalEntityId,
              ),
            })
          ) return { outcome: "invalid_input" as const };
          const [contributor] = await tx
            .select({ id: globalEntities.id })
            .from(globalEntities)
            .where(eq(globalEntities.id, evidence.globalEntityId))
            .limit(1)
            .for("update");
          if (!contributor) return { outcome: "invalid_input" as const };
        }
        const [duplicate] = await tx
          .select({ id: globalSignalEvidence.id })
          .from(globalSignalEvidence)
          .where(
            and(
              eq(globalSignalEvidence.signalId, signal.id),
              eq(globalSignalEvidence.evidenceFingerprint, evidence.evidenceFingerprint),
            ),
          )
          .limit(1);
        if (duplicate) return { outcome: "invalid_input" as const };
        const [maximumOrdinal] = await tx
          .select({ value: max(globalSignalEvidence.ingestOrdinal) })
          .from(globalSignalEvidence)
          .where(eq(globalSignalEvidence.signalId, signal.id));
        const [created] = await tx
          .insert(globalSignalEvidence)
          .values({
            signalId: signal.id,
            ingestOrdinal: (maximumOrdinal?.value ?? 0) + 1,
            runId: null,
            globalEntityId: evidence.globalEntityId,
            sourceUrl: evidence.sourceUrl,
            canonicalSourceUrl: evidence.canonicalSourceUrl,
            sourceName: evidence.sourceName,
            sourceType: evidence.sourceType,
            sourceLanguage: evidence.sourceLanguage,
            sourceCountry: evidence.sourceCountry,
            sourceFamily: evidence.sourceFamily,
            evidenceClaim: evidence.claim,
            sourceExcerpt: evidence.sourceExcerpt,
            englishSummary: evidence.englishSummary,
            publishedAt: evidence.publishedAt ? new Date(evidence.publishedAt) : null,
            observedAt: new Date(evidence.observedAt),
            evidenceConfidence: evidence.evidenceConfidence,
            translationConfidence: evidence.translationConfidence,
            isPrimarySource: evidence.isPrimarySource,
            isSyndicated: evidence.isSyndicated,
            supportsDirectDemand: evidence.supportsDirectDemand,
            supportsIndiaRelevance: evidence.supportsIndiaRelevance,
            rawMetadata: evidence.rawMetadata,
            evidenceFingerprint: evidence.evidenceFingerprint,
            supportedFieldPaths: [...evidence.supportedFieldPaths],
            createdAt: canonical.now,
          })
          .returning({ id: globalSignalEvidence.id });
        if (!created) throw new Error("Global Radar evidence insert returned no row.");
        const revision = signal.revision + 1;
        await tx
          .update(globalRadarSignals)
          .set({ revision, updatedAt: canonical.now })
          .where(eq(globalRadarSignals.id, signal.id));
        await tx.insert(globalSignalUpdates).values({
          signalId: signal.id,
          updateType: "evidence_appended",
          previousSafeState: { revision: signal.revision },
          newSafeState: { revision, evidenceId: created.id },
          evidenceId: created.id,
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          reason: canonical.reason,
          observedAt: canonical.now,
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        await tx.insert(globalRadarAdminEvents).values({
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          targetType: "signal",
          targetId: signal.id,
          action: "evidence_appended",
          reason: canonical.reason,
          beforeSafeState: { revision: signal.revision },
          afterSafeState: {
            message: "Global Radar public evidence appended.",
            requestFingerprint: fingerprint,
            revision,
            evidenceId: created.id,
          },
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        return { outcome: "appended" as const, revision };
      });
      if (result.outcome === "revision_mismatch") {
        const detail = await getDetail(input.signalId);
        return {
          outcome: "conflict",
          reason: "revision_mismatch",
          ...(detail.outcome === "found" ? { detail: detail.detail } : {}),
        };
      }
      if (
        result.outcome === "not_found" ||
        result.outcome === "invalid_input" ||
        result.outcome === "idempotency_mismatch"
      ) return { outcome: "conflict", reason: result.outcome };
      return result;
    },

    async appendNote(input: {
      signalId: string;
      actor: GlobalRadarAdminActor;
      envelope: GlobalRadarAdminEnvelope;
      body: string;
    }): Promise<
      | { outcome: "appended" | "replayed"; revision: number }
      | {
          outcome: "conflict";
          reason: "invalid_input" | "not_found" | "revision_mismatch" | "idempotency_mismatch";
          detail?: SafeGlobalRadarSignalDetail;
        }
    > {
      const canonical = canonicalAdminEnvelope(input.actor, input.envelope);
      const body = globalRadarAuthoredAuditTextSchema.safeParse(input.body);
      if (
        !canonical ||
        !UUID_PATTERN.test(input.signalId) ||
        !body.success
      ) return { outcome: "conflict", reason: "invalid_input" };
      const fingerprint = requestFingerprint({
        action: "note_appended",
        signalId: input.signalId.toLowerCase(),
        actorUserId: canonical.actor.userId,
        actorEmail: canonical.actor.email,
        expectedRevision: canonical.expectedRevision,
        idempotencyKey: canonical.idempotencyKey,
        reason: canonical.reason,
        body: body.data,
      });
      const result = await database.transaction(async (tx) => {
        const [signal] = await tx
          .select({ id: globalRadarSignals.id, revision: globalRadarSignals.revision })
          .from(globalRadarSignals)
          .where(eq(globalRadarSignals.id, input.signalId))
          .limit(1)
          .for("update");
        if (!signal) return { outcome: "not_found" as const };
        const [existingEvent] = await tx
          .select({ afterSafeState: globalRadarAdminEvents.afterSafeState })
          .from(globalRadarAdminEvents)
          .where(
            and(
              eq(globalRadarAdminEvents.targetType, "signal"),
              eq(globalRadarAdminEvents.targetId, signal.id),
              eq(globalRadarAdminEvents.idempotencyKey, canonical.idempotencyKey),
            ),
          )
          .limit(1);
        if (existingEvent) {
          return storedRequestFingerprint(existingEvent.afterSafeState) === fingerprint
            ? { outcome: "replayed" as const, revision: signal.revision }
            : { outcome: "idempotency_mismatch" as const };
        }
        if (signal.revision !== canonical.expectedRevision) {
          return { outcome: "revision_mismatch" as const };
        }
        const revision = signal.revision + 1;
        await tx
          .update(globalRadarSignals)
          .set({ revision, updatedAt: canonical.now })
          .where(eq(globalRadarSignals.id, signal.id));
        await tx.insert(globalSignalUpdates).values({
          signalId: signal.id,
          updateType: "note_appended",
          previousSafeState: { revision: signal.revision },
          newSafeState: { revision, message: "Administrator note appended." },
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          reason: body.data,
          observedAt: canonical.now,
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        await tx.insert(globalRadarAdminEvents).values({
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          targetType: "signal",
          targetId: signal.id,
          action: "note_appended",
          reason: "Administrator note appended.",
          beforeSafeState: { revision: signal.revision },
          afterSafeState: {
            message: "Administrator note appended.",
            requestFingerprint: fingerprint,
            revision,
          },
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        return { outcome: "appended" as const, revision };
      });
      if (result.outcome === "revision_mismatch") {
        const detail = await getDetail(input.signalId);
        return {
          outcome: "conflict",
          reason: "revision_mismatch",
          ...(detail.outcome === "found" ? { detail: detail.detail } : {}),
        };
      }
      if (
        result.outcome === "not_found" ||
        result.outcome === "idempotency_mismatch"
      ) return { outcome: "conflict", reason: result.outcome };
      return result;
    },

    async mergeSignals(input: {
      survivorSignalId: string;
      duplicateSignalId: string;
      expectedSurvivorRevision: number;
      expectedDuplicateRevision: number;
      confirmed: boolean;
      actor: GlobalRadarAdminActor;
      idempotencyKey: string;
      reason: string;
      now: Date;
    }): Promise<
      | {
          outcome: "merged" | "replayed";
          survivor: SafeGlobalRadarSignalDetail;
          duplicate: SafeGlobalRadarSignalDetail;
        }
      | {
          outcome: "conflict";
          reason:
            | "invalid_input"
            | "not_found"
            | "revision_mismatch"
            | "idempotency_mismatch"
            | "classification_requirements_not_met"
            | "already_merged";
          survivor?: SafeGlobalRadarSignalDetail;
          duplicate?: SafeGlobalRadarSignalDetail;
        }
    > {
      const canonical = canonicalAdminEnvelope(input.actor, {
        expectedRevision: input.expectedSurvivorRevision,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        now: input.now,
      });
      if (
        !canonical ||
        !UUID_PATTERN.test(input.survivorSignalId) ||
        !UUID_PATTERN.test(input.duplicateSignalId) ||
        input.survivorSignalId === input.duplicateSignalId ||
        input.confirmed !== true ||
        !Number.isInteger(input.expectedDuplicateRevision) ||
        input.expectedDuplicateRevision < 0
      ) return { outcome: "conflict", reason: "invalid_input" };
      const fingerprint = requestFingerprint({
        action: "signals_merged",
        survivorSignalId: input.survivorSignalId.toLowerCase(),
        duplicateSignalId: input.duplicateSignalId.toLowerCase(),
        expectedSurvivorRevision: input.expectedSurvivorRevision,
        expectedDuplicateRevision: input.expectedDuplicateRevision,
        confirmed: true,
        actorUserId: canonical.actor.userId,
        actorEmail: canonical.actor.email,
        idempotencyKey: canonical.idempotencyKey,
        reason: canonical.reason,
      });
      const result = await database.transaction(async (tx) => {
        const orderedIds = [
          input.survivorSignalId,
          input.duplicateSignalId,
        ].sort();
        const rows = await tx
          .select()
          .from(globalRadarSignals)
          .where(inArray(globalRadarSignals.id, orderedIds))
          .orderBy(asc(globalRadarSignals.id))
          .for("update");
        if (rows.length !== 2) return { outcome: "not_found" as const };
        const survivor = rows.find(({ id }) => id === input.survivorSignalId);
        const duplicate = rows.find(({ id }) => id === input.duplicateSignalId);
        if (!survivor || !duplicate) return { outcome: "not_found" as const };
        const [existingEvent] = await tx
          .select({ afterSafeState: globalRadarAdminEvents.afterSafeState })
          .from(globalRadarAdminEvents)
          .where(
            and(
              eq(globalRadarAdminEvents.targetType, "signal_merge"),
              eq(globalRadarAdminEvents.targetId, survivor.id),
              eq(globalRadarAdminEvents.idempotencyKey, canonical.idempotencyKey),
            ),
          )
          .limit(1);
        if (existingEvent) {
          return storedRequestFingerprint(existingEvent.afterSafeState) === fingerprint
            ? { outcome: "replayed" as const }
            : { outcome: "idempotency_mismatch" as const };
        }
        if (
          survivor.revision !== input.expectedSurvivorRevision ||
          duplicate.revision !== input.expectedDuplicateRevision
        ) return { outcome: "revision_mismatch" as const };
        if (
          survivor.mergedIntoSignalId !== null ||
          duplicate.mergedIntoSignalId !== null
        ) return { outcome: "already_merged" as const };
        if (survivor.signalClass !== duplicate.signalClass) {
          return { outcome: "classification_requirements_not_met" as const };
        }
        const scoreProvenance =
          await validateStoredGlobalRadarScoreProvenanceBatch(tx, [
            survivor,
            duplicate,
          ]);
        if (!scoreProvenance.valid) {
          return { outcome: "score_provenance_invalid" as const };
        }
        const survivorRevision = survivor.revision + 1;
        const duplicateRevision = duplicate.revision + 1;
        await tx
          .update(globalRadarSignals)
          .set({ revision: survivorRevision, updatedAt: canonical.now })
          .where(eq(globalRadarSignals.id, survivor.id));
        await tx
          .update(globalRadarSignals)
          .set({
            mergedIntoSignalId: survivor.id,
            revision: duplicateRevision,
            updatedAt: canonical.now,
          })
          .where(eq(globalRadarSignals.id, duplicate.id));
        await tx.insert(globalSignalUpdates).values([
          {
            signalId: survivor.id,
            updateType: "merged",
            previousSafeState: { revision: survivor.revision, mergedIntoSignalId: null },
            newSafeState: {
              revision: survivorRevision,
              mergedDuplicateSignalId: duplicate.id,
            },
            actorType: "administrator",
            actorId: canonical.actor.userId,
            actorEmail: canonical.actor.email,
            reason: canonical.reason,
            observedAt: canonical.now,
            idempotencyKey: canonical.idempotencyKey,
            createdAt: canonical.now,
          },
          {
            signalId: duplicate.id,
            updateType: "merged",
            previousSafeState: { revision: duplicate.revision, mergedIntoSignalId: null },
            newSafeState: {
              revision: duplicateRevision,
              mergedIntoSignalId: survivor.id,
            },
            actorType: "administrator",
            actorId: canonical.actor.userId,
            actorEmail: canonical.actor.email,
            reason: canonical.reason,
            observedAt: canonical.now,
            idempotencyKey: canonical.idempotencyKey,
            createdAt: canonical.now,
          },
        ]);
        await tx.insert(globalRadarAdminEvents).values({
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          targetType: "signal_merge",
          targetId: survivor.id,
          action: "signals_merged",
          reason: canonical.reason,
          beforeSafeState: {
            survivorSignalId: survivor.id,
            survivorRevision: survivor.revision,
            duplicateSignalId: duplicate.id,
            duplicateRevision: duplicate.revision,
          },
          afterSafeState: {
            message: "Global Radar duplicate signals merged.",
            requestFingerprint: fingerprint,
            survivorSignalId: survivor.id,
            survivorRevision,
            duplicateSignalId: duplicate.id,
            duplicateRevision,
          },
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        return { outcome: "merged" as const };
      });
      if (
        result.outcome === "not_found" ||
        result.outcome === "revision_mismatch" ||
        result.outcome === "idempotency_mismatch" ||
        result.outcome === "classification_requirements_not_met" ||
        result.outcome === "score_provenance_invalid" ||
        result.outcome === "already_merged"
      ) {
        if (result.outcome === "score_provenance_invalid") {
          return {
            outcome: "conflict",
            reason: "classification_requirements_not_met",
          };
        }
        if (result.outcome === "not_found") {
          return { outcome: "conflict", reason: result.outcome };
        }
        const [latestSurvivor, latestDuplicate] = await Promise.all([
          getDetail(input.survivorSignalId),
          getDetail(input.duplicateSignalId),
        ]);
        return {
          outcome: "conflict",
          reason: result.outcome,
          ...(latestSurvivor.outcome === "found"
            ? { survivor: latestSurvivor.detail }
            : {}),
          ...(latestDuplicate.outcome === "found"
            ? { duplicate: latestDuplicate.detail }
            : {}),
        };
      }
      const [survivor, duplicate] = await Promise.all([
        getDetail(input.survivorSignalId),
        getDetail(input.duplicateSignalId),
      ]);
      if (survivor.outcome !== "found" || duplicate.outcome !== "found") {
        return { outcome: "conflict", reason: "not_found" };
      }
      return {
        outcome: result.outcome,
        survivor: survivor.detail,
        duplicate: duplicate.detail,
      };
    },

    async qualifyEntity(input: {
      entityId: string;
      actor: GlobalRadarAdminActor;
      envelope: GlobalRadarAdminEnvelope;
    }): Promise<
      | {
          outcome: "updated" | "replayed";
          entity: ReturnType<typeof toSafeGlobalRadarEntity>;
        }
      | {
          outcome: "conflict";
          reason:
            | "invalid_input"
            | "not_found"
            | "revision_mismatch"
            | "idempotency_mismatch"
            | "transition_not_allowed";
          entity?: ReturnType<typeof toSafeGlobalRadarEntity>;
        }
    > {
      const canonical = canonicalAdminEnvelope(input.actor, input.envelope);
      if (!canonical || !UUID_PATTERN.test(input.entityId)) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      const entityId = input.entityId.toLowerCase();
      const fingerprint = requestFingerprint({
        action: "entity_qualified",
        entityId,
        actorUserId: canonical.actor.userId,
        actorEmail: canonical.actor.email,
        expectedRevision: canonical.expectedRevision,
        idempotencyKey: canonical.idempotencyKey,
        reason: canonical.reason,
      });
      const result = await database.transaction(async (tx) => {
        const [entity] = await tx
          .select()
          .from(globalEntities)
          .where(eq(globalEntities.id, entityId))
          .limit(1)
          .for("update");
        if (!entity) return { outcome: "not_found" as const };
        const [existingEvent] = await tx
          .select({ afterSafeState: globalRadarAdminEvents.afterSafeState })
          .from(globalRadarAdminEvents)
          .where(
            and(
              eq(globalRadarAdminEvents.targetType, "entity"),
              eq(globalRadarAdminEvents.targetId, entity.id),
              eq(
                globalRadarAdminEvents.idempotencyKey,
                canonical.idempotencyKey,
              ),
            ),
          )
          .limit(1);
        if (existingEvent) {
          return storedRequestFingerprint(existingEvent.afterSafeState) ===
            fingerprint
            ? { outcome: "replayed" as const, entity }
            : { outcome: "idempotency_mismatch" as const, entity };
        }
        if (entity.revision !== canonical.expectedRevision) {
          return { outcome: "revision_mismatch" as const, entity };
        }
        if (!isGlobalRadarEntityQualifiableStatus(entity.entityStatus)) {
          return { outcome: "transition_not_allowed" as const, entity };
        }
        const [updated] = await tx
          .update(globalEntities)
          .set({
            entityStatus: "qualified",
            revision: entity.revision + 1,
            updatedAt: canonical.now,
          })
          .where(eq(globalEntities.id, entity.id))
          .returning();
        if (!updated) {
          throw new Error("Locked Global Radar entity disappeared.");
        }
        await tx.insert(globalRadarAdminEvents).values({
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          targetType: "entity",
          targetId: entity.id,
          action: "entity_qualified",
          reason: canonical.reason,
          beforeSafeState: {
            entityStatus: entity.entityStatus,
            revision: entity.revision,
          },
          afterSafeState: {
            message: "Global Radar entity explicitly qualified.",
            requestFingerprint: fingerprint,
            entityStatus: updated.entityStatus,
            revision: updated.revision,
          },
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        return { outcome: "updated" as const, entity: updated };
      });
      if (result.outcome === "not_found") {
        return { outcome: "conflict", reason: "not_found" };
      }
      if (
        result.outcome === "revision_mismatch" ||
        result.outcome === "idempotency_mismatch" ||
        result.outcome === "transition_not_allowed"
      ) {
        return {
          outcome: "conflict",
          reason: result.outcome,
          entity: toSafeGlobalRadarEntity(result.entity),
        };
      }
      return {
        outcome: result.outcome,
        entity: toSafeGlobalRadarEntity(result.entity),
      };
    },

    async upsertWatchlist(input: {
      entity: GlobalRadarWatchlistEntityInput;
      expectedEntryRevision: number | null;
      actor: GlobalRadarAdminActor;
      envelope: Omit<GlobalRadarAdminEnvelope, "expectedRevision">;
      configuration: GlobalRadarWatchlistConfigurationInput;
    }): Promise<
      | {
          outcome: "created" | "updated" | "replayed";
          entity: ReturnType<typeof toSafeGlobalRadarEntity>;
          entry: ReturnType<typeof toSafeGlobalRadarWatchlistEntry>;
        }
      | {
          outcome: "conflict";
          reason:
            | "invalid_input"
            | "not_found"
            | "revision_mismatch"
            | "idempotency_mismatch"
            | "entity_identity_conflict";
          entity?: ReturnType<typeof toSafeGlobalRadarEntity>;
          entry?: ReturnType<typeof toSafeGlobalRadarWatchlistEntry>;
        }
    > {
      const entityExpectedRevision =
        input.entity?.type === "existing" ? input.entity.expectedRevision : 0;
      const canonical = canonicalAdminEnvelope(input.actor, {
        ...input.envelope,
        expectedRevision: entityExpectedRevision,
      });
      const watchlistConfiguration = canonical
        ? canonicalizeGlobalRadarWatchlistConfiguration(
            input.configuration,
            canonical.now,
          )
        : null;
      if (
        !canonical ||
        !watchlistConfiguration ||
        !input.entity ||
        !UUID_PATTERN.test(input.entity.entityId) ||
        (input.expectedEntryRevision !== null &&
          (!Number.isInteger(input.expectedEntryRevision) ||
            input.expectedEntryRevision < 0))
      ) return { outcome: "conflict", reason: "invalid_input" };

      let proposedIdentity: ReturnType<typeof createEntityIdentity> | null = null;
      let proposedCreate: Extract<
        GlobalRadarWatchlistEntityInput,
        { type: "create" }
      > | null = null;
      if (input.entity.type === "create") {
        proposedCreate = input.entity;
        try {
          proposedIdentity = createEntityIdentity({
            name: input.entity.canonicalName,
            headquartersCountry: input.entity.headquartersCountry,
            websiteUrl: input.entity.websiteUrl,
            linkedinOrganizationUrl: input.entity.linkedinOrganizationUrl,
            stablePublicIdentifiers: input.entity.stablePublicIdentifiers,
          });
        } catch {
          return { outcome: "conflict", reason: "invalid_input" };
        }
        if (
          proposedIdentity.stableIdentifiers.length === 0 ||
          typeof input.entity.canonicalName !== "string" ||
          input.entity.canonicalName.trim().length < 1 ||
          input.entity.canonicalName.trim().length > 200 ||
          typeof input.entity.organisationType !== "string" ||
          input.entity.organisationType.trim().length < 1 ||
          input.entity.organisationType.trim().length > 200 ||
          typeof input.entity.sector !== "string" ||
          input.entity.sector.trim().length < 1 ||
          input.entity.sector.trim().length > 200 ||
          typeof input.entity.shortDescription !== "string" ||
          input.entity.shortDescription.trim().length < 1 ||
          input.entity.shortDescription.trim().length > 2_000 ||
          (input.entity.canonicalCorporateGroupId !== null &&
            !/^[a-z0-9][a-z0-9._:-]{0,199}$/.test(
              input.entity.canonicalCorporateGroupId,
            )) ||
          (input.entity.operatingCountries !== null &&
            (input.entity.operatingCountries.length > 50 ||
              input.entity.operatingCountries.some(
                (country) =>
                  typeof country !== "string" ||
                  country.trim().length < 1 ||
                  country.trim().length > 100,
              )))
        ) return { outcome: "conflict", reason: "invalid_input" };
      }

      const fingerprint = requestFingerprint({
        action: "watchlist_upsert",
        entity:
          input.entity.type === "existing"
            ? {
                type: "existing",
                entityId: input.entity.entityId.toLowerCase(),
                expectedRevision: input.entity.expectedRevision,
              }
            : {
                type: "create",
                entityId: input.entity.entityId.toLowerCase(),
                identity: proposedIdentity,
                canonicalName: input.entity.canonicalName.trim(),
                canonicalCorporateGroupId: input.entity.canonicalCorporateGroupId,
                headquartersCity: input.entity.headquartersCity,
                operatingCountries: input.entity.operatingCountries,
                organisationType: input.entity.organisationType.trim(),
                sector: input.entity.sector.trim(),
                shortDescription: input.entity.shortDescription.trim(),
              },
        expectedEntryRevision: input.expectedEntryRevision,
        actorUserId: canonical.actor.userId,
        actorEmail: canonical.actor.email,
        idempotencyKey: canonical.idempotencyKey,
        reason: canonical.reason,
        configuration: {
          ...watchlistConfiguration,
          nextScanAt: watchlistConfiguration.nextScanAt?.toISOString() ?? null,
        },
      });

      const result = await database.transaction(async (tx) => {
        const [actorUser] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, canonical.actor.userId))
          .limit(1);
        if (!actorUser) return { outcome: "invalid_input" as const };

        let entity;
        let entityWasCreated = false;
        if (input.entity.type === "create" && proposedIdentity && proposedCreate) {
          for (const token of proposedIdentity.stableIdentifiers) {
            await tx.execute(
              sql`select pg_advisory_xact_lock(hashtextextended(${`global-radar:entity-identity:v1:${token}`}, 0))`,
            );
          }
          const [proposedIdOwner] = await tx
            .select()
            .from(globalEntities)
            .where(eq(globalEntities.id, input.entity.entityId))
            .limit(1)
            .for("update");
          const identityConditions = [
            ...(proposedIdentity.canonicalDomain
              ? [eq(globalEntities.canonicalDomain, proposedIdentity.canonicalDomain)]
              : []),
            ...(proposedIdentity.officialWebsiteUrl
              ? [eq(globalEntities.websiteUrl, proposedIdentity.officialWebsiteUrl)]
              : []),
            ...(proposedIdentity.linkedinOrganizationUrl
              ? [eq(globalEntities.linkedinUrl, proposedIdentity.linkedinOrganizationUrl)]
              : []),
            arrayOverlaps(globalEntities.stablePublicIdentifiers, [
              ...proposedIdentity.stableIdentifiers,
            ]),
          ];
          const identityOwners = await tx
            .select({ id: globalEntities.id })
            .from(globalEntities)
            .where(or(...identityConditions))
            .orderBy(asc(globalEntities.id))
            .for("update");
          if (
            identityOwners.some(({ id }) => id !== input.entity.entityId) ||
            (proposedIdOwner &&
              proposedIdOwner.publicIdentityAnchor !==
                createGlobalRadarPublicIdentityAnchor(proposedIdentity))
          ) return { outcome: "entity_identity_conflict" as const };
          if (proposedIdOwner) {
            entity = proposedIdOwner;
          } else {
            const collisionCandidates = await tx
              .select({ id: globalEntities.id })
              .from(globalEntities)
              .where(
                and(
                  eq(globalEntities.normalizedName, proposedIdentity.normalizedName),
                  eq(globalEntities.headquartersCountry, proposedIdentity.normalizedCountry),
                ),
              )
              .orderBy(asc(globalEntities.id))
              .for("update");
            const [created] = await tx
              .insert(globalEntities)
              .values({
                id: input.entity.entityId,
                canonicalName: proposedCreate.canonicalName.trim(),
                normalizedName: proposedIdentity.normalizedName,
                canonicalDomain: proposedIdentity.canonicalDomain,
                websiteUrl: proposedIdentity.officialWebsiteUrl,
                linkedinUrl: proposedIdentity.linkedinOrganizationUrl,
                canonicalCorporateGroupId: proposedCreate.canonicalCorporateGroupId,
                stablePublicIdentifiers: [...proposedIdentity.stableIdentifiers],
                publicIdentityAnchor: createGlobalRadarPublicIdentityAnchor(proposedIdentity),
                headquartersCountry: proposedIdentity.normalizedCountry,
                headquartersCity: proposedCreate.headquartersCity?.trim() ?? null,
                operatingCountries: proposedCreate.operatingCountries
                  ? [...new Set(proposedCreate.operatingCountries.map((country) => country.trim()))]
                  : null,
                organisationType: proposedCreate.organisationType.trim(),
                sector: proposedCreate.sector.trim(),
                shortDescription: proposedCreate.shortDescription.trim(),
                entityStatus: "watchlisted",
                firstSeenAt: canonical.now,
                lastSeenAt: canonical.now,
                rawMetadata:
                  collisionCandidates.length > 0
                    ? {
                        identityMergeCandidateEntityIds:
                          boundGlobalRadarCollisionCandidateIds(
                            collisionCandidates.map(({ id }) => id),
                          ),
                      }
                    : {},
                revision: 0,
                createdAt: canonical.now,
                updatedAt: canonical.now,
              })
              .returning();
            if (!created) throw new Error("Watchlist entity insert returned no row.");
            entity = created;
            entityWasCreated = true;
          }
        } else {
          const [existing] = await tx
            .select()
            .from(globalEntities)
            .where(eq(globalEntities.id, input.entity.entityId))
            .limit(1)
            .for("update");
          if (!existing) return { outcome: "not_found" as const };
          entity = existing;
        }

        const [entry] = await tx
          .select()
          .from(globalRadarWatchlistEntries)
          .where(eq(globalRadarWatchlistEntries.globalEntityId, entity.id))
          .limit(1)
          .for("update");
        const [existingEvent] = await tx
          .select({ afterSafeState: globalRadarAdminEvents.afterSafeState })
          .from(globalRadarAdminEvents)
          .where(
            and(
              eq(globalRadarAdminEvents.targetType, "watchlist"),
              eq(globalRadarAdminEvents.targetId, entity.id),
              eq(globalRadarAdminEvents.idempotencyKey, canonical.idempotencyKey),
            ),
          )
          .limit(1);
        if (existingEvent) {
          return storedRequestFingerprint(existingEvent.afterSafeState) === fingerprint
            ? { outcome: "replayed" as const, entity, entry }
            : { outcome: "idempotency_mismatch" as const, entity, entry };
        }
        if (
          input.entity.type === "existing" &&
          entity.revision !== input.entity.expectedRevision
        ) return { outcome: "revision_mismatch" as const, entity, entry };
        if (
          (entry === undefined && input.expectedEntryRevision !== null) ||
          (entry !== undefined && entry.revision !== input.expectedEntryRevision)
        ) return { outcome: "revision_mismatch" as const, entity, entry };

        const shouldWatchlistEntity =
          watchlistConfiguration.state === "enabled" &&
          ["observed", "archived"].includes(entity.entityStatus);
        if (shouldWatchlistEntity) {
          const [updatedEntity] = await tx
            .update(globalEntities)
            .set({
              entityStatus: "watchlisted",
              revision: entity.revision + 1,
              updatedAt: canonical.now,
            })
            .where(eq(globalEntities.id, entity.id))
            .returning();
          if (!updatedEntity) throw new Error("Locked watchlist entity disappeared.");
          entity = updatedEntity;
        }

        const entryValues = {
          state: watchlistConfiguration.state,
          priority: watchlistConfiguration.priority,
          theme: watchlistConfiguration.theme,
          category: watchlistConfiguration.category,
          categorySearchTermEn: watchlistConfiguration.categorySearchTermEn,
          categorySearchTermZhCn: watchlistConfiguration.categorySearchTermZhCn,
          countries: watchlistConfiguration.countries,
          languages: watchlistConfiguration.languages,
          cadenceDays: watchlistConfiguration.cadenceDays,
          nextScanAt: watchlistConfiguration.nextScanAt,
          reason: canonical.reason,
          updatedAt: canonical.now,
        };
        const [savedEntry] = entry
          ? await tx
              .update(globalRadarWatchlistEntries)
              .set({ ...entryValues, revision: entry.revision + 1 })
              .where(eq(globalRadarWatchlistEntries.id, entry.id))
              .returning()
          : await tx
              .insert(globalRadarWatchlistEntries)
              .values({
                globalEntityId: entity.id,
                ...entryValues,
                createdByUserId: canonical.actor.userId,
                createdByEmail: canonical.actor.email,
                revision: 0,
                createdAt: canonical.now,
              })
              .returning();
        if (!savedEntry) throw new Error("Watchlist entry write returned no row.");
        await tx.insert(globalRadarAdminEvents).values({
          actorType: "administrator",
          actorId: canonical.actor.userId,
          actorEmail: canonical.actor.email,
          targetType: "watchlist",
          targetId: entity.id,
          action: entry ? "watchlist_updated" : "watchlist_created",
          reason: canonical.reason,
          beforeSafeState: entry
            ? {
                entityRevision:
                  shouldWatchlistEntity ? entity.revision - 1 : entity.revision,
                entryState: entry.state,
                entryRevision: entry.revision,
              }
            : null,
          afterSafeState: {
            message: "Global Radar watchlist configuration saved.",
            requestFingerprint: fingerprint,
            entityRevision: entity.revision,
            entryState: savedEntry.state,
            entryRevision: savedEntry.revision,
          },
          idempotencyKey: canonical.idempotencyKey,
          createdAt: canonical.now,
        });
        return {
          outcome: entry || !entityWasCreated ? (entry ? "updated" as const : "created" as const) : "created" as const,
          entity,
          entry: savedEntry,
        };
      });

      if (
        result.outcome === "invalid_input" ||
        result.outcome === "not_found" ||
        result.outcome === "revision_mismatch" ||
        result.outcome === "idempotency_mismatch" ||
        result.outcome === "entity_identity_conflict"
      ) {
        return {
          outcome: "conflict",
          reason: result.outcome,
          ...("entity" in result && result.entity
            ? { entity: toSafeGlobalRadarEntity(result.entity) }
            : {}),
          ...("entry" in result && result.entry
            ? { entry: toSafeGlobalRadarWatchlistEntry(result.entry) }
            : {}),
        };
      }
      if (!result.entry) {
        return { outcome: "conflict", reason: "not_found" };
      }
      return {
        outcome: result.outcome,
        entity: toSafeGlobalRadarEntity(result.entity),
        entry: toSafeGlobalRadarWatchlistEntry(result.entry),
      };
    },

    async getWatchlistEnrichment(input: {
      globalEntityIds: readonly string[];
      now: Date;
    }): Promise<
      | { outcome: "listed"; items: SafeGlobalRadarWatchlistEnrichment[] }
      | { outcome: "conflict"; reason: GlobalRadarReadConflictReason }
    > {
      if (
        !Array.isArray(input.globalEntityIds) ||
        input.globalEntityIds.length > PAGE_SIZE ||
        input.globalEntityIds.some((id) => !isGlobalRadarAdminSignalId(id)) ||
        !(input.now instanceof Date) ||
        Number.isNaN(input.now.getTime())
      ) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      const globalEntityIds = [...new Set(input.globalEntityIds)];
      if (globalEntityIds.length === 0) {
        return { outcome: "listed", items: [] };
      }
      const selection = safeListSelection();
      const [primarySignals, associatedSignals, promotions] = await Promise.all([
        database
          .selectDistinctOn([globalRadarSignals.globalEntityId], {
            watchlistEntityId: globalRadarSignals.globalEntityId,
            ...selection,
          })
          .from(globalRadarSignals)
          .leftJoin(
            globalEntities,
            eq(globalRadarSignals.globalEntityId, globalEntities.id),
          )
          .where(
            and(
              inArray(globalRadarSignals.globalEntityId, globalEntityIds),
              isNull(globalRadarSignals.mergedIntoSignalId),
            ),
          )
          .orderBy(
            globalRadarSignals.globalEntityId,
            desc(globalRadarSignals.observedAt),
            desc(globalRadarSignals.updatedAt),
            asc(globalRadarSignals.id),
          ),
        database
          .selectDistinctOn([globalRadarSignalEntities.globalEntityId], {
            watchlistEntityId: globalRadarSignalEntities.globalEntityId,
            ...selection,
          })
          .from(globalRadarSignalEntities)
          .innerJoin(
            globalRadarSignals,
            eq(globalRadarSignalEntities.signalId, globalRadarSignals.id),
          )
          .leftJoin(
            globalEntities,
            eq(globalRadarSignals.globalEntityId, globalEntities.id),
          )
          .where(
            and(
              inArray(
                globalRadarSignalEntities.globalEntityId,
                globalEntityIds,
              ),
              isNull(globalRadarSignals.mergedIntoSignalId),
            ),
          )
          .orderBy(
            globalRadarSignalEntities.globalEntityId,
            desc(globalRadarSignals.observedAt),
            desc(globalRadarSignals.updatedAt),
            asc(globalRadarSignals.id),
          ),
        database
          .selectDistinctOn([globalRadarPromotions.globalEntityId], {
            id: globalRadarPromotions.id,
            globalEntityId: globalRadarPromotions.globalEntityId,
            status: globalRadarPromotions.status,
            discoveryCandidateId: globalRadarPromotions.discoveryCandidateId,
            promotedAt: globalRadarPromotions.promotedAt,
            reversedAt: globalRadarPromotions.reversedAt,
            updatedAt: globalRadarPromotions.updatedAt,
          })
          .from(globalRadarPromotions)
          .where(
            and(
              inArray(globalRadarPromotions.globalEntityId, globalEntityIds),
              inArray(globalRadarPromotions.status, ["active", "reversed"]),
            ),
          )
          .orderBy(
            globalRadarPromotions.globalEntityId,
            desc(globalRadarPromotions.updatedAt),
            asc(globalRadarPromotions.id),
          ),
      ]);
      const selectedSignalIds = [
        ...new Set(
          [...primarySignals, ...associatedSignals].map(({ id }) => id),
        ),
      ];
      const selectedSignals = selectedSignalIds.length
        ? await database
            .select()
            .from(globalRadarSignals)
            .where(inArray(globalRadarSignals.id, selectedSignalIds))
        : [];
      if (!hasExactSignalIdParity(selectedSignalIds, selectedSignals)) {
        return {
          outcome: "conflict",
          reason: "score_provenance_invalid",
        };
      }
      const scoreProvenance =
        await validateStoredGlobalRadarScoreProvenanceBatch(
          database,
          selectedSignals,
        );
      if (!scoreProvenance.valid) {
        return {
          outcome: "conflict",
          reason: "score_provenance_invalid",
        };
      }
      const signalCandidates = [...primarySignals, ...associatedSignals]
        .filter(
          (row): row is typeof row & { watchlistEntityId: string } =>
            row.watchlistEntityId !== null,
        )
        .map((row) => ({
          signal: toSafeListItem(row),
          globalEntityIds: [row.watchlistEntityId],
        }));
      const safePromotions = promotions.flatMap((promotion) =>
        promotion.status === "active" || promotion.status === "reversed"
          ? [{ ...promotion, status: promotion.status }]
          : [],
      );
      return {
        outcome: "listed",
        items: assembleGlobalRadarWatchlistEnrichment({
          globalEntityIds,
          signals: signalCandidates,
          promotions: safePromotions,
        }),
      };
    },

    async listRuns(input: { page: number }) {
      if (!Number.isInteger(input.page) || input.page < 1 || input.page > MAX_PAGE) {
        return { outcome: "conflict" as const, reason: "invalid_input" as const };
      }
      const [countRows, rows] = await Promise.all([
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(globalRadarRuns),
        database
          .select({
            id: globalRadarRuns.id,
            trigger: globalRadarRuns.trigger,
            scanMode: globalRadarRuns.scanMode,
            status: globalRadarRuns.status,
            startedAt: globalRadarRuns.startedAt,
            completedAt: globalRadarRuns.completedAt,
            sourceCountries: globalRadarRuns.sourceCountries,
            sourceLanguages: globalRadarRuns.sourceLanguages,
            targetDomains: globalRadarRuns.targetDomains,
            targetSignalTypes: globalRadarRuns.targetSignalTypes,
            sourcesUsed: globalRadarRuns.sourcesUsed,
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
            createdAt: globalRadarRuns.createdAt,
            updatedAt: globalRadarRuns.updatedAt,
          })
          .from(globalRadarRuns)
          .orderBy(desc(globalRadarRuns.createdAt), desc(globalRadarRuns.id))
          .limit(PAGE_SIZE)
          .offset((input.page - 1) * PAGE_SIZE),
      ]);
      const runs: SafeGlobalRadarAdminRun[] = rows.map(({ errorSummary, ...run }) => {
        const notices: SafeGlobalRadarRunNotice[] = [];
        const failureCode =
          errorSummary &&
          typeof errorSummary === "object" &&
          !Array.isArray(errorSummary) &&
          typeof (errorSummary as Record<string, unknown>).failure === "object" &&
          (errorSummary as { failure?: { code?: unknown } }).failure?.code;
        if (failureCode === "lease_expired") {
          notices.push({
            code: "lease_expired",
            message: "The worker lease expired before the run completed.",
          });
        } else if (run.status === "failed") {
          notices.push({
            code: "run_failed",
            message: "The run failed before a complete result was persisted.",
          });
        }
        if (run.numberSourceErrors > 0) {
          notices.push({
            code: "source_errors",
            message: "One or more public sources could not be processed.",
            count: run.numberSourceErrors,
          });
        }
        return {
          ...run,
          sourceCountries: [...run.sourceCountries],
          sourceLanguages: [...run.sourceLanguages],
          targetDomains: [...run.targetDomains],
          targetSignalTypes: [...run.targetSignalTypes],
          sourcesUsed: [...run.sourcesUsed],
          notices,
        };
      });
      return {
        outcome: "listed" as const,
        page: input.page,
        pageSize: PAGE_SIZE,
        total: countRows[0]?.count ?? 0,
        runs,
      };
    },

    async getWatchlistByEntityId(entityId: string): Promise<
      | { outcome: "found"; entry: SafeGlobalRadarWatchlistItem }
      | { outcome: "not_found" }
      | { outcome: "conflict"; reason: "invalid_input" }
    > {
      if (!isGlobalRadarAdminSignalId(entityId)) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      const [row] = await database
        .select({
          entry: globalRadarWatchlistEntries,
          entityName: globalEntities.canonicalName,
          entityCountry: globalEntities.headquartersCountry,
          entityStatus: globalEntities.entityStatus,
          entityRevision: globalEntities.revision,
        })
        .from(globalRadarWatchlistEntries)
        .innerJoin(
          globalEntities,
          eq(globalRadarWatchlistEntries.globalEntityId, globalEntities.id),
        )
        .where(eq(globalRadarWatchlistEntries.globalEntityId, entityId))
        .limit(1);
      if (!row) return { outcome: "not_found" };
      return {
        outcome: "found",
        entry: {
          ...toSafeGlobalRadarWatchlistEntry(row.entry),
          entity: {
            canonicalName: row.entityName,
            headquartersCountry: row.entityCountry,
            entityStatus: row.entityStatus,
            revision: row.entityRevision,
          },
        },
      };
    },

    async listWatchlist(input: { page: number }) {
      if (!Number.isInteger(input.page) || input.page < 1 || input.page > MAX_PAGE) {
        return { outcome: "conflict" as const, reason: "invalid_input" as const };
      }
      const [countRow] = await database
        .select({ count: sql<number>`count(*)::int` })
        .from(globalRadarWatchlistEntries);
      const rows = await database
        .select({
          id: globalRadarWatchlistEntries.id,
          globalEntityId: globalRadarWatchlistEntries.globalEntityId,
          state: globalRadarWatchlistEntries.state,
          priority: globalRadarWatchlistEntries.priority,
          theme: globalRadarWatchlistEntries.theme,
          category: globalRadarWatchlistEntries.category,
          categorySearchTermEn: globalRadarWatchlistEntries.categorySearchTermEn,
          categorySearchTermZhCn: globalRadarWatchlistEntries.categorySearchTermZhCn,
          countries: globalRadarWatchlistEntries.countries,
          languages: globalRadarWatchlistEntries.languages,
          cadenceDays: globalRadarWatchlistEntries.cadenceDays,
          nextScanAt: globalRadarWatchlistEntries.nextScanAt,
          reason: globalRadarWatchlistEntries.reason,
          revision: globalRadarWatchlistEntries.revision,
          entityName: globalEntities.canonicalName,
          entityCountry: globalEntities.headquartersCountry,
          entityStatus: globalEntities.entityStatus,
          entityRevision: globalEntities.revision,
        })
        .from(globalRadarWatchlistEntries)
        .innerJoin(globalEntities, eq(globalRadarWatchlistEntries.globalEntityId, globalEntities.id))
        .orderBy(desc(globalRadarWatchlistEntries.priority), asc(globalRadarWatchlistEntries.id))
        .limit(PAGE_SIZE)
        .offset((input.page - 1) * PAGE_SIZE);
      const entries: SafeGlobalRadarWatchlistItem[] = rows.map((row) => ({
        id: row.id,
        globalEntityId: row.globalEntityId,
        state: row.state,
        priority: row.priority,
        theme: row.theme,
        category: row.category,
        categorySearchTermEn: row.categorySearchTermEn,
        categorySearchTermZhCn: row.categorySearchTermZhCn,
        countries: [...row.countries],
        languages: [...row.languages],
        cadenceDays: row.cadenceDays,
        nextScanAt: row.nextScanAt,
        reason: row.reason,
        revision: row.revision,
        entity: {
          canonicalName: row.entityName,
          headquartersCountry: row.entityCountry,
          entityStatus: row.entityStatus,
          revision: row.entityRevision,
        },
      }));
      return {
        outcome: "listed" as const,
        page: input.page,
        pageSize: PAGE_SIZE,
        total: countRow?.count ?? 0,
        entries,
      };
    },
  };
  return repository;
}
