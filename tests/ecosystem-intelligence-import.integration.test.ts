import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  candidateIdentifierForProfileUrl,
  normalizeDiscoveryUrl,
} from "../app/domain/discovery";
import { closeDb, getDb } from "../db/client";
import { createEcosystemIntelligenceImportRepository } from
  "../db/repositories/ecosystem-intelligence-import-repository";
import {
  candidateEcosystemClassifications,
  candidateHeadquarters,
  candidatePublicSignals,
  candidateRelationships,
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryRuns,
} from "../db/schema";
import { parseEcosystemImportDocument } from
  "../scripts/ecosystem-intelligence-import";

const database = getDb();
const repository = createEcosystemIntelligenceImportRepository(database);
const testId = randomUUID();
const compactTestId = testId.replaceAll("-", "");
const testGeography = `Ecosystem importer ${testId}`;
const baseTime = new Date("2026-07-29T08:30:00.000Z");
const temporaryDirectories: string[] = [];

function candidateUrl(suffix: string): string {
  return `https://${suffix}-${compactTestId}.example`;
}

async function assertTestDatabase(): Promise<void> {
  const [current] = await database.execute<{ databaseName: string }>(
    sql`select current_database() as "databaseName"`,
  );
  if (current?.databaseName !== "mewtuals_test") {
    throw new Error(
      `Refusing Ecosystem importer cleanup in ${current?.databaseName ?? "an unknown database"}.`,
    );
  }
}

async function cleanup(): Promise<void> {
  await assertTestDatabase();
  const candidates = await database
    .select({ id: discoveryCandidates.id, runId: discoveryCandidates.mostRecentRunId })
    .from(discoveryCandidates)
    .where(eq(discoveryCandidates.geography, testGeography));
  if (candidates.length === 0) return;
  await database.delete(discoveryCandidates).where(
    inArray(discoveryCandidates.id, candidates.map(({ id }) => id)),
  );
  await database.delete(discoveryRuns).where(
    inArray(discoveryRuns.id, candidates.map(({ runId }) => runId)),
  );
}

async function createCandidate(
  suffix: string,
  type: "company" | "creator" = "company",
) {
  const canonicalUrl = normalizeDiscoveryUrl(candidateUrl(suffix));
  const identifier = candidateIdentifierForProfileUrl(canonicalUrl);
  const [run] = await database.insert(discoveryRuns).values({
    externalRunKey: `ecosystem-import-${testId}-${suffix}-${type}-${randomUUID()}`,
    campaignKey: "robotics_hardware_india",
    trigger: "manual",
    status: "succeeded",
    startedAt: baseTime,
    completedAt: baseTime,
    geography: testGeography,
    candidateType: type,
    sourcesUsed: ["integration"],
    requestedCount: 1,
    companyPercentage: type === "company" ? 100 : 0,
    foundCount: 1,
    newCount: 1,
    createdAt: baseTime,
    updatedAt: baseTime,
  }).returning();
  if (!run) throw new Error("Test Discovery run was not created.");

  const [candidate] = await database.insert(discoveryCandidates).values({
    type,
    name: `Import ${suffix}`,
    normalizedName: `import ${suffix}`,
    canonicalIdentityKey: `${identifier.kind}:${identifier.value}`,
    canonicalUrl,
    websiteUrl: canonicalUrl,
    discoveredDescription: "Publicly evidenced Physical AI test candidate.",
    category: "robot makers and integrators",
    geography: testGeography,
    firstSourceName: "integration",
    firstSourceUrl: canonicalUrl,
    discoveredAt: baseTime,
    lastSeenAt: baseTime,
    mostRecentRunId: run.id,
    discoveryScore: 80,
    createdAt: baseTime,
    updatedAt: baseTime,
  }).returning();
  if (!candidate) throw new Error("Test Discovery candidate was not created.");
  await database.insert(discoveryCandidateIdentifiers).values({
    candidateId: candidate.id,
    candidateType: type,
    kind: identifier.kind,
    normalizedValue: identifier.value,
    createdAt: baseTime,
  });
  return { candidate, run, identifier };
}

