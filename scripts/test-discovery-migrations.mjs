import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = join(projectRoot, "drizzle");
const adminUrl = "postgresql://127.0.0.1:55432/postgres";
const managedDatabaseNames = [
  "mewtuals_discovery_fresh_test",
  "mewtuals_discovery_upgrade_test",
];
const allowedDatabaseNames = new Set(managedDatabaseNames);
const freshDatabaseName = "mewtuals_discovery_fresh_test";
const upgradeDatabaseName = "mewtuals_discovery_upgrade_test";
const ownershipMarker = "mewtuals-discovery-migration-harness-v1";
const createdDatabaseNames = new Set();
const ownedDatabaseNames = new Set();

function assertAllowedDatabaseName(databaseName) {
  if (!allowedDatabaseNames.has(databaseName)) {
    throw new Error(`Refusing to manage non-allowlisted database ${databaseName}.`);
  }
}

function databaseUrl(databaseName) {
  assertAllowedDatabaseName(databaseName);
  return `postgresql://127.0.0.1:55432/${databaseName}`;
}

async function terminateDatabaseConnections(admin, databaseName) {
  assertAllowedDatabaseName(databaseName);
  await admin`
    select pg_terminate_backend(pid)
    from pg_stat_activity
    where datname = ${databaseName}
      and pid <> pg_backend_pid()
  `;
}

async function findDatabase(admin, databaseName) {
  assertAllowedDatabaseName(databaseName);
  const [database] = await admin`
    select
      datname as "databaseName",
      shobj_description(oid, 'pg_database') as "ownershipMarker"
    from pg_database
    where datname = ${databaseName}
  `;
  return database ?? null;
}

async function dropDatabase(admin, databaseName) {
  const database = await findDatabase(admin, databaseName);
  if (!database) return;
  if (
    !createdDatabaseNames.has(databaseName) &&
    database.ownershipMarker !== ownershipMarker
  ) {
    throw new Error(
      `Refusing to drop unowned database ${databaseName}: expected ownership marker ${ownershipMarker}.`,
    );
  }
  await terminateDatabaseConnections(admin, databaseName);
  await admin.unsafe(`drop database "${databaseName}"`);
}

async function createDatabase(admin, databaseName) {
  assertAllowedDatabaseName(databaseName);
  await admin.unsafe(`create database "${databaseName}"`);
  createdDatabaseNames.add(databaseName);
  await admin.unsafe(
    `comment on database "${databaseName}" is '${ownershipMarker}'`,
  );
  ownedDatabaseNames.add(databaseName);
}

async function prepareDatabase(admin, databaseName) {
  const existing = await findDatabase(admin, databaseName);
  if (existing) {
    if (existing.ownershipMarker !== ownershipMarker) {
      throw new Error(
        `Refusing to replace unowned database ${databaseName}: expected ownership marker ${ownershipMarker}.`,
      );
    }
    ownedDatabaseNames.add(databaseName);
    await dropDatabase(admin, databaseName);
  }
  await createDatabase(admin, databaseName);
}

async function createUpgradeMigrationFolder() {
  const temporaryFolder = await mkdtemp(
    join(tmpdir(), "mewtuals-discovery-migrations-"),
  );
  try {
    const metaFolder = join(temporaryFolder, "meta");
    await mkdir(metaFolder);

    const journalPath = join(migrationsFolder, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8"));
    const filteredJournal = {
      ...journal,
      entries: journal.entries.filter(({ idx }) => idx <= 4),
    };
    await writeFile(
      join(metaFolder, "_journal.json"),
      `${JSON.stringify(filteredJournal, null, 2)}\n`,
    );

    for (const entry of filteredJournal.entries) {
      await copyFile(
        join(migrationsFolder, `${entry.tag}.sql`),
        join(temporaryFolder, `${entry.tag}.sql`),
      );
    }
    return temporaryFolder;
  } catch (error) {
    try {
      await rm(temporaryFolder, { recursive: true });
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        `Failed to prepare and clean temporary migration folder ${temporaryFolder}.`,
      );
    }
    throw error;
  }
}

