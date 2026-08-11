# Mewtuals Ecosystem viewport correction — design QA

## Evidence

- Source visual truth:
  - `/Users/keshavgarg/Desktop/Screenshot 2026-08-11 at 10.36.28 AM.png`
  - `/Users/keshavgarg/Desktop/Screenshot 2026-08-11 at 10.36.39 AM.png`
- Browser-rendered implementation:
  - `/private/tmp/mewtuals-ecosystem-overview-1728.png`
  - `/private/tmp/mewtuals-ecosystem-unlocks-1728.png`
  - `/private/tmp/mewtuals-ecosystem-mobile.png`
  - `/private/tmp/mewtuals-home-mobile.png`
- Same-input comparisons:
  - `/private/tmp/mewtuals-qa-overview-comparison.png`
  - `/private/tmp/mewtuals-qa-unlocks-comparison.png`
- State: public, unauthenticated `/ecosystem` and `/` routes.
- Desktop normalization: each source screenshot was 3456 × 2234 pixels at 2× density. The 66-pixel browser strip was removed and the result was downsampled to 1728 × 1084, matching the implementation capture at a 1728 × 1084 CSS viewport and 1× screenshot density.
- Mobile validation: 390 × 844 CSS viewport and 390 × 844 implementation pixels.

## Full-view comparison

The overview comparison shows the source on the left and the implementation on the right. The source cuts the ecosystem chain at the viewport edge. The implementation preserves the same typography, warm paper palette, linear icon family, six-stage order, borders, and negative-space character while keeping the complete heading, explanation, and chain inside one viewport below the sticky header.

The unlocks comparison uses the same source-left, implementation-right arrangement. The source includes the preceding chain at the top of the viewport. The implementation begins cleanly below the header and keeps the complete unlock heading, link, and four outcome cards within the second viewport.

## Fidelity surfaces

- Fonts and typography: existing Geist display and body hierarchy is preserved. Heading weight, tight tracking, line height, and copy wrapping remain consistent with the source at the normalized desktop size.
- Spacing and layout rhythm: the two desktop regions are now independent `100svh - header` panels. Content is vertically centered without clipping, overlap, or adjacent-section bleed. Mobile remains content-led with intentional negative space and a single-column card flow.
- Colors and tokens: existing paper, charcoal, and neutral-line tokens are unchanged.
- Image and asset quality: no raster imagery was introduced. Existing Phosphor icons remain crisp, aligned, and consistent; no placeholder or custom-drawn substitutes were added.
- Copy and content: ecosystem and outcome copy is unchanged. The homepage headline now reads “One partnership can change a company. We find the right one.” and the removed “robotics” wording does not remain.
- Responsiveness and accessibility: 390 × 844 captures have no horizontal overflow; the sticky header, menu target sizing, semantic headings, link affordances, and natural mobile document flow are preserved.

## Focused-region comparison

No additional crops were needed. At 1728 × 1084, both combined comparisons keep the headings, navigation, icon cards, dividers, and body copy readable enough to judge typography, spacing, icons, color, and content directly. The separate 390 × 844 captures cover the materially different mobile layout.

## Findings

- No actionable P0, P1, or P2 differences remain.
- The implementation intentionally differs from the source only where required: it compacts vertical spacing enough to contain each complete desktop panel and removes the previous cross-panel bleed.

## Comparison history

- Pass 1: the combined overview and unlocks comparisons confirmed the requested viewport containment without new visual drift. No P0, P1, or P2 fix iteration was required.

## Interaction and browser checks

- Verified both ecosystem panels in the in-app browser at 1440 × 900 and 1728 × 1084.
- Verified the Ecosystem page and homepage at 390 × 844.
- Confirmed desktop panel bounds match `100svh - header`, mobile document width equals client width, and the revised homepage heading has one accessible match.
- No new interactive control was introduced; existing navigation and Join Mewtuals affordances remain unchanged.

final result: passed
