# Mewtuals Ecosystem Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and ship a separate administrator-only Ecosystem Intelligence workspace that explains the current India Physical AI discovery sample through evidence-linked maps, value-chain and robot-stack views, deterministic research-gap insights, change signals, relationships, and a candidate ledger.

**Architecture:** Preserve Discovery as the source of truth and operational workflow. Add four normalized evidence tables, a versioned pure-domain taxonomy/filter/rule layer, a dedicated set-based PostgreSQL read repository, a thin admin service and two read APIs, and focused React components that all consume one URL-persisted filter state. Missing facts remain Unknown; all visual aggregates share the same filtered candidate population.

**Tech Stack:** TypeScript 5.9, React 19, Next/Vinext, Zod 4, Drizzle ORM, PostgreSQL/Neon, `d3-geo` for static projection only, Vitest, Testing Library, Playwright, Sites.

---

## Scope and delivery boundary

This is one vertical feature, not a generic analytics platform. It includes the additive evidence model, private importer, domain rules, repository, admin routes, narrative workspace, shared drawer behavior, accessibility, migration, verification, initial evidence import, and production deployment. It does not change the Discovery schedule or worker payload, does not implement Global Demand Radar, and does not add automatic opportunities, matching, outreach, CSV export, geocoding, an LLM insight layer, a graph database, or a taxonomy editor.

## File map

### Pure domain

- Create `app/domain/ecosystem-intelligence-taxonomy.ts`: versioned keys, labels, ordering, category inference, India aliases, signal freshness, readiness and insight thresholds.
- Create `app/domain/ecosystem-intelligence.ts`: Zod filter/import schemas, canonical URL serialization, evidence scoring, signal activity, graph readiness, metric/insight rules, and evidence-key hashing inputs.
- Create `tests/ecosystem-intelligence-domain.test.ts`: executable domain contract.

### Persistence and import

- Modify `db/schema.ts`: four additive tables and their constraints/indexes.
- Modify `db/types.ts`: inferred persistence types.
- Create `drizzle/0008_ecosystem_intelligence_v1.sql`, `drizzle/meta/0008_snapshot.json`, and update `drizzle/meta/_journal.json` through Drizzle generation.
- Modify `tests/schema.test.ts` and `scripts/test-migrations.mjs`: schema, fresh migration, upgrade migration, and row-preservation checks.
- Create `db/repositories/ecosystem-intelligence-import-repository.ts`: transactional identity resolution and idempotent upserts.
- Create `scripts/ecosystem-intelligence-import.ts`: mode-0600 validate/import CLI with safe output.
- Create `tests/ecosystem-intelligence-import.test.ts` and `tests/ecosystem-intelligence-import.integration.test.ts`.
- Create `docs/ecosystem-intelligence-operations.md`: evidence contract, validate/import/retry/recovery instructions.

### Analytical read boundary

- Create `db/repositories/ecosystem-intelligence-repository.ts`: one filtered candidate CTE and bounded set-based snapshot/detail queries.
- Create `tests/ecosystem-intelligence-repository.integration.test.ts`.
- Create `app/server/ecosystem-intelligence-service.ts`: administrator authorization and plain DTO orchestration.
- Create `app/server/ecosystem-intelligence.ts`: environment/repository composition with request-scoped Cloudflare lifecycle.
- Create `app/server/ecosystem-intelligence-route.ts`: filter parsing, serialization, safe GET handlers.
- Create `tests/ecosystem-intelligence-service.test.ts` and `tests/ecosystem-intelligence-routes.test.ts`.
- Create `app/api/admin/ecosystem-intelligence/route.ts` and `app/api/admin/ecosystem-intelligence/candidates/[candidateId]/route.ts`.

### Admin delivery and reusable Discovery pieces

- Create `app/components/product/admin-navigation.ts`: one `ADMIN_HEADER_LINKS` constant.
- Modify all three existing `app/admin/*/page.tsx` pages to reuse it.
- Create `app/components/product/CandidateReviewActions.tsx` and `app/components/product/CandidateResearchHistory.tsx`.
- Modify `app/components/product/DiscoveryDashboard.tsx` and `app/components/product/DiscoveryResearchContext.tsx` to consume the shared children without changing behavior.
- Create `tests/admin-navigation.test.tsx` and extend existing Discovery component tests.

### Ecosystem Intelligence UI

