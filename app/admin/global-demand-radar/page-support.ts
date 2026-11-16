import { redirect } from "next/navigation";

import {
  globalRadarDemandFamilyLookup,
  globalRadarLeafIdentifierLookup,
  globalRadarThemes,
  indiaRelevanceTypeLookup,
  signalStatusLookup,
} from "../../domain/global-radar";
import { loadAdminPageContext } from "../../server/admin-page-context";
import { getGlobalRadarApplication } from "../../server/global-radar";
import type { GlobalRadarSignalClass, GlobalRadarTab } from "../../components/global-radar/types";

export type GlobalRadarPageSearchParams = Record<
  string,
  string | string[] | undefined
>;

export const GLOBAL_RADAR_CLASS_PAGES = {
  direct_demand: {
    path: "/admin/global-demand-radar/direct-demand",
    tab: "direct-demand",
  },
  demand_precursor: {
    path: "/admin/global-demand-radar/demand-precursors",
    tab: "demand-precursors",
  },
  ecosystem_momentum: {
    path: "/admin/global-demand-radar/momentum",
    tab: "momentum",
  },
} as const satisfies Record<
  GlobalRadarSignalClass,
  { path: string; tab: GlobalRadarTab }
>;

const commonSignalKeys = [
  "status",
  "country",
  "indiaRelevance",
  "demandDomain",
  "capability",
  "observedFrom",
  "observedTo",
] as const;

const classFilterKey: Record<GlobalRadarSignalClass, string> = {
  direct_demand: "expiresBefore",
  demand_precursor: "horizon",
  ecosystem_momentum: "theme",
};

const horizons = new Set([
  "within_30_days",
  "days_31_to_90",
  "days_91_to_180",
  "days_181_to_365",
  "unknown",
]);

function exactString(
  source: GlobalRadarPageSearchParams,
  key: string,
): string | undefined | null {
  const value = source[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.length > 200 || value !== value.trim()) {
    return null;
  }
  return value;
}

function calendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

function validPage(value: string) {
  return /^(?:[1-9]|[1-9]\d|100)$/.test(value);
}

function paramsObject(params: URLSearchParams): GlobalRadarPageSearchParams {
  const source: GlobalRadarPageSearchParams = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    source[key] = values.length === 1 ? values[0] : values;
  }
  return source;
}

export type ParsedGlobalRadarListQuery = Readonly<{
  filters: Readonly<Record<string, string>>;
  serviceFilters: Readonly<Record<string, string>>;
  canonicalPath: string;
}>;

export function parseGlobalRadarListQuery(
  signalClass: GlobalRadarSignalClass,
  source: GlobalRadarPageSearchParams | undefined,
): ParsedGlobalRadarListQuery | null {
  const input = source ?? {};
  const orderedKeys = [
    ...commonSignalKeys,
    classFilterKey[signalClass],
    "page",
  ];
  if (Object.keys(input).some((key) => !orderedKeys.includes(key))) return null;
  const filters: Record<string, string> = {};
  for (const key of orderedKeys) {
    const value = exactString(input, key);
    if (value === null) return null;
    if (value !== undefined) filters[key] = value;
  }
  if (filters.status && !signalStatusLookup[filters.status as keyof typeof signalStatusLookup]) return null;
  if (filters.indiaRelevance && !indiaRelevanceTypeLookup[filters.indiaRelevance as keyof typeof indiaRelevanceTypeLookup]) return null;
  if (filters.demandDomain && !globalRadarDemandFamilyLookup[filters.demandDomain as keyof typeof globalRadarDemandFamilyLookup]) return null;
  if (filters.capability && !globalRadarLeafIdentifierLookup[filters.capability as keyof typeof globalRadarLeafIdentifierLookup]) return null;
  if (filters.theme && !globalRadarThemes.includes(filters.theme as (typeof globalRadarThemes)[number])) return null;
  if (filters.horizon && !horizons.has(filters.horizon)) return null;
  for (const key of ["observedFrom", "observedTo", "expiresBefore"] as const) {
    if (filters[key] && !calendarDate(filters[key])) return null;
  }
  if (filters.observedFrom && filters.observedTo && filters.observedFrom > filters.observedTo) return null;
  if (filters.page && !validPage(filters.page)) return null;

  const canonical = new URLSearchParams();
  for (const key of orderedKeys) {
    const value = filters[key];
    if (value && !(key === "page" && value === "1")) canonical.set(key, value);
  }
  const query = canonical.toString();
  return {
    filters,
    serviceFilters: { ...filters },
    canonicalPath: `${GLOBAL_RADAR_CLASS_PAGES[signalClass].path}${query ? `?${query}` : ""}`,
  };
}

export type ParsedGlobalRadarPageQuery = Readonly<{
  page: number;
  filters: Readonly<Record<string, string>>;
  canonicalPath: string;
}>;

export function parseGlobalRadarPageQuery(
  tab: "watchlist" | "runs",
  source: GlobalRadarPageSearchParams | undefined,
): ParsedGlobalRadarPageQuery | null {
  const input = source ?? {};
  if (Object.keys(input).some((key) => key !== "page")) return null;
  const page = exactString(input, "page");
  if (page === null || (page !== undefined && !validPage(page))) return null;
  const number = page ? Number(page) : 1;
  const base = `/admin/global-demand-radar/${tab}`;
  return {
    page: number,
    filters: page ? { page } : {},
    canonicalPath: page && page !== "1" ? `${base}?page=${page}` : base,
  };
}

export function safeGlobalRadarReturnTo(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4_096 ||
      value.includes("\\") || value.includes("\0") || !value.startsWith("/") ||
      value.startsWith("//")) return fallback;
  try {
    const url = new URL(value, "https://radar.invalid");
    if (url.origin !== "https://radar.invalid" || url.hash) return fallback;
    const signalClass = (Object.entries(GLOBAL_RADAR_CLASS_PAGES) as [
      GlobalRadarSignalClass,
      (typeof GLOBAL_RADAR_CLASS_PAGES)[GlobalRadarSignalClass],
    ][]).find(([, page]) => page.path === url.pathname)?.[0];
    if (!signalClass) return fallback;
    return parseGlobalRadarListQuery(signalClass, paramsObject(url.searchParams))
      ?.canonicalPath ?? fallback;
  } catch {
    return fallback;
  }
}

export async function loadAuthorizedGlobalRadarAdmin() {
  const { database, session } = await loadAdminPageContext();
  if (!session) redirect("/network/join");
  const actor = { userId: session.user.id, email: session.user.email };
  const application = getGlobalRadarApplication({ database });
  // The invalid identifier is a no-I/O authorization probe: every admin method
  // checks the service-owned allowlist before validating its operation input.
  const authorization = await application.admin.getSignalDetail(actor, null);
  if (authorization.outcome === "forbidden") redirect("/dashboard");
  if (authorization.outcome !== "invalid") {
    throw new Error("Global Radar authorization contract is unavailable.");
  }
  return { actor, admin: application.admin };
}

export function globalRadarFallbackPath(signalClass: string) {
  return signalClass in GLOBAL_RADAR_CLASS_PAGES
    ? GLOBAL_RADAR_CLASS_PAGES[signalClass as GlobalRadarSignalClass].path
    : GLOBAL_RADAR_CLASS_PAGES.direct_demand.path;
}
