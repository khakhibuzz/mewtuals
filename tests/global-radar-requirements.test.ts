import { describe, expect, it } from "vitest";

import { requirementKinds } from "../app/domain/global-radar/contracts";
import { normalizeRequirements } from "../app/domain/global-radar/requirements";

function requirement(
  kind = "physical_data",
  overrides: Record<string, unknown> = {},
) {
  return {
    kind,
    capabilityTag: "human_task_demonstrations",
    summary: "Human task demonstrations for robot learning.",
    dataFamilies: ["egocentric video"],
    sensorModalities: ["rgb"],
    environments: ["homes"],
    taskFamilies: ["household tasks"],
    collectionMethods: ["human demonstrations"],
    humanRoles: ["participants"],
    robotEmbodiments: ["mobile manipulator"],
    indianExecutionArchetypes: ["robotics_data_company"],
    scaleSpecifications: { scale: "pilot" },
    technicalSpecifications: null,
    qualitySpecifications: { review: "expert" },
    rightsAndComplianceSpecifications: null,
    confidence: 80,
    ...overrides,
  };
}

function requirementWithNamedSpecifications(
  kind = "physical_data",
  overrides: Record<string, unknown> = {},
) {
  return {
    ...requirement(kind),
    scaleSpecifications: null,
    technicalSpecifications: null,
    qualitySpecifications: null,
    rightsAndComplianceSpecifications: null,
    ...overrides,
  };
}

describe("Global Radar normalized requirements", () => {
  it("normalizes every requirement kind into immutable records", () => {
    const result = normalizeRequirements(
      requirementKinds.map((kind) => requirement(kind)),
    );

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.requirements.map(({ kind }) => kind)).toEqual(
      requirementKinds,
    );
    expect(
      result.requirements.every(({ fingerprint }) =>
        /^[a-f0-9]{64}$/.test(fingerprint),
      ),
    ).toBe(true);
    expect(Object.isFrozen(result.requirements)).toBe(true);
    expect(result.requirements.every(Object.isFrozen)).toBe(true);
  });

  it("rejects unknown capability tags and Indian execution archetypes", () => {
    expect({
      archetype: normalizeRequirements([
        requirement("physical_data", {
          indianExecutionArchetypes: ["invented_partner"],
        }),
      ]).valid,
      capability: normalizeRequirements([
        requirement("physical_data", { capabilityTag: "invented_capability" }),
      ]).valid,
    }).toEqual({ archetype: false, capability: false });
  });

  it("bounds strict requirement dimensions, specifications, and confidence", () => {
    expect({
      array: normalizeRequirements([
        requirement("physical_data", {
          dataFamilies: Array.from({ length: 51 }, () => "video"),
        }),
      ]).valid,
      confidence: normalizeRequirements([
        requirement("physical_data", { confidence: 80.5 }),
      ]).valid,
      specifications: normalizeRequirements([
        requirement("physical_data", {
          scaleSpecifications: { scale: "x".repeat(8_193) },
        }),
      ]).valid,
      unknown: normalizeRequirements([
        requirement("physical_data", { fictionalExample: true }),
      ]).valid,
    }).toEqual({
      array: false,
      confidence: false,
      specifications: false,
      unknown: false,
    });
  });

  it("creates stable normalized fingerprints and rejects duplicates per signal", () => {
    const first = requirement("physical_data", {
      summary: "  Human   task demonstrations for robot learning. ",
      dataFamilies: [" RGB video ", "Depth", "rgb VIDEO"],
    });
    const equivalent = requirement("physical_data", {
      summary: "human task demonstrations for robot learning.",
      dataFamilies: ["depth", "rgb video"],
      confidence: 70,
    });
    const normalizedFirst = normalizeRequirements([first]);
    const normalizedEquivalent = normalizeRequirements([equivalent]);

    expect(normalizedFirst.valid && normalizedFirst.requirements[0]).toMatchObject(
      {
        dataFamilies: ["depth", "rgb video"],
      },
    );
    expect(
      normalizedFirst.valid &&
        normalizedEquivalent.valid &&
        normalizedFirst.requirements[0]?.fingerprint ===
          normalizedEquivalent.requirements[0]?.fingerprint,
    ).toBe(true);
    expect(normalizeRequirements([first, equivalent])).toEqual({
      valid: false,
      reason: "duplicate_requirement_fingerprint",
    });
  });

  it("uses code-point ordering and returns deeply immutable requirement copies", () => {
    const input = requirement("physical_data", {
      humanRoles: ["😀", "\uE000"],
    });
    const result = normalizeRequirements([input]);

    expect(result.valid).toBe(true);
    if (!result.valid) return;

    const normalized = result.requirements[0]!;
    expect(normalized.humanRoles).toEqual(["\uE000", "😀"]);
    expect(
      [
        normalized.dataFamilies,
        normalized.sensorModalities,
        normalized.environments,
        normalized.taskFamilies,
        normalized.collectionMethods,
        normalized.humanRoles,
        normalized.robotEmbodiments,
        normalized.indianExecutionArchetypes,
        normalized.scaleSpecifications,
        normalized.qualitySpecifications,
      ].every(Object.isFrozen),
    ).toBe(true);

    const mutableInput = input.qualitySpecifications as { review: string };
    mutableInput.review = "changed after normalization";
    expect(normalized.qualitySpecifications).toMatchObject({ review: "expert" });
  });

  it("preserves four independently nullable requirement specification objects", () => {
    const result = normalizeRequirements([requirementWithNamedSpecifications()]);

    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.requirements[0]).toMatchObject({
      scaleSpecifications: null,
      technicalSpecifications: null,
      qualitySpecifications: null,
      rightsAndComplianceSpecifications: null,
    });
  });

  it("bounds each named specification object and caps requirements at 100", () => {
    const specificationFields = [
      "scaleSpecifications",
      "technicalSpecifications",
      "qualitySpecifications",
      "rightsAndComplianceSpecifications",
    ] as const;
    const individuallyBounded = specificationFields.map(
      (field) =>
        normalizeRequirements([
          requirementWithNamedSpecifications("physical_data", {
            [field]: { value: "x".repeat(8_193) },
          }),
        ]).valid,
    );
    const overLimit = Array.from({ length: 101 }, (_, index) =>
      requirementWithNamedSpecifications("physical_data", {
        summary: `Distinct requirement ${index}`,
      }),
    );

    expect(individuallyBounded).toEqual([false, false, false, false]);
    expect(normalizeRequirements(overLimit).valid).toBe(false);
  });

  it("requires at least one normalized requirement per signal", () => {
    expect(normalizeRequirements([])).toEqual({
      valid: false,
      reason: "invalid_requirement",
    });
  });
});
