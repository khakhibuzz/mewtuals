import { sql, type SQL } from "drizzle-orm";

import {
  activeUntilForSignal,
  isActiveSignal,
  type EcosystemFilters,
} from "../../app/domain/ecosystem-intelligence";
import {
  ECOSYSTEM_INTELLIGENCE_THRESHOLDS,
  ECOSYSTEM_TAXONOMY,
  type EcosystemTaxonomyKind,
} from "../../app/domain/ecosystem-intelligence-taxonomy";
import type { MewtualsDatabase } from "../client";
import {
  candidatePublicSignals,
  candidateResearchVersions,
  discoveryCandidateSources,
} from "../schema";
import {
  activeSignalPredicate,
  publicHttpUrlOrNull,
  timestamp,
  withFilteredCandidates,
} from "./ecosystem-intelligence-query";
import type {
  CountOption,
  EcosystemSnapshot,
} from "./ecosystem-intelligence-types";

type ReadTransaction = Parameters<MewtualsDatabase["transaction"]>[0] extends
  (transaction: infer Transaction) => unknown ? Transaction : never;

const MAX_MOMENTUM_SIGNALS = 25;
const MAX_MOMENTUM_COMPANIES = 10;

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function date(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value === null ? null : date(value);
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
  validPublicContactCandidateIds: readonly string[],
  validPublicRelationshipEvidenceIds: readonly string[],
  validPublicSignalEvidenceIds: readonly string[],
  denominator: number,
): Promise<EcosystemSnapshot["velocity"]> {
  const rows = await transaction.execute<VelocityRow>(withFilteredCandidates(filters, now, validPublicContactCandidateIds, validPublicRelationshipEvidenceIds, validPublicSignalEvidenceIds, sql`
    , windows(days) as (values (7), (30), (90)),
    candidate_activity as (
      select candidate.*,
        greatest(
          candidate.discovered_at,
          coalesce((select max(source.last_seen_at) from ${discoveryCandidateSources} source where source.candidate_id = candidate.id), '-infinity'::timestamptz),
          coalesce((select max(research.created_at) from ${candidateResearchVersions} research where research.candidate_id = candidate.id), '-infinity'::timestamptz)
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

type MomentumSignalRow = {
  id: string;
  candidateId: string;
  candidateName: string;
  signalType: string;
  title: string;
  occurredAt: Date | string;
  expiresAt: Date | string | null;
  sourceUrl: string;
  confidence: number;
};

type MomentumAggregateRow = {
  activeSignalCount: number;
  organisationCount: number;
  categories: Array<{ key: string; count: number }> | null;
  companies: Array<{ key: string; label: string; count: number }> | null;
  signals: MomentumSignalRow[] | null;
};

async function loadMomentum(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  validPublicContactCandidateIds: readonly string[],
  validPublicRelationshipEvidenceIds: readonly string[],
  validPublicSignalEvidenceIds: readonly string[],
  denominator: number,
): Promise<EcosystemSnapshot["momentum"]> {
  const [row] = await transaction.execute<MomentumAggregateRow>(withFilteredCandidates(filters, now, validPublicContactCandidateIds, validPublicRelationshipEvidenceIds, validPublicSignalEvidenceIds, sql`
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
      count(*)::integer as "activeSignalCount",
      count(distinct candidate_id)::integer as "organisationCount",
      coalesce((
        select jsonb_agg(
          jsonb_build_object('key', category.signal_type, 'count', category.count)
          order by category.count desc, category.signal_type
        )
        from (
          select signal_type, count(*)::integer as count
          from active_signals
          group by signal_type
        ) category
      ), '[]'::jsonb) as "categories",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'key', company.candidate_id,
            'label', company.candidate_name,
            'count', company.count
          )
          order by company.count desc, company.candidate_name, company.candidate_id
        )
        from (
          select
            candidate_id,
            min(candidate_name) as candidate_name,
            count(*)::integer as count
          from active_signals
          group by candidate_id
          order by count desc, min(candidate_name), candidate_id
          limit ${MAX_MOMENTUM_COMPANIES}
        ) company
      ), '[]'::jsonb) as "companies",
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', recent_signal.id,
            'candidateId', recent_signal.candidate_id,
            'candidateName', recent_signal.candidate_name,
            'signalType', recent_signal.signal_type,
            'title', recent_signal.title,
            'occurredAt', recent_signal.occurred_at,
            'expiresAt', recent_signal.expires_at,
            'sourceUrl', recent_signal.source_url,
            'confidence', recent_signal.confidence
          )
          order by recent_signal.occurred_at desc, recent_signal.id
        )
        from (
          select *
          from active_signals
          order by occurred_at desc, id
          limit ${MAX_MOMENTUM_SIGNALS}
        ) recent_signal
      ), '[]'::jsonb) as "signals"
    from active_signals
  `));
  const activeSignalCount = number(row?.activeSignalCount);
  const organisationCount = number(row?.organisationCount);
  const threshold = ECOSYSTEM_INTELLIGENCE_THRESHOLDS.momentum;
  const ready = activeSignalCount >= threshold.minimumSignals
    && organisationCount >= threshold.minimumOrganisations;
  const signals = (row?.signals ?? []).flatMap((signal) => {
    const signalInput = {
      type: signal.signalType as Parameters<typeof activeUntilForSignal>[0]["type"],
      occurredAt: date(signal.occurredAt),
      expiresAt: nullableDate(signal.expiresAt),
    };
    const activeUntil = activeUntilForSignal(signalInput);
    const sourceUrl = publicHttpUrlOrNull(signal.sourceUrl);
    return activeUntil && isActiveSignal(signalInput, now) && sourceUrl ? [{
      id: signal.id,
      candidateId: signal.candidateId,
      candidateName: signal.candidateName,
      type: signal.signalType,
      title: signal.title,
      occurredAt: date(signal.occurredAt),
      expiresAt: nullableDate(signal.expiresAt),
      activeUntil,
      sourceUrl,
      confidence: number(signal.confidence),
    }] : [];
  });

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
      ? (row?.categories ?? []).map((category) => ({
          key: category.key,
          label: optionLabel("signal_type", category.key),
          count: number(category.count),
        }))
      : [],
    companies: ready
      ? (row?.companies ?? []).map((company) => ({
          key: company.key,
          label: company.label,
          count: number(company.count),
        }))
      : [],
    signals: ready ? signals : [],
  };
}

export async function loadEcosystemChange(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  validPublicContactCandidateIds: readonly string[],
  validPublicRelationshipEvidenceIds: readonly string[],
  validPublicSignalEvidenceIds: readonly string[],
  denominator: number,
): Promise<Pick<EcosystemSnapshot, "velocity" | "momentum">> {
  return {
    velocity: await loadVelocity(
      transaction,
      filters,
      now,
      validPublicContactCandidateIds,
      validPublicRelationshipEvidenceIds,
      validPublicSignalEvidenceIds,
      denominator,
    ),
    momentum: await loadMomentum(
      transaction,
      filters,
      now,
      validPublicContactCandidateIds,
      validPublicRelationshipEvidenceIds,
      validPublicSignalEvidenceIds,
      denominator,
    ),
  };
}
