import { createHash, randomBytes, randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { hashGlobalRadarLeaseToken } from "../app/server/global-radar/worker-auth";
import { closeDb, getDb, type MewtualsDatabase } from "../db/client";
import * as globalRadarDatabaseSchema from "../db/global-radar-schema";
import {
  globalEntities,
  globalRadarAdminEvents,
  globalRadarPromotions,
  globalRadarRuns,
  globalRadarSearchQueries,
  globalRadarSignalEntities,
  globalRadarSignals,
  globalRadarWatchlistEntries,
  globalSignalEvidence,
  globalSignalRequirements,
  globalSignalUpdates,
} from "../db/global-radar-schema";
import { createDiscoveryRepository } from "../db/repositories/discovery-repository";
import {
  type CompleteGlobalRadarRunInput,
  createGlobalRadarRepository,
  type QueueGlobalRadarRunInput,
} from "../db/repositories/global-radar-repository";
import * as coreDatabaseSchema from "../db/schema";
import { discoveryRuns, users } from "../db/schema";

const db = getDb();
const testRun = randomUUID();
const userEmail = `global-radar-db-${testRun}@example.test`;
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const LEASE_SECRET =
  "global-radar-integration-lease-secret-longer-than-32-characters";
const leaseCodec = {
  issueLeaseToken: () => randomBytes(32).toString("hex"),
  hashLeaseToken: hashLease,
};
const repository = createGlobalRadarRepository(db, leaseCodec);
const PRIVATE_PERSISTENCE_FIELDS = [
  "leaseTokenHash",
  "submissionHash",
  "batchFingerprint",
  "errorSummary",
  "planSnapshot",
] as const;

let administratorUserId = "";

const databaseSchema = {
  ...coreDatabaseSchema,
  ...globalRadarDatabaseSchema,
};

type IndependentDatabase = {
  client: Sql;
  database: MewtualsDatabase;
};

function createIndependentDatabase(applicationName: string): IndependentDatabase {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests.");
  const client = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    connection: { application_name: applicationName },
  });
  return {
    client,
    database: drizzle(client, { schema: databaseSchema }),
  };
}

async function closeIndependentDatabases(databases: IndependentDatabase[]) {
  await Promise.all(databases.map(({ client }) => client.end({ timeout: 5 })));
}

function queueInput(
  suffix: string,
  overrides: Partial<QueueGlobalRadarRunInput> = {},
): QueueGlobalRadarRunInput {
  return {
    externalRunKey: `global-radar-${testRun}-${suffix}`,
    requestHash: HASH_A,
    trigger: "scheduled",
    scanMode: "daily",
    planFingerprint: HASH_B,
    planSnapshot: { version: "global-radar-plan-v1", theme: "general" },
    sourceCountries: ["United States", "China"],
    sourceLanguages: ["en", "zh-CN"],
    targetDomains: ["robotics"],
    targetSignalTypes: ["direct_demand"],
    sourcesUsed: ["codex_public_web"],
    promptVersion: "codex-public-web-v1",
    schemaVersion: "global-radar-batch-v1",
    taxonomyVersion: "global-radar-taxonomy-v1",
    scoringVersion: "global-radar-score-v1",
    now: new Date("2026-07-29T04:00:00.000Z"),
    ...overrides,
  };
}

function plainSha256(rawToken: string) {
  return createHash("sha256").update(rawToken).digest("hex");
}

function hashLease(rawToken: string) {
  return hashGlobalRadarLeaseToken(LEASE_SECRET, rawToken);
}

function expectSafeProjection(value: unknown) {
  const json = JSON.stringify(value);
  for (const forbidden of PRIVATE_PERSISTENCE_FIELDS) {
    expect(json).not.toContain(forbidden);
  }
}

function completionInput(
  runId: string,
  leaseToken: string,
  now: Date,
  overrides: Partial<CompleteGlobalRadarRunInput> = {},
): CompleteGlobalRadarRunInput {
  return {
    runId,
    leaseToken,
    planFingerprint: HASH_B,
    submissionHash: HASH_A,
    batchFingerprint: HASH_C,
    now,
    counters: {
      numberResultsExamined: 10,
      numberEntitiesObserved: 2,
      numberSignalsFound: 2,
      numberDirectDemands: 1,
      numberPrecursors: 1,
      numberMomentumRecords: 0,
      numberNew: 1,
      numberUpdated: 0,
      numberDuplicates: 1,
      numberRejectedForWeakEvidence: 0,
      numberSourceErrors: 0,
    },
    sourceErrors: [],
    ...overrides,
  };
}

