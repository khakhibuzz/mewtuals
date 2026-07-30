import { describe, expect, it } from "vitest";

import {
  normalizeRadarEvidence,
  radarEvidenceProposalSchema,
} from "../app/domain/global-radar/evidence";

function evidenceProposal(overrides: Record<string, unknown> = {}) {
  return {
    contributorEntityRef: "entity-acme",
    sourceUrl:
      "https://ACME.example/public-request?utm_source=radar#application",
    canonicalSourceUrl: "https://acme.example/public-request",
    sourceName: " Acme Robotics ",
    sourceType: " official_request ",
    sourceKind: "original",
    sourceLanguage: "en",
    sourceCountry: "United States",
    sourceFamily: "official_company_material",
    claim: " Acme requests teleoperated trajectories from suppliers. ",
    excerpt: " Seeking teleoperation suppliers. ",
    englishSummary:
      "Acme publicly requests teleoperated trajectories from suppliers.",
    publishedAt: "2026-07-29T00:00:00.000Z",
    observedAt: "2026-07-29T18:01:00.000Z",
    evidenceConfidence: 90,
    translationConfidence: null,
    isPrimarySource: true,
    isOfficialProcurementSource: false,
    isSyndicated: false,
    supportsDirectDemand: true,
    supportsIndiaRelevance: false,
    supportedFieldPaths: [
      "signal.factualSummary",
      "directDemandAsk.data_collection_request",
      "signal.factualSummary",
    ],
    rawMetadata: {},
    ...overrides,
  };
}

