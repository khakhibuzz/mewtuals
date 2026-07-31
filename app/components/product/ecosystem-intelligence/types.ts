export type ParticipantTypeDto = "company" | "creator";
export type ReviewStatusDto =
  | "discovered"
  | "shortlisted"
  | "rejected"
  | "queued_for_profile";
export type EcosystemFilterArrayKey =
  | "ecosystemDomains"
  | "organisationSubtypes"
  | "ecosystemRoles"
  | "businessStages"
  | "technicalLayers"
  | "capabilities"
  | "componentCategories"
  | "roboticsVerticals"
  | "headquartersStates"
  | "headquartersCities"
  | "activeSignalTypes"
  | "reviewStatuses";

export type EcosystemFiltersDto = {
  participantType: ParticipantTypeDto;
  includeEnablers: boolean;
  analysisVersion: "physical-ai-v1";
  ecosystemDomains: readonly string[];
  organisationSubtypes: readonly string[];
  ecosystemRoles: readonly string[];
  businessStages: readonly string[];
  technicalLayers: readonly string[];
  capabilities: readonly string[];
  componentCategories: readonly string[];
  roboticsVerticals: readonly string[];
  headquartersStates: readonly string[];
  headquartersCities: readonly string[];
  activeSignalTypes: readonly string[];
  reviewStatuses: readonly ReviewStatusDto[];
  publicContactAvailability?: "available" | "missing" | "unknown";
  evidenceCoverageBand?: "strong" | "partial" | "limited" | "unknown";
  evidenceFreshness?: "current" | "stale" | "unknown";
  minimumDiscoveryConfidence?: number;
  discoveredAfter?: string;
  discoveredBefore?: string;
  page: number;
  pageSize: number;
  sort: "discovered_at" | "name" | "discovery_score" | "evidence_coverage";
  direction: "asc" | "desc";
};

export type CountMetricDto = { count: number };
export type RatioMetricDto = {
  numerator: number;
  denominator: number;
  percentage: number;
};
export type CountOptionDto = { key: string; label: string; count: number };
export type EvidenceCoverageDto = {
  score: number;
  numerator: number;
  denominator: 100;
  classification: "none" | "inferred" | "evidence_backed";
  dimensions: {
    candidateSourceEvidence: number;
    currentSystemsContext: number;
    classification: number;
    resolvedHeadquarters: number;
    publicProfessionalContact: number;
  };
};

export type EcosystemClassificationDto = {
  kind:
    | "ecosystem_domain"
    | "organisation_subtype"
    | "ecosystem_role"
    | "business_stage"
    | "technical_layer"
    | "capability"
    | "component_category"
    | "robotics_vertical";
  termKey: string;
  evidenceState: "evidence_backed" | "inferred";
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
  evidenceState: "evidence_backed" | "inferred";
  confidence: number;
  sourceUrls: string[];
};

export type EcosystemSignalDto = {
  id: string;
  candidateId: string;
  candidateName: string;
  type: string;
  title: string;
  occurredAt: string;
  expiresAt: string | null;
  activeUntil: string;
  sourceUrl: string;
  confidence: number;
};

export type EcosystemLedgerRowDto = {
  id: string;
  type: ParticipantTypeDto;
  name: string;
  description: string;
  category: string;
  status: ReviewStatusDto;
  discoveryScore: number;
  discoveredAt: string;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  primarySocialUrl: string | null;
  classifications: EcosystemClassificationDto[];
  headquarters: EcosystemHeadquartersDto | null;
  evidenceCoverage: EvidenceCoverageDto;
  evidenceFreshness: "current" | "stale" | "unknown";
  activeSignalCount: number;
  documentedRelationshipCount: number;
  latestSourceUrl: string | null;
  latestSourceAt: string | null;
  latestResearchAt: string | null;
};

export type ExplorerGroupDto = {
  key: string;
  count: number;
  strongEvidence: RatioMetricDto;
  representativeCompanies: Array<{ id: string; name: string }>;
  majorCapabilities: Array<{ key: string; count: number }>;
};

export type MatrixCellDto = {
  rowKey: string;
  columnKey: string;
  count: number;
  evidence: RatioMetricDto;
  readiness: "empty" | "needs_evidence" | "ready";
};

export type ResearchGapInsightDto = {
  ruleKey: string;
  title: string;
  copy: string;
  numerator: number;
  denominator: number;
  percentage: number;
  confidence: "map_evidence";
  supportingFilters: EcosystemFiltersDto;
};

