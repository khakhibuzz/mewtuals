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

import { validateMigrationJournal } from "./migration-journal.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsFolder = join(projectRoot, "drizzle");
const migrationJournalPath = join(
  migrationsFolder,
  "meta",
  "_journal.json",
);
const adminUrl = "postgresql://127.0.0.1:55432/postgres";
const managedDatabaseNames = [
  "mewtuals_migrations_fresh_test",
  "mewtuals_migrations_upgrade_test",
];
const allowedDatabaseNames = new Set(managedDatabaseNames);
const [freshDatabaseName, upgradeDatabaseName] = managedDatabaseNames;
const ownershipMarker = "mewtuals-migration-harness-v1";
const createdDatabaseNames = new Set();
const ownedDatabaseNames = new Set();

const migrationJournal = JSON.parse(
  await readFile(migrationJournalPath, "utf8"),
);
const orderedMigrationEntries = validateMigrationJournal(migrationJournal);
const newestMigration = orderedMigrationEntries.at(-1);

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
    join(tmpdir(), "mewtuals-migrations-"),
  );
  try {
    const metaFolder = join(temporaryFolder, "meta");
    await mkdir(metaFolder);

    const baselineJournal = {
      ...migrationJournal,
      entries: orderedMigrationEntries.slice(0, -1),
    };
    await writeFile(
      join(metaFolder, "_journal.json"),
      `${JSON.stringify(baselineJournal, null, 2)}\n`,
    );

    for (const entry of baselineJournal.entries) {
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
  const [candidate] = await sql`
    insert into discovery_candidates (
      type,
      name,
      normalized_name,
      canonical_identity_key,
      canonical_url,
      website_url,
      discovered_description,
      category,
      geography,
      first_source_name,
      first_source_url,
      most_recent_run_id,
      discovery_score
    ) values (
      'company',
      'Migration Robotics',
      'migration robotics',
      'website:migration-robotics.example.test',
      'https://migration-robotics.example.test',
      'https://migration-robotics.example.test',
      'Public migration fixture for a robotics systems company.',
      'Robotics OEMs and Integrators',
      'India',
      'Migration Source',
      'https://migration-robotics.example.test/about',
      ${discoveryRun.id},
      92
    )
    returning id, name, canonical_identity_key as "canonicalIdentityKey"
  `;
  const [research] = await sql`
    insert into candidate_research_versions (
      candidate_id,
      discovery_run_id,
      summary,
      findings,
      source_urls,
      analysis_version
    ) values (
      ${candidate.id},
      ${discoveryRun.id},
      ${"Migration fixture summary describes public robotics systems evidence, manufacturing scope, and verified India market context."},
      ${"Migration fixture findings preserve a sufficiently detailed public-evidence systems context covering company identity, robotics products, technical layers, component dependencies, manufacturing model, customer applications, ecosystem relationships, and explicitly bounded confidence. ".repeat(4)},
      ${JSON.stringify(["https://migration-robotics.example.test/about"])}::jsonb,
      'physical-ai-v1'
    )
    returning id, candidate_id as "candidateId", discovery_run_id as "discoveryRunId"
  `;
  const [source] = await sql`
    insert into discovery_candidate_sources (
      candidate_id,
      discovery_run_id,
      source_name,
      source_url,
      first_seen_at,
      last_seen_at
    ) values (
      ${candidate.id},
      ${discoveryRun.id},
      'Migration Source',
      'https://migration-robotics.example.test/about',
      '2026-07-21T10:00:00.000Z',
      '2026-07-21T10:00:00.000Z'
    )
    returning id, candidate_id as "candidateId", discovery_run_id as "discoveryRunId", source_url as "sourceUrl"
  `;
  const [discoveryCounts] = await sql`
    select
      (select count(*)::integer from discovery_candidates) as "candidateCount",
      (select count(*)::integer from candidate_research_versions) as "researchCount",
      (select count(*)::integer from discovery_candidate_sources) as "sourceCount"
  `;
  return {
    user,
    profile,
    review,
    discoveryRun,
    candidate,
    research,
    source,
    discoveryCounts,
  };
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

async function assertOpportunityBriefMigration(sql) {
  const expectedTables = [
    "opportunity_brief_requests",
    "opportunity_brief_submission_attempts",
  ];
  const tables = await sql`
    select table_name as "tableName"
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ${sql(expectedTables)}
    order by table_name
  `;
  assert(
    JSON.stringify(tables.map(({ tableName }) => tableName)) ===
      JSON.stringify(expectedTables),
    `Expected opportunity brief tables, found ${JSON.stringify(tables)}.`,
  );

  const enumNames = [
    "opportunity_brief_acknowledgement_status",
    "opportunity_brief_status",
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
        opportunity_brief_acknowledgement_status: [
          "not_requested",
          "pending",
          "sent",
          "failed",
        ],
        opportunity_brief_status: [
          "submitted",
          "researching",
          "brief_ready",
          "contacted",
          "invited_to_join",
          "converted",
          "rejected",
        ],
      }),
    `Expected exact opportunity brief enums, found ${JSON.stringify(enums)}.`,
  );

  const columns = await sql`
    select
      table_name as "tableName",
      column_name as "columnName",
      data_type as "dataType",
      udt_name as "udtName",
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
      Object.fromEntries(
        columns
          .filter((column) => column.tableName === tableName)
          .map(
            ({ columnName, dataType, udtName, isNullable, columnDefault }) => [
              columnName,
              { dataType, udtName, isNullable, columnDefault },
            ],
          ),
      ),
    ]),
  );
  assert(
    JSON.stringify(columnsByTable) ===
      JSON.stringify({
        opportunity_brief_requests: {
          id: {
            dataType: "uuid",
            udtName: "uuid",
            isNullable: "NO",
            columnDefault: "gen_random_uuid()",
          },
          participant_type: {
            dataType: "USER-DEFINED",
            udtName: "discovery_candidate_type",
            isNullable: "NO",
            columnDefault: null,
          },
          profile_url: {
            dataType: "text",
            udtName: "text",
            isNullable: "NO",
            columnDefault: null,
          },
          normalized_profile_url: {
            dataType: "text",
            udtName: "text",
            isNullable: "NO",
            columnDefault: null,
          },
          email: {
            dataType: "text",
            udtName: "text",
            isNullable: "YES",
            columnDefault: null,
          },
          normalized_email: {
            dataType: "text",
            udtName: "text",
            isNullable: "YES",
            columnDefault: null,
          },
          phone_number: {
            dataType: "text",
            udtName: "text",
            isNullable: "YES",
            columnDefault: null,
          },
          normalized_phone_number: {
            dataType: "text",
            udtName: "text",
            isNullable: "YES",
            columnDefault: null,
          },
          open_to_text: {
            dataType: "text",
            udtName: "text",
            isNullable: "YES",
            columnDefault: null,
          },
          source: {
            dataType: "text",
            udtName: "text",
            isNullable: "YES",
            columnDefault: null,
          },
          utm: {
            dataType: "jsonb",
            udtName: "jsonb",
            isNullable: "NO",
            columnDefault: "'{}'::jsonb",
          },
          source_history: {
            dataType: "jsonb",
            udtName: "jsonb",
            isNullable: "NO",
            columnDefault: "'[]'::jsonb",
          },
          linked_candidate_id: {
            dataType: "uuid",
            udtName: "uuid",
            isNullable: "YES",
            columnDefault: null,
          },
          status: {
            dataType: "USER-DEFINED",
            udtName: "opportunity_brief_status",
            isNullable: "NO",
            columnDefault: "'submitted'::opportunity_brief_status",
          },
          admin_notes: {
            dataType: "text",
            udtName: "text",
            isNullable: "YES",
            columnDefault: null,
          },
          acknowledgement_status: {
            dataType: "USER-DEFINED",
            udtName: "opportunity_brief_acknowledgement_status",
            isNullable: "NO",
            columnDefault:
              "'not_requested'::opportunity_brief_acknowledgement_status",
          },
          acknowledgement_email: {
            dataType: "text",
            udtName: "text",
            isNullable: "YES",
            columnDefault: null,
          },
          acknowledgement_delivery_token: {
            dataType: "uuid",
            udtName: "uuid",
            isNullable: "YES",
            columnDefault: null,
          },
          acknowledgement_error: {
            dataType: "text",
            udtName: "text",
            isNullable: "YES",
            columnDefault: null,
          },
          acknowledgement_sent_at: {
            dataType: "timestamp with time zone",
            udtName: "timestamptz",
            isNullable: "YES",
            columnDefault: null,
          },
          submission_count: {
            dataType: "integer",
            udtName: "int4",
            isNullable: "NO",
            columnDefault: "1",
          },
          last_submitted_at: {
            dataType: "timestamp with time zone",
            udtName: "timestamptz",
            isNullable: "NO",
            columnDefault: "now()",
          },
          created_at: {
            dataType: "timestamp with time zone",
            udtName: "timestamptz",
            isNullable: "NO",
            columnDefault: "now()",
          },
          updated_at: {
            dataType: "timestamp with time zone",
            udtName: "timestamptz",
            isNullable: "NO",
            columnDefault: "now()",
          },
        },
        opportunity_brief_submission_attempts: {
          id: {
            dataType: "uuid",
            udtName: "uuid",
            isNullable: "NO",
            columnDefault: "gen_random_uuid()",
          },
          requester_hash: {
            dataType: "text",
            udtName: "text",
            isNullable: "NO",
            columnDefault: null,
          },
          request_id: {
            dataType: "uuid",
            udtName: "uuid",
            isNullable: "NO",
            columnDefault: null,
          },
          created_at: {
            dataType: "timestamp with time zone",
            udtName: "timestamptz",
            isNullable: "NO",
            columnDefault: "now()",
          },
        },
      }),
    `Expected exact opportunity brief column contracts, found ${JSON.stringify(columnsByTable)}.`,
  );

  const checkNames = ["opportunity_brief_requests_submission_count_check"];
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
      opportunity_brief_requests_submission_count_check:
        "CHECK (submission_count > 0)",
    },
    "opportunity brief check constraint",
  );

  const foreignKeyNames = [
    "opportunity_brief_requests_linked_candidate_fk",
    "opportunity_brief_submission_attempts_request_fk",
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
      opportunity_brief_requests_linked_candidate_fk:
        "FOREIGN KEY (linked_candidate_id) REFERENCES discovery_candidates(id) ON DELETE SET NULL",
      opportunity_brief_submission_attempts_request_fk:
        "FOREIGN KEY (request_id) REFERENCES opportunity_brief_requests(id) ON DELETE CASCADE",
    },
    "opportunity brief foreign key",
  );

  const uniqueDefinitions = await sql`
    select conname as name, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and contype = 'u'
      and conname = 'opportunity_brief_requests_participant_profile_unique'
    order by conname
  `;
  assertExactDefinitions(
    uniqueDefinitions,
    {
      opportunity_brief_requests_participant_profile_unique:
        "UNIQUE (participant_type, normalized_profile_url)",
    },
    "opportunity brief unique constraint",
  );

  const filterIndexNames = [
    "opportunity_brief_requests_created_at_idx",
    "opportunity_brief_requests_linked_candidate_idx",
    "opportunity_brief_requests_normalized_email_idx",
    "opportunity_brief_requests_normalized_phone_number_idx",
    "opportunity_brief_requests_participant_type_idx",
    "opportunity_brief_requests_source_idx",
    "opportunity_brief_requests_status_last_submitted_at_idx",
    "opportunity_brief_submission_attempts_request_id_idx",
    "opportunity_brief_submission_attempts_requester_created_at_idx",
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
      opportunity_brief_requests_created_at_idx:
        "CREATE INDEX opportunity_brief_requests_created_at_idx ON public.opportunity_brief_requests USING btree (created_at)",
      opportunity_brief_requests_linked_candidate_idx:
        "CREATE INDEX opportunity_brief_requests_linked_candidate_idx ON public.opportunity_brief_requests USING btree (linked_candidate_id)",
      opportunity_brief_requests_normalized_email_idx:
        "CREATE INDEX opportunity_brief_requests_normalized_email_idx ON public.opportunity_brief_requests USING btree (normalized_email)",
      opportunity_brief_requests_normalized_phone_number_idx:
        "CREATE INDEX opportunity_brief_requests_normalized_phone_number_idx ON public.opportunity_brief_requests USING btree (normalized_phone_number)",
      opportunity_brief_requests_participant_type_idx:
        "CREATE INDEX opportunity_brief_requests_participant_type_idx ON public.opportunity_brief_requests USING btree (participant_type)",
      opportunity_brief_requests_source_idx:
        "CREATE INDEX opportunity_brief_requests_source_idx ON public.opportunity_brief_requests USING btree (source)",
      opportunity_brief_requests_status_last_submitted_at_idx:
        "CREATE INDEX opportunity_brief_requests_status_last_submitted_at_idx ON public.opportunity_brief_requests USING btree (status, last_submitted_at)",
      opportunity_brief_submission_attempts_request_id_idx:
        "CREATE INDEX opportunity_brief_submission_attempts_request_id_idx ON public.opportunity_brief_submission_attempts USING btree (request_id)",
      opportunity_brief_submission_attempts_requester_created_at_idx:
        "CREATE INDEX opportunity_brief_submission_attempts_requester_created_at_idx ON public.opportunity_brief_submission_attempts USING btree (requester_hash, created_at)",
    },
    "opportunity brief filter index",
  );
}

async function assertEcosystemIntelligenceMigration(sql) {
  const expectedTables = [
    "candidate_ecosystem_classifications",
    "candidate_headquarters",
    "candidate_public_signals",
    "candidate_relationships",
  ];
  const tables = await sql`
    select table_name as "tableName"
    from information_schema.tables
    where table_schema = 'public'
      and table_name in ${sql(expectedTables)}
    order by table_name
  `;
  assert(
    JSON.stringify(tables.map(({ tableName }) => tableName)) ===
      JSON.stringify(expectedTables),
    `Expected ecosystem intelligence tables, found ${JSON.stringify(tables)}.`,
  );

  const columns = await sql`
    select
      table_name as "tableName",
      column_name as "columnName",
      data_type as "dataType",
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
        candidate_ecosystem_classifications: [
          "id",
          "candidate_id",
          "kind",
          "term_key",
          "evidence_state",
          "confidence",
          "basis",
          "source_urls",
          "created_at",
          "updated_at",
        ],
        candidate_headquarters: [
          "id",
          "candidate_id",
          "country_code",
          "state_key",
          "state_label",
          "city_key",
          "city_label",
          "latitude_microdegrees",
          "longitude_microdegrees",
          "evidence_state",
          "confidence",
          "source_urls",
          "created_at",
          "updated_at",
        ],
        candidate_public_signals: [
          "id",
          "candidate_id",
          "signal_type",
          "title",
          "occurred_at",
          "expires_at",
          "source_url",
          "confidence",
          "evidence_key",
          "created_at",
          "updated_at",
        ],
        candidate_relationships: [
          "id",
          "source_candidate_id",
          "target_candidate_id",
          "target_public_name",
          "relationship_type",
          "evidence_url",
          "confidence",
          "observed_at",
          "evidence_key",
          "created_at",
          "updated_at",
        ],
      }),
    `Expected exact ecosystem intelligence columns, found ${JSON.stringify(columnsByTable)}.`,
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
        candidate_ecosystem_classifications: [],
        candidate_headquarters: [
          "latitude_microdegrees",
          "longitude_microdegrees",
        ],
        candidate_public_signals: ["expires_at"],
        candidate_relationships: [
          "target_candidate_id",
          "target_public_name",
          "observed_at",
        ],
      }),
    `Expected exact ecosystem intelligence nullability, found ${JSON.stringify(nullableColumns)}.`,
  );
  const typeByColumn = Object.fromEntries(
    columns.map(({ tableName, columnName, dataType }) => [
      `${tableName}.${columnName}`,
      dataType,
    ]),
  );
  assert(
    typeByColumn["candidate_ecosystem_classifications.source_urls"] ===
      "jsonb" &&
      typeByColumn["candidate_headquarters.source_urls"] === "jsonb" &&
      typeByColumn["candidate_headquarters.latitude_microdegrees"] ===
        "integer" &&
      typeByColumn["candidate_headquarters.longitude_microdegrees"] ===
        "integer",
    `Expected JSONB sources and integer microdegrees, found ${JSON.stringify(typeByColumn)}.`,
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
    columnDefaults["candidate_headquarters.country_code"] === "'IN'::text",
    `Expected headquarters country default IN, found ${JSON.stringify(columnDefaults)}.`,
  );

  const requiredConstraintNames = [
    "candidate_ecosystem_classifications_basis_check",
    "candidate_ecosystem_classifications_candidate_fk",
    "candidate_ecosystem_classifications_candidate_kind_term_unique",
    "candidate_ecosystem_classifications_confidence_check",
    "candidate_ecosystem_classifications_evidence_state_check",
    "candidate_ecosystem_classifications_kind_term_check",
    "candidate_ecosystem_classifications_sources_check",
    "candidate_headquarters_candidate_fk",
    "candidate_headquarters_candidate_unique",
    "candidate_headquarters_confidence_check",
    "candidate_headquarters_coordinates_check",
    "candidate_headquarters_country_check",
    "candidate_headquarters_evidence_state_check",
    "candidate_headquarters_latitude_check",
    "candidate_headquarters_location_check",
    "candidate_headquarters_longitude_check",
    "candidate_headquarters_sources_check",
    "candidate_public_signals_candidate_fk",
    "candidate_public_signals_confidence_check",
    "candidate_public_signals_evidence_key_check",
    "candidate_public_signals_expiry_check",
    "candidate_public_signals_signal_type_check",
    "candidate_public_signals_source_url_check",
    "candidate_public_signals_title_check",
    "candidate_relationships_confidence_check",
    "candidate_relationships_evidence_key_check",
    "candidate_relationships_evidence_url_check",
    "candidate_relationships_self_link_check",
    "candidate_relationships_source_candidate_fk",
    "candidate_relationships_target_candidate_fk",
    "candidate_relationships_target_check",
    "candidate_relationships_type_check",
  ];
  const constraints = await sql`
    select conname as name
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and conname in ${sql(requiredConstraintNames)}
    order by conname
  `;
  assert(
    constraints.length === requiredConstraintNames.length,
    `Expected ecosystem intelligence constraints, found ${JSON.stringify(constraints)}.`,
  );

  const foreignKeyNames = [
    "candidate_ecosystem_classifications_candidate_fk",
    "candidate_headquarters_candidate_fk",
    "candidate_public_signals_candidate_fk",
    "candidate_relationships_source_candidate_fk",
    "candidate_relationships_target_candidate_fk",
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
      candidate_ecosystem_classifications_candidate_fk:
        "FOREIGN KEY (candidate_id) REFERENCES discovery_candidates(id) ON DELETE CASCADE",
      candidate_headquarters_candidate_fk:
        "FOREIGN KEY (candidate_id) REFERENCES discovery_candidates(id) ON DELETE CASCADE",
      candidate_public_signals_candidate_fk:
        "FOREIGN KEY (candidate_id) REFERENCES discovery_candidates(id) ON DELETE CASCADE",
      candidate_relationships_source_candidate_fk:
        "FOREIGN KEY (source_candidate_id) REFERENCES discovery_candidates(id) ON DELETE CASCADE",
      candidate_relationships_target_candidate_fk:
        "FOREIGN KEY (target_candidate_id) REFERENCES discovery_candidates(id) ON DELETE CASCADE",
    },
    "ecosystem intelligence foreign key",
  );

  const uniqueDefinitions = await sql`
    select conname as name, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where connamespace = 'public'::regnamespace
      and contype = 'u'
      and conname in (
        'candidate_ecosystem_classifications_candidate_kind_term_unique',
        'candidate_headquarters_candidate_unique'
      )
    order by conname
  `;
  assertExactDefinitions(
    uniqueDefinitions,
    {
      candidate_ecosystem_classifications_candidate_kind_term_unique:
        "UNIQUE (candidate_id, kind, term_key)",
      candidate_headquarters_candidate_unique: "UNIQUE (candidate_id)",
    },
    "ecosystem intelligence unique constraint",
  );

  const indexNames = [
    "candidate_ecosystem_classifications_candidate_idx",
    "candidate_ecosystem_classifications_confidence_idx",
    "candidate_ecosystem_classifications_evidence_state_idx",
    "candidate_ecosystem_classifications_kind_term_idx",
    "candidate_headquarters_city_idx",
    "candidate_headquarters_confidence_idx",
    "candidate_headquarters_evidence_state_idx",
    "candidate_headquarters_state_idx",
    "candidate_public_signals_candidate_idx",
    "candidate_public_signals_evidence_key_idx",
    "candidate_public_signals_expires_at_idx",
    "candidate_public_signals_occurred_at_idx",
    "candidate_public_signals_type_idx",
    "candidate_relationships_evidence_key_idx",
    "candidate_relationships_observed_at_idx",
    "candidate_relationships_source_candidate_idx",
    "candidate_relationships_target_candidate_idx",
    "candidate_relationships_type_idx",
  ];
  const indexes = await sql`
    select
      index_definition.indexname as name,
      index_definition.indexdef as definition,
      index_catalog.indisunique as "isUnique"
    from pg_indexes index_definition
    join pg_class index_class on index_class.relname = index_definition.indexname
    join pg_index index_catalog on index_catalog.indexrelid = index_class.oid
    where index_definition.schemaname = 'public'
      and index_definition.indexname in ${sql(indexNames)}
    order by index_definition.indexname
  `;
  assert(
    indexes.length === indexNames.length,
    `Expected ecosystem intelligence query indexes, found ${JSON.stringify(indexes)}.`,
  );
  assertExactDefinitions(
    indexes,
    {
      candidate_ecosystem_classifications_candidate_idx:
        "CREATE INDEX candidate_ecosystem_classifications_candidate_idx ON public.candidate_ecosystem_classifications USING btree (candidate_id)",
      candidate_ecosystem_classifications_confidence_idx:
        "CREATE INDEX candidate_ecosystem_classifications_confidence_idx ON public.candidate_ecosystem_classifications USING btree (confidence)",
      candidate_ecosystem_classifications_evidence_state_idx:
        "CREATE INDEX candidate_ecosystem_classifications_evidence_state_idx ON public.candidate_ecosystem_classifications USING btree (evidence_state)",
      candidate_ecosystem_classifications_kind_term_idx:
        "CREATE INDEX candidate_ecosystem_classifications_kind_term_idx ON public.candidate_ecosystem_classifications USING btree (kind, term_key)",
      candidate_headquarters_city_idx:
        "CREATE INDEX candidate_headquarters_city_idx ON public.candidate_headquarters USING btree (city_key)",
      candidate_headquarters_confidence_idx:
        "CREATE INDEX candidate_headquarters_confidence_idx ON public.candidate_headquarters USING btree (confidence)",
      candidate_headquarters_evidence_state_idx:
        "CREATE INDEX candidate_headquarters_evidence_state_idx ON public.candidate_headquarters USING btree (evidence_state)",
      candidate_headquarters_state_idx:
        "CREATE INDEX candidate_headquarters_state_idx ON public.candidate_headquarters USING btree (state_key)",
      candidate_public_signals_candidate_idx:
        "CREATE INDEX candidate_public_signals_candidate_idx ON public.candidate_public_signals USING btree (candidate_id)",
      candidate_public_signals_evidence_key_idx:
        "CREATE UNIQUE INDEX candidate_public_signals_evidence_key_idx ON public.candidate_public_signals USING btree (evidence_key)",
      candidate_public_signals_expires_at_idx:
        "CREATE INDEX candidate_public_signals_expires_at_idx ON public.candidate_public_signals USING btree (expires_at)",
      candidate_public_signals_occurred_at_idx:
        "CREATE INDEX candidate_public_signals_occurred_at_idx ON public.candidate_public_signals USING btree (occurred_at)",
      candidate_public_signals_type_idx:
        "CREATE INDEX candidate_public_signals_type_idx ON public.candidate_public_signals USING btree (signal_type)",
      candidate_relationships_evidence_key_idx:
        "CREATE UNIQUE INDEX candidate_relationships_evidence_key_idx ON public.candidate_relationships USING btree (evidence_key)",
      candidate_relationships_observed_at_idx:
        "CREATE INDEX candidate_relationships_observed_at_idx ON public.candidate_relationships USING btree (observed_at)",
      candidate_relationships_source_candidate_idx:
        "CREATE INDEX candidate_relationships_source_candidate_idx ON public.candidate_relationships USING btree (source_candidate_id)",
      candidate_relationships_target_candidate_idx:
        "CREATE INDEX candidate_relationships_target_candidate_idx ON public.candidate_relationships USING btree (target_candidate_id)",
      candidate_relationships_type_idx:
        "CREATE INDEX candidate_relationships_type_idx ON public.candidate_relationships USING btree (relationship_type)",
    },
    "ecosystem intelligence query index",
  );
  const uniqueIndexNames = indexes
    .filter(({ isUnique }) => isUnique)
    .map(({ name }) => name);
  assert(
    JSON.stringify(uniqueIndexNames) ===
      JSON.stringify([
        "candidate_public_signals_evidence_key_idx",
        "candidate_relationships_evidence_key_idx",
      ]),
    `Expected only evidence-key query indexes to be unique, found ${JSON.stringify(indexes)}.`,
  );
}

