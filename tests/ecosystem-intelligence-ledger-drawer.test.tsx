import { useRef, useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EcosystemCandidateDrawer } from "../app/components/product/ecosystem-intelligence/EcosystemCandidateDrawer";
import { EcosystemCandidateLedger } from "../app/components/product/ecosystem-intelligence/EcosystemCandidateLedger";
import type {
  EcosystemCandidateDetailDto,
  EcosystemFiltersDto,
  EcosystemLedgerRowDto,
} from "../app/components/product/ecosystem-intelligence/types";

const filters: EcosystemFiltersDto = {
  participantType: "company",
  includeEnablers: false,
  analysisVersion: "physical-ai-v1",
  ecosystemDomains: [],
  organisationSubtypes: [],
  ecosystemRoles: ["component_supplier"],
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

const classifications: EcosystemLedgerRowDto["classifications"] = [
  {
    kind: "ecosystem_role",
    termKey: "component_supplier",
    evidenceState: "evidence_backed",
    confidence: 92,
    basis: "Public product documentation.",
    sourceUrls: ["https://example.com/product"],
  },
  {
    kind: "technical_layer",
    termKey: "mechanical_and_actuation",
    evidenceState: "inferred",
    confidence: null,
    basis: "Discovery category inference.",
    sourceUrls: [],
  },
];

const row: EcosystemLedgerRowDto = {
  id: "candidate-1",
  type: "company",
  name: "Actuator Labs",
  description: "Builds motion components.",
  category: "Components and Actuation",
  status: "discovered",
  discoveryScore: 88,
  discoveredAt: "2026-07-20T00:00:00.000Z",
  websiteUrl: "https://example.com",
  linkedinUrl: "https://linkedin.com/company/example",
  primarySocialUrl: null,
  classifications,
  headquarters: {
    stateKey: "karnataka",
    stateLabel: "Karnataka",
    cityKey: "bengaluru",
    cityLabel: "Bengaluru",
    latitude: 12.9716,
    longitude: 77.5946,
    evidenceState: "evidence_backed",
    confidence: 95,
    sourceUrls: ["https://example.com/contact"],
  },
  evidenceCoverage: {
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
  },
  evidenceFreshness: "current",
  activeSignalCount: 1,
  documentedRelationshipCount: 1,
  latestSourceUrl: "https://example.com/source",
  latestSourceAt: "2026-07-28T00:00:00.000Z",
  latestResearchAt: "2026-07-29T00:00:00.000Z",
};

const detail: EcosystemCandidateDetailDto = {
  id: row.id,
  type: row.type,
  name: row.name,
  description: row.description,
  category: row.category,
  subcategory: "Actuators",
  status: row.status,
  discoveryScore: row.discoveryScore,
  discoveredAt: row.discoveredAt,
  updatedAt: "2026-07-29T08:00:00.000Z",
  publicUrls: {
    canonical: "https://example.com/company",
    website: row.websiteUrl,
    linkedin: row.linkedinUrl,
    primarySocial: null,
  },
  classifications,
  headquarters: row.headquarters,
  signals: [{
    id: "signal-1",
    candidateId: row.id,
    candidateName: row.name,
    type: "product_launch",
    title: "Launched a compact actuator",
    occurredAt: "2026-07-15T00:00:00.000Z",
    expiresAt: null,
    activeUntil: "2027-01-11T00:00:00.000Z",
    sourceUrl: "https://example.com/launch",
    confidence: 90,
  }],
  relationships: [{
    id: "relationship-1",
    direction: "downstream",
    sourceCandidateId: row.id,
    sourceName: row.name,
    targetCandidateId: "candidate-2",
    targetName: "Robot Works",
    type: "supplies_to",
    evidenceUrl: "https://example.com/relationship",
    confidence: 91,
    observedAt: "2026-07-14T00:00:00.000Z",
  }, {
    id: "relationship-2",
    direction: "upstream",
    sourceCandidateId: "candidate-3",
    sourceName: "Motor Materials",
    targetCandidateId: row.id,
    targetName: row.name,
    type: "supplies_to",
    evidenceUrl: "https://example.com/upstream-relationship",
    confidence: 89,
    observedAt: "2026-07-13T00:00:00.000Z",
  }],
  sources: [{
    id: "source-1",
    sourceName: "Product page",
    sourceUrl: "https://example.com/product",
    firstSeenAt: "2026-07-20T00:00:00.000Z",
    lastSeenAt: "2026-07-29T00:00:00.000Z",
  }],
  research: {
    current: {
      id: "research-2",
      discoveryRunId: "run-2",
      summary: "Supplies motion hardware for complete robot systems.",
      findings: "<script>not html</script>\nInputs: motors and machined parts.",
      sourceUrls: ["https://example.com/research-2"],
      analysisVersion: "physical-ai-v1",
      createdAt: "2026-07-29T00:00:00.000Z",
    },
    history: [{
      id: "research-1",
      discoveryRunId: "run-1",
      summary: "Earlier systems context.",
      findings: "Earlier plain-text findings.",
      sourceUrls: ["https://example.com/research-1"],
      analysisVersion: "physical-ai-v1",
      createdAt: "2026-07-20T00:00:00.000Z",
    }],
    historyPage: {
      total: 1,
      offset: 0,
      limit: 20,
      hasMore: false,
      nextOffset: null,
    },
  },
};

beforeEach(() => {
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
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(function showModal() {
    this.setAttribute("open", "");
  });
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function close() {
    this.removeAttribute("open");
  });
});

