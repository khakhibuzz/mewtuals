import { describe, expect, it } from "vitest";

import {
  canExposeDevelopmentVerifyUrl,
  readServerEnvironment,
} from "../app/server/env";
import { requesterIdentityForRequest } from "../app/server/request-security";

const sessionSecret = "test-session-secret-that-is-longer-than-32-characters";

function environment(overrides: Record<string, string | undefined> = {}) {
  return readServerEnvironment({
    SESSION_SECRET: sessionSecret,
    ...overrides,
  });
}

describe("development magic-link capability", () => {
  it("treats an unspecified NODE_ENV as production", () => {
    const result = environment();

    expect(result.environment).toBe("production");
    expect(result.developmentAuthEnabled).toBe(false);
  });

  it.each([
    ["production", "true", "http://localhost:4000", false],
    ["development", "false", "http://localhost:4000", false],
    ["development", "true", "https://mewtuals.com", false],
    ["development", "true", "http://localhost:4000", true],
    ["test", "true", "http://127.0.0.1:4000", true],
    ["development", "true", "http://[::1]:4000", true],
  ] as const)(
    "environment=%s flag=%s origin=%s exposes=%s",
    (nodeEnvironment, developmentFlag, origin, expected) => {
      expect(
        canExposeDevelopmentVerifyUrl(
          environment({
            NODE_ENV: nodeEnvironment,
            MEWTUALS_DEV_AUTH: developmentFlag,
          }),
          origin,
        ),
      ).toBe(expected);
    },
  );
});

describe("requester identity boundary", () => {
  it("uses Cloudflare's connecting IP when present", () => {
    const request = new Request("https://mewtuals.com/api/auth/magic-link", {
      headers: { "cf-connecting-ip": "203.0.113.42" },
    });

    expect(requesterIdentityForRequest(request, "production")).toBe(
      "cf:203.0.113.42",
    );
  });

  it("puts production requests without the trusted header in one unknown bucket", () => {
    const first = new Request("https://mewtuals.com/api/auth/magic-link");
    const second = new Request("https://mewtuals.com/api/auth/magic-link", {
      headers: { "x-forwarded-for": "198.51.100.12" },
    });

    expect(requesterIdentityForRequest(first, "production")).toBe(
      "unknown-requester",
    );
    expect(requesterIdentityForRequest(second, "production")).toBe(
      "unknown-requester",
    );
  });

  it("allows a stable loopback fallback only outside production", () => {
    const request = new Request("http://127.0.0.1:4000/api/auth/magic-link");

    expect(requesterIdentityForRequest(request, "development")).toBe(
      "development-loopback",
    );
    expect(requesterIdentityForRequest(request, "production")).toBe(
      "unknown-requester",
    );
  });
});
