import { z } from "zod";

import {
  fingerprintSchema,
  indiaRelevanceTypes,
  isoTimestampSchema,
} from "./contracts";
import { evidenceClaimSupportsPositiveIndiaPath } from "./india-relevance";
import {
  GLOBAL_RADAR_MOMENTUM_POLICY_VERSION,
  GLOBAL_RADAR_SCORE_VERSION,
} from "./scoring";
import { createGlobalRadarFingerprint } from "./normalization";

export const directDemandWorkerScoredComponents = Object.freeze([
  "actionability",
  "commercialPotential",
  "repeatability",
  "strategicLearning",
  "complianceComplexity",
] as const);

export const precursorWorkerScoredComponents = Object.freeze([
  "proximityToExternalDemand",
  "fundingDeploymentMomentum",
  "likelyDataHardwareIntensity",
  "strategicRelevance",
] as const);

export const momentumWorkerScoredMetrics = Object.freeze([
  "taxonomyConsistency",
  "evidenceQuality",
] as const);

export type DirectDemandWorkerScoredComponent =
  (typeof directDemandWorkerScoredComponents)[number];
export type PrecursorWorkerScoredComponent =
  (typeof precursorWorkerScoredComponents)[number];
export type WorkerScoredComponent =
  | DirectDemandWorkerScoredComponent
  | PrecursorWorkerScoredComponent;
export type WorkerScoredComponentEvidencePath =
  `scoreComponents.${WorkerScoredComponent}`;
export type MomentumWorkerScoredMetric =
  (typeof momentumWorkerScoredMetrics)[number];
export type MomentumWorkerScoredMetricEvidencePath =
  `momentumMetrics.${MomentumWorkerScoredMetric}`;

export const GLOBAL_RADAR_SCORE_EVIDENCE_VERSION =
  "global-radar-score-evidence-v1" as const;
export const GLOBAL_RADAR_ACTIVE_SCORE_SNAPSHOT_VERSION =
  "global-radar-active-score-snapshot-v2" as const;
export const GLOBAL_RADAR_SCORE_INPUT_VERSION =
  "global-radar-score-input-v1" as const;
export const MAX_ACTIVE_SCORE_EVIDENCE_SNAPSHOT_BYTES = 512 * 1_024;
export const MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS = 10;
export const MAX_SCORE_COMPONENT_MATCHED_FIELD_PATHS = 10;
export const GLOBAL_RADAR_MOMENTUM_EVIDENCE_MAXIMUM_AGE_DAYS = 180 as const;
export const EMPTY_MOMENTUM_EVIDENCE_WINDOW_RATIONALE =
  "Server-derived from an empty eligible active evidence window; no source is cited because absence is not affirmative public evidence." as const;

export const directDemandFreshnessEvidencePaths = Object.freeze([
  "signal.announcedAt",
  "signal.effectiveFrom",
  "evidence.publishedAt",
  "evidence.observedAt",
] as const);

export type DirectDemandFreshnessEvidencePath =
  (typeof directDemandFreshnessEvidencePaths)[number];

export const directDemandScoreEvidenceComponents = Object.freeze([
  "demandExplicitness",
  "evidenceConfidence",
  "freshness",
  "actionability",
  "indiaFit",
  "commercialPotential",
  "repeatability",
  "responseAccessibility",
  "strategicLearning",
  "complianceComplexity",
] as const);

export const precursorScoreEvidenceComponents = Object.freeze([
  "evidenceConfidence",
  "proximityToExternalDemand",
  "fundingDeploymentMomentum",
  "likelyDataHardwareIntensity",
  "indiaFit",
  "estimatedTimeHorizon",
  "strategicRelevance",
] as const);

export const momentumScoreEvidenceComponents = Object.freeze([
  "independentEntityCount",
  "primarySourceCount",
  "sourceFamilyCount",
  "volume7Days",
  "volume30Days",
  "volume90Days",
  "independentEntityBreadth",
  "primarySourceDepth",
  "sourceDiversity",
  "weightedVolume",
  "growthVsPreviousPeriod",
  "taxonomyConsistency",
  "evidenceQuality",
] as const);

export type ScoreEvidenceComponent =
  | (typeof directDemandScoreEvidenceComponents)[number]
  | (typeof precursorScoreEvidenceComponents)[number]
  | (typeof momentumScoreEvidenceComponents)[number];
export type ScoreEvidenceBasis =
  | "worker_evidence"
  | "administrator_assessed"
  | "server_derived"
  | "server_adjusted";
export type ScoreAssessmentAuthority = "worker" | "administrator";
export type ScoreAssessmentBasis =
  | "worker_evidence"
  | "administrator_assessed";

export type ScoreEvidenceSource = Readonly<{
  id: string;
  sourceUrl: string;
  sourceName: string;
  evidenceClaim: string;
  contributorEntityId: string | null;
  evidenceConfidence: number;
  publishedAt: string | null;
  observedAt: string;
  isPrimarySource: boolean;
  isSyndicated: boolean;
  sourceFamily: string;
  supportedFieldPaths: readonly string[];
}>;

export type ScoreComponentEvidenceCitation = Readonly<{
  id: string;
  sourceUrl: string;
  sourceName: string;
  matchedFieldPaths: readonly string[];
}>;

export type ScoreComponentEvidenceAssociation = Readonly<{
  component: ScoreEvidenceComponent;
  value: number;
  basis: ScoreEvidenceBasis;
  assessmentBasis: ScoreAssessmentBasis | null;
  inputValue: number | null;
  rationale: string;
  evidence: readonly ScoreComponentEvidenceCitation[];
}>;

export type ActiveScoreEvidenceCitation = Readonly<{
  evidenceFingerprint: string;
  matchedFieldPaths: readonly string[];
}>;

export type ActiveScoreComponentEvidenceAssociation = Readonly<
  Omit<ScoreComponentEvidenceAssociation, "evidence"> & {
    evidence: readonly ActiveScoreEvidenceCitation[];
  }
>;

export type EmptyMomentumEvidenceWindow = Readonly<{
  asOf: string;
  maximumAgeDays: typeof GLOBAL_RADAR_MOMENTUM_EVIDENCE_MAXIMUM_AGE_DAYS;
  eligibleEvidenceCount: 0;
}>;

export type ActiveScoreEvidenceSnapshot = Readonly<{
  snapshotVersion: typeof GLOBAL_RADAR_ACTIVE_SCORE_SNAPSHOT_VERSION;
  evidenceVersion: typeof GLOBAL_RADAR_SCORE_EVIDENCE_VERSION;
  scoreAsOf: string;
  evidenceBoundaryOrdinal: number;
  evidenceSetCount: number;
  evidenceSetDigest: string;
  scoreInputDigest: string;
  signalClass: ScoreEvidenceSignalClass;
  signalType: string;
  indiaRelevanceType: (typeof indiaRelevanceTypes)[number];
  scorePolicyVersion: typeof GLOBAL_RADAR_SCORE_VERSION;
  momentumPolicyVersion: typeof GLOBAL_RADAR_MOMENTUM_POLICY_VERSION | null;
  assessmentAuthority: ScoreAssessmentAuthority;
  emptyMomentumEvidenceWindow?: EmptyMomentumEvidenceWindow;
  componentEvidence: readonly ActiveScoreComponentEvidenceAssociation[];
}>;

