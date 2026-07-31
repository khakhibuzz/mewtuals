import {
  and,
  arrayOverlaps,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  max,
  or,
  sql,
} from "drizzle-orm";

import {
  GLOBAL_RADAR_DEDUPE_VERSION,
  GLOBAL_RADAR_MOMENTUM_EVIDENCE_MAXIMUM_AGE_DAYS,
  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
  MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS,
  MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS,
  createGlobalRadarFingerprint,
  createGlobalRadarMomentumPolicy,
  createGlobalRadarPublicIdentityAnchor,
  createGlobalRadarSignalDedupeKeyFromIdentityAnchors,
  deriveEcosystemMomentum,
  deriveGlobalRadarReclassification,
  evidenceClaimSupportsPositiveIndiaPath,
  momentumScoreEvidenceComponents,
  parseActiveScoreEvidenceSnapshot,
  resolveRediscoveredReobserveBy,
  type CanonicalPersistableGlobalRadarBatch,
  type CanonicalPersistableRadarEntity,
  type CandidateEvidence,
  type MomentumPolicy,
  type PersistableRadarSignal,
} from "../../app/domain/global-radar";
import type { MewtualsDatabase } from "../client";
import {
  globalEntities,
  globalRadarAdminEvents,
  globalRadarSearchQueries,
  globalRadarSignalEntities,
  globalRadarSignals,
  globalSignalEvidence,
  globalSignalRequirements,
  globalSignalUpdates,
} from "../global-radar-schema";
import type { GlobalEntity, GlobalRadarSignal } from "../types";
import { createGlobalRadarDedupeLockKey } from "./global-radar-admin-classification-transaction";
import {
  createActiveScoreEvaluationMetadata,
  createStoredGlobalRadarScoreInputDigest,
  createStoredScoreEvidenceSnapshot,
  createWorkerScoreEvidenceSnapshot,
  eligibleMomentumEvidenceInWindowConditions,
  emptyMomentumEvidenceWindowBounds,
  rebaseStoredScoreEvidenceSnapshot,
  storedScoreComponents,
} from "./global-radar-score-evidence";
import { validateStoredGlobalRadarScoreProvenance } from "./global-radar-stored-score-provenance";

type GlobalRadarTransaction = Parameters<
  Parameters<MewtualsDatabase["transaction"]>[0]
>[0];

const ENTITY_IDENTITY_LOCK_NAMESPACE =
  "global-radar:entity-identity:v1:" as const;
const MAX_GLOBAL_RADAR_MERGE_CHAIN_HOPS = 32;

export type GlobalRadarPersistenceConflictReason =
  | "entity_identity_conflict"
  | "invalid_input";

export class GlobalRadarPersistenceConflict extends Error {
  readonly reason: GlobalRadarPersistenceConflictReason;

  constructor(reason: GlobalRadarPersistenceConflictReason) {
    super(reason);
    this.name = "GlobalRadarPersistenceConflict";
    this.reason = reason;
  }
}

export type PersistGlobalRadarBatchResult = {
  counters: {
    numberResultsExamined: number;
    numberEntitiesObserved: number;
    numberSignalsFound: number;
    numberDirectDemands: number;
    numberPrecursors: number;
    numberMomentumRecords: number;
    numberNew: number;
    numberUpdated: number;
    numberDuplicates: number;
    numberRejectedForWeakEvidence: number;
    numberSourceErrors: number;
  };
  sourceErrors: readonly { sourceName: string; message: string }[];
  rejections: Readonly<Record<string, number>>;
};

function entityObservedAt(
  batch: CanonicalPersistableGlobalRadarBatch,
  entityRef: string,
): Date {
  const timestamps = batch.signals.flatMap((signal) => {
    const referenced =
      signal.primaryEntityRef === entityRef ||
      signal.associatedEntities.some((association) => association.entityRef === entityRef) ||
      signal.evidence.some(
        (evidence) => evidence.contributorEntityRef === entityRef,
      );
    return referenced ? [Date.parse(signal.observedAt)] : [];
  });
  if (timestamps.length === 0) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
  return new Date(Math.max(...timestamps));
}

async function identityOwners(
  transaction: GlobalRadarTransaction,
  entity: CanonicalPersistableRadarEntity,
): Promise<GlobalEntity[]> {
  const conditions = [
    ...(entity.identity.canonicalDomain
      ? [eq(globalEntities.canonicalDomain, entity.identity.canonicalDomain)]
      : []),
    ...(entity.identity.officialWebsiteUrl
      ? [eq(globalEntities.websiteUrl, entity.identity.officialWebsiteUrl)]
      : []),
    ...(entity.identity.linkedinOrganizationUrl
      ? [eq(globalEntities.linkedinUrl, entity.identity.linkedinOrganizationUrl)]
      : []),
    ...(entity.identity.stableIdentifiers.length > 0
      ? [
          arrayOverlaps(
            globalEntities.stablePublicIdentifiers,
            [...entity.identity.stableIdentifiers],
          ),
        ]
      : []),
  ];
  if (conditions.length === 0) return [];
  return transaction
    .select()
    .from(globalEntities)
    .where(or(...conditions))
    .orderBy(asc(globalEntities.id))
    .for("update");
}

async function collisionCandidates(
  transaction: GlobalRadarTransaction,
  entity: CanonicalPersistableRadarEntity,
): Promise<string[]> {
  const candidates = await transaction
    .select({ id: globalEntities.id })
    .from(globalEntities)
    .where(
      and(
        eq(globalEntities.normalizedName, entity.identity.normalizedName),
        eq(
          globalEntities.headquartersCountry,
          entity.identity.normalizedCountry,
        ),
      ),
    )
    .orderBy(asc(globalEntities.id))
    .for("update");
  return candidates.map(({ id }) => id);
}

function mergeStableIdentifiers(
  current: readonly string[],
  proposed: readonly string[],
): string[] {
  return [...new Set([...current, ...proposed])].sort();
}

async function lockBatchEntityIdentities(
  transaction: GlobalRadarTransaction,
  entities: readonly CanonicalPersistableRadarEntity[],
): Promise<void> {
  const tokens = [
    ...new Set(entities.flatMap(({ identity }) => identity.stableIdentifiers)),
  ].sort();
  for (const token of tokens) {
    await transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${ENTITY_IDENTITY_LOCK_NAMESPACE}${token}`}, 0))`,
    );
  }
}

async function resolveEntity(
  transaction: GlobalRadarTransaction,
  batch: CanonicalPersistableGlobalRadarBatch,
  entity: CanonicalPersistableRadarEntity,
): Promise<GlobalEntity> {
  const owners = await identityOwners(transaction, entity);
  const ownerIds = new Set(owners.map(({ id }) => id));
  if (ownerIds.size > 1) {
    throw new GlobalRadarPersistenceConflict("entity_identity_conflict");
  }
  const seenAt = entityObservedAt(batch, entity.entityRef);
  const [owner] = owners;
  if (owner) {
    if (
      owner.canonicalCorporateGroupId !== null &&
      entity.canonicalCorporateGroupId !== null &&
      owner.canonicalCorporateGroupId !== entity.canonicalCorporateGroupId
    ) {
      throw new GlobalRadarPersistenceConflict("entity_identity_conflict");
    }
    const isNewerObservation = seenAt.getTime() > owner.lastSeenAt.getTime();
    const [updated] = await transaction
      .update(globalEntities)
      .set({
        canonicalName: isNewerObservation
          ? entity.canonicalName
          : owner.canonicalName,
        normalizedName: isNewerObservation
          ? entity.identity.normalizedName
          : owner.normalizedName,
        canonicalDomain:
          owner.canonicalDomain ?? entity.identity.canonicalDomain,
        websiteUrl:
          owner.websiteUrl ?? entity.identity.officialWebsiteUrl,
        linkedinUrl:
          owner.linkedinUrl ?? entity.identity.linkedinOrganizationUrl,
        canonicalCorporateGroupId:
          owner.canonicalCorporateGroupId ?? entity.canonicalCorporateGroupId,
        stablePublicIdentifiers: mergeStableIdentifiers(
          owner.stablePublicIdentifiers,
          entity.identity.stableIdentifiers,
        ),
        headquartersCountry: isNewerObservation
          ? entity.identity.normalizedCountry
          : owner.headquartersCountry,
        headquartersCity: isNewerObservation
          ? entity.headquartersCity
          : owner.headquartersCity,
        operatingCountries: isNewerObservation
          ? entity.operatingCountries
          : owner.operatingCountries,
        organisationType: isNewerObservation
          ? entity.organisationType
          : owner.organisationType,
        sector: isNewerObservation ? entity.sector : owner.sector,
        shortDescription: isNewerObservation
          ? entity.shortDescription
          : owner.shortDescription,
        lastSeenAt: isNewerObservation ? seenAt : owner.lastSeenAt,
        rawMetadata: isNewerObservation
          ? {
              ...owner.rawMetadata,
              ...entity.rawMetadata,
            }
          : owner.rawMetadata,
        updatedAt: isNewerObservation ? seenAt : owner.updatedAt,
      })
      .where(eq(globalEntities.id, owner.id))
      .returning();
    if (!updated) {
      throw new Error("Global Radar entity owner could not be updated.");
    }
    return updated;
  }

  const mergeCandidateEntityIds = await collisionCandidates(transaction, entity);
  const [created] = await transaction
    .insert(globalEntities)
    .values({
      canonicalName: entity.canonicalName,
      normalizedName: entity.identity.normalizedName,
      canonicalDomain: entity.identity.canonicalDomain,
      websiteUrl: entity.identity.officialWebsiteUrl,
      linkedinUrl: entity.identity.linkedinOrganizationUrl,
      canonicalCorporateGroupId: entity.canonicalCorporateGroupId,
      stablePublicIdentifiers: [...entity.identity.stableIdentifiers],
      publicIdentityAnchor: createGlobalRadarPublicIdentityAnchor(
        entity.identity,
      ),
      headquartersCountry: entity.identity.normalizedCountry,
      headquartersCity: entity.headquartersCity,
      operatingCountries: entity.operatingCountries,
      organisationType: entity.organisationType,
      sector: entity.sector,
      shortDescription: entity.shortDescription,
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      rawMetadata: {
        ...entity.rawMetadata,
        ...(mergeCandidateEntityIds.length > 0
          ? { identityMergeCandidateEntityIds: mergeCandidateEntityIds }
          : {}),
      },
      createdAt: seenAt,
      updatedAt: seenAt,
    })
    .returning();
  if (!created) throw new Error("Global Radar entity was not created.");
  return created;
}

