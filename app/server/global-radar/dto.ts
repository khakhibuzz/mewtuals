import {
  GLOBAL_RADAR_SCORE_EVIDENCE_VERSION,
  deriveScoreComponentEvidenceAssociations,
} from "../../domain/global-radar";

export const GLOBAL_RADAR_DETAIL_SECTIONS = [
  ["organisation", "Organisation"],
  ["what_changed", "What changed"],
  ["signal_class", "Signal class"],
  ["publicly_supported_facts", "Publicly supported facts"],
  ["mewtuals_interpretation", "Mewtuals interpretation"],
  ["required_capabilities", "Required capabilities"],
  [
    "physical_data_or_hardware_specifications",
    "Physical-data or hardware specifications",
  ],
  ["target_environments_and_tasks", "Target environments and tasks"],
  ["indian_execution_archetypes", "Indian execution archetypes"],
  [
    "india_fit_reasoning_and_constraints",
    "India-fit reasoning and constraints",
  ],
  ["systems_context_explanation", "Systems-context explanation"],
  ["scale_and_timeline", "Scale and timeline"],
  ["public_response_path", "Public response path"],
  ["compliance_flags", "Compliance flags"],
  ["supporting_evidence", "Supporting evidence"],
  ["original_language_source", "Original-language source"],
  ["english_summary", "English summary"],
  ["score_rationale", "Score rationale"],
  ["signal_history", "Signal history"],
  ["admin_notes_and_actions", "Admin notes and actions"],
] as const;

export const GLOBAL_RADAR_DETAIL_SECTION_IDS = Object.freeze(
  GLOBAL_RADAR_DETAIL_SECTIONS.map(([id]) => id),
);

type JsonRecord = Record<string, unknown>;

const forbiddenSafeJsonKeys = new Set([
  "claimpath",
  "exception",
  "fullpage",
  "fullpagetext",
  "leasetoken",
  "leasetokenhash",
  "pagecontent",
  "privatefailure",
  "promptinternals",
  "rawmetadata",
  "rawpayload",
  "rejectedbody",
  "sql",
  "submissionhash",
  "workersecret",
]);

function readRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Invalid Global Radar ${label} read model.`);
  }
  return value as JsonRecord;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid Global Radar ${label}.`);
  }
  return value.trim();
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : readString(value, "optional string");
}

function readNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid Global Radar ${label}.`);
  }
  return value;
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined
    ? null
    : readNumber(value, "optional number");
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid Global Radar ${label}.`);
  }
  return value;
}

function nullableBoolean(value: unknown): boolean | null {
  return value === null || value === undefined
    ? null
    : readBoolean(value, "optional boolean");
}

