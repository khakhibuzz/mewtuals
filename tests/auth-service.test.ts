import { describe, expect, it } from "vitest";

import {
  type AuthRepository,
  type AuthenticatedSession,
  type MagicLinkCreateResult,
} from "../db/repositories/auth-repository";
import {
  createAuthService,
  normalizeEmail,
} from "../app/server/auth-service";
import { createEmailSender } from "../app/server/email";
import {
  isSameOrigin,
  SameOriginError,
  assertSameOrigin,
} from "../app/server/request-security";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "../app/server/session";
import { hashToken } from "../app/server/tokens";

const sessionSecret = "test-session-secret-that-is-longer-than-32-characters";
const now = new Date("2026-07-15T12:00:00.000Z");

type StoredMagicLink = {
  email: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
};

class FakeAuthRepository implements AuthRepository {
  magicLinks: StoredMagicLink[] = [];
  sessions = new Map<string, AuthenticatedSession>();
  revokedSessionHashes: string[] = [];

  async createMagicLink(params: {
    email: string;
    tokenHash: string;
    createdAt: Date;
    expiresAt: Date;
    throttleWindowSeconds: number;
  }): Promise<MagicLinkCreateResult> {
    const latest = this.magicLinks
      .filter((link) => link.email === params.email)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
    const retryAt = latest
      ? new Date(
          latest.createdAt.getTime() + params.throttleWindowSeconds * 1_000,
        )
      : null;

    if (retryAt && retryAt > params.createdAt) {
      return { created: false, retryAt };
    }

    for (const link of this.magicLinks) {
      if (
        link.email === params.email &&
        link.consumedAt === null &&
        link.expiresAt > params.createdAt
      ) {
        link.consumedAt = params.createdAt;
      }
    }

    this.magicLinks.push({ ...params, consumedAt: null });
    return { created: true };
  }

  async consumeMagicLinkAndCreateSession(params: {
    magicLinkTokenHash: string;
    sessionTokenHash: string;
    now: Date;
    sessionExpiresAt: Date;
  }): Promise<AuthenticatedSession | null> {
    const link = this.magicLinks.find(
      (candidate) =>
        candidate.tokenHash === params.magicLinkTokenHash &&
        candidate.consumedAt === null &&
        candidate.expiresAt > params.now,
    );
    if (!link) return null;

    link.consumedAt = params.now;
    const session = {
      session: {
        id: "session-id",
        expiresAt: params.sessionExpiresAt,
      },
      user: {
        id: "user-id",
        email: link.email,
        name: null,
      },
    };
    this.sessions.set(params.sessionTokenHash, session);
    return session;
  }

  async findSession(
    tokenHash: string,
    at: Date,
  ): Promise<AuthenticatedSession | null> {
    const session = this.sessions.get(tokenHash);
    return session && session.session.expiresAt > at ? session : null;
  }

  async revokeSession(tokenHash: string): Promise<boolean> {
    this.revokedSessionHashes.push(tokenHash);
    return this.sessions.delete(tokenHash);
  }
}

function buildService(
  repository: FakeAuthRepository,
  options: {
    environment?: "development" | "production";
    clock?: () => Date;
    tokenFactory?: () => string;
    emailSender?: { sendMagicLink(input: { email: string; verifyUrl: string }): Promise<void> };
  } = {},
) {
  return createAuthService({
    repository,
    emailSender: options.emailSender ?? { sendMagicLink: async () => undefined },
    sessionSecret,
    environment: options.environment ?? "development",
    now: options.clock ?? (() => now),
    tokenFactory: options.tokenFactory,
  });
}

