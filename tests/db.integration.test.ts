import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { randomUUID } from "node:crypto";

import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAuthService } from "../app/server/auth-service";
import { hashToken } from "../app/server/tokens";
import { closeDb, getDb } from "../db/client";
import { createAuthRepository } from "../db/repositories/auth-repository";
import { magicLinks, sessions, users } from "../db/schema";

const localEnvironment = resolve(process.cwd(), ".env.local");
if (existsSync(localEnvironment)) loadEnvFile(localEnvironment);

const testRun = randomUUID();
const emailPrefix = `auth-integration-${testRun}`;
const sessionSecret =
  process.env.SESSION_SECRET ??
  "integration-session-secret-that-is-longer-than-32-characters";

const db = getDb();
const repository = createAuthRepository(db);

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
      now: () => currentTime,
      tokenFactory: () => tokens.shift() ?? randomUUID(),
    });
    const email = `${emailPrefix}-throttle@EXAMPLE.TEST`;

    await service.requestMagicLink({
      email,
      origin: "http://localhost:4000",
    });
    currentTime = new Date(currentTime.getTime() + 30_000);
    expect(
      await service.requestMagicLink({
        email,
        origin: "http://localhost:4000",
      }),
    ).toEqual({ accepted: true });
    currentTime = new Date(currentTime.getTime() + 31_000);
    expect(
      await service.requestMagicLink({
        email,
        origin: "http://localhost:4000",
      }),
    ).toMatchObject({
      developmentVerifyUrl: expect.stringContaining("replacement-magic"),
    });

    const persisted = await db
      .select()
      .from(magicLinks)
      .where(eq(magicLinks.email, email.toLowerCase()));
    expect(persisted).toHaveLength(2);
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
      now: () => new Date("2026-07-15T12:00:00.000Z"),
      tokenFactory: () => tokens.shift() ?? randomUUID(),
    });
    await service.requestMagicLink({
      email: email.toUpperCase(),
      origin: "http://localhost:4000",
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
      now: () => new Date("2026-07-15T12:00:00.000Z"),
      tokenFactory: () => tokens.shift() ?? randomUUID(),
    });
    await service.requestMagicLink({
      email,
      origin: "http://localhost:4000",
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

  it("enforces token-digest uniqueness at the database boundary", async () => {
    const tokenHash = hashToken("duplicate-magic", sessionSecret);
    const createdAt = new Date("2026-07-15T12:00:00.000Z");
    const expiresAt = new Date("2026-07-15T12:15:00.000Z");

    await repository.createMagicLink({
      email: `${emailPrefix}-unique-first@example.test`,
      tokenHash,
      createdAt,
      expiresAt,
      throttleWindowSeconds: 60,
    });

    await expect(
      repository.createMagicLink({
        email: `${emailPrefix}-unique-second@example.test`,
        tokenHash,
        createdAt,
        expiresAt,
        throttleWindowSeconds: 60,
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
      now: () => currentTime,
      tokenFactory: () => tokens.shift() ?? randomUUID(),
    });
    await service.requestMagicLink({
      email,
      origin: "http://localhost:4000",
    });
    currentTime = new Date(currentTime.getTime() + 15 * 60_000);

    expect(await service.verifyMagicLink("expired-magic")).toBeNull();
    expect(
      await db.select().from(users).where(eq(users.email, email)),
    ).toHaveLength(0);
  });
});
