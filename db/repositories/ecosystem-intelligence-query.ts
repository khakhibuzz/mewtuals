import { sql, type SQL } from "drizzle-orm";

import { normalizePublicDiscoveryUrl } from "../../app/domain/discovery";
import type { EcosystemFilters } from "../../app/domain/ecosystem-intelligence";
import {
  CATEGORY_CLASSIFICATION_INFERENCES,
  ECOSYSTEM_INTELLIGENCE_THRESHOLDS,
  ECOSYSTEM_TAXONOMY,
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

export const classificationKinds = ECOSYSTEM_TAXONOMY.kinds.filter(
  (kind): kind is Exclude<EcosystemTaxonomyKind, "signal_type" | "relationship_type"> =>
    kind !== "signal_type" && kind !== "relationship_type",
);

const inferenceRows = Object.entries(CATEGORY_CLASSIFICATION_INFERENCES).flatMap(
  ([category, classifications]) => classifications.map((classification) => ({
    category,
    kind: classification.kind,
    termKey: classification.termKey,
  })),
);

export const inferenceValues = sql.join(
  inferenceRows.map((row) => sql`(${row.category}, ${row.kind}, ${row.termKey})`),
  sql`, `,
);

export const signalFreshnessValues = sql.join(
  ECOSYSTEM_TAXONOMY.termsByKind.signal_type.map((signal) =>
    sql`(${signal.key}::text, ${signal.defaultFreshnessDays}::integer)`,
  ),
  sql`, `,
);

export function sqlList(values: readonly string[]): SQL {
  return sql.join(values.map((value) => sql`${value}`), sql`, `);
}

export function timestamp(value: Date): SQL {
  return sql`${value.toISOString()}::timestamptz`;
}

export function publicHttpUrlOrNull(value: string | null): string | null {
  if (!value) return null;
  try {
    return normalizePublicDiscoveryUrl(value);
  } catch {
    return null;
  }
}

type ReadTransaction = Parameters<MewtualsDatabase["transaction"]>[0] extends
  (transaction: infer Transaction) => unknown ? Transaction : never;

type PublicContactCandidateRow = {
  id: string;
  type: "company" | "creator";
  websiteUrl: string | null;
  linkedinUrl: string | null;
  primarySocialUrl: string | null;
};

function hasValidPublicContact(candidate: PublicContactCandidateRow): boolean {
  const urls = candidate.type === "creator"
    ? [candidate.websiteUrl, candidate.linkedinUrl, candidate.primarySocialUrl]
    : [candidate.websiteUrl, candidate.linkedinUrl];
  return urls.some((url) => publicHttpUrlOrNull(url) !== null);
}

export async function loadValidPublicContactCandidateIds(
  transaction: ReadTransaction,
  analysisVersion: EcosystemFilters["analysisVersion"],
): Promise<string[]> {
  // This is intentionally one uncapped, set-based, URL-only read inside the
  // snapshot's repeatable-read transaction. Every contact-dependent filter,
  // score, metric, and ledger row then derives from this exact domain-validated
  // ID set. No descriptions, metadata, research content, or page data is read.
  const rows = await transaction.execute<PublicContactCandidateRow>(sql`
    select
      candidate.id as "id",
      candidate.type::text as "type",
      candidate.website_url as "websiteUrl",
      candidate.linkedin_url as "linkedinUrl",
      candidate.primary_social_url as "primarySocialUrl"
    from ${discoveryCandidates} candidate
    where exists (
      select 1 from ${candidateResearchVersions} research
      where research.candidate_id = candidate.id
        and research.analysis_version = ${analysisVersion}
    )
    order by candidate.id
  `);
  return rows.filter(hasValidPublicContact).map(({ id }) => id);
}

type PublicRelationshipEvidenceRow = {
  id: string;
  evidenceUrl: string;
};

export async function loadValidPublicRelationshipEvidenceIds(
  transaction: ReadTransaction,
): Promise<string[]> {
  // Relationship evidence uses the same exact domain validator as candidate
  // contact URLs. This uncapped preliminary read deliberately selects only the
  // durable relationship identity and evidence URL.
  const rows = await transaction.execute<PublicRelationshipEvidenceRow>(sql`
    select
      relationship.id as "id",
      relationship.evidence_url as "evidenceUrl"
    from ${candidateRelationships} relationship
    order by relationship.id
  `);
  return rows
    .filter(({ evidenceUrl }) => publicHttpUrlOrNull(evidenceUrl) !== null)
    .map(({ id }) => id);
}

export function activeSignalPredicate(alias: string, now: Date): SQL {
  const signal = sql.raw(alias);
  return sql`${signal}.occurred_at <= ${timestamp(now)}
    and least(
      coalesce(${signal}.expires_at, 'infinity'::timestamptz),
      ${signal}.occurred_at + make_interval(days => signal_freshness.freshness_days)
    ) > ${timestamp(now)}`;
}

function taxonomyFilter(
  kind: Exclude<EcosystemTaxonomyKind, "signal_type" | "relationship_type">,
  values: readonly string[],
): SQL | undefined {
  if (values.length === 0) return undefined;
  const known = values.filter((value) => value !== "unknown");
  const includesUnknown = values.includes("unknown");
  const predicates: SQL[] = [];
  if (known.length > 0) {
    predicates.push(sql`exists (
      select 1 from effective_classifications filter_classification
      where filter_classification.candidate_id = candidate_rollup.id
        and filter_classification.kind = ${kind}
        and filter_classification.term_key in (${sqlList(known)})
    )`);
  }
  if (includesUnknown) {
    predicates.push(sql`not exists (
      select 1 from effective_classifications filter_classification
      where filter_classification.candidate_id = candidate_rollup.id
        and filter_classification.kind = ${kind}
    )`);
  }
  return sql`(${sql.join(predicates, sql` or `)})`;
}

function locationFilter(column: "state_key" | "city_key", values: readonly string[]): SQL | undefined {
  if (values.length === 0) return undefined;
  const known = values.filter((value) => value !== "unknown");
  const predicates: SQL[] = [];
  if (known.length > 0) {
    predicates.push(sql`${sql.raw(`candidate_rollup.${column}`)} in (${sqlList(known)})`);
  }
  if (values.includes("unknown")) {
    predicates.push(sql`${sql.raw(`candidate_rollup.${column}`)} is null`);
  }
  return sql`(${sql.join(predicates, sql` or `)})`;
}

function activeSignalFilter(values: readonly string[], now: Date): SQL | undefined {
  if (values.length === 0) return undefined;
  const known = values.filter((value) => value !== "unknown");
  const activeExists = (types?: readonly string[]) => sql`exists (
    select 1
    from ${candidatePublicSignals} filter_signal
    join signal_freshness on signal_freshness.signal_type = filter_signal.signal_type
    where filter_signal.candidate_id = candidate_rollup.id
      and ${activeSignalPredicate("filter_signal", now)}
      ${types && types.length > 0 ? sql`and filter_signal.signal_type in (${sqlList(types)})` : sql``}
  )`;
  const predicates: SQL[] = [];
  if (known.length > 0) predicates.push(activeExists(known));
  if (values.includes("unknown")) predicates.push(sql`not ${activeExists()}`);
  return sql`(${sql.join(predicates, sql` or `)})`;
}

function filteredCandidateConditions(filters: EcosystemFilters, now: Date): SQL {
  const conditions: SQL[] = [];
  if (filters.includeEnablers) {
    conditions.push(sql`(
      candidate_rollup.type = ${filters.participantType}
      or exists (
        select 1 from effective_classifications enabler_classification
        where enabler_classification.candidate_id = candidate_rollup.id
          and enabler_classification.kind = 'organisation_subtype'
          and enabler_classification.term_key = 'ecosystem_enabler'
      )
    )`);
  } else {
    conditions.push(sql`candidate_rollup.type = ${filters.participantType}`);
  }
  conditions.push(sql`candidate_rollup.status in (${sqlList(filters.reviewStatuses)})`);

  const taxonomyFacets: Array<[
    Exclude<EcosystemTaxonomyKind, "signal_type" | "relationship_type">,
    readonly string[],
  ]> = [
    ["ecosystem_domain", filters.ecosystemDomains],
    ["organisation_subtype", filters.organisationSubtypes],
    ["ecosystem_role", filters.ecosystemRoles],
    ["business_stage", filters.businessStages],
    ["technical_layer", filters.technicalLayers],
    ["capability", filters.capabilities],
    ["component_category", filters.componentCategories],
    ["robotics_vertical", filters.roboticsVerticals],
  ];
  for (const [kind, values] of taxonomyFacets) {
    const predicate = taxonomyFilter(kind, values);
    if (predicate) conditions.push(predicate);
  }

  const statePredicate = locationFilter("state_key", filters.headquartersStates);
  if (statePredicate) conditions.push(statePredicate);
  const cityPredicate = locationFilter("city_key", filters.headquartersCities);
  if (cityPredicate) conditions.push(cityPredicate);
  const signalPredicate = activeSignalFilter(filters.activeSignalTypes, now);
  if (signalPredicate) conditions.push(signalPredicate);

  if (filters.publicContactAvailability === "available") {
    conditions.push(sql`candidate_rollup.has_public_contact`);
  } else if (
    filters.publicContactAvailability === "missing"
    || filters.publicContactAvailability === "unknown"
  ) {
    conditions.push(sql`not candidate_rollup.has_public_contact`);
  }

  if (filters.evidenceCoverageBand === "strong") {
    conditions.push(sql`candidate_rollup.evidence_score >= 80 and candidate_rollup.classification_state = 'evidence_backed'`);
  } else if (filters.evidenceCoverageBand === "partial") {
    conditions.push(sql`candidate_rollup.evidence_score >= 60 and not (candidate_rollup.evidence_score >= 80 and candidate_rollup.classification_state = 'evidence_backed')`);
  } else if (filters.evidenceCoverageBand === "limited") {
    conditions.push(sql`candidate_rollup.evidence_score between 1 and 59`);
  } else if (filters.evidenceCoverageBand === "unknown") {
    conditions.push(sql`candidate_rollup.evidence_score = 0`);
  }

  if (filters.evidenceFreshness === "current") {
    conditions.push(sql`candidate_rollup.latest_evidence_at >= ${timestamp(now)} - make_interval(days => ${ECOSYSTEM_INTELLIGENCE_THRESHOLDS.staleEvidence.maximumAgeDays}::integer)`);
  } else if (filters.evidenceFreshness === "stale") {
    conditions.push(sql`candidate_rollup.latest_evidence_at < ${timestamp(now)} - make_interval(days => ${ECOSYSTEM_INTELLIGENCE_THRESHOLDS.staleEvidence.maximumAgeDays}::integer)`);
  } else if (filters.evidenceFreshness === "unknown") {
    conditions.push(sql`candidate_rollup.latest_evidence_at is null`);
  }
  if (filters.minimumDiscoveryConfidence !== undefined) {
    conditions.push(sql`candidate_rollup.discovery_score >= ${filters.minimumDiscoveryConfidence}`);
  }
  if (filters.discoveredAfter) {
    conditions.push(sql`candidate_rollup.discovered_at >= ${filters.discoveredAfter}::date`);
  }
  if (filters.discoveredBefore) {
    conditions.push(sql`candidate_rollup.discovered_at < ${filters.discoveredBefore}::date + interval '1 day'`);
  }
  return sql.join(conditions, sql` and `);
}

function filteredCandidatesCte(
  filters: EcosystemFilters,
  now: Date,
  validPublicContactCandidateIds: readonly string[],
  validPublicRelationshipEvidenceIds: readonly string[],
): SQL {
  const validPublicContactCandidateIdsJson = JSON.stringify(validPublicContactCandidateIds);
  const validPublicRelationshipEvidenceIdsJson = JSON.stringify(validPublicRelationshipEvidenceIds);
  const hasPublicContact = sql`exists (
    select 1
    from valid_public_contact_candidate_ids public_contact_candidate
    where public_contact_candidate.id = candidate.id
  )`;
  const classificationState = sql`case
    when exists (
      select 1 from effective_classifications evidence_classification
      where evidence_classification.candidate_id = candidate.id
        and evidence_classification.evidence_state = 'evidence_backed'
    ) then 'evidence_backed'
    when exists (
      select 1 from effective_classifications any_classification
      where any_classification.candidate_id = candidate.id
    ) then 'inferred'
    else 'none'
    end`;

  return sql`
    valid_public_contact_candidate_ids(id) as (
      select value::uuid
      from jsonb_array_elements_text(${validPublicContactCandidateIdsJson}::jsonb)
    ),
    valid_public_relationship_evidence_ids(id) as (
      select value::uuid
      from jsonb_array_elements_text(${validPublicRelationshipEvidenceIdsJson}::jsonb)
    ),
    inferred_rules(category, kind, term_key) as (values ${inferenceValues}),
    signal_freshness(signal_type, freshness_days) as (values ${signalFreshnessValues}),
    effective_classifications as (
      select
        classification.candidate_id,
        classification.kind,
        classification.term_key,
        classification.evidence_state,
        classification.confidence,
        classification.basis,
        classification.source_urls,
        true as explicit
      from ${candidateEcosystemClassifications} classification
      union all
      select
        candidate.id,
        inference.kind,
        inference.term_key,
        'inferred'::text,
        null::integer,
        ('Inferred from registered Discovery category: ' || candidate.category)::text,
        '[]'::jsonb,
        false
      from ${discoveryCandidates} candidate
      join inferred_rules inference
        on regexp_replace(lower(btrim(candidate.category)), '[[:space:]]+', ' ', 'g') = inference.category
      where not exists (
        select 1 from ${candidateEcosystemClassifications} explicit_classification
        where explicit_classification.candidate_id = candidate.id
          and explicit_classification.kind = inference.kind
          and explicit_classification.term_key = inference.term_key
      )
    ),
    candidate_rollup as (
      select
        candidate.id,
        candidate.type,
        candidate.name,
        candidate.discovered_description,
        candidate.category,
        candidate.subcategory,
        candidate.status,
        candidate.discovery_score,
        candidate.discovered_at,
        candidate.updated_at,
        candidate.canonical_url,
        candidate.website_url,
        candidate.linkedin_url,
        candidate.primary_social_url,
        headquarters.state_key,
        headquarters.state_label,
        headquarters.city_key,
        headquarters.city_label,
        headquarters.latitude_microdegrees,
        headquarters.longitude_microdegrees,
        headquarters.evidence_state as headquarters_evidence_state,
        headquarters.confidence as headquarters_confidence,
        headquarters.source_urls as headquarters_source_urls,
        exists (
          select 1 from ${discoveryCandidateSources} candidate_source
          where candidate_source.candidate_id = candidate.id
        ) as has_candidate_source,
        true as has_systems_context,
        evidence_flags.has_public_contact,
        evidence_flags.classification_state,
        greatest(
          (select max(candidate_source.last_seen_at) from ${discoveryCandidateSources} candidate_source where candidate_source.candidate_id = candidate.id),
          (select max(research.created_at) from ${candidateResearchVersions} research where research.candidate_id = candidate.id)
        ) as latest_evidence_at,
        (
          case when exists (select 1 from ${discoveryCandidateSources} candidate_source where candidate_source.candidate_id = candidate.id) then 20 else 0 end
          + 20
          + case evidence_flags.classification_state when 'evidence_backed' then 20 when 'inferred' then 10 else 0 end
          + case when headquarters.candidate_id is not null then 20 else 0 end
          + case when evidence_flags.has_public_contact then 20 else 0 end
        )::integer as evidence_score
      from ${discoveryCandidates} candidate
      left join ${candidateHeadquarters} headquarters on headquarters.candidate_id = candidate.id
      cross join lateral (
        select
          (${hasPublicContact}) as has_public_contact,
          (${classificationState}) as classification_state
      ) evidence_flags
      where exists (
        select 1 from ${candidateResearchVersions} corpus_research
        where corpus_research.candidate_id = candidate.id
          and corpus_research.analysis_version = ${filters.analysisVersion}
      )
    ),
    filtered_candidates as (
      select * from candidate_rollup
      where ${filteredCandidateConditions(filters, now)}
    ),
    documented_relationships as (
      select relationship.*
      from ${candidateRelationships} relationship
      join filtered_candidates source_candidate
        on source_candidate.id = relationship.source_candidate_id
      where exists (
        select 1
        from valid_public_relationship_evidence_ids public_relationship
        where public_relationship.id = relationship.id
      )
        and (
          relationship.target_candidate_id is null
          or exists (
            select 1 from filtered_candidates target_candidate
            where target_candidate.id = relationship.target_candidate_id
          )
        )
    ),
    drawable_relationships as (
      select relationship.*
      from documented_relationships relationship
      where relationship.target_candidate_id is not null
    )
  `;
}

export function withFilteredCandidates(
  filters: EcosystemFilters,
  now: Date,
  validPublicContactCandidateIds: readonly string[],
  validPublicRelationshipEvidenceIds: readonly string[],
  query: SQL,
): SQL {
  return sql`with ${filteredCandidatesCte(
    filters,
    now,
    validPublicContactCandidateIds,
    validPublicRelationshipEvidenceIds,
  )} ${query}`;
}
