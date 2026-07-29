import { describe, expect, it } from "vitest";

import {
  generateGlobalRadarQueries,
  globalRadarThemeLeafIdentifiers,
  type SearchQuery,
} from "../app/domain/global-radar/query-generator";
import {
  planGlobalRadarRun,
  type GlobalRadarLanguage,
  type PublicGlobalRadarPlanningConfig,
} from "../app/domain/global-radar/planner";
import {
  globalRadarLeafIdentifiers,
  globalRadarSourceFamilies,
  globalRadarThemes,
} from "../app/domain/taxonomies/global-radar-v1";

const planningConfig: PublicGlobalRadarPlanningConfig = {
  countries: ["US", "China"],
  languages: ["en", "zh-CN"],
  themes: globalRadarThemes,
  enabledSourceAdapters: ["codex_public_web"],
  sourceFamilies: ["official_company_material"],
  resultLimit: 20,
  scoreVersion: "global-radar-score-v1",
  thresholds: {
    version: "global-radar-thresholds-v1",
    direct_demand: 70,
    demand_precursor: 65,
    ecosystem_momentum: 70,
  },
};

const nonWatchlistScanModes = [
  { label: "daily_tactical", scanMode: "daily" },
  { label: "weekly_thematic", scanMode: "thematic" },
  { label: "manual", scanMode: "manual" },
] as const;

function mixedCountryPlan(
  scanMode: (typeof nonWatchlistScanModes)[number]["scanMode"],
  languages: readonly GlobalRadarLanguage[],
) {
  return planGlobalRadarRun({
    now: new Date("2026-07-29T05:00:00.000Z"),
    scanMode,
    ...(scanMode === "manual"
      ? {
          administratorRequestId: "55555555-5555-4555-8555-555555555555",
          requestedTheme: "robotics_manufacturing" as const,
        }
      : {}),
    config: {
      ...planningConfig,
      countries: ["Japan", "China"],
      languages,
      themes: ["robotics_manufacturing"],
    },
    coverageState: {
      countryLastCoveredAt: {},
      themeLastCoveredAt: {},
      watchlistLastCoveredAt: {},
    },
    watchlist: [],
  });
}

function plan(
  config: PublicGlobalRadarPlanningConfig = planningConfig,
) {
  return planGlobalRadarRun({
    now: new Date("2026-07-29T05:00:00.000Z"),
    scanMode: "manual",
    administratorRequestId: "11111111-1111-4111-8111-111111111111",
    requestedTheme: "robotics_manufacturing",
    config,
    coverageState: {
      countryLastCoveredAt: {},
      themeLastCoveredAt: {},
      watchlistLastCoveredAt: {},
    },
    watchlist: [],
  });
}

