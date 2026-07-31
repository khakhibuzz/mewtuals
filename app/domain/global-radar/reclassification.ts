import {
  classifySignal,
} from "./classification";
import type {
  CandidateEvidence,
  IndiaRelevanceType,
  ProfessionalResponsePath,
  SensitiveDataAndCompliance,
  SignalStatus,
} from "./contracts";
import { globalRadarIndiaFitScore } from "./india-fit-score";
import {
  calculateFreshness,
  calculateTimeHorizon,
  scoreDemandPrecursor,
  scoreDirectDemand,
} from "./scoring";
import { assessComplianceReview } from "./systems-context";

type DirectAssessments = Readonly<{
  actionability: number | null;
  commercialPotential: number | null;
  repeatability: number | null;
  strategicLearning: number | null;
  complianceComplexity: number | null;
}>;

type PrecursorAssessments = Readonly<{
  proximityToExternalDemand: number | null;
  fundingDeploymentMomentum: number | null;
  likelyDataHardwareIntensity: number | null;
  strategicRelevance: number | null;
}>;

type ReclassificationFacts = Readonly<{
  currentStatus: SignalStatus;
  indiaRelevanceType: IndiaRelevanceType;
  announcedAt: string | null;
  effectiveFrom: string | null;
  observedAt: string;
  responsePath: ProfessionalResponsePath | null;
  sensitiveDataAndCompliance: SensitiveDataAndCompliance;
  evidence: readonly CandidateEvidence[];
  now: Date;
}>;

type DirectReclassificationInput = ReclassificationFacts & Readonly<{
  signalClass: "direct_demand";
  signalType: string;
  expiresAt: string | null;
  assessments: DirectAssessments;
}>;

type PrecursorReclassificationInput = ReclassificationFacts & Readonly<{
  signalClass: "demand_precursor";
  signalType: string;
  assessments: PrecursorAssessments;
}>;

export type GlobalRadarReclassificationInput =
  | DirectReclassificationInput
  | PrecursorReclassificationInput;

export type GlobalRadarReclassificationResult =
  | Readonly<{
      valid: true;
      signalClass: "direct_demand";
      score: Extract<ReturnType<typeof scoreDirectDemand>, { valid: true }>;
      actionabilityInput: number | null;
      responsePathVerified: boolean;
    }>
  | Readonly<{
      valid: true;
      signalClass: "demand_precursor";
      score: Extract<ReturnType<typeof scoreDemandPrecursor>, { valid: true }>;
      actionabilityInput: null;
      responsePathVerified: boolean;
    }>
  | Readonly<{
      valid: false;
      reason: "classification_requirements_not_met" | "invalid_input";
    }>;

function classificationEvidenceInput(input: GlobalRadarReclassificationInput) {
  return {
    proposedSignalClass: input.signalClass,
    observedAt: input.now.toISOString(),
    directDemandAsk:
      input.signalClass === "direct_demand"
        ? {
            type: input.signalType,
            isExplicit: true,
            expiresAt: input.expiresAt,
          }
        : null,
    precursorDevelopmentType:
      input.signalClass === "demand_precursor" ? input.signalType : null,
    evidence: input.evidence,
    momentumMetrics: null,
    responsePath: input.responsePath,
  };
}

export function deriveGlobalRadarReclassification(
  input: GlobalRadarReclassificationInput,
): GlobalRadarReclassificationResult {
  const classification = classifySignal(classificationEvidenceInput(input));
  if (!classification.accepted || classification.signalClass !== input.signalClass) {
    return Object.freeze({
      valid: false,
      reason: "classification_requirements_not_met",
    });
  }
  if (input.signalClass === "direct_demand") {
    const actionabilityInput = input.assessments.actionability;
    const reviewedActionability =
      actionabilityInput === null
        ? null
        : assessComplianceReview({
            currentStatus: input.currentStatus,
            actionability: actionabilityInput,
            assessment: input.sensitiveDataAndCompliance,
          });
    if (reviewedActionability !== null && !reviewedActionability.valid) {
      return Object.freeze({ valid: false, reason: "invalid_input" });
    }
    const anchorAt =
      input.announcedAt ??
      input.effectiveFrom ??
      input.evidence
        .flatMap(({ publishedAt }) =>
          publishedAt === null ? [] : [publishedAt],
        )
        .sort()[0] ??
      input.observedAt;
    const freshness = calculateFreshness(
      { anchorAt },
      { now: () => new Date(input.now.getTime()) },
    );
    if (!freshness.valid) {
      return Object.freeze({ valid: false, reason: "invalid_input" });
    }
    const score = scoreDirectDemand({
      explicitness: classification.gateFacts.explicitCurrentAsk ? 100 : 0,
      evidenceConfidence: classification.gateFacts.evidenceConfidence,
      freshness: freshness.score,
      actionability:
        reviewedActionability === null
          ? null
          : reviewedActionability.actionability,
      indiaFit: globalRadarIndiaFitScore(input.indiaRelevanceType),
      commercialPotential: input.assessments.commercialPotential,
      repeatability: input.assessments.repeatability,
      responseAccessibility: classification.gateFacts.responsePathVerified
        ? 100
        : null,
      strategicLearning: input.assessments.strategicLearning,
      complianceComplexity: input.assessments.complianceComplexity,
    });
    if (!score.valid) {
      return Object.freeze({ valid: false, reason: "invalid_input" });
    }
    return Object.freeze({
      valid: true,
      signalClass: input.signalClass,
      score,
      actionabilityInput,
      responsePathVerified: classification.gateFacts.responsePathVerified,
    });
  }

  const horizon = calculateTimeHorizon(
    { estimatedAt: input.effectiveFrom },
    { now: () => new Date(input.now.getTime()) },
  );
  if (!horizon.valid) {
    return Object.freeze({ valid: false, reason: "invalid_input" });
  }
  const score = scoreDemandPrecursor({
    evidenceConfidence: classification.gateFacts.evidenceConfidence,
    proximityToExternalDemand: input.assessments.proximityToExternalDemand,
    fundingDeploymentMomentum: input.assessments.fundingDeploymentMomentum,
    likelyDataHardwareIntensity:
      input.assessments.likelyDataHardwareIntensity,
    indiaFit: globalRadarIndiaFitScore(input.indiaRelevanceType),
    estimatedTimeHorizon: horizon.score,
    strategicRelevance: input.assessments.strategicRelevance,
  });
  if (!score.valid) {
    return Object.freeze({ valid: false, reason: "invalid_input" });
  }
  return Object.freeze({
    valid: true,
    signalClass: input.signalClass,
    score,
    actionabilityInput: null,
    responsePathVerified: classification.gateFacts.responsePathVerified,
  });
}