describe("Global Radar evidence extraction", () => {
  it("normalizes a concise original-language record with deterministic provenance", () => {
    const result = normalizeRadarEvidence(evidenceProposal());

    expect(result).toMatchObject({
      valid: true,
      evidence: {
        contributorEntityRef: "entity-acme",
        sourceUrl: "https://acme.example/public-request",
        canonicalSourceUrl: "https://acme.example/public-request",
        sourceName: "Acme Robotics",
        sourceType: "official_request",
        claim: "Acme requests teleoperated trajectories from suppliers.",
        sourceExcerpt: "Seeking teleoperation suppliers.",
        englishSummary:
          "Acme publicly requests teleoperated trajectories from suppliers.",
        evidenceConfidence: 90,
        translationConfidence: null,
        isPrimarySource: true,
        isSyndicated: false,
        supportsDirectDemand: true,
        supportsIndiaRelevance: false,
        supportedFieldPaths: [
          "directDemandAsk.data_collection_request",
          "signal.factualSummary",
        ],
      },
    });
    if (!result.valid) throw new Error("Expected normalized evidence.");
    expect(result.evidence.evidenceFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.classification.sourceKind).toBe("original");
    expect(result.classification.originalText).toBe(result.evidence.claim);
    expect(result.classification.englishSummary).not.toBe(
      result.classification.originalText,
    );
    expect(Object.isFrozen(result.evidence.supportedFieldPaths)).toBe(true);
  });

  it("uses the canonical source identity for mirrored secondary evidence", () => {
    const result = normalizeRadarEvidence(
      evidenceProposal({
        sourceUrl: "https://news.example/acme-request",
        canonicalSourceUrl: "https://acme.example/public-request",
        isPrimarySource: false,
      }),
    );

    expect(result).toMatchObject({ valid: true });
    if (!result.valid) throw new Error("Expected normalized evidence.");
    const primary = normalizeRadarEvidence(evidenceProposal());
    if (!primary.valid) throw new Error("Expected normalized evidence.");
    expect(result.evidence.evidenceFingerprint).toBe(
      primary.evidence.evidenceFingerprint,
    );
  });

  it("derives direct and India support flags from field provenance", () => {
    const result = normalizeRadarEvidence(
      evidenceProposal({
        supportsDirectDemand: false,
        supportsIndiaRelevance: true,
        supportedFieldPaths: ["directDemandAsk.data_collection_request"],
      }),
    );

    expect(result).toMatchObject({
      valid: true,
      evidence: {
        supportsDirectDemand: true,
        supportsIndiaRelevance: false,
      },
      classification: { supportsDirectDemand: true },
    });
  });

  it("rejects unknown proposal fields and full-page-like material", () => {
    expect(
      radarEvidenceProposalSchema.safeParse(
        evidenceProposal({ pageContent: "copied page" }),
      ).success,
    ).toBe(false);

    const result = normalizeRadarEvidence(
      evidenceProposal({
        claim: `<main>${"article content ".repeat(55)}</main>`,
      }),
    );
    expect(result).toEqual({ valid: false, reason: "full_page_content" });
    expect(
      radarEvidenceProposalSchema.safeParse(
        evidenceProposal({
          claim: `<main>${"article content ".repeat(55)}</main>`,
        }),
      ).success,
    ).toBe(false);
  });

  it("rejects unsupported provenance paths and missing observation dates", () => {
    expect(
      normalizeRadarEvidence(
        evidenceProposal({ supportedFieldPaths: ["signal.secretWorkerField"] }),
      ),
    ).toEqual({ valid: false, reason: "unsupported_field_path" });
    expect(
      radarEvidenceProposalSchema.safeParse(
        evidenceProposal({ supportedFieldPaths: ["signal.secretWorkerField"] }),
      ).success,
    ).toBe(false);

    const withoutObservation = evidenceProposal();
    delete (withoutObservation as Record<string, unknown>).observedAt;
    expect(normalizeRadarEvidence(withoutObservation)).toEqual({
      valid: false,
      reason: "invalid_evidence",
    });
  });

  it("allows only exact requirement and compliance provenance fields", () => {
    expect(
      normalizeRadarEvidence(
        evidenceProposal({ supportedFieldPaths: ["requirement.workerSecret"] }),
      ),
    ).toEqual({ valid: false, reason: "unsupported_field_path" });
    expect(
      normalizeRadarEvidence(
        evidenceProposal({
          supportedFieldPaths: [
            "requirement.capabilityTag",
            "sensitiveDataAndCompliance.sensitiveDataFlags.faces",
            "sensitiveDataAndCompliance.complianceFacts.consent",
          ],
        }),
      ),
    ).toMatchObject({ valid: true });
  });

  it("preserves Chinese original evidence separately from its English summary", () => {
    const result = normalizeRadarEvidence(
      evidenceProposal({
        sourceLanguage: "zh-CN",
        claim: "公司正在寻找印度制造合作伙伴。",
        excerpt: "寻找印度制造合作伙伴",
        englishSummary:
          "The company is seeking manufacturing partners located in India.",
        translationConfidence: 88,
        supportsIndiaRelevance: true,
        supportedFieldPaths: [
          "directDemandAsk.manufacturing_request",
          "indiaRelevance.explicit_India.manufacturing",
        ],
      }),
    );

    expect(result).toMatchObject({
      valid: true,
      evidence: {
        claim: "公司正在寻找印度制造合作伙伴。",
        englishSummary:
          "The company is seeking manufacturing partners located in India.",
        translationConfidence: 88,
      },
    });
  });

  it("rejects a translation replacing Chinese original evidence", () => {
    expect(
      normalizeRadarEvidence(
        evidenceProposal({
          sourceLanguage: "zh-CN",
          claim: "The company seeks manufacturing partners in India.",
          englishSummary:
            "The company is seeking manufacturing partners located in India.",
          translationConfidence: 88,
        }),
      ),
    ).toEqual({
      valid: false,
      reason: "missing_original_language_evidence",
    });

    expect(
      normalizeRadarEvidence(
        evidenceProposal({
          sourceLanguage: "zh-CN",
          claim: "公司正在寻找印度制造合作伙伴。",
          englishSummary:
            "The company is seeking manufacturing partners located in India.",
          translationConfidence: null,
        }),
      ),
    ).toEqual({
      valid: false,
      reason: "missing_translation_confidence",
    });
  });

  it("rejects impossible publication chronology", () => {
    expect(
      normalizeRadarEvidence(
        evidenceProposal({
          publishedAt: "2026-07-30T00:00:00.000Z",
          observedAt: "2026-07-29T18:01:00.000Z",
        }),
      ),
    ).toEqual({ valid: false, reason: "invalid_evidence_date" });
  });
});