describe("Global Radar query generator", () => {
  it.each(nonWatchlistScanModes)(
    "$label scopes selected Chinese per country",
    ({ scanMode }) => {
      const radarPlan = mixedCountryPlan(scanMode, ["zh-CN"]);
      const queries = generateGlobalRadarQueries(radarPlan);

      expect(radarPlan.languages).toEqual(["zh-CN"]);
      expect(queries.map(({ sourceCountry, language }) =>
        `${sourceCountry}:${language}`,
      )).toEqual([
        "China:en",
        "China:zh-CN",
        "China:en",
        "China:zh-CN",
        "China:en",
        "China:zh-CN",
      ]);
    },
  );

  it.each(nonWatchlistScanModes)(
    "$label scopes selected English per country",
    ({ scanMode }) => {
      const radarPlan = mixedCountryPlan(scanMode, ["en"]);
      const queries = generateGlobalRadarQueries(radarPlan);

      expect(radarPlan.languages).toEqual(["en"]);
      expect(queries.map(({ sourceCountry, language }) =>
        `${sourceCountry}:${language}`,
      )).toEqual([
        "Japan:en",
        "Japan:en",
        "Japan:en",
        "China:en",
        "China:zh-CN",
        "China:en",
        "China:zh-CN",
        "China:en",
        "China:zh-CN",
      ]);
    },
  );

  it("generates stable ordered English and Chinese query families", () => {
    const first = generateGlobalRadarQueries(plan());
    const second = generateGlobalRadarQueries(plan());

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first).toHaveLength(9);
    expect(first.map(({ sourceCountry, language, signalIntent }) =>
      `${sourceCountry}:${language}:${signalIntent}`,
    )).toEqual([
      "US:en:direct_demand",
      "US:en:demand_precursor",
      "US:en:ecosystem_momentum",
      "China:en:direct_demand",
      "China:zh-CN:direct_demand",
      "China:en:demand_precursor",
      "China:zh-CN:demand_precursor",
      "China:en:ecosystem_momentum",
      "China:zh-CN:ecosystem_momentum",
    ]);
    expect(first.map((query) => query.ordinal)).toEqual(
      Array.from({ length: 9 }, (_, ordinal) => ordinal),
    );
    expect(first.every((query) => /^[a-f0-9]{64}$/.test(query.fingerprint))).toBe(
      true,
    );
    expect(first.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.keys(first[0])).toEqual([
      "fingerprint",
      "query",
      "language",
      "sourceCountry",
      "theme",
      "signalIntent",
      "sourceAdapter",
      "recencyDays",
      "ordinal",
    ]);
  });

  it("emits fully localized Chinese capability, source, country, and intent text", () => {
    const query = generateGlobalRadarQueries(plan()).find(
      (candidate) =>
        candidate.language === "zh-CN" &&
        candidate.signalIntent === "direct_demand",
    );

    expect(query?.query).toMatch(/^"合同制造"/);
    expect(query?.query).toContain('"中国"');
    expect(query?.query).toMatch(/官网.*公司网站.*官方公告/);
    expect(query?.query).toMatch(/招标.*采购.*供应商注册.*合作伙伴申请/);
    expect(query?.query).not.toMatch(
      /contract manufacturing|official company material|"China"/i,
    );
  });

  it("preserves watchlist entry scope instead of fabricating a cartesian plan", () => {
    const watchlistPlan = planGlobalRadarRun({
      now: new Date("2026-07-29T05:00:00.000Z"),
      scanMode: "watchlist_refresh",
      config: {
        ...planningConfig,
        countries: ["China", "Japan"],
        themes: [
          "robot_teleoperation_demonstrations",
          "robotics_manufacturing",
        ],
      },
      coverageState: {
        countryLastCoveredAt: {},
        themeLastCoveredAt: {},
        watchlistLastCoveredAt: {},
      },
      watchlist: [
        {
          category: "foundation_models",
          categorySearchTerms: {
            en: "foundation models",
            "zh-CN": "基础模型",
          },
          theme: "robot_teleoperation_demonstrations",
          countries: ["China"],
          languages: ["en", "zh-CN"],
          cadenceDays: 7,
          priority: 50,
        },
        {
          category: "component_suppliers",
          categorySearchTerms: { en: "component suppliers" },
          theme: "robotics_manufacturing",
          countries: ["Japan"],
          languages: ["en"],
          cadenceDays: 7,
          priority: 100,
        },
      ],
    });
    const queries = generateGlobalRadarQueries(watchlistPlan);

    expect(queries).toHaveLength(9);
    expect(queries.slice(0, 3).every((query) =>
      query.query.includes("component suppliers"),
    )).toBe(true);
    expect(queries.slice(3).filter((query) => query.language === "en").every(
      (query) => query.query.includes("foundation models"),
    )).toBe(true);
    expect(queries.slice(3).filter((query) => query.language === "zh-CN").every(
      (query) => query.query.includes("基础模型"),
    )).toBe(true);
    expect(new Set(queries.map((query) => `${query.sourceCountry}:${query.theme}`))).toEqual(
      new Set([
        "Japan:robotics_manufacturing",
        "China:robot_teleoperation_demonstrations",
      ]),
    );
  });

  it("requires only executable English terms for non-China watchlist work", () => {
    const watchlistPlan = planGlobalRadarRun({
      now: new Date("2026-07-29T05:00:00.000Z"),
      scanMode: "watchlist_refresh",
      config: {
        ...planningConfig,
        countries: ["Japan"],
        languages: ["en", "zh-CN"],
        themes: ["robotics_manufacturing"],
      },
      coverageState: {
        countryLastCoveredAt: {},
        themeLastCoveredAt: {},
        watchlistLastCoveredAt: {},
      },
      watchlist: [
        {
          category: "component_suppliers",
          categorySearchTerms: { en: "component suppliers" },
          theme: "robotics_manufacturing",
          countries: ["Japan"],
          languages: ["en", "zh-CN"],
          cadenceDays: 7,
          priority: 100,
        },
      ],
    });
    const queries = generateGlobalRadarQueries(watchlistPlan);

    expect(watchlistPlan.watchlist[0]).toMatchObject({
      countries: ["Japan"],
      languages: ["en", "zh-CN"],
      categorySearchTerms: { en: "component suppliers" },
    });
    expect(queries).toHaveLength(3);
    expect(queries.every((query) =>
      query.language === "en" &&
      query.sourceCountry === "Japan" &&
      query.query.includes("component suppliers"),
    )).toBe(true);
  });

  it("removes non-China Chinese-only watchlist entries before query generation", () => {
    const watchlistPlan = planGlobalRadarRun({
      now: new Date("2026-07-29T05:00:00.000Z"),
      scanMode: "watchlist_refresh",
      config: {
        ...planningConfig,
        countries: ["Japan"],
        languages: ["zh-CN"],
        themes: ["robotics_manufacturing"],
      },
      coverageState: {
        countryLastCoveredAt: {},
        themeLastCoveredAt: {},
        watchlistLastCoveredAt: {},
      },
      watchlist: [
        {
          category: "component_suppliers",
          categorySearchTerms: { "zh-CN": "零部件供应商" },
          theme: "robotics_manufacturing",
          countries: ["Japan"],
          languages: ["zh-CN"],
          cadenceDays: 7,
          priority: 100,
        },
      ],
    });

    expect(watchlistPlan.watchlist).toEqual([]);
    expect(watchlistPlan.languages).toEqual([]);
    expect(generateGlobalRadarQueries(watchlistPlan)).toEqual([]);
  });

  it("keeps mixed-country Chinese selection from leaking English work into Japan", () => {
    const watchlistPlan = planGlobalRadarRun({
      now: new Date("2026-07-29T05:00:00.000Z"),
      scanMode: "watchlist_refresh",
      config: {
        ...planningConfig,
        countries: ["Japan", "China"],
        languages: ["zh-CN"],
        themes: ["robotics_manufacturing"],
      },
      coverageState: {
        countryLastCoveredAt: {},
        themeLastCoveredAt: {},
        watchlistLastCoveredAt: {},
      },
      watchlist: [
        {
          category: "component_suppliers",
          categorySearchTerms: {
            en: "component suppliers",
            "zh-CN": "零部件供应商",
          },
          theme: "robotics_manufacturing",
          countries: ["Japan", "China"],
          languages: ["zh-CN"],
          cadenceDays: 7,
          priority: 100,
        },
      ],
    });
    const queries = generateGlobalRadarQueries(watchlistPlan);

    expect(watchlistPlan.watchlist[0].languages).toEqual(["zh-CN"]);
    expect(queries).toHaveLength(6);
    expect(queries.every((query) => query.sourceCountry === "China")).toBe(true);
    expect(queries.map((query) => query.language)).toEqual([
      "en",
      "zh-CN",
      "en",
      "zh-CN",
      "en",
      "zh-CN",
    ]);
  });

  it("executes mixed-country English selection per country", () => {
    const watchlistPlan = planGlobalRadarRun({
      now: new Date("2026-07-29T05:00:00.000Z"),
      scanMode: "watchlist_refresh",
      config: {
        ...planningConfig,
        countries: ["Japan", "China"],
        languages: ["en"],
        themes: ["robotics_manufacturing"],
      },
      coverageState: {
        countryLastCoveredAt: {},
        themeLastCoveredAt: {},
        watchlistLastCoveredAt: {},
      },
      watchlist: [
        {
          category: "component_suppliers",
          categorySearchTerms: {
            en: "component suppliers",
            "zh-CN": "零部件供应商",
          },
          theme: "robotics_manufacturing",
          countries: ["Japan", "China"],
          languages: ["en"],
          cadenceDays: 7,
          priority: 100,
        },
      ],
    });
    const queries = generateGlobalRadarQueries(watchlistPlan);

    expect(watchlistPlan.watchlist[0].languages).toEqual(["en"]);
    expect(queries.map(({ sourceCountry, language }) =>
      `${sourceCountry}:${language}`,
    )).toEqual([
      "Japan:en",
      "Japan:en",
      "Japan:en",
      "China:en",
      "China:zh-CN",
      "China:en",
      "China:zh-CN",
      "China:en",
      "China:zh-CN",
    ]);
  });

  it("keeps distinct China watchlist categories as complete bilingual families", () => {
    const watchlistPlan = planGlobalRadarRun({
      now: new Date("2026-07-29T05:00:00.000Z"),
      scanMode: "watchlist_refresh",
      config: {
        ...planningConfig,
        countries: ["China"],
        languages: ["en"],
        themes: ["robotics_manufacturing"],
      },
      coverageState: {
        countryLastCoveredAt: {},
        themeLastCoveredAt: {},
        watchlistLastCoveredAt: {},
      },
      watchlist: [
        {
          category: "motors",
          categorySearchTerms: { en: "motors", "zh-CN": "电机" },
          theme: "robotics_manufacturing",
          countries: ["China"],
          languages: ["en"],
          cadenceDays: 7,
          priority: 100,
        },
        {
          category: "batteries",
          categorySearchTerms: { en: "batteries", "zh-CN": "电池" },
          theme: "robotics_manufacturing",
          countries: ["China"],
          languages: ["en"],
          cadenceDays: 7,
          priority: 50,
        },
      ],
    });
    const queries = generateGlobalRadarQueries(watchlistPlan);

    expect(queries).toHaveLength(12);
    expect(new Set(queries.map((query) => query.fingerprint))).toHaveLength(12);
    expect(queries.filter((query) => query.language === "en")).toHaveLength(6);
    expect(queries.filter((query) => query.language === "zh-CN")).toHaveLength(
      6,
    );
    expect(
      queries.filter(
        (query) => query.language === "en" && query.query.includes("motors"),
      ),
    ).toHaveLength(3);
    expect(
      queries.filter(
        (query) =>
          query.language === "en" && query.query.includes("batteries"),
      ),
    ).toHaveLength(3);
    const chineseQueries = queries.filter(
      (query) => query.language === "zh-CN",
    );
    expect(chineseQueries.slice(0, 3).every((query) =>
      query.query.includes("电机"),
    )).toBe(true);
    expect(chineseQueries.slice(3).every((query) =>
      query.query.includes("电池"),
    )).toBe(true);
    expect(new Set(chineseQueries.map((query) => query.query))).toHaveLength(6);
    for (let index = 0; index < queries.length; index += 2) {
      expect(queries.slice(index, index + 2).map((query) => query.language)).toEqual(
        ["en", "zh-CN"],
      );
    }
  });

  it("rejects distinct watchlist categories with duplicate semantic query text", () => {
    const watchlistPlan = planGlobalRadarRun({
      now: new Date("2026-07-29T05:00:00.000Z"),
      scanMode: "watchlist_refresh",
      config: {
        ...planningConfig,
        countries: ["China"],
        languages: ["en"],
        themes: ["robotics_manufacturing"],
      },
      coverageState: {
        countryLastCoveredAt: {},
        themeLastCoveredAt: {},
        watchlistLastCoveredAt: {},
      },
      watchlist: [
        {
          category: "motors",
          categorySearchTerms: { en: "components", "zh-CN": "零部件" },
          theme: "robotics_manufacturing",
          countries: ["China"],
          languages: ["en"],
          cadenceDays: 7,
          priority: 100,
        },
        {
          category: "batteries",
          categorySearchTerms: { en: "components", "zh-CN": "零部件" },
          theme: "robotics_manufacturing",
          countries: ["China"],
          languages: ["en"],
          cadenceDays: 7,
          priority: 50,
        },
      ],
    });

    expect(() => generateGlobalRadarQueries(watchlistPlan)).toThrow(
      /duplicate semantic query text/i,
    );
  });

  it("uses explicit intent templates without claiming confirmed opportunities", () => {
    const queries = generateGlobalRadarQueries(plan());
    const direct = queries.find(
      (query) => query.language === "en" && query.signalIntent === "direct_demand",
    );
    const precursor = queries.find(
      (query) =>
        query.language === "en" && query.signalIntent === "demand_precursor",
    );
    const momentum = queries.find(
      (query) =>
        query.language === "en" && query.signalIntent === "ecosystem_momentum",
    );

    expect(direct).toMatchObject({
      sourceAdapter: "codex_public_web",
      recencyDays: 30,
      theme: "robotics_manufacturing",
    });
    expect(direct?.query).toMatch(
      /RFP.*procurement.*supplier registration.*vendor.*partner application.*distributor.*contract manufacturing.*data collection.*teleoperation.*demonstrations.*testing.*certification.*installation.*service/,
    );
    expect(precursor).toMatchObject({ recencyDays: 90 });
    expect(precursor?.query).toMatch(
      /launch.*funding.*hiring.*deployment.*facility.*expansion.*supply-chain buildout.*robot fleets.*India market entry/,
    );
    expect(momentum).toMatchObject({ recencyDays: 90 });
    expect(momentum?.query).toMatch(/trend.*ecosystem growth.*increasing activity/);
    expect(momentum?.query).not.toMatch(/confirmed opportunity|procurement|RFP/i);
    expect(queries.every((query) =>
      globalRadarThemes.includes(query.theme),
    )).toBe(true);
    expect(queries.some((query) => /best company|leading company|marketing/i.test(query.query))).toBe(
      false,
    );
  });

  it("derives capability phrases from approved leaf identifiers", () => {
    const queries = generateGlobalRadarQueries(plan());

    expect(Object.keys(globalRadarThemeLeafIdentifiers)).toEqual(
      globalRadarThemes,
    );
    expect(Object.values(globalRadarThemeLeafIdentifiers).every((identifier) =>
      globalRadarLeafIdentifiers.includes(identifier),
    )).toBe(true);
    expect(queries.every((query) =>
      query.query.startsWith(
        query.language === "zh-CN" ? '"合同制造"' : '"contract manufacturing"',
      ),
    )).toBe(true);
    expect(queries.some((query) =>
      query.query.includes("robotics manufacturing and components"),
    )).toBe(false);
  });

  it("expands queries in the plan source-family hierarchy", () => {
    const queries = generateGlobalRadarQueries(
      plan({
        ...planningConfig,
        countries: ["US"],
        languages: ["en"],
        sourceFamilies: ["official_jobs", "official_company_material"],
      }),
    );

    expect(queries).toHaveLength(6);
    expect(queries.slice(0, 3).every((query) =>
      /official website.*company website.*company announcement/.test(query.query),
    )).toBe(true);
    expect(queries.slice(3).every((query) =>
      /careers.*jobs.*hiring/.test(query.query),
    )).toBe(true);
    expect(Object.keys(queries[0])).toEqual([
      "fingerprint",
      "query",
      "language",
      "sourceCountry",
      "theme",
      "signalIntent",
      "sourceAdapter",
      "recencyDays",
      "ordinal",
    ]);
  });

  it("uses search-effective localized source constraints without internal labels", () => {
    const queries = generateGlobalRadarQueries(
      plan({
        ...planningConfig,
        countries: ["China"],
        languages: ["en"],
        sourceFamilies: globalRadarSourceFamilies,
      }),
    );
    const englishConstraints = [
      /official website.*company website.*company announcement/,
      /supplier.*partner.*supplier registration.*partner application/,
      /RFP.*procurement.*tender.*bid/,
      /research lab.*technical report.*publication/,
      /dataset.*benchmark.*data catalog/,
      /careers.*jobs.*hiring/,
      /investor relations.*earnings.*shareholder/,
      /government.*ministry.*industry association/,
      /accelerator.*investor.*portfolio update/,
      /technical publication.*business publication.*industry report/,
      /conference.*summit.*technical talk/,
      /official announcement.*official update.*verified account/,
    ];
    const chineseConstraints = [
      /官网.*公司网站.*官方公告/,
      /供应商.*合作伙伴.*供应商注册.*合作伙伴申请/,
      /招标.*采购.*征求建议书/,
      /官方研究.*研究实验室.*技术报告/,
      /数据集.*基准测试.*数据目录/,
      /招聘.*职位.*人才招聘/,
      /投资者关系.*财报.*股东/,
      /政府.*行业协会.*公共机构/,
      /加速器.*投资机构.*项目更新/,
      /技术媒体.*商业媒体.*行业出版物/,
      /会议.*峰会.*技术演讲/,
      /官方公告.*官方动态.*官方社交账号/,
    ];

    expect(queries).toHaveLength(globalRadarSourceFamilies.length * 6);
    globalRadarSourceFamilies.forEach((sourceFamily, index) => {
      const familyQueries = queries.slice(index * 6, index * 6 + 6);
      const english = familyQueries.find((query) => query.language === "en");
      const chinese = familyQueries.find((query) => query.language === "zh-CN");
      const internalLabel = sourceFamily.replaceAll("_", " ");

      expect(english?.query).toMatch(englishConstraints[index]);
      expect(chinese?.query).toMatch(chineseConstraints[index]);
      expect(familyQueries.every((query) =>
        !query.query.includes(`"${internalLabel}"`),
      )).toBe(true);
    });
  });

  it("caps deterministic query work at 120", () => {
    const countries = Array.from({ length: 20 }, (_, index) => `Market-${index}`);
    const largePlan = planGlobalRadarRun({
      now: new Date("2026-07-29T05:00:00.000Z"),
      scanMode: "manual",
      administratorRequestId: "22222222-2222-4222-8222-222222222222",
      config: {
        ...planningConfig,
        countries,
        languages: ["en"],
      },
      coverageState: {
        countryLastCoveredAt: {},
        themeLastCoveredAt: {},
        watchlistLastCoveredAt: {},
      },
      watchlist: [],
    });

    const queries = generateGlobalRadarQueries(largePlan);

    expect(queries).toHaveLength(120);
    expect(queries.at(-1)?.ordinal).toBe(119);
  });

  it("keeps China bilingual query families atomic at the cap", () => {
    const cappedPlan = planGlobalRadarRun({
      now: new Date("2026-07-29T05:00:00.000Z"),
      scanMode: "manual",
      administratorRequestId: "44444444-4444-4444-8444-444444444444",
      config: {
        ...planningConfig,
        countries: ["US", "China"],
        languages: ["en"],
        themes: [
          "robot_teleoperation_demonstrations",
          "industrial_robotics_data",
          "robotics_manufacturing",
        ],
        sourceFamilies: globalRadarSourceFamilies,
      },
      coverageState: {
        countryLastCoveredAt: {},
        themeLastCoveredAt: {},
        watchlistLastCoveredAt: {},
      },
      watchlist: [],
    });
    const queries = generateGlobalRadarQueries(cappedPlan);
    const chinaQueries = queries.filter(
      (query) => query.sourceCountry === "China",
    );

    expect(queries.length).toBeLessThanOrEqual(120);
    expect(queries).toHaveLength(119);
    expect(chinaQueries.filter((query) => query.language === "en")).toHaveLength(
      chinaQueries.filter((query) => query.language === "zh-CN").length,
    );
    for (let index = 0; index < chinaQueries.length; index += 2) {
      const english = chinaQueries[index];
      const chinese = chinaQueries[index + 1];
      expect([english.language, chinese.language]).toEqual(["en", "zh-CN"]);
      expect({
        sourceAdapter: chinese.sourceAdapter,
        sourceCountry: chinese.sourceCountry,
        theme: chinese.theme,
        signalIntent: chinese.signalIntent,
        recencyDays: chinese.recencyDays,
      }).toEqual({
        sourceAdapter: english.sourceAdapter,
        sourceCountry: english.sourceCountry,
        theme: english.theme,
        signalIntent: english.signalIntent,
        recencyDays: english.recencyDays,
      });
    }
  });

  it("returns an explicit empty query plan when no source or work is enabled", () => {
    const variants: PublicGlobalRadarPlanningConfig[] = [
      { ...planningConfig, enabledSourceAdapters: [] },
      { ...planningConfig, sourceFamilies: [] },
      { ...planningConfig, countries: [] },
      { ...planningConfig, languages: [] },
      { ...planningConfig, themes: [] },
    ];

    expect(
      variants.map((config) =>
        generateGlobalRadarQueries(
          planGlobalRadarRun({
            now: new Date("2026-07-29T05:00:00.000Z"),
            scanMode: "daily",
            config,
            coverageState: {
              countryLastCoveredAt: {},
              themeLastCoveredAt: {},
              watchlistLastCoveredAt: {},
            },
            watchlist: [],
          }),
        ),
      ),
    ).toEqual([[], [], [], [], []]);
  });
});

const exactSearchQueryShape: SearchQuery = {
  fingerprint: "a".repeat(64),
  query: "robotics manufacturing procurement",
  language: "en",
  sourceCountry: "US",
  theme: "robotics_manufacturing",
  signalIntent: "direct_demand",
  sourceAdapter: "codex_public_web",
  recencyDays: 30,
  ordinal: 0,
};

void exactSearchQueryShape;
