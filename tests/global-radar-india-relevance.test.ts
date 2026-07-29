import { describe, expect, it } from "vitest";

import {
  assessIndiaRelevance,
  indiaEvidenceFactKinds,
} from "../app/domain/global-radar/india-relevance";
import { normalizeRequirements } from "../app/domain/global-radar/requirements";

function normalizedRequirement(overrides: Record<string, unknown> = {}) {
  const result = normalizeRequirements([
    {
      kind: "physical_data",
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
      scaleSpecifications: null,
      technicalSpecifications: null,
      qualitySpecifications: null,
      rightsAndComplianceSpecifications: null,
      confidence: 80,
      ...overrides,
    },
  ]);
  if (!result.valid) throw new Error("Test requirement must normalize.");
  return result.requirements[0]!;
}

function evidence(
  supportedFieldPath: string,
  sourceKind = "original",
  overrides: Record<string, unknown> = {},
) {
  return {
    sourceUrl: "https://example.com/india",
    canonicalSourceUrl: null,
    sourceKind,
    sourceLanguage: "en",
    originalText: "The organisation published this India-specific fact.",
    englishSummary: "The organisation published this India-specific fact.",
    publishedAt: "2026-07-28T00:00:00.000Z",
    observedAt: "2026-07-29T00:00:00.000Z",
    evidenceConfidence: 90,
    translationConfidence: null,
    isPrimarySource: true,
    isOfficialProcurementSource: false,
    supportsDirectDemand: false,
    isSyndicated: false,
    organizationId: "example-robotics",
    corporateGroupId: "example-group",
    supportedFieldPaths: [supportedFieldPath],
    ...overrides,
  };
}

function assessmentInput(overrides: Record<string, unknown> = {}) {
  const requirement = normalizedRequirement();
  return {
    proposedType: "explicit_India",
    evidence: [
      evidence("indiaRelevance.explicit_India.suppliers"),
    ],
    exclusionEvidence: [],
    requirements: [
      {
        requirement,
        globallyDeliverable: true,
        openToExternalCounterparties: true,
      },
    ],
    reasons: ["Public evidence names India."],
    constraints: [],
    unknowns: [],
    confidence: 85,
    regulatoryFacts: null,
    logisticsFacts: null,
    ...overrides,
  };
}

