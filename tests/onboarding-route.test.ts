import { describe, expect, it } from "vitest";

import {
  createProtectedOnboardingHandler,
  resolveProtectedPage,
} from "../app/server/onboarding-route";

const session = {
  session: { id: "session", expiresAt: new Date("2026-08-15") },
  user: { id: "user", email: "member@example.com", name: null },
};

describe("protected onboarding adapters", () => {
  it("redirects signed-out pages to login and signed-in users to their ordered gate", () => {
    expect(resolveProtectedPage(null, "/onboarding/identity", "/onboarding/identity")).toEqual({
      redirectTo: "/login",
    });
    expect(
      resolveProtectedPage(session, "/onboarding/profile", "/onboarding/source"),
    ).toEqual({ redirectTo: "/onboarding/source" });
    expect(
      resolveProtectedPage(session, "/onboarding/source", "/onboarding/source"),
    ).toEqual({ userId: "user" });
    expect(resolveProtectedPage(null, "/dashboard", "/dashboard")).toEqual({
      redirectTo: "/login",
    });
    expect(
      resolveProtectedPage(session, "/dashboard", "/onboarding/profile"),
    ).toEqual({ redirectTo: "/onboarding/profile" });
  });

  it("returns a stable field-error shape and never accepts a client user id", async () => {
    const handler = createProtectedOnboardingHandler({
      getSession: async () => session,
      action: async (userId, body) => ({
        ok: false as const,
        values: body as Record<string, unknown>,
        errors: { websiteUrl: "Website is required" },
        actor: userId,
      }),
    });
    const response = await handler(
      new Request("http://localhost:4000/api/onboarding/source", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://localhost:4000",
        },
        body: JSON.stringify({ userId: "attacker", websiteUrl: "" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      values: { userId: "attacker", websiteUrl: "" },
      errors: { websiteUrl: "Website is required" },
      actor: "user",
    });
  });

  it("returns JSON auth and same-origin failures", async () => {
    const signedOut = createProtectedOnboardingHandler({
      getSession: async () => null,
      action: async () => ({ ok: true as const }),
    });
    const request = new Request("http://localhost:4000/api/onboarding/identity", {
      method: "POST",
      headers: { Origin: "http://localhost:4000" },
      body: "{}",
    });
    const signedOutResponse = await signedOut(request);
    expect(signedOutResponse.status).toBe(401);
    expect(await signedOutResponse.json()).toEqual({
      ok: false,
      error: "Sign in to continue.",
    });

    const crossOrigin = createProtectedOnboardingHandler({
      getSession: async () => session,
      action: async () => ({ ok: true as const }),
    });
    const crossOriginResponse = await crossOrigin(
      new Request("http://localhost:4000/api/onboarding/identity", {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
        body: "{}",
      }),
    );
    expect(crossOriginResponse.status).toBe(403);
    expect(await crossOriginResponse.json()).toEqual({
      ok: false,
      error: "Request origin does not match this site.",
    });
  });
});
