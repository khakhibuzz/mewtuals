import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Global Radar schema tests.");
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });
const hash = "a".repeat(64);

async function withinRollback(test: () => Promise<void>) {
  await sql`begin`;
  try {
    await test();
  } finally {
    await sql`rollback`;
  }
}

async function insertQueuedRun() {
  const [run] = await sql<{ id: string }[]>`
    insert into global_radar_runs (
      external_run_key,
      request_hash,
      trigger,
      scan_mode,
      status,
      plan_fingerprint,
      plan_snapshot,
      prompt_version,
      schema_version,
      taxonomy_version,
      scoring_version
    ) values (
      ${`radar-schema-test-${randomUUID()}`},
      ${hash},
      'scheduled',
      'daily',
      'queued',
      ${hash},
      '{}'::jsonb,
      'prompt-v1',
      'schema-v1',
      'taxonomy-v1',
      'scoring-v1'
    )
    returning id
  `;
  if (!run) throw new Error("Expected a queued Radar run fixture.");
  return run.id;
}

async function insertGlobalEntity() {
  const [entity] = await sql<{ id: string }[]>`
    insert into global_entities (
      canonical_name,
      normalized_name,
      public_identity_anchor,
      headquarters_country,
      organisation_type,
      sector,
      short_description
    ) values (
      'Schema Fixture Robotics',
      'schema fixture robotics',
      ${hash},
      'India',
      'company',
      'robotics',
      'A database constraint fixture.'
    )
    returning id
  `;
  if (!entity) throw new Error("Expected a Global Entity fixture.");
  return entity.id;
}

const validDirectScoreEvidenceSnapshot = {
  snapshotVersion: "global-radar-active-score-snapshot-v2",
  evidenceVersion: "global-radar-score-evidence-v1",
  scoreAsOf: "2026-07-29T10:00:00.000Z",
  evidenceBoundaryOrdinal: 1,
  evidenceSetCount: 1,
  evidenceSetDigest: hash,
  scoreInputDigest: hash,
  signalClass: "direct_demand",
  signalType: "supplier_search",
  indiaRelevanceType: "globally_open",
  scorePolicyVersion: "global-radar-score-v1",
  momentumPolicyVersion: null,
  assessmentAuthority: "worker",
  componentEvidence: [{}],
} as const;

const validMomentumScoreEvidenceSnapshot = {
  ...validDirectScoreEvidenceSnapshot,
  signalClass: "ecosystem_momentum",
  signalType: "ecosystem_activity",
  indiaRelevanceType: "inferred_India_compatible",
  momentumPolicyVersion: "global-radar-momentum-v1",
} as const;

type MutablePartial<Value> = {
  -readonly [Key in keyof Value]?: Value[Key];
};

const snapshotWithoutAssessmentAuthority: MutablePartial<
  typeof validDirectScoreEvidenceSnapshot
> = { ...validDirectScoreEvidenceSnapshot };
delete snapshotWithoutAssessmentAuthority.assessmentAuthority;
const snapshotWithoutVersion: MutablePartial<
  typeof validDirectScoreEvidenceSnapshot
> = { ...validDirectScoreEvidenceSnapshot };
delete snapshotWithoutVersion.snapshotVersion;
const snapshotWithoutScoreInputDigest: MutablePartial<
  typeof validDirectScoreEvidenceSnapshot
> = { ...validDirectScoreEvidenceSnapshot };
delete snapshotWithoutScoreInputDigest.scoreInputDigest;

const invalidScoreEvidenceSnapshots = [
  ["JSON null", null],
  ["a JSON scalar", "not-a-snapshot"],
  [
    "a missing assessment authority",
    snapshotWithoutAssessmentAuthority,
  ],
  ["a missing score-input digest", snapshotWithoutScoreInputDigest],
  [
    "a null assessment authority",
    {
      ...validDirectScoreEvidenceSnapshot,
      assessmentAuthority: null,
    },
  ],
  [
    "a missing snapshot version",
    snapshotWithoutVersion,
  ],
  [
    "a null score-policy version",
    {
      ...validDirectScoreEvidenceSnapshot,
      scorePolicyVersion: null,
    },
  ],
  [
    "a mismatched signal type",
    {
      ...validDirectScoreEvidenceSnapshot,
      signalType: "procurement",
    },
  ],
  [
    "a mismatched India relevance type",
    {
      ...validDirectScoreEvidenceSnapshot,
      indiaRelevanceType: "explicit_India",
    },
  ],
] as const;

