import { describe, expect, it } from "vitest";

import {
  globalRadarThemes,
  type GlobalRadarTheme,
} from "../app/domain/global-radar";
import {
  publicGlobalRadarConfig,
  readGlobalRadarConfig,
} from "../app/server/global-radar/config";

const testSecret = "radar-test-secret";
const productionSecret = "r".repeat(32);

function testEnvironment(
  overrides: Readonly<Record<string, string | undefined>> = {},
) {
  return {
    NODE_ENV: "test",
    GLOBAL_RADAR_WORKER_SECRET: testSecret,
    ...overrides,
  };
}

describe("Global Radar configuration", () => {
  it("uses the exact approved defaults", () => {
    expect(readGlobalRadarConfig(testEnvironment())).toMatchObject({
      workerSecret: testSecret,
      countries: ["United States", "China"],
      languages: ["en", "zh-CN"],
      themes: globalRadarThemes,
      enabledSources: ["codex_public_web"],
      resultLimit: 20,
      thresholds: {
        direct_demand: 70,
        demand_precursor: 65,
        ecosystem_momentum: 70,
      },
    });
  });

  it("trims and deduplicates every configured list while preserving order", () => {
    const themes: readonly GlobalRadarTheme[] = [
      "physical_ai_evaluation",
      "robotics_manufacturing",
    ];

    expect(
      readGlobalRadarConfig(
        testEnvironment({
          GLOBAL_RADAR_COUNTRIES:
            " Germany, United States, Germany, China, United States ",
          GLOBAL_RADAR_LANGUAGES: " zh-CN, en,zh-CN ",
          GLOBAL_RADAR_THEMES:
            " physical_ai_evaluation,robotics_manufacturing,physical_ai_evaluation ",
          GLOBAL_RADAR_ENABLED_SOURCES:
            " codex_public_web,codex_public_web ",
        }),
      ),
    ).toMatchObject({
      countries: ["Germany", "United States", "China"],
      languages: ["zh-CN", "en"],
      themes,
      enabledSources: ["codex_public_web"],
    });
  });

  it.each([
    ["GLOBAL_RADAR_LANGUAGES", "fr"],
    ["GLOBAL_RADAR_THEMES", "generic_marketing"],
    ["GLOBAL_RADAR_ENABLED_SOURCES", "authenticated_scraper"],
  ])("rejects unknown allowlisted value in %s", (name, value) => {
    expect(() =>
      readGlobalRadarConfig(testEnvironment({ [name]: value })),
    ).toThrow(`Invalid Global Radar configuration: ${name}`);
  });

  it.each([
    ["GLOBAL_RADAR_COUNTRIES", "   "],
    ["GLOBAL_RADAR_LANGUAGES", " , "],
    ["GLOBAL_RADAR_THEMES", ""],
    ["GLOBAL_RADAR_ENABLED_SOURCES", "  "],
  ])("rejects an empty configured list in %s", (name, value) => {
    expect(() =>
      readGlobalRadarConfig(testEnvironment({ [name]: value })),
    ).toThrow(`Invalid Global Radar configuration: ${name}`);
  });

  it.each(["1", "20"])(
    "accepts result limit boundary %s",
    (GLOBAL_RADAR_RESULT_LIMIT) => {
      expect(
        readGlobalRadarConfig(
          testEnvironment({ GLOBAL_RADAR_RESULT_LIMIT }),
        ).resultLimit,
      ).toBe(Number(GLOBAL_RADAR_RESULT_LIMIT));
    },
  );

  it.each(["0", "21", "2.5", "1e1", "+2", "  "])(
    "rejects invalid result limit %s",
    (GLOBAL_RADAR_RESULT_LIMIT) => {
      expect(() =>
        readGlobalRadarConfig(
          testEnvironment({ GLOBAL_RADAR_RESULT_LIMIT }),
        ),
      ).toThrow(
        "Invalid Global Radar configuration: GLOBAL_RADAR_RESULT_LIMIT must be an integer from 1 to 20.",
      );
    },
  );

  it.each([
    "GLOBAL_RADAR_DIRECT_THRESHOLD",
    "GLOBAL_RADAR_PRECURSOR_THRESHOLD",
    "GLOBAL_RADAR_MOMENTUM_THRESHOLD",
  ] as const)("accepts threshold boundaries for %s", (name) => {
    const thresholdKey = {
      GLOBAL_RADAR_DIRECT_THRESHOLD: "direct_demand",
      GLOBAL_RADAR_PRECURSOR_THRESHOLD: "demand_precursor",
      GLOBAL_RADAR_MOMENTUM_THRESHOLD: "ecosystem_momentum",
    } as const;

    expect(
      readGlobalRadarConfig(testEnvironment({ [name]: "0" })).thresholds[
        thresholdKey[name]
      ],
    ).toBe(0);
    expect(
      readGlobalRadarConfig(testEnvironment({ [name]: "100" })).thresholds[
        thresholdKey[name]
      ],
    ).toBe(100);
  });

  it.each([
    ["GLOBAL_RADAR_DIRECT_THRESHOLD", "-1"],
    ["GLOBAL_RADAR_PRECURSOR_THRESHOLD", "101"],
    ["GLOBAL_RADAR_MOMENTUM_THRESHOLD", "70.5"],
  ])("rejects invalid threshold %s=%s", (name, value) => {
    expect(() =>
      readGlobalRadarConfig(testEnvironment({ [name]: value })),
    ).toThrow(
      `Invalid Global Radar configuration: ${name} must be an integer from 0 to 100.`,
    );
  });

  it.each([
    "https://mewtuals.com/radar",
    " http://127.0.0.1:3000/base/ ",
  ])("accepts a credential-free HTTP(S) API base URL", (value) => {
    const config = readGlobalRadarConfig(
      testEnvironment({ GLOBAL_RADAR_API_BASE_URL: value }),
    );

    expect(config.apiBaseUrl).toBeInstanceOf(URL);
    expect(config.apiBaseUrl?.toString()).toBe(value.trim());
  });

  it.each([
    "ftp://mewtuals.com",
    "mewtuals.com",
    "https://worker:password@mewtuals.com",
    "https://worker@mewtuals.com",
  ])("rejects an unsafe API base URL %s", (GLOBAL_RADAR_API_BASE_URL) => {
    expect(() =>
      readGlobalRadarConfig(
        testEnvironment({ GLOBAL_RADAR_API_BASE_URL }),
      ),
    ).toThrow(
      "Invalid Global Radar configuration: GLOBAL_RADAR_API_BASE_URL must be a credential-free HTTP(S) URL.",
    );
  });

  it("requires a trimmed Radar worker secret in every environment", () => {
    for (const NODE_ENV of ["development", "test", "production"] as const) {
      expect(() =>
        readGlobalRadarConfig({
          NODE_ENV,
          GLOBAL_RADAR_WORKER_SECRET: "   ",
        }),
      ).toThrow(
        "Invalid Global Radar configuration: GLOBAL_RADAR_WORKER_SECRET is required.",
      );
    }

    expect(
      readGlobalRadarConfig(
        testEnvironment({ GLOBAL_RADAR_WORKER_SECRET: "  trimmed-secret  " }),
      ).workerSecret,
    ).toBe("trimmed-secret");
  });

  it("requires at least 32 trimmed characters for a production secret", () => {
    expect(
      readGlobalRadarConfig({
        NODE_ENV: "production",
        GLOBAL_RADAR_WORKER_SECRET: `  ${productionSecret}  `,
      }).workerSecret,
    ).toBe(productionSecret);

    expect(() =>
      readGlobalRadarConfig({
        NODE_ENV: "production",
        GLOBAL_RADAR_WORKER_SECRET: "r".repeat(31),
      }),
    ).toThrow(
      "Invalid Global Radar configuration: GLOBAL_RADAR_WORKER_SECRET must contain at least 32 characters in production.",
    );
  });

  it("treats a missing NODE_ENV as production and rejects unsupported values", () => {
    expect(() =>
      readGlobalRadarConfig({ GLOBAL_RADAR_WORKER_SECRET: "too-short" }),
    ).toThrow(/at least 32 characters in production/);
    expect(() =>
      readGlobalRadarConfig({
        NODE_ENV: "staging",
        GLOBAL_RADAR_WORKER_SECRET: productionSecret,
      }),
    ).toThrow(
      "Invalid Global Radar configuration: NODE_ENV must be development, test, or production.",
    );
  });

  it("rejects equal trimmed Radar and Discovery secrets without leaking either", () => {
    const sharedSecret = "shared-secret-never-leak";
    let thrown: unknown;

    try {
      readGlobalRadarConfig(
        testEnvironment({
          GLOBAL_RADAR_WORKER_SECRET: ` ${sharedSecret} `,
          DISCOVERY_WORKER_SECRET: `\t${sharedSecret}\n`,
        }),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe(
      "Invalid Global Radar configuration: Radar and Discovery worker secrets must be distinct.",
    );
    expect((thrown as Error).message).not.toContain(sharedSecret);
  });

  it("returns an explicit public projection without secret or API base URL", () => {
    const privateConfig = readGlobalRadarConfig(
      testEnvironment({
        GLOBAL_RADAR_WORKER_SECRET: "never-serialize-radar-secret",
        GLOBAL_RADAR_API_BASE_URL: "https://private-api.example/radar",
      }),
    );
    const publicConfig = publicGlobalRadarConfig(privateConfig);
    const serialized = JSON.stringify(publicConfig);

    expect(publicConfig).toEqual({
      countries: ["United States", "China"],
      languages: ["en", "zh-CN"],
      themes: [...globalRadarThemes],
      enabledSources: ["codex_public_web"],
      resultLimit: 20,
      thresholds: {
        direct_demand: 70,
        demand_precursor: 65,
        ecosystem_momentum: 70,
      },
    });
    expect("workerSecret" in publicConfig).toBe(false);
    expect("apiBaseUrl" in publicConfig).toBe(false);
    expect(serialized).not.toContain("never-serialize-radar-secret");
    expect(serialized).not.toContain("private-api.example");
  });
});
