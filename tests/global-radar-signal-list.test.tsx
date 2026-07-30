import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GlobalRadarSignalList } from "../app/components/global-radar/GlobalRadarSignalList";
import type { GlobalRadarSignalListSnapshot } from "../app/components/global-radar/types";

const listPath =
  "/admin/global-demand-radar/direct-demand?country=China&page=2";

const snapshot: GlobalRadarSignalListSnapshot = {
  classLabel: "Direct Demand",
  hasAnySignals: true,
  total: 1,
  page: 2,
  pageSize: 25,
  metrics: [
    { id: "active", label: "Active direct demands", value: 1 },
    { id: "india", label: "Explicit India signals", value: 1 },
  ],
  items: [
    {
      id: "17ca68ae-8840-4fa2-a5e0-951963f028d5",
      signalClass: "direct_demand",
      title: "Public manufacturing partner request",
      factualSummary: "A fictional public supplier page requests assembly partners.",
      demandDomain: "robotics_hardware",
      sourceCountry: "China",
      indiaRelevanceType: "explicit_India",
      status: "needs_review",
      score: 82,
      observedAt: "2026-07-30T04:30:00.000Z",
      expiresAt: "2026-08-30T04:30:00.000Z",
      reobserveBy: null,
      revision: 3,
      entity: {
        id: "89ef0f37-c99b-40f6-9c9f-4d809551f4f5",
        canonicalName: "Fictional Robotics Example",
        headquartersCountry: "China",
      },
    },
  ],
};

describe("GlobalRadarSignalList", () => {
  it("renders semantic metrics, filters, desktop rows, complete cards, and canonical detail links", () => {
    render(
      <GlobalRadarSignalList
        action="/admin/global-demand-radar/direct-demand"
        canonicalListPath={listPath}
        filters={{ country: "China", page: "2" }}
        snapshot={snapshot}
      />,
    );

    const metrics = screen.getByRole("group", { name: "Direct Demand metrics" });
    expect(within(metrics).getByText("Active direct demands")).toBeVisible();
    expect(within(metrics).queryByText("82", { exact: false })).not.toBeInTheDocument();

    const search = screen.getByRole("search", { name: "Filter Direct Demand signals" });
    expect(within(search).getByLabelText("Country")).toHaveValue("China");
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
    expect(within(table).getByText("Needs review")).toBeVisible();
    expect(within(cards).getByText("Needs review")).toBeVisible();
  });

  it("distinguishes an honest empty Radar from empty filter results", () => {
    const { rerender } = render(
      <GlobalRadarSignalList
        action="/admin/global-demand-radar/momentum"
        canonicalListPath="/admin/global-demand-radar/momentum"
        filters={{}}
        snapshot={{
          classLabel: "Momentum",
          hasAnySignals: false,
          total: 0,
          page: 1,
          pageSize: 25,
          metrics: [],
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
        snapshot={{
          classLabel: "Momentum",
          hasAnySignals: true,
          total: 0,
          page: 1,
          pageSize: 25,
          metrics: [],
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
