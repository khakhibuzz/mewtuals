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
- Provide a mobile-specific rendering with substantially larger embedded title and stage-label typography so the same narrative remains legible at phone widths.
- Preserve the four qualitative stages in order:
  1. `Signal captured`
  2. `Conversation initiated`
  3. `Interest aligned`
  4. `Human decision required`
- Keep the curve abstract. It represents progression through a partnership process, not time, probability, value, readiness, conviction, or any other measured quantity.
- Do not add a legend, units, scores, percentages, or explanatory body copy.

## Accessibility

Update the hero image alternative text to: `Qualitative Mewtuals partnership progression: Signal captured, Conversation initiated, Interest aligned, and Human decision required.`

The alternative text must explicitly describe the image as qualitative and name every stage exactly so assistive-technology users receive the complete narrative without false quantitative interpretation.

## Implementation Boundary

- Modify `public/hero-opportunity-graph.png` in place so the existing desktop responsive layout and fallback path remain stable.
- Add `public/hero-opportunity-graph-mobile.png` with larger embedded text for viewports up to 640px.
- Add WebP versions of both desktop and mobile assets to reduce transfer weight while retaining PNG fallbacks.
- Wrap the existing image in a responsive `<picture>` in `app/components/Hero.tsx`, with mobile WebP/PNG sources, desktop WebP, and desktop PNG fallback.
- Extend the rendered-page contract in `tests/rendered-html.test.mjs` to require the responsive sources and exact qualitative alt text, and reject both previous alt-text variants.
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
