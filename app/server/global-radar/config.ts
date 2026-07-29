import {
  globalRadarThemes,
  type GlobalRadarLanguage,
  type GlobalRadarTheme,
  type SignalClass,
} from "../../domain/global-radar";

import type { EnvironmentSource } from "../env";

const supportedEnvironments = new Set([
  "development",
  "test",
  "production",
]);
const supportedLanguages = new Set(["en", "zh-CN"]);
const supportedThemes = new Set<string>(globalRadarThemes);
const supportedSources = new Set(["codex_public_web"]);

const defaultCountries = ["United States", "China"] as const;
const defaultLanguages = ["en", "zh-CN"] as const;
const defaultSources = ["codex_public_web"] as const;

export type GlobalRadarConfig = Readonly<{
  workerSecret: string;
  apiBaseUrl?: URL;
  countries: readonly string[];
  languages: readonly GlobalRadarLanguage[];
  themes: readonly GlobalRadarTheme[];
  enabledSources: readonly ["codex_public_web"];
  resultLimit: number;
  thresholds: Readonly<Record<SignalClass, number>>;
}>;

export type PublicGlobalRadarConfig = Readonly<{
  countries: readonly string[];
  languages: readonly GlobalRadarLanguage[];
  themes: readonly GlobalRadarTheme[];
  enabledSources: readonly ["codex_public_web"];
  resultLimit: number;
  thresholds: Readonly<Record<SignalClass, number>>;
}>;

function invalidConfiguration(detail: string): never {
  throw new Error(`Invalid Global Radar configuration: ${detail}`);
}

function configuredList(
  name: string,
  value: string | undefined,
  defaults: readonly string[],
): readonly string[] {
  const candidates = value === undefined ? defaults : value.split(",");
  const normalized = [
    ...new Set(candidates.map((candidate) => candidate.trim()).filter(Boolean)),
  ];
  if (normalized.length === 0) {
    invalidConfiguration(`${name} must contain at least one value.`);
  }
  return Object.freeze(normalized);
}

function allowlistedList(
  name: string,
  value: string | undefined,
  defaults: readonly string[],
  allowlist: ReadonlySet<string>,
): readonly string[] {
  const normalized = configuredList(name, value, defaults);
  if (normalized.some((candidate) => !allowlist.has(candidate))) {
    invalidConfiguration(`${name} contains an unsupported value.`);
  }
  return normalized;
}

function boundedInteger(
  name: string,
  value: string | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined) return defaultValue;

  const normalized = value.trim();
  const parsed = Number(normalized);
  if (
    !/^\d+$/.test(normalized) ||
    !Number.isInteger(parsed) ||
    parsed < minimum ||
    parsed > maximum
  ) {
    invalidConfiguration(
      `${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return parsed;
}

function apiBaseUrl(value: string | undefined): URL | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    invalidConfiguration(
      "GLOBAL_RADAR_API_BASE_URL must be a credential-free HTTP(S) URL.",
    );
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username !== "" ||
    parsed.password !== ""
  ) {
    invalidConfiguration(
      "GLOBAL_RADAR_API_BASE_URL must be a credential-free HTTP(S) URL.",
    );
  }
  return parsed;
}

function configuredSources(value: string | undefined) {
  const sources = allowlistedList(
    "GLOBAL_RADAR_ENABLED_SOURCES",
    value,
    defaultSources,
    supportedSources,
  );
  if (sources.length !== 1 || sources[0] !== "codex_public_web") {
    invalidConfiguration(
      "GLOBAL_RADAR_ENABLED_SOURCES must contain codex_public_web.",
    );
  }
  return Object.freeze(["codex_public_web"] as const);
}

export function readGlobalRadarConfig(
  source: EnvironmentSource = process.env,
): GlobalRadarConfig {
  const environment = source.NODE_ENV?.trim() || "production";
  if (!supportedEnvironments.has(environment)) {
    invalidConfiguration(
      "NODE_ENV must be development, test, or production.",
    );
  }

  const workerSecret = source.GLOBAL_RADAR_WORKER_SECRET?.trim();
  if (!workerSecret) {
    invalidConfiguration("GLOBAL_RADAR_WORKER_SECRET is required.");
  }
  if (environment === "production" && workerSecret.length < 32) {
    invalidConfiguration(
      "GLOBAL_RADAR_WORKER_SECRET must contain at least 32 characters in production.",
    );
  }

  const discoveryWorkerSecret = source.DISCOVERY_WORKER_SECRET?.trim();
  if (discoveryWorkerSecret && discoveryWorkerSecret === workerSecret) {
    invalidConfiguration(
      "Radar and Discovery worker secrets must be distinct.",
    );
  }

  const countries = configuredList(
    "GLOBAL_RADAR_COUNTRIES",
    source.GLOBAL_RADAR_COUNTRIES,
    defaultCountries,
  );
  const languages = allowlistedList(
    "GLOBAL_RADAR_LANGUAGES",
    source.GLOBAL_RADAR_LANGUAGES,
    defaultLanguages,
    supportedLanguages,
  ) as readonly GlobalRadarLanguage[];
  const themes = allowlistedList(
    "GLOBAL_RADAR_THEMES",
    source.GLOBAL_RADAR_THEMES,
    globalRadarThemes,
    supportedThemes,
  ) as readonly GlobalRadarTheme[];
  const enabledSources = configuredSources(source.GLOBAL_RADAR_ENABLED_SOURCES);

  const thresholds = Object.freeze({
    direct_demand: boundedInteger(
      "GLOBAL_RADAR_DIRECT_THRESHOLD",
      source.GLOBAL_RADAR_DIRECT_THRESHOLD,
      70,
      0,
      100,
    ),
    demand_precursor: boundedInteger(
      "GLOBAL_RADAR_PRECURSOR_THRESHOLD",
      source.GLOBAL_RADAR_PRECURSOR_THRESHOLD,
      65,
      0,
      100,
    ),
    ecosystem_momentum: boundedInteger(
      "GLOBAL_RADAR_MOMENTUM_THRESHOLD",
      source.GLOBAL_RADAR_MOMENTUM_THRESHOLD,
      70,
      0,
      100,
    ),
  }) satisfies Readonly<Record<SignalClass, number>>;

  return Object.freeze({
    workerSecret,
    apiBaseUrl: apiBaseUrl(source.GLOBAL_RADAR_API_BASE_URL),
    countries,
    languages,
    themes,
    enabledSources,
    resultLimit: boundedInteger(
      "GLOBAL_RADAR_RESULT_LIMIT",
      source.GLOBAL_RADAR_RESULT_LIMIT,
      20,
      1,
      20,
    ),
    thresholds,
  });
}

export function publicGlobalRadarConfig(
  config: GlobalRadarConfig,
): PublicGlobalRadarConfig {
  return Object.freeze({
    countries: Object.freeze([...config.countries]),
    languages: Object.freeze([...config.languages]),
    themes: Object.freeze([...config.themes]),
    enabledSources: Object.freeze(["codex_public_web"] as const),
    resultLimit: config.resultLimit,
    thresholds: Object.freeze({ ...config.thresholds }),
  });
}
