import { allocateCandidates } from "../domain/discovery";

import type { EnvironmentSource } from "./env";

const defaultCompanyCategories = [
  "robot makers and integrators",
  "components and actuation",
  "sensing and perception",
  "electronics and compute",
  "embedded software and AI",
  "manufacturing and testing",
  "distribution and deployment",
  "research and ecosystem support",
] as const;

const defaultCreatorCategories = [
  "robotics engineering",
  "hardware building",
  "physical AI research",
  "manufacturing and industrial technology",
  "robotics education and ecosystem",
] as const;

export const PHYSICAL_AI_CAMPAIGN_KEY = "robotics_hardware_india" as const;

const discoveryEnvironments = new Set(["development", "test", "production"]);

export type DiscoveryConfig = {
  campaignKey: string;
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
  source: EnvironmentSource = process.env,
): DiscoveryConfig {
  const environment = source.NODE_ENV?.trim() || "production";
  if (!discoveryEnvironments.has(environment)) {
    throw new Error(
      "Invalid discovery configuration: NODE_ENV must be development, test, or production.",
    );
  }
  const workerSecret = source.DISCOVERY_WORKER_SECRET?.trim() || undefined;
  if (environment === "production" && !workerSecret) {
    throw new Error(
      "Invalid discovery configuration: DISCOVERY_WORKER_SECRET is required in production.",
    );
  }
  if (environment === "production" && workerSecret!.length < 32) {
    throw new Error(
      "Invalid discovery configuration: DISCOVERY_WORKER_SECRET must contain at least 32 characters in production.",
    );
  }

  return {
    campaignKey: PHYSICAL_AI_CAMPAIGN_KEY,
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
      75,
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
    campaignKey: config.campaignKey,
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

export function physicalAiSeedConfig(
  config: DiscoveryConfig,
): DiscoveryConfig {
  return { ...config, totalCandidates: 50, companyPercentage: 100 };
}