async function assertConstraintFailure(label, constraintName, operation) {
  try {
    await operation();
  } catch (error) {
    assert(
      error?.constraint_name === constraintName,
      `${label} failed with ${error?.constraint_name ?? error?.message ?? "unknown error"}, expected ${constraintName}.`,
    );
    return;
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

async function assertEcosystemConstraintBehavior(sql, candidateId) {
  const sourceUrls = JSON.stringify([
    "https://migration-robotics.example.test/evidence",
  ]);
  const tooManySourceUrls = JSON.stringify(
    Array.from(
      { length: 13 },
      (_, index) =>
        `https://migration-robotics.example.test/evidence/${index + 1}`,
    ),
  );
  const [resolvedTarget] = await sql`
    insert into discovery_candidates (
      type,
      name,
      normalized_name,
      canonical_identity_key,
      canonical_url,
      website_url,
      discovered_description,
      category,
      geography,
      first_source_name,
      first_source_url,
      most_recent_run_id,
      discovery_score
    )
    select
      'company',
      'Migration Components',
      'migration components',
      'website:migration-components.example.test',
      'https://migration-components.example.test',
      'https://migration-components.example.test',
      'Public migration fixture for a robotics component company.',
      'Components, Sensors, and Actuators',
      'India',
      'Migration Source',
      'https://migration-components.example.test/about',
      most_recent_run_id,
      88
    from discovery_candidates
    where id = ${candidateId}
    returning id
  `;
  await sql`
    insert into candidate_ecosystem_classifications (
      candidate_id, kind, term_key, evidence_state, confidence, basis, source_urls
    ) values (
      ${candidateId},
      'ecosystem_domain',
      'robotics',
      'evidence_backed',
      90,
      'Public product and company evidence.',
      ${sourceUrls}::jsonb
    )
  `;
  await sql`
    insert into candidate_headquarters (
      candidate_id,
      state_key,
      state_label,
      city_key,
      city_label,
      latitude_microdegrees,
      longitude_microdegrees,
      evidence_state,
      confidence,
      source_urls
    ) values (
      ${candidateId},
      'karnataka',
      'Karnataka',
      'bengaluru',
      'Bengaluru',
      12971600,
      77594600,
      'evidence_backed',
      95,
      ${sourceUrls}::jsonb
    )
  `;
  await sql`
    insert into candidate_public_signals (
      candidate_id,
      signal_type,
      title,
      occurred_at,
      source_url,
      confidence,
      evidence_key
    ) values (
      ${candidateId},
      'product_launch',
      'Introduced a public robotics platform',
      '2026-07-20T00:00:00.000Z',
      'https://migration-robotics.example.test/launch',
      88,
      'migration-signal-evidence-key'
    )
  `;
  await sql`
    insert into candidate_relationships (
      source_candidate_id,
      target_public_name,
      relationship_type,
      evidence_url,
      confidence,
      observed_at,
      evidence_key
    ) values (
      ${candidateId},
      'Public Manufacturing Partner',
      'supplies_to',
      'https://migration-robotics.example.test/partner',
      85,
      '2026-07-19T00:00:00.000Z',
      'migration-relationship-evidence-key'
    )
  `;

  await assertConstraintFailure(
    "Duplicate classification",
    "candidate_ecosystem_classifications_candidate_kind_term_unique",
    () => sql`
      insert into candidate_ecosystem_classifications (
        candidate_id, kind, term_key, evidence_state, confidence, basis, source_urls
      ) values (
        ${candidateId}, 'ecosystem_domain', 'robotics', 'evidence_backed', 90,
        'Duplicate public evidence.', ${sourceUrls}::jsonb
      )
    `,
  );
  await assertConstraintFailure(
    "Invalid classification confidence",
    "candidate_ecosystem_classifications_confidence_check",
    () => sql`
      insert into candidate_ecosystem_classifications (
        candidate_id, kind, term_key, evidence_state, confidence, basis, source_urls
      ) values (
        ${candidateId}, 'ecosystem_role', 'integrator', 'evidence_backed', 101,
        'Invalid confidence evidence.', ${sourceUrls}::jsonb
      )
    `,
  );
  await assertConstraintFailure(
    "Invalid classification evidence state",
    "candidate_ecosystem_classifications_evidence_state_check",
    () => sql`
      insert into candidate_ecosystem_classifications (
        candidate_id, kind, term_key, evidence_state, confidence, basis, source_urls
      ) values (
        ${candidateId}, 'ecosystem_role', 'integrator', 'unverified', 90,
        'Invalid evidence state.', ${sourceUrls}::jsonb
      )
    `,
  );
  await assertConstraintFailure(
    "Invalid classification source array",
    "candidate_ecosystem_classifications_sources_check",
    () => sql`
      insert into candidate_ecosystem_classifications (
        candidate_id, kind, term_key, evidence_state, confidence, basis, source_urls
      ) values (
        ${candidateId}, 'ecosystem_role', 'integrator', 'evidence_backed', 90,
        'Invalid source array.', '{}'::jsonb
      )
    `,
  );
  await assertConstraintFailure(
    "Non-string classification source",
    "candidate_ecosystem_classifications_sources_check",
    () => sql`
      insert into candidate_ecosystem_classifications (
        candidate_id, kind, term_key, evidence_state, confidence, basis, source_urls
      ) values (
        ${candidateId}, 'ecosystem_role', 'integrator', 'evidence_backed', 90,
        'Non-string public source.', '[42]'::jsonb
      )
    `,
  );
  await assertConstraintFailure(
    "Non-public classification source",
    "candidate_ecosystem_classifications_sources_check",
    () => sql`
      insert into candidate_ecosystem_classifications (
        candidate_id, kind, term_key, evidence_state, confidence, basis, source_urls
      ) values (
        ${candidateId}, 'ecosystem_role', 'integrator', 'evidence_backed', 90,
        'Non-public source.', '["private-source"]'::jsonb
      )
    `,
  );
  await assertConstraintFailure(
    "Oversized classification source array",
    "candidate_ecosystem_classifications_sources_check",
    () => sql`
      insert into candidate_ecosystem_classifications (
        candidate_id, kind, term_key, evidence_state, confidence, basis, source_urls
      ) values (
        ${candidateId}, 'ecosystem_role', 'integrator', 'evidence_backed', 90,
        'Too many public sources.', ${tooManySourceUrls}::jsonb
      )
    `,
  );
  await assertConstraintFailure(
    "Duplicate headquarters",
    "candidate_headquarters_candidate_unique",
    () => sql`
      insert into candidate_headquarters (
        candidate_id, state_key, state_label, city_key, city_label,
        evidence_state, confidence, source_urls
      ) values (
        ${candidateId}, 'karnataka', 'Karnataka', 'bengaluru', 'Bengaluru',
        'evidence_backed', 95, ${sourceUrls}::jsonb
      )
    `,
  );
  await assertConstraintFailure(
    "Non-India headquarters country",
    "candidate_headquarters_country_check",
    () => sql`
      update candidate_headquarters
      set country_code = 'US'
      where candidate_id = ${candidateId}
    `,
  );
  await assertConstraintFailure(
    "Invalid headquarters coordinates",
    "candidate_headquarters_latitude_check",
    () => sql`
      update candidate_headquarters
      set latitude_microdegrees = 90000001
      where candidate_id = ${candidateId}
    `,
  );
  await assertConstraintFailure(
    "Unpaired headquarters coordinates",
    "candidate_headquarters_coordinates_check",
    () => sql`
      update candidate_headquarters
      set longitude_microdegrees = null
      where candidate_id = ${candidateId}
    `,
  );
  await assertConstraintFailure(
    "Invalid headquarters longitude",
    "candidate_headquarters_longitude_check",
    () => sql`
      update candidate_headquarters
      set longitude_microdegrees = 180000001
      where candidate_id = ${candidateId}
    `,
  );
  await assertConstraintFailure(
    "Invalid headquarters confidence",
    "candidate_headquarters_confidence_check",
    () => sql`
      update candidate_headquarters
      set confidence = -1
      where candidate_id = ${candidateId}
    `,
  );
  await assertConstraintFailure(
    "Invalid headquarters source array",
    "candidate_headquarters_sources_check",
    () => sql`
      update candidate_headquarters
      set source_urls = '[]'::jsonb
      where candidate_id = ${candidateId}
    `,
  );
  await assertConstraintFailure(
    "Duplicate public signal evidence",
    "candidate_public_signals_evidence_key_idx",
    () => sql`
      insert into candidate_public_signals (
        candidate_id, signal_type, title, occurred_at, source_url, confidence, evidence_key
      ) values (
        ${candidateId}, 'product_launch', 'Duplicate launch',
        '2026-07-20T00:00:00.000Z',
        'https://migration-robotics.example.test/launch', 88,
        'migration-signal-evidence-key'
      )
    `,
  );
  await assertConstraintFailure(
    "Invalid public signal URL",
    "candidate_public_signals_source_url_check",
    () => sql`
      insert into candidate_public_signals (
        candidate_id, signal_type, title, occurred_at, source_url, confidence, evidence_key
      ) values (
        ${candidateId}, 'product_launch', 'Invalid URL signal',
        '2026-07-20T00:00:00.000Z', 'private-source', 88,
        'invalid-signal-url-key'
      )
    `,
  );
  await assertConstraintFailure(
    "Invalid public signal confidence",
    "candidate_public_signals_confidence_check",
    () => sql`
      insert into candidate_public_signals (
        candidate_id, signal_type, title, occurred_at, source_url, confidence, evidence_key
      ) values (
        ${candidateId}, 'product_launch', 'Invalid confidence signal',
        '2026-07-20T00:00:00.000Z',
        'https://migration-robotics.example.test/invalid-confidence', 101,
        'invalid-signal-confidence-key'
      )
    `,
  );
  await assertConstraintFailure(
    "Invalid public signal expiry",
    "candidate_public_signals_expiry_check",
    () => sql`
      insert into candidate_public_signals (
        candidate_id, signal_type, title, occurred_at, expires_at,
        source_url, confidence, evidence_key
      ) values (
        ${candidateId}, 'product_launch', 'Invalid expiry signal',
        '2026-07-20T00:00:00.000Z', '2026-07-19T00:00:00.000Z',
        'https://migration-robotics.example.test/invalid-expiry', 80,
        'invalid-signal-expiry-key'
      )
    `,
  );
  await assertConstraintFailure(
    "Duplicate relationship evidence",
    "candidate_relationships_evidence_key_idx",
    () => sql`
      insert into candidate_relationships (
        source_candidate_id, target_public_name, relationship_type,
        evidence_url, confidence, evidence_key
      ) values (
        ${candidateId}, 'Another Partner', 'supplies_to',
        'https://migration-robotics.example.test/partner', 85,
        'migration-relationship-evidence-key'
      )
    `,
  );
  await assertConstraintFailure(
    "Relationship without a target",
    "candidate_relationships_target_check",
    () => sql`
      insert into candidate_relationships (
        source_candidate_id, relationship_type, evidence_url, confidence, evidence_key
      ) values (
        ${candidateId}, 'supplies_to',
        'https://migration-robotics.example.test/missing-target', 85,
        'missing-target-evidence-key'
      )
    `,
  );
  await assertConstraintFailure(
    "Relationship self-link",
    "candidate_relationships_self_link_check",
    () => sql`
      insert into candidate_relationships (
        source_candidate_id, target_candidate_id, relationship_type,
        evidence_url, confidence, evidence_key
      ) values (
        ${candidateId}, ${candidateId}, 'supplies_to',
        'https://migration-robotics.example.test/self-link', 85,
        'self-link-evidence-key'
      )
    `,
  );
  await assertConstraintFailure(
    "Relationship with resolved and public-name targets",
    "candidate_relationships_target_check",
    () => sql`
      insert into candidate_relationships (
        source_candidate_id, target_candidate_id, target_public_name,
        relationship_type, evidence_url, confidence, evidence_key
      ) values (
        ${candidateId}, ${resolvedTarget.id}, 'Migration Components',
        'supplies_to',
        'https://migration-robotics.example.test/both-targets', 85,
        'both-targets-evidence-key'
      )
    `,
  );
  const [resolvedRelationship] = await sql`
    insert into candidate_relationships (
      source_candidate_id,
      target_candidate_id,
      relationship_type,
      evidence_url,
      confidence,
      evidence_key
    ) values (
      ${candidateId},
      ${resolvedTarget.id},
      'supplies_to',
      'https://migration-robotics.example.test/resolved-target',
      90,
      'resolved-target-evidence-key'
    )
    returning id
  `;
  await sql`
    delete from discovery_candidates
    where id = ${resolvedTarget.id}
  `;
  const [targetCascadeState] = await sql`
    select
      exists(
        select 1 from discovery_candidates where id = ${candidateId}
      ) as "sourceCandidateExists",
      exists(
        select 1 from discovery_candidates where id = ${resolvedTarget.id}
      ) as "targetCandidateExists",
      exists(
        select 1 from candidate_relationships where id = ${resolvedRelationship.id}
      ) as "resolvedRelationshipExists"
  `;
  assert(
    JSON.stringify(targetCascadeState) ===
      JSON.stringify({
        sourceCandidateExists: true,
        targetCandidateExists: false,
        resolvedRelationshipExists: false,
      }),
    `Expected target deletion to cascade only the resolved relationship, found ${JSON.stringify(targetCascadeState)}.`,
  );
  await assertConstraintFailure(
    "Invalid relationship confidence",
    "candidate_relationships_confidence_check",
    () => sql`
      insert into candidate_relationships (
        source_candidate_id, target_public_name, relationship_type,
        evidence_url, confidence, evidence_key
      ) values (
        ${candidateId}, 'Invalid Confidence Partner', 'supplies_to',
        'https://migration-robotics.example.test/invalid-relationship-confidence',
        -1, 'invalid-relationship-confidence-key'
      )
    `,
  );

  const [counts] = await sql`
    select
      (select count(*)::integer from candidate_ecosystem_classifications) as "classificationCount",
      (select count(*)::integer from candidate_headquarters) as "headquartersCount",
      (select count(*)::integer from candidate_public_signals) as "signalCount",
      (select count(*)::integer from candidate_relationships) as "relationshipCount"
  `;
  assert(
    JSON.stringify(counts) ===
      JSON.stringify({
        classificationCount: 1,
        headquartersCount: 1,
        signalCount: 1,
        relationshipCount: 1,
      }),
    `Expected one valid row in each ecosystem intelligence table, found ${JSON.stringify(counts)}.`,
  );
}

async function assertAppliedMigrations(sql) {
  const [applied] = await sql`
    select
      count(*)::integer as "totalCount",
      count(*) filter (where created_at = ${newestMigration.when})::integer as "newestCount"
    from drizzle.__drizzle_migrations
  `;
  assert(
    applied.totalCount === orderedMigrationEntries.length &&
      applied.newestCount === 1,
    `Expected ${orderedMigrationEntries.length} ordered migrations with ${newestMigration.tag} applied once, found ${JSON.stringify(applied)}.`,
  );
}

async function assertBaselineMigrations(sql) {
  const [applied] = await sql`
    select
      count(*)::integer as "totalCount",
      count(*) filter (where created_at = ${newestMigration.when})::integer as "newestCount"
    from drizzle.__drizzle_migrations
  `;
  assert(
    applied.totalCount === orderedMigrationEntries.length - 1 &&
      applied.newestCount === 0,
    `Expected the pre-${newestMigration.tag} baseline only, found ${JSON.stringify(applied)}.`,
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
    const [candidate] = await sql`
      select id, name, canonical_identity_key as "canonicalIdentityKey"
      from discovery_candidates
      where id = ${expectedFixtures.candidate.id}
    `;
    const [research] = await sql`
      select
        id,
        candidate_id as "candidateId",
        discovery_run_id as "discoveryRunId"
      from candidate_research_versions
      where id = ${expectedFixtures.research.id}
    `;
    const [source] = await sql`
      select
        id,
        candidate_id as "candidateId",
        discovery_run_id as "discoveryRunId",
        source_url as "sourceUrl"
      from discovery_candidate_sources
      where id = ${expectedFixtures.source.id}
    `;
    const [discoveryCounts] = await sql`
      select
        (select count(*)::integer from discovery_candidates) as "candidateCount",
        (select count(*)::integer from candidate_research_versions) as "researchCount",
        (select count(*)::integer from discovery_candidate_sources) as "sourceCount"
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
    assert(
      JSON.stringify(candidate) === JSON.stringify(expectedFixtures.candidate),
      "Discovery candidate fixture changed.",
    );
    assert(
      JSON.stringify(research) === JSON.stringify(expectedFixtures.research),
      "Candidate research fixture changed.",
    );
    assert(
      JSON.stringify(source) === JSON.stringify(expectedFixtures.source),
      "Discovery source fixture changed.",
    );
    assert(
      JSON.stringify(discoveryCounts) ===
        JSON.stringify(expectedFixtures.discoveryCounts),
      "Discovery candidate, research, or source row counts changed.",
    );
  }
}

async function assertMigrationState(sql, expectedFixtures = null) {
  await assertDiscoveryMigration(sql, expectedFixtures);
  await assertOpportunityBriefMigration(sql);
  await assertEcosystemIntelligenceMigration(sql);
  await assertAppliedMigrations(sql);
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
  await assertMigrationState(freshClient);
  console.log("Fresh ordered migration path passed.");

  await prepareDatabase(admin, upgradeDatabaseName);
  temporaryFolder = await createUpgradeMigrationFolder();
  upgradeClient = postgres(databaseUrl(upgradeDatabaseName), {
    max: 1,
    prepare: false,
  });
  await migrate(drizzle(upgradeClient), { migrationsFolder: temporaryFolder });
  await assertBaselineMigrations(upgradeClient);
  const fixtures = await insertUpgradeFixtures(upgradeClient);
  await migrate(drizzle(upgradeClient), { migrationsFolder });
  await assertMigrationState(upgradeClient, fixtures);
  await assertEcosystemConstraintBehavior(upgradeClient, fixtures.candidate.id);
  console.log(
    `Upgrade migration ${newestMigration.tag} passed with unchanged product and Discovery fixtures and enforced ecosystem constraints.`,
  );
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
    "Migration harness failed.",
  );
}
