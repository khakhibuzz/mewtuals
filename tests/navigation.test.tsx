import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApplySection } from "../app/components/ApplySection";
import { ForStartups } from "../app/components/ForStartups";
import { Hero } from "../app/components/Hero";
import { SiteHeader } from "../app/components/SiteHeader";

const navigation = [
  ["How it works", "#how-it-works"],
  ["For startups", "#for-startups"],
  ["About", "#about"],
  ["Apply", "#apply"],
  ["For creators", "/join"],
  ["Join Mewtuals", "/join"],
  ["Log in", "/login"],
] as const;

describe("SiteHeader", () => {
  it("keeps the intentional page sections and adds product entry points", () => {
    render(<SiteHeader />);

    const header = within(screen.getByRole("banner"));
    expect(header.getAllByRole("link")).toHaveLength(navigation.length);

    for (const [label, href] of navigation) {
      expect(header.getByRole("link", { name: label })).toHaveAttribute(
        "href",
        href,
      );
    }
  });

  it("opens the compact menu and closes it after a destination is chosen", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    const menu = screen.getByRole("button", { name: "Open navigation" });

    expect(menu).toHaveAttribute("aria-expanded", "false");
    await user.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(menu).toHaveAccessibleName("Close navigation");

    await user.click(screen.getByRole("link", { name: "For startups" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAccessibleName("Open navigation");
  });

  it("returns focus to the menu toggle when Escape closes navigation", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    const menu = screen.getByRole("button", { name: "Open navigation" });

    await user.click(menu);
    screen.getByRole("link", { name: "How it works" }).focus();
    await user.keyboard("{Escape}");

    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
  });
});

describe("landing product entry points", () => {
  it("starts the join flow from the hero and keeps the explanation link", () => {
    render(<Hero />);

    expect(
      screen.getByRole("link", { name: "Find my next partnership" }),
    ).toHaveAttribute("href", "/join");
    expect(screen.getByRole("link", { name: "See how it works" })).toHaveAttribute(
      "href",
      "#how-it-works",
    );
  });

  it("offers startups a restrained route into the working join flow", () => {
    render(<ForStartups />);

    expect(screen.getByRole("link", { name: "Join Mewtuals" })).toHaveAttribute(
      "href",
      "/join",
    );
  });

  it("continues a qualified prototype application into the join flow", async () => {
    const user = userEvent.setup();
    render(
      <ApplySection submitApplication={vi.fn().mockResolvedValue(undefined)} />,
    );

    await user.type(screen.getByLabelText("Company URL"), "argide.ai");
    await user.type(screen.getByLabelText("Work email"), "founder@argide.ai");
    await user.type(screen.getByLabelText("Phone number"), "+919876543210");
    await user.click(
      screen.getByRole("button", { name: "Apply for representation" }),
    );

    expect(
      await screen.findByRole("link", { name: "Continue to Mewtuals" }),
    ).toHaveAttribute("href", "/join");
  });
});
