# Mewtuals Authenticated Navigation Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make administrator navigation acknowledge clicks immediately and reduce intentional Global Demand Radar page loads from multi-second waits toward 200–500 ms without weakening private-data or provenance boundaries.

**Architecture:** Authenticated links opt out of framework prefetch, administrator route segments expose an accessible loading state, and each page explicitly composes authentication plus its service over one request-owned database object. The Radar class page calls one repository summary operation whose PostgreSQL adapter shares a bounded signal scan across class and overview projections instead of repeating report scans.

**Tech Stack:** TypeScript, React 19 Server Components, Vinext/Next routing, Drizzle ORM, postgres.js, PostgreSQL/Neon, Vitest, Playwright, Cloudflare Sites.

---

## File structure

- `app/components/product/ProductShell.tsx`: authenticated header link prefetch policy.
- `app/components/global-radar/GlobalRadarTabs.tsx`: Radar tab prefetch policy.
- `app/components/global-radar/GlobalRadarSignalList.tsx`: Radar filter-reset and pagination prefetch policy.
- `app/components/global-radar/GlobalRadarSignalDetail.tsx`: Radar detail return-link prefetch policy.
- `app/admin/loading.tsx`: accessible administrator navigation loading surface.
- `app/admin/global-demand-radar/signal-list-page.tsx`: retry/pagination prefetch policy and unchanged class-page delivery adapter.
- `app/server/session.ts`: session composition over an optional explicit database.
- `app/server/admin-page-context.ts`: one request-owned database/session composition helper.
- `app/server/{verification,discovery,ecosystem-intelligence,opportunity-brief}.ts`: optional explicit database injection for administrator page composition while preserving no-argument route callers.
- `app/admin/{verifications,discovery,ecosystem-intelligence,opportunity-briefs}/page.tsx`: share the page database between session and service.
- `app/admin/global-demand-radar/page-support.ts`: share the page database between session and Radar application.
- `app/server/global-radar/admin-service.ts`: authorize/validate once and call one repository class-summary operation.
- `db/repositories/global-radar-admin-read-model.ts`: summary contracts plus pure bounded aggregation/projector helpers.
- `db/repositories/global-radar-admin-repository.ts`: PostgreSQL class-summary adapter and shared scan.
- `tests/admin-shell.test.tsx`, `tests/global-radar-pages.test.tsx`: navigation/loading contracts.
- `tests/admin-page-context.test.ts`, existing administrator page tests: database identity composition contracts.
- `tests/global-radar-admin-service.test.ts`: one-call service contract and unchanged DTO/conflict behavior.
- `tests/global-radar-db.integration.test.ts`: consolidated summary correctness and bounded query regression coverage.

### Task 1: Authenticated navigation scheduling and feedback

**Files:**
- Modify: `tests/admin-shell.test.tsx`
- Modify: `tests/global-radar-pages.test.tsx`
- Create: `tests/admin-loading.test.tsx`
- Modify: `app/components/product/ProductShell.tsx`
- Modify: `app/components/global-radar/GlobalRadarTabs.tsx`
- Modify: `app/components/global-radar/GlobalRadarSignalList.tsx`
- Modify: `app/components/global-radar/GlobalRadarSignalDetail.tsx`
- Modify: `app/admin/global-demand-radar/signal-list-page.tsx`
- Create: `app/admin/loading.tsx`

- [ ] **Step 1: Write failing link-policy tests**

Assert every link inside the `Administrator` navigation and `Global Demand Radar sections` navigation has the rendered `data-prefetch-disabled="true"` marker supplied by the test mock for `next/link` when `prefetch={false}` is passed. Cover every Radar retry, clear-filter, pagination, signal-review/detail, and detail-return link with the same contract.

- [ ] **Step 2: Write the failing loading-surface test**

Render `app/admin/loading.tsx` and assert a visible `status` region with accessible text such as `Loading administrator view…`; assert it does not render private records or a cached previous snapshot.

- [ ] **Step 3: Run RED tests**