describe("Ecosystem candidate ledger and drawer", () => {
  it("preserves global filters in stable server pagination and sort URLs", () => {
    render(<EcosystemCandidateLedger
      ledger={{ items: [row], total: 30, page: 1, pageSize: 25, totalPages: 2 }}
      filters={filters}
      onOpenCandidate={vi.fn()}
    />);

    const table = screen.getByRole("table", { name: "Ecosystem candidate evidence ledger" });
    expect(within(table).getByRole("link", { name: "Sort candidates by name ascending" }))
      .toHaveAttribute("href", "/admin/ecosystem-intelligence?ecosystemRole=component_supplier&sort=name&direction=asc");
    expect(within(table).getByRole("columnheader", { name: /Sort candidates/ }))
      .toHaveAttribute("aria-sort", "none");
    expect(screen.getByRole("link", { name: "Next page" }))
      .toHaveAttribute("href", "/admin/ecosystem-intelligence?ecosystemRole=component_supplier&page=2");
    expect(within(table).getByText("Bengaluru, Karnataka")).toBeInTheDocument();
    expect(within(table).getByText("90 / 100")).toBeInTheDocument();
    expect(within(table).getByRole("link", { name: "Latest public evidence for Actuator Labs" }))
      .toHaveAttribute("href", row.latestSourceUrl);
    expect(within(table).getByRole("link", { name: "Latest public evidence for Actuator Labs" }))
      .toHaveTextContent("28 Jul 2026");
    expect(screen.getByRole("article", { name: "Actuator Labs ecosystem record" }))
      .toBeInTheDocument();
  });

  it("fetches detail only after opening and renders public evidence without private contact fields", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      candidate: { ...detail, email: "private@example.com", phone: "+91 99999 99999" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    function Harness() {
      const [open, setOpen] = useState(false);
      const triggerRef = useRef<HTMLButtonElement>(null);
      return <>
        <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>Open candidate</button>
        {open ? <EcosystemCandidateDrawer
          candidateId={row.id}
          candidateName={row.name}
          returnFocusElement={triggerRef.current}
          onClose={() => setOpen(false)}
          onCandidateUpdated={vi.fn()}
        /> : null}
      </>;
    }

    render(<Harness />);
    expect(fetch).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Open candidate" }));
    expect(fetch).toHaveBeenCalledWith(
      "/api/admin/ecosystem-intelligence/candidates/candidate-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Actuator Labs" });
    expect(dialog).toHaveAttribute("open");
    expect(document.body.style.overflow).toBe("hidden");
    expect(within(dialog).getByText("Evidence-backed", { selector: "span" })).toBeInTheDocument();
    expect(within(dialog).getByText("Inferred", { selector: "span" })).toBeInTheDocument();
    expect(within(dialog).getAllByText("Bengaluru, Karnataka")).toHaveLength(2);
    const headquarters = within(dialog).getByRole("heading", { name: "Headquarters evidence" }).closest("section")!;
    expect(headquarters).toHaveTextContent("Evidence-backed · 95% confidence");
    expect(within(headquarters).getByRole("link", { name: "Headquarters evidence 1 for Actuator Labs" }))
      .toHaveAttribute("href", "https://example.com/contact");
    const componentClassification = within(dialog).getByText("Component supplier").closest("li")!;
    expect(componentClassification).toHaveTextContent("92% confidence");
    expect(within(componentClassification).getByRole("link", { name: "Component supplier evidence 1" }))
      .toHaveAttribute("href", "https://example.com/product");
    expect(within(dialog).getByRole("link", { name: "Actuator Labs website" }))
      .toHaveAttribute("href", row.websiteUrl);
    expect(within(dialog).queryByText("private@example.com")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("+91 99999 99999")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Evidence for Launched a compact actuator" }))
      .toHaveAttribute("href", "https://example.com/launch");
    expect(within(dialog).getByText("Launched a compact actuator").closest("li"))
      .toHaveTextContent("90% confidence");
    expect(within(dialog).getByText("Launched a compact actuator").closest("li"))
      .toHaveTextContent("Occurred 2026-07-15 · active until 2027-01-11");
    expect(within(dialog).getByRole("link", { name: "Evidence for relationship with Robot Works" }))
      .toHaveAttribute("href", "https://example.com/relationship");
    expect(within(dialog).getByText("Upstream: Motor Materials")).toBeInTheDocument();
    expect(within(dialog).getByRole("link", { name: "Evidence for relationship with Motor Materials" }))
      .toHaveAttribute("href", "https://example.com/upstream-relationship");

    await user.click(within(dialog).getByRole("button", { name: "Show findings" }));
    expect(within(dialog).getByText(/<script>not html<\/script>/)).toBeInTheDocument();
    expect(within(dialog).queryByText("not html", { selector: "script" })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "History (1)" }));
    expect(within(dialog).getByRole("button", { name: /View research from 20 Jul 2026/ }))
      .toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe("");
    expect(screen.getByRole("button", { name: "Open candidate" })).toHaveFocus();
  });

  it("bounds detail failures, retries, and reports successful review updates", async () => {
    const user = userEvent.setup();
    const onCandidateUpdated = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "private database error" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, candidate: detail }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        candidate: {
          id: row.id, type: row.type, name: row.name,
          canonicalUrl: "https://example.com/company", websiteUrl: row.websiteUrl,
          primarySocialUrl: null, linkedinUrl: row.linkedinUrl,
          discoveredDescription: row.description, category: row.category, subcategory: "Actuators",
          geography: "India", firstSourceName: "Product page", firstSourceUrl: "https://example.com/product",
          discoveredAt: row.discoveredAt, lastSeenAt: "2026-07-29T00:00:00.000Z",
          updatedAt: "2026-07-29T09:00:00.000Z", discoveryScore: 88, status: "shortlisted",
        },
      }), { status: 200 }));

    render(<EcosystemCandidateDrawer
      candidateId={row.id}
      candidateName={row.name}
      returnFocusElement={null}
      onClose={vi.fn()}
      onCandidateUpdated={onCandidateUpdated}
    />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not load this candidate. Please try again.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("private database error");
    await user.click(screen.getByRole("button", { name: "Retry candidate details" }));
    expect(await screen.findByText("Builds motion components.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Shortlist Actuator Labs" }));
    await waitFor(() => expect(onCandidateUpdated).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: row.id,
      status: "shortlisted",
    })));
  });

  it("keeps the drawer open and exposes the shared conflict alert on a 409", async () => {
    const user = userEvent.setup();
    const onCandidateUpdated = vi.fn();
    const conflictedCandidate = {
      id: row.id, type: row.type, name: row.name,
      canonicalUrl: "https://example.com/company", websiteUrl: row.websiteUrl,
      primarySocialUrl: null, linkedinUrl: row.linkedinUrl,
      discoveredDescription: row.description, category: row.category, subcategory: "Actuators",
      geography: "India", firstSourceName: "Product page", firstSourceUrl: "https://example.com/product",
      discoveredAt: row.discoveredAt, lastSeenAt: "2026-07-29T00:00:00.000Z",
      updatedAt: "2026-07-29T09:00:00.000Z", discoveryScore: 88, status: "shortlisted",
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, candidate: detail }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ candidate: conflictedCandidate }), { status: 409 }));

    render(<EcosystemCandidateDrawer
      candidateId={row.id}
      candidateName={row.name}
      returnFocusElement={null}
      onClose={vi.fn()}
      onCandidateUpdated={onCandidateUpdated}
    />);

    const dialog = await screen.findByRole("dialog", { name: row.name });
    await user.click(within(dialog).getByRole("button", { name: "Shortlist Actuator Labs" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "changed elsewhere. Latest status is shortlisted",
    );
    expect(screen.getByRole("dialog", { name: row.name })).toBeInTheDocument();
    expect(within(dialog).getByText("Shortlisted", { selector: "dd" })).toBeInTheDocument();
    expect(onCandidateUpdated).not.toHaveBeenCalled();
  });

  it("loads every older research version through bounded history pages", async () => {
    const user = userEvent.setup();
    const firstPage = {
      ...detail,
      research: {
        ...detail.research,
        historyPage: { total: 21, offset: 0, limit: 20, hasMore: true, nextOffset: 20 },
      },
    };
    const oldestVersion = {
      id: "research-oldest",
      discoveryRunId: "run-oldest",
      summary: "Oldest systems context.",
      findings: "Oldest plain-text findings.",
      sourceUrls: ["https://example.com/research-oldest"],
      analysisVersion: "physical-ai-v1",
      createdAt: "2025-01-01T00:00:00.000Z",
    };
    const nextPage = {
      ...detail,
      research: {
        current: detail.research.current,
        history: [oldestVersion],
        historyPage: { total: 21, offset: 20, limit: 20, hasMore: false, nextOffset: null },
      },
    };
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, candidate: firstPage }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, candidate: nextPage }), { status: 200 }));

    render(<EcosystemCandidateDrawer
      candidateId={row.id}
      candidateName={row.name}
      returnFocusElement={null}
      onClose={vi.fn()}
      onCandidateUpdated={vi.fn()}
    />);

    const dialog = await screen.findByRole("dialog", { name: row.name });
    await user.click(within(dialog).getByRole("button", { name: "History (21)" }));
    await user.click(within(dialog).getByRole("button", { name: "Load older research" }));

    expect(fetch).toHaveBeenLastCalledWith(
      "/api/admin/ecosystem-intelligence/candidates/candidate-1?researchOffset=20",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(await within(dialog).findByRole("button", { name: /View research from 01 Jan 2025/ }))
      .toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Load older research" }))
      .not.toBeInTheDocument();
  });
});
