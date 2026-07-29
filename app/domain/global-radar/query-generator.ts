import type { SignalClass } from "./contracts";
import {
  GLOBAL_RADAR_QUERY_VERSION,
  stableGlobalRadarFingerprint,
  type GlobalRadarCategorySearchTerms,
  type GlobalRadarLanguage,
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

export const globalRadarThemeLeafIdentifiers = Object.freeze({
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
} as const satisfies Readonly<
  Record<GlobalRadarTheme, GlobalRadarLeafIdentifier>
>);

type PlannedCapabilityLeaf =
  (typeof globalRadarThemeLeafIdentifiers)[GlobalRadarTheme];

const chineseCapabilityByLeafIdentifier: Readonly<
  Record<PlannedCapabilityLeaf, string>
> = Object.freeze({
  teleoperated_trajectories: "遥操作轨迹",
  first_person_video: "第一人称视频",
  robotic_assembly: "机器人装配",
  av_adas: "自动驾驶与高级驾驶辅助系统",
  tactile_images: "触觉图像",
  "3d_reconstruction": "三维重建",
  human_robot_commands: "人机指令",
  agriculture: "农业",
  robotics_simulation: "机器人仿真",
  physical_ai_benchmarks: "实体人工智能基准测试",
  contract_manufacturing: "合同制造",
  distribution: "分销",
});

const chineseSourceConstraintByFamily: Readonly<
  Record<GlobalRadarSourceFamily, string>
> = Object.freeze({
  official_company_material: "官网 OR 公司网站 OR 官方公告",
  official_partner_supplier_pages:
    "供应商 OR 合作伙伴 OR 供应商注册 OR 合作伙伴申请",
  public_procurement_and_rfp_portals: "招标 OR 采购 OR 征求建议书",
  official_research: "官方研究 OR 研究实验室 OR 技术报告",
  official_datasets_and_benchmarks: "数据集 OR 基准测试 OR 数据目录",
  official_jobs: "招聘 OR 职位 OR 人才招聘",
  official_investor_material: "投资者关系 OR 财报 OR 股东",
  government_and_industry_sources: "政府 OR 行业协会 OR 公共机构",
  accelerator_investor_updates: "加速器 OR 投资机构 OR 项目更新",
  reputable_technical_business_publications:
    "技术媒体 OR 商业媒体 OR 行业出版物",
  public_conference_material: "会议 OR 峰会 OR 技术演讲",
  official_public_social_posts: "官方公告 OR 官方动态 OR 官方社交账号",
});

const englishSourceConstraintByFamily: Readonly<
  Record<GlobalRadarSourceFamily, string>
> = Object.freeze({
  official_company_material:
    '"official website" OR "company website" OR "company announcement"',
  official_partner_supplier_pages:
    'supplier OR partner OR "supplier registration" OR "partner application"',
  public_procurement_and_rfp_portals: "RFP OR procurement OR tender OR bid",
  official_research: '"research lab" OR "technical report" OR publication',
  official_datasets_and_benchmarks: 'dataset OR benchmark OR "data catalog"',
  official_jobs: "careers OR jobs OR hiring",
  official_investor_material:
    '"investor relations" OR earnings OR shareholder',
  government_and_industry_sources:
    'government OR ministry OR "industry association"',
  accelerator_investor_updates:
    'accelerator OR investor OR "portfolio update"',
  reputable_technical_business_publications:
    '"technical publication" OR "business publication" OR "industry report"',
  public_conference_material: 'conference OR summit OR "technical talk"',
  official_public_social_posts:
    '"official announcement" OR "official update" OR "verified account"',
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
  languages: readonly GlobalRadarLanguage[],
): readonly GlobalRadarLanguage[] {
  return isChina(country) && languages.length > 0
    ? ["en", "zh-CN"]
    : languages.filter((language) => language !== "zh-CN");
}

function englishQuery(
  capability: string,
  country: string,
  sourceQualifier: string,
  intent: SignalClass,
): string {
  if (intent === "direct_demand") {
    return `"${capability}" "${country}" (${sourceQualifier}) (RFP OR procurement OR "supplier registration" OR vendor OR "partner application" OR distributor OR "contract manufacturing" OR "data collection" OR teleoperation OR demonstrations OR testing OR certification OR installation OR service)`;
  }
  if (intent === "demand_precursor") {
    return `"${capability}" "${country}" (${sourceQualifier}) (launch OR funding OR hiring OR deployment OR facility OR expansion OR "supply-chain buildout" OR "robot fleets" OR "India market entry")`;
  }
  return `"${capability}" "${country}" (${sourceQualifier}) (trend OR "ecosystem growth" OR "increasing activity")`;
}

function chineseQuery(
  capability: string,
  country: string,
  sourceQualifier: string,
  intent: SignalClass,
): string {
  if (intent === "direct_demand") {
    return `"${capability}" "${country}" (${sourceQualifier}) (招标 OR 采购 OR 供应商注册 OR 供应商 OR 合作伙伴申请 OR 经销商 OR 合同制造 OR 数据采集 OR 遥操作 OR 示范 OR 测试 OR 认证 OR 安装 OR 服务)`;
  }
  if (intent === "demand_precursor") {
    return `"${capability}" "${country}" (${sourceQualifier}) (发布 OR 融资 OR 招聘 OR 部署 OR 设施 OR 扩张 OR 供应链建设 OR 机器人车队 OR 进入印度市场)`;
  }
  return `"${capability}" "${country}" (${sourceQualifier}) (趋势 OR 生态系统增长 OR 活动增加)`;
}

function queryText(
  theme: GlobalRadarTheme,
  country: string,
  language: string,
  intent: SignalClass,
  sourceFamily: GlobalRadarSourceFamily,
  categorySearchTerm?: string,
): string {
  const categoryQualifier = categorySearchTerm
    ? ` ${categorySearchTerm}`
    : "";
  const leafIdentifier = globalRadarThemeLeafIdentifiers[theme];
  const englishCapability = `${taxonomySearchPhrase(leafIdentifier)}${categoryQualifier}`;
  const chineseCapability = `${chineseCapabilityByLeafIdentifier[leafIdentifier]}${categoryQualifier}`;
  return language === "zh-CN"
    ? chineseQuery(
        chineseCapability,
        isChina(country) ? "中国" : "",
        chineseSourceConstraintByFamily[sourceFamily],
        intent,
      )
    : englishQuery(
        englishCapability,
        country,
        englishSourceConstraintByFamily[sourceFamily],
        intent,
      );
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
  categorySearchTerm?: string,
): SearchQuery {
  const query = queryText(
    theme,
    country,
    language,
    signalIntent,
    sourceFamily,
    categorySearchTerm,
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
      sourceFamily,
      ...(category ? { watchlistCategory: category } : {}),
      ...queryFields,
    }),
    ...queryFields,
    ordinal,
  });
}

