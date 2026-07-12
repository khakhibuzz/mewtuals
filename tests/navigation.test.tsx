import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "../app/components/SiteHeader";

const navigation = [
  ["How it works", "#how-it-works"],
  ["For startups", "#for-startups"],
  ["About", "#about"],
  ["Apply", "#apply"],
] as const;

describe("SiteHeader", () => {
  it("links only to the four intentional page sections", () => {
    render(<SiteHeader />);

    expect(within(screen.getByRole("banner")).getAllByRole("link")).toHaveLength(4);

    for (const [label, href] of navigation) {
      expect(screen.getByRole("link", { name: label })).toHaveAttribute(
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