Run: `npx vitest run tests/admin-shell.test.tsx tests/global-radar-pages.test.tsx tests/admin-loading.test.tsx`

Expected: FAIL because authenticated links do not pass `prefetch={false}` and the loading component does not exist.

- [ ] **Step 4: Implement the minimal navigation policy**

Pass `prefetch={false}` to administrator header links and every authenticated Radar `next/link`, including tab, retry, clear-filter, pagination, signal-review/detail, and detail-return links. Create the small route loading component using the existing product styling vocabulary and `role="status"`, `aria-live="polite"`.

- [ ] **Step 5: Run GREEN tests and focused lint**

Run: `npx vitest run tests/admin-shell.test.tsx tests/global-radar-pages.test.tsx tests/admin-loading.test.tsx`

Run: `npx eslint app/components/product/ProductShell.tsx app/components/global-radar/GlobalRadarTabs.tsx app/components/global-radar/GlobalRadarSignalList.tsx app/components/global-radar/GlobalRadarSignalDetail.tsx app/admin/loading.tsx app/admin/global-demand-radar/signal-list-page.tsx tests/admin-shell.test.tsx tests/global-radar-pages.test.tsx tests/admin-loading.test.tsx`

Expected: all pass with no warnings.

- [ ] **Step 6: Commit**

```bash
git add app/components/product/ProductShell.tsx app/components/global-radar/GlobalRadarTabs.tsx app/components/global-radar/GlobalRadarSignalList.tsx app/components/global-radar/GlobalRadarSignalDetail.tsx app/admin/loading.tsx app/admin/global-demand-radar/signal-list-page.tsx tests/admin-shell.test.tsx tests/global-radar-pages.test.tsx tests/admin-loading.test.tsx
git commit -m "perf: stop authenticated navigation prefetch"
```

### Task 2: One request-owned database for administrator pages

**Files:**
- Create: `tests/admin-page-context.test.ts`
- Modify: existing page/service tests for `verifications`, `discovery`, `ecosystem-intelligence`, `opportunity-briefs`, and `global-radar`
- Create: `app/server/admin-page-context.ts`
- Modify: `app/server/session.ts`
- Modify: `app/server/verification.ts`
- Modify: `app/server/discovery.ts`
- Modify: `app/server/ecosystem-intelligence.ts`
- Modify: `app/server/opportunity-brief.ts`
- Modify: `app/server/global-radar/index.ts`
- Modify: `app/admin/verifications/page.tsx`
- Modify: `app/admin/discovery/page.tsx`
- Modify: `app/admin/ecosystem-intelligence/page.tsx`
- Modify: `app/admin/opportunity-briefs/page.tsx`
- Modify: `app/admin/global-demand-radar/page-support.ts`

- [ ] **Step 1: Write the failing composition contract**

Specify this framework-free helper API:

```ts
export async function loadAdminPageContext(
  dependencies: {
    getDatabase?: () => MewtualsDatabase;
    getSession?: (database: MewtualsDatabase) => Promise<AuthenticatedSession | null>;
  } = {},
): Promise<{ database: MewtualsDatabase; session: AuthenticatedSession | null }>;
```

The test provides one database sentinel and asserts `getDatabase` runs once and the exact sentinel is passed to `getSession` and returned.

- [ ] **Step 2: Write failing service/page injection tests**

Assert `getCurrentSession(database)` calls `createAuthRepository(database)`. For each administrator service factory, assert an explicit database reaches its repository factory while no-argument callers remain valid. Page tests must assert the database returned by `loadAdminPageContext` is the exact value passed to the destination service or `getGlobalRadarApplication({ database })`. Add a Radar composition regression test proving `getGlobalRadarApplication({ database })` bypasses any process-cached application and builds against the supplied database.

- [ ] **Step 3: Run RED tests**

Run the narrow Vitest files discovered for those service and page modules plus `tests/admin-page-context.test.ts` and `tests/global-radar-pages.test.tsx`.

Expected: FAIL because the explicit database composition surface is absent.

