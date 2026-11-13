# Mutuals Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive, interactive Mutuals landing page that matches the approved graph-right visual direction and converts qualified startup founders through a three-field application.

**Architecture:** Use the Sites React/TypeScript starter as a single-route site. Keep canonical case-study content in typed data, isolate application validation and submission behind pure boundaries, and split the four major page sections into focused components. One reusable accessible dialog presents all deep dives.

**Tech Stack:** React, TypeScript, Vinext/Vite Sites starter, CSS, Vitest, Testing Library.

---

### Task 1: Initialize the site and test harness

**Files:**
- Create or update: `package.json`
- Create or update: `app/layout.tsx`
- Create or update: `app/page.tsx`
- Create or update: `app/globals.css`
- Create: `vitest.config.ts`
- Create: `tests/setup.ts`

- [ ] **Step 1: Create the implementation branch**

Run: `git switch -c codex/mutuals-landing`

Expected: the unborn repository switches from `main` to `codex/mutuals-landing` without changing working files.

- [ ] **Step 2: Preserve approved artifacts while initializing the Sites project once**

The initializer accepts only an empty target. Preserve the approved work inside its allowed `work/` directory, run it once in the project root, then restore the artifacts:

```bash
mkdir -p work/preinit
mv .gitignore design docs .superpowers work/preinit/
"<historical-sites-plugin-directory>/scripts/init-site.sh" "$PWD"
mv work/preinit/design work/preinit/docs work/preinit/.superpowers .
mv work/preinit/.gitignore work/preinit-gitignore
rmdir work/preinit
```

Merge `.superpowers/` into the starter `.gitignore` with `apply_patch`; do not replace the starter ignore rules.

Expected: the starter, lockfile, and `.openai/hosting.json` are present; `design/`, `docs/`, and `.superpowers/` are restored; dependencies install successfully. Do not run another initializer.

- [ ] **Step 3: Install the test tools**

Run: `npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom`

Expected: exit 0 and the existing package manager/lockfile are preserved.

- [ ] **Step 4: Configure Vitest**

Create `vitest.config.ts` with the React/Vite configuration already present in the starter, `environment: "jsdom"`, `setupFiles: ["./tests/setup.ts"]`, and test include `tests/**/*.test.{ts,tsx}`. Import `@testing-library/jest-dom/vitest` in `tests/setup.ts` and clean up Testing Library after each test.

Preserve the rendered-HTML test and add unit-test scripts:

```json
"test": "npm run test:unit && npm run test:render",
"test:unit": "vitest run",
"test:watch": "vitest",
"test:render": "npm run build && node --test tests/rendered-html.test.mjs"
```

- [ ] **Step 5: Remove starter-only UI and metadata**

Remove `app/_sites-preview` and its imports, remove the temporary `codex-preview` metadata marker, and set title `Mutuals — Company representation` with the description from the exact primary promise. Preserve `.openai/hosting.json` and the Sites Vite plugin.

- [ ] **Step 6: Verify the starter build**

Run: `npm run build`

Expected: exit 0 with no TypeScript or bundler errors.

- [ ] **Step 7: Commit the initialized foundation**

Run: `git add . && git commit -m "chore: initialize Mutuals landing site"`

Expected: one clean foundation commit on `codex/mutuals-landing`.

### Task 2: Define canonical case-study data with TDD

**Files:**
- Create: `app/data/caseStudies.ts`
- Create: `tests/caseStudies.test.ts`

- [ ] **Step 1: Write the failing contract test**

The test imports `caseStudies` and requires:

- exactly five records;
- unique ids and numbers `01` through `05`;
- `illustrative: true` on every record;
- archetypes in this exact order: support automation × product analytics, wellness commerce × local service touchpoint, spend management × compliance expertise, developer tooling × implementation channel, mobility demand × hospitality distribution;
- non-empty card fields `opportunityType`, `title`, `thesis`, and the five-part `equation`;
- non-empty dialog fields `situation`, `signal`, `hiddenLeverage`, `counterpart`, both sides of `valueExchange`, `test`, `firstApproach`, four `executionSteps`, at least three `successMeasures`, at least three `risks`, and `decisionGate`.

