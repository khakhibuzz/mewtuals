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
  startedAt: "2026-07-30T04:31:00.000Z",
  completedAt: "2026-07-30T04:35:00.000Z",
  sourceCountries: ["United States", "China"],
  sourceLanguages: ["en", "zh-CN"],
  targetDomains: ["robotics_hardware_and_ecosystem_demand"],
  targetSignalTypes: ["supplier_registration"],
  sourcesUsed: ["official_company_material"],
  counts: {
    resultsExamined: 20,
    entitiesObserved: 4,
    signalsFound: 2,
    directDemands: 1,
    precursors: 1,
    momentumRecords: 0,
    new: 1,
    updated: 1,
    duplicates: 0,
    rejectedForWeakEvidence: 3,
    sourceErrors: 1,
  },
  notices: [
    {
      code: "source_errors",
      message: "One or more public sources could not be processed.",
      count: 1,
    },
  ],
  createdAt: "2026-07-30T04:30:00.000Z",
  updatedAt: "2026-07-30T04:35:00.000Z",
};

afterEach(() => vi.unstubAllGlobals());

describe("GlobalRadarRuns", () => {
  it("renders the exact nested safe run DTO and no worker controls", () => {
    render(
      <GlobalRadarRuns
        initialRuns={[run]}
        approvedThemes={["robot_teleoperation_demonstrations"]}
      />,
    );

    const row = screen.getByRole("region", { name: "Radar run 17ca68ae-8840-4fa2-a5e0-951963f028d5" });
    expect(within(row).getByText("Partial")).toBeVisible();
    expect(within(row).getByText("Scheduled · Daily")).toBeVisible();
    expect(within(row).getByText("One or more public sources could not be processed.")).toBeVisible();
    expect(within(row).getByText("1 source error", { exact: false })).toBeVisible();
    expect(
      within(row).getByText("New / updated / duplicate").parentElement,
    ).toHaveTextContent("1 / 1 / 0");
    expect(within(row).getByText("United States, China")).toBeVisible();
    expect(screen.queryByText(/lease token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /claim/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/payload/i)).not.toBeInTheDocument();
  });

  it("queues an exact manual request with an optional approved theme and terminal outcome", async () => {
    const user = userEvent.setup();
    const requestId = "89ef0f37-c99b-40f6-9c9f-4d809551f4f5";
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => requestId) });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          outcome: "queued",
          run: { ...run, id: requestId, trigger: "manual", scanMode: "manual" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <GlobalRadarRuns
        initialRuns={[]}
        approvedThemes={["robot_teleoperation_demonstrations"]}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Optional theme"),
      "robot_teleoperation_demonstrations",
    );
    await user.click(screen.getByRole("button", { name: "Queue manual Radar run" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/global-demand-radar/runs",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          theme: "robot_teleoperation_demonstrations",
        }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Manual Radar run queued.");
    expect(screen.getByText("Manual · Manual")).toBeVisible();
  });

  it("omits the optional theme instead of sending null", async () => {
    const user = userEvent.setup();
    const requestId = "89ef0f37-c99b-40f6-9c9f-4d809551f4f5";
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => requestId) });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, outcome: "replayed", run }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<GlobalRadarRuns initialRuns={[]} approvedThemes={[]} />);

    await user.click(screen.getByRole("button", { name: "Queue manual Radar run" }));

    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ requestId });
    expect(await screen.findByRole("status")).toHaveTextContent("already queued");
  });

  it("reuses one request UUID after network or malformed unknown success and rotates only after terminal success", async () => {
    const user = userEvent.setup();
    const firstId = "89ef0f37-c99b-40f6-9c9f-4d809551f4f5";
    const secondId = "89ef0f37-c99b-40f6-9c9f-4d809551f4f6";
    const randomUUID = vi.fn()
      .mockReturnValueOnce(firstId)
      .mockReturnValueOnce(secondId);
    vi.stubGlobal("crypto", { randomUUID });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("unknown"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, outcome: "queued", run }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, outcome: "queued", run }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <GlobalRadarRuns
        initialRuns={[]}
        approvedThemes={["robot_teleoperation_demonstrations"]}
      />,
    );

    await user.selectOptions(
      screen.getByLabelText("Optional theme"),
      "robot_teleoperation_demonstrations",
    );
    await user.click(screen.getByRole("button", { name: "Queue manual Radar run" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("outcome is unknown");
    expect(screen.getByLabelText("Optional theme")).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Retry same manual request" })).toBeEnabled(),
    );
    await user.click(screen.getByRole("button", { name: "Retry same manual request" }));
    expect(await screen.findByRole("status")).toHaveTextContent("queued");
    await user.click(screen.getByRole("button", { name: "Queue manual Radar run" }));

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchMock.mock.calls[1]![1]!.body as string)).toEqual(
      JSON.parse(fetchMock.mock.calls[0]![1]!.body as string),
    );
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).requestId).toBe(firstId);
    expect(JSON.parse(fetchMock.mock.calls[2]![1]!.body as string).requestId).toBe(secondId);
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });
});
