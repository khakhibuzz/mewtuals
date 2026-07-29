import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ADMIN_HEADER_LINKS } from "../app/components/product/admin-navigation";

describe("administrator navigation", () => {
  it("keeps the four administrator workspaces in one shared ordered registry", () => {
    expect(ADMIN_HEADER_LINKS).toEqual([
      { href: "/admin/opportunity-briefs", label: "Opportunity Briefs" },
      { href: "/admin/discovery", label: "Discovery" },
      { href: "/admin/ecosystem-intelligence", label: "Ecosystem Intelligence" },
      { href: "/admin/verifications", label: "Verification queue" },
    ]);
  });

  it.each([
    "app/admin/opportunity-briefs/page.tsx",
    "app/admin/discovery/page.tsx",
    "app/admin/ecosystem-intelligence/page.tsx",
    "app/admin/verifications/page.tsx",
  ])("uses the shared registry in %s", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    expect(source).toMatch(/ADMIN_HEADER_LINKS/);
    expect(source).not.toMatch(/headerLinks=\{\[/);
  });
});
