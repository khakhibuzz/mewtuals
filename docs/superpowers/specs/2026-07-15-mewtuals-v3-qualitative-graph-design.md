# Mewtuals v3 Qualitative Hero Graph Design

**Date:** 2026-07-15
**Status:** Approved direction

## Goal

Replace the hero graph's unsupported quantitative framing with an explicitly qualitative Mewtuals partnership progression while preserving the existing curve, visual restraint, and narrative stages.

## Problem

The current image presents numbered X and Y axes, ticks, and a chart grid without defining measurable variables. That creates false quantitative precision and invites visitors to question what the chart measures.

## Design

- Keep the existing warm paper background, charcoal curve, open-circle markers, typography, proportions, and hero placement.
- Remove the X and Y labels, all numerical tick labels, axis lines, tick marks, and quantitative gridlines.
- Add the restrained title `Mewtuals partnership progression` inside the graphic.
- Preserve the four qualitative stages in order:
  1. `Signal captured`
  2. `Conversation initiated`
  3. `Interest aligned`
  4. `Human decision required`
- Keep the curve abstract. It represents progression through a partnership process, not time, probability, value, readiness, conviction, or any other measured quantity.
- Do not add a legend, units, scores, percentages, or explanatory body copy.

## Accessibility

Update the hero image alternative text to: `Qualitative Mewtuals partnership progression from signal captured through conversation and aligned interest to a human decision`.

The alternative text must explicitly describe the image as qualitative so assistive-technology users are not given a false quantitative interpretation.

## Implementation Boundary

- Modify `public/hero-opportunity-graph.png` in place so the existing responsive layout and asset path remain stable.
- Modify only the hero image alternative text in `app/components/Hero.tsx`.
- Extend the rendered-page contract in `tests/rendered-html.test.mjs` to require the qualitative alt text and reject the previous alt text.
- Do not change hero copy, layout, CSS, curve stages, other components, dependencies, or `.openai/hosting.json`.

## Versioning

- Preserve `website-v2` at commit `ccc1124`.
- After automated and browser verification, commit the refinement and create the immutable local tag `website-v3`.
- Keep `codex/mutuals-landing` on the v3 commit and continue serving the current branch at `http://localhost:4000/`.

## Verification

- Demonstrate RED before implementation by running the rendered-page contract against the old alternative text.
- Run `npm test`, `npm run lint`, and `git diff --check` after implementation.
- Inspect desktop and mobile screenshots to confirm the graph reads as qualitative and remains legible.
- Verify the browser console has zero errors and localhost returns HTTP 200 before tagging v3.