function signalInsertValues(
  signal: PersistableRadarSignal,
  runId: string,
  entityIds: ReadonlyMap<string, string>,
  corporateGroupIdsByEntityRef: ReadonlyMap<string, string | null>,
  resolvedDedupeKey: string,
): typeof globalRadarSignals.$inferInsert {
  const globalEntityId =
    signal.primaryEntityRef === null
      ? null
      : (entityIds.get(signal.primaryEntityRef) ?? null);
  const systemsContext = signal.systemsContext;
  const sensitive = signal.sensitiveDataAndCompliance.sensitiveDataFlags;
  const compliance = signal.sensitiveDataAndCompliance.complianceFacts;
  const direct = signal.signalClass === "direct_demand" ? signal.score : null;
  const precursor =
    signal.signalClass === "demand_precursor" ? signal.score : null;
  const momentum =
    signal.signalClass === "ecosystem_momentum" ? signal.score : null;
  const response = signal.responsePath;
  return {
    globalEntityId,
    signalClass: signal.signalClass,
    demandDomain: signal.demandDomain,
    signalType: signal.signalType,
    title: signal.title,
    factualSummary: signal.factualSummary,
    interpretationSummary: signal.interpretationSummary,
    theme: signal.theme,
    systemsContextSummary: systemsContext?.systemsContextSummary ?? null,
    sourceCountry: signal.sourceCountry,
    targetGeographies: signal.targetGeographies,
    collectionGeographies: signal.collectionGeographies,
    manufacturingGeographies: signal.manufacturingGeographies,
    deliveryGeographies: signal.deliveryGeographies,
    industry: signal.industry,
    targetModelOrSystem: signal.targetModelOrSystem,
    targetCapabilityTags: signal.targetCapabilityTags,
    requiredCounterpartyArchetypes: signal.requiredCounterpartyArchetypes,
    indiaRelevanceType: signal.indiaRelevance.relevanceType,
    indiaRelevanceRationale: signal.indiaRelevance.rationale,
    indiaFitReasons: signal.indiaRelevance.reasons,
    indiaFitConstraints: signal.indiaRelevance.constraints,
    indiaFitUnknowns: signal.indiaRelevance.unknowns,
    indiaFitConfidence: signal.indiaRelevance.confidence,
    indiaRegulatoryFacts: signal.indiaRelevance.regulatoryFacts,
    indiaLogisticsFacts: signal.indiaRelevance.logisticsFacts,
    demandExplicitness: direct?.components.explicitness,
    evidenceConfidence:
      direct?.components.evidenceConfidence ??
      precursor?.components.evidenceConfidence,
    freshness: direct?.components.freshness,
    actionability: direct?.components.actionability,
    indiaFit: direct?.components.indiaFit ?? precursor?.components.indiaFit,
    commercialPotential: direct?.components.commercialPotential,
    repeatability: direct?.components.repeatability,
    responseAccessibility: direct?.components.responseAccessibility,
    strategicLearning: direct?.components.strategicLearning,
    complianceComplexity: direct?.components.complianceComplexity,
    proximityToExternalDemand:
      precursor?.components.proximityToExternalDemand,
    fundingDeploymentMomentum:
      precursor?.components.fundingDeploymentMomentum,
    likelyDataHardwareIntensity:
      precursor?.components.likelyDataHardwareIntensity,
    estimatedTimeHorizon: precursor?.components.estimatedTimeHorizon,
    strategicRelevance: precursor?.components.strategicRelevance,
    momentumIndependentEntityCount: momentum?.counts.independentEntities,
    momentumPrimarySourceCount: momentum?.counts.primarySources,
    momentumSourceFamilyCount: momentum?.counts.sourceFamilies,
    momentumVolume7Days: momentum?.windows.days7.recent,
    momentumVolume30Days: momentum?.windows.days30.recent,
    momentumVolume90Days: momentum?.windows.days90.recent,
    momentumIndependentEntityBreadth:
      momentum?.components.independentEntityBreadth,
    momentumPrimarySourceDepth: momentum?.components.primarySourceDepth,
    momentumSourceDiversity: momentum?.components.sourceDiversity,
    momentumWeightedVolume: momentum?.components.weightedVolume,
    momentumGrowthVsPreviousPeriod:
      momentum?.components.growthVsPreceding,
    momentumTaxonomyConsistency: momentum?.components.taxonomyConsistency,
    momentumEvidenceQuality: momentum?.components.evidenceQuality,
    directDemandScore: direct?.score,
    precursorScore: precursor?.score,
    momentumScore: momentum?.score,
    scoreCoverage: signal.score.scoreCoverage,
    scorePolicyVersion: signal.score.scoreVersion,
    scoreEvidenceSnapshot: createWorkerScoreEvidenceSnapshot(
      signal,
      entityIds,
      corporateGroupIdsByEntityRef,
    ),
    momentumPolicyVersion: momentum?.policyVersion,
    momentumQualificationGatesPassed:
      momentum?.qualificationGatesPassed,
    announcedAt: signal.announcedAt ? new Date(signal.announcedAt) : null,
    effectiveFrom: signal.effectiveFrom ? new Date(signal.effectiveFrom) : null,
    expiresAt: signal.expiresAt ? new Date(signal.expiresAt) : null,
    evergreen: signal.evergreen,
    reobserveBy: signal.reobserveBy ? new Date(signal.reobserveBy) : null,
    observedAt: new Date(signal.observedAt),
    status: signal.initialStatus,
    responsePathType: response?.type ?? null,
    responsePathUrl: response?.url ?? null,
    responseBusinessEmail: response?.businessEmail ?? null,
    partnerApplicationUrl: signal.partnerApplicationUrl,
    sourceLanguage: signal.sourceLanguage,
    extractionMethod: signal.extractionMethod,
    taxonomyVersion: signal.taxonomyVersion,
    systemsContextStackType: systemsContext?.stackType ?? null,
    higherLevelSystemGoal: systemsContext?.higherLevelSystemGoal ?? null,
    relevantStackLayer: systemsContext?.relevantStackLayer ?? null,
    lowerLevelInputsRequired: systemsContext?.lowerLevelInputsRequired ?? null,
    transformationOrCapabilityAdded:
      systemsContext?.transformationOrCapabilityAdded ?? null,
    downstreamModelOrRobotBehavior:
      systemsContext?.downstreamModelOrRobotBehavior ?? null,
    whyTheRequirementMatters:
      systemsContext?.whyTheRequirementMatters ?? null,
    possibleIndianExecutionRole:
      systemsContext?.possibleIndianExecutionRole ?? null,
    factualElements: systemsContext?.factualElements ?? null,
    inferredElements: systemsContext?.inferredElements ?? null,
    faces: sensitive.faces,
    voices: sensitive.voices,
    biometrics: sensitive.biometrics,
    gaze: sensitive.gaze,
    health: sensitive.health,
    children: sensitive.children,
    homeInteriors: sensitive.home_interiors,
    workplaceMonitoring: sensitive.workplace_monitoring,
    preciseLocation: sensitive.precise_location,
    roadUsers: sensitive.road_users,
    employeeData: sensitive.employee_data,
    industrialSecrets: sensitive.industrial_secrets,
    defenceOrDualUse: sensitive.defence_or_dual_use,
    copyrightedMaterial: sensitive.copyrighted_material,
    exportControls: sensitive.export_controls,
    consent: compliance.consent,
    deIdentification: compliance.deIdentification,
    legalReview: compliance.legalReview,
    knownResidencyRequirements: compliance.knownResidencyRequirements,
    participantRightsComplexity: compliance.participantRightsComplexity,
    rawMetadata: signal.rawMetadata,
    dedupeKey: resolvedDedupeKey,
    dedupeVersion: GLOBAL_RADAR_DEDUPE_VERSION,
    firstRunId: runId,
    mostRecentRunId: runId,
    firstSeenAt: new Date(signal.observedAt),
    lastSeenAt: new Date(signal.observedAt),
    createdAt: new Date(signal.observedAt),
    updatedAt: new Date(signal.observedAt),
  };
}

function automatedSignalRefreshValues(
  proposed: typeof globalRadarSignals.$inferInsert,
  preserveAdministratorNoIndiaFit: boolean,
): Partial<typeof globalRadarSignals.$inferInsert> {
  return {
    title: proposed.title,
    factualSummary: proposed.factualSummary,
    interpretationSummary: proposed.interpretationSummary,
    systemsContextSummary: proposed.systemsContextSummary,
    sourceCountry: proposed.sourceCountry,
    targetGeographies: proposed.targetGeographies,
    collectionGeographies: proposed.collectionGeographies,
    manufacturingGeographies: proposed.manufacturingGeographies,
    deliveryGeographies: proposed.deliveryGeographies,
    industry: proposed.industry,
    targetModelOrSystem: proposed.targetModelOrSystem,
    targetCapabilityTags: proposed.targetCapabilityTags,
    requiredCounterpartyArchetypes:
      proposed.requiredCounterpartyArchetypes,
    ...(preserveAdministratorNoIndiaFit
      ? { scoreEvidenceSnapshot: proposed.scoreEvidenceSnapshot }
      : {
          indiaRelevanceType: proposed.indiaRelevanceType,
          indiaRelevanceRationale: proposed.indiaRelevanceRationale,
          indiaFitReasons: proposed.indiaFitReasons,
          indiaFitConstraints: proposed.indiaFitConstraints,
          indiaFitUnknowns: proposed.indiaFitUnknowns,
          indiaFitConfidence: proposed.indiaFitConfidence,
          indiaRegulatoryFacts: proposed.indiaRegulatoryFacts,
          indiaLogisticsFacts: proposed.indiaLogisticsFacts,
          demandExplicitness: proposed.demandExplicitness,
          evidenceConfidence: proposed.evidenceConfidence,
          freshness: proposed.freshness,
          actionability: proposed.actionability,
          indiaFit: proposed.indiaFit,
          commercialPotential: proposed.commercialPotential,
          repeatability: proposed.repeatability,
          responseAccessibility: proposed.responseAccessibility,
          strategicLearning: proposed.strategicLearning,
          complianceComplexity: proposed.complianceComplexity,
          proximityToExternalDemand: proposed.proximityToExternalDemand,
          fundingDeploymentMomentum: proposed.fundingDeploymentMomentum,
          likelyDataHardwareIntensity: proposed.likelyDataHardwareIntensity,
          estimatedTimeHorizon: proposed.estimatedTimeHorizon,
          strategicRelevance: proposed.strategicRelevance,
          momentumIndependentEntityCount:
            proposed.momentumIndependentEntityCount,
          momentumPrimarySourceCount: proposed.momentumPrimarySourceCount,
          momentumSourceFamilyCount: proposed.momentumSourceFamilyCount,
          momentumVolume7Days: proposed.momentumVolume7Days,
          momentumVolume30Days: proposed.momentumVolume30Days,
          momentumVolume90Days: proposed.momentumVolume90Days,
          momentumIndependentEntityBreadth:
            proposed.momentumIndependentEntityBreadth,
          momentumPrimarySourceDepth: proposed.momentumPrimarySourceDepth,
          momentumSourceDiversity: proposed.momentumSourceDiversity,
          momentumWeightedVolume: proposed.momentumWeightedVolume,
          momentumGrowthVsPreviousPeriod:
            proposed.momentumGrowthVsPreviousPeriod,
          momentumTaxonomyConsistency:
            proposed.momentumTaxonomyConsistency,
          momentumEvidenceQuality: proposed.momentumEvidenceQuality,
          directDemandScore: proposed.directDemandScore,
          precursorScore: proposed.precursorScore,
          momentumScore: proposed.momentumScore,
          scoreCoverage: proposed.scoreCoverage,
          scorePolicyVersion: proposed.scorePolicyVersion,
          scoreEvidenceSnapshot: proposed.scoreEvidenceSnapshot,
          momentumPolicyVersion: proposed.momentumPolicyVersion,
          momentumQualificationGatesPassed:
            proposed.momentumQualificationGatesPassed,
          announcedAt: proposed.announcedAt,
          effectiveFrom: proposed.effectiveFrom,
          responsePathType: proposed.responsePathType,
          responsePathUrl: proposed.responsePathUrl,
          responseBusinessEmail: proposed.responseBusinessEmail,
          partnerApplicationUrl: proposed.partnerApplicationUrl,
          faces: proposed.faces,
          voices: proposed.voices,
          biometrics: proposed.biometrics,
          gaze: proposed.gaze,
          health: proposed.health,
          children: proposed.children,
          homeInteriors: proposed.homeInteriors,
          workplaceMonitoring: proposed.workplaceMonitoring,
          preciseLocation: proposed.preciseLocation,
          roadUsers: proposed.roadUsers,
          employeeData: proposed.employeeData,
          industrialSecrets: proposed.industrialSecrets,
          defenceOrDualUse: proposed.defenceOrDualUse,
          copyrightedMaterial: proposed.copyrightedMaterial,
          exportControls: proposed.exportControls,
          consent: proposed.consent,
          deIdentification: proposed.deIdentification,
          legalReview: proposed.legalReview,
          knownResidencyRequirements: proposed.knownResidencyRequirements,
          participantRightsComplexity:
            proposed.participantRightsComplexity,
        }),
    sourceLanguage: proposed.sourceLanguage,
    extractionMethod: proposed.extractionMethod,
    taxonomyVersion: proposed.taxonomyVersion,
    systemsContextStackType: proposed.systemsContextStackType,
    higherLevelSystemGoal: proposed.higherLevelSystemGoal,
    relevantStackLayer: proposed.relevantStackLayer,
    lowerLevelInputsRequired: proposed.lowerLevelInputsRequired,
    transformationOrCapabilityAdded:
      proposed.transformationOrCapabilityAdded,
    downstreamModelOrRobotBehavior:
      proposed.downstreamModelOrRobotBehavior,
    whyTheRequirementMatters: proposed.whyTheRequirementMatters,
    possibleIndianExecutionRole: proposed.possibleIndianExecutionRole,
    factualElements: proposed.factualElements,
    inferredElements: proposed.inferredElements,
    rawMetadata: proposed.rawMetadata,
  };
}

