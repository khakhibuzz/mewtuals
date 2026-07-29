import type { SignalClass } from "./contracts";
import {
  GLOBAL_RADAR_QUERY_VERSION,
  stableGlobalRadarFingerprint,
  type GlobalRadarSourceAdapter,
  type GlobalRadarTheme,
  type RadarPlan,
} from "./planner";

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

const englishCapabilityByTheme: Readonly<Record<GlobalRadarTheme, string>> =
  Object.freeze({
    robot_teleoperation_demonstrations:
      "robot teleoperation demonstrations and trajectory data",
    egocentric_human_task_video: "egocentric human task video data",
    industrial_robotics_data: "industrial robotics data",
    autonomous_mobility_and_drones: "autonomous mobility and drone data",
    tactile_force_data: "tactile and force torque data",
    "3d_spatial_data": "3D spatial data and reconstruction",
    multilingual_speech_and_human_robot_interaction:
      "multilingual speech and human robot interaction data",
    agriculture_field_collection: "agriculture field data collection",
    synthetic_data_digital_twins: "synthetic robotics data and digital twins",
    physical_ai_evaluation: "physical AI testing and evaluation",
    robotics_manufacturing: "robotics manufacturing and components",
    india_market_entry_and_after_sales_infrastructure:
      "India market entry distribution installation and after sales service",
  });

const chineseCapabilityByTheme: Readonly<Record<GlobalRadarTheme, string>> =
  Object.freeze({
    robot_teleoperation_demonstrations: "机器人遥操作示范与轨迹数据",
    egocentric_human_task_video: "第一人称人类任务视频数据",
    industrial_robotics_data: "工业机器人数据",
    autonomous_mobility_and_drones: "自动驾驶与无人机数据",
    tactile_force_data: "触觉与力矩数据",
    "3d_spatial_data": "三维空间数据与重建",
    multilingual_speech_and_human_robot_interaction:
      "多语言语音与人机交互数据",
    agriculture_field_collection: "农业现场数据采集",
    synthetic_data_digital_twins: "机器人合成数据与数字孪生",
    physical_ai_evaluation: "实体人工智能测试与评估",
    robotics_manufacturing: "机器人制造与零部件",
    india_market_entry_and_after_sales_infrastructure:
      "印度市场进入、分销、安装与售后服务",
  });

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
  intent: SignalClass,
): string {
  if (intent === "direct_demand") {
    return `"${capability}" "${country}" (RFP OR procurement OR "supplier registration" OR vendor OR "partner application" OR distributor OR "contract manufacturing" OR "data collection" OR teleoperation OR demonstrations OR testing OR certification OR installation OR service)`;
  }
  if (intent === "demand_precursor") {
    return `"${capability}" "${country}" (launch OR funding OR hiring OR deployment OR facility OR expansion OR "supply-chain buildout" OR "robot fleets" OR "India market entry")`;
  }
  return `"${capability}" "${country}" (trend OR "ecosystem growth" OR "increasing activity")`;
}

function chineseQuery(
  capability: string,
  country: string,
  intent: SignalClass,
): string {
  if (intent === "direct_demand") {
    return `"${capability}" "${country}" (招标 OR 采购 OR 供应商注册 OR 供应商 OR 合作伙伴申请 OR 经销商 OR 合同制造 OR 数据采集 OR 遥操作 OR 示范 OR 测试 OR 认证 OR 安装 OR 服务)`;
  }
  if (intent === "demand_precursor") {
    return `"${capability}" "${country}" (发布 OR 融资 OR 招聘 OR 部署 OR 设施 OR 扩张 OR 供应链建设 OR 机器人车队 OR 进入印度市场)`;
  }
  return `"${capability}" "${country}" (趋势 OR 生态系统增长 OR 活动增加)`;
}

function queryText(
  theme: GlobalRadarTheme,
  country: string,
  language: string,
  intent: SignalClass,
  category?: string,
): string {
  const categoryQualifier = category
    ? ` ${category.replaceAll("_", " ")}`
    : "";
  return language === "zh-CN"
    ? chineseQuery(
        `${chineseCapabilityByTheme[theme]}${categoryQualifier}`,
        country,
        intent,
      )
    : englishQuery(
        `${englishCapabilityByTheme[theme]}${categoryQualifier}`,
        country,
        intent,
      );
}

function buildQuery(
  sourceAdapter: GlobalRadarSourceAdapter,
  country: string,
  theme: GlobalRadarTheme,
  language: string,
  signalIntent: SignalClass,
  ordinal: number,
  category?: string,
): SearchQuery {
  const query = queryText(theme, country, language, signalIntent, category);
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

  for (const sourceAdapter of plan.sourceAdapters) {
    for (const workItem of plannedWorkItems(plan)) {
      for (const signalIntent of signalIntents) {
        const query = buildQuery(
          sourceAdapter,
          workItem.country,
          workItem.theme,
          workItem.language,
          signalIntent,
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

  return Object.freeze(queries);
}