- Create `app/admin/ecosystem-intelligence/page.tsx`.
- Create `app/components/product/ecosystem-intelligence/types.ts`: serialized DTO contracts shared only by UI components.
- Create `app/components/product/ecosystem-intelligence/filter-state.ts`: browser URL helpers matching the domain serializer.
- Create `app/components/product/ecosystem-intelligence/EcosystemIntelligenceWorkspace.tsx`.
- Create `app/components/product/ecosystem-intelligence/EcosystemFilterBar.tsx`.
- Create `app/components/product/ecosystem-intelligence/CoverageSummary.tsx`.
- Create `app/components/product/ecosystem-intelligence/IndiaEcosystemMap.tsx`.
- Create `app/components/product/ecosystem-intelligence/EcosystemExplorer.tsx`.
- Create `app/components/product/ecosystem-intelligence/CapabilityHeatmaps.tsx`.
- Create `app/components/product/ecosystem-intelligence/ResearchGapInsights.tsx`.
- Create `app/components/product/ecosystem-intelligence/ChangeSignals.tsx`.
- Create `app/components/product/ecosystem-intelligence/RelationshipReadiness.tsx`.
- Create `app/components/product/ecosystem-intelligence/EcosystemCandidateLedger.tsx`.
- Create `app/components/product/ecosystem-intelligence/EcosystemCandidateDrawer.tsx`.
- Create `app/components/product/ecosystem-intelligence/ecosystem-intelligence.module.css`.
- Create `app/data/india-states-simplified.geojson` and `app/data/india-states-simplified.README.md`.
- Add `d3-geo` and `@types/d3-geo` to `package.json` and `package-lock.json`.
- Create `tests/ecosystem-intelligence-page.test.tsx`, `tests/ecosystem-intelligence-workspace.test.tsx`, and `tests/e2e/ecosystem-intelligence.spec.ts`.

## Task 1: Lock the taxonomy, filter, evidence, and readiness rules

**Files:**
- Create: `app/domain/ecosystem-intelligence-taxonomy.ts`
- Create: `app/domain/ecosystem-intelligence.ts`
- Test: `tests/ecosystem-intelligence-domain.test.ts`

- [ ] **Step 1: Write failing taxonomy-integrity and inference tests**

Assert taxonomy version `ecosystem-intelligence-v1`; campaign key `robotics_hardware_india`; analysis version `physical-ai-v1`; unique keys within every kind; requested business stages, robot-stack layers, Physical AI categories, signal types, and relationship types; a finite positive freshness window for each signal; ordered labels; alias normalization; and only registered keys returned by category inference.

```ts
expect(ECOSYSTEM_TAXONOMY.version).toBe("ecosystem-intelligence-v1");
expect(new Set(keys).size).toBe(keys.length);
expect(signalTypes.every((signal) => signal.freshnessDays > 0)).toBe(true);
expect(inferCategoryClassifications("Robotics OEMs and Integrators"))
  .toContainEqual(expect.objectContaining({ evidenceState: "inferred" }));
```

- [ ] **Step 2: Run the domain test and confirm the missing modules fail**

Run: `npx vitest run tests/ecosystem-intelligence-domain.test.ts`

Expected: FAIL because the two domain modules do not exist.

- [ ] **Step 3: Implement the versioned registry**

Use readonly arrays with stable lowercase snake-case keys. Include display label, short/mobile label, order, and explanatory text. Business stages carry upstream inputs/downstream outputs; technical layers carry underlying materials/processes and robot-behavior contribution. Keep all category inference in one `Record<string, readonly ClassificationSeed[]>`; do not parse research prose.

- [ ] **Step 4: Write failing filter and canonical-URL tests**

Cover defaults (`participantType=company`, permanently bounded Physical AI corpus, non-rejected review states, page 1, page size 25), `unknown`, invalid keys, multi-value filters, date ordering, evidence freshness (`current`, `stale`, `unknown`), page cap 100, deterministic sort/direction, and stable serialization independent of input order. Assert `minimumDiscoveryConfidence` maps only to `discovery_score` semantics.

- [ ] **Step 5: Implement the strict Zod filter model and serializer**

Export `parseEcosystemFilters`, `serializeEcosystemFilters`, `filtersFromSearchParams`, `DEFAULT_ECOSYSTEM_FILTERS`, and typed filter keys. Canonical output omits defaults, sorts repeated values by taxonomy order, and resets `page` when any analytical filter changes.

- [ ] **Step 6: Write failing evidence, signal, graph, and insight tests**

Cover the five 20-point dimensions, inferred classification earning 10, Strong Evidence requiring score >=80 plus an evidence-backed classification, explicit/default signal expiry, graph threshold 8 edges/5 candidates, safe insight thresholds, numerator/denominator preservation, and absence of `shortage`, `does not exist`, and `opportunity` in generated copy.

- [ ] **Step 7: Implement minimal pure functions**