export type GlobalRadarScoreInputDigestInput = Readonly<{
  scoreAsOf: string;
  signalClass: ScoreEvidenceSignalClass;
  signalType: string;
  demandDomain: string;
  status: string;
  temporalAnchors: Readonly<{
    announcedAt: string | null;
    effectiveFrom: string | null;
    observedAt: string;
    expiresAt: string | null;
    evergreen: boolean | null;
    reobserveBy: string | null;
  }>;
  responsePath: Readonly<{
    type: string;
    url: string | null;
    businessEmail: string | null;
  }> | null;
  indiaRelevance: Readonly<{
    relevanceType: (typeof indiaRelevanceTypes)[number];
    rationale: string;
    reasons: readonly string[];
    constraints: readonly string[];
    unknowns: readonly string[];
    confidence: number;
    regulatoryFacts: unknown;
    logisticsFacts: unknown;
  }>;
  sensitiveDataAndCompliance: Readonly<{
    sensitiveDataFlags: Readonly<Record<string, unknown>>;
    complianceFacts: Readonly<Record<string, unknown>>;
  }>;
  assessedInputs: Readonly<Record<string, number | null>>;
  contributorRoles: readonly Readonly<{
    entityId: string;
    role: string;
  }>[];
  entityCorporateGroups: readonly Readonly<{
    entityId: string;
    canonicalCorporateGroupId: string | null;
  }>[];
  scorePolicyVersion: typeof GLOBAL_RADAR_SCORE_VERSION;
  momentumPolicyVersion: typeof GLOBAL_RADAR_MOMENTUM_POLICY_VERSION | null;
}>;

export function createGlobalRadarScoreInputDigest(
  input: GlobalRadarScoreInputDigestInput,
): string {
  return createGlobalRadarFingerprint({
    version: GLOBAL_RADAR_SCORE_INPUT_VERSION,
    scoreAsOf: input.scoreAsOf,
    signalClass: input.signalClass,
    signalType: input.signalType,
    demandDomain: input.demandDomain,
    status: input.status,
    temporalAnchors: input.temporalAnchors,
    responsePath: input.responsePath,
    indiaRelevance: {
      ...input.indiaRelevance,
      reasons: [...input.indiaRelevance.reasons].sort(),
      constraints: [...input.indiaRelevance.constraints].sort(),
      unknowns: [...input.indiaRelevance.unknowns].sort(),
    },
    sensitiveDataAndCompliance: input.sensitiveDataAndCompliance,
    assessedInputs: input.assessedInputs,
    contributorRoles: [...input.contributorRoles].sort(
      (left, right) =>
        left.role.localeCompare(right.role) ||
        left.entityId.localeCompare(right.entityId),
    ),
    entityCorporateGroups: [...input.entityCorporateGroups].sort((left, right) =>
      left.entityId.localeCompare(right.entityId),
    ),
    scorePolicyVersion: input.scorePolicyVersion,
    momentumPolicyVersion: input.momentumPolicyVersion,
  });
}

const workerScoredComponentEvidencePaths = new Set<string>([
  ...directDemandWorkerScoredComponents,
  ...precursorWorkerScoredComponents,
].map((component) => `scoreComponents.${component}`));
const momentumWorkerScoredMetricEvidencePaths = new Set<string>(
  momentumWorkerScoredMetrics.map((metric) => `momentumMetrics.${metric}`),
);

export function isWorkerScoredComponentEvidencePath(
  path: string,
): path is WorkerScoredComponentEvidencePath {
  return workerScoredComponentEvidencePaths.has(path);
}

export function isMomentumWorkerScoredMetricEvidencePath(
  path: string,
): path is MomentumWorkerScoredMetricEvidencePath {
  return momentumWorkerScoredMetricEvidencePaths.has(path);
}

type WorkerScoredSignalClass = "direct_demand" | "demand_precursor";
type WorkerScoreComponentValues = Readonly<
  Partial<Record<WorkerScoredComponent, number | null>>
>;
type ScoreEvidence = Readonly<{ supportedFieldPaths: readonly string[] }>;

export function missingWorkerScoredComponentEvidencePaths(input: Readonly<{
  signalClass: WorkerScoredSignalClass;
  scoreComponents: WorkerScoreComponentValues;
  evidence: readonly ScoreEvidence[];
}>): readonly WorkerScoredComponentEvidencePath[] {
  const supportedPaths = new Set(
    input.evidence.flatMap(({ supportedFieldPaths }) => supportedFieldPaths),
  );
  const components =
    input.signalClass === "direct_demand"
      ? directDemandWorkerScoredComponents
      : precursorWorkerScoredComponents;

  return Object.freeze(
    components.flatMap((component) => {
      const value = input.scoreComponents[component];
      if (value === null || value === undefined) return [];
      const path = `scoreComponents.${component}` as const;
      return supportedPaths.has(path) ? [] : [path];
    }),
  );
}

export function missingMomentumWorkerScoredMetricEvidencePaths(input: Readonly<{
  momentumMetrics: Readonly<Record<MomentumWorkerScoredMetric, number>>;
  momentumContributorEntityIds: readonly string[];
  evidence: readonly Readonly<
    ScoreEvidence & {
      contributorEntityId: string | null;
      isSyndicated: boolean;
    }
  >[];
}>): readonly MomentumWorkerScoredMetricEvidencePath[] {
  const contributorEntityIds = new Set(input.momentumContributorEntityIds);
  const supportedPaths = new Set(
    input.evidence.flatMap((item) =>
      isEligibleMomentumContributorEvidence(item, contributorEntityIds)
        ? item.supportedFieldPaths
        : [],
    ),
  );
  return Object.freeze(
    momentumWorkerScoredMetrics.flatMap((metric) => {
      const path = `momentumMetrics.${metric}` as const;
      return supportedPaths.has(path) ? [] : [path];
    }),
  );
}

type ScoreEvidenceSignalClass =
  | "direct_demand"
  | "demand_precursor"
  | "ecosystem_momentum";

type EvidenceSelector = Readonly<{
  expectedBasis: ScoreEvidenceBasis;
  assessmentBasis: ScoreAssessmentBasis | null;
  rationale: string;
  match?(path: string): boolean;
  derivedFieldPath?: string;
  includeSource?(source: ScoreEvidenceSource): boolean;
}>;

