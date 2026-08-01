import {
  asc,
  desc,
  eq,
  gte,
  isNull,
  lt,
  sql,
  type SQL,
} from "drizzle-orm";

import {
  GLOBAL_RADAR_SCORE_EVIDENCE_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
  globalRadarDemandFamilyLookup,
  globalRadarLeafIdentifierLookup,
  globalRadarThemes,
  indiaRelevanceTypeLookup,
  isoTimestampSchema,
  signalStatusLookup,
  type IndiaRelevanceType,
  type ProfessionalResponsePathType,
  type PromotionEligibilityPath,
  type RadarRunStatus,
  type RadarRunTrigger,
  type RadarScanMode,
  type RequirementKind,
  type ScoreAssessmentBasis,
  type ScoreEvidenceBasis,
  type ScoreEvidenceComponent,
  type SensitiveDataFlagState,
  type SignalClass,
  type SignalStatus,
} from "../../app/domain/global-radar";
import {
  globalEntities,
  globalRadarSignals,
  globalSignalRequirements,
} from "../global-radar-schema";

export const GLOBAL_RADAR_ADMIN_PAGE_SIZE = 25;
export const GLOBAL_RADAR_ADMIN_MAX_PAGE = 100;
const MAX_FILTER_LENGTH = 200;

export type GlobalRadarAdminConfiguration = Readonly<{
  scoreVersion: typeof GLOBAL_RADAR_SCORE_VERSION;
  thresholds: Readonly<Record<SignalClass, number>>;
}>;

export type GlobalRadarHorizon =
  | "within_30_days"
  | "days_31_to_90"
  | "days_91_to_180"
  | "days_181_to_365"
  | "unknown";

export type GlobalRadarCommonFilters = Readonly<{
  status?: SignalStatus;
  country?: string;
  indiaRelevance?: IndiaRelevanceType;
  demandDomain?: string;
  capability?: string;
  observedFrom?: string;
  observedTo?: string;
  page?: number;
}>;

export type GlobalRadarSignalListInput = Readonly<{
  signalClass: SignalClass;
  filters: GlobalRadarCommonFilters &
    Readonly<{
      expiresBefore?: string;
      horizon?: GlobalRadarHorizon;
      theme?: string;
    }>;
}>;

export type SafeGlobalRadarSignalListItem = Readonly<{
  id: string;
  signalClass: SignalClass;
  title: string;
  factualSummary: string;
  theme: string;
  sourceCountry: string;
  demandDomain: string;
  indiaRelevanceType: IndiaRelevanceType;
  status: SignalStatus;
  score: number | null;
  expiresAt: Date | null;
  reobserveBy: Date | null;
  observedAt: Date;
  revision: number;
  entity: null | Readonly<{
    id: string;
    canonicalName: string;
    headquartersCountry: string;
  }>;
}>;

export type GlobalRadarReadConflictReason =
  | "invalid_input"
  | "score_provenance_invalid";

export type ListGlobalRadarSignalsResult =
  | Readonly<{
      outcome: "listed";
      page: number;
      pageSize: 25;
      total: number;
      items: SafeGlobalRadarSignalListItem[];
    }>
  | Readonly<{
      outcome: "conflict";
      reason: GlobalRadarReadConflictReason;
    }>;

export type GlobalRadarClassSummaryInput = Readonly<{
  signalClass: SignalClass;
  filters: GlobalRadarSignalListInput["filters"];
  now: Date;
}>;

export type GlobalRadarClassMetrics = Readonly<{
  total: number;
  highQuality: number;
  byStatus: Partial<Record<SignalStatus, number>>;
  india: Readonly<{ explicit: number; inferred: number; other: number }>;
  countries: Readonly<{ unitedStates: number; china: number; other: number }>;
  requirementMix: Readonly<{ physicalData: number; hardware: number }>;
  demandFamilies: Readonly<Record<string, number>>;
  active: number;
  expiring: number;
  horizon: Readonly<{
    within30Days: number;
    days31To90: number;
    days91To180: number;
    days181To365: number;
    unknown: number;
  }>;
  qualified: number;
}>;

export type SafeChildCollection<Item> = Readonly<{
  total: number;
  truncated: boolean;
  items: Item[];
}>;

export type SafeJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly SafeJsonValue[]
  | { readonly [key: string]: SafeJsonValue };

export type SafeJsonObject = Readonly<{
  [key: string]: SafeJsonValue;
}>;

