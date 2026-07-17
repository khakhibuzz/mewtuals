import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");

function mobileBlock(source: string) {
  const start = source.indexOf("@media (max-width: 767px)");
  if (start === -1) return "";

  const openingBrace = source.indexOf("{", start);
  let depth = 0;
  for (let index = openingBrace; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(openingBrace + 1, index);
  }
  return "";
}

function expectRule(block: string, selector: string, declarations: string[]) {
  const rule = new RegExp(`${selector.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\s*\\{([^}]*)\\}`);
  const match = block.match(rule);
  expect(match, `Missing mobile rule for ${selector}`).not.toBeNull();
  for (const declaration of declarations) {
    expect(match?.[1], `Missing ${declaration} in ${selector}`).toContain(declaration);
  }
}

describe("public landing mobile responsive contract", () => {
  it("keeps the sub-768 experience inside one explicit, touch-first media block", () => {
    const mobile = mobileBlock(css);
    expect(mobile).not.toBe("");
    expect(mobile).toContain("--page-gutter: calc(20px + env(safe-area-inset-left, 0px));");
    expect(mobile).toContain("--page-gutter-end: calc(20px + env(safe-area-inset-right, 0px));");
    expect(mobile).toContain("overflow-wrap: anywhere");
    expect(mobile).toContain("min-width: 44px");
    expect(mobile).toContain("min-height: 44px");

    expectRule(mobile, ".site-header", ["padding-left: var(--page-gutter)"]);
    expectRule(mobile, ".navigation-toggle", ["min-height: 44px"]);
    expectRule(mobile, ".primary-navigation a", ["min-height: 48px"]);
    expectRule(mobile, ".primary-navigation .header-primary-link", ["width: 100%"]);

    expectRule(mobile, ".hero", ["grid-template-columns: 1fr", "padding-left: var(--page-gutter)"]);
    expectRule(mobile, ".hero-actions", ["flex-direction: column"]);
    expectRule(mobile, ".hero-actions > *", ["width: 100%", "min-height: 44px"]);
    expectRule(mobile, ".hero-graph", ["width: 100%"]);

    expectRule(mobile, ".case-study-rail", ["overflow-x: auto", "scroll-snap-type: x mandatory"]);
    expectRule(mobile, ".case-study-card", ["min-height: 0"]);
    expectRule(mobile, ".case-dialog-toolbar", ["padding-left: var(--page-gutter)"]);
    expectRule(mobile, ".case-dialog-grid", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".value-exchange-grid", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".execution-list", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".dialog-equation", ["flex-wrap: wrap"]);

    expectRule(mobile, ".startup-stages", ["overflow-x: auto", "scroll-snap-type: x mandatory"]);
    expectRule(mobile, ".about-comparison", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".apply-section", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".application-form .primary-button", ["width: 100%"]);
    expectRule(mobile, ".offline-actions", ["flex-direction: column"]);
    expectRule(mobile, ".offline-actions > *", ["width: 100%", "min-height: 44px"]);
  });
});
