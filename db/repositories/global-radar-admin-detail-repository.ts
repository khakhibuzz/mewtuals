import { and, asc, desc, eq, or, sql } from "drizzle-orm";

import type { MewtualsDatabase } from "../client";
import {
  globalEntities,
  globalRadarPromotions,
  globalRadarSignalEntities,
  globalRadarSignals,
  globalRadarWatchlistEntries,
  globalSignalEvidence,
  globalSignalRequirements,
  globalSignalUpdates,
} from "../global-radar-schema";
import {
  toSafeGlobalRadarWatchlistEntry,
} from "./global-radar-admin-watchlist";
import {
  globalRadarAllowedActions,
  isGlobalRadarAdminSignalId,
  toSafeGlobalRadarSignalListItem,
  type SafeGlobalRadarAdminNote,
  type SafeGlobalRadarAssociatedOrganisation,
  type SafeGlobalRadarEvidence,
  type SafeGlobalRadarHistoryItem,
  type SafeGlobalRadarOrganisation,
  type SafeGlobalRadarPromotionContext,
  type SafeGlobalRadarRequirement,
  type SafeGlobalRadarSignalDetail,
  type SafeJsonObject,
} from "./global-radar-admin-read-model";

const DETAIL_CHILD_LIMIT = 100;

type GlobalRadarEntityRow = typeof globalEntities.$inferSelect;

export type GlobalRadarSignalDetailResult =
  | { outcome: "found"; detail: SafeGlobalRadarSignalDetail }
  | { outcome: "not_found" }
  | { outcome: "conflict"; reason: "invalid_input" };

