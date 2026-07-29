import type { SignalClass } from "./contracts";
import {
  GLOBAL_RADAR_QUERY_VERSION,
  stableGlobalRadarFingerprint,
  type GlobalRadarSourceAdapter,
  type GlobalRadarSourceFamily,
  type GlobalRadarTheme,
  type RadarPlan,
} from "./planner";
import {
  globalRadarLeafIdentifierLookup,
  type GlobalRadarLeafIdentifier,
} from "../taxonomies/global-radar-v1";

export type SearchQuery = {
  fingerprint: string;
  query: string;
  language: string;
  sourceCountry: string;
  theme: GlobalRadarTheme;
  signalIntent: SignalClass;
  sourceAdapter: "codex_public_web";
  recencyDays: number;
  ordinal: number;
};

const signalIntents = [
  "direct_demand",
  "demand_precursor",
  "ecosystem_momentum",
] as const satisfies readonly SignalClass[];

const recencyByIntent: Readonly<Record<SignalClass, number>> = Object.freeze({
  direct_demand: 30,
  demand_precursor: 90,
  ecosystem_momentum: 90,
});

export const globalRadarThemeLeafIdentifiers: Readonly<
  Record<GlobalRadarTheme, GlobalRadarLeafIdentifier>
> = Object.freeze({
  robot_teleoperation_demonstrations: "teleoperated_trajectories",
  egocentric_human_task_video: "first_person_video",
  industrial_robotics_data: "robotic_assembly",
  autonomous_mobility_and_drones: "av_adas",
  tactile_force_data: "tactile_images",
  "3d_spatial_data": "3d_reconstruction",
  multilingual_speech_and_human_robot_interaction: "human_robot_commands",
  agriculture_field_collection: "agriculture",
  synthetic_data_digital_twins: "robotics_simulation",
  physical_ai_evaluation: "physical_ai_benchmarks",
  robotics_manufacturing: "contract_manufacturing",
  india_market_entry_and_after_sales_infrastructure: "distribution",
});

for (const leafIdentifier of Object.values(globalRadarThemeLeafIdentifiers)) {
  if (!globalRadarLeafIdentifierLookup[leafIdentifier]) {
    throw new Error(`Unknown Global Radar capability leaf: ${leafIdentifier}.`);
  }
}

function taxonomySearchPhrase(identifier: string): string {
  return identifier.replaceAll("_", " ");
}

function isChina(country: string): boolean {
  const normalized = country.trim().toLowerCase();
  return normalized === "china" || normalized === "cn";
}

function languagesForCountry(
  country: string,
  languages: readonly string[],
): readonly string[] {
  return isChina(country)
    ? languages
    : languages.filter((language) => language !== "zh-CN");
}

function englishQuery(
  capability: string,
  country: string,
  sourceQualifier: string,
  intent: SignalClass,
): string {
  if (intent === "direct_demand") {
    return `"${capability}" "${country}" "${sourceQualifier}" (RFP OR procurement OR "supplier registration" OR vendor OR "partner application" OR distributor OR "contract manufacturing" OR "data collection" OR teleoperation OR demonstrations OR testing OR certification OR installation OR service)`;
  }
  if (intent === "demand_precursor") {
    return `"${capability}" "${country}" "${sourceQualifier}" (launch OR funding OR hiring OR deployment OR facility OR expansion OR "supply-chain buildout" OR "robot fleets" OR "India market entry")`;
  }
  return `"${capability}" "${country}" "${sourceQualifier}" (trend OR "ecosystem growth" OR "increasing activity")`;
}

function chineseQuery(
  capability: string,
  country: string,
  sourceQualifier: string,
  intent: SignalClass,
): string {
  if (intent === "direct_demand") {
    return `"${capability}" "${country}" "${sourceQualifier}" (招标 OR 采购 OR 供应商注册 OR 供应商 OR 合作伙伴申请 OR 经销商 OR 合同制造 OR 数据采集 OR 遥操作 OR 示范 OR 测试 OR 认证 OR 安装 OR 服务)`;
  }
  if (intent === "demand_precursor") {
    return `"${capability}" "${country}" "${sourceQualifier}" (发布 OR 融资 OR 招聘 OR 部署 OR 设施 OR 扩张 OR 供应链建设 OR 机器人车队 OR 进入印度市场)`;
  }
  return `"${capability}" "${country}" "${sourceQualifier}" (趋势 OR 生态系统增长 OR 活动增加)`;
}

function queryText(
  theme: GlobalRadarTheme,
  country: string,
  language: string,
  intent: SignalClass,
  sourceFamily: GlobalRadarSourceFamily,
  category?: string,
): string {
  const categoryQualifier = category
    ? ` ${category.replaceAll("_", " ")}`
    : "";
  const capability = `${taxonomySearchPhrase(
    globalRadarThemeLeafIdentifiers[theme],
  )}${categoryQualifier}`;
  const sourceQualifier = taxonomySearchPhrase(sourceFamily);
  return language === "zh-CN"
    ? chineseQuery(capability, country, sourceQualifier, intent)
    : englishQuery(capability, country, sourceQualifier, intent);
}

function buildQuery(
  sourceAdapter: GlobalRadarSourceAdapter,
  country: string,
  theme: GlobalRadarTheme,
  language: string,
  signalIntent: SignalClass,
  sourceFamily: GlobalRadarSourceFamily,
  ordinal: number,
  category?: string,
): SearchQuery {
  const query = queryText(
    theme,
    country,
    language,
    signalIntent,
    sourceFamily,
    category,
  );
  const queryFields = {
    query,
    language,
    sourceCountry: country,
    theme,
    signalIntent,
    sourceAdapter,
    recencyDays: recencyByIntent[signalIntent],
  };
  return Object.freeze({
    fingerprint: stableGlobalRadarFingerprint({
      version: GLOBAL_RADAR_QUERY_VERSION,
      ...queryFields,
    }),
    ...queryFields,
    ordinal,
  });
}

type QueryWorkItem = {
  country: string;
  theme: GlobalRadarTheme;
  language: string;
  category?: string;
};

function plannedWorkItems(plan: RadarPlan): QueryWorkItem[] {
  if (plan.scanMode === "watchlist_refresh") {
    return plan.watchlist.flatMap((entry) =>
      entry.countries.flatMap((country) =>
        languagesForCountry(country, entry.languages).map((language) => ({
          country,
          theme: entry.theme,
          language,
          category: entry.category,
        })),
      ),
    );
  }
  return plan.countries.flatMap((country) =>
    plan.themes.flatMap((theme) =>
      languagesForCountry(country, plan.languages).map((language) => ({
        country,
        theme,
        language,
      })),
    ),
  );
}

export function generateGlobalRadarQueries(
  plan: RadarPlan,
): readonly SearchQuery[] {
  const queries: SearchQuery[] = [];
  const seen = new Set<string>();
  const workItems = plannedWorkItems(plan);

  for (const sourceAdapter of plan.sourceAdapters) {
    for (const sourceFamily of plan.sourceFamilies) {
      for (const workItem of workItems) {
        for (const signalIntent of signalIntents) {
          const query = buildQuery(
            sourceAdapter,
            workItem.country,
            workItem.theme,
            workItem.language,
            signalIntent,
            sourceFamily,
            queries.length,
            workItem.category,
          );
          if (seen.has(query.fingerprint)) continue;
          seen.add(query.fingerprint);
          queries.push(query);
          if (queries.length === 120) return Object.freeze(queries);
        }
      }
    }
  }

  return Object.freeze(queries);
}
