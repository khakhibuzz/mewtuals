export type GlobalRadarTab =
  | "direct-demand"
  | "demand-precursors"
  | "momentum"
  | "watchlist"
  | "runs";

export type GlobalRadarMetric = Readonly<{
  id: string;
  label: string;
  value: number | string;
}>;

export type GlobalRadarSignalListItem = Readonly<{
  id: string;
  signalClass: "direct_demand" | "demand_precursor" | "ecosystem_momentum";
  title: string;
  factualSummary: string;
  demandDomain: string;
  sourceCountry: string;
  indiaRelevanceType: string;
  status: string;
  score: number | null;
  observedAt: string;
  expiresAt: string | null;
  reobserveBy: string | null;
  revision: number;
  entity: null | Readonly<{
    id: string;
    canonicalName: string;
    headquartersCountry: string;
  }>;
}>;

export type GlobalRadarSignalListSnapshot = Readonly<{
  classLabel: string;
  hasAnySignals: boolean;
  total: number;
  page: number;
  pageSize: number;
  metrics: readonly GlobalRadarMetric[];
  items: readonly GlobalRadarSignalListItem[];
}>;

export type GlobalRadarWatchlistItem = Readonly<{
  entity: Readonly<{
    id: string;
    canonicalName: string;
    headquartersCountry: string;
  }>;
  latestSignal: null | Readonly<{
    id: string;
    title: string;
    signalClass: "direct_demand" | "demand_precursor" | "ecosystem_momentum";
    status: string;
    observedAt: string;
  }>;
  monitoringState: "active" | "paused" | "disabled";
  priority: number;
  cadence: "daily" | "weekly" | "monthly";
  nextScanAt: string | null;
  expiresAt: string | null;
  promotionState: "not_promoted" | "active" | "reversed" | "conflicted";
  revision: number;
}>;

export type GlobalRadarRunItem = Readonly<{
  id: string;
  status: "queued" | "running" | "succeeded" | "partial" | "failed";
  trigger: "scheduled" | "manual" | "trial";
  scanMode: "daily" | "thematic" | "watchlist_refresh" | "manual";
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  resultsExamined: number;
  entitiesObserved: number;
  signalsFound: number;
  numberNew: number;
  numberUpdated: number;
  numberDuplicates: number;
  sourceErrorCount: number;
  notice: string | null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function isGlobalRadarWatchlistItem(
  value: unknown,
): value is GlobalRadarWatchlistItem {
  if (!isRecord(value) || !hasExactKeys(value, [
    "entity",
    "latestSignal",
    "monitoringState",
    "priority",
    "cadence",
    "nextScanAt",
    "expiresAt",
    "promotionState",
    "revision",
  ])) return false;
  if (!isRecord(value.entity) || !hasExactKeys(value.entity, ["id", "canonicalName", "headquartersCountry"])) return false;
  if (
    typeof value.entity.id !== "string" ||
    typeof value.entity.canonicalName !== "string" ||
    typeof value.entity.headquartersCountry !== "string"
  ) return false;
  if (value.latestSignal !== null) {
    if (!isRecord(value.latestSignal) || !hasExactKeys(value.latestSignal, ["id", "title", "signalClass", "status", "observedAt"])) return false;
    if (
      typeof value.latestSignal.id !== "string" ||
      typeof value.latestSignal.title !== "string" ||
      !["direct_demand", "demand_precursor", "ecosystem_momentum"].includes(String(value.latestSignal.signalClass)) ||
      typeof value.latestSignal.status !== "string" ||
      typeof value.latestSignal.observedAt !== "string"
    ) return false;
  }
  return (
    ["active", "paused", "disabled"].includes(String(value.monitoringState)) &&
    Number.isInteger(value.priority) &&
    typeof value.priority === "number" &&
    value.priority >= 1 && value.priority <= 5 &&
    ["daily", "weekly", "monthly"].includes(String(value.cadence)) &&
    isNullableString(value.nextScanAt) &&
    isNullableString(value.expiresAt) &&
    ["not_promoted", "active", "reversed", "conflicted"].includes(String(value.promotionState)) &&
    Number.isInteger(value.revision) && typeof value.revision === "number" && value.revision >= 0
  );
}

export function isGlobalRadarRunItem(value: unknown): value is GlobalRadarRunItem {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id", "status", "trigger", "scanMode", "createdAt", "startedAt", "completedAt",
    "resultsExamined", "entitiesObserved", "signalsFound", "numberNew", "numberUpdated",
    "numberDuplicates", "sourceErrorCount", "notice",
  ])) return false;
  return (
    typeof value.id === "string" &&
    ["queued", "running", "succeeded", "partial", "failed"].includes(String(value.status)) &&
    ["scheduled", "manual", "trial"].includes(String(value.trigger)) &&
    ["daily", "thematic", "watchlist_refresh", "manual"].includes(String(value.scanMode)) &&
    typeof value.createdAt === "string" &&
    isNullableString(value.startedAt) &&
    isNullableString(value.completedAt) &&
    ["resultsExamined", "entitiesObserved", "signalsFound", "numberNew", "numberUpdated", "numberDuplicates", "sourceErrorCount"].every(
      (key) => typeof value[key] === "number" && Number.isInteger(value[key]) && (value[key] as number) >= 0,
    ) &&
    isNullableString(value.notice)
  );
}
