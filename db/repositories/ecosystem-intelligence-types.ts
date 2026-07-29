import type {
  EcosystemFilters,
  EvidenceCoverage,
  ResearchGapInsight,
} from "../../app/domain/ecosystem-intelligence";
import type {
  ClassificationEvidenceState,
  EcosystemTaxonomyKind,
} from "../../app/domain/ecosystem-intelligence-taxonomy";

export type CountMetric = { count: number };
export type RatioMetric = {
  numerator: number;
  denominator: number;
  percentage: number;
};
export type CountOption = { key: string; label: string; count: number };
export type EcosystemClassificationDto = {
  kind: Exclude<EcosystemTaxonomyKind, "signal_type" | "relationship_type">;
  termKey: string;
  evidenceState: ClassificationEvidenceState;
  confidence: number | null;
  basis: string;
  sourceUrls: string[];
};
export type EcosystemHeadquartersDto = {
  stateKey: string;
  stateLabel: string;
  cityKey: string;
  cityLabel: string;
  latitude: number | null;
  longitude: number | null;
  evidenceState: ClassificationEvidenceState;
  confidence: number;
  sourceUrls: string[];
};
export type EcosystemSignalDto = {
  id: string;
  candidateId: string;
  candidateName: string;
  type: string;
  title: string;
  occurredAt: Date;
  expiresAt: Date | null;
  activeUntil: Date;
  sourceUrl: string;
  confidence: number;
};
export type EcosystemRelationshipDto = {
  id: string;
  direction: "upstream" | "downstream";
  sourceCandidateId: string;
  sourceName: string;
  targetCandidateId: string | null;
  targetName: string;
  type: string;
  evidenceUrl: string;
  confidence: number;
  observedAt: Date | null;
};
export type EcosystemLedgerRow = {
  id: string;
  type: "company" | "creator";
  name: string;
  description: string;
  category: string;
  status: "discovered" | "shortlisted" | "rejected" | "queued_for_profile";
  discoveryScore: number;
  discoveredAt: Date;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  primarySocialUrl: string | null;
  classifications: EcosystemClassificationDto[];
  headquarters: EcosystemHeadquartersDto | null;
  evidenceCoverage: EvidenceCoverage;
  evidenceFreshness: "current" | "stale" | "unknown";
  activeSignalCount: number;
  documentedRelationshipCount: number;
  latestSourceUrl: string | null;
  latestResearchAt: Date | null;
};
export type ExplorerGroup = {
  key: string;
  count: number;
  strongEvidence: RatioMetric;
  representativeCompanies: Array<{ id: string; name: string }>;
  majorCapabilities: Array<{ key: string; count: number }>;
};
export type MatrixCell = {
  rowKey: string;
  columnKey: string;
  count: number;
  evidence: RatioMetric;
  readiness: "empty" | "needs_evidence" | "ready";
};
export type EcosystemSnapshot = {
  generatedAt: Date;
  filters: EcosystemFilters;
  population: { total: number; fingerprint: string };
  summary: {
    organisations: CountMetric;
    companies: RatioMetric;
    rolesRepresented: CountMetric;
    technicalLayersRepresented: CountMetric;
    statesRepresented: CountMetric;
    citiesRepresented: CountMetric;
    publiclyReachable: RatioMetric;
    activeSignals: { count: number; organisations: RatioMetric };
    documentedRelationships: { count: number; organisations: RatioMetric };
  };
  dataQuality: {
    resolvedState: RatioMetric;
    resolvedCity: RatioMetric;
    ecosystemRole: RatioMetric;
    capability: RatioMetric;
    strongEvidence: RatioMetric;
    publicContact: RatioMetric;
    organisationsWithActiveSignal: RatioMetric;
    systemsContext: RatioMetric;
    unknownCounts: Record<string, number>;
  };
  geography: {
    denominator: number;
    states: Array<{ key: string; label: string; count: number }>;
    cities: Array<{
      key: string;
      label: string;
      stateKey: string;
      count: number;
      latitude: number | null;
      longitude: number | null;
    }>;
    unresolvedCount: number;
  };
  explorer: {
    denominator: number;
    businessStages: ExplorerGroup[];
    technicalLayers: ExplorerGroup[];
  };
  matrices: {
    denominator: number;
    roleByCapability: { rowKeys: string[]; columnKeys: string[]; cells: MatrixCell[] };
    stateByRole: { rowKeys: string[]; columnKeys: string[]; cells: MatrixCell[] };
  };
  insights: { denominator: number; items: readonly ResearchGapInsight[] };
  velocity: {
    kind: "discovery_research_activity";
    denominator: number;
    windows: Array<{
      days: 7 | 30 | 90;
      candidateCount: number;
      researchVersionCount: number;
      sourceEvidenceCount: number;
      byCandidateDate: CountOption[];
      bySource: CountOption[];
      byRole: CountOption[];
      byState: CountOption[];
      byEvidenceBand: CountOption[];
      byReviewStatus: CountOption[];
    }>;
  };
  momentum: {
    denominator: number;
    ready: boolean;
    activeSignalCount: number;
    organisationCount: number;
    requiredSignalCount: number;
    requiredOrganisationCount: number;
    message: string;
    categories: CountOption[];
    companies: CountOption[];
    signals: EcosystemSignalDto[];
  };
  relationships: {
    denominator: number;
    ready: boolean;
    evidencedEdgeCount: number;
    candidateCount: number;
    unresolvedTargetCount: number;
    requiredEvidencedEdges: number;
    requiredCandidates: number;
    message: string;
    nodes: Array<{
      id: string;
      name: string;
      clusterKey: string;
      type: "company" | "creator";
    }>;
    edges: Array<{
      id: string;
      sourceCandidateId: string;
      targetCandidateId: string;
      type: string;
      evidenceUrl: string;
      confidence: number;
      observedAt: Date | null;
    }>;
  };
  ledger: {
    items: EcosystemLedgerRow[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  filterOptions: {
    denominator: number;
    participantTypes: CountOption[];
    reviewStatuses: CountOption[];
    taxonomy: Record<string, CountOption[]>;
    headquartersStates: CountOption[];
    headquartersCities: CountOption[];
    activeSignalTypes: CountOption[];
    publicContacts: CountOption[];
    evidenceCoverageBands: CountOption[];
    evidenceFreshness: CountOption[];
  };
};

export type EcosystemResearchVersionDto = {
  id: string;
  discoveryRunId: string;
  summary: string;
  findings: string;
  sourceUrls: string[];
  analysisVersion: string;
  createdAt: Date;
};
export type EcosystemCandidateDetail = {
  id: string;
  type: "company" | "creator";
  name: string;
  description: string;
  category: string;
  subcategory: string | null;
  status: "discovered" | "shortlisted" | "rejected" | "queued_for_profile";
  discoveryScore: number;
  discoveredAt: Date;
  updatedAt: Date;
  publicUrls: {
    canonical: string;
    website: string | null;
    linkedin: string | null;
    primarySocial: string | null;
  };
  classifications: EcosystemClassificationDto[];
  headquarters: EcosystemHeadquartersDto | null;
  signals: EcosystemSignalDto[];
  relationships: EcosystemRelationshipDto[];
  sources: Array<{
    id: string;
    sourceName: string;
    sourceUrl: string;
    firstSeenAt: Date;
    lastSeenAt: Date;
  }>;
  research: {
    current: EcosystemResearchVersionDto | null;
    history: EcosystemResearchVersionDto[];
  };
};

export type EcosystemIntelligenceRepository = {
  getSnapshot(filters: EcosystemFilters, now: Date): Promise<EcosystemSnapshot>;
  getCandidateDetail(candidateId: string, now: Date): Promise<EcosystemCandidateDetail | null>;
};