Export `calculateEvidenceCoverage`, `isStrongEvidence`, `activeUntilForSignal`, `isActiveSignal`, `relationshipReadiness`, and `buildResearchGapInsights`. All accept explicit inputs and a query clock; none read environment, database, framework, or network state.

- [ ] **Step 8: Run the focused tests and commit**

Run: `npx vitest run tests/ecosystem-intelligence-domain.test.ts`

Expected: PASS.

Commit: `feat: define ecosystem intelligence domain`

## Task 2: Add the normalized evidence tables and migration

**Files:**
- Modify: `db/schema.ts`
- Modify: `db/types.ts`
- Modify: `tests/schema.test.ts`
- Modify: `scripts/test-migrations.mjs`
- Create: `drizzle/0008_ecosystem_intelligence_v1.sql`
- Create: `drizzle/meta/0008_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Write failing schema tests**

Assert the exact four table names, required columns, cascade candidate foreign keys, one headquarters row per candidate, classification uniqueness, 0–100 confidence checks, bounded/array source checks, signal/relationship evidence-key unique indexes, relationship target/self-link checks, and query indexes described in the spec. Add inferred-type assertions in `db/types.ts`.

- [ ] **Step 2: Run schema tests and verify failure**

Run: `npx vitest run tests/schema.test.ts`

Expected: FAIL because the four exports do not exist.

- [ ] **Step 3: Add the Drizzle schema**

Use text keys rather than PostgreSQL enums so the versioned TypeScript registry remains the vocabulary owner. Use JSONB `string[]` for bounded public source URLs. Store latitude/longitude as integer microdegrees to avoid floating-point comparison and add range checks. Use `evidence_key text not null` plus named unique indexes for replay identity.

- [ ] **Step 4: Generate and inspect migration 0008**

Run: `npm run db:generate -- --name ecosystem_intelligence_v1`

Expected: one additive migration and snapshot. Rename only if Drizzle does not use the required `0008_ecosystem_intelligence_v1` tag, then update the journal consistently. Inspect SQL for no destructive statement or private-data copy.

- [ ] **Step 5: Extend upgrade fixtures and row-preservation checks**

In `scripts/test-migrations.mjs`, create a pre-0008 Discovery candidate/research/source fixture, run 0008, assert all pre-existing row identities/counts remain, insert valid rows in all four new tables, and prove duplicate/invalid/self-link constraints fail.

- [ ] **Step 6: Run schema and migration gates**

Run: `npx vitest run tests/schema.test.ts && npm run test:migrations`

Expected: PASS for both fresh and upgrade paths.

- [ ] **Step 7: Commit**

Commit: `feat: add ecosystem evidence schema`

## Task 3: Build the private evidence import contract

**Files:**
- Create: `db/repositories/ecosystem-intelligence-import-repository.ts`
- Create: `scripts/ecosystem-intelligence-import.ts`
- Create: `tests/ecosystem-intelligence-import.test.ts`
- Create: `tests/ecosystem-intelligence-import.integration.test.ts`
- Create: `docs/ecosystem-intelligence-operations.md`
- Modify: `package.json`

- [ ] **Step 1: Write failing import-schema and safe-output tests**

Model this strict top-level contract:

```ts
{
  schemaVersion: "ecosystem-intelligence-import-v1",
  generatedAt: string,
  candidates: [{
    candidateId?: string,
    canonicalUrl?: string,
    classifications?: ClassificationInput[],
    headquarters?: HeadquartersInput,
    signals?: SignalInput[],
    relationships?: RelationshipInput[]
  }]
}
```

Require exactly one stable identity route, public HTTP(S) source URLs, registered keys, bounded strings/arrays/file bytes, integer confidence, and valid dates. Assert CLI errors expose JSON paths and safe counts, never payload values, database URLs, or source-page contents.

- [ ] **Step 2: Run unit tests and confirm failure**

Run: `npx vitest run tests/ecosystem-intelligence-import.test.ts`

- [ ] **Step 3: Implement validation, normalization, permission checks, and evidence keys**

`validate` reads only the supplied path, rejects files not owned by the current user or whose group/other mode bits are non-zero, checks byte size before parsing, normalizes source URLs, and calculates SHA-256 evidence keys from the documented tuples. It performs no database access.

- [ ] **Step 4: Write failing integration tests for all-or-nothing import**

Test candidate-ID and canonical-identity resolution, missing/ambiguous identity rejection before mutation, taxonomy validation, upsert precedence, repeated-file idempotency, signal/relationship evidence-key deduplication, and transaction rollback when any candidate fails.

- [ ] **Step 5: Implement the import repository**

Resolve all identities first in one bounded query. Apply classifications/headquarters/signals/relationships in one transaction using explicit conflict targets. Never mutate `discovery_candidates`, `discovery_runs`, research versions, review statuses, or Opportunity Brief data.

- [ ] **Step 6: Wire CLI commands and package scripts**

Add:

```json
"ecosystem:validate": "tsx scripts/ecosystem-intelligence-import.ts validate",
"ecosystem:import": "tsx scripts/ecosystem-intelligence-import.ts import"
```

Exit non-zero on validation/import failure. Terminal JSON is limited to schema version, file hash, candidate/fact counts, duplicate counts, unresolved count, and terminal status.

- [ ] **Step 7: Document operations and recovery**

Document mode-0600 creation, validate-before-import, exact-file retry after unknown success, database transaction semantics, safe status interpretation, no payload logging, backup/recovery checks, and how future research emits the same versioned contract without changing Discovery scheduling.

- [ ] **Step 8: Run focused tests and commit**

Run: `npx vitest run tests/ecosystem-intelligence-import.test.ts tests/ecosystem-intelligence-import.integration.test.ts --no-file-parallelism`

Expected: PASS.

Commit: `feat: add ecosystem evidence importer`

## Task 4: Implement the shared filtered analytical repository

**Files:**
- Create: `db/repositories/ecosystem-intelligence-repository.ts`
- Create: `tests/ecosystem-intelligence-repository.integration.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Define the repository contract and failing fixtures**

