import { describe, expect, it } from "vitest";

import {
  deriveGlobalRadarReclassification,
  type CandidateEvidence,
} from "../app/domain/global-radar";
import { globalRadarTestResolvedCompliance } from "./support/global-radar-test-data";

const NOW = new Date("2026-07-31T00:00:00.000Z");
const SOURCE_URL = "https://example.com/suppliers";

function evidence(
  supportedFieldPaths: readonly string[],
): CandidateEvidence {
  return {
    sourceUrl: SOURCE_URL,
    canonicalSourceUrl: SOURCE_URL,
    sourceKind: "original",
    sourceLanguage: "en",
    originalText: `The public supplier response page is ${SOURCE_URL}.`,
    englishSummary: "The organisation published a current supplier request.",
    publishedAt: "2026-07-30T00:00:00.000Z",
    observedAt: "2026-07-30T12:00:00.000Z",
    evidenceConfidence: 88,
    translationConfidence: null,
    isPrimarySource: true,
    isOfficialProcurementSource: false,
    supportsDirectDemand: true,
    isSyndicated: false,
    organizationId: "entity-one",
    corporateGroupId: "group-one",
    supportedFieldPaths: [...supportedFieldPaths],
  };
}

describe("Global Radar administrator score recomputation", () => {
  it("derives deterministic direct components and applies compliance once", () => {
    const input = {
      signalClass: "direct_demand" as const,
      signalType: "supplier_registration",
      currentStatus: "monitoring" as const,
      indiaRelevanceType: "globally_open" as const,
      announcedAt: "2026-07-30T00:00:00.000Z",
      effectiveFrom: null,
      observedAt: "2026-07-30T12:00:00.000Z",
      expiresAt: "2026-09-30T00:00:00.000Z",
      responsePath: {
        type: "supplier_or_partner_registration" as const,
        url: SOURCE_URL,
        businessEmail: null,
        evidenceUrl: SOURCE_URL,
      },
      sensitiveDataAndCompliance: globalRadarTestResolvedCompliance({
        export_controls: "severe",
      }),
      assessments: {
        actionability: 90,
        commercialPotential: 75,
        repeatability: 70,
        strategicLearning: 80,
        complianceComplexity: 20,
      },
      evidence: [
        evidence([
          "directDemandAsk.supplier_registration",
          "responsePath",
        ]),
      ],
      now: NOW,
    };

    const first = deriveGlobalRadarReclassification(input);
    const unchangedResubmission = deriveGlobalRadarReclassification(input);

    expect(first).toMatchObject({
      valid: true,
      actionabilityInput: 90,
      responsePathVerified: true,
      score: {
        components: {
          explicitness: 100,
          evidenceConfidence: 88,
          freshness: 100,
          actionability: 70,
          indiaFit: 70,
          responseAccessibility: 100,
        },
      },
    });
    expect(unchangedResubmission).toEqual(first);
  });

  it("cannot manufacture response accessibility without a verified path", () => {
    const result = deriveGlobalRadarReclassification({
      signalClass: "direct_demand",
      signalType: "supplier_registration",
      currentStatus: "monitoring",
      indiaRelevanceType: "globally_open",
      announcedAt: "2026-07-30T00:00:00.000Z",
      effectiveFrom: null,
      observedAt: "2026-07-30T12:00:00.000Z",
      expiresAt: "2026-09-30T00:00:00.000Z",
      responsePath: null,
      sensitiveDataAndCompliance: globalRadarTestResolvedCompliance(),
      assessments: {
        actionability: 90,
        commercialPotential: 75,
        repeatability: 70,
        strategicLearning: 80,
        complianceComplexity: 20,
      },
      evidence: [evidence(["directDemandAsk.supplier_registration"])],
      now: NOW,
    });

    expect(result).toMatchObject({
      valid: true,
      responsePathVerified: false,
      score: { components: { responseAccessibility: null } },
    });
  });

  it("derives precursor confidence, India fit, and horizon from facts", () => {
    const result = deriveGlobalRadarReclassification({
      signalClass: "demand_precursor",
      signalType: "deployment",
      currentStatus: "monitoring",
      indiaRelevanceType: "no_current_India_fit",
      announcedAt: null,
      effectiveFrom: "2026-08-30T00:00:00.000Z",
      observedAt: "2026-07-30T12:00:00.000Z",
      responsePath: null,
      sensitiveDataAndCompliance: globalRadarTestResolvedCompliance(),
      assessments: {
        proximityToExternalDemand: 70,
        fundingDeploymentMomentum: 75,
        likelyDataHardwareIntensity: 80,
        strategicRelevance: 78,
      },
      evidence: [evidence(["precursorDevelopment.deployment"])],
      now: NOW,
    });

    expect(result).toMatchObject({
      valid: true,
      score: {
        components: {
          evidenceConfidence: 88,
          indiaFit: 0,
          estimatedTimeHorizon: 100,
        },
      },
    });
  });
});
