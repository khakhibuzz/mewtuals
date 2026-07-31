export type GlobalRadarTab =
  | "direct-demand"
  | "demand-precursors"
  | "momentum"
  | "watchlist"
  | "runs";

export type GlobalRadarSignalClass =
  | "direct_demand"
  | "demand_precursor"
  | "ecosystem_momentum";

export type GlobalRadarSignalStatus =
  | "newly_discovered"
  | "needs_review"
  | "monitoring"
  | "qualified"
  | "dismissed"
  | "expired"
  | "promoted";

export type GlobalRadarSignalListItem = Readonly<{
  id: string;
  signalClass: GlobalRadarSignalClass;
  title: string;
  factualSummary: string;
  theme: string;
  sourceCountry: string;
  demandDomain: string;
  indiaRelevanceType: string;
  status: GlobalRadarSignalStatus;
  score: number | null;
  expiresAt: string | null;
  reobserveBy: string | null;
  observedAt: string;
  revision: number;
  organisation: null | Readonly<{
    id: string;
    canonicalName: string;
    headquartersCountry: string;
  }>;
}>;

export type GlobalRadarClassMetrics = Readonly<{
  total: number;
  highQuality: number;
  byStatus: Readonly<Record<string, number>>;
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

export type GlobalRadarOverviewMetrics = Readonly<{
  newSignals: number;
  activeDirectDemand: number;
  highQualityPrecursors: number;
  india: Readonly<{ explicit: number; inferred: number }>;
  countries: Readonly<{ unitedStates: number; china: number; other: number }>;
  requirementMix: Readonly<{ physicalData: number; hardware: number }>;
  capabilityFamilies: readonly Readonly<{
    capability: string;
    signals: number;
  }>[];
  expiringDirectDemand: number;
  promotionCount: number;
  latestRun: null | Readonly<{
    id: string;
    status: string;
    completedAt: string | null;
    createdAt: string;
  }>;
  sourceErrors: number;
  mergedDuplicates: number;
}>;

export type GlobalRadarClassSummary = Readonly<{
  outcome: "listed";
  page: number;
  pageSize: number;
  total: number;
  hasAnySignals: boolean;
  items: readonly GlobalRadarSignalListItem[];
  metrics: Readonly<{ class: GlobalRadarClassMetrics }> &
    GlobalRadarOverviewMetrics;
}>;

export type GlobalRadarWatchlistItem = Readonly<{
  id: string;
  globalEntityId: string;
  state: "enabled" | "paused" | "disabled";
  priority: number;
  theme: string;
  category: string;
  categorySearchTermEn: string;
  categorySearchTermZhCn: string | null;
  countries: readonly string[];
  languages: readonly string[];
  cadenceDays: number;
  nextScanAt: string | null;
  reason: string;
  revision: number;
  entity: Readonly<{
    canonicalName: string;
    headquartersCountry: string;
    entityStatus: string;
    revision: number;
  }>;
  latestSignal: GlobalRadarSignalListItem | null;
  expiry: null | Readonly<{
    expiresAt: string | null;
    reobserveBy: string | null;
  }>;
  promotion: null | Readonly<{
    id: string;
    status: string;
    discoveryCandidateId: string | null;
    promotedAt: string | null;
    reversedAt: string | null;
  }>;
}>;

export type GlobalRadarMutationEntity = Readonly<{
  id: string;
  canonicalName: string;
  headquartersCountry: string;
  entityStatus: string;
  revision: number;
}>;

export type GlobalRadarMutationWatchlistEntry = Readonly<{
  id: string;
  globalEntityId: string;
  state: "enabled" | "paused" | "disabled";
  priority: number;
  theme: string;
  category: string;
  categorySearchTermEn: string;
  categorySearchTermZhCn: string | null;
  countries: readonly string[];
  languages: readonly string[];
  cadenceDays: number;
  nextScanAt: string | null;
  reason: string;
  revision: number;
}>;

export type GlobalRadarRunItem = Readonly<{
  id: string;
  trigger: "scheduled" | "manual" | "trial";
  scanMode: "daily" | "thematic" | "watchlist_refresh" | "manual";
  status: "queued" | "running" | "succeeded" | "partial" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  sourceCountries: readonly string[];
  sourceLanguages: readonly string[];
  targetDomains: readonly string[];
  targetSignalTypes: readonly string[];
  sourcesUsed: readonly string[];
  counts: Readonly<{
    resultsExamined: number;
    entitiesObserved: number;
    signalsFound: number;
    directDemands: number;
    precursors: number;
    momentumRecords: number;
    new: number;
    updated: number;
    duplicates: number;
    rejectedForWeakEvidence: number;
    sourceErrors: number;
  }>;
  notices: readonly Readonly<{
    code: "lease_expired" | "run_failed" | "source_errors";
    message: string;
    count?: number;
  }>[];
  createdAt: string;
  updatedAt: string;
}>;

export const GLOBAL_RADAR_UI_DETAIL_SECTIONS = [
  ["organisation", "Organisation"],
  ["what_changed", "What changed"],
  ["signal_class", "Signal class"],
  ["publicly_supported_facts", "Publicly supported facts"],
  ["mewtuals_interpretation", "Mewtuals interpretation"],
  ["required_capabilities", "Required capabilities"],
  ["physical_data_or_hardware_specifications", "Physical-data or hardware specifications"],
  ["target_environments_and_tasks", "Target environments and tasks"],
  ["indian_execution_archetypes", "Indian execution archetypes"],
  ["india_fit_reasoning_and_constraints", "India-fit reasoning and constraints"],
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

export type GlobalRadarDetailSectionId =
  (typeof GLOBAL_RADAR_UI_DETAIL_SECTIONS)[number][0];

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

export type GlobalRadarSignalDetail = Readonly<{
  id: string;
  revision: number;
  signalClass: GlobalRadarSignalClass;
  status: GlobalRadarSignalStatus;
  allowedActions: readonly GlobalRadarAllowedAction[];
  sections: readonly Readonly<{
    id: GlobalRadarDetailSectionId;
    title: string;
    data: Readonly<Record<string, unknown>>;
  }>[];
}>;

export function isGlobalRadarRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function hasExactGlobalRadarKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isInteger(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isInteger(value) &&
    value >= minimum && value <= maximum;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isGlobalRadarMutationEntity(
  value: unknown,
): value is GlobalRadarMutationEntity {
  if (!isGlobalRadarRecord(value) || !hasExactGlobalRadarKeys(value, [
    "id",
    "canonicalName",
    "headquartersCountry",
    "entityStatus",
    "revision",
  ])) return false;
  return typeof value.id === "string" &&
    typeof value.canonicalName === "string" &&
    typeof value.headquartersCountry === "string" &&
    typeof value.entityStatus === "string" && isInteger(value.revision);
}

export function isGlobalRadarMutationWatchlistEntry(
  value: unknown,
): value is GlobalRadarMutationWatchlistEntry {
  if (!isGlobalRadarRecord(value) || !hasExactGlobalRadarKeys(value, [
    "id",
    "globalEntityId",
    "state",
    "priority",
    "theme",
    "category",
    "categorySearchTermEn",
    "categorySearchTermZhCn",
    "countries",
    "languages",
    "cadenceDays",
    "nextScanAt",
    "reason",
    "revision",
  ])) return false;
  return typeof value.id === "string" &&
    typeof value.globalEntityId === "string" &&
    ["enabled", "paused", "disabled"].includes(String(value.state)) &&
    isInteger(value.priority, 0, 100) && typeof value.theme === "string" &&
    typeof value.category === "string" &&
    typeof value.categorySearchTermEn === "string" &&
    isNullableString(value.categorySearchTermZhCn) &&
    isStringArray(value.countries) && isStringArray(value.languages) &&
    isInteger(value.cadenceDays, 1, 365) && isNullableString(value.nextScanAt) &&
    typeof value.reason === "string" && isInteger(value.revision);
}

export function isGlobalRadarRunItem(value: unknown): value is GlobalRadarRunItem {
  if (!isGlobalRadarRecord(value) || !hasExactGlobalRadarKeys(value, [
    "id",
    "trigger",
    "scanMode",
    "status",
    "startedAt",
    "completedAt",
    "sourceCountries",
    "sourceLanguages",
    "targetDomains",
    "targetSignalTypes",
    "sourcesUsed",
    "counts",
    "notices",
    "createdAt",
    "updatedAt",
  ])) return false;
  if (!isGlobalRadarRecord(value.counts) || !hasExactGlobalRadarKeys(value.counts, [
    "resultsExamined",
    "entitiesObserved",
    "signalsFound",
    "directDemands",
    "precursors",
    "momentumRecords",
    "new",
    "updated",
    "duplicates",
    "rejectedForWeakEvidence",
    "sourceErrors",
  ])) return false;
  if (!Object.values(value.counts).every((count) => isInteger(count))) return false;
  if (!Array.isArray(value.notices) || !value.notices.every((notice) => {
    if (!isGlobalRadarRecord(notice)) return false;
    const keys = notice.count === undefined
      ? ["code", "message"]
      : ["code", "message", "count"];
    return hasExactGlobalRadarKeys(notice, keys) &&
      ["lease_expired", "run_failed", "source_errors"].includes(String(notice.code)) &&
      typeof notice.message === "string" &&
      (notice.count === undefined || isInteger(notice.count));
  })) return false;
  return typeof value.id === "string" &&
    ["scheduled", "manual", "trial"].includes(String(value.trigger)) &&
    ["daily", "thematic", "watchlist_refresh", "manual"].includes(String(value.scanMode)) &&
    ["queued", "running", "succeeded", "partial", "failed"].includes(String(value.status)) &&
    isNullableString(value.startedAt) && isNullableString(value.completedAt) &&
    isStringArray(value.sourceCountries) && isStringArray(value.sourceLanguages) &&
    isStringArray(value.targetDomains) && isStringArray(value.targetSignalTypes) &&
    isStringArray(value.sourcesUsed) && typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string";
}

const globalRadarAllowedActionValues = new Set<string>([
  "request_review",
  "monitor",
  "qualify",
  "dismiss",
  "expire",
  "reopen",
  "mark_no_india_fit",
  "edit_classification",
  "edit_expiry",
  "append_evidence",
  "append_note",
  "merge",
  "edit_watchlist",
  "qualify_entity",
  "promote",
  "reverse_promotion",
]);

export function isGlobalRadarSignalDetail(
  value: unknown,
): value is GlobalRadarSignalDetail {
  if (!isGlobalRadarRecord(value) || !hasExactGlobalRadarKeys(value, [
    "id",
    "revision",
    "signalClass",
    "status",
    "allowedActions",
    "sections",
  ])) return false;
  if (typeof value.id !== "string" || !isInteger(value.revision) ||
      !["direct_demand", "demand_precursor", "ecosystem_momentum"].includes(String(value.signalClass)) ||
      !["newly_discovered", "needs_review", "monitoring", "qualified", "dismissed", "expired", "promoted"].includes(String(value.status)) ||
      !Array.isArray(value.allowedActions) ||
      !value.allowedActions.every((action) => typeof action === "string" && globalRadarAllowedActionValues.has(action)) ||
      !Array.isArray(value.sections) ||
      value.sections.length !== GLOBAL_RADAR_UI_DETAIL_SECTIONS.length) return false;
  return value.sections.every((section, index) => {
    if (!isGlobalRadarRecord(section) || !hasExactGlobalRadarKeys(section, ["id", "title", "data"])) return false;
    const expected = GLOBAL_RADAR_UI_DETAIL_SECTIONS[index];
    return section.id === expected?.[0] && section.title === expected[1] &&
      isGlobalRadarRecord(section.data);
  });
}
