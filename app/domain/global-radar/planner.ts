import type { RadarScanMode } from "./contracts";
import {
  GLOBAL_RADAR_TAXONOMY_VERSION,
  globalRadarSourceFamilies,
  globalRadarThemes,
} from "../taxonomies/global-radar-v1";

export const GLOBAL_RADAR_PLAN_VERSION = "global-radar-plan-v1" as const;
export const GLOBAL_RADAR_QUERY_VERSION = "global-radar-query-v1" as const;

export type GlobalRadarTheme = (typeof globalRadarThemes)[number];
export type GlobalRadarSourceFamily = (typeof globalRadarSourceFamilies)[number];
export type GlobalRadarSourceAdapter = "codex_public_web";

export type PublicGlobalRadarPlanningConfig = {
  countries: readonly string[];
  languages: readonly string[];
  themes: readonly GlobalRadarTheme[];
  enabledSourceAdapters: readonly GlobalRadarSourceAdapter[];
  sourceFamilies: readonly GlobalRadarSourceFamily[];
  resultLimit: number;
  scoreVersion: string;
};

export type RadarCoverageState = {
  countryLastCoveredAt: Readonly<Record<string, string | null>>;
  themeLastCoveredAt: Readonly<Partial<Record<GlobalRadarTheme, string | null>>>;
  watchlistLastCoveredAt: Readonly<Record<string, string | null>>;
};

export type WatchlistPlanningInput = {
  category: string;
  theme: GlobalRadarTheme;
  countries: readonly string[];
  languages: readonly string[];
  cadenceDays: number;
  priority: number;
};

export type GlobalRadarPlannerInput = {
  now: Date;
  scanMode: RadarScanMode;
  config: PublicGlobalRadarPlanningConfig;
  requestedTheme?: GlobalRadarTheme;
  administratorRequestId?: string;
  coverageState: RadarCoverageState;
  watchlist: readonly WatchlistPlanningInput[];
};

export type RadarPlan = Readonly<{
  version: typeof GLOBAL_RADAR_PLAN_VERSION;
  queryVersion: typeof GLOBAL_RADAR_QUERY_VERSION;
  identityKey: string;
  fingerprint: string;
  configHash: string;
  scanMode: RadarScanMode;
  countries: readonly string[];
  languages: readonly string[];
  themes: readonly GlobalRadarTheme[];
  sourceAdapters: readonly GlobalRadarSourceAdapter[];
  sourceFamilies: readonly GlobalRadarSourceFamily[];
  dateWindow: Readonly<{
    startInclusive: string;
    endExclusive: string;
  }>;
  resultLimit: number;
  taxonomyVersion: typeof GLOBAL_RADAR_TAXONOMY_VERSION;
  scoreVersion: string;
  watchlist: readonly Readonly<WatchlistPlanningInput>[];
}>;

const KOLKATA_OFFSET_MILLISECONDS = 5.5 * 60 * 60 * 1_000;
const DAILY_RECENCY_DAYS = 30;
const THEMATIC_RECENCY_DAYS = 90;
const MANUAL_RECENCY_DAYS = 90;
const WATCHLIST_RECENCY_DAYS = 90;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function unique<const Value extends string>(values: readonly Value[]): Value[] {
  return [...new Set(values)];
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  const commonLength = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < commonLength; index += 1) {
    const difference = leftPoints[index] - rightPoints[index];
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}

function isChina(country: string): boolean {
  const normalized = country.toLowerCase();
  return normalized === "china" || normalized === "cn";
}

