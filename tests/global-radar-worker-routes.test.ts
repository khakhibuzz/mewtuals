import { readFileSync } from "node:fs";

import { describe, expect, it, vi, type Mock } from "vitest";

import {
  generateGlobalRadarQueries,
  planGlobalRadarRun,
} from "../app/domain/global-radar";
import { createWorkerClaimHandler as createDiscoveryWorkerClaimHandler } from "../app/server/discovery-route";
import { verifyDiscoveryBearer } from "../app/server/discovery-worker-auth";
import { GLOBAL_RADAR_WORKER_OUTPUT_SCHEMA } from "../app/server/global-radar";
import {
  createGlobalRadarWorkerAbandonHandler,
  createGlobalRadarWorkerClaimHandler,
  createGlobalRadarWorkerCompleteHandler,
  createGlobalRadarWorkerFailHandler,
  type GlobalRadarWorkerRouteService,
} from "../app/server/global-radar/route";
import { verifyGlobalRadarBearer } from "../app/server/global-radar/worker-auth";
import { POST as abandonRoute } from "../app/api/global-radar/worker/runs/[runId]/abandon/route";
import { POST as claimRoute } from "../app/api/global-radar/worker/claim/route";
import { POST as completeRoute } from "../app/api/global-radar/worker/runs/[runId]/complete/route";
import { POST as failRoute } from "../app/api/global-radar/worker/runs/[runId]/fail/route";

const RADAR_SECRET = "radar-worker-secret";
const DISCOVERY_SECRET = "discovery-worker-secret";
const RUN_ID = "00000000-0000-4000-8000-000000000150";
const OTHER_RUN_ID = "00000000-0000-4000-8000-000000000151";
const LEASE_TOKEN = "a".repeat(64);
const AUTHORIZATION = Object.freeze({ scope: "global-radar-worker" as const });
const VALID_BATCH = JSON.parse(
  readFileSync("tests/fixtures/global-radar-valid-batch.json", "utf8"),
) as Record<string, unknown>;

type WorkerServiceDouble = {
  [Key in keyof GlobalRadarWorkerRouteService]: Mock<
    GlobalRadarWorkerRouteService[Key]
  >;
};

function workerService(
  overrides: Partial<WorkerServiceDouble> = {},
): WorkerServiceDouble {
  return {
    authorizeWorker: vi.fn(() => AUTHORIZATION),
    claim: vi.fn(async () => ({ outcome: "no_work", reason: "empty_queue" })),
    complete: vi.fn(async () => ({ outcome: "completed", run: safeRun() })),
    fail: vi.fn(async () => ({ outcome: "completed", run: safeRun() })),
    abandon: vi.fn(async () => ({ outcome: "completed", run: safeRun() })),
    ...overrides,
  };
}

function safeRun() {
  return {
    id: RUN_ID,
    trigger: "scheduled",
    scanMode: "daily",
    status: "succeeded",
    startedAt: "2026-07-31T04:30:00.000Z",
    completedAt: "2026-07-31T04:31:00.000Z",
    sourceCountries: ["China", "United States"],
    sourceLanguages: ["en", "zh-CN"],
    targetDomains: ["robotics_manufacturing"],
    targetSignalTypes: ["direct_demand"],
    sourcesUsed: ["codex_public_web"],
    counts: {
      resultsExamined: 8,
      entitiesObserved: 2,
      signalsFound: 1,
      directDemands: 1,
      precursors: 0,
      momentumRecords: 0,
      new: 1,
      updated: 0,
      duplicates: 0,
      rejectedForWeakEvidence: 0,
      sourceErrors: 0,
    },
    notices: [],
    createdAt: "2026-07-31T04:29:00.000Z",
    updatedAt: "2026-07-31T04:31:00.000Z",
  };
}

