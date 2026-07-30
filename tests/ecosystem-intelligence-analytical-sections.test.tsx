import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CapabilityHeatmaps } from "../app/components/product/ecosystem-intelligence/CapabilityHeatmaps";
import { ChangeSignals } from "../app/components/product/ecosystem-intelligence/ChangeSignals";
import { RelationshipReadiness } from "../app/components/product/ecosystem-intelligence/RelationshipReadiness";
import { ResearchGapInsights } from "../app/components/product/ecosystem-intelligence/ResearchGapInsights";
import type {
  EcosystemFiltersDto,
  EcosystemSnapshotDto,
} from "../app/components/product/ecosystem-intelligence/types";

const filters: EcosystemFiltersDto = {
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

const matrices: EcosystemSnapshotDto["matrices"] = {
  denominator: 8,
  roleByCapability: {
    rowKeys: ["component_supplier"],
    columnKeys: ["motion_control"],
    cells: [{
      rowKey: "component_supplier",
      columnKey: "motion_control",
      count: 3,
      evidence: { numerator: 2, denominator: 3, percentage: 67 },
      readiness: "ready",
    }],
  },
  stateByRole: {
    rowKeys: ["karnataka"],
    columnKeys: ["component_supplier"],
    cells: [{
      rowKey: "karnataka",
      columnKey: "component_supplier",
      count: 2,
      evidence: { numerator: 1, denominator: 2, percentage: 50 },
      readiness: "needs_evidence",
    }],
  },
};

describe("Ecosystem Intelligence analytical sections", () => {
  it("renders authoritative matrix text and filters by both cell axes", () => {
    const onFilter = vi.fn();
    render(<CapabilityHeatmaps matrices={matrices} onFilter={onFilter} />);

    const roleMatrix = screen.getByRole("region", { name: "Role by capability matrix" });
    expect(roleMatrix).toHaveAttribute("data-horizontal-rail", "true");
    const readyCell = within(roleMatrix).getByRole("button", {
      name: "Component supplier and Motion control: 3 organisations, 2 of 3 strong evidence, ready",
    });
    expect(readyCell).toHaveTextContent("3");
    expect(readyCell).toHaveTextContent("2/3 strong evidence");
    expect(readyCell).toHaveTextContent("Ready");
    fireEvent.click(readyCell);
    expect(onFilter).toHaveBeenCalledWith({
      ecosystemRoles: ["component_supplier"],
      capabilities: ["motion_control"],
    });

    fireEvent.click(within(screen.getByRole("region", { name: "State by role matrix" }))
      .getByRole("button", { name: /Karnataka and Component supplier/ }));
    expect(onFilter).toHaveBeenCalledWith({
      headquartersStates: ["karnataka"],
      ecosystemRoles: ["component_supplier"],
    });
  });

  it("renders only server-returned qualified research-gap rules and their filters", () => {
    const onFilter = vi.fn();
    render(<ResearchGapInsights insights={{
      denominator: 8,
      items: [{
        ruleKey: "stale_evidence",
        title: "Evidence needs refreshing",
        copy: "3 of 8 organisations in the current Mewtuals map have stale evidence.",
        numerator: 3,
        denominator: 8,
        percentage: 38,
        confidence: "map_evidence",
        supportingFilters: { ...filters, evidenceFreshness: "stale" },
      }],
    }} onFilter={onFilter} />);

    const card = screen.getByRole("article", { name: "Evidence needs refreshing" });
    expect(card).toHaveTextContent("Rule: stale_evidence");
    expect(card).toHaveTextContent("3 of 8");
    expect(card).toHaveTextContent("38% coverage");
    expect(card).toHaveTextContent("Confidence: map evidence");
    expect(card).toHaveTextContent("current Mewtuals map");
    fireEvent.click(within(card).getByRole("button", { name: "View supporting companies for Evidence needs refreshing" }));
    expect(onFilter).toHaveBeenCalledWith(expect.objectContaining({ evidenceFreshness: "stale" }));
  });

  it("keeps Mewtuals research activity separate from public ecosystem momentum", () => {
    render(<ChangeSignals
      velocity={{
        kind: "discovery_research_activity",
        denominator: 8,
        windows: [{
          days: 30,
          candidateCount: 4,
          researchVersionCount: 6,
          sourceEvidenceCount: 9,
          byCandidateDate: [{ key: "2026-07-20", label: "20 Jul", count: 2 }],
          bySource: [{ key: "official_site", label: "Official site", count: 5 }],
          byRole: [],
          byState: [],
          byEvidenceBand: [],
          byReviewStatus: [],
        }],
      }}
      momentum={{
        denominator: 8,
        ready: false,
        activeSignalCount: 3,
        organisationCount: 2,
        requiredSignalCount: 5,
        requiredOrganisationCount: 3,
        message: "Not enough evidence-backed signals to establish ecosystem momentum yet.",
        categories: [],
        companies: [],
        signals: [],
      }}
    />);

    expect(screen.getByRole("heading", { name: "Mewtuals research activity" })).toBeInTheDocument();
    expect(screen.getByText("4 candidates researched")).toBeInTheDocument();
    expect(screen.getByText("Candidate dates").closest("div")).toHaveTextContent("20 Jul2");
    expect(screen.getByText("Sources").closest("div")).toHaveTextContent("Official site5");
    expect(screen.getByRole("heading", { name: "Public ecosystem momentum" })).toBeInTheDocument();
    expect(screen.getByText("Not enough evidence-backed signals to establish ecosystem momentum yet."))
      .toBeInTheDocument();
    expect(screen.getByText("3 of 5 required signals across 2 of 3 required organisations."))
      .toBeInTheDocument();
  });

  it("humanizes velocity keys and discloses capped breakdowns", () => {
    render(<ChangeSignals
      velocity={{
        kind: "discovery_research_activity",
        denominator: 8,
        windows: [{
          days: 7,
          candidateCount: 6,
          researchVersionCount: 0,
          sourceEvidenceCount: 0,
          byCandidateDate: [],
          bySource: [],
          byRole: [
            "component_supplier", "manufacturer", "system_integrator",
            "software_provider", "deployment_partner", "research_enabler",
          ].map((key, index) => ({ key, label: key, count: 6 - index })),
          byState: [{ key: "karnataka", label: "karnataka", count: 2 }],
          byEvidenceBand: [{ key: "needs_evidence", label: "needs_evidence", count: 2 }],
          byReviewStatus: [{ key: "queued_for_profile", label: "queued_for_profile", count: 1 }],
        }],
      }}
      momentum={{
        denominator: 8, ready: false, activeSignalCount: 0, organisationCount: 0,
        requiredSignalCount: 5, requiredOrganisationCount: 3,
        message: "Not enough evidence-backed signals to establish ecosystem momentum yet.",
        categories: [], companies: [], signals: [],
      }}
    />);
    expect(screen.getByText("Component supplier")).toBeInTheDocument();
    expect(screen.getByText("Karnataka")).toBeInTheDocument();
    expect(screen.getByText("Needs evidence")).toBeInTheDocument();
    expect(screen.getByText("Queued for profile")).toBeInTheDocument();
    expect(screen.getByText("Showing 5 of 6.")).toBeInTheDocument();
    expect(screen.queryByText("Research and enabler")).not.toBeInTheDocument();
  });

  it("shows public signal occurrence, effective freshness, and explicit expiry", () => {
    render(<ChangeSignals
      velocity={{ kind: "discovery_research_activity", denominator: 8, windows: [] }}
      momentum={{
        denominator: 8,
        ready: true,
        activeSignalCount: 30,
        organisationCount: 12,
        requiredSignalCount: 5,
        requiredOrganisationCount: 3,
        message: "Five active public signals are documented.",
        categories: [],
        companies: Array.from({ length: 10 }, (_, index) => ({
          key: `company-${index}`,
          label: `Company ${index}`,
          count: 10 - index,
        })),
        signals: [{
          id: "signal-1",
          candidateId: "a",
          candidateName: "Actuator Labs",
          type: "product_launch",
          title: "New actuator",
          occurredAt: "2026-07-10T00:00:00.000Z",
          expiresAt: "2026-10-10T00:00:00.000Z",
          activeUntil: "2026-10-10T00:00:00.000Z",
          sourceUrl: "https://example.com/signal",
          confidence: 90,
        }],
      }}
    />);
    const signal = screen.getByText("Actuator Labs").closest("li")!;
    expect(signal).toHaveTextContent("Occurred 2026-07-10");
    expect(signal).toHaveTextContent("Active until 2026-10-10");
    expect(signal).toHaveTextContent("Explicit expiry 2026-10-10");
    expect(screen.getByText("Showing 5 of 12.")).toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 30 most recent active signals.")).toBeInTheDocument();
  });

  it("uses dimension-specific matrix empty explanations", () => {
    render(<CapabilityHeatmaps matrices={{
      denominator: 2,
      roleByCapability: { rowKeys: [], columnKeys: [], cells: [] },
      stateByRole: { rowKeys: [], columnKeys: [], cells: [] },
    }} onFilter={vi.fn()} />);
    expect(screen.getByText(/resolved ecosystem roles and capabilities/)).toBeInTheDocument();
    expect(screen.getByText(/resolved headquarters states and ecosystem roles/)).toBeInTheDocument();
  });

  it("shows relationship readiness below threshold and an evidence-linked accessible ledger above it", () => {
    const belowThreshold: EcosystemSnapshotDto["relationships"] = {
      denominator: 8,
      ready: false,
      evidencedEdgeCount: 4,
      candidateCount: 3,
      unresolvedTargetCount: 2,
      requiredEvidencedEdges: 8,
      requiredCandidates: 5,
      message: "More verified relationships are needed.",
      nodes: [],
      edges: [],
    };
    const { rerender } = render(<RelationshipReadiness relationships={belowThreshold} />);
    expect(screen.getByText("4 of 8 verified relationships across 3 of 5 candidates."))
      .toBeInTheDocument();
    expect(screen.getByText("2 unresolved relationship targets.")).toBeInTheDocument();

    rerender(<RelationshipReadiness relationships={{
      ...belowThreshold,
      ready: true,
      evidencedEdgeCount: 8,
      candidateCount: 5,
      unresolvedTargetCount: 0,
      nodes: [
        { id: "a", name: "Actuator Labs", clusterKey: "component_supplier", type: "company" },
        { id: "b", name: "Robot Works", clusterKey: "system_integrator", type: "company" },
      ],
      edges: [{
        id: "edge-1",
        sourceCandidateId: "a",
        targetCandidateId: "b",
        type: "supplies_to",
        evidenceUrl: "https://example.com/evidence",
        confidence: 90,
        observedAt: "2026-07-20T00:00:00.000Z",
      }],
    }} />);

    const ledger = screen.getByRole("list", { name: "Verified relationship ledger" });
    const relationship = within(ledger).getByText(/Actuator Labs supplies to Robot Works/).closest("li")!;
    expect(within(relationship).getByRole("link", { name: "Public evidence" }))
      .toHaveAttribute("href", "https://example.com/evidence");
    expect(screen.getByRole("img", { name: "Verified relationship map" }))
      .toBeInTheDocument();
  });

  it("gives every node a unique coordinate when a cluster contains more than eight companies", () => {
    const nodes = Array.from({ length: 9 }, (_, index) => ({
      id: `node-${index}`,
      name: `Company ${index}`,
      clusterKey: "component_supplier",
      type: "company" as const,
    }));
    const { container } = render(<RelationshipReadiness relationships={{
      denominator: 9,
      ready: true,
      evidencedEdgeCount: 70,
      candidateCount: 50,
      unresolvedTargetCount: 0,
      requiredEvidencedEdges: 8,
      requiredCandidates: 5,
      message: "Ready.",
      nodes,
      edges: Array.from({ length: 8 }, (_, index) => ({
        id: `edge-${index}`,
        sourceCandidateId: `node-${index}`,
        targetCandidateId: `node-${index + 1}`,
        type: "supplies_to",
        evidenceUrl: `https://example.com/evidence-${index}`,
        confidence: 90,
        observedAt: null,
      })),
    }} />);
    const transforms = [...container.querySelectorAll("svg g")]
      .map((node) => node.getAttribute("transform"));
    expect(new Set(transforms).size).toBe(transforms.length);
    expect(screen.getByText(/9 of 50 connected candidates and 8 of 70 verified relationships are shown/))
      .toBeInTheDocument();
  });
});
