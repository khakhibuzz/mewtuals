import { describe, expect, it } from "vitest";

import {
  physicalAiSeedConfig,
  publicDiscoveryWorkerConfig,
  readDiscoveryConfig,
} from "../app/server/discovery-config";

describe("discovery configuration", () => {
  it("uses the approved India and category defaults", () => {
    expect(readDiscoveryConfig({ NODE_ENV: "test" })).toMatchObject({
      campaignKey: "robotics_hardware_india",
      geographies: ["India"],
      companyCategories: [
        "robot makers and integrators",
        "components and actuation",
        "sensing and perception",
        "electronics and compute",
        "embedded software and AI",
        "manufacturing and testing",
        "distribution and deployment",
        "research and ecosystem support",
      ],
      creatorCategories: [
        "robotics engineering",
        "hardware building",
        "physical AI research",
        "manufacturing and industrial technology",
        "robotics education and ecosystem",
      ],
      totalCandidates: 20,
      companyPercentage: 75,
      enabledSources: ["codex_web"],
    });
  });

  it("derives the one-time 50-company seed without changing the campaign", () => {
    const defaultConfig = readDiscoveryConfig({ NODE_ENV: "test" });

    expect(physicalAiSeedConfig(defaultConfig)).toMatchObject({
      campaignKey: "robotics_hardware_india",
      totalCandidates: 50,
      companyPercentage: 100,
    });
    expect(defaultConfig).toMatchObject({
      totalCandidates: 20,
      companyPercentage: 75,
    });
  });

  it("parses comma-separated discovery overrides", () => {
    expect(
      readDiscoveryConfig({
        NODE_ENV: "test",
        DISCOVERY_GEOGRAPHIES: " India, Singapore ",
        DISCOVERY_COMPANY_CATEGORIES: "climate, robotics",
        DISCOVERY_CREATOR_CATEGORIES: "science, design",
        DISCOVERY_ENABLED_SOURCES: "codex_web, public_directory",
      }),
    ).toMatchObject({
      geographies: ["India", "Singapore"],
      companyCategories: ["climate", "robotics"],
      creatorCategories: ["science", "design"],
      enabledSources: ["codex_web", "public_directory"],
    });
  });

  it("enforces candidate-count and percentage integer bounds", () => {
    expect(
      readDiscoveryConfig({
        NODE_ENV: "test",
        DISCOVERY_TOTAL_CANDIDATES: "36",
        DISCOVERY_COMPANY_PERCENTAGE: "25",
      }),
    ).toMatchObject({ totalCandidates: 36, companyPercentage: 25 });

    for (const [name, value] of [
      ["DISCOVERY_TOTAL_CANDIDATES", "0"],
      ["DISCOVERY_TOTAL_CANDIDATES", "51"],
      ["DISCOVERY_TOTAL_CANDIDATES", "2.5"],
      ["DISCOVERY_COMPANY_PERCENTAGE", "-1"],
      ["DISCOVERY_COMPANY_PERCENTAGE", "101"],
      ["DISCOVERY_COMPANY_PERCENTAGE", "50.5"],
    ] as const) {
      expect(() =>
        readDiscoveryConfig({ NODE_ENV: "test", [name]: value }),
      ).toThrow(`Invalid discovery configuration: ${name}`);
    }
  });

  it("requires the discovery worker secret in production", () => {
    expect(() => readDiscoveryConfig({ NODE_ENV: "production" })).toThrow(
      "Invalid discovery configuration: DISCOVERY_WORKER_SECRET is required in production.",
    );
    expect(() =>
      readDiscoveryConfig({
        NODE_ENV: "production",
        DISCOVERY_WORKER_SECRET: "   ",
      }),
    ).toThrow(
      "Invalid discovery configuration: DISCOVERY_WORKER_SECRET is required in production.",
    );
    expect(
      readDiscoveryConfig({
        NODE_ENV: "production",
        DISCOVERY_WORKER_SECRET: "worker-secret-with-at-least-32-bytes",
      }).workerSecret,
    ).toBe("worker-secret-with-at-least-32-bytes");
  });

  it.each(["short", "x".repeat(31)])(
    "rejects a short production worker secret",
    (DISCOVERY_WORKER_SECRET) => {
      expect(() =>
        readDiscoveryConfig({
          NODE_ENV: "production",
          DISCOVERY_WORKER_SECRET,
        }),
      ).toThrow(
        "Invalid discovery configuration: DISCOVERY_WORKER_SECRET must contain at least 32 characters in production.",
      );
    },
  );

  it("treats a missing NODE_ENV as production", () => {
    expect(() => readDiscoveryConfig({})).toThrow(
      "Invalid discovery configuration: DISCOVERY_WORKER_SECRET is required in production.",
    );
  });

  it.each(["PRODUCTION", "staging", "prodution"])(
    "rejects unsupported NODE_ENV value %s",
    (NODE_ENV) => {
      expect(() => readDiscoveryConfig({ NODE_ENV })).toThrow(
        "Invalid discovery configuration: NODE_ENV must be development, test, or production.",
      );
    },
  );

  it.each(["development", "test"])(
    "allows an omitted worker secret only in explicit %s mode",
    (NODE_ENV) => {
      expect(readDiscoveryConfig({ NODE_ENV }).workerSecret).toBeUndefined();
    },
  );

  it("reads process.env when no source is injected", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousWorkerSecret = process.env.DISCOVERY_WORKER_SECRET;
    const previousGeographies = process.env.DISCOVERY_GEOGRAPHIES;

    try {
      process.env.NODE_ENV = "test";
      delete process.env.DISCOVERY_WORKER_SECRET;
      process.env.DISCOVERY_GEOGRAPHIES = "India,Singapore";

      expect(readDiscoveryConfig().geographies).toEqual(["India", "Singapore"]);
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousWorkerSecret === undefined) {
        delete process.env.DISCOVERY_WORKER_SECRET;
      } else {
        process.env.DISCOVERY_WORKER_SECRET = previousWorkerSecret;
      }
      if (previousGeographies === undefined) {
        delete process.env.DISCOVERY_GEOGRAPHIES;
      } else {
        process.env.DISCOVERY_GEOGRAPHIES = previousGeographies;
      }
    }
  });

  it("requires the worker secret for a no-arg default-production read", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousWorkerSecret = process.env.DISCOVERY_WORKER_SECRET;

    try {
      delete process.env.NODE_ENV;
      delete process.env.DISCOVERY_WORKER_SECRET;

      expect(() => readDiscoveryConfig()).toThrow(
        "Invalid discovery configuration: DISCOVERY_WORKER_SECRET is required in production.",
      );
    } finally {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousWorkerSecret === undefined) {
        delete process.env.DISCOVERY_WORKER_SECRET;
      } else {
        process.env.DISCOVERY_WORKER_SECRET = previousWorkerSecret;
      }
    }
  });

  it("returns a public worker config without the secret", () => {
    const config = readDiscoveryConfig({
      NODE_ENV: "production",
      DISCOVERY_WORKER_SECRET: "never-return-this-secret-1234567890",
      DISCOVERY_API_BASE_URL: "https://mewtuals.com",
    });
    const publicConfig = publicDiscoveryWorkerConfig(config);

    expect(publicConfig).toMatchObject({
      campaignKey: "robotics_hardware_india",
      geographies: ["India"],
      totalCandidates: 20,
      companyPercentage: 75,
      allocation: { companies: 15, creators: 5 },
      workerApiBaseUrl: "https://mewtuals.com",
    });
    expect("workerSecret" in publicConfig).toBe(false);
    expect(JSON.stringify(publicConfig)).not.toContain(
      "never-return-this-secret-1234567890",
    );
  });
});
