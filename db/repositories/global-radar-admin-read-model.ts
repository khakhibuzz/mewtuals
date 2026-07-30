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

export type ListGlobalRadarSignalsResult =
  | Readonly<{
      outcome: "listed";
      page: number;
      pageSize: 25;
      total: number;
      items: SafeGlobalRadarSignalListItem[];
    }>
  | Readonly<{ outcome: "conflict"; reason: "invalid_input" }>;

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
  | "promote"
  | "reverse_promotion";

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

export function globalRadarAllowedActions(input: Readonly<{
  signalClass: SignalClass;
  status: SignalStatus;
  mergedIntoSignalId: string | null;
  hasOrganisation: boolean;
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
    input.hasOrganisation &&
    input.status === "qualified" &&
    !input.hasActivePromotion
  ) actions.push("promote");
  if (input.status === "promoted" && input.hasActivePromotion) {
    actions.push("reverse_promotion");
  }
  return actions;
}
