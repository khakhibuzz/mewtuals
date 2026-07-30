import { sql } from "drizzle-orm";

import {
  activeUntilForSignal,
  isActiveSignal,
} from "../../app/domain/ecosystem-intelligence";
import type { ClassificationEvidenceState } from "../../app/domain/ecosystem-intelligence-taxonomy";
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
  inferenceValues,
  publicHttpUrlOrNull,
  signalFreshnessValues,
} from "./ecosystem-intelligence-query";
import type {
  EcosystemCandidateDetail,
  EcosystemClassificationDto,
  EcosystemResearchVersionDto,
} from "./ecosystem-intelligence-types";

type ReadTransaction = Parameters<MewtualsDatabase["transaction"]>[0] extends
  (transaction: infer Transaction) => unknown ? Transaction : never;

const MAX_DETAIL_SOURCES = 20;
const MAX_DETAIL_RESEARCH_HISTORY = 20;
const MAX_DETAIL_SIGNALS = 20;
const MAX_DETAIL_RELATIONSHIPS = 20;

function number(value: unknown): number {
  return typeof value === "number" ? value : Number(value ?? 0);
}

function date(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function nullableDate(value: Date | string | null): Date | null {
  return value === null ? null : date(value);
}

function publicUrls(values: readonly string[]): string[] {
  return values.flatMap((value) => {
    const url = publicHttpUrlOrNull(value);
    return url ? [url] : [];
  });
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
type DetailSignalRow = {
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
  sortAt: Date | string;
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
  validPublicRelationshipEvidenceIds: readonly string[],
  validPublicSignalEvidenceIds: readonly string[],
  researchOffset: number,
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
      join inferred_rules inference
        on regexp_replace(lower(btrim(candidate.category)), '[[:space:]]+', ' ', 'g') = inference.category
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
  const validPublicSignalEvidenceIdsJson = JSON.stringify(validPublicSignalEvidenceIds);
  const signalRows = await transaction.execute<DetailSignalRow>(sql`
    with valid_public_signal_evidence_ids(id) as (
      select value::uuid
      from jsonb_array_elements_text(${validPublicSignalEvidenceIdsJson}::jsonb)
    ),
    signal_freshness(signal_type, freshness_days) as (values ${signalFreshnessValues})
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
  const validPublicRelationshipEvidenceIdsJson = JSON.stringify(validPublicRelationshipEvidenceIds);
  const relationships = await transaction.execute<DetailRelationshipRow>(sql`
    with valid_public_relationship_evidence_ids(id) as (
      select value::uuid
      from jsonb_array_elements_text(${validPublicRelationshipEvidenceIdsJson}::jsonb)
    )
    select * from (
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
        relationship.observed_at as "observedAt",
        coalesce(relationship.observed_at, relationship.created_at) as "sortAt"
      from ${candidateRelationships} relationship
      join ${discoveryCandidates} source_candidate
        on source_candidate.id = relationship.source_candidate_id
      left join ${discoveryCandidates} target_candidate
        on target_candidate.id = relationship.target_candidate_id
      where relationship.source_candidate_id = ${candidateId}
        and exists (
          select 1 from valid_public_relationship_evidence_ids valid_relationship
          where valid_relationship.id = relationship.id
        )
      union all
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
        relationship.observed_at,
        coalesce(relationship.observed_at, relationship.created_at)
      from ${candidateRelationships} relationship
      join ${discoveryCandidates} source_candidate
        on source_candidate.id = relationship.source_candidate_id
      join ${discoveryCandidates} target_candidate
        on target_candidate.id = relationship.target_candidate_id
      where relationship.target_candidate_id = ${candidateId}
        and exists (
          select 1 from valid_public_relationship_evidence_ids valid_relationship
          where valid_relationship.id = relationship.id
        )
    ) evidenced_relationship
    order by "sortAt" desc, "direction", "id"
    limit ${MAX_DETAIL_RELATIONSHIPS}
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
  const [currentResearch] = await transaction.execute<DetailResearchRow>(sql`
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
    limit 1
  `);
  const [researchCount] = await transaction.execute<{ historyTotal: number }>(sql`
    select greatest(count(*) - 1, 0)::integer as "historyTotal"
    from ${candidateResearchVersions} research
    where research.candidate_id = ${candidateId}
  `);
  const researchHistory = await transaction.execute<DetailResearchRow>(sql`
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
    offset ${researchOffset + 1}
    limit ${MAX_DETAIL_RESEARCH_HISTORY}
  `);
  const signalDtos = signalRows.flatMap((row) => {
    const input = {
      type: row.signalType as Parameters<typeof activeUntilForSignal>[0]["type"],
      occurredAt: date(row.occurredAt),
      expiresAt: nullableDate(row.expiresAt),
    };
    const activeUntil = activeUntilForSignal(input);
    const sourceUrl = publicHttpUrlOrNull(row.sourceUrl);
    return activeUntil && isActiveSignal(input, now) && sourceUrl ? [{
      id: row.id,
      candidateId: row.candidateId,
      candidateName: row.candidateName,
      type: row.signalType,
      title: row.title,
      occurredAt: date(row.occurredAt),
      expiresAt: nullableDate(row.expiresAt),
      activeUntil,
      sourceUrl,
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
      canonical: publicHttpUrlOrNull(identity.canonicalUrl),
      website: publicHttpUrlOrNull(identity.websiteUrl),
      linkedin: publicHttpUrlOrNull(identity.linkedinUrl),
      primarySocial: publicHttpUrlOrNull(identity.primarySocialUrl),
    },
    classifications: classifications.map((classification) => ({
      ...classification,
      confidence: classification.confidence === null ? null : number(classification.confidence),
      sourceUrls: publicUrls(classification.sourceUrls ?? []),
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
      sourceUrls: publicUrls(headquarters.sourceUrls ?? []),
    } : null,
    signals: signalDtos,
    relationships: relationships.flatMap((relationship) => {
      const evidenceUrl = publicHttpUrlOrNull(relationship.evidenceUrl);
      return evidenceUrl ? [{
        id: relationship.id,
        direction: relationship.direction,
        sourceCandidateId: relationship.sourceCandidateId,
        sourceName: relationship.sourceName,
        targetCandidateId: relationship.targetCandidateId,
        targetName: relationship.targetName,
        type: relationship.relationshipType,
        evidenceUrl,
        confidence: number(relationship.confidence),
        observedAt: nullableDate(relationship.observedAt),
      }] : [];
    }),
    sources: sources.flatMap((source) => {
      const sourceUrl = publicHttpUrlOrNull(source.sourceUrl);
      return sourceUrl ? [{
        ...source,
        sourceUrl,
        firstSeenAt: date(source.firstSeenAt),
        lastSeenAt: date(source.lastSeenAt),
      }] : [];
    }),
    research: {
      current: currentResearch ? {
        ...currentResearch,
        sourceUrls: publicUrls(currentResearch.sourceUrls),
        createdAt: date(currentResearch.createdAt),
      } : null,
      history: researchHistory.map((version) => ({
        ...version,
        sourceUrls: publicUrls(version.sourceUrls),
        createdAt: date(version.createdAt),
      })),
      historyPage: {
        total: number(researchCount?.historyTotal),
        offset: researchOffset,
        limit: MAX_DETAIL_RESEARCH_HISTORY,
        hasMore: researchOffset + researchHistory.length < number(researchCount?.historyTotal),
        nextOffset: researchOffset + researchHistory.length < number(researchCount?.historyTotal)
          ? researchOffset + researchHistory.length
          : null,
      },
    },
  };
}

export { loadCandidateDetail };
