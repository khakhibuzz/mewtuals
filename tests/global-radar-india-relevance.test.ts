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

const positiveIndiaFactClaims: Readonly<Record<string, string>> = {
  collection: "We collect physical data in India.",
  distribution: "We distribute robotics systems in India.",
  installation: "We install robotics systems in India.",
  languages: "We provide language services in India.",
  manufacturing: "We manufacture robotics hardware in India.",
  participants: "We recruit participants in India.",
  roads_or_environments: "We operate on roads and environments in India.",
  service: "We service robotics systems in India.",
  suppliers: "We accept suppliers from India.",
};

function positiveOriginalClaim(supportedFieldPath: string): string {
  if (supportedFieldPath === "indiaRelevance.globally_open.requirement_access") {
    return "Applications are open to suppliers worldwide.";
  }
  if (supportedFieldPath.startsWith("indiaRelevance.no_current_India_fit.")) {
    return "India is excluded from this opportunity.";
  }
  if (supportedFieldPath.includes(".existing_India_presence.")) {
    return "We currently operate a manufacturing facility in India.";
  }
  if (supportedFieldPath.includes(".India_expansion.")) {
    return "We are expanding distribution into India.";
  }
  const factKind = supportedFieldPath.split(".").at(-1) ?? "";
  return positiveIndiaFactClaims[factKind] ?? "We operate in India.";
}