The repository exposes only:

```ts
type EcosystemIntelligenceRepository = {
  getSnapshot(filters: EcosystemFilters, now: Date): Promise<EcosystemSnapshot>;
  getCandidateDetail(candidateId: string, now: Date): Promise<EcosystemCandidateDetail | null>;
};
```

Create fixtures spanning company/creator, rejected/non-rejected, inferred/explicit classification, resolved/unknown HQ, active/expired signals, relationships, research history, evidence ages, and public/private contacts.

- [ ] **Step 2: Write failing filter-population tests**

For each supported filter, assert summary denominator, map, explorer, both matrices, insights, velocity, momentum, relationship set, filter-option counts, and ledger use the same candidate IDs. Assert the base CTE includes a candidate only when an `exists` predicate finds a research row with analysis version `physical-ai-v1`; a later general run in `most_recent_run_id` and a same-source re-sighting that updates `discovery_candidate_sources.discovery_run_id` cannot remove membership, while a general-only candidate without that research row cannot enter. Assert rejected is absent by default and explicit `reviewStatus=rejected` works. Assert private Opportunity Brief email/phone never appears in returned JSON.

- [ ] **Step 3: Implement one reusable filtered-candidate SQL builder**

Build a CTE selecting only candidate identity and facts required by aggregates. Its mandatory first predicate is durable Physical AI corpus membership: `exists` a `candidate_research_versions` row with `analysis_version = 'physical-ai-v1'`. Do not derive membership from `most_recent_run_id` or `discovery_candidate_sources.discovery_run_id`. Apply type, classification, HQ, signal, status, contact, evidence band/freshness, discovery score/date, sorting, and pagination with parameterized Drizzle SQL. Unknown means `not exists` for the requested fact kind; it is never a stored fake row.

- [ ] **Step 4: Implement overview, geography, explorer, and matrix aggregates**

Return numerator and denominator for every percentage. Merge central category inference with explicit classifications in SQL-safe repository helpers; an explicit identical association wins. Cap representative companies at five and matrix domains to registered keys plus Unknown.

- [ ] **Step 5: Implement insights, velocity, momentum, relationships, and ledger**

Feed bounded aggregate rows into the pure insight rules. Discovery velocity uses candidate/run/source dates only. Momentum uses `isActiveSignal` semantics only. Below thresholds return readiness payloads; above graph threshold return at most 40 nodes/60 evidenced edges. Ledger defaults 25, caps 100, and uses stable secondary ID sort.

- [ ] **Step 6: Implement detail without N+1 reads**

Fetch identity, classifications, HQ, public links, active signals, evidenced relationships, source ledger, and bounded research history with a constant number of queries. Do not return raw metadata, lease/submission values, private Opportunity Brief contacts, or full fetched page contents.

- [ ] **Step 7: Run integration tests and add them to DB scripts**

Update `test:unit` exclusions and `test:db`/`test:acceptance` inclusions so the new integration test runs only against the prepared PostgreSQL database.

Run: `npm run db:test:prepare && DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run tests/ecosystem-intelligence-repository.integration.test.ts --no-file-parallelism`

Expected: PASS.

- [ ] **Step 8: Commit**