function evidenceCandidate(
  identity: { candidateId?: string; canonicalUrl?: string },
  overrides: Record<string, unknown> = {},
) {
  return {
    ...identity,
    classifications: [
      {
        kind: "ecosystem_domain",
        termKey: "physical_ai",
        evidenceState: "evidence_backed",
        confidence: 90,
        basis: "The public systems page documents embodied AI products.",
        sourceUrls: ["https://evidence.example.com/systems"],
      },
    ],
    headquarters: {
      countryCode: "IN",
      stateKey: "karnataka",
      stateLabel: "Karnataka",
      cityKey: "bengaluru",
      cityLabel: "Bengaluru",
      latitude: 12.9716,
      longitude: 77.5946,
      evidenceState: "evidence_backed",
      confidence: 85,
      sourceUrls: ["https://evidence.example.com/contact"],
    },
    signals: [
      {
        signalType: "product_launch",
        title: "Public launch",
        occurredAt: "2026-07-20T10:00:00.000Z",
        sourceUrl: "https://evidence.example.com/launch",
        confidence: 80,
      },
    ],
    relationships: [
      {
        targetPublicName: "Public Research Lab",
        relationshipType: "researches_with",
        evidenceUrl: "https://evidence.example.com/research",
        confidence: 75,
        observedAt: "2026-07-21T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

function document(candidates: unknown[]) {
  return parseEcosystemImportDocument({
    schemaVersion: "ecosystem-intelligence-import-v1",
    generatedAt: "2026-07-29T08:30:00.000Z",
    candidates,
  });
}

function writePrivateDocument(value: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "mewtuals-ecosystem-db-import-"));
  temporaryDirectories.push(directory);
  const file = join(directory, "evidence.json");
  writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

function runImportCli(file: string) {
  return new Promise<{ exitCode: number; stdout: string; stderr: string }>(
    (resolveResult, reject) => {
      const child = spawn(
        resolve("node_modules/.bin/tsx"),
        [resolve("scripts/ecosystem-intelligence-import.ts"), "import", "--file", file],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: "postgresql://127.0.0.1:55432/mewtuals_test",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr.on("data", (chunk: string) => { stderr += chunk; });
      child.on("error", reject);
      child.on("close", (exitCode) => {
        resolveResult({ exitCode: exitCode ?? 1, stdout, stderr });
      });
    },
  );
}

beforeEach(cleanup);
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe("Ecosystem Intelligence import repository", () => {
  it("resolves normalized canonical source and target identities before inserting facts", async () => {
    const source = await createCandidate("source");
    const target = await createCandidate("target");
    const sourceCanonicalUrl = `${source.candidate.canonicalUrl}/about`;
    await database.update(discoveryCandidates).set({
      canonicalUrl: sourceCanonicalUrl,
    }).where(eq(discoveryCandidates.id, source.candidate.id));
    const input = document([
      evidenceCandidate(
        { canonicalUrl: `https://WWW.${new URL(sourceCanonicalUrl).hostname}/about?utm_source=ignored` },
        {
          relationships: [
            {
              targetCanonicalUrl: `${target.candidate.canonicalUrl}/?utm_campaign=ignored`,
              relationshipType: "supplies_to",
              evidenceUrl: "https://evidence.example.com/supply",
              confidence: 88,
              observedAt: "2026-07-22T00:00:00.000Z",
            },
          ],
        },
      ),
    ]);

    const result = await repository.importDocument(input, baseTime);

    expect(result).toEqual({
      candidatesResolved: 1,
      insertedCounts: {
        classifications: 1,
        headquarters: 1,
        signals: 1,
        relationships: 1,
      },
      updatedCounts: {
        classifications: 0,
        headquarters: 0,
        signals: 0,
        relationships: 0,
      },
      duplicateCounts: {
        classifications: 0,
        headquarters: 0,
        signals: 0,
        relationships: 0,
      },
      unresolvedCount: 0,
    });
    const [relationship] = await database.select().from(candidateRelationships);
    expect(relationship).toMatchObject({
      sourceCandidateId: source.candidate.id,
      targetCandidateId: target.candidate.id,
      targetPublicName: null,
      relationshipType: "supplies_to",
    });
  });

  it("rejects missing, ambiguous, and repeated resolved identities before mutation", async () => {
    const known = await createCandidate("known");
    const missing = document([
      evidenceCandidate({ candidateId: known.candidate.id }),
      evidenceCandidate({ canonicalUrl: candidateUrl("missing") }, {
        classifications: [],
        headquarters: undefined,
        signals: [{
          signalType: "funding",
          title: "Public funding",
          occurredAt: "2026-07-01T00:00:00.000Z",
          sourceUrl: "https://evidence.example.com/funding",
          confidence: 70,
        }],
        relationships: [],
      }),
    ]);
    await expect(repository.importDocument(missing, baseTime)).rejects.toMatchObject({
      code: "identity_not_found",
    });
    expect(await database.select().from(candidateEcosystemClassifications)).toHaveLength(0);

    await createCandidate("ambiguous", "company");
    await createCandidate("ambiguous", "creator");
    await expect(repository.importDocument(document([
      evidenceCandidate({ canonicalUrl: candidateUrl("ambiguous") }),
    ]), baseTime)).rejects.toMatchObject({ code: "identity_ambiguous" });
    expect(await database.select().from(candidateEcosystemClassifications)).toHaveLength(0);

    const repeated = document([
      evidenceCandidate({ candidateId: known.candidate.id }),
      evidenceCandidate({ canonicalUrl: known.candidate.canonicalUrl }, {
        classifications: [{
          kind: "capability",
          termKey: "edge_ai",
          evidenceState: "evidence_backed",
          confidence: 80,
          basis: "A second public fact for the same resolved candidate.",
          sourceUrls: ["https://evidence.example.com/edge-ai"],
        }],
        headquarters: undefined,
        signals: [],
        relationships: [],
      }),
    ]);
    await expect(repository.importDocument(repeated, baseTime)).rejects.toMatchObject({
      code: "repeated_candidate_identity",
    });
    expect(await database.select().from(candidateEcosystemClassifications)).toHaveLength(0);
  });

  it("is replay-idempotent and updates safe fields while preserving row identity and createdAt", async () => {
    const source = await createCandidate("idempotent");
    const input = document([evidenceCandidate({ candidateId: source.candidate.id })]);
    const first = await repository.importDocument(input, baseTime);
    const before = {
      classification: (await database.select().from(candidateEcosystemClassifications))[0]!,
      headquarters: (await database.select().from(candidateHeadquarters))[0]!,
      signal: (await database.select().from(candidatePublicSignals))[0]!,
      relationship: (await database.select().from(candidateRelationships))[0]!,
    };

    const replay = await repository.importDocument(
      input,
      new Date("2026-07-29T09:30:00.000Z"),
    );
    expect(first.insertedCounts).toEqual({
      classifications: 1,
      headquarters: 1,
      signals: 1,
      relationships: 1,
    });
    expect(replay.duplicateCounts).toEqual({
      classifications: 1,
      headquarters: 1,
      signals: 1,
      relationships: 1,
    });

    const changed = document([evidenceCandidate(
      { candidateId: source.candidate.id },
      {
        classifications: [{
          ...input.candidates[0].classifications[0],
          confidence: 95,
          basis: "Updated public product evidence.",
        }],
        headquarters: {
          ...input.candidates[0].headquarters,
          cityKey: "mysuru",
          cityLabel: "Mysuru",
          confidence: 90,
        },
        signals: [{
          ...input.candidates[0].signals[0],
          title: "Updated public launch title",
          confidence: 85,
        }],
        relationships: [{
          ...input.candidates[0].relationships[0],
          confidence: 82,
        }],
      },
    )]);
    const updated = await repository.importDocument(
      changed,
      new Date("2026-07-29T10:30:00.000Z"),
    );
    expect(updated.updatedCounts).toEqual({
      classifications: 1,
      headquarters: 1,
      signals: 1,
      relationships: 1,
    });
    const after = {
      classification: (await database.select().from(candidateEcosystemClassifications))[0]!,
      headquarters: (await database.select().from(candidateHeadquarters))[0]!,
      signal: (await database.select().from(candidatePublicSignals))[0]!,
      relationship: (await database.select().from(candidateRelationships))[0]!,
    };
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      expect(after[key].id).toBe(before[key].id);
      expect(after[key].createdAt).toEqual(before[key].createdAt);
    }
    expect(after.classification).toMatchObject({ confidence: 95, basis: "Updated public product evidence." });
    expect(after.headquarters).toMatchObject({ cityKey: "mysuru", confidence: 90 });
    expect(after.signal).toMatchObject({ title: "Updated public launch title", confidence: 85 });
    expect(after.relationship).toMatchObject({ confidence: 82 });
  });

  it("rolls back every fact when a resolved relationship is a self-link", async () => {
    const source = await createCandidate("rollback");
    const input = document([evidenceCandidate(
      { candidateId: source.candidate.id },
      {
        relationships: [{
          targetCanonicalUrl: source.candidate.canonicalUrl,
          relationshipType: "integrates_with",
          evidenceUrl: "https://evidence.example.com/self",
          confidence: 70,
        }],
      },
    )]);

    await expect(repository.importDocument(input, baseTime)).rejects.toMatchObject({
      code: "self_relationship",
    });
    expect(await database.select().from(candidateEcosystemClassifications)).toHaveLength(0);
    expect(await database.select().from(candidateHeadquarters)).toHaveLength(0);
    expect(await database.select().from(candidatePublicSignals)).toHaveLength(0);
    expect(await database.select().from(candidateRelationships)).toHaveLength(0);
  });

  it("rolls back earlier upserts when a later database fact fails", async () => {
    const source = await createCandidate("database-rollback");
    const functionName = `fail_ecosystem_signal_${compactTestId}`;
    const triggerName = `fail_ecosystem_signal_${compactTestId}`;
    await database.execute(sql.raw(`
      create function ${functionName}() returns trigger language plpgsql as $$
      begin
        if NEW.candidate_id = '${source.candidate.id}'::uuid then
          raise exception 'forced ecosystem importer rollback';
        end if;
        return NEW;
      end;
      $$;
      create trigger ${triggerName}
      before insert or update on candidate_public_signals
      for each row execute function ${functionName}();
    `));
    try {
      await expect(repository.importDocument(document([
        evidenceCandidate({ candidateId: source.candidate.id }),
      ]), baseTime)).rejects.toThrow();
    } finally {
      await database.execute(sql.raw(`
        drop trigger if exists ${triggerName} on candidate_public_signals;
        drop function if exists ${functionName}();
      `));
    }

    expect(await database.select().from(candidateEcosystemClassifications)).toHaveLength(0);
    expect(await database.select().from(candidateHeadquarters)).toHaveLength(0);
    expect(await database.select().from(candidatePublicSignals)).toHaveLength(0);
    expect(await database.select().from(candidateRelationships)).toHaveLength(0);
  });

  it("does not mutate Discovery identity or workflow rows", async () => {
    const source = await createCandidate("discovery-boundary");
    const [beforeCandidate] = await database.select().from(discoveryCandidates).where(
      eq(discoveryCandidates.id, source.candidate.id),
    );
    const [beforeRun] = await database.select().from(discoveryRuns).where(
      eq(discoveryRuns.id, source.run.id),
    );
    const beforeIdentifiers = await database.select().from(discoveryCandidateIdentifiers).where(
      eq(discoveryCandidateIdentifiers.candidateId, source.candidate.id),
    );

    await repository.importDocument(document([
      evidenceCandidate({ candidateId: source.candidate.id }),
    ]), new Date("2026-07-29T11:30:00.000Z"));

    const [afterCandidate] = await database.select().from(discoveryCandidates).where(
      eq(discoveryCandidates.id, source.candidate.id),
    );
    const [afterRun] = await database.select().from(discoveryRuns).where(
      eq(discoveryRuns.id, source.run.id),
    );
    const afterIdentifiers = await database.select().from(discoveryCandidateIdentifiers).where(
      eq(discoveryCandidateIdentifiers.candidateId, source.candidate.id),
    );
    expect(afterCandidate).toEqual(beforeCandidate);
    expect(afterRun).toEqual(beforeRun);
    expect(afterIdentifiers).toEqual(beforeIdentifiers);
  });

  it("imports through the CLI with terminal safe JSON only", async () => {
    const source = await createCandidate("cli");
    const input = {
      schemaVersion: "ecosystem-intelligence-import-v1",
      generatedAt: "2026-07-29T08:30:00.000Z",
      candidates: [evidenceCandidate({ candidateId: source.candidate.id })],
    };

    const result = await runImportCli(writePrivateDocument(input));

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: "ecosystem-intelligence-import-v1",
      candidateCount: 1,
      factCounts: {
        classifications: 1,
        headquarters: 1,
        signals: 1,
        relationships: 1,
      },
      duplicateCounts: {
        classifications: 0,
        headquarters: 0,
        signals: 0,
        relationships: 0,
      },
      unresolvedCount: 0,
      status: "imported",
    });
    expect(Object.keys(JSON.parse(result.stdout)).sort()).toEqual([
      "candidateCount",
      "duplicateCounts",
      "factCounts",
      "fileHash",
      "schemaVersion",
      "status",
      "unresolvedCount",
    ]);
    expect(result.stdout).not.toContain(source.candidate.id);
    expect(result.stdout).not.toContain("postgresql://");
  });
});