async function graphRowCounts() {
  const tables = [
    globalEntities,
    globalRadarSearchQueries,
    globalRadarSignals,
    globalRadarSignalEntities,
    globalSignalRequirements,
    globalSignalEvidence,
    globalSignalUpdates,
  ] as const;
  return Promise.all(
    tables.map(async (table) => {
      const [result] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
      return result?.count ?? 0;
    }),
  );
}

async function runningPersistenceSnapshot(runId: string) {
  const [run] = await db
    .select({
      status: globalRadarRuns.status,
      requestHash: globalRadarRuns.requestHash,
      planFingerprint: globalRadarRuns.planFingerprint,
      leaseTokenHash: globalRadarRuns.leaseTokenHash,
      submissionHash: globalRadarRuns.submissionHash,
      batchFingerprint: globalRadarRuns.batchFingerprint,
      numberResultsExamined: globalRadarRuns.numberResultsExamined,
      numberEntitiesObserved: globalRadarRuns.numberEntitiesObserved,
      numberSignalsFound: globalRadarRuns.numberSignalsFound,
      numberDirectDemands: globalRadarRuns.numberDirectDemands,
      numberPrecursors: globalRadarRuns.numberPrecursors,
      numberMomentumRecords: globalRadarRuns.numberMomentumRecords,
      numberNew: globalRadarRuns.numberNew,
      numberUpdated: globalRadarRuns.numberUpdated,
      numberDuplicates: globalRadarRuns.numberDuplicates,
      numberRejectedForWeakEvidence:
        globalRadarRuns.numberRejectedForWeakEvidence,
      numberSourceErrors: globalRadarRuns.numberSourceErrors,
      errorSummary: globalRadarRuns.errorSummary,
      updatedAt: globalRadarRuns.updatedAt,
    })
    .from(globalRadarRuns)
    .where(eq(globalRadarRuns.id, runId));
  if (!run) throw new Error("Running Radar fixture was not found.");
  return run;
}

async function expectRejectedSourceErrorsLeaveRunUnchanged(
  suffix: string,
  sourceErrors: readonly { sourceName: string; message: string }[],
) {
  const now = new Date("2026-07-30T01:00:00.000Z");
  await repository.queueRun(queueInput(suffix, { now }));
  const claim = await repository.claimRun({ now });
  if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
  const before = await runningPersistenceSnapshot(claim.run.id);

  await expect(
    repository.completeRun(
      completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
        {
          counters: {
            ...completionInput(
              claim.run.id,
              claim.privateClaim.leaseToken,
              now,
            ).counters,
            numberSourceErrors: sourceErrors.length,
          },
          sourceErrors,
        },
      ),
    ),
  ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });

  expect(await runningPersistenceSnapshot(claim.run.id)).toEqual(before);
}

async function cleanRadarRows() {
  const [database] = await db.execute<{ databaseName: string }>(
    sql`select current_database() as "databaseName"`,
  );
  if (database?.databaseName !== "mewtuals_test") {
    throw new Error(
      `Refusing Global Radar integration cleanup in ${database?.databaseName ?? "an unknown database"}.`,
    );
  }
  await db.delete(globalRadarAdminEvents);
  await db.delete(globalSignalUpdates);
  await db.delete(globalSignalEvidence);
  await db.delete(globalSignalRequirements);
  await db.delete(globalRadarSignalEntities);
  await db.delete(globalRadarPromotions);
  await db.delete(globalRadarSignals);
  await db.delete(globalRadarSearchQueries);
  await db.delete(globalRadarWatchlistEntries);
  await db.delete(globalEntities);
  await db.delete(globalRadarRuns);
  await db.delete(discoveryRuns);
}

beforeAll(async () => {
  await cleanRadarRows();
  const [administrator] = await db
    .insert(users)
    .values({ email: userEmail, name: "Radar test administrator" })
    .returning({ id: users.id });
  if (!administrator) throw new Error("Radar test administrator was not created.");
  administratorUserId = administrator.id;
});

beforeEach(cleanRadarRows);

afterAll(async () => {
  await cleanRadarRows();
  await db.delete(users).where(eq(users.id, administratorUserId));
  await closeDb();
});

