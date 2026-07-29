import { asc, desc, sql, type SQL } from "drizzle-orm";

import {
  activeUntilForSignal,
  calculateEvidenceCoverage,
  isActiveSignal,
  relationshipReadiness,
  type EcosystemFilters,
  type EvidenceCoverage,
} from "../../app/domain/ecosystem-intelligence";
import {
  ECOSYSTEM_INTELLIGENCE_THRESHOLDS,
  ECOSYSTEM_TAXONOMY,
  type ClassificationEvidenceState,
  type EcosystemTaxonomyKind,
} from "../../app/domain/ecosystem-intelligence-taxonomy";
import type { MewtualsDatabase } from "../client";
import {
  candidateEcosystemClassifications,
  candidateHeadquarters,
  candidatePublicSignals,
  candidateRelationships,
  candidateResearchVersions,
  discoveryCandidateSources,
  discoveryCandidates,
} from "../schema";
import {
  activeSignalPredicate,
  classificationKinds,
  inferenceValues,
  signalFreshnessValues,
  sqlList,
  timestamp,
  withFilteredCandidates,
} from "./ecosystem-intelligence-query";
import type {
  CountOption,
  EcosystemCandidateDetail,
  EcosystemClassificationDto,
  EcosystemHeadquartersDto,
  EcosystemResearchVersionDto,
  EcosystemSignalDto,
  EcosystemSnapshot,
} from "./ecosystem-intelligence-types";

type ReadTransaction = Parameters<MewtualsDatabase["transaction"]>[0] extends
  (transaction: infer Transaction) => unknown ? Transaction : never;

const MAX_MOMENTUM_SIGNALS = 25;
const MAX_MOMENTUM_COMPANIES = 10;
const MAX_GRAPH_NODES = 40;
const MAX_GRAPH_EDGES = 60;
const MAX_DETAIL_SOURCES = 25;
const MAX_DETAIL_RESEARCH = 20;
const MAX_DETAIL_SIGNALS = 25;
const MAX_DETAIL_RELATIONSHIPS_PER_DIRECTION = 20;

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function date(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value === null ? null : date(value);
}

function evidenceFreshness(
  latestEvidenceAt: Date | string | null,
  now: Date,
): "current" | "stale" | "unknown" {
  if (!latestEvidenceAt) return "unknown";
  const threshold = new Date(now);
  threshold.setUTCDate(
    threshold.getUTCDate() - ECOSYSTEM_INTELLIGENCE_THRESHOLDS.staleEvidence.maximumAgeDays,
  );
  return date(latestEvidenceAt) >= threshold ? "current" : "stale";
}

function classificationState(value: unknown): "none" | "inferred" | "evidence_backed" {
  return value === "evidence_backed"
    ? "evidence_backed"
    : value === "inferred"
      ? "inferred"
      : "none";
}

function evidenceCoverageFromRow(row: {
  hasCandidateSource: boolean;
  hasSystemsContext: boolean;
  classificationState: unknown;
  stateKey: string | null;
  hasPublicContact: boolean;
}): EvidenceCoverage {
  return calculateEvidenceCoverage({
    candidateSourceEvidence: row.hasCandidateSource,
    currentSystemsContext: row.hasSystemsContext,
    classification: classificationState(row.classificationState),
    resolvedHeadquarters: row.stateKey !== null,
    publicProfessionalContact: row.hasPublicContact,
  });
}

function optionLabel(kind: EcosystemTaxonomyKind, key: string): string {
  if (key === "unknown") return "Unknown";
  return ECOSYSTEM_TAXONOMY.termsByKind[kind].find((term) => term.key === key)?.label ?? key;
}

type VelocityRow = {
  days: number;
  dimension: "total" | "candidate_date" | "source" | "role" | "state" | "evidence_band" | "review_status" | "research_versions" | "source_evidence";
  key: string;
  count: number;
};

function evidenceBandCase(alias: string): SQL {
  const candidate = sql.raw(alias);
  return sql`case
    when ${candidate}.evidence_score >= 80 and ${candidate}.classification_state = 'evidence_backed' then 'strong'
    when ${candidate}.evidence_score >= 60 then 'partial'
    when ${candidate}.evidence_score > 0 then 'limited'
    else 'unknown'
  end`;
}

