import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PendingDashboard } from "../app/components/product/PendingDashboard";

const member = {
  name: "Mew Studio",
  organisationName: "Mew Media",
  identityLabel: "Creator · Podcaster",
  domain: "example.com",
};

describe("pending verification dashboard", () => {
  it("shows one clearly labelled example and exactly four coming-soon cards", () => {
    render(
      <PendingDashboard
        member={member}
        status="pending"
        developmentApprovalEnabled={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Verification in progress" }),
    ).toBeVisible();
    const example = screen.getByTestId("example-opportunity");
    expect(within(example).getByText("Example opportunity")).toBeVisible();
    expect(screen.getAllByTestId("example-opportunity")).toHaveLength(1);
    expect(screen.getAllByText("Coming soon")).toHaveLength(4);
    expect(screen.getAllByTestId("coming-soon-opportunity")).toHaveLength(4);
    expect(screen.getByText(/illustrates the format/i)).toBeVisible();
  });

  it("keeps a waitlisted profile honestly visible without example or real picks", () => {
    render(
      <PendingDashboard
        member={member}
        status="waitlisted"
        developmentApprovalEnabled={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Your profile is safely on file" }),
    ).toBeVisible();
    expect(screen.getByText("Mew Studio")).toBeVisible();
    expect(screen.queryByTestId("example-opportunity")).not.toBeInTheDocument();
    expect(screen.queryByTestId("coming-soon-opportunity")).not.toBeInTheDocument();
    expect(screen.queryByText(/counterparty/i)).not.toBeInTheDocument();
  });

  it("offers local approval only when enabled and submits through the protected endpoint", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ ok: true, nextPath: "/dashboard" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onApproved = vi.fn();

    render(
      <PendingDashboard
        member={member}
        status="pending"
        developmentApprovalEnabled
        onDevelopmentApproved={onApproved}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Simulate approval locally" }),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/dev/verification/approve",
      expect.objectContaining({ method: "POST" }),
    );
    expect(onApproved).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