export function selectDirectDemandFreshnessEvidencePath(input: Readonly<{
  announcedAt: string | null;
  effectiveFrom: string | null;
  evidence: readonly Readonly<{ publishedAt: string | null }>[];
}>): DirectDemandFreshnessEvidencePath {
  if (input.announcedAt !== null) return "signal.announcedAt";
  if (input.effectiveFrom !== null) return "signal.effectiveFrom";
  return input.evidence.some(({ publishedAt }) => publishedAt !== null)
    ? "evidence.publishedAt"
    : "evidence.observedAt";
}

export function directDemandFreshnessEvidencePathFromSnapshot(
  snapshot: ActiveScoreEvidenceSnapshot,
): DirectDemandFreshnessEvidencePath | null {
  if (snapshot.signalClass !== "direct_demand") return null;
  const freshness = snapshot.componentEvidence.find(
    ({ component }) => component === "freshness",
  );
  if (!freshness || freshness.evidence.length === 0) return null;
  const matchedPaths = new Set(
    freshness.evidence.flatMap(({ matchedFieldPaths }) => matchedFieldPaths),
  );
  if (matchedPaths.size !== 1) return null;
  const [path] = matchedPaths;
  return directDemandFreshnessEvidencePaths.includes(
    path as DirectDemandFreshnessEvidencePath,
  )
    ? (path as DirectDemandFreshnessEvidencePath)
    : null;
}

function derivedMetadataEvidenceSelector(input: Readonly<{
  path: string;
  rationale: string;
  includeSource?(source: ScoreEvidenceSource): boolean;
}>): EvidenceSelector {
  return {
    expectedBasis: "server_derived",
    assessmentBasis: null,
    rationale: input.rationale,
    derivedFieldPath: input.path,
    includeSource: input.includeSource,
  };
}

function assessmentBasis(
  authority: ScoreAssessmentAuthority,
): ScoreAssessmentBasis {
  return authority === "administrator"
    ? "administrator_assessed"
    : "worker_evidence";
}

function assessedEvidenceSelector(
  component: WorkerScoredComponent,
  authority: ScoreAssessmentAuthority,
): EvidenceSelector {
  const path = `scoreComponents.${component}`;
  const basis = assessmentBasis(authority);
  return {
    expectedBasis: basis,
    assessmentBasis: null,
    rationale:
      authority === "administrator"
        ? "Administrator assessment is supported by public evidence cited for this component."
        : "Worker assessment is supported by public evidence cited for this component.",
    match: (candidate) => candidate === path,
  };
}

function adjustedActionabilityEvidenceSelector(
  authority: ScoreAssessmentAuthority,
): EvidenceSelector {
  return {
    expectedBasis: "server_adjusted",
    assessmentBasis: assessmentBasis(authority),
    rationale:
      "Server compliance policy adjusts the evidence-supported actionability assessment.",
    match: (candidate) => candidate === "scoreComponents.actionability",
  };
}

function indiaFitEvidenceSelector(input: Readonly<{
  field: "directDemandAsk" | "precursorDevelopment";
  signalType: string;
  indiaRelevanceType: string;
}>): EvidenceSelector {
  if (input.indiaRelevanceType === "no_current_India_fit") {
    return derivedMetadataEvidenceSelector({
      path: "review.noCurrentIndiaFit",
      rationale:
        "Server-derived from the stored no-current-India-fit assessment state; cited sources identify evidence in the assessment scope and do not prove a negative.",
    });
  }
  return {
    expectedBasis: "server_derived",
    assessmentBasis: null,
    rationale:
      "Server-derived from public evidence supporting the assessed India relevance.",
    match: (path) => path.startsWith(`indiaRelevance.${input.indiaRelevanceType}.`),
  };
}

function directEvidenceSelector(
  component: (typeof directDemandScoreEvidenceComponents)[number],
  signalType: string,
  indiaRelevanceType: string,
  freshnessEvidencePath: DirectDemandFreshnessEvidencePath | undefined,
  authority: ScoreAssessmentAuthority,
): EvidenceSelector {
  if (component === "actionability") {
    return adjustedActionabilityEvidenceSelector(authority);
  }
  if (directDemandWorkerScoredComponents.includes(
    component as DirectDemandWorkerScoredComponent,
  )) {
    return assessedEvidenceSelector(
      component as DirectDemandWorkerScoredComponent,
      authority,
    );
  }
  switch (component) {
    case "demandExplicitness":
      return {
        expectedBasis: "server_derived",
        assessmentBasis: null,
        rationale:
          "Server-derived from public evidence for the classified direct-demand ask.",
        match: (path) => path === `directDemandAsk.${signalType}`,
        includeSource: (source) =>
          source.isPrimarySource ||
          source.sourceFamily === "public_procurement_and_rfp_portals",
      };
    case "evidenceConfidence":
      return derivedMetadataEvidenceSelector({
        path: "evidence.evidenceConfidence",
        rationale:
          "Server-derived from the confidence recorded on each public evidence item.",
      });
    case "freshness": {
      const rationale =
        "Server-derived from the selected signal date or dated public evidence input.";
      if (freshnessEvidencePath === "evidence.publishedAt") {
        return derivedMetadataEvidenceSelector({
          path: freshnessEvidencePath,
          rationale,
          includeSource: ({ publishedAt }) => publishedAt !== null,
        });
      }
      if (freshnessEvidencePath === "evidence.observedAt") {
        return derivedMetadataEvidenceSelector({
          path: freshnessEvidencePath,
          rationale,
        });
      }
      return {
        expectedBasis: "server_derived",
        assessmentBasis: null,
        rationale,
        match: (path) => path === freshnessEvidencePath,
      };
    }
    case "indiaFit":
      return indiaFitEvidenceSelector({
        field: "directDemandAsk",
        signalType,
        indiaRelevanceType,
      });
    case "responseAccessibility":
      return {
        expectedBasis: "server_derived",
        assessmentBasis: null,
        rationale:
          "Server-derived from a publicly evidenced professional response path.",
        match: (path) =>
          ["responsePath", "professionalResponsePath", "publicResponsePath"].includes(
            path,
          ),
        includeSource: (source) => source.isPrimarySource,
      };
  }
  throw new Error(`Unsupported direct score component: ${component}`);
}

