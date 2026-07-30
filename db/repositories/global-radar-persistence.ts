import {
  and,
  arrayOverlaps,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";

import {
  GLOBAL_RADAR_DEDUPE_VERSION,
  MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS,
  createGlobalRadarFingerprint,
  createGlobalRadarMomentumPolicy,
  createGlobalRadarPublicIdentityAnchor,
  createGlobalRadarSignalDedupeKeyFromIdentityAnchors,
  deriveEcosystemMomentum,
  resolveRediscoveredReobserveBy,
  type CanonicalPersistableGlobalRadarBatch,
  type CanonicalPersistableRadarEntity,
  type MomentumPolicy,
  type PersistableRadarSignal,
} from "../../app/domain/global-radar";
import type { MewtualsDatabase } from "../client";
import {
  globalEntities,
  globalRadarSearchQueries,
  globalRadarSignalEntities,
  globalRadarSignals,
  globalSignalEvidence,
  globalSignalRequirements,
  globalSignalUpdates,
} from "../global-radar-schema";
import type { GlobalEntity, GlobalRadarSignal } from "../types";

type GlobalRadarTransaction = Parameters<
  Parameters<MewtualsDatabase["transaction"]>[0]
>[0];

const ENTITY_IDENTITY_LOCK_NAMESPACE =
  "global-radar:entity-identity:v1:" as const;

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
    momentumTaxonomyConsistency: proposed.momentumTaxonomyConsistency,
    momentumEvidenceQuality: proposed.momentumEvidenceQuality,
    directDemandScore: proposed.directDemandScore,
    precursorScore: proposed.precursorScore,
    momentumScore: proposed.momentumScore,
    scoreCoverage: proposed.scoreCoverage,
    scorePolicyVersion: proposed.scorePolicyVersion,
    momentumPolicyVersion: proposed.momentumPolicyVersion,
    momentumQualificationGatesPassed:
      proposed.momentumQualificationGatesPassed,
    announcedAt: proposed.announcedAt,
    effectiveFrom: proposed.effectiveFrom,
    responsePathType: proposed.responsePathType,
    responsePathUrl: proposed.responsePathUrl,
    responseBusinessEmail: proposed.responseBusinessEmail,
    partnerApplicationUrl: proposed.partnerApplicationUrl,
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
    rawMetadata: proposed.rawMetadata,
  };
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

async function persistSignalGraph(
  transaction: GlobalRadarTransaction,
  signalId: string,
  signal: PersistableRadarSignal,
  runId: string,
  entityIds: ReadonlyMap<string, string>,
): Promise<{
  evidenceIds: string[];
  insertedAssociations: number;
  insertedRequirements: number;
}> {
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

  const evidenceIds: string[] = [];
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
      .returning({ id: globalSignalEvidence.id });
    if (inserted) evidenceIds.push(inserted.id);
  }
  return { evidenceIds, insertedAssociations, insertedRequirements };
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

async function persistSignals(
  transaction: GlobalRadarTransaction,
  batch: CanonicalPersistableGlobalRadarBatch,
  entityIds: ReadonlyMap<string, string>,
  entityAnchors: ReadonlyMap<string, string>,
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
      resolvedDedupeKey,
    );
    const [existing] = await transaction
      .select()
      .from(globalRadarSignals)
      .where(
        and(
          eq(globalRadarSignals.dedupeVersion, GLOBAL_RADAR_DEDUPE_VERSION),
          eq(globalRadarSignals.dedupeKey, proposed.dedupeKey),
          isNull(globalRadarSignals.mergedIntoSignalId),
        ),
      )
      .for("update")
      .limit(1);
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
            ...(isNewer ? automatedSignalRefreshValues(proposed) : {}),
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
    const [expired] = await transaction
      .update(globalRadarSignals)
      .set({
        status: "expired",
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
      idempotencyKey: `expiry:${signal.id}:${reason}`,
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
      .where(
        and(
          eq(globalRadarSignalEntities.signalId, signal.id),
          eq(globalRadarSignalEntities.role, "contributor"),
        ),
      );
    const contributorIds = [...new Set(
      associations.map(({ globalEntityId }) => globalEntityId),
    )];
    const entities = contributorIds.length
      ? await transaction
          .select()
          .from(globalEntities)
          .where(inArray(globalEntities.id, contributorIds))
      : [];
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const contributorSet = new Set(contributorIds);
    const evidence = contributorIds.length
      ? await transaction
          .select()
          .from(globalSignalEvidence)
          .where(
            and(
              eq(globalSignalEvidence.signalId, signal.id),
              eq(globalSignalEvidence.isSyndicated, false),
              isNotNull(globalSignalEvidence.globalEntityId),
              inArray(globalSignalEvidence.globalEntityId, contributorIds),
              gte(
                globalSignalEvidence.observedAt,
                new Date(input.now.getTime() - 180 * 24 * 60 * 60 * 1_000),
              ),
            ),
          )
          .orderBy(
            desc(globalSignalEvidence.observedAt),
            desc(globalSignalEvidence.id),
          )
          .limit(MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS + 1)
      : [];
    if (evidence.length > MAX_GLOBAL_RADAR_MOMENTUM_OBSERVATIONS) {
      throw new GlobalRadarPersistenceConflict("invalid_input");
    }
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
    if (JSON.stringify(previousState) === JSON.stringify(nextState)) {
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