Commit: `feat: query ecosystem intelligence aggregates`

## Task 5: Add the admin service, APIs, page boundary, and shared navigation

**Files:**
- Create: `app/server/ecosystem-intelligence-service.ts`
- Create: `app/server/ecosystem-intelligence.ts`
- Create: `app/server/ecosystem-intelligence-route.ts`
- Create: `app/api/admin/ecosystem-intelligence/route.ts`
- Create: `app/api/admin/ecosystem-intelligence/candidates/[candidateId]/route.ts`
- Create: `app/admin/ecosystem-intelligence/page.tsx`
- Create: `app/components/product/admin-navigation.ts`
- Modify: `app/admin/discovery/page.tsx`
- Modify: `app/admin/opportunity-briefs/page.tsx`
- Modify: `app/admin/verifications/page.tsx`
- Test: `tests/ecosystem-intelligence-service.test.ts`
- Test: `tests/ecosystem-intelligence-routes.test.ts`
- Test: `tests/ecosystem-intelligence-page.test.tsx`
- Test: `tests/admin-navigation.test.tsx`

- [ ] **Step 1: Write failing administrator service tests**

Assert case-normalized allowlist authorization, no repository calls for non-admin actors, invalid filter 400, missing detail 404, safe 500, explicit injected clock, and plain DTO output.

- [ ] **Step 2: Implement the focused service and composition root**

The service owns authorization and delegates reads. Composition reads existing `ADMIN_EMAILS`, constructs the new repository, and follows the existing request-scoped Cloudflare/no-global-connection behavior.

- [ ] **Step 3: Write failing route tests**

Assert 401 signed-out, 403 non-admin, 400 invalid filters/UUID, 404 missing candidate, 200 safe serialized response, GET-only behavior, and no private fields. Route adapters translate only `Request`, session, params, and response.

- [ ] **Step 4: Implement API adapters**

`GET /api/admin/ecosystem-intelligence` parses `request.url.searchParams`; candidate detail validates UUID. Neither endpoint accepts mutations or is added to service-worker caching.

- [ ] **Step 5: Write failing page and navigation tests**

Assert login/member redirects, canonical-filter redirect for invalid/noncanonical URLs, retryable initial read failure, wide `ProductShell`, and Ecosystem Intelligence links on all four admin pages.

- [ ] **Step 6: Implement the page and shared navigation**

Server-render the first snapshot for valid filters, serialize dates, and pass canonical URL state to the client workspace. Use one `ADMIN_HEADER_LINKS` readonly constant; do not redesign existing pages.

- [ ] **Step 7: Run focused tests and commit**

Run: `npx vitest run tests/ecosystem-intelligence-service.test.ts tests/ecosystem-intelligence-routes.test.ts tests/ecosystem-intelligence-page.test.tsx tests/admin-navigation.test.tsx`

Expected: PASS.

Commit: `feat: expose ecosystem intelligence to admins`

## Task 6: Extract reusable candidate review and research UI

**Files:**
- Create: `app/components/product/CandidateReviewActions.tsx`
- Create: `app/components/product/CandidateResearchHistory.tsx`
- Modify: `app/components/product/DiscoveryDashboard.tsx`
- Modify: `app/components/product/DiscoveryResearchContext.tsx`
- Modify: `tests/discovery-dashboard.test.tsx`
- Modify: `tests/discovery-research-context.test.tsx`

- [ ] **Step 1: Add characterization tests around existing behavior**

Lock status labels, optimistic `expectedUpdatedAt`, same mutation URL/body, conflict refresh, disabled/pending states, drawer focus/Escape/scroll lock, research fetch/history order, and source links before extraction.

- [ ] **Step 2: Run tests before refactoring**

Run: `npx vitest run tests/discovery-dashboard.test.tsx tests/discovery-research-context.test.tsx`

Expected: PASS.

- [ ] **Step 3: Extract the smallest prop-driven children**

`CandidateReviewActions` receives candidate ID/status/updatedAt and one `onUpdated` callback; it remains the only client implementation of the existing mutation protocol. `CandidateResearchHistory` receives or fetches the existing bounded history and renders Evidence-backed/Unknown states. Keep dialog lifecycle in each parent so the extraction does not create a generic drawer framework.

- [ ] **Step 4: Re-run characterization tests**

Expected: unchanged PASS.

- [ ] **Step 5: Commit**

Commit: `refactor: share candidate review context`

## Task 7: Build the URL-driven workspace and coverage foundation