function velocityOptions(
  rows: readonly VelocityRow[],
  days: number,
  dimension: VelocityRow["dimension"],
): CountOption[] {
  return rows
    .filter((row) => row.days === days && row.dimension === dimension)
    .map((row) => ({ key: row.key, label: row.key, count: number(row.count) }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
}

async function loadVelocity(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  denominator: number,
): Promise<EcosystemSnapshot["velocity"]> {
  const rows = await transaction.execute<VelocityRow>(withFilteredCandidates(filters, now, sql`
    , windows(days) as (values (7), (30), (90)),
    candidate_activity as (
      select candidate.*,
        greatest(
          candidate.discovered_at,
          coalesce((select max(source.last_seen_at) from ${discoveryCandidateSources} source where source.candidate_id = candidate.id), '-infinity'::timestamptz),
          coalesce((select max(research.created_at) from ${candidateResearchVersions} research where research.candidate_id = candidate.id and research.analysis_version = ${filters.analysisVersion}), '-infinity'::timestamptz)
        ) as activity_at
      from filtered_candidates candidate
    ),
    activity_membership as (
      select period.days, candidate.*
      from windows period
      join candidate_activity candidate
        on candidate.activity_at > ${timestamp(now)} - make_interval(days => period.days)
        and candidate.activity_at <= ${timestamp(now)}
    )
    select days as "days", 'total'::text as "dimension", 'candidates'::text as "key", count(distinct id)::integer as "count"
    from activity_membership group by days
    union all
    select days, 'candidate_date', to_char(activity_at at time zone 'UTC', 'YYYY-MM-DD'), count(distinct id)::integer
    from activity_membership group by days, to_char(activity_at at time zone 'UTC', 'YYYY-MM-DD')
    union all
    select membership.days, 'source', source.source_name, count(distinct membership.id)::integer
    from activity_membership membership join ${discoveryCandidateSources} source on source.candidate_id = membership.id
    where source.last_seen_at > ${timestamp(now)} - make_interval(days => membership.days) and source.last_seen_at <= ${timestamp(now)}
    group by membership.days, source.source_name
    union all
    select membership.days, 'role', role.term_key, count(distinct membership.id)::integer
    from activity_membership membership join effective_classifications role on role.candidate_id = membership.id and role.kind = 'ecosystem_role'
    group by membership.days, role.term_key
    union all
    select days, 'state', coalesce(state_key, 'unknown'), count(distinct id)::integer
    from activity_membership group by days, coalesce(state_key, 'unknown')
    union all
    select days, 'evidence_band', ${evidenceBandCase("activity_membership")}, count(distinct id)::integer
    from activity_membership group by days, ${evidenceBandCase("activity_membership")}
    union all
    select days, 'review_status', status::text, count(distinct id)::integer
    from activity_membership group by days, status
    union all
    select period.days, 'research_versions', 'research_versions', count(research.id)::integer
    from windows period
    join filtered_candidates candidate on true
    join ${candidateResearchVersions} research on research.candidate_id = candidate.id and research.analysis_version = ${filters.analysisVersion}
      and research.created_at > ${timestamp(now)} - make_interval(days => period.days) and research.created_at <= ${timestamp(now)}
    group by period.days
    union all
    select period.days, 'source_evidence', 'source_evidence', count(source.id)::integer
    from windows period
    join filtered_candidates candidate on true
    join ${discoveryCandidateSources} source on source.candidate_id = candidate.id
      and source.last_seen_at > ${timestamp(now)} - make_interval(days => period.days) and source.last_seen_at <= ${timestamp(now)}
    group by period.days
    order by "days", "dimension", "count" desc, "key"
  `));
  const value = (days: number, dimension: VelocityRow["dimension"]): number =>
    number(rows.find((row) => row.days === days && row.dimension === dimension)?.count);
  return {
    kind: "discovery_research_activity",
    denominator,
    windows: ([7, 30, 90] as const).map((days) => ({
      days,
      candidateCount: value(days, "total"),
      researchVersionCount: value(days, "research_versions"),
      sourceEvidenceCount: value(days, "source_evidence"),
      byCandidateDate: velocityOptions(rows, days, "candidate_date"),
      bySource: velocityOptions(rows, days, "source"),
      byRole: velocityOptions(rows, days, "role"),
      byState: velocityOptions(rows, days, "state"),
      byEvidenceBand: velocityOptions(rows, days, "evidence_band"),
      byReviewStatus: velocityOptions(rows, days, "review_status"),
    })),
  };
}

type MomentumRow = {
  id: string;
  candidateId: string;
  candidateName: string;
  signalType: string;
  title: string;
  occurredAt: Date | string;
  expiresAt: Date | string | null;
  sourceUrl: string;
  confidence: number;
  activeSignalCount: number;
  organisationCount: number;
  typeCount: number;
  companySignalCount: number;
};

async function loadMomentum(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  denominator: number,
): Promise<EcosystemSnapshot["momentum"]> {
  const rows = await transaction.execute<MomentumRow>(withFilteredCandidates(filters, now, sql`
    , active_signals as (
      select
        signal.id,
        signal.candidate_id,
        candidate.name as candidate_name,
        signal.signal_type,
        signal.title,
        signal.occurred_at,
        signal.expires_at,
        signal.source_url,
        signal.confidence
      from ${candidatePublicSignals} signal
      join filtered_candidates candidate on candidate.id = signal.candidate_id
      join signal_freshness on signal_freshness.signal_type = signal.signal_type
      where ${activeSignalPredicate("signal", now)}
    )
    select
      signal.id as "id",
      signal.candidate_id as "candidateId",
      signal.candidate_name as "candidateName",
      signal.signal_type as "signalType",
      signal.title as "title",
      signal.occurred_at as "occurredAt",
      signal.expires_at as "expiresAt",
      signal.source_url as "sourceUrl",
      signal.confidence as "confidence",
      count(*) over ()::integer as "activeSignalCount",
      (select count(distinct candidate_id)::integer from active_signals) as "organisationCount",
      count(*) over (partition by signal.signal_type)::integer as "typeCount",
      count(*) over (partition by signal.candidate_id)::integer as "companySignalCount"
    from active_signals signal
    order by signal.occurred_at desc, signal.id
    limit ${MAX_MOMENTUM_SIGNALS}
  `));
  const activeSignalCount = number(rows[0]?.activeSignalCount);
  const organisationCount = number(rows[0]?.organisationCount);
  const threshold = ECOSYSTEM_INTELLIGENCE_THRESHOLDS.momentum;
  const ready = activeSignalCount >= threshold.minimumSignals && organisationCount >= threshold.minimumOrganisations;
  const categories = new Map<string, number>();
  const companies = new Map<string, { label: string; count: number }>();
  const signals: EcosystemSignalDto[] = [];
  for (const row of rows) {
    categories.set(row.signalType, number(row.typeCount));
    companies.set(row.candidateId, { label: row.candidateName, count: number(row.companySignalCount) });
    const signalInput = {
      type: row.signalType as Parameters<typeof activeUntilForSignal>[0]["type"],
      occurredAt: date(row.occurredAt),
      expiresAt: nullableDate(row.expiresAt),
    };
    const activeUntil = activeUntilForSignal(signalInput);
    if (!activeUntil || !isActiveSignal(signalInput, now)) continue;
    signals.push({
      id: row.id,
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      type: row.signalType,
      title: row.title,
      occurredAt: date(row.occurredAt),
      expiresAt: nullableDate(row.expiresAt),
      activeUntil,
      sourceUrl: row.sourceUrl,
      confidence: number(row.confidence),
    });
  }
  return {
    denominator,
    ready,
    activeSignalCount,
    organisationCount,
    requiredSignalCount: threshold.minimumSignals,
    requiredOrganisationCount: threshold.minimumOrganisations,
    message: ready
      ? "Evidence-backed ecosystem momentum is ready to view."
      : "Not enough evidence-backed signals to establish ecosystem momentum yet.",
    categories: ready
      ? [...categories].map(([key, count]) => ({ key, label: optionLabel("signal_type", key), count }))
          .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
      : [],
    companies: ready
      ? [...companies].map(([key, value]) => ({ key, label: value.label, count: value.count }))
          .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
          .slice(0, MAX_MOMENTUM_COMPANIES)
      : [],
    signals: ready ? signals : [],
  };
}

type RelationshipStatsRow = {
  evidencedEdgeCount: number;
  candidateCount: number;
  unresolvedTargetCount: number;
};
type GraphNodeRow = {
  recordType: "node";
  id: string;
  name: string;
  candidateType: "company" | "creator";
  clusterKey: string;
  sourceCandidateId: null;
  targetCandidateId: null;
  relationshipType: null;
  evidenceUrl: null;
  confidence: null;
  observedAt: null;
};
type GraphEdgeRow = {
  recordType: "edge";
  id: string;
  name: null;
  candidateType: null;
  clusterKey: null;
  sourceCandidateId: string;
  targetCandidateId: string;
  relationshipType: string;
  evidenceUrl: string;
  confidence: number;
  observedAt: Date | string | null;
};

async function loadRelationships(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  denominator: number,
): Promise<EcosystemSnapshot["relationships"]> {
  const [stats] = await transaction.execute<RelationshipStatsRow>(withFilteredCandidates(filters, now, sql`
    , evidenced_edges as (
      select relationship.*
      from ${candidateRelationships} relationship
      join filtered_candidates source_candidate on source_candidate.id = relationship.source_candidate_id
      where relationship.evidence_url ~ '^https?://'
        and (relationship.target_candidate_id is null or exists (
          select 1 from filtered_candidates target_candidate where target_candidate.id = relationship.target_candidate_id
        ))
    ),
    spanned_candidates as (
      select source_candidate_id as id from evidenced_edges
      union
      select target_candidate_id from evidenced_edges where target_candidate_id is not null
    )
    select
      count(*)::integer as "evidencedEdgeCount",
      (select count(*)::integer from spanned_candidates) as "candidateCount",
      count(*) filter (where target_candidate_id is null)::integer as "unresolvedTargetCount"
    from evidenced_edges
  `));
  const readiness = relationshipReadiness({
    evidencedEdges: number(stats?.evidencedEdgeCount),
    candidates: number(stats?.candidateCount),
    unresolvedTargets: number(stats?.unresolvedTargetCount),
  });
  const graphRows = await transaction.execute<GraphNodeRow | GraphEdgeRow>(withFilteredCandidates(filters, now, sql`
    , resolved_edges as (
      select relationship.*
      from ${candidateRelationships} relationship
      join filtered_candidates source_candidate on source_candidate.id = relationship.source_candidate_id
      join filtered_candidates target_candidate on target_candidate.id = relationship.target_candidate_id
      where relationship.evidence_url ~ '^https?://'
    ),
    node_degree as (
      select candidate_id, count(*)::integer as degree from (
        select source_candidate_id as candidate_id from resolved_edges
        union all
        select target_candidate_id from resolved_edges
      ) endpoint group by candidate_id
    ),
    selected_nodes as (
      select candidate.id, candidate.name, candidate.type,
        coalesce(
          (select min(role.term_key) from effective_classifications role where role.candidate_id = candidate.id and role.kind = 'ecosystem_role'),
          (select min(layer.term_key) from effective_classifications layer where layer.candidate_id = candidate.id and layer.kind = 'technical_layer'),
          'unknown'
        ) as cluster_key,
        degree.degree
      from node_degree degree
      join filtered_candidates candidate on candidate.id = degree.candidate_id
      order by degree.degree desc, candidate.name, candidate.id
      limit ${MAX_GRAPH_NODES}
    ),
    selected_edges as (
      select edge.*
      from resolved_edges edge
      join selected_nodes source on source.id = edge.source_candidate_id
      join selected_nodes target on target.id = edge.target_candidate_id
      order by coalesce(edge.observed_at, edge.created_at) desc, edge.id
      limit ${MAX_GRAPH_EDGES}
    )
    select
      'node'::text as "recordType",
      node.id as "id",
      node.name as "name",
      node.type::text as "candidateType",
      node.cluster_key as "clusterKey",
      null::uuid as "sourceCandidateId",
      null::uuid as "targetCandidateId",
      null::text as "relationshipType",
      null::text as "evidenceUrl",
      null::integer as "confidence",
      null::timestamptz as "observedAt"
    from selected_nodes node
    union all
    select
      'edge'::text,
      edge.id,
      null::text,
      null::text,
      null::text,
      edge.source_candidate_id,
      edge.target_candidate_id,
      edge.relationship_type,
      edge.evidence_url,
      edge.confidence,
      edge.observed_at
    from selected_edges edge
    order by "recordType" desc, "id"
  `));
  return {
    denominator,
    ready: readiness.ready,
    evidencedEdgeCount: readiness.evidencedEdges,
    candidateCount: readiness.candidates,
    unresolvedTargetCount: readiness.unresolvedTargets ?? 0,
    requiredEvidencedEdges: readiness.requiredEvidencedEdges,
    requiredCandidates: readiness.requiredCandidates,
    message: readiness.message,
    nodes: readiness.ready
      ? graphRows.filter((row): row is GraphNodeRow => row.recordType === "node").map((row) => ({
          id: row.id,
          name: row.name,
          clusterKey: row.clusterKey,
          type: row.candidateType,
        }))
      : [],
    edges: readiness.ready
      ? graphRows.filter((row): row is GraphEdgeRow => row.recordType === "edge").map((row) => ({
          id: row.id,
          sourceCandidateId: row.sourceCandidateId,
          targetCandidateId: row.targetCandidateId,
          type: row.relationshipType,
          evidenceUrl: row.evidenceUrl,
          confidence: number(row.confidence),
          observedAt: nullableDate(row.observedAt),
        }))
      : [],
  };
}

type LedgerRow = {
  id: string;
  type: "company" | "creator";
  name: string;
  description: string;
  category: string;
  status: "discovered" | "shortlisted" | "rejected" | "queued_for_profile";
  discoveryScore: number;
  discoveredAt: Date | string;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  primarySocialUrl: string | null;
  stateKey: string | null;
  stateLabel: string | null;
  cityKey: string | null;
  cityLabel: string | null;
  latitudeMicrodegrees: number | null;
  longitudeMicrodegrees: number | null;
  headquartersEvidenceState: ClassificationEvidenceState | null;
  headquartersConfidence: number | null;
  headquartersSourceUrls: string[] | null;
  hasCandidateSource: boolean;
  hasSystemsContext: boolean;
  hasPublicContact: boolean;
  classificationState: string;
  latestEvidenceAt: Date | string | null;
  classifications: EcosystemClassificationDto[] | null;
  activeSignalCount: number;
  relationshipCount: number;
  latestSourceUrl: string | null;
  latestResearchAt: Date | string | null;
};

function headquartersFromRow(row: LedgerRow): EcosystemHeadquartersDto | null {
  if (!row.stateKey || !row.stateLabel || !row.cityKey || !row.cityLabel || !row.headquartersEvidenceState || row.headquartersConfidence === null) {
    return null;
  }
  const reliableCoordinates = row.headquartersEvidenceState === "evidence_backed" && row.headquartersConfidence >= 70;
  return {
    stateKey: row.stateKey,
    stateLabel: row.stateLabel,
    cityKey: row.cityKey,
    cityLabel: row.cityLabel,
    latitude: reliableCoordinates && row.latitudeMicrodegrees !== null ? row.latitudeMicrodegrees / 1_000_000 : null,
    longitude: reliableCoordinates && row.longitudeMicrodegrees !== null ? row.longitudeMicrodegrees / 1_000_000 : null,
    evidenceState: row.headquartersEvidenceState,
    confidence: number(row.headquartersConfidence),
    sourceUrls: row.headquartersSourceUrls ?? [],
  };
}

async function loadLedger(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  total: number,
): Promise<EcosystemSnapshot["ledger"]> {
  const sortExpression: SQL = filters.sort === "name"
    ? sql`lower(candidate.name)`
    : filters.sort === "discovery_score"
      ? sql`candidate.discovery_score`
      : filters.sort === "evidence_coverage"
        ? sql`candidate.evidence_score`
        : sql`candidate.discovered_at`;
  const orderExpression = filters.direction === "asc" ? asc(sortExpression) : desc(sortExpression);
  const rows = await transaction.execute<LedgerRow>(withFilteredCandidates(filters, now, sql`
    select
      candidate.id as "id",
      candidate.type::text as "type",
      candidate.name as "name",
      candidate.discovered_description as "description",
      candidate.category as "category",
      candidate.status::text as "status",
      candidate.discovery_score as "discoveryScore",
      candidate.discovered_at as "discoveredAt",
      candidate.website_url as "websiteUrl",
      candidate.linkedin_url as "linkedinUrl",
      candidate.primary_social_url as "primarySocialUrl",
      candidate.state_key as "stateKey",
      candidate.state_label as "stateLabel",
      candidate.city_key as "cityKey",
      candidate.city_label as "cityLabel",
      candidate.latitude_microdegrees as "latitudeMicrodegrees",
      candidate.longitude_microdegrees as "longitudeMicrodegrees",
      candidate.headquarters_evidence_state as "headquartersEvidenceState",
      candidate.headquarters_confidence as "headquartersConfidence",
      candidate.headquarters_source_urls as "headquartersSourceUrls",
      candidate.has_candidate_source as "hasCandidateSource",
      candidate.has_systems_context as "hasSystemsContext",
      candidate.has_public_contact as "hasPublicContact",
      candidate.classification_state as "classificationState",
      candidate.latest_evidence_at as "latestEvidenceAt",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'kind', classification.kind,
          'termKey', classification.term_key,
          'evidenceState', classification.evidence_state,
          'confidence', classification.confidence,
          'basis', classification.basis,
          'sourceUrls', classification.source_urls
        ) order by classification.kind, classification.term_key)
        from effective_classifications classification
        where classification.candidate_id = candidate.id
      ), '[]'::jsonb) as "classifications",
      (select count(*)::integer from ${candidatePublicSignals} signal join signal_freshness on signal_freshness.signal_type = signal.signal_type where signal.candidate_id = candidate.id and ${activeSignalPredicate("signal", now)}) as "activeSignalCount",
      (select count(*)::integer from ${candidateRelationships} relationship where relationship.source_candidate_id = candidate.id and relationship.evidence_url ~ '^https?://') as "relationshipCount",
      (select source.source_url from ${discoveryCandidateSources} source where source.candidate_id = candidate.id order by source.last_seen_at desc, source.id desc limit 1) as "latestSourceUrl",
      (select research.created_at from ${candidateResearchVersions} research where research.candidate_id = candidate.id and research.analysis_version = ${filters.analysisVersion} order by research.created_at desc, research.id desc limit 1) as "latestResearchAt"
    from filtered_candidates candidate
    order by ${orderExpression}, candidate.id asc
    limit ${filters.pageSize}
    offset ${(filters.page - 1) * filters.pageSize}
  `));
  return {
    items: rows.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name,
      description: row.description,
      category: row.category,
      status: row.status,
      discoveryScore: number(row.discoveryScore),
      discoveredAt: date(row.discoveredAt),
      websiteUrl: row.websiteUrl,
      linkedinUrl: row.linkedinUrl,
      primarySocialUrl: row.primarySocialUrl,
      classifications: row.classifications ?? [],
      headquarters: headquartersFromRow(row),
      evidenceCoverage: evidenceCoverageFromRow(row),
      evidenceFreshness: evidenceFreshness(row.latestEvidenceAt, now),
      activeSignalCount: number(row.activeSignalCount),
      documentedRelationshipCount: number(row.relationshipCount),
      latestSourceUrl: row.latestSourceUrl,
      latestResearchAt: nullableDate(row.latestResearchAt),
    })),
    total,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
  };
}