type QueryWorkItem = {
  country: string;
  theme: GlobalRadarTheme;
  languages: readonly GlobalRadarLanguage[];
  category?: string;
  categorySearchTerms?: GlobalRadarCategorySearchTerms;
};

function plannedWorkItems(plan: RadarPlan): QueryWorkItem[] {
  if (plan.scanMode === "watchlist_refresh") {
    return plan.watchlist.flatMap((entry) =>
      entry.countries.map((country) => ({
        country,
        theme: entry.theme,
        languages: languagesForCountry(country, entry.languages),
        category: entry.category,
        categorySearchTerms: entry.categorySearchTerms,
      })),
    );
  }
  return plan.countries.flatMap((country) =>
    plan.themes.map((theme) => ({
        country,
        theme,
        languages: languagesForCountry(country, plan.languages),
      })),
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
          const candidateGroup = workItem.languages.map((language, index) =>
            buildQuery(
              sourceAdapter,
              workItem.country,
              workItem.theme,
              language,
              signalIntent,
              sourceFamily,
              queries.length + index,
              workItem.category,
              workItem.categorySearchTerms?.[language],
            ),
          );
          if (candidateGroup.length === 0) continue;
          const seenCount = candidateGroup.filter((query) =>
            seen.has(query.fingerprint),
          ).length;
          if (seenCount > 0) continue;
          if (queries.length + candidateGroup.length > 120) {
            return Object.freeze(queries);
          }
          candidateGroup.forEach((query) => {
            seen.add(query.fingerprint);
            queries.push(query);
          });
        }
      }
    }
  }

  return Object.freeze(queries);
}