**Files:**
- Create: `app/components/product/ecosystem-intelligence/types.ts`
- Create: `app/components/product/ecosystem-intelligence/filter-state.ts`
- Create: `app/components/product/ecosystem-intelligence/EcosystemIntelligenceWorkspace.tsx`
- Create: `app/components/product/ecosystem-intelligence/EcosystemFilterBar.tsx`
- Create: `app/components/product/ecosystem-intelligence/CoverageSummary.tsx`
- Create: `app/components/product/ecosystem-intelligence/ecosystem-intelligence.module.css`
- Test: `tests/ecosystem-intelligence-workspace.test.tsx`

- [ ] **Step 1: Write failing workspace state tests**

Assert server snapshot renders without a client refetch; visual/filter changes push canonical URLs and reset page; back/forward reloads; repeated filters survive; chips remove one value; Reset restores defaults; zero results preserve chips; fetch failure keeps prior snapshot, marks it stale, shows one Retry; out-of-order responses cannot replace newer state.

- [ ] **Step 2: Implement typed DTOs and browser filter helpers**

Mirror the server DTO without importing `app/server` or `db`. Use `URLSearchParams` and central taxonomy keys; do not persist data in local storage or IndexedDB.

- [ ] **Step 3: Implement workspace fetch coordination**

Use `AbortController` plus a request sequence guard. Set `aria-busy`; retain the last good snapshot; call `router.push` for user actions and listen to framework search-param updates for history. All child `onFilter` callbacks go through one function.

- [ ] **Step 4: Implement filter bar and coverage summary**

Use native labels/selects/details, 44px controls, creator/media toggle, advanced filters, active chips, breadcrumb, Reset, metric definitions, numerator/denominator assistive text, and explicit data-quality percentages. Avoid a dense wall of controls at the top.

- [ ] **Step 5: Run tests and commit**

Run: `npx vitest run tests/ecosystem-intelligence-workspace.test.tsx`

Expected: PASS.

Commit: `feat: add ecosystem workspace filters`

## Task 8: Add the India map and business/technical explorer

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `app/data/india-states-simplified.geojson`
- Create: `app/data/india-states-simplified.README.md`
- Create: `app/components/product/ecosystem-intelligence/IndiaEcosystemMap.tsx`
- Create: `app/components/product/ecosystem-intelligence/EcosystemExplorer.tsx`
- Modify: `tests/ecosystem-intelligence-workspace.test.tsx`

- [ ] **Step 1: Add failing interaction and accessibility tests**

Assert state SVG controls and ranked-list controls expose identical labels/counts and apply the same state filter; Unknown opens `headquarters=unknown`; reliable city coordinates alone render bubbles; mobile list is primary; business/technical switch preserves global filters; every stage/layer shows count, strong-evidence fraction, capped representatives, and configured explanatory context.

- [ ] **Step 2: Install only the projection dependency**

Run: `npm install d3-geo@3.1.1 && npm install --save-dev @types/d3-geo`

Expected: only package manifests change.

- [ ] **Step 3: Vendor and document the simplified state geometry**

Use DataMeet `datameet/maps` revision `b3fbbde595310b397a55d718e0958ce249a4fa1f`, convert the `States/Admin2` dataset to WGS84 GeoJSON, simplify while preserving topology, retain only normalized state key/display name, and record upstream URLs, revision, conversion command, MIT attribution, output byte size, and a geometry-validation checksum. Do not add a runtime network fetch or paid map provider.

- [ ] **Step 4: Implement the map**

Use `geoMercator().fitSize` and `geoPath`; React owns buttons, labels, keyboard behavior, tooltip text, and filters. Count is encoded by fill plus text/accessibility, never colour alone. Use semantic SVG `g role=button` with focus/keyboard handlers only where native SVG cannot provide a button; the ranked native-button list is the always-available equivalent.

- [ ] **Step 5: Implement the explorer**

Render ordered semantic buttons from taxonomy, one full-width switch, no Sankey. Separate configured upstream/downstream explanatory context from verified company facts.

- [ ] **Step 6: Run tests, build, and commit**

Run: `npx vitest run tests/ecosystem-intelligence-workspace.test.tsx && npm run build`

Expected: PASS and successful production build.

Commit: `feat: map india physical ai coverage`

## Task 9: Add matrices, deterministic research gaps, change, and relationships

**Files:**
- Create: `app/components/product/ecosystem-intelligence/CapabilityHeatmaps.tsx`
- Create: `app/components/product/ecosystem-intelligence/ResearchGapInsights.tsx`
- Create: `app/components/product/ecosystem-intelligence/ChangeSignals.tsx`
- Create: `app/components/product/ecosystem-intelligence/RelationshipReadiness.tsx`
- Modify: `app/components/product/ecosystem-intelligence/EcosystemIntelligenceWorkspace.tsx`
- Modify: `app/components/product/ecosystem-intelligence/ecosystem-intelligence.module.css`
- Modify: `tests/ecosystem-intelligence-workspace.test.tsx`