function precursorEvidenceSelector(
  component: (typeof precursorScoreEvidenceComponents)[number],
  signalType: string,
  indiaRelevanceType: string,
  authority: ScoreAssessmentAuthority,
): EvidenceSelector {
  if (precursorWorkerScoredComponents.includes(
    component as PrecursorWorkerScoredComponent,
  )) {
    return assessedEvidenceSelector(
      component as PrecursorWorkerScoredComponent,
      authority,
    );
  }
  switch (component) {
    case "evidenceConfidence":
      return derivedMetadataEvidenceSelector({
        path: "evidence.evidenceConfidence",
        rationale:
          "Server-derived from the confidence recorded on each public evidence item.",
      });
    case "indiaFit":
      return indiaFitEvidenceSelector({
        field: "precursorDevelopment",
        signalType,
        indiaRelevanceType,
      });
    case "estimatedTimeHorizon":
      return {
        expectedBasis: "server_derived",
        assessmentBasis: null,
        rationale:
          "Server-derived from the cited effective date or the dated public evidence record.",
        match: (path) => path === "signal.effectiveFrom",
      };
  }
  throw new Error(`Unsupported precursor score component: ${component}`);
}

function momentumEvidenceSelector(
  component: (typeof momentumScoreEvidenceComponents)[number],
  contributorEntityIds: ReadonlySet<string>,
  authority: ScoreAssessmentAuthority,
): EvidenceSelector {
  if (
    component === "taxonomyConsistency" ||
    component === "evidenceQuality"
  ) {
    const path = `momentumMetrics.${component}`;
    return {
      expectedBasis: assessmentBasis(authority),
      assessmentBasis: null,
      rationale:
        authority === "administrator"
          ? "Administrator metric is supported by public evidence cited for this momentum input."
          : "Worker metric is supported by public evidence cited for this momentum input.",
      match: (candidate) => candidate === path,
      includeSource: (source) =>
        isEligibleMomentumContributorEvidence(
          source,
          contributorEntityIds,
        ),
    };
  }
  const path =
    component === "independentEntityCount" ||
    component === "independentEntityBreadth"
      ? "evidence.contributorEntityId"
      : component === "primarySourceCount" || component === "primarySourceDepth"
        ? "evidence.isPrimarySource"
        : component === "sourceFamilyCount" || component === "sourceDiversity"
          ? "evidence.sourceFamily"
          : "evidence.observedAt";
  return derivedMetadataEvidenceSelector({
    path,
    rationale:
      "Server-derived from this metadata on non-syndicated contributor evidence and the versioned momentum policy.",
    includeSource: (source) =>
      isEligibleMomentumContributorEvidence(
        source,
        contributorEntityIds,
      ),
  });
}

function isEligibleMomentumContributorEvidence(
  source: Readonly<{
    contributorEntityId: string | null;
    isSyndicated: boolean;
  }>,
  contributorEntityIds: ReadonlySet<string>,
): boolean {
  return (
    !source.isSyndicated &&
    source.contributorEntityId !== null &&
    contributorEntityIds.has(source.contributorEntityId)
  );
}

function componentNamesForClass(
  signalClass: ScoreEvidenceSignalClass,
): readonly ScoreEvidenceComponent[] {
  if (signalClass === "direct_demand") {
    return directDemandScoreEvidenceComponents;
  }
  if (signalClass === "demand_precursor") {
    return precursorScoreEvidenceComponents;
  }
  return momentumScoreEvidenceComponents;
}

function selectorForComponent(
  signalClass: ScoreEvidenceSignalClass,
  component: ScoreEvidenceComponent,
  signalType: string,
  indiaRelevanceType: string,
  momentumContributorEntityIds: readonly string[],
  freshnessEvidencePath: DirectDemandFreshnessEvidencePath | undefined,
  authority: ScoreAssessmentAuthority,
): EvidenceSelector {
  if (signalClass === "direct_demand") {
    return directEvidenceSelector(
      component as (typeof directDemandScoreEvidenceComponents)[number],
      signalType,
      indiaRelevanceType,
      freshnessEvidencePath,
      authority,
    );
  }
  if (signalClass === "demand_precursor") {
    return precursorEvidenceSelector(
      component as (typeof precursorScoreEvidenceComponents)[number],
      signalType,
      indiaRelevanceType,
      authority,
    );
  }
  return momentumEvidenceSelector(
    component as (typeof momentumScoreEvidenceComponents)[number],
    new Set(momentumContributorEntityIds),
    authority,
  );
}

function selectedCitations(
  selector: EvidenceSelector,
  evidence: readonly ScoreEvidenceSource[],
): readonly ScoreComponentEvidenceCitation[] {
  const directlyMatched = evidence.flatMap((source) => {
    if (selector.includeSource && !selector.includeSource(source)) return [];
    const matchedFieldPaths = selector.derivedFieldPath
      ? [selector.derivedFieldPath]
      : semanticallySupportedScoreEvidencePaths(source)
          .filter((path) => selector.match?.(path) === true)
          .slice(0, MAX_SCORE_COMPONENT_MATCHED_FIELD_PATHS);
    return matchedFieldPaths.length > 0
      ? [{ source, matchedFieldPaths }]
      : [];
  });
  return Object.freeze(
    directlyMatched
      .slice(0, MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS)
      .map(({ source, matchedFieldPaths }) =>
        Object.freeze({
          id: source.id,
          sourceUrl: source.sourceUrl,
          sourceName: source.sourceName,
          matchedFieldPaths: Object.freeze([...matchedFieldPaths]),
        }),
      ),
  );
}

function semanticallySupportedScoreEvidencePaths(
  source: ScoreEvidenceSource,
): readonly string[] {
  return source.supportedFieldPaths.filter(
    (supportedFieldPath) =>
      !supportedFieldPath.startsWith("indiaRelevance.") ||
      supportedFieldPath.startsWith(
        "indiaRelevance.no_current_India_fit.",
      ) ||
      evidenceClaimSupportsPositiveIndiaPath({
        supportedFieldPath,
        evidenceClaim: source.evidenceClaim,
      }),
  );
}

const deterministicMomentumScoreEvidenceComponents = Object.freeze(
  momentumScoreEvidenceComponents.filter(
    (component) =>
      component !== "taxonomyConsistency" && component !== "evidenceQuality",
  ),
);
const deterministicMomentumScoreEvidenceComponentSet = new Set<
  ScoreEvidenceComponent
>(deterministicMomentumScoreEvidenceComponents);

function isDeterministicMomentumScoreEvidenceComponent(
  component: ScoreEvidenceComponent,
): boolean {
  return deterministicMomentumScoreEvidenceComponentSet.has(component);
}

function isCitationFreeEmptyMomentumAssociation(
  association: Readonly<{
    component: ScoreEvidenceComponent;
    value: number;
    basis: ScoreEvidenceBasis;
    assessmentBasis: ScoreAssessmentBasis | null;
    inputValue: number | null;
    rationale: string;
    evidence: readonly unknown[];
  }>,
): boolean {
  return (
    isDeterministicMomentumScoreEvidenceComponent(association.component) &&
    association.value === 0 &&
    association.basis === "server_derived" &&
    association.assessmentBasis === null &&
    association.inputValue === null &&
    association.rationale === EMPTY_MOMENTUM_EVIDENCE_WINDOW_RATIONALE &&
    association.evidence.length === 0
  );
}