async function hasAdministratorNoIndiaFitDecision(
  transaction: GlobalRadarTransaction,
  signal: GlobalRadarSignal,
): Promise<boolean> {
  if (signal.indiaRelevanceType !== "no_current_India_fit") return false;
  const [decision] = await transaction
    .select({ afterSafeState: globalRadarAdminEvents.afterSafeState })
    .from(globalRadarAdminEvents)
    .where(
      and(
        eq(globalRadarAdminEvents.actorType, "administrator"),
        eq(globalRadarAdminEvents.targetType, "signal"),
        eq(globalRadarAdminEvents.targetId, signal.id),
        eq(globalRadarAdminEvents.action, "mark_no_india_fit"),
      ),
    )
    .orderBy(
      desc(globalRadarAdminEvents.createdAt),
      desc(globalRadarAdminEvents.id),
    )
    .limit(1);
  const decisionRevision = safeStateRevision(decision?.afterSafeState);
  if (decisionRevision === null) return false;
  const [supersession] = await transaction
    .select({ newSafeState: globalSignalUpdates.newSafeState })
    .from(globalSignalUpdates)
    .where(
      and(
        eq(globalSignalUpdates.signalId, signal.id),
        eq(globalSignalUpdates.actorType, "worker"),
        eq(globalSignalUpdates.updateType, "rediscovered"),
        sql`${globalSignalUpdates.newSafeState}->>'administratorNoIndiaFitSuperseded' = 'true'`,
      ),
    )
    .orderBy(
      desc(globalSignalUpdates.observedAt),
      desc(globalSignalUpdates.id),
    )
    .limit(1);
  const supersessionRevision = nestedSafeStateRevision(
    supersession?.newSafeState,
    "humanOwned",
  );
  return (
    supersessionRevision === null || decisionRevision > supersessionRevision
  );
}

function safeStateRevision(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const revision = (value as Record<string, unknown>).revision;
  return Number.isSafeInteger(revision) && (revision as number) >= 0
    ? (revision as number)
    : null;
}

function nestedSafeStateRevision(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return safeStateRevision((value as Record<string, unknown>)[key]);
}

function newEvidenceForPositiveIndiaRelevance(
  signal: PersistableRadarSignal,
  insertedEvidence: readonly StoredSignalEvidence[],
): readonly StoredSignalEvidence[] {
  const relevanceType = signal.indiaRelevance.relevanceType;
  if (
    relevanceType !== "explicit_India" &&
    relevanceType !== "existing_India_presence" &&
    relevanceType !== "India_expansion" &&
    relevanceType !== "globally_open"
  ) {
    return [];
  }
  const requiredPathPrefix = `indiaRelevance.${relevanceType}.`;
  return insertedEvidence.filter(
    (evidence) =>
      evidence.supportsIndiaRelevance &&
      !evidence.isSyndicated &&
      evidence.supportedFieldPaths.some((path) =>
        path.startsWith(requiredPathPrefix) &&
        evidenceClaimSupportsPositiveIndiaPath({
          supportedFieldPath: path,
          evidenceClaim: evidence.evidenceClaim,
        }),
      ),
  );
}

function boundedHistoryText(value: string | null, maximum = 160): string | null {
  if (value === null || value.length <= maximum) return value;
  return `${value.slice(0, maximum - 1)}…`;
}

function boundedHistoryArray(
  values: readonly string[] | null,
): readonly string[] | null {
  if (values === null) return null;
  const limited = values.slice(0, 3).map((value) =>
    boundedHistoryText(value, 80) ?? "",
  );
  return values.length <= 3
    ? limited
    : [...limited, `… ${values.length - 3} more`];
}

function automatedSignalHistoryState(
  signal: GlobalRadarSignal,
): Record<string, unknown> {
  const state = {
    title: boundedHistoryText(signal.title),
    factualSummary: boundedHistoryText(signal.factualSummary),
    interpretationSummary: boundedHistoryText(signal.interpretationSummary),
    geography: {
      sourceCountry: signal.sourceCountry,
      target: boundedHistoryArray(signal.targetGeographies),
      collection: boundedHistoryArray(signal.collectionGeographies),
      manufacturing: boundedHistoryArray(signal.manufacturingGeographies),
      delivery: boundedHistoryArray(signal.deliveryGeographies),
    },
    targeting: {
      industry: boundedHistoryText(signal.industry),
      targetModelOrSystem: boundedHistoryText(signal.targetModelOrSystem),
      targetCapabilityTags: boundedHistoryArray(signal.targetCapabilityTags),
      requiredCounterpartyArchetypes: boundedHistoryArray(
        signal.requiredCounterpartyArchetypes,
      ),
    },
    india: {
      relevanceType: signal.indiaRelevanceType,
      rationale: boundedHistoryText(signal.indiaRelevanceRationale),
      reasons: boundedHistoryArray(signal.indiaFitReasons),
      constraints: boundedHistoryArray(signal.indiaFitConstraints),
      unknowns: boundedHistoryArray(signal.indiaFitUnknowns),
      confidence: signal.indiaFitConfidence,
      regulatoryFactsFingerprint:
        signal.indiaRegulatoryFacts === null
          ? null
          : createGlobalRadarFingerprint(signal.indiaRegulatoryFacts),
      logisticsFactsFingerprint:
        signal.indiaLogisticsFacts === null
          ? null
          : createGlobalRadarFingerprint(signal.indiaLogisticsFacts),
    },
    scoring: {
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
      proximityToExternalDemand: signal.proximityToExternalDemand,
      fundingDeploymentMomentum: signal.fundingDeploymentMomentum,
      likelyDataHardwareIntensity: signal.likelyDataHardwareIntensity,
      estimatedTimeHorizon: signal.estimatedTimeHorizon,
      strategicRelevance: signal.strategicRelevance,
      directDemandScore: signal.directDemandScore,
      precursorScore: signal.precursorScore,
      momentumScore: signal.momentumScore,
      scoreCoverage: signal.scoreCoverage,
      scorePolicyVersion: signal.scorePolicyVersion,
      momentumPolicyVersion: signal.momentumPolicyVersion,
      momentumQualificationGatesPassed:
        signal.momentumQualificationGatesPassed,
    },
    activity: {
      announcedAt: signal.announcedAt?.toISOString() ?? null,
      effectiveFrom: signal.effectiveFrom?.toISOString() ?? null,
    },
    response: {
      type: signal.responsePathType,
      url: boundedHistoryText(signal.responsePathUrl),
      businessEmail: boundedHistoryText(signal.responseBusinessEmail),
      partnerApplicationUrl: boundedHistoryText(signal.partnerApplicationUrl),
    },
    source: {
      language: signal.sourceLanguage,
      extractionMethod: signal.extractionMethod,
      taxonomyVersion: signal.taxonomyVersion,
    },
    systems: {
      summary: boundedHistoryText(signal.systemsContextSummary),
      stackType: signal.systemsContextStackType,
      higherLevelSystemGoal: boundedHistoryText(signal.higherLevelSystemGoal),
      relevantStackLayer: boundedHistoryText(signal.relevantStackLayer),
      lowerLevelInputsRequired: boundedHistoryArray(
        signal.lowerLevelInputsRequired,
      ),
      transformationOrCapabilityAdded: boundedHistoryText(
        signal.transformationOrCapabilityAdded,
      ),
      downstreamModelOrRobotBehavior: boundedHistoryText(
        signal.downstreamModelOrRobotBehavior,
      ),
      whyTheRequirementMatters: boundedHistoryText(
        signal.whyTheRequirementMatters,
      ),
      possibleIndianExecutionRole: boundedHistoryText(
        signal.possibleIndianExecutionRole,
      ),
      factualElements: boundedHistoryArray(signal.factualElements),
      inferredElements: boundedHistoryArray(signal.inferredElements),
    },
    compliance: {
      faces: signal.faces,
      voices: signal.voices,
      biometrics: signal.biometrics,
      gaze: signal.gaze,
      health: signal.health,
      children: signal.children,
      homeInteriors: signal.homeInteriors,
      workplaceMonitoring: signal.workplaceMonitoring,
      preciseLocation: signal.preciseLocation,
      roadUsers: signal.roadUsers,
      employeeData: signal.employeeData,
      industrialSecrets: signal.industrialSecrets,
      defenceOrDualUse: signal.defenceOrDualUse,
      copyrightedMaterial: signal.copyrightedMaterial,
      exportControls: signal.exportControls,
      consent: signal.consent,
      deIdentification: signal.deIdentification,
      legalReview: signal.legalReview,
      knownResidencyRequirements: signal.knownResidencyRequirements,
      participantRightsComplexity: signal.participantRightsComplexity,
    },
    rawMetadataFingerprint: createGlobalRadarFingerprint(signal.rawMetadata),
  };
  return requireBoundedHistoryState(state);
}

function requireBoundedHistoryState<State extends Record<string, unknown>>(
  state: State,
): State {
  if (new TextEncoder().encode(JSON.stringify(state)).byteLength > 8_192) {
    throw new Error("Global Radar safe history state exceeded 8192 bytes.");
  }
  return state;
}

type StoredSignalEvidence = typeof globalSignalEvidence.$inferSelect;

function sameCanonicalStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const leftValues = [...new Set(left)].sort();
  const rightValues = [...new Set(right)].sort();
  return (
    leftValues.length === left.length &&
    rightValues.length === right.length &&
    leftValues.length === rightValues.length &&
    leftValues.every((value, index) => value === rightValues[index])
  );
}

function matchesCanonicalStoredEvidence(
  stored: StoredSignalEvidence,
  proposed: PersistableRadarSignal["evidence"][number],
  proposedGlobalEntityId: string | null,
  requireSameObservedAt: boolean,
): boolean {
  return (
    stored.globalEntityId === proposedGlobalEntityId &&
    stored.sourceUrl === proposed.sourceUrl &&
    stored.canonicalSourceUrl === proposed.canonicalSourceUrl &&
    stored.sourceName === proposed.sourceName &&
    stored.sourceType === proposed.sourceType &&
    stored.sourceLanguage === proposed.sourceLanguage &&
    stored.sourceCountry === proposed.sourceCountry &&
    stored.sourceFamily === proposed.sourceFamily &&
    stored.evidenceClaim === proposed.claim &&
    stored.sourceExcerpt === proposed.sourceExcerpt &&
    stored.englishSummary === proposed.englishSummary &&
    (stored.publishedAt?.toISOString() ?? null) === proposed.publishedAt &&
    (!requireSameObservedAt ||
      stored.observedAt.toISOString() === proposed.observedAt) &&
    stored.evidenceConfidence === proposed.evidenceConfidence &&
    stored.translationConfidence === proposed.translationConfidence &&
    stored.isPrimarySource === proposed.isPrimarySource &&
    stored.isSyndicated === proposed.isSyndicated &&
    stored.supportsDirectDemand === proposed.supportsDirectDemand &&
    stored.supportsIndiaRelevance === proposed.supportsIndiaRelevance &&
    sameCanonicalStringSet(
      stored.supportedFieldPaths,
      proposed.supportedFieldPaths,
    )
  );
}

