import { sql } from "drizzle-orm";

import {
  relationshipReadiness,
  type EcosystemFilters,
} from "../../app/domain/ecosystem-intelligence";
import type { MewtualsDatabase } from "../client";
import { withFilteredCandidates } from "./ecosystem-intelligence-query";
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
  denominator: number,
): Promise<EcosystemSnapshot["relationships"]> {
  const [stats] = await transaction.execute<RelationshipStatsRow>(withFilteredCandidates(filters, now, sql`
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
  const graphRows = await transaction.execute<GraphNodeRow | GraphEdgeRow>(withFilteredCandidates(filters, now, sql`
    , resolved_edges as (
      select relationship.* from drawable_relationships relationship
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

export { loadRelationships };
