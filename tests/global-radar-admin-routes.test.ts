import { describe, expect, it, vi, type Mock } from "vitest";

import {
  createGlobalRadarAdminEvidencePostHandler,
  createGlobalRadarAdminMergePostHandler,
  createGlobalRadarAdminNotePostHandler,
  createGlobalRadarAdminPromotionPostHandler,
  createGlobalRadarAdminPromotionReversePostHandler,
  createGlobalRadarAdminRunsGetHandler,
  createGlobalRadarAdminRunsPostHandler,
  createGlobalRadarAdminSignalGetHandler,
  createGlobalRadarAdminSignalPatchHandler,
  createGlobalRadarAdminWatchlistPatchHandler,
  type GlobalRadarAdminRouteService,
} from "../app/server/global-radar/route";
import {
  GET as runsGetRoute,
  POST as runsPostRoute,
} from "../app/api/admin/global-demand-radar/runs/route";
import {
  GET as signalGetRoute,
  PATCH as signalPatchRoute,
} from "../app/api/admin/global-demand-radar/signals/[signalId]/route";
import { POST as evidencePostRoute } from "../app/api/admin/global-demand-radar/signals/[signalId]/evidence/route";
import { POST as notePostRoute } from "../app/api/admin/global-demand-radar/signals/[signalId]/notes/route";
import { POST as mergePostRoute } from "../app/api/admin/global-demand-radar/signals/[signalId]/merge/route";
import { PATCH as watchlistPatchRoute } from "../app/api/admin/global-demand-radar/entities/[entityId]/watchlist/route";
import { POST as promotionPostRoute } from "../app/api/admin/global-demand-radar/entities/[entityId]/promotions/route";
import { POST as promotionReversePostRoute } from "../app/api/admin/global-demand-radar/entities/[entityId]/promotions/reverse/route";

const SIGNAL_ID = "00000000-0000-4000-8000-000000000201";
const DUPLICATE_SIGNAL_ID = "00000000-0000-4000-8000-000000000202";
const ENTITY_ID = "00000000-0000-4000-8000-000000000203";
const REQUEST_ID = "00000000-0000-4000-8000-000000000204";
const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000205";

const ADMIN_SESSION = {
  session: {
    id: "00000000-0000-4000-8000-000000000206",
    expiresAt: new Date("2026-08-31T00:00:00.000Z"),
  },
  user: {
    id: "00000000-0000-4000-8000-000000000207",
    email: " Admin@Example.com ",
    name: null,
  },
};

const ACTOR = {
  userId: ADMIN_SESSION.user.id,
  email: ADMIN_SESSION.user.email,
};

type AdminServiceDouble = {
  [Key in keyof GlobalRadarAdminRouteService]: Mock<
    GlobalRadarAdminRouteService[Key]
  >;
};

function adminService(
  overrides: Partial<AdminServiceDouble> = {},
): AdminServiceDouble {
  return {
    getSignalDetail: vi.fn(async () => ({
      outcome: "found",
      detail: safeDetail(),
    })),
    listRuns: vi.fn(async () => ({
      outcome: "listed",
      page: 1,
      pageSize: 25,
      total: 0,
      runs: [],
    })),
    reviewSignal: vi.fn(async () => ({
      outcome: "updated",
      detail: safeDetail(),
    })),
    editClassification: vi.fn(async () => ({
      outcome: "updated",
      detail: safeDetail(),
    })),
    editExpiry: vi.fn(async () => ({
      outcome: "updated",
      detail: safeDetail(),
    })),
    appendEvidence: vi.fn(async () => ({ outcome: "appended", revision: 3 })),
    appendNote: vi.fn(async () => ({ outcome: "appended", revision: 3 })),
    mergeSignals: vi.fn(async () => ({
      outcome: "merged",
      survivor: safeDetail(),
      duplicate: { ...safeDetail(), id: DUPLICATE_SIGNAL_ID },
    })),
    upsertWatchlist: vi.fn(async () => ({
      outcome: "updated",
      entity: safeEntity(),
      entry: safeWatchlistEntry(),
    })),
    queueManual: vi.fn(async () => ({ outcome: "queued", run: safeRun() })),
    promote: vi.fn(async () => ({
      outcome: "promoted",
      promotion: safePromotion(),
    })),
    reversePromotion: vi.fn(async () => ({
      outcome: "reversed",
      promotion: { ...safePromotion(), status: "reversed" },
    })),
    ...overrides,
  };
}

