import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VerifiedDashboard } from "../app/components/product/VerifiedDashboard";

const opportunity = {
  id: "1723c982-a683-4e57-a584-26837f011347",
  title: "Startup distribution pilot",
  summary:
    "Match a startup with a distribution partner through a focused pilot.",
  direction: "startup_distribution_partner" as const,
  counterpartyType: "Distribution partner with relevant customer access",
  reciprocalValue:
    "Relevant customer access ↔ a useful product story and measurable pilot learning",
  fitSummary: "Fits your current interest in distribution partnerships.",
  rank: 1,
  introduction: null,
};

describe("verified member dashboard", () => {
  it("shows the exact honest empty state without search or marketplace controls", () => {
    render(<VerifiedDashboard signal={null} opportunities={[]} />);

    expect(screen.getByText("No strong fit is ready yet")).toBeVisible();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/browse/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/marketplace/i)).not.toBeInTheDocument();
  });

  it("renders no more than three generic, reciprocal cards without a real-world identity", () => {
    const opportunities = Array.from({ length: 4 }, (_, index) => ({
      ...opportunity,
      id: `00000000-0000-4000-8000-00000000000${index}`,
      rank: index + 1,
    }));
    render(
      <VerifiedDashboard
        signal={{
          availability: "open_now",
          openTo: ["distribution_partnerships"],
          notes: null,
        }}
        opportunities={opportunities}
      />,
    );

    const cards = screen.getAllByTestId("curated-opportunity");
    expect(cards).toHaveLength(3);
    expect(within(cards[0]).getByText("Startup ↔ distribution partner")).toBeVisible();
    expect(
      within(cards[0]).getByText(
        "Distribution partner with relevant customer access",
      ),
    ).toBeVisible();
    expect(within(cards[0]).getByText(/Why this fits now/i)).toBeVisible();
    expect(within(cards[0]).getByText(/Reciprocal value/i)).toBeVisible();
    expect(
      within(cards[0]).getByText(
        "Relevant customer access ↔ a useful product story and measurable pilot learning",
      ),
    ).toBeVisible();
    expect(screen.queryByText("Acme Media")).not.toBeInTheDocument();
  });

  it("saves the signal with accessible recovery after a rejected request", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true, nextPath: "/dashboard" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
    );
    const onSaved = vi.fn();
    render(
      <VerifiedDashboard
        signal={null}
        opportunities={[]}
        onSignalSaved={onSaved}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: "Distribution partnerships" }),
    );
    const save = screen.getByRole("button", { name: "Save my signal" });
    await user.click(save);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We could not complete that request. Try again.",
    );
    expect(save).toBeEnabled();

    await user.click(save);
    expect(onSaved).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it("shows field validation and session-expiry recovery from the signal endpoint", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            ok: false,
            error: "Review what you are open to.",
            errors: { openTo: "Choose at least one current interest." },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    render(<VerifiedDashboard signal={null} opportunities={[]} />);

    await user.click(screen.getByRole("button", { name: "Save my signal" }));

    expect(await screen.findByText("Choose at least one current interest.")).toBeVisible();
    expect(
      screen.getByRole("group", { name: "Partnership interests" }),
    ).toHaveAccessibleDescription("Choose at least one current interest.");
    vi.unstubAllGlobals();
  });

  it("changes an advanced pick to the durable reviewing status and keeps it after refresh", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          introduction: { id: "intro-id", state: "requested" },
          message: "Mewtuals is reviewing the relationship",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(
      <VerifiedDashboard signal={null} opportunities={[opportunity]} />,
    );

    await user.click(
      screen.getByRole("button", { name: "Ask Mewtuals to advance this" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/opportunities/${opportunity.id}/advance`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      await screen.findByText("Mewtuals is reviewing the relationship"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Ask Mewtuals to advance this" }),
    ).not.toBeInTheDocument();

    rerender(
      <VerifiedDashboard
        signal={null}
        opportunities={[
          {
            ...opportunity,
            introduction: { id: "intro-id", state: "requested" },
          },
        ]}
      />,
    );
    expect(
      screen.getByText("Mewtuals is reviewing the relationship"),
    ).toBeVisible();
    vi.unstubAllGlobals();
  });
});