function hasCompleteZeroDeterministicMomentumComponents(
  components: Readonly<Record<string, unknown>>,
): boolean {
  return deterministicMomentumScoreEvidenceComponents.every(
    (component) => components[component] === 0,
  );
}

function hasExactCitationFreeEmptyMomentumAssociations(
  componentEvidence: readonly ActiveScoreComponentEvidenceAssociation[],
): boolean {
  const emptyAssociations = componentEvidence.filter(
    ({ evidence }) => evidence.length === 0,
  );
  return (
    emptyAssociations.length ===
      deterministicMomentumScoreEvidenceComponents.length &&
    deterministicMomentumScoreEvidenceComponents.every((component) => {
      const association = componentEvidence.find(
        (candidate) => candidate.component === component,
      );
      return association
        ? isCitationFreeEmptyMomentumAssociation(association)
        : false;
    })
  );
}

export function deriveScoreComponentEvidenceAssociations(input: Readonly<{
  signalClass: ScoreEvidenceSignalClass;
  signalType: string;
  indiaRelevanceType: string;
  assessmentAuthority?: ScoreAssessmentAuthority;
  actionabilityInput?: number | null;
  momentumContributorEntityIds?: readonly string[];
  freshnessEvidencePath?: DirectDemandFreshnessEvidencePath;
  components: Readonly<Record<string, unknown>>;
  evidence: readonly ScoreEvidenceSource[];
  emptyMomentumEvidenceWindow?: EmptyMomentumEvidenceWindow;
}>): readonly ScoreComponentEvidenceAssociation[] {
  if (
    input.emptyMomentumEvidenceWindow !== undefined &&
    (input.signalClass !== "ecosystem_momentum" ||
      input.evidence.length !== 0 ||
      !hasCompleteZeroDeterministicMomentumComponents(input.components))
  ) {
    throw new Error("Invalid empty Global Radar momentum evidence window.");
  }
  return Object.freeze(
    componentNamesForClass(input.signalClass).flatMap((component) => {
      const value = input.components[component];
      if (typeof value !== "number" || !Number.isFinite(value)) return [];
      const selector = selectorForComponent(
        input.signalClass,
        component,
        input.signalType,
        input.indiaRelevanceType,
        input.momentumContributorEntityIds ?? [],
        input.freshnessEvidencePath,
        input.assessmentAuthority ?? "worker",
      );
      const evidence = selectedCitations(selector, input.evidence);
      if (evidence.length === 0) {
        if (
          input.emptyMomentumEvidenceWindow !== undefined &&
          isDeterministicMomentumScoreEvidenceComponent(component) &&
          value === 0
        ) {
          return [
            Object.freeze({
              component,
              value,
              basis: "server_derived" as const,
              assessmentBasis: null,
              inputValue: null,
              rationale: EMPTY_MOMENTUM_EVIDENCE_WINDOW_RATIONALE,
              evidence,
            }),
          ];
        }
        throw new Error(
          `Missing public evidence association for active score component: ${component}`,
        );
      }
      return [
        Object.freeze({
          component,
          value,
          basis: selector.expectedBasis,
          assessmentBasis: selector.assessmentBasis,
          inputValue:
            component === "actionability"
              ? (input.actionabilityInput ?? value)
              : null,
          rationale: selector.rationale,
          evidence,
        }),
      ];
    }),
  );
}

export function hasCompleteScoreComponentEvidenceAssociations(
  input: Readonly<{
    signalClass: ScoreEvidenceSignalClass;
    signalType: string;
    indiaRelevanceType: string;
    momentumContributorEntityIds?: readonly string[];
    freshnessEvidencePath?: DirectDemandFreshnessEvidencePath;
    assessmentAuthority?: ScoreAssessmentAuthority;
    components: Readonly<Record<string, unknown>>;
    evidence: readonly ScoreEvidenceSource[];
  }>,
): boolean {
  return componentNamesForClass(input.signalClass).every((component) => {
    const value = input.components[component];
    if (typeof value !== "number" || !Number.isFinite(value)) return true;
    return selectedCitations(
      selectorForComponent(
        input.signalClass,
        component,
        input.signalType,
        input.indiaRelevanceType,
        input.momentumContributorEntityIds ?? [],
        input.freshnessEvidencePath,
        input.assessmentAuthority ?? "worker",
      ),
      input.evidence,
    ).length > 0;
  });
}

export function hasValidActiveScoreEvidenceCitations(input: Readonly<{
  snapshot: ActiveScoreEvidenceSnapshot;
  signalType: string;
  indiaRelevanceType: string;
  actionabilityInput?: number | null;
  momentumContributorEntityIds?: readonly string[];
  freshnessEvidencePath?: DirectDemandFreshnessEvidencePath;
  evidence: readonly ScoreEvidenceSource[];
}>): boolean {
  if (
    input.snapshot.signalType !== input.signalType ||
    input.snapshot.indiaRelevanceType !== input.indiaRelevanceType
  ) {
    return false;
  }
  if (input.snapshot.signalClass === "direct_demand") {
    const actionability = input.snapshot.componentEvidence.find(
      ({ component }) => component === "actionability",
    );
    if (
      input.actionabilityInput !== undefined &&
      (actionability?.inputValue ?? null) !== input.actionabilityInput
    ) {
      return false;
    }
  }
  const evidenceByFingerprint = new Map(
    input.evidence.map((source) => [source.id, source]),
  );
  if (evidenceByFingerprint.size !== input.evidence.length) return false;
  const emptyMomentumEvidenceWindow =
    input.snapshot.emptyMomentumEvidenceWindow;
  if (emptyMomentumEvidenceWindow !== undefined) {
    if (
      input.snapshot.signalClass !== "ecosystem_momentum" ||
      !hasExactCitationFreeEmptyMomentumAssociations(
        input.snapshot.componentEvidence,
      )
    ) {
      return false;
    }
    const asOf = Date.parse(emptyMomentumEvidenceWindow.asOf);
    const cutoff =
      asOf -
      emptyMomentumEvidenceWindow.maximumAgeDays * 24 * 60 * 60 * 1_000;
    const contributorEntityIds = new Set(
      input.momentumContributorEntityIds ?? [],
    );
    if (
      !Number.isFinite(asOf) ||
      input.evidence.some((source) => {
        if (
          !isEligibleMomentumContributorEvidence(
            source,
            contributorEntityIds,
          )
        ) {
          return false;
        }
        const observedAt = Date.parse(source.observedAt);
        return (
          Number.isFinite(observedAt) &&
          observedAt >= cutoff &&
          observedAt <= asOf
        );
      })
    ) {
      return false;
    }
  } else if (
    input.snapshot.componentEvidence.some(
      ({ evidence }) => evidence.length === 0,
    )
  ) {
    return false;
  }
  return input.snapshot.componentEvidence.every((association) => {
    if (association.evidence.length === 0) {
      return (
        emptyMomentumEvidenceWindow !== undefined &&
        isCitationFreeEmptyMomentumAssociation(association)
      );
    }
    const selector = selectorForComponent(
      input.snapshot.signalClass,
      association.component,
      input.signalType,
      input.indiaRelevanceType,
      input.momentumContributorEntityIds ?? [],
      input.freshnessEvidencePath,
      input.snapshot.assessmentAuthority,
    );
    if (
      association.basis !== selector.expectedBasis ||
      association.assessmentBasis !== selector.assessmentBasis ||
      association.rationale !== selector.rationale
    ) {
      return false;
    }
    return association.evidence.every((citation) => {
      const source = evidenceByFingerprint.get(citation.evidenceFingerprint);
      if (!source || (selector.includeSource && !selector.includeSource(source))) {
        return false;
      }
      if (selector.derivedFieldPath) {
        return (
          citation.matchedFieldPaths.length === 1 &&
          citation.matchedFieldPaths[0] === selector.derivedFieldPath
        );
      }
      const expectedMatchedFieldPaths = semanticallySupportedScoreEvidencePaths(
        source,
      )
        .filter((path) => selector.match?.(path) === true)
        .slice(0, MAX_SCORE_COMPONENT_MATCHED_FIELD_PATHS);
      return (
        citation.matchedFieldPaths.length === expectedMatchedFieldPaths.length &&
        citation.matchedFieldPaths.every(
          (path, index) => path === expectedMatchedFieldPaths[index],
        )
      );
    });
  });
}

