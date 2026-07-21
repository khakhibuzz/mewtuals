import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";

import { eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthService } from "../app/server/auth-service";
import { createDashboardService } from "../app/server/dashboard-service";
import { hashToken } from "../app/server/tokens";
import * as verifyRoute from "../app/auth/verify/route";
import { closeDb, getDb, type MewtualsDatabase } from "../db/client";
import { createAuthRepository } from "../db/repositories/auth-repository";
import { createOnboardingRepository } from "../db/repositories/onboarding-repository";
import { createOpportunityRepository } from "../db/repositories/opportunity-repository";
import { createDiscoveryRepository } from "../db/repositories/discovery-repository";
import { createVerificationRepository } from "../db/repositories/verification-repository";
import { opportunitySeedData } from "../db/seed-data";
import * as databaseSchema from "../db/schema";
import {
  magicLinks,
  discoveryCandidateIdentifiers,
  discoveryCandidates,
  discoveryCandidateSources,
  discoveryRuns,
  onboardingDrafts,
  opportunities,
  profileOpportunities,
  profiles,
  sessions,
  signals,
  introductionRequests,
  users,
  verificationReviews,
} from "../db/schema";

const localEnvironment = resolve(process.cwd(), ".env.local");
if (existsSync(localEnvironment)) loadEnvFile(localEnvironment);

const testRun = randomUUID();
const emailPrefix = `auth-integration-${testRun}`;
const sessionSecret =
  process.env.SESSION_SECRET ??
  "integration-session-secret-that-is-longer-than-32-characters";

const db = getDb();
const repository = createAuthRepository(db);
const onboardingRepository = createOnboardingRepository(db);
const verificationRepository = createVerificationRepository(db);
const verificationRoute = verifyRoute as {
  GET(request: Request): Promise<Response>;
  POST?: (request: Request) => Promise<Response>;
};

type IndependentDatabase = {
  applicationName: string;
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
    applicationName,
    client,
    database: drizzle(client, { schema: databaseSchema }),
  };
}

async function closeIndependentDatabases(databases: IndependentDatabase[]) {
  await Promise.all(databases.map(({ client }) => client.end({ timeout: 5 })));
}

async function insertDashboardTestOpportunity(suffix: string) {
  const seed = opportunitySeedData.find(
    ({ direction }) => direction === "startup_distribution_partner",
  );
  if (!seed) throw new Error("Startup distribution seed is required.");
  const [opportunity] = await db
    .insert(opportunities)
    .values({
      ...seed,
      key: `${seed.key}-${testRun}-${suffix}`,
    })
    .returning();
  if (!opportunity) throw new Error("Test opportunity was not created.");
  return opportunity;
}

type DatabaseTransaction = Parameters<
  Parameters<MewtualsDatabase["transaction"]>[0]
>[0];

