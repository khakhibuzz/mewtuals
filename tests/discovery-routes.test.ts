import { describe, expect, it, vi } from "vitest";

import type { DiscoveryRepository } from "../db/repositories/discovery-repository";
import {
  createAdminDiscoveryCandidateHandler,
  createAdminDiscoveryRunsGetHandler,
  createAdminDiscoveryRunsPostHandler,
  createWorkerClaimHandler,
  createWorkerCompleteHandler,
  createWorkerFailHandler,
} from "../app/server/discovery-route";
import { createDiscoveryService } from "../app/server/discovery-service";
import { verifyDiscoveryBearer } from "../app/server/discovery-worker-auth";

function createRouteRepository(): DiscoveryRepository {
  return {
    queueRun: vi.fn(),
    claimRun: vi.fn(),
    getRun: vi.fn(),
    completeRun: vi.fn(),
    failRun: vi.fn(),
    updateCandidateStatus: vi.fn(),
    getAdminSummary: vi.fn(),
  };
}

function createRouteService(repository: DiscoveryRepository) {
  return createDiscoveryService({
    repository,
    adminEmails: ["admin@example.com"],
    workerSecret: "worker-secret",
    config: {
      geographies: ["India"],
      companyCategories: ["technology"],
      creatorCategories: ["technology"],
      totalCandidates: 20,
      companyPercentage: 50,
      enabledSources: ["codex_web"],
    },
    now: () => new Date("2026-07-22T04:00:00.000Z"),
  });
}

function routeCompanyCandidate(index: number) {
  return {
    type: "company" as const,
    name: `Route Company ${index}`,
    canonicalUrl: `https://route-company-${index}.example.com`,
    websiteUrl: `https://route-company-${index}.example.com`,
    discoveredDescription: "A public technology company.",
    category: "technology",
    geography: "India",
    sourceName: "codex_web",
    sourceUrl: `https://source.example.com/route-company-${index}`,
    discoveryScore: 80,
    rawMetadata: {},
  };
}

function routeCreatorCandidate(index: number) {
  return {
    type: "creator" as const,
    name: `Route Creator ${index}`,
    canonicalUrl: `https://youtube.com/@routecreator${index}`,
    primarySocialUrl: `https://youtube.com/@routecreator${index}`,
    discoveredDescription: "A public technology creator.",
    category: "technology",
    geography: "India",
    sourceName: "codex_web",
    sourceUrl: `https://youtube.com/@routecreator${index}/about`,
    discoveryScore: 75,
    rawMetadata: {},
  };
}