const activeScoreComponentSchema = z.enum([
  "demandExplicitness",
  "evidenceConfidence",
  "freshness",
  "actionability",
  "indiaFit",
  "commercialPotential",
  "repeatability",
  "responseAccessibility",
  "strategicLearning",
  "complianceComplexity",
  "proximityToExternalDemand",
  "fundingDeploymentMomentum",
  "likelyDataHardwareIntensity",
  "estimatedTimeHorizon",
  "strategicRelevance",
  "independentEntityCount",
  "primarySourceCount",
  "sourceFamilyCount",
  "volume7Days",
  "volume30Days",
  "volume90Days",
  "independentEntityBreadth",
  "primarySourceDepth",
  "sourceDiversity",
  "weightedVolume",
  "growthVsPreviousPeriod",
  "taxonomyConsistency",
  "evidenceQuality",
]);
const scoreEvidenceBasisSchema = z.enum([
  "worker_evidence",
  "administrator_assessed",
  "server_derived",
  "server_adjusted",
]);
const scoreAssessmentBasisSchema = z.enum([
  "worker_evidence",
  "administrator_assessed",
]);
const matchedFieldPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)*$/);
const activeScoreEvidenceCitationSchema = z.strictObject({
  evidenceFingerprint: fingerprintSchema,
  matchedFieldPaths: z
    .array(matchedFieldPathSchema)
    .min(1)
    .max(MAX_SCORE_COMPONENT_MATCHED_FIELD_PATHS),
}).superRefine((citation, context) => {
  if (
    new Set(citation.matchedFieldPaths).size !==
    citation.matchedFieldPaths.length
  ) {
    context.addIssue({
      code: "custom",
      message: "Matched score-evidence paths must be unique.",
      path: ["matchedFieldPaths"],
    });
  }
});
const rawMomentumCountComponents = new Set<ScoreEvidenceComponent>([
  "independentEntityCount",
  "primarySourceCount",
  "sourceFamilyCount",
  "volume7Days",
  "volume30Days",
  "volume90Days",
]);
const administratorOrWorkerAssessedComponents = new Set<ScoreEvidenceComponent>([
  ...directDemandWorkerScoredComponents.filter(
    (component) => component !== "actionability",
  ),
  ...precursorWorkerScoredComponents,
  ...momentumWorkerScoredMetrics,
]);
const activeScoreComponentEvidenceAssociationSchema = z
  .strictObject({
    component: activeScoreComponentSchema,
    value: z.number().int().min(0),
    basis: scoreEvidenceBasisSchema,
    assessmentBasis: scoreAssessmentBasisSchema.nullable(),
    inputValue: z.number().int().min(0).max(100).nullable(),
    rationale: z.string().trim().min(1).max(500),
    evidence: z
      .array(activeScoreEvidenceCitationSchema)
      .max(MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS),
  })
  .superRefine((association, context) => {
    if (
      association.evidence.length === 0 &&
      !isCitationFreeEmptyMomentumAssociation(association)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Citation-free score evidence is limited to an exact empty momentum window.",
        path: ["evidence"],
      });
    }
    if (
      !rawMomentumCountComponents.has(association.component) &&
      association.value > 100
    ) {
      context.addIssue({
        code: "custom",
        message: "Normalized score components must be between zero and one hundred.",
        path: ["value"],
      });
    }
    if (association.component === "actionability") {
      if (
        association.basis !== "server_adjusted" ||
        association.assessmentBasis === null ||
        association.inputValue === null
      ) {
        context.addIssue({
          code: "custom",
          message: "Adjusted actionability requires its assessment origin and input.",
        });
      }
    } else if (
      association.assessmentBasis !== null ||
      association.inputValue !== null
    ) {
      context.addIssue({
        code: "custom",
        message: "Only adjusted actionability may retain assessment input metadata.",
      });
    }
    if (
      administratorOrWorkerAssessedComponents.has(association.component) &&
      association.basis !== "worker_evidence" &&
      association.basis !== "administrator_assessed"
    ) {
      context.addIssue({
        code: "custom",
        message: "Assessed components require a truthful assessment basis.",
        path: ["basis"],
      });
    }
    if (
      association.component !== "actionability" &&
      !administratorOrWorkerAssessedComponents.has(association.component) &&
      association.basis !== "server_derived"
    ) {
      context.addIssue({
        code: "custom",
        message: "Deterministic components must be server-derived.",
        path: ["basis"],
      });
    }
    const fingerprints = association.evidence.map(
      ({ evidenceFingerprint }) => evidenceFingerprint,
    );
    if (new Set(fingerprints).size !== fingerprints.length) {
      context.addIssue({
        code: "custom",
        message: "Score evidence citations must be unique per component.",
        path: ["evidence"],
      });
    }
  });

const emptyMomentumEvidenceWindowSchema = z.strictObject({
  asOf: isoTimestampSchema,
  maximumAgeDays: z.literal(
    GLOBAL_RADAR_MOMENTUM_EVIDENCE_MAXIMUM_AGE_DAYS,
  ),
  eligibleEvidenceCount: z.literal(0),
});

