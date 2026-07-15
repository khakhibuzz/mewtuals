import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";

import { eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthService } from "../app/server/auth-service";
import { hashToken } from "../app/server/tokens";
import * as verifyRoute from "../app/auth/verify/route";
import { closeDb, getDb, type MewtualsDatabase } from "../db/client";
import { createAuthRepository } from "../db/repositories/auth-repository";
import { createOnboardingRepository } from "../db/repositories/onboarding-repository";
import { createVerificationRepository } from "../db/repositories/verification-repository";
import * as databaseSchema from "../db/schema";
import {
  magicLinks,
  onboardingDrafts,
  profiles,
  sessions,
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

async function cleanTestRows() {
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
});
