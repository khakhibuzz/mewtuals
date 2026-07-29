import { describe, expect, it } from "vitest";

import {
  generateGlobalRadarQueries,
  globalRadarThemeLeafIdentifiers,
  type SearchQuery,
} from "../app/domain/global-radar/query-generator";
import {
  planGlobalRadarRun,
  type PublicGlobalRadarPlanningConfig,
} from "../app/domain/global-radar/planner";
import {
  globalRadarLeafIdentifiers,
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
};

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
      "China:en:demand_precursor",
      "China:en:ecosystem_momentum",
      "China:zh-CN:direct_demand",
      "China:zh-CN:demand_precursor",
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
          theme: "robot_teleoperation_demonstrations",
          countries: ["China"],
          languages: ["en", "zh-CN"],
          cadenceDays: 7,
          priority: 50,
        },
        {
          category: "component_suppliers",
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
    expect(queries.slice(3).every((query) =>
      query.query.includes("foundation models"),
    )).toBe(true);
    expect(new Set(queries.map((query) => `${query.sourceCountry}:${query.theme}`))).toEqual(
      new Set([
        "Japan:robotics_manufacturing",
        "China:robot_teleoperation_demonstrations",
      ]),
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
      query.query.startsWith('"contract manufacturing"'),
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
      query.query.includes('"official company material"'),
    )).toBe(true);
    expect(queries.slice(3).every((query) =>
      query.query.includes('"official jobs"'),
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
