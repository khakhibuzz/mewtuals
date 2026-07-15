import { describe, expect, it } from "vitest";

import { createOpaqueToken, hashToken } from "../app/server/tokens";

describe("opaque authentication tokens", () => {
  it("creates independent 256-bit URL-safe tokens", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("stores a deterministic HMAC-SHA-256 digest instead of the token", () => {
    const token = "the-opaque-token";
    const digest = hashToken(token, "a-session-secret-with-at-least-32-chars");

    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(token);
    expect(hashToken(token, "a-session-secret-with-at-least-32-chars")).toBe(
      digest,
    );
    expect(hashToken(token, "a-different-session-secret-32-chars")).not.toBe(
      digest,
    );
  });
});
