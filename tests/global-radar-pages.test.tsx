import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import GlobalRadarRootPage from "../app/admin/global-demand-radar/page";
import DirectDemandPage from "../app/admin/global-demand-radar/direct-demand/page";
import DemandPrecursorsPage from "../app/admin/global-demand-radar/demand-precursors/page";
import MomentumPage from "../app/admin/global-demand-radar/momentum/page";
import RadarRunsPage from "../app/admin/global-demand-radar/runs/page";
import RadarWatchlistPage from "../app/admin/global-demand-radar/watchlist/page";
import {
  parseGlobalRadarListQuery,
  parseGlobalRadarPageQuery,
  safeGlobalRadarReturnTo,
} from "../app/admin/global-demand-radar/page-support";
import { GlobalRadarTabs } from "../app/components/global-radar/GlobalRadarTabs";
import { getGlobalRadarApplication } from "../app/server/global-radar";
import { getCurrentSession } from "../app/server/session";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("../app/server/session", () => ({ getCurrentSession: vi.fn() }));
vi.mock("../app/server/global-radar", () => ({
  getGlobalRadarApplication: vi.fn(),
}));

const tabs = [
  ["Direct Demand", "/admin/global-demand-radar/direct-demand"],
  ["Demand Precursors", "/admin/global-demand-radar/demand-precursors"],
  ["Momentum", "/admin/global-demand-radar/momentum"],
  ["Watchlist", "/admin/global-demand-radar/watchlist"],
  ["Radar Runs", "/admin/global-demand-radar/runs"],
] as const;

const actor = {
  userId: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
};

const adminSession = {
  session: { id: "session", expiresAt: new Date("2026-08-15T00:00:00.000Z") },
  user: { id: actor.userId, email: actor.email, name: "Admin" },
};

const emptyMetrics = {
  class: {
    total: 0,
    highQuality: 0,
    byStatus: {},
    india: { explicit: 0, inferred: 0, other: 0 },
    countries: { unitedStates: 0, china: 0, other: 0 },
    requirementMix: { physicalData: 0, hardware: 0 },
    demandFamilies: {},
    active: 0,
    expiring: 0,
    horizon: {
      within30Days: 0,
      days31To90: 0,
      days91To180: 0,
      days181To365: 0,
      unknown: 0,
    },
    qualified: 0,
  },
  newSignals: 0,
  activeDirectDemand: 0,
  highQualityPrecursors: 0,
  india: { explicit: 0, inferred: 0 },
  countries: { unitedStates: 0, china: 0, other: 0 },
  requirementMix: { physicalData: 0, hardware: 0 },
  capabilityFamilies: [],
  expiringDirectDemand: 0,
  promotionCount: 0,
  latestRun: null,
  sourceErrors: 0,
  mergedDuplicates: 0,
};

const classSummary = {
  outcome: "listed" as const,
  page: 1,
  pageSize: 25,
  total: 0,
  hasAnySignals: false,
  items: [],
  metrics: emptyMetrics,
};

function adminDouble(overrides: Record<string, unknown> = {}) {
  return {
    getSignalDetail: vi.fn(async () => ({ outcome: "invalid" as const })),
    getClassSummary: vi.fn(async () => classSummary),
    listWatchlist: vi.fn(async () => ({
      outcome: "listed" as const,
      page: 1,
      pageSize: 25,
      total: 0,
      entries: [],
    })),
    listRuns: vi.fn(async (_actor, value) =>
      value === null
        ? { outcome: "invalid" as const }
        : {
            outcome: "listed" as const,
            page: 1,
            pageSize: 25,
            total: 0,
            runs: [],
          }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentSession).mockResolvedValue(adminSession);
  vi.mocked(getGlobalRadarApplication).mockReturnValue({
    admin: adminDouble(),
  } as never);
});

