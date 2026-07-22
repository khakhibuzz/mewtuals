# Mewtuals Mobile and PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every existing Mewtuals browser route intentionally responsive below 768px and add an installable PWA that caches only the public landing experience.

**Architecture:** Extend the existing landing and product CSS in place, changing components only for PWA registration or interactions that CSS cannot express. Keep authentication, APIs, PostgreSQL state, and business rules untouched. Serve a generated module service worker from `/sw.js`; it caches the root landing shell and an explicit public-asset allowlist, while every non-root document navigation falls back to a static network-required page and every API request stays network-only.

**Tech Stack:** Vinext/React 19, TypeScript, CSS Modules, MetadataRoute manifest, service workers and Cache API, Vitest, Playwright, PostgreSQL 16.

---

## File Structure

- `app/manifest.ts` — install metadata and icon declarations.
- `app/pwa/PwaRegistration.tsx` — non-blocking client registration only.
- `app/pwa/service-worker-source.ts` — one source generator for the service-worker cache contract.
- `app/sw.js/route.ts` — thin JavaScript response adapter for the generated service worker.
- `app/offline/page.tsx` — static branded fallback with no member data or client state.
- `public/icons/` — deterministic 192px, 512px, and Apple touch icons.
- `scripts/generate-pwa-icons.mjs` — reproducible raster-icon generator using the existing Playwright dependency.
- `app/globals.css` — landing, offline page, and shared mobile rules.
- `app/components/product/product.module.css` — member and admin mobile rules.
- `tests/pwa.test.tsx` — manifest, registration, service-worker, and offline-page contracts.
- `tests/responsive-contract.test.ts` — breakpoint and route-style regression contracts.
- `tests/e2e/mobile-pwa.spec.ts` — rendered mobile route journey and real offline behavior.
- `AGENTS.md` — durable architecture and engineering conventions only.
- `docs/product-v1-operations.md` — operator-facing PWA/offline notes.

## Task 1: Installable public-only PWA boundary

**Files:**
- Create: `tests/pwa.test.tsx`
- Create: `app/manifest.ts`
- Create: `app/pwa/PwaRegistration.tsx`
- Create: `app/pwa/service-worker-source.ts`
- Create: `app/sw.js/route.ts`
- Create: `app/offline/page.tsx`
- Create: `scripts/generate-pwa-icons.mjs`
- Create: `public/icons/mewtuals-192.png`
- Create: `public/icons/mewtuals-512.png`
- Create: `public/icons/apple-touch-icon.png`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Write the failing manifest and offline-page tests**

  Require `name: "Mewtuals"`, `short_name: "Mewtuals"`, `start_url: "/"`,
  standalone display, 192px/512px maskable icons, the exact offline heading,
  `Try again`, and a link to `/`.

  ```tsx
  expect(manifest().display).toBe("standalone");
  expect(manifest().icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192" }),
      expect.objectContaining({ sizes: "512x512", purpose: "any maskable" }),
    ]),
  );
  expect(render(<OfflinePage />).getByRole("heading")).toHaveTextContent(
    "Get online to see your partnerships.",
  );
  ```

- [ ] **Step 2: Write the failing registration and service-worker contract tests**

  Mock `navigator.serviceWorker.register` and require `/sw.js`, root scope, and
  module mode. Require the generated source to handle only GET document/static
  requests, bypass `/api/`, cache `/` only as navigation HTML, fall back to
  `/offline` for non-root documents, allow only `/assets/` and exact public
  assets including all four `hero-opportunity-graph` PNG/WebP files, and delete
  only stale `mewtuals-*` caches. Export one `PUBLIC_ASSET_PATHS` constant from
  the generator and assert its complete contents in the contract test.

- [ ] **Step 3: Run the focused test RED**

  Run: `npx vitest run tests/pwa.test.tsx`

  Expected: FAIL because the manifest, PWA components, service-worker route,
  and offline page do not exist.

- [ ] **Step 4: Implement the manifest, offline page, and registration**

  `PwaRegistration` contains only a guarded effect:

  ```tsx
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", type: "module" })
      .catch(() => undefined);
  }, []);
  ```

  Registration errors are caught without rendering an error or blocking the
  online application. Mount the component once in `app/layout.tsx` and add the
  manifest, theme-color, Apple web-app, and icon metadata there.