export type EcosystemSnapshotDto = {
  generatedAt: string;
  filters: EcosystemFiltersDto;
  population: { total: number; fingerprint: string };
  summary: {
    organisations: CountMetricDto;
    companies: RatioMetricDto;
    rolesRepresented: CountMetricDto;
    technicalLayersRepresented: CountMetricDto;
    statesRepresented: CountMetricDto;
    citiesRepresented: CountMetricDto;
    publiclyReachable: RatioMetricDto;
    activeSignals: { count: number; organisations: RatioMetricDto };
    documentedRelationships: { count: number; organisations: RatioMetricDto };
  };
  dataQuality: {
    resolvedState: RatioMetricDto;
    resolvedCity: RatioMetricDto;
    ecosystemRole: RatioMetricDto;
    capability: RatioMetricDto;
    strongEvidence: RatioMetricDto;
    publicContact: RatioMetricDto;
    organisationsWithActiveSignal: RatioMetricDto;
    systemsContext: RatioMetricDto;
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
    businessStages: ExplorerGroupDto[];
    technicalLayers: ExplorerGroupDto[];
  };
  matrices: {
    denominator: number;
    roleByCapability: { rowKeys: string[]; columnKeys: string[]; cells: MatrixCellDto[] };
    stateByRole: { rowKeys: string[]; columnKeys: string[]; cells: MatrixCellDto[] };
  };
  insights: { denominator: number; items: readonly ResearchGapInsightDto[] };
  velocity: {
    kind: "discovery_research_activity";
    denominator: number;
    windows: Array<{
      days: 7 | 30 | 90;
      candidateCount: number;
      researchVersionCount: number;
      sourceEvidenceCount: number;
      byCandidateDate: CountOptionDto[];
      bySource: CountOptionDto[];
      byRole: CountOptionDto[];
      byState: CountOptionDto[];
      byEvidenceBand: CountOptionDto[];
      byReviewStatus: CountOptionDto[];
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
    categories: CountOptionDto[];
    companies: CountOptionDto[];
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
      type: ParticipantTypeDto;
    }>;
    edges: Array<{
      id: string;
      sourceCandidateId: string;
      targetCandidateId: string;
      type: string;
      evidenceUrl: string;
      confidence: number;
      observedAt: string | null;
    }>;
  };
  ledger: {
    items: EcosystemLedgerRowDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
  filterOptions: {
    denominator: number;
    participantTypes: CountOptionDto[];
    reviewStatuses: CountOptionDto[];
    taxonomy: Record<string, CountOptionDto[]>;
    headquartersStates: CountOptionDto[];
    headquartersCities: CountOptionDto[];
    activeSignalTypes: CountOptionDto[];
    publicContacts: CountOptionDto[];
    evidenceCoverageBands: CountOptionDto[];
    evidenceFreshness: CountOptionDto[];
  };
};

export type EcosystemSnapshotResponseDto =
  | { ok: true; snapshot: EcosystemSnapshotDto }
  | { ok: false; error: string };

export type EcosystemResearchVersionDto = {
  id: string;
  discoveryRunId: string;
  summary: string;
  findings: string;
  sourceUrls: string[];
  analysisVersion: string;
  createdAt: string;
};

export type EcosystemCandidateDetailDto = {
  id: string;
  type: ParticipantTypeDto;
  name: string;
  description: string;
  category: string;
  subcategory: string | null;
  status: ReviewStatusDto;
  discoveryScore: number;
  discoveredAt: string;
  updatedAt: string;
  publicUrls: {
    canonical: string | null;
    website: string | null;
    linkedin: string | null;
    primarySocial: string | null;
  };
  classifications: EcosystemClassificationDto[];
  headquarters: EcosystemHeadquartersDto | null;
  signals: EcosystemSignalDto[];
  relationships: Array<{
    id: string;
    direction: "upstream" | "downstream";
    sourceCandidateId: string;
    sourceName: string;
    targetCandidateId: string | null;
    targetName: string;
    type: string;
    evidenceUrl: string;
    confidence: number;
    observedAt: string | null;
  }>;
  sources: Array<{
    id: string;
    sourceName: string;
    sourceUrl: string;
    firstSeenAt: string;
    lastSeenAt: string;
  }>;
  research: {
    current: EcosystemResearchVersionDto | null;
    history: EcosystemResearchVersionDto[];
    historyPage: {
      total: number;
      offset: number;
      limit: number;
      hasMore: boolean;
      nextOffset: number | null;
    };
  };
};

export type EcosystemCandidateDetailResponseDto =
  | { ok: true; candidate: EcosystemCandidateDetailDto }
  | { ok: false; error: string };