async function insertUpgradeFixtures(sql) {
  const [user] = await sql`
    insert into users (email, name)
    values ('discovery-upgrade@example.test', 'Discovery Upgrade')
    returning id, email, name
  `;
  const [profile] = await sql`
    insert into profiles (
      user_id,
      name,
      identity_kind,
      organisation_name,
      organisation_subtype,
      primary_url,
      website_url,
      status,
      submitted_at,
      verified_at
    ) values (
      ${user.id},
      'Discovery Upgrade',
      'organisation',
      'Discovery Upgrade Private Limited',
      'startup',
      'https://discovery-upgrade.example.test',
      'https://discovery-upgrade.example.test',
      'verified',
      '2026-07-21T08:00:00.000Z',
      '2026-07-21T09:00:00.000Z'
    )
    returning
      id,
      user_id as "userId",
      name,
      organisation_name as "organisationName",
      organisation_subtype as "organisationSubtype",
      primary_url as "primaryUrl",
      website_url as "websiteUrl",
      status,
      submitted_at as "submittedAt",
      verified_at as "verifiedAt"
  `;
  const [review] = await sql`
    insert into verification_reviews (
      profile_id,
      reviewer_email,
      decision,
      notes,
      reviewed_at
    ) values (
      ${profile.id},
      'admin@mewtuals.com',
      'verified',
      'Migration fixture',
      '2026-07-21T09:00:00.000Z'
    )
    returning
      id,
      profile_id as "profileId",
      reviewer_email as "reviewerEmail",
      decision,
      notes,
      reviewed_at as "reviewedAt"
  `;
  const [discoveryRun] = await sql`
    insert into discovery_runs (
      external_run_key,
      trigger,
      status,
      completed_at,
      geography,
      candidate_type,
      requested_count,
      company_percentage
    ) values (
      'upgrade-v1-existing-run',
      'scheduled',
      'succeeded',
      '2026-07-21T10:00:00.000Z',
      'India',
      'both',
      20,
      50
    )
    returning id, external_run_key as "externalRunKey", status
  `;
  return { user, profile, review, discoveryRun };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizedDefinition(value) {
  return value.replace(/\s+/g, " ").trim();
}

function assertExactDefinitions(actualRows, expectedDefinitions, label) {
  const actualDefinitions = Object.fromEntries(
    actualRows.map(({ name, definition }) => [
      name,
      normalizedDefinition(definition),
    ]),
  );
  assert(
    JSON.stringify(actualDefinitions) === JSON.stringify(expectedDefinitions),
    `Expected exact ${label} definitions ${JSON.stringify(expectedDefinitions)}, found ${JSON.stringify(actualDefinitions)}.`,
  );
}

async function assertDiscoveryMigration(sql, expectedFixtures = null) {
  const expectedTables = [
    "candidate_research_versions",
    "discovery_candidate_identifiers",
    "discovery_candidate_sources",
    "discovery_candidates",
    "discovery_runs",
  ];
  const tables = await sql`
    select table_name as "tableName"
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ${sql(expectedTables)}
    order by table_name
  `;
  assert(
    tables.length === expectedTables.length,
    `Expected discovery tables, found ${JSON.stringify(tables)}.`,
  );

  const enumNames = [
    "discovery_candidate_status",
    "discovery_candidate_type",
    "discovery_identifier_kind",
    "discovery_run_candidate_type",
    "discovery_run_status",
    "discovery_run_trigger",
  ];
  const enums = await sql`
    select
      enum_type.typname as name,
      array_agg(enum_value.enumlabel order by enum_value.enumsortorder) as values
    from pg_type enum_type
    join pg_enum enum_value on enum_value.enumtypid = enum_type.oid
    where enum_type.typname in ${sql(enumNames)}
    group by enum_type.typname
    order by enum_type.typname
  `;
  assert(
    JSON.stringify(Object.fromEntries(enums.map(({ name, values }) => [name, values]))) ===
      JSON.stringify({
        discovery_candidate_status: [
          "discovered",
          "shortlisted",
          "rejected",
          "queued_for_profile",
        ],
        discovery_candidate_type: ["company", "creator"],
        discovery_identifier_kind: [
          "canonical",
          "website_host",
          "social_url",
          "linkedin_url",
        ],
        discovery_run_candidate_type: ["company", "creator", "both"],
        discovery_run_status: [
          "queued",
          "running",
          "succeeded",
          "partial",
          "failed",
        ],
        discovery_run_trigger: ["scheduled", "manual", "trial"],
      }),
    `Expected exact discovery enums, found ${JSON.stringify(enums)}.`,
  );

  const columns = await sql`
    select
      table_name as "tableName",
      column_name as "columnName",
      is_nullable as "isNullable",
      column_default as "columnDefault"
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ${sql(expectedTables)}
    order by table_name, ordinal_position
  `;
  const columnsByTable = Object.fromEntries(
    expectedTables.map((tableName) => [
      tableName,
      columns
        .filter((column) => column.tableName === tableName)
        .map((column) => column.columnName),
    ]),
  );
  assert(
    JSON.stringify(columnsByTable) ===
      JSON.stringify({
        candidate_research_versions: [
          "id",
          "candidate_id",
          "discovery_run_id",
          "summary",
          "findings",
          "source_urls",
          "analysis_version",
          "created_at",
        ],
        discovery_candidate_identifiers: [
          "id",
          "candidate_id",
          "candidate_type",
          "kind",
          "normalized_value",
          "created_at",
        ],
        discovery_candidate_sources: [
          "id",
          "candidate_id",
          "discovery_run_id",
          "source_name",
          "source_url",
          "first_seen_at",
          "last_seen_at",
          "raw_metadata",
          "created_at",
        ],
        discovery_candidates: [
          "id",
          "type",
          "name",
          "normalized_name",
          "canonical_identity_key",
          "canonical_url",
          "website_url",
          "primary_social_url",
          "linkedin_url",
          "discovered_description",
          "category",
          "subcategory",
          "geography",
          "first_source_name",
          "first_source_url",
          "discovered_at",
          "last_seen_at",
          "created_at",
          "updated_at",
          "most_recent_run_id",
          "discovery_score",
          "status",
          "raw_metadata",
        ],
        discovery_runs: [
          "id",
          "external_run_key",
          "trigger",
          "status",
          "started_at",
          "completed_at",
          "created_at",
          "updated_at",
          "lease_token_hash",
          "lease_expires_at",
          "submission_hash",
          "geography",
          "candidate_type",
          "sources_used",
          "requested_count",
          "company_percentage",
          "found_count",
          "new_count",
          "duplicate_count",
          "error_summary",
          "requested_by_email",
          "campaign_key",
        ],
      }),
    `Expected exact discovery columns, found ${JSON.stringify(columnsByTable)}.`,
  );
  const nullableColumns = Object.fromEntries(
    expectedTables.map((tableName) => [
      tableName,
      columns
        .filter(
          (column) =>
            column.tableName === tableName && column.isNullable === "YES",
        )
        .map((column) => column.columnName),
    ]),
  );
  assert(
    JSON.stringify(nullableColumns) ===
      JSON.stringify({
        candidate_research_versions: [],
        discovery_candidate_identifiers: [],
        discovery_candidate_sources: [],
        discovery_candidates: [
          "website_url",
          "primary_social_url",
          "linkedin_url",
          "subcategory",
        ],
        discovery_runs: [
          "started_at",
          "completed_at",
          "lease_token_hash",
          "lease_expires_at",
          "submission_hash",
          "requested_by_email",
        ],
      }),
    `Expected exact discovery nullability, found ${JSON.stringify(nullableColumns)}.`,
  );
  const columnDefaults = Object.fromEntries(
    columns
      .filter(({ columnDefault }) => columnDefault !== null)
      .map(({ tableName, columnName, columnDefault }) => [
        `${tableName}.${columnName}`,
        columnDefault,
      ]),
  );
  assert(
    JSON.stringify(columnDefaults) ===
      JSON.stringify({
        "candidate_research_versions.id": "gen_random_uuid()",
        "candidate_research_versions.created_at": "now()",
        "discovery_candidate_identifiers.id": "gen_random_uuid()",
        "discovery_candidate_identifiers.created_at": "now()",
        "discovery_candidate_sources.id": "gen_random_uuid()",
        "discovery_candidate_sources.first_seen_at": "now()",
        "discovery_candidate_sources.last_seen_at": "now()",
        "discovery_candidate_sources.raw_metadata": "'{}'::jsonb",
        "discovery_candidate_sources.created_at": "now()",
        "discovery_candidates.id": "gen_random_uuid()",
        "discovery_candidates.discovered_at": "now()",
        "discovery_candidates.last_seen_at": "now()",
        "discovery_candidates.created_at": "now()",
        "discovery_candidates.updated_at": "now()",
        "discovery_candidates.status":
          "'discovered'::discovery_candidate_status",
        "discovery_candidates.raw_metadata": "'{}'::jsonb",
        "discovery_runs.id": "gen_random_uuid()",
        "discovery_runs.status": "'queued'::discovery_run_status",
        "discovery_runs.created_at": "now()",
        "discovery_runs.updated_at": "now()",
        "discovery_runs.sources_used": "ARRAY[]::text[]",
        "discovery_runs.found_count": "0",
        "discovery_runs.new_count": "0",
        "discovery_runs.duplicate_count": "0",
        "discovery_runs.error_summary": "'{}'::jsonb",
        "discovery_runs.campaign_key": "'general_discovery'::text",
      }),
    `Expected exact discovery defaults, found ${JSON.stringify(columnDefaults)}.`,
  );

  const requiredConstraints = [
    "candidate_research_versions_analysis_check",
    "candidate_research_versions_candidate_run_unique",
    "candidate_research_versions_findings_check",
    "candidate_research_versions_sources_check",
    "candidate_research_versions_summary_check",
    "discovery_candidate_identifiers_type_value_unique",
    "discovery_candidate_sources_evidence_unique",
    "discovery_candidates_id_type_unique",
    "discovery_candidates_score_check",
    "discovery_candidates_type_canonical_identity_unique",
    "discovery_runs_company_percentage_check",
    "discovery_runs_external_run_key_unique",
    "discovery_runs_requested_count_check",
  ];
  const constraints = await sql`
    select constraint_name as "constraintName"
    from information_schema.table_constraints
    where table_schema = 'public'
      and constraint_name in ${sql(requiredConstraints)}
  `;
  assert(
    constraints.length === requiredConstraints.length,
    `Expected discovery constraints, found ${JSON.stringify(constraints)}.`,
  );
  const checkNames = [
    "candidate_research_versions_analysis_check",
    "candidate_research_versions_findings_check",
    "candidate_research_versions_sources_check",
    "candidate_research_versions_summary_check",
    "discovery_candidate_identifiers_value_check",
    "discovery_candidates_name_check",
    "discovery_candidates_score_check",
    "discovery_runs_company_percentage_check",
    "discovery_runs_counts_check",
    "discovery_runs_requested_count_check",
    "discovery_runs_running_lease_check",
  ];
  const checkDefinitions = await sql`
    select conname as name, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and contype = 'c'
      and conname in ${sql(checkNames)}
    order by conname
  `;
  assertExactDefinitions(
    checkDefinitions,
    {
      candidate_research_versions_analysis_check:
        "CHECK (analysis_version = 'physical-ai-v1'::text)",
      candidate_research_versions_findings_check:
        "CHECK (length(findings) >= 600 AND length(findings) <= 12000)",
      candidate_research_versions_sources_check:
        "CHECK (jsonb_typeof(source_urls) = 'array'::text AND jsonb_array_length(source_urls) >= 1 AND jsonb_array_length(source_urls) <= 12)",
      candidate_research_versions_summary_check:
        "CHECK (length(summary) >= 80 AND length(summary) <= 1200)",
      discovery_candidate_identifiers_value_check:
        "CHECK (length(btrim(normalized_value)) > 0)",
      discovery_candidates_name_check:
        "CHECK (length(btrim(name)) > 0 AND length(btrim(normalized_name)) > 0)",
      discovery_candidates_score_check:
        "CHECK (discovery_score >= 0 AND discovery_score <= 100)",
      discovery_runs_company_percentage_check:
        "CHECK (company_percentage >= 0 AND company_percentage <= 100)",
      discovery_runs_counts_check:
        "CHECK (found_count >= 0 AND new_count >= 0 AND duplicate_count >= 0)",
      discovery_runs_requested_count_check:
        "CHECK (requested_count > 0 AND requested_count <= 50)",
      discovery_runs_running_lease_check:
        "CHECK (status <> 'running'::discovery_run_status OR started_at IS NOT NULL AND lease_token_hash IS NOT NULL AND lease_expires_at IS NOT NULL AND completed_at IS NULL)",
    },
    "check constraint",
  );

  const foreignKeyNames = [
    "candidate_research_versions_candidate_fk",
    "candidate_research_versions_run_fk",
    "discovery_candidates_recent_run_fk",
    "discovery_identifiers_candidate_type_fk",
    "discovery_sources_candidate_fk",
    "discovery_sources_run_fk",
  ];
  const foreignKeyDefinitions = await sql`
    select conname as name, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and contype = 'f'
      and conname in ${sql(foreignKeyNames)}
    order by conname
  `;
  assertExactDefinitions(
    foreignKeyDefinitions,
    {
      candidate_research_versions_candidate_fk:
        "FOREIGN KEY (candidate_id) REFERENCES discovery_candidates(id) ON DELETE CASCADE",
      candidate_research_versions_run_fk:
        "FOREIGN KEY (discovery_run_id) REFERENCES discovery_runs(id)",
      discovery_candidates_recent_run_fk:
        "FOREIGN KEY (most_recent_run_id) REFERENCES discovery_runs(id)",
      discovery_identifiers_candidate_type_fk:
        "FOREIGN KEY (candidate_id, candidate_type) REFERENCES discovery_candidates(id, type) ON DELETE CASCADE",
      discovery_sources_candidate_fk:
        "FOREIGN KEY (candidate_id) REFERENCES discovery_candidates(id) ON DELETE CASCADE",
      discovery_sources_run_fk:
        "FOREIGN KEY (discovery_run_id) REFERENCES discovery_runs(id)",
    },
    "foreign key",
  );

  const uniqueNames = [
    "candidate_research_versions_candidate_run_unique",
    "discovery_candidate_identifiers_type_value_unique",
    "discovery_candidate_sources_evidence_unique",
    "discovery_candidates_id_type_unique",
    "discovery_candidates_type_canonical_identity_unique",
    "discovery_runs_external_run_key_unique",
  ];
  const uniqueDefinitions = await sql`
    select conname as name, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and contype = 'u'
      and conname in ${sql(uniqueNames)}
    order by conname
  `;
  assertExactDefinitions(
    uniqueDefinitions,
    {
      candidate_research_versions_candidate_run_unique:
        "UNIQUE (candidate_id, discovery_run_id)",
      discovery_candidate_identifiers_type_value_unique:
        "UNIQUE (candidate_type, normalized_value)",
      discovery_candidate_sources_evidence_unique:
        "UNIQUE (candidate_id, source_name, source_url)",
      discovery_candidates_id_type_unique: "UNIQUE (id, type)",
      discovery_candidates_type_canonical_identity_unique:
        "UNIQUE (type, canonical_identity_key)",
      discovery_runs_external_run_key_unique: "UNIQUE (external_run_key)",
    },
    "unique constraint",
  );

  const [activeRunIndex] = await sql`
    select
      index_definition.indexdef as "indexDefinition",
      pg_get_expr(index_catalog.indexprs, index_catalog.indrelid) as expression,
      pg_get_expr(index_catalog.indpred, index_catalog.indrelid) as predicate,
      index_catalog.indisunique as "isUnique"
    from pg_index index_catalog
    join pg_class index_class on index_class.oid = index_catalog.indexrelid
    join pg_indexes index_definition on index_definition.indexname = index_class.relname
    where index_class.relname = 'discovery_runs_one_running_idx'
      and index_definition.schemaname = 'public'
  `;
  assert(
    activeRunIndex?.isUnique === true &&
      activeRunIndex.expression === "true" &&
      activeRunIndex.predicate ===
        "(status = 'running'::discovery_run_status)" &&
      activeRunIndex.indexDefinition ===
        "CREATE UNIQUE INDEX discovery_runs_one_running_idx ON public.discovery_runs USING btree ((true)) WHERE (status = 'running'::discovery_run_status)",
    `Expected exact partial active-run index, found ${JSON.stringify(activeRunIndex ?? null)}.`,
  );
  const [sourceFirstIndex] = await sql`
    select indexdef as "indexDefinition"
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'discovery_candidate_sources_source_candidate_idx'
  `;
  assert(
    sourceFirstIndex?.indexDefinition ===
      "CREATE INDEX discovery_candidate_sources_source_candidate_idx ON public.discovery_candidate_sources USING btree (source_name, candidate_id)",
    `Expected exact source-first index, found ${sourceFirstIndex?.indexDefinition ?? "none"}.`,
  );
  const filterIndexNames = [
    "candidate_research_versions_candidate_created_idx",
    "candidate_research_versions_run_idx",
    "discovery_candidate_identifiers_candidate_idx",
    "discovery_candidate_sources_candidate_idx",
    "discovery_candidate_sources_run_idx",
    "discovery_candidate_sources_source_candidate_idx",
    "discovery_candidates_category_idx",
    "discovery_candidates_discovered_at_idx",
    "discovery_candidates_geography_idx",
    "discovery_candidates_recent_run_idx",
    "discovery_candidates_source_idx",
    "discovery_candidates_status_idx",
    "discovery_candidates_type_idx",
    "discovery_runs_claim_idx",
    "discovery_runs_lease_expiry_idx",
  ];
  const filterIndexes = await sql`
    select indexname as name, indexdef as definition
    from pg_indexes
    where schemaname = 'public'
      and indexname in ${sql(filterIndexNames)}
    order by indexname
  `;
  assertExactDefinitions(
    filterIndexes,
    {
      candidate_research_versions_candidate_created_idx:
        "CREATE INDEX candidate_research_versions_candidate_created_idx ON public.candidate_research_versions USING btree (candidate_id, created_at)",
      candidate_research_versions_run_idx:
        "CREATE INDEX candidate_research_versions_run_idx ON public.candidate_research_versions USING btree (discovery_run_id)",
      discovery_candidate_identifiers_candidate_idx:
        "CREATE INDEX discovery_candidate_identifiers_candidate_idx ON public.discovery_candidate_identifiers USING btree (candidate_id)",
      discovery_candidate_sources_candidate_idx:
        "CREATE INDEX discovery_candidate_sources_candidate_idx ON public.discovery_candidate_sources USING btree (candidate_id)",
      discovery_candidate_sources_run_idx:
        "CREATE INDEX discovery_candidate_sources_run_idx ON public.discovery_candidate_sources USING btree (discovery_run_id)",
      discovery_candidate_sources_source_candidate_idx:
        "CREATE INDEX discovery_candidate_sources_source_candidate_idx ON public.discovery_candidate_sources USING btree (source_name, candidate_id)",
      discovery_candidates_category_idx:
        "CREATE INDEX discovery_candidates_category_idx ON public.discovery_candidates USING btree (category)",
      discovery_candidates_discovered_at_idx:
        "CREATE INDEX discovery_candidates_discovered_at_idx ON public.discovery_candidates USING btree (discovered_at)",
      discovery_candidates_geography_idx:
        "CREATE INDEX discovery_candidates_geography_idx ON public.discovery_candidates USING btree (geography)",
      discovery_candidates_recent_run_idx:
        "CREATE INDEX discovery_candidates_recent_run_idx ON public.discovery_candidates USING btree (most_recent_run_id)",
      discovery_candidates_source_idx:
        "CREATE INDEX discovery_candidates_source_idx ON public.discovery_candidates USING btree (first_source_name)",
      discovery_candidates_status_idx:
        "CREATE INDEX discovery_candidates_status_idx ON public.discovery_candidates USING btree (status)",
      discovery_candidates_type_idx:
        "CREATE INDEX discovery_candidates_type_idx ON public.discovery_candidates USING btree (type)",
      discovery_runs_claim_idx:
        "CREATE INDEX discovery_runs_claim_idx ON public.discovery_runs USING btree (status, trigger, created_at)",
      discovery_runs_lease_expiry_idx:
        "CREATE INDEX discovery_runs_lease_expiry_idx ON public.discovery_runs USING btree (status, lease_expires_at)",
    },
    "filter index",
  );

  const journal = JSON.parse(
    await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  );
  const migrationEntries = journal.entries.filter(({ idx }) => idx === 5);
  assert(
    migrationEntries.length === 1 && migrationEntries[0].tag.startsWith("0005_"),
    `Expected exactly one 0005 migration journal entry, found ${JSON.stringify(migrationEntries)}.`,
  );
  const migration = migrationEntries[0];
  const [applied] = await sql`
    select
      count(*)::integer as "totalCount",
      count(*) filter (where created_at = ${migration.when})::integer as "migrationCount"
    from drizzle.__drizzle_migrations
  `;
  assert(
    applied.totalCount === 6 && applied.migrationCount === 1,
    `Expected six applied migrations and 0005 exactly once, found ${JSON.stringify(applied)}.`,
  );

  if (expectedFixtures) {
    const [user] = await sql`
      select id, email, name
      from users
      where id = ${expectedFixtures.user.id}
    `;
    const [profile] = await sql`
      select
        id,
        user_id as "userId",
        name,
        organisation_name as "organisationName",
        organisation_subtype as "organisationSubtype",
        primary_url as "primaryUrl",
        website_url as "websiteUrl",
        status,
        submitted_at as "submittedAt",
        verified_at as "verifiedAt"
      from profiles
      where id = ${expectedFixtures.profile.id}
    `;
    const [review] = await sql`
      select
        id,
        profile_id as "profileId",
        reviewer_email as "reviewerEmail",
        decision,
        notes,
        reviewed_at as "reviewedAt"
      from verification_reviews
      where id = ${expectedFixtures.review.id}
    `;
    const [discoveryRun] = await sql`
      select
        id,
        external_run_key as "externalRunKey",
        status,
        campaign_key as "campaignKey"
      from discovery_runs
      where id = ${expectedFixtures.discoveryRun.id}
    `;
    assert(JSON.stringify(user) === JSON.stringify(expectedFixtures.user), "User fixture changed.");
    assert(
      JSON.stringify(profile) === JSON.stringify(expectedFixtures.profile),
      "Profile fixture changed.",
    );
    assert(
      JSON.stringify(review) === JSON.stringify(expectedFixtures.review),
      "Verification fixture changed.",
    );
    assert(
      JSON.stringify(discoveryRun) ===
        JSON.stringify({
          ...expectedFixtures.discoveryRun,
          campaignKey: "general_discovery",
        }),
      "Existing V1 discovery run was not backfilled to general_discovery.",
    );
  }
}

const admin = postgres(adminUrl, { max: 1, prepare: false });
let freshClient;
let upgradeClient;
let temporaryFolder;
let executionError;

try {
  await prepareDatabase(admin, freshDatabaseName);
  freshClient = postgres(databaseUrl(freshDatabaseName), { max: 1, prepare: false });
  await migrate(drizzle(freshClient), { migrationsFolder });
  await assertDiscoveryMigration(freshClient);
  console.log("Fresh discovery migration path passed.");

  await prepareDatabase(admin, upgradeDatabaseName);
  temporaryFolder = await createUpgradeMigrationFolder();
  upgradeClient = postgres(databaseUrl(upgradeDatabaseName), {
    max: 1,
    prepare: false,
  });
  await migrate(drizzle(upgradeClient), { migrationsFolder: temporaryFolder });
  const fixtures = await insertUpgradeFixtures(upgradeClient);
  await migrate(drizzle(upgradeClient), { migrationsFolder });
  await assertDiscoveryMigration(upgradeClient, fixtures);
  console.log("Upgrade discovery migration path passed with unchanged fixtures.");
} catch (error) {
  executionError = error;
}

const cleanupErrors = [];
for (const [name, client] of [
  ["fresh client", freshClient],
  ["upgrade client", upgradeClient],
]) {
  if (!client) continue;
  try {
    await client.end({ timeout: 5 });
  } catch (error) {
    cleanupErrors.push(new Error(`Failed to close ${name}.`, { cause: error }));
  }
}
for (const databaseName of managedDatabaseNames) {
  if (
    !ownedDatabaseNames.has(databaseName) &&
    !createdDatabaseNames.has(databaseName)
  ) {
    continue;
  }
  try {
    await dropDatabase(admin, databaseName);
  } catch (error) {
    cleanupErrors.push(
      new Error(`Failed to drop owned database ${databaseName}.`, {
        cause: error,
      }),
    );
  }
}
try {
  await admin.end({ timeout: 5 });
} catch (error) {
  cleanupErrors.push(new Error("Failed to close the admin client.", { cause: error }));
}
if (temporaryFolder) {
  try {
    await rm(temporaryFolder, { recursive: true });
  } catch (error) {
    cleanupErrors.push(
      new Error(`Failed to remove temporary folder ${temporaryFolder}.`, {
        cause: error,
      }),
    );
  }
}

if (executionError || cleanupErrors.length > 0) {
  throw new AggregateError(
    [...(executionError ? [executionError] : []), ...cleanupErrors],
    "Discovery migration harness failed.",
  );
}
