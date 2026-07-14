# Mutuals Handoff Refresh and Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the existing Mutuals landing page into line with the 2026-07-14 website handoff, preserve the approved sparse visual system, and publish the validated page privately with Sites.

**Architecture:** Keep the current Vinext/Next component structure and change only authoritative public content. The hero and metadata become the handoff's exact promise; the existing illustrative case-study rail remains, but the out-of-scope compliance study is replaced with a strategic manufacturing-access study so the five paths collectively cover current v0 families. The application remains an honest no-network prototype.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vinext, Vitest, Testing Library, Cloudflare Sites.

---

### Task 1: Lock the new hero contract with tests

**Files:**
- Modify: `tests/rendered-html.test.mjs`
- Modify: `app/components/Hero.tsx`
- Modify: `app/layout.tsx`

- [ ] **Step 1: Update the rendered-page test to require the handoff copy**

Replace the old hero assertions with checks for the exact headline, support, eyebrow, and primary CTA:

```js
assert.match(html, /<title>Mutuals — External partnerships for early-stage companies<\/title>/i);
assert.match(html, /Your external partnerships function\./);
assert.match(html, /One partnership can change a company\./);
assert.match(html, /We find the right one\./);
assert.match(html, /Mutuals researches your company, identifies where another organisation can unlock growth, and advances the relationship from hypothesis to pilot\./);
assert.match(html, />Find my next partnership</);
assert.match(html, /Mutuals identifies the highest-value partnership worth pursuing, structures the exchange, and advances it to a decision-ready pilot\./);
```

Keep the existing section, navigation, illustrative-study, application-field, and starter-removal assertions.

- [ ] **Step 2: Run the focused render test and confirm it fails**

Run: `npm run test:render`

Expected: FAIL because the current server-rendered hero and metadata still use the superseded copy.

- [ ] **Step 3: Implement the authoritative hero**

Keep the current two-column layout and graph asset. Replace `Hero` with the handoff structure:

```tsx
export function Hero() {
  return (
    <section className="hero" id="top">
      <div className="hero-copy">
        <p className="hero-eyebrow">Your external partnerships function.</p>
        <h1>
          One partnership can change a company. <strong>We find the right one.</strong>
        </h1>
        <p className="hero-support">
          Mutuals researches your company, identifies where another organisation can
          unlock growth, and advances the relationship from hypothesis to pilot.
        </p>
        <div className="hero-actions">
          <a className="primary-button" href="#apply">Find my next partnership</a>
          <a className="text-link" href="#how-it-works">See how it works</a>
        </div>
      </div>
      <figure className="hero-graph">
        {/* Vinext's local image optimizer is not available in this Sites runtime. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt="Opportunity movement from signal captured through conversation and aligned interest to a human decision"
          height="1402"
          src="/hero-opportunity-graph.png"
          width="1122"
        />
      </figure>
    </section>
  );
}
```

Update `app/layout.tsx` metadata:

```ts
export const metadata: Metadata = {
  title: "Mutuals — External partnerships for early-stage companies",
  description:
    "Mutuals identifies the highest-value partnership worth pursuing, structures the exchange, and advances it to a decision-ready pilot.",
};
```

- [ ] **Step 4: Add only the CSS needed by the new hero elements**

In `app/globals.css`, add restrained mono styling for `.hero-eyebrow` and readable width/spacing for `.hero-support`. Preserve all existing colors, grid spacing, breakpoints, graph treatment, and button behavior; remove `.discipline-line` rules once unused.

- [ ] **Step 5: Run the focused render test and confirm it passes**

Run: `npm run test:render`

Expected: PASS with the new exact hero and unchanged page structure.

### Task 2: Align the five illustrative paths with current v0 scope

**Files:**
- Modify: `tests/caseStudies.test.ts`
- Modify: `app/data/caseStudies.ts`

- [ ] **Step 1: Replace the out-of-scope archetype in the test**

Change the third expected opportunity type from `Spend management × compliance expertise` to `Consumer brand × manufacturing access`. Add an assertion that no opportunity type or study copy contains `compliance`.

```ts
expect(JSON.stringify(caseStudies).toLowerCase()).not.toContain("compliance");
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm run test:unit -- tests/caseStudies.test.ts`

Expected: FAIL because Study 03 still describes the explicitly out-of-scope compliance pathway.

- [ ] **Step 3: Replace Study 03 with a strategic-access example**

Keep the same data contract and `study-03` identity. Use this illustrative content:

```ts
{
  id: "study-03",
  number: "03",
  illustrative: true,
  opportunityType: "Consumer brand × manufacturing access",
  title: "Unlock the next production run",
  thesis:
    "When a growing consumer brand is too large for small-batch production but too early for a major factory commitment, the right manufacturer can turn proven demand into dependable supply.",
  equation: {
    need: "A constrained production run",
    asset: "quality-controlled manufacturing capacity",
    moment: "the reorder threshold",
    whyNow: "proven customer demand",
    test: "one bounded production batch",
  },
  situation:
    "A consumer brand has repeat demand but cannot secure a production partner at the volume, quality, and lead time it can responsibly commit to.",
  signal:
    "Reorders are arriving faster than the current supplier can fulfil, while the next factory tier asks for volumes the company cannot yet justify.",
  hiddenLeverage:
    "The brand brings validated demand and a focused product line; a specialist manufacturer has suitable capacity and wants credible emerging-brand volume.",
  counterpart:
    "A quality-controlled manufacturer with compatible materials, transparent lead times, and capacity for a limited first run.",
  valueExchange: {
    representedCompany:
      "The brand gains dependable supply without making a premature long-term commitment.",
    counterpart:
      "The manufacturer gains a qualified new account with visible demand and a staged path to volume.",
    customer:
      "Customers receive the product with more predictable availability and quality.",
  },
  test:
    "One bounded batch with agreed specifications, inspection criteria, lead time, payment milestones, and no exclusivity.",
  firstApproach:
    "This brand has repeat demand but needs a responsible bridge between small-batch supply and a major factory commitment. Would you scope one bounded run against an agreed quality and lead-time standard?",
  executionSteps: [
    "Confirm demand, specifications, and target economics",
    "Validate capacity, materials, and quality controls",
    "Contract one bounded production batch",
    "Review yield, lead time, landed cost, and reorder evidence",
  ],
  successMeasures: [
    "Accepted units",
    "On-time production",
    "Landed unit cost",
    "Defect rate",
    "Reorder readiness",
  ],
  risks: [
    "Quality variance",
    "Unclear tooling or material ownership",
    "Working-capital pressure",
    "Lead-time slippage",
    "Premature exclusivity",
  ],
  decisionGate:
    "Both companies approve the specifications, inspection standard, payment milestones, delivery window, ownership terms, and continuation threshold.",
}
```

- [ ] **Step 4: Run the case-study tests and confirm they pass**

Run: `npm run test:unit -- tests/caseStudies.test.ts tests/caseStudies.ui.test.tsx`

Expected: PASS with five illustrative cards and the complete accessible detail dialog contract.

### Task 3: Verify the complete landing page

**Files:**
- Review: `app/components/Hero.tsx`
- Review: `app/data/caseStudies.ts`
- Review: `app/globals.css`
- Review: `app/layout.tsx`

- [ ] **Step 1: Run unit and interaction tests**

Run: `npm run test:unit`

Expected: all Vitest suites pass with zero failures.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: ESLint exits successfully with no errors.

- [ ] **Step 3: Run the deployment build and render contract**

Run: `npm run test:render`

Expected: the Vinext build succeeds and the rendered-page contract passes.

- [ ] **Step 4: Review the final diff**

Confirm the diff contains no backend, authentication, engine/dashboard UI, testimonials, fabricated customer outcomes, extra dependencies, or unrelated cleanup. Confirm the form still says submissions are not sent.

- [ ] **Step 5: Verify the rendered page at desktop and mobile widths**

Run the existing development server, open the exact local URL, and inspect the updated hero at 1440 × 1100 and 390 × 844. Confirm the sparse copy-left/graph-right desktop composition, the stacked mobile composition, readable support text, visible primary CTA, intact mobile navigation, purposeful horizontal case-study rail, and prototype disclosure after a valid application. Confirm there are no browser console errors.

### Task 4: Publish the validated page with Sites

**Files:**
- Modify: `.openai/hosting.json` only when Sites returns a new `project_id`

- [ ] **Step 1: Create or reuse the private Sites project**

Reuse an existing `project_id` when present. Otherwise create one Sites project and persist only its returned `project_id` alongside the existing null D1 and R2 bindings.

- [ ] **Step 2: Save the exact validated source revision**

Commit the validated source, push it with the short-lived Sites source credential, and use the resulting branch-head SHA as the version's `commit_sha`.

- [ ] **Step 3: Package and save one version**

Use the Sites packaging helper so the archive contains `dist/server/index.js`, emitted assets, and `dist/.openai/hosting.json`. Save exactly one version from that archive.

- [ ] **Step 4: Deploy privately and poll to completion**

Deploy the saved version privately. Poll the deployment status until it reports `succeeded` or a terminal failure.

- [ ] **Step 5: Open and hand off the deployed URL**

Open the exact deployed URL in the Codex browser and return it as the primary deliverable.
