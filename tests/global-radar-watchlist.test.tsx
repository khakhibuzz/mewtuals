import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalRadarWatchlist } from "../app/components/global-radar/GlobalRadarWatchlist";
import type { GlobalRadarWatchlistItem } from "../app/components/global-radar/types";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const item: GlobalRadarWatchlistItem = {
  id: "00000000-0000-4000-8000-000000000007",
  globalEntityId: "89ef0f37-c99b-40f6-9c9f-4d809551f4f5",
  state: "enabled",
  priority: 30,
  theme: "robotics_manufacturing",
  category: "contract_manufacturing",
  categorySearchTermEn: "robot contract manufacturing",
  categorySearchTermZhCn: "机器人合同制造",
  countries: ["United States", "China"],
  languages: ["en", "zh-CN"],
  cadenceDays: 7,
  nextScanAt: "2026-08-02T04:30:00.000Z",
  reason: "Monitor public manufacturing demand.",
  revision: 7,
  entity: {
    canonicalName: "Fictional Robotics Example",
    headquartersCountry: "United States",
    entityStatus: "active",
    revision: 10,
  },
  latestSignal: {
    id: "17ca68ae-8840-4fa2-a5e0-951963f028d5",
    signalClass: "demand_precursor",
    title: "New public deployment",
    factualSummary: "A public deployment was announced.",
    theme: "robotics_manufacturing",
    sourceCountry: "United States",
    demandDomain: "robotics_hardware_and_ecosystem_demand",
    indiaRelevanceType: "globally_open",
    status: "monitoring",
    score: 74,
    expiresAt: null,
    reobserveBy: "2026-08-15T04:30:00.000Z",
    observedAt: "2026-07-30T04:30:00.000Z",
    revision: 4,
    organisation: {
      id: "89ef0f37-c99b-40f6-9c9f-4d809551f4f5",
      canonicalName: "Fictional Robotics Example",
      headquartersCountry: "United States",
    },
  },
  expiry: {
    expiresAt: null,
    reobserveBy: "2026-08-15T04:30:00.000Z",
  },
  promotion: null,
};

const mutationEntity = {
  id: item.globalEntityId,
  canonicalName: item.entity.canonicalName,
  headquartersCountry: item.entity.headquartersCountry,
  entityStatus: item.entity.entityStatus,
  revision: 11,
};

function mutationEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: item.id,
    globalEntityId: item.globalEntityId,
    state: item.state,
    priority: item.priority,
    theme: item.theme,
    category: item.category,
    categorySearchTermEn: item.categorySearchTermEn,
    categorySearchTermZhCn: item.categorySearchTermZhCn,
    countries: item.countries,
    languages: item.languages,
    cadenceDays: item.cadenceDays,
    nextScanAt: item.nextScanAt,
    reason: "Paused after administrator review.",
    revision: 8,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", {
    randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000099"),
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("GlobalRadarWatchlist", () => {
  it("renders exact monitoring configuration, latest signal, expiry, and promotion context", () => {
    render(
      <GlobalRadarWatchlist
        approvedThemes={["robotics_manufacturing"]}
        initialItems={[item]}
      />,
    );

    const region = screen.getByRole("region", { name: "Fictional Robotics Example" });
    expect(within(region).getByText("New public deployment")).toBeVisible();
    expect(within(region).getByText("Enabled")).toBeVisible();
    expect(within(region).getByText("Priority 30")).toBeVisible();
    expect(within(region).getByText("Every 7 days")).toBeVisible();
    expect(within(region).getByText("Not promoted")).toBeVisible();
    expect(within(region).getByText(/Re-observe/)).toBeVisible();
    expect(within(region).getByLabelText("English search term")).toHaveValue(
      "robot contract manufacturing",
    );
    expect(within(region).getByLabelText("Chinese search term")).toHaveValue(
      "机器人合同制造",
    );
  });

  it("sends the exact revision-bearing full configuration, locks controls, and refreshes terminal state", async () => {
    const user = userEvent.setup();
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(() =>
      new Promise<Response>((resolve) => {
        resolveResponse = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <GlobalRadarWatchlist
        approvedThemes={["robotics_manufacturing"]}
        initialItems={[item]}
      />,
    );

    await user.clear(screen.getByLabelText("Update reason"));
    await user.type(screen.getByLabelText("Update reason"), "Paused after administrator review.");
    await user.click(screen.getByRole("button", { name: "Pause Fictional Robotics Example" }));
    expect(screen.getAllByRole("button").every((button) => button.hasAttribute("disabled"))).toBe(
      true,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/global-demand-radar/entities/89ef0f37-c99b-40f6-9c9f-4d809551f4f5/watchlist",
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity: {
            type: "existing",
            entityId: item.globalEntityId,
            expectedRevision: 10,
          },
          expectedEntryRevision: 7,
          idempotencyKey: "00000000-0000-4000-8000-000000000099",
          reason: "Paused after administrator review.",
          configuration: {
            state: "paused",
            priority: 30,
            theme: "robotics_manufacturing",
            category: "contract_manufacturing",
            categorySearchTermEn: "robot contract manufacturing",
            categorySearchTermZhCn: "机器人合同制造",
            countries: ["United States", "China"],
            languages: ["en", "zh-CN"],
            cadenceDays: 7,
            nextScanAt: "2026-08-02T04:30:00.000Z",
          },
        }),
      }),
    );

    resolveResponse(
      new Response(
        JSON.stringify({
          ok: true,
          outcome: "updated",
          entity: mutationEntity,
          entry: mutationEntry({ state: "paused" }),
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Watchlist updated.");
    expect(screen.getByText("Paused")).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Enable Fictional Robotics Example" }),
      ).toBeEnabled(),
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("adopts safe revision-bearing conflict state and focuses the review path", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            outcome: "conflict",
            reason: "revision_mismatch",
            entity: { ...mutationEntity, revision: 12 },
            entry: mutationEntry({ priority: 55, revision: 9 }),
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(
      <GlobalRadarWatchlist
        approvedThemes={["robotics_manufacturing"]}
        initialItems={[item]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Pause Fictional Robotics Example" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("changed");
    expect(alert).toHaveFocus();
    expect(screen.getByText("Priority 55")).toBeVisible();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("does not adopt a shape-valid DTO from a mismatched success outcome", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            outcome: "promoted",
            entity: { ...mutationEntity, revision: 12 },
            entry: mutationEntry({ priority: 99, revision: 9 }),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(
      <GlobalRadarWatchlist
        approvedThemes={["robotics_manufacturing"]}
        initialItems={[item]}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Pause Fictional Robotics Example" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("invalid response");
    expect(screen.getByText("Priority 30")).toBeVisible();
    expect(screen.queryByText("Priority 99")).not.toBeInTheDocument();
    expect(refreshMock).not.toHaveBeenCalled();
  });
});
