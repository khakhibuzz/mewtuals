import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  globalRadarBatchProposalSchema,
  globalRadarBatchSchema,
  validateGlobalRadarBatch,
} from "../app/domain/global-radar";
import {
  canonicalizeGlobalRadarPersistenceBatch,
  persistableGlobalRadarBatchObjectSchema,
} from "../app/domain/global-radar/persistence";
import {
  GLOBAL_RADAR_FICTIONAL_NOW,
  globalRadarFictionalFixtures,
} from "./fixtures/global-radar-fictional";

const expectedOutcomes = {
  teleoperatedRobotDataDirectDemandNeedsReview: {
    signalClass: "direct_demand",
    signalType: "data_collection_request",
    initialStatus: "needs_review",
  },
  humanoidDeploymentDemandPrecursor: {
    signalClass: "demand_precursor",
    signalType: "deployment",
    initialStatus: "newly_discovered",
  },
  indiaAutonomousNavigationDataDirectDemand: {
    signalClass: "direct_demand",
    signalType: "data_collection_request",
    initialStatus: "newly_discovered",
    indiaRelevance: { relevanceType: "explicit_India" },
  },
  chineseIndianManufacturingDirectDemand: {
    signalClass: "direct_demand",
    signalType: "manufacturing_request",
    initialStatus: "newly_discovered",
    indiaRelevance: { relevanceType: "explicit_India" },
    sourceLanguage: "zh-CN",
  },
  noisyIndianLanguageSpeechDirectDemand: {
    signalClass: "direct_demand",
    signalType: "data_collection_request",
    initialStatus: "newly_discovered",
    indiaRelevance: { relevanceType: "explicit_India" },
  },
  multiOrganisationPhysicalAiPlatformMomentum: {
    signalClass: "ecosystem_momentum",
    signalType: "ecosystem_direction",
    initialStatus: "newly_discovered",
    score: {
      qualificationGatesPassed: true,
      counts: { evidenceItems: 2, independentEntities: 2 },
    },
  },
} as const;

const expectedExampleDetails = {
  teleoperatedRobotDataDirectDemandNeedsReview: {
    requiredCapability: "teleoperated_trajectories",
    systemsContext:
      "Improve a robot manipulation policy with reviewed trajectories.",
    adminStatus: "needs_review",
  },
  humanoidDeploymentDemandPrecursor: {
    requiredCapability: "integration",
    systemsContext:
      "Deploy a humanoid system in controlled pilot facilities.",
    adminStatus: "newly_discovered",
  },
  indiaAutonomousNavigationDataDirectDemand: {
    requiredCapability: "indian_mixed_unstructured_roads",
    systemsContext:
      "Evaluate autonomous navigation on mixed and unstructured roads.",
    adminStatus: "newly_discovered",
  },
  chineseIndianManufacturingDirectDemand: {
    requiredCapability: "contract_manufacturing",
    systemsContext:
      "Assemble a fictional mobile robot platform from specified components.",
    adminStatus: "newly_discovered",
  },
  noisyIndianLanguageSpeechDirectDemand: {
    requiredCapability: "noisy_far_field_speech",
    systemsContext:
      "Evaluate human-robot speech understanding in noisy environments.",
    adminStatus: "newly_discovered",
  },
  multiOrganisationPhysicalAiPlatformMomentum: {
    requiredCapability: "model_evaluation",
    systemsContext: null,
    adminStatus: "newly_discovered",
  },
} as const;

function collectUrls(value: unknown): string[] {
  if (typeof value === "string" && /^https?:\/\//u.test(value)) {
    return [value];
  }
  if (Array.isArray(value)) return value.flatMap(collectUrls);
  if (value === null || typeof value !== "object") return [];
  return Object.values(value as Record<string, unknown>).flatMap(collectUrls);
}

function sourceFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(path);
    return /\.(?:m?[jt]s|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

describe("fictional Global Demand Radar examples", () => {
  it("provides exactly the six approved labelled wrappers", () => {
    expect(Object.keys(globalRadarFictionalFixtures)).toEqual(
      Object.keys(expectedOutcomes),
    );
    for (const fixture of Object.values(globalRadarFictionalFixtures)) {
      expect(Object.keys(fixture)).toEqual(["fictionalExample", "input"]);
      expect(fixture.fictionalExample).toBe(true);
    }
  });

  it("uses deterministic fictional UUIDs and only reserved .example URLs", () => {
    const runIds = Object.values(globalRadarFictionalFixtures).map(
      ({ input }) => input.runId,
    );

    expect(runIds).toEqual([
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000004",
      "10000000-0000-4000-8000-000000000005",
      "10000000-0000-4000-8000-000000000006",
    ]);
    expect(new Set(runIds).size).toBe(runIds.length);
    for (const fixture of Object.values(globalRadarFictionalFixtures)) {
      const urls = collectUrls(fixture.input);
      expect(urls.length).toBeGreaterThan(0);
      for (const value of urls) {
        expect(new URL(value).hostname.endsWith(".example")).toBe(true);
      }
    }
  });

  it("validates every inner input with the rich server-authoritative contract", () => {
    for (const [label, fixture] of Object.entries(
      globalRadarFictionalFixtures,
    )) {
      expect(
        globalRadarBatchProposalSchema.safeParse(fixture.input).success,
        label,
      ).toBe(true);

      const validated = validateGlobalRadarBatch(fixture.input, {
        clock: { now: () => new Date(GLOBAL_RADAR_FICTIONAL_NOW) },
        expectedRunId: fixture.input.runId,
        expectedPlanFingerprint: fixture.input.planFingerprint,
      });

      expect(validated.signals, label).toHaveLength(1);
      expect(validated.signals[0], label).toMatchObject(
        expectedOutcomes[label as keyof typeof expectedOutcomes],
      );
      const expectedDetail =
        expectedExampleDetails[label as keyof typeof expectedExampleDetails];
      expect(validated.signals[0]?.targetCapabilityTags, label).toContain(
        expectedDetail.requiredCapability,
      );
      expect(
        validated.signals[0]?.systemsContext?.higherLevelSystemGoal ?? null,
        label,
      ).toBe(expectedDetail.systemsContext);
      expect(validated.signals[0]?.initialStatus, label).toBe(
        expectedDetail.adminStatus,
      );
      expect(
        Object.values(validated.rejections).every((count) => count === 0),
        label,
      ).toBe(true);
      expect(
        persistableGlobalRadarBatchObjectSchema.safeParse(validated).success,
        label,
      ).toBe(true);
      expect(canonicalizeGlobalRadarPersistenceBatch(validated), label).toMatchObject(
        { valid: true },
      );
    }
  });

  it("preserves Chinese original evidence separately from its English summary", () => {
    const { input } =
      globalRadarFictionalFixtures.chineseIndianManufacturingDirectDemand;
    const proposedEvidence = globalRadarBatchProposalSchema.parse(input)
      .signals[0]!.evidence[0]!;
    const validated = validateGlobalRadarBatch(input, {
      clock: { now: () => new Date(GLOBAL_RADAR_FICTIONAL_NOW) },
    });
    const evidence = validated.signals[0]!.evidence[0]!;

    expect(proposedEvidence.claim).toMatch(/\p{Script=Han}/u);
    expect(proposedEvidence.claim).not.toBe(proposedEvidence.englishSummary);
    expect(evidence).toMatchObject({
      sourceLanguage: "zh-CN",
      translationConfidence: 92,
    });
  });

  it("rejects every marker wrapper at production batch and repository gates", () => {
    for (const fixture of Object.values(globalRadarFictionalFixtures)) {
      const validated = validateGlobalRadarBatch(fixture.input, {
        clock: { now: () => new Date(GLOBAL_RADAR_FICTIONAL_NOW) },
      });

      expect(globalRadarBatchSchema.safeParse(fixture).success).toBe(false);
      expect(globalRadarBatchProposalSchema.safeParse(fixture).success).toBe(
        false,
      );
      expect(
        persistableGlobalRadarBatchObjectSchema.safeParse(fixture).success,
      ).toBe(false);
      expect(canonicalizeGlobalRadarPersistenceBatch(fixture)).toEqual({
        valid: false,
        reason: "invalid_batch",
      });
      expect(
        globalRadarBatchProposalSchema.safeParse({
          ...fixture.input,
          fictionalExample: true,
        }).success,
      ).toBe(false);
      expect(
        persistableGlobalRadarBatchObjectSchema.safeParse({
          ...validated,
          fictionalExample: true,
        }).success,
      ).toBe(false);
      expect(
        canonicalizeGlobalRadarPersistenceBatch({
          ...validated,
          fictionalExample: true,
        }),
      ).toEqual({ valid: false, reason: "invalid_batch" });
    }
  });

  it("keeps fixture data out of production modules", () => {
    const forbiddenImport = "global-radar-fictional";
    const productionFiles = ["app", "db", "scripts"].flatMap((directory) =>
      sourceFilesUnder(resolve(process.cwd(), directory)),
    );

    expect(
      productionFiles.filter((file) =>
        readFileSync(file, "utf8").includes(forbiddenImport),
      ),
    ).toEqual([]);
  });

  it("documents every requested field for all six fictional examples", () => {
    const documentation = readFileSync(
      resolve(process.cwd(), "docs/global-demand-radar-fictional-examples.md"),
      "utf8",
    );

    for (const [label, expected] of Object.entries(expectedExampleDetails)) {
      const heading = `### \`${label}\``;
      const sectionStart = documentation.indexOf(heading);
      const nextSection = documentation.indexOf("\n### `", sectionStart + 1);
      const section = documentation.slice(
        sectionStart,
        nextSection === -1 ? undefined : nextSection,
      );
      const normalizedSection = section.replace(/\s+/gu, " ");

      expect(sectionStart, label).toBeGreaterThanOrEqual(0);
      expect(section, label).toContain("- Signal class:");
      expect(section, label).toContain("- Evidence required:");
      expect(section, label).toContain("- Required capabilities:");
      expect(section, label).toContain(`\`${expected.requiredCapability}\``);
      expect(section, label).toContain("- India relevance:");
      expect(section, label).toContain("- Systems context:");
      expect(normalizedSection, label).toContain(
        expected.systemsContext ?? "Intentionally null",
      );
      expect(section, label).toContain(
        `- Correct admin status: \`${expected.adminStatus}\``,
      );
    }
    expect(documentation).toContain("fictionalExample");
    expect(documentation).toContain(".example");
    expect(documentation).toMatch(/class gate/iu);
    expect(documentation).toMatch(/India gate/iu);
    expect(documentation).toMatch(/translation gate/iu);
    expect(documentation).toMatch(/momentum gate/iu);
  });
});
