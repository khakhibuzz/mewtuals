import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  OpportunityBriefDashboard,
  type OpportunityBriefDashboardSnapshot,
} from "../app/components/product/OpportunityBriefDashboard";

const requestId = "00000000-0000-4000-8000-000000000101";
const candidateId = "00000000-0000-4000-8000-000000000202";

const request: OpportunityBriefDashboardSnapshot["requests"][number] = {
  id: requestId,
  participantType: "company",
  profileUrl: "https://example.com/company",
  email: "founder@example.com",
  phoneNumber: "+919876543210",
  openToText: "Distribution partnerships",
  source: "bengaluru-meetup",
  utm: { source: "meetup", campaign: "july" },
  linkedCandidateId: null,
  status: "submitted",
  adminNotes: "Initial note",
  acknowledgementStatus: "pending",
  acknowledgementSentAt: null,
  acknowledgementError: null,
  submissionCount: 2,
  lastSubmittedAt: "2026-07-22T06:30:00.000Z",
  createdAt: "2026-07-21T04:00:00.000Z",
  updatedAt: "2026-07-22T06:00:00.000Z",
};

const snapshot: OpportunityBriefDashboardSnapshot = {
  summary: {
    total: 7,
    newToday: 3,
    companies: 5,
    creators: 2,
    awaitingResearch: 4,
    linkedCandidates: 2,
    unlinked: 5,
    acknowledgementPending: 1,
    acknowledgementFailed: 0,
    sources: { "bengaluru-meetup": 4 },
  },
  requests: [request],
  page: 1,
  pageSize: 25,
  totalPages: 3,
};

afterEach(() => vi.unstubAllGlobals());

