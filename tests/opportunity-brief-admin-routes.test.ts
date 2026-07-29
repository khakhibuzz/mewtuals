import { describe, expect, it, vi } from "vitest";

import {
  createOpportunityBriefAdminGetHandler,
  createOpportunityBriefAdminPatchHandler,
} from "../app/server/opportunity-brief-admin-route";
import {
  createOpportunityBriefService,
  type AdminRequest,
  type OpportunityBriefRepository,
} from "../app/server/opportunity-brief-service";

const requestId = "00000000-0000-4000-8000-000000000101";
const candidateId = "00000000-0000-4000-8000-000000000202";
const updatedAt = new Date("2026-07-22T06:00:00.000Z");
const now = new Date("2026-07-22T06:30:00.000Z");

const adminSession = {
  session: { id: "session", expiresAt: new Date("2026-08-15") },
  user: { id: "admin", email: "admin@example.com", name: null },
};

function adminRequest(overrides: Partial<AdminRequest> = {}): AdminRequest {
  return {
    id: requestId,
    participantType: "company",
    profileUrl: "https://example.com/company",
    email: "founder@example.com",
    phoneNumber: "+919876543210",
    openToText: "Distribution partnerships",
    source: "bengaluru-meetup",
    utm: { source: "meetup", campaign: "july" },
    linkedCandidateId: null,
    status: "submitted",
    adminNotes: null,
    acknowledgementStatus: "pending",
    acknowledgementSentAt: null,
    acknowledgementError: null,
    submissionCount: 2,
    lastSubmittedAt: now,
    createdAt: new Date("2026-07-21T04:00:00.000Z"),
    updatedAt,
    ...overrides,
  };
}

function routeRequest(
  path: string,
  init?: RequestInit,
): Request {
  return new Request(`https://mewtuals.com${path}`, init);
}

