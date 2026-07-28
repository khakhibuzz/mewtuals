import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DiscoveryDashboard,
  type DiscoveryDashboardSnapshot,
} from "../app/components/product/DiscoveryDashboard";

const snapshot: DiscoveryDashboardSnapshot = {
  summary: {
    totalCompanies: 12,
    totalCreators: 9,
    discoveredToday: 4,
    latestRunStatus: "partial",
    latestRunCompletedAt: "2026-07-22T05:00:00.000Z",
    latestRunDuplicateCount: 3,
  },
  candidates: { items: [], total: 0, page: 1, pageSize: 25 },
  runs: [],
  evidence: [],
};

afterEach(() => {
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

type FetchHandler = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Response | Promise<Response>;

function requestMethod(input: RequestInfo | URL, init?: RequestInit): string {
  if (init?.method) return init.method;
  return input instanceof Request ? input.method : "GET";
}

function requestUrl(input: RequestInfo | URL): string {
  return input instanceof Request ? input.url : String(input);
}

function withEmptyResearch(handler: FetchHandler = async () => {
  throw new Error("Unexpected non-research request");
}) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (
      requestMethod(input, init) === "GET" &&
      url.startsWith("/api/admin/discovery/candidates/")
    ) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ok: true,
            research: {
              candidateId: url.split("/").at(-1),
              latest: null,
              history: [],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return handler(input, init);
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", withEmptyResearch());
});

const candidate: DiscoveryDashboardSnapshot["candidates"]["items"][number] = {
  id: "17ca68ae-8840-4fa2-a5e0-951963f028d5",
  type: "company",
  name: "Aster Labs",
  canonicalUrl: "https://aster.example/",
  websiteUrl: "https://aster.example/",
  primarySocialUrl: "https://youtube.com/@asterlabs",
  linkedinUrl: "https://linkedin.com/company/aster-labs",
  discoveredDescription: "An India AI company building practical tools.",
  category: "AI",
  subcategory: "Productivity",
  geography: "India",
  firstSourceName: "codex_web",
  firstSourceUrl: "https://aster.example/about",
  discoveredAt: "2026-07-22T04:00:00.000Z",
  lastSeenAt: "2026-07-22T05:00:00.000Z",
  updatedAt: "2026-07-22T05:00:00.000Z",
  discoveryScore: 88,
  status: "discovered",
};

function populatedSnapshot(
  overrides: Partial<DiscoveryDashboardSnapshot["candidates"]> = {},
): DiscoveryDashboardSnapshot {
  return {
    ...snapshot,
    candidates: {
      items: [candidate],
      total: 1,
      page: 1,
      pageSize: 25,
      ...overrides,
    },
    evidence: [
      {
        id: "66c8d557-02dd-485f-991d-aa72c1597db0",
        candidateId: candidate.id,
        sourceName: "Company site",
        sourceUrl: "https://aster.example/about",
        firstSeenAt: "2026-07-22T04:00:00.000Z",
        lastSeenAt: "2026-07-22T05:00:00.000Z",
      },
    ],
  };
}

describe("discovery dashboard", () => {
  it("renders all six discovery summary values", () => {
    render(<DiscoveryDashboard snapshot={snapshot} filters={{}} />);

    expect(screen.getByText("12")).toBeVisible();
    expect(screen.getByText("9")).toBeVisible();
    expect(screen.getByText("4")).toBeVisible();
    expect(screen.getByText("Partial")).toBeVisible();
    expect(screen.getByText("22 Jul 2026, 05:00 UTC")).toBeVisible();
    expect(screen.getByText("3")).toBeVisible();
  });

  it("distinguishes an empty discovery network from an empty filtered result", () => {
    const { rerender } = render(
      <DiscoveryDashboard snapshot={snapshot} filters={{}} />,
    );
    expect(screen.getByText("No candidates have been discovered yet.")).toBeVisible();

    rerender(<DiscoveryDashboard snapshot={snapshot} filters={{ type: "company" }} />);
    expect(screen.getByText("No candidates match these filters.")).toBeVisible();
  });

  it("uses accessible GET filters and preserves them in server pagination links", () => {
    render(
      <DiscoveryDashboard
        snapshot={populatedSnapshot({ total: 51 })}
        filters={{
          type: "company",
          geography: "India",
          category: "AI",
          source: "codex_web",
          status: "shortlisted",
          discoveredFrom: "2026-07-01",
          discoveredTo: "2026-07-22",
        }}
      />,
    );

    const filters = screen.getByRole("search", { name: "Filter discovery candidates" });
    expect(filters).toHaveAttribute("method", "get");
    expect(filters).toHaveAttribute("action", "/admin/discovery");
    expect(screen.getByLabelText("Candidate type")).toHaveValue("company");
    expect(screen.getByLabelText("Geography")).toHaveValue("India");
    expect(screen.getByLabelText("Category")).toHaveValue("AI");
    expect(screen.getByLabelText("Source")).toHaveValue("codex_web");
    expect(screen.getByLabelText("Candidate status")).toHaveValue("shortlisted");
    expect(screen.getByLabelText("Discovered from")).toHaveValue("2026-07-01");
    expect(screen.getByLabelText("Discovered before")).toHaveValue("2026-07-22");
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute(
      "href",
      expect.stringMatching(
        /^\/admin\/discovery\?(?=.*type=company)(?=.*category=AI)(?=.*page=2)/,
      ),
    );
    expect(screen.getByRole("link", { name: "Clear filters" })).toHaveAttribute(
      "href",
      "/admin/discovery",
    );
  });

  it("renders candidate columns in a semantic table and labelled narrow records", () => {
    render(<DiscoveryDashboard snapshot={populatedSnapshot()} filters={{}} />);

    const table = screen.getByRole("table", { name: "Discovered candidates" });
    for (const heading of [
      "Name",
      "Type",
      "Category",
      "Geography",
      "Source",
      "Discovered",
      "Confidence",
      "Status",
      "Links",
      "Actions",
    ]) {
      expect(screen.getByRole("columnheader", { name: heading })).toBeVisible();
    }
    expect(table).toHaveTextContent("Aster Labs");
    expect(table).toHaveTextContent("88 / 100");
    expect(table).toHaveTextContent("22 Jul 2026, 04:00 UTC");

    const narrowRecord = screen.getByRole("article", {
      name: "Aster Labs candidate record",
    });
    expect(narrowRecord).toHaveTextContent("TypeCompany");
    expect(narrowRecord).toHaveTextContent("CategoryAI");
    expect(narrowRecord).toHaveTextContent("StatusDiscovered");
    expect(
      screen.getAllByRole("link", { name: "Aster Labs canonical profile" })[0],
    ).toHaveAttribute(
      "href",
      "https://aster.example/",
    );
    expect(
      screen.queryByRole("link", { name: "Aster Labs website" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Aster Labs source" })[0]).toHaveAttribute(
      "href",
      "https://aster.example/about",
    );
  });

  it("keeps a canonical-only identity link in the table, narrow record, and drawer", async () => {
    const user = userEvent.setup();
    const canonicalOnly = {
      ...candidate,
      canonicalUrl: "https://youtube.com/@asterlabs",
      websiteUrl: null,
      primarySocialUrl: null,
      linkedinUrl: null,
    };
    render(
      <DiscoveryDashboard
        snapshot={{
          ...populatedSnapshot(),
          candidates: {
            ...populatedSnapshot().candidates,
            items: [canonicalOnly],
          },
        }}
        filters={{}}
      />,
    );

    expect(
      screen.getAllByRole("link", { name: "Aster Labs canonical profile" }),
    ).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "View Aster Labs details" }));
    const canonicalLinks = screen.getAllByRole("link", {
      name: "Aster Labs canonical profile",
    });
    expect(canonicalLinks).toHaveLength(3);
    expect(canonicalLinks.every((link) => link.getAttribute("href") === canonicalOnly.canonicalUrl)).toBe(
      true,
    );
  });

  it("opens a native candidate details dialog from the keyboard with known evidence", async () => {
    const user = userEvent.setup();
    render(<DiscoveryDashboard snapshot={populatedSnapshot()} filters={{}} />);
    const details = screen.getByRole("button", { name: "View Aster Labs details" });

    details.focus();
    await user.keyboard("{Enter}");

    const dialog = screen.getByRole("dialog", { name: "Aster Labs" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveTextContent("An India AI company building practical tools.");
    expect(dialog).toHaveTextContent("Productivity");
    expect(dialog).toHaveTextContent("22 Jul 2026, 05:00 UTC");
    expect(
      screen.getByRole("link", { name: "Company site evidence" }),
    ).toHaveAttribute("href", "https://aster.example/about");
  });

  it("closes the drawer with Escape, returns focus, and restores body scrolling", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "clip";
    render(<DiscoveryDashboard snapshot={populatedSnapshot()} filters={{}} />);
    const details = screen.getByRole("button", { name: "View Aster Labs details" });

    await user.click(details);
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByRole("button", { name: "Close Aster Labs details" })).toHaveFocus();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Aster Labs" })).not.toBeInTheDocument();
    expect(details).toHaveFocus();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("closes the native dialog before restoring trigger focus from the close button", async () => {
    const user = userEvent.setup();
    render(<DiscoveryDashboard snapshot={populatedSnapshot()} filters={{}} />);
    const details = screen.getByRole("button", { name: "View Aster Labs details" });
    await user.click(details);
    const dialog = screen.getByRole("dialog", { name: "Aster Labs" }) as HTMLDialogElement;
    const order: string[] = [];
    Object.defineProperty(dialog, "close", {
      configurable: true,
      value: vi.fn(() => {
        order.push("close");
        dialog.removeAttribute("open");
      }),
    });
    vi.spyOn(details, "focus").mockImplementation(() => {
      order.push("focus");
    });

    await user.click(screen.getByRole("button", { name: "Close Aster Labs details" }));

    expect(order).toEqual(["close", "focus"]);
    expect(screen.queryByRole("dialog", { name: "Aster Labs" })).not.toBeInTheDocument();
  });

  it("restores the prior body scroll state when unmounted with the drawer open", async () => {
    const user = userEvent.setup();
    document.body.style.overflow = "auto";
    const { unmount } = render(
      <DiscoveryDashboard snapshot={populatedSnapshot()} filters={{}} />,
    );

    await user.click(screen.getByRole("button", { name: "View Aster Labs details" }));
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("auto");
  });

  it("replaces candidates and evidence from a new snapshot while closing stale details", async () => {
    const user = userEvent.setup();
    const firstSnapshot = populatedSnapshot();
    const secondCandidate = {
      ...candidate,
      id: "7e3e70a6-56cb-4904-b87f-ee30a78e85da",
      name: "Beta Works",
      canonicalUrl: "https://beta.example/",
      websiteUrl: "https://beta.example/",
      firstSourceName: "Beta directory",
      firstSourceUrl: "https://directory.example/beta",
      discoveredDescription: "A new candidate on the second page.",
    };
    const secondSnapshot: DiscoveryDashboardSnapshot = {
      ...snapshot,
      candidates: {
        items: [secondCandidate],
        total: 30,
        page: 2,
        pageSize: 25,
      },
      evidence: [
        {
          id: "266ab4c6-2258-43e5-8692-f164dd7b79ee",
          candidateId: secondCandidate.id,
          sourceName: "Beta directory",
          sourceUrl: "https://directory.example/beta",
          firstSeenAt: "2026-07-22T05:00:00.000Z",
          lastSeenAt: "2026-07-22T06:00:00.000Z",
        },
      ],
    };
    const { rerender } = render(
      <DiscoveryDashboard snapshot={firstSnapshot} filters={{}} />,
    );
    const staleOpener = screen.getByRole("button", {
      name: "View Aster Labs details",
    });
    await user.click(staleOpener);
    expect(screen.getByRole("link", { name: "Company site evidence" })).toBeVisible();
    const staleFocus = vi.spyOn(staleOpener, "focus");

    rerender(
      <DiscoveryDashboard snapshot={secondSnapshot} filters={{ page: "2" }} />,
    );

    expect(screen.queryByRole("dialog", { name: "Aster Labs" })).not.toBeInTheDocument();
    expect(screen.queryByText("Aster Labs")).not.toBeInTheDocument();
    expect(screen.getAllByText("Beta Works").length).toBeGreaterThan(0);
    expect(staleFocus).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "View Beta Works details" }));
    expect(screen.getByRole("link", { name: "Beta directory evidence" })).toHaveAttribute(
      "href",
      "https://directory.example/beta",
    );
    expect(
      screen.queryByRole("link", { name: "Company site evidence" }),
    ).not.toBeInTheDocument();
  });

  it("renders compact queued, partial, and failed recent-run states", () => {
    const runs: DiscoveryDashboardSnapshot["runs"] = [
      {
        id: "21f22e19-77a3-46da-9aaa-42e13146f3af",
        trigger: "manual",
        status: "queued",
        startedAt: null,
        completedAt: null,
        createdAt: "2026-07-22T06:00:00.000Z",
        geography: "India",
        candidateType: "both",
        sourcesUsed: ["codex_web"],
        requestedCount: 20,
        foundCount: 0,
        newCount: 0,
        duplicateCount: 0,
        notice: null,
      },
      {
        id: "87c963b4-694a-46bd-9553-ff2593d3424f",
        trigger: "trial",
        status: "partial",
        startedAt: "2026-07-22T04:00:00.000Z",
        completedAt: "2026-07-22T05:00:00.000Z",
        createdAt: "2026-07-22T04:00:00.000Z",
        geography: "India",
        candidateType: "both",
        sourcesUsed: ["codex_web"],
        requestedCount: 20,
        foundCount: 4,
        newCount: 3,
        duplicateCount: 1,
        notice: "1 source error",
      },
      {
        id: "0373c78b-4c84-4b57-8526-a2efea4e866d",
        trigger: "scheduled",
        status: "failed",
        startedAt: "2026-07-21T04:00:00.000Z",
        completedAt: "2026-07-21T05:00:00.000Z",
        createdAt: "2026-07-21T04:00:00.000Z",
        geography: "India",
        candidateType: "both",
        sourcesUsed: ["codex_web"],
        requestedCount: 20,
        foundCount: 0,
        newCount: 0,
        duplicateCount: 0,
        notice: "Worker failure",
      },
    ];
    render(
      <DiscoveryDashboard snapshot={{ ...snapshot, runs }} filters={{}} />,
    );

    const list = screen.getByRole("list", { name: "Recent discovery runs" });
    expect(list).toHaveTextContent("ManualQueued");
    expect(list).toHaveTextContent("Waiting for the Codex worker");
    expect(list).toHaveTextContent("TrialPartial");
    expect(list).toHaveTextContent("4 found · 3 new · 1 duplicate");
    expect(list).toHaveTextContent("1 source error");
    expect(list).toHaveTextContent("ScheduledFailed");
    expect(list).toHaveTextContent("Worker failure");
  });

  it("queues one manual run at a time and announces worker-waiting feedback", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    const fetchMock = vi.fn(() => pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<DiscoveryDashboard snapshot={snapshot} filters={{}} />);
    const queue = screen.getByRole("button", { name: "Run Discovery" });

    await user.click(queue);
    await user.click(queue);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/discovery/runs", {
      method: "POST",
    });
    expect(queue).toBeDisabled();

    pending.resolve(
      new Response(
        JSON.stringify({
          ok: true,
          run: { id: "21f22e19-77a3-46da-9aaa-42e13146f3af", status: "queued" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Discovery run queued. Waiting for the Codex worker.",
    );
    expect(queue).toBeEnabled();
  });

  it("keeps queue progress and feedback in Recent runs when a drawer is open", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    vi.stubGlobal("fetch", withEmptyResearch(() => pending.promise));
    render(<DiscoveryDashboard snapshot={populatedSnapshot()} filters={{}} />);

    await user.click(screen.getByRole("button", { name: "Run Discovery" }));
    expect(
      screen.getByRole("button", { name: "Queuing Discovery…" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "View Aster Labs details" }));
    const dialog = screen.getByRole("dialog", { name: "Aster Labs" });

    pending.resolve(
      new Response(JSON.stringify({ ok: true, run: { status: "queued" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const recentRuns = screen.getByRole("region", { name: "Recent runs" });
    expect(await within(recentRuns).findByRole("status")).toHaveTextContent(
      "Discovery run queued. Waiting for the Codex worker.",
    );
    expect(within(dialog).queryByRole("status")).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses the queue fallback when an error payload is not a string", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { private: "upstream detail" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(<DiscoveryDashboard snapshot={snapshot} filters={{}} />);

    await user.click(screen.getByRole("button", { name: "Run Discovery" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The discovery run could not be queued.");
    expect(alert).not.toHaveTextContent("[object Object]");
  });

  it("keeps candidate mutation feedback and pending labels scoped while another drawer opens", async () => {
    const user = userEvent.setup();
    const pending = deferred<Response>();
    const fetchMock = withEmptyResearch(() => pending.promise);
    const secondCandidate = {
      ...candidate,
      id: "7e3e70a6-56cb-4904-b87f-ee30a78e85da",
      name: "Beta Works",
      canonicalUrl: "https://beta.example/",
      websiteUrl: "https://beta.example/",
      firstSourceUrl: "https://beta.example/about",
    };
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DiscoveryDashboard
        snapshot={populatedSnapshot({ items: [candidate, secondCandidate], total: 2 })}
        filters={{}}
      />,
    );
    await user.click(screen.getByRole("button", { name: "View Aster Labs details" }));

    await user.click(screen.getByRole("button", { name: "Shortlist Aster Labs" }));

    expect(screen.getByRole("button", { name: "Run Discovery" })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Queuing Discovery…" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close Aster Labs details" }));
    await user.click(screen.getByRole("button", { name: "View Beta Works details" }));
    const betaDialog = screen.getByRole("dialog", { name: "Beta Works" });
    expect(
      within(betaDialog).getByRole("button", { name: "Shortlist Beta Works" }),
    ).toBeDisabled();

    pending.resolve(
      new Response(
        JSON.stringify({
          ok: true,
          candidate: {
            ...candidate,
            status: "shortlisted",
            updatedAt: "2026-07-22T06:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    await waitFor(() => {
      expect(
        within(betaDialog).getByRole("button", { name: "Shortlist Beta Works" }),
      ).toBeEnabled();
    });
    expect(within(betaDialog).queryByRole("status")).not.toBeInTheDocument();
    expect(within(betaDialog).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("uses the candidate fallback when an error payload is not a string", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      withEmptyResearch(async () =>
        new Response(JSON.stringify({ error: { private: "upstream detail" } }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(<DiscoveryDashboard snapshot={populatedSnapshot()} filters={{}} />);
    await user.click(screen.getByRole("button", { name: "View Aster Labs details" }));

    await user.click(screen.getByRole("button", { name: "Shortlist Aster Labs" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The candidate status could not be saved.");
    expect(alert).not.toHaveTextContent("[object Object]");
  });

  it.each([
    ["Shortlist Aster Labs", "shortlisted", "Shortlisted"],
    ["Reject Aster Labs", "rejected", "Rejected"],
    ["Queue Aster Labs for profile", "queued_for_profile", "Queued For Profile"],
  ] as const)(
    "submits %s with the current candidate version",
    async (actionName, status, statusLabel) => {
      const user = userEvent.setup();
      const fetchMock = withEmptyResearch(async () =>
        new Response(
          JSON.stringify({
            ok: true,
            candidate: {
              ...candidate,
              status,
              updatedAt: "2026-07-22T06:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      render(<DiscoveryDashboard snapshot={populatedSnapshot()} filters={{}} />);
      await user.click(screen.getByRole("button", { name: "View Aster Labs details" }));

      await user.click(screen.getByRole("button", { name: actionName }));

      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/discovery/candidates/${candidate.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status,
            expectedUpdatedAt: candidate.updatedAt,
          }),
        },
      );
      expect(screen.getByRole("dialog", { name: "Aster Labs" })).toHaveTextContent(
        `Status${statusLabel}`,
      );
      expect(screen.getByRole("status")).toHaveTextContent(
        `Aster Labs is now ${statusLabel.toLowerCase()}.`,
      );
    },
  );

  it("uses the returned candidate version for the next status mutation", async () => {
    const user = userEvent.setup();
    const mutationMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            candidate: {
              ...candidate,
              status: "shortlisted",
              updatedAt: "2026-07-22T06:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            candidate: {
              ...candidate,
              status: "rejected",
              updatedAt: "2026-07-22T07:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const fetchMock = withEmptyResearch(mutationMock);
    vi.stubGlobal("fetch", fetchMock);
    render(<DiscoveryDashboard snapshot={populatedSnapshot()} filters={{}} />);
    await user.click(screen.getByRole("button", { name: "View Aster Labs details" }));

    await user.click(screen.getByRole("button", { name: "Shortlist Aster Labs" }));
    await screen.findByText("Aster Labs is now shortlisted.");
    await user.click(screen.getByRole("button", { name: "Reject Aster Labs" }));
    await screen.findByText("Aster Labs is now rejected.");

    const secondBody = JSON.parse(
      (mutationMock.mock.calls[1]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(secondBody.expectedUpdatedAt).toBe("2026-07-22T06:00:00.000Z");
  });

  it("recovers a 409 with the latest candidate without losing drawer or filter context", async () => {
    const user = userEvent.setup();
    const latest = {
      ...candidate,
      discoveredDescription: "Latest server evidence.",
      status: "rejected" as const,
      updatedAt: "2026-07-22T06:00:00.000Z",
    };
    const mutationMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: false,
            error: "This discovery candidate changed before the status update.",
            candidate: latest,
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            candidate: {
              ...latest,
              status: "queued_for_profile",
              updatedAt: "2026-07-22T07:00:00.000Z",
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    const fetchMock = withEmptyResearch(mutationMock);
    vi.stubGlobal("fetch", fetchMock);
    render(
      <DiscoveryDashboard
        snapshot={populatedSnapshot()}
        filters={{ category: "AI" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "View Aster Labs details" }));

    await user.click(screen.getByRole("button", { name: "Shortlist Aster Labs" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Aster Labs changed elsewhere. Latest status is rejected. Review and try again.",
    );
    const dialog = screen.getByRole("dialog", { name: "Aster Labs" });
    expect(dialog).toHaveTextContent("Latest server evidence.");
    expect(screen.getByRole("button", { name: "Reject Aster Labs" })).toBeDisabled();
    expect(screen.getByLabelText("Category")).toHaveValue("AI");

    await user.click(screen.getByRole("button", { name: "Queue Aster Labs for profile" }));
    const retryBody = JSON.parse(
      (mutationMock.mock.calls[1]?.[1] as RequestInit).body as string,
    ) as Record<string, unknown>;
    expect(retryBody.expectedUpdatedAt).toBe("2026-07-22T06:00:00.000Z");
  });
});