function dependencies(
  service: AdminServiceDouble,
  session: typeof ADMIN_SESSION | null = ADMIN_SESSION,
) {
  return {
    getSession: vi.fn(async () => session),
    getService: () => service,
  };
}

function safeDetail() {
  return {
    id: SIGNAL_ID,
    revision: 2,
    signalClass: "direct_demand",
    status: "qualified",
    allowedActions: ["monitor", "promote"],
    sections: [
      {
        id: "signal_overview",
        heading: "Signal overview",
        data: { title: "Fictional public demand" },
      },
    ],
  };
}

function safeRun() {
  return {
    id: REQUEST_ID,
    trigger: "manual",
    scanMode: "manual",
    status: "queued",
    startedAt: null,
    completedAt: null,
    sourceCountries: ["China"],
    sourceLanguages: ["en", "zh-CN"],
    targetDomains: ["robotics_manufacturing"],
    targetSignalTypes: ["direct_demand"],
    sourcesUsed: ["codex_public_web"],
    counts: {
      resultsExamined: 0,
      entitiesObserved: 0,
      signalsFound: 0,
      directDemands: 0,
      precursors: 0,
      momentumRecords: 0,
      new: 0,
      updated: 0,
      duplicates: 0,
      rejectedForWeakEvidence: 0,
      sourceErrors: 0,
    },
    notices: [],
    createdAt: "2026-07-31T05:00:00.000Z",
    updatedAt: "2026-07-31T05:00:00.000Z",
  };
}

function safeEntity() {
  return {
    id: ENTITY_ID,
    canonicalName: "Fictional Robotics",
    headquartersCountry: "China",
    entityStatus: "watchlisted",
    revision: 3,
  };
}

function safeWatchlistEntry() {
  return {
    id: "00000000-0000-4000-8000-000000000208",
    globalEntityId: ENTITY_ID,
    state: "paused",
    priority: 80,
    theme: "robotics_manufacturing",
    category: "robot components",
    categorySearchTermEn: "robot components",
    categorySearchTermZhCn: null,
    countries: ["United States"],
    languages: ["en"],
    cadenceDays: 7,
    nextScanAt: null,
    reason: "Monitor public demand.",
    revision: 2,
  };
}

function safePromotion() {
  return {
    id: "00000000-0000-4000-8000-000000000209",
    globalEntityId: ENTITY_ID,
    primarySignalId: SIGNAL_ID,
    supportingSignalIds: [SIGNAL_ID],
    eligibilityPath: "qualified_india_direct_demand",
    discoveryRunId: "00000000-0000-4000-8000-000000000210",
    discoveryCandidateId: "00000000-0000-4000-8000-000000000211",
    status: "active",
    promotedAt: "2026-07-31T05:00:00.000Z",
    reversedAt: null,
    revisionContext: {
      expectedEntity: 2,
      expectedPrimarySignal: 1,
      promotedEntity: 3,
      promotedPrimarySignal: 2,
    },
    createdAt: "2026-07-31T05:00:00.000Z",
    updatedAt: "2026-07-31T05:00:00.000Z",
  };
}

