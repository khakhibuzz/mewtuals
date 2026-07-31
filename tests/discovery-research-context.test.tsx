import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DiscoveryResearchContext } from "../app/components/product/DiscoveryResearchContext";
import { CandidateResearchHistory } from "../app/components/product/CandidateResearchHistory";

const latest = {
  id: "00000000-0000-4000-8000-000000000101",
  discoveryRunId: "00000000-0000-4000-8000-000000000102",
  summary:
    "Aster supplies safety-rated actuator controls that connect Indian robot builders to local motion capability.",
  findings: "Ecosystem role\nAster sits between motor suppliers and robot integrators.\n\nRobot behaviour\nIts controls turn motion plans into repeatable joint movement.",
  sourceUrls: ["https://aster.example/about", "https://example.org/aster"],
  analysisVersion: "physical-ai-v1",
  createdAt: "2026-07-28T06:00:00.000Z",
};

const older = {
  ...latest,
  id: "00000000-0000-4000-8000-000000000103",
  discoveryRunId: "00000000-0000-4000-8000-000000000104",
  summary: "Earlier systems-context summary.",
  findings: "Earlier findings remain available as an immutable version.",
  createdAt: "2026-07-21T06:00:00.000Z",
};

const oldest = {
  ...older,
  id: "00000000-0000-4000-8000-000000000105",
  discoveryRunId: "00000000-0000-4000-8000-000000000106",
  summary: "Oldest systems-context summary.",
  findings: "Oldest immutable findings.",
  sourceUrls: ["https://archive.example.org/aster"],
  createdAt: "2026-07-14T06:00:00.000Z",
};

function response(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("discovery research context", () => {
  it("labels received research as evidence-backed and missing research as unknown", () => {
    const { rerender } = render(
      <CandidateResearchHistory
        candidateName="Aster Labs"
        research={{ latest, history: [older] }}
      />,
    );

    expect(screen.getByText("Evidence-backed")).toBeVisible();
    expect(screen.getByText(latest.summary)).toBeVisible();

    rerender(
      <CandidateResearchHistory
        candidateName="Aster Labs"
        research={{ latest: null, history: [] }}
      />,
    );
    expect(screen.getByText("Unknown")).toBeVisible();
  });

  it("loads lazily and keeps findings and past versions collapsed", async () => {
    const fetchMock = vi.fn(async () =>
      response({
        ok: true,
        research: {
          candidateId: "candidate-1",
          latest,
          history: [older],
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <DiscoveryResearchContext candidateId="candidate-1" candidateName="Aster Labs" />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading systems context for Aster Labs",
    );
    expect(await screen.findByText(latest.summary)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/discovery/candidates/candidate-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.queryByText(latest.findings)).not.toBeInTheDocument();
    expect(screen.queryByText(older.summary)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show findings" }));
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "PRE" && element.textContent === latest.findings,
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Research source 1 for Aster Labs" }),
    ).toHaveAttribute("rel", "noreferrer");

    await user.click(screen.getByRole("button", { name: "History (1)" }));
    await user.click(
      screen.getByRole("button", { name: "View research from 21 Jul 2026, 06:00 UTC" }),
    );
    expect(screen.getByText(older.summary)).toBeVisible();
    expect(
      screen.getByText((_, element) =>
        element?.tagName === "PRE" && element.textContent === older.findings,
      ),
    ).toBeVisible();
  });

  it("keeps newest-first history labels and public source links unchanged", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          ok: true,
          research: {
            candidateId: "candidate-1",
            latest,
            history: [older, oldest],
          },
        }),
      ),
    );
    const user = userEvent.setup();

    render(
      <DiscoveryResearchContext candidateId="candidate-1" candidateName="Aster Labs" />,
    );
    await screen.findByText(latest.summary);
    await user.click(screen.getByRole("button", { name: "History (2)" }));

    expect(
      screen.getAllByRole("button", { name: /View research from/ }).map((button) =>
        button.textContent,
      ),
    ).toEqual([
      "Latest28 Jul 2026, 06:00 UTC",
      "Version 221 Jul 2026, 06:00 UTC",
      "Version 114 Jul 2026, 06:00 UTC",
    ]);

    await user.click(screen.getByRole("button", { name: "Show findings" }));
    expect(
      screen.getByRole("link", { name: "Research source 1 for Aster Labs" }),
    ).toHaveAttribute("href", latest.sourceUrls[0]);
    expect(
      screen.getByRole("link", { name: "Research source 2 for Aster Labs" }),
    ).toHaveAttribute("href", latest.sourceUrls[1]);
  });

  it("renders no research section when the candidate has no research versions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        response({
          ok: true,
          research: { candidateId: "candidate-1", latest: null, history: [] },
        }),
      ),
    );

    const { container } = render(
      <DiscoveryResearchContext candidateId="candidate-1" candidateName="Aster Labs" />,
    );

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("ignores a stale response after the selected candidate changes", async () => {
    const first = deferred<Response>();
    const second = deferred<Response>();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <DiscoveryResearchContext candidateId="candidate-1" candidateName="Aster Labs" />,
    );
    rerender(
      <DiscoveryResearchContext candidateId="candidate-2" candidateName="Beta Works" />,
    );
    second.resolve(
      response({
        ok: true,
        research: {
          candidateId: "candidate-2",
          latest: { ...latest, summary: "Beta systems context." },
          history: [],
        },
      }),
    );
    expect(await screen.findByText("Beta systems context.")).toBeVisible();

    first.resolve(
      response({
        ok: true,
        research: { candidateId: "candidate-1", latest, history: [] },
      }),
    );
    await waitFor(() => expect(screen.queryByText(latest.summary)).not.toBeInTheDocument());
  });

  it("shows a bounded error without rendering an untrusted response", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        response(
          { error: "<script>private payload</script>" },
          { status: 500 },
        ),
      )
      .mockResolvedValueOnce(
        response({
          ok: true,
          research: {
            candidateId: "candidate-1",
            latest,
            history: [],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <DiscoveryResearchContext candidateId="candidate-1" candidateName="Aster Labs" />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Systems context could not be loaded.",
    );
    expect(screen.queryByText(/private payload/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry systems context" }));
    expect(await screen.findByText(latest.summary)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
