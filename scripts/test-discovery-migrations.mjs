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
const allowedDatabaseNames = new Set([
  "mewtuals_discovery_fresh_test",
  "mewtuals_discovery_upgrade_test",
]);
const freshDatabaseName = "mewtuals_discovery_fresh_test";
const upgradeDatabaseName = "mewtuals_discovery_upgrade_test";

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

async function dropDatabase(admin, databaseName) {
  assertAllowedDatabaseName(databaseName);
  await terminateDatabaseConnections(admin, databaseName);
  await admin.unsafe(`drop database if exists "${databaseName}"`);
}

async function createDatabase(admin, databaseName) {
  assertAllowedDatabaseName(databaseName);
  await admin.unsafe(`create database "${databaseName}"`);
}

async function prepareDatabase(admin, databaseName) {
  await dropDatabase(admin, databaseName);
  await createDatabase(admin, databaseName);
}

async function createUpgradeMigrationFolder() {
  const temporaryFolder = await mkdtemp(
    join(tmpdir(), "mewtuals-discovery-migrations-"),
  );
  const metaFolder = join(temporaryFolder, "meta");
  await mkdir(metaFolder);

  const journalPath = join(migrationsFolder, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  const filteredJournal = {
    ...journal,
    entries: journal.entries.filter(({ idx }) => idx <= 3),
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
    returning id, user_id as "userId", name, status
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
    returning id, profile_id as "profileId", decision
  `;
  return { user, profile, review };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertDiscoveryMigration(sql, expectedFixtures = null) {
  const expectedTables = [
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

  const requiredConstraints = [
    "discovery_candidate_identifiers_type_value_unique",
    "discovery_candidate_sources_evidence_unique",
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
  const foreignKeys = await sql`
    select table_name as "tableName", count(*)::integer as count
    from information_schema.table_constraints
    where table_schema = 'public'
      and constraint_type = 'FOREIGN KEY'
      and table_name in (
        'discovery_candidate_identifiers',
        'discovery_candidate_sources',
        'discovery_candidates'
      )
    group by table_name
  `;
  const foreignKeyCounts = Object.fromEntries(
    foreignKeys.map(({ tableName, count }) => [tableName, count]),
  );
  assert(
    foreignKeyCounts.discovery_candidate_identifiers === 1 &&
      foreignKeyCounts.discovery_candidate_sources === 2 &&
      foreignKeyCounts.discovery_candidates === 1,
    `Expected discovery foreign keys, found ${JSON.stringify(foreignKeyCounts)}.`,
  );

  const [activeRunIndex] = await sql`
    select indexdef
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'discovery_runs_one_running_idx'
  `;
  assert(
    activeRunIndex?.indexdef.includes("CREATE UNIQUE INDEX") &&
      activeRunIndex.indexdef.includes("WHERE (status = 'running'"),
    `Expected partial active-run index, found ${activeRunIndex?.indexdef ?? "none"}.`,
  );

  const journal = JSON.parse(
    await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
  );
  const migration = journal.entries.find(({ idx }) => idx === 4);
  assert(migration, "Expected a 0004 migration journal entry.");
  const [applied] = await sql`
    select count(*)::integer as count
    from drizzle.__drizzle_migrations
    where created_at = ${migration.when}
  `;
  assert(applied.count === 1, `Expected 0004 exactly once, found ${applied.count}.`);

  if (expectedFixtures) {
    const [user] = await sql`
      select id, email, name
      from users
      where id = ${expectedFixtures.user.id}
    `;
    const [profile] = await sql`
      select id, user_id as "userId", name, status
      from profiles
      where id = ${expectedFixtures.profile.id}
    `;
    const [review] = await sql`
      select id, profile_id as "profileId", decision
      from verification_reviews
      where id = ${expectedFixtures.review.id}
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
  }
}

const admin = postgres(adminUrl, { max: 1, prepare: false });
let freshClient;
let upgradeClient;
let temporaryFolder;

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
} finally {
  if (freshClient) await freshClient.end({ timeout: 5 });
  if (upgradeClient) await upgradeClient.end({ timeout: 5 });
  for (const databaseName of allowedDatabaseNames) {
    await dropDatabase(admin, databaseName);
  }
  await admin.end({ timeout: 5 });
  if (temporaryFolder) await rm(temporaryFolder, { recursive: true });
}
