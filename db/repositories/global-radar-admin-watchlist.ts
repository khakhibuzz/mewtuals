import {
  globalRadarThemes,
  isoTimestampSchema,
} from "../../app/domain/global-radar";

const MAX_WATCHLIST_VALUE_LENGTH = 200;
const MAX_COLLISION_CANDIDATES = 100;

export type GlobalRadarWatchlistEntityInput =
  | Readonly<{
      type: "existing";
      entityId: string;
      expectedRevision: number;
    }>
  | Readonly<{
      type: "create";
      entityId: string;
      canonicalName: string;
      websiteUrl: string | null;
      linkedinOrganizationUrl: string | null;
      stablePublicIdentifiers: readonly Readonly<{
        namespace: string;
        value: string;
      }>[];
      canonicalCorporateGroupId: string | null;
      headquartersCountry: string;
      headquartersCity: string | null;
      operatingCountries: readonly string[] | null;
      organisationType: string;
      sector: string;
      shortDescription: string;
    }>;

export type GlobalRadarWatchlistConfigurationInput = Readonly<{
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
}>;

export type CanonicalGlobalRadarWatchlistConfiguration = Omit<
  GlobalRadarWatchlistConfigurationInput,
  "countries" | "languages" | "nextScanAt"
> &
  Readonly<{
    countries: string[];
    languages: string[];
    nextScanAt: Date | null;
  }>;

function boundedValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= MAX_WATCHLIST_VALUE_LENGTH
    ? normalized
    : null;
}

export function boundGlobalRadarCollisionCandidateIds(
  entityIds: readonly string[],
): string[] {
  return [...new Set(entityIds)].slice(0, MAX_COLLISION_CANDIDATES);
}

export function canonicalizeGlobalRadarWatchlistConfiguration(
  value: GlobalRadarWatchlistConfigurationInput,
  now: Date,
): CanonicalGlobalRadarWatchlistConfiguration | null {
  if (!value || typeof value !== "object") return null;
  const stateValues = ["enabled", "paused", "disabled"] as const;
  const theme = boundedValue(value.theme);
  const category = boundedValue(value.category);
  const searchTermEn =
    typeof value.categorySearchTermEn === "string"
      ? value.categorySearchTermEn.trim().replace(/\s+/g, " ")
      : "";
  const searchTermZhCn =
    value.categorySearchTermZhCn === null
      ? null
      : typeof value.categorySearchTermZhCn === "string"
        ? value.categorySearchTermZhCn.trim().replace(/\s+/g, " ")
        : "";
  if (
    !stateValues.includes(value.state) ||
    !Number.isInteger(value.priority) ||
    value.priority < 0 ||
    value.priority > 100 ||
    !theme ||
    !globalRadarThemes.includes(theme as (typeof globalRadarThemes)[number]) ||
    !category ||
    searchTermEn.length < 1 ||
    searchTermEn.length > 500 ||
    (searchTermZhCn !== null &&
      (searchTermZhCn.length < 1 || searchTermZhCn.length > 500)) ||
    !Array.isArray(value.countries) ||
    value.countries.length < 1 ||
    value.countries.length > 50 ||
    !Array.isArray(value.languages) ||
    value.languages.length < 1 ||
    value.languages.length > 50 ||
    !Number.isInteger(value.cadenceDays) ||
    value.cadenceDays < 1 ||
    value.cadenceDays > 365
  ) return null;
  const countries = [...new Set(value.countries.map((country) => country.trim()))];
  const languages = [...new Set(value.languages.map((language) => language.trim()))];
  if (
    countries.some((country) => country.length < 1 || country.length > 100) ||
    languages.some((language) => !["en", "zh-CN"].includes(language)) ||
    !languages.includes("en") ||
    (countries.some((country) =>
      ["china", "cn"].includes(country.toLowerCase()),
    ) &&
      !searchTermZhCn)
  ) return null;
  const requestedNextScan =
    value.nextScanAt === null ||
    !isoTimestampSchema.safeParse(value.nextScanAt).success
      ? null
      : new Date(value.nextScanAt);
  if (
    (value.nextScanAt !== null && requestedNextScan === null) ||
    (value.state === "enabled" &&
      (!requestedNextScan || requestedNextScan <= now))
  ) return null;
  return {
    state: value.state,
    priority: value.priority,
    theme,
    category,
    categorySearchTermEn: searchTermEn,
    categorySearchTermZhCn: searchTermZhCn,
    countries,
    languages,
    cadenceDays: value.cadenceDays,
    nextScanAt: value.state === "enabled" ? requestedNextScan : null,
  };
}

export function toSafeGlobalRadarEntity(entity: {
  id: string;
  canonicalName: string;
  headquartersCountry: string;
  entityStatus: string;
  revision: number;
}) {
  return {
    id: entity.id,
    canonicalName: entity.canonicalName,
    headquartersCountry: entity.headquartersCountry,
    entityStatus: entity.entityStatus,
    revision: entity.revision,
  };
}

export function toSafeGlobalRadarWatchlistEntry(entry: {
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
}) {
  return {
    id: entry.id,
    globalEntityId: entry.globalEntityId,
    state: entry.state,
    priority: entry.priority,
    theme: entry.theme,
    category: entry.category,
    categorySearchTermEn: entry.categorySearchTermEn,
    categorySearchTermZhCn: entry.categorySearchTermZhCn,
    countries: [...entry.countries],
    languages: [...entry.languages],
    cadenceDays: entry.cadenceDays,
    nextScanAt: entry.nextScanAt,
    reason: entry.reason,
    revision: entry.revision,
  };
}