describe("passwordless authentication service", () => {
  it("normalizes email before creating a 15-minute magic link", async () => {
    const repository = new FakeAuthRepository();
    const deliveries: Array<{ email: string; verifyUrl: string }> = [];
    const service = buildService(repository, {
      tokenFactory: () => "known-magic-token",
      emailSender: {
        sendMagicLink: async (delivery) => {
          deliveries.push(delivery);
        },
      },
    });

    const result = await service.requestMagicLink({
      email: "  Person@Example.COM ",
      origin: "http://localhost:4000",
    });

    expect(normalizeEmail("  Person@Example.COM ")).toBe("person@example.com");
    expect(repository.magicLinks[0]).toMatchObject({
      email: "person@example.com",
      tokenHash: hashToken("known-magic-token", sessionSecret),
      createdAt: now,
      expiresAt: new Date("2026-07-15T12:15:00.000Z"),
    });
    expect(repository.magicLinks[0]?.tokenHash).not.toBe("known-magic-token");
    expect(deliveries).toEqual([
      {
        email: "person@example.com",
        verifyUrl:
          "http://localhost:4000/auth/verify?token=known-magic-token",
      },
    ]);
    expect(result).toEqual({
      accepted: true,
      developmentVerifyUrl:
        "http://localhost:4000/auth/verify?token=known-magic-token",
    });
  });

  it("throttles another request inside 60 seconds without delivering a link", async () => {
    const repository = new FakeAuthRepository();
    const deliveries: string[] = [];
    let currentTime = now;
    let tokenNumber = 0;
    const service = buildService(repository, {
      clock: () => currentTime,
      tokenFactory: () => `magic-${++tokenNumber}`,
      emailSender: {
        sendMagicLink: async ({ verifyUrl }) => {
          deliveries.push(verifyUrl);
        },
      },
    });

    await service.requestMagicLink({
      email: "person@example.com",
      origin: "http://localhost:4000",
    });
    currentTime = new Date(now.getTime() + 59_000);
    const throttled = await service.requestMagicLink({
      email: "person@example.com",
      origin: "http://localhost:4000",
    });

    expect(deliveries).toHaveLength(1);
    expect(repository.magicLinks).toHaveLength(1);
    expect(throttled).toEqual({ accepted: true });
  });

  it("never exposes a development link in production", async () => {
    const repository = new FakeAuthRepository();
    const service = buildService(repository, {
      environment: "production",
      tokenFactory: () => "production-magic-token",
    });

    const result = await service.requestMagicLink({
      email: "person@example.com",
      origin: "https://mewtuals.com",
    });

    expect(result).toEqual({ accepted: true });
  });

  it("consumes a magic link once and creates a 30-day opaque session", async () => {
    const repository = new FakeAuthRepository();
    const tokens = ["magic-token", "session-token"];
    const service = buildService(repository, {
      tokenFactory: () => tokens.shift() ?? "unexpected-token",
    });
    await service.requestMagicLink({
      email: "person@example.com",
      origin: "http://localhost:4000",
    });

    const verified = await service.verifyMagicLink("magic-token");
    const reused = await service.verifyMagicLink("magic-token");

    expect(verified).toMatchObject({
      token: "session-token",
      expiresAt: new Date("2026-08-14T12:00:00.000Z"),
      user: { email: "person@example.com" },
    });
    expect(repository.sessions.has(hashToken("session-token", sessionSecret))).toBe(
      true,
    );
    expect(repository.sessions.has("session-token")).toBe(false);
    expect(reused).toBeNull();
  });

  it("rejects expired magic links and expired sessions", async () => {
    const repository = new FakeAuthRepository();
    let currentTime = now;
    const tokens = ["expired-magic", "unused-session"];
    const service = buildService(repository, {
      clock: () => currentTime,
      tokenFactory: () => tokens.shift() ?? "unused-token",
    });
    await service.requestMagicLink({
      email: "person@example.com",
      origin: "http://localhost:4000",
    });
    currentTime = new Date(now.getTime() + 15 * 60_000);

    expect(await service.verifyMagicLink("expired-magic")).toBeNull();
    expect(await service.getSession("missing-session")).toBeNull();
  });

  it("looks up and revokes durable sessions by their digest", async () => {
    const repository = new FakeAuthRepository();
    const service = buildService(repository);
    const token = "durable-session-token";
    repository.sessions.set(hashToken(token, sessionSecret), {
      session: {
        id: "session-id",
        expiresAt: new Date(now.getTime() + 60_000),
      },
      user: { id: "user-id", email: "person@example.com", name: null },
    });

    expect(await service.getSession(token)).toMatchObject({
      user: { email: "person@example.com" },
    });
    expect(await service.logout(token)).toBe(true);
    expect(repository.revokedSessionHashes).toEqual([
      hashToken(token, sessionSecret),
    ]);
    expect(await service.getSession(token)).toBeNull();
  });
});

describe("email delivery", () => {
  it("sends production magic links with the Resend HTTPS API", async () => {
    const requests: Array<{ input: string; init?: RequestInit }> = [];
    const sender = createEmailSender({
      environment: "production",
      apiKey: "re_test_key",
      from: "Mewtuals <hello@mewtuals.com>",
      fetch: async (input, init) => {
        requests.push({ input: String(input), init });
        return new Response(JSON.stringify({ id: "email-id" }), { status: 200 });
      },
    });

    await sender.sendMagicLink({
      email: "person@example.com",
      verifyUrl: "https://mewtuals.com/auth/verify?token=opaque",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.input).toBe("https://api.resend.com/emails");
    expect(requests[0]?.init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer re_test_key",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
      from: "Mewtuals <hello@mewtuals.com>",
      to: ["person@example.com"],
      subject: "Your Mewtuals sign-in link",
    });
  });

  it("requires Resend credentials in production but not development", async () => {
    expect(() =>
      createEmailSender({ environment: "production", fetch }),
    ).toThrow("RESEND_API_KEY and EMAIL_FROM");

    const developmentSender = createEmailSender({
      environment: "development",
      fetch: async () => {
        throw new Error("development email should not make a network request");
      },
    });
    await expect(
      developmentSender.sendMagicLink({
        email: "person@example.com",
        verifyUrl: "http://localhost:4000/auth/verify?token=opaque",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("request and cookie security", () => {
  it("requires an exact same-origin header for state-changing requests", () => {
    const valid = new Request("http://localhost:4000/api/auth/magic-link", {
      method: "POST",
      headers: { Origin: "http://localhost:4000" },
    });
    const missing = new Request("http://localhost:4000/api/auth/magic-link", {
      method: "POST",
    });
    const crossOrigin = new Request(
      "http://localhost:4000/api/auth/magic-link",
      {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
      },
    );

    expect(isSameOrigin(valid)).toBe(true);
    expect(() => assertSameOrigin(valid)).not.toThrow();
    expect(isSameOrigin(missing)).toBe(false);
    expect(() => assertSameOrigin(missing)).toThrow(SameOriginError);
    expect(isSameOrigin(crossOrigin)).toBe(false);
    expect(() => assertSameOrigin(crossOrigin)).toThrow(SameOriginError);
  });

  it("uses a 30-day HttpOnly SameSite=Lax cookie secure outside localhost", () => {
    expect(SESSION_COOKIE_NAME).toBe("mewtuals_session");
    expect(sessionCookieOptions("localhost")).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      secure: false,
    });
    expect(sessionCookieOptions("127.0.0.1").secure).toBe(false);
    expect(sessionCookieOptions("mewtuals.com").secure).toBe(true);
  });
});