export const activeScoreEvidenceSnapshotSchema = z
  .strictObject({
    snapshotVersion: z.literal(GLOBAL_RADAR_ACTIVE_SCORE_SNAPSHOT_VERSION),
    evidenceVersion: z.literal(GLOBAL_RADAR_SCORE_EVIDENCE_VERSION),
    scoreAsOf: isoTimestampSchema,
    evidenceBoundaryOrdinal: z.number().int().positive(),
    evidenceSetCount: z.number().int().positive(),
    evidenceSetDigest: fingerprintSchema,
    scoreInputDigest: fingerprintSchema,
    signalClass: z.enum([
      "direct_demand",
      "demand_precursor",
      "ecosystem_momentum",
    ]),
    signalType: z.string().trim().min(1).max(200),
    indiaRelevanceType: z.enum(indiaRelevanceTypes),
    scorePolicyVersion: z.literal(GLOBAL_RADAR_SCORE_VERSION),
    momentumPolicyVersion: z
      .literal(GLOBAL_RADAR_MOMENTUM_POLICY_VERSION)
      .nullable(),
    assessmentAuthority: z.enum(["worker", "administrator"]),
    emptyMomentumEvidenceWindow:
      emptyMomentumEvidenceWindowSchema.optional(),
    componentEvidence: z
      .array(activeScoreComponentEvidenceAssociationSchema)
      .min(1)
      .max(momentumScoreEvidenceComponents.length),
  })
  .superRefine((snapshot, context) => {
    const momentum = snapshot.signalClass === "ecosystem_momentum";
    if (momentum !== (snapshot.momentumPolicyVersion !== null)) {
      context.addIssue({
        code: "custom",
        message: "Only momentum snapshots carry a momentum policy version.",
        path: ["momentumPolicyVersion"],
      });
    }
    const hasCitationFreeAssociation = snapshot.componentEvidence.some(
      ({ evidence }) => evidence.length === 0,
    );
    if (snapshot.emptyMomentumEvidenceWindow === undefined) {
      if (hasCitationFreeAssociation) {
        context.addIssue({
          code: "custom",
          message:
            "Citation-free momentum evidence requires a persisted empty-window proof.",
          path: ["componentEvidence"],
        });
      }
    } else {
      const assessedComponents = new Set(
        snapshot.componentEvidence.flatMap((association) =>
          association.component === "taxonomyConsistency" ||
          association.component === "evidenceQuality"
            ? [association.component]
            : [],
        ),
      );
      if (
        !momentum ||
        !hasExactCitationFreeEmptyMomentumAssociations(
          snapshot.componentEvidence,
        ) ||
        assessedComponents.size !== momentumWorkerScoredMetrics.length
      ) {
        context.addIssue({
          code: "custom",
          message:
            "Empty momentum evidence-window proof must cover every deterministic zero component while preserving assessed citations.",
          path: ["emptyMomentumEvidenceWindow"],
        });
      }
    }
    const expectedAssessmentBasis =
      snapshot.assessmentAuthority === "administrator"
        ? "administrator_assessed"
        : "worker_evidence";
    snapshot.componentEvidence.forEach((association, index) => {
      const actualAssessmentBasis =
        association.component === "actionability"
          ? association.assessmentBasis
          : association.basis === "administrator_assessed" ||
              association.basis === "worker_evidence"
            ? association.basis
            : null;
      if (
        actualAssessmentBasis !== null &&
        actualAssessmentBasis !== expectedAssessmentBasis
      ) {
        context.addIssue({
          code: "custom",
          message: "Score assessment origin must agree with the snapshot authority.",
          path: ["componentEvidence", index],
        });
      }
    });
  });

type ActiveScoreSnapshotExpectation = Readonly<{
  signalClass: ScoreEvidenceSignalClass;
  signalType: string;
  indiaRelevanceType: (typeof indiaRelevanceTypes)[number];
  scorePolicyVersion: typeof GLOBAL_RADAR_SCORE_VERSION;
  momentumPolicyVersion: typeof GLOBAL_RADAR_MOMENTUM_POLICY_VERSION | null;
  scoreInputDigest?: string;
  components: Readonly<Record<string, unknown>>;
}>;

function serializedJsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function expectedActiveComponentValues(
  signalClass: ScoreEvidenceSignalClass,
  components: Readonly<Record<string, unknown>>,
): readonly Readonly<{ component: ScoreEvidenceComponent; value: number }>[] {
  return componentNamesForClass(signalClass).flatMap((component) => {
    const value = components[component];
    return typeof value === "number" && Number.isFinite(value)
      ? [{ component, value }]
      : [];
  });
}

function freezeActiveScoreEvidenceSnapshot(
  snapshot: z.output<typeof activeScoreEvidenceSnapshotSchema>,
): ActiveScoreEvidenceSnapshot {
  const componentEvidence = snapshot.componentEvidence.map((association) =>
    Object.freeze({
      ...association,
      evidence: Object.freeze(
        association.evidence.map((citation) =>
          Object.freeze({
            ...citation,
            matchedFieldPaths: Object.freeze([...citation.matchedFieldPaths]),
          }),
        ),
      ),
    }),
  );
  return Object.freeze({
    ...snapshot,
    componentEvidence: Object.freeze(componentEvidence),
  });
}

export function parseActiveScoreEvidenceSnapshot(
  value: unknown,
  expected: ActiveScoreSnapshotExpectation,
): ActiveScoreEvidenceSnapshot | null {
  if (serializedJsonByteLength(value) > MAX_ACTIVE_SCORE_EVIDENCE_SNAPSHOT_BYTES) {
    return null;
  }
  const parsed = activeScoreEvidenceSnapshotSchema.safeParse(value);
  if (!parsed.success) return null;
  if (
    parsed.data.signalClass !== expected.signalClass ||
    parsed.data.signalType !== expected.signalType ||
    parsed.data.indiaRelevanceType !== expected.indiaRelevanceType ||
    parsed.data.scorePolicyVersion !== expected.scorePolicyVersion ||
    parsed.data.momentumPolicyVersion !== expected.momentumPolicyVersion ||
    (expected.scoreInputDigest !== undefined &&
      parsed.data.scoreInputDigest !== expected.scoreInputDigest)
  ) {
    return null;
  }
  const expectedComponents = expectedActiveComponentValues(
    expected.signalClass,
    expected.components,
  );
  if (
    expectedComponents.length !== parsed.data.componentEvidence.length ||
    expectedComponents.some(
      ({ component, value }, index) =>
        parsed.data.componentEvidence[index]?.component !== component ||
        parsed.data.componentEvidence[index]?.value !== value,
    )
  ) {
    return null;
  }
  return freezeActiveScoreEvidenceSnapshot(parsed.data);
}

