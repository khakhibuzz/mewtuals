import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { GlobalRadarTabs } from "../app/components/global-radar/GlobalRadarTabs";

const tabs = [
  ["Direct Demand", "/admin/global-demand-radar/direct-demand"],
  ["Demand Precursors", "/admin/global-demand-radar/demand-precursors"],
  ["Momentum", "/admin/global-demand-radar/momentum"],
  ["Watchlist", "/admin/global-demand-radar/watchlist"],
  ["Radar Runs", "/admin/global-demand-radar/runs"],
] as const;

describe("Global Radar pages", () => {
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
});
