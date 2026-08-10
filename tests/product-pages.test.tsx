import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ApplyPage from "../app/apply/page";
import JoinPage, { parseOpportunityBriefTracking } from "../app/join/page";
import LoginPage from "../app/login/page";
import NetworkJoinPage from "../app/network/join/page";

describe("public product entry pages", () => {
  it("presents public opportunity-brief acquisition without an account gate", async () => {
    render(await JoinPage({ searchParams: Promise.resolve({}) }));
    expect(screen.getByRole("heading", { name: "Find who you should collaborate with next." })).toBeVisible();
    expect(screen.getByText("Share your company or creator profile. Mewtuals will research it and send you three partnership directions worth exploring. No account required.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Get my opportunity brief" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("preserves the former member-creation experience at /network/join", () => {
    render(<NetworkJoinPage />);
    expect(screen.getByRole("heading", { name: "Find the right partnership moment." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Join Mewtuals" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
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

  it("gives returning members a distinct sign-in entry", () => {
    render(<LoginPage />);
    expect(screen.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Send sign-in link" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Join Mewtuals" })).toHaveAttribute("href", "/join");
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
