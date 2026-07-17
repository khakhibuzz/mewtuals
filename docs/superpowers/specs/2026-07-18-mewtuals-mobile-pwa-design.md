# Mewtuals Mobile and PWA Design

**Status:** Approved for implementation on 2026-07-18

## Objective

Extend the existing Mewtuals product into an intentionally designed mobile
experience without changing its product behavior or established desktop visual
identity. Add installable PWA support with a deliberately small offline scope:
the public landing page remains available, while every member or transactional
surface requires a network connection.

## Product and Visual Constraints

- Keep the Mewtuals name, restrained editorial tone, warm paper background,
  charcoal typography, graph lines, negative space, and current desktop
  composition.
- Do not add cat imagery, cute language, generic app chrome, or a new visual
  design system.
- Do not remove or defer any existing workflow, field, state, or action.
- Treat widths below `768px` as the intentional mobile layout. Existing
  intermediate tablet behavior may remain where it improves fit, but the
  mobile rules use a single `max-width: 767px` boundary.
- Use at least 44px touch targets for interactive controls, maintain visible
  focus states, and prevent horizontal page overflow at 320px and above.

## Implementation Approach

Use a route-specific responsive extension of the existing CSS rather than a
rewrite. The landing page continues to use `app/globals.css`; authenticated
product surfaces continue to use
`app/components/product/product.module.css`. Components change only where a
mobile interaction or PWA boundary cannot be expressed safely in CSS.

PWA behavior is isolated behind a small registration component, a manifest,
an offline page, and a service worker with an explicit cache policy. Business
rules, authentication, PostgreSQL state, route authorization, and APIs remain
unchanged.

## Responsive Foundations

At widths below 768px:

- horizontal gutters become `20px`, with safe-area padding where supported;
- display headings scale to fit 320px without forced clipping;
- multi-column layouts stack in reading order;
- forms, primary actions, cards, and long controls use the available width;
- dense metadata grids become one column;
- mutually exclusive and multi-select controls become one-column touch rows;
- scrollable rails retain visible next-item affordance and scroll snapping;
- dialogs fit the viewport, keep their close control visible, and preserve
  body-scroll locking;
- no control relies on hover for meaning or activation.

Desktop layouts at 768px and above remain materially unchanged. The landing
header may continue using its compact menu at intermediate tablet widths when
the full navigation cannot fit.

## Route-by-Route Mobile Behavior

### `/` — public landing

- Keep the wordmark and convert the full navigation into the existing mobile
  menu treatment with 48px rows and a full-width primary action.
- Stack hero copy above the qualitative partnership graph. Keep the graph
  legible within the viewport and preserve its qualitative, non-numeric axes.
- Keep the five case studies as a purposeful horizontal rail rather than a
  wrapped grid. Cards must not be clipped vertically and must expose the next
  card edge.
- Render case-study details as one readable column. Equations may wrap, but
  their semantic order must remain intact.
- Keep startup stages as a horizontal progression and convert the About
  comparison and Apply form to single-column layouts.
- Make both hero actions and the Apply action full-width or comfortably
  touchable without changing their labels or destinations.

### `/join` and `/login`

- Use a compact product header with a touch-friendly alternate action.
- Reduce decorative vertical space while preserving editorial hierarchy.
- Use the full panel width, a full-width email field, and a full-width primary
  submit action.

### `/auth/verify`

- Preserve the standalone no-store confirmation response and its security
  headers.
- Fit the confirmation and invalid-link states within mobile gutters.
- Make the confirmation button full-width and at least 48px tall.

### `/onboarding/identity`

- Stack identity and subtype choices into one-column touch rows.
- Keep the ordered step context visible above the form.
- Make the continue action full-width.

### `/onboarding/source`

- Use a single-column source form with readable URL guidance and inline errors.
- Keep the source input and continue action full-width.

### `/onboarding/profile`

- Stack the generated profile summary and every editable field.
- Allow long URLs and domains to wrap without horizontal overflow.
- Keep the confirmation control and submit action easy to tap.

### `/onboarding/verification`

- Stack the profile summary, confirmation copy, and submit action.
- Keep the review contract readable without compressing it into side-by-side
  metadata.

### `/dashboard`

- Pending and waitlisted member summaries become a single-column definition
  list. Development-only approval controls stack with their explanation.
- The example card and four coming-soon cards retain their meaning; the latter
  use a two-column grid only where each card remains readable, otherwise one
  column at narrow widths.
- Verified-member signal choices become one-column touch rows. Opportunity
  metadata and evidence blocks stack in reading order.
- Opportunity cards fill the width and keep every existing advancement action
  and durable status.

### `/admin/verifications`

- Queue cards fill the viewport; identity and evidence metadata stack.
- Review notes use the full width.
- Approve and waitlist actions remain present and become stacked full-width
  controls on narrow screens.

## PWA and Offline Contract

### Installability

- Add a web app manifest with the Mewtuals name, standalone display mode,
  `/` start URL, warm-paper background, dark theme color, and purpose-built
  192px and 512px raster icons including maskable support.
- Add manifest, theme-color, Apple web-app, and icon metadata to the root
  layout.
- Register a module service worker from a small client-only component.