describe("Opportunity Brief administrator GET route", () => {
  it("returns 401 before service work when signed out", async () => {
    const list = vi.fn();
    const handler = createOpportunityBriefAdminGetHandler({
      getSession: async () => null,
      list,
    });

    const response = await handler(routeRequest("/api/admin/opportunity-briefs"));

    expect(response.status).toBe(401);
    expect(list).not.toHaveBeenCalled();
  });

  it("maps the service administrator denial to 403", async () => {
    const handler = createOpportunityBriefAdminGetHandler({
      getSession: async () => adminSession,
      list: async () => ({
        ok: false as const,
        status: 403 as const,
        error: "Administrator access is required.",
      }),
    });

    expect(
      (await handler(routeRequest("/api/admin/opportunity-briefs"))).status,
    ).toBe(403);
  });

  it.each([
    "?unknown=value",
    "?status=submitted&status=researching",
    "?linked=linked&linked=unlinked",
    "?status=",
    "?linked=yes",
    "?participantType=partner",
    "?from=2026-02-30",
    "?page=0",
    "?pageSize=101",
  ])("rejects unsupported, duplicate, or invalid filters: %s", async (query) => {
    const list = vi.fn();
    const handler = createOpportunityBriefAdminGetHandler({
      getSession: async () => adminSession,
      list,
    });

    const response = await handler(
      routeRequest(`/api/admin/opportunity-briefs${query}`),
    );

    expect(response.status).toBe(400);
    expect(list).not.toHaveBeenCalled();
  });

  it("passes strict filters through the service as exact India-local bounds", async () => {
    const snapshotCalls: Array<Record<string, unknown>> = [];
    const repository = {
      getAdminSnapshot: vi.fn(async (_actorTime, filters) => {
        snapshotCalls.push(filters);
        return {
          summary: {
            total: 0,
            newToday: 0,
            companies: 0,
            creators: 0,
            awaitingResearch: 0,
            linkedCandidates: 0,
            pendingAcknowledgements: 0,
            failedAcknowledgements: 0,
            sources: {},
          },
          requests: [],
          page: 2,
          pageSize: 50,
          totalPages: 0,
        };
      }),
    } as unknown as OpportunityBriefRepository;
    const service = createOpportunityBriefService({
      repository,
      adminEmails: ["admin@example.com"],
      now: () => now,
    });
    const handler = createOpportunityBriefAdminGetHandler({
      getSession: async () => adminSession,
      list: (actor, filters) => service.getAdminSnapshot(actor, filters),
    });

    const response = await handler(
      routeRequest(
        "/api/admin/opportunity-briefs?status=researching&participantType=company&source=meetup&from=2026-07-21&to=2026-07-22&linked=unlinked&page=2&pageSize=50",
      ),
    );

    expect(response.status).toBe(200);
    expect(snapshotCalls).toEqual([
      {
        status: "researching",
        participantType: "company",
        source: "meetup",
        submittedAtGte: new Date("2026-07-20T18:30:00.000Z"),
        submittedAtLt: new Date("2026-07-22T18:30:00.000Z"),
        linked: false,
        page: 2,
        pageSize: 50,
      },
    ]);
  });

  it("serializes only the protected dashboard contract", async () => {
    const privateRequest = {
      ...adminRequest(),
      requesterHash: "private-requester-hash",
      attempts: [{ ip: "private" }],
    };
    const handler = createOpportunityBriefAdminGetHandler({
      getSession: async () => adminSession,
      list: async () => ({
        ok: true as const,
        snapshot: {
          summary: {
            total: 1,
            newToday: 1,
            companies: 1,
            creators: 0,
            awaitingResearch: 1,
            linkedCandidates: 0,
            pendingAcknowledgements: 6,
            failedAcknowledgements: 2,
            sources: { "bengaluru-meetup": 1 },
          },
          requests: [privateRequest],
          page: 1,
          pageSize: 25,
          totalPages: 1,
        },
      }),
    });

    const body = await (
      await handler(routeRequest("/api/admin/opportunity-briefs"))
    ).json();
    const json = JSON.stringify(body);

    expect(body.snapshot.requests[0]).toMatchObject({
      id: requestId,
      updatedAt: updatedAt.toISOString(),
    });
    expect(body.snapshot.summary).toMatchObject({
      total: 1,
      unlinked: 1,
      acknowledgementPending: 6,
      acknowledgementFailed: 2,
    });
    expect(json).not.toContain("private-requester-hash");
    expect(json).not.toContain("attempts");
  });
});

