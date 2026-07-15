import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";

import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthService } from "../app/server/auth-service";
import { hashToken } from "../app/server/tokens";
import * as verifyRoute from "../app/auth/verify/route";
import { closeDb, getDb } from "../db/client";
import { createAuthRepository } from "../db/repositories/auth-repository";
import { createOnboardingRepository } from "../db/repositories/onboarding-repository";
import { magicLinks, onboardingDrafts, profiles, sessions, users } from "../db/schema";

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
const verificationRoute = verifyRoute as {
  GET(request: Request): Promise<Response>;
  POST?: (request: Request) => Promise<Response>;
};

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
      userId: user!.id,
      identityKind: "organisation",
      organisationSubtype: "startup",
      primaryUrl: null,
    });

    const source = await onboardingRepository.saveSource(user!.id, {
      websiteUrl: "https://mewtuals.com/",
      linkedInUrl: null,
      socialUrl: null,
      businessEmail: null,
      generatedName: "Mewtuals",
      generatedOrganisationName: "Mewtuals",
      generatedDomain: "mewtuals.com",
      primaryUrl: "https://mewtuals.com/",
    });
    expect(source.generatedDomain).toBe("mewtuals.com");

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
    expect(profile.status).toBe("draft");

    const submittedAt = new Date("2026-07-15T13:00:00.000Z");
    expect(
      await onboardingRepository.submitForVerification(user!.id, submittedAt),
    ).toMatchObject({ status: "pending", submittedAt });
    expect(
      await onboardingRepository.submitForVerification(user!.id, submittedAt),
    ).toBeNull();

    expect(
      await db.select().from(onboardingDrafts).where(eq(onboardingDrafts.userId, user!.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(profiles).where(eq(profiles.userId, user!.id)),
    ).toHaveLength(1);
  });
});