describe("Global Radar India relevance", () => {
  it("fails closed without throwing on invalid runtime input", () => {
    expect(() => assessIndiaRelevance({ proposedType: "explicit_India" })).not
      .toThrow();
    expect(assessIndiaRelevance({ proposedType: "explicit_India" })).toEqual({
      assessed: false,
      reason: "invalid_assessment_input",
    });
  });

  it.each(indiaEvidenceFactKinds)(
    "accepts exact original evidence for India %s",
    (factKind) => {
      const fieldPath = `indiaRelevance.explicit_India.${factKind}`;
      const result = assessIndiaRelevance(
        assessmentInput({ evidence: [evidence(fieldPath)] }),
      );

      expect(result).toMatchObject({
        assessed: true,
        relevanceType: "explicit_India",
        supportedEvidencePaths: [fieldPath],
      });
    },
  );

  it.each([
    ["existing_India_presence", "manufacturing"],
    ["India_expansion", "distribution"],
  ] as const)(
    "requires exact original evidence for %s",
    (proposedType, factKind) => {
      const fieldPath = `indiaRelevance.${proposedType}.${factKind}`;
      expect(
        assessIndiaRelevance(
          assessmentInput({
            proposedType,
            evidence: [evidence(fieldPath)],
          }),
        ),
      ).toMatchObject({
        assessed: true,
        relevanceType: proposedType,
        supportedEvidencePaths: [fieldPath],
      });
    },
  );

  it.each([
    ["explicit_India", "suppliers"],
    ["existing_India_presence", "manufacturing"],
    ["India_expansion", "distribution"],
  ] as const)(
    "rejects a North-America-only original claim mislabeled as %s",
    (proposedType, factKind) => {
      const fieldPath = `indiaRelevance.${proposedType}.${factKind}`;
      expect(
        assessIndiaRelevance(
          assessmentInput({
            proposedType,
            evidence: [
              evidence(fieldPath, "original", {
                originalText:
                  "The organisation operates only in the United States and Canada.",
                englishSummary:
                  "A worker incorrectly summarized this as an India claim.",
              }),
            ],
          }),
        ),
      ).toEqual({
        assessed: false,
        reason: "missing_exact_original_evidence",
      });
    },
  );

  it.each([
    [
      "explicit_India",
      "suppliers",
      "hi",
      "संगठन भारत में आपूर्तिकर्ताओं की तलाश कर रहा है।",
      88,
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "hi",
      "भारतीय विनिर्माण केंद्र वर्तमान में चालू है।",
      90,
    ],
    [
      "India_expansion",
      "distribution",
      "zh-CN",
      "该组织正在印度扩大分销业务。",
      92,
    ],
  ] as const)(
    "accepts an original-language India marker for %s",
    (proposedType, factKind, sourceLanguage, originalText, confidence) => {
      const fieldPath = `indiaRelevance.${proposedType}.${factKind}`;
      expect(
        assessIndiaRelevance(
          assessmentInput({
            proposedType,
            evidence: [
              evidence(fieldPath, "original", {
                sourceLanguage,
                originalText,
                englishSummary:
                  "The original claim explicitly describes an India activity.",
                translationConfidence: confidence,
              }),
            ],
          }),
        ),
      ).toMatchObject({
        assessed: true,
        relevanceType: proposedType,
        supportedEvidencePaths: [fieldPath],
      });
    },
  );

  it("rejects translations, worker labels, and mismatched claim paths without exact original evidence", () => {
    const proposedType = "India_expansion";
    expect({
      mismatched: assessIndiaRelevance(
        assessmentInput({
          proposedType,
          evidence: [
            evidence("indiaRelevance.existing_India_presence.distribution"),
          ],
        }),
      ),
      translation: assessIndiaRelevance(
        assessmentInput({
          proposedType,
          evidence: [
            evidence(
              "indiaRelevance.India_expansion.distribution",
              "summary",
            ),
          ],
        }),
      ),
      workerLabel: assessIndiaRelevance(
        assessmentInput({
          proposedType,
          evidence: [evidence("worker.proposedIndiaRelevance")],
        }),
      ),
    }).toMatchObject({
      mismatched: {
        assessed: false,
        reason: "missing_exact_original_evidence",
      },
      translation: {
        assessed: false,
        reason: "missing_exact_original_evidence",
      },
      workerLabel: {
        assessed: false,
        reason: "missing_exact_original_evidence",
      },
    });
  });

  it("accepts a clearly labelled India-compatible inference from an open requirement and approved archetype", () => {
    const result = assessIndiaRelevance(
      assessmentInput({
        proposedType: "inferred_India_compatible",
        evidence: [],
        reasons: ["An approved Indian archetype can fulfil the open requirement."],
        constraints: ["No India request is stated by the organisation."],
        unknowns: ["Commercial willingness is unknown."],
        regulatoryFacts: null,
        logisticsFacts: null,
      }),
    );

    expect(result).toMatchObject({
      assessed: true,
      relevanceType: "inferred_India_compatible",
      basis: "mewtuals_interpretation",
      reasons: [
        "An approved Indian archetype can fulfil the open requirement.",
      ],
      constraints: ["No India request is stated by the organisation."],
      unknowns: ["Commercial willingness is unknown."],
      regulatoryFacts: null,
      logisticsFacts: null,
    });
  });

  it("rejects inferred compatibility without openness, an approved archetype, or freedom from exclusion", () => {
    const withoutArchetype = normalizedRequirement({
      indianExecutionArchetypes: [],
    });
    const inferredInput = {
      proposedType: "inferred_India_compatible",
      evidence: [],
    };

    expect({
      archetype: assessIndiaRelevance(
        assessmentInput({
          ...inferredInput,
          requirements: [
            {
              requirement: withoutArchetype,
              globallyDeliverable: true,
              openToExternalCounterparties: false,
            },
          ],
        }),
      ),
      excluded: assessIndiaRelevance(
        assessmentInput({
          ...inferredInput,
          exclusionEvidence: [
            evidence("indiaRelevance.no_current_India_fit.exclusion"),
          ],
        }),
      ),
      openness: assessIndiaRelevance(
        assessmentInput({
          ...inferredInput,
          requirements: [
            {
              requirement: normalizedRequirement(),
              globallyDeliverable: false,
              openToExternalCounterparties: false,
            },
          ],
        }),
      ),
    }).toMatchObject({
      archetype: {
        assessed: false,
        reason: "missing_indian_execution_archetype",
      },
      excluded: { assessed: false, reason: "india_exclusion_present" },
      openness: { assessed: false, reason: "missing_open_requirement" },
    });
  });

  it("blocks inferred compatibility when original no-fit evidence is in the main evidence collection", () => {
    expect(
      assessIndiaRelevance(
        assessmentInput({
          proposedType: "inferred_India_compatible",
          evidence: [
            evidence("indiaRelevance.no_current_India_fit.exclusion"),
          ],
          exclusionEvidence: [],
        }),
      ),
    ).toEqual({
      assessed: false,
      reason: "india_exclusion_present",
    });
  });

  it("preserves an honest no-current-fit result as monitorable with null unknown facts", () => {
    const result = assessIndiaRelevance(
      assessmentInput({
        proposedType: "no_current_India_fit",
        evidence: [],
        requirements: [],
        reasons: ["Current public evidence excludes India."],
        constraints: ["Delivery is limited to another market."],
        unknowns: ["Future geographic scope is unknown."],
        regulatoryFacts: null,
        logisticsFacts: null,
      }),
    );

    expect(result).toMatchObject({
      assessed: true,
      relevanceType: "no_current_India_fit",
      basis: "no_current_fit",
      monitorable: true,
      regulatoryFacts: null,
      logisticsFacts: null,
    });
  });

  it("keeps globally open evidence distinct from inferred India compatibility", () => {
    const requirement = normalizedRequirement({
      indianExecutionArchetypes: [],
    });
    const openRequirement = {
      requirement,
      globallyDeliverable: true,
      openToExternalCounterparties: true,
    };
    const globallyOpenInput = {
      proposedType: "globally_open",
      requirements: [openRequirement],
      evidence: [
        evidence("indiaRelevance.globally_open.requirement_access"),
      ],
    };

    expect({
      accepted: assessIndiaRelevance(
        assessmentInput(globallyOpenInput),
      ),
      unsupported: assessIndiaRelevance(
        assessmentInput({
          ...globallyOpenInput,
          evidence: [],
        }),
      ),
    }).toMatchObject({
      accepted: {
        assessed: true,
        relevanceType: "globally_open",
        basis: "globally_open",
        supportedEvidencePaths: [
          "indiaRelevance.globally_open.requirement_access",
        ],
      },
      unsupported: {
        assessed: false,
        reason: "missing_global_openness_evidence",
      },
    });
  });

  it("returns detached, deeply immutable successful assessments", () => {
    const regulatoryFacts = { residency: { known: false } };
    const logisticsFacts = { serviceChannels: ["onsite"] };
    const result = assessIndiaRelevance(
      assessmentInput({ regulatoryFacts, logisticsFacts }),
    );

    regulatoryFacts.residency.known = true;
    logisticsFacts.serviceChannels.push("remote");

    expect(result.assessed).toBe(true);
    if (!result.assessed) return;
    expect(result.regulatoryFacts).toEqual({ residency: { known: false } });
    expect(result.logisticsFacts).toEqual({ serviceChannels: ["onsite"] });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.reasons)).toBe(true);
    expect(Object.isFrozen(result.constraints)).toBe(true);
    expect(Object.isFrozen(result.unknowns)).toBe(true);
    expect(Object.isFrozen(result.supportedEvidencePaths)).toBe(true);
    expect(Object.isFrozen(result.regulatoryFacts)).toBe(true);
    expect(
      Object.isFrozen(
        (result.regulatoryFacts as { residency: object }).residency,
      ),
    ).toBe(true);
    expect(Object.isFrozen(result.logisticsFacts)).toBe(true);
    expect(
      Object.isFrozen(
        (result.logisticsFacts as { serviceChannels: string[] })
          .serviceChannels,
      ),
    ).toBe(true);
  });
});