type OptionRow = { dimension: string; key: string; count: number };

function unknownClassificationOptionQueries(): SQL {
  return sql.join(classificationKinds.map((kind) => sql`
    select ${kind}::text as "dimension", 'unknown'::text as "key", count(*)::integer as "count"
    from filtered_candidates candidate
    where not exists (
      select 1 from effective_classifications classification
      where classification.candidate_id = candidate.id and classification.kind = ${kind}
    )
  `), sql` union all `);
}

async function loadFilterOptions(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  denominator: number,
): Promise<EcosystemSnapshot["filterOptions"]> {
  const rows = await transaction.execute<OptionRow>(withFilteredCandidates(filters, now, sql`
    select 'participant_type'::text as "dimension", type::text as "key", count(*)::integer as "count"
    from filtered_candidates group by type
    union all
    select 'review_status', status::text, count(*)::integer from filtered_candidates group by status
    union all
    select classification.kind, classification.term_key, count(distinct candidate.id)::integer
    from filtered_candidates candidate
    join effective_classifications classification on classification.candidate_id = candidate.id
    where classification.kind in (${sqlList(classificationKinds)})
    group by classification.kind, classification.term_key
    union all
    ${unknownClassificationOptionQueries()}
    union all
    select 'headquarters_state', coalesce(state_key, 'unknown'), count(*)::integer from filtered_candidates group by coalesce(state_key, 'unknown')
    union all
    select 'headquarters_city', coalesce(city_key, 'unknown'), count(*)::integer from filtered_candidates group by coalesce(city_key, 'unknown')
    union all
    select 'active_signal_type', signal.signal_type, count(distinct candidate.id)::integer
    from filtered_candidates candidate
    join ${candidatePublicSignals} signal on signal.candidate_id = candidate.id
    join signal_freshness on signal_freshness.signal_type = signal.signal_type
    where ${activeSignalPredicate("signal", now)}
    group by signal.signal_type
    union all
    select 'active_signal_type', 'unknown', count(*)::integer
    from filtered_candidates candidate
    where not exists (
      select 1 from ${candidatePublicSignals} signal
      join signal_freshness on signal_freshness.signal_type = signal.signal_type
      where signal.candidate_id = candidate.id and ${activeSignalPredicate("signal", now)}
    )
    union all
    select 'public_contact', case when has_public_contact then 'available' else 'missing' end, count(*)::integer
    from filtered_candidates group by has_public_contact
    union all
    select 'evidence_coverage', evidence_band, count(*)::integer
    from (
      select ${evidenceBandCase("filtered_candidates")} as evidence_band
      from filtered_candidates
    ) evidence_buckets
    group by evidence_band
    union all
    select 'evidence_freshness', freshness, count(*)::integer
    from (
      select case
        when latest_evidence_at is null then 'unknown'
        when latest_evidence_at >= ${timestamp(now)} - make_interval(days => ${ECOSYSTEM_INTELLIGENCE_THRESHOLDS.staleEvidence.maximumAgeDays}::integer) then 'current'
        else 'stale'
      end as freshness
      from filtered_candidates
    ) freshness_buckets
    group by freshness
    order by "dimension", "key"
  `));
  const counts = new Map(rows.map((row) => [`${row.dimension}:${row.key}`, number(row.count)]));
  const count = (dimension: string, key: string) => counts.get(`${dimension}:${key}`) ?? 0;
  const simpleOptions = (dimension: string, keys: readonly string[], labels?: Record<string, string>): CountOption[] =>
    keys.map((key) => ({ key, label: labels?.[key] ?? key, count: count(dimension, key) }));
  const taxonomy: Record<string, CountOption[]> = {};
  for (const kind of classificationKinds) {
    const terms = ECOSYSTEM_TAXONOMY.termsByKind[kind];
    taxonomy[kind] = [
      ...terms.map((term) => ({ key: term.key, label: term.label, count: count(kind, term.key) })),
      ...(count(kind, "unknown") > 0 ? [{ key: "unknown", label: "Unknown", count: count(kind, "unknown") }] : []),
    ];
  }
  const stateKeys = rows.filter((row) => row.dimension === "headquarters_state").map((row) => row.key)
    .sort((left, right) => left === "unknown" ? 1 : right === "unknown" ? -1 : left.localeCompare(right));
  const cityKeys = rows.filter((row) => row.dimension === "headquarters_city").map((row) => row.key)
    .sort((left, right) => left === "unknown" ? 1 : right === "unknown" ? -1 : left.localeCompare(right));
  return {
    denominator,
    participantTypes: simpleOptions("participant_type", ["company", "creator"], { company: "Companies", creator: "Creators" }),
    reviewStatuses: simpleOptions("review_status", ["discovered", "shortlisted", "queued_for_profile", "rejected"]),
    taxonomy,
    headquartersStates: simpleOptions("headquarters_state", stateKeys),
    headquartersCities: simpleOptions("headquarters_city", cityKeys),
    activeSignalTypes: [
      ...ECOSYSTEM_TAXONOMY.termsByKind.signal_type.map((term) => ({ key: term.key, label: term.label, count: count("active_signal_type", term.key) })),
      ...(count("active_signal_type", "unknown") > 0 ? [{ key: "unknown", label: "Unknown", count: count("active_signal_type", "unknown") }] : []),
    ],
    publicContacts: simpleOptions("public_contact", ["available", "missing"], { available: "Available", missing: "Missing" }),
    evidenceCoverageBands: simpleOptions("evidence_coverage", ["strong", "partial", "limited", "unknown"]),
    evidenceFreshness: simpleOptions("evidence_freshness", ["current", "stale", "unknown"]),
  };
}