function toSafeOrganisation(
  entity: GlobalRadarEntityRow,
): SafeGlobalRadarOrganisation {
  return {
    id: entity.id,
    canonicalName: entity.canonicalName,
    canonicalDomain: entity.canonicalDomain,
    websiteUrl: entity.websiteUrl,
    linkedinUrl: entity.linkedinUrl,
    canonicalCorporateGroupId: entity.canonicalCorporateGroupId,
    stablePublicIdentifiers: [...entity.stablePublicIdentifiers],
    headquartersCountry: entity.headquartersCountry,
    headquartersCity: entity.headquartersCity,
    operatingCountries: entity.operatingCountries
      ? [...entity.operatingCountries]
      : null,
    organisationType: entity.organisationType,
    sector: entity.sector,
    shortDescription: entity.shortDescription,
    entityStatus: entity.entityStatus,
    firstSeenAt: entity.firstSeenAt,
    lastSeenAt: entity.lastSeenAt,
    promotedCandidateId: entity.promotedCandidateId,
    revision: entity.revision,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function toSafeJsonObject(
  value: Record<string, unknown> | null,
): SafeJsonObject | null {
  return value as SafeJsonObject | null;
}

function nullableArray(value: string[] | null): string[] | null {
  return value ? [...value] : null;
}

function childCollection<Item>(items: Item[], total: number) {
  return {
    total,
    truncated: total > DETAIL_CHILD_LIMIT,
    items,
  };
}

export function createGlobalRadarAdminDetailRepository(
  database: MewtualsDatabase,
) {
  return {
    async getSignalDetail(
      signalId: string,
    ): Promise<GlobalRadarSignalDetailResult> {
      if (!isGlobalRadarAdminSignalId(signalId)) {
        return { outcome: "conflict", reason: "invalid_input" };
      }
      const [row] = await database
        .select({ signal: globalRadarSignals, organisation: globalEntities })
        .from(globalRadarSignals)
        .leftJoin(
          globalEntities,
          eq(globalRadarSignals.globalEntityId, globalEntities.id),
        )
        .where(eq(globalRadarSignals.id, signalId))
        .limit(1);
      if (!row) return { outcome: "not_found" };

      const [
        associationRows,
        requirementsRows,
        evidenceRows,
        historyRows,
        noteRows,
        associationCount,
        requirementCount,
        evidenceCount,
        historyCount,
        noteCount,
      ] = await Promise.all([
        database
          .select({
            role: globalRadarSignalEntities.role,
            confidence: globalRadarSignalEntities.confidence,
            organisation: globalEntities,
          })
          .from(globalRadarSignalEntities)
          .innerJoin(
            globalEntities,
            eq(globalRadarSignalEntities.globalEntityId, globalEntities.id),
          )
          .where(eq(globalRadarSignalEntities.signalId, signalId))
          .orderBy(asc(globalRadarSignalEntities.id))
          .limit(DETAIL_CHILD_LIMIT),
        database
          .select()
          .from(globalSignalRequirements)
          .where(eq(globalSignalRequirements.signalId, signalId))
          .orderBy(
            asc(globalSignalRequirements.createdAt),
            asc(globalSignalRequirements.id),
          )
          .limit(DETAIL_CHILD_LIMIT),
        database
          .select()
          .from(globalSignalEvidence)
          .where(eq(globalSignalEvidence.signalId, signalId))
          .orderBy(
            desc(globalSignalEvidence.observedAt),
            asc(globalSignalEvidence.id),
          )
          .limit(DETAIL_CHILD_LIMIT),
        database
          .select()
          .from(globalSignalUpdates)
          .where(
            and(
              eq(globalSignalUpdates.signalId, signalId),
              sql`${globalSignalUpdates.updateType} <> 'note_appended'`,
            ),
          )
          .orderBy(
            desc(globalSignalUpdates.observedAt),
            asc(globalSignalUpdates.id),
          )
          .limit(DETAIL_CHILD_LIMIT),
        database
          .select({
            id: globalSignalUpdates.id,
            body: globalSignalUpdates.reason,
            actorEmail: globalSignalUpdates.actorEmail,
            observedAt: globalSignalUpdates.observedAt,
            createdAt: globalSignalUpdates.createdAt,
          })
          .from(globalSignalUpdates)
          .where(
            and(
              eq(globalSignalUpdates.signalId, signalId),
              eq(globalSignalUpdates.updateType, "note_appended"),
            ),
          )
          .orderBy(
            desc(globalSignalUpdates.observedAt),
            asc(globalSignalUpdates.id),
          )
          .limit(DETAIL_CHILD_LIMIT),
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(globalRadarSignalEntities)
          .where(eq(globalRadarSignalEntities.signalId, signalId)),
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(globalSignalRequirements)
          .where(eq(globalSignalRequirements.signalId, signalId)),
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(globalSignalEvidence)
          .where(eq(globalSignalEvidence.signalId, signalId)),
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(globalSignalUpdates)
          .where(
            and(
              eq(globalSignalUpdates.signalId, signalId),
              sql`${globalSignalUpdates.updateType} <> 'note_appended'`,
            ),
          ),
        database
          .select({ count: sql<number>`count(*)::int` })
          .from(globalSignalUpdates)
          .where(
            and(
              eq(globalSignalUpdates.signalId, signalId),
              eq(globalSignalUpdates.updateType, "note_appended"),
            ),
          ),
      ]);

      const [watchlistRow] = row.organisation
        ? await database
            .select({
              entry: globalRadarWatchlistEntries,
              organisation: globalEntities,
            })
            .from(globalRadarWatchlistEntries)
            .innerJoin(
              globalEntities,
              eq(globalRadarWatchlistEntries.globalEntityId, globalEntities.id),
            )
            .where(
              eq(globalRadarWatchlistEntries.globalEntityId, row.organisation.id),
            )
            .limit(1)
        : [];
      const [promotionRow] = await database
        .select()
        .from(globalRadarPromotions)
        .where(
          or(
            eq(globalRadarPromotions.primarySignalId, signalId),
            sql`${signalId} = any(${globalRadarPromotions.supportingSignalIds})`,
          ),
        )
        .orderBy(
          desc(globalRadarPromotions.createdAt),
          desc(globalRadarPromotions.id),
        )
        .limit(1);

      const signal = row.signal;
      const safeSignal = toSafeGlobalRadarSignalListItem({
        ...signal,
        entityId: row.organisation?.id ?? null,
        entityName: row.organisation?.canonicalName ?? null,
        entityCountry: row.organisation?.headquartersCountry ?? null,
      });
      const requirements: SafeGlobalRadarRequirement[] = requirementsRows.map(
        (requirement) => ({
          id: requirement.id,
          kind: requirement.kind,
          capabilityTag: requirement.capabilityTag,
          summary: requirement.summary,
          dataFamilies: nullableArray(requirement.dataFamilies),
          sensorModalities: nullableArray(requirement.sensorModalities),
          environments: nullableArray(requirement.environments),
          taskFamilies: nullableArray(requirement.taskFamilies),
          collectionMethods: nullableArray(requirement.collectionMethods),
          humanRoles: nullableArray(requirement.humanRoles),
          robotEmbodiments: nullableArray(requirement.robotEmbodiments),
          indianExecutionArchetypes: nullableArray(
            requirement.indianExecutionArchetypes,
          ),
          scaleSpecification: toSafeJsonObject(requirement.scaleSpecification),
          technicalSpecification: toSafeJsonObject(
            requirement.technicalSpecification,
          ),
          qualitySpecification: toSafeJsonObject(
            requirement.qualitySpecification,
          ),
          rightsAndComplianceSpecification: toSafeJsonObject(
            requirement.rightsAndComplianceSpecification,
          ),
          confidence: requirement.confidence,
          createdAt: requirement.createdAt,
          updatedAt: requirement.updatedAt,
        }),
      );
      const evidence: SafeGlobalRadarEvidence[] = evidenceRows.map((item) => ({
        id: item.id,
        runId: item.runId,
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
        publishedAt: item.publishedAt,
        observedAt: item.observedAt,
        evidenceConfidence: item.evidenceConfidence,
        translationConfidence: item.translationConfidence,
        isPrimarySource: item.isPrimarySource,
        isSyndicated: item.isSyndicated,
        supportsDirectDemand: item.supportsDirectDemand,
        supportsIndiaRelevance: item.supportsIndiaRelevance,
        supportedFieldPaths: [...item.supportedFieldPaths],
        createdAt: item.createdAt,
      }));
      const history: SafeGlobalRadarHistoryItem[] = historyRows.map((item) => ({
        id: item.id,
        updateType: item.updateType as SafeGlobalRadarHistoryItem["updateType"],
        previousSafeState: toSafeJsonObject(item.previousSafeState),
        newSafeState: toSafeJsonObject(item.newSafeState),
        evidenceId: item.evidenceId,
        actorType: item.actorType,
        actorEmail: item.actorEmail,
        reason: item.reason,
        observedAt: item.observedAt,
        createdAt: item.createdAt,
      }));
      const notes: SafeGlobalRadarAdminNote[] = noteRows.map((item) => ({
        ...item,
      }));
      const associatedOrganisations: SafeGlobalRadarAssociatedOrganisation[] =
        associationRows.map((association) => ({
          role: association.role,
          confidence: association.confidence,
          organisation: toSafeOrganisation(association.organisation),
        }));
      const promotion: SafeGlobalRadarPromotionContext | null = promotionRow
        ? {
            id: promotionRow.id,
            globalEntityId: promotionRow.globalEntityId,
            primarySignalId: promotionRow.primarySignalId,
            supportingSignalIds: [...promotionRow.supportingSignalIds],
            eligibilityPath: promotionRow.eligibilityPath,
            discoveryRunId: promotionRow.discoveryRunId,
            discoveryCandidateId: promotionRow.discoveryCandidateId,
            status: promotionRow.status,
            promotedAt: promotionRow.promotedAt,
            reversedAt: promotionRow.reversedAt,
            revisionContext: {
              expectedEntity: promotionRow.expectedEntityRevision,
              expectedPrimarySignal: promotionRow.expectedPrimarySignalRevision,
              promotedEntity: promotionRow.promotedEntityRevision,
              promotedPrimarySignal: promotionRow.promotedPrimarySignalRevision,
            },
            createdAt: promotionRow.createdAt,
            updatedAt: promotionRow.updatedAt,
          }
        : null;

      return {
        outcome: "found",
        detail: {
          organisation: row.organisation
            ? toSafeOrganisation(row.organisation)
            : null,
          associatedOrganisations: childCollection(
            associatedOrganisations,
            associationCount[0]?.count ?? 0,
          ),
          signal: {
            ...safeSignal,
            signalType: signal.signalType,
            interpretationSummary: signal.interpretationSummary,
            industry: signal.industry,
            targetGeographies: nullableArray(signal.targetGeographies),
            collectionGeographies: nullableArray(signal.collectionGeographies),
            manufacturingGeographies: nullableArray(
              signal.manufacturingGeographies,
            ),
            deliveryGeographies: nullableArray(signal.deliveryGeographies),
            targetModelOrSystem: signal.targetModelOrSystem,
            requiredCounterpartyArchetypes: nullableArray(
              signal.requiredCounterpartyArchetypes,
            ),
            indiaRelevanceRationale: signal.indiaRelevanceRationale,
            indiaFitReasons: [...signal.indiaFitReasons],
            indiaFitConstraints: [...signal.indiaFitConstraints],
            indiaFitUnknowns: [...signal.indiaFitUnknowns],
            indiaFitConfidence: signal.indiaFitConfidence,
            indiaRegulatoryFacts: toSafeJsonObject(signal.indiaRegulatoryFacts),
            indiaLogisticsFacts: toSafeJsonObject(signal.indiaLogisticsFacts),
            targetCapabilityTags: nullableArray(signal.targetCapabilityTags),
            responsePathType: signal.responsePathType,
            responsePathUrl: signal.responsePathUrl,
            responseBusinessEmail: signal.responseBusinessEmail,
            partnerApplicationUrl: signal.partnerApplicationUrl,
            sourceLanguage: signal.sourceLanguage,
            extractionMethod: signal.extractionMethod,
            taxonomyVersion: signal.taxonomyVersion,
            firstRunId: signal.firstRunId,
            mostRecentRunId: signal.mostRecentRunId,
            mergedIntoSignalId: signal.mergedIntoSignalId,
            firstSeenAt: signal.firstSeenAt,
            lastSeenAt: signal.lastSeenAt,
            createdAt: signal.createdAt,
            updatedAt: signal.updatedAt,
          },
          scoreRationale: {
            directDemand: {
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
              score: signal.directDemandScore,
            },
            precursor: {
              evidenceConfidence: signal.evidenceConfidence,
              proximityToExternalDemand: signal.proximityToExternalDemand,
              fundingDeploymentMomentum: signal.fundingDeploymentMomentum,
              likelyDataHardwareIntensity: signal.likelyDataHardwareIntensity,
              indiaFit: signal.indiaFit,
              estimatedTimeHorizon: signal.estimatedTimeHorizon,
              strategicRelevance: signal.strategicRelevance,
              score: signal.precursorScore,
            },
            momentum: {
              independentEntityCount: signal.momentumIndependentEntityCount,
              primarySourceCount: signal.momentumPrimarySourceCount,
              sourceFamilyCount: signal.momentumSourceFamilyCount,
              volume7Days: signal.momentumVolume7Days,
              volume30Days: signal.momentumVolume30Days,
              volume90Days: signal.momentumVolume90Days,
              independentEntityBreadth:
                signal.momentumIndependentEntityBreadth,
              primarySourceDepth: signal.momentumPrimarySourceDepth,
              sourceDiversity: signal.momentumSourceDiversity,
              weightedVolume: signal.momentumWeightedVolume,
              growthVsPreviousPeriod: signal.momentumGrowthVsPreviousPeriod,
              taxonomyConsistency: signal.momentumTaxonomyConsistency,
              evidenceQuality: signal.momentumEvidenceQuality,
              score: signal.momentumScore,
              policyVersion: signal.momentumPolicyVersion,
              qualificationGatesPassed:
                signal.momentumQualificationGatesPassed,
            },
            coverage: signal.scoreCoverage,
            policyVersion: signal.scorePolicyVersion,
          },
          timeline: {
            announcedAt: signal.announcedAt,
            effectiveFrom: signal.effectiveFrom,
            expiresAt: signal.expiresAt,
            evergreen: signal.evergreen,
            reobserveBy: signal.reobserveBy,
            observedAt: signal.observedAt,
          },
          systemsContext: {
            summary: signal.systemsContextSummary,
            stackType: signal.systemsContextStackType,
            higherLevelSystemGoal: signal.higherLevelSystemGoal,
            relevantStackLayer: signal.relevantStackLayer,
            lowerLevelInputsRequired: nullableArray(
              signal.lowerLevelInputsRequired,
            ),
            transformationOrCapabilityAdded:
              signal.transformationOrCapabilityAdded,
            downstreamModelOrRobotBehavior:
              signal.downstreamModelOrRobotBehavior,
            whyTheRequirementMatters: signal.whyTheRequirementMatters,
            possibleIndianExecutionRole: signal.possibleIndianExecutionRole,
            factualElements: nullableArray(signal.factualElements),
            inferredElements: nullableArray(signal.inferredElements),
          },
          compliance: {
            sensitiveDataFlags: {
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
            },
            facts: {
              consent: signal.consent,
              deIdentification: signal.deIdentification,
              legalReview: signal.legalReview,
              knownResidencyRequirements: signal.knownResidencyRequirements,
              participantRightsComplexity:
                signal.participantRightsComplexity,
            },
          },
          requirements: childCollection(
            requirements,
            requirementCount[0]?.count ?? 0,
          ),
          evidence: childCollection(evidence, evidenceCount[0]?.count ?? 0),
          history: childCollection(history, historyCount[0]?.count ?? 0),
          notes: childCollection(notes, noteCount[0]?.count ?? 0),
          watchlist: watchlistRow
            ? {
                ...toSafeGlobalRadarWatchlistEntry(watchlistRow.entry),
                entity: {
                  canonicalName: watchlistRow.organisation.canonicalName,
                  headquartersCountry:
                    watchlistRow.organisation.headquartersCountry,
                  entityStatus: watchlistRow.organisation.entityStatus,
                  revision: watchlistRow.organisation.revision,
                },
              }
            : null,
          promotion,
          allowedActions: globalRadarAllowedActions({
            signalClass: signal.signalClass,
            status: signal.status,
            mergedIntoSignalId: signal.mergedIntoSignalId,
            hasOrganisation: row.organisation !== null,
            hasActivePromotion: promotion?.status === "active",
          }),
        },
      };
    },
  };
}