async function waitForLockWaiters(
  transaction: DatabaseTransaction,
  applicationNames: [string, string],
) {
  const deadline = Date.now() + 2_000;
  let observedSessions: {
    applicationName: string;
    state: string;
    waitEvent: string | null;
    waitEventType: string | null;
  }[] = [];

  while (Date.now() < deadline) {
    observedSessions = await transaction.execute<{
      applicationName: string;
      state: string;
      waitEvent: string | null;
      waitEventType: string | null;
    }>(sql`
      select
        application_name as "applicationName",
        state,
        wait_event as "waitEvent",
        wait_event_type as "waitEventType"
      from pg_stat_activity
      where application_name in (${applicationNames[0]}, ${applicationNames[1]})
    `);
    const waiters = observedSessions.filter(
      ({ waitEventType }) => waitEventType === "Lock",
    );
    if (waiters.length === applicationNames.length) {
      return waiters.map(({ applicationName }) => applicationName).sort();
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(
    `Competing onboarding mutations did not overlap: ${JSON.stringify(observedSessions)}`,
  );
}

async function cleanDiscoveryRows() {
  await db.delete(discoveryCandidateSources);
  await db.delete(discoveryCandidateIdentifiers);
  await db.delete(discoveryCandidates);
  await db.delete(discoveryRuns);
}

async function cleanTestRows() {
  await cleanDiscoveryRows();
  await db.delete(magicLinks).where(like(magicLinks.email, `${emailPrefix}%`));
  await db.delete(users).where(like(users.email, `${emailPrefix}%`));
}

describe("PostgreSQL authentication repository", () => {
  beforeAll(cleanTestRows);
  afterAll(async () => {
    await cleanTestRows();
    await closeDb();
  });

  it("persists normalized links, atomically throttles requests, and invalidates the previous link", async () => {
    let currentTime = new Date("2026-07-15T12:00:00.000Z");
    const tokens = ["first-magic", "throttled-magic", "replacement-magic"];
    const service = createAuthService({
      repository,
      emailSender: { sendMagicLink: async () => undefined },
      sessionSecret,
      environment: "development",
      exposeDevelopmentVerifyUrl: true,
      now: () => currentTime,
      tokenFactory: () => tokens.shift() ?? randomUUID(),
    });
    const email = `${emailPrefix}-throttle@EXAMPLE.TEST`;

    await service.requestMagicLink({
      email,
      origin: "http://localhost:4000",
      requesterIdentity: "development-loopback",
    });
    currentTime = new Date(currentTime.getTime() + 30_000);
    expect(
      await service.requestMagicLink({
        email,
        origin: "http://localhost:4000",
        requesterIdentity: "development-loopback",
      }),
    ).toEqual({ accepted: true });
    currentTime = new Date(currentTime.getTime() + 61_000);
    expect(
      await service.requestMagicLink({
        email,
        origin: "http://localhost:4000",
        requesterIdentity: "development-loopback",
      }),
    ).toMatchObject({
      developmentVerifyUrl: expect.stringContaining("replacement-magic"),
    });

    const persisted = await db
      .select()
      .from(magicLinks)
      .where(eq(magicLinks.email, email.toLowerCase()));
    expect(persisted).toHaveLength(3);
    expect(persisted.filter((link) => link.issued)).toHaveLength(2);
    expect(persisted.map((link) => link.tokenHash)).toEqual(
      expect.arrayContaining([
        hashToken("first-magic", sessionSecret),
        hashToken("replacement-magic", sessionSecret),
      ]),
    );
    expect(persisted.some((link) => link.tokenHash === "first-magic")).toBe(false);
    expect(
      persisted.find(
        (link) => link.tokenHash === hashToken("first-magic", sessionSecret),
      )?.consumedAt,
    ).toEqual(currentTime);
    expect(await service.verifyMagicLink("first-magic")).toBeNull();
  });

  it("consumes a valid link once, creates a durable session, and revokes it", async () => {
    const email = `${emailPrefix}-session@example.test`;
    const tokens = ["single-use-magic", "durable-session"];
    const service = createAuthService({
      repository,
      emailSender: { sendMagicLink: async () => undefined },
      sessionSecret,
      environment: "development",
      exposeDevelopmentVerifyUrl: false,
      now: () => new Date("2026-07-15T12:00:00.000Z"),
      tokenFactory: () => tokens.shift() ?? randomUUID(),
    });
    await service.requestMagicLink({
      email: email.toUpperCase(),
      origin: "http://localhost:4000",
      requesterIdentity: "development-loopback",
    });

    const verified = await service.verifyMagicLink("single-use-magic");

    expect(verified).toMatchObject({
      token: "durable-session",
      user: { email },
    });
    expect(await service.verifyMagicLink("single-use-magic")).toBeNull();
    expect(await service.getSession("durable-session")).toMatchObject({
      user: { email },
    });

    const storedSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken("durable-session", sessionSecret)));
    expect(storedSessions).toHaveLength(1);
    expect(storedSessions[0]?.tokenHash).not.toBe("durable-session");

    expect(await service.logout("durable-session")).toBe(true);
    expect(await service.getSession("durable-session")).toBeNull();
  });

  it("allows only one concurrent consumer to create a session", async () => {
    const email = `${emailPrefix}-concurrent@example.test`;
    const tokens = ["concurrent-magic", "session-one", "session-two"];
    const service = createAuthService({
      repository,
      emailSender: { sendMagicLink: async () => undefined },
      sessionSecret,
      environment: "development",
      exposeDevelopmentVerifyUrl: false,
      now: () => new Date("2026-07-15T12:00:00.000Z"),
      tokenFactory: () => tokens.shift() ?? randomUUID(),
    });
    await service.requestMagicLink({
      email,
      origin: "http://localhost:4000",
      requesterIdentity: "development-loopback",
    });

    const results = await Promise.all([
      service.verifyMagicLink("concurrent-magic"),
      service.verifyMagicLink("concurrent-magic"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    const [user] = await db.select().from(users).where(eq(users.email, email));
    expect(user).toBeDefined();
    expect(
      await db.select().from(sessions).where(eq(sessions.userId, user!.id)),
    ).toHaveLength(1);
  });

  it("keeps GET read-only and consumes the link only through same-origin POST", async () => {
    const email = `${emailPrefix}-route@example.test`;
    const magicToken = "r".repeat(43);
    const service = createAuthService({
      repository,
      emailSender: { sendMagicLink: async () => undefined },
      sessionSecret,
      environment: "development",
      exposeDevelopmentVerifyUrl: false,
      now: () => new Date(),
      tokenFactory: () => magicToken,
    });
    await service.requestMagicLink({
      email,
      origin: "http://localhost:4000",
      requesterIdentity: "development-loopback",
    });

    const getResponse = await verificationRoute.GET(
      new Request(
        `http://localhost:4000/auth/verify?token=${encodeURIComponent(magicToken)}`,
      ),
    );
    const [afterGet] = await db
      .select({ consumedAt: magicLinks.consumedAt })
      .from(magicLinks)
      .where(eq(magicLinks.tokenHash, hashToken(magicToken, sessionSecret)));

    expect(getResponse.status).toBe(200);
    expect(afterGet?.consumedAt).toBeNull();
    expect(verificationRoute.POST).toBeTypeOf("function");
    if (!verificationRoute.POST) return;

    const postResponse = await verificationRoute.POST(
      new Request("http://localhost:4000/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "http://localhost:4000",
        },
        body: new URLSearchParams({ token: magicToken }),
      }),
    );

    expect(postResponse.status).toBe(303);
    expect(postResponse.headers.get("location")).toBe(
      "http://localhost:4000/onboarding/identity",
    );
    const cookie = postResponse.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("mewtuals_session=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).not.toContain("Secure");

    const [afterPost] = await db
      .select({ consumedAt: magicLinks.consumedAt })
      .from(magicLinks)
      .where(eq(magicLinks.tokenHash, hashToken(magicToken, sessionSecret)));
    expect(afterPost?.consumedAt).toBeInstanceOf(Date);
  });

  it("blocks IP and recipient rotation with durable requester attempts", async () => {
    const createdAt = new Date("2030-01-01T00:00:00.000Z");
    const common = {
      expiresAt: new Date("2030-01-01T00:15:00.000Z"),
      throttleWindowSeconds: 60,
      abuseWindowSeconds: 900,
      requesterAttemptLimit: 2,
      globalAttemptLimit: 100,
    };

    const firstEmail = `${emailPrefix}-ip-rotation@example.test`;
    const first = await repository.createMagicLink({
      ...common,
      email: firstEmail,
      requesterHash: "requester-hash-a",
      tokenHash: hashToken(randomUUID(), sessionSecret),
      createdAt,
    });
    const rotatedIp = await repository.createMagicLink({
      ...common,
      email: firstEmail,
      requesterHash: "requester-hash-b",
      tokenHash: hashToken(randomUUID(), sessionSecret),
      createdAt: new Date(createdAt.getTime() + 1_000),
    });

    const rotatingRequester = "requester-hash-recipient-rotation";
    const recipientResults = [];
    for (let index = 0; index < 3; index += 1) {
      recipientResults.push(
        await repository.createMagicLink({
          ...common,
          email: `${emailPrefix}-recipient-${index}@example.test`,
          requesterHash: rotatingRequester,
          tokenHash: hashToken(randomUUID(), sessionSecret),
          createdAt: new Date(createdAt.getTime() + index * 1_000),
        }),
      );
    }

    expect(first.created).toBe(true);
    expect(rotatedIp.created).toBe(false);
    expect(recipientResults.map((result) => result.created)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("enforces the global rolling quota across requester rotation", async () => {
    const createdAt = new Date("2031-01-01T00:00:00.000Z");
    const results = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        repository.createMagicLink({
          email: `${emailPrefix}-global-${index}@example.test`,
          requesterHash: `global-requester-${index}`,
          tokenHash: hashToken(randomUUID(), sessionSecret),
          createdAt: new Date(createdAt.getTime() + index),
          expiresAt: new Date(createdAt.getTime() + 15 * 60_000),
          throttleWindowSeconds: 60,
          abuseWindowSeconds: 900,
          requesterAttemptLimit: 100,
          globalAttemptLimit: 2,
        }),
      ),
    );

    expect(results.filter((result) => result.created)).toHaveLength(2);
  });

  it("serializes concurrent requester quota decisions", async () => {
    const createdAt = new Date("2032-01-01T00:00:00.000Z");
    const requesterHash = "concurrent-requester-hash";
    const results = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        repository.createMagicLink({
          email: `${emailPrefix}-concurrent-limit-${index}@example.test`,
          requesterHash,
          tokenHash: hashToken(randomUUID(), sessionSecret),
          createdAt,
          expiresAt: new Date(createdAt.getTime() + 15 * 60_000),
          throttleWindowSeconds: 60,
          abuseWindowSeconds: 900,
          requesterAttemptLimit: 1,
          globalAttemptLimit: 100,
        }),
      ),
    );

    expect(results.filter((result) => result.created)).toHaveLength(1);
    const attempts = await db
      .select({ issued: magicLinks.issued })
      .from(magicLinks)
      .where(eq(magicLinks.requesterHash, requesterHash));
    expect(attempts).toHaveLength(2);
    expect(attempts.filter((attempt) => attempt.issued)).toHaveLength(1);
  });

  it("persists only an HMAC of the requester identity", async () => {
    const rawRequester = "cf:203.0.113.99";
    const email = `${emailPrefix}-requester-hash@example.test`;
    const service = createAuthService({
      repository,
      emailSender: { sendMagicLink: async () => undefined },
      sessionSecret,
      environment: "production",
      exposeDevelopmentVerifyUrl: true,
      now: () => new Date("2033-01-01T00:00:00.000Z"),
      tokenFactory: () => "h".repeat(43),
    });

    expect(
      await service.requestMagicLink({
        email,
        origin: "https://mewtuals.com",
        requesterIdentity: rawRequester,
      }),
    ).toEqual({ accepted: true });

    const [attempt] = await db
      .select({ requesterHash: magicLinks.requesterHash })
      .from(magicLinks)
      .where(eq(magicLinks.email, email));
    expect(attempt?.requesterHash).toBe(
      hashToken(`requester:${rawRequester}`, sessionSecret),
    );
    expect(attempt?.requesterHash).not.toContain("203.0.113.99");
  });

  it("enforces token-digest uniqueness at the database boundary", async () => {
    const tokenHash = hashToken("duplicate-magic", sessionSecret);
    const createdAt = new Date("2026-07-15T12:00:00.000Z");
    const expiresAt = new Date("2026-07-15T12:15:00.000Z");

    await repository.createMagicLink({
      email: `${emailPrefix}-unique-first@example.test`,
      tokenHash,
      requesterHash: "unique-requester-first",
      createdAt,
      expiresAt,
      throttleWindowSeconds: 60,
      abuseWindowSeconds: 900,
      requesterAttemptLimit: 100,
      globalAttemptLimit: 100_000,
    });

    await expect(
      repository.createMagicLink({
        email: `${emailPrefix}-unique-second@example.test`,
        tokenHash,
        requesterHash: "unique-requester-second",
        createdAt,
        expiresAt,
        throttleWindowSeconds: 60,
        abuseWindowSeconds: 900,
        requesterAttemptLimit: 100,
        globalAttemptLimit: 100_000,
      }),
    ).rejects.toThrow();
  });

  it("rejects expired links without consuming them or creating a user", async () => {
    let currentTime = new Date("2026-07-15T12:00:00.000Z");
    const email = `${emailPrefix}-expired@example.test`;
    const tokens = ["expired-magic", "never-created-session"];
    const service = createAuthService({
      repository,
      emailSender: { sendMagicLink: async () => undefined },
      sessionSecret,
      environment: "development",
      exposeDevelopmentVerifyUrl: false,
      now: () => currentTime,
      tokenFactory: () => tokens.shift() ?? randomUUID(),
    });
    await service.requestMagicLink({
      email,
      origin: "http://localhost:4000",
      requesterIdentity: "development-loopback",
    });
    currentTime = new Date(currentTime.getTime() + 15 * 60_000);

    expect(await service.verifyMagicLink("expired-magic")).toBeNull();
    expect(
      await db.select().from(users).where(eq(users.email, email)),
    ).toHaveLength(0);
  });

  it("persists ordered onboarding draft evidence and atomically submits a confirmed profile", async () => {
    const email = `${emailPrefix}-onboarding@example.test`;
    const [user] = await db.insert(users).values({ email }).returning();
    expect(user).toBeDefined();

    const identity = await onboardingRepository.saveIdentity(user!.id, {
      identityKind: "organisation",
      organisationSubtype: "startup",
      creatorSubtype: null,
    });
    expect(identity).toMatchObject({
      applied: true,
      value: {
        userId: user!.id,
        identityKind: "organisation",
        organisationSubtype: "startup",
        primaryUrl: null,
      },
    });

    const source = await onboardingRepository.saveSource(user!.id, {
      expectedIdentityKind: "organisation",
      source: {
        websiteUrl: "https://mewtuals.com/",
        linkedInUrl: null,
        socialUrl: null,
        businessEmail: null,
        generatedName: "Mewtuals",
        generatedOrganisationName: "Mewtuals",
        generatedDomain: "mewtuals.com",
        primaryUrl: "https://mewtuals.com/",
      },
    });
    expect(source).toMatchObject({
      applied: true,
      value: { generatedDomain: "mewtuals.com" },
    });

    const profile = await onboardingRepository.confirmProfile(user!.id, {
      name: "Mewtuals",
      organisationName: "Mewtuals",
      identityKind: "organisation",
      organisationSubtype: "startup",
      creatorSubtype: null,
      domain: "mewtuals.com",
      primaryUrl: "https://mewtuals.com/",
      websiteUrl: "https://mewtuals.com/",
      linkedInUrl: null,
      socialUrl: null,
      status: "draft",
      submittedAt: null,
    });
    expect(profile).toMatchObject({
      applied: true,
      value: { status: "draft" },
    });

    const submittedAt = new Date("2026-07-15T13:00:00.000Z");
    expect(
      await onboardingRepository.submitForVerification(user!.id, submittedAt),
    ).toMatchObject({
      applied: true,
      value: { status: "pending", submittedAt },
    });
    expect(
      await onboardingRepository.submitForVerification(user!.id, submittedAt),
    ).toMatchObject({
      applied: false,
      state: { profile: { status: "pending", submittedAt } },
    });

    expect(
      await db.select().from(onboardingDrafts).where(eq(onboardingDrafts.userId, user!.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(profiles).where(eq(profiles.userId, user!.id)),
    ).toHaveLength(1);
  });

  it("serializes overlapping source choices on independent connections", async () => {
    const email = `${emailPrefix}-source-race@example.test`;
    const [user] = await db.insert(users).values({ email }).returning();
    expect(user).toBeDefined();

    expect(
      await onboardingRepository.saveIdentity(user!.id, {
        identityKind: "organisation",
        organisationSubtype: "brand",
        creatorSubtype: null,
      }),
    ).toMatchObject({ applied: true });
    const mismatch = await onboardingRepository.saveSource(user!.id, {
      expectedIdentityKind: "creator",
      source: {
        websiteUrl: null,
        linkedInUrl: null,
        socialUrl: "https://youtube.com/@wrong-kind",
        businessEmail: null,
        generatedName: "Wrong Kind",
        generatedOrganisationName: null,
        generatedDomain: "youtube.com",
        primaryUrl: "https://youtube.com/@wrong-kind",
      },
    });

    expect(mismatch.applied).toBe(false);
    if (mismatch.applied) throw new Error("Mismatched source was applied.");
    expect(mismatch.state.draft).toMatchObject({
      identityKind: "organisation",
      primaryUrl: null,
      websiteUrl: null,
      socialUrl: null,
    });

    const connectionPrefix = `mewtuals-race-${testRun.slice(0, 8)}`;
    const independentDatabases = [
      createIndependentDatabase(`${connectionPrefix}-a`),
      createIndependentDatabase(`${connectionPrefix}-b`),
    ];

    try {
      const [firstDatabase, secondDatabase] = independentDatabases;
      const activeNames = await Promise.all(
        independentDatabases.map(async ({ database }) => {
          const [session] = await database.execute<{ applicationName: string }>(
            sql`select current_setting('application_name') as "applicationName"`,
          );
          return session?.applicationName;
        }),
      );
      expect(activeNames).toEqual(
        independentDatabases.map(({ applicationName }) => applicationName),
      );
      const firstRepository = createOnboardingRepository(firstDatabase.database);
      const secondRepository = createOnboardingRepository(secondDatabase.database);
      let attemptsPromise:
        | Promise<
            Awaited<ReturnType<typeof firstRepository.saveSource>>[]
          >
        | undefined;

      await db.transaction(async (transaction) => {
        // Hold the draft row so PostgreSQL can prove both independent writers
        // overlap before either mutation is allowed to finish.
        await transaction
          .select({ id: onboardingDrafts.id })
          .from(onboardingDrafts)
          .where(eq(onboardingDrafts.userId, user!.id))
          .for("update");

        attemptsPromise = Promise.all([
          firstRepository.saveSource(user!.id, {
            expectedIdentityKind: "organisation",
            source: {
              websiteUrl: "https://first.example/",
              linkedInUrl: null,
              socialUrl: null,
              businessEmail: null,
              generatedName: "First",
              generatedOrganisationName: "First",
              generatedDomain: "first.example",
              primaryUrl: "https://first.example/",
            },
          }),
          secondRepository.saveSource(user!.id, {
            expectedIdentityKind: "organisation",
            source: {
              websiteUrl: "https://second.example/",
              linkedInUrl: null,
              socialUrl: null,
              businessEmail: null,
              generatedName: "Second",
              generatedOrganisationName: "Second",
              generatedDomain: "second.example",
              primaryUrl: "https://second.example/",
            },
          }),
        ]);

        expect(
          await waitForLockWaiters(transaction, [
            firstDatabase.applicationName,
            secondDatabase.applicationName,
          ]),
        ).toEqual(
          [firstDatabase.applicationName, secondDatabase.applicationName].sort(),
        );
      });

      if (!attemptsPromise) throw new Error("Source mutations did not start.");
      const attempts = await attemptsPromise;
      expect(attempts.filter((attempt) => attempt.applied)).toHaveLength(1);
      expect(attempts.filter((attempt) => !attempt.applied)).toHaveLength(1);

      const state = await onboardingRepository.findState(user!.id);
      expect(state.draft?.generatedDomain).toMatch(/^(first|second)\.example$/);
    } finally {
      await closeIndependentDatabases(independentDatabases);
    }
  });

  it("rejects replayed identity mutation after profile confirmation", async () => {
    const email = `${emailPrefix}-post-confirm-replay@example.test`;
    const [user] = await db.insert(users).values({ email }).returning();
    expect(user).toBeDefined();

    const identity = await onboardingRepository.saveIdentity(user!.id, {
      identityKind: "organisation",
      organisationSubtype: "startup",
      creatorSubtype: null,
    });
    expect(identity.applied).toBe(true);
    const source = await onboardingRepository.saveSource(user!.id, {
      expectedIdentityKind: "organisation",
      source: {
        websiteUrl: "https://mewtuals.com/",
        linkedInUrl: null,
        socialUrl: null,
        businessEmail: null,
        generatedName: "Mewtuals",
        generatedOrganisationName: "Mewtuals",
        generatedDomain: "mewtuals.com",
        primaryUrl: "https://mewtuals.com/",
      },
    });
    expect(source.applied).toBe(true);
    const profile = await onboardingRepository.confirmProfile(user!.id, {
      name: "Mewtuals",
      organisationName: "Mewtuals",
      identityKind: "organisation",
      organisationSubtype: "startup",
      creatorSubtype: null,
      domain: "mewtuals.com",
      primaryUrl: "https://mewtuals.com/",
      websiteUrl: "https://mewtuals.com/",
      linkedInUrl: null,
      socialUrl: null,
      status: "draft",
      submittedAt: null,
    });
    expect(profile.applied).toBe(true);

    const replay = await onboardingRepository.saveIdentity(user!.id, {
      identityKind: "creator",
      organisationSubtype: null,
      creatorSubtype: "creator",
    });

    expect(replay.applied).toBe(false);
    if (replay.applied) throw new Error("Replayed identity was applied.");
    expect(replay.state.profile?.status).toBe("draft");
    expect(replay.state.draft).toMatchObject({
      identityKind: "organisation",
      organisationSubtype: "startup",
      primaryUrl: "https://mewtuals.com/",
    });
  });

  it("moves a pending profile and its verification audit atomically", async () => {
    const email = `${emailPrefix}-verification-audit@example.test`;
    const [user] = await db.insert(users).values({ email }).returning();
    expect(user).toBeDefined();
    const submittedAt = new Date("2034-01-01T09:00:00.000Z");
    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user!.id,
        name: "Verification Audit",
        organisationName: "Verification Audit",
        identityKind: "organisation",
        organisationSubtype: "brand",
        creatorSubtype: null,
        domain: "audit.example",
        primaryUrl: "https://audit.example/",
        websiteUrl: "https://audit.example/",
        status: "pending",
        submittedAt,
      })
      .returning();
    expect(profile).toBeDefined();

    const reviewedAt = new Date("2034-01-01T10:00:00.000Z");
    const result = await verificationRepository.transitionPending({
      profileId: profile!.id,
      reviewerEmail: "admin@example.com",
      decision: "waitlisted",
      notes: "Needs a stronger current fit.",
      reviewedAt,
    });

    expect(result).toMatchObject({
      applied: true,
      profile: { status: "waitlisted", verifiedAt: null },
      review: {
        reviewerEmail: "admin@example.com",
        decision: "waitlisted",
        notes: "Needs a stronger current fit.",
        reviewedAt,
      },
    });
    expect(
      await db
        .select()
        .from(verificationReviews)
        .where(eq(verificationReviews.profileId, profile!.id)),
    ).toHaveLength(1);
    expect(
      (await verificationRepository.listPending()).some(
        (candidate) => candidate.id === profile!.id,
      ),
    ).toBe(false);
  });

  it("allows exactly one verification decision across two overlapping database connections", async () => {
    const email = `${emailPrefix}-verification-race@example.test`;
    const [user] = await db.insert(users).values({ email }).returning();
    expect(user).toBeDefined();
    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user!.id,
        name: "Verification Race",
        organisationName: "Verification Race",
        identityKind: "organisation",
        organisationSubtype: "startup",
        creatorSubtype: null,
        domain: "race.example",
        primaryUrl: "https://race.example/",
        websiteUrl: "https://race.example/",
        status: "pending",
        submittedAt: new Date("2035-01-01T09:00:00.000Z"),
      })
      .returning();
    expect(profile).toBeDefined();

    const connectionPrefix = `verification-race-${testRun.slice(0, 8)}`;
    const independentDatabases = [
      createIndependentDatabase(`${connectionPrefix}-a`),
      createIndependentDatabase(`${connectionPrefix}-b`),
    ];

    try {
      const activeNames = await Promise.all(
        independentDatabases.map(async ({ database }) => {
          const [session] = await database.execute<{ applicationName: string }>(
            sql`select current_setting('application_name') as "applicationName"`,
          );
          return session?.applicationName;
        }),
      );
      expect(activeNames).toEqual(
        independentDatabases.map(({ applicationName }) => applicationName),
      );
      const first = createVerificationRepository(
        independentDatabases[0].database,
      );
      const second = createVerificationRepository(
        independentDatabases[1].database,
      );
      let attemptsPromise:
        | Promise<
            [
              Awaited<ReturnType<typeof first.transitionPending>>,
              Awaited<ReturnType<typeof second.transitionPending>>,
            ]
          >
        | undefined;

      await db.transaction(async (transaction) => {
        await transaction
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.id, profile!.id))
          .for("update");

        attemptsPromise = Promise.all([
          first.transitionPending({
            profileId: profile!.id,
            reviewerEmail: "first-admin@example.com",
            decision: "verified",
            notes: "First decision",
            reviewedAt: new Date("2035-01-01T10:00:00.000Z"),
          }),
          second.transitionPending({
            profileId: profile!.id,
            reviewerEmail: "second-admin@example.com",
            decision: "waitlisted",
            notes: "Second decision",
            reviewedAt: new Date("2035-01-01T10:00:01.000Z"),
          }),
        ]);

        expect(
          await waitForLockWaiters(transaction, [
            independentDatabases[0].applicationName,
            independentDatabases[1].applicationName,
          ]),
        ).toEqual(
          independentDatabases.map(({ applicationName }) => applicationName).sort(),
        );
      });

      if (!attemptsPromise) {
        throw new Error("Verification decisions did not start.");
      }
      const attempts = await attemptsPromise;
      expect(attempts.filter((attempt) => attempt.applied)).toHaveLength(1);
      expect(attempts.filter((attempt) => !attempt.applied)).toHaveLength(1);

      const [persistedProfile] = await db
        .select({ status: profiles.status })
        .from(profiles)
        .where(eq(profiles.id, profile!.id));
      const reviews = await db
        .select({
          decision: verificationReviews.decision,
          reviewerEmail: verificationReviews.reviewerEmail,
        })
        .from(verificationReviews)
        .where(eq(verificationReviews.profileId, profile!.id));
      expect(reviews).toHaveLength(1);
      expect(reviews[0]?.decision).toBe(persistedProfile?.status);
      expect(reviews[0]?.reviewerEmail).toMatch(
        /^(first|second)-admin@example\.com$/,
      );
    } finally {
      await closeIndependentDatabases(independentDatabases);
    }
  });

  it("persists a verified signal and deterministic curated assignments while denying other states", async () => {
    for (const opportunity of opportunitySeedData) {
      await db
        .insert(opportunities)
        .values(opportunity)
        .onConflictDoUpdate({
          target: opportunities.key,
          set: { ...opportunity, updatedAt: new Date() },
        });
    }
    const [verifiedUser, pendingUser] = await db
      .insert(users)
      .values([
        { email: `${emailPrefix}-dashboard-verified@example.test` },
        { email: `${emailPrefix}-dashboard-pending@example.test` },
      ])
      .returning();
    expect(verifiedUser).toBeDefined();
    expect(pendingUser).toBeDefined();
    await db.insert(profiles).values([
      {
        userId: verifiedUser!.id,
        name: "Verified Startup",
        organisationName: "Verified Startup",
        identityKind: "organisation",
        organisationSubtype: "startup",
        creatorSubtype: null,
        primaryUrl: "https://verified-startup.example/",
        status: "verified",
        verifiedAt: new Date("2036-01-01T09:00:00.000Z"),
      },
      {
        userId: pendingUser!.id,
        name: "Pending Startup",
        organisationName: "Pending Startup",
        identityKind: "organisation",
        organisationSubtype: "startup",
        creatorSubtype: null,
        primaryUrl: "https://pending-startup.example/",
        status: "pending",
        submittedAt: new Date("2036-01-01T09:00:00.000Z"),
      },
    ]);
    const opportunityRepository = createOpportunityRepository(db);
    const service = createDashboardService({
      repository: opportunityRepository,
    });

    await expect(
      service.saveSignal(pendingUser!.id, {
        availability: "open_now",
        openTo: ["distribution_partnerships"],
      }),
    ).resolves.toMatchObject({ ok: false, status: 403 });
    const saved = await service.saveSignal(verifiedUser!.id, {
      availability: "open_now",
      openTo: ["distribution_partnerships"],
      notes: "A measurable pilot.",
    });

    expect(saved).toMatchObject({
      ok: true,
      state: {
        signal: {
          availability: "open_now",
          openTo: ["distribution_partnerships"],
          notes: "A measurable pilot.",
        },
        assignments: [
          {
            direction: "startup_distribution_partner",
            counterpartyType: "Distribution partner with relevant customer access",
            reciprocalValue:
              "Relevant customer access ↔ a useful product story and measurable pilot learning",
            rank: 1,
            introduction: null,
          },
        ],
      },
    });
    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, verifiedUser!.id));
    expect(
      await db.select().from(signals).where(eq(signals.profileId, profile!.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(profileOpportunities)
        .where(eq(profileOpportunities.profileId, profile!.id)),
    ).toMatchObject([
      {
        rank: 1,
        fitSummary: "Fits your current interest in distribution_partnerships.",
      },
    ]);

    const empty = await service.saveSignal(verifiedUser!.id, {
      availability: "not_available",
      openTo: ["distribution_partnerships"],
    });
    expect(empty).toMatchObject({ ok: true, state: { assignments: [] } });
  });

  it("keeps a requested relationship durable across later signal changes", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `${emailPrefix}-durable-pick@example.test` })
      .returning();
    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user!.id,
        name: "Durable Pick Startup",
        organisationName: "Durable Pick Startup",
        identityKind: "organisation",
        organisationSubtype: "startup",
        creatorSubtype: null,
        primaryUrl: "https://durable-pick.example/",
        status: "verified",
        verifiedAt: new Date("2037-01-01T09:00:00.000Z"),
      })
      .returning();
    const repository = createOpportunityRepository(db);
    const service = createDashboardService({ repository });
    const first = await service.saveSignal(user!.id, {
      availability: "open_now",
      openTo: ["distribution_partnerships"],
    });
    if (!first.ok) throw new Error(first.error);
    const assignedId = first.state.assignments[0]?.id;
    expect(assignedId).toBeDefined();

    const requested = await service.advance(user!.id, assignedId!);
    expect(requested).toMatchObject({ ok: true });
    const changed = await service.saveSignal(user!.id, {
      availability: "not_available",
      openTo: ["distribution_partnerships"],
    });

    expect(changed).toMatchObject({
      ok: true,
      state: {
        assignments: [
          {
            id: assignedId,
            rank: 1,
            introduction: { state: "requested" },
          },
        ],
      },
    });
    expect(
      await db
        .select()
        .from(introductionRequests)
        .innerJoin(
          profileOpportunities,
          eq(introductionRequests.profileOpportunityId, profileOpportunities.id),
        )
        .where(eq(profileOpportunities.profileId, profile!.id)),
    ).toHaveLength(1);
  });

  it("hides inactive unrequested assignments while keeping requested relationships readable", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `${emailPrefix}-inactive-read@example.test` })
      .returning();
    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user!.id,
        name: "Inactive Read Startup",
        organisationName: "Inactive Read Startup",
        identityKind: "organisation",
        organisationSubtype: "startup",
        creatorSubtype: null,
        primaryUrl: "https://inactive-read.example/",
        status: "verified",
        verifiedAt: new Date("2037-02-01T09:00:00.000Z"),
      })
      .returning();
    const hidden = await insertDashboardTestOpportunity("read-hidden");
    const preserved = await insertDashboardTestOpportunity("read-preserved");

    try {
      const [hiddenAssignment, preservedAssignment] = await db
        .insert(profileOpportunities)
        .values([
          {
            profileId: profile!.id,
            opportunityId: hidden.id,
            fitSummary: "Inactive and unrequested.",
            rank: 1,
          },
          {
            profileId: profile!.id,
            opportunityId: preserved.id,
            fitSummary: "Requested before deactivation.",
            rank: 2,
          },
        ])
        .returning();
      expect(hiddenAssignment).toBeDefined();
      const [introduction] = await db
        .insert(introductionRequests)
        .values({
          profileOpportunityId: preservedAssignment!.id,
          state: "reviewing",
        })
        .returning();
      await db
        .update(opportunities)
        .set({ active: false })
        .where(eq(opportunities.id, hidden.id));
      await db
        .update(opportunities)
        .set({ active: false })
        .where(eq(opportunities.id, preserved.id));
      const repository = createOpportunityRepository(db);

      await expect(
        repository.listAssignedToProfile(profile!.id),
      ).resolves.toEqual([
        expect.objectContaining({
          id: preserved.id,
          introduction: expect.objectContaining({ state: "reviewing" }),
        }),
      ]);
      await expect(repository.readDashboard(user!.id)).resolves.toMatchObject({
        access: "verified",
        assignments: [
          {
            id: preserved.id,
            introduction: { state: "reviewing" },
          },
        ],
      });
      await expect(
        createDashboardService({ repository }).advance(user!.id, preserved.id),
      ).resolves.toMatchObject({
        ok: true,
        introduction: {
          id: introduction!.id,
          state: "reviewing",
        },
        message: "Mewtuals is reviewing the relationship",
      });
    } finally {
      await db.delete(opportunities).where(eq(opportunities.id, hidden.id));
      await db.delete(opportunities).where(eq(opportunities.id, preserved.id));
    }
  });

  it("removes inactive unrequested assignments during signal recomputation", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `${emailPrefix}-inactive-recompute@example.test` })
      .returning();
    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user!.id,
        name: "Inactive Recompute Startup",
        organisationName: "Inactive Recompute Startup",
        identityKind: "organisation",
        organisationSubtype: "startup",
        creatorSubtype: null,
        primaryUrl: "https://inactive-recompute.example/",
        status: "verified",
        verifiedAt: new Date("2037-03-01T09:00:00.000Z"),
      })
      .returning();
    const inactive = await insertDashboardTestOpportunity("recompute");

    try {
      await db.insert(profileOpportunities).values({
        profileId: profile!.id,
        opportunityId: inactive.id,
        fitSummary: "No longer available.",
        rank: 1,
      });
      await db
        .update(opportunities)
        .set({ active: false })
        .where(eq(opportunities.id, inactive.id));
      const service = createDashboardService({
        repository: createOpportunityRepository(db),
      });

      await expect(
        service.saveSignal(user!.id, {
          availability: "not_available",
          openTo: ["distribution_partnerships"],
        }),
      ).resolves.toMatchObject({
        ok: true,
        state: { assignments: [] },
      });
      await expect(
        db
          .select()
          .from(profileOpportunities)
          .where(eq(profileOpportunities.profileId, profile!.id)),
      ).resolves.toHaveLength(0);
    } finally {
      await db.delete(opportunities).where(eq(opportunities.id, inactive.id));
    }
  });

  it("rejects concurrent owner advancement after deactivation without creating an introduction", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `${emailPrefix}-inactive-advance@example.test` })
      .returning();
    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user!.id,
        name: "Inactive Advance Startup",
        organisationName: "Inactive Advance Startup",
        identityKind: "organisation",
        organisationSubtype: "startup",
        creatorSubtype: null,
        primaryUrl: "https://inactive-advance.example/",
        status: "verified",
        verifiedAt: new Date("2037-04-01T09:00:00.000Z"),
      })
      .returning();
    const inactive = await insertDashboardTestOpportunity("advance");
    const [assignment] = await db
      .insert(profileOpportunities)
      .values({
        profileId: profile!.id,
        opportunityId: inactive.id,
        fitSummary: "Deactivated before the request.",
        rank: 1,
      })
      .returning();
    await db
      .update(opportunities)
      .set({ active: false })
      .where(eq(opportunities.id, inactive.id));
    const connections = [
      createIndependentDatabase(`inactive-advance-${testRun.slice(0, 8)}-a`),
      createIndependentDatabase(`inactive-advance-${testRun.slice(0, 8)}-b`),
    ];

    try {
      await Promise.all(
        connections.map(({ database }) => database.execute(sql`select 1`)),
      );
      const services = connections.map(({ database }) =>
        createDashboardService({
          repository: createOpportunityRepository(database),
        }),
      );

      const results = await Promise.all(
        services.map((service) => service.advance(user!.id, inactive.id)),
      );
      expect(results).toEqual([
        expect.objectContaining({ ok: false, status: 404 }),
        expect.objectContaining({ ok: false, status: 404 }),
      ]);
      await expect(
        db
          .select()
          .from(introductionRequests)
          .where(
            eq(introductionRequests.profileOpportunityId, assignment!.id),
          ),
      ).resolves.toHaveLength(0);
    } finally {
      await closeIndependentDatabases(connections);
      await db.delete(opportunities).where(eq(opportunities.id, inactive.id));
    }
  });

  it("makes advancement idempotent under concurrency and rejects unassigned or other-profile ids", async () => {
    const [owner, other] = await db
      .insert(users)
      .values([
        { email: `${emailPrefix}-advance-owner@example.test` },
        { email: `${emailPrefix}-advance-other@example.test` },
      ])
      .returning();
    await db.insert(profiles).values([
      {
        userId: owner!.id,
        name: "Advance Owner",
        organisationName: "Advance Owner",
        identityKind: "organisation",
        organisationSubtype: "startup",
        creatorSubtype: null,
        primaryUrl: "https://advance-owner.example/",
        status: "verified",
        verifiedAt: new Date("2038-01-01T09:00:00.000Z"),
      },
      {
        userId: other!.id,
        name: "Advance Other",
        organisationName: "Advance Other",
        identityKind: "organisation",
        organisationSubtype: "startup",
        creatorSubtype: null,
        primaryUrl: "https://advance-other.example/",
        status: "verified",
        verifiedAt: new Date("2038-01-01T09:00:00.000Z"),
      },
    ]);
    const repository = createOpportunityRepository(db);
    const service = createDashboardService({ repository });
    const saved = await service.saveSignal(owner!.id, {
      availability: "open_now",
      openTo: ["distribution_partnerships"],
    });
    if (!saved.ok) throw new Error(saved.error);
    const assignedId = saved.state.assignments[0]!.id;
    const [unassigned] = await db
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(eq(opportunities.key, "brand-brand-co-distribution"));

    await expect(service.advance(other!.id, assignedId)).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
    await expect(
      service.advance(owner!.id, unassigned!.id),
    ).resolves.toMatchObject({ ok: false, status: 404 });

    const connectionPrefix = `advance-race-${testRun.slice(0, 8)}`;
    const connections = [
      createIndependentDatabase(`${connectionPrefix}-a`),
      createIndependentDatabase(`${connectionPrefix}-b`),
    ];
    try {
      const activeNames = await Promise.all(
        connections.map(async ({ database }) => {
          const [session] = await database.execute<{ applicationName: string }>(
            sql`select current_setting('application_name') as "applicationName"`,
          );
          return session?.applicationName;
        }),
      );
      expect(activeNames).toEqual(
        connections.map(({ applicationName }) => applicationName),
      );
      const services = connections.map(({ database }) =>
        createDashboardService({
          repository: createOpportunityRepository(database),
        }),
      );
      const results = await Promise.all(
        services.map((candidate) => candidate.advance(owner!.id, assignedId)),
      );
      expect(results.every((result) => result.ok)).toBe(true);
      expect(
        results.map((result) => (result.ok ? result.introduction.id : null)),
      ).toEqual([results[0]!.ok ? results[0]!.introduction.id : null, results[0]!.ok ? results[0]!.introduction.id : null]);
      const [assignment] = await db
        .select({ id: profileOpportunities.id })
        .from(profileOpportunities)
        .where(eq(profileOpportunities.opportunityId, assignedId));
      expect(
        await db
          .select()
          .from(introductionRequests)
          .where(eq(introductionRequests.profileOpportunityId, assignment!.id)),
      ).toHaveLength(1);
    } finally {
      await closeIndependentDatabases(connections);
    }
  });

  it("serializes competing signal updates on the verified profile row", async () => {
    const [user] = await db
      .insert(users)
      .values({ email: `${emailPrefix}-signal-race@example.test` })
      .returning();
    const [profile] = await db
      .insert(profiles)
      .values({
        userId: user!.id,
        name: "Signal Race",
        organisationName: "Signal Race",
        identityKind: "organisation",
        organisationSubtype: "startup",
        creatorSubtype: null,
        primaryUrl: "https://signal-race.example/",
        status: "verified",
        verifiedAt: new Date("2039-01-01T09:00:00.000Z"),
      })
      .returning();
    const connectionPrefix = `signal-race-${testRun.slice(0, 8)}`;
    const connections = [
      createIndependentDatabase(`${connectionPrefix}-a`),
      createIndependentDatabase(`${connectionPrefix}-b`),
    ];
    try {
      const activeNames = await Promise.all(
        connections.map(async ({ database }) => {
          const [session] = await database.execute<{ applicationName: string }>(
            sql`select current_setting('application_name') as "applicationName"`,
          );
          return session?.applicationName;
        }),
      );
      expect(activeNames).toEqual(
        connections.map(({ applicationName }) => applicationName),
      );
      const services = connections.map(({ database }) =>
        createDashboardService({
          repository: createOpportunityRepository(database),
        }),
      );
      let attempts:
        | Promise<
            [
              Awaited<ReturnType<(typeof services)[0]["saveSignal"]>>,
              Awaited<ReturnType<(typeof services)[1]["saveSignal"]>>,
            ]
          >
        | undefined;

      await db.transaction(async (transaction) => {
        await transaction
          .select({ id: profiles.id })
          .from(profiles)
          .where(eq(profiles.id, profile!.id))
          .for("update");
        attempts = Promise.all([
          services[0].saveSignal(user!.id, {
            availability: "open_now",
            openTo: ["distribution_partnerships"],
          }),
          services[1].saveSignal(user!.id, {
            availability: "open_now",
            openTo: ["co_marketing"],
          }),
        ]);
        expect(
          await waitForLockWaiters(transaction, [
            connections[0].applicationName,
            connections[1].applicationName,
          ]),
        ).toEqual(connections.map(({ applicationName }) => applicationName).sort());
      });

      if (!attempts) throw new Error("Signal updates did not start.");
      const results = await attempts;
      expect(results.every((result) => result.ok)).toBe(true);
      const [persistedSignal] = await db
        .select()
        .from(signals)
        .where(eq(signals.profileId, profile!.id));
      const assignments = await db
        .select({ direction: opportunities.direction, rank: profileOpportunities.rank })
        .from(profileOpportunities)
        .innerJoin(
          opportunities,
          eq(profileOpportunities.opportunityId, opportunities.id),
        )
        .where(eq(profileOpportunities.profileId, profile!.id));
      expect(assignments.length).toBeLessThanOrEqual(3);
      expect(new Set(assignments.map(({ rank }) => rank)).size).toBe(assignments.length);
      if (persistedSignal!.openTo.includes("distribution_partnerships")) {
        expect(assignments.map(({ direction }) => direction)).toEqual([
          "startup_distribution_partner",
        ]);
      } else {
        expect(persistedSignal!.openTo).toEqual(["co_marketing"]);
        expect(assignments).toEqual([]);
      }
    } finally {
      await closeIndependentDatabases(connections);
    }
  });

  it("queues discovery runs idempotently by external key", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    const input = {
      externalRunKey: `discovery-queue-${testRun}`,
      trigger: "manual" as const,
      now: new Date("2026-07-22T03:00:00.000Z"),
      geography: "India",
      candidateType: "both" as const,
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
      requestedByEmail: "admin@mewtuals.com",
    };

    const first = await discoveryRepository.queueRun(input);
    const replay = await discoveryRepository.queueRun(input);

    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      externalRunKey: input.externalRunKey,
      status: "queued",
      requestedCount: 20,
    });
    expect(
      await db
        .select()
        .from(discoveryRuns)
        .where(eq(discoveryRuns.externalRunKey, input.externalRunKey)),
    ).toHaveLength(1);
  });

  it("claims the oldest manual discovery run and refuses a second active lease", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    const baseInput = {
      geography: "India",
      candidateType: "both" as const,
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
    };
    const scheduled = await discoveryRepository.queueRun({
      ...baseInput,
      externalRunKey: `discovery-claim-scheduled-${testRun}`,
      trigger: "scheduled",
      now: new Date("2026-07-22T03:00:00.000Z"),
    });
    const manual = await discoveryRepository.queueRun({
      ...baseInput,
      externalRunKey: `discovery-claim-manual-${testRun}`,
      trigger: "manual",
      now: new Date("2026-07-22T03:01:00.000Z"),
    });

    const claimed = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T03:02:00.000Z"),
      leaseTokenHash: "lease-hash-claim",
      leaseExpiresAt: new Date("2026-07-22T05:02:00.000Z"),
    });
    const noWork = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T03:03:00.000Z"),
      leaseTokenHash: "lease-hash-second",
      leaseExpiresAt: new Date("2026-07-22T05:03:00.000Z"),
    });

    expect(claimed).toMatchObject({ id: manual.id, status: "running" });
    expect(noWork).toBeNull();
    expect(
      await db.select().from(discoveryRuns).where(eq(discoveryRuns.id, scheduled.id)),
    ).toMatchObject([{ status: "queued" }]);
  });

  it("completes a leased discovery run with one new candidate and its evidence", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    await discoveryRepository.queueRun({
      externalRunKey: `discovery-complete-${testRun}`,
      trigger: "trial",
      now: new Date("2026-07-22T04:00:00.000Z"),
      geography: "India",
      candidateType: "both",
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
    });
    const run = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T04:01:00.000Z"),
      leaseTokenHash: "lease-hash-complete",
      leaseExpiresAt: new Date("2026-07-22T06:01:00.000Z"),
    });
    expect(run).not.toBeNull();

    const result = await discoveryRepository.completeRun({
      runId: run!.id,
      leaseTokenHash: "lease-hash-complete",
      submissionHash: "submission-hash-complete",
      now: new Date("2026-07-22T04:02:00.000Z"),
      candidates: [
        {
          type: "company",
          name: "Acme India",
          canonicalUrl: "https://acme.example.com",
          websiteUrl: "https://acme.example.com",
          primarySocialUrl: null,
          linkedinUrl: "https://linkedin.com/company/acme-india",
          discoveredDescription: "An evidence-supported company candidate.",
          category: "technology",
          subcategory: "software",
          geography: "India",
          sourceName: "codex_web",
          sourceUrl: "https://directory.example.com/acme-india",
          discoveryScore: 82,
          rawMetadata: { result: 1 },
        },
      ],
      sourceErrors: [],
    });

    expect(result).toMatchObject({
      outcome: "completed",
      run: {
        status: "succeeded",
        foundCount: 1,
        newCount: 1,
        duplicateCount: 0,
      },
    });
    const storedCandidates = await db.select().from(discoveryCandidates);
    expect(storedCandidates).toHaveLength(1);
    expect(storedCandidates[0]).toMatchObject({
      name: "Acme India",
      canonicalIdentityKey: "website_host:acme.example.com",
      discoveryScore: 82,
      status: "discovered",
    });
    expect(await db.select().from(discoveryCandidateIdentifiers)).toHaveLength(2);
    expect(await db.select().from(discoveryCandidateSources)).toMatchObject([
      { candidateId: storedCandidates[0]!.id, sourceName: "codex_web" },
    ]);
  });

  it("deduplicates by stored aliases while preserving status and upgrading stronger identity", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    const queueAndClaim = async (suffix: string, minute: number, leaseHash: string) => {
      await discoveryRepository.queueRun({
        externalRunKey: `discovery-dedupe-${suffix}-${testRun}`,
        trigger: "trial",
        now: new Date(`2026-07-22T05:${String(minute).padStart(2, "0")}:00.000Z`),
        geography: "India",
        candidateType: "company",
        sourcesUsed: ["codex_web"],
        requestedCount: 10,
        companyPercentage: 100,
      });
      return discoveryRepository.claimRun({
        now: new Date(`2026-07-22T05:${String(minute + 1).padStart(2, "0")}:00.000Z`),
        leaseTokenHash: leaseHash,
        leaseExpiresAt: new Date("2026-07-22T07:00:00.000Z"),
      });
    };
    const firstRun = await queueAndClaim("first", 0, "dedupe-first-lease");
    expect(firstRun).not.toBeNull();
    await discoveryRepository.completeRun({
      runId: firstRun!.id,
      leaseTokenHash: "dedupe-first-lease",
      submissionHash: "dedupe-first-submission",
      now: new Date("2026-07-22T05:02:00.000Z"),
      candidates: [
        {
          type: "company",
          name: "Alias Labs",
          canonicalUrl: "https://linkedin.com/company/alias-labs",
          websiteUrl: null,
          primarySocialUrl: null,
          linkedinUrl: "https://linkedin.com/company/alias-labs",
          discoveredDescription: "Initial directory evidence.",
          category: "technology",
          subcategory: null,
          geography: "India",
          sourceName: "directory_one",
          sourceUrl: "https://directory.example.com/alias-labs",
          discoveryScore: 70,
          rawMetadata: { source: 1 },
        },
      ],
      sourceErrors: [],
    });
    const [initial] = await db.select().from(discoveryCandidates);
    expect(initial).toBeDefined();
    await db
      .update(discoveryCandidates)
      .set({ status: "shortlisted" })
      .where(eq(discoveryCandidates.id, initial!.id));

    const secondRun = await queueAndClaim("second", 3, "dedupe-second-lease");
    expect(secondRun).not.toBeNull();
    const result = await discoveryRepository.completeRun({
      runId: secondRun!.id,
      leaseTokenHash: "dedupe-second-lease",
      submissionHash: "dedupe-second-submission",
      now: new Date("2026-07-22T05:05:00.000Z"),
      candidates: [
        {
          type: "company",
          name: "Alias Labs India",
          canonicalUrl: "https://aliaslabs.example.com",
          websiteUrl: "https://aliaslabs.example.com",
          primarySocialUrl: "https://instagram.com/aliaslabs",
          linkedinUrl: "https://linkedin.com/company/alias-labs",
          discoveredDescription: "Official website and social evidence.",
          category: "AI",
          subcategory: "agents",
          geography: "India",
          sourceName: "directory_two",
          sourceUrl: "https://another.example.com/alias-labs",
          discoveryScore: 91,
          rawMetadata: { source: 2 },
        },
      ],
      sourceErrors: [],
    });

    expect(result).toMatchObject({
      outcome: "completed",
      run: { foundCount: 1, newCount: 0, duplicateCount: 1 },
    });
    expect(await db.select().from(discoveryCandidates)).toMatchObject([
      {
        id: initial!.id,
        canonicalIdentityKey:
          "linkedin_url:https://linkedin.com/company/alias-labs",
        canonicalUrl: "https://aliaslabs.example.com",
        websiteUrl: "https://aliaslabs.example.com",
        status: "shortlisted",
        discoveryScore: 91,
        mostRecentRunId: secondRun!.id,
      },
    ]);
    expect(await db.select().from(discoveryCandidateIdentifiers)).toHaveLength(3);
    expect(await db.select().from(discoveryCandidateSources)).toHaveLength(2);
  });

  it("replays the exact discovery submission without writing twice", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    await discoveryRepository.queueRun({
      externalRunKey: `discovery-replay-${testRun}`,
      trigger: "trial",
      now: new Date("2026-07-22T06:00:00.000Z"),
      geography: "India",
      candidateType: "creator",
      sourcesUsed: ["codex_web"],
      requestedCount: 10,
      companyPercentage: 0,
    });
    const run = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T06:01:00.000Z"),
      leaseTokenHash: "replay-lease",
      leaseExpiresAt: new Date("2026-07-22T08:00:00.000Z"),
    });
    expect(run).not.toBeNull();
    const submission = {
      runId: run!.id,
      leaseTokenHash: "replay-lease",
      submissionHash: "replay-submission",
      candidates: [
        {
          type: "creator" as const,
          name: "Replay Creator",
          canonicalUrl: "https://youtube.com/@replaycreator",
          websiteUrl: null,
          primarySocialUrl: "https://youtube.com/@replaycreator",
          linkedinUrl: null,
          discoveredDescription: "A creator discovered once.",
          category: "technology",
          subcategory: null,
          geography: "India",
          sourceName: "codex_web",
          sourceUrl: "https://youtube.com/@replaycreator/about",
          discoveryScore: 76,
          rawMetadata: {},
        },
      ],
      sourceErrors: [],
    };
    const first = await discoveryRepository.completeRun({
      ...submission,
      now: new Date("2026-07-22T06:02:00.000Z"),
    });
    const replay = await discoveryRepository.completeRun({
      ...submission,
      now: new Date("2026-07-22T06:10:00.000Z"),
    });
    const changedReplay = await discoveryRepository.completeRun({
      ...submission,
      submissionHash: "changed-replay-submission",
      now: new Date("2026-07-22T06:11:00.000Z"),
    });

    expect(first).toMatchObject({ outcome: "completed" });
    expect(replay).toMatchObject({
      outcome: "replayed",
      run: { foundCount: 1, newCount: 1, duplicateCount: 0 },
    });
    expect(changedReplay).toMatchObject({
      outcome: "conflict",
      reason: "submission_mismatch",
    });
    expect(await db.select().from(discoveryCandidates)).toHaveLength(1);
    expect(await db.select().from(discoveryCandidateSources)).toHaveLength(1);
  });

  it("fails a leased discovery run and safely replays the same failure", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    await discoveryRepository.queueRun({
      externalRunKey: `discovery-fail-${testRun}`,
      trigger: "trial",
      now: new Date("2026-07-22T07:00:00.000Z"),
      geography: "India",
      candidateType: "both",
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
    });
    const run = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T07:01:00.000Z"),
      leaseTokenHash: "fail-lease",
      leaseExpiresAt: new Date("2026-07-22T09:00:00.000Z"),
    });
    expect(run).not.toBeNull();

    const failed = await discoveryRepository.failRun({
      runId: run!.id,
      leaseTokenHash: "fail-lease",
      now: new Date("2026-07-22T07:02:00.000Z"),
      message: "Provider returned no usable response.",
    });
    const replay = await discoveryRepository.failRun({
      runId: run!.id,
      leaseTokenHash: "fail-lease",
      now: new Date("2026-07-22T07:03:00.000Z"),
      message: "Provider returned no usable response.",
    });

    expect(failed).toMatchObject({
      outcome: "failed",
      run: {
        status: "failed",
        completedAt: new Date("2026-07-22T07:02:00.000Z"),
        errorSummary: {
          failure: {
            code: "worker_failed",
            message: "Provider returned no usable response.",
          },
        },
      },
    });
    expect(replay).toMatchObject({ outcome: "replayed" });
  });

  it("updates candidate status optimistically and returns typed stale and missing outcomes", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    const run = await discoveryRepository.queueRun({
      externalRunKey: `discovery-status-${testRun}`,
      trigger: "manual",
      now: new Date("2026-07-22T08:00:00.000Z"),
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["codex_web"],
      requestedCount: 10,
      companyPercentage: 100,
    });
    const [candidate] = await db
      .insert(discoveryCandidates)
      .values({
        type: "company",
        name: "Status Labs",
        normalizedName: "status labs",
        canonicalIdentityKey: "website_host:status.example.com",
        canonicalUrl: "https://status.example.com",
        websiteUrl: "https://status.example.com",
        discoveredDescription: "Status transition fixture.",
        category: "technology",
        geography: "India",
        firstSourceName: "codex_web",
        firstSourceUrl: "https://directory.example.com/status-labs",
        discoveredAt: new Date("2026-07-22T08:00:00.000Z"),
        lastSeenAt: new Date("2026-07-22T08:00:00.000Z"),
        createdAt: new Date("2026-07-22T08:00:00.000Z"),
        updatedAt: new Date("2026-07-22T08:00:00.000Z"),
        mostRecentRunId: run.id,
        discoveryScore: 80,
      })
      .returning();
    expect(candidate).toBeDefined();

    const updated = await discoveryRepository.updateCandidateStatus({
      candidateId: candidate!.id,
      status: "shortlisted",
      expectedUpdatedAt: candidate!.updatedAt,
      now: new Date("2026-07-22T08:01:00.000Z"),
    });
    const conflict = await discoveryRepository.updateCandidateStatus({
      candidateId: candidate!.id,
      status: "rejected",
      expectedUpdatedAt: candidate!.updatedAt,
      now: new Date("2026-07-22T08:02:00.000Z"),
    });
    const notFound = await discoveryRepository.updateCandidateStatus({
      candidateId: randomUUID(),
      status: "rejected",
      expectedUpdatedAt: candidate!.updatedAt,
      now: new Date("2026-07-22T08:02:00.000Z"),
    });

    expect(updated).toMatchObject({
      outcome: "updated",
      candidate: { status: "shortlisted" },
    });
    expect(conflict).toMatchObject({
      outcome: "conflict",
      candidate: { status: "shortlisted" },
    });
    expect(notFound).toEqual({ outcome: "not_found" });
  });

  it("returns a filtered discovery admin snapshot without secret hashes", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    await discoveryRepository.queueRun({
      externalRunKey: `discovery-admin-${testRun}`,
      trigger: "manual",
      now: new Date("2026-07-22T09:00:00.000Z"),
      geography: "India",
      candidateType: "both",
      sourcesUsed: ["codex_web"],
      requestedCount: 2,
      companyPercentage: 50,
      requestedByEmail: "admin@mewtuals.com",
    });
    const run = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T09:01:00.000Z"),
      leaseTokenHash: "admin-secret-lease-hash",
      leaseExpiresAt: new Date("2026-07-22T11:00:00.000Z"),
    });
    expect(run).not.toBeNull();
    await discoveryRepository.completeRun({
      runId: run!.id,
      leaseTokenHash: "admin-secret-lease-hash",
      submissionHash: "admin-secret-submission-hash",
      now: new Date("2026-07-22T09:02:00.000Z"),
      candidates: [
        {
          type: "company",
          name: "Admin Company",
          canonicalUrl: "https://admin-company.example.com",
          websiteUrl: "https://admin-company.example.com",
          primarySocialUrl: null,
          linkedinUrl: null,
          discoveredDescription: "Company for filtered admin view.",
          category: "technology",
          subcategory: null,
          geography: "India",
          sourceName: "source_a",
          sourceUrl: "https://source.example.com/admin-company",
          discoveryScore: 80,
          rawMetadata: {},
        },
        {
          type: "creator",
          name: "Admin Creator",
          canonicalUrl: "https://youtube.com/@admincreator",
          websiteUrl: null,
          primarySocialUrl: "https://youtube.com/@admincreator",
          linkedinUrl: null,
          discoveredDescription: "Creator for summary counts.",
          category: "technology",
          subcategory: null,
          geography: "India",
          sourceName: "source_b",
          sourceUrl: "https://source.example.com/admin-creator",
          discoveryScore: 75,
          rawMetadata: {},
        },
      ],
      sourceErrors: [],
    });
    const [company] = await db
      .select()
      .from(discoveryCandidates)
      .where(eq(discoveryCandidates.type, "company"));
    await discoveryRepository.updateCandidateStatus({
      candidateId: company!.id,
      status: "shortlisted",
      expectedUpdatedAt: company!.updatedAt,
      now: new Date("2026-07-22T09:03:00.000Z"),
    });

    const snapshot = await discoveryRepository.getAdminSummary({
      type: "company",
      geography: "India",
      category: "technology",
      source: "source_a",
      status: "shortlisted",
      discoveredFrom: new Date("2026-07-22T00:00:00.000Z"),
      discoveredTo: new Date("2026-07-23T00:00:00.000Z"),
      todayStart: new Date("2026-07-22T00:00:00.000Z"),
      page: 1,
      pageSize: 10,
      runLimit: 10,
    });

    expect(snapshot.summary).toEqual({
      totalCompanies: 1,
      totalCreators: 1,
      discoveredToday: 2,
      latestRunStatus: "succeeded",
      latestRunCompletedAt: new Date("2026-07-22T09:02:00.000Z"),
      latestRunDuplicateCount: 0,
    });
    expect(snapshot.candidates).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
      items: [{ id: company!.id, status: "shortlisted" }],
    });
    expect(snapshot.runs).toHaveLength(1);
    expect(snapshot.evidence).toMatchObject([
      { candidateId: company!.id, sourceName: "source_a" },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain("admin-secret-lease-hash");
    expect(JSON.stringify(snapshot)).not.toContain("admin-secret-submission-hash");
  });

  it("allows only one concurrent discovery claimant without leaking the active-run race", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    const queueInput = {
      trigger: "trial" as const,
      geography: "India",
      candidateType: "both" as const,
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
    };
    await discoveryRepository.queueRun({
      ...queueInput,
      externalRunKey: `discovery-race-one-${testRun}`,
      now: new Date("2026-07-22T10:00:00.000Z"),
    });
    await discoveryRepository.queueRun({
      ...queueInput,
      externalRunKey: `discovery-race-two-${testRun}`,
      now: new Date("2026-07-22T10:01:00.000Z"),
    });
    const connections = [
      createIndependentDatabase(`discovery-claim-a-${testRun}`),
      createIndependentDatabase(`discovery-claim-b-${testRun}`),
    ];
    try {
      const results = await Promise.all(
        connections.map(({ database }, index) =>
          createDiscoveryRepository(database).claimRun({
            now: new Date("2026-07-22T10:02:00.000Z"),
            leaseTokenHash: `race-lease-${index}`,
            leaseExpiresAt: new Date("2026-07-22T12:02:00.000Z"),
          }),
        ),
      );
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(results.filter((result) => result === null)).toHaveLength(1);
      const runs = await db
        .select({ status: discoveryRuns.status })
        .from(discoveryRuns)
        .orderBy(discoveryRuns.createdAt);
      expect(runs.map(({ status }) => status).sort()).toEqual([
        "queued",
        "running",
      ]);
    } finally {
      await closeIndependentDatabases(connections);
    }
  });

  it("records an identity conflict without merging candidates owned by different aliases", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    const fixtureRun = await discoveryRepository.queueRun({
      externalRunKey: `discovery-collision-fixture-${testRun}`,
      trigger: "trial",
      now: new Date("2026-07-22T11:00:00.000Z"),
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["codex_web"],
      requestedCount: 2,
      companyPercentage: 100,
    });
    await db
      .update(discoveryRuns)
      .set({
        status: "succeeded",
        completedAt: new Date("2026-07-22T11:01:00.000Z"),
      })
      .where(eq(discoveryRuns.id, fixtureRun.id));
    const fixtureCandidates = await db
      .insert(discoveryCandidates)
      .values([
        {
          type: "company" as const,
          name: "Collision A",
          normalizedName: "collision a",
          canonicalIdentityKey: "website_host:collision-a.example.com",
          canonicalUrl: "https://collision-a.example.com",
          websiteUrl: "https://collision-a.example.com",
          discoveredDescription: "First collision owner.",
          category: "technology",
          geography: "India",
          firstSourceName: "fixture",
          firstSourceUrl: "https://directory.example.com/collision-a",
          discoveredAt: new Date("2026-07-22T11:00:00.000Z"),
          lastSeenAt: new Date("2026-07-22T11:00:00.000Z"),
          mostRecentRunId: fixtureRun.id,
          discoveryScore: 70,
        },
        {
          type: "company" as const,
          name: "Collision B",
          normalizedName: "collision b",
          canonicalIdentityKey:
            "linkedin_url:https://linkedin.com/company/collision-b",
          canonicalUrl: "https://linkedin.com/company/collision-b",
          linkedinUrl: "https://linkedin.com/company/collision-b",
          discoveredDescription: "Second collision owner.",
          category: "technology",
          geography: "India",
          firstSourceName: "fixture",
          firstSourceUrl: "https://directory.example.com/collision-b",
          discoveredAt: new Date("2026-07-22T11:00:00.000Z"),
          lastSeenAt: new Date("2026-07-22T11:00:00.000Z"),
          mostRecentRunId: fixtureRun.id,
          discoveryScore: 71,
        },
      ])
      .returning();
    await db.insert(discoveryCandidateIdentifiers).values([
      {
        candidateId: fixtureCandidates[0]!.id,
        candidateType: "company",
        kind: "website_host",
        normalizedValue: "collision-a.example.com",
      },
      {
        candidateId: fixtureCandidates[1]!.id,
        candidateType: "company",
        kind: "linkedin_url",
        normalizedValue: "https://linkedin.com/company/collision-b",
      },
    ]);
    await discoveryRepository.queueRun({
      externalRunKey: `discovery-collision-target-${testRun}`,
      trigger: "trial",
      now: new Date("2026-07-22T11:02:00.000Z"),
      geography: "India",
      candidateType: "company",
      sourcesUsed: ["codex_web"],
      requestedCount: 1,
      companyPercentage: 100,
    });
    const targetRun = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T11:03:00.000Z"),
      leaseTokenHash: "collision-lease",
      leaseExpiresAt: new Date("2026-07-22T13:00:00.000Z"),
    });
    expect(targetRun).not.toBeNull();

    const result = await discoveryRepository.completeRun({
      runId: targetRun!.id,
      leaseTokenHash: "collision-lease",
      submissionHash: "collision-submission",
      now: new Date("2026-07-22T11:04:00.000Z"),
      candidates: [
        {
          type: "company",
          name: "Unsafe Combined Identity",
          canonicalUrl: "https://collision-a.example.com",
          websiteUrl: "https://collision-a.example.com",
          primarySocialUrl: null,
          linkedinUrl: "https://linkedin.com/company/collision-b",
          discoveredDescription: "Conflicting aliases must not merge.",
          category: "technology",
          subcategory: null,
          geography: "India",
          sourceName: "codex_web",
          sourceUrl: "https://source.example.com/collision",
          discoveryScore: 99,
          rawMetadata: {},
        },
      ],
      sourceErrors: [],
    });

    expect(result).toMatchObject({
      outcome: "completed",
      run: {
        status: "partial",
        foundCount: 1,
        newCount: 0,
        duplicateCount: 0,
        errorSummary: { identityConflicts: [expect.any(Object)] },
      },
    });
    expect(await db.select().from(discoveryCandidates)).toHaveLength(2);
    expect(await db.select().from(discoveryCandidateSources)).toHaveLength(0);
  });

  it("rolls back the whole discovery completion when a later candidate is invalid", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    await discoveryRepository.queueRun({
      externalRunKey: `discovery-rollback-${testRun}`,
      trigger: "trial",
      now: new Date("2026-07-22T12:00:00.000Z"),
      geography: "India",
      candidateType: "both",
      sourcesUsed: ["codex_web"],
      requestedCount: 2,
      companyPercentage: 50,
    });
    const run = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T12:01:00.000Z"),
      leaseTokenHash: "rollback-lease",
      leaseExpiresAt: new Date("2026-07-22T14:00:00.000Z"),
    });
    expect(run).not.toBeNull();
    const common = {
      websiteUrl: null,
      primarySocialUrl: null,
      linkedinUrl: null,
      discoveredDescription: "Transactional completion fixture.",
      category: "technology",
      subcategory: null,
      geography: "India",
      sourceName: "codex_web",
      discoveryScore: 80,
      rawMetadata: {},
    };

    await expect(
      discoveryRepository.completeRun({
        runId: run!.id,
        leaseTokenHash: "rollback-lease",
        submissionHash: "rollback-submission",
        now: new Date("2026-07-22T12:02:00.000Z"),
        candidates: [
          {
            ...common,
            type: "company",
            name: "Valid First Candidate",
            canonicalUrl: "https://valid-first.example.com",
            sourceUrl: "https://source.example.com/valid-first",
          },
          {
            ...common,
            type: "creator",
            name: "Invalid Second Candidate",
            canonicalUrl: "http://127.0.0.1/private",
            sourceUrl: "https://source.example.com/invalid-second",
          },
        ],
        sourceErrors: [],
      }),
    ).rejects.toThrow("public host");
    expect(await db.select().from(discoveryCandidates)).toHaveLength(0);
    expect(
      await db.select().from(discoveryRuns).where(eq(discoveryRuns.id, run!.id)),
    ).toMatchObject([{ status: "running", submissionHash: null }]);
  });

  it("fails an expired discovery lease before claiming the next queued run", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    const base = {
      trigger: "trial" as const,
      geography: "India",
      candidateType: "both" as const,
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
    };
    const expiredRun = await discoveryRepository.queueRun({
      ...base,
      externalRunKey: `discovery-expired-${testRun}`,
      now: new Date("2026-07-22T13:00:00.000Z"),
    });
    await discoveryRepository.claimRun({
      now: new Date("2026-07-22T13:01:00.000Z"),
      leaseTokenHash: "expired-lease",
      leaseExpiresAt: new Date("2026-07-22T13:02:00.000Z"),
    });
    const nextRun = await discoveryRepository.queueRun({
      ...base,
      externalRunKey: `discovery-after-expired-${testRun}`,
      now: new Date("2026-07-22T13:02:30.000Z"),
    });

    const claimed = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T13:03:00.000Z"),
      leaseTokenHash: "replacement-lease",
      leaseExpiresAt: new Date("2026-07-22T15:03:00.000Z"),
    });

    expect(claimed).toMatchObject({ id: nextRun.id, status: "running" });
    expect(
      await db
        .select()
        .from(discoveryRuns)
        .where(eq(discoveryRuns.id, expiredRun.id)),
    ).toMatchObject([
      {
        status: "failed",
        completedAt: new Date("2026-07-22T13:03:00.000Z"),
        errorSummary: { failure: { code: "lease_expired" } },
      },
    ]);
  });

  it("marks a processed batch partial and bounds its source-error summary", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    await discoveryRepository.queueRun({
      externalRunKey: `discovery-partial-${testRun}`,
      trigger: "trial",
      now: new Date("2026-07-22T14:00:00.000Z"),
      geography: "India",
      candidateType: "creator",
      sourcesUsed: ["codex_web"],
      requestedCount: 1,
      companyPercentage: 0,
    });
    const run = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T14:01:00.000Z"),
      leaseTokenHash: "partial-lease",
      leaseExpiresAt: new Date("2026-07-22T16:00:00.000Z"),
    });
    expect(run).not.toBeNull();
    const result = await discoveryRepository.completeRun({
      runId: run!.id,
      leaseTokenHash: "partial-lease",
      submissionHash: "partial-submission",
      now: new Date("2026-07-22T14:02:00.000Z"),
      candidates: [
        {
          type: "creator",
          name: "Partial Creator",
          canonicalUrl: "https://youtube.com/@partialcreator",
          websiteUrl: null,
          primarySocialUrl: "https://youtube.com/@partialcreator",
          linkedinUrl: null,
          discoveredDescription: "Candidate retained despite one source error.",
          category: "technology",
          subcategory: null,
          geography: "India",
          sourceName: "working_source",
          sourceUrl: "https://source.example.com/partial-creator",
          discoveryScore: 73,
          rawMetadata: {},
        },
      ],
      sourceErrors: [
        { sourceName: "failed_source", message: "x".repeat(1_500) },
      ],
    });

    expect(result).toMatchObject({
      outcome: "completed",
      run: {
        status: "partial",
        foundCount: 1,
        newCount: 1,
        duplicateCount: 0,
      },
    });
    if (result.outcome !== "completed") return;
    const summary = result.run.errorSummary as {
      sourceErrors: Array<{ sourceName: string; message: string }>;
    };
    expect(summary.sourceErrors[0]?.message).toHaveLength(1_000);
  });

  it("marks an empty completed discovery batch failed", async () => {
    await cleanDiscoveryRows();
    const discoveryRepository = createDiscoveryRepository(db);
    await discoveryRepository.queueRun({
      externalRunKey: `discovery-empty-${testRun}`,
      trigger: "trial",
      now: new Date("2026-07-22T15:00:00.000Z"),
      geography: "India",
      candidateType: "both",
      sourcesUsed: ["codex_web"],
      requestedCount: 20,
      companyPercentage: 50,
    });
    const run = await discoveryRepository.claimRun({
      now: new Date("2026-07-22T15:01:00.000Z"),
      leaseTokenHash: "empty-lease",
      leaseExpiresAt: new Date("2026-07-22T17:00:00.000Z"),
    });
    expect(run).not.toBeNull();

    const result = await discoveryRepository.completeRun({
      runId: run!.id,
      leaseTokenHash: "empty-lease",
      submissionHash: "empty-submission",
      now: new Date("2026-07-22T15:02:00.000Z"),
      candidates: [],
      sourceErrors: [],
    });

    expect(result).toMatchObject({
      outcome: "completed",
      run: {
        status: "failed",
        foundCount: 0,
        newCount: 0,
        duplicateCount: 0,
      },
    });
  });
});
