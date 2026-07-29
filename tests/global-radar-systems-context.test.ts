import { describe, expect, it } from "vitest";

import {
  sensitiveDataAndComplianceSchema,
  sensitiveDataCategories,
} from "../app/domain/global-radar/contracts";
import {
  assessComplianceReview,
  validateSystemsContext,
} from "../app/domain/global-radar/systems-context";

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index}`).join(" ");
}

function systemsContext(overrides: Record<string, unknown> = {}) {
  return {
    higherLevelSystemGoal: "Deploy a reliable industrial robot fleet.",
    relevantStackLayer: "ai_and_control",
    lowerLevelInputsRequired: ["compute_and_chips", "sensors"],
    transformationOrCapabilityAdded:
      "Convert calibrated sensor inputs into robot control policies.",
    downstreamModelOrRobotBehavior:
      "The robot performs the target industrial task reliably.",
    whyTheRequirementMatters:
      "The control layer connects physical inputs to safe task execution.",
    possibleIndianExecutionRole:
      "An Indian robotics lab can validate the control system.",
    factualElements: ["The public requirement names industrial robots."],
    inferredElements: ["An Indian validation role may be feasible."],
    systemsContextSummary: words(80),
    ...overrides,
  };
}

function validationInput(overrides: Record<string, unknown> = {}) {
  return {
    signalClass: "direct_demand",
    eligibleForQualification: true,
    classScore: 80,
    stackType: "hardware",
    context: systemsContext(),
    ...overrides,
  };
}

function complianceAssessment(overrides: Record<string, unknown> = {}) {
  return {
    sensitiveDataFlags: Object.fromEntries(
      sensitiveDataCategories.map((category) => [category, null]),
    ),
    complianceFacts: {
      consent: null,
      deIdentification: null,
      legalReview: null,
      knownResidencyRequirements: null,
      participantRightsComplexity: null,
    },
    ...overrides,
  };
}

describe("Global Radar systems context", () => {
  it("requires all ten fields and an 80 to 150 word summary for eligible direct demand", () => {
    const incomplete = systemsContext();
    Reflect.deleteProperty(incomplete, "whyTheRequirementMatters");

    expect({
      complete: validateSystemsContext(validationInput()),
      incomplete: validateSystemsContext(
        validationInput({ context: incomplete }),
      ),
      missing: validateSystemsContext(validationInput({ context: null })),
      tooLong: validateSystemsContext(
        validationInput({
          context: systemsContext({ systemsContextSummary: words(151) }),
        }),
      ),
      tooShort: validateSystemsContext(
        validationInput({
          context: systemsContext({ systemsContextSummary: words(79) }),
        }),
      ),
    }).toMatchObject({
      complete: { valid: true },
      incomplete: { valid: false, reason: "invalid_systems_context" },
      missing: { valid: false, reason: "systems_context_required" },
      tooLong: { valid: false, reason: "invalid_systems_context" },
      tooShort: { valid: false, reason: "invalid_systems_context" },
    });
  });

  it("validates relevant and lower-level stages against the selected ordered stack", () => {
    expect({
      hardware: validateSystemsContext(validationInput()),
      physicalData: validateSystemsContext(
        validationInput({
          stackType: "physical_data",
          context: systemsContext({
            relevantStackLayer: "training",
            lowerLevelInputsRequired: ["sensor_capture", "annotation", "qa"],
          }),
        }),
      ),
      crossChainTarget: validateSystemsContext(
        validationInput({
          context: systemsContext({ relevantStackLayer: "training" }),
        }),
      ),
      crossChainInput: validateSystemsContext(
        validationInput({
          context: systemsContext({
            lowerLevelInputsRequired: ["sensor_capture"],
          }),
        }),
      ),
      downstreamInput: validateSystemsContext(
        validationInput({
          context: systemsContext({
            relevantStackLayer: "sensors",
            lowerLevelInputsRequired: ["ai_and_control"],
          }),
        }),
      ),
      chainOrigin: validateSystemsContext(
        validationInput({
          context: systemsContext({
            relevantStackLayer: "raw_materials",
            lowerLevelInputsRequired: [],
          }),
        }),
      ),
      missingPredecessor: validateSystemsContext(
        validationInput({
          context: systemsContext({
            relevantStackLayer: "sensors",
            lowerLevelInputsRequired: [],
          }),
        }),
      ),
    }).toMatchObject({
      hardware: { valid: true },
      physicalData: { valid: true },
      crossChainTarget: { valid: false, reason: "invalid_systems_context" },
      crossChainInput: { valid: false, reason: "invalid_systems_context" },
      downstreamInput: { valid: false, reason: "invalid_systems_context" },
      chainOrigin: { valid: true },
      missingPredecessor: {
        valid: false,
        reason: "invalid_systems_context",
      },
    });
  });

  it("requires context at the strong-precursor threshold without fabricating it for weaker records", () => {
    expect({
      strongPrecursor: validateSystemsContext(
        validationInput({
          signalClass: "demand_precursor",
          classScore: 70,
          context: null,
        }),
      ),
      weakerPrecursor: validateSystemsContext(
        validationInput({
          signalClass: "demand_precursor",
          classScore: 69,
          context: null,
        }),
      ),
      momentum: validateSystemsContext(
        validationInput({
          signalClass: "ecosystem_momentum",
          classScore: 100,
          context: null,
        }),
      ),
      ineligibleDirectDemand: validateSystemsContext(
        validationInput({
          eligibleForQualification: false,
          classScore: null,
          context: null,
        }),
      ),
    }).toEqual({
      strongPrecursor: {
        valid: false,
        reason: "systems_context_required",
      },
      weakerPrecursor: { valid: true, context: null },
      momentum: { valid: true, context: null },
      ineligibleDirectDemand: { valid: true, context: null },
    });
  });

  it("keeps facts and inference separate in a strict, detached, immutable context", () => {
    const factualElements = ["An original source names the requirement."];
    const inferredElements = ["An Indian execution role may be feasible."];
    const result = validateSystemsContext(
      validationInput({
        context: systemsContext({ factualElements, inferredElements }),
      }),
    );

    factualElements.push("A later caller mutation.");
    inferredElements.push("Another later caller mutation.");

    expect(result).toMatchObject({
      valid: true,
      context: {
        factualElements: ["An original source names the requirement."],
        inferredElements: ["An Indian execution role may be feasible."],
      },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.valid && Object.isFrozen(result.context)).toBe(true);
    expect(
      result.valid &&
        result.context !== null &&
        Object.isFrozen(result.context.factualElements),
    ).toBe(true);
    expect(
      result.valid &&
        result.context !== null &&
        Object.isFrozen(result.context.inferredElements),
    ).toBe(true);

    expect(
      validateSystemsContext(
        validationInput({
          context: systemsContext({ unexpectedConclusion: "lawful" }),
        }),
      ),
    ).toEqual({ valid: false, reason: "invalid_systems_context" });
  });

  it("records the exact sensitive-data categories and preserves every unknown as null", () => {
    expect(sensitiveDataCategories).toEqual([
      "faces",
      "voices",
      "biometrics",
      "gaze",
      "health",
      "children",
      "home_interiors",
      "workplace_monitoring",
      "precise_location",
      "road_users",
      "employee_data",
      "industrial_secrets",
      "defence_or_dual_use",
      "copyrighted_material",
      "export_controls",
    ]);

    const parsed = sensitiveDataAndComplianceSchema.parse(
      complianceAssessment(),
    );
    expect(Object.values(parsed.sensitiveDataFlags)).toEqual(
      Array.from({ length: 15 }, () => null),
    );
    expect(Object.values(parsed.complianceFacts)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);

    const incompleteFacts = { ...parsed.complianceFacts };
    Reflect.deleteProperty(incompleteFacts, "consent");
    expect(
      sensitiveDataAndComplianceSchema.safeParse(
        complianceAssessment({ complianceFacts: incompleteFacts }),
      ).success,
    ).toBe(false);
  });

  it("forces review and reduces actionability for severe or unresolved conditions without a legal conclusion", () => {
    const unknownAssessment = complianceAssessment();
    const severeAssessment = complianceAssessment({
      sensitiveDataFlags: {
        ...unknownAssessment.sensitiveDataFlags,
        faces: "severe",
      },
    });

    expect({
      severe: assessComplianceReview({
        currentStatus: "newly_discovered",
        actionability: 80,
        assessment: severeAssessment,
      }),
      unresolved: assessComplianceReview({
        currentStatus: "newly_discovered",
        actionability: 80,
        assessment: unknownAssessment,
      }),
    }).toMatchObject({
      severe: {
        valid: true,
        status: "needs_review",
        actionability: 60,
        actionabilityReduction: 20,
        legalConclusion: null,
        reviewReasons: ["severe_sensitive_data_flag"],
      },
      unresolved: {
        valid: true,
        status: "needs_review",
        actionability: 70,
        actionabilityReduction: 10,
        legalConclusion: null,
        reviewReasons: ["unresolved_sensitive_data_or_compliance"],
      },
    });
  });

  it("applies a severity penalty once and clamps adjusted actionability to zero", () => {
    const unknownAssessment = complianceAssessment();
    const result = assessComplianceReview({
      currentStatus: "monitoring",
      actionability: 15,
      assessment: complianceAssessment({
        sensitiveDataFlags: {
          ...unknownAssessment.sensitiveDataFlags,
          faces: "severe",
          voices: "severe",
          biometrics: "severe",
        },
      }),
    });

    expect(result).toMatchObject({
      valid: true,
      status: "needs_review",
      actionability: 0,
      actionabilityReduction: 15,
      legalConclusion: null,
      reviewReasons: ["severe_sensitive_data_flag"],
    });
  });

  it("does not treat an explicitly reviewed no-observation record as unknown", () => {
    const assessedNoObservation = complianceAssessment({
      sensitiveDataFlags: Object.fromEntries(
        sensitiveDataCategories.map((category) => [
          category,
          "not_observed",
        ]),
      ),
      complianceFacts: {
        consent: false,
        deIdentification: false,
        legalReview: false,
        knownResidencyRequirements: false,
        participantRightsComplexity: false,
      },
    });

    expect(
      assessComplianceReview({
        currentStatus: "newly_discovered",
        actionability: 80,
        assessment: assessedNoObservation,
      }),
    ).toMatchObject({
      valid: true,
      status: "newly_discovered",
      actionability: 80,
      actionabilityReduction: 0,
      legalConclusion: null,
      reviewReasons: [],
    });
  });
});