Run: `npm run test:unit -- tests/caseStudies.test.ts`

Expected: FAIL because `app/data/caseStudies.ts` does not exist.

- [ ] **Step 2: Implement the typed records**

Create and export these types:

```ts
export type ValueEquation = {
  need: string;
  asset: string;
  moment: string;
  whyNow: string;
  test: string;
};

export type CaseStudy = {
  id: string;
  number: `0${1 | 2 | 3 | 4 | 5}`;
  illustrative: true;
  opportunityType: string;
  title: string;
  thesis: string;
  equation: ValueEquation;
  situation: string;
  signal: string;
  hiddenLeverage: string;
  counterpart: string;
  valueExchange: { representedCompany: string; counterpart: string; customer: string };
  test: string;
  firstApproach: string;
  executionSteps: readonly [string, string, string, string];
  successMeasures: readonly string[];
  risks: readonly string[];
  decisionGate: string;
};
```

Transcribe the five canonical studies from the approved design spec without adding traction claims.

- [ ] **Step 3: Verify green**

Run: `npm run test:unit -- tests/caseStudies.test.ts`

Expected: PASS, 1 test file and all assertions green.

- [ ] **Step 4: Commit the content model**

Run: `git add app/data/caseStudies.ts tests/caseStudies.test.ts && git commit -m "feat: model Mutuals opportunity studies"`

### Task 3: Define application validation and submission boundaries with TDD

**Files:**
- Create: `app/lib/application.ts`
- Create: `tests/application.test.ts`

- [ ] **Step 1: Write failing URL-validation tests**

Test normalization of `argide.ai` to `https://argide.ai/` and acceptance of `https://www.argide.ai/demo`. Test rejection of `argide`, `ftp://argide.ai`, spaces, localhost, and private IPv4 addresses.

Run: `npm run test:unit -- tests/application.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 2: Write failing email and phone tests**

Require trimmed/lowercased emails with a dotted domain while allowing a valid Gmail address. Require phone normalization to optional `+` plus 8–15 digits; reject alphabetic, too-short, and too-long values.

- [ ] **Step 3: Write the failing aggregate-validation test**

Define the desired result contract:

```ts
export type ApplicationInput = { companyUrl: string; workEmail: string; phone: string };
export type ApplicationErrors = Partial<Record<keyof ApplicationInput, string>>;
export type ApplicationResult =
  | { ok: true; value: ApplicationInput }
  | { ok: false; errors: ApplicationErrors };
export type ApplicationSubmitter = (value: ApplicationInput) => Promise<void>;
```

Require distinct required and invalid-format messages.

- [ ] **Step 4: Implement the smallest pure validators**

Export `validateCompanyUrl`, `validateWorkEmail`, `validatePhone`, and `validateApplication`. Export `prototypeSubmitter` as a no-network async adapter so `ApplySection` can receive a production submitter later without changing its UI contract.

- [ ] **Step 5: Verify green**

Run: `npm run test:unit -- tests/application.test.ts`

Expected: every URL, email, phone, normalization, aggregate-error, and valid-output test passes.

- [ ] **Step 6: Commit the application boundary**

Run: `git add app/lib/application.ts tests/application.test.ts && git commit -m "feat: validate Mutuals applications"`

### Task 4: Build the case-study rail and accessible dialog with TDD

**Files:**
- Create: `app/components/CaseStudies.tsx`
- Create: `app/components/CaseStudyDialog.tsx`
- Create: `tests/caseStudies.ui.test.tsx`

- [ ] **Step 1: Write failing render and open tests**

Render `CaseStudies`. For every one of the five native card buttons, assert its own visible `Illustrative case study` marker, opportunity type, title, thesis, compressed five-part equation, and `Open case study` affordance. Assert absence of dialog content before interaction. Activate Study 01 and assert the matching dialog title plus all 11 detail groups.

Run: `npm run test:unit -- tests/caseStudies.ui.test.tsx`

Expected: FAIL because components do not exist.

- [ ] **Step 2: Write failing keyboard and lifecycle tests**

Assert:

- every card is a native button;
- activating a focused card opens `role="dialog"` with `aria-modal="true"`;
- initial focus moves to the explicit `Back to case studies` control;
- Escape closes the dialog;
- focus returns to the originating card;
- opening stores the prior body overflow, adds `data-dialog-open="true"`, and sets `document.body.style.overflow = "hidden"`; closing or unmount restores the previous overflow and removes the attribute;
- Tab from the last focusable dialog control wraps to the first, and Shift+Tab from first wraps to last.

- [ ] **Step 3: Implement the minimal components**

Use one horizontal `<ol>` and one reusable dialog. Implement a small focus-management effect scoped to the dialog; do not add a generic modal library. Render all canonical deep-dive fields. Add one dialog CTA linking to `#apply`.

