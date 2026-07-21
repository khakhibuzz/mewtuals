import { allocateCandidates } from "../domain/discovery";

import type { EnvironmentSource } from "./env";

const defaultCompanyCategories = [
  "startups",
  "consumer brands",
  "AI",
  "technology",
  "creator economy",
  "wellness",
  "fashion",
  "hardware",
  "productivity",
  "fintech",
] as const;

const defaultCreatorCategories = [
  "technology",
  "startups/business",
  "AI",
  "consumer products",
  "lifestyle",
  "wellness",
  "fashion",
  "finance",
  "podcasts/interviews",
] as const;

export type DiscoveryConfig = {
  geographies: readonly string[];
  companyCategories: readonly string[];
  creatorCategories: readonly string[];
  totalCandidates: number;
  companyPercentage: number;
  enabledSources: readonly string[];
  workerSecret?: string;
  workerApiBaseUrl?: string;
};

export type PublicDiscoveryWorkerConfig = Omit<
  DiscoveryConfig,
  "workerSecret"
> & {
  allocation: { companies: number; creators: number };
};

function commaSeparated(
  value: string | undefined,
  defaults: readonly string[],
): string[] {
  if (value === undefined) return [...defaults];
  return [
    ...new Set(value.split(",").map((item) => item.trim()).filter(Boolean)),
  ];
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
    throw new Error(
      `Invalid discovery configuration: ${name} must be an integer from ${minimum} to ${maximum}.`,
    );
  }
  return parsed;
}

export function readDiscoveryConfig(
  source: EnvironmentSource = {},
): DiscoveryConfig {
  const workerSecret = source.DISCOVERY_WORKER_SECRET?.trim() || undefined;
  if (source.NODE_ENV === "production" && !workerSecret) {
    throw new Error(
      "Invalid discovery configuration: DISCOVERY_WORKER_SECRET is required in production.",
    );
  }

  return {
    geographies: commaSeparated(source.DISCOVERY_GEOGRAPHIES, ["India"]),
    companyCategories: commaSeparated(
      source.DISCOVERY_COMPANY_CATEGORIES,
      defaultCompanyCategories,
    ),
    creatorCategories: commaSeparated(
      source.DISCOVERY_CREATOR_CATEGORIES,
      defaultCreatorCategories,
    ),
    totalCandidates: boundedInteger(
      "DISCOVERY_TOTAL_CANDIDATES",
      source.DISCOVERY_TOTAL_CANDIDATES,
      20,
      1,
      50,
    ),
    companyPercentage: boundedInteger(
      "DISCOVERY_COMPANY_PERCENTAGE",
      source.DISCOVERY_COMPANY_PERCENTAGE,
      50,
      0,
      100,
    ),
    enabledSources: commaSeparated(source.DISCOVERY_ENABLED_SOURCES, [
      "codex_web",
    ]),
    workerSecret,
    workerApiBaseUrl: source.DISCOVERY_API_BASE_URL?.trim() || undefined,
  };
}

export function publicDiscoveryWorkerConfig(
  config: DiscoveryConfig,
): PublicDiscoveryWorkerConfig {
  return {
    geographies: config.geographies,
    companyCategories: config.companyCategories,
    creatorCategories: config.creatorCategories,
    totalCandidates: config.totalCandidates,
    companyPercentage: config.companyPercentage,
    enabledSources: config.enabledSources,
    workerApiBaseUrl: config.workerApiBaseUrl,
    allocation: allocateCandidates(
      config.totalCandidates,
      config.companyPercentage,
    ),
  };
}