describe("Global Radar pages", () => {
  it("redirects the Radar root to the Direct Demand tab", async () => {
    await expect(GlobalRadarRootPage()).rejects.toThrow(
      "redirect:/admin/global-demand-radar/direct-demand",
    );
  });

  it("renders the five deep links in approved order with one current page", () => {
    render(<GlobalRadarTabs current="demand-precursors" />);

    const navigation = screen.getByRole("navigation", {
      name: "Global Demand Radar sections",
    });
    const links = within(navigation).getAllByRole("link");
    expect(links).toHaveLength(tabs.length);
    tabs.forEach(([label, href], index) => {
      expect(links[index]).toHaveAccessibleName(label);
      expect(links[index]).toHaveAttribute("href", href);
    });
    expect(within(navigation).getByRole("link", { current: "page" })).toHaveTextContent(
      "Demand Precursors",
    );
  });

  it("uses ordinary navigation links, not client-side tab widgets", () => {
    render(<GlobalRadarTabs current="direct-demand" />);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });

  it("parses strict class filters and emits one fixed-order canonical URL", () => {
    expect(
      parseGlobalRadarListQuery("direct_demand", {
        page: "2",
        observedTo: "2026-07-30",
        observedFrom: "2026-07-01",
        country: "China",
        status: "needs_review",
        indiaRelevance: "explicit_India",
        demandDomain: "robotics_hardware_and_ecosystem_demand",
        capability: "assembly",
        expiresBefore: "2026-08-31",
      }),
    ).toEqual({
      filters: {
        status: "needs_review",
        country: "China",
        indiaRelevance: "explicit_India",
        demandDomain: "robotics_hardware_and_ecosystem_demand",
        capability: "assembly",
        observedFrom: "2026-07-01",
        observedTo: "2026-07-30",
        expiresBefore: "2026-08-31",
        page: "2",
      },
      serviceFilters: {
        status: "needs_review",
        country: "China",
        indiaRelevance: "explicit_India",
        demandDomain: "robotics_hardware_and_ecosystem_demand",
        capability: "assembly",
        observedFrom: "2026-07-01",
        observedTo: "2026-07-30",
        expiresBefore: "2026-08-31",
        page: "2",
      },
      canonicalPath:
        "/admin/global-demand-radar/direct-demand?status=needs_review&country=China&indiaRelevance=explicit_India&demandDomain=robotics_hardware_and_ecosystem_demand&capability=assembly&observedFrom=2026-07-01&observedTo=2026-07-30&expiresBefore=2026-08-31&page=2",
    });
  });

  it("accepts one calendar day as an inclusive observed-through range", () => {
    expect(parseGlobalRadarListQuery("direct_demand", {
      observedFrom: "2026-07-30",
      observedTo: "2026-07-30",
    })).toMatchObject({
      serviceFilters: {
        observedFrom: "2026-07-30",
        observedTo: "2026-07-30",
      },
      canonicalPath:
        "/admin/global-demand-radar/direct-demand?observedFrom=2026-07-30&observedTo=2026-07-30",
    });
  });

  it.each([
    { unknown: "value" },
    { status: ["qualified", "monitoring"] },
    { country: "" },
    { country: " x" },
    { country: "x".repeat(201) },
    { status: "not_a_status" },
    { indiaRelevance: "India" },
    { demandDomain: "not_a_domain" },
    { capability: "not_a_capability" },
    { observedFrom: "2026-02-30" },
    { observedFrom: "2026-07-31", observedTo: "2026-07-30" },
    { expiresBefore: "2026-13-01" },
    { page: "0" },
    { page: "01" },
    { page: "101" },
  ])("rejects invalid or non-canonical signal filters %#", (query) => {
    expect(parseGlobalRadarListQuery("direct_demand", query)).toBeNull();
  });

  it.each([
    { page: "" },
    { page: ["1", "2"] },
    { page: "101" },
    { unknown: "1" },
  ])("rejects invalid Watchlist and Runs page queries %#", (query) => {
    expect(parseGlobalRadarPageQuery("watchlist", query)).toBeNull();
    expect(parseGlobalRadarPageQuery("runs", query)).toBeNull();
  });

  it("accepts only canonical Radar list return paths and rejects origin escapes", () => {
    const fallback = "/admin/global-demand-radar/demand-precursors";
    expect(
      safeGlobalRadarReturnTo(
        "/admin/global-demand-radar/direct-demand?country=China&page=2",
        fallback,
      ),
    ).toBe("/admin/global-demand-radar/direct-demand?country=China&page=2");
    expect(
      safeGlobalRadarReturnTo(
        "/admin/global-demand-radar/direct-demand?page=2&country=China",
        fallback,
      ),
    ).toBe("/admin/global-demand-radar/direct-demand?country=China&page=2");

    for (const unsafe of [
      "https://evil.example/admin/global-demand-radar/direct-demand",
      "//evil.example/admin/global-demand-radar/direct-demand",
      "\\\\evil.example\\admin\\global-demand-radar\\direct-demand",
      "%2F%2Fevil.example",
      "/admin/global-demand-radar/signals/00000000-0000-4000-8000-000000000001",
      "/admin/global-demand-radar/direct-demand?unknown=1",
    ]) {
      expect(safeGlobalRadarReturnTo(unsafe, fallback)).toBe(fallback);
    }
  });

  it("authenticates before parsing filters and redirects signed-out visitors", async () => {
    vi.mocked(getCurrentSession).mockResolvedValue(null);

    await expect(
      DirectDemandPage({ searchParams: Promise.resolve({ unknown: "private" }) }),
    ).rejects.toThrow("redirect:/login");
    expect(getGlobalRadarApplication).not.toHaveBeenCalled();
  });

  it("uses service-owned authorization before parsing or loading for non-admins", async () => {
    const getClassSummary = vi.fn();
    const getSignalDetail = vi.fn(async () => ({ outcome: "forbidden" as const }));
    vi.mocked(getGlobalRadarApplication).mockReturnValue({
      admin: adminDouble({ getSignalDetail, getClassSummary }),
    } as never);

    await expect(
      DirectDemandPage({ searchParams: Promise.resolve({ unknown: "private" }) }),
    ).rejects.toThrow("redirect:/dashboard");
    expect(getSignalDetail).toHaveBeenCalledWith(actor, null);
    expect(getClassSummary).not.toHaveBeenCalled();
  });

  it("loads a canonical class summary and keeps Radar current in shared admin chrome", async () => {
    const getClassSummary = vi.fn(async () => classSummary);
    vi.mocked(getGlobalRadarApplication).mockReturnValue({
      admin: adminDouble({ getClassSummary }),
    } as never);

    render(
      await DirectDemandPage({
        searchParams: Promise.resolve({
          country: "China",
          observedFrom: "2026-07-01",
          observedTo: "2026-07-30",
        }),
      }),
    );

    expect(getClassSummary).toHaveBeenCalledWith(actor, {
      signalClass: "direct_demand",
      filters: {
        country: "China",
        observedFrom: "2026-07-01",
        observedTo: "2026-07-30",
      },
    });
    expect(
      screen.getByRole("link", { name: "Global Demand Radar", current: "page" }),
    ).toBeVisible();
    expect(
      within(screen.getByRole("navigation", { name: "Global Demand Radar sections" }))
        .getByRole("link", { name: "Direct Demand", current: "page" }),
    ).toBeVisible();
  });

  it("provides all five authorized destination adapters", async () => {
    const pages = [
      [DemandPrecursorsPage, "Demand Precursors"],
      [MomentumPage, "Momentum"],
      [RadarWatchlistPage, "Watchlist"],
      [RadarRunsPage, "Radar Runs"],
    ] as const;

    for (const [Page, current] of pages) {
      const { unmount } = render(
        await Page({ searchParams: Promise.resolve({}) }),
      );
      expect(
        within(screen.getByRole("navigation", { name: "Global Demand Radar sections" }))
          .getByRole("link", { name: current, current: "page" }),
      ).toBeVisible();
      unmount();
    }
  });
});