function workerRequest(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`https://mewtuals.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RADAR_SECRET}`,
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function context(runId = RUN_ID) {
  return { params: Promise.resolve({ runId }) };
}

async function json(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json();
}

describe("Global Radar worker HTTP adapters", () => {
  it("wires all four isolated worker endpoints", () => {
    expect([claimRoute, completeRoute, failRoute, abandonRoute]).toSatisfy(
      (routes: unknown[]) => routes.every((route) => typeof route === "function"),
    );
  });

  it("authenticates before accessing an untrusted body", async () => {
    const service = workerService({
      authorizeWorker: vi.fn(() => null),
    });
    const request = workerRequest("/api/global-radar/worker/claim", {});
    let bodyWasRead = false;
    Object.defineProperty(request, "body", {
      configurable: true,
      get() {
        bodyWasRead = true;
        throw new Error("The request body must not be read before auth.");
      },
    });

    const response = await createGlobalRadarWorkerClaimHandler({
      getService: () => service,
    })(request);

    expect(response.status).toBe(401);
    await expect(json(response)).resolves.toEqual({
      ok: false,
      error: "Global Radar worker authentication is required.",
    });
    expect(bodyWasRead).toBe(false);
    expect(service.claim).not.toHaveBeenCalled();
  });

  it("keeps Discovery and Global Radar bearer credentials isolated", async () => {
    const radarService = workerService({
      authorizeWorker: vi.fn((authorization: string | null) =>
        verifyGlobalRadarBearer(authorization, RADAR_SECRET)
          ? AUTHORIZATION
          : null,
      ),
    });
    const radarResponse = await createGlobalRadarWorkerClaimHandler({
      getService: () => radarService,
    })(
      workerRequest("/api/global-radar/worker/claim", {}, {
        Authorization: `Bearer ${DISCOVERY_SECRET}`,
      }),
    );

    const discoveryClaim = vi.fn();
    const discoveryResponse = await createDiscoveryWorkerClaimHandler({
      authenticateWorker: (authorization) =>
        verifyDiscoveryBearer(authorization, DISCOVERY_SECRET),
      claim: discoveryClaim,
    })(
      new Request("https://mewtuals.com/api/discovery/worker/claim", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RADAR_SECRET}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );

    expect(radarResponse.status).toBe(401);
    expect(discoveryResponse.status).toBe(401);
    expect(radarService.claim).not.toHaveBeenCalled();
    expect(discoveryClaim).not.toHaveBeenCalled();
  });

  it("requires application/json after authentication", async () => {
    const service = workerService();
    const response = await createGlobalRadarWorkerClaimHandler({
      getService: () => service,
    })(
      workerRequest("/api/global-radar/worker/claim", "{}", {
        "Content-Type": "text/plain",
      }),
    );

    expect(response.status).toBe(415);
    await expect(json(response)).resolves.toEqual({
      ok: false,
      error: "Send an application/json request.",
    });
    expect(service.claim).not.toHaveBeenCalled();
  });

  it("rejects a declared worker body over 2 MiB before accessing the stream", async () => {
    const service = workerService();
    const request = workerRequest("/api/global-radar/worker/claim", {}, {
      "Content-Length": String(2 * 1_024 * 1_024 + 1),
    });
    let bodyWasRead = false;
    Object.defineProperty(request, "body", {
      configurable: true,
      get() {
        bodyWasRead = true;
        throw new Error("Oversized declared bodies must not be read.");
      },
    });

    const response = await createGlobalRadarWorkerClaimHandler({
      getService: () => service,
    })(request);

    expect(response.status).toBe(413);
    expect(bodyWasRead).toBe(false);
    expect(service.claim).not.toHaveBeenCalled();
  });

  it("stops an undeclared streamed worker body after 2 MiB", async () => {
    const service = workerService();
    const oversized = `{"padding":"${"x".repeat(2 * 1_024 * 1_024)}"}`;

    const response = await createGlobalRadarWorkerClaimHandler({
      getService: () => service,
    })(workerRequest("/api/global-radar/worker/claim", oversized));

    expect(response.status).toBe(413);
    await expect(json(response)).resolves.toEqual({
      ok: false,
      error: "Global Radar worker request body is too large.",
    });
    expect(service.claim).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and strict claim selector violations", async () => {
    const service = workerService();
    const handler = createGlobalRadarWorkerClaimHandler({
      getService: () => service,
    });

    const malformed = await handler(
      workerRequest("/api/global-radar/worker/claim", "{not-json"),
    );
    expect(malformed.status).toBe(400);
    await expect(json(malformed)).resolves.toEqual({
      ok: false,
      error: "Submit valid JSON.",
    });

    for (const body of [
      { trigger: "manual" },
      { scanMode: "manual" },
      { trigger: "trial", scanMode: "daily", extra: true },
    ]) {
      const response = await handler(
        workerRequest("/api/global-radar/worker/claim", body),
      );
      expect(response.status).toBe(400);
    }
    expect(service.claim).not.toHaveBeenCalled();
  });

  it("passes the locked claim selector and returns the private claim only after auth", async () => {
    const plan = planGlobalRadarRun({
      now: new Date("2026-07-31T00:00:00.000Z"),
      scanMode: "thematic",
      config: {
        countries: ["China"],
        languages: ["en", "zh-CN"],
        themes: ["robotics_manufacturing"],
        enabledSourceAdapters: ["codex_public_web"],
        sourceFamilies: ["official_company_material"],
        resultLimit: 20,
        scoreVersion: "global-radar-score-v1",
        thresholds: {
          version: "global-radar-thresholds-v1",
          direct_demand: 70,
          demand_precursor: 65,
          ecosystem_momentum: 70,
        },
      },
      coverageState: {
        countryLastCoveredAt: {},
        themeLastCoveredAt: {},
        watchlistLastCoveredAt: {},
      },
      watchlist: [],
    });
    const claim = {
      runId: RUN_ID,
      leaseToken: LEASE_TOKEN,
      leaseExpiresAt: "2026-07-31T05:00:00.000Z",
      versions: {
        prompt: "codex-public-web-v1",
        schema: "global-radar-batch-v1",
        taxonomy: "global-radar-v1",
        scoring: "global-radar-score-v1",
        plan: "global-radar-plan-v1",
        query: "global-radar-query-v1",
      },
      plan,
      queries: generateGlobalRadarQueries(plan),
      config: {
        countries: ["China"],
        languages: ["en", "zh-CN"],
        themes: ["robotics_manufacturing"],
        enabledSources: ["codex_public_web"],
        resultLimit: 20,
        thresholds: {
          direct_demand: 70,
          demand_precursor: 65,
          ecosystem_momentum: 70,
        },
      },
      outputSchema: structuredClone(GLOBAL_RADAR_WORKER_OUTPUT_SCHEMA),
    };
    const outputProperties = claim.outputSchema.properties as Record<
      string,
      unknown
    >;
    const service = workerService({
      claim: vi.fn(async () => ({
        outcome: "claimed",
        claim: {
          ...claim,
          workerSecret: "private-radar-worker-secret",
          outputSchema: {
            ...claim.outputSchema,
            properties: {
              ...outputProperties,
              rawPayload: { type: "string", const: "private-body" },
            },
            errorBody: "private SQL failure",
          },
        },
      })),
    });
    const response = await createGlobalRadarWorkerClaimHandler({
      getService: () => service,
    })(
      workerRequest("/api/global-radar/worker/claim", {
        trigger: "trial",
        scanMode: "thematic",
      }),
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({
      ok: true,
      outcome: "claimed",
      claim: {
        ...claim,
        outputSchema: claim.outputSchema,
      },
    });
    expect(service.claim).toHaveBeenCalledWith(AUTHORIZATION, {
      trigger: "trial",
      scanMode: "thematic",
    });

    const prototypeProperties = JSON.parse(
      '{"acceptedSignals":{"type":"array"},"__proto__":{"workerSecret":"private"}}',
    ) as Record<string, unknown>;
    const prototypeService = workerService({
      claim: vi.fn(async () => ({
        outcome: "claimed",
        claim: {
          ...claim,
          outputSchema: {
            ...claim.outputSchema,
            properties: prototypeProperties,
          },
        },
      })),
    });
    const prototypeResponse = await createGlobalRadarWorkerClaimHandler({
      getService: () => prototypeService,
    })(workerRequest("/api/global-radar/worker/claim", {}));
    expect(prototypeResponse.status).toBe(500);
    await expect(json(prototypeResponse)).resolves.toEqual({
      ok: false,
      error: "We could not complete that request. Please try again.",
    });

    const incompleteSchemaService = workerService({
      claim: vi.fn(async () => ({
        outcome: "claimed",
        claim: {
          ...claim,
          outputSchema: {
            type: "object",
            additionalProperties: false,
          },
        },
      })),
    });
    const incompleteSchemaResponse =
      await createGlobalRadarWorkerClaimHandler({
        getService: () => incompleteSchemaService,
      })(workerRequest("/api/global-radar/worker/claim", {}));
    expect(incompleteSchemaResponse.status).toBe(500);
    await expect(json(incompleteSchemaResponse)).resolves.toEqual({
      ok: false,
      error: "We could not complete that request. Please try again.",
    });

    for (const outputSchema of [
      {
        ...structuredClone(GLOBAL_RADAR_WORKER_OUTPUT_SCHEMA),
        properties: {
          ...structuredClone(outputProperties),
          schemaVersion: { type: "string", maxLength: 1 },
        },
      },
      {
        ...structuredClone(GLOBAL_RADAR_WORKER_OUTPUT_SCHEMA),
        properties: {
          ...structuredClone(outputProperties),
          nonCanonicalField: { type: "string" },
        },
      },
    ]) {
      const nonCanonicalService = workerService({
        claim: vi.fn(async () => ({
          outcome: "claimed",
          claim: { ...claim, outputSchema },
        })),
      });
      const nonCanonicalResponse =
        await createGlobalRadarWorkerClaimHandler({
          getService: () => nonCanonicalService,
        })(workerRequest("/api/global-radar/worker/claim", {}));
      expect(nonCanonicalResponse.status).toBe(500);
      await expect(json(nonCanonicalResponse)).resolves.toEqual({
        ok: false,
        error: "We could not complete that request. Please try again.",
      });
    }
  });

  it("accepts lease tokens only on complete and fail", async () => {
    const service = workerService();
    const response = await createGlobalRadarWorkerClaimHandler({
      getService: () => service,
    })(
      workerRequest("/api/global-radar/worker/claim", {}, {
        "X-Global-Radar-Lease-Token": LEASE_TOKEN,
      }),
    );

    expect(response.status).toBe(400);
    expect(service.claim).not.toHaveBeenCalled();
  });

  it("passes an exact complete batch with the lease header and supports replay", async () => {
    const service = workerService({
      complete: vi.fn(async () => ({ outcome: "replayed", run: safeRun() })),
    });
    const response = await createGlobalRadarWorkerCompleteHandler({
      getService: () => service,
    })(
      workerRequest(
        `/api/global-radar/worker/runs/${RUN_ID}/complete`,
        VALID_BATCH,
        { "X-Global-Radar-Lease-Token": LEASE_TOKEN },
      ),
      context(),
    );

    expect(response.status).toBe(200);
    await expect(json(response)).resolves.toEqual({
      ok: true,
      outcome: "replayed",
      run: safeRun(),
    });
    expect(service.complete).toHaveBeenCalledWith(AUTHORIZATION, {
      runId: RUN_ID,
      leaseToken: LEASE_TOKEN,
      batch: VALID_BATCH,
    });
  });

  it("rejects invalid complete paths, mismatched batches, missing leases, and extra batch keys", async () => {
    const service = workerService();
    const handler = createGlobalRadarWorkerCompleteHandler({
      getService: () => service,
    });
    const cases = [
      {
        context: context("not-a-uuid"),
        body: VALID_BATCH,
        headers: { "X-Global-Radar-Lease-Token": LEASE_TOKEN },
      },
      {
        context: context(),
        body: { ...VALID_BATCH, runId: OTHER_RUN_ID },
        headers: { "X-Global-Radar-Lease-Token": LEASE_TOKEN },
      },
      {
        context: context(),
        body: VALID_BATCH,
        headers: {} as Record<string, string>,
      },
      {
        context: context(),
        body: { ...VALID_BATCH, privatePayload: "must-not-pass" },
        headers: { "X-Global-Radar-Lease-Token": LEASE_TOKEN },
      },
    ];

    for (const candidate of cases) {
      const response = await handler(
        workerRequest(
          `/api/global-radar/worker/runs/${RUN_ID}/complete`,
          candidate.body,
          candidate.headers,
        ),
        candidate.context,
      );
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(service.complete).not.toHaveBeenCalled();
  });

  it("passes only strict fail and abandon commands with the approved lease rules", async () => {
    const service = workerService();
    const fail = createGlobalRadarWorkerFailHandler({ getService: () => service });
    const abandon = createGlobalRadarWorkerAbandonHandler({
      getService: () => service,
    });

    const failResponse = await fail(
      workerRequest(
        `/api/global-radar/worker/runs/${RUN_ID}/fail`,
        { runId: RUN_ID, reason: "Public source adapter failed." },
        { "X-Global-Radar-Lease-Token": LEASE_TOKEN },
      ),
      context(),
    );
    const abandonResponse = await abandon(
      workerRequest(
        `/api/global-radar/worker/runs/${RUN_ID}/abandon`,
        { runId: RUN_ID, reason: "Claim artifact was irrecoverably lost." },
      ),
      context(),
    );

    expect(failResponse.status).toBe(200);
    expect(abandonResponse.status).toBe(200);
    expect(service.fail).toHaveBeenCalledWith(AUTHORIZATION, {
      runId: RUN_ID,
      leaseToken: LEASE_TOKEN,
      reason: "Public source adapter failed.",
    });
    expect(service.abandon).toHaveBeenCalledWith(AUTHORIZATION, {
      runId: RUN_ID,
      reason: "Claim artifact was irrecoverably lost.",
    });

    const extraFail = await fail(
      workerRequest(
        `/api/global-radar/worker/runs/${RUN_ID}/fail`,
        { runId: RUN_ID, reason: "safe", extra: true },
        { "X-Global-Radar-Lease-Token": LEASE_TOKEN },
      ),
      context(),
    );
    const leaseBearingAbandon = await abandon(
      workerRequest(
        `/api/global-radar/worker/runs/${RUN_ID}/abandon`,
        { runId: RUN_ID, reason: "safe" },
        { "X-Global-Radar-Lease-Token": LEASE_TOKEN },
      ),
      context(),
    );
    expect(extraFail.status).toBe(400);
    expect(leaseBearingAbandon.status).toBe(400);
    expect(service.fail).toHaveBeenCalledTimes(1);
    expect(service.abandon).toHaveBeenCalledTimes(1);
  });

  it("maps conflicts, not-found results, and private exceptions safely", async () => {
    const conflicting = workerService({
      complete: vi.fn(async () => ({
        outcome: "conflict",
        reason: "lease_mismatch",
        run: { ...safeRun(), leaseTokenHash: "private-lease-hash" },
        rejectedBody: "private-rejected-body",
      })),
    });
    const conflictResponse = await createGlobalRadarWorkerCompleteHandler({
      getService: () => conflicting,
    })(
      workerRequest(
        `/api/global-radar/worker/runs/${RUN_ID}/complete`,
        VALID_BATCH,
        { "X-Global-Radar-Lease-Token": LEASE_TOKEN },
      ),
      context(),
    );
    expect(conflictResponse.status).toBe(409);
    const conflictBody = await json(conflictResponse);
    expect(conflictBody).toEqual({
      ok: false,
      outcome: "conflict",
      reason: "lease_mismatch",
      run: safeRun(),
    });
    expect(JSON.stringify(conflictBody)).not.toMatch(/lease-hash|rejected-body/);

    const missing = workerService({
      fail: vi.fn(async () => ({ outcome: "not_found" })),
    });
    const missingResponse = await createGlobalRadarWorkerFailHandler({
      getService: () => missing,
    })(
      workerRequest(
        `/api/global-radar/worker/runs/${RUN_ID}/fail`,
        { runId: RUN_ID, reason: "safe" },
        { "X-Global-Radar-Lease-Token": LEASE_TOKEN },
      ),
      context(),
    );
    expect(missingResponse.status).toBe(404);

    const broken = workerService({
      claim: vi.fn(async () => {
        throw new Error("private SQL and worker secret details");
      }),
    });
    const errorResponse = await createGlobalRadarWorkerClaimHandler({
      getService: () => broken,
    })(workerRequest("/api/global-radar/worker/claim", {}));
    expect(errorResponse.status).toBe(500);
    const errorBody = await json(errorResponse);
    expect(errorBody).toEqual({
      ok: false,
      error: "We could not complete that request. Please try again.",
    });
    expect(JSON.stringify(errorBody)).not.toMatch(/private|SQL|secret/);
  });
});
