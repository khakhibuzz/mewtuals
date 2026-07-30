import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EcosystemIntelligenceWorkspace } from "../app/components/product/ecosystem-intelligence/EcosystemIntelligenceWorkspace";
import { ECOSYSTEM_TAXONOMY } from "../app/domain/ecosystem-intelligence-taxonomy";
import type {
  EcosystemCandidateDetailDto,
  EvidenceCoverageDto,
  EcosystemFiltersDto,
  EcosystemSnapshotDto,
} from "../app/components/product/ecosystem-intelligence/types";

let navigationQuery = "";
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  useSearchParams: () => new URLSearchParams(navigationQuery),
}));

const defaultFilters: EcosystemFiltersDto = {
  participantType: "company",
  includeEnablers: false,
  analysisVersion: "physical-ai-v1",
  ecosystemDomains: [],
  organisationSubtypes: [],
  ecosystemRoles: [],
  businessStages: [],
  technicalLayers: [],
  capabilities: [],
  componentCategories: [],
  roboticsVerticals: [],
  headquartersStates: [],
  headquartersCities: [],
  activeSignalTypes: [],
  reviewStatuses: ["discovered", "shortlisted", "queued_for_profile"],
  page: 1,
  pageSize: 25,
  sort: "discovered_at",
  direction: "desc",
};

function ratio(numerator: number, denominator = 3) {
  return {
    numerator,
    denominator,
    percentage: denominator === 0 ? 0 : Math.round((numerator / denominator) * 100),
  };
}

function snapshot(
  total = 3,
  filters: EcosystemFiltersDto = defaultFilters,
): EcosystemSnapshotDto {
  const qualityRatio = ratio(Math.min(total, 2), total);
  return {
    generatedAt: "2026-07-29T08:30:00.000Z",
    filters,
    population: { total, fingerprint: `fixture-${total}` },
    summary: {
      organisations: { count: total },
      companies: ratio(total, total),
      rolesRepresented: { count: total === 0 ? 0 : 2 },
      technicalLayersRepresented: { count: total === 0 ? 0 : 2 },
      statesRepresented: { count: total === 0 ? 0 : 2 },
      citiesRepresented: { count: total === 0 ? 0 : 2 },
      publiclyReachable: qualityRatio,
      activeSignals: { count: total === 0 ? 0 : 2, organisations: qualityRatio },
      documentedRelationships: { count: 0, organisations: ratio(0, total) },
    },
    dataQuality: {
      resolvedState: qualityRatio,
      resolvedCity: qualityRatio,
      ecosystemRole: qualityRatio,
      capability: qualityRatio,
      strongEvidence: qualityRatio,
      publicContact: qualityRatio,
      organisationsWithActiveSignal: qualityRatio,
      systemsContext: qualityRatio,
      unknownCounts: {},
    },
    geography: { denominator: total, states: [], cities: [], unresolvedCount: total },
    explorer: { denominator: total, businessStages: [], technicalLayers: [] },
    matrices: {
      denominator: total,
      roleByCapability: { rowKeys: [], columnKeys: [], cells: [] },
      stateByRole: { rowKeys: [], columnKeys: [], cells: [] },
    },
    insights: { denominator: total, items: [] },
    velocity: {
      kind: "discovery_research_activity",
      denominator: total,
      windows: [],
    },
    momentum: {
      denominator: total,
      ready: false,
      activeSignalCount: 0,
      organisationCount: 0,
      requiredSignalCount: 5,
      requiredOrganisationCount: 3,
      message: "Not enough evidence-backed signals to establish ecosystem momentum yet.",
      categories: [],
      companies: [],
      signals: [],
    },
    relationships: {
      denominator: total,
      ready: false,
      evidencedEdgeCount: 0,
      candidateCount: 0,
      unresolvedTargetCount: 0,
      requiredEvidencedEdges: 8,
      requiredCandidates: 5,
      message: "More verified relationships are needed.",
      nodes: [],
      edges: [],
    },
    ledger: { items: [], total, page: 1, pageSize: 25, totalPages: total ? 1 : 0 },
    filterOptions: {
      denominator: total,
      participantTypes: [
        { key: "company", label: "Companies", count: total },
        { key: "creator", label: "Creators and media", count: 1 },
      ],
      reviewStatuses: [],
      taxonomy: {
        ecosystem_role: [
          { key: "component_supplier", label: "Component supplier", count: 2 },
          { key: "manufacturer", label: "Manufacturer", count: 1 },
        ],
        technical_layer: [
          { key: "mechanical_and_actuation", label: "Mechanical and actuation", count: 1 },
        ],
      },
      headquartersStates: [],
      headquartersCities: [],
      activeSignalTypes: [],
      publicContacts: [],
      evidenceCoverageBands: [],
      evidenceFreshness: [],
    },
  };
}

