import { describe, expect, it } from "vitest";

import {
  GLOBAL_RADAR_SCORE_VERSION,
  globalRadarSourceFamilies,
  planGlobalRadarRun,
} from "../app/domain/global-radar";
import { deriveGlobalRadarPlanningContext } from "../db/repositories/global-radar-planning-context";

function plan(
  now: Date,
  scanMode: "daily" | "watchlist_refresh",
) {
  return planGlobalRadarRun({
    now,
    scanMode,
    config: {
      countries: ["United States", "China"],
      languages: ["en", "zh-CN"],
      themes: ["robotics_manufacturing"],
      enabledSourceAdapters: ["codex_public_web"],
      sourceFamilies: globalRadarSourceFamilies,
      resultLimit: 20,
      scoreVersion: GLOBAL_RADAR_SCORE_VERSION,
      thresholds: {
        version: "global-radar-thresholds-v1",
        direct_demand: 70,
        demand_precursor: 65,
        ecosystem_momentum: 70,
      },
    },
    coverageState: {
      countryLastCoveredAt: {},
      themeLastCoveredAt: {},
      watchlistLastCoveredAt: {},
    },
    watchlist:
      scanMode === "watchlist_refresh"
        ? [
            {
              category: "component_suppliers",
              categorySearchTerms: {
                en: "robotics component suppliers",
                "zh-CN": "机器人零部件供应商",
              },
              theme: "robotics_manufacturing",
              countries: ["China"],
              languages: ["en", "zh-CN"],
              cadenceDays: 7,
              priority: 80,
            },
          ]
        : [],
  });
}

describe("Global Radar planning context repository mapping", () => {
  it("derives bounded coverage and executable due watchlist inputs", () => {
    const daily = plan(new Date("2026-07-28T04:00:00.000Z"), "daily");
    const watchlist = plan(
      new Date("2026-07-29T04:00:00.000Z"),
      "watchlist_refresh",
    );
    expect(
      deriveGlobalRadarPlanningContext({
        now: new Date("2026-07-31T04:00:00.000Z"),
        scanMode: "watchlist_refresh",
        completedRuns: [
          {
            planFingerprint: daily.fingerprint,
            planSnapshot: structuredClone(daily) as unknown as Record<
              string,
              unknown
            >,
            completedAt: new Date("2026-07-28T06:00:00.000Z"),
          },
          {
            planFingerprint: watchlist.fingerprint,
            planSnapshot: structuredClone(watchlist) as unknown as Record<
              string,
              unknown
            >,
            completedAt: new Date("2026-07-29T06:00:00.000Z"),
          },
        ],
        watchlistEntries: [
          {
            category: "component_suppliers",
            categorySearchTermEn: "robotics component suppliers",
            categorySearchTermZhCn: "机器人零部件供应商",
            theme: "robotics_manufacturing",
            countries: ["China"],
            languages: ["en", "zh-CN"],
            cadenceDays: 7,
            priority: 80,
          },
        ],
      }),
    ).toEqual({
      coverageState: {
        countryLastCoveredAt: {
          China: "2026-07-29T06:00:00.000Z",
          "United States": "2026-07-28T06:00:00.000Z",
        },
        themeLastCoveredAt: {
          robotics_manufacturing: "2026-07-29T06:00:00.000Z",
        },
        watchlistLastCoveredAt: {
          component_suppliers: "2026-07-29T06:00:00.000Z",
        },
      },
      watchlist: [
        {
          category: "component_suppliers",
          categorySearchTerms: {
            en: "robotics component suppliers",
            "zh-CN": "机器人零部件供应商",
          },
          theme: "robotics_manufacturing",
          countries: ["China"],
          languages: ["en", "zh-CN"],
          cadenceDays: 7,
          priority: 80,
        },
      ],
    });
  });

  it("rejects invalid persisted watchlist vocabulary", () => {
    expect(() =>
      deriveGlobalRadarPlanningContext({
        now: new Date("2026-07-31T04:00:00.000Z"),
        scanMode: "watchlist_refresh",
        completedRuns: [],
        watchlistEntries: [
          {
            category: "component_suppliers",
            categorySearchTermEn: "robotics component suppliers",
            categorySearchTermZhCn: null,
            theme: "not-a-theme",
            countries: ["China"],
            languages: ["en"],
            cadenceDays: 7,
            priority: 80,
          },
        ],
      }),
    ).toThrow(/watchlist/i);
  });
});
