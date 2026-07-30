import { describe, expect, it } from "vitest";

import * as globalRadarDomain from "../app/domain/global-radar";
import {
  GLOBAL_RADAR_PLAN_VERSION,
  GLOBAL_RADAR_QUERY_VERSION,
  parseGlobalRadarPlanSnapshot,
  planGlobalRadarRun,
  type GlobalRadarPlannerInput,
  type GlobalRadarLanguage,
  type GlobalRadarSourceFamily,
  type PublicGlobalRadarPlanningConfig,
} from "../app/domain/global-radar/planner";
import {
  globalRadarSourceFamilies,
  globalRadarThemes,
} from "../app/domain/taxonomies/global-radar-v1";

const planningConfig: PublicGlobalRadarPlanningConfig = {
  countries: ["US", "China"],
  languages: ["en", "zh-CN"],
  themes: globalRadarThemes,
  enabledSourceAdapters: ["codex_public_web"],
  sourceFamilies: globalRadarSourceFamilies,
  resultLimit: 20,
  scoreVersion: "global-radar-score-v1",
  thresholds: {
    version: "global-radar-thresholds-v1",
    direct_demand: 70,
    demand_precursor: 65,
    ecosystem_momentum: 70,
  },
};

function plannerInput(
  overrides: Partial<GlobalRadarPlannerInput> = {},
): GlobalRadarPlannerInput {
  return {
    now: new Date("2026-07-29T05:00:00.000Z"),
    scanMode: "daily",
    config: planningConfig,
    coverageState: {
      countryLastCoveredAt: {},
      themeLastCoveredAt: {},
      watchlistLastCoveredAt: {},
    },
    watchlist: [],
    ...overrides,
  };
}

