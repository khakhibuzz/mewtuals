import { describe, expect, it, vi } from "vitest";

import * as snapshotApiRoute from "../app/api/admin/ecosystem-intelligence/route";
import * as candidateApiRoute from "../app/api/admin/ecosystem-intelligence/candidates/[candidateId]/route";

import {
  createEcosystemIntelligenceCandidateGetHandler,
  createEcosystemIntelligenceGetHandler,
} from "../app/server/ecosystem-intelligence-route";

const CANDIDATE_ID = "17ca68ae-8840-4fa2-a5e0-951963f028d5";
const session = {
  session: { id: "session", expiresAt: new Date("2026-08-15T00:00:00.000Z") },
  user: { id: "admin", email: "admin@example.com", name: null },
};

function snapshot() {
  const ratio = { numerator: 0, denominator: 0, percentage: 0 };
  return {
    generatedAt: new Date("2026-07-29T08:30:00.000Z"),
    filters: { participantType: "company" },
    population: { total: 0, fingerprint: "empty" },
    summary: {
      organisations: { count: 0 }, companies: ratio, rolesRepresented: { count: 0 },
      technicalLayersRepresented: { count: 0 }, statesRepresented: { count: 0 },
      citiesRepresented: { count: 0 }, publiclyReachable: ratio,
      activeSignals: { count: 0, organisations: ratio },
      documentedRelationships: { count: 0, organisations: ratio },
    },
    dataQuality: {
      resolvedState: ratio, resolvedCity: ratio, ecosystemRole: ratio, capability: ratio,
      strongEvidence: ratio, publicContact: ratio, organisationsWithActiveSignal: ratio,
      systemsContext: ratio, unknownCounts: {},
    },
    geography: { denominator: 0, states: [], cities: [], unresolvedCount: 0 },
    explorer: { denominator: 0, businessStages: [], technicalLayers: [] },
    matrices: {
      denominator: 0,
      roleByCapability: { rowKeys: [], columnKeys: [], cells: [] },
      stateByRole: { rowKeys: [], columnKeys: [], cells: [] },
    },
    insights: { denominator: 0, items: [] },
    velocity: { kind: "discovery_research_activity", denominator: 0, windows: [] },
    momentum: {
      denominator: 0, ready: false, activeSignalCount: 0, organisationCount: 0,
      requiredSignalCount: 5, requiredOrganisationCount: 3, message: "Not ready.",
      categories: [], companies: [], signals: [],
    },
    relationships: {
      denominator: 0, ready: false, evidencedEdgeCount: 0, candidateCount: 0,
      unresolvedTargetCount: 0, requiredEvidencedEdges: 8, requiredCandidates: 5,
      message: "Not ready.", nodes: [], edges: [],
    },
    ledger: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 },
    filterOptions: {
      denominator: 0, participantTypes: [], reviewStatuses: [], taxonomy: {},
      headquartersStates: [], headquartersCities: [], activeSignalTypes: [],
      publicContacts: [], evidenceCoverageBands: [], evidenceFreshness: [],
    },
  };
}

