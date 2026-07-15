# Mewtuals Website v2 Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Preserve the current landing page as website v1, rebrand the public website to Mewtuals, and leave the verified v2 running on localhost.

**Architecture:** Use Git tags for immutable source versions and keep the current branch as the active v2 line. Update only public brand surfaces and rendered contracts; preserve the existing component structure, visual system, interactions, engine documentation, package identity, and local-only application boundary.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vinext, Vitest, Testing Library, Git.

---

### Task 1: Freeze website v1

**Files:**
- No source files

- [ ] **Step 1: Confirm the current source state**

Run: git status --short and git rev-parse HEAD.

Expected: .openai/hosting.json is modified and the new Mewtuals design/plan documents are untracked; HEAD is the verified Mutuals website revision. Preserve all three. Later staging must include only the rebrand files and the two documents, never .openai/hosting.json.

- [ ] **Step 2: Create the immutable v1 tag**

Run: git tag website-v1 HEAD.

Expected: git rev-parse website-v1 equals the pre-rebrand HEAD.

### Task 2: Lock the Mewtuals public contract with failing tests

**Files:**
- Modify: tests/rendered-html.test.mjs
- Modify: tests/caseStudies.ui.test.tsx

- [ ] **Step 1: Update the rendered-page contract**

Require:

- title Mewtuals — Partnerships for internet-native companies;
- wordmark Mewtuals;
- hero eyebrow The external partnerships function for internet-native companies.;
- exact Mewtuals hero support;
- exact For startups headline, audience body, and principle;
- exact About headline and both body paragraphs;
- The Mewtuals map;
- accessibility label How Mewtuals changes the business map;
- Put Mewtuals on your company’s side.;
- exact Mewtuals metadata description;
- existing favicon, section, navigation, case-study-count, form-field, and starter-removal assertions.

Reject the old public wordmark/title and old public positioning lines.

- [ ] **Step 2: Update the case-study dialog contract**

Change the expected detail heading from Mutuals’ first approach to Mewtuals’ first approach.

- [ ] **Step 3: Verify RED**

Run: npm run test:unit -- tests/caseStudies.ui.test.tsx, then npm run test:render.

Expected: FAIL because the website still renders Mutuals and the old positioning.

### Task 3: Implement the public Mewtuals rebrand

**Files:**
- Modify: app/components/SiteHeader.tsx
- Modify: app/components/Hero.tsx
- Modify: app/components/ForStartups.tsx
- Modify: app/components/AboutSection.tsx
- Modify: app/components/ApplySection.tsx
- Modify: app/components/CaseStudyDialog.tsx
- Modify: app/layout.tsx

- [ ] **Step 1: Change the wordmark, hero, and metadata**

Use the exact Header, Hero, and Metadata copy from docs/superpowers/specs/2026-07-15-mewtuals-v2-rebrand-design.md. Preserve markup structure, graph asset, CTA targets, favicon, and styling classes.

- [ ] **Step 2: Change audience and About positioning**

Use the exact For startups and About copy from the design spec. Preserve section IDs and the five-stage sequence.

- [ ] **Step 3: Change branded interaction copy**

Rename the case-study detail heading, Apply headline, branded comparison label, and comparison accessibility label. Preserve every interaction and the prototype non-transmission disclosure.

- [ ] **Step 4: Verify GREEN**

Run: npm run test:unit -- tests/caseStudies.ui.test.tsx, then npm run test:render.

Expected: PASS.

### Task 4: Run the automated v2 gate

**Files:**
- Review all Task 2 and Task 3 files

- [ ] **Step 1: Run the full automated gate**

Run: npm test and npm run lint.

Expected: all tests, production build, render contract, and lint pass.

- [ ] **Step 2: Review the diff**

Run: git diff --check and git diff --stat.

Confirm no cat imagery, cute language, public version selector, backend, dependency, internal-engine rename, package rename, or unrelated cleanup.

### Task 5: Run and inspect v2 locally

**Files:**
- No additional source files

- [ ] **Step 1: Start the local server**

Stop the existing production server, then run the current v2 source on http://localhost:4000.

- [ ] **Step 2: Verify desktop and mobile**

Inspect 1440 × 1100 and 390 × 844. Confirm Mewtuals is uniform and restrained, the graph-led hero remains authoritative, mobile typography does not clip, and the public page contains no cat imagery.

- [ ] **Step 3: Verify interactions and console**

Exercise mobile navigation, Study 03 dialog and Escape close, CTA scroll, and valid prototype form submission. Confirm zero browser errors or warnings.

- [ ] **Step 4: Document switching**

Do not create website-v2 yet. Manual verification must pass first.

### Task 6: Commit and freeze the verified website v2

**Files:**
- Stage only the two test files, seven app files, and the design/plan documents

- [ ] **Step 1: Commit only verified rebrand files**

Do not stage .openai/hosting.json.

Commit: feat: rebrand website as Mewtuals v2.

- [ ] **Step 2: Create the immutable v2 tag**

Run: git tag website-v2 HEAD.

Expected: website-v1 and website-v2 resolve to distinct commits, and website-v2 points to the manually verified revision.

- [ ] **Step 3: Document switching**

Version 1: git switch --detach website-v1, rebuild, restart.

Version 2: git switch codex/mutuals-landing or git switch --detach website-v2, rebuild, restart.