- [ ] **Step 1: Write failing section tests**

Assert matrix cells expose numeric count/evidence/readiness text and cross-filter from both axes; rails are labelled; insights show rule key, qualified wording, counts, coverage, confidence, and supporting-company action; velocity is explicitly research activity; momentum threshold message is exact; graph threshold/caps/evidence links hold; the relationship ledger is the accessible equivalent.

- [ ] **Step 2: Implement matrix tables**

Use semantic tables inside contained horizontal rails. CSS intensity is decorative; the cell text is authoritative. Empty matrices explain which filter or evidence dimension is unresolved.

- [ ] **Step 3: Implement research-gap cards**

Render only server-returned deterministic rules and never generate prose in the client. `View supporting companies` applies the rule's serialized supporting filter. The stale-evidence rule uses canonical `evidenceFreshness=stale`, defined from the newest source/research evidence at the query clock, so its ledger is reproducible without passing candidate IDs in the URL.

- [ ] **Step 4: Implement velocity and momentum**

Show 7/30/90-day candidate research activity separately from active evidence-backed public signals. Never infer momentum from discovery volume.

- [ ] **Step 5: Implement relationship readiness/graph**

Below threshold, render verified-edge/unresolved-target counts and readiness text. Above threshold, draw the bounded evidence-only SVG clustered by the selected role dimension, falling back to technical layer when role is Unknown, with a text/keyboard-accessible node and edge list; every edge link opens its public evidence source.

- [ ] **Step 6: Run focused tests and commit**

Run: `npx vitest run tests/ecosystem-intelligence-workspace.test.tsx`

Expected: PASS.

Commit: `feat: explain ecosystem gaps and change`

## Task 10: Add the evidence ledger and systems-context drawer

**Files:**
- Create: `app/components/product/ecosystem-intelligence/EcosystemCandidateLedger.tsx`
- Create: `app/components/product/ecosystem-intelligence/EcosystemCandidateDrawer.tsx`
- Modify: `app/components/product/ecosystem-intelligence/EcosystemIntelligenceWorkspace.tsx`
- Modify: `app/components/product/ecosystem-intelligence/ecosystem-intelligence.module.css`
- Modify: `tests/ecosystem-intelligence-workspace.test.tsx`

- [ ] **Step 1: Write failing ledger/drawer tests**

Assert server pagination/sort URLs, desktop table/mobile records, public evidence links, detail fetch only on open, bounded loading/error/retry, native-dialog focus/Escape/scroll-lock, Evidence-backed/Inferred/Unknown labels, full version history, public contacts only, active signals, verified relationships, and reuse of existing review actions followed by snapshot refresh.

- [ ] **Step 2: Implement ledger**

Rows/cards show candidate, category/classification, HQ, role/layer, evidence score, public reachability, last evidence, and review status. Pagination preserves all global filters and uses stable `page`/`sort`/`direction` parameters.

- [ ] **Step 3: Implement the detail drawer**

Fetch `/api/admin/ecosystem-intelligence/candidates/:id`; never parse findings into facts. Render summary and findings as plain text sections, not HTML. Reuse `CandidateReviewActions` and `CandidateResearchHistory`; after status mutation close or refresh detail and refetch the analytical snapshot.

- [ ] **Step 4: Run focused tests and commit**

Run: `npx vitest run tests/ecosystem-intelligence-workspace.test.tsx tests/discovery-dashboard.test.tsx tests/discovery-research-context.test.tsx`

Expected: PASS.

Commit: `feat: add ecosystem evidence ledger`

## Task 11: Complete responsive, accessibility, privacy, and end-to-end coverage

**Files:**
- Create: `tests/e2e/ecosystem-intelligence.spec.ts`
- Modify: `playwright.config.ts` if the explicit E2E file list requires it
- Modify: `package.json`
- Modify: `tests/responsive-contract.test.ts`
- Modify: `tests/pwa.test.tsx`
- Modify: `app/components/product/ecosystem-intelligence/ecosystem-intelligence.module.css`

- [ ] **Step 1: Add the new E2E suite to `test:e2e`**

Keep existing three suites and append `tests/e2e/ecosystem-intelligence.spec.ts`.

- [ ] **Step 2: Cover the authenticated admin journey**

Seed representative and intentionally missing facts. Verify direct route, cross-filter/reload/back, state map/list parity, explorer, matrices, insights, readiness states, ledger sort/page, drawer history/status action, and return to unchanged Discovery.