- [ ] **Step 4: Implement request composition**

Create `loadAdminPageContext` as a humble outer-layer helper. Update `getCurrentSession` to accept an optional database and pass it to `createAuthRepository`. Update the four service factories to accept an optional database and pass it to their repository factory. Change each administrator page to call the helper once and pass its database to the destination service/application. In `getGlobalRadarApplication`, return the process-cached application only when no explicit database or other composition override is supplied. Do not introduce React cache, AsyncLocalStorage, a Cloudflare global singleton, or browser persistence.

- [ ] **Step 5: Preserve non-page callers**

Keep existing no-argument route handlers and worker paths source-compatible. Keep non-Cloudflare process caching behavior intact; an explicitly supplied database must not return a service cached for a different database.

- [ ] **Step 6: Run GREEN tests and typecheck**

Run the same focused Vitest files.

Run: `npm run typecheck`

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add app/server/admin-page-context.ts app/server/session.ts app/server/verification.ts app/server/discovery.ts app/server/ecosystem-intelligence.ts app/server/opportunity-brief.ts app/server/global-radar/index.ts app/admin tests
git commit -m "perf: reuse one database per admin render"
```

### Task 3: Consolidated Global Radar class-summary read model

**Files:**
- Modify: `tests/global-radar-admin-service.test.ts`
- Modify: `tests/global-radar-db.integration.test.ts`
- Modify: `app/server/global-radar/admin-service.ts`
- Modify: `db/repositories/global-radar-admin-read-model.ts`
- Modify: `db/repositories/global-radar-admin-repository.ts`

- [ ] **Step 1: Write the failing service-port test**

Replace the class-page service expectation with one repository call:

```ts
expect(repository.getClassSummary).toHaveBeenCalledWith({
  signalClass: "direct_demand",
  filters: normalizedFilters,
  now: NOW,
});
```

Assert `listSignals`, `getClassMetrics`, and `getOverviewMetrics` are not used by the class-page hot path. Preserve tests for authorization, invalid input, filtered empty-vs-unfiltered empty, serialized DTOs, and a generic `score_provenance_invalid` conflict with no partial data.

- [ ] **Step 2: Write failing repository integration equivalence tests**

Using the existing persisted fixtures, call the new repository `getClassSummary` for:

- an unfiltered class;
- an active-filter query with an empty result but a nonempty baseline class;
- pagination;
- each signal class;
- corrupted stored score provenance.

Assert the result equals the current list/class/overview contract, including `hasAnySignals`, requirement mixes, latest run, promoted entities, and failure without partial data.

- [ ] **Step 3: Add a bounded-query regression test**

Reuse the existing Drizzle recording logger. For a one-batch fixture, assert the summary path scans `global_radar_signals` for aggregation no more than once, loads requirements no more than once per batch, and does not emit separate class-metric and overview signal scans. Avoid a brittle exact total if provenance legitimately issues versioned evidence queries; classify recorded SQL by table and purpose.

- [ ] **Step 4: Run RED tests**

Run: `npx vitest run tests/global-radar-admin-service.test.ts`

Run the named integration tests through the repository's database preparation flow.

Expected: FAIL because the repository port has no summary operation and the hot path still fans out.

- [ ] **Step 5: Add summary contracts and a pure projector**

In `global-radar-admin-read-model.ts`, define a strict summary input/result that contains page data, filtered metrics, unfiltered class total, and overview metrics. Extract pure accumulator functions for class and overview metrics so the same stored row and requirement map update both projections once. Preserve existing UTC/Kolkata date normalization at the service boundary and existing safe DTO types.

- [ ] **Step 6: Implement the shared bounded adapter scan**

Add `getClassSummary` to `createGlobalRadarAdminRepository`. Read bounded signal chunks in keyset order, validate provenance once per chunk, load requirements once per chunk, and update both relevant projections. Derive exact filtered count/page either from the same projector with predicates proven equivalent to `filterConditions`, or retain one focused SQL list query when exact SQL semantics are safer. Fetch latest-run and promoted-entity metadata independently while the scan is in flight. Return only the typed summary or a generic conflict.

- [ ] **Step 7: Switch the service to one repository call**

Update `GlobalRadarAdminRepositoryPort` and `getClassSummary` in the admin service. The service remains responsible for actor authorization, input validation/normalization, and safe serialization; the PostgreSQL adapter owns read-model construction.

- [ ] **Step 8: Run GREEN service and integration tests**

Run: `npx vitest run tests/global-radar-admin-service.test.ts`

Run: `npm run test:db`

Expected: all pass, including query classification and provenance failure tests.

- [ ] **Step 9: Refactor only after green**

Remove dead duplicated projector logic only when no other repository callers need it. Keep the adapter file reviewable by moving pure summary helpers to `global-radar-admin-read-model.ts`; do not redesign mutations or the Radar bounded context.

- [ ] **Step 10: Commit**

```bash
git add app/server/global-radar/admin-service.ts db/repositories/global-radar-admin-read-model.ts db/repositories/global-radar-admin-repository.ts tests/global-radar-admin-service.test.ts tests/global-radar-db.integration.test.ts
git commit -m "perf: consolidate Radar class summary reads"
```

### Task 4: Full local release and interaction verification

**Files:**
- Modify only files required to fix verified regressions.

- [ ] **Step 1: Run focused performance contracts**

Run the navigation, page-composition, service, and repository tests from Tasks 1–3 and record the passing counts.

- [ ] **Step 2: Run the complete repository gate**

```bash
npm test
npm run test:db
npm run test:acceptance
npm run test:e2e
npm run lint
npm run build
git diff --check
```

Expected: every command exits zero.

- [ ] **Step 3: Review the built UI behavior**

Run the existing application flow and verify one Radar tab click changes/loading-announces immediately, does not issue sibling Radar navigation requests, preserves filters/pagination, and renders no private data in the loading state. Use the existing browser/e2e tooling; do not create persistent browser caches.

- [ ] **Step 4: Request full implementation review**

Run spec-compliance review first, then code-quality review. Fix and re-review every material issue.

- [ ] **Step 5: Commit verified corrections, if any**

Use a scoped commit message that describes the verified correction.

### Task 5: Exact Sites deployment and production measurement

**Files:**
- Generated ignored deployment artifacts only; no source edits unless measurement reveals a verified regression.

- [ ] **Step 1: Read and follow `sites:sites-hosting`**

Reuse Sites project `appgprj_6a56979ca26c8191b26abf2a5cd9dc51` and the repository's exact-commit publisher contract.

- [ ] **Step 2: Prepare and publish the exact commit**

Run: `npm run prepare:sites -- HEAD`

Validate the generated request and digest, prove the credential-returned Sites source branch points at the target SHA, publish, and verify active routing, SSL, and HTTP 200 for `mewtuals.com` and `www.mewtuals.com`.

- [ ] **Step 3: Measure intentional production navigation**

Generate one deliberate Radar tab navigation after deployment. Inspect worker logs for the destination RSC wall time and CPU time and verify the request no longer fans out to sibling tabs.

Acceptance target: median intentional warm RSC wall time in the 200–500 ms range for the current empty/small Radar dataset. Record the exact observation window and request count.

- [ ] **Step 4: Apply the infrastructure branch only if evidence requires it**

If the consolidated request still exceeds 500 ms while CPU and query count are low, verify the production `DATABASE_URL` uses the managed pooled Neon endpoint without exposing it. Change only to a recoverable pooled endpoint, redeploy the exact commit/configuration, and compare before/after logs. Evaluate a Cloudflare-native database accelerator only if pooled transport remains insufficient.

- [ ] **Step 5: Final completion audit**

Confirm: no authenticated prefetch fan-out, one page-owned database context, one repository summary call, all release gates pass, production hosts are healthy, and production latency evidence is reported honestly. Do not mark the goal complete if any required gate or production measurement remains outstanding.
