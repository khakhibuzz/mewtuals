import { sql } from "drizzle-orm";

import {
  buildResearchGapInsights,
  type EcosystemFilters,
} from "../../app/domain/ecosystem-intelligence";
import {
  ECOSYSTEM_INTELLIGENCE_THRESHOLDS,
  ECOSYSTEM_TAXONOMY,
  indiaStateAndUnionTerritoryKeys,
} from "../../app/domain/ecosystem-intelligence-taxonomy";
import type { MewtualsDatabase } from "../client";
import {
  candidatePublicSignals,
  candidateRelationships,
} from "../schema";
import {
  activeSignalPredicate,
  sqlList,
  timestamp,
  withFilteredCandidates,
} from "./ecosystem-intelligence-query";
import type {
  EcosystemSnapshot,
  ExplorerGroup,
  MatrixCell,
  RatioMetric,
} from "./ecosystem-intelligence-types";

type ReadTransaction = Parameters<MewtualsDatabase["transaction"]>[0] extends
  (transaction: infer Transaction) => unknown ? Transaction : never;

const MAX_POPULATION_IDS = 100;
const MAX_REPRESENTATIVES = 5;

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function percentage(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

function ratio(numerator: number, denominator: number): RatioMetric {
  return { numerator, denominator, percentage: percentage(numerator, denominator) };
}

type SummaryRow = {
  total: number;
  companies: number;
  rolesRepresented: number;
  layersRepresented: number;
  statesRepresented: number;
  citiesRepresented: number;
  publicContacts: number;
  activeSignals: number;
  activeSignalOrganisations: number;
  dependencySignals: number;
  dependencySignalOrganisations: number;
  relationships: number;
  relationshipOrganisations: number;
  candidateSources: number;
  systemsContext: number;
  classifications: number;
  resolvedHeadquarters: number;
  evidenceScoreTotal: number;
  strongEvidence: number;
  staleEvidence: number;
  unknownDomain: number;
  unknownSubtype: number;
  unknownRole: number;
  unknownStage: number;
  unknownLayer: number;
  unknownCapability: number;
  unknownComponent: number;
  unknownVertical: number;
  unknownState: number;
  unknownCity: number;
  unknownContact: number;
  unknownSignals: number;
  unknownSystemsContext: number;
};

async function loadPopulationAndSummary(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
): Promise<{ candidateIds: string[]; summary: SummaryRow }> {
  const candidateIds = await transaction.execute<{ id: string }>(
    withFilteredCandidates(filters, now, sql`
      select id from filtered_candidates order by id limit ${MAX_POPULATION_IDS}
    `),
  );
  const [summary] = await transaction.execute<SummaryRow>(
    withFilteredCandidates(filters, now, sql`
      select
        count(*)::integer as "total",
        count(*) filter (where filtered.type = 'company')::integer as "companies",
        (select count(distinct role.term_key)::integer from effective_classifications role join filtered_candidates candidate on candidate.id = role.candidate_id where role.kind = 'ecosystem_role') as "rolesRepresented",
        (select count(distinct layer.term_key)::integer from effective_classifications layer join filtered_candidates candidate on candidate.id = layer.candidate_id where layer.kind = 'technical_layer') as "layersRepresented",
        count(distinct filtered.state_key) filter (where filtered.state_key is not null)::integer as "statesRepresented",
        count(distinct filtered.city_key) filter (where filtered.city_key is not null)::integer as "citiesRepresented",
        count(*) filter (where filtered.has_public_contact)::integer as "publicContacts",
        (select count(*)::integer from ${candidatePublicSignals} signal join filtered_candidates candidate on candidate.id = signal.candidate_id join signal_freshness on signal_freshness.signal_type = signal.signal_type where ${activeSignalPredicate("signal", now)}) as "activeSignals",
        (select count(distinct signal.candidate_id)::integer from ${candidatePublicSignals} signal join filtered_candidates candidate on candidate.id = signal.candidate_id join signal_freshness on signal_freshness.signal_type = signal.signal_type where ${activeSignalPredicate("signal", now)}) as "activeSignalOrganisations",
        (select count(*)::integer from ${candidatePublicSignals} signal join filtered_candidates candidate on candidate.id = signal.candidate_id join signal_freshness on signal_freshness.signal_type = signal.signal_type where signal.signal_type in (${sqlList(ECOSYSTEM_TAXONOMY.dependencyRelatedSignalTypes)}) and ${activeSignalPredicate("signal", now)}) as "dependencySignals",
        (select count(distinct signal.candidate_id)::integer from ${candidatePublicSignals} signal join filtered_candidates candidate on candidate.id = signal.candidate_id join signal_freshness on signal_freshness.signal_type = signal.signal_type where signal.signal_type in (${sqlList(ECOSYSTEM_TAXONOMY.dependencyRelatedSignalTypes)}) and ${activeSignalPredicate("signal", now)}) as "dependencySignalOrganisations",
        (select count(*)::integer from ${candidateRelationships} relationship join filtered_candidates candidate on candidate.id = relationship.source_candidate_id where relationship.evidence_url ~ '^https?://') as "relationships",
        (select count(distinct relationship.source_candidate_id)::integer from ${candidateRelationships} relationship join filtered_candidates candidate on candidate.id = relationship.source_candidate_id where relationship.evidence_url ~ '^https?://') as "relationshipOrganisations",
        count(*) filter (where filtered.has_candidate_source)::integer as "candidateSources",
        count(*) filter (where filtered.has_systems_context)::integer as "systemsContext",
        count(*) filter (where filtered.classification_state <> 'none')::integer as "classifications",
        count(*) filter (where filtered.state_key is not null)::integer as "resolvedHeadquarters",
        coalesce(sum(filtered.evidence_score), 0)::integer as "evidenceScoreTotal",
        count(*) filter (where filtered.evidence_score >= 80 and filtered.classification_state = 'evidence_backed')::integer as "strongEvidence",
        count(*) filter (where filtered.latest_evidence_at < ${timestamp(now)} - make_interval(days => ${ECOSYSTEM_INTELLIGENCE_THRESHOLDS.staleEvidence.maximumAgeDays}::integer))::integer as "staleEvidence",
        count(*) filter (where not exists (select 1 from effective_classifications classification where classification.candidate_id = filtered.id and classification.kind = 'ecosystem_domain'))::integer as "unknownDomain",
        count(*) filter (where not exists (select 1 from effective_classifications classification where classification.candidate_id = filtered.id and classification.kind = 'organisation_subtype'))::integer as "unknownSubtype",
        count(*) filter (where not exists (select 1 from effective_classifications classification where classification.candidate_id = filtered.id and classification.kind = 'ecosystem_role'))::integer as "unknownRole",
        count(*) filter (where not exists (select 1 from effective_classifications classification where classification.candidate_id = filtered.id and classification.kind = 'business_stage'))::integer as "unknownStage",
        count(*) filter (where not exists (select 1 from effective_classifications classification where classification.candidate_id = filtered.id and classification.kind = 'technical_layer'))::integer as "unknownLayer",
        count(*) filter (where not exists (select 1 from effective_classifications classification where classification.candidate_id = filtered.id and classification.kind = 'capability'))::integer as "unknownCapability",
        count(*) filter (where not exists (select 1 from effective_classifications classification where classification.candidate_id = filtered.id and classification.kind = 'component_category'))::integer as "unknownComponent",
        count(*) filter (where not exists (select 1 from effective_classifications classification where classification.candidate_id = filtered.id and classification.kind = 'robotics_vertical'))::integer as "unknownVertical",
        count(*) filter (where filtered.state_key is null)::integer as "unknownState",
        count(*) filter (where filtered.city_key is null)::integer as "unknownCity",
        count(*) filter (where not filtered.has_public_contact)::integer as "unknownContact",
        count(*) filter (where not exists (
          select 1 from ${candidatePublicSignals} signal
          join signal_freshness on signal_freshness.signal_type = signal.signal_type
          where signal.candidate_id = filtered.id and ${activeSignalPredicate("signal", now)}
        ))::integer as "unknownSignals",
        count(*) filter (where not filtered.has_systems_context)::integer as "unknownSystemsContext"
      from filtered_candidates filtered
    `),
  );
  return {
    candidateIds: candidateIds.map(({ id }) => id),
    summary: summary ?? {
      total: 0,
      companies: 0,
      rolesRepresented: 0,
      layersRepresented: 0,
      statesRepresented: 0,
      citiesRepresented: 0,
      publicContacts: 0,
      activeSignals: 0,
      activeSignalOrganisations: 0,
      dependencySignals: 0,
      dependencySignalOrganisations: 0,
      relationships: 0,
      relationshipOrganisations: 0,
      candidateSources: 0,
      systemsContext: 0,
      classifications: 0,
      resolvedHeadquarters: 0,
      evidenceScoreTotal: 0,
      strongEvidence: 0,
      staleEvidence: 0,
      unknownDomain: 0,
      unknownSubtype: 0,
      unknownRole: 0,
      unknownStage: 0,
      unknownLayer: 0,
      unknownCapability: 0,
      unknownComponent: 0,
      unknownVertical: 0,
      unknownState: 0,
      unknownCity: 0,
      unknownContact: 0,
      unknownSignals: 0,
      unknownSystemsContext: 0,
    },
  };
}
type GeographyRow = {
  dimension: "state" | "city";
  key: string;
  label: string;
  stateKey: string | null;
  count: number;
  latitude: number | null;
  longitude: number | null;
};

async function loadGeography(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  denominator: number,
  unresolvedCount: number,
): Promise<EcosystemSnapshot["geography"]> {
  const rows = await transaction.execute<GeographyRow>(withFilteredCandidates(filters, now, sql`
    select
      'state'::text as "dimension",
      state_key as "key",
      min(state_label) as "label",
      null::text as "stateKey",
      count(*)::integer as "count",
      null::double precision as "latitude",
      null::double precision as "longitude"
    from filtered_candidates
    where state_key is not null
    group by state_key
    union all
    select
      'city'::text,
      city_key,
      min(city_label),
      min(state_key),
      count(*)::integer,
      case
        when bool_and(headquarters_evidence_state = 'evidence_backed' and headquarters_confidence >= 70 and latitude_microdegrees is not null)
        then avg(latitude_microdegrees)::double precision / 1000000
        else null
      end,
      case
        when bool_and(headquarters_evidence_state = 'evidence_backed' and headquarters_confidence >= 70 and longitude_microdegrees is not null)
        then avg(longitude_microdegrees)::double precision / 1000000
        else null
      end
    from filtered_candidates
    where city_key is not null
    group by city_key
    order by "dimension", "count" desc, "key"
  `));
  return {
    denominator,
    states: rows.filter((row) => row.dimension === "state").map((row) => ({
      key: row.key,
      label: row.label,
      count: number(row.count),
    })),
    cities: rows.filter((row) => row.dimension === "city").map((row) => ({
      key: row.key,
      label: row.label,
      stateKey: row.stateKey ?? "unknown",
      count: number(row.count),
      latitude: row.latitude === null ? null : number(row.latitude),
      longitude: row.longitude === null ? null : number(row.longitude),
    })),
    unresolvedCount,
  };
}

type ExplorerRow = {
  kind: "business_stage" | "technical_layer";
  termKey: string;
  count: number;
  strongEvidenceCount: number;
  representativeCompanies: Array<{ id: string; name: string }> | null;
  majorCapabilities: Array<{ key: string; count: number }> | null;
};

async function loadExplorer(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  denominator: number,
): Promise<EcosystemSnapshot["explorer"]> {
  const rows = await transaction.execute<ExplorerRow>(withFilteredCandidates(filters, now, sql`
    , facet_membership as (
      select distinct classification.kind, classification.term_key, candidate.id, candidate.name,
        (candidate.evidence_score >= 80 and candidate.classification_state = 'evidence_backed') as strong_evidence
      from filtered_candidates candidate
      join effective_classifications classification on classification.candidate_id = candidate.id
      where classification.kind in ('business_stage', 'technical_layer')
    ),
    representative_ranks as (
      select *, row_number() over (partition by kind, term_key order by name, id) as representative_rank
      from facet_membership
    ),
    capability_counts as (
      select facet.kind, facet.term_key, capability.term_key as capability_key, count(distinct facet.id)::integer as count
      from facet_membership facet
      join effective_classifications capability on capability.candidate_id = facet.id and capability.kind = 'capability'
      group by facet.kind, facet.term_key, capability.term_key
    ),
    capability_ranks as (
      select *, row_number() over (partition by kind, term_key order by count desc, capability_key) as capability_rank
      from capability_counts
    )
    select
      membership.kind as "kind",
      membership.term_key as "termKey",
      count(distinct membership.id)::integer as "count",
      count(distinct membership.id) filter (where membership.strong_evidence)::integer as "strongEvidenceCount",
      coalesce((
        select jsonb_agg(jsonb_build_object('id', representative.id, 'name', representative.name) order by representative.name, representative.id)
        from representative_ranks representative
        where representative.kind = membership.kind
          and representative.term_key = membership.term_key
          and representative.representative_rank <= ${MAX_REPRESENTATIVES}
      ), '[]'::jsonb) as "representativeCompanies",
      coalesce((
        select jsonb_agg(jsonb_build_object('key', capability.capability_key, 'count', capability.count) order by capability.count desc, capability.capability_key)
        from capability_ranks capability
        where capability.kind = membership.kind
          and capability.term_key = membership.term_key
          and capability.capability_rank <= 5
      ), '[]'::jsonb) as "majorCapabilities"
    from facet_membership membership
    group by membership.kind, membership.term_key
    order by membership.kind, membership.term_key
  `));
  const byKindAndKey = new Map(rows.map((row) => [`${row.kind}:${row.termKey}`, row]));
  const groups = (kind: "business_stage" | "technical_layer"): ExplorerGroup[] =>
    ECOSYSTEM_TAXONOMY.termsByKind[kind].map((term) => {
      const row = byKindAndKey.get(`${kind}:${term.key}`);
      const count = number(row?.count);
      return {
        key: term.key,
        count,
        strongEvidence: ratio(number(row?.strongEvidenceCount), count),
        representativeCompanies: row?.representativeCompanies ?? [],
        majorCapabilities: (row?.majorCapabilities ?? []).map((capability) => ({
          key: capability.key,
          count: number(capability.count),
        })),
      };
    });
  return {
    denominator,
    businessStages: groups("business_stage"),
    technicalLayers: groups("technical_layer"),
  };
}

type MatrixRow = {
  matrix: "role_capability" | "state_role";
  rowKey: string;
  columnKey: string;
  count: number;
  strongEvidenceCount: number;
};

function matrixCells(
  rows: readonly MatrixRow[],
  matrix: MatrixRow["matrix"],
  rowKeys: readonly string[],
  columnKeys: readonly string[],
): MatrixCell[] {
  const counts = new Map(
    rows.filter((row) => row.matrix === matrix).map((row) => [
      `${row.rowKey}:${row.columnKey}`,
      row,
    ]),
  );
  return rowKeys.flatMap((rowKey) => columnKeys.map((columnKey) => {
    const row = counts.get(`${rowKey}:${columnKey}`);
    const count = number(row?.count);
    const strong = number(row?.strongEvidenceCount);
    return {
      rowKey,
      columnKey,
      count,
      evidence: ratio(strong, count),
      readiness: count === 0 ? "empty" : strong === 0 ? "needs_evidence" : "ready",
    };
  }));
}

async function loadMatrices(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  denominator: number,
): Promise<EcosystemSnapshot["matrices"]> {
  const rows = await transaction.execute<MatrixRow>(withFilteredCandidates(filters, now, sql`
    , candidate_roles as (
      select distinct candidate.id, role.term_key as key, candidate.evidence_score, candidate.classification_state
      from filtered_candidates candidate
      join effective_classifications role on role.candidate_id = candidate.id and role.kind = 'ecosystem_role'
      union all
      select candidate.id, 'unknown', candidate.evidence_score, candidate.classification_state
      from filtered_candidates candidate
      where not exists (select 1 from effective_classifications role where role.candidate_id = candidate.id and role.kind = 'ecosystem_role')
    ),
    candidate_capabilities as (
      select distinct candidate.id, capability.term_key as key
      from filtered_candidates candidate
      join effective_classifications capability on capability.candidate_id = candidate.id and capability.kind = 'capability'
      union all
      select candidate.id, 'unknown'
      from filtered_candidates candidate
      where not exists (select 1 from effective_classifications capability where capability.candidate_id = candidate.id and capability.kind = 'capability')
    ),
    candidate_states as (
      select id, coalesce(state_key, 'unknown') as key from filtered_candidates
    )
    select
      'role_capability'::text as "matrix",
      role.key as "rowKey",
      capability.key as "columnKey",
      count(distinct role.id)::integer as "count",
      count(distinct role.id) filter (where role.evidence_score >= 80 and role.classification_state = 'evidence_backed')::integer as "strongEvidenceCount"
    from candidate_roles role
    join candidate_capabilities capability on capability.id = role.id
    group by role.key, capability.key
    union all
    select
      'state_role'::text,
      state.key,
      role.key,
      count(distinct role.id)::integer,
      count(distinct role.id) filter (where role.evidence_score >= 80 and role.classification_state = 'evidence_backed')::integer
    from candidate_states state
    join candidate_roles role on role.id = state.id
    group by state.key, role.key
    order by "matrix", "rowKey", "columnKey"
  `));
  const populatedRoleKeys = new Set(rows.flatMap((row) =>
    row.matrix === "role_capability" ? [row.rowKey] : [row.columnKey],
  ));
  const roleKeys = [
    ...ECOSYSTEM_TAXONOMY.termsByKind.ecosystem_role.map(({ key }) => key),
    ...(populatedRoleKeys.has("unknown") ? ["unknown"] : []),
  ];
  const populatedCapabilityKeys = new Set(
    rows.filter((row) => row.matrix === "role_capability").map((row) => row.columnKey),
  );
  const capabilityKeys = [
    ...ECOSYSTEM_TAXONOMY.termsByKind.capability.map(({ key }) => key),
    ...(populatedCapabilityKeys.has("unknown") ? ["unknown"] : []),
  ];
  const populatedStateKeys = new Set(
    rows.filter((row) => row.matrix === "state_role").map((row) => row.rowKey),
  );
  const stateKeys = [
    ...indiaStateAndUnionTerritoryKeys.filter((key) => populatedStateKeys.has(key)),
    ...(populatedStateKeys.has("unknown") ? ["unknown"] : []),
  ];
  return {
    denominator,
    roleByCapability: {
      rowKeys: roleKeys,
      columnKeys: capabilityKeys,
      cells: matrixCells(rows, "role_capability", roleKeys, capabilityKeys),
    },
    stateByRole: {
      rowKeys: stateKeys,
      columnKeys: roleKeys,
      cells: matrixCells(rows, "state_role", stateKeys, roleKeys),
    },
  };
}


export async function loadEcosystemOverview(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
): Promise<Pick<
  EcosystemSnapshot,
  "population" | "summary" | "dataQuality" | "geography" | "explorer" | "matrices" | "insights"
>> {
  const population = await loadPopulationAndSummary(transaction, filters, now);
  const summaryRow = population.summary;
  const total = number(summaryRow.total);
  const geography = await loadGeography(
    transaction,
    filters,
    now,
    total,
    number(summaryRow.unknownState),
  );
  const explorer = await loadExplorer(transaction, filters, now, total);
  const matrices = await loadMatrices(transaction, filters, now, total);
  const topState = geography.states[0];
  const resolvedHeadquarters = total - number(summaryRow.unknownState);
  const insights = buildResearchGapInsights({
    baseFilters: filters,
    representation: {
      dimension: "ecosystem_role",
      numerator: total - number(summaryRow.unknownRole),
      denominator: total,
      label: "ecosystem roles",
    },
    geographicConcentration: topState ? {
      stateKey: topState.key,
      numerator: topState.count,
      denominator: resolvedHeadquarters,
      label: topState.label,
    } : undefined,
    missingData: {
      dimension: "technical_layer",
      numerator: number(summaryRow.unknownLayer),
      denominator: total,
      label: "technical layer evidence",
    },
    publicContacts: {
      numerator: number(summaryRow.publicContacts),
      denominator: total,
      label: "public professional contact",
    },
    dependencySignals: {
      numerator: number(summaryRow.dependencySignals),
      denominator: number(summaryRow.dependencySignalOrganisations),
      label: "dependency-related public signals",
    },
    staleEvidence: {
      numerator: number(summaryRow.staleEvidence),
      denominator: total,
      label: "stale evidence",
    },
  });
  const evidenceDenominator = total * 100;

  return {
    population: { candidateIds: population.candidateIds, total },
    summary: {
      organisations: { count: total },
      companies: ratio(number(summaryRow.companies), total),
      rolesRepresented: { count: number(summaryRow.rolesRepresented) },
      technicalLayersRepresented: { count: number(summaryRow.layersRepresented) },
      statesRepresented: { count: number(summaryRow.statesRepresented) },
      citiesRepresented: { count: number(summaryRow.citiesRepresented) },
      publiclyReachable: ratio(number(summaryRow.publicContacts), total),
      activeSignals: {
        count: number(summaryRow.activeSignals),
        organisations: ratio(number(summaryRow.activeSignalOrganisations), total),
      },
      documentedRelationships: {
        count: number(summaryRow.relationships),
        organisations: ratio(number(summaryRow.relationshipOrganisations), total),
      },
    },
    dataQuality: {
      candidateSources: ratio(number(summaryRow.candidateSources), total),
      systemsContext: ratio(number(summaryRow.systemsContext), total),
      classifications: ratio(number(summaryRow.classifications), total),
      resolvedHeadquarters: ratio(number(summaryRow.resolvedHeadquarters), total),
      publicContacts: ratio(number(summaryRow.publicContacts), total),
      evidenceCoverage: ratio(number(summaryRow.evidenceScoreTotal), evidenceDenominator),
      strongEvidence: ratio(number(summaryRow.strongEvidence), total),
      unknownCounts: {
        ecosystemDomain: number(summaryRow.unknownDomain),
        organisationSubtype: number(summaryRow.unknownSubtype),
        ecosystemRole: number(summaryRow.unknownRole),
        businessStage: number(summaryRow.unknownStage),
        technicalLayer: number(summaryRow.unknownLayer),
        capability: number(summaryRow.unknownCapability),
        componentCategory: number(summaryRow.unknownComponent),
        roboticsVertical: number(summaryRow.unknownVertical),
        headquartersState: number(summaryRow.unknownState),
        headquartersCity: number(summaryRow.unknownCity),
        publicContact: number(summaryRow.unknownContact),
        activeSignal: number(summaryRow.unknownSignals),
        systemsContext: number(summaryRow.unknownSystemsContext),
      },
    },
    geography,
    explorer,
    matrices,
    insights: { denominator: total, items: insights },
  };
}
