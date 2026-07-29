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

describe("Global Radar PostgreSQL constraints", () => {
  afterAll(async () => {
    await sql.end({ timeout: 5 });
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
          'scoring-v1',
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
});