describe("discovery route adapters", () => {
  const adminSession = {
    session: { id: "session", expiresAt: new Date("2026-08-15") },
    user: { id: "admin", email: "admin@example.com", name: null },
  };
  const memberSession = {
    session: { id: "member-session", expiresAt: new Date("2026-08-15") },
    user: { id: "member", email: "member@example.com", name: null },
  };

  it("rejects a missing worker bearer secret before database work", async () => {
    const claim = vi.fn();
    const handler = createWorkerClaimHandler({
      authenticateWorker: () => false,
      claim,
    });

    const response = await handler(
      new Request("https://mewtuals.com/api/discovery/worker/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "Worker authentication is required.",
    });
    expect(claim).not.toHaveBeenCalled();
  });

  it("rejects a wrong worker bearer secret before database work", async () => {
    const claim = vi.fn();
    const handler = createWorkerClaimHandler({
      authenticateWorker: (authorization) =>
        verifyDiscoveryBearer(authorization, "correct-worker-secret"),
      claim,
    });

    const response = await handler(
      new Request("https://mewtuals.com/api/discovery/worker/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer wrong-worker-secret",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    expect(claim).not.toHaveBeenCalled();
  });

  it("requires JSON for authenticated worker requests", async () => {
    const claim = vi.fn();
    const handler = createWorkerClaimHandler({
      authenticateWorker: () => true,
      claim,
    });

    const response = await handler(
      new Request("https://mewtuals.com/api/discovery/worker/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer worker-secret",
          "Content-Type": "text/plain",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(415);
    expect(claim).not.toHaveBeenCalled();
  });

  it("rejects a worker Content-Length over 512 KiB before reading", async () => {
    const claim = vi.fn();
    const handler = createWorkerClaimHandler({
      authenticateWorker: () => true,
      claim,
    });

    const response = await handler(
      new Request("https://mewtuals.com/api/discovery/worker/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer worker-secret",
          "Content-Type": "application/json",
          "Content-Length": String(512 * 1_024 + 1),
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(413);
    expect(claim).not.toHaveBeenCalled();
  });

  it("stops a streamed worker body after 512 KiB plus one byte", async () => {
    const claim = vi.fn();
    const handler = createWorkerClaimHandler({
      authenticateWorker: () => true,
      claim,
    });
    const oversizedBody = `{"padding":"${"x".repeat(512 * 1_024)}"}`;

    const response = await handler(
      new Request("https://mewtuals.com/api/discovery/worker/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer worker-secret",
          "Content-Type": "application/json",
        },
        body: oversizedBody,
      }),
    );

    expect(response.status).toBe(413);
    expect(claim).not.toHaveBeenCalled();
  });

  it("rejects malformed worker JSON without invoking the service", async () => {
    const claim = vi.fn();
    const handler = createWorkerClaimHandler({
      authenticateWorker: () => true,
      claim,
    });

    const response = await handler(
      new Request("https://mewtuals.com/api/discovery/worker/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer worker-secret",
          "Content-Type": "application/json",
        },
        body: "{not-json",
      }),
    );

    expect(response.status).toBe(400);
    expect(claim).not.toHaveBeenCalled();
  });

  it("rejects an unsupported worker claim trigger", async () => {
    const claim = vi.fn();
    const handler = createWorkerClaimHandler({
      authenticateWorker: () => true,
      claim,
    });

    const response = await handler(
      new Request("https://mewtuals.com/api/discovery/worker/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer worker-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trigger: "manual" }),
      }),
    );

    expect(response.status).toBe(400);
    expect(claim).not.toHaveBeenCalled();
  });

  it("passes a valid trial claim to the discovery service", async () => {
    const claim = vi.fn(async () => ({
      ok: true as const,
      claimed: true,
      runId: "00000000-0000-4000-8000-000000000008",
    }));
    const handler = createWorkerClaimHandler({
      authenticateWorker: () => true,
      claim,
    });

    const response = await handler(
      new Request("https://mewtuals.com/api/discovery/worker/claim", {
        method: "POST",
        headers: {
          Authorization: "Bearer worker-secret",
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ trigger: "trial" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(claim).toHaveBeenCalledWith("trial");
  });

  it("rejects mismatched route and batch run ids before completion", async () => {
    const complete = vi.fn();
    const handler = createWorkerCompleteHandler({
      authenticateWorker: () => true,
      complete,
    });
    const routeRunId = "00000000-0000-4000-8000-000000000009";

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/discovery/worker/runs/${routeRunId}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer worker-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId: "00000000-0000-4000-8000-000000000010",
            leaseToken: "lease-token",
            promptVersion: "codex-web-v1",
            candidates: [],
            sourceErrors: [],
          }),
        },
      ),
      { params: Promise.resolve({ runId: routeRunId }) },
    );

    expect(response.status).toBe(400);
    expect(complete).not.toHaveBeenCalled();
  });

  it("passes a bounded matching batch to completion and preserves conflicts", async () => {
    const complete = vi.fn(async () => ({
      ok: false as const,
      status: 409,
      error: "Discovery run cannot accept this submission.",
      reason: "lease_mismatch",
    }));
    const handler = createWorkerCompleteHandler({
      authenticateWorker: () => true,
      complete,
    });
    const runId = "00000000-0000-4000-8000-000000000011";
    const body = {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: [],
      sourceErrors: [],
    };

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/discovery/worker/runs/${runId}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer worker-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(409);
    expect(complete).toHaveBeenCalledWith(runId, body);
  });

  it("returns 200 for a successful worker completion", async () => {
    const complete = vi.fn(async () => ({
      ok: true as const,
      outcome: "completed",
      run: { status: "succeeded", foundCount: 1 },
    }));
    const handler = createWorkerCompleteHandler({
      authenticateWorker: () => true,
      complete,
    });
    const runId = "00000000-0000-4000-8000-000000000028";
    const body = {
      runId,
      leaseToken: "lease-token",
      promptVersion: "codex-web-v1",
      candidates: [],
      sourceErrors: [],
    };

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/discovery/worker/runs/${runId}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer worker-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      outcome: "completed",
    });
  });

  it("returns 400 at the route boundary for an invalid discovery batch", async () => {
    const repository = createRouteRepository();
    const service = createRouteService(repository);
    const handler = createWorkerCompleteHandler({
      authenticateWorker: () => true,
      complete: (runId, body) => service.completeRun(runId, body),
    });
    const runId = "00000000-0000-4000-8000-000000000032";

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/discovery/worker/runs/${runId}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer worker-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId,
            leaseToken: "lease-token",
            promptVersion: "codex-web-v1",
            candidates: [{ type: "partner", discoveryScore: 101 }],
            sourceErrors: [],
          }),
        },
      ),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "Submit a valid discovery batch.",
    });
    expect(repository.getRun).not.toHaveBeenCalled();
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("returns 400 at the route boundary above the persisted allocation", async () => {
    const repository = createRouteRepository();
    const runId = "00000000-0000-4000-8000-000000000033";
    vi.mocked(repository.getRun).mockResolvedValue({
      id: runId,
      requestedCount: 1,
    } as never);
    const service = createRouteService(repository);
    const handler = createWorkerCompleteHandler({
      authenticateWorker: () => true,
      complete: (routeRunId, body) => service.completeRun(routeRunId, body),
    });
    const candidate = {
      type: "company" as const,
      name: "Allocation Candidate",
      canonicalUrl: "https://allocation-one.example.com",
      websiteUrl: "https://allocation-one.example.com",
      discoveredDescription: "A public technology company.",
      category: "technology",
      geography: "India",
      sourceName: "codex_web",
      sourceUrl: "https://source.example.com/allocation-one",
      discoveryScore: 80,
      rawMetadata: {},
    };

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/discovery/worker/runs/${runId}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer worker-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId,
            leaseToken: "lease-token",
            promptVersion: "codex-web-v1",
            candidates: [
              candidate,
              {
                ...candidate,
                name: "Second Allocation Candidate",
                canonicalUrl: "https://allocation-two.example.com",
                websiteUrl: "https://allocation-two.example.com",
              },
            ],
            sourceErrors: [],
          }),
        },
      ),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      status: 400,
      error: "Discovery batch exceeds the claimed candidate allocation.",
    });
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("returns 400 for twenty companies from a persisted ten-ten route allocation", async () => {
    const repository = createRouteRepository();
    const runId = "00000000-0000-4000-8000-000000000040";
    vi.mocked(repository.getRun).mockResolvedValue({
      id: runId,
      candidateType: "both",
      requestedCount: 20,
      companyPercentage: 50,
    } as never);
    const service = createRouteService(repository);
    const handler = createWorkerCompleteHandler({
      authenticateWorker: () => true,
      complete: (routeRunId, body) => service.completeRun(routeRunId, body),
    });

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/discovery/worker/runs/${runId}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer worker-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId,
            leaseToken: "lease-token",
            promptVersion: "codex-web-v1",
            candidates: Array.from({ length: 20 }, (_, index) =>
              routeCompanyCandidate(index),
            ),
            sourceErrors: [],
          }),
        },
      ),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Discovery batch exceeds the claimed company allocation.",
    });
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("returns 400 for the wrong candidate type at the route boundary", async () => {
    const repository = createRouteRepository();
    const runId = "00000000-0000-4000-8000-000000000041";
    vi.mocked(repository.getRun).mockResolvedValue({
      id: runId,
      candidateType: "company",
      requestedCount: 20,
      companyPercentage: 100,
    } as never);
    const service = createRouteService(repository);
    const handler = createWorkerCompleteHandler({
      authenticateWorker: () => true,
      complete: (routeRunId, body) => service.completeRun(routeRunId, body),
    });

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/discovery/worker/runs/${runId}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer worker-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId,
            leaseToken: "lease-token",
            promptVersion: "codex-web-v1",
            candidates: [routeCreatorCandidate(1)],
            sourceErrors: [],
          }),
        },
      ),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error:
        "Discovery batch contains creators outside the claimed company run.",
    });
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("returns 200 for honest per-type underfill at the route boundary", async () => {
    const repository = createRouteRepository();
    const runId = "00000000-0000-4000-8000-000000000042";
    vi.mocked(repository.getRun).mockResolvedValue({
      id: runId,
      candidateType: "both",
      requestedCount: 20,
      companyPercentage: 50,
    } as never);
    vi.mocked(repository.completeRun).mockResolvedValue({
      outcome: "completed",
      run: { id: runId, status: "succeeded", foundCount: 3 },
    } as never);
    const service = createRouteService(repository);
    const handler = createWorkerCompleteHandler({
      authenticateWorker: () => true,
      complete: (routeRunId, body) => service.completeRun(routeRunId, body),
    });

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/discovery/worker/runs/${runId}/complete`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer worker-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            runId,
            leaseToken: "lease-token",
            promptVersion: "codex-web-v1",
            candidates: [
              routeCompanyCandidate(1),
              routeCreatorCandidate(1),
              routeCreatorCandidate(2),
            ],
            sourceErrors: [],
          }),
        },
      ),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      run: { foundCount: 3 },
    });
    expect(repository.completeRun).toHaveBeenCalledOnce();
  });

  it("passes a matching worker failure to the discovery service", async () => {
    const fail = vi.fn(async () => ({
      ok: true as const,
      outcome: "failed",
      run: { status: "failed" },
    }));
    const handler = createWorkerFailHandler({
      authenticateWorker: () => true,
      fail,
    });
    const runId = "00000000-0000-4000-8000-000000000012";
    const body = { runId, leaseToken: "lease-token", message: "Search failed." };

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/discovery/worker/runs/${runId}/fail`,
        {
          method: "POST",
          headers: {
            Authorization: "Bearer worker-secret",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(200);
    expect(fail).toHaveBeenCalledWith(runId, body);
  });

  it("rejects cross-origin administrator queue mutations", async () => {
    const queue = vi.fn();
    const handler = createAdminDiscoveryRunsPostHandler({
      getSession: async () => adminSession,
      queue,
    });

    const response = await handler(
      new Request("https://mewtuals.com/api/admin/discovery/runs", {
        method: "POST",
        headers: {
          Origin: "https://attacker.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(403);
    expect(queue).not.toHaveBeenCalled();
  });

  it("requires an authenticated session for administrator queue mutations", async () => {
    const queue = vi.fn();
    const handler = createAdminDiscoveryRunsPostHandler({
      getSession: async () => null,
      queue,
    });

    const response = await handler(
      new Request("https://mewtuals.com/api/admin/discovery/runs", {
        method: "POST",
        headers: {
          Origin: "https://mewtuals.com",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );

    expect(response.status).toBe(401);
    expect(queue).not.toHaveBeenCalled();
  });

  it("derives the queue actor from the authenticated session", async () => {
    const queue = vi.fn(async () => ({ ok: true as const, run: { status: "queued" } }));
    const handler = createAdminDiscoveryRunsPostHandler({
      getSession: async () => adminSession,
      queue,
    });

    const response = await handler(
      new Request("https://mewtuals.com/api/admin/discovery/runs", {
        method: "POST",
        headers: {
          Origin: "https://mewtuals.com",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ actorEmail: "attacker@example.com" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(queue).toHaveBeenCalledWith({
      userId: "admin",
      email: "admin@example.com",
    });
  });

  it("passes administrator query filters to validated service listing", async () => {
    const list = vi.fn(async () => ({
      ok: false as const,
      status: 400,
      error: "Review the discovery filters.",
    }));
    const handler = createAdminDiscoveryRunsGetHandler({
      getSession: async () => adminSession,
      list,
    });

    const response = await handler(
      new Request(
        "https://mewtuals.com/api/admin/discovery/runs?type=company&page=invalid",
      ),
    );

    expect(response.status).toBe(400);
    expect(list).toHaveBeenCalledWith(
      { userId: "admin", email: "admin@example.com" },
      { type: "company", page: "invalid" },
    );
  });

  it("maps stale administrator candidate updates to 409 with the latest value", async () => {
    const latest = { id: "00000000-0000-4000-8000-000000000013", status: "rejected" };
    const update = vi.fn(async () => ({
      ok: false as const,
      status: 409,
      error: "This discovery candidate changed before the status update.",
      candidate: latest,
    }));
    const handler = createAdminDiscoveryCandidateHandler({
      getSession: async () => adminSession,
      update,
    });
    const body = {
      status: "shortlisted",
      expectedUpdatedAt: "2026-07-22T03:00:00.000Z",
    };

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/admin/discovery/candidates/${latest.id}`,
        {
          method: "PATCH",
          headers: {
            Origin: "https://mewtuals.com",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      ),
      { params: Promise.resolve({ candidateId: latest.id }) },
    );

    expect(response.status).toBe(409);
    expect(update).toHaveBeenCalledWith(
      { userId: "admin", email: "admin@example.com" },
      latest.id,
      body,
    );
    await expect(response.json()).resolves.toMatchObject({ candidate: latest });
  });

  it("returns the updated candidate from a successful compare-and-update PATCH", async () => {
    const repository = createRouteRepository();
    const candidateId = "00000000-0000-4000-8000-000000000034";
    const updatedAt = new Date("2026-07-22T04:00:00.001Z");
    const candidate = { id: candidateId, status: "shortlisted", updatedAt };
    vi.mocked(repository.updateCandidateStatus).mockResolvedValue({
      outcome: "updated",
      candidate,
    } as never);
    const service = createRouteService(repository);
    const handler = createAdminDiscoveryCandidateHandler({
      getSession: async () => adminSession,
      update: (actor, routeCandidateId, body) =>
        service.updateCandidateStatus(actor, routeCandidateId, body),
    });
    const expectedUpdatedAt = "2026-07-22T03:00:00.000Z";

    const response = await handler(
      new Request(
        `https://mewtuals.com/api/admin/discovery/candidates/${candidateId}`,
        {
          method: "PATCH",
          headers: {
            Origin: "https://mewtuals.com",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: "shortlisted", expectedUpdatedAt }),
        },
      ),
      { params: Promise.resolve({ candidateId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      candidate: {
        id: candidateId,
        status: "shortlisted",
        updatedAt: updatedAt.toISOString(),
      },
    });
    expect(repository.updateCandidateStatus).toHaveBeenCalledWith({
      candidateId,
      status: "shortlisted",
      expectedUpdatedAt: new Date(expectedUpdatedAt),
      now: new Date("2026-07-22T04:00:00.000Z"),
    });
  });

  it("preserves authenticated non-admin denial across admin endpoints", async () => {
    const denied = vi.fn(async () => ({
      ok: false as const,
      status: 403,
      error: "Administrator access is required.",
    }));
    const runsGet = createAdminDiscoveryRunsGetHandler({
      getSession: async () => memberSession,
      list: denied,
    });
    const runsPost = createAdminDiscoveryRunsPostHandler({
      getSession: async () => memberSession,
      queue: denied,
    });
    const candidatePatch = createAdminDiscoveryCandidateHandler({
      getSession: async () => memberSession,
      update: denied,
    });
    const candidateId = "00000000-0000-4000-8000-000000000029";

    const getResponse = await runsGet(
      new Request("https://mewtuals.com/api/admin/discovery/runs"),
    );
    const postResponse = await runsPost(
      new Request("https://mewtuals.com/api/admin/discovery/runs", {
        method: "POST",
        headers: { Origin: "https://mewtuals.com" },
      }),
    );
    const patchResponse = await candidatePatch(
      new Request(
        `https://mewtuals.com/api/admin/discovery/candidates/${candidateId}`,
        {
          method: "PATCH",
          headers: {
            Origin: "https://mewtuals.com",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            status: "shortlisted",
            expectedUpdatedAt: "2026-07-22T03:00:00.000Z",
          }),
        },
      ),
      { params: Promise.resolve({ candidateId }) },
    );

    expect([getResponse.status, postResponse.status, patchResponse.status]).toEqual([
      403, 403, 403,
    ]);
    expect(denied).toHaveBeenCalledTimes(3);
    expect(denied).toHaveBeenCalledWith(
      { userId: "member", email: "member@example.com" },
      expect.anything(),
      expect.anything(),
    );
  });

  it("keeps production route modules as thin exported compositions", async () => {
    const [claim, complete, fail, runs, candidate] = await Promise.all([
      import("../app/api/discovery/worker/claim/route"),
      import("../app/api/discovery/worker/runs/[runId]/complete/route"),
      import("../app/api/discovery/worker/runs/[runId]/fail/route"),
      import("../app/api/admin/discovery/runs/route"),
      import("../app/api/admin/discovery/candidates/[candidateId]/route"),
    ]);

    expect(claim.POST).toBeTypeOf("function");
    expect(complete.POST).toBeTypeOf("function");
    expect(fail.POST).toBeTypeOf("function");
    expect(runs.GET).toBeTypeOf("function");
    expect(runs.POST).toBeTypeOf("function");
    expect(candidate.PATCH).toBeTypeOf("function");
  });
});
