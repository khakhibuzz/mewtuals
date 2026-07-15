import { describe, expect, it, vi } from "vitest";

import {
  createAdvanceHandler,
  createSignalHandler,
} from "../app/server/dashboard-route";

const memberSession = {
  session: { id: "session", expiresAt: new Date("2026-08-15") },
  user: { id: "member", email: "member@example.com", name: null },
};

describe("dashboard route adapters", () => {
  it.each([
    ["signal", () =>
      createSignalHandler({
        getSession: async () => memberSession,
        saveSignal: vi.fn(),
      }), "/api/signal"],
    ["advance", () =>
      createAdvanceHandler({
        getSession: async () => memberSession,
        advance: vi.fn(),
      }), "/api/opportunities/1723c982-a683-4e57-a584-26837f011347/advance"],
  ] as const)("rejects a cross-origin %s mutation", async (_name, build, path) => {
    const handler = build() as (
      request: Request,
      context?: { params: Promise<{ opportunityId: string }> },
    ) => Promise<Response>;
    const response = await handler(
      new Request(`http://localhost:4000${path}`, {
        method: "POST",
        headers: { Origin: "https://attacker.example" },
        body: "{}",
      }),
      path.includes("opportunities")
        ? {
            params: Promise.resolve({
              opportunityId: "1723c982-a683-4e57-a584-26837f011347",
            }),
          }
        : undefined,
    );

    expect(response.status).toBe(403);
  });

  it("requires authentication and a JSON object for signal updates", async () => {
    const saveSignal = vi.fn();
    const signedOut = createSignalHandler({
      getSession: async () => null,
      saveSignal,
    });
    expect(
      (
        await signedOut(
          new Request("http://localhost:4000/api/signal", {
            method: "POST",
            headers: { Origin: "http://localhost:4000" },
            body: "{}",
          }),
        )
      ).status,
    ).toBe(401);

    const handler = createSignalHandler({
      getSession: async () => memberSession,
      saveSignal,
    });
    const invalid = await handler(
      new Request("http://localhost:4000/api/signal", {
        method: "POST",
        headers: { Origin: "http://localhost:4000" },
        body: "null",
      }),
    );

    expect(invalid.status).toBe(400);
    expect(saveSignal).not.toHaveBeenCalled();
  });

  it("derives the signal owner from the authenticated session", async () => {
    const saveSignal = vi.fn(async () => ({
      ok: true as const,
      state: { signal: {}, assignments: [] },
    }));
    const handler = createSignalHandler({
      getSession: async () => memberSession,
      saveSignal,
    });
    const body = {
      userId: "attacker-chosen-user",
      availability: "open_now",
      openTo: ["podcasts"],
    };

    const response = await handler(
      new Request("http://localhost:4000/api/signal", {
        method: "POST",
        headers: {
          Origin: "http://localhost:4000",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }),
    );

    expect(response.status).toBe(200);
    expect(saveSignal).toHaveBeenCalledWith("member", body);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      nextPath: "/dashboard",
    });
  });

  it("preserves signal validation and verified-only service statuses", async () => {
    const saveSignal = vi.fn(async () => ({
      ok: false as const,
      status: 403 as const,
      error: "A verified Mewtuals profile is required.",
    }));
    const handler = createSignalHandler({
      getSession: async () => memberSession,
      saveSignal,
    });

    const response = await handler(
      new Request("http://localhost:4000/api/signal", {
        method: "POST",
        headers: { Origin: "http://localhost:4000" },
        body: JSON.stringify({ availability: "open_now", openTo: [] }),
      }),
    );

    expect(response.status).toBe(403);
  });

  it("requires authentication and uses the route assignment id for advancement", async () => {
    const opportunityId = "1723c982-a683-4e57-a584-26837f011347";
    const signedOutAdvance = vi.fn();
    const signedOut = createAdvanceHandler({
      getSession: async () => null,
      advance: signedOutAdvance,
    });
    const context = { params: Promise.resolve({ opportunityId }) };
    expect(
      (
        await signedOut(
          new Request(
            `http://localhost:4000/api/opportunities/${opportunityId}/advance`,
            {
              method: "POST",
              headers: { Origin: "http://localhost:4000" },
              body: "{}",
            },
          ),
          context,
        )
      ).status,
    ).toBe(401);
    expect(signedOutAdvance).not.toHaveBeenCalled();

    const advance = vi.fn(async () => ({
      ok: false as const,
      status: 404 as const,
      error: "This Mewtuals Pick is not available to your profile.",
    }));
    const handler = createAdvanceHandler({
      getSession: async () => memberSession,
      advance,
    });
    const response = await handler(
      new Request(
        `http://localhost:4000/api/opportunities/${opportunityId}/advance`,
        {
          method: "POST",
          headers: { Origin: "http://localhost:4000" },
          body: JSON.stringify({
            opportunityId: "4af009bb-4e93-498e-a66a-5af868c5cc1c",
            note: "Please review.",
          }),
        },
      ),
      context,
    );

    expect(response.status).toBe(404);
    expect(advance).toHaveBeenCalledWith(
      "member",
      opportunityId,
      "Please review.",
    );
  });
});