- [ ] **Step 4: Verify green**

Run: `npm run test:unit -- tests/caseStudies.ui.test.tsx`

Expected: all rendering, Escape, focus, body-lock, and Tab-cycle tests pass.

- [ ] **Step 5: Commit the interaction**

Run: `git add app/components/CaseStudies.tsx app/components/CaseStudyDialog.tsx tests/caseStudies.ui.test.tsx && git commit -m "feat: add deep opportunity case studies"`

### Task 5: Build the accessible application flow with TDD

**Files:**
- Create: `app/components/ApplySection.tsx`
- Create: `tests/applySection.test.tsx`

- [ ] **Step 1: Write failing structure and invalid-submit tests**

Render `<ApplySection submitApplication={submitter} />`. Assert the exact line `No deck required. We start with the company itself.` and exactly three labeled required inputs. Submit empty values and require a `role="alert"` summary, field-specific errors connected with `aria-describedby`, `aria-invalid="true"`, and no submitter call.

Run: `npm run test:unit -- tests/applySection.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 2: Write failing valid-submit and reset tests**

Fill `argide.ai`, `FOUNDER@ARGIDE.AI`, and `+91 98765 43210`. Require the injected submitter to receive normalized values. Require a success state containing `Prototype mode — your information was not sent`, a `Try another application` control, and restoration of the blank form when reset.

- [ ] **Step 3: Implement the form**

Accept `submitApplication: ApplicationSubmitter` as a prop with `prototypeSubmitter` default. Keep status `idle | submitting | success | error`, disable only while submitting, move focus to the error summary or success heading, and preserve typed values after validation errors.

- [ ] **Step 4: Verify green**

Run: `npm run test:unit -- tests/applySection.test.tsx`

Expected: structure, accessibility, normalization, injected boundary, prototype disclosure, and reset tests pass.

- [ ] **Step 5: Commit the application flow**

Run: `git add app/components/ApplySection.tsx tests/applySection.test.tsx && git commit -m "feat: add frictionless founder application"`

### Task 6: Build the selected visual direction and remaining page sections

**Files:**
- Create: `app/components/SiteHeader.tsx`
- Create: `app/components/Hero.tsx`
- Create: `app/components/ForStartups.tsx`
- Create: `app/components/AboutSection.tsx`
- Create: `public/hero-opportunity-graph.png`
- Modify: `app/page.tsx`
- Modify: `app/globals.css`
- Create: `tests/navigation.test.tsx`
- Modify: `tests/rendered-html.test.mjs`

- [ ] **Step 1: Generate and inspect one graph asset**

Use the selected visual target `design/reference/mutuals-objective-field.png` as the reference for one project-bound raster graph. The asset contains the warm paper background, coordinate grid, line, nodes, and these labels verbatim: `Signal captured`, `Conversation initiated`, `Interest aligned`, `Human decision required`. It contains no hero or navigation copy. Save it as `public/hero-opportunity-graph.png` and inspect the result at desktop scale before use.

- [ ] **Step 2: Write failing navigation tests**

Render `SiteHeader`. Require exactly four links with these targets: `How it works → #how-it-works`, `For startups → #for-startups`, `About → #about`, and `Apply → #apply`. Require a mobile menu button with `aria-expanded`, opening and closing behavior, and menu closure after a link is selected.