async function insertDirectSignalWithSnapshot(snapshot: postgres.JSONValue) {
  const runId = await insertQueuedRun();
  const entityId = await insertGlobalEntity();
  const [signal] = await sql<{ id: string }[]>`
    insert into global_radar_signals (
      global_entity_id,
      signal_class,
      demand_domain,
      signal_type,
      title,
      factual_summary,
      interpretation_summary,
      theme,
      source_country,
      industry,
      india_relevance_type,
      india_relevance_rationale,
      india_fit_confidence,
      score_coverage,
      score_policy_version,
      score_evidence_snapshot,
      observed_at,
      evergreen,
      source_language,
      extraction_method,
      taxonomy_version,
      dedupe_key,
      dedupe_version,
      first_run_id,
      most_recent_run_id
    ) values (
      ${entityId},
      'direct_demand',
      'robotics_hardware',
      'supplier_search',
      'Robotics supplier search',
      'A buyer is searching for a robotics supplier.',
      'The signal represents direct external demand.',
      'physical_ai',
      'United States',
      'robotics',
      'globally_open',
      'The published request accepts international suppliers.',
      80,
      0,
      'global-radar-score-v1',
      coalesce(${sql.json(snapshot)}::jsonb, 'null'::jsonb),
      '2026-07-29T10:00:00Z',
      false,
      'en',
      'codex_public_web',
      'global-radar-v1',
      ${hash},
      'global-radar-dedupe-v1',
      ${runId},
      ${runId}
    )
    returning id
  `;
  if (!signal) throw new Error("Expected a Global Radar signal fixture.");
  return signal.id;
}

