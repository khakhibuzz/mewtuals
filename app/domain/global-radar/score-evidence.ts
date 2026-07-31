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
export const MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS = 10;
export const MAX_SCORE_COMPONENT_MATCHED_FIELD_PATHS = 10;

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
  | "server_derived";

export type ScoreEvidenceSource = Readonly<{
  id: string;
  sourceUrl: string;
  sourceName: string;
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
  rationale: string;
  evidence: readonly ScoreComponentEvidenceCitation[];
}>;

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
  evidence: readonly ScoreEvidence[];
}>): readonly MomentumWorkerScoredMetricEvidencePath[] {
  const supportedPaths = new Set(
    input.evidence.flatMap(({ supportedFieldPaths }) => supportedFieldPaths),
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

function derivedMetadataEvidenceSelector(input: Readonly<{
  path: string;
  rationale: string;
  includeSource?(source: ScoreEvidenceSource): boolean;
}>): EvidenceSelector {
  return {
    expectedBasis: "server_derived",
    rationale: input.rationale,
    derivedFieldPath: input.path,
    includeSource: input.includeSource,
  };
}

function workerEvidenceSelector(component: WorkerScoredComponent): EvidenceSelector {
  const path = `scoreComponents.${component}`;
  return {
    expectedBasis: "worker_evidence",
    rationale:
      "Worker score is supported by public evidence cited for this component.",
    match: (candidate) => candidate === path,
  };
}

function indiaFitEvidenceSelector(input: Readonly<{
  field: "directDemandAsk" | "precursorDevelopment";
  signalType: string;
  indiaRelevanceType: string;
}>): EvidenceSelector {
  if (input.indiaRelevanceType === "no_current_India_fit") {
    return {
      expectedBasis: "server_derived",
      rationale:
        "Server-derived from the absence of a public India linkage in the cited classified evidence.",
      match: (path) => path === `${input.field}.${input.signalType}`,
    };
  }
  return {
    expectedBasis: "server_derived",
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
): EvidenceSelector {
  if (directDemandWorkerScoredComponents.includes(
    component as DirectDemandWorkerScoredComponent,
  )) {
    return workerEvidenceSelector(component as DirectDemandWorkerScoredComponent);
  }
  switch (component) {
    case "demandExplicitness":
      return {
        expectedBasis: "server_derived",
        rationale:
          "Server-derived from public evidence for the classified direct-demand ask.",
        match: (path) => path === `directDemandAsk.${signalType}`,
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
        rationale:
          "Server-derived from a publicly evidenced professional response path.",
        match: (path) =>
          ["responsePath", "professionalResponsePath", "publicResponsePath"].includes(
            path,
          ),
      };
  }
  throw new Error(`Unsupported direct score component: ${component}`);
}

function precursorEvidenceSelector(
  component: (typeof precursorScoreEvidenceComponents)[number],
  signalType: string,
  indiaRelevanceType: string,
): EvidenceSelector {
  if (precursorWorkerScoredComponents.includes(
    component as PrecursorWorkerScoredComponent,
  )) {
    return workerEvidenceSelector(component as PrecursorWorkerScoredComponent);
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
): EvidenceSelector {
  if (
    component === "taxonomyConsistency" ||
    component === "evidenceQuality"
  ) {
    const path = `momentumMetrics.${component}`;
    return {
      expectedBasis: "worker_evidence",
      rationale:
        "Worker metric is supported by public evidence cited for this momentum input.",
      match: (candidate) => candidate === path,
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
      !source.isSyndicated &&
      source.contributorEntityId !== null &&
      contributorEntityIds.has(source.contributorEntityId),
  });
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
): EvidenceSelector {
  if (signalClass === "direct_demand") {
    return directEvidenceSelector(
      component as (typeof directDemandScoreEvidenceComponents)[number],
      signalType,
      indiaRelevanceType,
      freshnessEvidencePath,
    );
  }
  if (signalClass === "demand_precursor") {
    return precursorEvidenceSelector(
      component as (typeof precursorScoreEvidenceComponents)[number],
      signalType,
      indiaRelevanceType,
    );
  }
  return momentumEvidenceSelector(
    component as (typeof momentumScoreEvidenceComponents)[number],
    new Set(momentumContributorEntityIds),
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
      : source.supportedFieldPaths
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

export function deriveScoreComponentEvidenceAssociations(input: Readonly<{
  signalClass: ScoreEvidenceSignalClass;
  signalType: string;
  indiaRelevanceType: string;
  momentumContributorEntityIds?: readonly string[];
  freshnessEvidencePath?: DirectDemandFreshnessEvidencePath;
  components: Readonly<Record<string, unknown>>;
  evidence: readonly ScoreEvidenceSource[];
}>): readonly ScoreComponentEvidenceAssociation[] {
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
      );
      const evidence = selectedCitations(selector, input.evidence);
      if (evidence.length === 0) {
        throw new Error(
          `Missing public evidence association for active score component: ${component}`,
        );
      }
      return [
        Object.freeze({
          component,
          value,
          basis: selector.expectedBasis,
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
      ),
      input.evidence,
    ).length > 0;
  });
}
