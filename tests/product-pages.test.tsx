import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ApplyPage from "../app/apply/page";
import JoinPage, { parseOpportunityBriefTracking } from "../app/join/page";
import LoginPage from "../app/login/page";
import NetworkJoinPage from "../app/network/join/page";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(() => { throw new Error("redirect"); }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

describe("public product entry pages", () => {
  it("presents public opportunity-brief acquisition without an account gate", async () => {
    render(await JoinPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Find who you should collaborate with next." })).toBeVisible();
    expect(screen.getByText("Share your company or creator profile. Mewtuals will research it and send you three partnership directions worth exploring. No account required.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Get my opportunity brief" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/network/join");
  });

  it("shares one email entry for new and returning members at /network/join", () => {
    render(<NetworkJoinPage />);
    expect(screen.getByRole("heading", { name: "Find the right partnership moment." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with email" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
    expect(screen.getByText("Join or log in")).toBeVisible();
  });

  it("accepts only bounded server-parsed source and UTM query values", () => {
    expect(
      parseOpportunityBriefTracking({
        source: " bengaluru-meetup ",
        utm_source: " linkedin ",
        utm_medium: "social",
        utm_campaign: "launch",
        utm_term: "creator partnership",
        utm_content: "qr-card",
        redirect: "https://attacker.test",
      }),
    ).toEqual({
      source: "bengaluru-meetup",
      utm: {
        source: "linkedin",
        medium: "social",
        campaign: "launch",
        term: "creator partnership",
        content: "qr-card",
      },
    });

    expect(
      parseOpportunityBriefTracking({
        source: "not valid",
        utm_source: "x".repeat(201),
        utm_medium: ["social", "email"],
        unknown: "must-not-reflect",
      }),
    ).toEqual({ utm: {} });
  });

  it("redirects legacy login bookmarks to the shared member entry", () => {
    expect(() => LoginPage()).toThrow("redirect");
    expect(redirectMock).toHaveBeenCalledWith("/network/join");
  });

  it("keeps the application form on a directly shareable page", () => {
    render(<ApplyPage />);

    expect(screen.getByRole("heading", { name: "Put Mewtuals on your company’s side." })).toBeVisible();
    expect(screen.getByLabelText("Company URL")).toBeRequired();
    expect(screen.getByLabelText("Work email")).toBeRequired();
    expect(screen.getByLabelText("Phone number")).toBeRequired();
    expect(screen.getByRole("link", { name: "Ecosystem" })).toHaveAttribute(
      "href",
      "/ecosystem",
    );
  });
});