Run: `npm run test:unit -- tests/navigation.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the header**

Build a quiet sticky header. Use native anchors and a compact disclosure menu at the mobile breakpoint. Do not add unrequested links or social icons.

- [ ] **Step 4: Implement the exact hero**

Use the primary promise verbatim. Keep the final clause in near-black. Link `Represent my company` to `#apply` and `See how an opportunity moves` to `#how-it-works`. Place the graph asset at right and the line `One company at a time. One opportunity until it moves.` below the actions.

- [ ] **Step 5: Implement For startups and About**

Use the approved headlines and concise supporting copy from the spec. Do not add feature lists, founder portraits, statistics, or decorative cards.

- [ ] **Step 6: Compose the page**

Order: Header, Hero, How it works, For startups, About, Apply. Give every section its exact id and `scroll-margin-top` equal to the sticky header plus breathing room.

- [ ] **Step 7: Implement the selected layout and responsiveness**

In `app/globals.css`, define warm paper, soft charcoal, near-black, hairline grid, restrained sans typography, negative-space scale, visible focus ring, and reduced-motion behavior. Desktop case studies use one five-column row. Tablet/mobile use horizontal overflow with `scroll-snap-type: x mandatory`; cards never wrap into a generic grid. Mobile stacks hero copy before the graph and makes the dialog a full-screen reading surface.

- [ ] **Step 8: Verify navigation and all tests**

Replace the disposable starter assertions in `tests/rendered-html.test.mjs` with rendered-page assertions for the title, exact hero promise, the four section ids, five illustrative-study markers, and the three application labels.

Run: `npm test`

Expected: all data, validation, dialog, form, and navigation tests pass with zero failures.

- [ ] **Step 9: Commit the complete page**

Run: `git add app public tests && git commit -m "feat: build Mutuals landing experience"`

### Task 7: Verify build, browser behavior, and design fidelity

**Files:**
- Create: `artifacts/mutuals-desktop.png`
- Create: `artifacts/mutuals-mobile.png`
- Create: `artifacts/mutuals-comparison.png`
- Create: `design-qa.md`

- [ ] **Step 1: Run fresh automated verification**

Run: `npm test`

Expected: all test files and tests pass, zero failures.

Run: `npm run build`

Expected: exit 0, no TypeScript or bundler errors.

- [ ] **Step 2: Start the local site**

Run: `npm run dev -- --host 0.0.0.0 --port 4173 --strictPort`

Expected: a healthy local URL on port 4173. Keep the process running.

- [ ] **Step 3: Verify primary browser journeys**

In the in-app browser at 1440px desktop width, verify all four anchors, open Study 01, inspect the complete dialog, close with Escape, confirm focus restoration, submit the empty form, submit valid prototype values, reset the form, and check console errors. Repeat layout verification at 390px mobile width, including the disclosure menu and horizontal case-study rail.

- [ ] **Step 4: Capture evidence**

Save desktop and mobile screenshots to `artifacts/`. Compose the 1440px source mock and desktop implementation side-by-side as `artifacts/mutuals-comparison.png`, matching crop and state.

- [ ] **Step 5: Run the Product Design QA loop**

Write `design-qa.md` with source and implementation paths, viewport, state, interaction checks, console status, full-view and focused-region comparisons, and explicit evaluations of typography, spacing, colors, image quality, copy, responsiveness, and accessibility. Fix every P0/P1/P2 issue, recapture, and repeat until `final result: passed`.

- [ ] **Step 6: Run final verification after QA fixes**

Run: `npm test && npm run build`

Expected: both commands exit 0 after the final visual fixes.

- [ ] **Step 7: Commit verified polish**

Run: `git add artifacts design-qa.md app public tests && git commit -m "test: verify Mutuals landing experience"`

- [ ] **Step 8: Keep the verified local server running for feedback**

Do not deploy or publish without the user asking. Return the clickable local URL first.