type DetailIdentityRow = {
  id: string;
  type: "company" | "creator";
  name: string;
  description: string;
  category: string;
  subcategory: string | null;
  status: "discovered" | "shortlisted" | "rejected" | "queued_for_profile";
  discoveryScore: number;
  discoveredAt: Date | string;
  updatedAt: Date | string;
  canonicalUrl: string;
  websiteUrl: string | null;
  linkedinUrl: string | null;
  primarySocialUrl: string | null;
};
type DetailClassificationRow = {
  kind: EcosystemClassificationDto["kind"];
  termKey: string;
  evidenceState: ClassificationEvidenceState;
  confidence: number | null;
  basis: string;
  sourceUrls: string[];
};
type DetailHeadquartersRow = {
  stateKey: string;
  stateLabel: string;
  cityKey: string;
  cityLabel: string;
  latitudeMicrodegrees: number | null;
  longitudeMicrodegrees: number | null;
  evidenceState: ClassificationEvidenceState;
  confidence: number;
  sourceUrls: string[];
};
type DetailSignalRow = Omit<MomentumRow, "activeSignalCount" | "organisationCount" | "typeCount" | "companySignalCount">;
type DetailRelationshipRow = {
  id: string;
  direction: "upstream" | "downstream";
  sourceCandidateId: string;
  sourceName: string;
  targetCandidateId: string | null;
  targetName: string;
  relationshipType: string;
  evidenceUrl: string;
  confidence: number;
  observedAt: Date | string | null;
};
type DetailSourceRow = {
  id: string;
  sourceName: string;
  sourceUrl: string;
  firstSeenAt: Date | string;
  lastSeenAt: Date | string;
};
type DetailResearchRow = Omit<EcosystemResearchVersionDto, "createdAt"> & {
  createdAt: Date | string;
};