function scoreComponentsFromSignalInsert(
  signalClass: PersistableRadarSignal["signalClass"],
  proposed: typeof globalRadarSignals.$inferInsert,
): Readonly<Record<string, unknown>> {
  if (signalClass === "direct_demand") {
    return {
      demandExplicitness: proposed.demandExplicitness,
      evidenceConfidence: proposed.evidenceConfidence,
      freshness: proposed.freshness,
      actionability: proposed.actionability,
      indiaFit: proposed.indiaFit,
      commercialPotential: proposed.commercialPotential,
      repeatability: proposed.repeatability,
      responseAccessibility: proposed.responseAccessibility,
      strategicLearning: proposed.strategicLearning,
      complianceComplexity: proposed.complianceComplexity,
    };
  }
  if (signalClass === "demand_precursor") {
    return {
      evidenceConfidence: proposed.evidenceConfidence,
      proximityToExternalDemand: proposed.proximityToExternalDemand,
      fundingDeploymentMomentum: proposed.fundingDeploymentMomentum,
      likelyDataHardwareIntensity: proposed.likelyDataHardwareIntensity,
      indiaFit: proposed.indiaFit,
      estimatedTimeHorizon: proposed.estimatedTimeHorizon,
      strategicRelevance: proposed.strategicRelevance,
    };
  }
  return {
    independentEntityCount: proposed.momentumIndependentEntityCount,
    primarySourceCount: proposed.momentumPrimarySourceCount,
    sourceFamilyCount: proposed.momentumSourceFamilyCount,
    volume7Days: proposed.momentumVolume7Days,
    volume30Days: proposed.momentumVolume30Days,
    volume90Days: proposed.momentumVolume90Days,
    independentEntityBreadth: proposed.momentumIndependentEntityBreadth,
    primarySourceDepth: proposed.momentumPrimarySourceDepth,
    sourceDiversity: proposed.momentumSourceDiversity,
    weightedVolume: proposed.momentumWeightedVolume,
    growthVsPreviousPeriod: proposed.momentumGrowthVsPreviousPeriod,
    taxonomyConsistency: proposed.momentumTaxonomyConsistency,
    evidenceQuality: proposed.momentumEvidenceQuality,
  };
}

function refreshCandidateEvidence(
  evidence: readonly StoredSignalEvidence[],
  entityById: ReadonlyMap<string, GlobalEntity>,
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

function directRefreshScoreValues(
  score: Extract<
    ReturnType<typeof deriveGlobalRadarReclassification>,
    { valid: true; signalClass: "direct_demand" }
  >["score"],
): Partial<typeof globalRadarSignals.$inferInsert> {
  return {
    demandExplicitness: score.components.explicitness,
    evidenceConfidence: score.components.evidenceConfidence,
    freshness: score.components.freshness,
    actionability: score.components.actionability,
    indiaFit: score.components.indiaFit,
    commercialPotential: score.components.commercialPotential,
    repeatability: score.components.repeatability,
    responseAccessibility: score.components.responseAccessibility,
    strategicLearning: score.components.strategicLearning,
    complianceComplexity: score.components.complianceComplexity,
    directDemandScore: score.score,
    scoreCoverage: score.scoreCoverage,
    scorePolicyVersion: score.scoreVersion,
  };
}

function precursorRefreshScoreValues(
  score: Extract<
    ReturnType<typeof deriveGlobalRadarReclassification>,
    { valid: true; signalClass: "demand_precursor" }
  >["score"],
): Partial<typeof globalRadarSignals.$inferInsert> {
  return {
    evidenceConfidence: score.components.evidenceConfidence,
    proximityToExternalDemand: score.components.proximityToExternalDemand,
    fundingDeploymentMomentum: score.components.fundingDeploymentMomentum,
    likelyDataHardwareIntensity: score.components.likelyDataHardwareIntensity,
    indiaFit: score.components.indiaFit,
    estimatedTimeHorizon: score.components.estimatedTimeHorizon,
    strategicRelevance: score.components.strategicRelevance,
    precursorScore: score.score,
    scoreCoverage: score.scoreCoverage,
    scorePolicyVersion: score.scoreVersion,
  };
}

function momentumRefreshScoreValues(
  score: Extract<ReturnType<typeof deriveEcosystemMomentum>, { valid: true }>,
): Partial<typeof globalRadarSignals.$inferInsert> {
  return {
    momentumIndependentEntityCount: score.counts.independentEntities,
    momentumPrimarySourceCount: score.counts.primarySources,
    momentumSourceFamilyCount: score.counts.sourceFamilies,
    momentumVolume7Days: score.windows.days7.recent,
    momentumVolume30Days: score.windows.days30.recent,
    momentumVolume90Days: score.windows.days90.recent,
    momentumIndependentEntityBreadth:
      score.components.independentEntityBreadth,
    momentumPrimarySourceDepth: score.components.primarySourceDepth,
    momentumSourceDiversity: score.components.sourceDiversity,
    momentumWeightedVolume: score.components.weightedVolume,
    momentumGrowthVsPreviousPeriod: score.components.growthVsPreceding,
    momentumTaxonomyConsistency: score.components.taxonomyConsistency,
    momentumEvidenceQuality: score.components.evidenceQuality,
    momentumScore: score.score,
    scoreCoverage: score.scoreCoverage,
    scorePolicyVersion: score.scoreVersion,
    momentumPolicyVersion: score.policyVersion,
    momentumQualificationGatesPassed: score.qualificationGatesPassed,
  };
}

function createCanonicalWorkerScoreEvidenceSnapshot(
  signal: PersistableRadarSignal,
  proposed: typeof globalRadarSignals.$inferInsert,
  evidence: readonly StoredSignalEvidence[],
  entityIds: ReadonlyMap<string, string>,
  requiredIndiaFitEvidenceFingerprints: ReadonlySet<string>,
  scoreInputDigest: string,
  resolvedMomentumContributorEntityIds?: readonly string[],
) {
  const momentumContributorEntityIds =
    signal.signalClass === "ecosystem_momentum"
      ? resolvedMomentumContributorEntityIds ??
        signal.associatedEntities.flatMap(({ entityRef, role }) => {
          if (role !== "contributor") return [];
          const entityId = entityIds.get(entityRef);
          if (!entityId) {
            throw new GlobalRadarPersistenceConflict("invalid_input");
          }
          return [entityId];
        })
      : undefined;
  const prioritizedEvidence = requiredIndiaFitEvidenceFingerprints.size
    ? [
        ...evidence.filter(({ evidenceFingerprint }) =>
          requiredIndiaFitEvidenceFingerprints.has(evidenceFingerprint),
        ),
        ...evidence.filter(
          ({ evidenceFingerprint }) =>
            !requiredIndiaFitEvidenceFingerprints.has(evidenceFingerprint),
        ),
      ]
    : evidence;
  const snapshot = createStoredScoreEvidenceSnapshot({
    scoreInputDigest,
    scoreAsOf: new Date(signal.scoreAsOf),
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
    momentumContributorEntityIds,
    announcedAt: signal.announcedAt ? new Date(signal.announcedAt) : null,
    effectiveFrom: signal.effectiveFrom
      ? new Date(signal.effectiveFrom)
      : null,
    components: scoreComponentsFromSignalInsert(signal.signalClass, proposed),
    evidence: prioritizedEvidence,
  });
  if (requiredIndiaFitEvidenceFingerprints.size > 0) {
    const indiaFitEvidence = snapshot.componentEvidence
      .find(({ component }) => component === "indiaFit")
      ?.evidence.some(({ evidenceFingerprint }) =>
        requiredIndiaFitEvidenceFingerprints.has(evidenceFingerprint),
      );
    if (!indiaFitEvidence) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
  }
  return snapshot;
}

async function createFullPrefixWorkerRefreshValues(
  transaction: GlobalRadarTransaction,
  input: Readonly<{
    existing: GlobalRadarSignal;
    signal: PersistableRadarSignal;
    proposed: typeof globalRadarSignals.$inferInsert;
    entityIds: ReadonlyMap<string, string>;
    requiredIndiaFitEvidenceFingerprints: ReadonlySet<string>;
    scoreInputStatus: GlobalRadarSignal["status"];
  }>,
): Promise<typeof globalRadarSignals.$inferInsert> {
  const evidence = await transaction
    .select()
    .from(globalSignalEvidence)
    .where(eq(globalSignalEvidence.signalId, input.existing.id))
    .orderBy(asc(globalSignalEvidence.ingestOrdinal))
    .limit(MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS + 1);
  if (
    evidence.length === 0 ||
    evidence.length > MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS
  ) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
  const associations = await transaction
    .select({
      globalEntityId: globalRadarSignalEntities.globalEntityId,
      role: globalRadarSignalEntities.role,
    })
    .from(globalRadarSignalEntities)
    .where(eq(globalRadarSignalEntities.signalId, input.existing.id));
  const referencedEntityIds = [
    ...new Set([
      ...(typeof input.proposed.globalEntityId === "string"
        ? [input.proposed.globalEntityId]
        : input.existing.globalEntityId === null
          ? []
          : [input.existing.globalEntityId]),
      ...evidence.flatMap(({ globalEntityId }) =>
        globalEntityId === null ? [] : [globalEntityId],
      ),
      ...associations.map(({ globalEntityId }) => globalEntityId),
    ]),
  ];
  const entities = referencedEntityIds.length
    ? await transaction
        .select()
        .from(globalEntities)
        .where(inArray(globalEntities.id, referencedEntityIds))
        .for("key share")
    : [];
  if (entities.length !== referencedEntityIds.length) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  const scoreAsOf = new Date(input.signal.scoreAsOf);
  let scoreValues: Partial<typeof globalRadarSignals.$inferInsert>;
  let momentumContributorEntityIds: readonly string[] | undefined;

  if (input.signal.signalClass === "direct_demand") {
    const derived = deriveGlobalRadarReclassification({
      signalClass: "direct_demand",
      signalType: input.signal.signalType,
      currentStatus: input.existing.status,
      indiaRelevanceType: input.signal.indiaRelevance.relevanceType,
      announcedAt: input.signal.announcedAt,
      effectiveFrom: input.signal.effectiveFrom,
      observedAt: input.signal.observedAt,
      expiresAt: input.signal.expiresAt,
      responsePath: input.signal.responsePath,
      sensitiveDataAndCompliance: input.signal.sensitiveDataAndCompliance,
      assessments: {
        actionability: input.signal.actionabilityInput,
        commercialPotential:
          input.signal.score.components.commercialPotential,
        repeatability: input.signal.score.components.repeatability,
        strategicLearning: input.signal.score.components.strategicLearning,
        complianceComplexity:
          input.signal.score.components.complianceComplexity,
      },
      evidence: refreshCandidateEvidence(evidence, entityById),
      now: scoreAsOf,
    });
    if (!derived.valid || derived.signalClass !== "direct_demand") {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    scoreValues = directRefreshScoreValues(derived.score);
  } else if (input.signal.signalClass === "demand_precursor") {
    const derived = deriveGlobalRadarReclassification({
      signalClass: "demand_precursor",
      signalType: input.signal.signalType,
      currentStatus: input.existing.status,
      indiaRelevanceType: input.signal.indiaRelevance.relevanceType,
      announcedAt: input.signal.announcedAt,
      effectiveFrom: input.signal.effectiveFrom,
      observedAt: input.signal.observedAt,
      responsePath: input.signal.responsePath,
      sensitiveDataAndCompliance: input.signal.sensitiveDataAndCompliance,
      assessments: {
        proximityToExternalDemand:
          input.signal.score.components.proximityToExternalDemand,
        fundingDeploymentMomentum:
          input.signal.score.components.fundingDeploymentMomentum,
        likelyDataHardwareIntensity:
          input.signal.score.components.likelyDataHardwareIntensity,
        strategicRelevance: input.signal.score.components.strategicRelevance,
      },
      evidence: refreshCandidateEvidence(evidence, entityById),
      now: scoreAsOf,
    });
    if (!derived.valid || derived.signalClass !== "demand_precursor") {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    scoreValues = precursorRefreshScoreValues(derived.score);
  } else {
    momentumContributorEntityIds = [
      ...new Set(
        associations.flatMap(({ globalEntityId, role }) =>
          role === "contributor" ? [globalEntityId] : [],
        ),
      ),
    ];
    const contributors = new Set(momentumContributorEntityIds);
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
        taxonomy: input.signal.demandDomain,
        taxonomyConsistency:
          input.signal.score.components.taxonomyConsistency,
        evidenceQuality: input.signal.score.components.evidenceQuality,
        observations,
      },
      createGlobalRadarMomentumPolicy(input.signal.demandDomain),
      { now: () => new Date(scoreAsOf.getTime()) },
    );
    if (!derived.valid) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    scoreValues = momentumRefreshScoreValues(derived);
  }

  const proposed = { ...input.proposed, ...scoreValues };
  const scoreInputSignal = {
    ...input.existing,
    ...proposed,
    status: input.scoreInputStatus,
    announcedAt: input.signal.announcedAt
      ? new Date(input.signal.announcedAt)
      : null,
    effectiveFrom: input.signal.effectiveFrom
      ? new Date(input.signal.effectiveFrom)
      : null,
    observedAt: new Date(input.signal.observedAt),
    expiresAt: input.existing.expiresAt,
    scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
    momentumPolicyVersion:
      input.signal.signalClass === "ecosystem_momentum"
        ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
        : null,
  } as GlobalRadarSignal;
  const scoreInputDigest = createStoredGlobalRadarScoreInputDigest({
    scoreAsOf,
    signal: scoreInputSignal,
    actionabilityInput:
      input.signal.signalClass === "direct_demand"
        ? input.signal.actionabilityInput
        : null,
    associations,
    entities,
  });
  return {
    ...proposed,
    scoreEvidenceSnapshot: createCanonicalWorkerScoreEvidenceSnapshot(
      input.signal,
      proposed,
      evidence,
      input.entityIds,
      input.requiredIndiaFitEvidenceFingerprints,
      scoreInputDigest,
      momentumContributorEntityIds,
    ),
  };
}

async function rebindPreservedAdministratorScoreEvidenceSnapshot(
  transaction: GlobalRadarTransaction,
  input: Readonly<{
    existing: GlobalRadarSignal;
    observedAt: Date;
  }>,
) {
  const currentComponents = storedScoreComponents(input.existing);
  const snapshot = parseActiveScoreEvidenceSnapshot(
    input.existing.scoreEvidenceSnapshot,
    {
      signalClass: input.existing.signalClass,
      signalType: input.existing.signalType,
      indiaRelevanceType: input.existing.indiaRelevanceType,
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion:
        input.existing.signalClass === "ecosystem_momentum"
          ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
          : null,
      components: currentComponents,
    },
  );
  if (
    !snapshot ||
    snapshot.evidenceBoundaryOrdinal >
      MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS ||
    snapshot.evidenceSetCount > MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS
  ) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }

  const evaluationEvidence = await transaction
    .select()
    .from(globalSignalEvidence)
    .where(
      and(
        eq(globalSignalEvidence.signalId, input.existing.id),
        lte(
          globalSignalEvidence.ingestOrdinal,
          snapshot.evidenceBoundaryOrdinal,
        ),
      ),
    )
    .orderBy(asc(globalSignalEvidence.ingestOrdinal))
    .limit(MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS + 1);
  let evaluation;
  try {
    evaluation = createActiveScoreEvaluationMetadata({
      scoreAsOf: new Date(snapshot.scoreAsOf),
      evidence: evaluationEvidence,
    });
  } catch {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
  if (
    evaluationEvidence.length > MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS ||
    evaluation.scoreAsOf !== snapshot.scoreAsOf ||
    evaluation.evidenceBoundaryOrdinal !== snapshot.evidenceBoundaryOrdinal ||
    evaluation.evidenceSetCount !== snapshot.evidenceSetCount ||
    evaluation.evidenceSetDigest !== snapshot.evidenceSetDigest
  ) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }

  const associations = await transaction
    .select({
      globalEntityId: globalRadarSignalEntities.globalEntityId,
      role: globalRadarSignalEntities.role,
    })
    .from(globalRadarSignalEntities)
    .where(eq(globalRadarSignalEntities.signalId, input.existing.id));
  const referencedEntityIds = [
    ...new Set([
      ...(input.existing.globalEntityId === null
        ? []
        : [input.existing.globalEntityId]),
      ...associations.map(({ globalEntityId }) => globalEntityId),
      ...evaluationEvidence.flatMap(({ globalEntityId }) =>
        globalEntityId === null ? [] : [globalEntityId],
      ),
    ]),
  ];
  const entities = referencedEntityIds.length
    ? await transaction
        .select({
          id: globalEntities.id,
          canonicalCorporateGroupId:
            globalEntities.canonicalCorporateGroupId,
        })
        .from(globalEntities)
        .where(inArray(globalEntities.id, referencedEntityIds))
        .for("key share")
    : [];
  if (entities.length !== referencedEntityIds.length) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }

  const actionabilityInput =
    input.existing.signalClass === "direct_demand"
      ? (snapshot.componentEvidence.find(
          ({ component }) => component === "actionability",
        )?.inputValue ?? null)
      : null;
  const momentumContributorEntityIds =
    input.existing.signalClass === "ecosystem_momentum"
      ? [
          ...new Set(
            associations.flatMap(({ globalEntityId, role }) =>
              role === "contributor" ? [globalEntityId] : [],
            ),
          ),
        ]
      : undefined;
  let scoreInputDigest: string;
  try {
    scoreInputDigest = createStoredGlobalRadarScoreInputDigest({
      scoreAsOf: new Date(snapshot.scoreAsOf),
      signal: { ...input.existing, observedAt: input.observedAt },
      actionabilityInput,
      associations,
      entities,
    });
  } catch {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }

  try {
    return rebaseStoredScoreEvidenceSnapshot({
      scoreInputDigest,
      scoreAsOf: new Date(snapshot.scoreAsOf),
      existingSnapshot: input.existing.scoreEvidenceSnapshot,
      signalClass: input.existing.signalClass,
      signalType: input.existing.signalType,
      currentIndiaRelevanceType: input.existing.indiaRelevanceType,
      nextIndiaRelevanceType: input.existing.indiaRelevanceType,
      scorePolicyVersion: GLOBAL_RADAR_SCORE_VERSION,
      momentumPolicyVersion:
        input.existing.signalClass === "ecosystem_momentum"
          ? GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
          : null,
      currentComponents,
      nextComponents: currentComponents,
      replacementComponents: [],
      momentumContributorEntityIds,
      announcedAt: input.existing.announcedAt,
      effectiveFrom: input.existing.effectiveFrom,
      existingEvidence: evaluationEvidence,
      evidence: evaluationEvidence,
      evaluationEvidence,
    });
  } catch {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
}