- [ ] **Step 5: Implement a generated service worker with explicit policy**

  `service-worker-source.ts` owns the cache version, exact public assets, and
  generated script. `/sw.js` returns it with `text/javascript`, `no-cache`, and
  `Service-Worker-Allowed: /`.

  The generated fetch behavior is:

  ```text
  non-GET or /api/*              -> browser network, no respondWith
  document navigation to /      -> network first, update cached /, fallback /
  other document navigation     -> network only, fallback /offline on failure
  /assets/* or exact public file -> cache first, then network and cache success
  everything else               -> browser network, no cache
  ```

  Cache writes accept only same-origin, successful, non-redirect responses.

  Install fetches `/` and `/offline`, extracts only their same-origin
  `/assets/` references, and caches those responses together with the two HTML
  documents and every `PUBLIC_ASSET_PATHS` entry: manifest, favicon, 192/512
  icons, Apple touch icon, and all four PNG/WebP landing graph files. This makes
  the shell available after one completed online visit without guessing hashed
  build filenames. Installation fails if the core shell is incomplete, so the
  previous worker/cache remains active. Root navigation falls back to cached
  `/` and then `/offline` if the landing response is unavailable. Activation
  deletes old caches only after the new worker installed.

- [ ] **Step 6: Generate deterministic raster icons**

  Use `@playwright/test` already present in the repository to render a square
  warm-paper icon with the restrained black `M` wordmark treatment at 192,
  512, and 180 pixels. Launch installed Google Chrome by default and respect
  `PLAYWRIGHT_CHANNEL=chromium` when a Playwright Chromium binary is already
  available. Fail with a direct prerequisite message rather than installing a
  new graphics dependency.

  Run: `node scripts/generate-pwa-icons.mjs`

  Expected: three valid PNG files at their declared sizes.

- [ ] **Step 7: Run the PWA tests GREEN**

  Run: `npx vitest run tests/pwa.test.tsx`

  Expected: PASS.

- [ ] **Step 8: Commit the PWA boundary**

  ```bash
  git add app/manifest.ts app/layout.tsx app/offline app/pwa app/sw.js \
    app/globals.css public/icons scripts/generate-pwa-icons.mjs tests/pwa.test.tsx
  git commit -m "feat: add public-only PWA support"
  ```

## Task 2: Intentional mobile landing experience

**Files:**
- Create: `tests/responsive-contract.test.ts`
- Modify: `app/globals.css`
- Modify: `app/components/SiteHeader.tsx` only if interaction checks expose a gap
- Test: `tests/navigation.test.tsx`
- Test: `tests/caseStudies.ui.test.tsx`

- [ ] **Step 1: Write the failing responsive contract**

  Read the compiled source stylesheet and require a `max-width: 767px` block
  containing explicit rules for header navigation, hero/actions/graph, case
  rail/cards/dialog, startup rail, About comparison, Apply form, offline page,
  and 44px minimum interactive sizing.

  ```ts
  expect(css).toContain("@media (max-width: 767px)");
  for (const selector of requiredMobileSelectors) {
    expect(mobileCss).toContain(selector);
  }
  ```

- [ ] **Step 2: Run the contract RED**

  Run: `npx vitest run tests/responsive-contract.test.ts tests/navigation.test.tsx tests/caseStudies.ui.test.tsx`

  Expected: FAIL because the intentional 767px route contract does not exist.

- [ ] **Step 3: Add one focused 767px landing block**

  Preserve desktop declarations. At mobile widths:

  - use 20px plus safe-area gutters;
  - keep the header fixed layout stable and give menu rows 48px targets;
  - stack hero content, make actions full-width, and fit the graph;
  - keep case studies and startup stages as scroll-snapped rails with a visible
    next-card edge;
  - make case-study cards height-content-driven and the dialog one column;
  - stack About and Apply, make fields/actions full-width, and allow long text
    to wrap;
  - retain reduced-motion behavior and visible focus.

- [ ] **Step 4: Adjust header behavior only if tests require it**

  Keep the existing `aria-expanded` state. If the current mobile menu does not
  close after a destination is selected, add one small `closeNavigation`
  handler and test that interaction; do not introduce a navigation framework.

- [ ] **Step 5: Run focused tests GREEN**

  Run the same focused command and expect PASS.

- [ ] **Step 6: Commit the landing responsive pass**

  ```bash
  git add app/globals.css app/components/SiteHeader.tsx tests/responsive-contract.test.ts tests/navigation.test.tsx tests/caseStudies.ui.test.tsx
  git commit -m "feat: make landing mobile-first"
  ```

## Task 3: Intentional mobile member and admin routes

**Files:**
- Modify: `tests/responsive-contract.test.ts`
- Modify: `tests/auth-verify-route.test.ts`
- Modify: `app/components/product/product.module.css`
- Modify: `app/auth/verify/route.ts`