describe("PostgreSQL Global Radar repository queue", () => {
  it("replays the same external key and request hash but conflicts on a changed hash", async () => {
    const input = queueInput("idempotency");

    const queued = await repository.queueRun(input);
    const replayed = await repository.queueRun(input);
    const mismatch = await repository.queueRun({
      ...input,
      requestHash: HASH_C,
    });
    if (queued.outcome === "conflict") throw new Error("Fixture was not queued.");

    expect(queued).toMatchObject({ outcome: "queued" });
    expect(replayed).toMatchObject({
      outcome: "replayed",
      run: { id: queued.run.id, externalRunKey: input.externalRunKey },
    });
    expect(mismatch).toMatchObject({
      outcome: "conflict",
      reason: "request_mismatch",
      run: { id: queued.run.id },
    });
    expect(JSON.stringify(mismatch)).not.toContain(HASH_A);
    expectSafeProjection(queued);
    expectSafeProjection(replayed);
    expectSafeProjection(mismatch);
  });

  it("returns invalid-input conflicts for malformed plans and manual identity", async () => {
    const administratorRequestId = randomUUID();
    const manual = queueInput("manual-valid", {
      trigger: "manual",
      scanMode: "manual",
      administratorRequestId,
      requestedByUserId: administratorUserId,
      requestedByEmail: userEmail,
    });

    await expect(repository.queueRun(manual)).resolves.toMatchObject({
      outcome: "queued",
    });
    await expect(
      repository.queueRun(
        queueInput("manual-missing", {
          trigger: "manual",
          scanMode: "manual",
        }),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun(
        queueInput("nonmanual-manual-mode", { scanMode: "manual" }),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun(
        queueInput("unknown-user", {
          trigger: "manual",
          scanMode: "manual",
          administratorRequestId: randomUUID(),
          requestedByUserId: randomUUID(),
          requestedByEmail: userEmail,
        }),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun(
        queueInput("oversized-plan", {
          planSnapshot: { value: "x".repeat(8_193) },
        }),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun(
        queueInput("uppercase-hash", { requestHash: HASH_A.toUpperCase() }),
      ),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun({
        ...queueInput("invalid-enum"),
        trigger: "unexpected",
      } as unknown as QueueGlobalRadarRunInput),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.queueRun({
        ...queueInput("invalid-array"),
        sourceCountries: [7],
      } as unknown as QueueGlobalRadarRunInput),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
  });

  it("keeps Radar and Discovery external keys independent", async () => {
    const externalRunKey = `shared-context-key-${testRun}`;
    const radar = await repository.queueRun(
      queueInput("independent-key", { externalRunKey }),
    );

    const discovery = createDiscoveryRepository(db);
    await discovery.queueRun({
      externalRunKey,
      trigger: "scheduled",
      now: new Date("2026-07-29T04:00:00.000Z"),
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["public_web"],
      requestedCount: 1,
      companyPercentage: 100,
    });

    expect(radar).toMatchObject({
      outcome: "queued",
      run: { externalRunKey },
    });
    expect(
      await db
        .select({ id: globalRadarRuns.id })
        .from(globalRadarRuns)
        .where(eq(globalRadarRuns.externalRunKey, externalRunKey)),
    ).toHaveLength(1);
    expect(
      await db
        .select({ id: discoveryRuns.id })
        .from(discoveryRuns)
        .where(eq(discoveryRuns.externalRunKey, externalRunKey)),
    ).toHaveLength(1);
  });

  it("never replays when external and administrator identities resolve to different rows", async () => {
    const now = new Date("2026-07-29T05:00:00.000Z");
    const sharedExternalRunKey = `global-radar-${testRun}-dual-collision-a`;
    const administratorRequestId = randomUUID();
    const externalOwner = await repository.queueRun(
      queueInput("dual-collision-a", {
        externalRunKey: sharedExternalRunKey,
        requestHash: HASH_A,
        now,
      }),
    );
    const administratorInput = queueInput("dual-collision-b", {
      requestHash: HASH_A,
      trigger: "manual",
      scanMode: "manual",
      administratorRequestId,
      requestedByUserId: administratorUserId,
      requestedByEmail: userEmail,
      now: new Date(now.getTime() + 1_000),
    });
    const administratorOwner = await repository.queueRun(administratorInput);
    if (
      externalOwner.outcome === "conflict" ||
      administratorOwner.outcome === "conflict"
    ) {
      throw new Error("Dual-collision fixtures were not queued.");
    }
    await expect(repository.queueRun(administratorInput)).resolves.toMatchObject({
      outcome: "replayed",
      run: { id: administratorOwner.run.id },
    });

    const collision = await repository.queueRun(
      queueInput("dual-collision-attempt", {
        externalRunKey: sharedExternalRunKey,
        requestHash: HASH_A,
        trigger: "manual",
        scanMode: "manual",
        administratorRequestId,
        requestedByUserId: administratorUserId,
        requestedByEmail: userEmail,
        now: new Date(now.getTime() + 2_000),
      }),
    );

    expect(collision).toMatchObject({
      outcome: "conflict",
      reason: "request_mismatch",
      run: { id: externalOwner.run.id },
    });
    expectSafeProjection(collision);
  });
});

describe("PostgreSQL Global Radar repository claiming", () => {
  it("prioritizes manual work and returns a one-time two-hour lease without public leakage", async () => {
    const now = new Date("2026-07-29T06:00:00.000Z");
    const privatePlanSnapshot = {
      version: "global-radar-plan-v1",
      nested: { theme: "private-claim-test" },
    };
    await repository.queueRun(queueInput("scheduled", { now }));
    await repository.queueRun(
      queueInput("manual", {
        trigger: "manual",
        scanMode: "manual",
        administratorRequestId: randomUUID(),
        requestedByUserId: administratorUserId,
        requestedByEmail: userEmail,
        planSnapshot: privatePlanSnapshot,
        now: new Date(now.getTime() + 1_000),
      }),
    );
    await repository.queueRun(
      queueInput("trial", {
        trigger: "trial",
        scanMode: "thematic",
        now: new Date(now.getTime() - 1_000),
      }),
    );

    const claimed = await repository.claimRun({ now });

    expect(claimed).toMatchObject({
      outcome: "claimed",
      run: { trigger: "manual", status: "running" },
    });
    if (claimed.outcome !== "claimed") throw new Error("Radar run was not claimed.");
    expect(claimed.privateClaim).toMatchObject({
      leaseToken: expect.stringMatching(/^[a-f0-9]{64}$/),
      leaseExpiresAt: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
      planSnapshot: privatePlanSnapshot,
    });
    expect(claimed.privateClaim.planSnapshot).not.toBe(privatePlanSnapshot);
    expect(
      (claimed.privateClaim.planSnapshot as typeof privatePlanSnapshot).nested,
    ).not.toBe(privatePlanSnapshot.nested);
    const [stored] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claimed.run.id));
    expect(stored?.leaseTokenHash).toBe(
      hashLease(claimed.privateClaim.leaseToken),
    );
    expect(stored?.leaseTokenHash).not.toBe(
      plainSha256(claimed.privateClaim.leaseToken),
    );
    expect(stored?.leaseTokenHash).not.toBe(claimed.privateClaim.leaseToken);
    expect(stored?.leaseExpiresAt).toEqual(
      new Date(now.getTime() + 2 * 60 * 60 * 1_000),
    );
    const publicJson = JSON.stringify(claimed.run);
    for (const forbidden of [
      ...PRIVATE_PERSISTENCE_FIELDS,
      "requestedByUserId",
      stored?.leaseTokenHash,
    ]) {
      expect(publicJson).not.toContain(forbidden ?? "never-present");
    }
    (claimed.privateClaim.planSnapshot as typeof privatePlanSnapshot).nested.theme =
      "mutated-outside-repository";
    const [storedAfterMutation] = await db
      .select({ planSnapshot: globalRadarRuns.planSnapshot })
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claimed.run.id));
    expect(storedAfterMutation?.planSnapshot).toEqual(privatePlanSnapshot);
  });

  it("blocks on an active lease, then terminalizes expiry without requeueing", async () => {
    const now = new Date("2026-07-29T08:00:00.000Z");
    const firstQueue = await repository.queueRun(queueInput("expiring", { now }));
    if (firstQueue.outcome === "conflict") throw new Error("Fixture was not queued.");
    const firstClaim = await repository.claimRun({ now });
    expect(firstClaim.outcome).toBe("claimed");
    await repository.queueRun(
      queueInput("after-expiry", { now: new Date(now.getTime() + 1_000) }),
    );

    await expect(
      repository.claimRun({ now: new Date(now.getTime() + 60_000) }),
    ).resolves.toMatchObject({ outcome: "no_work", reason: "active_run" });

    const atExpiry = new Date(now.getTime() + 2 * 60 * 60 * 1_000);
    const secondClaim = await repository.claimRun({ now: atExpiry });
    expect(secondClaim).toMatchObject({
      outcome: "claimed",
      run: { externalRunKey: expect.stringContaining("after-expiry") },
    });
    const [expired] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, firstQueue.run.id));
    expect(expired).toMatchObject({
      status: "failed",
      completedAt: atExpiry,
      errorSummary: {
        failure: {
          code: "lease_expired",
          message: "Global Radar run lease expired before completion.",
        },
      },
    });
    expect(expired?.status).not.toBe("queued");
  });

  it("allows only one of two concurrent Radar claims", async () => {
    const now = new Date("2026-07-29T10:00:00.000Z");
    await repository.queueRun(queueInput("concurrent-a", { now }));
    await repository.queueRun(
      queueInput("concurrent-b", { now: new Date(now.getTime() + 1) }),
    );
    const databases = [
      createIndependentDatabase(`radar-claim-a-${testRun}`),
      createIndependentDatabase(`radar-claim-b-${testRun}`),
    ];
    try {
      const results = await Promise.all(
        databases.map(({ database }) =>
          createGlobalRadarRepository(database, leaseCodec).claimRun({ now }),
        ),
      );
      expect(results.filter(({ outcome }) => outcome === "claimed")).toHaveLength(1);
      expect(results.filter(({ outcome }) => outcome === "no_work")).toHaveLength(1);
      expect(
        await db
          .select({ id: globalRadarRuns.id })
          .from(globalRadarRuns)
          .where(eq(globalRadarRuns.status, "running")),
      ).toHaveLength(1);
    } finally {
      await closeIndependentDatabases(databases);
    }
  });

  it("claims Radar while the Discovery advisory transaction lock remains held", async () => {
    const now = new Date("2026-07-29T12:00:00.000Z");
    await repository.queueRun(queueInput("cross-context", { now }));
    const databases = [
      createIndependentDatabase(`discovery-lock-holder-${testRun}`),
      createIndependentDatabase(`radar-independent-${testRun}`),
    ];
    let releaseDiscoveryLock!: () => void;
    let resolveDiscoveryLock!: () => void;
    let rejectDiscoveryLock!: (error: unknown) => void;
    const releaseSignal = new Promise<void>((resolve) => {
      releaseDiscoveryLock = resolve;
    });
    const lockAcquired = new Promise<void>((resolve, reject) => {
      resolveDiscoveryLock = resolve;
      rejectDiscoveryLock = reject;
    });
    const discoveryLockTransaction = databases[0]!.database
      .transaction(async (transaction) => {
        await transaction.execute(
          sql`select pg_advisory_xact_lock(1296385841, 1)`,
        );
        resolveDiscoveryLock();
        await releaseSignal;
      })
      .catch((error: unknown) => {
        rejectDiscoveryLock(error);
        throw error;
      });
    try {
      await lockAcquired;
      await databases[1]!.database.execute(sql`set lock_timeout = '500ms'`);
      const radarClaim = await createGlobalRadarRepository(
        databases[1]!.database,
        leaseCodec,
      ).claimRun({ now });
      expect(radarClaim.outcome).toBe("claimed");
    } finally {
      releaseDiscoveryLock();
      await discoveryLockTransaction;
      await closeIndependentDatabases(databases);
    }
  });
});