async function persistSignalGraph(
  transaction: GlobalRadarTransaction,
  signalId: string,
  signal: PersistableRadarSignal,
  runId: string,
  entityIds: ReadonlyMap<string, string>,
): Promise<{
  evidenceIds: string[];
  insertedEvidence: readonly StoredSignalEvidence[];
  storedEvidence: readonly StoredSignalEvidence[];
  insertedAssociations: number;
  insertedRequirements: number;
}> {
  const [lockedSignal] = await transaction
    .select({ id: globalRadarSignals.id })
    .from(globalRadarSignals)
    .where(eq(globalRadarSignals.id, signalId))
    .limit(1)
    .for("update");
  if (!lockedSignal) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
  const proposedFingerprints = signal.evidence.map(
    ({ evidenceFingerprint }) => evidenceFingerprint,
  );
  const [maximumOrdinal, existingOrdinalRows] = await Promise.all([
    transaction
      .select({ value: max(globalSignalEvidence.ingestOrdinal) })
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, signalId)),
    proposedFingerprints.length === 0
      ? []
      : transaction
          .select({
            evidenceFingerprint: globalSignalEvidence.evidenceFingerprint,
            ingestOrdinal: globalSignalEvidence.ingestOrdinal,
          })
          .from(globalSignalEvidence)
          .where(
            and(
              eq(globalSignalEvidence.signalId, signalId),
              inArray(
                globalSignalEvidence.evidenceFingerprint,
                proposedFingerprints,
              ),
            ),
          ),
  ]);
  const ordinalByFingerprint = new Map(
    existingOrdinalRows.map((item) => [
      item.evidenceFingerprint,
      item.ingestOrdinal,
    ]),
  );
  let nextIngestOrdinal = (maximumOrdinal[0]?.value ?? 0) + 1;
  for (const fingerprint of [...proposedFingerprints].sort()) {
    if (!ordinalByFingerprint.has(fingerprint)) {
      ordinalByFingerprint.set(fingerprint, nextIngestOrdinal);
      nextIngestOrdinal += 1;
    }
  }
  let insertedAssociations = 0;
  for (const association of signal.associatedEntities) {
    const globalEntityId = entityIds.get(association.entityRef);
    if (!globalEntityId) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    const [inserted] = await transaction
      .insert(globalRadarSignalEntities)
      .values({
        signalId,
        globalEntityId,
        role: association.role,
        confidence: association.confidence,
        createdAt: new Date(signal.observedAt),
      })
      .onConflictDoNothing()
      .returning({ id: globalRadarSignalEntities.id });
    if (inserted) insertedAssociations += 1;
  }

  let insertedRequirements = 0;
  for (const requirement of signal.requirements) {
    const [inserted] = await transaction
      .insert(globalSignalRequirements)
      .values({
        signalId,
        kind: requirement.kind,
        capabilityTag: requirement.capabilityTag,
        summary: requirement.summary,
        dataFamilies: requirement.dataFamilies,
        sensorModalities: requirement.sensorModalities,
        environments: requirement.environments,
        taskFamilies: requirement.taskFamilies,
        collectionMethods: requirement.collectionMethods,
        humanRoles: requirement.humanRoles,
        robotEmbodiments: requirement.robotEmbodiments,
        indianExecutionArchetypes: requirement.indianExecutionArchetypes,
        scaleSpecification: requirement.scaleSpecifications,
        technicalSpecification: requirement.technicalSpecifications,
        qualitySpecification: requirement.qualitySpecifications,
        rightsAndComplianceSpecification:
          requirement.rightsAndComplianceSpecifications,
        confidence: requirement.confidence,
        requirementFingerprint: requirement.fingerprint,
        createdAt: new Date(signal.observedAt),
        updatedAt: new Date(signal.observedAt),
      })
      .onConflictDoNothing()
      .returning({ id: globalSignalRequirements.id });
    if (inserted) insertedRequirements += 1;
  }

  const insertedEvidence: StoredSignalEvidence[] = [];
  for (const evidence of signal.evidence) {
    const globalEntityId =
      evidence.contributorEntityRef === null
        ? null
        : (entityIds.get(evidence.contributorEntityRef) ?? null);
    if (evidence.contributorEntityRef !== null && globalEntityId === null) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    const [inserted] = await transaction
      .insert(globalSignalEvidence)
      .values({
        signalId,
        ingestOrdinal: ordinalByFingerprint.get(evidence.evidenceFingerprint)!,
        runId,
        globalEntityId,
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
        publishedAt: evidence.publishedAt
          ? new Date(evidence.publishedAt)
          : null,
        observedAt: new Date(evidence.observedAt),
        evidenceConfidence: evidence.evidenceConfidence,
        translationConfidence: evidence.translationConfidence,
        isPrimarySource: evidence.isPrimarySource,
        isSyndicated: evidence.isSyndicated,
        supportsDirectDemand: evidence.supportsDirectDemand,
        supportsIndiaRelevance: evidence.supportsIndiaRelevance,
        rawMetadata: evidence.rawMetadata,
        evidenceFingerprint: evidence.evidenceFingerprint,
        supportedFieldPaths: evidence.supportedFieldPaths,
        createdAt: new Date(evidence.observedAt),
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) insertedEvidence.push(inserted);
  }
  const fingerprints = [
    ...new Set(signal.evidence.map(({ evidenceFingerprint }) => evidenceFingerprint)),
  ];
  if (fingerprints.length !== signal.evidence.length) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
  const storedRows =
    fingerprints.length === 0
      ? []
      : await transaction
          .select()
          .from(globalSignalEvidence)
          .where(
            and(
              eq(globalSignalEvidence.signalId, signalId),
              inArray(globalSignalEvidence.evidenceFingerprint, fingerprints),
            ),
          );
  const storedByFingerprint = new Map(
    storedRows.map((item) => [item.evidenceFingerprint, item]),
  );
  if (
    storedRows.length !== storedByFingerprint.size ||
    storedByFingerprint.size !== fingerprints.length
  ) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
  const requireSameObservedAt =
    signal.signalClass === "ecosystem_momentum" ||
    (signal.signalClass === "direct_demand" &&
      signal.announcedAt === null &&
      signal.effectiveFrom === null &&
      !signal.evidence.some(({ publishedAt }) => publishedAt !== null));
  const storedEvidence = signal.evidence.map((evidence) => {
    const stored = storedByFingerprint.get(evidence.evidenceFingerprint);
    const globalEntityId =
      evidence.contributorEntityRef === null
        ? null
        : (entityIds.get(evidence.contributorEntityRef) ?? null);
    if (
      !stored ||
      (evidence.contributorEntityRef !== null && globalEntityId === null) ||
      !matchesCanonicalStoredEvidence(
        stored,
        evidence,
        globalEntityId,
        requireSameObservedAt,
      )
    ) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    return stored;
  });
  return {
    evidenceIds: insertedEvidence.map(({ id }) => id),
    insertedEvidence,
    storedEvidence,
    insertedAssociations,
    insertedRequirements,
  };
}

