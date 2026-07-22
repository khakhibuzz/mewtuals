import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ApplyPage from "../app/apply/page";
import JoinPage from "../app/join/page";
import LoginPage from "../app/login/page";

describe("public product entry pages", () => {
  it("presents the join flow as a private curated network", () => {
    render(<JoinPage />);
    expect(screen.getByRole("heading", { name: "Find the right partnership moment." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Join Mewtuals" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
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
    expect(screen.getByRole("link", { name: "How it works" })).toHaveAttribute(
      "href",
      "/#how-it-works",
    );
  });
});