describe("Opportunity Brief administrator PATCH route", () => {
  function createHandler(overrides: Record<string, unknown> = {}) {
    return createOpportunityBriefAdminPatchHandler({
      getSession: async () => adminSession,
      updateStatus: vi.fn(async () => ({ ok: true, request: adminRequest() })),
      updateNotes: vi.fn(async () => ({ ok: true, request: adminRequest() })),
      linkCandidate: vi.fn(async () => ({ ok: true, request: adminRequest() })),
      unlinkCandidate: vi.fn(async () => ({ ok: true, request: adminRequest() })),
      ...overrides,
    } as never);
  }

  function patch(body: string, headers: Record<string, string> = {}) {
    return routeRequest(`/api/admin/opportunity-briefs/${requestId}`, {
      method: "PATCH",
      headers: {
        Origin: "https://mewtuals.com",
        "Content-Type": "application/json",
        ...headers,
      },
      body,
    });
  }

  it("returns 401 before mutation work when signed out", async () => {
    const updateStatus = vi.fn();
    const handler = createHandler({ getSession: async () => null, updateStatus });

    const response = await handler(patch("{}"), {
      params: Promise.resolve({ requestId }),
    });

    expect(response.status).toBe(401);
    expect(updateStatus).not.toHaveBeenCalled();
  });

  it("maps the service administrator denial to 403", async () => {
    const handler = createHandler({
      getSession: async () => ({
        ...adminSession,
        user: { id: "member", email: "member@example.com", name: null },
      }),
      updateNotes: async () => ({
        ok: false,
        status: 403,
        error: "Administrator access is required.",
      }),
    });

    const response = await handler(
      patch(JSON.stringify({
        expectedUpdatedAt: updatedAt.toISOString(),
        notes: "Research next week",
      })),
      { params: Promise.resolve({ requestId }) },
    );

    expect(response.status).toBe(403);
  });

  it("requires same-origin, JSON, valid JSON, and a bounded body", async () => {
    const handler = createHandler();
    const crossOrigin = patch("{}", { Origin: "https://evil.example" });
    const text = patch("{}", { "Content-Type": "text/plain" });
    const malformed = patch("{bad");
    const oversized = patch(JSON.stringify({ notes: "x".repeat(9_000) }));

    await expect(
      handler(crossOrigin, { params: Promise.resolve({ requestId }) }),
    ).resolves.toMatchObject({ status: 403 });
    await expect(
      handler(text, { params: Promise.resolve({ requestId }) }),
    ).resolves.toMatchObject({ status: 415 });
    await expect(
      handler(malformed, { params: Promise.resolve({ requestId }) }),
    ).resolves.toMatchObject({ status: 400 });
    await expect(
      handler(oversized, { params: Promise.resolve({ requestId }) }),
    ).resolves.toMatchObject({ status: 413 });
  });

  it.each([
    {},
    { expectedUpdatedAt: updatedAt.toISOString() },
    { expectedUpdatedAt: updatedAt.toISOString(), unlink: false },
    { expectedUpdatedAt: updatedAt.toISOString(), status: "researching", notes: "x" },
    { expectedUpdatedAt: updatedAt.toISOString(), candidateId },
    { expectedUpdatedAt: updatedAt.toISOString(), notes: "x", extra: true },
  ])("rejects a non-strict mutation shape %#", async (body) => {
    const handler = createHandler();
    const response = await handler(patch(JSON.stringify(body)), {
      params: Promise.resolve({ requestId }),
    });
    expect(response.status).toBe(400);
  });

  it("rejects an invalid route request id", async () => {
    const updateNotes = vi.fn();
    const handler = createHandler({ updateNotes });
    const response = await handler(patch(JSON.stringify({
      expectedUpdatedAt: updatedAt.toISOString(),
      notes: "Research next week",
    })), { params: Promise.resolve({ requestId: "not-a-uuid" }) });

    expect(response.status).toBe(400);
    expect(updateNotes).not.toHaveBeenCalled();
  });

  it.each([
    ["status", { status: "researching" }, "updateStatus", { status: "researching" }],
    ["notes", { notes: "Research next week" }, "updateNotes", { notes: "Research next week" }],
    ["link", { linkedCandidateId: candidateId }, "linkCandidate", { candidateId }],
    ["unlink", { unlink: true }, "unlinkCandidate", {}],
  ] as const)("dispatches the strict %s action", async (_name, action, method, expected) => {
    const callback = vi.fn(async () => ({ ok: true as const, request: adminRequest() }));
    const handler = createHandler({ [method]: callback });
    const response = await handler(
      patch(JSON.stringify({ expectedUpdatedAt: updatedAt.toISOString(), ...action })),
      { params: Promise.resolve({ requestId }) },
    );

    expect(response.status).toBe(200);
    expect(callback).toHaveBeenCalledWith(
      { userId: "admin", email: "admin@example.com" },
      requestId,
      { expectedUpdatedAt: updatedAt.toISOString(), ...expected },
    );
  });

  it("returns a safe current request on optimistic conflict", async () => {
    const current = {
      ...adminRequest({ status: "rejected", updatedAt: now }),
      requesterHash: "never-serialize",
    };
    const handler = createHandler({
      updateStatus: async () => ({
        ok: false,
        status: 409,
        error: "This Opportunity Brief request changed before the update.",
        request: current,
      }),
    });

    const response = await handler(
      patch(JSON.stringify({
        expectedUpdatedAt: updatedAt.toISOString(),
        status: "researching",
      })),
      { params: Promise.resolve({ requestId }) },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.request).toMatchObject({ status: "rejected", updatedAt: now.toISOString() });
    expect(JSON.stringify(body)).not.toContain("never-serialize");
  });
});