- [ ] **Step 3: Cover responsive and input contracts**

At 320×740, 390×844, 767×900, and 1440×1100 assert no page-level horizontal overflow, labelled rails only where intended, 44px visible controls, readable long URLs/names, drawer containment, keyboard focus, Escape, and equivalent mobile content.

- [ ] **Step 4: Cover privacy and offline boundaries**

Assert no API or admin HTML enters service-worker caches; offline admin navigation shows the exact public fallback; rendered DOM/network payloads contain no Opportunity Brief email/phone, secrets, raw metadata, or evidence page bodies.

- [ ] **Step 5: Run focused E2E and accessibility checks**

Run: `npm run test:e2e -- --grep "Ecosystem Intelligence"`

Expected: PASS.

- [ ] **Step 6: Commit**

Commit: `test: verify ecosystem intelligence journey`

## Task 12: Run the release gate and independent implementation review

**Files:** all changed files

- [ ] **Step 1: Run focused diff checks**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only intentional tracked changes.

- [ ] **Step 2: Run the complete repository release gate**

Run each command separately and preserve terminal evidence:

```bash
npm test
npm run test:db
npm run test:acceptance
npm run test:migrations
npm run test:e2e
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0.

- [ ] **Step 3: Review the diff for boundaries and truthfulness**

Confirm no client imports server/database code, no page/route owns SQL or policy, no aggregate drifts from shared filters, no private contact appears, no inferred relationship is rendered, no Discovery schedule/payload changed, no Global Demand Radar code was added, and no dummy values fill missing data.

- [ ] **Step 4: Request independent code review**

Use `superpowers:requesting-code-review`. Resolve every Critical/Important issue with failing tests first and rerun the relevant gate. Repeat until approved.

- [ ] **Step 5: Commit the verified implementation**

Commit: `feat: complete ecosystem intelligence workspace`

## Task 13: Migrate, import verified initial evidence, deploy, and verify production

**Files:**
- Create locally but never commit: a mode-0600 `ecosystem-intelligence-import-v1` evidence file
- Reuse: `.openai/hosting.json`
- Reuse: `scripts/prepare-sites-deployment.mjs`
- Reuse: `scripts/sites-deployment.mjs`

- [ ] **Step 1: Read and follow the Sites build/hosting skills**

Use `sites:sites-building` because `.openai/hosting.json` exists, then `sites:sites-hosting` for deployment. Do not improvise a parallel deploy path.

- [ ] **Step 2: Create a persistent Neon recovery branch**

Record its identifier outside the repository. Verify it is based on the current production database before migration.

- [ ] **Step 3: Apply migration 0008 transactionally**

Run the committed migration against production through the established environment. Compare counts and identities in `discovery_candidates`, `discovery_runs`, `discovery_candidate_sources`, and `candidate_research_versions` before/after; they must be unchanged.

- [ ] **Step 4: Build the initial evidence file from public verified facts only**

Start from current candidates and research/source links. Include only verified classifications, HQ, signals, or relationships with public canonical evidence. Do not guess fields to make charts look populated. Keep the file mode 0600 and outside Git.

- [ ] **Step 5: Validate, import, and replay-check**

Run:

```bash
npm run ecosystem:validate -- /absolute/private/path/evidence.json
npm run ecosystem:import -- /absolute/private/path/evidence.json
npm run ecosystem:import -- /absolute/private/path/evidence.json
```

Expected: validation succeeds; first import reports safe fact counts; second import reports the same terminal state with zero duplicate rows added. Recheck unresolved counts and existing Discovery row counts.

- [ ] **Step 6: Prepare and deploy the exact commit**

Run: `npm run prepare:sites -- HEAD`

Publish only the generated exact committed target to Sites project `appgprj_6a56979ca26c8191b26abf2a5cd9dc51`. Prove the credential-returned Sites source branch points at that SHA; do not publish dirty files or persist credentials.

- [ ] **Step 7: Verify deployment and production behavior**

Verify Sites version/environment provenance, active routing, SSL and HTTP 200 for `mewtuals.com` and `www.mewtuals.com`, login redirect for the new admin page, 401 for signed-out APIs, no cache headers that make admin data public, and the authenticated narrative workspace at desktop and mobile sizes.

- [ ] **Step 8: Perform the acceptance handoff**

Report exact deployed commit, migration/recovery branch evidence, safe initial import counts, release-gate results, production URL, known Unknown/readiness areas, and that `/admin/discovery` remains unchanged. Leave final visual/data acceptance to the user's authenticated admin-dashboard inspection.
