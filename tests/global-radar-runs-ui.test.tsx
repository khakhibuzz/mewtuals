import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { GlobalRadarRuns } from "../app/components/global-radar/GlobalRadarRuns";
import type { GlobalRadarRunItem } from "../app/components/global-radar/types";

const run: GlobalRadarRunItem = {
  id: "17ca68ae-8840-4fa2-a5e0-951963f028d5",
  status: "partial",
  trigger: "scheduled",
  scanMode: "daily",
  createdAt: "2026-07-30T04:30:00.000Z",
  startedAt: "2026-07-30T04:31:00.000Z",
  completedAt: "2026-07-30T04:35:00.000Z",
  resultsExamined: 20,
  entitiesObserved: 4,
  signalsFound: 2,
  numberNew: 1,
  numberUpdated: 1,
  numberDuplicates: 0,
  sourceErrorCount: 1,
  notice: "1 source error",
};

afterEach(() => vi.unstubAllGlobals());

describe("GlobalRadarRuns", () => {
  it("renders only bounded safe run operations and no worker controls", () => {
    render(<GlobalRadarRuns initialRuns={[run]} approvedThemes={["robot_teleoperation"]} />);

    const row = screen.getByRole("region", { name: "Radar run 17ca68ae-8840-4fa2-a5e0-951963f028d5" });
    expect(within(row).getByText("Partial")).toBeVisible();
    expect(within(row).getByText("Scheduled · Daily")).toBeVisible();
    expect(within(row).getByText("1 source error")).toBeVisible();
    expect(screen.queryByText(/lease/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /claim/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("queues a manual run with a client UUID and optional approved theme", async () => {
    const user = userEvent.setup();
    const requestId = "89ef0f37-c99b-40f6-9c9f-4d809551f4f5";
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => requestId) });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, run: { ...run, id: requestId, trigger: "manual", scanMode: "manual" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<GlobalRadarRuns initialRuns={[]} approvedThemes={["robot_teleoperation"]} />);

    await user.selectOptions(screen.getByLabelText("Optional theme"), "robot_teleoperation");
    await user.click(screen.getByRole("button", { name: "Queue manual Radar run" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/global-demand-radar/runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ requestId, theme: "robot_teleoperation" }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Manual Radar run queued.");
    expect(screen.getByText("Manual · Manual")).toBeVisible();
  });

  it("reuses the same request UUID after unknown network success", async () => {
    const user = userEvent.setup();
    const requestId = "89ef0f37-c99b-40f6-9c9f-4d809551f4f5";
    const randomUUID = vi.fn(() => requestId);
    vi.stubGlobal("crypto", { randomUUID });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("unknown"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, run }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<GlobalRadarRuns initialRuns={[]} approvedThemes={[]} />);

    await user.click(screen.getByRole("button", { name: "Queue manual Radar run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("outcome is unknown");
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry manual Radar run" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Retry manual Radar run" }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).requestId).toBe(requestId);
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string).requestId).toBe(requestId);
    expect(randomUUID).toHaveBeenCalledTimes(1);
  });
});
