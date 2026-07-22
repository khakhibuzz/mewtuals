# Mewtuals Landing Consolidation

## Goal

Make the public landing page shorter and easier to navigate while preserving its existing editorial identity, startup positioning, creator entry point, and member login.

## Landing navigation

The sticky header contains exactly five items, in this order:

1. `How it works` → `#how-it-works`
2. `For startups` → `#for-startups`
3. `For creators` → `/join`
4. `Join Mewtuals` → `/join`, using the existing primary-button treatment
5. `Log in` → `/login`, immediately beside the primary CTA

`About` and `Apply` do not appear in desktop or mobile navigation.

## Consolidated startup section

The landing page keeps the current `For startups` section and removes the separate `About` section. The merged section preserves:

- `Built for companies that move at internet speed.`
- the current right-column audience copy;
- `Less corporate theatre. More useful movement.`;
- the `Join Mewtuals` CTA.

The five-cell startup-stage table is removed. In its place, the section uses the two-cell comparison from About:

- `The usual map` — `Who are you competing with?`
- `The Mewtuals map` — `What becomes possible together?`

The standalone About headline and explanatory copy are not duplicated into the merged section.

## Application route

The application form is removed from the landing page and becomes available through a new `/apply` page. That directly shareable route reuses the existing form and validation behavior. The contextual `Apply with this path` action in a case study leads to `/apply`; the landing header does not advertise the route.

The public-offline boundary does not expand: only the landing page remains available offline, while `/apply` requires a network connection.

## Responsive and acceptance requirements

- Preserve the existing desktop proportions and restrained typography.
- Keep the five-item header usable through the existing mobile menu.
- Keep every mobile link and control at least 44px tall.
- The landing page must not render the About section, application form, five-stage table, or removed navigation labels.
- `/apply` must render the complete existing application form and retain validation, error, and success states.
- Verify the landing page and `/apply` at mobile and desktop widths, including navigation, case-study application routing, overflow, keyboard behavior, and the public-only offline boundary.