async function appendWorkerUpdate(
  transaction: GlobalRadarTransaction,
  input: {
    signalId: string;
    runId: string;
    observedAt: Date;
    updateType: "created" | "rediscovered" | "evidence_appended";
    previousSafeState: Record<string, unknown> | null;
    newSafeState: Record<string, unknown>;
    evidenceId: string | null;
  },
) {
  await transaction
    .insert(globalSignalUpdates)
    .values({
      signalId: input.signalId,
      updateType: input.updateType,
      previousSafeState: input.previousSafeState,
      newSafeState: input.newSafeState,
      evidenceId: input.evidenceId,
      actorType: "worker",
      actorId: `global-radar:${input.runId}`,
      reason:
        input.updateType === "created"
          ? "Created from validated Global Radar evidence."
          : input.updateType === "evidence_appended"
            ? "Appended validated Global Radar evidence."
            : "Rediscovered from validated Global Radar evidence.",
      observedAt: input.observedAt,
      idempotencyKey: `run:${input.runId}:signal:${input.signalId}:${input.updateType}:${input.evidenceId ?? "none"}`,
      createdAt: input.observedAt,
    })
    .onConflictDoNothing();
}

async function resolveCurrentSignalByDedupeIdentity(
  transaction: GlobalRadarTransaction,
  input: {
    dedupeVersion: string;
    dedupeKey: string;
    signalClass: GlobalRadarSignal["signalClass"];
  },
): Promise<GlobalRadarSignal | null> {
  await transaction.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${createGlobalRadarDedupeLockKey(input.dedupeKey)}, 0))`,
  );
  const matches = await transaction
    .select()
    .from(globalRadarSignals)
    .where(
      and(
        eq(globalRadarSignals.dedupeVersion, input.dedupeVersion),
        eq(globalRadarSignals.dedupeKey, input.dedupeKey),
      ),
    )
    .orderBy(asc(globalRadarSignals.id));
  if (matches.length === 0) return null;

  const observedRows = new Map(matches.map((row) => [row.id, row]));
  const loadObservedRow = async (id: string): Promise<GlobalRadarSignal> => {
    const cached = observedRows.get(id);
    if (cached) return cached;
    const [row] = await transaction
      .select()
      .from(globalRadarSignals)
      .where(eq(globalRadarSignals.id, id))
      .limit(1);
    if (!row) throw new GlobalRadarPersistenceConflict("invalid_input");
    observedRows.set(row.id, row);
    return row;
  };
  for (const match of matches) {
    const path = new Set<string>();
    let current = match;
    for (let hops = 0; ; hops += 1) {
      if (path.has(current.id)) {
        throw new GlobalRadarPersistenceConflict("invalid_input");
      }
      path.add(current.id);
      if (current.mergedIntoSignalId === null) break;
      if (hops === MAX_GLOBAL_RADAR_MERGE_CHAIN_HOPS) {
        throw new GlobalRadarPersistenceConflict("invalid_input");
      }
      current = await loadObservedRow(current.mergedIntoSignalId);
    }
  }

  const lockedRows = await transaction
    .select()
    .from(globalRadarSignals)
    .where(inArray(globalRadarSignals.id, [...observedRows.keys()]))
    .orderBy(asc(globalRadarSignals.id))
    .for("update");
  if (lockedRows.length !== observedRows.size) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
  const lockedById = new Map(lockedRows.map((row) => [row.id, row]));
  const roots = new Map<string, GlobalRadarSignal>();
  for (const match of matches) {
    const lockedMatch = lockedById.get(match.id);
    if (
      !lockedMatch ||
      lockedMatch.dedupeVersion !== input.dedupeVersion ||
      lockedMatch.dedupeKey !== input.dedupeKey
    ) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    const path = new Set<string>();
    let current = lockedMatch;
    for (let hops = 0; ; hops += 1) {
      if (path.has(current.id) || current.signalClass !== input.signalClass) {
        throw new GlobalRadarPersistenceConflict("invalid_input");
      }
      path.add(current.id);
      if (current.mergedIntoSignalId === null) {
        roots.set(current.id, current);
        break;
      }
      if (hops === MAX_GLOBAL_RADAR_MERGE_CHAIN_HOPS) {
        throw new GlobalRadarPersistenceConflict("invalid_input");
      }
      const next = lockedById.get(current.mergedIntoSignalId);
      if (!next) throw new GlobalRadarPersistenceConflict("invalid_input");
      current = next;
    }
  }
  if (roots.size !== 1) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
  return roots.values().next().value ?? null;
}

async function persistSignals(
  transaction: GlobalRadarTransaction,
  batch: CanonicalPersistableGlobalRadarBatch,
  entityIds: ReadonlyMap<string, string>,
  entityAnchors: ReadonlyMap<string, string>,
  resolvedEntitiesByRef: ReadonlyMap<string, GlobalEntity>,
): Promise<{ numberNew: number; numberUpdated: number; numberDuplicates: number }> {
  let numberNew = 0;
  let numberUpdated = 0;
  let numberDuplicates = 0;
  for (const signal of batch.signals) {
    const resolvedDedupeKey = createGlobalRadarSignalDedupeKeyFromIdentityAnchors(
      signal,
      entityAnchors,
    );
    const proposed = signalInsertValues(
      signal,
      batch.runId,
      entityIds,
      new Map(
        [...resolvedEntitiesByRef].map(([entityRef, entity]) => [
          entityRef,
          entity.canonicalCorporateGroupId,
        ]),
      ),
      resolvedDedupeKey,
    );
    const existing = await resolveCurrentSignalByDedupeIdentity(transaction, {
      dedupeVersion: GLOBAL_RADAR_DEDUPE_VERSION,
      dedupeKey: resolvedDedupeKey,
      signalClass: signal.signalClass,
    });
    if (existing) {
      const observedAt = new Date(signal.observedAt);
      const graph = await persistSignalGraph(
        transaction,
        existing.id,
        signal,
        batch.runId,
        entityIds,
      );
      const graphChanged =
        graph.evidenceIds.length > 0 ||
        graph.insertedAssociations > 0 ||
        graph.insertedRequirements > 0;
      const isNewer = observedAt.getTime() > existing.lastSeenAt.getTime();
      if (isNewer || graphChanged) {
        const latestObservedAt = isNewer ? observedAt : existing.lastSeenAt;
        const hasAdministratorNoIndiaFit =
          isNewer &&
          (await hasAdministratorNoIndiaFitDecision(transaction, existing));
        const supersedingIndiaEvidence = hasAdministratorNoIndiaFit
          ? newEvidenceForPositiveIndiaRelevance(
              signal,
              graph.insertedEvidence,
            )
          : [];
        const supersedeAdministratorNoIndiaFit =
          supersedingIndiaEvidence.length > 0;
        const supersedingIndiaEvidenceFingerprints = new Set(
          supersedingIndiaEvidence.map(
            ({ evidenceFingerprint }) => evidenceFingerprint,
          ),
        );
        const preserveAdministratorNoIndiaFit =
          hasAdministratorNoIndiaFit &&
          !supersedeAdministratorNoIndiaFit;
        const refreshValues = isNewer
          ? preserveAdministratorNoIndiaFit
            ? {
                ...proposed,
                scoreEvidenceSnapshot:
                  await rebindPreservedAdministratorScoreEvidenceSnapshot(
                    transaction,
                    { existing, observedAt: latestObservedAt },
                  ),
              }
            : await createFullPrefixWorkerRefreshValues(transaction, {
                existing,
                signal,
                proposed,
                entityIds,
                requiredIndiaFitEvidenceFingerprints:
                  supersedingIndiaEvidenceFingerprints,
                scoreInputStatus: supersedeAdministratorNoIndiaFit
                  ? existing.status === "promoted"
                    ? "promoted"
                    : "needs_review"
                  : existing.status,
              })
          : proposed;
        const reobservation =
          existing.signalClass === "direct_demand" &&
          signal.signalClass === "direct_demand" &&
          existing.evergreen !== null
            ? resolveRediscoveredReobserveBy({
                currentEvergreen: existing.evergreen,
                currentReobserveBy:
                  existing.reobserveBy?.toISOString() ?? null,
                proposedEvergreen: signal.evergreen,
                proposedReobserveBy: signal.reobserveBy,
                proposedObservedAt: signal.observedAt,
                isNewerObservation: isNewer,
              })
            : Object.freeze({
                valid: true as const,
                reobserveBy: null,
                advanced: false,
              });
        if (!reobservation.valid) {
          throw new GlobalRadarPersistenceConflict("invalid_input");
        }
        const [updated] = await transaction
          .update(globalRadarSignals)
          .set({
            ...(isNewer
              ? automatedSignalRefreshValues(
                  refreshValues,
                  preserveAdministratorNoIndiaFit,
                )
              : {}),
            ...(supersedeAdministratorNoIndiaFit
              ? {
                  status:
                    existing.status === "promoted"
                      ? "promoted"
                      : "needs_review",
                  revision: existing.revision + 1,
                }
              : {}),
            reobserveBy:
              reobservation.reobserveBy === null
                ? null
                : new Date(reobservation.reobserveBy),
            mostRecentRunId: batch.runId,
            lastSeenAt: latestObservedAt,
            observedAt: latestObservedAt,
            updatedAt: latestObservedAt,
          })
          .where(eq(globalRadarSignals.id, existing.id))
          .returning();
        if (!updated) throw new Error("Global Radar signal was not rediscovered.");
        await appendWorkerUpdate(transaction, {
          signalId: existing.id,
          runId: batch.runId,
          observedAt,
          updateType: "rediscovered",
          previousSafeState: requireBoundedHistoryState({
            humanOwned: {
              status: existing.status,
              signalClass: existing.signalClass,
              demandDomain: existing.demandDomain,
              signalType: existing.signalType,
              theme: existing.theme,
              expiresAt: existing.expiresAt?.toISOString() ?? null,
              revision: existing.revision,
              dedupeKey: existing.dedupeKey,
              firstRunId: existing.firstRunId,
            },
            mostRecentRunId: existing.mostRecentRunId,
            lastSeenAt: existing.lastSeenAt.toISOString(),
            reobserveBy: existing.reobserveBy?.toISOString() ?? null,
            automated: automatedSignalHistoryState(existing),
          }),
          newSafeState: requireBoundedHistoryState({
            humanOwned: {
              status: updated.status,
              signalClass: updated.signalClass,
              demandDomain: updated.demandDomain,
              signalType: updated.signalType,
              theme: updated.theme,
              expiresAt: updated.expiresAt?.toISOString() ?? null,
              revision: updated.revision,
              dedupeKey: updated.dedupeKey,
              firstRunId: updated.firstRunId,
            },
            proposedHumanOwned: {
              initialStatus: signal.initialStatus,
              expiresAt: signal.expiresAt,
            },
            mostRecentRunId: batch.runId,
            lastSeenAt: latestObservedAt.toISOString(),
            evidenceAppended: graph.evidenceIds.length,
            automatedRefreshed: isNewer,
            administratorNoIndiaFitPreserved:
              preserveAdministratorNoIndiaFit,
            administratorNoIndiaFitSuperseded:
              supersedeAdministratorNoIndiaFit,
            automated: automatedSignalHistoryState(updated),
            proposedReobserveBy: signal.reobserveBy,
            appliedReobserveBy: reobservation.reobserveBy,
            reobserveByAdvanced: reobservation.advanced,
          }),
          evidenceId: graph.evidenceIds[0] ?? null,
        });
        for (const evidenceId of graph.evidenceIds) {
          await appendWorkerUpdate(transaction, {
            signalId: existing.id,
            runId: batch.runId,
            observedAt,
            updateType: "evidence_appended",
            previousSafeState: null,
            newSafeState: { evidenceId, runId: batch.runId },
            evidenceId,
          });
        }
        numberUpdated += 1;
      } else {
        numberDuplicates += 1;
      }
      continue;
    }
    const [created] = await transaction
      .insert(globalRadarSignals)
      .values(proposed)
      .returning();
    if (!created) throw new Error("Global Radar signal was not created.");
    const graph = await persistSignalGraph(
      transaction,
      created.id,
      signal,
      batch.runId,
      entityIds,
    );
    await appendWorkerUpdate(transaction, {
      signalId: created.id,
      runId: batch.runId,
      observedAt: new Date(signal.observedAt),
      updateType: "created",
      previousSafeState: null,
      newSafeState: {
        status: created.status,
        signalClass: created.signalClass,
        expiresAt: created.expiresAt?.toISOString() ?? null,
        firstRunId: batch.runId,
      },
      evidenceId: graph.evidenceIds[0] ?? null,
    });
    numberNew += 1;
  }
  return { numberNew, numberUpdated, numberDuplicates };
}

function validateResolvedMomentumSignals(
  batch: CanonicalPersistableGlobalRadarBatch,
  resolvedEntitiesByRef: ReadonlyMap<string, GlobalEntity>,
): void {
  for (const signal of batch.signals) {
    if (signal.signalClass !== "ecosystem_momentum") continue;
    const contributorRefs = new Set(
      signal.associatedEntities
        .filter(({ role }) => role === "contributor")
        .map(({ entityRef }) => entityRef),
    );
    if (
      signal.evidence.some(
        ({ contributorEntityRef }) =>
          contributorEntityRef === null ||
          !contributorRefs.has(contributorEntityRef),
      )
    ) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    const observations = signal.evidence.flatMap((evidence) => {
      if (evidence.isSyndicated || evidence.contributorEntityRef === null) {
        return [];
      }
      const entity = resolvedEntitiesByRef.get(evidence.contributorEntityRef);
      if (!entity) {
        throw new GlobalRadarPersistenceConflict("invalid_input");
      }
      return [
        {
          evidenceId: evidence.evidenceFingerprint,
          entityId: entity.id,
          corporateGroupId:
            entity.canonicalCorporateGroupId ?? `group:${entity.id}`,
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
        taxonomyConsistency: signal.score.components.taxonomyConsistency,
        evidenceQuality: signal.score.components.evidenceQuality,
        observations,
      },
      createGlobalRadarMomentumPolicy(signal.demandDomain),
      { now: () => new Date(signal.observedAt) },
    );
    if (
      !derived.valid ||
      !derived.qualificationGatesPassed ||
      JSON.stringify(derived) !== JSON.stringify(signal.score)
    ) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
  }
}

export async function persistGlobalRadarBatch(
  transaction: GlobalRadarTransaction,
  batch: CanonicalPersistableGlobalRadarBatch,
): Promise<PersistGlobalRadarBatchResult> {
  await lockBatchEntityIdentities(transaction, batch.entities);
  for (const query of batch.executedQueries) {
    await transaction
      .insert(globalRadarSearchQueries)
      .values({
        runId: batch.runId,
        queryText: query.query,
        fingerprint: query.fingerprint,
        language: query.language,
        sourceCountry: query.sourceCountry,
        theme: query.theme,
        signalClassIntent: query.signalIntent,
        sourceAdapter: query.sourceAdapter,
        recencyDays: query.recencyDays,
        ordinal: query.ordinal,
        status: query.error === null ? "succeeded" : "failed",
        executedAt: new Date(query.executedAt),
        resultsExamined: query.resultsExamined,
        errorSummary: query.error,
        createdAt: new Date(query.executedAt),
      })
      .onConflictDoNothing();
  }
  const entityIds = new Map<string, string>();
  const entityAnchors = new Map<string, string>();
  const resolvedEntitiesByRef = new Map<string, GlobalEntity>();
  for (const entity of batch.entities) {
    const resolved = await resolveEntity(transaction, batch, entity);
    entityIds.set(entity.entityRef, resolved.id);
    entityAnchors.set(entity.entityRef, resolved.publicIdentityAnchor);
    for (const [resolvedRef, currentOwner] of resolvedEntitiesByRef) {
      if (currentOwner.id === resolved.id) {
        resolvedEntitiesByRef.set(resolvedRef, resolved);
      }
    }
    resolvedEntitiesByRef.set(entity.entityRef, resolved);
  }
  validateResolvedMomentumSignals(batch, resolvedEntitiesByRef);
  const signalCounts = await persistSignals(
    transaction,
    batch,
    entityIds,
    entityAnchors,
    resolvedEntitiesByRef,
  );
  const rejections = Object.freeze({ ...batch.rejections });
  const numberRejectedForWeakEvidence = Object.values(rejections).reduce(
    (total, count) => total + count,
    0,
  );
  return {
    counters: {
      numberResultsExamined: batch.executedQueries.reduce(
        (total, query) => total + query.resultsExamined,
        0,
      ),
      numberEntitiesObserved: new Set(entityIds.values()).size,
      numberSignalsFound: batch.signals.length,
      numberDirectDemands: batch.signals.filter(
        ({ signalClass }) => signalClass === "direct_demand",
      ).length,
      numberPrecursors: batch.signals.filter(
        ({ signalClass }) => signalClass === "demand_precursor",
      ).length,
      numberMomentumRecords: batch.signals.filter(
        ({ signalClass }) => signalClass === "ecosystem_momentum",
      ).length,
      ...signalCounts,
      numberRejectedForWeakEvidence,
      numberSourceErrors: batch.sourceErrors.length,
    },
    sourceErrors: batch.sourceErrors.map(({ sourceName, message }) => ({
      sourceName,
      message,
    })),
    rejections,
  };
}

const expirableStatuses = [
  "newly_discovered",
  "needs_review",
  "monitoring",
  "qualified",
] as const;

export async function expireGlobalRadarDirectDemand(
  transaction: GlobalRadarTransaction,
  now: Date,
): Promise<number> {
  const due = await transaction
    .select()
    .from(globalRadarSignals)
    .where(
      and(
        eq(globalRadarSignals.signalClass, "direct_demand"),
        isNull(globalRadarSignals.mergedIntoSignalId),
        inArray(globalRadarSignals.status, expirableStatuses),
        or(
          lte(globalRadarSignals.expiresAt, now),
          and(
            eq(globalRadarSignals.evergreen, true),
            lte(globalRadarSignals.reobserveBy, now),
          ),
        ),
      ),
    )
    .orderBy(asc(globalRadarSignals.id))
    .for("update");
  for (const signal of due) {
    const reason =
      signal.expiresAt !== null && signal.expiresAt <= now
        ? "known_expiry_reached"
        : "evergreen_reobservation_due";
    const provenance = await validateStoredGlobalRadarScoreProvenance(
      transaction,
      signal,
    );
    if (!provenance.valid) {
      throw new Error(
        `Invalid stored Global Radar score provenance: ${provenance.reason}.`,
      );
    }
    const associations = await transaction
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
      throw new Error("Invalid stored Global Radar score-input entity mapping.");
    }
    const actionabilityInput =
      provenance.snapshot.componentEvidence.find(
        ({ component }) => component === "actionability",
      )?.inputValue ?? null;
    const scoreInputDigest = createStoredGlobalRadarScoreInputDigest({
      scoreAsOf: new Date(provenance.snapshot.scoreAsOf),
      signal: { ...signal, status: "expired" },
      actionabilityInput,
      associations,
      entities,
    });
    const scoreEvidenceSnapshot = rebaseStoredScoreEvidenceSnapshot({
      existingSnapshot: signal.scoreEvidenceSnapshot,
      signalClass: "direct_demand",
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
      existingEvidence: provenance.evaluationEvidence,
      evidence: provenance.evaluationEvidence,
      scoreInputDigest,
    });
    const [expired] = await transaction
      .update(globalRadarSignals)
      .set({
        status: "expired",
        scoreEvidenceSnapshot,
        revision: sql`${globalRadarSignals.revision} + 1`,
        updatedAt: now,
      })
      .where(eq(globalRadarSignals.id, signal.id))
      .returning();
    if (!expired) throw new Error("Global Radar direct demand was not expired.");
    await transaction.insert(globalSignalUpdates).values({
      signalId: signal.id,
      updateType: "status_changed",
      previousSafeState: {
        status: signal.status,
        expiresAt: signal.expiresAt?.toISOString() ?? null,
        reobserveBy: signal.reobserveBy?.toISOString() ?? null,
      },
      newSafeState: {
        status: "expired",
        reason,
      },
      actorType: "system",
      actorId: "global-radar:expiry",
      reason:
        reason === "known_expiry_reached"
          ? "Known direct-demand deadline reached."
          : "Evergreen direct demand was not re-observed by its deadline.",
      observedAt: now,
      idempotencyKey:
        `expiry:${signal.id}:revision:${expired.revision}:${reason}`,
      createdAt: now,
    });
  }
  return due.length;
}

type MomentumSafeState = {
  independentEntityCount: number;
  primarySourceCount: number;
  sourceFamilyCount: number;
  volume7Days: number;
  volume30Days: number;
  volume90Days: number;
  independentEntityBreadth: number;
  primarySourceDepth: number;
  sourceDiversity: number;
  weightedVolume: number;
  growthVsPreviousPeriod: number;
  taxonomyConsistency: number;
  evidenceQuality: number;
  score: number;
  scoreCoverage: number;
  scorePolicyVersion: string;
  momentumPolicyVersion: string;
  qualificationGatesPassed: boolean;
  status: GlobalRadarSignal["status"];
};

function currentMomentumSafeState(signal: GlobalRadarSignal): MomentumSafeState {
  const values = {
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
    score: signal.momentumScore,
    scoreCoverage: signal.scoreCoverage,
    scorePolicyVersion: signal.scorePolicyVersion,
    momentumPolicyVersion: signal.momentumPolicyVersion,
    qualificationGatesPassed: signal.momentumQualificationGatesPassed,
    status: signal.status,
  };
  if (Object.values(values).some((value) => value === null)) {
    throw new Error("Persisted momentum signal is missing derived fields.");
  }
  return values as MomentumSafeState;
}

function momentumSafeState(
  derived: Extract<
    ReturnType<typeof deriveEcosystemMomentum>,
    { valid: true }
  >,
  status: GlobalRadarSignal["status"],
): MomentumSafeState {
  return {
    independentEntityCount: derived.counts.independentEntities,
    primarySourceCount: derived.counts.primarySources,
    sourceFamilyCount: derived.counts.sourceFamilies,
    volume7Days: derived.windows.days7.recent,
    volume30Days: derived.windows.days30.recent,
    volume90Days: derived.windows.days90.recent,
    independentEntityBreadth: derived.components.independentEntityBreadth,
    primarySourceDepth: derived.components.primarySourceDepth,
    sourceDiversity: derived.components.sourceDiversity,
    weightedVolume: derived.components.weightedVolume,
    growthVsPreviousPeriod: derived.components.growthVsPreceding,
    taxonomyConsistency: derived.components.taxonomyConsistency,
    evidenceQuality: derived.components.evidenceQuality,
    score: derived.score,
    scoreCoverage: derived.scoreCoverage,
    scorePolicyVersion: derived.scoreVersion,
    momentumPolicyVersion: derived.policyVersion,
    qualificationGatesPassed: derived.qualificationGatesPassed,
    status,
  };
}

function momentumScoreEvidenceValues(
  state: MomentumSafeState,
): Readonly<Record<string, number>> {
  return {
    independentEntityCount: state.independentEntityCount,
    primarySourceCount: state.primarySourceCount,
    sourceFamilyCount: state.sourceFamilyCount,
    volume7Days: state.volume7Days,
    volume30Days: state.volume30Days,
    volume90Days: state.volume90Days,
    independentEntityBreadth: state.independentEntityBreadth,
    primarySourceDepth: state.primarySourceDepth,
    sourceDiversity: state.sourceDiversity,
    weightedVolume: state.weightedVolume,
    growthVsPreviousPeriod: state.growthVsPreviousPeriod,
    taxonomyConsistency: state.taxonomyConsistency,
    evidenceQuality: state.evidenceQuality,
  };
}

const momentumServerDerivedScoreEvidenceComponents =
  momentumScoreEvidenceComponents.filter(
    (component) =>
      component !== "taxonomyConsistency" && component !== "evidenceQuality",
  );

export async function recomputeGlobalRadarMomentum(
  transaction: GlobalRadarTransaction,
  input: { now: Date; policy: MomentumPolicy },
): Promise<{ recomputed: number; unchanged: number }> {
  const lockedPolicy = createGlobalRadarMomentumPolicy(input.policy.taxonomy);
  if (JSON.stringify(input.policy) !== JSON.stringify(lockedPolicy)) {
    throw new GlobalRadarPersistenceConflict("invalid_input");
  }
  const signals = await transaction
    .select()
    .from(globalRadarSignals)
    .where(
      and(
        eq(globalRadarSignals.signalClass, "ecosystem_momentum"),
        eq(globalRadarSignals.demandDomain, input.policy.taxonomy),
        isNull(globalRadarSignals.mergedIntoSignalId),
      ),
    )
    .orderBy(asc(globalRadarSignals.id))
    .for("update");
  let recomputed = 0;
  let unchanged = 0;
  for (const signal of signals) {
    const associations = await transaction
      .select()
      .from(globalRadarSignalEntities)
      .where(eq(globalRadarSignalEntities.signalId, signal.id));
    const contributorIds = [...new Set(
      associations.flatMap(({ globalEntityId, role }) =>
        role === "contributor" ? [globalEntityId] : [],
      ),
    )];
    const contributorSet = new Set(contributorIds);
    const evaluationEvidence = await transaction
      .select()
      .from(globalSignalEvidence)
      .where(eq(globalSignalEvidence.signalId, signal.id))
      .orderBy(asc(globalSignalEvidence.ingestOrdinal))
      .limit(MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS + 1);
    if (evaluationEvidence.length > MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    const referencedEntityIds = [
      ...new Set([
        ...contributorIds,
        ...evaluationEvidence.flatMap(({ globalEntityId }) =>
          globalEntityId === null ? [] : [globalEntityId],
        ),
      ]),
    ];
    const entities = referencedEntityIds.length
      ? await transaction
          .select()
          .from(globalEntities)
          .where(inArray(globalEntities.id, referencedEntityIds))
      : [];
    if (entities.length !== referencedEntityIds.length) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const cutoff =
      input.now.getTime() -
      GLOBAL_RADAR_MOMENTUM_EVIDENCE_MAXIMUM_AGE_DAYS * 24 * 60 * 60 * 1_000;
    const evidence = evaluationEvidence.filter(
      (item) =>
        !item.isSyndicated &&
        item.globalEntityId !== null &&
        contributorSet.has(item.globalEntityId) &&
        item.observedAt.getTime() >= cutoff &&
        item.observedAt.getTime() <= input.now.getTime(),
    );
    const observations = evidence.flatMap((item) => {
      if (
        item.globalEntityId === null ||
        !contributorSet.has(item.globalEntityId)
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
        taxonomy: input.policy.taxonomy,
        taxonomyConsistency: signal.momentumTaxonomyConsistency,
        evidenceQuality: signal.momentumEvidenceQuality,
        observations,
      },
      lockedPolicy,
      { now: () => new Date(input.now.getTime()) },
    );
    if (!derived.valid) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
    const previousState = currentMomentumSafeState(signal);
    const nextStatus =
      !derived.qualificationGatesPassed && signal.status === "qualified"
        ? "monitoring"
        : signal.status;
    const nextState = momentumSafeState(derived, nextStatus);
    const currentComponents = storedScoreComponents(signal);
    const existingScoreEvidenceSnapshot = parseActiveScoreEvidenceSnapshot(
      signal.scoreEvidenceSnapshot,
      {
        signalClass: "ecosystem_momentum",
        signalType: signal.signalType,
        indiaRelevanceType: signal.indiaRelevanceType,
        scorePolicyVersion: derived.scoreVersion,
        momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
        components: currentComponents,
      },
    );
    if (!existingScoreEvidenceSnapshot) {
      throw new Error("Invalid stored Global Radar score-evidence snapshot.");
    }
    const citedEvidenceFingerprints = [
      ...new Set(
        existingScoreEvidenceSnapshot.componentEvidence.flatMap(
          ({ evidence: citations }) =>
            citations.map(({ evidenceFingerprint }) => evidenceFingerprint),
        ),
      ),
    ];
    const maxStoredCitationRows =
      momentumScoreEvidenceComponents.length *
      MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS;
    if (citedEvidenceFingerprints.length > maxStoredCitationRows) {
      throw new Error("Invalid stored Global Radar score-evidence snapshot.");
    }
    const citedEvidenceRows = citedEvidenceFingerprints.length
      ? await transaction
          .select()
          .from(globalSignalEvidence)
          .where(
            and(
              eq(globalSignalEvidence.signalId, signal.id),
              inArray(
                globalSignalEvidence.evidenceFingerprint,
                citedEvidenceFingerprints,
              ),
            ),
          )
      : [];
    const citedEvidenceByFingerprint = new Map(
      citedEvidenceRows.map((item) => [item.evidenceFingerprint, item]),
    );
    if (
      citedEvidenceRows.length !== citedEvidenceByFingerprint.size ||
      citedEvidenceByFingerprint.size !== citedEvidenceFingerprints.length
    ) {
      throw new Error("Invalid stored Global Radar score-evidence citations.");
    }
    const existingScoreEvidence = citedEvidenceFingerprints.map(
      (fingerprint) => {
        const item = citedEvidenceByFingerprint.get(fingerprint);
        if (!item) {
          throw new Error(
            "Invalid stored Global Radar score-evidence citations.",
          );
        }
        return item;
      },
    );
    const existingEmptyMomentumEvidenceWindow =
      emptyMomentumEvidenceWindowBounds(existingScoreEvidenceSnapshot);
    if (existingEmptyMomentumEvidenceWindow !== null) {
      if (contributorIds.length === 0) {
        throw new Error(
          "Invalid stored Global Radar empty momentum evidence window.",
        );
      }
      const activeEvidenceAtStoredAssessment = await transaction
        .select({ id: globalSignalEvidence.id })
        .from(globalSignalEvidence)
        .where(
          eligibleMomentumEvidenceInWindowConditions({
            signalId: signal.id,
            contributorEntityIds: contributorIds,
            cutoff: existingEmptyMomentumEvidenceWindow.cutoff,
            asOf: existingEmptyMomentumEvidenceWindow.asOf,
          }),
        )
        .limit(1);
      if (activeEvidenceAtStoredAssessment.length > 0) {
        throw new Error(
          "Invalid stored Global Radar empty momentum evidence window.",
        );
      }
    }
    const scoreInputDigest = createStoredGlobalRadarScoreInputDigest({
      scoreAsOf: input.now,
      signal: {
        ...signal,
        status: nextStatus,
        momentumTaxonomyConsistency: nextState.taxonomyConsistency,
        momentumEvidenceQuality: nextState.evidenceQuality,
        scorePolicyVersion: nextState.scorePolicyVersion,
        momentumPolicyVersion: nextState.momentumPolicyVersion,
      },
      actionabilityInput: null,
      associations,
      entities,
    });
    const nextScoreEvidenceSnapshot = rebaseStoredScoreEvidenceSnapshot({
      scoreInputDigest,
      existingSnapshot: signal.scoreEvidenceSnapshot,
      signalClass: "ecosystem_momentum",
      signalType: signal.signalType,
      currentIndiaRelevanceType: signal.indiaRelevanceType,
      nextIndiaRelevanceType: signal.indiaRelevanceType,
      scorePolicyVersion: derived.scoreVersion,
      momentumPolicyVersion: GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
      currentComponents,
      nextComponents: momentumScoreEvidenceValues(nextState),
      replacementComponents: momentumServerDerivedScoreEvidenceComponents,
      momentumContributorEntityIds: contributorIds,
      announcedAt: signal.announcedAt,
      effectiveFrom: signal.effectiveFrom,
      existingEvidence: existingScoreEvidence,
      evidence,
      scoreAsOf: input.now,
      evaluationEvidence,
      emptyMomentumEvidenceWindow:
        evidence.length === 0
          ? {
              asOf: input.now.toISOString(),
              maximumAgeDays:
                GLOBAL_RADAR_MOMENTUM_EVIDENCE_MAXIMUM_AGE_DAYS,
              eligibleEvidenceCount: 0,
            }
          : undefined,
    });
    if (
      JSON.stringify(previousState) === JSON.stringify(nextState) &&
      createGlobalRadarFingerprint(signal.scoreEvidenceSnapshot) ===
        createGlobalRadarFingerprint(nextScoreEvidenceSnapshot)
    ) {
      unchanged += 1;
      continue;
    }
    const [updated] = await transaction
      .update(globalRadarSignals)
      .set({
        momentumIndependentEntityCount: nextState.independentEntityCount,
        momentumPrimarySourceCount: nextState.primarySourceCount,
        momentumSourceFamilyCount: nextState.sourceFamilyCount,
        momentumVolume7Days: nextState.volume7Days,
        momentumVolume30Days: nextState.volume30Days,
        momentumVolume90Days: nextState.volume90Days,
        momentumIndependentEntityBreadth:
          nextState.independentEntityBreadth,
        momentumPrimarySourceDepth: nextState.primarySourceDepth,
        momentumSourceDiversity: nextState.sourceDiversity,
        momentumWeightedVolume: nextState.weightedVolume,
        momentumGrowthVsPreviousPeriod: nextState.growthVsPreviousPeriod,
        momentumTaxonomyConsistency: nextState.taxonomyConsistency,
        momentumEvidenceQuality: nextState.evidenceQuality,
        momentumScore: nextState.score,
        scoreCoverage: nextState.scoreCoverage,
        scorePolicyVersion: nextState.scorePolicyVersion,
        scoreEvidenceSnapshot: nextScoreEvidenceSnapshot,
        momentumPolicyVersion: nextState.momentumPolicyVersion,
        momentumQualificationGatesPassed:
          nextState.qualificationGatesPassed,
        status: nextState.status,
        revision: sql`${globalRadarSignals.revision} + 1`,
        updatedAt: input.now,
      })
      .where(eq(globalRadarSignals.id, signal.id))
      .returning();
    if (!updated) throw new Error("Global Radar momentum was not recomputed.");
    await transaction.insert(globalSignalUpdates).values({
      signalId: signal.id,
      updateType: "momentum_recomputed",
      previousSafeState: previousState,
      newSafeState: nextState,
      actorType: "system",
      actorId: "global-radar:momentum",
      reason: "Recomputed momentum from qualified run-linked contributor evidence.",
      observedAt: input.now,
      idempotencyKey: `momentum:${signal.id}:revision:${signal.revision}:${createGlobalRadarFingerprint(nextState)}`,
      createdAt: input.now,
    });
    if (nextStatus !== signal.status) {
      await transaction.insert(globalSignalUpdates).values({
        signalId: signal.id,
        updateType: "status_changed",
        previousSafeState: {
          status: signal.status,
          qualificationGatesPassed:
            previousState.qualificationGatesPassed,
        },
        newSafeState: {
          status: nextStatus,
          qualificationGatesPassed: nextState.qualificationGatesPassed,
        },
        actorType: "system",
        actorId: "global-radar:momentum",
        reason:
          "Moved qualified momentum to monitoring after its hard qualification gates failed.",
        observedAt: input.now,
        idempotencyKey: `momentum-gate:${signal.id}:revision:${signal.revision}:${createGlobalRadarFingerprint({
          previousStatus: signal.status,
          nextStatus,
          qualificationGatesPassed: nextState.qualificationGatesPassed,
          policyVersion: nextState.momentumPolicyVersion,
        })}`,
        createdAt: input.now,
      });
    }
    recomputed += 1;
  }
  return { recomputed, unchanged };
}