describe("Global Radar PostgreSQL constraints", () => {
  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  it.each(invalidScoreEvidenceSnapshots)(
    "rejects %s active score-evidence snapshot",
    async (_description, snapshot) => {
      await withinRollback(async () => {
        await expect(
          insertDirectSignalWithSnapshot(snapshot),
        ).rejects.toMatchObject({
          code: "23514",
          constraint_name:
            "global_radar_signals_score_evidence_snapshot_check",
        });
      });
    },
  );

  it("enforces positive per-signal evidence ingest ordinals and uniqueness", async () => {
    await withinRollback(async () => {
      const signalId = await insertDirectSignalWithSnapshot(
        validDirectScoreEvidenceSnapshot,
      );
      const insertEvidence = (
        ingestOrdinal: number,
        evidenceFingerprint: string,
      ) => sql`
        insert into global_signal_evidence (
          signal_id,
          ingest_ordinal,
          source_url,
          canonical_source_url,
          source_name,
          source_type,
          source_language,
          source_country,
          source_family,
          evidence_claim,
          english_summary,
          observed_at,
          evidence_confidence,
          is_primary_source,
          is_syndicated,
          supports_direct_demand,
          supports_india_relevance,
          evidence_fingerprint,
          supported_field_paths
        ) values (
          ${signalId},
          ${ingestOrdinal},
          'https://schema-evidence.example/source',
          'https://schema-evidence.example/source',
          'Schema evidence',
          'official_update',
          'en',
          'United States',
          'official_company_material',
          'A public schema constraint fixture.',
          'A public schema constraint fixture.',
          '2026-07-29T10:00:00Z',
          80,
          true,
          false,
          true,
          false,
          ${evidenceFingerprint},
          array['signal.factualSummary']::text[]
        )
      `;
      await insertEvidence(1, "b".repeat(64));
      await expect(insertEvidence(2, "c".repeat(64))).resolves.toBeDefined();
      await expect(insertEvidence(2, "d".repeat(64))).rejects.toMatchObject({
        code: "23505",
        constraint_name: "global_signal_evidence_signal_ordinal_unique",
      });
    });
    await withinRollback(async () => {
      const signalId = await insertDirectSignalWithSnapshot(
        validDirectScoreEvidenceSnapshot,
      );
      await expect(sql`
        insert into global_signal_evidence (
          signal_id,
          ingest_ordinal,
          source_url,
          canonical_source_url,
          source_name,
          source_type,
          source_language,
          source_country,
          source_family,
          evidence_claim,
          english_summary,
          observed_at,
          evidence_confidence,
          is_primary_source,
          is_syndicated,
          supports_direct_demand,
          supports_india_relevance,
          evidence_fingerprint,
          supported_field_paths
        ) values (
          ${signalId}, 0,
          'https://schema-evidence.example/invalid',
          'https://schema-evidence.example/invalid',
          'Invalid schema evidence', 'official_update', 'en',
          'United States', 'official_company_material',
          'A public schema constraint fixture.',
          'A public schema constraint fixture.',
          '2026-07-29T10:00:00Z', 80, true, false, true, false,
          ${"e".repeat(64)}, array['signal.factualSummary']::text[]
        )
      `).rejects.toMatchObject({
        code: "23514",
        constraint_name: "global_signal_evidence_ingest_ordinal_check",
      });
    });
  });

  it("rejects a running run without a lease expiry", async () => {
    await withinRollback(async () => {
      await expect(sql`
        insert into global_radar_runs (
          external_run_key,
          request_hash,
          trigger,
          scan_mode,
          status,
          plan_fingerprint,
          plan_snapshot,
          started_at,
          prompt_version,
          schema_version,
          taxonomy_version,
          scoring_version,
          lease_token_hash
        ) values (
          ${`radar-running-no-expiry-${randomUUID()}`},
          ${hash},
          'scheduled',
          'daily',
          'running',
          ${hash},
          '{}'::jsonb,
          '2026-07-29T10:00:00Z',
          'prompt-v1',
          'schema-v1',
          'taxonomy-v1',
          'scoring-v1',
          ${hash}
        )
      `).rejects.toMatchObject({
        code: "23514",
        constraint_name: "global_radar_runs_lifecycle_check",
      });
    });
  });

  it.each(["succeeded", "partial", "failed"])(
    "rejects a %s run without a completion timestamp",
    async (status) => {
      await withinRollback(async () => {
        await expect(sql`
          insert into global_radar_runs (
            external_run_key,
            request_hash,
            trigger,
            scan_mode,
            status,
            plan_fingerprint,
            plan_snapshot,
            started_at,
            prompt_version,
            schema_version,
            taxonomy_version,
            scoring_version,
            lease_token_hash,
            lease_expires_at,
            submission_hash,
            batch_fingerprint
          ) values (
            ${`radar-terminal-no-completion-${status}-${randomUUID()}`},
            ${hash},
            'scheduled',
            'daily',
            ${status},
            ${hash},
            '{}'::jsonb,
            '2026-07-29T10:00:00Z',
            'prompt-v1',
            'schema-v1',
            'taxonomy-v1',
            'scoring-v1',
            ${hash},
            '2026-07-29T10:30:00Z',
            ${hash},
            ${hash}
          )
        `).rejects.toMatchObject({
          code: "23514",
          constraint_name: "global_radar_runs_lifecycle_check",
        });
      });
    },
  );

  it("rejects a stable public identifier array containing NULL", async () => {
    await withinRollback(async () => {
      await expect(sql`
        insert into global_entities (
          canonical_name,
          normalized_name,
          stable_public_identifiers,
          public_identity_anchor,
          headquarters_country,
          organisation_type,
          sector,
          short_description
        ) values (
          'Null Identifier Robotics',
          'null identifier robotics',
          array['public:lei:abc', null]::text[],
          ${hash},
          'India',
          'company',
          'robotics',
          'A database constraint fixture.'
        )
      `).rejects.toMatchObject({
        code: "23514",
        constraint_name: "global_entities_stable_identifiers_count_check",
      });
    });
  });

  it("rejects a malformed durable public identity anchor", async () => {
    await withinRollback(async () => {
      await expect(sql`
        insert into global_entities (
          canonical_name,
          normalized_name,
          public_identity_anchor,
          headquarters_country,
          organisation_type,
          sector,
          short_description
        ) values (
          'Malformed Anchor Robotics',
          'malformed anchor robotics',
          'not-a-sha256-anchor',
          'India',
          'company',
          'robotics',
          'A database constraint fixture.'
        )
      `).rejects.toMatchObject({
        code: "23514",
        constraint_name: "global_entities_public_identity_anchor_check",
      });
    });
  });

  it("rejects a partially populated systems context", async () => {
    await withinRollback(async () => {
      const runId = await insertQueuedRun();
      const entityId = await insertGlobalEntity();

      await expect(sql`
        insert into global_radar_signals (
          global_entity_id,
          signal_class,
          demand_domain,
          signal_type,
          title,
          factual_summary,
          interpretation_summary,
          theme,
          systems_context_summary,
          systems_context_stack_type,
          lower_level_inputs_required,
          factual_elements,
          inferred_elements,
          source_country,
          industry,
          india_relevance_type,
          india_relevance_rationale,
          india_fit_confidence,
          demand_explicitness,
          evidence_confidence,
          freshness,
          actionability,
          india_fit,
          commercial_potential,
          repeatability,
          response_accessibility,
          strategic_learning,
          compliance_complexity,
          direct_demand_score,
          score_coverage,
          score_policy_version,
          score_evidence_snapshot,
          observed_at,
          evergreen,
          source_language,
          extraction_method,
          taxonomy_version,
          dedupe_key,
          dedupe_version,
          first_run_id,
          most_recent_run_id
        ) values (
          ${entityId},
          'direct_demand',
          'robotics_hardware',
          'supplier_search',
          'Robotics supplier search',
          'A buyer is searching for a robotics supplier.',
          'The signal represents direct external demand.',
          'physical_ai',
          'Only the fields already guarded by explicit non-null checks are populated.',
          'hardware',
          array['robot actuator']::text[],
          array['The request names a robot actuator.']::text[],
          array[]::text[],
          'United States',
          'robotics',
          'globally_open',
          'The published request accepts international suppliers.',
          80,
          80,
          80,
          80,
          80,
          80,
          80,
          80,
          80,
          80,
          20,
          80,
          100,
          'global-radar-score-v1',
          ${sql.json(validDirectScoreEvidenceSnapshot)}::jsonb,
          '2026-07-29T10:00:00Z',
          false,
          'en',
          'codex_public_web',
          'taxonomy-v1',
          ${hash},
          'dedupe-v1',
          ${runId},
          ${runId}
        )
      `).rejects.toMatchObject({
        code: "23514",
        constraint_name: "global_radar_signals_systems_context_check",
      });
    });
  });

  it("rejects an ecosystem momentum record with a single owning entity", async () => {
    await withinRollback(async () => {
      const runId = await insertQueuedRun();
      const entityId = await insertGlobalEntity();

      await expect(sql`
        insert into global_radar_signals (
          global_entity_id,
          signal_class,
          demand_domain,
          signal_type,
          title,
          factual_summary,
          interpretation_summary,
          theme,
          source_country,
          industry,
          india_relevance_type,
          india_relevance_rationale,
          india_fit_confidence,
          momentum_independent_entity_count,
          momentum_primary_source_count,
          momentum_source_family_count,
          momentum_volume_7_days,
          momentum_volume_30_days,
          momentum_volume_90_days,
          momentum_independent_entity_breadth,
          momentum_primary_source_depth,
          momentum_source_diversity,
          momentum_weighted_volume,
          momentum_growth_vs_previous_period,
          momentum_taxonomy_consistency,
          momentum_evidence_quality,
          momentum_score,
          score_coverage,
          score_policy_version,
          score_evidence_snapshot,
          momentum_policy_version,
          momentum_qualification_gates_passed,
          observed_at,
          source_language,
          extraction_method,
          taxonomy_version,
          dedupe_key,
          dedupe_version,
          first_run_id,
          most_recent_run_id
        ) values (
          ${entityId},
          'ecosystem_momentum',
          'robotics_hardware',
          'ecosystem_activity',
          'Robotics ecosystem activity',
          'Several independent robotics groups published related activity.',
          'The activity is an ecosystem-level signal without one owning entity.',
          'physical_ai',
          'United States',
          'robotics',
          'inferred_India_compatible',
          'Indian execution capabilities may fit the observed direction.',
          60,
          3,
          2,
          2,
          3,
          5,
          7,
          80,
          80,
          80,
          75,
          60,
          80,
          80,
          78,
          100,
          'global-radar-score-v1',
          ${sql.json(validMomentumScoreEvidenceSnapshot)}::jsonb,
          'global-radar-momentum-v1',
          true,
          '2026-07-29T10:00:00Z',
          'en',
          'codex_public_web',
          'global-radar-v1',
          ${hash},
          'global-radar-dedupe-v1',
          ${runId},
          ${runId}
        )
      `).rejects.toMatchObject({
        code: "23514",
        constraint_name: "global_radar_signals_class_matrix_check",
      });
    });
  });
});