function evidence(
  supportedFieldPath: string,
  sourceKind = "original",
  overrides: Record<string, unknown> = {},
) {
  const originalText = positiveOriginalClaim(supportedFieldPath);
  return {
    sourceUrl: "https://example.com/india",
    canonicalSourceUrl: null,
    sourceKind,
    sourceLanguage: "en",
    originalText,
    englishSummary: originalText,
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
    [
      "explicit_India",
      "suppliers",
      "We do not accept suppliers from India and India is excluded.",
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "We do not operate manufacturing in India; India is excluded from our footprint.",
    ],
    [
      "India_expansion",
      "distribution",
      "We are not expanding distribution into India; India is excluded.",
    ],
    [
      "explicit_India",
      "suppliers",
      "We accept suppliers worldwide except India.",
    ],
    [
      "India_expansion",
      "distribution",
      "We considered expanding distribution into India but cancelled the plan.",
    ],
    [
      "India_expansion",
      "distribution",
      "We decided against expanding distribution into India.",
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "We no longer operate manufacturing in India.",
    ],
    [
      "India_expansion",
      "distribution",
      "No new distribution hub in India",
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "No existing manufacturing facility in India",
    ],
    [
      "explicit_India",
      "suppliers",
      "No Indian suppliers are eligible",
    ],
    [
      "India_expansion",
      "distribution",
      "There are no plans for a new distribution hub in India",
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "Current plans do not include a manufacturing facility in India",
    ],
    [
      "India_expansion",
      "distribution",
      "We are not entering distribution in India",
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "The Indian manufacturing facility is no longer active",
    ],
    [
      "India_expansion",
      "distribution",
      "We will not be entering distribution in India",
    ],
    [
      "India_expansion",
      "distribution",
      "We do not plan to expand distribution in India",
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "The Indian manufacturing facility has not been active",
    ],
    [
      "explicit_India",
      "suppliers",
      "We will not be accepting suppliers from India",
    ],
    [
      "India_expansion",
      "distribution",
      "We are not planning to expand distribution in India",
    ],
    [
      "India_expansion",
      "distribution",
      "We are not planning to be entering distribution in India",
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "The Indian manufacturing facility is no longer actively operating",
    ],
  ] as const)(
    "rejects negated or abandoned original evidence mislabeled as %s",
    (proposedType, factKind, originalText) => {
      const fieldPath = `indiaRelevance.${proposedType}.${factKind}`;
      expect(
        assessIndiaRelevance(
          assessmentInput({
            proposedType,
            evidence: [
              evidence(fieldPath, "original", {
                originalText,
                englishSummary: originalText,
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
      "We don’t accept suppliers from India.",
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "The company isn’t operating manufacturing in India.",
    ],
    [
      "India_expansion",
      "distribution",
      "We aren’t expanding distribution into India.",
    ],
  ] as const)(
    "rejects contracted negative original evidence mislabeled as %s",
    (proposedType, factKind, originalText) => {
      const fieldPath = `indiaRelevance.${proposedType}.${factKind}`;
      expect(
        assessIndiaRelevance(
          assessmentInput({
            proposedType,
            evidence: [
              evidence(fieldPath, "original", {
                originalText,
                englishSummary: originalText,
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
      "en",
      "We accept suppliers only from India.",
      null,
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "zh-CN",
      "我们仅在印度制造机器人。",
      90,
    ],
    [
      "explicit_India",
      "suppliers",
      "en",
      "Indian suppliers are eligible for this programme.",
      null,
    ],
    [
      "explicit_India",
      "suppliers",
      "en",
      "Indian suppliers are eligible and certification is not required.",
      null,
    ],
    [
      "existing_India_presence",
      "manufacturing",
      "en",
      "The Indian manufacturing facility is active but not expanding.",
      null,
    ],
  ] as const)(
    "accepts clause-scoped positive evidence for %s: %s",
    (
      proposedType,
      factKind,
      sourceLanguage,
      originalText,
      translationConfidence,
    ) => {
      const fieldPath = `indiaRelevance.${proposedType}.${factKind}`;
      expect(
        assessIndiaRelevance(
          assessmentInput({
            proposedType,
            evidence: [
              evidence(fieldPath, "original", {
                sourceLanguage,
                originalText,
                englishSummary: originalText,
                translationConfidence,
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

  it("accepts an India-expansion noun phrase supported by its typed evidence", () => {
    const fieldPath = "indiaRelevance.India_expansion.distribution";
    const originalText = "New distribution hub in India";

    expect(
      assessIndiaRelevance(
        assessmentInput({
          proposedType: "India_expansion",
          evidence: [
            evidence(fieldPath, "original", {
              originalText,
              englishSummary: originalText,
            }),
          ],
        }),
      ),
    ).toMatchObject({
      assessed: true,
      relevanceType: "India_expansion",
      supportedEvidencePaths: [fieldPath],
    });
  });

  it("rejects contracted negative globally-open evidence", () => {
    const originalText = "Applications aren’t open worldwide.";
    expect(
      assessIndiaRelevance(
        assessmentInput({
          proposedType: "globally_open",
          evidence: [
            evidence(
              "indiaRelevance.globally_open.requirement_access",
              "original",
              { originalText, englishSummary: originalText },
            ),
          ],
        }),
      ),
    ).toEqual({
      assessed: false,
      reason: "missing_global_openness_evidence",
    });
  });

  it.each([
    "Applications are open worldwide; only registered companies are eligible.",
    "Applications are open worldwide; eligibility is limited to Registered Companies",
    "Applications are open worldwide; eligibility is restricted to APPROVED VENDORS.",
    "Applications are open worldwide; eligibility is limited to qualified applicants.",
    "Applications are open worldwide; only universities are eligible",
    "Applications are open worldwide, only universities are eligible",
    "Applications are open worldwide, only approved researchers may apply",
    "Applications are open worldwide, only participants may apply",
    "Applications are open worldwide, only research institutions are eligible",
    "Applications are open worldwide, only research labs are eligible",
    "Applications are open worldwide; only authorized distributors may apply",
    "Applications are open worldwide; only approved partners may apply",
    "We only accept applications worldwide.",
    "Applications are open worldwide; the support desk operates daily except Sunday.",
    "Applications are open worldwide; technical support is restricted to business hours.",
    "Applications are open worldwide, excluding unregistered applicants.",
    "申请面向全球供应商开放，但仅限合格供应商",
    "申请面向全球供应商开放，但仅限于合格供应商",
    "申请面向全球供应商开放，但只限已注册企业",
    "申请面向全球供应商开放，但仅限大学",
    "申请面向全球供应商开放，但仅限合格研究人员",
    "申请面向全球开放；仅限合格合作方",
  ])(
    "allows a bounded non-geographic eligibility qualifier beside global openness: %s",
    (originalText) => {
      expect(
        assessIndiaRelevance(
          assessmentInput({
            proposedType: "globally_open",
            evidence: [
              evidence(
                "indiaRelevance.globally_open.requirement_access",
                "original",
                { originalText, englishSummary: originalText },
              ),
            ],
          }),
        ),
      ).toMatchObject({
        assessed: true,
        relevanceType: "globally_open",
        basis: "globally_open",
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

  it.each([
    "The organisation published supplier application information.",
    "Applications are closed and limited to domestic suppliers.",
    "Applications are open worldwide but restricted to Brazil.",
    "Applications are open worldwide but restricted to brazil",
    "Applications are open worldwide except Brazil.",
    "Applications are open worldwide; restricted to Brazil.",
    "Applications are open worldwide; except Brazil.",
    "Applications are open worldwide; only brazilian companies are eligible.",
    "Applications are open worldwide; only Japanese researchers may apply",
    "Applications are open worldwide, only Japanese researchers may apply",
    "Applications are not currently open worldwide",
    "Applications have not been opened worldwide",
    "We only accept applications from Brazil worldwide.",
    "Applications are open worldwide but restricted to partner region zeta.",
    "申请面向全球供应商开放，但仅限日本",
    "申请面向全球供应商开放，但只限日本",
    "申请面向全球开放；仅限日本",
  ])(
    "rejects globally-open worker paths without positive original openness: %s",
    (originalText) => {
      expect(
        assessIndiaRelevance(
          assessmentInput({
            proposedType: "globally_open",
            evidence: [
              evidence(
                "indiaRelevance.globally_open.requirement_access",
                "original",
                { originalText, englishSummary: originalText },
              ),
            ],
          }),
        ),
      ).toEqual({
        assessed: false,
        reason: "missing_global_openness_evidence",
      });
    },
  );

  it.each([
    [
      "en",
      "Applications are open to suppliers worldwide.",
      null,
    ],
    [
      "zh-CN",
      "我们接受来自全球供应商的申请。",
      91,
    ],
  ] as const)(
    "accepts positively stated %s global openness from an original source",
    (sourceLanguage, originalText, translationConfidence) => {
      expect(
        assessIndiaRelevance(
          assessmentInput({
            proposedType: "globally_open",
            evidence: [
              evidence(
                "indiaRelevance.globally_open.requirement_access",
                "original",
                {
                  sourceLanguage,
                  originalText,
                  englishSummary:
                    "Applications are open to suppliers worldwide.",
                  translationConfidence,
                },
              ),
            ],
          }),
        ),
      ).toMatchObject({
        assessed: true,
        relevanceType: "globally_open",
        basis: "globally_open",
      });
    },
  );

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