function isoTimestamp(value: unknown, label: string): string {
  const date = value instanceof Date ? value : new Date(readString(value, label));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid Global Radar ${label}.`);
  }
  return date.toISOString();
}

function nullableIsoTimestamp(value: unknown): string | null {
  return value === null || value === undefined
    ? null
    : isoTimestamp(value, "optional timestamp");
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("Invalid Global Radar string array.");
  }
  return value.map((item) => readString(item, "array item"));
}

function nullableStringArray(value: unknown): string[] | null {
  return value === null || value === undefined ? null : stringArray(value);
}

function safeJson(value: unknown, depth = 0): unknown {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, 2_048);
  if (depth >= 4 || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => safeJson(item, depth + 1));
  }
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (forbiddenSafeJsonKeys.has(normalizedKey)) continue;
    output[key] = safeJson(item, depth + 1);
  }
  return output;
}

function childCollection(
  value: unknown,
  mapItem: (item: unknown) => unknown,
) {
  const source = readRecord(value, "child collection");
  if (!Array.isArray(source.items)) {
    throw new Error("Invalid Global Radar child collection items.");
  }
  return {
    total: readNumber(source.total, "child collection total"),
    truncated: readBoolean(source.truncated, "child collection truncation"),
    items: source.items.map(mapItem),
  };
}

function entitySummary(value: unknown) {
  if (value === null || value === undefined) return null;
  const source = readRecord(value, "entity summary");
  return {
    id: readString(source.id, "entity id"),
    canonicalName: readString(source.canonicalName, "entity name"),
    headquartersCountry: readString(
      source.headquartersCountry,
      "entity country",
    ),
  };
}

function organisation(value: unknown) {
  if (value === null || value === undefined) return null;
  const source = readRecord(value, "organisation");
  return {
    id: readString(source.id, "organisation id"),
    canonicalName: readString(source.canonicalName, "organisation name"),
    canonicalDomain: nullableString(source.canonicalDomain),
    websiteUrl: nullableString(source.websiteUrl),
    linkedinUrl: nullableString(source.linkedinUrl),
    canonicalCorporateGroupId: nullableString(
      source.canonicalCorporateGroupId,
    ),
    stablePublicIdentifiers: stringArray(source.stablePublicIdentifiers),
    headquartersCountry: readString(
      source.headquartersCountry,
      "organisation country",
    ),
    headquartersCity: nullableString(source.headquartersCity),
    operatingCountries: nullableStringArray(source.operatingCountries),
    organisationType: readString(source.organisationType, "organisation type"),
    sector: readString(source.sector, "organisation sector"),
    shortDescription: readString(
      source.shortDescription,
      "organisation description",
    ),
    entityStatus: readString(source.entityStatus, "organisation status"),
    firstSeenAt: isoTimestamp(source.firstSeenAt, "organisation first seen"),
    lastSeenAt: isoTimestamp(source.lastSeenAt, "organisation last seen"),
    promotedCandidateId: nullableString(source.promotedCandidateId),
    revision: readNumber(source.revision, "organisation revision"),
  };
}

function requirement(value: unknown) {
  const source = readRecord(value, "requirement");
  return {
    id: readString(source.id, "requirement id"),
    kind: readString(source.kind, "requirement kind"),
    capabilityTag: readString(source.capabilityTag, "requirement capability"),
    summary: readString(source.summary, "requirement summary"),
    dataFamilies: nullableStringArray(source.dataFamilies),
    sensorModalities: nullableStringArray(source.sensorModalities),
    environments: nullableStringArray(source.environments),
    taskFamilies: nullableStringArray(source.taskFamilies),
    collectionMethods: nullableStringArray(source.collectionMethods),
    humanRoles: nullableStringArray(source.humanRoles),
    robotEmbodiments: nullableStringArray(source.robotEmbodiments),
    indianExecutionArchetypes: nullableStringArray(
      source.indianExecutionArchetypes,
    ),
    scaleSpecification: safeJson(source.scaleSpecification),
    technicalSpecification: safeJson(source.technicalSpecification),
    qualitySpecification: safeJson(source.qualitySpecification),
    rightsAndComplianceSpecification: safeJson(
      source.rightsAndComplianceSpecification,
    ),
    confidence: readNumber(source.confidence, "requirement confidence"),
  };
}

function evidenceCitation(value: unknown) {
  const source = readRecord(value, "evidence");
  return {
    id: readString(source.id, "evidence id"),
    sourceUrl: readString(source.sourceUrl, "evidence URL"),
    canonicalSourceUrl: readString(
      source.canonicalSourceUrl,
      "canonical evidence URL",
    ),
    sourceName: readString(source.sourceName, "evidence source name"),
    sourceType: readString(source.sourceType, "evidence source type"),
    sourceCountry: readString(source.sourceCountry, "evidence source country"),
    sourceFamily: readString(source.sourceFamily, "evidence source family"),
    publishedAt: nullableIsoTimestamp(source.publishedAt),
    observedAt: isoTimestamp(source.observedAt, "evidence observation"),
    evidenceConfidence: readNumber(
      source.evidenceConfidence,
      "evidence confidence",
    ),
    isPrimarySource: readBoolean(
      source.isPrimarySource,
      "primary-source flag",
    ),
    isSyndicated: readBoolean(source.isSyndicated, "syndication flag"),
    supportsDirectDemand: readBoolean(
      source.supportsDirectDemand,
      "direct-demand support flag",
    ),
    supportsIndiaRelevance: readBoolean(
      source.supportsIndiaRelevance,
      "India support flag",
    ),
    supportedFieldPaths: stringArray(source.supportedFieldPaths),
  };
}

function scoreEvidenceSource(value: unknown) {
  const source = readRecord(value, "score evidence");
  return {
    id: readString(source.id, "score evidence id"),
    sourceUrl: readString(source.sourceUrl, "score evidence URL"),
    sourceName: readString(source.sourceName, "score evidence source name"),
    supportedFieldPaths: stringArray(source.supportedFieldPaths),
  };
}

function languageDirection(language: string): "ltr" | "rtl" {
  const primary = language.toLowerCase().split("-")[0];
  return ["ar", "dv", "fa", "he", "ps", "ur"].includes(primary)
    ? "rtl"
    : "ltr";
}

function originalLanguageEvidence(value: unknown) {
  const source = readRecord(value, "evidence");
  const lang = readString(source.sourceLanguage, "source language");
  return {
    id: readString(source.id, "evidence id"),
    sourceUrl: readString(source.sourceUrl, "evidence URL"),
    sourceName: readString(source.sourceName, "evidence source name"),
    lang,
    dir: languageDirection(lang),
    claim: readString(source.evidenceClaim, "evidence claim"),
    excerpt: nullableString(source.sourceExcerpt),
  };
}

function englishEvidence(value: unknown) {
  const source = readRecord(value, "evidence");
  return {
    id: readString(source.id, "evidence id"),
    sourceUrl: readString(source.sourceUrl, "evidence URL"),
    lang: "en" as const,
    summary: readString(source.englishSummary, "English evidence summary"),
    translationConfidence: nullableNumber(source.translationConfidence),
  };
}

function historyItem(value: unknown) {
  const source = readRecord(value, "history item");
  return {
    id: readString(source.id, "history id"),
    updateType: readString(source.updateType, "history update type"),
    previousSafeState: safeJson(source.previousSafeState),
    newSafeState: safeJson(source.newSafeState),
    evidenceId: nullableString(source.evidenceId),
    actorType: readString(source.actorType, "history actor type"),
    actorEmail: nullableString(source.actorEmail),
    reason: readString(source.reason, "history reason"),
    observedAt: isoTimestamp(source.observedAt, "history observation"),
    createdAt: isoTimestamp(source.createdAt, "history creation"),
  };
}

function note(value: unknown) {
  const source = readRecord(value, "administrator note");
  return {
    id: readString(source.id, "administrator note id"),
    body: readString(source.body, "administrator note body"),
    actorEmail: nullableString(source.actorEmail),
    observedAt: isoTimestamp(source.observedAt, "note observation"),
    createdAt: isoTimestamp(source.createdAt, "note creation"),
  };
}

export function serializeGlobalRadarSignalListItem(value: unknown) {
  const source = readRecord(value, "signal list item");
  return {
    id: readString(source.id, "signal id"),
    signalClass: readString(source.signalClass, "signal class"),
    title: readString(source.title, "signal title"),
    factualSummary: readString(source.factualSummary, "signal factual summary"),
    theme: readString(source.theme, "signal theme"),
    sourceCountry: readString(source.sourceCountry, "signal source country"),
    demandDomain: readString(source.demandDomain, "signal demand domain"),
    indiaRelevanceType: readString(
      source.indiaRelevanceType,
      "India relevance type",
    ),
    status: readString(source.status, "signal status"),
    score: nullableNumber(source.score),
    expiresAt: nullableIsoTimestamp(source.expiresAt),
    reobserveBy: nullableIsoTimestamp(source.reobserveBy),
    observedAt: isoTimestamp(source.observedAt, "signal observation"),
    revision: readNumber(source.revision, "signal revision"),
    organisation: entitySummary(source.entity),
  };
}

export function serializeGlobalRadarWatchlistItem(value: unknown) {
  const source = readRecord(value, "watchlist item");
  const entity = readRecord(source.entity, "watchlist entity");
  const expiry =
    source.expiry === null || source.expiry === undefined
      ? null
      : readRecord(source.expiry, "watchlist expiry");
  const promotion =
    source.promotion === null || source.promotion === undefined
      ? null
      : readRecord(source.promotion, "watchlist promotion");
  return {
    id: readString(source.id, "watchlist id"),
    globalEntityId: readString(source.globalEntityId, "watchlist entity id"),
    state: readString(source.state, "watchlist state"),
    priority: readNumber(source.priority, "watchlist priority"),
    theme: readString(source.theme, "watchlist theme"),
    category: readString(source.category, "watchlist category"),
    categorySearchTermEn: readString(
      source.categorySearchTermEn,
      "watchlist English search term",
    ),
    categorySearchTermZhCn: nullableString(source.categorySearchTermZhCn),
    countries: stringArray(source.countries),
    languages: stringArray(source.languages),
    cadenceDays: readNumber(source.cadenceDays, "watchlist cadence"),
    nextScanAt: nullableIsoTimestamp(source.nextScanAt),
    reason: readString(source.reason, "watchlist reason"),
    revision: readNumber(source.revision, "watchlist revision"),
    entity: {
      canonicalName: readString(entity.canonicalName, "watchlist entity name"),
      headquartersCountry: readString(
        entity.headquartersCountry,
        "watchlist entity country",
      ),
      entityStatus: readString(entity.entityStatus, "watchlist entity status"),
      revision: readNumber(entity.revision, "watchlist entity revision"),
    },
    latestSignal:
      source.latestSignal === null || source.latestSignal === undefined
        ? null
        : serializeGlobalRadarSignalListItem(source.latestSignal),
    expiry: expiry
      ? {
          expiresAt: nullableIsoTimestamp(expiry.expiresAt),
          reobserveBy: nullableIsoTimestamp(expiry.reobserveBy),
        }
      : null,
    promotion: promotion
      ? {
          id: readString(promotion.id, "watchlist promotion id"),
          status: readString(
            promotion.status,
            "watchlist promotion status",
          ),
          discoveryCandidateId: nullableString(
            promotion.discoveryCandidateId,
          ),
          promotedAt: nullableIsoTimestamp(promotion.promotedAt),
          reversedAt: nullableIsoTimestamp(promotion.reversedAt),
        }
      : null,
  };
}

export function serializeGlobalRadarMutationEntity(value: unknown) {
  const source = readRecord(value, "mutation entity");
  return {
    id: readString(source.id, "mutation entity id"),
    canonicalName: readString(
      source.canonicalName,
      "mutation entity name",
    ),
    headquartersCountry: readString(
      source.headquartersCountry,
      "mutation entity country",
    ),
    entityStatus: readString(source.entityStatus, "mutation entity status"),
    revision: readNumber(source.revision, "mutation entity revision"),
  };
}

export function serializeGlobalRadarMutationWatchlistEntry(value: unknown) {
  const source = readRecord(value, "mutation watchlist entry");
  return {
    id: readString(source.id, "mutation watchlist id"),
    globalEntityId: readString(
      source.globalEntityId,
      "mutation watchlist entity id",
    ),
    state: readString(source.state, "mutation watchlist state"),
    priority: readNumber(source.priority, "mutation watchlist priority"),
    theme: readString(source.theme, "mutation watchlist theme"),
    category: readString(source.category, "mutation watchlist category"),
    categorySearchTermEn: readString(
      source.categorySearchTermEn,
      "mutation watchlist English search term",
    ),
    categorySearchTermZhCn: nullableString(source.categorySearchTermZhCn),
    countries: stringArray(source.countries),
    languages: stringArray(source.languages),
    cadenceDays: readNumber(
      source.cadenceDays,
      "mutation watchlist cadence",
    ),
    nextScanAt: nullableIsoTimestamp(source.nextScanAt),
    reason: readString(source.reason, "mutation watchlist reason"),
    revision: readNumber(source.revision, "mutation watchlist revision"),
  };
}

export function serializeGlobalRadarPromotion(value: unknown) {
  if (value === null || value === undefined) return null;
  const source = readRecord(value, "promotion");
  const revisionContext =
    source.revisionContext !== null &&
    typeof source.revisionContext === "object" &&
    !Array.isArray(source.revisionContext)
      ? readRecord(source.revisionContext, "promotion revision context")
      : {
          expectedEntity: source.expectedEntityRevision,
          expectedPrimarySignal: source.expectedPrimarySignalRevision,
          promotedEntity: source.promotedEntityRevision,
          promotedPrimarySignal: source.promotedPrimarySignalRevision,
        };
  return {
    id: readString(source.id, "promotion id"),
    globalEntityId: readString(source.globalEntityId, "promotion entity id"),
    primarySignalId: readString(source.primarySignalId, "primary signal id"),
    supportingSignalIds: stringArray(source.supportingSignalIds),
    eligibilityPath: readString(
      source.eligibilityPath,
      "promotion eligibility path",
    ),
    discoveryRunId: nullableString(source.discoveryRunId),
    discoveryCandidateId: nullableString(source.discoveryCandidateId),
    status: readString(source.status, "promotion status"),
    promotedAt: nullableIsoTimestamp(source.promotedAt),
    reversedAt: nullableIsoTimestamp(source.reversedAt),
    revisionContext: {
      expectedEntity: readNumber(
        revisionContext.expectedEntity,
        "expected entity revision",
      ),
      expectedPrimarySignal: readNumber(
        revisionContext.expectedPrimarySignal,
        "expected primary signal revision",
      ),
      promotedEntity: nullableNumber(revisionContext.promotedEntity),
      promotedPrimarySignal: nullableNumber(
        revisionContext.promotedPrimarySignal,
      ),
    },
    createdAt: isoTimestamp(source.createdAt, "promotion creation"),
    updatedAt: isoTimestamp(source.updatedAt, "promotion update"),
  };
}

const runNoticeMessages = {
  lease_expired: "The worker lease expired before completion.",
  run_failed: "The run ended without a completed batch.",
  source_errors: "One or more public sources could not be processed.",
} as const;

export function serializeGlobalRadarRun(value: unknown) {
  const source = readRecord(value, "run");
  const numberSourceErrors = readNumber(
    source.numberSourceErrors,
    "run source-error count",
  );
  const notices = new Map<keyof typeof runNoticeMessages, number | undefined>();
  if (Array.isArray(source.notices)) {
    for (const item of source.notices) {
      const notice = readRecord(item, "run notice");
      const code = notice.code;
      if (typeof code === "string" && code in runNoticeMessages) {
        notices.set(
          code as keyof typeof runNoticeMessages,
          typeof notice.count === "number" ? notice.count : undefined,
        );
      }
    }
  }
  if (source.failure && typeof source.failure === "object") {
    const failure = readRecord(source.failure, "run failure");
    notices.set(
      failure.code === "lease_expired" ? "lease_expired" : "run_failed",
      undefined,
    );
  }
  if (numberSourceErrors > 0) notices.set("source_errors", numberSourceErrors);
  return {
    id: readString(source.id, "run id"),
    trigger: readString(source.trigger, "run trigger"),
    scanMode: readString(source.scanMode, "run scan mode"),
    status: readString(source.status, "run status"),
    startedAt: nullableIsoTimestamp(source.startedAt),
    completedAt: nullableIsoTimestamp(source.completedAt),
    sourceCountries: stringArray(source.sourceCountries),
    sourceLanguages: stringArray(source.sourceLanguages),
    targetDomains: stringArray(source.targetDomains),
    targetSignalTypes: stringArray(source.targetSignalTypes),
    sourcesUsed: stringArray(source.sourcesUsed),
    counts: {
      resultsExamined: readNumber(
        source.numberResultsExamined,
        "run results count",
      ),
      entitiesObserved: readNumber(
        source.numberEntitiesObserved,
        "run entity count",
      ),
      signalsFound: readNumber(source.numberSignalsFound, "run signal count"),
      directDemands: readNumber(
        source.numberDirectDemands,
        "run direct-demand count",
      ),
      precursors: readNumber(source.numberPrecursors, "run precursor count"),
      momentumRecords: readNumber(
        source.numberMomentumRecords,
        "run momentum count",
      ),
      new: readNumber(source.numberNew, "run new count"),
      updated: readNumber(source.numberUpdated, "run updated count"),
      duplicates: readNumber(source.numberDuplicates, "run duplicate count"),
      rejectedForWeakEvidence: readNumber(
        source.numberRejectedForWeakEvidence,
        "run rejection count",
      ),
      sourceErrors: numberSourceErrors,
    },
    notices: [...notices].map(([code, count]) => ({
      code,
      message: runNoticeMessages[code],
      ...(count === undefined ? {} : { count }),
    })),
    createdAt: isoTimestamp(source.createdAt, "run creation"),
    updatedAt: isoTimestamp(source.updatedAt, "run update"),
  };
}

export function serializeGlobalRadarSignalDetail(value: unknown) {
  const source = readRecord(value, "signal detail");
  const signal = readRecord(source.signal, "detail signal");
  const timeline = readRecord(source.timeline, "detail timeline");
  const systemsContext = readRecord(
    source.systemsContext,
    "detail systems context",
  );
  const compliance = readRecord(source.compliance, "detail compliance");
  const requirements = childCollection(source.requirements, requirement);
  const evidence = childCollection(source.evidence, (item) => item);
  const history = childCollection(source.history, historyItem);
  const notes = childCollection(source.notes, note);
  const associated = childCollection(source.associatedOrganisations, (item) => {
    const association = readRecord(item, "associated organisation");
    return {
      role: readString(association.role, "association role"),
      confidence: readNumber(association.confidence, "association confidence"),
      organisation: organisation(association.organisation),
    };
  });
  const scoreRationale = readRecord(
    source.scoreRationale,
    "score rationale",
  );
  const signalClass = readString(signal.signalClass, "signal class");
  const activeScoreKey =
    signalClass === "direct_demand"
      ? "directDemand"
      : signalClass === "demand_precursor"
        ? "precursor"
        : "momentum";
  const activeScore = readRecord(
    scoreRationale[activeScoreKey],
    "active score rationale",
  );
  if (
    signalClass !== "direct_demand" &&
    signalClass !== "demand_precursor" &&
    signalClass !== "ecosystem_momentum"
  ) {
    throw new Error("Invalid Global Radar signal class.");
  }
  const componentEvidence = deriveScoreComponentEvidenceAssociations({
    signalClass,
    signalType: readString(signal.signalType, "signal type"),
    indiaRelevanceType: readString(
      signal.indiaRelevanceType,
      "India relevance type",
    ),
    components: activeScore,
    evidence: evidence.items.map(scoreEvidenceSource),
  });
  const physicalRequirements = requirements.items.filter((item) => {
    const candidate = item as { kind: string };
    return ["physical_data", "robotics_hardware", "manufacturing"].includes(
      candidate.kind,
    );
  });
  const archetypes = [
    ...new Set(
      requirements.items.flatMap((item) =>
        ((item as { indianExecutionArchetypes: string[] | null })
          .indianExecutionArchetypes ?? []),
      ),
    ),
  ];
  const allowedActions = stringArray(source.allowedActions);
  const sectionData: Record<
    (typeof GLOBAL_RADAR_DETAIL_SECTION_IDS)[number],
    unknown
  > = {
    organisation: {
      primary: organisation(source.organisation),
      associated,
    },
    what_changed: {
      title: readString(signal.title, "signal title"),
      observedAt: isoTimestamp(signal.observedAt, "signal observation"),
      firstSeenAt: isoTimestamp(signal.firstSeenAt, "signal first seen"),
      lastSeenAt: isoTimestamp(signal.lastSeenAt, "signal last seen"),
    },
    signal_class: {
      signalClass,
      signalType: readString(signal.signalType, "signal type"),
      theme: readString(signal.theme, "signal theme"),
      demandDomain: readString(signal.demandDomain, "signal demand domain"),
      sourceCountry: readString(signal.sourceCountry, "signal source country"),
      industry: readString(signal.industry, "signal industry"),
      status: readString(signal.status, "signal status"),
    },
    publicly_supported_facts: {
      factualSummary: readString(
        signal.factualSummary,
        "signal factual summary",
      ),
      targetGeographies: nullableStringArray(signal.targetGeographies),
      collectionGeographies: nullableStringArray(signal.collectionGeographies),
      manufacturingGeographies: nullableStringArray(
        signal.manufacturingGeographies,
      ),
      deliveryGeographies: nullableStringArray(signal.deliveryGeographies),
      targetModelOrSystem: nullableString(signal.targetModelOrSystem),
    },
    mewtuals_interpretation: {
      summary: readString(
        signal.interpretationSummary,
        "signal interpretation",
      ),
    },
    required_capabilities: {
      targetCapabilityTags: nullableStringArray(signal.targetCapabilityTags),
      requiredCounterpartyArchetypes: nullableStringArray(
        signal.requiredCounterpartyArchetypes,
      ),
      requirements: {
        total: requirements.total,
        truncated: requirements.truncated,
        items: requirements.items.map((item) => {
          const candidate = item as ReturnType<typeof requirement>;
          return {
            id: candidate.id,
            kind: candidate.kind,
            capabilityTag: candidate.capabilityTag,
            summary: candidate.summary,
            confidence: candidate.confidence,
          };
        }),
      },
    },
    physical_data_or_hardware_specifications: {
      items: physicalRequirements,
    },
    target_environments_and_tasks: {
      items: requirements.items.map((item) => {
        const candidate = item as ReturnType<typeof requirement>;
        return {
          requirementId: candidate.id,
          environments: candidate.environments,
          taskFamilies: candidate.taskFamilies,
          collectionMethods: candidate.collectionMethods,
          humanRoles: candidate.humanRoles,
          robotEmbodiments: candidate.robotEmbodiments,
        };
      }),
    },
    indian_execution_archetypes: { items: archetypes },
    india_fit_reasoning_and_constraints: {
      relevanceType: readString(
        signal.indiaRelevanceType,
        "India relevance type",
      ),
      rationale: readString(
        signal.indiaRelevanceRationale,
        "India relevance rationale",
      ),
      reasons: stringArray(signal.indiaFitReasons),
      constraints: stringArray(signal.indiaFitConstraints),
      unknowns: stringArray(signal.indiaFitUnknowns),
      confidence: readNumber(signal.indiaFitConfidence, "India fit confidence"),
      regulatoryFacts: safeJson(signal.indiaRegulatoryFacts),
      logisticsFacts: safeJson(signal.indiaLogisticsFacts),
    },
    systems_context_explanation: {
      summary: nullableString(systemsContext.summary),
      stackType: nullableString(systemsContext.stackType),
      higherLevelSystemGoal: nullableString(systemsContext.higherLevelSystemGoal),
      relevantStackLayer: nullableString(systemsContext.relevantStackLayer),
      lowerLevelInputsRequired: nullableStringArray(
        systemsContext.lowerLevelInputsRequired,
      ),
      transformationOrCapabilityAdded: nullableString(
        systemsContext.transformationOrCapabilityAdded,
      ),
      downstreamModelOrRobotBehavior: nullableString(
        systemsContext.downstreamModelOrRobotBehavior,
      ),
      whyTheRequirementMatters: nullableString(
        systemsContext.whyTheRequirementMatters,
      ),
      possibleIndianExecutionRole: nullableString(
        systemsContext.possibleIndianExecutionRole,
      ),
      factualElements: nullableStringArray(systemsContext.factualElements),
      inferredElements: nullableStringArray(systemsContext.inferredElements),
    },
    scale_and_timeline: {
      timeline: {
        announcedAt: nullableIsoTimestamp(timeline.announcedAt),
        effectiveFrom: nullableIsoTimestamp(timeline.effectiveFrom),
        expiresAt: nullableIsoTimestamp(timeline.expiresAt),
        evergreen: nullableBoolean(timeline.evergreen),
        reobserveBy: nullableIsoTimestamp(timeline.reobserveBy),
        observedAt: isoTimestamp(timeline.observedAt, "timeline observation"),
      },
      requirements: requirements.items.map((item) => {
        const candidate = item as ReturnType<typeof requirement>;
        return {
          requirementId: candidate.id,
          scaleSpecification: candidate.scaleSpecification,
        };
      }),
    },
    public_response_path: {
      evidenceOnly: true,
      type: nullableString(signal.responsePathType),
      url: nullableString(signal.responsePathUrl),
      businessEmail: nullableString(signal.responseBusinessEmail),
      partnerApplicationUrl: nullableString(signal.partnerApplicationUrl),
    },
    compliance_flags: {
      sensitiveDataFlags: safeJson(
        readRecord(compliance.sensitiveDataFlags, "sensitive data flags"),
      ),
      facts: safeJson(readRecord(compliance.facts, "compliance facts")),
    },
    supporting_evidence: {
      total: evidence.total,
      truncated: evidence.truncated,
      items: evidence.items.map(evidenceCitation),
    },
    original_language_source: {
      total: evidence.total,
      truncated: evidence.truncated,
      items: evidence.items.map(originalLanguageEvidence),
    },
    english_summary: {
      total: evidence.total,
      truncated: evidence.truncated,
      items: evidence.items.map(englishEvidence),
    },
    score_rationale: {
      activeClass: signalClass,
      score: nullableNumber(activeScore.score),
      coverage: readNumber(scoreRationale.coverage, "score coverage"),
      policyVersion: readString(
        scoreRationale.policyVersion,
        "score policy version",
      ),
      evidenceVersion: GLOBAL_RADAR_SCORE_EVIDENCE_VERSION,
      components: safeJson(
        Object.fromEntries(
          Object.entries(activeScore).filter(([key]) => key !== "score"),
        ),
      ),
      componentEvidence,
    },
    signal_history: history,
    admin_notes_and_actions: {
      notes,
      watchlist:
        source.watchlist === null || source.watchlist === undefined
          ? null
          : serializeGlobalRadarWatchlistItem(source.watchlist),
      promotion: serializeGlobalRadarPromotion(source.promotion),
      allowedActions,
    },
  };
  return {
    id: readString(signal.id, "signal id"),
    revision: readNumber(signal.revision, "signal revision"),
    signalClass,
    status: readString(signal.status, "signal status"),
    allowedActions,
    sections: GLOBAL_RADAR_DETAIL_SECTIONS.map(([id, title]) => ({
      id,
      title,
      data: sectionData[id],
    })),
  };
}
