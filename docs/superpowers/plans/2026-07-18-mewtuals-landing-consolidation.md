# Mewtuals Landing Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the public landing page around five navigation items, one startup/about section, and a standalone `/apply` form.

**Architecture:** Recompose existing landing components instead of hiding content with CSS. `ForStartups` owns the retained comparison, `ApplySection` moves behind a new page route, and case-study application actions navigate to that route. Existing form, menu, PWA, and product behavior remain unchanged.

**Tech Stack:** Vinext/React, TypeScript, CSS, Vitest/Testing Library, Node rendered-HTML tests, Playwright.

---

### Task 1: Lock the new landing contract

**Files:**
- Modify: `tests/navigation.test.tsx`
- Modify: `tests/rendered-html.test.mjs`
- Test: `tests/navigation.test.tsx`

- [ ] **Step 1: Write failing navigation and rendered-landing assertions**

Require the five links in order, assert `About` and `Apply` are absent from the header, require the two comparison cells inside `ForStartups`, and assert the landing omits the About headline, application fields, five startup stages, `#about`, and `#apply`.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm run test:unit -- tests/navigation.test.tsx`

Expected: FAIL because the header still has seven links and the startup component still renders five stages.

- [ ] **Step 3: Recompose the header and landing**

Modify `app/components/SiteHeader.tsx` so its landing link data is exactly:

```ts
[
  { href: "#how-it-works", label: "How it works" },
  { href: "#for-startups", label: "For startups" },
  { href: "/join", label: "For creators", productEntry: true },
  { href: "/join", label: "Join Mewtuals", primary: true },
  { href: "/login", label: "Log in", productEntry: true },
]
```

Give `SiteHeader` an optional `anchorBase` prop that defaults to `""`; prepend it only to the two fragment destinations so non-landing routes can use `anchorBase="/"`. Modify `app/components/ForStartups.tsx` to replace `startup-stages` with the existing two-cell `about-comparison`. Modify `app/page.tsx` to remove `AboutSection` and `ApplySection`.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run: `npm run test:unit -- tests/navigation.test.tsx`

Expected: PASS.

### Task 2: Preserve applications on `/apply`

**Files:**
- Create: `app/apply/page.tsx`
- Delete: `app/components/AboutSection.tsx`
- Modify: `app/components/CaseStudies.tsx`
- Modify: `app/components/CaseStudyDialog.tsx`
- Modify: `tests/caseStudies.ui.test.tsx`
- Modify: `tests/product-pages.test.tsx`
- Test: `tests/applySection.test.tsx`

- [ ] **Step 1: Write failing route and case-study assertions**

Require `ApplyPage` to render the site header with root-prefixed section links and all three application fields. Require `Apply with this path` to link to `/apply`; document navigation and dialog teardown are verified in Playwright rather than JSDOM.

- [ ] **Step 2: Run tests to verify RED**

Run: `npm run test:unit -- tests/caseStudies.ui.test.tsx tests/product-pages.test.tsx`

Expected: FAIL because `/apply` does not exist and the dialog still links to `#apply`.

- [ ] **Step 3: Implement the route and simplify dialog ownership**

Create `app/apply/page.tsx` from `<SiteHeader anchorBase="/" />` and the existing `ApplySection`. Change the dialog CTA to `href="/apply"`; remove the landing focus-transfer ref/effect and the `onApply` prop because document navigation owns the transition. Delete the now-unused `AboutSection` component.

- [ ] **Step 4: Run route, dialog, and form tests to verify GREEN**

Run: `npm run test:unit -- tests/caseStudies.ui.test.tsx tests/product-pages.test.tsx tests/applySection.test.tsx`

Expected: PASS.

### Task 3: Preserve responsive and offline boundaries

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/e2e/mobile-pwa.spec.ts`
- Modify: `tests/rendered-html.test.mjs`

- [ ] **Step 1: Add failing browser assertions for the final route topology**

Require the desktop/mobile landing header to expose the five approved links, the case-study CTA to navigate online to `/apply`, `/apply` to render online at full width without horizontal overflow, and offline `/apply` to show the existing online-required fallback. Assert `/apply` never appears in Cache Storage.

- [ ] **Step 2: Run the focused browser test to verify RED**

Run: `npx playwright test tests/e2e/mobile-pwa.spec.ts`

Expected: FAIL until `/apply` and the new landing structure exist.

- [ ] **Step 3: Remove obsolete startup-stage CSS and tune the retained comparison**

Delete unused `.startup-stages`, `.about-section`, `.about-layout`, and `.about-copy` rules. Preserve `.about-comparison` as the retained two-column desktop / one-column mobile component, and keep the existing five-link mobile menu and touch-target rules.

- [ ] **Step 4: Run the complete release gate**

Run:

```bash
npm test
npm run lint
npm run test:db
npm run test:acceptance
npm run test:e2e
npm run build
git diff --check
```

Expected: all tests, build, lint, browser journeys, and diff checks pass; public offline cache remains landing-only.

- [ ] **Step 5: Commit the implementation**

Commit only the landing consolidation, standalone application route, updated tests, and compact documentation. Preserve unrelated working-tree changes.
