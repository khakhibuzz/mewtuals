import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ApplyPage from "../app/apply/page";
import JoinPage from "../app/join/page";
import LoginPage from "../app/login/page";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));

describe("public product entry pages", () => {
  it("offers one email entry for both new and returning members", () => {
    render(<JoinPage />);
    expect(screen.getByRole("heading", { name: "Find the right partnership moment." })).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue with email" })).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Log in" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  it("sends the legacy sign-in route to the shared entry", () => {
    expect(() => LoginPage()).toThrow("NEXT_REDIRECT:/join");
    expect(redirect).toHaveBeenCalledWith("/join");
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
