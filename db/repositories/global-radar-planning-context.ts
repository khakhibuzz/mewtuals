import {
  globalRadarThemes,
  parseGlobalRadarPlanSnapshot,
  radarScanModes,
  type GlobalRadarLanguage,
  type GlobalRadarTheme,
  type RadarCoverageState,
  type RadarScanMode,
  type WatchlistPlanningInput,
} from "../../app/domain/global-radar";

export type GlobalRadarCompletedRunCoverageRow = Readonly<{
  planFingerprint: string;
  planSnapshot: Record<string, unknown>;
  completedAt: Date;
}>;

export type GlobalRadarWatchlistPlanningRow = Readonly<{
  category: string;
  categorySearchTermEn: string;
  categorySearchTermZhCn: string | null;
  theme: string;
  countries: readonly string[];
  languages: readonly string[];
  cadenceDays: number;
  priority: number;
}>;

export type DerivedGlobalRadarPlanningContext = Readonly<{
  coverageState: RadarCoverageState;
  watchlist: readonly WatchlistPlanningInput[];
}>;

function recordLatest(
  target: Record<string, string | null>,
  key: string,
  completedAt: Date,
) {
  const timestamp = completedAt.toISOString();
  const current = target[key];
  if (current === null || current === undefined || current < timestamp) {
    target[key] = timestamp;
  }
}

function validText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maximum
  );
}

function watchlistPlanningInput(
  row: GlobalRadarWatchlistPlanningRow,
): WatchlistPlanningInput | null {
  if (
    !validText(row.category, 200) ||
    !globalRadarThemes.includes(row.theme as GlobalRadarTheme) ||
    !Array.isArray(row.countries) ||
    row.countries.length < 1 ||
    row.countries.length > 50 ||
    row.countries.some((country) => !validText(country, 100)) ||
    !Array.isArray(row.languages) ||
    row.languages.length < 1 ||
    row.languages.length > 2 ||
    row.languages.some(
      (language) => language !== "en" && language !== "zh-CN",
    ) ||
    !Number.isInteger(row.cadenceDays) ||
    row.cadenceDays < 1 ||
    row.cadenceDays > 365 ||
    !Number.isInteger(row.priority)
  ) {
    return null;
  }
  const languages = [...new Set(row.languages)] as GlobalRadarLanguage[];
  const categorySearchTerms: Partial<
    Record<GlobalRadarLanguage, string>
  > = {};
  for (const language of languages) {
    const term =
      language === "en"
        ? row.categorySearchTermEn
        : row.categorySearchTermZhCn;
    if (!validText(term, 500)) return null;
    categorySearchTerms[language] = term.trim();
  }
  return {
    category: row.category.trim(),
    categorySearchTerms,
    theme: row.theme as GlobalRadarTheme,
    countries: [...new Set(row.countries.map((country) => country.trim()))],
    languages,
    cadenceDays: row.cadenceDays,
    priority: row.priority,
  };
}

export function deriveGlobalRadarPlanningContext(input: Readonly<{
  now: Date;
  scanMode: RadarScanMode;
  completedRuns: readonly GlobalRadarCompletedRunCoverageRow[];
  watchlistEntries: readonly GlobalRadarWatchlistPlanningRow[];
}>): DerivedGlobalRadarPlanningContext {
  if (
    !(input.now instanceof Date) ||
    Number.isNaN(input.now.getTime()) ||
    !radarScanModes.includes(input.scanMode) ||
    input.completedRuns.length > 5_000 ||
    input.watchlistEntries.length > 100
  ) {
    throw new Error("Global Radar planning context is invalid.");
  }
  const countryLastCoveredAt: Record<string, string | null> = {};
  const themeLastCoveredAt: Partial<
    Record<GlobalRadarTheme, string | null>
  > = {};
  const watchlistLastCoveredAt: Record<string, string | null> = {};
  for (const row of input.completedRuns) {
    if (
      !(row.completedAt instanceof Date) ||
      Number.isNaN(row.completedAt.getTime()) ||
      row.completedAt > input.now
    ) {
      throw new Error("Global Radar completed-run coverage is invalid.");
    }
    const plan = parseGlobalRadarPlanSnapshot(
      row.planSnapshot,
      row.planFingerprint,
    );
    if (!plan) {
      throw new Error("Global Radar persisted plan coverage is invalid.");
    }
    for (const country of plan.countries) {
      recordLatest(countryLastCoveredAt, country, row.completedAt);
    }
    for (const theme of plan.themes) {
      recordLatest(themeLastCoveredAt, theme, row.completedAt);
    }
    for (const entry of plan.watchlist) {
      recordLatest(watchlistLastCoveredAt, entry.category, row.completedAt);
    }
  }
  const watchlist =
    input.scanMode === "watchlist_refresh"
      ? input.watchlistEntries.map((row) => {
          const parsed = watchlistPlanningInput(row);
          if (!parsed) {
            throw new Error("Global Radar persisted watchlist is invalid.");
          }
          return parsed;
        })
      : [];
  return {
    coverageState: {
      countryLastCoveredAt,
      themeLastCoveredAt,
      watchlistLastCoveredAt,
    },
    watchlist,
  };
}