function successfulResponse(value: EcosystemSnapshotDto): Response {
  return new Response(JSON.stringify({ ok: true, snapshot: value }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  navigationQuery = "";
  pushMock.mockReset();
  vi.stubGlobal("fetch", vi.fn());
  if (!("showModal" in HTMLDialogElement.prototype)) {
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
      configurable: true,
      value() { this.setAttribute("open", ""); },
    });
  }
  if (!("close" in HTMLDialogElement.prototype)) {
    Object.defineProperty(HTMLDialogElement.prototype, "close", {
      configurable: true,
      value() { this.removeAttribute("open"); },
    });
  }
});

describe("Ecosystem Intelligence workspace", () => {
  it("renders the first server snapshot without refetching and explains metric denominators", () => {
    render(<EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />);

    expect(screen.getByText("3 organisations mapped")).toBeInTheDocument();
    expect(screen.getByText("100% companies")).toBeInTheDocument();
    expect(screen.getByText("3 of 3 filtered organisations are companies.")).toBeInTheDocument();
    expect(screen.getByText("2 cities represented")).toBeInTheDocument();
    expect(screen.getByText("2 cities across 3 filtered organisations.")).toBeInTheDocument();
    expect(screen.getByText("2 active public signals")).toBeInTheDocument();
    expect(screen.getByText("2 signals across 2 of 3 filtered organisations.")).toBeInTheDocument();
    expect(screen.getByText("0 documented relationships")).toBeInTheDocument();
    expect(screen.getByText("0 relationships across 0 of 3 filtered organisations.")).toBeInTheDocument();
    expect(screen.getByText("67% publicly reachable")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 filtered organisations have a public website or LinkedIn URL.").className)
      .toContain("srOnly");
    expect(screen.getByText("Resolved state").closest("li")).toHaveTextContent("67%");
    const metricCards = screen.getAllByTestId("coverage-metric");
    expect(metricCards).toHaveLength(9);
    expect(metricCards.every((card) => card.querySelector("summary"))).toBe(true);
    expect(metricCards.every((card) => card.querySelector("[data-metric-context]")))
      .toBe(true);
    expect(metricCards.every((card) => !card.hasAttribute("title"))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("pushes canonical user filters with page reset", async () => {
    const user = userEvent.setup();
    const filters = { ...defaultFilters, page: 3 };
    navigationQuery = "page=3";
    render(
      <EcosystemIntelligenceWorkspace
        initialSnapshot={snapshot(3, filters)}
        canonicalQuery="page=3"
      />,
    );

    await user.click(screen.getByRole("radio", { name: "Creators and media" }));

    expect(pushMock).toHaveBeenCalledWith(
      "/admin/ecosystem-intelligence?participantType=creator",
    );
  });

  it("preserves repeated filters, removes one chip, and resets to defaults", async () => {
    const user = userEvent.setup();
    navigationQuery = "ecosystemRole=component_supplier&ecosystemRole=manufacturer";
    const filters = {
      ...defaultFilters,
      ecosystemRoles: ["component_supplier", "manufacturer"],
    } satisfies EcosystemFiltersDto;
    render(
      <EcosystemIntelligenceWorkspace
        initialSnapshot={snapshot(3, filters)}
        canonicalQuery={navigationQuery}
      />,
    );

    expect(screen.getByRole("button", { name: "Remove Component supplier" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Manufacturer" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Manufacturer" }));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/admin/ecosystem-intelligence?ecosystemRole=component_supplier",
    );

    await user.click(screen.getByRole("button", { name: "Reset view" }));
    expect(pushMock).toHaveBeenLastCalledWith("/admin/ecosystem-intelligence");
  });

  it("reloads framework search-param changes and preserves active chips at zero results", async () => {
    const fetchMock = vi.mocked(fetch);
    const { rerender } = render(
      <EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />,
    );
    const filtered = {
      ...defaultFilters,
      ecosystemRoles: ["manufacturer"],
    } satisfies EcosystemFiltersDto;
    fetchMock.mockResolvedValueOnce(successfulResponse(snapshot(0, filtered)));

    navigationQuery = "ecosystemRole=manufacturer";
    rerender(<EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/ecosystem-intelligence?ecosystemRole=manufacturer",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(await screen.findByText("No organisations match this view.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Manufacturer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset view" })).toBeInTheDocument();
  });

  it("keeps the last snapshot stale after a fetch failure and offers one retry", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.mocked(fetch);
    const { rerender } = render(
      <EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />,
    );
    fetchMock.mockRejectedValueOnce(new Error("private upstream detail"));

    navigationQuery = "technicalLayer=mechanical_and_actuation";
    rerender(<EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not refresh this view. Showing the last available snapshot.",
    );
    expect(screen.getByText("3 organisations mapped")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Retry" })).toHaveLength(1);
    expect(screen.getByTestId("ecosystem-workspace")).toHaveAttribute("aria-busy", "false");

    fetchMock.mockResolvedValueOnce(successfulResponse(snapshot(2, {
      ...defaultFilters,
      technicalLayers: ["mechanical_and_actuation"],
    })));
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("2 organisations mapped")).toBeInTheDocument();
  });

  it("aborts superseded requests and prevents older responses from overwriting newer state", async () => {
    const pending: Array<(response: Response) => void> = [];
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)));
    const { rerender } = render(
      <EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />,
    );

    navigationQuery = "ecosystemRole=manufacturer";
    rerender(<EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />);
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(screen.getByTestId("ecosystem-workspace")).toHaveAttribute("data-stale", "true");
    expect(screen.getByTestId("ecosystem-workspace")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Last available snapshot")).toBeInTheDocument();
    const firstSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal as AbortSignal;

    navigationQuery = "technicalLayer=mechanical_and_actuation";
    rerender(<EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />);
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(firstSignal.aborted).toBe(true);

    await act(async () => pending[1](successfulResponse(snapshot(2))));
    expect(await screen.findByText("2 organisations mapped")).toBeInTheDocument();
    await act(async () => pending[0](successfulResponse(snapshot(99))));
    expect(screen.queryByText("99 organisations mapped")).not.toBeInTheDocument();
  });

  it("invalidates a pending request when history returns to the loaded query", async () => {
    const pending: Array<(response: Response) => void> = [];
    vi.mocked(fetch).mockImplementation(() => new Promise<Response>((resolve) => pending.push(resolve)));
    const { rerender } = render(
      <EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />,
    );

    navigationQuery = "ecosystemRole=manufacturer";
    rerender(<EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />);
    await waitFor(() => expect(pending).toHaveLength(1));
    const pendingSignal = vi.mocked(fetch).mock.calls[0]?.[1]?.signal as AbortSignal;

    navigationQuery = "";
    rerender(<EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />);
    await waitFor(() => {
      expect(pendingSignal.aborted).toBe(true);
      expect(screen.getByTestId("ecosystem-workspace")).toHaveAttribute("aria-busy", "false");
      expect(screen.getByTestId("ecosystem-workspace")).toHaveAttribute("data-stale", "false");
    });
    expect(screen.queryByText("Last available snapshot")).not.toBeInTheDocument();

    await act(async () => pending[0](successfulResponse(snapshot(99))));
    expect(screen.queryByText("99 organisations mapped")).not.toBeInTheDocument();
    expect(screen.getByText("3 organisations mapped")).toBeInTheDocument();
  });

  it("uses accessible native controls for advanced filtering", async () => {
    const user = userEvent.setup();
    render(<EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />);

    expect(screen.getByRole("checkbox", { name: "Include ecosystem enablers" })).toBeInTheDocument();
    await user.click(screen.getByText("Advanced filters"));
    expect(screen.getByLabelText("Ecosystem roles")).toBeInstanceOf(HTMLSelectElement);
    expect(screen.getByLabelText("Technical layers")).toBeInstanceOf(HTMLSelectElement);
    expect(within(screen.getByLabelText("Review statuses")).queryByRole("option", { name: /Unknown/ }))
      .not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Ecosystem roles"), {
      target: { value: "manufacturer" },
    });
    expect(pushMock).toHaveBeenCalledWith(
      "/admin/ecosystem-intelligence?ecosystemRole=manufacturer",
    );
  });

  it("ignores invalid confidence input and resolves conflicting date bounds", async () => {
    const user = userEvent.setup();
    const datedFilters = {
      ...defaultFilters,
      discoveredAfter: "2026-07-20",
    } satisfies EcosystemFiltersDto;
    navigationQuery = "discoveredAfter=2026-07-20";
    render(
      <EcosystemIntelligenceWorkspace
        initialSnapshot={snapshot(3, datedFilters)}
        canonicalQuery={navigationQuery}
      />,
    );
    await user.click(screen.getByText("Advanced filters"));

    expect(() => fireEvent.change(screen.getByLabelText("Minimum discovery confidence"), {
      target: { value: "101" },
    })).not.toThrow();
    expect(pushMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Discovered before"), {
      target: { value: "2026-07-10" },
    });
    expect(pushMock).toHaveBeenCalledWith(
      "/admin/ecosystem-intelligence?discoveredBefore=2026-07-10",
    );
  });

  it("describes creator reachability as website, LinkedIn, or primary social", () => {
    const creatorFilters = { ...defaultFilters, participantType: "creator" } satisfies EcosystemFiltersDto;
    navigationQuery = "participantType=creator";
    render(
      <EcosystemIntelligenceWorkspace
        initialSnapshot={snapshot(3, creatorFilters)}
        canonicalQuery="participantType=creator"
      />,
    );

    expect(within(screen.getByText("67% publicly reachable").closest("details")!)
      .getByText("Creators and media qualify via a valid public website, LinkedIn, or primary social URL."))
      .toBeInTheDocument();
  });

  it("includes primary social in reachability when enablers can admit creators", () => {
    const enablerFilters = { ...defaultFilters, includeEnablers: true } satisfies EcosystemFiltersDto;
    navigationQuery = "includeEnablers=true";
    render(
      <EcosystemIntelligenceWorkspace
        initialSnapshot={snapshot(3, enablerFilters)}
        canonicalQuery="includeEnablers=true"
      />,
    );

    expect(within(screen.getByText("67% publicly reachable").closest("details")!)
      .getByText("Companies qualify via a valid public website or LinkedIn URL; creators and media may additionally qualify via a valid primary social URL."))
      .toBeInTheDocument();
  });

  it("formats the generated timestamp in a deterministic India timezone", () => {
    render(<EcosystemIntelligenceWorkspace initialSnapshot={snapshot()} canonicalQuery="" />);

    expect(screen.getByText("29 Jul 2026, 2:00 pm")).toHaveAttribute(
      "dateTime",
      "2026-07-29T08:30:00.000Z",
    );
  });

  it("offers equivalent keyboard-operable map and ranked-list state filters", async () => {
    const geographySnapshot = snapshot();
    geographySnapshot.geography = {
      denominator: 3,
      states: [
        { key: "karnataka", label: "Karnataka", count: 2 },
        { key: "maharashtra", label: "Maharashtra", count: 1 },
      ],
      cities: [
        {
          key: "bengaluru",
          label: "Bengaluru",
          stateKey: "karnataka",
          count: 2,
          latitude: 12.9716,
          longitude: 77.5946,
        },
        {
          key: "mumbai",
          label: "Mumbai",
          stateKey: "maharashtra",
          count: 1,
          latitude: null,
          longitude: 72.8777,
        },
        {
          key: "null_island",
          label: "Null Island",
          stateKey: "karnataka",
          count: 1,
          latitude: 0,
          longitude: 0,
        },
        {
          key: "mismatched_city",
          label: "Mismatched city",
          stateKey: "karnataka",
          count: 1,
          latitude: 19.076,
          longitude: 72.8777,
        },
      ],
      unresolvedCount: 1,
    };

    render(
      <EcosystemIntelligenceWorkspace initialSnapshot={geographySnapshot} canonicalQuery="" />,
    );

    const rankedList = screen.getByTestId("india-ranked-locations");
    const map = screen.getByTestId("india-ecosystem-map");
    expect(rankedList).toHaveAttribute("data-mobile-primary", "true");

    const accessibleName = "Karnataka: 2 organisations";
    expect(within(rankedList).getByRole("button", { name: accessibleName }))
      .toHaveTextContent("Karnataka2");
    const stateShape = within(map).getByRole("button", { name: accessibleName });
    expect(stateShape.querySelector("title")).toHaveTextContent(accessibleName);
    stateShape.focus();
    fireEvent.keyDown(stateShape, { key: "Enter" });
    expect(pushMock).toHaveBeenLastCalledWith(
      "/admin/ecosystem-intelligence?headquartersState=karnataka",
    );

    await userEvent.click(within(rankedList).getByRole("button", { name: accessibleName }));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/admin/ecosystem-intelligence?headquartersState=karnataka",
    );
    expect(within(map).getAllByTestId("city-bubble")).toHaveLength(1);
    const cityBubble = within(map).getByLabelText("Bengaluru, Karnataka: 2 organisations");
    expect(cityBubble).toHaveAttribute("data-city-key", "bengaluru");
    expect(cityBubble.querySelector("title")).toHaveTextContent(
      "Bengaluru, Karnataka: 2 organisations",
    );
    expect(within(map).queryByLabelText(/Mumbai/)).not.toBeInTheDocument();
    expect(within(map).queryByLabelText(/Null Island/)).not.toBeInTheDocument();
    expect(within(map).queryByLabelText(/Mismatched city/)).not.toBeInTheDocument();
    expect(within(rankedList).getByRole("button", {
      name: "Bengaluru, Karnataka: 2 organisations",
    })).toBeInTheDocument();
  });

  it("keeps unknown headquarters visible as a canonical filter action", async () => {
    const geographySnapshot = snapshot();
    geographySnapshot.geography.unresolvedCount = 2;
    render(
      <EcosystemIntelligenceWorkspace initialSnapshot={geographySnapshot} canonicalQuery="" />,
    );

    await userEvent.click(screen.getByRole("button", {
      name: "Unknown headquarters: 2 organisations",
    }));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/admin/ecosystem-intelligence?headquartersState=unknown",
    );
  });

  it("switches explorer models without changing global filters and exposes complete context", async () => {
    const user = userEvent.setup();
    const filtered = {
      ...defaultFilters,
      participantType: "creator" as const,
      headquartersStates: ["karnataka"],
    } satisfies EcosystemFiltersDto;
    navigationQuery = "participantType=creator&headquartersState=karnataka";
    const explorerSnapshot = snapshot(3, filtered);
    explorerSnapshot.explorer = {
      denominator: 3,
      businessStages: ECOSYSTEM_TAXONOMY.termsByKind.business_stage.map((term, index) => ({
        key: term.key,
        count: index === 0 ? 6 : 0,
        strongEvidence: ratio(index === 0 ? 2 : 0, index === 0 ? 6 : 0),
        representativeCompanies: index === 0
          ? [
            { id: "a", name: "Aster Robotics" },
            { id: "b", name: "Bharat Motion" },
            { id: "c", name: "Circuit Labs" },
            { id: "d", name: "Delta Systems" },
            { id: "e", name: "Edge Machines" },
            { id: "g", name: "Sixth Representative" },
          ]
          : [],
        majorCapabilities: index === 0 ? [{ key: "motion_control", count: 2 }] : [],
      })),
      technicalLayers: ECOSYSTEM_TAXONOMY.termsByKind.technical_layer.map((term, index) => ({
        key: term.key,
        count: index === 0 ? 2 : 0,
        strongEvidence: ratio(index === 0 ? 1 : 0, index === 0 ? 2 : 0),
        representativeCompanies: index === 0
          ? [{ id: "f", name: "Forge Robotics" }]
          : [],
        majorCapabilities: index === 0 ? [{ key: "testing_and_validation", count: 1 }] : [],
      })),
    };
    render(
      <EcosystemIntelligenceWorkspace
        initialSnapshot={explorerSnapshot}
        canonicalQuery={navigationQuery}
      />,
    );

    expect(screen.getByRole("heading", { name: "How the ecosystem fits together" }))
      .toBeInTheDocument();
    const businessGroups = screen.getAllByTestId("business-stage-group");
    expect(businessGroups).toHaveLength(ECOSYSTEM_TAXONOMY.termsByKind.business_stage.length);
    expect(businessGroups.every((group) => (
      within(group).queryByText(/Strong evidence: \d+ of \d+/) &&
      within(group).queryByText("Configured ecosystem context") &&
      within(group).queryByText("Representative participants")
    ))).toBe(true);
    expect(within(businessGroups[0]!).getByText("Showing 5 of 6.")).toBeInTheDocument();
    expect(within(businessGroups[0]!).getByText("Aster Robotics, Bharat Motion, Circuit Labs, Delta Systems, Edge Machines"))
      .toBeInTheDocument();
    expect(within(businessGroups[0]!).queryByText(/sixth representative/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Technical layers" }));
    expect(pushMock).not.toHaveBeenCalled();
    const technicalGroups = screen.getAllByTestId("technical-layer-group");
    expect(technicalGroups).toHaveLength(ECOSYSTEM_TAXONOMY.termsByKind.technical_layer.length);
    expect(within(technicalGroups[0]!).getByText("Metals, Polymers, Machining"))
      .toBeInTheDocument();
    expect(within(technicalGroups[0]!).getByText("Provides durable physical structure."))
      .toBeInTheDocument();

    await user.click(within(technicalGroups[0]!).getByRole("button", {
      name: "Filter by Materials and fabrication",
    }));
    expect(pushMock).toHaveBeenLastCalledWith(
      "/admin/ecosystem-intelligence?participantType=creator&technicalLayer=materials_and_fabrication&headquartersState=karnataka",
    );
  });

  it("mirrors all five serialized evidence dimensions", () => {
    const coverage = {
      score: 90,
      numerator: 90,
      denominator: 100,
      classification: "evidence_backed",
      dimensions: {
        candidateSourceEvidence: 20,
        currentSystemsContext: 20,
        classification: 20,
        resolvedHeadquarters: 20,
        publicProfessionalContact: 10,
      },
    } satisfies EvidenceCoverageDto;

    expect(Object.keys(coverage.dimensions)).toEqual([
      "candidateSourceEvidence",
      "currentSystemsContext",
      "classification",
      "resolvedHeadquarters",
      "publicProfessionalContact",
    ]);
  });

  it("restores focus to the ledger when review removes the candidate", async () => {
    const user = userEvent.setup();
    const initial = snapshot(1);
    const ledgerRow = {
      id: "candidate-review",
      type: "company" as const,
      name: "Review Robotics",
      description: "Builds robot subsystems.",
      category: "Robot Makers and Integrators",
      status: "discovered" as const,
      discoveryScore: 91,
      discoveredAt: "2026-07-20T00:00:00.000Z",
      websiteUrl: "https://review.example",
      linkedinUrl: null,
      primarySocialUrl: null,
      classifications: [],
      headquarters: null,
      evidenceCoverage: {
        score: 40,
        numerator: 40,
        denominator: 100 as const,
        classification: "none" as const,
        dimensions: {
          candidateSourceEvidence: 20,
          currentSystemsContext: 20,
          classification: 0,
          resolvedHeadquarters: 0,
          publicProfessionalContact: 0,
        },
      },
      evidenceFreshness: "current" as const,
      activeSignalCount: 0,
      documentedRelationshipCount: 0,
      latestSourceUrl: "https://review.example/evidence",
      latestSourceAt: "2026-07-28T00:00:00.000Z",
      latestResearchAt: "2026-07-29T00:00:00.000Z",
    };
    initial.ledger = { items: [ledgerRow], total: 1, page: 1, pageSize: 25, totalPages: 1 };
    const detail: EcosystemCandidateDetailDto = {
      id: ledgerRow.id,
      type: ledgerRow.type,
      name: ledgerRow.name,
      description: ledgerRow.description,
      category: ledgerRow.category,
      subcategory: null,
      status: ledgerRow.status,
      discoveryScore: ledgerRow.discoveryScore,
      discoveredAt: ledgerRow.discoveredAt,
      updatedAt: "2026-07-29T08:00:00.000Z",
      publicUrls: { canonical: "https://review.example/profile", website: ledgerRow.websiteUrl, linkedin: null, primarySocial: null },
      classifications: [],
      headquarters: null,
      signals: [],
      relationships: [],
      sources: [],
      research: {
        current: null,
        history: [],
        historyPage: {
          total: 0,
          offset: 0,
          limit: 20,
          hasMore: false,
          nextOffset: null,
        },
      },
    };
    const refreshed = snapshot(1);
    refreshed.ledger = {
      items: [],
      total: 0, page: 1, pageSize: 25, totalPages: 0,
    };
    const updatedCandidate = {
      id: ledgerRow.id,
      type: ledgerRow.type,
      name: ledgerRow.name,
      canonicalUrl: "https://review.example/profile",
      websiteUrl: ledgerRow.websiteUrl,
      primarySocialUrl: null,
      linkedinUrl: null,
      discoveredDescription: ledgerRow.description,
      category: ledgerRow.category,
      subcategory: null,
      geography: "India",
      firstSourceName: "Official site",
      firstSourceUrl: "https://review.example/evidence",
      discoveredAt: ledgerRow.discoveredAt,
      lastSeenAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T09:00:00.000Z",
      discoveryScore: 91,
      status: "rejected",
    };
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith(`/candidates/${ledgerRow.id}`) && init?.method !== "PATCH") {
        return new Response(JSON.stringify({ ok: true, candidate: detail }), { status: 200 });
      }
      if (url.endsWith(`/candidates/${ledgerRow.id}`) && init?.method === "PATCH") {
        return new Response(JSON.stringify({ candidate: updatedCandidate }), { status: 200 });
      }
      if (url === "/api/admin/ecosystem-intelligence") return successfulResponse(refreshed);
      throw new Error(`Unexpected test request: ${url}`);
    });

    render(<EcosystemIntelligenceWorkspace initialSnapshot={initial} canonicalQuery="" />);
    const ledger = screen.getByRole("table", { name: "Ecosystem candidate evidence ledger" });
    const trigger = within(ledger).getByRole("button", { name: "View details" });
    trigger.focus();
    await user.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: ledgerRow.name });
    await user.click(within(dialog).getByRole("button", { name: `Reject ${ledgerRow.name}` }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: ledgerRow.name })).not.toBeInTheDocument());
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/admin/ecosystem-intelligence",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));
    expect(screen.getByText("No organisations match this ledger view.")).toBeInTheDocument();
    await waitFor(() => expect(
      screen.getByRole("heading", { name: "The companies behind this view" }),
    ).toHaveFocus());
  });
});