export function createActiveScoreEvidenceSnapshotFromAssociations(
  input: Readonly<{
    scoreAsOf: string;
    evidenceBoundaryOrdinal: number;
    evidenceSetCount: number;
    evidenceSetDigest: string;
    scoreInputDigest: string;
    signalClass: ScoreEvidenceSignalClass;
    signalType: string;
    indiaRelevanceType: (typeof indiaRelevanceTypes)[number];
    scorePolicyVersion: typeof GLOBAL_RADAR_SCORE_VERSION;
    momentumPolicyVersion:
      | typeof GLOBAL_RADAR_MOMENTUM_POLICY_VERSION
      | null;
    assessmentAuthority: ScoreAssessmentAuthority;
    emptyMomentumEvidenceWindow?: EmptyMomentumEvidenceWindow;
    actionabilityInput?: number | null;
    momentumContributorEntityIds?: readonly string[];
    freshnessEvidencePath?: DirectDemandFreshnessEvidencePath;
    components: Readonly<Record<string, unknown>>;
    componentEvidence: readonly ActiveScoreComponentEvidenceAssociation[];
    evidence: readonly ScoreEvidenceSource[];
  }>,
): ActiveScoreEvidenceSnapshot {
  const expectedComponents = expectedActiveComponentValues(
    input.signalClass,
    input.components,
  );
  const associationByComponent = new Map(
    input.componentEvidence.map((association) => [
      association.component,
      association,
    ]),
  );
  if (
    associationByComponent.size !== input.componentEvidence.length ||
    associationByComponent.size !== expectedComponents.length
  ) {
    throw new Error("Invalid active Global Radar score-evidence associations.");
  }
  const componentEvidence = expectedComponents.map(({ component, value }) => {
    const association = associationByComponent.get(component);
    if (!association || association.value !== value) {
      throw new Error(
        `Missing active Global Radar score-evidence association: ${component}`,
      );
    }
    return {
      ...association,
      evidence: association.evidence.map((citation) => ({
        ...citation,
        matchedFieldPaths: [...citation.matchedFieldPaths],
      })),
    };
  });
  const snapshot = {
    snapshotVersion: GLOBAL_RADAR_ACTIVE_SCORE_SNAPSHOT_VERSION,
    evidenceVersion: GLOBAL_RADAR_SCORE_EVIDENCE_VERSION,
    scoreAsOf: input.scoreAsOf,
    evidenceBoundaryOrdinal: input.evidenceBoundaryOrdinal,
    evidenceSetCount: input.evidenceSetCount,
    evidenceSetDigest: input.evidenceSetDigest,
    scoreInputDigest: input.scoreInputDigest,
    signalClass: input.signalClass,
    signalType: input.signalType,
    indiaRelevanceType: input.indiaRelevanceType,
    scorePolicyVersion: input.scorePolicyVersion,
    momentumPolicyVersion: input.momentumPolicyVersion,
    assessmentAuthority: input.assessmentAuthority,
    ...(input.emptyMomentumEvidenceWindow === undefined
      ? {}
      : {
          emptyMomentumEvidenceWindow: {
            ...input.emptyMomentumEvidenceWindow,
          },
        }),
    componentEvidence,
  };
  const parsed = parseActiveScoreEvidenceSnapshot(snapshot, {
    signalClass: input.signalClass,
    signalType: input.signalType,
    indiaRelevanceType: input.indiaRelevanceType,
    scorePolicyVersion: input.scorePolicyVersion,
    momentumPolicyVersion: input.momentumPolicyVersion,
    scoreInputDigest: input.scoreInputDigest,
    components: input.components,
  });
  if (!parsed) {
    throw new Error("Invalid active Global Radar score-evidence snapshot.");
  }
  if (
    !hasValidActiveScoreEvidenceCitations({
      snapshot: parsed,
      signalType: input.signalType,
      indiaRelevanceType: input.indiaRelevanceType,
      actionabilityInput: input.actionabilityInput,
      momentumContributorEntityIds: input.momentumContributorEntityIds,
      freshnessEvidencePath: input.freshnessEvidencePath,
      evidence: input.evidence,
    })
  ) {
    throw new Error("Invalid active Global Radar score-evidence citations.");
  }
  return parsed;
}

export function createActiveScoreEvidenceSnapshot(input: Readonly<{
  scoreAsOf: string;
  evidenceBoundaryOrdinal: number;
  evidenceSetCount: number;
  evidenceSetDigest: string;
  scoreInputDigest: string;
  signalClass: ScoreEvidenceSignalClass;
  signalType: string;
  indiaRelevanceType: (typeof indiaRelevanceTypes)[number];
  scorePolicyVersion: typeof GLOBAL_RADAR_SCORE_VERSION;
  momentumPolicyVersion: typeof GLOBAL_RADAR_MOMENTUM_POLICY_VERSION | null;
  assessmentAuthority: ScoreAssessmentAuthority;
  actionabilityInput: number | null;
  momentumContributorEntityIds?: readonly string[];
  freshnessEvidencePath?: DirectDemandFreshnessEvidencePath;
  components: Readonly<Record<string, unknown>>;
  evidence: readonly ScoreEvidenceSource[];
}>): ActiveScoreEvidenceSnapshot {
  const componentEvidence = deriveScoreComponentEvidenceAssociations({
    signalClass: input.signalClass,
    signalType: input.signalType,
    indiaRelevanceType: input.indiaRelevanceType,
    assessmentAuthority: input.assessmentAuthority,
    actionabilityInput: input.actionabilityInput,
    momentumContributorEntityIds: input.momentumContributorEntityIds,
    freshnessEvidencePath: input.freshnessEvidencePath,
    components: input.components,
    evidence: input.evidence,
  }).map((association) => ({
    ...association,
    evidence: association.evidence.map(({ id, matchedFieldPaths }) => ({
      evidenceFingerprint: id,
      matchedFieldPaths: [...matchedFieldPaths],
    })),
  }));
  return createActiveScoreEvidenceSnapshotFromAssociations({
    scoreAsOf: input.scoreAsOf,
    evidenceBoundaryOrdinal: input.evidenceBoundaryOrdinal,
    evidenceSetCount: input.evidenceSetCount,
    evidenceSetDigest: input.evidenceSetDigest,
    scoreInputDigest: input.scoreInputDigest,
    signalClass: input.signalClass,
    signalType: input.signalType,
    indiaRelevanceType: input.indiaRelevanceType,
    scorePolicyVersion: input.scorePolicyVersion,
    momentumPolicyVersion: input.momentumPolicyVersion,
    assessmentAuthority: input.assessmentAuthority,
    actionabilityInput: input.actionabilityInput,
    momentumContributorEntityIds: input.momentumContributorEntityIds,
    freshnessEvidencePath: input.freshnessEvidencePath,
    components: input.components,
    componentEvidence,
    evidence: input.evidence,
  });
}