describe("Opportunity Brief dashboard", () => {
  it("adopts a new authoritative snapshot and canonical filters on rerender", () => {
    const creatorRequest = {
      ...request,
      id: "00000000-0000-4000-8000-000000000303",
      participantType: "creator" as const,
      profileUrl: "https://youtube.com/@creator",
      email: "creator@example.com",
    };
    const { rerender } = render(
      <OpportunityBriefDashboard snapshot={snapshot} filters={{}} />,
    );

    rerender(
      <OpportunityBriefDashboard
        snapshot={{
          ...snapshot,
          summary: { ...snapshot.summary, total: 11, unlinked: 9 },
          requests: [creatorRequest],
        }}
        filters={{ participantType: "creator", linked: "unlinked" }}
      />,
    );

    expect(screen.getByRole("group", { name: "Opportunity Brief summary" })).toHaveTextContent("Total requests11");
    expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).toHaveTextContent("creator@example.com");
    expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).not.toHaveTextContent("founder@example.com");
    expect(screen.getByLabelText("Participant type")).toHaveValue("creator");
    expect(screen.getByLabelText("Candidate link")).toHaveValue("unlinked");
  });

  it("renders queue metrics, required table fields, and no private data", () => {
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);

    const summary = screen.getByRole("group", { name: "Opportunity Brief summary" });
    expect(summary).toHaveTextContent("Total requests7");
    expect(summary).toHaveTextContent("Submitted today3");
    expect(summary).toHaveTextContent("Unlinked5");
    expect(summary).toHaveTextContent("Acknowledgement pending1");
    expect(summary).toHaveTextContent("Acknowledgement failed0");

    const table = screen.getByRole("table", { name: "Opportunity Brief requests" });
    for (const heading of [
      "Participant",
      "Profile",
      "Contact",
      "Open to",
      "Source",
      "Status",
      "Submissions",
      "Last submitted",
      "Linked",
      "Acknowledgement",
      "Actions",
    ]) {
      expect(within(table).getByRole("columnheader", { name: heading })).toBeVisible();
    }
    expect(table).toHaveTextContent("founder@example.com");
    expect(table).toHaveTextContent("+919876543210");
    expect(table).toHaveTextContent("Distribution partnerships");
    expect(table).not.toHaveTextContent("requesterHash");
  });

  it("uses supported GET filters and preserves only them in pagination", () => {
    render(
      <OpportunityBriefDashboard
        snapshot={snapshot}
        filters={{
          participantType: "company",
          status: "submitted",
          source: "meetup",
          linked: "unlinked",
          from: "2026-07-01",
          to: "2026-07-22",
          pageSize: "25",
        }}
      />,
    );

    const filters = screen.getByRole("search", { name: "Filter Opportunity Brief requests" });
    expect(filters).toHaveAttribute("method", "get");
    expect(filters).toHaveAttribute("action", "/admin/opportunity-briefs");
    expect(screen.getByLabelText("Participant type")).toHaveValue("company");
    expect(screen.getByLabelText("Request status")).toHaveValue("submitted");
    expect(screen.getByLabelText("Source")).toHaveValue("meetup");
    expect(screen.getByLabelText("Candidate link")).toHaveValue("unlinked");
    expect(screen.getByLabelText("Submitted from")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("Submitted through")).toHaveValue("2026-07-22");
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^\/admin\/opportunity-briefs\?(?=.*participantType=company)(?=.*status=submitted)(?=.*linked=unlinked)(?=.*page=2)(?!.*unknown)/,
      ),
    );
  });

  it("opens an accessible native dialog, closes with Escape, and returns focus", async () => {
    const user = userEvent.setup();
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);
    const opener = screen.getByRole("button", { name: "View company Opportunity Brief details" });

    opener.focus();
    await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Company Opportunity Brief" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent("founder@example.com");
    expect(dialog).toHaveTextContent("meetup");
    expect(dialog).toHaveTextContent("2 submissions");
    expect(dialog).not.toHaveTextContent("requester hash");

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("reconciles an uncancelled PATCH after Escape closes the dialog", async () => {
    const user = userEvent.setup();
    const researchingRequest = {
      ...request,
      status: "researching" as const,
      updatedAt: "2026-07-22T07:00:00.000Z",
    };
    const notedRequest = {
      ...researchingRequest,
      adminNotes: "Version check",
      updatedAt: "2026-07-22T08:00:00.000Z",
    };
    let resolvePatch!: (response: Response) => void;
    let resolveRefresh!: (response: Response) => void;
    const patch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    const refresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(patch).mockReturnValueOnce(refresh);
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);

    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.selectOptions(screen.getByLabelText("Status"), "researching");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeUndefined();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    resolvePatch(new Response(JSON.stringify({ request: researchingRequest }), { status: 200 }));

    await waitFor(() =>
      expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).toHaveTextContent(
        "Researching",
      ),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    resolveRefresh(
      new Response(
        JSON.stringify({ snapshot: { ...snapshot, requests: [researchingRequest] } }),
        { status: 200 },
      ),
    );

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ request: notedRequest }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ snapshot: { ...snapshot, requests: [notedRequest] } }), {
          status: 200,
        }),
      );
    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.clear(screen.getByLabelText("Administrator notes"));
    await user.type(screen.getByLabelText("Administrator notes"), "Version check");
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toMatchObject({
      expectedUpdatedAt: researchingRequest.updatedAt,
      notes: "Version check",
    });
  });

  it("keeps a pending PATCH alive across a canonical view change without merging it", async () => {
    const user = userEvent.setup();
    const creatorRequest = {
      ...request,
      id: "00000000-0000-4000-8000-000000000303",
      participantType: "creator" as const,
      profileUrl: "https://youtube.com/@creator",
      email: "creator@example.com",
    };
    const researchingRequest = {
      ...request,
      status: "researching" as const,
      updatedAt: "2026-07-22T07:00:00.000Z",
    };
    let resolvePatch!: (response: Response) => void;
    const patch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    const fetchMock = vi.fn().mockReturnValueOnce(patch);
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);

    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.selectOptions(screen.getByLabelText("Status"), "researching");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    const patchSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    rerender(
      <OpportunityBriefDashboard
        snapshot={{ ...snapshot, requests: [creatorRequest] }}
        filters={{ participantType: "creator" }}
      />,
    );
    resolvePatch(new Response(JSON.stringify({ request: researchingRequest }), { status: 200 }));

    await waitFor(() =>
      expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).toHaveTextContent(
        "creator@example.com",
      ),
    );
    expect(patchSignal).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).not.toHaveTextContent(
      "founder@example.com",
    );
  });

  it("reconciles PATCH completion after a same-view authoritative snapshot rerender", async () => {
    const user = userEvent.setup();
    const researchingRequest = {
      ...request,
      status: "researching" as const,
      updatedAt: "2026-07-22T07:00:00.000Z",
    };
    let resolvePatch!: (response: Response) => void;
    const patch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(patch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            snapshot: {
              ...snapshot,
              summary: { ...snapshot.summary, total: 8 },
              requests: [researchingRequest],
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);

    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.selectOptions(screen.getByLabelText("Status"), "researching");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    rerender(
      <OpportunityBriefDashboard
        snapshot={{
          ...snapshot,
          summary: { ...snapshot.summary, total: 8 },
        }}
        filters={{}}
      />,
    );
    resolvePatch(new Response(JSON.stringify({ request: researchingRequest }), { status: 200 }));

    await waitFor(() =>
      expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).toHaveTextContent(
        "Researching",
      ),
    );
    expect(screen.getByRole("group", { name: "Opportunity Brief summary" })).toHaveTextContent(
      "Total requests8",
    );
  });

  it("rejects a stale refresh after a newer same-view snapshot prop arrives", async () => {
    const user = userEvent.setup();
    const researchingRequest = {
      ...request,
      status: "researching" as const,
      updatedAt: "2026-07-22T07:00:00.000Z",
    };
    const newerRequest = {
      ...request,
      status: "rejected" as const,
      adminNotes: "Newer server note",
      updatedAt: "2026-07-22T09:00:00.000Z",
    };
    const newerSnapshot = {
      ...snapshot,
      summary: { ...snapshot.summary, total: 42 },
      requests: [newerRequest],
    };
    let resolveRefresh!: (response: Response) => void;
    const refresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request: researchingRequest }), { status: 200 }),
      )
      .mockReturnValueOnce(refresh);
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);

    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.clear(screen.getByLabelText("Administrator notes"));
    await user.type(screen.getByLabelText("Administrator notes"), "Unsaved draft");
    await user.selectOptions(screen.getByLabelText("Status"), "researching");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Refreshing queue totals");
    const refreshSignal = fetchMock.mock.calls[1]?.[1]?.signal as AbortSignal;
    expect(refreshSignal.aborted).toBe(false);

    rerender(<OpportunityBriefDashboard snapshot={newerSnapshot} filters={{}} />);
    expect(refreshSignal.aborted).toBe(true);
    expect(screen.getByRole("group", { name: "Opportunity Brief summary" })).toHaveTextContent(
      "Total requests42",
    );
    expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).toHaveTextContent(
      "Rejected",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Rejected");
    expect(screen.getByLabelText("Administrator notes")).toHaveValue("Unsaved draft");

    await act(async () => {
      resolveRefresh(
        new Response(
          JSON.stringify({
            snapshot: {
              ...snapshot,
              summary: { ...snapshot.summary, total: 999 },
              requests: [researchingRequest],
            },
          }),
          { status: 200 },
        ),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("group", { name: "Opportunity Brief summary" })).toHaveTextContent(
      "Total requests42",
    );
    expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).toHaveTextContent(
      "Rejected",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Rejected");
    expect(screen.getByLabelText("Administrator notes")).toHaveValue("Unsaved draft");
  });

  it("shows and clears global mutation busy state when another dialog opens", async () => {
    const user = userEvent.setup();
    const creatorRequest = {
      ...request,
      id: "00000000-0000-4000-8000-000000000303",
      participantType: "creator" as const,
      profileUrl: "https://youtube.com/@creator",
      email: "creator@example.com",
    };
    const twoRequestSnapshot = { ...snapshot, requests: [request, creatorRequest] };
    const researchingRequest = {
      ...request,
      status: "researching" as const,
      updatedAt: "2026-07-22T07:00:00.000Z",
    };
    let resolvePatch!: (response: Response) => void;
    const patch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(patch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            snapshot: {
              ...twoRequestSnapshot,
              requests: [researchingRequest, creatorRequest],
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityBriefDashboard snapshot={twoRequestSnapshot} filters={{}} />);

    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.selectOptions(screen.getByLabelText("Status"), "researching");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "View creator Opportunity Brief details" }));

    const creatorDialog = screen.getByRole("dialog", { name: "Creator Opportunity Brief" });
    expect(within(creatorDialog).getByRole("status")).toHaveTextContent(
      "Another update is completing",
    );
    expect(within(creatorDialog).getByLabelText("Status")).toBeDisabled();
    expect(within(creatorDialog).getByLabelText("Administrator notes")).toBeDisabled();
    expect(within(creatorDialog).getByLabelText("Candidate UUID")).toBeDisabled();
    expect(within(creatorDialog).getByRole("button", { name: "Save status" })).toBeDisabled();
    expect(within(creatorDialog).getByRole("button", { name: "Save notes" })).toBeDisabled();
    expect(within(creatorDialog).getByRole("button", { name: "Link candidate" })).toBeDisabled();
    expect(
      within(creatorDialog).getByRole("button", { name: "Close Creator Opportunity Brief" }),
    ).toBeEnabled();
    await user.click(within(creatorDialog).getByRole("button", { name: "Save notes" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolvePatch(new Response(JSON.stringify({ request: researchingRequest }), { status: 200 }));

    await waitFor(() =>
      expect(within(creatorDialog).getByRole("button", { name: "Save notes" })).toBeEnabled(),
    );
    expect(within(creatorDialog).queryByRole("status")).not.toBeInTheDocument();
    expect(within(creatorDialog).queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).toHaveTextContent(
      "Researching",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("shows global recovery when PATCH outcome cannot be confirmed after close", async () => {
    const user = userEvent.setup();
    let rejectPatch!: (error: Error) => void;
    const patch = new Promise<Response>((_resolve, reject) => {
      rejectPatch = reject;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(patch));
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);

    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await user.keyboard("{Escape}");
    rejectPatch(new Error("network unavailable"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("could not confirm whether the update was saved");
    expect(within(alert).getByRole("link", { name: "Reload queue" })).toHaveAttribute(
      "href",
      "/admin/opportunity-briefs",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("reconciles authoritative 409 data globally after the dialog closes", async () => {
    const user = userEvent.setup();
    const current = {
      ...request,
      status: "rejected" as const,
      updatedAt: "2026-07-22T07:00:00.000Z",
    };
    let resolvePatch!: (response: Response) => void;
    const patch = new Promise<Response>((resolve) => {
      resolvePatch = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(patch));
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);

    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await user.keyboard("{Escape}");
    resolvePatch(
      new Response(JSON.stringify({ error: "Conflict", request: current }), { status: 409 }),
    );

    await waitFor(() =>
      expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).toHaveTextContent(
        "Rejected",
      ),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers only allowed next statuses and submits the optimistic status guard", async () => {
    const user = userEvent.setup();
    const researchingRequest = { ...request, status: "researching" as const };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request: researchingRequest }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ snapshot: { ...snapshot, requests: [researchingRequest] } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);
    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));

    const status = screen.getByLabelText("Status");
    expect(within(status).getByRole("option", { name: "Submitted" })).toBeVisible();
    expect(within(status).getByRole("option", { name: "Researching" })).toBeVisible();
    expect(within(status).getByRole("option", { name: "Rejected" })).toBeVisible();
    expect(within(status).queryByRole("option", { name: "Converted" })).not.toBeInTheDocument();
    await user.selectOptions(status, "researching");
    await user.click(screen.getByRole("button", { name: "Save status" }));

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/admin/opportunity-briefs/${requestId}`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          expectedUpdatedAt: request.updatedAt,
          status: "researching",
        }),
      }),
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Status saved");
  });

  it("saves notes, links an exact candidate UUID, and unlinks it", async () => {
    const user = userEvent.setup();
    const noted = { ...request, adminNotes: "Updated" };
    const linked = { ...noted, linkedCandidateId: candidateId };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ request: noted }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot: { ...snapshot, requests: [noted] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ request: linked }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot: { ...snapshot, summary: { ...snapshot.summary, linkedCandidates: 3, unlinked: 4 }, requests: [linked] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ request: noted }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot: { ...snapshot, requests: [noted] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);
    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));

    await user.clear(screen.getByLabelText("Administrator notes"));
    await user.type(screen.getByLabelText("Administrator notes"), "Updated");
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await user.type(screen.getByLabelText("Candidate UUID"), candidateId);
    await user.click(screen.getByRole("button", { name: "Link candidate" }));
    expect(screen.getByRole("link", { name: "Open Discovery candidates" })).toHaveAttribute(
      "href",
      "/admin/discovery",
    );
    await user.click(await screen.findByRole("button", { name: "Unlink candidate" }));

    const bodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "PATCH")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([
      { expectedUpdatedAt: request.updatedAt, notes: "Updated" },
      { expectedUpdatedAt: request.updatedAt, linkedCandidateId: candidateId },
      { expectedUpdatedAt: request.updatedAt, unlink: true },
    ]);
  });

  it("refreshes global metrics and row/detail linkage after link and unlink", async () => {
    const user = userEvent.setup();
    const linkedRequest = { ...request, linkedCandidateId: candidateId };
    const linkedSnapshot = {
      ...snapshot,
      summary: { ...snapshot.summary, linkedCandidates: 3, unlinked: 4 },
      requests: [linkedRequest],
    };
    const unlinkedSnapshot = {
      ...snapshot,
      requests: [request],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ request: linkedRequest }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot: linkedSnapshot }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ request }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot: unlinkedSnapshot }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(
      <OpportunityBriefDashboard
        snapshot={snapshot}
        filters={{ participantType: "company", linked: "unlinked" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.type(screen.getByLabelText("Candidate UUID"), candidateId);
    await user.click(screen.getByRole("button", { name: "Link candidate" }));

    await waitFor(() => expect(screen.getByRole("group", { name: "Opportunity Brief summary" })).toHaveTextContent("Unlinked4"));
    expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).toHaveTextContent("Linked");
    expect(screen.getByRole("dialog")).toHaveTextContent(candidateId);
    expect(fetchMock.mock.calls[1]).toEqual([
      "/api/admin/opportunity-briefs?participantType=company&linked=unlinked&page=1&pageSize=25",
      expect.objectContaining({ method: "GET", headers: { Accept: "application/json" } }),
    ]);

    await user.click(screen.getByRole("button", { name: "Unlink candidate" }));
    await waitFor(() => expect(screen.getByRole("group", { name: "Opportunity Brief summary" })).toHaveTextContent("Unlinked5"));
    expect(screen.getByRole("table", { name: "Opportunity Brief requests" })).toHaveTextContent("Unlinked");
    expect(screen.getByRole("dialog")).toHaveTextContent("Unlinked");
  });

  it("keeps a successful mutation visible when the summary refresh fails", async () => {
    const user = userEvent.setup();
    const noted = { ...request, adminNotes: "Saved despite refresh" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ request: noted }), { status: 200 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Unavailable" }), { status: 500 })),
    );
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);
    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.clear(screen.getByLabelText("Administrator notes"));
    await user.type(screen.getByLabelText("Administrator notes"), "Saved despite refresh");
    await user.click(screen.getByRole("button", { name: "Save notes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Update saved, but the queue summary could not be refreshed",
    );
    expect(screen.getByLabelText("Administrator notes")).toHaveValue("Saved despite refresh");
  });

  it("announces the protected snapshot refresh while keeping actions disabled", async () => {
    const user = userEvent.setup();
    let resolveRefresh!: (response: Response) => void;
    const refresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const noted = { ...request, adminNotes: "Saved" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ request: noted }), { status: 200 }))
        .mockReturnValueOnce(refresh),
    );
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);
    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.click(screen.getByRole("button", { name: "Save notes" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Update saved. Refreshing queue totals",
    );
    expect(screen.getByRole("button", { name: "Saving notes" })).toBeDisabled();

    resolveRefresh(
      new Response(JSON.stringify({ snapshot: { ...snapshot, requests: [noted] } }), {
        status: 200,
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save notes" })).toBeEnabled(),
    );
  });

  it("ignores an old refresh after closing its dialog and opening another request", async () => {
    const user = userEvent.setup();
    const creatorRequest = {
      ...request,
      id: "00000000-0000-4000-8000-000000000303",
      participantType: "creator" as const,
      profileUrl: "https://youtube.com/@creator",
      email: "creator@example.com",
    };
    const twoRequestSnapshot = { ...snapshot, requests: [request, creatorRequest] };
    const researchingRequest = {
      ...request,
      status: "researching" as const,
      updatedAt: "2026-07-22T07:00:00.000Z",
    };
    let resolveRefresh!: (response: Response) => void;
    const refresh = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ request: researchingRequest }), { status: 200 }))
        .mockReturnValueOnce(refresh);
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityBriefDashboard snapshot={twoRequestSnapshot} filters={{}} />);
    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.selectOptions(screen.getByLabelText("Status"), "researching");
    await user.click(screen.getByRole("button", { name: "Save status" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Refreshing queue totals");
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeUndefined();
    const refreshSignal = fetchMock.mock.calls[1]?.[1]?.signal as AbortSignal;
    expect(refreshSignal.aborted).toBe(false);

    await user.click(screen.getByRole("button", { name: "Close Company Opportunity Brief" }));
    expect(refreshSignal.aborted).toBe(true);
    await user.click(screen.getByRole("button", { name: "View creator Opportunity Brief details" }));
    expect(screen.getByRole("dialog", { name: "Creator Opportunity Brief" })).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    resolveRefresh(
      new Response(
        JSON.stringify({
          snapshot: {
            ...snapshot,
            summary: { ...snapshot.summary, total: 999, unlinked: 999 },
            requests: [researchingRequest],
          },
        }),
        { status: 200 },
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Creator Opportunity Brief" })).toBeVisible(),
    );
    expect(screen.getByRole("group", { name: "Opportunity Brief summary" })).not.toHaveTextContent("999");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("preserves drafts and focus while advancing optimistic versions without remounting", async () => {
    const user = userEvent.setup();
    const statusVersion = {
      ...request,
      status: "researching" as const,
      updatedAt: "2026-07-22T07:00:00.000Z",
    };
    const notesVersion = {
      ...statusVersion,
      adminNotes: "Unsaved research note",
      updatedAt: "2026-07-22T08:00:00.000Z",
    };
    const linkedVersion = {
      ...notesVersion,
      linkedCandidateId: candidateId,
      updatedAt: "2026-07-22T09:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ request: statusVersion }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot: { ...snapshot, requests: [statusVersion] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ request: notesVersion }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot: { ...snapshot, requests: [notesVersion] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ request: linkedVersion }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot: { ...snapshot, summary: { ...snapshot.summary, linkedCandidates: 3, unlinked: 4 }, requests: [linkedVersion] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);
    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.clear(screen.getByLabelText("Administrator notes"));
    await user.type(screen.getByLabelText("Administrator notes"), "Unsaved research note");
    await user.type(screen.getByLabelText("Candidate UUID"), candidateId);
    await user.selectOptions(screen.getByLabelText("Status"), "researching");
    const statusButton = screen.getByRole("button", { name: "Save status" });
    await user.click(statusButton);

    await waitFor(() => expect(statusButton).toBeEnabled());
    expect(screen.getByLabelText("Administrator notes")).toHaveValue("Unsaved research note");
    expect(screen.getByLabelText("Candidate UUID")).toHaveValue(candidateId);
    expect(screen.getByRole("button", { name: "Close Company Opportunity Brief" })).not.toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save notes" })).toBeEnabled());
    expect(screen.getByLabelText("Candidate UUID")).toHaveValue(candidateId);
    await user.click(screen.getByRole("button", { name: "Link candidate" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Unlink candidate" })).toBeVisible());
    expect(screen.getByLabelText("Candidate UUID")).toHaveValue("");

    const patchBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "PATCH")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(patchBodies).toEqual([
      { expectedUpdatedAt: request.updatedAt, status: "researching" },
      { expectedUpdatedAt: statusVersion.updatedAt, notes: "Unsaved research note" },
      { expectedUpdatedAt: notesVersion.updatedAt, linkedCandidateId: candidateId },
    ]);
  });

  it("never renders an out-of-range page label", () => {
    render(
      <OpportunityBriefDashboard
        snapshot={{ ...snapshot, page: 100, totalPages: 3 }}
        filters={{ page: "100" }}
      />,
    );

    expect(screen.getByRole("navigation", { name: "Opportunity Brief pages" })).toHaveTextContent("Page 3 of 3");
    expect(screen.queryByText("Page 100 of 3")).not.toBeInTheDocument();
  });

  it("keeps mobile queue links on the 44px touch-target contract", async () => {
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);
    expect(screen.getByRole("link", { name: "Clear filters" }).className).toContain(
      "opportunityClearFilters",
    );
    const css = await import("node:fs/promises").then((fs) =>
      fs.readFile(`${process.cwd()}/app/components/product/product.module.css`, "utf8"),
    );
    expect(css).toMatch(/\.opportunityClearFilters[\s\S]*?min-height:\s*44px/);
    expect(css).toMatch(/\.opportunityRecord\s*>\s*a[\s\S]*?min-height:\s*44px/);
  });

  it("shows service validation errors and loads current data after a 409", async () => {
    const user = userEvent.setup();
    const current = {
      ...request,
      status: "rejected" as const,
      updatedAt: "2026-07-22T07:00:00.000Z",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: "Discovery candidate type does not match the request participant type.",
            request: current,
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);
    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.type(screen.getByLabelText("Candidate UUID"), candidateId);
    await user.click(screen.getByRole("button", { name: "Link candidate" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("changed elsewhere");
    expect(screen.getByRole("dialog")).toHaveTextContent("Rejected");
  });

  it("discards every stale edit on conflict and retries from the returned winner", async () => {
    const user = userEvent.setup();
    const winner = {
      ...request,
      status: "rejected" as const,
      adminNotes: "Winner note",
      linkedCandidateId: candidateId,
      updatedAt: "2026-07-22T07:00:00.000Z",
    };
    const deliberate = {
      ...winner,
      adminNotes: "Deliberate follow-up",
      updatedAt: "2026-07-22T08:00:00.000Z",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request: winner }), { status: 409 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request: winner }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ snapshot: { ...snapshot, requests: [winner] } }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ request: deliberate }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ snapshot: { ...snapshot, requests: [deliberate] } }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);

    await user.click(
      screen.getByRole("button", {
        name: "View company Opportunity Brief details",
      }),
    );
    await user.selectOptions(screen.getByLabelText("Status"), "researching");
    await user.clear(screen.getByLabelText("Administrator notes"));
    await user.type(screen.getByLabelText("Administrator notes"), "Stale note");
    await user.type(screen.getByLabelText("Candidate UUID"), requestId);
    await user.click(screen.getByRole("button", { name: "Save notes" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "another administrator changed it",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "local draft was discarded",
    );
    expect(screen.getByLabelText("Status")).toHaveValue("rejected");
    expect(screen.getByLabelText("Administrator notes")).toHaveValue(
      "Winner note",
    );
    expect(screen.getByLabelText("Candidate UUID")).toHaveValue(candidateId);

    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save notes" })).toBeEnabled(),
    );
    await user.clear(screen.getByLabelText("Administrator notes"));
    await user.type(
      screen.getByLabelText("Administrator notes"),
      "Deliberate follow-up",
    );
    await user.click(screen.getByRole("button", { name: "Save notes" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save notes" })).toBeEnabled(),
    );

    const patchBodies = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "PATCH")
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(patchBodies).toEqual([
      { expectedUpdatedAt: request.updatedAt, notes: "Stale note" },
      { expectedUpdatedAt: winner.updatedAt, notes: "Winner note" },
      {
        expectedUpdatedAt: winner.updatedAt,
        notes: "Deliberate follow-up",
      },
    ]);
  });

  it("exposes loading and network-error feedback", async () => {
    const user = userEvent.setup();
    let reject!: (error: Error) => void;
    const response = new Promise<Response>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    vi.stubGlobal("fetch", vi.fn(() => response));
    render(<OpportunityBriefDashboard snapshot={snapshot} filters={{}} />);
    await user.click(screen.getByRole("button", { name: "View company Opportunity Brief details" }));
    await user.click(screen.getByRole("button", { name: "Save notes" }));

    expect(screen.getByRole("button", { name: "Saving notes" })).toBeDisabled();
    reject(new Error("offline"));
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be saved");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save notes" })).toBeEnabled(),
    );
  });
});