describe("Ecosystem Intelligence route adapters", () => {
  it("exposes GET-only API modules", () => {
    expect(Object.keys(snapshotApiRoute)).toEqual(["GET"]);
    expect(Object.keys(candidateApiRoute)).toEqual(["GET"]);
  });

  it("returns 401 without calling the service when signed out", async () => {
    const getSnapshot = vi.fn();
    const handler = createEcosystemIntelligenceGetHandler({
      getSession: async () => null,
      getSnapshot,
    });
    const response = await handler(new Request("https://mewtuals.com/api/admin/ecosystem-intelligence"));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getSnapshot).not.toHaveBeenCalled();
  });

  it("passes every query value to the service and serializes safe dates", async () => {
    const getSnapshot = vi.fn(async (actor: unknown, filterInput: unknown) => {
      void actor;
      void filterInput;
      return {
        ok: true as const,
        filters: { participantType: "company" },
        snapshot: snapshot() as never,
      };
    });
    const handler = createEcosystemIntelligenceGetHandler({
      getSession: async () => session,
      getSnapshot,
    });
    const response = await handler(new Request(
      "https://mewtuals.com/api/admin/ecosystem-intelligence?ecosystemRole=oem&ecosystemRole=integrator",
    ));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getSnapshot).toHaveBeenCalledWith(
      { userId: "admin", email: "admin@example.com" },
      expect.any(URLSearchParams),
    );
    const forwarded = vi.mocked(getSnapshot).mock.calls[0]![1] as URLSearchParams;
    expect(forwarded.getAll("ecosystemRole")).toEqual(["oem", "integrator"]);
    expect(body.snapshot.generatedAt).toBe("2026-07-29T08:30:00.000Z");
    expect(JSON.stringify(body)).not.toMatch(/rawMetadata|leaseToken|submissionHash|email|phone/i);
  });

  it.each([400, 403, 500] as const)("preserves safe service failure %s", async (status) => {
    const handler = createEcosystemIntelligenceGetHandler({
      getSession: async () => session,
      getSnapshot: async () => ({ ok: false, status, error: `safe ${status}` }),
    });
    const response = await handler(new Request("https://mewtuals.com/api/admin/ecosystem-intelligence"));
    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ ok: false, error: `safe ${status}` });
  });

  it("maps unexpected adapter failures to a private safe 500", async () => {
    const sessionFailure = createEcosystemIntelligenceGetHandler({
      getSession: async () => {
        throw new Error("session secret leaked");
      },
      getSnapshot: vi.fn(),
    });
    const serviceFailure = createEcosystemIntelligenceGetHandler({
      getSession: async () => session,
      getSnapshot: async () => {
        throw new Error("database url leaked");
      },
    });
    for (const handler of [sessionFailure, serviceFailure]) {
      const response = await handler(new Request("https://mewtuals.com/api/admin/ecosystem-intelligence"));
      expect(response.status).toBe(500);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: "We could not load Ecosystem Intelligence. Please try again.",
      });
    }
  });

  it("serializes candidate detail and maps invalid/missing results", async () => {
    const getCandidateDetail = vi.fn(async (actor: unknown, candidateId: string) => {
      void actor;
      void candidateId;
      return {
        ok: true as const,
        candidate: {
        id: CANDIDATE_ID,
        type: "company",
        name: "Aster Robotics",
        description: "Public description",
        category: "Robotics OEMs and Integrators",
        subcategory: null,
        status: "discovered",
        discoveryScore: 90,
        discoveredAt: new Date("2026-07-01T00:00:00.000Z"),
        updatedAt: new Date("2026-07-29T08:00:00.000Z"),
        publicUrls: { canonical: "https://aster.example/", website: "https://aster.example/", linkedin: null, primarySocial: null },
        classifications: [], headquarters: null, signals: [], relationships: [], sources: [],
        research: {
          current: {
            id: "research", discoveryRunId: "run", summary: "Summary", findings: "Findings",
            sourceUrls: ["https://aster.example/evidence"], analysisVersion: "physical-ai-v1",
            createdAt: new Date("2026-07-28T00:00:00.000Z"),
          },
          history: [],
        },
        } as never,
      };
    });
    const handler = createEcosystemIntelligenceCandidateGetHandler({
      getSession: async () => session,
      getCandidateDetail,
    });
    const response = await handler(
      new Request(`https://mewtuals.com/api/admin/ecosystem-intelligence/candidates/${CANDIDATE_ID}`),
      { params: Promise.resolve({ candidateId: CANDIDATE_ID }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.candidate.discoveredAt).toBe("2026-07-01T00:00:00.000Z");
    expect(body.candidate.research.current.createdAt).toBe("2026-07-28T00:00:00.000Z");
    expect(JSON.stringify(body)).not.toMatch(/rawMetadata|privateToken|email|phone/i);

    for (const status of [400, 404] as const) {
      const failing = createEcosystemIntelligenceCandidateGetHandler({
        getSession: async () => session,
        getCandidateDetail: async () => ({ ok: false, status, error: "Safe failure." }),
      });
      const failed = await failing(
        new Request("https://mewtuals.com/api/admin/ecosystem-intelligence/candidates/bad"),
        { params: Promise.resolve({ candidateId: "bad" }) },
      );
      expect(failed.status).toBe(status);
    }

    const unexpected = createEcosystemIntelligenceCandidateGetHandler({
      getSession: async () => session,
      getCandidateDetail: async () => {
        throw new Error("private detail failure");
      },
    });
    const unexpectedResponse = await unexpected(
      new Request("https://mewtuals.com/api/admin/ecosystem-intelligence/candidates/bad"),
      { params: Promise.resolve({ candidateId: CANDIDATE_ID }) },
    );
    expect(unexpectedResponse.status).toBe(500);
    expect(unexpectedResponse.headers.get("cache-control")).toBe("private, no-store");
  });
});
