import { describe, expect, it, vi } from "vitest";

import {
  createAdminVerificationHandler,
  createDevelopmentApprovalHandler,
} from "../app/server/verification-route";

const adminSession = {
  session: { id: "session", expiresAt: new Date("2026-08-15") },
  user: { id: "admin", email: "admin@example.com", name: null },
};
const memberSession = {
  session: { id: "member-session", expiresAt: new Date("2026-08-15") },
  user: { id: "member", email: "member@example.com", name: null },
};

describe("verification route adapters", () => {
  it("rejects cross-origin and unauthenticated administrator mutations", async () => {
    const review = vi.fn();
    const crossOrigin = createAdminVerificationHandler({
      getSession: async () => adminSession,
      review,
    });
    const crossOriginResponse = await crossOrigin(
      new Request("http://localhost:4000/api/admin/verifications/profile", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
        body: "{}",
      }),
      { params: Promise.resolve({ profileId: "profile" }) },
    );
    expect(crossOriginResponse.status).toBe(403);
    expect(review).not.toHaveBeenCalled();

    const signedOut = createAdminVerificationHandler({
      getSession: async () => null,
      review,
    });
    const signedOutResponse = await signedOut(
      new Request("http://localhost:4000/api/admin/verifications/profile", {
        method: "POST",
        headers: { Origin: "http://localhost:4000" },
        body: "{}",
      }),
      { params: Promise.resolve({ profileId: "profile" }) },
    );
    expect(signedOutResponse.status).toBe(401);
    expect(review).not.toHaveBeenCalled();
  });

  it("derives the administrator actor from the session and preserves service status", async () => {
    const review = vi.fn(async () => ({
      ok: false as const,
      status: 403 as const,
      error: "Administrator access is required.",
    }));
    const handler = createAdminVerificationHandler({
      getSession: async () => memberSession,
      review,
    });

    const response = await handler(
      new Request("http://localhost:4000/api/admin/verifications/profile", {
        method: "POST",
        headers: {
          Origin: "http://localhost:4000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorEmail: "admin@example.com",
          decision: "verified",
        }),
      }),
      { params: Promise.resolve({ profileId: "profile" }) },
    );

    expect(response.status).toBe(403);
    expect(review).toHaveBeenCalledWith(
      { userId: "member", email: "member@example.com" },
      "profile",
      { actorEmail: "admin@example.com", decision: "verified" },
    );
  });

  it.each([
    ["production", true],
    ["development", false],
  ] as const)(
    "does not expose local approval in %s with flag=%s",
    async (environment, developmentAuthEnabled) => {
      const approve = vi.fn();
      const handler = createDevelopmentApprovalHandler({
        environment,
        developmentAuthEnabled,
        getSession: async () => memberSession,
        approve,
      });

      const response = await handler(
        new Request("http://localhost:4000/api/dev/verification/approve", {
          method: "POST",
          headers: { Origin: "http://localhost:4000" },
        }),
      );

      expect(response.status).toBe(404);
      expect(approve).not.toHaveBeenCalled();
    },
  );

  it("requires same-origin and an authenticated owner for local approval", async () => {
    const approve = vi.fn(async () => ({
      ok: true as const,
      profile: { status: "verified" },
      review: { decision: "verified" },
    }));
    const signedOut = createDevelopmentApprovalHandler({
      environment: "development",
      developmentAuthEnabled: true,
      getSession: async () => null,
      approve,
    });
    const response = await signedOut(
      new Request("http://localhost:4000/api/dev/verification/approve", {
        method: "POST",
        headers: { Origin: "http://localhost:4000" },
      }),
    );
    expect(response.status).toBe(401);

    const handler = createDevelopmentApprovalHandler({
      environment: "development",
      developmentAuthEnabled: true,
      getSession: async () => memberSession,
      approve,
    });
    const approved = await handler(
      new Request("http://localhost:4000/api/dev/verification/approve", {
        method: "POST",
        headers: { Origin: "http://localhost:4000" },
      }),
    );
    expect(approved.status).toBe(200);
    expect(approve).toHaveBeenCalledWith({
      userId: "member",
      email: "member@example.com",
    });
  });
});