describe("Global Radar planner", () => {
  it("locks versioned class thresholds into the config and plan fingerprints", () => {
    const baseline = planGlobalRadarRun(plannerInput());
    const changed = planGlobalRadarRun(
      plannerInput({
        config: {
          ...planningConfig,
          thresholds: {
            ...planningConfig.thresholds,
            direct_demand: 71,
          },
        },
      }),
    );

    expect(baseline.thresholds).toEqual(planningConfig.thresholds);
    expect(Object.isFrozen(baseline.thresholds)).toBe(true);
    expect(changed.configHash).not.toBe(baseline.configHash);
    expect(changed.fingerprint).not.toBe(baseline.fingerprint);
  });

  it("exports one strict fingerprint-verifying plan snapshot parser", () => {
    const plan = planGlobalRadarRun(plannerInput());

    expect(parseGlobalRadarPlanSnapshot(plan, plan.fingerprint)).toEqual(plan);
    expect(
      parseGlobalRadarPlanSnapshot(
        {
          ...plan,
          thresholds: { ...plan.thresholds, direct_demand: 71 },
        },
        plan.fingerprint,
      ),
    ).toBeNull();
    expect(
      parseGlobalRadarPlanSnapshot(
        { ...plan, privateWorkerValue: "forbidden" },
        plan.fingerprint,
      ),
    ).toBeNull();
  });
  it("exposes the deliberate Task 2 public domain API", () => {
    expect({
      generate: globalRadarDomain.generateGlobalRadarQueries,
      plan: globalRadarDomain.planGlobalRadarRun,
      planVersion: globalRadarDomain.GLOBAL_RADAR_PLAN_VERSION,
      queryVersion: globalRadarDomain.GLOBAL_RADAR_QUERY_VERSION,
      themeLeaves: globalRadarDomain.globalRadarThemeLeafIdentifiers,
    }).toEqual({
      generate: expect.any(Function),
      plan: planGlobalRadarRun,
      planVersion: "global-radar-plan-v1",
      queryVersion: "global-radar-query-v1",
      themeLeaves: expect.objectContaining({
        robotics_manufacturing: "contract_manufacturing",
      }),
    });
  });

  it("builds a deterministic daily plan", () => {
    const first = planGlobalRadarRun(plannerInput());
    const second = planGlobalRadarRun(plannerInput());

    expect(GLOBAL_RADAR_PLAN_VERSION).toBe("global-radar-plan-v1");
    expect(GLOBAL_RADAR_QUERY_VERSION).toBe("global-radar-query-v1");
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first).toMatchObject({
      version: "global-radar-plan-v1",
      queryVersion: "global-radar-query-v1",
      scanMode: "daily",
      countries: ["US", "China"],
      languages: ["en", "zh-CN"],
      themes: globalRadarThemes,
      sourceAdapters: ["codex_public_web"],
      sourceFamilies: globalRadarSourceFamilies,
      dateWindow: {
        startInclusive: "2026-06-29T18:30:00.000Z",
        endExclusive: "2026-07-29T18:30:00.000Z",
      },
      resultLimit: 20,
      taxonomyVersion: "global-radar-v1",
      scoreVersion: "global-radar-score-v1",
    });
    expect(first.identityKey).toBe(
      `daily:2026-07-29:${first.configHash}`,
    );
    expect(first.configHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("orders selected source families by the approved hierarchy", () => {
    const plan = planGlobalRadarRun(
      plannerInput({
        config: {
          ...planningConfig,
          sourceFamilies: [
            "official_jobs",
            "public_procurement_and_rfp_portals",
            "official_company_material",
          ],
        },
      }),
    );

    expect(plan.sourceFamilies).toEqual([
      "official_company_material",
      "public_procurement_and_rfp_portals",
      "official_jobs",
    ]);
    expect(Object.isFrozen(plan.sourceFamilies)).toBe(true);

    const fewerSources = planGlobalRadarRun(
      plannerInput({
        config: {
          ...planningConfig,
          sourceFamilies: ["official_company_material"],
        },
      }),
    );
    expect(fewerSources.configHash).not.toBe(plan.configHash);
    expect(fewerSources.fingerprint).not.toBe(plan.fingerprint);
  });

  it("preserves configured languages when China is selected", () => {
    const englishOnly = planGlobalRadarRun(
      plannerInput({
        config: { ...planningConfig, languages: ["en"] },
      }),
    );
    const chineseOnly = planGlobalRadarRun(
      plannerInput({
        config: { ...planningConfig, languages: ["zh-CN"] },
      }),
    );

    expect(englishOnly.languages).toEqual(["en"]);
    expect(chineseOnly.languages).toEqual(["zh-CN"]);
  });

  it("rejects languages without implemented query text", () => {
    expect(() =>
      planGlobalRadarRun(
        plannerInput({
          config: {
            ...planningConfig,
            languages: ["fr"],
          } as unknown as PublicGlobalRadarPlanningConfig,
        }),
      ),
    ).toThrow(/language/);
  });

  it("builds an ISO-week thematic plan from the approved rotation", () => {
    const plan = planGlobalRadarRun(
      plannerInput({ scanMode: "thematic" }),
    );

    expect(plan.themes).toEqual([
      "multilingual_speech_and_human_robot_interaction",
    ]);
    expect(plan.identityKey).toBe(
      `thematic:2026-W31:multilingual_speech_and_human_robot_interaction:${plan.configHash}`,
    );
    expect(plan.dateWindow).toEqual({
      startInclusive: "2026-04-30T18:30:00.000Z",
      endExclusive: "2026-07-29T18:30:00.000Z",
    });
  });

  it("uses an administrator UUID as manual plan identity", () => {
    const requestId = "11111111-1111-4111-8111-111111111111";
    const plan = planGlobalRadarRun(
      plannerInput({
        scanMode: "manual",
        administratorRequestId: requestId,
        requestedTheme: "robotics_manufacturing",
      }),
    );

    expect(plan.identityKey).toBe(
      `manual:global-radar-plan-v1:${requestId}`,
    );
    expect(plan.themes).toEqual(["robotics_manufacturing"]);
    expect(() =>
      planGlobalRadarRun(
        plannerInput({
          scanMode: "manual",
          administratorRequestId: "not-a-uuid",
        }),
      ),
    ).toThrow(/valid administrator request UUID/);
  });

  it("keeps manual identity stable across configuration changes", () => {
    const requestId = "33333333-3333-4333-8333-333333333333";
    const first = planGlobalRadarRun(
      plannerInput({
        scanMode: "manual",
        administratorRequestId: requestId,
      }),
    );
    const changed = planGlobalRadarRun(
      plannerInput({
        scanMode: "manual",
        administratorRequestId: requestId,
        config: {
          ...planningConfig,
          resultLimit: 1,
          sourceFamilies: ["official_company_material"],
        },
      }),
    );

    expect(changed.identityKey).toBe(first.identityKey);
    expect(changed.configHash).not.toBe(first.configHash);
    expect(changed.fingerprint).not.toBe(first.fingerprint);
  });

  it("builds watchlist refreshes from due configured entries", () => {
    const plan = planGlobalRadarRun(
      plannerInput({
        scanMode: "watchlist_refresh",
        config: {
          ...planningConfig,
          countries: ["US", "China", "Japan"],
        },
        coverageState: {
          countryLastCoveredAt: {},
          themeLastCoveredAt: {},
          watchlistLastCoveredAt: {
            component_suppliers: "2026-07-28T05:00:00.000Z",
          },
        },
        watchlist: [
          {
            category: "foundation_models",
            categorySearchTerms: {
              en: "foundation models",
              "zh-CN": "基础模型",
            },
            theme: "robot_teleoperation_demonstrations",
            countries: ["China", "US"],
            languages: ["zh-CN", "en"],
            cadenceDays: 7,
            priority: 50,
          },
          {
            category: "component_suppliers",
            categorySearchTerms: { en: "component suppliers" },
            theme: "robotics_manufacturing",
            countries: ["Japan"],
            languages: ["en"],
            cadenceDays: 1,
            priority: 100,
          },
        ],
      }),
    );

    expect(plan.watchlist.map((entry) => entry.category)).toEqual([
      "component_suppliers",
      "foundation_models",
    ]);
    expect(plan.countries).toEqual(["Japan", "China", "US"]);
    expect(plan.languages).toEqual(["en", "zh-CN"]);
    expect(plan.themes).toEqual([
      "robotics_manufacturing",
      "robot_teleoperation_demonstrations",
    ]);
    expect(plan.identityKey).toMatch(
      new RegExp(`^watchlist-refresh:2026-07-29:[a-f0-9]{64}:${plan.configHash}$`),
    );
  });

  it("rejects watchlist cadence beyond the database maximum", () => {
    expect(() =>
      planGlobalRadarRun(
        plannerInput({
          scanMode: "watchlist_refresh",
          watchlist: [
            {
              category: "motors",
              categorySearchTerms: { en: "motors" },
              theme: "robotics_manufacturing",
              countries: ["US"],
              languages: ["en"],
              cadenceDays: 366,
              priority: 100,
            },
          ],
        }),
      ),
    ).toThrow(/watchlist cadence.*365/i);
  });

  it.each([
    {
      missingLanguage: "en",
      countries: ["US"],
      languages: ["en"] as GlobalRadarLanguage[],
      categorySearchTerms: { "zh-CN": "电机" },
    },
    {
      missingLanguage: "zh-CN",
      countries: ["China"],
      languages: ["en"] as GlobalRadarLanguage[],
      categorySearchTerms: { en: "motors" },
    },
  ])(
    "rejects a missing $missingLanguage category term for an effective watchlist language",
    ({ missingLanguage, countries, languages, categorySearchTerms }) => {
      expect(() =>
        planGlobalRadarRun(
          plannerInput({
            scanMode: "watchlist_refresh",
            config: { ...planningConfig, countries, languages: ["en"] },
            watchlist: [
              {
                category: "motors",
                categorySearchTerms,
                theme: "robotics_manufacturing",
                countries,
                languages,
                cadenceDays: 7,
                priority: 100,
              },
            ],
          }),
        ),
      ).toThrow(new RegExp(`watchlist.*${missingLanguage}.*search term`, "i"));
    },
  );

  it("derives localized term requirements after effective country intersection", () => {
    const plan = planGlobalRadarRun(
      plannerInput({
        scanMode: "watchlist_refresh",
        config: {
          ...planningConfig,
          countries: ["US"],
          languages: ["en", "zh-CN"],
        },
        watchlist: [
          {
            category: "motors",
            categorySearchTerms: { en: "motors" },
            theme: "robotics_manufacturing",
            countries: ["China", "US"],
            languages: ["en"],
            cadenceDays: 7,
            priority: 100,
          },
        ],
      }),
    );

    expect(plan.watchlist).toEqual([
      expect.objectContaining({
        category: "motors",
        categorySearchTerms: { en: "motors" },
        countries: ["US"],
        languages: ["en"],
      }),
    ]);
  });

  it("rejects unsupported watchlist languages before config filtering", () => {
    expect(() =>
      planGlobalRadarRun(
        plannerInput({
          scanMode: "watchlist_refresh",
          config: { ...planningConfig, countries: ["US"] },
          watchlist: [
            {
              category: "motors",
              categorySearchTerms: { en: "motors" },
              theme: "robotics_manufacturing",
              countries: ["US"],
              languages: ["fr"] as unknown as GlobalRadarLanguage[],
              cadenceDays: 7,
              priority: 100,
            },
          ],
        }),
      ),
    ).toThrow(/watchlist language/i);
  });

  it("rejects non-canonical raw watchlist language values before normalization", () => {
    expect(() =>
      planGlobalRadarRun(
        plannerInput({
          scanMode: "watchlist_refresh",
          config: { ...planningConfig, countries: ["US"] },
          watchlist: [
            {
              category: "motors",
              categorySearchTerms: { en: "motors" },
              theme: "robotics_manufacturing",
              countries: ["US"],
              languages: [" en "] as unknown as GlobalRadarLanguage[],
              cadenceDays: 7,
              priority: 100,
            },
          ],
        }),
      ),
    ).toThrow(/watchlist language/i);
  });

  it("uses locale-independent code-point ordering for canonical ties", () => {
    const plan = planGlobalRadarRun(
      plannerInput({
        scanMode: "watchlist_refresh",
        watchlist: [
          {
            category: "äardvark",
            categorySearchTerms: { en: "äardvark" },
            theme: "robotics_manufacturing",
            countries: ["US"],
            languages: ["en"],
            cadenceDays: 7,
            priority: 50,
          },
          {
            category: "Zebra",
            categorySearchTerms: { en: "Zebra" },
            theme: "robotics_manufacturing",
            countries: ["US"],
            languages: ["en"],
            cadenceDays: 7,
            priority: 50,
          },
        ],
      }),
    );

    expect(plan.watchlist.map((entry) => entry.category)).toEqual([
      "Zebra",
      "äardvark",
    ]);
  });

  it("prioritizes deterministic country and theme coverage gaps", () => {
    const plan = planGlobalRadarRun(
      plannerInput({
        config: {
          ...planningConfig,
          countries: ["China", "US"],
          themes: [
            "robot_teleoperation_demonstrations",
            "robotics_manufacturing",
          ],
        },
        coverageState: {
          countryLastCoveredAt: {
            China: "2026-07-28T05:00:00.000Z",
            US: null,
          },
          themeLastCoveredAt: {
            robot_teleoperation_demonstrations: "2026-07-28T05:00:00.000Z",
            robotics_manufacturing: null,
          },
          watchlistLastCoveredAt: {},
        },
      }),
    );

    expect(plan.countries).toEqual(["US", "China"]);
    expect(plan.themes).toEqual([
      "robotics_manufacturing",
      "robot_teleoperation_demonstrations",
    ]);
  });

  it("copies and freezes caller-owned planning inputs", () => {
    const countries = ["US", "China"];
    const languages: GlobalRadarLanguage[] = ["en", "zh-CN"];
    const sourceFamilies: GlobalRadarSourceFamily[] = [
      "official_company_material",
      "official_jobs",
    ];
    const watchlistCountries = ["China"];
    const categorySearchTerms = {
      en: "foundation models",
      "zh-CN": "基础模型",
    };
    const input = plannerInput({
      scanMode: "watchlist_refresh",
      config: { ...planningConfig, countries, languages, sourceFamilies },
      watchlist: [
        {
          category: "foundation_models",
          categorySearchTerms,
          theme: "robot_teleoperation_demonstrations",
          countries: watchlistCountries,
          languages,
          cadenceDays: 7,
          priority: 50,
        },
      ],
    });
    const plan = planGlobalRadarRun(input);
    const before = JSON.stringify(plan);

    countries.reverse();
    languages.length = 0;
    sourceFamilies.reverse();
    watchlistCountries.push("US");
    categorySearchTerms.en = "mutated";
    input.watchlist[0].category = "mutated";

    expect(JSON.stringify(plan)).toBe(before);
    expect([
      plan,
      plan.countries,
      plan.languages,
      plan.themes,
      plan.sourceAdapters,
      plan.sourceFamilies,
      plan.thresholds,
      plan.dateWindow,
      plan.watchlist,
      plan.watchlist[0],
      plan.watchlist[0].categorySearchTerms,
      plan.watchlist[0].countries,
      plan.watchlist[0].languages,
    ].every(Object.isFrozen)).toBe(true);
  });

  it("canonicalizes config objects without serializing unknown secrets", () => {
    const firstConfig = {
      ...planningConfig,
      workerSecret: "must-not-enter-the-plan",
    };
    const secondConfig = {
      scoreVersion: planningConfig.scoreVersion,
      resultLimit: planningConfig.resultLimit,
      enabledSourceAdapters: planningConfig.enabledSourceAdapters,
      sourceFamilies: planningConfig.sourceFamilies,
      themes: planningConfig.themes,
      languages: planningConfig.languages,
      countries: planningConfig.countries,
      thresholds: planningConfig.thresholds,
    };
    const first = planGlobalRadarRun(plannerInput({ config: firstConfig }));
    const second = planGlobalRadarRun(plannerInput({ config: secondConfig }));

    expect(first.configHash).toBe(second.configHash);
    expect(first.fingerprint).toBe(second.fingerprint);
    expect(JSON.stringify(first)).not.toContain("must-not-enter-the-plan");
  });

  it("rejects invalid planning configuration values", () => {
    expect(() =>
      planGlobalRadarRun(
        plannerInput({
          config: { ...planningConfig, resultLimit: 21 },
        }),
      ),
    ).toThrow(/result limit/);
    expect(() =>
      planGlobalRadarRun(
        plannerInput({
          config: {
            ...planningConfig,
            enabledSourceAdapters: ["private_scraper"],
          } as unknown as PublicGlobalRadarPlanningConfig,
        }),
      ),
    ).toThrow(/source adapter/);
    expect(() =>
      planGlobalRadarRun(
        plannerInput({
          config: {
            ...planningConfig,
            sourceFamilies: ["private_source_family"],
          } as unknown as PublicGlobalRadarPlanningConfig,
        }),
      ),
    ).toThrow(/source family/);
    expect(() =>
      planGlobalRadarRun(
        plannerInput({
          config: {
            ...planningConfig,
            themes: ["generic_company_search"],
          } as unknown as PublicGlobalRadarPlanningConfig,
        }),
      ),
    ).toThrow(/theme/);
  });

  it("permits an explicit zero-work thematic plan", () => {
    const plan = planGlobalRadarRun(
      plannerInput({
        scanMode: "thematic",
        config: { ...planningConfig, themes: [] },
      }),
    );

    expect(plan.themes).toEqual([]);
    expect(plan.identityKey).toBe(
      `thematic:2026-W31:no-enabled-theme:${plan.configHash}`,
    );
  });
});