- [ ] **Step 1: Extend the responsive test RED for product routes**

  Require a `max-width: 767px` CSS Module block covering product header/panel,
  buttons, choice grids, definition lists, pending placeholders, development
  actions, signal controls, opportunity metadata/cards, queue evidence, review
  actions, textareas, and long-value wrapping.

  Extend the auth verification test to require mobile gutters and a full-width,
  minimum-48px confirmation button in the standalone HTML response.

- [ ] **Step 2: Run the focused tests RED**

  Run: `npx vitest run tests/responsive-contract.test.ts tests/auth-verify-route.test.ts tests/product-pages.test.tsx tests/product-ui.test.tsx tests/pending-dashboard.test.tsx tests/verified-dashboard.test.tsx tests/verification-queue.test.tsx`

  Expected: FAIL on the new mobile contracts only.

- [ ] **Step 3: Implement the product CSS Module mobile block**

  Preserve desktop declarations. At mobile widths:

  - reduce the product header and main vertical space;
  - give the alternate header action and logout control 44px targets;
  - make primary/secondary buttons full-width;
  - collapse choices, summaries, evidence, signals, opportunity details, and
    review actions to one column;
  - use two pending placeholders only when readable and one at narrow widths;
  - make cards and textareas full-width and apply `overflow-wrap: anywhere` to
    user/domain/source values;
  - keep every existing action and status visible.

- [ ] **Step 4: Improve standalone verification mobile CSS**

  Keep the no-store/security response and content unchanged. Add a 767px media
  rule that reduces gutters and makes the confirmation button width 100% with
  at least 48px height.

- [ ] **Step 5: Run focused tests GREEN**

  Run the same focused command and expect PASS.

- [ ] **Step 6: Commit the product responsive pass**

  ```bash
  git add app/components/product/product.module.css app/auth/verify/route.ts tests/responsive-contract.test.ts tests/auth-verify-route.test.ts
  git commit -m "feat: make member routes mobile-first"
  ```

## Task 4: Mobile journey and real offline browser coverage

**Files:**
- Create: `tests/e2e/mobile-pwa.spec.ts`
- Modify: `package.json`
- Modify: `playwright.config.ts` only if an existing setting blocks service workers

- [ ] **Step 1: Write the browser acceptance test before visual fixes**

  Use a 390x844 context and reusable assertions:

  ```ts
  async function expectNoHorizontalOverflow(page: Page) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }

  async function expectTouchControls(page: Page) {
    for (const control of await page.locator("button, input, select, textarea").all()) {
      if (await control.isVisible()) expect((await control.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }
  ```

  Exercise and audit `/`, `/join`, `/login`, `/auth/verify`, all four onboarding
  pages, pending `/dashboard`, verified `/dashboard`, and
  `/admin/verifications`. Preserve the existing complete member behavior.

  While the fresh member remains pending, open a second browser context for the
  dedicated disposable address `mewtuals-mobile-e2e@example.test`, authenticate
  with the local magic link, inspect the pending member in
  `/admin/verifications`, and approve it through the real review form. Before
  starting the server, add that address to the ignored local `ADMIN_EMAILS`.
  The test must refuse to run when the dedicated address is not allowlisted and
  may delete that reserved account before and after the run; it must never use
  or mutate an operator's real admin account.

- [ ] **Step 2: Add the real offline acceptance**

  Visit `/`, wait for an active service worker, reload once for control, switch
  the context offline, and prove:

  - `/` still shows the Mewtuals hero;
  - `/dashboard` shows `Get online to see your partnerships.`;
  - the offline page links back to `/` and exposes `Try again`;
  - no cached profile, opportunity, or admin content appears.

- [ ] **Step 3: Run the browser test and capture RED evidence**

  With the worktree app and local PostgreSQL running:

  Run: `npx playwright test tests/e2e/mobile-pwa.spec.ts`

  Expected before final fixes: any remaining overflow, undersized target, route,
  or service-worker issue fails with the named route.

- [ ] **Step 4: Fix only browser-proven responsive/PWA gaps**

  Keep fixes in the owning stylesheet/component. Do not restructure product
  behavior or add abstractions that are not required by a failing check.

- [ ] **Step 5: Verify minimum, near-boundary, and desktop layouts manually**

  Run an explicit 320x740 overflow/touch pass, inspect every public/product
  state at 767x900, and inspect the representative desktop layout at 1440x1100.
  Confirm menu/dialog keyboard behavior, no console errors, and no desktop
  regression.

