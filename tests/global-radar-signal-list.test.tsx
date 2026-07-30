import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { GlobalRadarSignalList } from "../app/components/global-radar/GlobalRadarSignalList";
import type { GlobalRadarClassSummary } from "../app/components/global-radar/types";

const listPath =
  "/admin/global-demand-radar/direct-demand?country=China&page=2";

const snapshot: GlobalRadarClassSummary = {
  outcome: "listed",
  page: 2,
  pageSize: 25,
  total: 1,
  hasAnySignals: true,
  metrics: {
    class: {
      total: 1,
      highQuality: 1,
      byStatus: { needs_review: 1 },
      india: { explicit: 1, inferred: 0, other: 0 },
      countries: { unitedStates: 0, china: 1, other: 0 },
      requirementMix: { physicalData: 1, hardware: 1 },
      demandFamilies: { robotics_hardware_and_ecosystem_demand: 1 },
      active: 1,
      expiring: 1,
      horizon: {
        within30Days: 0,
        days31To90: 0,
        days91To180: 0,
        days181To365: 0,
        unknown: 0,
      },
      qualified: 0,
    },
    newSignals: 1,
    activeDirectDemand: 1,
    highQualityPrecursors: 0,
    india: { explicit: 1, inferred: 0 },
    countries: { unitedStates: 0, china: 1, other: 0 },
    requirementMix: { physicalData: 1, hardware: 1 },
    capabilityFamilies: [{ capability: "assembly", signals: 1 }],
    expiringDirectDemand: 1,
    promotionCount: 0,
    latestRun: {
      id: "17ca68ae-8840-4fa2-a5e0-951963f028d6",
      status: "succeeded",
      completedAt: "2026-07-30T04:35:00.000Z",
      createdAt: "2026-07-30T04:30:00.000Z",
    },
    sourceErrors: 0,
    mergedDuplicates: 0,
  },
  items: [
    {
      id: "17ca68ae-8840-4fa2-a5e0-951963f028d5",
      signalClass: "direct_demand",
      title: "Public manufacturing partner request",
      factualSummary: "A fictional public supplier page requests assembly partners.",
      theme: "robotics_manufacturing",
      demandDomain: "robotics_hardware_and_ecosystem_demand",
      sourceCountry: "China",
      indiaRelevanceType: "explicit_India",
      status: "needs_review",
      score: 82,
      observedAt: "2026-07-30T04:30:00.000Z",
      expiresAt: "2026-08-30T04:30:00.000Z",
      reobserveBy: null,
      revision: 3,
      organisation: {
        id: "89ef0f37-c99b-40f6-9c9f-4d809551f4f5",
        canonicalName: "Fictional Robotics Example",
        headquartersCountry: "China",
      },
    },
  ],
};

describe("GlobalRadarSignalList", () => {
  it("renders exact class and overview metrics, filters, desktop rows, cards, and canonical detail links", () => {
    render(
      <GlobalRadarSignalList
        action="/admin/global-demand-radar/direct-demand"
        canonicalListPath={listPath}
        filters={{ country: "China", page: "2" }}
        signalClass="direct_demand"
        snapshot={snapshot}
      />,
    );

    const classMetrics = screen.getByRole("group", { name: "Direct Demand class metrics" });
    expect(within(classMetrics).getByText("Active direct demands")).toBeVisible();
    expect(within(classMetrics).queryByText("82", { exact: false })).not.toBeInTheDocument();
    const overview = screen.getByRole("group", { name: "Radar overview metrics" });
    expect(within(overview).getByText("New signals today")).toBeVisible();
    expect(within(overview).getByText("Capability · Assembly")).toBeVisible();
    expect(within(overview).getByText("Latest run")).toBeVisible();

    const search = screen.getByRole("search", { name: "Filter Direct Demand signals" });
    expect(within(search).getByLabelText("Country")).toHaveValue("China");
    expect(within(search).getByLabelText("Country")).toHaveAttribute("name", "country");
    expect(within(search).getByLabelText("Status")).not.toHaveAttribute("name");
    expect(within(search).getByRole("button", { name: "Apply filters" })).toBeVisible();

    const table = screen.getByRole("table", { name: "Direct Demand signals" });
    const cards = screen.getByRole("list", { name: "Direct Demand signal cards" });
    expect(table).toBeVisible();
    expect(cards).toBeVisible();
    const detailLinks = screen.getAllByRole("link", {
      name: "Review Public manufacturing partner request",
    });
    expect(detailLinks).toHaveLength(2);
    const expectedHref = `/admin/global-demand-radar/signals/17ca68ae-8840-4fa2-a5e0-951963f028d5?returnTo=${encodeURIComponent(listPath)}`;
    expect(detailLinks[0]).toHaveAttribute("href", expectedHref);
    expect(screen.getAllByText("Fictional Robotics Example")).toHaveLength(2);
    expect(screen.getAllByText("Robotics manufacturing").length).toBeGreaterThan(0);
    expect(within(table).getByText("Needs review")).toBeVisible();
    expect(within(cards).getByText("Needs review")).toBeVisible();
  });

  it("adds names only to nonblank filter controls so strict GET parsing remains usable", async () => {
    const user = userEvent.setup();
    render(
      <GlobalRadarSignalList
        action="/admin/global-demand-radar/direct-demand"
        canonicalListPath="/admin/global-demand-radar/direct-demand"
        filters={{}}
        signalClass="direct_demand"
        snapshot={{ ...snapshot, page: 1, total: 0, items: [] }}
      />,
    );

    const country = screen.getByLabelText("Country");
    expect(country).not.toHaveAttribute("name");
    await user.type(country, "Japan");
    expect(country).toHaveAttribute("name", "country");
    await user.clear(country);
    expect(country).not.toHaveAttribute("name");
  });

  it("distinguishes an honest empty Radar from empty filter results", () => {
    const { rerender } = render(
      <GlobalRadarSignalList
        action="/admin/global-demand-radar/momentum"
        canonicalListPath="/admin/global-demand-radar/momentum"
        filters={{}}
        signalClass="ecosystem_momentum"
        snapshot={{
          ...snapshot,
          page: 1,
          total: 0,
          hasAnySignals: false,
          items: [],
        }}
      />,
    );
    expect(screen.getByText("No Momentum signals have been recorded yet.")).toBeVisible();

    rerender(
      <GlobalRadarSignalList
        action="/admin/global-demand-radar/momentum"
        canonicalListPath="/admin/global-demand-radar/momentum?country=Japan"
        filters={{ country: "Japan" }}
        signalClass="ecosystem_momentum"
        snapshot={{
          ...snapshot,
          page: 1,
          total: 0,
          hasAnySignals: true,
          items: [],
        }}
      />,
    );
    expect(screen.getByText("No Momentum signals match these filters.")).toBeVisible();
  });

  it("preserves validated filters in pagination URLs", () => {
    render(
      <GlobalRadarSignalList
        action="/admin/global-demand-radar/direct-demand"
        canonicalListPath={listPath}
        filters={{ country: "China", page: "2" }}
        signalClass="direct_demand"
        snapshot={{ ...snapshot, total: 80 }}
      />,
    );

    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute(
      "href",
      "/admin/global-demand-radar/direct-demand?country=China",
    );
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      "/admin/global-demand-radar/direct-demand?country=China&page=3",
    );
  });
});
