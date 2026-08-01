import { render, screen, within } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  ADMIN_DESTINATIONS,
  AdminShell,
  type AdminDestination,
} from "../app/components/product/AdminShell";
import { ProductShell } from "../app/components/product/ProductShell";

type LinkDoubleProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  prefetch?: boolean;
};

vi.mock("next/link", () => ({
  default: ({ prefetch, ...props }: LinkDoubleProps) => (
    <a
      {...props}
      data-next-prefetch={prefetch === undefined ? undefined : String(prefetch)}
    />
  ),
}));

const expectedDestinations = [
  ["Verification Queue", "/admin/verifications"],
  ["Opportunity Briefs", "/admin/opportunity-briefs"],
  ["India Discovery", "/admin/discovery"],
  ["Ecosystem Intelligence", "/admin/ecosystem-intelligence"],
  ["Global Demand Radar", "/admin/global-demand-radar/direct-demand"],
] as const;

describe("AdminShell", () => {
  it("owns the complete ordered administrator navigation", () => {
    expect(ADMIN_DESTINATIONS).toEqual(
      expectedDestinations.map(([label, href], index) => ({
        id: [
          "verification-queue",
          "opportunity-briefs",
          "india-discovery",
          "ecosystem-intelligence",
          "global-demand-radar",
        ][index],
        label,
        href,
      })),
    );

    render(
      <AdminShell
        current="global-demand-radar"
        eyebrow="Global intelligence"
        title="Global Demand Radar"
      >
        <p>Radar content</p>
      </AdminShell>,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Administrator",
    });
    const links = within(navigation).getAllByRole("link");
    expect(links).toHaveLength(expectedDestinations.length);
    expectedDestinations.forEach(([label, href], index) => {
      expect(links[index]).toHaveAccessibleName(label);
      expect(links[index]).toHaveAttribute("href", href);
      expect(links[index]).toHaveAttribute("data-next-prefetch", "false");
    });
    expect(within(navigation).getByRole("link", { current: "page" })).toHaveTextContent(
      "Global Demand Radar",
    );
  });

  it.each([
    "verification-queue",
    "opportunity-briefs",
    "india-discovery",
    "ecosystem-intelligence",
    "global-demand-radar",
  ] satisfies AdminDestination[])("marks exactly one current destination for %s", (current) => {
    render(
      <AdminShell current={current} eyebrow="Operations" title="Administrator">
        <p>Content</p>
      </AdminShell>,
    );

    const navigation = screen.getByRole("navigation", {
      name: "Administrator",
    });
    expect(within(navigation).getAllByRole("link", { current: "page" })).toHaveLength(1);
  });

  it("keeps administrator navigation inside authenticated product chrome", () => {
    render(
      <AdminShell current="verification-queue" eyebrow="Operations" title="Queue">
        <p>Private content</p>
      </AdminShell>,
    );

    expect(within(screen.getByRole("banner")).getByRole("navigation", {
      name: "Administrator",
    })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Queue" })).toBeVisible();
    expect(screen.getByText("Private content")).toBeVisible();
  });

  it("does not change prefetch behavior for public shell links", () => {
    render(
      <ProductShell
        eyebrow="Public"
        headerAction={{ href: "/apply", label: "Apply" }}
        title="Public view"
      >
        <p>Public content</p>
      </ProductShell>,
    );

    expect(screen.getByRole("link", { name: "Mewtuals home" })).not.toHaveAttribute(
      "data-next-prefetch",
    );
    expect(screen.getByRole("link", { name: "Apply" })).not.toHaveAttribute(
      "data-next-prefetch",
    );
  });
});