### Cache policy

The service worker uses versioned caches and the narrowest useful rules:

- precache the public landing URL, offline fallback URL, manifest, icons, and
  existing public landing imagery;
- cache only same-origin build assets under `/assets/` plus the explicitly
  listed manifest, icons, favicon, and landing graph images; do not use a broad
  destination-based runtime cache for arbitrary future assets;
- use network-first navigation for `/`, falling back to the cached landing page;
- use network-only behavior for `/join`, `/login`, `/auth/verify`, every
  onboarding route, `/dashboard`, `/admin/verifications`, and future non-root
  application routes;
- when a non-root navigation fails because the device is offline, return the
  cached offline page;
- keep API requests network-only and preserve their existing response contract;
  the branded offline heading applies only to browser document navigations, not
  direct API calls;
- never cache API requests, non-GET requests, authenticated page HTML, redirect
  responses, session material, form submissions, or database-backed payloads.

The cache policy lives in a small independently testable module shared with the
service worker. Cache names include a version so an activation can remove stale
Mewtuals caches without touching unrelated origin storage.

### Offline screen

The offline fallback uses the established product shell styling and contains:

- Mewtuals wordmark;
- heading: `Get online to see your partnerships.`;
- one concise explanation that member information is available when the
  connection returns;
- a `Try again` action that reloads the requested page;
- a link back to the cached public landing page.

It does not render cached member information or simulate disabled application
controls.

## Error Handling

- Service-worker registration failure must not prevent the online application
  from loading or functioning.
- A failed precache should preserve any previously valid cache and keep the
  online application usable.
- If the landing page has never been cached, offline navigation falls back to
  the offline screen when available rather than a broken member page.
- Failed online API actions retain their existing accessible error behavior;
  the service worker does not intercept or queue them.
- A service-worker update activates predictably, removes only old
  `mewtuals-*` caches, and takes control after activation.

## Accessibility and Interaction

- Preserve semantic headings, labels, fieldsets, lists, and dialogs.
- Maintain keyboard access for navigation, case studies, forms, and review
  actions.
- Keep visible focus treatment and respect `prefers-reduced-motion`.
- Mobile menu state must expose accurate `aria-expanded` and close after a
  destination is chosen.
- Text remains zoomable and no viewport setting disables user scaling.

## Testing and Visual Verification

Automated coverage must prove:

- manifest metadata and required icon files;
- service-worker registration and cache-policy exclusions;
- the exact offline heading and public-landing fallback;
- existing product and security behavior remains intact;
- no route loses fields or actions.

Browser verification covers every browser route at 390x844 and at a width near
the 768px boundary, plus desktop regression at 1440x1100. Checks include page
overflow, control size, menu/dialog behavior, full onboarding, pending and
verified dashboards, administrator review, protected redirects, console errors,
and an offline navigation exercise proving that `/` loads while `/dashboard`
shows the network-required fallback.

The release gate remains:

```text
npm test
npm run test:db
npm run test:acceptance
npm run test:e2e
npm run lint
npm run build
git diff --check
```

## Documentation

Create `AGENTS.md` with the repository's important working conventions:

- architecture and dependency direction;
- repository ownership of PostgreSQL access;
- authentication and same-origin boundaries;
- valid zero-match behavior;
- 767px mobile breakpoint and touch/overflow expectations;
- public-only PWA cache policy and the prohibition on caching member/API data;
- required local and release verification commands;
- secret, environment, hosting metadata, and generated-artifact handling.

Update the operations handoff with installability, offline behavior, cache
versioning, testing, and browser support limitations.

## Source Control and Delivery

- Implement on `codex/mobile-pwa`, based on the latest local Mewtuals commit.
- Preserve the `product-v1` tag and all existing website version tags.
- Do not commit local environment files, database files, browser artifacts, or
  credentials.
- Commit only reviewed responsive/PWA source, tests, assets, and documentation.
- Push the validated branch to the private `khakhibuzz/mewtuals` repository and
  open a draft pull request when the remote has an existing base branch.
- Keep the verified application running at `http://localhost:4000` for local
  review. Do not publish a new Sites deployment; the requested delivery target
  is local plus the private GitHub repository.

## Acceptance Criteria

1. Every existing route has an intentional, usable layout below 768px.
2. No existing field, action, state, security check, or desktop workflow is
   removed.
3. Controls are touch-friendly, text is readable, and pages do not scroll
   horizontally at 320px or 390px.
4. The application exposes valid install metadata and can be installed on
   supported browsers.
5. The public landing page can reopen offline after one successful online visit.
6. Offline member navigation shows `Get online to see your partnerships.` and
   never exposes cached member or API data.
7. The complete member and administrator journeys still pass online.
8. `AGENTS.md` and the operations handoff describe the architecture,
   responsive conventions, cache boundary, and release checks.
9. The verified branch is pushed to the requested private GitHub repository,
   and localhost remains available for review.

## Explicitly Deferred

- offline dashboard data or offline mutations;
- background synchronization, push notifications, and periodic sync;
- queued form submissions;
- responsive redesign above the scope needed to preserve current desktop
  layouts;
- new product functionality, navigation destinations, or authentication
  providers;
- a new Sites deployment.
