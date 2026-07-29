import { asc, desc, sql, type SQL } from "drizzle-orm";

import {
  calculateEvidenceCoverage,
  type EcosystemFilters,
  type EvidenceCoverage,
} from "../../app/domain/ecosystem-intelligence";
import {
  ECOSYSTEM_INTELLIGENCE_THRESHOLDS,
  ECOSYSTEM_TAXONOMY,
  normalizeIndiaCity,
  type ClassificationEvidenceState,
} from "../../app/domain/ecosystem-intelligence-taxonomy";
import type { MewtualsDatabase } from "../client";
import {
  candidatePublicSignals,
  candidateResearchVersions,
  discoveryCandidateSources,
} from "../schema";
import {
  activeSignalPredicate,
  classificationKinds,
  publicHttpUrlOrNull,
  sqlList,
  timestamp,
  withFilteredCandidates,
} from "./ecosystem-intelligence-query";
import type {
  CountOption,
  EcosystemClassificationDto,
  EcosystemHeadquartersDto,
  EcosystemSnapshot,
} from "./ecosystem-intelligence-types";

type ReadTransaction = Parameters<MewtualsDatabase["transaction"]>[0] extends
  (transaction: infer Transaction) => unknown ? Transaction : never;

const MAX_FILTER_OPTIONS = 50;

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

function evidenceBandCase(alias: string): SQL {
  const candidate = sql.raw(alias);
  return sql`case
    when ${candidate}.evidence_score >= 80 and ${candidate}.classification_state = 'evidence_backed' then 'strong'
    when ${candidate}.evidence_score >= 60 then 'partial'
    when ${candidate}.evidence_score > 0 then 'limited'
    else 'unknown'
  end`;
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
      (select count(*)::integer from documented_relationships relationship where relationship.source_candidate_id = candidate.id or relationship.target_candidate_id = candidate.id) as "relationshipCount",
      (select source.source_url from ${discoveryCandidateSources} source where source.candidate_id = candidate.id order by source.last_seen_at desc, source.id desc limit 1) as "latestSourceUrl",
      (select research.created_at from ${candidateResearchVersions} research where research.candidate_id = candidate.id order by research.created_at desc, research.id desc limit 1) as "latestResearchAt"
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
      websiteUrl: publicHttpUrlOrNull(row.websiteUrl),
      linkedinUrl: publicHttpUrlOrNull(row.linkedinUrl),
      primarySocialUrl: publicHttpUrlOrNull(row.primarySocialUrl),
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
    , city_option_counts as (
      select coalesce(city_key, 'unknown') as key, count(*)::integer as count
      from filtered_candidates
      where city_key is null or (
        length(btrim(city_key)) <= 100
        and lower(btrim(city_key)) ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
        and lower(btrim(city_key)) not in ('__proto__', 'prototype', 'constructor')
      )
      group by coalesce(city_key, 'unknown')
    ),
    ranked_known_city_options as (
      select key, count, row_number() over (order by count desc, key) as option_rank
      from city_option_counts
      where key <> 'unknown'
    ),
    city_options as (
      select key, count
      from ranked_known_city_options
      where option_rank <= ${MAX_FILTER_OPTIONS} - case
        when exists (select 1 from city_option_counts where key = 'unknown') then 1
        else 0
      end
      union all
      select key, count from city_option_counts where key = 'unknown'
    )
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
    select 'headquarters_city', key, count from city_options
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
  const cityCounts = new Map<string, number>();
  for (const row of rows.filter((option) => option.dimension === "headquarters_city")) {
    const key = row.key === "unknown" ? "unknown" : normalizeIndiaCity(row.key);
    if (!key) continue;
    cityCounts.set(key, (cityCounts.get(key) ?? 0) + number(row.count));
  }
  const cityOptions = [...cityCounts].map(([key, optionCount]) => ({
    key,
    label: key,
    count: optionCount,
  })).sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));
  return {
    denominator,
    participantTypes: simpleOptions("participant_type", ["company", "creator"], { company: "Companies", creator: "Creators" }),
    reviewStatuses: simpleOptions("review_status", ["discovered", "shortlisted", "queued_for_profile", "rejected"]),
    taxonomy,
    headquartersStates: simpleOptions("headquarters_state", stateKeys),
    headquartersCities: cityOptions,
    activeSignalTypes: [
      ...ECOSYSTEM_TAXONOMY.termsByKind.signal_type.map((term) => ({ key: term.key, label: term.label, count: count("active_signal_type", term.key) })),
      ...(count("active_signal_type", "unknown") > 0 ? [{ key: "unknown", label: "Unknown", count: count("active_signal_type", "unknown") }] : []),
    ],
    publicContacts: simpleOptions("public_contact", ["available", "missing"], { available: "Available", missing: "Missing" }),
    evidenceCoverageBands: simpleOptions("evidence_coverage", ["strong", "partial", "limited", "unknown"]),
    evidenceFreshness: simpleOptions("evidence_freshness", ["current", "stale", "unknown"]),
  };
}


export async function loadEcosystemDirectory(
  transaction: ReadTransaction,
  filters: EcosystemFilters,
  now: Date,
  denominator: number,
): Promise<Pick<EcosystemSnapshot, "ledger" | "filterOptions">> {
  return {
    ledger: await loadLedger(transaction, filters, now, denominator),
    filterOptions: await loadFilterOptions(transaction, filters, now, denominator),
  };
}
