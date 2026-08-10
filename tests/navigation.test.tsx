import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApplySection } from "../app/components/ApplySection";
import { ForCompanies } from "../app/components/ForCompanies";
import { Hero } from "../app/components/Hero";
import { SiteHeader } from "../app/components/SiteHeader";

const navigation = [
  ["Ecosystem", "/ecosystem"],
  ["For companies", "/companies"],
  ["Join Mewtuals", "/join"],
] as const;

describe("SiteHeader", () => {
  it("renders exactly the three approved public destinations in order", () => {
    render(<SiteHeader />);

    const navigationRegion = within(
      screen.getByRole("navigation", { name: "Primary navigation" }),
    );
    const links = navigationRegion.getAllByRole("link");
    expect(links).toHaveLength(navigation.length);

    navigation.forEach(([label, href], index) => {
      expect(links[index]).toHaveAccessibleName(label);
      expect(links[index]).toHaveAttribute("href", href);
    });
    for (const removedLabel of [
      "How it works",
      "For startups",
      "For creators",
      "Log in",
      "About",
      "Apply",
      "Global Demand Radar",
    ]) {
      expect(
        navigationRegion.queryByRole("link", { name: removedLabel }),
      ).not.toBeInTheDocument();
    }

    const home = screen.getByRole("link", { name: "Mewtuals home" });
    expect(home).toHaveAttribute("href", "/");
    expect(home.querySelector(".wordmark-mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("opens the compact menu and closes it after a destination is chosen", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    const menu = screen.getByRole("button", { name: "Open navigation" });

    expect(menu).toHaveAttribute("aria-expanded", "false");
    await user.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    expect(menu).toHaveAccessibleName("Close navigation");

    await user.click(screen.getByRole("link", { name: "For companies" }));
    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveAccessibleName("Open navigation");
  });

  it("returns focus to the menu toggle when Escape closes navigation", async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);
    const menu = screen.getByRole("button", { name: "Open navigation" });

    await user.click(menu);
    screen.getByRole("link", { name: "Ecosystem" }).focus();
    await user.keyboard("{Escape}");

    expect(menu).toHaveAttribute("aria-expanded", "false");
    expect(menu).toHaveFocus();
  });

  it("keeps route destinations stable away from the homepage", () => {
    render(<SiteHeader />);

    expect(
      screen.getByRole("link", { name: "Ecosystem" }),
    ).toHaveAttribute("href", "/ecosystem");
    expect(
      screen.getByRole("link", { name: "For companies" }),
    ).toHaveAttribute("href", "/companies");
  });
});

describe("landing product entry points", () => {
  it("positions Mewtuals for Physical AI and links into the ecosystem", () => {
    render(<Hero />);

    expect(
      screen.getByText(
        "The External Partnerships function for Physical AI companies",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", {
        name: "One partnership can change a robotics company. We find the right one.",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Find my next partnership" }),
    ).toHaveAttribute("href", "/join");
    expect(screen.getByRole("link", { name: "Explore the ecosystem" })).toHaveAttribute(
      "href",
      "/ecosystem",
    );
    expect(screen.getByText("Labs & researchers")).toBeVisible();
  });

  it("merges the startup positioning with the two-part partnership map", () => {
    render(<ForCompanies />);

    expect(
      screen.getByRole("heading", {
        name: "Built for companies bringing intelligence into the physical world.",
        level: 1,
      }),
    ).toBeVisible();
    expect(
      screen.getByText("Less corporate theatre. More useful movement."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Join Mewtuals" })).toHaveAttribute(
      "href",
      "/join",
    );
    const comparison = screen.getByLabelText(
      "How Mewtuals changes the business map",
    );
    expect(within(comparison).getByText("The usual map")).toBeVisible();
    expect(
      within(comparison).getByText("Who are you competing with?"),
    ).toBeVisible();
    expect(within(comparison).getByText("The Mewtuals map")).toBeVisible();
    expect(
      within(comparison).getByText("What becomes possible together?"),
    ).toBeVisible();
    expect(screen.queryByText("Vision in motion")).not.toBeInTheDocument();
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
