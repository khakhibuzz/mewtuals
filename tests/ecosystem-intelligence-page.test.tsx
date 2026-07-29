import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import EcosystemIntelligenceAdminPage from "../app/admin/ecosystem-intelligence/page";
import { getEcosystemIntelligenceService } from "../app/server/ecosystem-intelligence";
import { getCurrentSession } from "../app/server/session";

const { redirectMock, serializeMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  serializeMock: vi.fn(() => ({
    generatedAt: "2026-07-29T08:30:00.000Z",
    population: { total: 3, fingerprint: "fixture" },
  })),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("../app/server/session", () => ({ getCurrentSession: vi.fn() }));
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
});

describe("Ecosystem Intelligence administrator page", () => {
  it("redirects signed-out visitors to login", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);
    await expect(EcosystemIntelligenceAdminPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("redirect:/login");
  });

  it("redirects signed-in non-administrators to the member dashboard", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(session);
    vi.mocked(getEcosystemIntelligenceService).mockReturnValue({
      getSnapshot: vi.fn(async () => ({ ok: false, status: 403, error: "No." })),
    } as never);

    await expect(EcosystemIntelligenceAdminPage({ searchParams: Promise.resolve({}) }))
      .rejects.toThrow("redirect:/dashboard");
  });

  it("redirects invalid and noncanonical filters to the canonical workspace URL", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(session);
    const getSnapshot = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 400, error: "Invalid." })
      .mockResolvedValueOnce({ ok: true, filters, snapshot: { private: true } });
    vi.mocked(getEcosystemIntelligenceService).mockReturnValue({ getSnapshot } as never);

    await expect(EcosystemIntelligenceAdminPage({
      searchParams: Promise.resolve({ participantType: "person" }),
    })).rejects.toThrow("redirect:/admin/ecosystem-intelligence");
    await expect(EcosystemIntelligenceAdminPage({
      searchParams: Promise.resolve({ page: "1" }),
    })).rejects.toThrow("redirect:/admin/ecosystem-intelligence");
  });

  it("renders a retryable safe error inside the wide admin shell", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(session);
    vi.mocked(getEcosystemIntelligenceService).mockReturnValue({
      getSnapshot: vi.fn(async () => ({ ok: false, status: 500, error: "Safe." })),
    } as never);

    render(await EcosystemIntelligenceAdminPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("alert")).toHaveTextContent("could not load Ecosystem Intelligence");
    expect(screen.getByRole("link", { name: "Retry" })).toHaveAttribute(
      "href",
      "/admin/ecosystem-intelligence",
    );
    expect(screen.getByRole("link", { name: "Discovery" })).toBeInTheDocument();
  });

  it("server-renders the first safe snapshot and canonical query", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(session);
    vi.mocked(getEcosystemIntelligenceService).mockReturnValue({
      getSnapshot: vi.fn(async () => ({ ok: true, filters, snapshot: { private: true } })),
    } as never);

    render(await EcosystemIntelligenceAdminPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Ecosystem intelligence." })).toBeInTheDocument();
    expect(screen.getByText("3 Physical AI participants in this view.")).toBeInTheDocument();
    expect(screen.getByTestId("ecosystem-initial-snapshot")).toHaveAttribute(
      "data-canonical-query",
      "",
    );
    expect(serializeMock).toHaveBeenCalledWith({ private: true });
  });
});
