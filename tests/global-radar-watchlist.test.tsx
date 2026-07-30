import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalRadarWatchlist } from "../app/components/global-radar/GlobalRadarWatchlist";
import type { GlobalRadarWatchlistItem } from "../app/components/global-radar/types";

const item: GlobalRadarWatchlistItem = {
  entity: {
    id: "89ef0f37-c99b-40f6-9c9f-4d809551f4f5",
    canonicalName: "Fictional Robotics Example",
    headquartersCountry: "United States",
  },
  latestSignal: {
    id: "17ca68ae-8840-4fa2-a5e0-951963f028d5",
    title: "New public deployment",
    signalClass: "demand_precursor",
    status: "monitoring",
    observedAt: "2026-07-30T04:30:00.000Z",
  },
  monitoringState: "active",
  priority: 3,
  cadence: "weekly",
  nextScanAt: "2026-08-02T04:30:00.000Z",
  expiresAt: null,
  promotionState: "not_promoted",
  revision: 7,
};

afterEach(() => vi.unstubAllGlobals());

describe("GlobalRadarWatchlist", () => {
  it("renders monitoring, latest-signal, expiry, and promotion context", () => {
    render(<GlobalRadarWatchlist initialItems={[item]} />);

    const region = screen.getByRole("region", { name: "Fictional Robotics Example" });
    expect(within(region).getByText("New public deployment")).toBeVisible();
    expect(within(region).getByText("Active")).toBeVisible();
    expect(within(region).getByText("Weekly")).toBeVisible();
    expect(within(region).getByText("Not promoted")).toBeVisible();
    expect(within(region).getByText("No watchlist expiry")).toBeVisible();
  });

  it("sends a revision-bearing command, locks controls, and refreshes returned state", async () => {
    const user = userEvent.setup();
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(() =>
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<GlobalRadarWatchlist initialItems={[item]} />);

    await user.click(screen.getByRole("button", { name: "Pause Fictional Robotics Example" }));
    expect(screen.getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/global-demand-radar/entities/89ef0f37-c99b-40f6-9c9f-4d809551f4f5/watchlist",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "pause", revision: 7 }),
      }),
    );

    resolveResponse(
      new Response(
        JSON.stringify({ ok: true, watchlist: { ...item, monitoringState: "paused", revision: 8 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Watchlist updated.");
    expect(screen.getByText("Paused")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("button", { name: "Resume Fictional Robotics Example" })).toBeEnabled());
  });

  it("adopts the latest safe state from a conflict response", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: "The watchlist entry changed. Review the latest state.",
            watchlist: { ...item, priority: 5, revision: 9 },
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<GlobalRadarWatchlist initialItems={[item]} />);

    await user.click(screen.getByRole("button", { name: "Pause Fictional Robotics Example" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("changed");
    expect(screen.getByText("Priority 5")).toBeVisible();
  });
});
