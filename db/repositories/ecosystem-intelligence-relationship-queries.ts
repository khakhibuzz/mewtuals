import { sql } from "drizzle-orm";

import {
  relationshipReadiness,
  type EcosystemFilters,
} from "../../app/domain/ecosystem-intelligence";
import type { MewtualsDatabase } from "../client";
import {
  publicHttpUrlOrNull,
  withFilteredCandidates,
} from "./ecosystem-intelligence-query";
import type { EcosystemSnapshot } from "./ecosystem-intelligence-types";

type ReadTransaction = Parameters<MewtualsDatabase["transaction"]>[0] extends
  (transaction: infer Transaction) => unknown ? Transaction : never;

const MAX_GRAPH_NODES = 40;
const MAX_GRAPH_EDGES = 60;

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function date(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value === null ? null : date(value);
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
  validPublicContactCandidateIds: readonly string[],
  validPublicRelationshipEvidenceIds: readonly string[],
  validPublicSignalEvidenceIds: readonly string[],
  denominator: number,
): Promise<EcosystemSnapshot["relationships"]> {
  const [stats] = await transaction.execute<RelationshipStatsRow>(withFilteredCandidates(filters, now, validPublicContactCandidateIds, validPublicRelationshipEvidenceIds, validPublicSignalEvidenceIds, sql`
    , spanned_candidates as (
      select source_candidate_id as id from drawable_relationships
      union
      select target_candidate_id from drawable_relationships
    )
    select
      (select count(*)::integer from drawable_relationships) as "evidencedEdgeCount",
      (select count(*)::integer from spanned_candidates) as "candidateCount",
      (select count(*)::integer from documented_relationships where target_candidate_id is null) as "unresolvedTargetCount"
  `));
  const readiness = relationshipReadiness({
    evidencedEdges: number(stats?.evidencedEdgeCount),
    candidates: number(stats?.candidateCount),
    unresolvedTargets: number(stats?.unresolvedTargetCount),
  });
  const baseResult = {
    denominator,
    ready: readiness.ready,
    evidencedEdgeCount: readiness.evidencedEdges,
    candidateCount: readiness.candidates,
    unresolvedTargetCount: readiness.unresolvedTargets ?? 0,
    requiredEvidencedEdges: readiness.requiredEvidencedEdges,
    requiredCandidates: readiness.requiredCandidates,
    message: readiness.message,
  };
  if (!readiness.ready) {
    return { ...baseResult, nodes: [], edges: [] };
  }

  const graphRows = await transaction.execute<GraphNodeRow | GraphEdgeRow>(withFilteredCandidates(
    filters,
    now,
    validPublicContactCandidateIds,
    validPublicRelationshipEvidenceIds,
    validPublicSignalEvidenceIds,
    sql`
    , candidate_edges as (
      select relationship.*,
        row_number() over (
          order by coalesce(relationship.observed_at, relationship.created_at) desc, relationship.id
        ) as edge_rank
      from drawable_relationships relationship
      order by coalesce(relationship.observed_at, relationship.created_at) desc, relationship.id
      limit ${MAX_GRAPH_EDGES}
    ),
    candidate_node_ranks as (
      select candidate_id, min(edge_rank) as first_edge_rank
      from (
        select source_candidate_id as candidate_id, edge_rank from candidate_edges
        union all
        select target_candidate_id, edge_rank from candidate_edges
      ) endpoint
      group by candidate_id
    ),
    candidate_nodes as (
      select candidate_id
      from candidate_node_ranks
      order by first_edge_rank, candidate_id
      limit ${MAX_GRAPH_NODES}
    ),
    selected_edges as (
      select edge.*
      from candidate_edges edge
      join candidate_nodes source on source.candidate_id = edge.source_candidate_id
      join candidate_nodes target on target.candidate_id = edge.target_candidate_id
      order by edge.edge_rank
    ),
    selected_node_ids as (
      select source_candidate_id as candidate_id from selected_edges
      union
      select target_candidate_id from selected_edges
    ),
    selected_nodes as (
      select candidate.id, candidate.name, candidate.type,
        coalesce(
          (select min(role.term_key) from effective_classifications role where role.candidate_id = candidate.id and role.kind = 'ecosystem_role'),
          (select min(layer.term_key) from effective_classifications layer where layer.candidate_id = candidate.id and layer.kind = 'technical_layer'),
          'unknown'
        ) as cluster_key
      from selected_node_ids selected
      join filtered_candidates candidate on candidate.id = selected.candidate_id
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
    ...baseResult,
    nodes: graphRows.filter((row): row is GraphNodeRow => row.recordType === "node").map((row) => ({
      id: row.id,
      name: row.name,
      clusterKey: row.clusterKey,
      type: row.candidateType,
    })),
    edges: graphRows.filter((row): row is GraphEdgeRow => row.recordType === "edge").flatMap((row) => {
      const evidenceUrl = publicHttpUrlOrNull(row.evidenceUrl);
      return evidenceUrl ? [{
        id: row.id,
        sourceCandidateId: row.sourceCandidateId,
        targetCandidateId: row.targetCandidateId,
        type: row.relationshipType,
        evidenceUrl,
        confidence: number(row.confidence),
        observedAt: nullableDate(row.observedAt),
      }] : [];
    }),
  };
}

export { loadRelationships };