export type SafeGlobalRadarOrganisation = Readonly<{
  id: string;
  canonicalName: string;
  canonicalDomain: string | null;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  canonicalCorporateGroupId: string | null;
  stablePublicIdentifiers: string[];
  headquartersCountry: string;
  headquartersCity: string | null;
  operatingCountries: string[] | null;
  organisationType: string;
  sector: string;
  shortDescription: string;
  entityStatus: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  promotedCandidateId: string | null;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export type SafeGlobalRadarAssociatedOrganisation = Readonly<{
  role: "supporting" | "contributor";
  confidence: number;
  organisation: SafeGlobalRadarOrganisation;
}>;

export type SafeGlobalRadarRequirement = Readonly<{
  id: string;
  kind: RequirementKind;
  capabilityTag: string;
  summary: string;
  dataFamilies: string[] | null;
  sensorModalities: string[] | null;
  environments: string[] | null;
  taskFamilies: string[] | null;
  collectionMethods: string[] | null;
  humanRoles: string[] | null;
  robotEmbodiments: string[] | null;
  indianExecutionArchetypes: string[] | null;
  scaleSpecification: SafeJsonObject | null;
  technicalSpecification: SafeJsonObject | null;
  qualitySpecification: SafeJsonObject | null;
  rightsAndComplianceSpecification: SafeJsonObject | null;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}>;

export type SafeGlobalRadarEvidence = Readonly<{
  id: string;
  runId: string | null;
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
  supportedFieldPaths: string[];
  createdAt: Date;
}>;

export type SafeGlobalRadarHistoryItem = Readonly<{
  id: string;
  updateType:
    | "created"
    | "rediscovered"
    | "evidence_appended"
    | "status_changed"
    | "classification_changed"
    | "expiry_changed"
    | "india_fit_changed"
    | "merged"
    | "momentum_recomputed"
    | "promoted"
    | "promotion_reversed";
  previousSafeState: SafeJsonObject | null;
  newSafeState: SafeJsonObject | null;
  evidenceId: string | null;
  actorType: "worker" | "administrator" | "system";
  actorEmail: string | null;
  reason: string;
  observedAt: Date;
  createdAt: Date;
}>;

export type SafeGlobalRadarAdminNote = Readonly<{
  id: string;
  body: string;
  actorEmail: string | null;
  observedAt: Date;
  createdAt: Date;
}>;

export type SafeGlobalRadarPromotionContext = Readonly<{
  id: string;
  globalEntityId: string;
  primarySignalId: string;
  supportingSignalIds: string[];
  eligibilityPath: PromotionEligibilityPath;
  discoveryRunId: string | null;
  discoveryCandidateId: string | null;
  status: "active" | "reversed" | "failed" | "conflicted";
  promotedAt: Date | null;
  reversedAt: Date | null;
  revisionContext: Readonly<{
    expectedEntity: number;
    expectedPrimarySignal: number;
    promotedEntity: number | null;
    promotedPrimarySignal: number | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
}>;

export type GlobalRadarAllowedAction =
  | "request_review"
  | "monitor"
  | "qualify"
  | "dismiss"
  | "expire"
  | "reopen"
  | "mark_no_india_fit"
  | "edit_classification"
  | "edit_expiry"
  | "append_evidence"
  | "append_note"
  | "merge"
  | "edit_watchlist"
  | "qualify_entity"
  | "promote"
  | "reverse_promotion";

export type SafeGlobalRadarScoreEvidenceAssociation = Readonly<{
  component: ScoreEvidenceComponent;
  value: number;
  basis: ScoreEvidenceBasis;
  assessmentBasis: ScoreAssessmentBasis | null;
  inputValue: number | null;
  rationale: string;
  evidence: readonly Readonly<{
    id: string;
    sourceUrl: string;
    sourceName: string;
    matchedFieldPaths: readonly string[];
  }>[];
}>;

export type SafeGlobalRadarSignalDetail = Readonly<{
  organisation: SafeGlobalRadarOrganisation | null;
  associatedOrganisations: SafeChildCollection<SafeGlobalRadarAssociatedOrganisation>;
  signal: SafeGlobalRadarSignalListItem &
    Readonly<{
      signalType: string;
      interpretationSummary: string;
      industry: string;
      targetGeographies: string[] | null;
      collectionGeographies: string[] | null;
      manufacturingGeographies: string[] | null;
      deliveryGeographies: string[] | null;
      targetModelOrSystem: string | null;
      requiredCounterpartyArchetypes: string[] | null;
      indiaRelevanceRationale: string;
      indiaFitReasons: string[];
      indiaFitConstraints: string[];
      indiaFitUnknowns: string[];
      indiaFitConfidence: number;
      indiaRegulatoryFacts: SafeJsonObject | null;
      indiaLogisticsFacts: SafeJsonObject | null;
      targetCapabilityTags: string[] | null;
      responsePathType: ProfessionalResponsePathType | null;
      responsePathUrl: string | null;
      responseBusinessEmail: string | null;
      partnerApplicationUrl: string | null;
      sourceLanguage: string;
      extractionMethod: string;
      taxonomyVersion: string;
      firstRunId: string;
      mostRecentRunId: string;
      mergedIntoSignalId: string | null;
      firstSeenAt: Date;
      lastSeenAt: Date;
      createdAt: Date;
      updatedAt: Date;
    }>;
  scoreRationale: Readonly<{
    directDemand: Readonly<{
      demandExplicitness: number | null;
      evidenceConfidence: number | null;
      freshness: number | null;
      actionability: number | null;
      indiaFit: number | null;
      commercialPotential: number | null;
      repeatability: number | null;
      responseAccessibility: number | null;
      strategicLearning: number | null;
      complianceComplexity: number | null;
      score: number | null;
    }>;
    precursor: Readonly<{
      evidenceConfidence: number | null;
      proximityToExternalDemand: number | null;
      fundingDeploymentMomentum: number | null;
      likelyDataHardwareIntensity: number | null;
      indiaFit: number | null;
      estimatedTimeHorizon: number | null;
      strategicRelevance: number | null;
      score: number | null;
    }>;
    momentum: Readonly<{
      independentEntityCount: number | null;
      primarySourceCount: number | null;
      sourceFamilyCount: number | null;
      volume7Days: number | null;
      volume30Days: number | null;
      volume90Days: number | null;
      independentEntityBreadth: number | null;
      primarySourceDepth: number | null;
      sourceDiversity: number | null;
      weightedVolume: number | null;
      growthVsPreviousPeriod: number | null;
      taxonomyConsistency: number | null;
      evidenceQuality: number | null;
      score: number | null;
      policyVersion: string | null;
      qualificationGatesPassed: boolean | null;
    }>;
    coverage: number;
    policyVersion: string;
    evidenceVersion: typeof GLOBAL_RADAR_SCORE_EVIDENCE_VERSION;
    componentEvidence: readonly SafeGlobalRadarScoreEvidenceAssociation[];
  }>;
  timeline: Readonly<{
    announcedAt: Date | null;
    effectiveFrom: Date | null;
    expiresAt: Date | null;
    evergreen: boolean | null;
    reobserveBy: Date | null;
    observedAt: Date;
  }>;
  systemsContext: Readonly<{
    summary: string | null;
    stackType: string | null;
    higherLevelSystemGoal: string | null;
    relevantStackLayer: string | null;
    lowerLevelInputsRequired: string[] | null;
    transformationOrCapabilityAdded: string | null;
    downstreamModelOrRobotBehavior: string | null;
    whyTheRequirementMatters: string | null;
    possibleIndianExecutionRole: string | null;
    factualElements: string[] | null;
    inferredElements: string[] | null;
  }>;
  compliance: Readonly<{
    sensitiveDataFlags: Readonly<{
      faces: SensitiveDataFlagState | null;
      voices: SensitiveDataFlagState | null;
      biometrics: SensitiveDataFlagState | null;
      gaze: SensitiveDataFlagState | null;
      health: SensitiveDataFlagState | null;
      children: SensitiveDataFlagState | null;
      homeInteriors: SensitiveDataFlagState | null;
      workplaceMonitoring: SensitiveDataFlagState | null;
      preciseLocation: SensitiveDataFlagState | null;
      roadUsers: SensitiveDataFlagState | null;
      employeeData: SensitiveDataFlagState | null;
      industrialSecrets: SensitiveDataFlagState | null;
      defenceOrDualUse: SensitiveDataFlagState | null;
      copyrightedMaterial: SensitiveDataFlagState | null;
      exportControls: SensitiveDataFlagState | null;
    }>;
    facts: Readonly<{
      consent: boolean | null;
      deIdentification: boolean | null;
      legalReview: boolean | null;
      knownResidencyRequirements: boolean | null;
      participantRightsComplexity: boolean | null;
    }>;
  }>;
  requirements: SafeChildCollection<SafeGlobalRadarRequirement>;
  evidence: SafeChildCollection<SafeGlobalRadarEvidence>;
  history: SafeChildCollection<SafeGlobalRadarHistoryItem>;
  notes: SafeChildCollection<SafeGlobalRadarAdminNote>;
  watchlist: SafeGlobalRadarWatchlistItem | null;
  promotion: SafeGlobalRadarPromotionContext | null;
  allowedActions: GlobalRadarAllowedAction[];
}>;

export type SafeGlobalRadarRunNotice = Readonly<{
  code: "lease_expired" | "run_failed" | "source_errors";
  message: string;
  count?: number;
}>;

export type SafeGlobalRadarAdminRun = Readonly<{
  id: string;
  trigger: RadarRunTrigger;
  scanMode: RadarScanMode;
  status: RadarRunStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  sourceCountries: string[];
  sourceLanguages: string[];
  targetDomains: string[];
  targetSignalTypes: string[];
  sourcesUsed: string[];
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
  notices: SafeGlobalRadarRunNotice[];
  createdAt: Date;
  updatedAt: Date;
}>;

export type SafeGlobalRadarOverviewMetrics = Readonly<{
  newSignals: number;
  activeDirectDemand: number;
  highQualityPrecursors: number;
  india: Readonly<{ explicit: number; inferred: number }>;
  countries: Readonly<{ unitedStates: number; china: number; other: number }>;
  requirementMix: Readonly<{ physicalData: number; hardware: number }>;
  capabilityFamilies: Readonly<{ capability: string; signals: number }[]>;
  expiringDirectDemand: number;
  promotedEntities: number;
  latestRun: null | Readonly<{
    id: string;
    status: RadarRunStatus;
    completedAt: Date | null;
    createdAt: Date;
  }>;
  sourceErrors: number;
  mergedDuplicates: number;
}>;

export type GlobalRadarClassSummaryResult =
  | Readonly<{
      outcome: "listed";
      page: number;
      pageSize: 25;
      total: number;
      items: SafeGlobalRadarSignalListItem[];
      classTotal: number;
      classMetrics: GlobalRadarClassMetrics;
      overviewMetrics: SafeGlobalRadarOverviewMetrics;
    }>
  | Readonly<{
      outcome: "conflict";
      reason: GlobalRadarReadConflictReason;
    }>;

export type SafeGlobalRadarWatchlistItem = Readonly<{
  id: string;
  globalEntityId: string;
  state: "enabled" | "paused" | "disabled";
  priority: number;
  theme: string;
  category: string;
  categorySearchTermEn: string;
  categorySearchTermZhCn: string | null;
  countries: string[];
  languages: string[];
  cadenceDays: number;
  nextScanAt: Date | null;
  reason: string;
  revision: number;
  entity: Readonly<{
    canonicalName: string;
    headquartersCountry: string;
    entityStatus: string;
    revision: number;
  }>;
}>;

export type SafeGlobalRadarWatchlistEnrichment = Readonly<{
  globalEntityId: string;
  latestSignal: SafeGlobalRadarSignalListItem | null;
  expiry: Readonly<{
    expiresAt: Date | null;
    reobserveBy: Date | null;
  }> | null;
  promotion: Readonly<{
    id: string;
    status: "active" | "reversed";
    discoveryCandidateId: string | null;
    promotedAt: Date | null;
    reversedAt: Date | null;
  }> | null;
}>;

export function assembleGlobalRadarWatchlistEnrichment(input: Readonly<{
  globalEntityIds: readonly string[];
  signals: readonly Readonly<{
    signal: SafeGlobalRadarSignalListItem;
    globalEntityIds: readonly string[];
  }>[];
  promotions: readonly Readonly<{
    id: string;
    globalEntityId: string;
    status: "active" | "reversed";
    discoveryCandidateId: string | null;
    promotedAt: Date | null;
    reversedAt: Date | null;
    updatedAt: Date;
  }>[];
}>): SafeGlobalRadarWatchlistEnrichment[] {
  return input.globalEntityIds.map((globalEntityId) => {
    const latestSignal = input.signals
      .filter(({ globalEntityIds }) =>
        globalEntityIds.includes(globalEntityId),
      )
      .map(({ signal }) => signal)
      .sort(
        (left, right) =>
          right.observedAt.getTime() - left.observedAt.getTime() ||
          left.id.localeCompare(right.id),
      )[0] ?? null;
    const promotion = input.promotions
      .filter((candidate) => candidate.globalEntityId === globalEntityId)
      .sort(
        (left, right) =>
          right.updatedAt.getTime() - left.updatedAt.getTime() ||
          left.id.localeCompare(right.id),
      )[0] ?? null;
    return {
      globalEntityId,
      latestSignal,
      expiry:
        latestSignal?.signalClass === "direct_demand"
          ? {
              expiresAt: latestSignal.expiresAt,
              reobserveBy: latestSignal.reobserveBy,
            }
          : null,
      promotion: promotion
        ? {
            id: promotion.id,
            status: promotion.status,
            discoveryCandidateId: promotion.discoveryCandidateId,
            promotedAt: promotion.promotedAt,
            reversedAt: promotion.reversedAt,
          }
        : null,
    };
  });
}

export type ParsedGlobalRadarSignalFilters = Readonly<{
  page: number;
  status?: SignalStatus;
  country?: string;
  indiaRelevance?: IndiaRelevanceType;
  demandDomain?: string;
  capability?: string;
  observedFrom?: Date;
  observedTo?: Date;
  expiresBefore?: Date;
  horizon?: GlobalRadarHorizon;
  theme?: string;
}>;

const commonFilterKeys = new Set([
  "status",
  "country",
  "indiaRelevance",
  "demandDomain",
  "capability",
  "observedFrom",
  "observedTo",
  "page",
]);

function boundedFilter(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= MAX_FILTER_LENGTH
    ? normalized
    : null;
}

function parseTimestamp(value: unknown): Date | null {
  const parsed = isoTimestampSchema.safeParse(value);
  return parsed.success ? new Date(parsed.data) : null;
}

export function parseGlobalRadarSignalFilters(
  signalClass: SignalClass,
  value: unknown,
): ParsedGlobalRadarSignalFilters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const filters = value as Record<string, unknown>;
  const classKey =
    signalClass === "direct_demand"
      ? "expiresBefore"
      : signalClass === "demand_precursor"
        ? "horizon"
        : "theme";
  if (
    Object.keys(filters).some(
      (key) => !commonFilterKeys.has(key) && key !== classKey,
    )
  ) return null;
  const page = filters.page ?? 1;
  if (
    !Number.isInteger(page) ||
    Number(page) < 1 ||
    Number(page) > GLOBAL_RADAR_ADMIN_MAX_PAGE
  ) return null;
  const parsed: {
    page: number;
    status?: SignalStatus;
    country?: string;
    indiaRelevance?: IndiaRelevanceType;
    demandDomain?: string;
    capability?: string;
    observedFrom?: Date;
    observedTo?: Date;
    expiresBefore?: Date;
    horizon?: GlobalRadarHorizon;
    theme?: string;
  } = { page: Number(page) };
  if (filters.status !== undefined) {
    if (
      typeof filters.status !== "string" ||
      !signalStatusLookup[filters.status as SignalStatus]
    ) return null;
    parsed.status = filters.status as SignalStatus;
  }
  if (filters.indiaRelevance !== undefined) {
    if (
      typeof filters.indiaRelevance !== "string" ||
      !indiaRelevanceTypeLookup[filters.indiaRelevance as IndiaRelevanceType]
    ) return null;
    parsed.indiaRelevance = filters.indiaRelevance as IndiaRelevanceType;
  }
  for (const key of ["country", "demandDomain", "capability", "theme"] as const) {
    if (filters[key] === undefined) continue;
    const bounded = boundedFilter(filters[key]);
    if (!bounded) return null;
    if (
      key === "demandDomain" &&
      !globalRadarDemandFamilyLookup[
        bounded as keyof typeof globalRadarDemandFamilyLookup
      ]
    ) return null;
    if (
      key === "capability" &&
      !globalRadarLeafIdentifierLookup[
        bounded as keyof typeof globalRadarLeafIdentifierLookup
      ]
    ) return null;
    if (
      key === "theme" &&
      !globalRadarThemes.includes(bounded as (typeof globalRadarThemes)[number])
    ) return null;
    parsed[key] = bounded;
  }
  for (const key of ["observedFrom", "observedTo", "expiresBefore"] as const) {
    if (filters[key] === undefined) continue;
    const timestamp = parseTimestamp(filters[key]);
    if (!timestamp) return null;
    parsed[key] = timestamp;
  }
  if (
    parsed.observedFrom &&
    parsed.observedTo &&
    parsed.observedFrom >= parsed.observedTo
  ) return null;
  if (filters.horizon !== undefined) {
    const horizons: readonly GlobalRadarHorizon[] = [
      "within_30_days",
      "days_31_to_90",
      "days_91_to_180",
      "days_181_to_365",
      "unknown",
    ];
    if (!horizons.includes(filters.horizon as GlobalRadarHorizon)) return null;
    parsed.horizon = filters.horizon as GlobalRadarHorizon;
  }
  return parsed;
}

export function globalRadarSignalFilterConditions(
  signalClass: SignalClass,
  filters: ParsedGlobalRadarSignalFilters,
): SQL[] {
  const conditions: SQL[] = [
    eq(globalRadarSignals.signalClass, signalClass),
    isNull(globalRadarSignals.mergedIntoSignalId),
  ];
  if (filters.status) conditions.push(eq(globalRadarSignals.status, filters.status));
  if (filters.country) conditions.push(eq(globalRadarSignals.sourceCountry, filters.country));
  if (filters.indiaRelevance) conditions.push(eq(globalRadarSignals.indiaRelevanceType, filters.indiaRelevance));
  if (filters.demandDomain) conditions.push(eq(globalRadarSignals.demandDomain, filters.demandDomain));
  if (filters.observedFrom) conditions.push(gte(globalRadarSignals.observedAt, filters.observedFrom));
  if (filters.observedTo) conditions.push(lt(globalRadarSignals.observedAt, filters.observedTo));
  if (filters.expiresBefore) conditions.push(lt(globalRadarSignals.expiresAt, filters.expiresBefore));
  if (filters.theme) conditions.push(eq(globalRadarSignals.theme, filters.theme));
  if (filters.capability) {
    conditions.push(sql`exists (
      select 1 from ${globalSignalRequirements}
      where ${globalSignalRequirements.signalId} = ${globalRadarSignals.id}
        and ${globalSignalRequirements.capabilityTag} = ${filters.capability}
    )`);
  }
  if (filters.horizon) {
    const score =
      filters.horizon === "within_30_days"
        ? 100
        : filters.horizon === "days_31_to_90"
          ? 80
          : filters.horizon === "days_91_to_180"
            ? 60
            : filters.horizon === "days_181_to_365"
              ? 35
              : null;
    conditions.push(
      score === null
        ? isNull(globalRadarSignals.estimatedTimeHorizon)
        : eq(globalRadarSignals.estimatedTimeHorizon, score),
    );
  }
  return conditions;
}

export type GlobalRadarClassSummaryRequirement = Readonly<{
  signalId: string;
  kind: RequirementKind;
  capabilityTag: string;
}>;

type GlobalRadarSummarySignal = typeof globalRadarSignals.$inferSelect;

type MutableClassMetrics = {
  total: number;
  highQuality: number;
  byStatus: Partial<Record<SignalStatus, number>>;
  explicitIndia: number;
  inferredIndia: number;
  unitedStates: number;
  china: number;
  physicalData: number;
  hardware: number;
  demandFamilies: Record<string, number>;
  active: number;
  expiring: number;
  horizon: {
    within30Days: number;
    days31To90: number;
    days91To180: number;
    days181To365: number;
    unknown: number;
  };
  qualified: number;
};

type MutableOverviewMetrics = {
  newSignals: number;
  activeDirectDemand: number;
  highQualityPrecursors: number;
  explicitIndia: number;
  inferredIndia: number;
  unitedStates: number;
  china: number;
  physicalData: number;
  hardware: number;
  capabilityCounts: Map<string, number>;
  expiringDirectDemand: number;
  activeSignalCount: number;
  mergedDuplicates: number;
};

export type GlobalRadarClassSummaryAccumulator = {
  classTotal: number;
  classMetrics: MutableClassMetrics;
  overviewMetrics: MutableOverviewMetrics;
};

function emptyClassMetrics(): MutableClassMetrics {
  return {
    total: 0,
    highQuality: 0,
    byStatus: {},
    explicitIndia: 0,
    inferredIndia: 0,
    unitedStates: 0,
    china: 0,
    physicalData: 0,
    hardware: 0,
    demandFamilies: {},
    active: 0,
    expiring: 0,
    horizon: {
      within30Days: 0,
      days31To90: 0,
      days91To180: 0,
      days181To365: 0,
      unknown: 0,
    },
    qualified: 0,
  };
}

export function createGlobalRadarClassSummaryAccumulator(): GlobalRadarClassSummaryAccumulator {
  return {
    classTotal: 0,
    classMetrics: emptyClassMetrics(),
    overviewMetrics: {
      newSignals: 0,
      activeDirectDemand: 0,
      highQualityPrecursors: 0,
      explicitIndia: 0,
      inferredIndia: 0,
      unitedStates: 0,
      china: 0,
      physicalData: 0,
      hardware: 0,
      capabilityCounts: new Map(),
      expiringDirectDemand: 0,
      activeSignalCount: 0,
      mergedDuplicates: 0,
    },
  };
}

function directDemandIsActive(
  signal: Pick<GlobalRadarSummarySignal, "evergreen" | "expiresAt" | "reobserveBy">,
  now: Date,
): boolean {
  return signal.evergreen === true
    ? signal.reobserveBy !== null && signal.reobserveBy > now
    : signal.expiresAt === null || signal.expiresAt > now;
}

function signalMatchesFilters(
  signal: GlobalRadarSummarySignal,
  requirements: readonly GlobalRadarClassSummaryRequirement[],
  filters: ParsedGlobalRadarSignalFilters,
): boolean {
  return (
    (filters.status === undefined || signal.status === filters.status) &&
    (filters.country === undefined || signal.sourceCountry === filters.country) &&
    (filters.indiaRelevance === undefined ||
      signal.indiaRelevanceType === filters.indiaRelevance) &&
    (filters.demandDomain === undefined ||
      signal.demandDomain === filters.demandDomain) &&
    (filters.observedFrom === undefined ||
      signal.observedAt >= filters.observedFrom) &&
    (filters.observedTo === undefined || signal.observedAt < filters.observedTo) &&
    (filters.expiresBefore === undefined ||
      (signal.expiresAt !== null && signal.expiresAt < filters.expiresBefore)) &&
    (filters.theme === undefined || signal.theme === filters.theme) &&
    (filters.capability === undefined ||
      requirements.some(
        (requirement) =>
          requirement.signalId === signal.id &&
          requirement.capabilityTag === filters.capability,
      )) &&
    (filters.horizon === undefined ||
      (filters.horizon === "within_30_days"
        ? signal.estimatedTimeHorizon === 100
        : filters.horizon === "days_31_to_90"
          ? signal.estimatedTimeHorizon === 80
          : filters.horizon === "days_91_to_180"
            ? signal.estimatedTimeHorizon === 60
            : filters.horizon === "days_181_to_365"
              ? signal.estimatedTimeHorizon === 35
              : signal.estimatedTimeHorizon === null))
  );
}

function requirementSets(
  requirements: readonly GlobalRadarClassSummaryRequirement[],
) {
  const kindsBySignal = new Map<string, Set<RequirementKind>>();
  const capabilitiesBySignal = new Map<string, Set<string>>();
  for (const requirement of requirements) {
    const kinds = kindsBySignal.get(requirement.signalId) ?? new Set();
    kinds.add(requirement.kind);
    kindsBySignal.set(requirement.signalId, kinds);
    const capabilities =
      capabilitiesBySignal.get(requirement.signalId) ?? new Set();
    capabilities.add(requirement.capabilityTag);
    capabilitiesBySignal.set(requirement.signalId, capabilities);
  }
  return { kindsBySignal, capabilitiesBySignal };
}

function accumulateClassSignal(
  metrics: MutableClassMetrics,
  signal: GlobalRadarSummarySignal,
  kinds: ReadonlySet<RequirementKind>,
  input: Readonly<{
    signalClass: SignalClass;
    now: Date;
    configuration: GlobalRadarAdminConfiguration;
  }>,
) {
  metrics.total += 1;
  metrics.byStatus[signal.status] = (metrics.byStatus[signal.status] ?? 0) + 1;
  if (
    globalRadarDemandFamilyLookup[
      signal.demandDomain as keyof typeof globalRadarDemandFamilyLookup
    ]
  ) {
    metrics.demandFamilies[signal.demandDomain] =
      (metrics.demandFamilies[signal.demandDomain] ?? 0) + 1;
  }
  if (signal.indiaRelevanceType === "explicit_India") metrics.explicitIndia += 1;
  else if (signal.indiaRelevanceType === "inferred_India_compatible") {
    metrics.inferredIndia += 1;
  }
  if (["United States", "US"].includes(signal.sourceCountry)) {
    metrics.unitedStates += 1;
  } else if (["China", "CN"].includes(signal.sourceCountry)) {
    metrics.china += 1;
  }
  if (kinds.has("physical_data")) metrics.physicalData += 1;
  if (kinds.has("robotics_hardware")) metrics.hardware += 1;
  if (signal.status === "qualified") metrics.qualified += 1;
  const activeStatus = !["dismissed", "expired", "promoted"].includes(
    signal.status,
  );
  const directActive =
    input.signalClass !== "direct_demand" ||
    directDemandIsActive(signal, input.now);
  if (activeStatus && directActive) metrics.active += 1;
  if (
    input.signalClass === "direct_demand" &&
    ((signal.expiresAt !== null && signal.expiresAt > input.now) ||
      (signal.reobserveBy !== null && signal.reobserveBy > input.now))
  ) {
    metrics.expiring += 1;
  }
  if (input.signalClass === "demand_precursor") {
    if (signal.estimatedTimeHorizon === 100) metrics.horizon.within30Days += 1;
    else if (signal.estimatedTimeHorizon === 80) metrics.horizon.days31To90 += 1;
    else if (signal.estimatedTimeHorizon === 60) metrics.horizon.days91To180 += 1;
    else if (signal.estimatedTimeHorizon === 35) metrics.horizon.days181To365 += 1;
    else metrics.horizon.unknown += 1;
  }
  const score =
    input.signalClass === "direct_demand"
      ? signal.directDemandScore
      : input.signalClass === "demand_precursor"
        ? signal.precursorScore
        : signal.momentumScore;
  const hardGates =
    input.signalClass === "direct_demand"
      ? (signal.demandExplicitness ?? -1) >= 75 &&
        (signal.evidenceConfidence ?? -1) >= 60 &&
        directActive
      : input.signalClass === "demand_precursor"
        ? (signal.evidenceConfidence ?? -1) >= 60 &&
          (signal.proximityToExternalDemand ?? -1) >= 50
        : (signal.momentumIndependentEntityCount ?? 0) >= 2 &&
          (signal.momentumPrimarySourceCount ?? 0) >= 1 &&
          (signal.momentumTaxonomyConsistency ?? -1) >= 70 &&
          (signal.momentumEvidenceQuality ?? -1) >= 60 &&
          signal.momentumQualificationGatesPassed === true;
  if (
    signal.scorePolicyVersion === input.configuration.scoreVersion &&
    score !== null &&
    score >= input.configuration.thresholds[input.signalClass] &&
    hardGates
  ) {
    metrics.highQuality += 1;
  }
}

export function accumulateGlobalRadarClassSummaryChunk(
  accumulator: GlobalRadarClassSummaryAccumulator,
  input: Readonly<{
    signalClass: SignalClass;
    filters: ParsedGlobalRadarSignalFilters;
    now: Date;
    configuration: GlobalRadarAdminConfiguration;
    signals: readonly GlobalRadarSummarySignal[];
    requirements: readonly GlobalRadarClassSummaryRequirement[];
  }>,
): GlobalRadarClassSummaryAccumulator {
  const next: GlobalRadarClassSummaryAccumulator = {
    classTotal: accumulator.classTotal,
    classMetrics: {
      ...accumulator.classMetrics,
      byStatus: { ...accumulator.classMetrics.byStatus },
      demandFamilies: { ...accumulator.classMetrics.demandFamilies },
      horizon: { ...accumulator.classMetrics.horizon },
    },
    overviewMetrics: {
      ...accumulator.overviewMetrics,
      capabilityCounts: new Map(
        accumulator.overviewMetrics.capabilityCounts,
      ),
    },
  };
  const { kindsBySignal, capabilitiesBySignal } = requirementSets(
    input.requirements,
  );
  const expiryWindowEnd = new Date(
    input.now.getTime() + 30 * 24 * 60 * 60 * 1_000,
  );
  for (const signal of input.signals) {
    if (signal.mergedIntoSignalId !== null) {
      next.overviewMetrics.mergedDuplicates += 1;
      continue;
    }
    const kinds = kindsBySignal.get(signal.id) ?? new Set<RequirementKind>();
    const capabilities = capabilitiesBySignal.get(signal.id) ?? new Set<string>();
    next.overviewMetrics.activeSignalCount += 1;
    next.overviewMetrics.newSignals +=
      countGlobalRadarSignalsObservedToday([signal.observedAt], input.now);
    if (signal.indiaRelevanceType === "explicit_India") {
      next.overviewMetrics.explicitIndia += 1;
    } else if (signal.indiaRelevanceType === "inferred_India_compatible") {
      next.overviewMetrics.inferredIndia += 1;
    }
    const country = signal.sourceCountry.trim().toLowerCase();
    if (["united states", "us"].includes(country)) {
      next.overviewMetrics.unitedStates += 1;
    } else if (["china", "cn"].includes(country)) {
      next.overviewMetrics.china += 1;
    }
    if (kinds.has("physical_data")) next.overviewMetrics.physicalData += 1;
    if (kinds.has("robotics_hardware")) next.overviewMetrics.hardware += 1;
    for (const capability of capabilities) {
      next.overviewMetrics.capabilityCounts.set(
        capability,
        (next.overviewMetrics.capabilityCounts.get(capability) ?? 0) + 1,
      );
    }
    if (signal.signalClass === "direct_demand") {
      const active =
        !["dismissed", "expired", "promoted"].includes(signal.status) &&
        directDemandIsActive(signal, input.now);
      if (active) next.overviewMetrics.activeDirectDemand += 1;
      const deadline = signal.evergreen ? signal.reobserveBy : signal.expiresAt;
      if (
        active &&
        deadline !== null &&
        deadline > input.now &&
        deadline <= expiryWindowEnd
      ) {
        next.overviewMetrics.expiringDirectDemand += 1;
      }
    }
    if (
      signal.signalClass === "demand_precursor" &&
      signal.scorePolicyVersion === input.configuration.scoreVersion &&
      (signal.precursorScore ?? -1) >=
        input.configuration.thresholds.demand_precursor &&
      (signal.evidenceConfidence ?? -1) >= 60 &&
      (signal.proximityToExternalDemand ?? -1) >= 50
    ) {
      next.overviewMetrics.highQualityPrecursors += 1;
    }
    if (signal.signalClass !== input.signalClass) continue;
    next.classTotal += 1;
    if (!signalMatchesFilters(signal, input.requirements, input.filters)) continue;
    accumulateClassSignal(next.classMetrics, signal, kinds, input);
  }
  return next;
}

export function finalizeGlobalRadarClassSummaryMetrics(
  accumulator: GlobalRadarClassSummaryAccumulator,
  metadata: Readonly<{
    promotedEntities: number;
    latestRun: SafeGlobalRadarOverviewMetrics["latestRun"];
    sourceErrors: number;
  }>,
): Readonly<{
  classTotal: number;
  classMetrics: GlobalRadarClassMetrics;
  overviewMetrics: SafeGlobalRadarOverviewMetrics;
}> {
  const classMetrics = accumulator.classMetrics;
  const overview = accumulator.overviewMetrics;
  return {
    classTotal: accumulator.classTotal,
    classMetrics: {
      total: classMetrics.total,
      highQuality: classMetrics.highQuality,
      byStatus: classMetrics.byStatus,
      india: {
        explicit: classMetrics.explicitIndia,
        inferred: classMetrics.inferredIndia,
        other:
          classMetrics.total -
          classMetrics.explicitIndia -
          classMetrics.inferredIndia,
      },
      countries: {
        unitedStates: classMetrics.unitedStates,
        china: classMetrics.china,
        other:
          classMetrics.total -
          classMetrics.unitedStates -
          classMetrics.china,
      },
      requirementMix: {
        physicalData: classMetrics.physicalData,
        hardware: classMetrics.hardware,
      },
      demandFamilies: classMetrics.demandFamilies,
      active: classMetrics.active,
      expiring: classMetrics.expiring,
      horizon: classMetrics.horizon,
      qualified: classMetrics.qualified,
    },
    overviewMetrics: {
      newSignals: overview.newSignals,
      activeDirectDemand: overview.activeDirectDemand,
      highQualityPrecursors: overview.highQualityPrecursors,
      india: {
        explicit: overview.explicitIndia,
        inferred: overview.inferredIndia,
      },
      countries: {
        unitedStates: overview.unitedStates,
        china: overview.china,
        other:
          overview.activeSignalCount - overview.unitedStates - overview.china,
      },
      requirementMix: {
        physicalData: overview.physicalData,
        hardware: overview.hardware,
      },
      capabilityFamilies: [...overview.capabilityCounts.entries()]
        .map(([capability, signals]) => ({ capability, signals }))
        .sort(
          (left, right) =>
            right.signals - left.signals ||
            left.capability.localeCompare(right.capability),
        )
        .slice(0, 50),
      expiringDirectDemand: overview.expiringDirectDemand,
      promotedEntities: metadata.promotedEntities,
      latestRun: metadata.latestRun,
      sourceErrors: metadata.sourceErrors,
      mergedDuplicates: overview.mergedDuplicates,
    },
  };
}

export function globalRadarSignalOrder(signalClass: SignalClass): SQL[] {
  if (signalClass === "direct_demand") {
    return [
      sql`${globalRadarSignals.directDemandScore} desc nulls last`,
      sql`${globalRadarSignals.expiresAt} asc nulls last`,
      desc(globalRadarSignals.observedAt),
      asc(globalRadarSignals.id),
    ];
  }
  if (signalClass === "demand_precursor") {
    return [
      sql`${globalRadarSignals.precursorScore} desc nulls last`,
      sql`${globalRadarSignals.estimatedTimeHorizon} desc nulls last`,
      desc(globalRadarSignals.observedAt),
      asc(globalRadarSignals.id),
    ];
  }
  return [
    desc(globalRadarSignals.momentumScore),
    desc(globalRadarSignals.momentumVolume7Days),
    desc(globalRadarSignals.observedAt),
    asc(globalRadarSignals.id),
  ];
}

export function globalRadarSafeListSelection() {
  return {
    id: globalRadarSignals.id,
    signalClass: globalRadarSignals.signalClass,
    title: globalRadarSignals.title,
    factualSummary: globalRadarSignals.factualSummary,
    theme: globalRadarSignals.theme,
    sourceCountry: globalRadarSignals.sourceCountry,
    demandDomain: globalRadarSignals.demandDomain,
    indiaRelevanceType: globalRadarSignals.indiaRelevanceType,
    status: globalRadarSignals.status,
    directDemandScore: globalRadarSignals.directDemandScore,
    precursorScore: globalRadarSignals.precursorScore,
    momentumScore: globalRadarSignals.momentumScore,
    expiresAt: globalRadarSignals.expiresAt,
    reobserveBy: globalRadarSignals.reobserveBy,
    observedAt: globalRadarSignals.observedAt,
    revision: globalRadarSignals.revision,
    entityId: globalEntities.id,
    entityName: globalEntities.canonicalName,
    entityCountry: globalEntities.headquartersCountry,
  } as const;
}

type SafeListRow = Readonly<{
  id: string;
  signalClass: SignalClass;
  title: string;
  factualSummary: string;
  theme: string;
  sourceCountry: string;
  demandDomain: string;
  indiaRelevanceType: IndiaRelevanceType;
  status: SignalStatus;
  directDemandScore: number | null;
  precursorScore: number | null;
  momentumScore: number | null;
  expiresAt: Date | null;
  reobserveBy: Date | null;
  observedAt: Date;
  revision: number;
  entityId: string | null;
  entityName: string | null;
  entityCountry: string | null;
}>;

export function toSafeGlobalRadarSignalListItem(
  row: SafeListRow,
): SafeGlobalRadarSignalListItem {
  return {
    id: row.id,
    signalClass: row.signalClass,
    title: row.title,
    factualSummary: row.factualSummary,
    theme: row.theme,
    sourceCountry: row.sourceCountry,
    demandDomain: row.demandDomain,
    indiaRelevanceType: row.indiaRelevanceType,
    status: row.status,
    score:
      row.signalClass === "direct_demand"
        ? row.directDemandScore
        : row.signalClass === "demand_precursor"
          ? row.precursorScore
          : row.momentumScore,
    expiresAt: row.expiresAt,
    reobserveBy: row.reobserveBy,
    observedAt: row.observedAt,
    revision: row.revision,
    entity:
      row.entityId && row.entityName && row.entityCountry
        ? {
            id: row.entityId,
            canonicalName: row.entityName,
            headquartersCountry: row.entityCountry,
          }
        : null,
  };
}

export function isGlobalRadarAdminSignalId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

const globalRadarOperationalDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function operationalDate(value: Date): string | null {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const parts = globalRadarOperationalDate.formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function countGlobalRadarSignalsObservedToday(
  observedAt: readonly Date[],
  now: Date,
): number {
  const currentOperationalDate = operationalDate(now);
  if (currentOperationalDate === null) return 0;
  return observedAt.reduce(
    (count, observed) =>
      count + (operationalDate(observed) === currentOperationalDate ? 1 : 0),
    0,
  );
}

const reviewActionsByStatus: Readonly<
  Record<SignalStatus, readonly GlobalRadarAllowedAction[]>
> = {
  newly_discovered: [
    "request_review",
    "monitor",
    "dismiss",
    "expire",
    "mark_no_india_fit",
  ],
  needs_review: [
    "qualify",
    "monitor",
    "dismiss",
    "expire",
    "mark_no_india_fit",
  ],
  monitoring: [
    "request_review",
    "qualify",
    "dismiss",
    "expire",
    "mark_no_india_fit",
  ],
  qualified: ["monitor", "dismiss", "expire", "mark_no_india_fit"],
  dismissed: ["reopen"],
  expired: ["reopen"],
  promoted: ["mark_no_india_fit"],
};

const qualifiableGlobalRadarEntityStatuses = new Set([
  "observed",
  "watchlisted",
  "monitoring",
]);

export function isGlobalRadarEntityQualifiableStatus(
  value: unknown,
): boolean {
  return typeof value === "string" &&
    qualifiableGlobalRadarEntityStatuses.has(value);
}

export function globalRadarAllowedActions(input: Readonly<{
  signalClass: SignalClass;
  status: SignalStatus;
  mergedIntoSignalId: string | null;
  hasOrganisation: boolean;
  hasPromotionEntity?: boolean;
  hasQualifiablePromotionEntity?: boolean;
  hasActivePromotion: boolean;
}>): GlobalRadarAllowedAction[] {
  if (input.mergedIntoSignalId !== null) return [];
  const actions: GlobalRadarAllowedAction[] = [
    ...reviewActionsByStatus[input.status],
    "append_evidence",
    "append_note",
    "merge",
  ];
  if (input.status === "monitoring") actions.push("edit_classification");
  if (input.signalClass === "direct_demand") actions.push("edit_expiry");
  if (input.hasOrganisation) actions.push("edit_watchlist");
  if (
    (input.hasPromotionEntity ?? input.hasOrganisation) &&
    input.status === "qualified" &&
    !input.hasActivePromotion
  ) actions.push("promote");
  if (
    input.hasQualifiablePromotionEntity &&
    input.status === "qualified" &&
    !input.hasActivePromotion
  ) {
    actions.push("qualify_entity");
  }
  if (input.status === "promoted" && input.hasActivePromotion) {
    actions.push("reverse_promotion");
  }
  return actions;
}