async function loadCandidateDetail(
  transaction: ReadTransaction,
  candidateId: string,
  now: Date,
): Promise<EcosystemCandidateDetail | null> {
  const [identity] = await transaction.execute<DetailIdentityRow>(sql`
    select
      candidate.id as "id",
      candidate.type::text as "type",
      candidate.name as "name",
      candidate.discovered_description as "description",
      candidate.category as "category",
      candidate.subcategory as "subcategory",
      candidate.status::text as "status",
      candidate.discovery_score as "discoveryScore",
      candidate.discovered_at as "discoveredAt",
      candidate.updated_at as "updatedAt",
      candidate.canonical_url as "canonicalUrl",
      candidate.website_url as "websiteUrl",
      candidate.linkedin_url as "linkedinUrl",
      candidate.primary_social_url as "primarySocialUrl"
    from ${discoveryCandidates} candidate
    where candidate.id = ${candidateId}
      and exists (
        select 1 from ${candidateResearchVersions} research
        where research.candidate_id = candidate.id and research.analysis_version = 'physical-ai-v1'
      )
    limit 1
  `);
  if (!identity) return null;

  const classifications = await transaction.execute<DetailClassificationRow>(sql`
    with inferred_rules(category, kind, term_key) as (values ${inferenceValues}),
    effective_classifications as (
      select
        classification.kind,
        classification.term_key,
        classification.evidence_state,
        classification.confidence,
        classification.basis,
        classification.source_urls
      from ${candidateEcosystemClassifications} classification
      where classification.candidate_id = ${candidateId}
      union all
      select
        inference.kind,
        inference.term_key,
        'inferred'::text,
        null::integer,
        ('Inferred from registered Discovery category: ' || candidate.category)::text,
        '[]'::jsonb
      from ${discoveryCandidates} candidate
      join inferred_rules inference on lower(btrim(candidate.category)) = inference.category
      where candidate.id = ${candidateId}
        and not exists (
          select 1 from ${candidateEcosystemClassifications} explicit_classification
          where explicit_classification.candidate_id = candidate.id
            and explicit_classification.kind = inference.kind
            and explicit_classification.term_key = inference.term_key
        )
    )
    select
      kind as "kind",
      term_key as "termKey",
      evidence_state as "evidenceState",
      confidence as "confidence",
      basis as "basis",
      source_urls as "sourceUrls"
    from effective_classifications
    order by kind, term_key
    limit 100
  `);
  const [headquarters] = await transaction.execute<DetailHeadquartersRow>(sql`
    select
      state_key as "stateKey",
      state_label as "stateLabel",
      city_key as "cityKey",
      city_label as "cityLabel",
      latitude_microdegrees as "latitudeMicrodegrees",
      longitude_microdegrees as "longitudeMicrodegrees",
      evidence_state as "evidenceState",
      confidence as "confidence",
      source_urls as "sourceUrls"
    from ${candidateHeadquarters}
    where candidate_id = ${candidateId}
    limit 1
  `);
  const signalRows = await transaction.execute<DetailSignalRow>(sql`
    with signal_freshness(signal_type, freshness_days) as (values ${signalFreshnessValues})
    select
      signal.id as "id",
      signal.candidate_id as "candidateId",
      ${identity.name}::text as "candidateName",
      signal.signal_type as "signalType",
      signal.title as "title",
      signal.occurred_at as "occurredAt",
      signal.expires_at as "expiresAt",
      signal.source_url as "sourceUrl",
      signal.confidence as "confidence"
    from ${candidatePublicSignals} signal
    join signal_freshness on signal_freshness.signal_type = signal.signal_type
    where signal.candidate_id = ${candidateId} and ${activeSignalPredicate("signal", now)}
    order by signal.occurred_at desc, signal.id
    limit ${MAX_DETAIL_SIGNALS}
  `);
  const relationships = await transaction.execute<DetailRelationshipRow>(sql`
    (
      select
        relationship.id as "id",
        'downstream'::text as "direction",
        relationship.source_candidate_id as "sourceCandidateId",
        source_candidate.name as "sourceName",
        relationship.target_candidate_id as "targetCandidateId",
        coalesce(target_candidate.name, relationship.target_public_name) as "targetName",
        relationship.relationship_type as "relationshipType",
        relationship.evidence_url as "evidenceUrl",
        relationship.confidence as "confidence",
        relationship.observed_at as "observedAt"
      from ${candidateRelationships} relationship
      join ${discoveryCandidates} source_candidate on source_candidate.id = relationship.source_candidate_id
      left join ${discoveryCandidates} target_candidate on target_candidate.id = relationship.target_candidate_id
      where relationship.source_candidate_id = ${candidateId} and relationship.evidence_url ~ '^https?://'
      order by coalesce(relationship.observed_at, relationship.created_at) desc, relationship.id
      limit ${MAX_DETAIL_RELATIONSHIPS_PER_DIRECTION}
    )
    union all
    (
      select
        relationship.id,
        'upstream'::text,
        relationship.source_candidate_id,
        source_candidate.name,
        relationship.target_candidate_id,
        target_candidate.name,
        relationship.relationship_type,
        relationship.evidence_url,
        relationship.confidence,
        relationship.observed_at
      from ${candidateRelationships} relationship
      join ${discoveryCandidates} source_candidate on source_candidate.id = relationship.source_candidate_id
      join ${discoveryCandidates} target_candidate on target_candidate.id = relationship.target_candidate_id
      where relationship.target_candidate_id = ${candidateId} and relationship.evidence_url ~ '^https?://'
      order by coalesce(relationship.observed_at, relationship.created_at) desc, relationship.id
      limit ${MAX_DETAIL_RELATIONSHIPS_PER_DIRECTION}
    )
    order by "direction", "observedAt" desc nulls last, "id"
  `);
  const sources = await transaction.execute<DetailSourceRow>(sql`
    select
      source.id as "id",
      source.source_name as "sourceName",
      source.source_url as "sourceUrl",
      source.first_seen_at as "firstSeenAt",
      source.last_seen_at as "lastSeenAt"
    from ${discoveryCandidateSources} source
    where source.candidate_id = ${candidateId}
    order by source.last_seen_at desc, source.id desc
    limit ${MAX_DETAIL_SOURCES}
  `);
  const research = await transaction.execute<DetailResearchRow>(sql`
    select
      research.id as "id",
      research.discovery_run_id as "discoveryRunId",
      research.summary as "summary",
      research.findings as "findings",
      research.source_urls as "sourceUrls",
      research.analysis_version as "analysisVersion",
      research.created_at as "createdAt"
    from ${candidateResearchVersions} research
    where research.candidate_id = ${candidateId}
    order by research.created_at desc, research.id desc
    limit ${MAX_DETAIL_RESEARCH}
  `);
  const signalDtos = signalRows.flatMap((row) => {
    const input = {
      type: row.signalType as Parameters<typeof activeUntilForSignal>[0]["type"],
      occurredAt: date(row.occurredAt),
      expiresAt: nullableDate(row.expiresAt),
    };
    const activeUntil = activeUntilForSignal(input);
    return activeUntil && isActiveSignal(input, now) ? [{
      id: row.id,
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      type: row.signalType,
      title: row.title,
      occurredAt: date(row.occurredAt),
      expiresAt: nullableDate(row.expiresAt),
      activeUntil,
      sourceUrl: row.sourceUrl,
      confidence: number(row.confidence),
    }] : [];
  });
  const reliableCoordinates = headquarters?.evidenceState === "evidence_backed" && number(headquarters.confidence) >= 70;
  return {
    id: identity.id,
    type: identity.type,
    name: identity.name,
    description: identity.description,
    category: identity.category,
    subcategory: identity.subcategory,
    status: identity.status,
    discoveryScore: number(identity.discoveryScore),
    discoveredAt: date(identity.discoveredAt),
    updatedAt: date(identity.updatedAt),
    publicUrls: {
      canonical: identity.canonicalUrl,
      website: identity.websiteUrl,
      linkedin: identity.linkedinUrl,
      primarySocial: identity.primarySocialUrl,
    },
    classifications: classifications.map((classification) => ({
      ...classification,
      confidence: classification.confidence === null ? null : number(classification.confidence),
      sourceUrls: classification.sourceUrls ?? [],
    })),
    headquarters: headquarters ? {
      stateKey: headquarters.stateKey,
      stateLabel: headquarters.stateLabel,
      cityKey: headquarters.cityKey,
      cityLabel: headquarters.cityLabel,
      latitude: reliableCoordinates && headquarters.latitudeMicrodegrees !== null ? headquarters.latitudeMicrodegrees / 1_000_000 : null,
      longitude: reliableCoordinates && headquarters.longitudeMicrodegrees !== null ? headquarters.longitudeMicrodegrees / 1_000_000 : null,
      evidenceState: headquarters.evidenceState,
      confidence: number(headquarters.confidence),
      sourceUrls: headquarters.sourceUrls ?? [],
    } : null,
    signals: signalDtos,
    relationships: relationships.map((relationship) => ({
      id: relationship.id,
      direction: relationship.direction,
      sourceCandidateId: relationship.sourceCandidateId,
      sourceName: relationship.sourceName,
      targetCandidateId: relationship.targetCandidateId,
      targetName: relationship.targetName,
      type: relationship.relationshipType,
      evidenceUrl: relationship.evidenceUrl,
      confidence: number(relationship.confidence),
      observedAt: nullableDate(relationship.observedAt),
    })),
    sources: sources.map((source) => ({
      ...source,
      firstSeenAt: date(source.firstSeenAt),
      lastSeenAt: date(source.lastSeenAt),
    })),
    research: {
      current: research[0] ? { ...research[0], createdAt: date(research[0].createdAt) } : null,
      history: research.slice(1).map((version) => ({
        ...version,
        createdAt: date(version.createdAt),
      })),
    },
  };
}


export async function loadEcosystemActivity(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  denominator: number,
): Promise<Pick<
  EcosystemSnapshot,
  "velocity" | "momentum" | "relationships" | "ledger" | "filterOptions"
>> {
  return {
    velocity: await loadVelocity(transaction, filters, now, denominator),
    momentum: await loadMomentum(transaction, filters, now, denominator),
    relationships: await loadRelationships(transaction, filters, now, denominator),
    ledger: await loadLedger(transaction, filters, now, denominator),
    filterOptions: await loadFilterOptions(transaction, filters, now, denominator),
  };
}

export { loadCandidateDetail };
