import { describe, expect, it } from "vitest";

import {
  classifySignal,
  type CandidateEvidence,
  type DirectDemandAskType,
  type EvidenceCandidate,
  type PrecursorDevelopmentType,
} from "../app/domain/global-radar";

const observedAt = "2026-07-29T00:00:00.000Z";

function evidence(
  overrides: Partial<CandidateEvidence> = {},
): CandidateEvidence {
  return {
    sourceUrl: "https://example.com/suppliers",
    canonicalSourceUrl: null,
    sourceKind: "original",
    sourceLanguage: "en",
    originalText:
      "Example Robotics is accepting supplier applications at https://example.com/suppliers.",
    englishSummary: "Example Robotics is accepting supplier applications.",
    publishedAt: "2026-07-28T00:00:00.000Z",
    observedAt,
    evidenceConfidence: 90,
    translationConfidence: null,
    isPrimarySource: true,
    isOfficialProcurementSource: false,
    supportsDirectDemand: true,
    isSyndicated: false,
    organizationId: "domain:example.com",
    corporateGroupId: "group:example",
    supportedFieldPaths: ["directDemandAsk", "responsePath"],
    ...overrides,
  };
}

function candidate(
  overrides: Partial<EvidenceCandidate> = {},
): EvidenceCandidate {
  return {
    proposedSignalClass: "direct_demand",
    observedAt,
    directDemandAsk: {
      type: "supplier_registration",
      isExplicit: true,
      expiresAt: null,
    },
    precursorDevelopmentType: null,
    evidence: [evidence()],
    momentumMetrics: null,
    responsePath: null,
    ...overrides,
  };
}

function rejectionReason(input: EvidenceCandidate): string | null {
  const result = classifySignal(input);
  return result.accepted ? null : result.reason;
}

const acceptedAskTypes: readonly DirectDemandAskType[] = [
  "rfp",
  "procurement",
  "supplier_registration",
  "vendor_request",
  "partner_application",
  "distributor_request",
  "manufacturing_request",
  "data_collection_request",
  "testing_or_certification_request",
  "installation_or_service_request",
];

const precursorTypes: readonly PrecursorDevelopmentType[] = [
  "funding",
  "hiring",
  "deployment",
  "facility",
  "platform_launch",
  "expansion",
];

