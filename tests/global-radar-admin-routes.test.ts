import { describe, expect, it, vi, type Mock } from "vitest";

import {
  createGlobalRadarAdminEvidencePostHandler,
  createGlobalRadarAdminEntityQualificationPatchHandler,
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
import { PATCH as entityQualificationPatchRoute } from "../app/api/admin/global-demand-radar/entities/[entityId]/qualification/route";
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
    qualifyEntity: vi.fn(async () => ({
      outcome: "updated",
      entity: {
        ...safeEntity(),
        entityStatus: "qualified",
        revision: 4,
      },
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
  const observedAt = "2026-07-31T05:00:00.000Z";
  const empty = () => ({ total: 0, truncated: false, items: [] });
  const scoreComponents = {
    demandExplicitness: 90,
    evidenceConfidence: 80,
    freshness: 90,
    actionability: 80,
    indiaFit: 75,
    commercialPotential: 70,
    repeatability: 70,
    responseAccessibility: 85,
    strategicLearning: 80,
    complianceComplexity: 20,
  };
  const workerScorePaths = new Map([
    ["actionability", "scoreComponents.actionability"],
    ["commercialPotential", "scoreComponents.commercialPotential"],
    ["repeatability", "scoreComponents.repeatability"],
    ["strategicLearning", "scoreComponents.strategicLearning"],
    ["complianceComplexity", "scoreComponents.complianceComplexity"],
  ]);
  const serverScorePaths = new Map([
    ["demandExplicitness", "directDemandAsk.supplier_registration"],
    ["evidenceConfidence", "signal.factualSummary"],
    ["freshness", "signal.announcedAt"],
    ["indiaFit", "indiaRelevance.globally_open.manufacturing"],
    ["responseAccessibility", "responsePath"],
  ]);
  const componentEvidence = Object.entries(scoreComponents).map(
    ([component, value]) => ({
      component,
      value,
      basis: workerScorePaths.has(component)
        ? "worker_evidence"
        : "server_derived",
      rationale: "This active score component is linked to public evidence.",
      evidence: [
        {
          id: "00000000-0000-4000-8000-000000000220",
          sourceUrl: "https://fictional.example/suppliers",
          sourceName: "Fictional Robotics",
          matchedFieldPaths: [
            workerScorePaths.get(component) ??
              serverScorePaths.get(component) ??
              "signal.factualSummary",
          ],
        },
      ],
    }),
  );
  return {
    id: SIGNAL_ID,
    revision: 2,
    signalClass: "direct_demand",
    status: "qualified",
    allowedActions: ["monitor", "promote"],
    sections: [
      {
        id: "organisation",
        title: "Organisation",
        data: { primary: null, associated: empty() },
      },
      {
        id: "what_changed",
        title: "What changed",
        data: {
          title: "Fictional public demand",
          observedAt,
          firstSeenAt: observedAt,
          lastSeenAt: observedAt,
        },
      },
      {
        id: "signal_class",
        title: "Signal class",
        data: {
          signalClass: "direct_demand",
          signalType: "supplier_request",
          theme: "robotics_manufacturing",
          demandDomain: "robotics_hardware_and_ecosystem_demand",
          sourceCountry: "China",
          industry: "robotics",
          status: "qualified",
        },
      },
      {
        id: "publicly_supported_facts",
        title: "Publicly supported facts",
        data: {
          factualSummary: "A fictional organisation published a request.",
          targetGeographies: ["Global"],
          collectionGeographies: null,
          manufacturingGeographies: ["India"],
          deliveryGeographies: ["China"],
          targetModelOrSystem: "industrial robot",
        },
      },
      {
        id: "mewtuals_interpretation",
        title: "Mewtuals interpretation",
        data: { summary: "The public request may support a partnership." },
      },
      {
        id: "required_capabilities",
        title: "Required capabilities",
        data: {
          targetCapabilityTags: ["contract_manufacturing"],
          requiredCounterpartyArchetypes: ["manufacturer"],
          requirements: empty(),
        },
      },
      {
        id: "physical_data_or_hardware_specifications",
        title: "Physical-data or hardware specifications",
        data: { items: [] },
      },
      {
        id: "target_environments_and_tasks",
        title: "Target environments and tasks",
        data: { items: [] },
      },
      {
        id: "indian_execution_archetypes",
        title: "Indian execution archetypes",
        data: { items: ["robotics_hardware_manufacturing"] },
      },
      {
        id: "india_fit_reasoning_and_constraints",
        title: "India-fit reasoning and constraints",
        data: {
          relevanceType: "globally_open",
          rationale: "The fictional request is globally open.",
          reasons: ["Public supplier route"],
          constraints: ["Qualification required"],
          unknowns: ["Volume"],
          confidence: 75,
          regulatoryFacts: {
            known: false,
            industrialSecrets: "possible",
          },
          logisticsFacts: { leadTimeKnown: false },
        },
      },
      {
        id: "systems_context_explanation",
        title: "Systems-context explanation",
        data: {
          summary: "Components support an industrial robot.",
          stackType: "robotics_hardware",
          higherLevelSystemGoal: "Reliable manipulation",
          relevantStackLayer: "hardware",
          lowerLevelInputsRequired: ["components"],
          transformationOrCapabilityAdded: "Assembly",
          downstreamModelOrRobotBehavior: "Reliable motion",
          whyTheRequirementMatters: "It enables deployment.",
          possibleIndianExecutionRole: "Contract manufacturing",
          factualElements: ["Public request"],
          inferredElements: ["Possible Indian execution"],
        },
      },
      {
        id: "scale_and_timeline",
        title: "Scale and timeline",
        data: {
          timeline: {
            announcedAt: observedAt,
            effectiveFrom: observedAt,
            expiresAt: null,
            evergreen: true,
            reobserveBy: "2026-08-31T05:00:00.000Z",
            observedAt,
          },
          requirements: [],
        },
      },
      {
        id: "public_response_path",
        title: "Public response path",
        data: {
          evidenceOnly: true,
          type: "supplier_or_partner_registration",
          url: "https://fictional.example/suppliers",
          businessEmail: null,
          partnerApplicationUrl: "https://fictional.example/suppliers",
        },
      },
      {
        id: "compliance_flags",
        title: "Compliance flags",
        data: {
          sensitiveDataFlags: {
            faces: null,
            voices: null,
            biometrics: null,
            gaze: null,
            health: null,
            children: null,
            homeInteriors: null,
            workplaceMonitoring: null,
            preciseLocation: null,
            roadUsers: null,
            employeeData: null,
            industrialSecrets: "possible",
            defenceOrDualUse: null,
            copyrightedMaterial: null,
            exportControls: null,
          },
          facts: {
            consent: null,
            deIdentification: null,
            legalReview: true,
            knownResidencyRequirements: null,
            participantRightsComplexity: null,
          },
        },
      },
      {
        id: "supporting_evidence",
        title: "Supporting evidence",
        data: empty(),
      },
      {
        id: "original_language_source",
        title: "Original-language source",
        data: empty(),
      },
      {
        id: "english_summary",
        title: "English summary",
        data: empty(),
      },
      {
        id: "score_rationale",
        title: "Score rationale",
        data: {
          activeClass: "direct_demand",
          score: 82,
          coverage: 100,
          policyVersion: "global-radar-score-v1",
          evidenceVersion: "global-radar-score-evidence-v1",
          components: scoreComponents,
          componentEvidence,
        },
      },
      {
        id: "signal_history",
        title: "Signal history",
        data: empty(),
      },
      {
        id: "admin_notes_and_actions",
        title: "Admin notes and actions",
        data: {
          notes: empty(),
          watchlist: null,
          promotion: null,
          allowedActions: ["monitor", "promote"],
        },
      },
    ],
  };
}

function detailWithSectionData(
  sectionId: string,
  data: Record<string, unknown>,
) {
  const detail = safeDetail();
  return {
    ...detail,
    sections: detail.sections.map((section) =>
      section.id === sectionId
        ? { ...section, data: { ...section.data, ...data } }
        : section,
    ),
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
      entityQualificationPatchRoute,
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
      () => createGlobalRadarAdminEntityQualificationPatchHandler(deps)(
        patchRequest(`/api/admin/global-demand-radar/entities/${ENTITY_ID}/qualification`, {}),
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
            signalType: "ecosystem_direction",
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
        },
      },
      {
        ...envelope(),
        classification: {
          signalClass: "ecosystem_momentum",
          signalType: "ecosystem_direction",
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

  it("requires an exact revisioned entity qualification at the path identity", async () => {
    const service = adminService();
    const handler =
      createGlobalRadarAdminEntityQualificationPatchHandler(
        dependencies(service),
      );
    const body = {
      entityId: ENTITY_ID,
      expectedRevision: 3,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Public evidence supports exceptional strategic relevance.",
    };
    const response = await handler(
      patchRequest(
        `/api/admin/global-demand-radar/entities/${ENTITY_ID}/qualification`,
        body,
      ),
      entityContext(),
    );

    expect(response.status).toBe(200);
    await expect(responseBody(response)).resolves.toEqual({
      ok: true,
      outcome: "updated",
      entity: {
        ...safeEntity(),
        entityStatus: "qualified",
        revision: 4,
      },
    });
    expect(service.qualifyEntity).toHaveBeenCalledWith(ACTOR, ENTITY_ID, body);

    for (const invalid of [
      { ...body, entityId: REQUEST_ID },
      { ...body, expectedRevision: -1 },
      { ...body, command: "qualify" },
    ]) {
      const result = await handler(
        patchRequest(
          `/api/admin/global-demand-radar/entities/${ENTITY_ID}/qualification`,
          invalid,
        ),
        entityContext(),
      );
      expect(result.status).toBe(400);
    }
    expect(service.qualifyEntity).toHaveBeenCalledTimes(1);

    const conflictService = adminService({
      qualifyEntity: vi.fn(async () => ({
        outcome: "conflict",
        reason: "revision_mismatch",
        httpStatus: 409,
        entity: {
          ...safeEntity(),
          entityStatus: "qualified",
          revision: 4,
          workerSecret: "private",
        },
      })),
    });
    const conflictResponse =
      await createGlobalRadarAdminEntityQualificationPatchHandler(
        dependencies(conflictService),
      )(
        patchRequest(
          `/api/admin/global-demand-radar/entities/${ENTITY_ID}/qualification`,
          body,
        ),
        entityContext(),
      );
    expect(conflictResponse.status).toBe(409);
    await expect(responseBody(conflictResponse)).resolves.toEqual({
      ok: false,
      outcome: "conflict",
      reason: "revision_mismatch",
      httpStatus: 409,
      entity: {
        ...safeEntity(),
        entityStatus: "qualified",
        revision: 4,
      },
    });
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

  it("recursively allowlists every nested administrator response DTO", async () => {
    const hostileDetail = {
      ...safeDetail(),
      workerSecret: "private-worker-secret",
      sections: safeDetail().sections.map((section) => {
        const data = {
          ...section.data,
          rawPayload: "private rejected body",
          privateFailure: { sql: "private SQL statement" },
        };
        if (section.id === "compliance_flags") {
          return {
            ...section,
            data: {
              ...data,
              sensitiveDataFlags: {
                faces: null,
                voices: null,
                biometrics: null,
                gaze: null,
                health: null,
                children: null,
                homeInteriors: null,
                workplaceMonitoring: null,
                preciseLocation: null,
                roadUsers: null,
                employeeData: null,
                industrialSecrets: "possible",
                defenceOrDualUse: null,
                copyrightedMaterial: null,
                exportControls: null,
                internalDiagnostics: "private diagnostic",
              },
              facts: {
                consent: null,
                deIdentification: null,
                legalReview: true,
                knownResidencyRequirements: null,
                participantRightsComplexity: null,
                internalDiagnostics: "private diagnostic",
              },
            },
          };
        }
        if (section.id === "score_rationale") {
          return {
            ...section,
            data: {
              ...data,
              components: {
                demandExplicitness: 90,
                evidenceConfidence: 80,
                freshness: 90,
                actionability: 80,
                indiaFit: 75,
                commercialPotential: 70,
                repeatability: 70,
                responseAccessibility: 85,
                strategicLearning: 80,
                complianceComplexity: 20,
                internalWeights: { debug: "private scoring" },
              },
            },
          };
        }
        if (section.id === "india_fit_reasoning_and_constraints") {
          return {
            ...section,
            data: {
              ...data,
              regulatoryFacts: {
                known: false,
                industrialSecrets: "possible",
                workerSecrets: ["private-worker"],
                rawPayloads: ["private-raw"],
                apiKeys: ["private-key"],
                workerSecretValue: "private-worker-value",
                leaseTokenValue: "private-lease-value",
                submissionHashHex: "private-hash-value",
                rawPayloadData: "private-payload-value",
                privateExceptionMessage: "private-exception-value",
              },
            },
          };
        }
        return { ...section, data };
      }),
    };
    const hostileRun = {
      ...safeRun(),
      workerSecret: "private-worker-secret",
      counts: { ...safeRun().counts, rawPayload: "private run payload" },
    };
    const hostileEntity = {
      ...safeEntity(),
      rawPayload: "private entity payload",
    };
    const hostileEntry = {
      ...safeWatchlistEntry(),
      workerSecret: "private entry secret",
    };
    const hostilePromotion = {
      ...safePromotion(),
      rawPayload: "private promotion payload",
      revisionContext: {
        ...safePromotion().revisionContext,
        errorBody: "private promotion error body",
      },
    };
    const service = adminService({
      getSignalDetail: vi.fn(async () => ({
        outcome: "found",
        detail: hostileDetail,
      })),
      reviewSignal: vi.fn(async () => ({
        outcome: "conflict",
        reason: "revision_mismatch",
        httpStatus: 409,
        latest: hostileDetail,
      })),
      mergeSignals: vi.fn(async () => ({
        outcome: "merged",
        survivor: hostileDetail,
        duplicate: { ...hostileDetail, id: DUPLICATE_SIGNAL_ID },
      })),
      upsertWatchlist: vi.fn(async () => ({
        outcome: "updated",
        entity: hostileEntity,
        entry: hostileEntry,
      })),
      queueManual: vi.fn(async () => ({
        outcome: "queued",
        run: hostileRun,
      })),
      listRuns: vi.fn(async () => ({
        outcome: "listed",
        page: 1,
        pageSize: 25,
        total: 1,
        runs: [hostileRun],
      })),
      promote: vi.fn(async () => ({
        outcome: "promoted",
        promotion: hostilePromotion,
      })),
    });
    const deps = dependencies(service);
    const responses = await Promise.all([
      createGlobalRadarAdminSignalGetHandler(deps)(
        new Request(
          `https://mewtuals.com/api/admin/global-demand-radar/signals/${SIGNAL_ID}`,
        ),
        signalContext(),
      ),
      createGlobalRadarAdminSignalPatchHandler(deps)(
        patchRequest(`/api/admin/global-demand-radar/signals/${SIGNAL_ID}`, {
          ...envelope(),
          command: { type: "monitor" },
        }),
        signalContext(),
      ),
      createGlobalRadarAdminMergePostHandler(deps)(
        adminRequest(
          `/api/admin/global-demand-radar/signals/${SIGNAL_ID}/merge`,
          {
            survivorSignalId: SIGNAL_ID,
            duplicateSignalId: DUPLICATE_SIGNAL_ID,
            expectedSurvivorRevision: 2,
            expectedDuplicateRevision: 1,
            confirmed: true,
            idempotencyKey: IDEMPOTENCY_KEY,
            reason: "Merge duplicate public evidence.",
          },
        ),
        signalContext(),
      ),
      createGlobalRadarAdminWatchlistPatchHandler(deps)(
        patchRequest(
          `/api/admin/global-demand-radar/entities/${ENTITY_ID}/watchlist`,
          watchlistCommand(),
        ),
        entityContext(),
      ),
      createGlobalRadarAdminRunsPostHandler(deps)(
        adminRequest("/api/admin/global-demand-radar/runs", {
          requestId: REQUEST_ID,
        }),
      ),
      createGlobalRadarAdminRunsGetHandler(deps)(
        new Request("https://mewtuals.com/api/admin/global-demand-radar/runs"),
      ),
      createGlobalRadarAdminPromotionPostHandler(deps)(
        adminRequest(
          `/api/admin/global-demand-radar/entities/${ENTITY_ID}/promotions`,
          promotionCommand(),
        ),
        entityContext(),
      ),
    ]);

    const bodies = await Promise.all(responses.map(responseBody));
    expect(bodies[0]).toEqual({
      ok: true,
      outcome: "found",
      detail: safeDetail(),
    });
    expect(bodies[1]).toEqual({
      ok: false,
      outcome: "conflict",
      reason: "revision_mismatch",
      httpStatus: 409,
      latest: safeDetail(),
    });
    expect(bodies[2]).toEqual({
      ok: true,
      outcome: "merged",
      survivor: safeDetail(),
      duplicate: { ...safeDetail(), id: DUPLICATE_SIGNAL_ID },
    });
    expect(bodies[3]).toEqual({
      ok: true,
      outcome: "updated",
      entity: safeEntity(),
      entry: safeWatchlistEntry(),
    });
    expect(bodies[4]).toEqual({
      ok: true,
      outcome: "queued",
      run: safeRun(),
    });
    expect(bodies[5]).toEqual({
      ok: true,
      outcome: "listed",
      page: 1,
      pageSize: 25,
      total: 1,
      runs: [safeRun()],
    });
    expect(bodies[6]).toEqual({
      ok: true,
      outcome: "promoted",
      promotion: safePromotion(),
    });
    expect(JSON.stringify(bodies)).not.toMatch(
      /private|workerSecret|rawPayload|apiKeys|errorBody|SQL/,
    );
  });

  it("rejects administrator details with actions outside the locked vocabulary", async () => {
    const detail = safeDetail();
    const service = adminService({
      getSignalDetail: vi.fn(async () => ({
        outcome: "found",
        detail: {
          ...detail,
          allowedActions: [
            ...detail.allowedActions,
            "download_private_payload",
          ],
        },
      })),
    });
    const response = await createGlobalRadarAdminSignalGetHandler(
      dependencies(service),
    )(
      new Request(
        `https://mewtuals.com/api/admin/global-demand-radar/signals/${SIGNAL_ID}`,
      ),
      signalContext(),
    );

    expect(response.status).toBe(500);
    await expect(responseBody(response)).resolves.toEqual({
      ok: false,
      error: "We could not complete that request. Please try again.",
    });
  });

  it("returns a generic 500 for malformed nested service output", async () => {
    const service = adminService({
      getSignalDetail: vi.fn(async () => ({
        outcome: "found",
        detail: { ...safeDetail(), sections: "private malformed detail" },
      })),
    });
    const response = await createGlobalRadarAdminSignalGetHandler(
      dependencies(service),
    )(
      new Request(
        `https://mewtuals.com/api/admin/global-demand-radar/signals/${SIGNAL_ID}`,
      ),
      signalContext(),
    );

    expect(response.status).toBe(500);
    await expect(responseBody(response)).resolves.toEqual({
      ok: false,
      error: "We could not complete that request. Please try again.",
    });
  });

  it("returns a generic 500 for invalid nested object and vocabulary values", async () => {
    const scoreDetail = safeDetail();
    const scoreSection = scoreDetail.sections.find(
      ({ id }) => id === "score_rationale",
    )!;
    const scoreData = scoreSection.data as unknown as {
      componentEvidence: Array<Record<string, unknown>>;
    };
    for (const detail of [
      detailWithSectionData("india_fit_reasoning_and_constraints", {
        regulatoryFacts: "private malformed facts",
      }),
      detailWithSectionData("public_response_path", {
        type: "private_internal_path",
      }),
      detailWithSectionData("score_rationale", {
        componentEvidence: scoreData.componentEvidence.map((association, index) =>
          index === 0 ? { ...association, evidence: [] } : association,
        ),
      }),
    ]) {
      const service = adminService({
        getSignalDetail: vi.fn(async () => ({ outcome: "found", detail })),
      });
      const response = await createGlobalRadarAdminSignalGetHandler(
        dependencies(service),
      )(
        new Request(
          `https://mewtuals.com/api/admin/global-demand-radar/signals/${SIGNAL_ID}`,
        ),
        signalContext(),
      );

      expect(response.status).toBe(500);
      await expect(responseBody(response)).resolves.toEqual({
        ok: false,
        error: "We could not complete that request. Please try again.",
      });
    }
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
