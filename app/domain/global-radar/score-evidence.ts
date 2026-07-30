export const directDemandWorkerScoredComponents = Object.freeze([
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

export type DirectDemandWorkerScoredComponent =
  (typeof directDemandWorkerScoredComponents)[number];
export type PrecursorWorkerScoredComponent =
  (typeof precursorWorkerScoredComponents)[number];
export type WorkerScoredComponent =
  | DirectDemandWorkerScoredComponent
  | PrecursorWorkerScoredComponent;
export type WorkerScoredComponentEvidencePath =
  `scoreComponents.${WorkerScoredComponent}`;

export const GLOBAL_RADAR_SCORE_EVIDENCE_VERSION =
  "global-radar-score-evidence-v1" as const;
export const MAX_SCORE_COMPONENT_EVIDENCE_CITATIONS = 10;
export const MAX_SCORE_COMPONENT_MATCHED_FIELD_PATHS = 10;

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

export function isWorkerScoredComponentEvidencePath(
  path: string,
): path is WorkerScoredComponentEvidencePath {
  return workerScoredComponentEvidencePaths.has(path);
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

type ScoreEvidenceSignalClass =
  | "direct_demand"
  | "demand_precursor"
  | "ecosystem_momentum";

type EvidenceSelector = Readonly<{
  expectedBasis: ScoreEvidenceBasis;
  rationale: string;
  match(path: string): boolean;
  citeAllEvidence?: boolean;
  fallbackToAllEvidence?: boolean;
}>;

const allEvidenceSelector = (
  rationale: string,
): EvidenceSelector => ({
  expectedBasis: "server_derived",
  rationale,
  match: () => false,
  citeAllEvidence: true,
});

function workerEvidenceSelector(component: WorkerScoredComponent): EvidenceSelector {
  const path = `scoreComponents.${component}`;
  return {
    expectedBasis: "worker_evidence",
    rationale:
      "Worker score is supported by public evidence cited for this component.",
    match: (candidate) => candidate === path,
  };
}

function directEvidenceSelector(
  component: (typeof directDemandScoreEvidenceComponents)[number],
  signalType: string,
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
        fallbackToAllEvidence: true,
      };
    case "evidenceConfidence":
      return allEvidenceSelector(
        "Server-derived from the confidence of qualifying public evidence.",
      );
    case "freshness":
      return {
        expectedBasis: "server_derived",
        rationale:
          "Server-derived from cited signal dates or the earliest dated public evidence.",
        match: (path) =>
          path === "signal.announcedAt" || path === "signal.effectiveFrom",
        fallbackToAllEvidence: true,
      };
    case "actionability":
      return {
        expectedBasis: "server_derived",
        rationale:
          "Server-derived from documented response access and compliance-review facts.",
        match: (path) =>
          ["responsePath", "professionalResponsePath", "publicResponsePath"].includes(
            path,
          ) || path.startsWith("sensitiveDataAndCompliance."),
        fallbackToAllEvidence: true,
      };
    case "indiaFit":
      return {
        expectedBasis: "server_derived",
        rationale:
          "Server-derived from public evidence supporting the assessed India relevance.",
        match: (path) => path.startsWith("indiaRelevance."),
        fallbackToAllEvidence: true,
      };
    case "responseAccessibility":
      return {
        expectedBasis: "server_derived",
        rationale:
          "Server-derived from a publicly evidenced professional response path.",
        match: (path) =>
          ["responsePath", "professionalResponsePath", "publicResponsePath"].includes(
            path,
          ),
        fallbackToAllEvidence: true,
      };
  }
  throw new Error(`Unsupported direct score component: ${component}`);
}

function precursorEvidenceSelector(
  component: (typeof precursorScoreEvidenceComponents)[number],
): EvidenceSelector {
  if (precursorWorkerScoredComponents.includes(
    component as PrecursorWorkerScoredComponent,
  )) {
    return workerEvidenceSelector(component as PrecursorWorkerScoredComponent);
  }
  switch (component) {
    case "evidenceConfidence":
      return allEvidenceSelector(
        "Server-derived from the confidence of qualifying public evidence.",
      );
    case "indiaFit":
      return {
        expectedBasis: "server_derived",
        rationale:
          "Server-derived from public evidence supporting the assessed India relevance.",
        match: (path) => path.startsWith("indiaRelevance."),
        fallbackToAllEvidence: true,
      };
    case "estimatedTimeHorizon":
      return {
        expectedBasis: "server_derived",
        rationale:
          "Server-derived from the cited effective date or the dated public evidence record.",
        match: (path) => path === "signal.effectiveFrom",
        fallbackToAllEvidence: true,
      };
  }
  throw new Error(`Unsupported precursor score component: ${component}`);
}

function momentumEvidenceSelector(): EvidenceSelector {
  return allEvidenceSelector(
    "Server-derived from deduplicated public evidence, entity breadth, and the versioned momentum policy.",
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
): EvidenceSelector {
  if (signalClass === "direct_demand") {
    return directEvidenceSelector(
      component as (typeof directDemandScoreEvidenceComponents)[number],
      signalType,
    );
  }
  if (signalClass === "demand_precursor") {
    return precursorEvidenceSelector(
      component as (typeof precursorScoreEvidenceComponents)[number],
    );
  }
  return momentumEvidenceSelector();
}

function selectedCitations(
  selector: EvidenceSelector,
  evidence: readonly ScoreEvidenceSource[],
): readonly ScoreComponentEvidenceCitation[] {
  const directlyMatched = evidence.flatMap((source) => {
    const matchedFieldPaths = source.supportedFieldPaths
      .filter((path) => selector.citeAllEvidence || selector.match(path))
      .slice(0, MAX_SCORE_COMPONENT_MATCHED_FIELD_PATHS);
    return matchedFieldPaths.length > 0 || selector.citeAllEvidence
      ? [{ source, matchedFieldPaths }]
      : [];
  });
  const selected =
    directlyMatched.length > 0
      ? directlyMatched
      : selector.fallbackToAllEvidence
        ? evidence.map((source) => ({ source, matchedFieldPaths: [] as string[] }))
        : [];
  return Object.freeze(
    selected
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
