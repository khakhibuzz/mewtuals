import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { ADMIN_DESTINATIONS } from "../app/components/product/AdminShell";

describe("administrator navigation", () => {
  it("keeps every administrator workspace in the shared shell's ordered registry", () => {
    expect(ADMIN_DESTINATIONS).toEqual([
      {
        id: "verification-queue",
        href: "/admin/verifications",
        label: "Verification Queue",
      },
      {
        id: "opportunity-briefs",
        href: "/admin/opportunity-briefs",
        label: "Opportunity Briefs",
      },
      {
        id: "india-discovery",
        href: "/admin/discovery",
        label: "India Discovery",
      },
      {
        id: "ecosystem-intelligence",
        href: "/admin/ecosystem-intelligence",
        label: "Ecosystem Intelligence",
      },
      {
        id: "global-demand-radar",
        href: "/admin/global-demand-radar/direct-demand",
        label: "Global Demand Radar",
      },
    ]);
  });

  it.each([
    ["app/admin/verifications/page.tsx", 'current="verification-queue"'],
    ["app/admin/opportunity-briefs/page.tsx", 'current="opportunity-briefs"'],
    ["app/admin/discovery/page.tsx", 'current="india-discovery"'],
    ["app/admin/ecosystem-intelligence/page.tsx", 'current="ecosystem-intelligence"'],
  ])("uses the shared AdminShell in %s", (path, current) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    expect(source).toContain('import { AdminShell }');
    expect(source).toContain(current);
    expect(source).not.toContain("ADMIN_HEADER_LINKS");
    expect(source).not.toContain("headerLinks=");
  });
});