function adminRequest(
  path: string,
  body: unknown,
  options: { origin?: string; contentType?: string; headers?: Record<string, string> } = {},
) {
  return new Request(`https://mewtuals.com${path}`, {
    method: "POST",
    headers: {
      Origin: options.origin ?? "https://mewtuals.com",
      "Content-Type": options.contentType ?? "application/json",
      ...options.headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function patchRequest(path: string, body: unknown, headers = {}) {
  const request = adminRequest(path, body, { headers });
  return new Request(request, { method: "PATCH" });
}

function signalContext(signalId = SIGNAL_ID) {
  return { params: Promise.resolve({ signalId }) };
}

function entityContext(entityId = ENTITY_ID) {
  return { params: Promise.resolve({ entityId }) };
}

async function responseBody(response: Response) {
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json();
}

function envelope() {
  return {
    expectedRevision: 2,
    idempotencyKey: IDEMPOTENCY_KEY,
    reason: "Administrator reviewed current public evidence.",
  };
}

function evidence() {
  return {
    globalEntityId: ENTITY_ID,
    sourceUrl: "https://evidence.example/public-request",
    canonicalSourceUrl: "https://evidence.example/public-request",
    sourceName: "Fictional Robotics",
    sourceType: "official_request",
    sourceLanguage: "en",
    sourceCountry: "United States",
    sourceFamily: "official_company_material",
    claim: "A fictional organisation published a current supplier request.",
    sourceExcerpt: "Seeking public supplier applications.",
    englishSummary: "The fictional organisation requests supplier applications.",
    publishedAt: "2026-07-30T00:00:00.000Z",
    observedAt: "2026-07-31T00:00:00.000Z",
    evidenceConfidence: 85,
    translationConfidence: null,
    isPrimarySource: true,
    isSyndicated: false,
    supportsDirectDemand: true,
    supportsIndiaRelevance: false,
    supportedFieldPaths: ["signal.factualSummary"],
    rawMetadata: {},
  };
}

function watchlistCommand() {
  return {
    entity: { type: "existing", entityId: ENTITY_ID, expectedRevision: 3 },
    expectedEntryRevision: 1,
    idempotencyKey: IDEMPOTENCY_KEY,
    reason: "Monitor the entity's public demand.",
    configuration: {
      state: "paused",
      priority: 80,
      theme: "robotics_manufacturing",
      category: "robot components",
      categorySearchTermEn: "robot components",
      categorySearchTermZhCn: null,
      countries: ["United States"],
      languages: ["en"],
      cadenceDays: 7,
      nextScanAt: null,
    },
  };
}

function promotionCommand() {
  return {
    entityId: ENTITY_ID,
    primarySignalId: SIGNAL_ID,
    supportingSignalIds: [],
    eligibilityPath: "qualified_india_direct_demand",
    expectedEntityRevision: 3,
    expectedPrimarySignalRevision: 2,
    expectedSupportingSignalRevisions: [],
    idempotencyKey: IDEMPOTENCY_KEY,
    reason: "Promote current qualified public demand.",
    rationale: "The current direct demand meets the approved policy.",
  };
}

describe("Global Radar administrator HTTP adapters", () => {
  it("wires the exact administrator read and intent-specific mutation routes", () => {
    expect([
      runsGetRoute,
      runsPostRoute,
      signalGetRoute,
      signalPatchRoute,
      evidencePostRoute,
      notePostRoute,
      mergePostRoute,
      watchlistPatchRoute,
      promotionPostRoute,
      promotionReversePostRoute,
    ]).toSatisfy((routes: unknown[]) =>
      routes.every((route) => typeof route === "function"),
    );
  });

  it("enforces same-origin before session lookup or body access on every mutation", async () => {
    const service = adminService();
    const deps = dependencies(service);
    const candidates: Array<() => Promise<Response>> = [
      () => createGlobalRadarAdminRunsPostHandler(deps)(
        adminRequest("/api/admin/global-demand-radar/runs", {}),
      ),
      () => createGlobalRadarAdminSignalPatchHandler(deps)(
        patchRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}`, {}),
        signalContext(),
      ),
      () => createGlobalRadarAdminEvidencePostHandler(deps)(
        adminRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}/evidence`, {}),
        signalContext(),
      ),
      () => createGlobalRadarAdminNotePostHandler(deps)(
        adminRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}/notes`, {}),
        signalContext(),
      ),
      () => createGlobalRadarAdminMergePostHandler(deps)(
        adminRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}/merge`, {}),
        signalContext(),
      ),
      () => createGlobalRadarAdminWatchlistPatchHandler(deps)(
        patchRequest(`/api/admin/global-demand-radar/entities/${ENTITY_ID}/watchlist`, {}),
        entityContext(),
      ),
      () => createGlobalRadarAdminPromotionPostHandler(deps)(
        adminRequest(`/api/admin/global-demand-radar/entities/${ENTITY_ID}/promotions`, {}),
        entityContext(),
      ),
      () => createGlobalRadarAdminPromotionReversePostHandler(deps)(
        adminRequest(`/api/admin/global-demand-radar/entities/${ENTITY_ID}/promotions/reverse`, {}),
        entityContext(),
      ),
    ];

    for (const invoke of candidates) {
      const original = invoke;
      const response = await originalWithHostileOrigin(original);
      expect(response.status).toBe(403);
      await expect(responseBody(response)).resolves.toEqual({
        ok: false,
        error: "Request origin does not match this site.",
      });
    }
    expect(deps.getSession).not.toHaveBeenCalled();
  });

  it("checks the current session before parsing an administrator body", async () => {
    const service = adminService();
    const deps = dependencies(service, null);
    const request = adminRequest("/api/admin/global-demand-radar/runs", {});
    let bodyWasRead = false;
    Object.defineProperty(request, "body", {
      configurable: true,
      get() {
        bodyWasRead = true;
        throw new Error("Signed-out bodies must not be read.");
      },
    });

    const response = await createGlobalRadarAdminRunsPostHandler(deps)(request);

    expect(response.status).toBe(401);
    expect(bodyWasRead).toBe(false);
    expect(service.queueManual).not.toHaveBeenCalled();
  });

  it("requires JSON and enforces the 64 KiB declared and streamed limits", async () => {
    const service = adminService();
    const deps = dependencies(service);
    const handler = createGlobalRadarAdminRunsPostHandler(deps);

    const wrongType = await handler(
      adminRequest("/api/admin/global-demand-radar/runs", "{}", {
        contentType: "text/plain",
      }),
    );
    expect(wrongType.status).toBe(415);

    const declared = await handler(
      adminRequest("/api/admin/global-demand-radar/runs", {}, {
        headers: { "Content-Length": String(64 * 1_024 + 1) },
      }),
    );
    expect(declared.status).toBe(413);

    const streamed = await handler(
      adminRequest(
        "/api/admin/global-demand-radar/runs",
        `{"padding":"${"x".repeat(64 * 1_024)}"}`,
      ),
    );
    expect(streamed.status).toBe(413);
    expect(service.queueManual).not.toHaveBeenCalled();
  });

  it("authenticates run reads before strict query parsing", async () => {
    const service = adminService();
    const signedOut = dependencies(service, null);
    const signedOutResponse = await createGlobalRadarAdminRunsGetHandler(signedOut)(
      new Request("https://mewtuals.com/api/admin/global-demand-radar/runs?unknown=1"),
    );
    expect(signedOutResponse.status).toBe(401);

    const deps = dependencies(service);
    const handler = createGlobalRadarAdminRunsGetHandler(deps);
    for (const query of ["unknown=1", "page=1&page=2", "page=0", "page="]) {
      const response = await handler(
        new Request(`https://mewtuals.com/api/admin/global-demand-radar/runs?${query}`),
      );
      expect(response.status).toBe(400);
    }
    const response = await handler(
      new Request("https://mewtuals.com/api/admin/global-demand-radar/runs?page=2"),
    );
    expect(response.status).toBe(200);
    expect(service.listRuns).toHaveBeenCalledWith(ACTOR, { page: 2 });
  });

  it("queues only a strict manual request with an actor derived from the session", async () => {
    const service = adminService();
    const handler = createGlobalRadarAdminRunsPostHandler(dependencies(service));
    const response = await handler(
      adminRequest("/api/admin/global-demand-radar/runs", {
        requestId: REQUEST_ID,
        theme: "robotics_manufacturing",
      }),
    );
    expect(response.status).toBe(200);
    expect(service.queueManual).toHaveBeenCalledWith(ACTOR, {
      requestId: REQUEST_ID,
      theme: "robotics_manufacturing",
    });

    const injectedActor = await handler(
      adminRequest("/api/admin/global-demand-radar/runs", {
        requestId: REQUEST_ID,
        actor: { email: "attacker@example.com" },
      }),
    );
    expect(injectedActor.status).toBe(400);
    expect(service.queueManual).toHaveBeenCalledTimes(1);
  });

  it("maps administrator authorization, detail, not-found, and private failures safely", async () => {
    const forbidden = adminService({
      getSignalDetail: vi.fn(async () => ({ outcome: "forbidden" })),
    });
    const forbiddenResponse = await createGlobalRadarAdminSignalGetHandler(
      dependencies(forbidden),
    )(
      new Request(`https://mewtuals.com/api/admin/global-demand-radar/signals/${SIGNAL_ID}`),
      signalContext(),
    );
    expect(forbiddenResponse.status).toBe(403);

    const missing = adminService({
      getSignalDetail: vi.fn(async () => ({ outcome: "not_found" })),
    });
    const missingResponse = await createGlobalRadarAdminSignalGetHandler(
      dependencies(missing),
    )(
      new Request(`https://mewtuals.com/api/admin/global-demand-radar/signals/${SIGNAL_ID}`),
      signalContext(),
    );
    expect(missingResponse.status).toBe(404);

    const invalidResponse = await createGlobalRadarAdminSignalGetHandler(
      dependencies(missing),
    )(
      new Request("https://mewtuals.com/api/admin/global-demand-radar/signals/not-a-uuid"),
      signalContext("not-a-uuid"),
    );
    expect(invalidResponse.status).toBe(400);

    const broken = adminService({
      getSignalDetail: vi.fn(async () => {
        throw new Error("private SQL failure and administrator notes");
      }),
    });
    const brokenResponse = await createGlobalRadarAdminSignalGetHandler(
      dependencies(broken),
    )(
      new Request(`https://mewtuals.com/api/admin/global-demand-radar/signals/${SIGNAL_ID}`),
      signalContext(),
    );
    expect(brokenResponse.status).toBe(500);
    expect(JSON.stringify(await responseBody(brokenResponse))).not.toMatch(
      /private|SQL|administrator notes/,
    );
  });

  it("dispatches the discriminated signal PATCH without accepting generic actions", async () => {
    const service = adminService();
    const handler = createGlobalRadarAdminSignalPatchHandler(dependencies(service));
    const commands = [
      {
        body: { ...envelope(), command: { type: "monitor" } },
        operation: service.reviewSignal,
      },
      {
        body: {
          ...envelope(),
          classification: {
            signalClass: "ecosystem_momentum",
            signalType: "platform_launch",
            demandDomain: "synthetic_data_and_evaluation",
            components: { taxonomyConsistency: 80, evidenceQuality: 75 },
          },
        },
        operation: service.editClassification,
      },
      {
        body: {
          ...envelope(),
          expiry: {
            evergreen: false,
            expiresAt: "2026-08-31T00:00:00.000Z",
            reobserveBy: null,
          },
        },
        operation: service.editExpiry,
      },
    ];
    for (const command of commands) {
      const response = await handler(
        patchRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}`, command.body),
        signalContext(),
      );
      expect(response.status).toBe(200);
      expect(command.operation).toHaveBeenCalledWith(ACTOR, SIGNAL_ID, command.body);
    }

    for (const invalid of [
      { ...envelope(), action: "monitor" },
      { ...envelope(), command: { type: "monitor" }, extra: true },
      {
        ...envelope(),
        classification: {
          signalClass: "ecosystem_momentum",
          signalType: "platform_launch",
          demandDomain: "synthetic_data_and_evaluation",
          components: { taxonomyConsistency: 80, evidenceQuality: 75 },
          workerSecret: "private",
        },
      },
    ]) {
      const response = await handler(
        patchRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}`, invalid),
        signalContext(),
      );
      expect(response.status).toBe(400);
    }
  });

  it("validates evidence and note bodies before intent-specific service calls", async () => {
    const service = adminService();
    const deps = dependencies(service);
    const evidenceHandler = createGlobalRadarAdminEvidencePostHandler(deps);
    const noteHandler = createGlobalRadarAdminNotePostHandler(deps);
    const evidenceBody = { ...envelope(), evidence: evidence() };
    const noteBody = { ...envelope(), body: "Review only public evidence." };

    const evidenceResponse = await evidenceHandler(
      adminRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}/evidence`, evidenceBody),
      signalContext(),
    );
    const noteResponse = await noteHandler(
      adminRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}/notes`, noteBody),
      signalContext(),
    );
    expect(evidenceResponse.status).toBe(200);
    expect(noteResponse.status).toBe(200);
    expect(service.appendEvidence).toHaveBeenCalledWith(ACTOR, SIGNAL_ID, evidenceBody);
    expect(service.appendNote).toHaveBeenCalledWith(ACTOR, SIGNAL_ID, noteBody);

    const secretEvidence = await evidenceHandler(
      adminRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}/evidence`, {
        ...evidenceBody,
        evidence: { ...evidence(), workerSecret: "private" },
      }),
      signalContext(),
    );
    expect(secretEvidence.status).toBe(400);
    expect(service.appendEvidence).toHaveBeenCalledTimes(1);
  });

  it("requires the merge route id to be the strict confirmed survivor", async () => {
    const service = adminService();
    const handler = createGlobalRadarAdminMergePostHandler(dependencies(service));
    const body = {
      survivorSignalId: SIGNAL_ID,
      duplicateSignalId: DUPLICATE_SIGNAL_ID,
      expectedSurvivorRevision: 2,
      expectedDuplicateRevision: 1,
      confirmed: true,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "The public identity evidence confirms one signal.",
    };
    const response = await handler(
      adminRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}/merge`, body),
      signalContext(),
    );
    expect(response.status).toBe(200);
    expect(service.mergeSignals).toHaveBeenCalledWith(ACTOR, body);

    const mismatch = await handler(
      adminRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}/merge`, {
        ...body,
        survivorSignalId: DUPLICATE_SIGNAL_ID,
      }),
      signalContext(),
    );
    expect(mismatch.status).toBe(400);
    expect(service.mergeSignals).toHaveBeenCalledTimes(1);
  });

  it("requires the watchlist path identity and a strict bounded configuration", async () => {
    const service = adminService();
    const handler = createGlobalRadarAdminWatchlistPatchHandler(dependencies(service));
    const body = watchlistCommand();
    const response = await handler(
      patchRequest(`/api/admin/global-demand-radar/entities/${ENTITY_ID}/watchlist`, body),
      entityContext(),
    );
    expect(response.status).toBe(200);
    expect(service.upsertWatchlist).toHaveBeenCalledWith(ACTOR, body);

    for (const invalid of [
      {
        ...body,
        entity: { ...body.entity, entityId: REQUEST_ID },
      },
      {
        ...body,
        configuration: { ...body.configuration, workerSecret: "private" },
      },
    ]) {
      const result = await handler(
        patchRequest(`/api/admin/global-demand-radar/entities/${ENTITY_ID}/watchlist`, invalid),
        entityContext(),
      );
      expect(result.status).toBe(400);
    }
    expect(service.upsertWatchlist).toHaveBeenCalledTimes(1);
  });

  it("requires strict promotion and reversal identities without generic action names", async () => {
    const service = adminService();
    const deps = dependencies(service);
    const promote = createGlobalRadarAdminPromotionPostHandler(deps);
    const reverse = createGlobalRadarAdminPromotionReversePostHandler(deps);
    const promotion = promotionCommand();
    const reversal = {
      entityId: ENTITY_ID,
      expectedEntityRevision: 4,
      expectedPrimarySignalRevision: 3,
      idempotencyKey: REQUEST_ID,
      reason: "Reverse the promotion after administrator review.",
    };

    const promoted = await promote(
      adminRequest(`/api/admin/global-demand-radar/entities/${ENTITY_ID}/promotions`, promotion),
      entityContext(),
    );
    const reversed = await reverse(
      adminRequest(
        `/api/admin/global-demand-radar/entities/${ENTITY_ID}/promotions/reverse`,
        reversal,
      ),
      entityContext(),
    );
    expect(promoted.status).toBe(200);
    expect(reversed.status).toBe(200);
    expect(service.promote).toHaveBeenCalledWith(ACTOR, promotion);
    expect(service.reversePromotion).toHaveBeenCalledWith(ACTOR, reversal);

    const mismatch = await promote(
      adminRequest(`/api/admin/global-demand-radar/entities/${ENTITY_ID}/promotions`, {
        ...promotion,
        entityId: REQUEST_ID,
      }),
      entityContext(),
    );
    const generic = await reverse(
      adminRequest(`/api/admin/global-demand-radar/entities/${ENTITY_ID}/promotions/reverse`, {
        ...reversal,
        action: "reverse",
      }),
      entityContext(),
    );
    expect(mismatch.status).toBe(400);
    expect(generic.status).toBe(400);
    expect(service.promote).toHaveBeenCalledTimes(1);
    expect(service.reversePromotion).toHaveBeenCalledTimes(1);
  });

  it("returns HTTP 409 with the latest allowlisted DTO and omits injected private fields", async () => {
    const service = adminService({
      reviewSignal: vi.fn(async () => ({
        outcome: "conflict",
        reason: "revision_mismatch",
        httpStatus: 409,
        latest: safeDetail(),
        privateError: "private SQL failure",
        rawPayload: "private rejected payload",
      })),
    });
    const response = await createGlobalRadarAdminSignalPatchHandler(
      dependencies(service),
    )(
      patchRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}`, {
        ...envelope(),
        command: { type: "monitor" },
      }),
      signalContext(),
    );
    expect(response.status).toBe(409);
    const body = await responseBody(response);
    expect(body).toEqual({
      ok: false,
      outcome: "conflict",
      reason: "revision_mismatch",
      httpStatus: 409,
      latest: safeDetail(),
    });
    expect(JSON.stringify(body)).not.toMatch(/private|SQL|rawPayload/);
  });
});

async function originalWithHostileOrigin(
  invoke: () => Promise<Response>,
): Promise<Response> {
  const originalRequest = globalThis.Request;
  class HostileRequest extends originalRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(input, init);
      this.headers.set("Origin", "https://evil.example");
      Object.defineProperty(this, "body", {
        configurable: true,
        get() {
          throw new Error("Cross-origin request bodies must not be read.");
        },
      });
    }
  }
  globalThis.Request = HostileRequest as typeof Request;
  try {
    return await invoke();
  } finally {
    globalThis.Request = originalRequest;
  }
}