describe("Global Radar signal classification", () => {
  it.each(acceptedAskTypes)(
    "accepts an explicit current %s ask with first-party support",
    (type) => {
      const result = classifySignal(
        candidate({
          directDemandAsk: { type, isExplicit: true, expiresAt: null },
        }),
      );

      expect(result).toMatchObject({
        accepted: true,
        signalClass: "direct_demand",
        gateFacts: {
          explicitCurrentAsk: true,
          officialDirectDemandEvidence: true,
        },
      });
    },
  );

  it.each([
    ["funding-only", "funding"],
    ["hiring-only", "hiring"],
    ["launch-only", "platform_launch"],
    ["generic marketing", null],
  ] as const)("rejects %s as direct demand", (_label, precursorType) => {
    expect(
      rejectionReason(
        candidate({
          directDemandAsk: null,
          precursorDevelopmentType: precursorType,
        }),
      ),
    ).toBe("missing_explicit_current_ask");
  });

  it("rejects inferred demand", () => {
    expect(
      rejectionReason(
        candidate({
          directDemandAsk: {
            type: "manufacturing_request",
            isExplicit: false,
            expiresAt: null,
          },
        }),
      ),
    ).toBe("missing_explicit_current_ask");
  });

  it("rejects expired asks", () => {
    expect(
      rejectionReason(
        candidate({
          directDemandAsk: {
            type: "rfp",
            isExplicit: true,
            expiresAt: "2026-07-28T23:59:59.000Z",
          },
        }),
      ),
    ).toBe("expired_direct_demand");
  });

  it("rejects secondary-only direct-demand evidence", () => {
    expect(
      rejectionReason(
        candidate({
          evidence: [
            evidence({
              isPrimarySource: false,
              isOfficialProcurementSource: false,
            }),
          ],
        }),
      ),
    ).toBe("missing_official_direct_demand_evidence");
  });

  it("accepts official procurement evidence even when it is not an entity first-party page", () => {
    const result = classifySignal(
      candidate({
        evidence: [
          evidence({
            sourceUrl: "https://procurement.example/notices/7",
            isPrimarySource: false,
            isOfficialProcurementSource: true,
          }),
        ],
      }),
    );

    expect(result).toMatchObject({
      accepted: true,
      signalClass: "direct_demand",
    });
  });

  it("rejects direct-demand assertions without field-level ask provenance", () => {
    expect(
      rejectionReason(
        candidate({
          evidence: [
            evidence({ supportedFieldPaths: ["factualSummary"] }),
          ],
        }),
      ),
    ).toBe("missing_official_direct_demand_evidence");
  });

  it.each(precursorTypes)(
    "accepts a dated %s development only as a precursor",
    (precursorDevelopmentType) => {
      const result = classifySignal(
        candidate({
          proposedSignalClass: "demand_precursor",
          directDemandAsk: null,
          precursorDevelopmentType,
          evidence: [
            evidence({
              supportsDirectDemand: false,
              supportedFieldPaths: ["precursorDevelopmentType"],
            }),
          ],
        }),
      );

      expect(result).toMatchObject({
        accepted: true,
        signalClass: "demand_precursor",
        gateFacts: { datedDevelopment: true },
      });
      expect(result.accepted && result.signalClass).not.toBe("direct_demand");
    },
  );

  it("rejects an undated precursor", () => {
    expect(
      rejectionReason(
        candidate({
          proposedSignalClass: "demand_precursor",
          directDemandAsk: null,
          precursorDevelopmentType: "deployment",
          evidence: [
            evidence({ publishedAt: null, supportsDirectDemand: false }),
          ],
        }),
      ),
    ).toBe("missing_dated_precursor_evidence");
  });

  it("rejects a dated but unrelated source as precursor support", () => {
    expect(
      rejectionReason(
        candidate({
          proposedSignalClass: "demand_precursor",
          directDemandAsk: null,
          precursorDevelopmentType: "funding",
          evidence: [
            evidence({
              supportsDirectDemand: false,
              supportedFieldPaths: ["factualSummary"],
            }),
          ],
        }),
      ),
    ).toBe("missing_dated_precursor_evidence");
  });

  it("accepts momentum only with independent organisations and evidence gates", () => {
    const result = classifySignal(
      candidate({
        proposedSignalClass: "ecosystem_momentum",
        directDemandAsk: null,
        evidence: [
          evidence({
            sourceUrl: "https://alpha.example/platform",
            organizationId: "domain:alpha.example",
            corporateGroupId: "group:alpha",
            supportsDirectDemand: false,
          }),
          evidence({
            sourceUrl: "https://beta.example/research",
            organizationId: "domain:beta.example",
            corporateGroupId: "group:beta",
            isPrimarySource: false,
            supportsDirectDemand: false,
          }),
        ],
        momentumMetrics: {
          taxonomyConsistency: 70,
          evidenceQuality: 60,
        },
      }),
    );

    expect(result).toMatchObject({
      accepted: true,
      signalClass: "ecosystem_momentum",
      gateFacts: {
        independentOrganizationCount: 2,
        evidenceItemCount: 2,
        primarySourceCount: 1,
        nonSyndicatedEvidenceCount: 2,
        taxonomyConsistency: 70,
        evidenceQuality: 60,
      },
    });
  });

  it("rejects momentum from one corporate group", () => {
    expect(
      rejectionReason(
        candidate({
          proposedSignalClass: "ecosystem_momentum",
          directDemandAsk: null,
          evidence: [
            evidence({ organizationId: "org:parent" }),
            evidence({
              sourceUrl: "https://subsidiary.example/platform",
              organizationId: "org:subsidiary",
              corporateGroupId: "group:example",
            }),
          ],
          momentumMetrics: {
            taxonomyConsistency: 90,
            evidenceQuality: 90,
          },
        }),
      ),
    ).toBe("insufficient_independent_organizations");
  });

  it("rejects repeated evidence from one organisation despite inconsistent group labels", () => {
    expect(
      rejectionReason(
        candidate({
          proposedSignalClass: "ecosystem_momentum",
          directDemandAsk: null,
          evidence: [
            evidence({
              sourceUrl: "https://example.com/one",
              corporateGroupId: "group:one",
            }),
            evidence({
              sourceUrl: "https://example.com/two",
              corporateGroupId: "group:two",
            }),
          ],
          momentumMetrics: {
            taxonomyConsistency: 90,
            evidenceQuality: 90,
          },
        }),
      ),
    ).toBe("insufficient_independent_organizations");
  });

  it("rejects syndicated copies as momentum evidence", () => {
    expect(
      rejectionReason(
        candidate({
          proposedSignalClass: "ecosystem_momentum",
          directDemandAsk: null,
          evidence: [
            evidence({
              sourceUrl: "https://mirror-one.example/story",
              canonicalSourceUrl: "https://example.com/announcement",
              organizationId: "org:one",
              corporateGroupId: "group:one",
              isSyndicated: true,
            }),
            evidence({
              sourceUrl: "https://mirror-two.example/story",
              canonicalSourceUrl: "https://example.com/announcement",
              organizationId: "org:two",
              corporateGroupId: "group:two",
              isPrimarySource: false,
              isSyndicated: true,
            }),
          ],
          momentumMetrics: {
            taxonomyConsistency: 90,
            evidenceQuality: 90,
          },
        }),
      ),
    ).toBe("insufficient_non_syndicated_evidence");
  });

  it("counts non-syndicated mirrors of one canonical source only once", () => {
    expect(
      rejectionReason(
        candidate({
          proposedSignalClass: "ecosystem_momentum",
          directDemandAsk: null,
          evidence: [
            evidence({
              sourceUrl: "https://example.com/announcement",
              organizationId: "org:one",
              corporateGroupId: "group:one",
              isSyndicated: false,
            }),
            evidence({
              sourceUrl: "https://mirror.example/story",
              canonicalSourceUrl: "https://example.com/announcement",
              organizationId: "org:two",
              corporateGroupId: "group:two",
              isPrimarySource: false,
              isSyndicated: false,
            }),
          ],
          momentumMetrics: {
            taxonomyConsistency: 90,
            evidenceQuality: 90,
          },
        }),
      ),
    ).toBe("insufficient_non_syndicated_evidence");
  });

  it.each([
    [
      "fewer than two evidence items",
      [evidence({ supportsDirectDemand: false })],
      { taxonomyConsistency: 90, evidenceQuality: 90 },
      "insufficient_momentum_evidence",
    ],
    [
      "no primary source",
      [
        evidence({
          sourceUrl: "https://alpha.example/story",
          organizationId: "org:alpha",
          corporateGroupId: "group:alpha",
          isPrimarySource: false,
        }),
        evidence({
          sourceUrl: "https://beta.example/story",
          organizationId: "org:beta",
          corporateGroupId: "group:beta",
          isPrimarySource: false,
        }),
      ],
      { taxonomyConsistency: 90, evidenceQuality: 90 },
      "missing_primary_source",
    ],
    [
      "taxonomy consistency below 70",
      [
        evidence({ organizationId: "org:alpha", corporateGroupId: "group:alpha" }),
        evidence({
          sourceUrl: "https://beta.example/story",
          organizationId: "org:beta",
          corporateGroupId: "group:beta",
        }),
      ],
      { taxonomyConsistency: 69, evidenceQuality: 90 },
      "taxonomy_inconsistent",
    ],
    [
      "evidence quality below 60",
      [
        evidence({ organizationId: "org:alpha", corporateGroupId: "group:alpha" }),
        evidence({
          sourceUrl: "https://beta.example/story",
          organizationId: "org:beta",
          corporateGroupId: "group:beta",
        }),
      ],
      { taxonomyConsistency: 90, evidenceQuality: 59 },
      "evidence_quality_too_low",
    ],
  ] as const)("rejects momentum with %s", (_label, items, metrics, reason) => {
    expect(
      rejectionReason(
        candidate({
          proposedSignalClass: "ecosystem_momentum",
          directDemandAsk: null,
          evidence: [...items],
          momentumMetrics: metrics,
        }),
      ),
    ).toBe(reason);
  });

  it("preserves original Chinese evidence and keeps confidences separate", () => {
    const result = classifySignal(
      candidate({
        evidence: [
          evidence({
            sourceLanguage: "zh-CN",
            originalText: "本公司现公开招募印度制造合作伙伴。",
            englishSummary:
              "The company is publicly seeking Indian manufacturing partners.",
            evidenceConfidence: 91,
            translationConfidence: 82,
          }),
        ],
      }),
    );

    expect(result).toMatchObject({
      accepted: true,
      gateFacts: {
        evidenceConfidence: 91,
        translationConfidence: 82,
      },
    });
  });

  it("rejects Chinese evidence when the original-language text is missing", () => {
    expect(
      rejectionReason(
        candidate({
          evidence: [
            evidence({
              sourceLanguage: "zh-CN",
              originalText:
                "The company is seeking Indian manufacturing partners.",
              translationConfidence: 80,
            }),
          ],
        }),
      ),
    ).toBe("missing_original_language_evidence");
  });

  it("rejects Chinese evidence without a separate English summary", () => {
    expect(
      rejectionReason(
        candidate({
          evidence: [
            evidence({
              sourceLanguage: "zh-CN",
              originalText: "本公司现公开招募印度制造合作伙伴。",
              englishSummary: "本公司现公开招募印度制造合作伙伴。",
              translationConfidence: 80,
            }),
          ],
        }),
      ),
    ).toBe("missing_english_summary");
  });

  it("rejects a summary masquerading as source evidence", () => {
    expect(
      rejectionReason(
        candidate({ evidence: [evidence({ sourceKind: "summary" })] }),
      ),
    ).toBe("summary_is_not_evidence");
  });

  it("rejects search-result URLs even when labelled as original evidence", () => {
    expect(
      rejectionReason(
        candidate({
          evidence: [
            evidence({
              sourceUrl: "https://www.google.com/search?q=robotics+rfp",
            }),
          ],
        }),
      ),
    ).toBe("search_result_is_not_evidence");
  });

  it("rejects search-engine result redirects as evidence URLs", () => {
    expect(
      rejectionReason(
        candidate({
          evidence: [
            evidence({
              sourceUrl:
                "https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Frfp",
            }),
          ],
        }),
      ),
    ).toBe("search_result_is_not_evidence");
  });

  it("accepts a cited role-based public business email", () => {
    const result = classifySignal(
      candidate({
        evidence: [
          evidence({
            originalText:
              "Suppliers may contact procurement@example.com to register.",
          }),
        ],
        responsePath: {
          type: "official_business_email",
          url: null,
          businessEmail: "procurement@example.com",
          evidenceUrl: "https://example.com/suppliers",
        },
      }),
    );

    expect(result).toMatchObject({
      accepted: true,
      gateFacts: { responsePathVerified: true },
    });
  });

  it("accepts an approved response URL when the first-party page is the response path", () => {
    const result = classifySignal(
      candidate({
        responsePath: {
          type: "supplier_or_partner_registration",
          url: "https://example.com/suppliers",
          businessEmail: null,
          evidenceUrl: "https://example.com/suppliers",
        },
      }),
    );

    expect(result).toMatchObject({
      accepted: true,
      gateFacts: { responsePathVerified: true },
    });
  });

  it("rejects guessed business emails absent from the cited evidence", () => {
    expect(
      rejectionReason(
        candidate({
          responsePath: {
            type: "official_business_email",
            url: null,
            businessEmail: "procurement@example.com",
            evidenceUrl: "https://example.com/suppliers",
          },
        }),
      ),
    ).toBe("response_path_not_cited");
  });

  it("rejects personal contact addresses even when published", () => {
    expect(
      rejectionReason(
        candidate({
          evidence: [
            evidence({
              originalText: "For media enquiries email jane.doe@example.com.",
            }),
          ],
          responsePath: {
            type: "official_business_email",
            url: null,
            businessEmail: "jane.doe@example.com",
            evidenceUrl: "https://example.com/suppliers",
          },
        }),
      ),
    ).toBe("personal_contact_not_allowed");
  });

  it("rejects response paths whose evidence URL is not cited first-party evidence", () => {
    expect(
      rejectionReason(
        candidate({
          responsePath: {
            type: "supplier_or_partner_registration",
            url: "https://example.com/suppliers",
            businessEmail: null,
            evidenceUrl: "https://example.com/uncited",
          },
        }),
      ),
    ).toBe("response_path_not_cited");
  });

  it("rejects a response path cited only by secondary evidence", () => {
    expect(
      rejectionReason(
        candidate({
          evidence: [
            evidence({
              isPrimarySource: false,
              isOfficialProcurementSource: true,
            }),
          ],
          responsePath: {
            type: "supplier_or_partner_registration",
            url: "https://example.com/suppliers",
            businessEmail: null,
            evidenceUrl: "https://example.com/suppliers",
          },
        }),
      ),
    ).toBe("response_path_not_cited");
  });

  it("rejects unapproved response path types", () => {
    expect(
      rejectionReason(
        candidate({
          responsePath: {
            type: "personal_social_message",
            url: "https://example.com/suppliers",
            businessEmail: null,
            evidenceUrl: "https://example.com/suppliers",
          } as unknown as EvidenceCandidate["responsePath"],
        }),
      ),
    ).toBe("unsupported_response_path");
  });

  it("rejects a search-result page presented as an approved response URL", () => {
    const searchUrl = "https://www.google.com/search?q=example+suppliers";
    expect(
      rejectionReason(
        candidate({
          evidence: [
            evidence({
              originalText: `Supplier information can be found at ${searchUrl}.`,
            }),
          ],
          responsePath: {
            type: "supplier_or_partner_registration",
            url: searchUrl,
            businessEmail: null,
            evidenceUrl: "https://example.com/suppliers",
          },
        }),
      ),
    ).toBe("unsupported_response_path");
  });
});
