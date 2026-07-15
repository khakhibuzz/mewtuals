# Mewtuals v3 Qualitative Hero Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hero graph's unsupported numerical axes with a restrained qualitative Mewtuals partnership progression and preserve v2 as a restorable tag.

**Architecture:** Keep the current `Hero` component and responsive layout stable. Edit the existing desktop raster in place, create a mobile-specific variant with substantially larger embedded text, and serve WebP sources with PNG fallbacks through `<picture>`. Update the server-rendered accessibility contract so the image is explicitly described as qualitative and every stage is named exactly.

**Tech Stack:** Vinext/React, TypeScript, Node test runner, built-in image editing, Playwright CLI, Git tags.

---

### Task 1: Guard the qualitative graph contract

**Files:**
- Modify: `tests/rendered-html.test.mjs`

- [ ] **Step 1: Confirm version preconditions**

Run:

```bash
git rev-parse website-v2^{}
git tag --list website-v3
git status --short
```

Expected: `website-v2^{}` resolves to `ccc1124...`, `website-v3` is absent, and `.openai/hosting.json` is the only unrelated modified file.

- [ ] **Step 2: Write the failing render contract**

Require the exact new alternative text and reject the previous text:

```js
assert.match(
  html,
  /alt="Qualitative Mewtuals partnership progression: Signal captured, Conversation initiated, Interest aligned, and Human decision required\."/,
);
assert.doesNotMatch(
  html,
  /alt="Opportunity movement from signal captured through conversation and aligned interest to a human decision"/,
);
```

Also require mobile WebP and PNG sources plus a desktop WebP source, and reject the earlier incomplete qualitative alt text.

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm run test:render`

Expected: FAIL because the rendered HTML still contains the previous alternative text.

### Task 2: Create the qualitative graph asset

**Files:**
- Modify: `public/hero-opportunity-graph.png`
- Create: `public/hero-opportunity-graph.webp`
- Create: `public/hero-opportunity-graph-mobile.png`
- Create: `public/hero-opportunity-graph-mobile.webp`

- [ ] **Step 1: Edit the existing raster with the built-in image tool**

Use `public/hero-opportunity-graph.png` as the edit target with this invariant-focused request:

```text
Use case: precise-object-edit
Asset type: Mewtuals landing-page hero process graphic
Primary request: Remove every quantitative chart artifact: X and Y labels, numerical tick labels, axis lines, tick marks, and gridlines. Add the small title "Mewtuals partnership progression" near the top-left. The result is an abstract qualitative process curve, not a measured chart.
Text (verbatim): "Mewtuals partnership progression", "Signal captured", "Conversation initiated", "Interest aligned", "Human decision required"
Constraints: Preserve the exact warm paper background, charcoal curve shape, four open-circle markers, stage order, stage wording, typographic restraint, portrait proportions, and whitespace. Keep the four stage labels crisp and legible. Do not add units, scores, legends, percentages, icons, cats, decorations, watermarks, or new stages.
```

- [ ] **Step 2: Inspect the generated image**

Verify all exact labels, curve invariants, clean background, absence of quantitative artifacts, and overall legibility. Iterate once with a targeted correction if any invariant fails.

- [ ] **Step 3: Replace the project asset in place**

Copy the approved generated PNG to `public/hero-opportunity-graph.png`. Preserve a portrait image with no layout or reference-path change.

- [ ] **Step 4: Create the mobile-specific asset**

Use the approved qualitative graph as the edit target. Increase the embedded title and all four stage labels to approximately twice their desktop size while preserving the exact curve, markers, stage order, text, paper background, portrait proportions, and absence of quantitative artifacts. Inspect the result at mobile display scale and save it as `public/hero-opportunity-graph-mobile.png`.

- [ ] **Step 5: Create efficient delivery sources**

Use the available `cwebp` encoder to create desktop and mobile WebP sources. Keep both PNG files as fallbacks and record each file's dimensions and size.

### Task 3: Update the accessible description

**Files:**
- Modify: `app/components/Hero.tsx`

- [ ] **Step 1: Change only the image alternative text**

Wrap the image in `<picture>` with mobile WebP and PNG sources at `(max-width: 640px)`, followed by desktop WebP and the existing desktop PNG fallback. Set:

```tsx
alt="Qualitative Mewtuals partnership progression: Signal captured, Conversation initiated, Interest aligned, and Human decision required."
```

- [ ] **Step 2: Run the focused test and verify GREEN**

Run: `npm run test:render`

Expected: production build succeeds and the rendered-page test passes.

### Task 4: Verify the complete v3 experience

**Files:**
- Verify only; no additional scope.

- [ ] **Step 1: Run the automated gate**

Run:

```bash
npm test
npm run lint
git diff --check
```

Expected: all unit tests and render contract pass, lint exits 0, and no whitespace errors appear.

- [ ] **Step 2: Verify localhost visually**

At `http://localhost:4000/`, capture and inspect the full page at 1440×1100 and 390×844. Confirm the graph is legible, retains the existing curve and stages, and no longer resembles a quantitative chart.

- [ ] **Step 3: Verify runtime health**

Confirm zero browser console errors and HTTP 200 from localhost.

### Task 5: Record website-v3

**Files:**
- Stage only: `public/hero-opportunity-graph.png`, `public/hero-opportunity-graph.webp`, `public/hero-opportunity-graph-mobile.png`, `public/hero-opportunity-graph-mobile.webp`, `app/components/Hero.tsx`, `tests/rendered-html.test.mjs`, `docs/superpowers/specs/2026-07-15-mewtuals-v3-qualitative-graph-design.md`, `docs/superpowers/plans/2026-07-15-mewtuals-v3-qualitative-graph.md`
- Exclude: `.openai/hosting.json`

- [ ] **Step 1: Review the final staged scope**

Use path-specific staging. Run `git diff --cached --name-only` and confirm `.openai/hosting.json` is absent.

- [ ] **Step 2: Commit the refinement**

```bash
git commit -m "fix: make hero progression graph qualitative"
```

- [ ] **Step 3: Create the immutable v3 tag**

```bash
git tag website-v3 HEAD
```

- [ ] **Step 4: Verify tags and localhost**

Confirm `website-v2` still resolves to `ccc1124`, `website-v3` resolves to the new commit, the branch remains `codex/mutuals-landing`, and localhost still returns HTTP 200.
