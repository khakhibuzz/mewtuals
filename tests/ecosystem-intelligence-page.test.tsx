import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EcosystemIntelligenceAdminPage from "../app/admin/ecosystem-intelligence/page";
import { loadAdminPageContext } from "../app/server/admin-page-context";
import { getEcosystemIntelligenceService } from "../app/server/ecosystem-intelligence";

const { redirectMock, serializeMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  serializeMock: vi.fn(() => ({
    generatedAt: "2026-07-29T08:30:00.000Z",
    filters: {
      participantType: "company", includeEnablers: false, analysisVersion: "physical-ai-v1",
      ecosystemDomains: [], organisationSubtypes: [], ecosystemRoles: [], businessStages: [],
      technicalLayers: [], capabilities: [], componentCategories: [], roboticsVerticals: [],
      headquartersStates: [], headquartersCities: [], activeSignalTypes: [],
      reviewStatuses: ["discovered", "shortlisted", "queued_for_profile"],
      page: 1, pageSize: 25, sort: "discovered_at", direction: "desc",
    },
    population: { total: 3, fingerprint: "fixture" },
    summary: {
      organisations: { count: 3 }, companies: { numerator: 3, denominator: 3, percentage: 100 },
      rolesRepresented: { count: 2 }, technicalLayersRepresented: { count: 2 },
      statesRepresented: { count: 2 }, citiesRepresented: { count: 2 },
      publiclyReachable: { numerator: 2, denominator: 3, percentage: 67 },
      activeSignals: { count: 0, organisations: { numerator: 0, denominator: 3, percentage: 0 } },
      documentedRelationships: { count: 0, organisations: { numerator: 0, denominator: 3, percentage: 0 } },
    },
    dataQuality: Object.fromEntries([
      "resolvedState", "resolvedCity", "ecosystemRole", "capability", "strongEvidence",
      "publicContact", "organisationsWithActiveSignal", "systemsContext",
    ].map((key) => [key, { numerator: 2, denominator: 3, percentage: 67 }])),
    geography: { denominator: 3, states: [], cities: [], unresolvedCount: 3 },
    explorer: { denominator: 3, businessStages: [], technicalLayers: [] },
    matrices: {
      denominator: 3,
      roleByCapability: { rowKeys: [], columnKeys: [], cells: [] },
      stateByRole: { rowKeys: [], columnKeys: [], cells: [] },
    },
    insights: { denominator: 3, items: [] },
    velocity: { kind: "discovery_research_activity", denominator: 3, windows: [] },
    momentum: {
      denominator: 3, ready: false, activeSignalCount: 0, organisationCount: 0,
      requiredSignalCount: 5, requiredOrganisationCount: 3,
      message: "Not enough evidence-backed signals to establish ecosystem momentum yet.",
      categories: [], companies: [], signals: [],
    },
    relationships: {
      denominator: 3, ready: false, evidencedEdgeCount: 0, candidateCount: 0,
      unresolvedTargetCount: 0, requiredEvidencedEdges: 8, requiredCandidates: 5,
      message: "More verified relationships are needed.", nodes: [], edges: [],
    },
    ledger: { items: [], total: 0, page: 1, pageSize: 25, totalPages: 0 },
    filterOptions: {
      denominator: 3, participantTypes: [], reviewStatuses: [], taxonomy: {},
      headquartersStates: [], headquartersCities: [], activeSignalTypes: [], publicContacts: [],
      evidenceCoverageBands: [], evidenceFreshness: [],
    },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("../app/server/admin-page-context", () => ({ loadAdminPageContext: vi.fn() }));
vi.mock("../app/server/ecosystem-intelligence", () => ({
  getEcosystemIntelligenceService: vi.fn(),
}));
vi.mock("../app/server/ecosystem-intelligence-route", () => ({
  serializeEcosystemSnapshot: serializeMock,
}));

const session = {
  session: { id: "session", expiresAt: new Date("2026-08-15T00:00:00.000Z") },
  user: { id: "admin", email: "admin@example.com", name: null },
};
const database = { requestOwned: "ecosystem" } as never;
const filters = {
  participantType: "company",
  includeEnablers: false,
  analysisVersion: "physical-ai-v1",
  ecosystemDomains: [], organisationSubtypes: [], ecosystemRoles: [], businessStages: [],
  technicalLayers: [], capabilities: [], componentCategories: [], roboticsVerticals: [],
  headquartersStates: [], headquartersCities: [], activeSignalTypes: [],
  reviewStatuses: ["discovered", "shortlisted", "queued_for_profile"],
  page: 1, pageSize: 25, sort: "discovered_at", direction: "desc",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAdminPageContext).mockResolvedValue({ database, session });
});

describe("Ecosystem Intelligence administrator page", () => {
  it("redirects signed-out visitors to login", async () => {
    vi.mocked(loadAdminPageContext).mockResolvedValue({ database, session: null });
    await expect(EcosystemIntelligenceAdminPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("redirect:/network/join");
  });

  it("redirects signed-in non-administrators to the member dashboard", async () => {
    vi.mocked(getEcosystemIntelligenceService).mockReturnValue({
      isAdministrator: vi.fn(() => false),
      getSnapshot: vi.fn(async () => ({ ok: false, status: 403, error: "No." })),
    } as never);

    await expect(EcosystemIntelligenceAdminPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("redirect:/dashboard");
  });

  it("redirects invalid and noncanonical filters to the canonical workspace URL", async () => {
    const getSnapshot = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, error: "Invalid." })
      .mockResolvedValueOnce({ ok: true, filters, snapshot: { private: true } });
    vi.mocked(getEcosystemIntelligenceService).mockReturnValue({
      isAdministrator: vi.fn(() => true),
      getSnapshot,
    } as never);

    await expect(EcosystemIntelligenceAdminPage({
      searchParams: Promise.resolve({ participantType: "person" }),
    })).rejects.toThrow("redirect:/admin/ecosystem-intelligence");
    await expect(EcosystemIntelligenceAdminPage({
      searchParams: Promise.resolve({ page: "1" }),
    })).rejects.toThrow("redirect:/admin/ecosystem-intelligence");
  });

  it("renders a retryable safe error inside the wide admin shell", async () => {
    vi.mocked(getEcosystemIntelligenceService).mockReturnValue({
      isAdministrator: vi.fn(() => true),
      getSnapshot: vi.fn(async () => ({ ok: false, status: 500, error: "Safe." })),
    } as never);

    render(await EcosystemIntelligenceAdminPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("alert")).toHaveTextContent("could not load Ecosystem Intelligence");
    expect(screen.getByRole("link", { name: "Retry" })).toHaveAttribute(
      "href",
      "/admin/ecosystem-intelligence",
    );
    expect(screen.getByRole("link", { name: "India Discovery" })).toHaveAttribute(
      "href",
      "/admin/discovery",
    );
    expect(
      screen.getByRole("link", {
        name: "Ecosystem Intelligence",
        current: "page",
      }),
    ).toHaveAttribute("href", "/admin/ecosystem-intelligence");
  });

  it("preserves canonical filters in the retry URL", async () => {
    vi.mocked(getEcosystemIntelligenceService).mockReturnValue({
      isAdministrator: vi.fn(() => true),
      getSnapshot: vi.fn(async () => ({ ok: false, status: 500, error: "Safe." })),
    } as never);

    render(await EcosystemIntelligenceAdminPage({
      searchParams: Promise.resolve({ participantType: "creator" }),
    }));
    expect(screen.getByRole("link", { name: "Retry" })).toHaveAttribute(
      "href",
      "/admin/ecosystem-intelligence?participantType=creator",
    );
  });

  it("server-renders the first safe snapshot and canonical query", async () => {
    vi.mocked(getEcosystemIntelligenceService).mockReturnValue({
      isAdministrator: vi.fn(() => true),
      getSnapshot: vi.fn(async () => ({ ok: true, filters, snapshot: { private: true } })),
    } as never);

    render(await EcosystemIntelligenceAdminPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Ecosystem intelligence." })).toBeInTheDocument();
    expect(screen.getByText("3 organisations mapped")).toBeInTheDocument();
    expect(screen.getByTestId("ecosystem-initial-snapshot")).toHaveAttribute(
      "data-canonical-query",
      "",
    );
    expect(screen.getByTestId("ecosystem-initial-snapshot")).toHaveAttribute(
      "data-generated-at",
      "2026-07-29T08:30:00.000Z",
    );
    expect(serializeMock).toHaveBeenCalledWith({ private: true });
    expect(loadAdminPageContext).toHaveBeenCalledOnce();
    expect(getEcosystemIntelligenceService).toHaveBeenCalledWith(database);
  });
});