function normalizeChinaLanguages(
  countries: readonly string[],
  languages: readonly string[],
): string[] {
  const uniqueLanguages = unique(languages);
  if (uniqueLanguages.length === 0) return [];
  if (!countries.some(isChina)) return uniqueLanguages;
  return [
    "en",
    "zh-CN",
    ...uniqueLanguages.filter(
      (language) => language !== "en" && language !== "zh-CN",
    ),
  ];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function fnv1a32(value: string, seed: number): string {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function stableGlobalRadarFingerprint(value: unknown): string {
  const canonical = canonicalJson(value);
  return Array.from({ length: 8 }, (_, index) =>
    fnv1a32(canonical, Math.imul(index + 1, 0x9e3779b1)),
  ).join("");
}

function localDateParts(now: Date) {
  const local = new Date(now.getTime() + KOLKATA_OFFSET_MILLISECONDS);
  return {
    year: local.getUTCFullYear(),
    monthIndex: local.getUTCMonth(),
    day: local.getUTCDate(),
  };
}

function kolkataLocalDate(now: Date): string {
  const { year, monthIndex, day } = localDateParts(now);
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function kolkataMidnight(
  now: Date,
  dayOffset: number,
): string {
  const { year, monthIndex, day } = localDateParts(now);
  return new Date(
    Date.UTC(year, monthIndex, day + dayOffset) - KOLKATA_OFFSET_MILLISECONDS,
  ).toISOString();
}

function isoWeek(now: Date): { year: number; week: number } {
  const { year, monthIndex, day } = localDateParts(now);
  const date = new Date(Date.UTC(year, monthIndex, day));
  const isoDay = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - isoDay);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return { year: isoYear, week };
}

function thematicSelection(
  input: GlobalRadarPlannerInput,
  configuredThemes: readonly GlobalRadarTheme[],
): { theme: GlobalRadarTheme | null; weekKey: string } {
  const { year, week } = isoWeek(input.now);
  const weekKey = `${year}-W${String(week).padStart(2, "0")}`;
  if (input.requestedTheme) {
    if (!configuredThemes.includes(input.requestedTheme)) {
      throw new Error("Requested Global Radar theme is not enabled.");
    }
    return { theme: input.requestedTheme, weekKey };
  }
  for (let offset = 0; offset < globalRadarThemes.length; offset += 1) {
    const theme = globalRadarThemes[(week - 1 + offset) % globalRadarThemes.length];
    if (configuredThemes.includes(theme)) return { theme, weekKey };
  }
  return { theme: null, weekKey };
}

function canonicalConfig(config: PublicGlobalRadarPlanningConfig) {
  if (
    !Number.isInteger(config.resultLimit) ||
    config.resultLimit < 1 ||
    config.resultLimit > 20
  ) {
    throw new Error("Global Radar result limit must be an integer from 1 to 20.");
  }
  const scoreVersion = config.scoreVersion.trim();
  if (!scoreVersion) {
    throw new Error("Global Radar score version is required.");
  }
  const countries = unique(config.countries.map((country) => country.trim()));
  const languages = normalizeChinaLanguages(
    countries,
    config.languages.map((language) => language.trim()),
  );
  if (countries.some((country) => !country)) {
    throw new Error("Global Radar countries must be non-empty strings.");
  }
  if (languages.some((language) => !language)) {
    throw new Error("Global Radar languages must be non-empty strings.");
  }
  if (
    config.themes.some(
      (theme) => !(globalRadarThemes as readonly string[]).includes(theme),
    )
  ) {
    throw new Error("Global Radar configuration contains an unknown theme.");
  }
  if (
    config.enabledSourceAdapters.some(
      (sourceAdapter) => sourceAdapter !== "codex_public_web",
    )
  ) {
    throw new Error("Global Radar configuration contains an unknown source adapter.");
  }
  if (
    config.sourceFamilies.some(
      (sourceFamily) =>
        !(globalRadarSourceFamilies as readonly string[]).includes(sourceFamily),
    )
  ) {
    throw new Error("Global Radar configuration contains an unknown source family.");
  }
  const selectedSourceFamilies = new Set(config.sourceFamilies);
  return {
    countries,
    languages,
    themes: unique(config.themes),
    enabledSourceAdapters: unique(config.enabledSourceAdapters),
    sourceFamilies: globalRadarSourceFamilies.filter((sourceFamily) =>
      selectedSourceFamilies.has(sourceFamily),
    ),
    resultLimit: config.resultLimit,
    scoreVersion,
  };
}

function coverageTimestamp(value: string | null | undefined, label: string) {
  if (value === null || value === undefined) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new Error(`Global Radar ${label} coverage timestamp is invalid.`);
  }
  return timestamp;
}

function dueWatchlistEntries(
  input: GlobalRadarPlannerInput,
  config: ReturnType<typeof canonicalConfig>,
): WatchlistPlanningInput[] {
  return input.watchlist
    .map((entry) => {
      if (!entry.category.trim()) {
        throw new Error("Global Radar watchlist category is required.");
      }
      if (!Number.isInteger(entry.cadenceDays) || entry.cadenceDays < 1) {
        throw new Error("Global Radar watchlist cadence must be a positive integer.");
      }
      if (!Number.isInteger(entry.priority)) {
        throw new Error("Global Radar watchlist priority must be an integer.");
      }
      return {
        category: entry.category.trim(),
        theme: entry.theme,
        countries: unique(entry.countries).filter((country) =>
          config.countries.includes(country),
        ),
        languages: normalizeChinaLanguages(
          entry.countries,
          unique(entry.languages).filter((language) =>
            config.languages.includes(language),
          ),
        ).filter((language) => config.languages.includes(language)),
        cadenceDays: entry.cadenceDays,
        priority: entry.priority,
      };
    })
    .filter((entry) => {
      const lastCoveredAt = coverageTimestamp(
        input.coverageState.watchlistLastCoveredAt[entry.category],
        "watchlist",
      );
      const due =
        lastCoveredAt === null ||
        input.now.getTime() - lastCoveredAt >= entry.cadenceDays * 86_400_000;
      return (
        due &&
        config.themes.includes(entry.theme) &&
        entry.countries.length > 0 &&
        entry.languages.length > 0
      );
    })
    .sort((left, right) => {
      const priority = right.priority - left.priority;
      if (priority !== 0) return priority;
      const leftCoverage =
        coverageTimestamp(
          input.coverageState.watchlistLastCoveredAt[left.category],
          "watchlist",
        ) ?? Number.NEGATIVE_INFINITY;
      const rightCoverage =
        coverageTimestamp(
          input.coverageState.watchlistLastCoveredAt[right.category],
          "watchlist",
        ) ?? Number.NEGATIVE_INFINITY;
      return leftCoverage - rightCoverage || compareCodePoints(left.category, right.category);
    });
}

function orderByCoverage<const Value extends string>(
  values: readonly Value[],
  lastCoveredAt: Readonly<Record<string, string | null | undefined>>,
  label: string,
): Value[] {
  return values
    .map((value, index) => ({
      value,
      index,
      coveredAt:
        coverageTimestamp(lastCoveredAt[value], label) ??
        Number.NEGATIVE_INFINITY,
    }))
    .sort(
      (left, right) =>
        left.coveredAt - right.coveredAt || left.index - right.index,
    )
    .map(({ value }) => value);
}

function freezePlan(plan: Omit<RadarPlan, "fingerprint">): RadarPlan {
  const immutablePlan = {
    ...plan,
    countries: Object.freeze([...plan.countries]),
    languages: Object.freeze([...plan.languages]),
    themes: Object.freeze([...plan.themes]),
    sourceAdapters: Object.freeze([...plan.sourceAdapters]),
    sourceFamilies: Object.freeze([...plan.sourceFamilies]),
    dateWindow: Object.freeze({ ...plan.dateWindow }),
    watchlist: Object.freeze(
      plan.watchlist.map((entry) =>
        Object.freeze({
          ...entry,
          countries: Object.freeze([...entry.countries]),
          languages: Object.freeze([...entry.languages]),
        }),
      ),
    ),
  };
  return Object.freeze({
    ...immutablePlan,
    fingerprint: stableGlobalRadarFingerprint(immutablePlan),
  });
}

export function planGlobalRadarRun(input: GlobalRadarPlannerInput): RadarPlan {
  if (!Number.isFinite(input.now.getTime())) {
    throw new Error("Global Radar planning requires a valid injected clock.");
  }
  if (
    input.scanMode !== "daily" &&
    input.scanMode !== "thematic" &&
    input.scanMode !== "manual" &&
    input.scanMode !== "watchlist_refresh"
  ) {
    throw new Error(`Unsupported Global Radar scan mode: ${input.scanMode}.`);
  }

  const config = canonicalConfig(input.config);
  const configHash = stableGlobalRadarFingerprint(config);
  const plannedWatchlist =
    input.scanMode === "watchlist_refresh"
      ? dueWatchlistEntries(input, config)
      : [];
  const thematic =
    input.scanMode === "thematic"
      ? thematicSelection(input, config.themes)
      : null;
  const manualRequestId =
    input.scanMode === "manual" ? input.administratorRequestId : undefined;
  if (input.scanMode === "manual" && !uuidPattern.test(manualRequestId ?? "")) {
    throw new Error("Manual Global Radar planning requires a valid administrator request UUID.");
  }
  if (
    input.scanMode === "manual" &&
    input.requestedTheme &&
    !config.themes.includes(input.requestedTheme)
  ) {
    throw new Error("Requested Global Radar theme is not enabled.");
  }
  const watchlistHash = stableGlobalRadarFingerprint(plannedWatchlist);
  const identityKey = manualRequestId
    ? `manual:${GLOBAL_RADAR_PLAN_VERSION}:${manualRequestId.toLowerCase()}`
    : thematic
      ? `thematic:${thematic.weekKey}:${thematic.theme ?? "no-enabled-theme"}:${configHash}`
      : input.scanMode === "watchlist_refresh"
        ? `watchlist-refresh:${kolkataLocalDate(input.now)}:${watchlistHash}:${configHash}`
        : `daily:${kolkataLocalDate(input.now)}:${configHash}`;
  const recencyDays = thematic
    ? THEMATIC_RECENCY_DAYS
    : manualRequestId
      ? MANUAL_RECENCY_DAYS
      : input.scanMode === "watchlist_refresh"
        ? WATCHLIST_RECENCY_DAYS
        : DAILY_RECENCY_DAYS;
  const plannedThemes =
    input.scanMode === "watchlist_refresh"
      ? unique(plannedWatchlist.map((entry) => entry.theme))
      : thematic?.theme
        ? [thematic.theme]
        : input.scanMode === "manual" && input.requestedTheme
          ? [input.requestedTheme]
          : config.themes;
  const plannedCountries =
    input.scanMode === "watchlist_refresh"
      ? unique(plannedWatchlist.flatMap((entry) => entry.countries))
      : config.countries;
  const plannedLanguages =
    input.scanMode === "watchlist_refresh"
      ? unique(plannedWatchlist.flatMap((entry) => entry.languages))
      : config.languages;
  const coverageOrderedCountries =
    input.scanMode === "watchlist_refresh"
      ? plannedCountries
      : orderByCoverage(
          plannedCountries,
          input.coverageState.countryLastCoveredAt,
          "country",
        );
  const coverageOrderedThemes =
    input.scanMode === "daily" ||
    (input.scanMode === "manual" && !input.requestedTheme)
      ? orderByCoverage(
          plannedThemes,
          input.coverageState.themeLastCoveredAt,
          "theme",
        )
      : plannedThemes;

  return freezePlan({
    version: GLOBAL_RADAR_PLAN_VERSION,
    queryVersion: GLOBAL_RADAR_QUERY_VERSION,
    identityKey,
    configHash,
    scanMode: input.scanMode,
    countries: coverageOrderedCountries,
    languages: plannedLanguages,
    themes: coverageOrderedThemes,
    sourceAdapters: config.enabledSourceAdapters,
    sourceFamilies: config.sourceFamilies,
    dateWindow: {
      startInclusive: kolkataMidnight(input.now, -(recencyDays - 1)),
      endExclusive: kolkataMidnight(input.now, 1),
    },
    resultLimit: config.resultLimit,
    taxonomyVersion: GLOBAL_RADAR_TAXONOMY_VERSION,
    scoreVersion: config.scoreVersion,
    watchlist: plannedWatchlist,
  });
}
