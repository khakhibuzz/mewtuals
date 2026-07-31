import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalRadarSignalDetail } from "../app/components/global-radar/GlobalRadarSignalDetail";
import {
  RADAR_ALLOWED_ACTIONS,
  RADAR_ASSOCIATED_ENTITY_ID,
  RADAR_DUPLICATE_ID,
  RADAR_ENTITY_ID,
  RADAR_SIGNAL_ID,
  globalRadarDetailFixture,
} from "./support/global-radar-ui-data";

const IDEMPOTENCY_KEY = "00000000-0000-4000-8000-000000000099";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", { randomUUID: vi.fn(() => IDEMPOTENCY_KEY) });
});

afterEach(() => vi.unstubAllGlobals());

function renderDetail(options: Parameters<typeof globalRadarDetailFixture>[0] = {}) {
  return render(
    <GlobalRadarSignalDetail
      initialDetail={globalRadarDetailFixture(options) as never}
      returnTo="/admin/global-demand-radar/direct-demand"
    />,
  );
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Global Radar signal actions", () => {
  it("renders controls only from the safe allowedActions list", () => {
    const { rerender } = render(
      <GlobalRadarSignalDetail
        initialDetail={globalRadarDetailFixture({ allowedActions: RADAR_ALLOWED_ACTIONS, includePromotion: true }) as never}
        returnTo="/admin/global-demand-radar/direct-demand"
      />,
    );

    const actions = screen.getByRole("region", { name: "Available administrator actions" });
    for (const name of [
      "Request review",
      "Monitor",
      "Qualify",
      "Dismiss",
      "Expire",
      "Reopen",
      "Mark no India fit",
      "Save classification",
      "Save expiry",
      "Append evidence",
      "Append note",
      "Merge into this signal",
      "Save watchlist",
      "Qualify entity",
      "Promote to India Discovery",
      "Reverse promotion",
    ]) {
      expect(within(actions).getByRole("button", { name })).toBeVisible();
    }

    rerender(
      <GlobalRadarSignalDetail
        initialDetail={globalRadarDetailFixture({ allowedActions: [] }) as never}
        returnTo="/admin/global-demand-radar/direct-demand"
      />,
    );
    expect(screen.queryByRole("region", { name: "Available administrator actions" })).not.toBeInTheDocument();
    expect(screen.getByText("No administrator mutations are currently allowed for this signal.")).toBeVisible();
  });

  it("sends an exact revision-bearing review command and prevents double submit while pending", async () => {
    const user = userEvent.setup();
    let resolveResponse!: (response: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail({ allowedActions: ["qualify"] });

    await user.type(screen.getByLabelText("Review reason"), "Evidence and India fit verified.");
    await user.click(screen.getByRole("button", { name: "Qualify" }));

    expect(screen.getByRole("button", { name: "Qualify" })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/global-demand-radar/signals/${RADAR_SIGNAL_ID}`,
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: 4,
          idempotencyKey: IDEMPOTENCY_KEY,
          reason: "Evidence and India fit verified.",
          command: { type: "qualify" },
        }),
      }),
    );

    resolveResponse(jsonResponse({
      ok: true,
      outcome: "updated",
      detail: globalRadarDetailFixture({ status: "qualified", revision: 5 }),
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("Signal updated.");
    await waitFor(() => expect(screen.getByText("Qualified")).toBeVisible());
  });

  it("replaces detail from 409 and rotates idempotency only for a new reviewed request", async () => {
    const user = userEvent.setup();
    const firstKey = "00000000-0000-4000-8000-000000000099";
    const secondKey = "00000000-0000-4000-8000-000000000100";
    const randomUUID = vi.fn().mockReturnValueOnce(firstKey).mockReturnValueOnce(secondKey);
    vi.stubGlobal("crypto", { randomUUID });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: false,
        outcome: "conflict",
        reason: "revision_mismatch",
        latest: globalRadarDetailFixture({ status: "needs_review", revision: 6, allowedActions: ["qualify"] }),
      }, 409))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        outcome: "updated",
        detail: globalRadarDetailFixture({ status: "qualified", revision: 7, allowedActions: ["qualify"] }),
      }));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail({ allowedActions: ["qualify"] });

    await user.type(screen.getByLabelText("Review reason"), "Qualify current evidence.");
    await user.click(screen.getByRole("button", { name: "Qualify" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("record changed");
    expect(alert).toHaveFocus();
    expect(screen.getByText("Needs review")).toBeVisible();
    expect(screen.getByRole("button", { name: "Review latest state and retry" })).toBeVisible();
    expect(screen.getByLabelText("Review reason")).toHaveValue("");
    await user.type(screen.getByLabelText("Review reason"), "Qualify the latest revision.");
    await user.click(screen.getByRole("button", { name: "Qualify" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Signal updated.");
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toMatchObject({
      expectedRevision: 4,
      idempotencyKey: firstKey,
    });
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string)).toMatchObject({
      expectedRevision: 6,
      idempotencyKey: secondKey,
    });
    expect(randomUUID).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["outcome-mismatched", {
      ok: true,
      outcome: "appended",
      detail: globalRadarDetailFixture({ status: "qualified", revision: 5 }),
    }],
    ["malformed", {
      ok: true,
      outcome: "updated",
      detail: { id: RADAR_SIGNAL_ID, revision: 5 },
    }],
    ["identity-mismatched", {
      ok: true,
      outcome: "updated",
      detail: {
        ...globalRadarDetailFixture({ status: "qualified", revision: 5 }),
        id: RADAR_DUPLICATE_ID,
      },
    }],
  ] as const)(
    "retains an exact request when a successful response is %s",
    async (_contractFailure, invalidResponse) => {
      const user = userEvent.setup();
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(jsonResponse(invalidResponse))
        .mockResolvedValueOnce(jsonResponse({
          ok: true,
          outcome: "found",
          detail: globalRadarDetailFixture({ allowedActions: ["qualify"] }),
        }))
        .mockResolvedValueOnce(jsonResponse({
          ok: true,
          outcome: "updated",
          detail: globalRadarDetailFixture({ status: "qualified", revision: 5 }),
        }));
      vi.stubGlobal("fetch", fetchMock);
      renderDetail({ allowedActions: ["qualify"] });

      await user.type(screen.getByLabelText("Review reason"), "Verify the route contract.");
      await user.click(screen.getByRole("button", { name: "Qualify" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("outcome is unknown");
      expect(screen.getByText(/revision 4/i)).toBeVisible();
      expect(screen.queryByText("Qualified")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Review reason")).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Refresh and retry exact request" }));

      expect(await screen.findByRole("status")).toHaveTextContent("Signal updated.");
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect((fetchMock.mock.calls[2]![1] as RequestInit).body).toBe(
        (fetchMock.mock.calls[0]![1] as RequestInit).body,
      );
      expect(vi.mocked(globalThis.crypto.randomUUID)).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["network", "server"] as const)(
    "locks inputs and refreshes before replaying an exact %s-unknown administrator request",
    async (failure) => {
      const user = userEvent.setup();
      const refreshed = globalRadarDetailFixture({ allowedActions: ["qualify"] });
      const updated = globalRadarDetailFixture({
        allowedActions: ["qualify"],
        revision: 5,
        status: "qualified",
      });
      const fetchMock = vi.fn();
      if (failure === "network") {
        fetchMock.mockRejectedValueOnce(new Error("connection lost after submit"));
      } else {
        fetchMock.mockResolvedValueOnce(jsonResponse({ ok: false, outcome: "internal_error" }, 503));
      }
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "found", detail: refreshed }))
        .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "updated", detail: updated }));
      vi.stubGlobal("fetch", fetchMock);
      renderDetail({ allowedActions: ["qualify"] });

      await user.type(screen.getByLabelText("Review reason"), "Qualify the verified evidence.");
      await user.click(screen.getByRole("button", { name: "Qualify" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("outcome is unknown");
      expect(screen.getByLabelText("Review reason")).toBeDisabled();
      expect(screen.getByRole("button", { name: "Qualify" })).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Refresh and retry exact request" }));

      expect(await screen.findByRole("status")).toHaveTextContent("Signal updated.");
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[1]).toEqual([
        `/api/admin/global-demand-radar/signals/${RADAR_SIGNAL_ID}`,
        expect.objectContaining({ method: "GET" }),
      ]);
      expect(fetchMock.mock.calls[2]![0]).toBe(fetchMock.mock.calls[0]![0]);
      expect((fetchMock.mock.calls[2]![1] as RequestInit).body).toBe(
        (fetchMock.mock.calls[0]![1] as RequestInit).body,
      );
      expect(vi.mocked(globalThis.crypto.randomUUID)).toHaveBeenCalledTimes(1);
    },
  );

  it("appends a note with the exact envelope and refreshes from GET only after terminal success", async () => {
    const user = userEvent.setup();
    const refreshed = globalRadarDetailFixture({
      allowedActions: ["append_note"],
      revision: 5,
      notes: [{
        id: "00000000-0000-4000-8000-000000000016",
        body: "Verified manufacturing certification requirement.",
        actorEmail: "admin@example.com",
        observedAt: "2026-07-31T04:30:00.000Z",
        createdAt: "2026-07-31T04:30:00.000Z",
      }],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "appended", revision: 5 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "found", detail: refreshed }));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail({ allowedActions: ["append_note"] });

    await user.type(screen.getByLabelText("Note reason"), "Record verification context.");
    await user.type(screen.getByLabelText("Administrator note"), "Verified manufacturing certification requirement.");
    await user.click(screen.getByRole("button", { name: "Append note" }));

    expect(fetchMock.mock.calls[0]).toEqual([
      `/api/admin/global-demand-radar/signals/${RADAR_SIGNAL_ID}/notes`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: 4,
          idempotencyKey: IDEMPOTENCY_KEY,
          reason: "Record verification context.",
          body: "Verified manufacturing certification requirement.",
        }),
      }),
    ]);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[1]).toEqual([
      `/api/admin/global-demand-radar/signals/${RADAR_SIGNAL_ID}`,
      expect.objectContaining({ method: "GET" }),
    ]);
    expect(await screen.findByRole("status")).toHaveTextContent("Note appended.");
    expect(screen.getAllByText("Verified manufacturing certification requirement.").some((node) => node.tagName === "P")).toBe(true);
  });

  it("retains an exact append request when its terminal-success refresh has the wrong identity", async () => {
    const user = userEvent.setup();
    const refreshed = globalRadarDetailFixture({
      allowedActions: ["append_note"],
      revision: 5,
      notes: [{
        id: "00000000-0000-4000-8000-000000000016",
        body: "Preserve this reviewed note.",
        actorEmail: "admin@example.com",
        observedAt: "2026-07-31T04:30:00.000Z",
        createdAt: "2026-07-31T04:30:00.000Z",
      }],
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "appended", revision: 5 }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        outcome: "found",
        detail: { ...refreshed, id: RADAR_DUPLICATE_ID },
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "found", detail: refreshed }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "replayed", revision: 5 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "found", detail: refreshed }));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail({ allowedActions: ["append_note"] });

    await user.type(screen.getByLabelText("Note reason"), "Preserve exact append semantics.");
    await user.type(screen.getByLabelText("Administrator note"), "Preserve this reviewed note.");
    await user.click(screen.getByRole("button", { name: "Append note" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("outcome is unknown");
    expect(screen.getByLabelText("Administrator note")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Refresh and retry exact request" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Note appended.");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[2]).toEqual([
      `/api/admin/global-demand-radar/signals/${RADAR_SIGNAL_ID}`,
      expect.objectContaining({ method: "GET" }),
    ]);
    expect((fetchMock.mock.calls[3]![1] as RequestInit).body).toBe(
      (fetchMock.mock.calls[0]![1] as RequestInit).body,
    );
    expect(vi.mocked(globalThis.crypto.randomUUID)).toHaveBeenCalledTimes(1);
  });

  it("submits an exact direct-demand classification from the safe detail fields", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      outcome: "updated",
      detail: globalRadarDetailFixture({ allowedActions: ["edit_classification"], revision: 5 }),
    })));
    renderDetail({ allowedActions: ["edit_classification"] });

    await user.type(screen.getByLabelText("Classification reason"), "Recalculate reviewed classification.");
    await user.click(screen.getByRole("button", { name: "Save classification" }));

    const request = vi.mocked(fetch).mock.calls[0]!;
    expect(request[0]).toBe(`/api/admin/global-demand-radar/signals/${RADAR_SIGNAL_ID}`);
    expect(JSON.parse((request[1] as RequestInit).body as string)).toEqual({
      expectedRevision: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Recalculate reviewed classification.",
      classification: {
        signalClass: "direct_demand",
        signalType: "supplier_registration",
        demandDomain: "robotics_hardware_and_ecosystem_demand",
        primaryEntityId: RADAR_ENTITY_ID,
        components: {
          explicitness: 90,
          evidenceConfidence: 88,
          freshness: 84,
          actionability: 75,
          indiaFit: 80,
          commercialPotential: 70,
          repeatability: 65,
          responseAccessibility: 90,
          strategicLearning: 72,
          complianceComplexity: 35,
        },
        activity: {
          evergreen: false,
          expiresAt: "2026-08-30T04:30:00.000Z",
          reobserveBy: null,
        },
      },
    });
  });

  it("reclassifies to a precursor with explicit scores and a selected contributor", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      outcome: "updated",
      detail: globalRadarDetailFixture({
        allowedActions: ["edit_classification"],
        revision: 5,
        signalClass: "demand_precursor",
      }),
    })));
    renderDetail({ allowedActions: ["edit_classification"] });

    await user.selectOptions(screen.getByLabelText("Target signal class"), "demand_precursor");
    expect(screen.getByLabelText("Signal type")).toHaveValue("");
    await user.selectOptions(screen.getByLabelText("Signal type"), "deployment");
    expect(screen.getByLabelText("Evidence confidence")).toHaveValue(null);
    await user.selectOptions(screen.getByLabelText("Primary organisation"), RADAR_ASSOCIATED_ENTITY_ID);
    for (const [label, value] of [
      ["Evidence confidence", "81"],
      ["Proximity to external demand", "70"],
      ["Funding deployment momentum", "69"],
      ["Likely data hardware intensity", "77"],
      ["India fit", "83"],
      ["Estimated time horizon", "60"],
      ["Strategic relevance", "74"],
    ] as const) {
      await user.type(screen.getByLabelText(label), value);
    }
    await user.type(screen.getByLabelText("Classification reason"), "Use the reviewed precursor evidence.");
    await user.click(screen.getByRole("button", { name: "Save classification" }));

    expect(JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      expectedRevision: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Use the reviewed precursor evidence.",
      classification: {
        signalClass: "demand_precursor",
        signalType: "deployment",
        demandDomain: "robotics_hardware_and_ecosystem_demand",
        primaryEntityId: RADAR_ASSOCIATED_ENTITY_ID,
        components: {
          evidenceConfidence: 81,
          proximityToExternalDemand: 70,
          fundingDeploymentMomentum: 69,
          likelyDataHardwareIntensity: 77,
          indiaFit: 83,
          estimatedTimeHorizon: 60,
          strategicRelevance: 74,
        },
      },
    });
  });

  it("reclassifies to momentum without inventing a primary entity", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      outcome: "updated",
      detail: globalRadarDetailFixture({
        allowedActions: ["edit_classification"],
        revision: 5,
        signalClass: "ecosystem_momentum",
      }),
    })));
    renderDetail({ allowedActions: ["edit_classification"] });

    await user.selectOptions(screen.getByLabelText("Target signal class"), "ecosystem_momentum");
    expect(screen.getByLabelText("Signal type")).toHaveValue("");
    await user.selectOptions(screen.getByLabelText("Signal type"), "ecosystem_direction");
    expect(screen.queryByLabelText("Primary organisation")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Taxonomy consistency"), "86");
    await user.type(screen.getByLabelText("Evidence quality"), "79");
    await user.type(screen.getByLabelText("Classification reason"), "Represent the reviewed ecosystem direction.");
    await user.click(screen.getByRole("button", { name: "Save classification" }));

    expect(JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      expectedRevision: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Represent the reviewed ecosystem direction.",
      classification: {
        signalClass: "ecosystem_momentum",
        signalType: "ecosystem_direction",
        demandDomain: "robotics_hardware_and_ecosystem_demand",
        components: {
          taxonomyConsistency: 86,
          evidenceQuality: 79,
        },
      },
    });
  });

  it("submits exact expiry semantics independently of classification", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      outcome: "updated",
      detail: globalRadarDetailFixture({ allowedActions: ["edit_expiry"], revision: 5 }),
    })));
    renderDetail({ allowedActions: ["edit_expiry"] });

    await user.type(screen.getByLabelText("Expiry reason"), "Confirm the published deadline.");
    await user.click(screen.getByRole("button", { name: "Save expiry" }));

    expect(JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      expectedRevision: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Confirm the published deadline.",
      expiry: {
        evergreen: false,
        expiresAt: "2026-08-30T04:30:00.000Z",
        reobserveBy: null,
      },
    });
  });

  it("appends exact public evidence and refreshes the safe detail", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "appended", revision: 5 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "found", detail: globalRadarDetailFixture({ allowedActions: ["append_evidence"], revision: 5 }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail({ allowedActions: ["append_evidence"] });

    const fields: [string, string][] = [
      ["Evidence reason", "Add the verified official page."],
      ["Source URL", "https://fictional-robotics.example/new-supplier-notice"],
      ["Canonical source URL", "https://fictional-robotics.example/new-supplier-notice"],
      ["Source name", "Official new supplier notice"],
      ["Source type", "official_supplier_page"],
      ["Source language", "zh-CN"],
      ["Source country", "China"],
      ["Public claim", "The company opened supplier registration."],
      ["Source excerpt", "该公司开放供应商注册。"],
      ["Evidence English summary", "The company opened supplier registration."],
      ["Published at (ISO timestamp)", "2026-07-31T04:00:00.000Z"],
      ["Observed at (ISO timestamp)", "2026-07-31T04:30:00.000Z"],
      ["Evidence confidence", "90"],
      ["Translation confidence", "92"],
      ["Supported field paths", "signal.factualSummary, signal.responsePathUrl"],
    ];
    for (const [name, value] of fields) await user.type(screen.getByLabelText(name), value);
    await user.selectOptions(screen.getByLabelText("Source family"), "official_partner_supplier_pages");
    await user.click(screen.getByLabelText("Primary source"));
    await user.click(screen.getByLabelText("Supports direct demand"));
    await user.click(screen.getByLabelText("Supports India relevance"));
    await user.click(screen.getByRole("button", { name: "Append evidence" }));

    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      expectedRevision: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Add the verified official page.",
      evidence: {
        globalEntityId: RADAR_ENTITY_ID,
        sourceUrl: "https://fictional-robotics.example/new-supplier-notice",
        canonicalSourceUrl: "https://fictional-robotics.example/new-supplier-notice",
        sourceName: "Official new supplier notice",
        sourceType: "official_supplier_page",
        sourceLanguage: "zh-CN",
        sourceCountry: "China",
        sourceFamily: "official_partner_supplier_pages",
        claim: "The company opened supplier registration.",
        sourceExcerpt: "该公司开放供应商注册。",
        englishSummary: "The company opened supplier registration.",
        publishedAt: "2026-07-31T04:00:00.000Z",
        observedAt: "2026-07-31T04:30:00.000Z",
        evidenceConfidence: 90,
        translationConfidence: 92,
        isPrimarySource: true,
        isSyndicated: false,
        supportsDirectDemand: true,
        supportsIndiaRelevance: true,
        rawMetadata: {},
        supportedFieldPaths: ["signal.factualSummary", "signal.responsePathUrl"],
      },
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Evidence appended.");
  });

  it("requires preservation confirmation and merges without delete semantics", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      ok: true,
      outcome: "merged",
      survivor: globalRadarDetailFixture({ allowedActions: [], revision: 5 }),
      duplicate: globalRadarDetailFixture({ allowedActions: [], revision: 3 }),
    })));
    renderDetail({ allowedActions: ["merge"] });

    expect(screen.getByText(/both signal records and their complete history and evidence remain preserved/i)).toBeVisible();
    expect(screen.queryByText(/delete/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Duplicate signal ID"), RADAR_DUPLICATE_ID);
    await user.type(screen.getByLabelText("Duplicate revision"), "2");
    await user.type(screen.getByLabelText("Merge reason"), "Same public demand signal.");
    await user.click(screen.getByLabelText("Confirm preserved merge history"));
    await user.click(screen.getByRole("button", { name: "Merge into this signal" }));

    expect(JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      survivorSignalId: RADAR_SIGNAL_ID,
      duplicateSignalId: RADAR_DUPLICATE_ID,
      expectedSurvivorRevision: 4,
      expectedDuplicateRevision: 2,
      confirmed: true,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Same public demand signal.",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Signals merged with history preserved.");
  });

  it("sends exact existing-entity watchlist configuration and refreshes enrichment", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        outcome: "updated",
        entity: {
          id: RADAR_ENTITY_ID,
          canonicalName: "Fictional Robotics Example",
          headquartersCountry: "China",
          entityStatus: "active",
          revision: 9,
        },
        entry: {
          id: "00000000-0000-4000-8000-000000000007",
          globalEntityId: RADAR_ENTITY_ID,
          state: "paused",
          priority: 60,
          theme: "robotics_manufacturing",
          category: "contract_manufacturing",
          categorySearchTermEn: "robot contract manufacturing",
          categorySearchTermZhCn: "机器人合同制造",
          countries: ["China", "India"],
          languages: ["en", "zh-CN"],
          cadenceDays: 7,
          nextScanAt: "2026-08-02T04:30:00.000Z",
          reason: "Pause while evidence is reviewed.",
          revision: 6,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "found", detail: globalRadarDetailFixture({ allowedActions: ["edit_watchlist"], revision: 5, includeWatchlist: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail({ allowedActions: ["edit_watchlist"], includeWatchlist: true });

    await user.clear(screen.getByLabelText("Watchlist reason"));
    await user.type(screen.getByLabelText("Watchlist reason"), "Pause while evidence is reviewed.");
    await user.selectOptions(screen.getByLabelText("Watchlist state"), "paused");
    await user.click(screen.getByRole("button", { name: "Save watchlist" }));

    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      entity: { type: "existing", entityId: RADAR_ENTITY_ID, expectedRevision: 8 },
      expectedEntryRevision: 5,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Pause while evidence is reviewed.",
      configuration: {
        state: "paused",
        priority: 60,
        theme: "robotics_manufacturing",
        category: "contract_manufacturing",
        categorySearchTermEn: "robot contract manufacturing",
        categorySearchTermZhCn: "机器人合同制造",
        countries: ["China", "India"],
        languages: ["en", "zh-CN"],
        cadenceDays: 7,
        nextScanAt: "2026-08-02T04:30:00.000Z",
      },
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("promotes an explicit selection with revisions and rationale", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "promoted", promotion: { id: "00000000-0000-4000-8000-000000000010" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "found", detail: globalRadarDetailFixture({ status: "promoted", revision: 5, includePromotion: true, allowedActions: ["reverse_promotion"] }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail({ allowedActions: ["promote"] });

    expect(screen.getByText(`Primary signal: ${RADAR_SIGNAL_ID} · revision 4`)).toBeVisible();
    await user.type(screen.getByLabelText("Supporting signals (UUID:revision, one per line)"), `${RADAR_DUPLICATE_ID}:2`);
    await user.selectOptions(screen.getByLabelText("Eligibility path"), "qualified_india_direct_demand");
    await user.type(screen.getByLabelText("Promotion reason"), "Controlled promotion after review.");
    await user.type(screen.getByLabelText("Promotion rationale"), "Qualified India-compatible direct demand.");
    await user.click(screen.getByRole("button", { name: "Promote to India Discovery" }));

    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      entityId: RADAR_ENTITY_ID,
      primarySignalId: RADAR_SIGNAL_ID,
      supportingSignalIds: [RADAR_DUPLICATE_ID],
      eligibilityPath: "qualified_india_direct_demand",
      expectedEntityRevision: 8,
      expectedPrimarySignalRevision: 4,
      expectedSupportingSignalRevisions: [{ signalId: RADAR_DUPLICATE_ID, revision: 2 }],
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Controlled promotion after review.",
      rationale: "Qualified India-compatible direct demand.",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Promoted to India Discovery.");
  });

  it("explicitly qualifies the selected entity before exceptional promotion", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        outcome: "updated",
        entity: {
          id: RADAR_ENTITY_ID,
          canonicalName: "Fictional Robotics Example",
          headquartersCountry: "China",
          entityStatus: "qualified",
          revision: 9,
        },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        outcome: "found",
        detail: globalRadarDetailFixture({
          status: "qualified",
          revision: 4,
          allowedActions: ["promote"],
          entityStatus: "qualified",
        }),
      }));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail({
      status: "qualified",
      allowedActions: ["qualify_entity", "promote"],
      entityStatus: "watchlisted",
    });

    await user.type(
      screen.getByLabelText("Entity qualification reason"),
      "Two independent primary sources support exceptional relevance.",
    );
    await user.click(screen.getByRole("button", { name: "Qualify entity" }));

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `/api/admin/global-demand-radar/entities/${RADAR_ENTITY_ID}/qualification`,
      expect.objectContaining({
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityId: RADAR_ENTITY_ID,
          expectedRevision: 8,
          idempotencyKey: IDEMPOTENCY_KEY,
          reason:
            "Two independent primary sources support exceptional relevance.",
        }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Entity qualified for exceptional strategic relevance.",
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("promotes qualified momentum for an explicitly selected contributor entity", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        outcome: "promoted",
        promotion: { id: "00000000-0000-4000-8000-000000000010" },
      }))
      .mockResolvedValueOnce(jsonResponse({
        ok: true,
        outcome: "found",
        detail: globalRadarDetailFixture({
          signalClass: "ecosystem_momentum",
          status: "promoted",
          revision: 5,
          includePrimaryOrganisation: false,
          includePromotion: true,
          allowedActions: ["reverse_promotion"],
        }),
      }));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail({
      signalClass: "ecosystem_momentum",
      status: "qualified",
      allowedActions: ["promote"],
      includePrimaryOrganisation: false,
    });

    expect(
      screen.getByRole("option", { name: "Fictional Partner Example" }),
    ).toBeVisible();
    await user.selectOptions(
      screen.getByLabelText("Promotion entity"),
      RADAR_ASSOCIATED_ENTITY_ID,
    );
    await user.selectOptions(
      screen.getByLabelText("Eligibility path"),
      "documented_indian_relationship",
    );
    await user.type(
      screen.getByLabelText("Promotion reason"),
      "Promote the reviewed momentum contributor.",
    );
    await user.type(
      screen.getByLabelText("Promotion rationale"),
      "Qualified momentum and public relationship evidence support this contributor.",
    );
    await user.click(
      screen.getByRole("button", { name: "Promote to India Discovery" }),
    );

    expect(JSON.parse(
      (fetchMock.mock.calls[0]![1] as RequestInit).body as string,
    )).toMatchObject({
      entityId: RADAR_ASSOCIATED_ENTITY_ID,
      primarySignalId: RADAR_SIGNAL_ID,
      expectedEntityRevision: 8,
      expectedPrimarySignalRevision: 4,
      eligibilityPath: "documented_indian_relationship",
    });
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Promoted to India Discovery.",
    );
  });

  it("requires explicit reversal preservation confirmation and states that Discovery remains intact", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "reversed", promotion: { id: "00000000-0000-4000-8000-000000000010" } }))
      .mockResolvedValueOnce(jsonResponse({ ok: true, outcome: "found", detail: globalRadarDetailFixture({ status: "qualified", revision: 5, allowedActions: ["promote"] }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderDetail({ status: "promoted", allowedActions: ["reverse_promotion"], includePromotion: true });

    expect(screen.getByText(/Discovery candidate remains intact/i)).toBeVisible();
    await user.type(screen.getByLabelText("Reversal reason"), "Radar promotion linkage is no longer current.");
    await user.click(screen.getByLabelText("Confirm Discovery candidate preservation"));
    await user.click(screen.getByRole("button", { name: "Reverse promotion" }));

    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)).toEqual({
      entityId: RADAR_ENTITY_ID,
      expectedEntityRevision: 8,
      expectedPrimarySignalRevision: 4,
      idempotencyKey: IDEMPOTENCY_KEY,
      reason: "Radar promotion linkage is no longer current.",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Promotion reversed. The Discovery candidate remains intact.");
  });
});