describe("PostgreSQL Global Radar repository failure and abandonment", () => {
  it("fails only an unexpired matching lease and replays the same canonical failure after expiry", async () => {
    const now = new Date("2026-07-29T14:00:00.000Z");
    await repository.queueRun(queueInput("worker-fail", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const failedAt = new Date(now.getTime() + 60_000);
    const queuedOther = await repository.queueRun(
      queueInput("worker-fail-queued", { now: failedAt }),
    );
    if (queuedOther.outcome === "conflict") throw new Error("Fixture was not queued.");

    await expect(
      repository.failRun({
        runId: queuedOther.run.id,
        leaseToken: "d".repeat(64),
        now: failedAt,
        reason: "cannot fail queued work",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_state" });

    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: "d".repeat(64),
        now: failedAt,
        reason: "worker stopped",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "lease_mismatch" });
    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: "malformed-token",
        now: failedAt,
        reason: "worker stopped",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    const failed = await repository.failRun({
      runId: claim.run.id,
      leaseToken: claim.privateClaim.leaseToken,
      now: failedAt,
      reason: "  worker   stopped  ",
    });
    expect(failed).toMatchObject({
      outcome: "completed",
      run: {
        status: "failed",
        failure: { code: "worker_failed", message: "worker stopped" },
      },
    });

    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        now: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
        reason: "worker stopped",
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        now: failedAt,
        reason: "different reason",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "failure_mismatch" });
  });

  it("rejects expired fail leases and leaves Discovery runs unchanged", async () => {
    const now = new Date("2026-07-29T15:00:00.000Z");
    await repository.queueRun(queueInput("expired-fail", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const discoveryRepository = createDiscoveryRepository(db);
    const discovery = await discoveryRepository.queueRun({
      externalRunKey: `discovery-fail-unchanged-${testRun}`,
      trigger: "scheduled",
      now,
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["public_web"],
      requestedCount: 1,
      companyPercentage: 100,
    });

    await expect(
      repository.failRun({
        runId: claim.run.id,
        leaseToken: claim.privateClaim.leaseToken,
        now: new Date(now.getTime() + 2 * 60 * 60 * 1_000),
        reason: "too late",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "lease_expired" });
    expect(await discoveryRepository.getRun(discovery.id)).toMatchObject({
      id: discovery.id,
      status: "queued",
    });
  });

  it("abandons only running Radar rows and replays only the same canonical reason", async () => {
    const now = new Date("2026-07-29T16:00:00.000Z");
    const queued = await repository.queueRun(queueInput("abandon", { now }));
    if (queued.outcome === "conflict") throw new Error("Fixture was not queued.");
    await expect(
      repository.abandonRun({
        runId: queued.run.id,
        now,
        reason: "lost claim file",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_state" });

    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const discoveryRepository = createDiscoveryRepository(db);
    const discovery = await discoveryRepository.queueRun({
      externalRunKey: `discovery-abandon-unchanged-${testRun}`,
      trigger: "scheduled",
      now,
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["public_web"],
      requestedCount: 1,
      companyPercentage: 100,
    });
    const abandoned = await repository.abandonRun({
      runId: claim.run.id,
      now: new Date(now.getTime() + 30_000),
      reason: "  lost   claim file ",
    });
    expect(abandoned).toMatchObject({
      outcome: "completed",
      run: {
        status: "failed",
        failure: { code: "abandoned", message: "lost claim file" },
      },
    });
    await expect(
      repository.abandonRun({
        runId: claim.run.id,
        now: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
        reason: "lost claim file",
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      repository.abandonRun({
        runId: claim.run.id,
        now,
        reason: "different reason",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "failure_mismatch" });
    expect(await discoveryRepository.getRun(discovery.id)).toMatchObject({
      id: discovery.id,
      status: "queued",
    });

    const terminalQueue = await repository.queueRun(
      queueInput("abandon-terminal", { now: new Date(now.getTime() + 60_000) }),
    );
    if (terminalQueue.outcome === "conflict") throw new Error("Fixture was not queued.");
    const terminalClaim = await repository.claimRun({
      now: new Date(now.getTime() + 60_000),
    });
    if (terminalClaim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    await repository.completeRun(
      completionInput(
        terminalClaim.run.id,
        terminalClaim.privateClaim.leaseToken,
        new Date(now.getTime() + 61_000),
      ),
    );
    await expect(
      repository.abandonRun({
        runId: terminalClaim.run.id,
        now: new Date(now.getTime() + 62_000),
        reason: "cannot abandon succeeded work",
      }),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_state" });
  });

  it("returns tagged expected conflicts without throwing", async () => {
    await expect(
      repository.failRun({
        runId: randomUUID(),
        leaseToken: "d".repeat(64),
        now: new Date("2026-07-29T17:00:00.000Z"),
        reason: "missing run",
      }),
    ).resolves.toEqual({ outcome: "not_found" });
    await expect(
      repository.abandonRun({
        runId: "not-a-uuid",
        now: new Date("2026-07-29T17:00:00.000Z"),
        reason: "missing run",
      }),
    ).resolves.toEqual({ outcome: "conflict", reason: "invalid_input" });
  });
});

describe("PostgreSQL Global Radar repository completion and safe reads", () => {
  it("rejects completion of a queued nonterminal run as invalid state", async () => {
    const now = new Date("2026-07-29T17:30:00.000Z");
    const queued = await repository.queueRun(
      queueInput("complete-queued", { now }),
    );
    if (queued.outcome === "conflict") throw new Error("Fixture was not queued.");

    await expect(
      repository.completeRun(
        completionInput(queued.run.id, "d".repeat(64), now),
      ),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_state" });
    const [stored] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, queued.run.id));
    expect(stored).toMatchObject({
      status: "queued",
      submissionHash: null,
      batchFingerprint: null,
      errorSummary: {},
    });
  });

  it("validates the running lease, plan, hashes, counters, and expiry", async () => {
    const now = new Date("2026-07-29T18:00:00.000Z");
    await repository.queueRun(queueInput("complete-validation", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const completeAt = new Date(now.getTime() + 60_000);

    await expect(
      repository.completeRun(
        completionInput(claim.run.id, "d".repeat(64), completeAt),
      ),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "lease_mismatch" });
    await expect(
      repository.completeRun(
        completionInput(claim.run.id, "malformed-token", completeAt),
      ),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.completeRun(
        completionInput(claim.run.id, claim.privateClaim.leaseToken, completeAt, {
          planFingerprint: HASH_C,
        }),
      ),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "completion_identity_mismatch",
    });
    await expect(
      repository.completeRun(
        completionInput(claim.run.id, claim.privateClaim.leaseToken, completeAt, {
          submissionHash: HASH_A.toUpperCase(),
        }),
      ),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "invalid_input" });
    await expect(
      repository.completeRun(
        completionInput(
          claim.run.id,
          claim.privateClaim.leaseToken,
          new Date(now.getTime() + 2 * 60 * 60 * 1_000),
        ),
      ),
    ).resolves.toMatchObject({ outcome: "conflict", reason: "lease_expired" });
  });

  it("replays exact terminal completion identity after expiry and rejects every changed identity", async () => {
    const now = new Date("2026-07-29T19:00:00.000Z");
    await repository.queueRun(queueInput("complete-replay", { now }));
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
    const input = completionInput(
      claim.run.id,
      claim.privateClaim.leaseToken,
      new Date(now.getTime() + 60_000),
    );
    const completed = await repository.completeRun(input);
    expect(completed).toMatchObject({ outcome: "completed" });
    const [beforeReplay] = await db
      .select({ updatedAt: globalRadarRuns.updatedAt })
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));

    await expect(
      repository.completeRun({
        ...input,
        now: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      repository.completeRun({
        ...input,
        now: new Date(now.getTime() + 3 * 60 * 60 * 1_000),
        counters: { ...input.counters, numberSignalsFound: -1 },
        sourceErrors: Array.from({ length: 51 }, () => ({
          sourceName: "Source",
          message: "Unavailable",
        })),
      }),
    ).resolves.toMatchObject({ outcome: "replayed" });
    await expect(
      repository.completeRun({
        ...input,
        submissionHash: HASH_B,
        counters: { ...input.counters, numberSignalsFound: -1 },
      }),
    ).resolves.toMatchObject({
      outcome: "conflict",
      reason: "completion_identity_mismatch",
    });
    for (const changed of [
      { leaseToken: "d".repeat(64) },
      { planFingerprint: HASH_C },
      { submissionHash: HASH_B },
      { batchFingerprint: HASH_B },
    ]) {
      await expect(
        repository.completeRun({ ...input, ...changed }),
      ).resolves.toMatchObject({
        outcome: "conflict",
        reason: "completion_identity_mismatch",
      });
    }
    const [afterReplay] = await db
      .select({ updatedAt: globalRadarRuns.updatedAt })
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));
    expect(afterReplay?.updatedAt).toEqual(beforeReplay?.updatedAt);
  });

  it("persists all four terminal status cases and exact bounded summaries without graph writes", async () => {
    const graphBefore = await graphRowCounts();
    const cases = [
      { suffix: "zero-clean", signals: 0, errors: [], status: "succeeded" },
      {
        suffix: "zero-errors",
        signals: 0,
        errors: [{ sourceName: "Official source", message: "Timed out" }],
        status: "failed",
      },
      {
        suffix: "signals-errors",
        signals: 2,
        errors: [{ sourceName: "Official source", message: "Timed out" }],
        status: "partial",
      },
      { suffix: "signals-clean", signals: 2, errors: [], status: "succeeded" },
    ] as const;

    for (const [index, testCase] of cases.entries()) {
      const now = new Date(
        new Date("2026-07-29T20:00:00.000Z").getTime() + index * 60_000,
      );
      await repository.queueRun(queueInput(testCase.suffix, { now }));
      const claim = await repository.claimRun({ now });
      if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");
      const result = await repository.completeRun(
        completionInput(claim.run.id, claim.privateClaim.leaseToken, new Date(now.getTime() + 1_000), {
          counters: {
            numberResultsExamined: 5,
            numberEntitiesObserved: testCase.signals,
            numberSignalsFound: testCase.signals,
            numberDirectDemands: testCase.signals,
            numberPrecursors: 0,
            numberMomentumRecords: 0,
            numberNew: testCase.signals,
            numberUpdated: 0,
            numberDuplicates: 0,
            numberRejectedForWeakEvidence: 1,
            numberSourceErrors: testCase.errors.length,
          },
          sourceErrors: testCase.errors,
          submissionHash: String(index + 1).repeat(64),
          batchFingerprint: String(index + 5).repeat(64),
        }),
      );
      expect(result).toMatchObject({
        outcome: "completed",
        run: {
          status: testCase.status,
          numberResultsExamined: 5,
          numberSignalsFound: testCase.signals,
          numberSourceErrors: testCase.errors.length,
          ...(testCase.errors.length > 0
            ? { sourceErrors: testCase.errors }
            : {}),
        },
      });
      const [stored] = await db
        .select()
        .from(globalRadarRuns)
        .where(eq(globalRadarRuns.id, claim.run.id));
      expect(stored).toMatchObject({
        status: testCase.status,
        numberSignalsFound: testCase.signals,
        numberSourceErrors: testCase.errors.length,
        errorSummary: {
          ...(testCase.status === "failed"
            ? {
                failure: {
                  code: "completion_failed",
                  message: "Global Radar completed with source errors and no signals.",
                },
              }
            : {}),
          sourceErrors: testCase.errors,
        },
      });
    }
    expect(await graphRowCounts()).toEqual(graphBefore);
  });

  it("accepts exactly fifty bounded source errors with exact counters and summary", async () => {
    const now = new Date("2026-07-30T00:00:00.000Z");
    const sourceErrors = Array.from({ length: 50 }, (_, index) => ({
      sourceName: `Source ${index}`,
      message: "Temporarily unavailable",
    }));
    const queued = await repository.queueRun(
      queueInput("source-errors-fifty", { now }),
    );
    if (queued.outcome === "conflict") throw new Error("Fixture was not queued.");
    const claim = await repository.claimRun({ now });
    if (claim.outcome !== "claimed") throw new Error("Fixture was not claimed.");

    const result = await repository.completeRun(
      completionInput(
        claim.run.id,
        claim.privateClaim.leaseToken,
        new Date(now.getTime() + 1_000),
        {
          counters: {
            ...completionInput(
              claim.run.id,
              claim.privateClaim.leaseToken,
              now,
            ).counters,
            numberSourceErrors: 50,
          },
          sourceErrors,
        },
      ),
    );
    expect(result).toMatchObject({
      outcome: "completed",
      run: {
        status: "partial",
        numberSourceErrors: 50,
        sourceErrors,
      },
    });
    expectSafeProjection(result);
    const [stored] = await db
      .select()
      .from(globalRadarRuns)
      .where(eq(globalRadarRuns.id, claim.run.id));
    expect(stored).toMatchObject({
      status: "partial",
      numberSourceErrors: 50,
      errorSummary: { sourceErrors },
    });
  });

  it("rejects fifty-one source errors without mutating the running row", async () => {
    await expectRejectedSourceErrorsLeaveRunUnchanged(
      "source-errors-fifty-one",
      Array.from({ length: 51 }, (_, index) => ({
        sourceName: `Source ${index}`,
        message: "Unavailable",
      })),
    );
  });

  it.each([
    {
      boundary: "source name over 200 characters",
      sourceError: { sourceName: "s".repeat(201), message: "Unavailable" },
    },
    {
      boundary: "message over 1000 characters",
      sourceError: { sourceName: "Source", message: "m".repeat(1_001) },
    },
  ])("rejects $boundary without mutating the running row", async ({ sourceError }) => {
    await expectRejectedSourceErrorsLeaveRunUnchanged(
      `source-error-field-${sourceError.sourceName.length}-${sourceError.message.length}`,
      [sourceError],
    );
  });

  it("rejects an individually valid source-error summary over 8192 bytes without mutation", async () => {
    await expectRejectedSourceErrorsLeaveRunUnchanged(
      "source-errors-summary-bytes",
      Array.from({ length: 9 }, (_, index) => ({
        sourceName: `Source ${index}`,
        message: "m".repeat(1_000),
      })),
    );
  });

  it("returns bounded safe get/list models and tagged read conflicts", async () => {
    const now = new Date("2026-07-29T22:00:00.000Z");
    const first = await repository.queueRun(queueInput("read-a", { now }));
    await repository.queueRun(
      queueInput("read-b", { now: new Date(now.getTime() + 1_000) }),
    );
    await repository.queueRun(
      queueInput("read-c", { now: new Date(now.getTime() + 2_000) }),
    );
    if (first.outcome === "conflict") throw new Error("Fixture was not queued.");

    const found = await repository.getRun(first.run.id);
    expect(found).toMatchObject({
      outcome: "found",
      run: { id: first.run.id },
    });
    expectSafeProjection(found);
    await expect(repository.getRun(randomUUID())).resolves.toEqual({
      outcome: "not_found",
    });
    await expect(repository.getRun("bad-id")).resolves.toEqual({
      outcome: "conflict",
      reason: "invalid_input",
    });
    const listed = await repository.listRuns({ limit: 2 });
    expect(listed).toMatchObject({ outcome: "listed" });
    if (listed.outcome !== "listed") throw new Error("Runs were not listed.");
    expectSafeProjection(listed);
    expect(listed.runs).toHaveLength(2);
    expect(listed.runs.map(({ externalRunKey }) => externalRunKey)).toEqual([
      expect.stringContaining("read-c"),
      expect.stringContaining("read-b"),
    ]);
    await expect(repository.listRuns({ limit: 101 })).resolves.toEqual({
      outcome: "conflict",
      reason: "invalid_input",
    });
    for (const run of listed.runs) {
      expectSafeProjection(run);
    }
  });
});