- [ ] **Step 6: Run browser tests GREEN and commit**

  Update `test:e2e` to run both maintained browser specs so the standard release
  gate cannot omit mobile/offline coverage:

  ```json
  "test:e2e": "playwright test tests/e2e/product-v1.spec.ts tests/e2e/mobile-pwa.spec.ts"
  ```

  ```bash
  npx playwright test tests/e2e/mobile-pwa.spec.ts tests/e2e/product-v1.spec.ts
  git add package.json tests/e2e/mobile-pwa.spec.ts playwright.config.ts app/globals.css app/components/product/product.module.css
  git commit -m "test: cover mobile and offline journeys"
  ```

## Task 5: Durable engineering and operations notes

**Files:**
- Create: `AGENTS.md`
- Modify: `README.md`
- Modify: `docs/product-v1-operations.md`

- [ ] **Step 1: Write only durable repository conventions**

  `AGENTS.md` records:

  - dependency direction from routes/adapters toward `app/server` and pure
    `app/domain` rules;
  - `db/repositories` as the only SQL owners;
  - server-owned authentication, authorization, and same-origin enforcement;
  - zero picks as a valid result;
  - 767px mobile breakpoint, 44px targets, and no-overflow expectations;
  - public-only PWA caching and explicit prohibition on caching API/member HTML;
  - required unit, database, acceptance, browser, lint, build, and diff checks;
  - secret/local database/browser artifact exclusions.

  Do not duplicate the full product specification or transient implementation
  choices.

- [ ] **Step 2: Update user and operator handoffs**

  README adds installability and offline behavior to local usage. Operations
  documents cache version/update behavior, public-only offline scope, how to
  clear site data, supported-browser variability, and the mobile/offline
  release checks.

- [ ] **Step 3: Run documentation and diff validation**

  Run: `git diff --check`

  Expected: no whitespace errors, secrets, local URLs beyond documented
  localhost usage, or duplicated outdated instructions.

- [ ] **Step 4: Commit durable documentation**

  ```bash
  git add AGENTS.md README.md docs/product-v1-operations.md
  git commit -m "docs: record mobile and PWA conventions"
  ```

## Task 6: Social metadata, complete verification, and private GitHub delivery

**Files:**
- Modify: `app/layout.tsx` only if a generated social card passes inspection
- Create: `public/og.png` only if the generated card passes inspection
- Modify: source/tests only for failures proven by the release gate

- [ ] **Step 1: Generate exactly one site-specific social preview candidate**

  After the visual direction is stable, use the image-generation workflow once
  with the exact headline `One partnership can change a company. We find the
  right one.`, warm-paper/charcoal palette, sparse graph-line motif, and no cat
  imagery. Accept it only when the headline is letter-for-letter correct,
  `Mewtuals` is spelled correctly, no extra claims/logos/characters appear, the
  1.91:1 crop is legible at thumbnail size, and the established restrained
  identity is preserved. If it is unusable, omit `og:image` rather than
  generating speculative variants.

- [ ] **Step 2: Wire accepted metadata test-first**

  If the card passes, add a failing metadata assertion, copy it to
  `public/og.png`, and add Open Graph/X metadata. If it fails, record no
  metadata code or unused asset.

- [ ] **Step 3: Run the complete release gate fresh**

  ```bash
  npm test
  npm run test:db
  npm run test:acceptance
  npm run test:e2e
  npm run lint
  npm run build
  git diff --check
  ```

  Expected: every command exits 0. Read full output and fix only evidenced
  failures.

- [ ] **Step 4: Review final scope and security boundary**

  Confirm no `.env*`, `.local-postgres`, `.playwright-cli`, screenshots,
  credentials, or unrelated user files are staged. Inspect the service worker
  one final time to prove member HTML and `/api/*` are never cached.

- [ ] **Step 5: Commit final verified fixes**

  Use a terse commit describing only the final verified delta. Preserve all
  existing tags; optionally add a new `product-v2` tag only if explicitly
  requested later.

- [ ] **Step 6: Publish to the requested private repository**

  Verify GitHub authentication and repository privacy, add
  `https://github.com/khakhibuzz/mewtuals.git` as `origin` if absent, push
  `codex/mobile-pwa` with tracking, and open a draft PR when the remote has an
  existing default/base branch. If the repository is empty, establish `main`
  from the verified branch only after confirming the remote has no competing
  history.

- [ ] **Step 7: Keep localhost available**

  Run the verified branch at `http://localhost:4000` with the project-owned
  PostgreSQL database. Do not publish a Sites deployment; local plus private
  GitHub is the requested delivery.
