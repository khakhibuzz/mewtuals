import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8");
const productCss = readFileSync(
  resolve(process.cwd(), "app/components/product/product.module.css"),
  "utf8",
);

function mobileBlock(source: string, query = "@media (max-width: 767px)") {
  const start = source.indexOf(query);
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

    expectRule(mobile, ".about-comparison", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".apply-section", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".application-form .primary-button", ["width: 100%"]);
    expectRule(mobile, ".offline-actions", ["flex-direction: column"]);
    expectRule(mobile, ".offline-actions > *", ["width: 100%", "min-height: 44px"]);

    for (const obsoleteSelector of [
      ".startup-stages",
      ".about-section",
      ".about-layout",
      ".about-copy",
    ]) {
      expect(css).not.toContain(obsoleteSelector);
    }
  });
});

describe("member and admin mobile responsive contract", () => {
  it("keeps every product surface intentional, touch-friendly, and readable below 768px", () => {
    const mobile = mobileBlock(productCss);
    const compactMobile = mobileBlock(productCss, "@media (max-width: 360px)");
    expect(mobile).not.toBe("");

    expectRule(mobile, ".shell", ["background:"]);
    expectRule(mobile, ".header", [
      "min-height: 4.25rem",
      "padding-left: var(--page-gutter)",
      "padding-right: var(--page-gutter-end)",
    ]);
    expectRule(mobile, ".wordmark", [
      "display: inline-flex",
      "min-height: 44px",
      "align-items: center",
    ]);
    expectRule(mobile, ".headerLink", [
      "display: inline-flex",
      "min-width: 44px",
      "min-height: 44px",
      "justify-content: center",
    ]);
    expectRule(mobile, ".headerButton", [
      "display: inline-flex",
      "min-width: 44px",
      "min-height: 44px",
      "justify-content: center",
    ]);

    expectRule(mobile, ".main", [
      "width: 100%",
      "padding-top: 2.5rem",
      "padding-right: var(--page-gutter-end)",
      "padding-bottom: 3.5rem",
      "padding-left: var(--page-gutter)",
    ]);
    expectRule(mobile, ".panel", ["width: 100%", "padding:"]);
    expectRule(mobile, ".title", ["font-size: clamp(2rem, 12vw, 3rem)"]);

    expectRule(mobile, ".input", ["min-height: 48px", "width: 100%"]);
    expectRule(mobile, ".select", ["min-height: 48px", "width: 100%"]);
    expectRule(mobile, ".textarea", ["min-height: 6.5rem", "width: 100%"]);
    expectRule(mobile, ".button", ["min-height: 48px", "width: 100%"]);
    expectRule(mobile, ".secondaryButton", ["min-height: 48px", "width: 100%"]);
    expectRule(mobile, ".form", ["gap:"]);
    expectRule(mobile, ".status", ["line-height:"]);

    expectRule(mobile, ".choices", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".choice", ["min-height: 48px"]);
    expectRule(mobile, ".confirmation", ["min-height: 48px"]);

    expectRule(mobile, ".memberSummary", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".opportunityMeta", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".queueEvidence", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".memberSummary dd", ["overflow-wrap: anywhere"]);
    expectRule(mobile, ".opportunityMeta dd", ["overflow-wrap: anywhere"]);
    expectRule(mobile, ".queueEvidence dd", ["overflow-wrap: anywhere"]);

    expectRule(mobile, ".sectionHeadingRow", ["flex-direction: column"]);
    expectRule(mobile, ".developmentAction", ["flex-direction: column"]);
    expectRule(mobile, ".placeholderGrid", ["grid-template-columns: repeat(2, minmax(0, 1fr))"]);
    expectRule(compactMobile, ".placeholderGrid", ["grid-template-columns: 1fr"]);

    expectRule(mobile, ".inlineChoices", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".interestGrid", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".compactChoice", ["min-height: 48px"]);
    expectRule(mobile, ".opportunityDetails", ["grid-template-columns: 1fr"]);
    expectRule(mobile, ".exampleCard", ["width: 100%", "padding:"]);
    expectRule(mobile, ".opportunityCard", ["width: 100%", "padding:"]);
    expectRule(mobile, ".queueCard", ["width: 100%", "padding:"]);
    expectRule(mobile, ".cardHeader", ["flex-direction: column"]);
    expectRule(mobile, ".reviewActions", ["flex-direction: column"]);
    expectRule(mobile, ".reviewActions > *", ["width: 100%"]);
  });
});
