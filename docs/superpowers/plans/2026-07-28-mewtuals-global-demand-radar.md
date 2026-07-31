# Mewtuals Global Demand Radar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready Global Demand Radar that independently plans and accepts evidence-backed global signals, persists and reviews them in PostgreSQL, and exposes a five-tab administrator workflow without changing the India Discovery Agent's purpose or operational lifecycle.

**Architecture:** Add a sibling bounded context. Framework-free Radar policy lives in small `app/domain/global-radar` modules, orchestration and security live in `app/server/global-radar`, PostgreSQL and cross-context transactions live in focused repositories, and route/page adapters remain thin. The external Codex worker receives an immutable plan and submits a strict provider-neutral batch; the server recomputes gates, scores, identity keys, and replay hashes before one transactional write. Promotion is the only write bridge to Discovery and has its own repository.

**Tech Stack:** Vinext/Next 16, React 19, TypeScript 5.9, Zod 4, PostgreSQL/Neon, Drizzle ORM, Postgres.js, Vitest, Testing Library, Playwright, Sites-compatible Cloudflare Worker output, Codex scheduled-task commands.

---

## Execution contract

The design is locked in `docs/superpowers/specs/2026-07-27-mewtuals-global-demand-radar-design.md`. Do not redesign signal classes, routes, table ownership, promotion eligibility, or worker lifecycle while implementing this plan. If code reality contradicts the approved design, stop that task and amend the design explicitly before continuing.

For every behavior below:

1. Add one focused test and run only that test.
2. Observe the named missing-export or assertion failure (RED).
3. Add the smallest implementation that makes that behavior pass (GREEN).
4. Rerun the focused file before moving to the next checkbox.
5. Refactor only while green, then commit the completed task.

Never paste worker secrets or private claim artifacts into test output, comments, commits, screenshots, or admin DTOs. Keep the six fictional records in explicit test/documentation fixtures only. Do not create a Codex automation, run a production migration, publish a Sites release, or send outreach during this implementation.

## Dependency direction and file map

### Pure domain policy

- Create `app/domain/taxonomies/global-radar-v1.ts` for the twelve demand families, stable leaf identifiers, source families, themes, query intents, and taxonomy version.
- Create `app/domain/taxonomies/indian-execution-archetypes.ts` for the shared Indian execution-archetype vocabulary.
- Create `app/domain/global-radar/contracts.ts` for bounded strict Zod schemas and provider-neutral worker/run DTOs.
- Create `app/domain/global-radar/normalization.ts` for public URL, entity identity, evidence, requirement, query, and signal fingerprints.
- Create `app/domain/global-radar/evidence.ts` for concise evidence extraction records and translation/provenance separation.
- Create `app/domain/global-radar/planner.ts` for deterministic daily, thematic, watchlist-refresh, and manual plans.
- Create `app/domain/global-radar/query-generator.ts` for ordered multilingual query templates and fingerprints.
- Create `app/domain/global-radar/classification.ts` for evidence gates, signal classes, response-path rules, and rejection reasons.
- Create `app/domain/global-radar/india-relevance.ts` for explicit/inferred/no-fit rules.
- Create `app/domain/global-radar/systems-context.ts` for required stack-chain fields and factual/inferred separation.
- Create `app/domain/global-radar/scoring.ts` for class formulas, coverage, thresholds, freshness, expiry, and momentum derivation.
- Create `app/domain/global-radar/transitions.ts` for status transitions and admin command schemas.
- Create `app/domain/global-radar/validation-pipeline.ts` to compose every server-authoritative pure stage and canonical submission hashing.
- Create `app/domain/global-radar/index.ts` as the deliberate public domain API; do not expose module internals accidentally.

### Application and delivery

- Create `app/server/global-radar/config.ts` for environment parsing and safe worker-facing configuration.
- Create `app/server/global-radar/worker-auth.ts` for Radar-only bearer verification and lease HMAC hashing.
- Create `app/server/global-radar/dto.ts` for explicit list, detail, watchlist, promotion, and run serializers.
- Create `app/server/global-radar/run-service.ts` for queue, claim, complete, fail, abandon, expiry, and replay orchestration.
- Create `app/server/global-radar/admin-service.ts` for reads, review transitions, evidence/notes, merge, watchlist, and expiry use cases.
- Create `app/server/global-radar/promotion-service.ts` for eligibility evaluation, promotion, and compensating reversal.
- Create `app/server/global-radar/route.ts` for thin worker/admin request adapters and shared HTTP error mapping.
- Create `app/server/global-radar/index.ts` as the production composition root.
- Create worker routes under `app/api/global-radar/worker/**` and admin mutation routes under `app/api/admin/global-demand-radar/**` exactly as approved.
- Create `scripts/global-radar-worker.ts` and `scripts/global-radar-worker-timeout.ts` for safe local commands.

### Persistence

- Modify `db/schema.ts` only to add `radar_promotion` to `discovery_run_trigger`.
- Create `db/global-radar-schema.ts` for Radar enums, eleven tables, constraints, foreign keys, and indexes.
- Modify `drizzle.config.ts`, `db/client.ts`, and `db/index.ts` to load, type, and export both schema modules.
- Modify `db/types.ts` with inferred Radar row/insert types.
- Create `db/repositories/global-radar-repository.ts` for Radar-owned transactions and read models.
- Create `db/repositories/global-radar-admin-repository.ts` for optimistic review, audit, merge, watchlist, and administrator read models.
- Create `db/repositories/global-radar-promotion-repository.ts` as the only cross-context writer.
- Generate the next ordered Drizzle migration and metadata under `drizzle/`.
- Rename `scripts/test-discovery-migrations.mjs` to `scripts/test-migrations.mjs` and generalize it to fresh plus populated-prior-version upgrades.

### Administrator UI

- Create `app/components/product/AdminShell.tsx` for shared Verification Queue, Opportunity Briefs, India Discovery, and Global Demand Radar navigation.
- Modify `app/admin/verifications/page.tsx`, `app/admin/opportunity-briefs/page.tsx`, and `app/admin/discovery/page.tsx` to use `AdminShell` without changing their behavior.
- Create feature-scoped UI modules under `app/components/global-radar/`: `types.ts`, `GlobalRadarTabs.tsx`, `GlobalRadarMetrics.tsx`, `GlobalRadarSignalList.tsx`, `GlobalRadarWatchlist.tsx`, `GlobalRadarRuns.tsx`, `GlobalRadarSignalDetail.tsx`, `GlobalRadarActions.tsx`, and `GlobalRadarPromotionActions.tsx`.
- Create routes under `app/admin/global-demand-radar/**` for the redirect, five tabs, and signal detail.
- Modify `app/components/product/product.module.css` only for shared shell rules; create `app/components/global-radar/global-radar.module.css` for Radar-specific responsive styles.

### Verification and documentation

- Add focused `tests/global-radar-*.test.*` files instead of expanding unrelated Discovery unit files.
- Add `tests/global-radar-db.integration.test.ts` and `tests/global-radar.acceptance.integration.test.ts` to the relevant package scripts.
- Extend `tests/e2e/product-v1.spec.ts` and `tests/e2e/mobile-pwa.spec.ts` for the authenticated Radar flow and offline/privacy boundary.
- Create `tests/fixtures/global-radar-fictional.ts` and `docs/global-demand-radar-operations.md`.
- Modify `.env.example`, `.dev.vars.example`, `package.json`, and `README.md` for configuration, commands, typecheck, and operations links.

### Task 1: Lock taxonomy and primitive contracts

**Files:**
- Create: `app/domain/taxonomies/global-radar-v1.ts`
- Create: `app/domain/taxonomies/indian-execution-archetypes.ts`
- Create: `app/domain/global-radar/contracts.ts`
- Create: `app/domain/global-radar/index.ts`
- Test: `tests/global-radar-taxonomies.test.ts`
- Test: `tests/global-radar-contracts.test.ts`

- [ ] **Step 1: RED/GREEN the exact managed vocabularies**

Add one assertion at a time for `GLOBAL_RADAR_TAXONOMY_VERSION === "global-radar-v1"`, all twelve top-level families, every approved leaf identifier, all 33 Indian execution archetypes, approved source families, signal classes, India relevance values, signal statuses, requirement kinds, run statuses/triggers/modes, and promotion paths. Run:

```bash
npx vitest run tests/global-radar-taxonomies.test.ts -t 'defines the complete v1 taxonomy'
```

Expected RED: missing module/export. Expected GREEN: exact ordered arrays with no duplicates. Export readonly lookup maps so callers validate identifiers rather than accepting free-form fallbacks.

- [ ] **Step 2: RED/GREEN bounded common values**

In `tests/global-radar-contracts.test.ts`, drive strict schemas for nullable-versus-empty arrays, bounded strings/arrays/records, integer confidence/score components, ISO timestamps, public HTTP(S) URLs, and professional response paths. Reuse or extract the proven public-host safety rules from `app/domain/discovery.ts`; do not weaken Discovery URL behavior or duplicate an inconsistent private/loopback detector.

```ts
export const signalClasses = [
  "direct_demand",
  "demand_precursor",
  "ecosystem_momentum",
] as const;

export const indiaRelevanceTypes = [
  "explicit_India",
  "existing_India_presence",
  "India_expansion",
  "globally_open",
  "inferred_India_compatible",
  "no_current_India_fit",
] as const;
```

- [ ] **Step 3: RED/GREEN the provider-neutral batch envelope**

Add one test per boundary: at most 20 accepted signals, 100 evidence items, 100 requirements, 120 executed queries, 50 entities, 50 bounded source errors, and 2 MiB serialized JSON. Reject unknown keys, `fictionalExample`, full-page-like bodies, unbounded raw metadata, and mismatched version fields. Accept an honest empty batch only when it contains no source errors.

```ts
export const GLOBAL_RADAR_SCHEMA_VERSION = "global-radar-batch-v1" as const;
export const GLOBAL_RADAR_PROMPT_VERSION = "codex-public-web-v1" as const;

export const globalRadarBatchSchema = z.strictObject({
  schemaVersion: z.literal(GLOBAL_RADAR_SCHEMA_VERSION),
  runId: z.uuid(),
  planFingerprint: fingerprintSchema,
  executedQueries: z.array(executedQuerySchema).max(120),
  entities: z.array(globalEntityInputSchema).max(50),
  signals: z.array(signalDraftSchema).max(20),
  sourceErrors: z.array(sourceErrorSchema).max(50),
}).superRefine(enforceBatchTotalsAndEvidencePresence);
```

- [ ] **Step 4: Run and commit**

Run:

```bash
npx vitest run tests/global-radar-taxonomies.test.ts tests/global-radar-contracts.test.ts
git diff --check
```

Expected: PASS and no whitespace errors.

```bash
git add app/domain/taxonomies app/domain/global-radar tests/global-radar-taxonomies.test.ts tests/global-radar-contracts.test.ts
git commit -m "feat: define global radar contracts"
```

### Task 2: Build deterministic plans and multilingual queries

**Files:**
- Create: `app/domain/global-radar/planner.ts`
- Create: `app/domain/global-radar/query-generator.ts`
- Modify: `app/domain/global-radar/index.ts`
- Test: `tests/global-radar-planner.test.ts`
- Test: `tests/global-radar-query-generator.test.ts`

- [ ] **Step 1: RED/GREEN immutable plan identity**

Drive daily, thematic, watchlist-refresh, and manual plans from an injected clock and configuration. Lock `GLOBAL_RADAR_PLAN_VERSION` to `global-radar-plan-v1` and `GLOBAL_RADAR_QUERY_VERSION` to `global-radar-query-v1`. Assert Asia/Kolkata daily keys, ISO-week thematic keys, approved rotating themes, manual request UUIDs, source/country/language lists, date windows, result limits, immutable config hash, taxonomy version, score version, and stable plan fingerprint. Rerunning the same inputs must produce byte-equivalent canonical plans.

```ts
export type GlobalRadarPlannerInput = {
  now: Date;
  scanMode: RadarScanMode;
  config: PublicGlobalRadarConfig;
  requestedTheme?: GlobalRadarTheme;
  administratorRequestId?: string;
  coverageState: RadarCoverageState;
  watchlist: readonly WatchlistPlanningInput[];
};

export function planGlobalRadarRun(input: GlobalRadarPlannerInput): RadarPlan;
```

Run each micro-cycle with:

```bash
npx vitest run tests/global-radar-planner.test.ts -t 'builds a deterministic daily plan'
```

- [ ] **Step 2: RED/GREEN ordered query generation**

Assert query generation uses taxonomy identifiers and explicit intent templates, produces stable fingerprints/ordinals, pairs Chinese and English query families for China, applies recency and source hierarchy, excludes generic company/marketing queries, and never exceeds 120. Direct templates must include an external-request intent; precursor templates must include a dated development intent.

```ts
export type SearchQuery = {
  fingerprint: string;
  query: string;
  language: string;
  sourceCountry: string;
  theme: GlobalRadarTheme;
  signalIntent: "direct_demand" | "demand_precursor" | "ecosystem_momentum";
  sourceAdapter: "codex_public_web";
  recencyDays: number;
  ordinal: number;
};
```

- [ ] **Step 3: RED/GREEN truthful low-volume plans**

Test that coverage gaps influence ordering without padding results, a disabled source yields no query for it, watchlist entries are configuration inputs rather than hard-coded branches, and zero generated queries is a valid explicit plan result when configuration has no enabled work.

- [ ] **Step 4: Run and commit**

```bash
npx vitest run tests/global-radar-planner.test.ts tests/global-radar-query-generator.test.ts
git diff --check
git add app/domain/global-radar tests/global-radar-planner.test.ts tests/global-radar-query-generator.test.ts
git commit -m "feat: plan global radar searches"
```

### Task 3: Enforce evidence, classification, and response-path gates

**Files:**
- Create: `app/domain/global-radar/normalization.ts`
- Create: `app/domain/global-radar/classification.ts`
- Modify: `app/domain/global-radar/contracts.ts`
- Modify: `app/domain/global-radar/index.ts`
- Test: `tests/global-radar-classification.test.ts`
- Test: `tests/global-radar-normalization.test.ts`

- [ ] **Step 1: RED/GREEN canonical evidence and identity**

Test normalized entity domains, official website and LinkedIn organisation URLs, canonical evidence URLs, stable entity identifiers, query/evidence/requirement fingerprints, and name-plus-country collision candidates. Name equality alone must never produce an automatic entity merge. Mirrors of one source normalize to one evidence fingerprint without discarding distinct primary sources.

- [ ] **Step 2: RED/GREEN direct-demand hard gates**

Add one test for each accepted external ask (RFP, procurement, supplier registration, vendor, partner application, distributor, manufacturing, data collection, testing/certification, installation/service) and one rejection test each for funding-only, hiring-only, launch-only, generic marketing, inferred demand, expired asks, and secondary-only evidence. Direct demand requires an explicit current ask plus at least one first-party or official procurement item.

```ts
export type ClassificationResult =
  | { accepted: true; signalClass: SignalClass; gateFacts: SignalGateFacts }
  | { accepted: false; reason: RadarRejectionReason };

export function classifySignal(input: EvidenceCandidate): ClassificationResult;
```

- [ ] **Step 3: RED/GREEN precursor and momentum gates**

Prove dated funding, hiring, deployment, facility, platform launch, and expansion can create a precursor but never a procurement claim. Prove momentum requires at least two independent organisations, two evidence items, a primary source, non-syndicated evidence, taxonomy consistency at least 70, and evidence quality at least 60. One company group or syndicated copies must reject.

- [ ] **Step 4: RED/GREEN language and public response safety**

Keep original-language text, English summary, evidence confidence, and translation confidence in separate fields. Reject missing original Chinese evidence, summaries masquerading as sources, search-result URLs, guessed email addresses, personal contact addresses, and response paths absent from cited first-party evidence. Accept only approved professional path types and cited public business emails.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run tests/global-radar-classification.test.ts tests/global-radar-normalization.test.ts
git diff --check
git add app/domain/global-radar tests/global-radar-classification.test.ts tests/global-radar-normalization.test.ts
git commit -m "feat: validate global radar evidence"
```

### Task 4: Model requirements, India relevance, and systems context

**Files:**
- Create: `app/domain/global-radar/india-relevance.ts`
- Create: `app/domain/global-radar/systems-context.ts`
- Modify: `app/domain/global-radar/contracts.ts`
- Modify: `app/domain/global-radar/index.ts`
- Test: `tests/global-radar-requirements.test.ts`
- Test: `tests/global-radar-india-relevance.test.ts`
- Test: `tests/global-radar-systems-context.test.ts`

- [ ] **Step 1: RED/GREEN normalized requirements**

Test all seven requirement kinds, taxonomy-backed capability tags, arrays for data families/sensors/environments/tasks/collection methods/human roles/robot embodiments/archetypes, bounded specification objects, confidence, and stable requirement fingerprints. Reject unknown taxonomy values and duplicate fingerprints within one signal.

- [ ] **Step 2: RED/GREEN explicit India claims**

For each of `explicit_India`, `existing_India_presence`, and `India_expansion`, require field-level evidence supporting the exact claim. Test India suppliers, languages, roads/environments, manufacturing, distribution, collection, installation, and service. A translation or worker label alone must fail.

- [ ] **Step 3: RED/GREEN inferred compatibility and honest no-fit**

Require a globally deliverable/open requirement, at least one taxonomy-backed Indian archetype, and no exclusion for `inferred_India_compatible`. Keep reasons, constraints, unknowns, and confidence distinct. Preserve `no_current_India_fit` as valid and monitorable; null regulatory/logistics facts remain null.

```ts
export function assessIndiaRelevance(
  input: IndiaRelevanceInput,
): IndiaRelevanceAssessment;
```

- [ ] **Step 4: RED/GREEN systems-context obligations**

Require all ten structured fields and an 80–150 word summary for every direct demand eligible for qualification and every precursor scoring at least 70. Test the hardware and physical-data stack chains, separate factual/inferred arrays, and allow null context for weaker precursors/momentum rather than fabricated detail.

- [ ] **Step 5: RED/GREEN sensitive-data and compliance facts**

Cover faces, voices, biometrics, gaze, health, children, home interiors,
workplace monitoring, precise location, road users, employee data, industrial
secrets, defence/dual use, copyrighted material, and export controls. Keep
consent, de-identification, legal-review, residency, and participant-rights
fields nullable; unknown never becomes false or low risk. Test that severe or
unresolved conditions can force `needs_review` and reduce actionability without
making a legal conclusion.

- [ ] **Step 6: Run and commit**

```bash
npx vitest run tests/global-radar-requirements.test.ts tests/global-radar-india-relevance.test.ts tests/global-radar-systems-context.test.ts
git diff --check
git add app/domain/global-radar tests/global-radar-requirements.test.ts tests/global-radar-india-relevance.test.ts tests/global-radar-systems-context.test.ts
git commit -m "feat: assess global radar execution fit"
```

### Task 5: Calculate class scores, freshness, momentum, and transitions

**Files:**
- Create: `app/domain/global-radar/scoring.ts`
- Create: `app/domain/global-radar/transitions.ts`
- Modify: `app/domain/global-radar/index.ts`
- Test: `tests/global-radar-scoring.test.ts`
- Test: `tests/global-radar-transitions.test.ts`

- [ ] **Step 1: RED/GREEN class-local scoring**

Drive every direct and precursor component weight independently. Require the class-specific components, preserve unknown components as null, compute `scoreCoverage`, return a null composite below 0.80, normalize known weights at or above 0.80, and round deterministically. Do not expose or calculate a cross-class score.

```ts
export const GLOBAL_RADAR_SCORE_VERSION = "global-radar-score-v1" as const;

export function scoreDirectDemand(input: DirectDemandComponents): ScoreResult;
export function scoreDemandPrecursor(input: PrecursorComponents): ScoreResult;
```

Explicitness below 75 or evidence confidence below 60 blocks direct qualification even if the arithmetic score is high. Precursor evidence confidence below 60 or proximity below 50 blocks qualification.

- [ ] **Step 2: RED/GREEN freshness, horizon, and expiry**

Test freshness anchors (100 through 7 days, 80 through 30, 50 through 90, 20 through 180, 0 afterward), time-horizon anchors, date-boundary determinism, past-expiry direct demand, and evergreen demand requiring re-observation. Use an injected clock; never read `Date.now()` in pure policy.

- [ ] **Step 3: RED/GREEN derived momentum**

Test distinct entity/evidence/source-family dedupe, 7/30/90-day windows, preceding-period growth, clamping, versioned targets (five entities, five primary sources, four source families), required gates, score formula, and stable aggregation after replay.

- [ ] **Step 4: RED/GREEN human transitions and qualification thresholds**

Encode every approved transition. New ingestion may create only `newly_discovered` or `needs_review`; rediscovery cannot overwrite a human state. Qualification requires the configurable class threshold plus all hard gates. Mark-no-India-fit sets the relevance type and normally moves to monitoring. Dismissed/expired reopen requires new evidence or an explicit reason. Promoted can return to qualified only through reversal.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run tests/global-radar-scoring.test.ts tests/global-radar-transitions.test.ts
git diff --check
git add app/domain/global-radar tests/global-radar-scoring.test.ts tests/global-radar-transitions.test.ts
git commit -m "feat: score and transition radar signals"
```

### Task 6: Isolate Radar configuration and credentials

**Files:**
- Create: `app/server/global-radar/config.ts`
- Create: `app/server/global-radar/worker-auth.ts`
- Modify: `app/server/env.ts`
- Modify: `.env.example`
- Modify: `.dev.vars.example`
- Modify: `package.json`
- Test: `tests/global-radar-config.test.ts`
- Test: `tests/global-radar-worker-auth.test.ts`
- Test: `tests/local-env.test.ts`

- [ ] **Step 1: RED/GREEN environment parsing**

Test the exact variables and defaults: US/China, `en,zh-CN`, approved themes, `codex_public_web`, result limit 20, and thresholds 70/65/70. Test trimming/deduplication, result limit 1–20, thresholds 0–100, known sources/themes/languages, HTTP(S) base URL without credentials, and a required secret of at least 32 characters in production.

```ts
export type GlobalRadarConfig = {
  workerSecret: string;
  apiBaseUrl?: URL;
  countries: readonly string[];
  languages: readonly string[];
  themes: readonly GlobalRadarTheme[];
  enabledSources: readonly ["codex_public_web"];
  resultLimit: number;
  thresholds: Readonly<Record<SignalClass, number>>;
};
```

Read environment only here and in the CLI edge. Return a redacted `PublicGlobalRadarConfig`; it must be impossible to serialize the secret through the claim plan or admin DTO.

- [ ] **Step 2: RED/GREEN credential separation**

Use unique purposes `global-radar-worker-v1` and `global-radar-lease-v1`. Test constant-time bearer checks, token hashing, wrong purpose, wrong secret, and failure when configured Radar and Discovery worker secrets are equal. Preserve all Discovery auth tests unchanged.

- [ ] **Step 3: Add the typecheck script**

Add only:

```json
"typecheck": "tsc --noEmit"
```

Run `npm run typecheck`; fix newly exposed baseline errors before continuing rather than suppressing them.

- [ ] **Step 4: Run and commit**

```bash
npx vitest run tests/global-radar-config.test.ts tests/global-radar-worker-auth.test.ts tests/local-env.test.ts
npm run typecheck
git diff --check
git add app/server/global-radar app/server/env.ts .env.example .dev.vars.example package.json tests/global-radar-config.test.ts tests/global-radar-worker-auth.test.ts tests/local-env.test.ts
git commit -m "feat: configure global radar securely"
```

### Task 7: Add the Radar database contract and forward migration

**Files:**
- Modify: `db/schema.ts`
- Create: `db/global-radar-schema.ts`
- Modify: `db/client.ts`
- Modify: `db/index.ts`
- Modify: `db/types.ts`
- Modify: `drizzle.config.ts`
- Modify: `tests/schema.test.ts`
- Rename: `scripts/test-discovery-migrations.mjs` to `scripts/test-migrations.mjs`
- Modify: `package.json`
- Create: generated `drizzle/0009_global_demand_radar.sql` after the deployed
  Ecosystem Intelligence `0008` baseline
- Create: generated `drizzle/meta/0009_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

Keep the existing 554-line core schema readable: add only `radar_promotion` to `discoveryRunTriggerEnum` in `db/schema.ts`, define Radar-owned objects in `db/global-radar-schema.ts`, make `drizzle.config.ts` load both files, and compose both schema objects in `db/client.ts`. `db/index.ts` re-exports both modules. This preserves core-table ownership while avoiding an eleven-table monolith.

- [ ] **Step 1: RED/GREEN exact Radar enums**

Add schema assertions one enum at a time. Lock previously implicit vocabularies as follows:

```ts
globalRadarQueryStatus = ["planned", "succeeded", "failed"];
globalRadarSignalEntityRole = ["supporting", "contributor"];
globalRadarActorType = ["worker", "administrator", "system"];
globalRadarWatchlistState = ["enabled", "paused", "disabled"];
globalRadarPromotionStatus = ["active", "reversed", "failed", "conflicted"];
globalRadarUpdateType = [
  "created", "rediscovered", "evidence_appended", "note_appended",
  "status_changed", "classification_changed", "expiry_changed",
  "india_fit_changed", "merged", "momentum_recomputed", "promoted",
  "promotion_reversed",
];
```

Also assert every approved run/signal/relevance/requirement/promotion enum and `discoveryRunTriggerEnum` ending in `radar_promotion` without changing preceding values.

- [ ] **Step 2: RED/GREEN the eleven tables in dependency order**

Drive one table and its constraints at a time:

1. `global_entities`
2. `global_radar_runs`
3. `global_radar_search_queries`
4. `global_radar_signals`
5. `global_radar_signal_entities`
6. `global_signal_requirements`
7. `global_signal_evidence`
8. `global_signal_updates`
9. `global_radar_watchlist_entries`
10. `global_radar_promotions`
11. `global_radar_admin_events`

The implementation-complete storage contract also asserts: canonical corporate
group and queryable stable public identifiers on entities; immutable plan
fingerprint/snapshot on runs; query recency without a separate target-market
column; signal theme, dedupe/policy versions, evergreen and re-observation;
required requirement summaries; evidence contributor/source-family/syndication;
and the watchlist category plus localized search terms. These are additive
fields required by the already-approved Tasks 2, 5, 8, and 9 and do not change
the eleven-table boundary.

Run `npx vitest run tests/schema.test.ts -t 'defines global entities'` for the first table, then use the corresponding concrete test name for each subsequent table. Assert UUID identities, timestamp defaults, named FKs, cascade/restrict behavior, filter indexes, one-running Radar partial unique index, manual claim index, normalized domain/LinkedIn partial uniqueness, `(run_id, fingerprint)`, `(signal_id, entity_id, role)`, `(signal_id, requirement_fingerprint)`, `(signal_id, evidence_fingerprint)`, update/admin idempotency, and one active promotion per entity.

- [ ] **Step 3: Mirror class and bound invariants in SQL**

Add named checks for integer scores/confidences 0–100, `score_coverage` as integer percent 0–100 (80 is the domain coverage boundary), nonnegative counters, valid running leases, entity revisions, and nonempty bounded-text surrogates where PostgreSQL can enforce them. Encode the domain-tested class nullability matrix: only the discriminator's composite/components may be populated and non-applicable composites/components must be null. Keep bounded JSONB validation at the Zod/repository boundary with an 8 KiB per-object limit.

Canonicalize the stored LinkedIn organisation URL before persistence and index that stored value; do not add a second denormalized identity column. Primary direct/precursor ownership remains `global_entity_id`; association roles are only supporting/contributor.

Use a GIN-indexed bounded canonical `stable_public_identifiers` text array and a
nullable bounded canonical application-ID text `canonical_corporate_group_id`
on entities (not a UUID or self-reference). Persist a bounded
immutable run plan snapshot with its fingerprint. Enforce the active
`(dedupe_version, dedupe_key)` signal identity with the exact partial predicate
`merged_into_signal_id IS NULL`; dismissed/expired unmerged rows still own the
key. `dedupe_version` is required. Direct rows require `evergreen`, require
`reobserve_by` iff evergreen, and non-direct rows keep both null. A momentum
evidence contributor may reference its entity directly; `source_family` and
`is_syndicated` are required, and the repository requires contributor binding
for momentum. Watchlists use exact `category_search_term_en` and
`category_search_term_zh_cn` columns; a China-effective configuration requires
the latter at the domain/repository boundary.

- [ ] **Step 4: Generate and inspect the migration**

Run:

```bash
npm run db:generate -- --name global_demand_radar
```

Expected: exactly one ordered `0009_global_demand_radar.sql` after
`0008_ecosystem_intelligence_v1.sql`, plus matching journal/snapshot. Inspect,
rather than hand-writing metadata, for `ALTER TYPE discovery_run_trigger ADD
VALUE 'radar_promotion'`, every enum/table/check/FK/index, and no dropped or
repurposed existing object.

- [ ] **Step 5: Generalize the migration harness**

Rename the harness and preserve its allowlisted-database/ownership-marker
safety. Test three isolated paths: fresh through `0009`; the existing populated
`0003 -> 0004` Discovery path; and populated `0007 -> Ecosystem 0008 -> Radar
0009` with users, sessions, profiles, verification reviews, Opportunity Brief
requests, Discovery runs, candidates, identifiers, sources, campaign keys,
candidate research versions, and Ecosystem Intelligence rows. Read ordered
journal entries rather than hard-coding the total. Assert all previous fixture
values and Discovery/Ecosystem constraints survive, `0008` and `0009` each
apply once, eleven Radar tables exist, and the Discovery trigger adds only
`radar_promotion`. Run twice to prove cleanup/idempotency.

```bash
npm run test:migrations
```

- [ ] **Step 6: Run and commit**

```bash
npx vitest run tests/schema.test.ts
npm run test:migrations
npm run typecheck
git diff --check
git add -A db drizzle drizzle.config.ts scripts/test-discovery-migrations.mjs scripts/test-migrations.mjs package.json tests/schema.test.ts
git commit -m "feat: migrate global radar storage"
```

### Task 8: Implement independent run queue, lease, failure, and replay state

**Files:**
- Create: `db/repositories/global-radar-repository.ts`
- Create: `tests/global-radar-db.integration.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Define the service-owned repository port**

Start with a framework-free interface covering queue, claim, complete, fail, abandon, list/read models, review commands, and maintenance. Keep SQL-only helper types private. Export tagged outcomes rather than throwing expected conflicts.

```ts
export type RadarRunMutationResult =
  | { outcome: "completed" | "replayed"; run: SafeRadarRun }
  | { outcome: "conflict"; reason: RadarRunConflictReason; run?: SafeRadarRun };
```

- [ ] **Step 2: RED/GREEN queue idempotency and manual priority**

Test same external key plus same request hash returns the same queued run, changed hash conflicts, manual requests require a stable administrator UUID, and manual rows sort before scheduled/trial work. Daily and thematic keys must be independent of Discovery keys.

- [ ] **Step 3: RED/GREEN Radar-only claiming and lease recovery**

Use a Radar-specific advisory-lock namespace and the Radar partial unique index. Within the claim transaction, mark every expired running Radar row failed with `completed_at` and bounded `lease_expired` metadata before checking active work. Do not requeue it. Claim the next row with a two-hour random lease, hash only the lease, and return the raw lease only to the application service. Prove simultaneous Discovery and Radar claims both succeed and neither active-run index blocks the other.

- [ ] **Step 4: RED/GREEN fail and abandon semantics**

`fail` requires the valid unexpired lease. `abandon` requires only the Radar worker bearer at the route/service boundary, an explicit running run ID, and a bounded reason. Same abandoned run/reason replays; a different reason or other terminal state conflicts. Neither operation can affect queued or Discovery runs.

- [ ] **Step 5: RED/GREEN completion identity before persistence**

Lock the run, verify running status, unexpired lease hash, plan fingerprint, and canonical validated submission hash. Same terminal run/lease/hash returns `replayed`; a changed hash conflicts. Zero signals/no source errors succeeds; zero signals/any source error fails; valid signals plus bounded errors becomes partial.

- [ ] **Step 6: Wire DB test scripts and commit**

Exclude `tests/global-radar-db.integration.test.ts` from `test:unit`; include it under `test:db` with `--no-file-parallelism`.

```bash
npm run db:test:prepare
SESSION_SECRET=integration-session-secret-that-is-longer-than-32-characters DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run --no-file-parallelism tests/global-radar-db.integration.test.ts
git diff --check
git add db/repositories/global-radar-repository.ts tests/global-radar-db.integration.test.ts package.json
git commit -m "feat: persist global radar run lifecycle"
```

### Task 9: Persist validated signals atomically and maintain projections

**Files:**
- Modify: `db/repositories/global-radar-repository.ts`
- Modify: `tests/global-radar-db.integration.test.ts`

- [ ] **Step 1: RED/GREEN entity resolution without name-only merging**

Resolve canonical domain, official website, normalized LinkedIn, then stable public identifiers. One match updates safe automated fields and `last_seen_at`; multiple owners yield a bounded conflict; name/country-only matches are explicit merge candidates. Automatically discovered entities and their first valid signals must be inserted in the same transaction, so no signal-free auto-discovered entity can commit.

- [ ] **Step 2: RED/GREEN signal dedupe and immutable history**

Use `GLOBAL_RADAR_DEDUPE_VERSION = "global-radar-dedupe-v1"` and a hash over class, primary/supporting identities, signal type, requirement fingerprints, announced-time bucket, target geographies, and primary source. For momentum, include taxonomy/theme, a fixed observation-window bucket, and sorted contributor identities. Mirrors attach evidence; changed deadlines/scope/geography/material requirements append an update and a new version when needed. Rediscovery must not overwrite human status, classification, expiry, notes, or promotion state.

- [ ] **Step 3: RED/GREEN full transactional graph persistence**

Within completion, persist/resolution-order entities, signals, supporting associations, requirements, evidence, field provenance, search-query outcomes, updates, and final counters. Canonicalize and revalidate every worker proposal before writing. Reject `fictionalExample`, full-page content, unknown taxonomy values, or non-applicable class fields. Any failure rolls back every graph row and terminal counter.

- [ ] **Step 4: RED/GREEN exact replay and bounded errors**

Submit the identical batch twice and assert zero additional entities, signals, queries, associations, requirements, evidence, updates, counters, or momentum rows. A changed canonical batch conflicts. Store at most 50 source errors and bounded rejection reason/count summaries, never rejected payloads.

- [ ] **Step 5: RED/GREEN expiry and momentum recomputation**

Expire known-deadline direct demand deterministically, require evergreen re-observation, and derive momentum only from deduplicated qualified evidence/entity associations. Recompute idempotently over 7/30/90-day windows and append an update only when the safe derived state changes.

- [ ] **Step 6: Run and commit**

```bash
SESSION_SECRET=integration-session-secret-that-is-longer-than-32-characters DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run --no-file-parallelism tests/global-radar-db.integration.test.ts
git diff --check
git add db/repositories/global-radar-repository.ts tests/global-radar-db.integration.test.ts
git commit -m "feat: persist global radar signals"
```

### Task 10: Implement review, audit, merge, and watchlist persistence

**Files:**
- Create: `db/repositories/global-radar-admin-repository.ts`
- Modify: `db/repositories/global-radar-repository.ts`
- Modify: `tests/global-radar-db.integration.test.ts`

- [ ] **Step 1: RED/GREEN safe read models and filters**

Implement class metrics, paginated class lists, detail, watchlist, and run read models. Lock common GET filters to `status`, `country`, `indiaRelevance`, `demandDomain`, `capability`, `observedFrom`, `observedTo`, and `page`; add `expiresBefore` for direct demand, `horizon` for precursors, and `theme` for momentum. Use page size 25, maximum requested page 100, stable class-specific ordering, and bounded filter values.

- [ ] **Step 2: RED/GREEN optimistic review commands**

Lock the row, compare integer `revision`, enforce the domain transition, increment revision, and append both a `global_signal_updates` row and `global_radar_admin_events` row containing only bounded safe before/after state. Return the latest safe row on conflict. Cover qualify, monitor, dismiss, reopen, no-India-fit, classification edit, and expiry edit.

- [ ] **Step 3: RED/GREEN append-only evidence and notes**

Evidence must pass public/provenance schemas and dedupe by fingerprint. Store administrator notes only as `global_signal_updates` with type `note_appended`; do not add a mutable signal note column. List/run/worker/member DTOs never include notes; authenticated detail can include bounded note history.

- [ ] **Step 4: RED/GREEN transactional duplicate merge**

Require two distinct signals, expected revisions, explicit confirmation and reason. Lock in stable ID order, preserve aliases/associations/evidence/requirements/updates for both, set `merged_into_signal_id`, and append merge/audit events. Never delete a signal or history row.

- [ ] **Step 5: RED/GREEN configurable watchlist state**

Test idempotent creation, enabled/paused/disabled transitions, priority/themes/countries/languages/cadence/next-scan edits, optimistic revision, and audit. “Remove” means disabled; it preserves the row. Admin-created signal-free entities are permitted only through this transaction.

- [ ] **Step 6: Run and commit**

```bash
SESSION_SECRET=integration-session-secret-that-is-longer-than-32-characters DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run --no-file-parallelism tests/global-radar-db.integration.test.ts
git diff --check
git add db/repositories/global-radar-admin-repository.ts db/repositories/global-radar-repository.ts tests/global-radar-db.integration.test.ts
git commit -m "feat: review global radar records"
```

### Task 11: Build the controlled Discovery promotion bridge

**Files:**
- Create: `db/repositories/discovery-candidate-writer.ts`
- Modify: `db/repositories/discovery-repository.ts`
- Create: `db/repositories/global-radar-promotion-repository.ts`
- Create: `tests/global-radar-promotion-db.integration.test.ts`
- Modify: `tests/discovery.acceptance.integration.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Characterize and extract candidate resolution**

Before moving code, add database characterization tests for existing Discovery candidate identity priority, create/update, identifier collision, evidence append, status preservation, score max, and exact replay. Extract a transaction-scoped `writeDiscoveryCandidates` helper without changing observable Discovery behavior. Run the Discovery tests after every move.

- [ ] **Step 2: RED/GREEN all promotion preconditions**

Require an administrator, qualified primary signal, threshold/hard gates, public identity evidence, matching entity/primary/supporting revisions, no identifier conflict, reason, idempotency key, and exactly one eligibility path. Test all four approved paths, including three compatible qualified signals in the trailing 180 days and two independent primary sources for exceptional relevance.

- [ ] **Step 3: Lock the Radar-to-Discovery mapping**

Use creator only when `organisation_type` is explicitly creator-like; map other organisation entities to the existing broad `company` candidate kind and retain the exact Radar organisation type in bounded metadata. Map name/URLs from entity identity, description/source from the primary signal/evidence, category from `demand_domain`, subcategory from sector, geography from headquarters country, and `discoveryScore` from the primary signal's class-local composite with class/version in metadata. Reject promotion when canonical candidate identity, required source, geography, or composite score is absent.

The terminal intake run uses trigger `radar_promotion`, candidate type derived above, requested/found count 1, company percentage 100 or 0, source list from cited evidence, and a deterministic external key/request hash. It is never claimable. Existing Discovery candidate status is preserved; a new one starts `discovered`. Promotion-intake rows may appear in the existing admin history as the explicit bridge exception, but scheduled/manual/trial claiming, India configuration, and India coverage metrics must ignore `radar_promotion` runs.

- [ ] **Step 4: RED/GREEN the cross-context transaction**

Lock entity, primary/supporting signals, and active promotion; create/resolve the terminal intake run and candidate; append bounded public source evidence; insert the promotion and audits; set entity to `promoted_to_candidate`; set primary signal to `promoted`; and preserve captured prior states. One entity has at most one active promotion. Idempotent repeats return the stored result; changed requests conflict. Test a promotion racing ordinary Discovery ingestion.

- [ ] **Step 5: RED/GREEN inspectable conflict/failure attempts**

Expected domain conflicts commit a `conflicted` promotion attempt plus a bounded audit without business-state changes. Expected persistence failures that occur while the database remains available use a separate bounded follow-up transaction to mark the attempt `failed`; never store an exception, SQL, secret, or payload. A database outage cannot promise a durable failure record and must surface only a safe service error.

- [ ] **Step 6: RED/GREEN compensating reversal**

With matching revisions, mark the promotion reversed, clear `promoted_candidate_id` only if it still matches, restore captured entity/primary-signal statuses, append update/audit events, and preserve every Discovery row. Later admin changes produce 409 rather than guessed restoration. Repeating the same reversal is a replay.

- [ ] **Step 7: Run and commit**

```bash
npx vitest run tests/discovery-domain.test.ts tests/discovery-service.test.ts tests/discovery-routes.test.ts
SESSION_SECRET=integration-session-secret-that-is-longer-than-32-characters DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run --no-file-parallelism tests/discovery.acceptance.integration.test.ts tests/global-radar-promotion-db.integration.test.ts
git diff --check
git add db/repositories/discovery-candidate-writer.ts db/repositories/discovery-repository.ts db/repositories/global-radar-promotion-repository.ts tests/discovery.acceptance.integration.test.ts tests/global-radar-promotion-db.integration.test.ts package.json
git commit -m "feat: bridge radar promotions to discovery"
```

### Task 12: Compose the server-authoritative validation pipeline

**Files:**
- Create: `app/domain/global-radar/evidence.ts`
- Create: `app/domain/global-radar/validation-pipeline.ts`
- Modify: `app/domain/global-radar/index.ts`
- Test: `tests/global-radar-evidence.test.ts`
- Test: `tests/global-radar-validation-pipeline.test.ts`

- [ ] **Step 1: RED/GREEN concise evidence extraction records**

Normalize worker-produced observations into concise claims, permitted short excerpts, original language, English summary, two confidences, primary/direct/India flags, canonical URL, supported field paths, and fingerprints. Reject full-page-like content, absent publication/observation dates, unsupported field paths, and translation text replacing original evidence.

- [ ] **Step 2: RED/GREEN one deterministic stage pipeline**

Compose the pure stages in approved order: evidence normalization, classification, requirement validation, India assessment, score recomputation, systems-context validation, final evidence validation, and dedupe-key construction. Return accepted values and bounded rejection codes; never persist `unclassified`.

```ts
export type ValidatedRadarBatch = {
  runId: string;
  planFingerprint: string;
  executedQueries: readonly ValidatedExecutedQuery[];
  signals: readonly ValidatedRadarSignal[];
  sourceErrors: readonly SafeSourceError[];
  rejections: Readonly<Record<RadarRejectionReason, number>>;
  canonicalSubmissionHash: string;
};

export function validateGlobalRadarBatch(
  batch: GlobalRadarBatch,
  context: RadarValidationContext,
): ValidatedRadarBatch;
```

The canonical hash uses the fully normalized, server-recomputed representation, stable key ordering, and version identifiers. Worker-provided composite scores, fingerprints, classifications, and India labels are proposals only.

- [ ] **Step 3: RED/GREEN stage independence and refusal cases**

Test every stage without network/database imports. Prove weak evidence, generic marketing, unsupported India claims, missing systems context for qualifying records, invalid response paths, and insufficient momentum become bounded rejections. Valid records keep unknowns as null and retain field provenance.

- [ ] **Step 4: Run and commit**

```bash
npx vitest run tests/global-radar-evidence.test.ts tests/global-radar-validation-pipeline.test.ts
npm run typecheck
git diff --check
git add app/domain/global-radar tests/global-radar-evidence.test.ts tests/global-radar-validation-pipeline.test.ts
git commit -m "feat: validate global radar batches"
```

### Task 13: Implement Radar run and admin application services

**Files:**
- Create: `app/server/global-radar/dto.ts`
- Create: `app/server/global-radar/run-service.ts`
- Create: `app/server/global-radar/admin-service.ts`
- Create: `app/server/global-radar/promotion-service.ts`
- Create: `app/server/global-radar/index.ts`
- Test: `tests/global-radar-dto.test.ts`
- Test: `tests/global-radar-run-service.test.ts`
- Test: `tests/global-radar-admin-service.test.ts`
- Test: `tests/global-radar-promotion-service.test.ts`

- [ ] **Step 1: RED/GREEN explicit safe DTO serializers**

Define separate allowlists for signal-list, signal-detail, watchlist, promotion, and run DTOs. Detail maps exactly the twenty approved sections and may include bounded authenticated-admin notes. List/run/worker/member DTOs must omit notes. Test that recursive source objects containing `workerSecret`, lease/submission hashes, raw metadata/payloads, rejected bodies, full page text, SQL/private failures, prompt internals, and claim paths cannot appear in serialized output.

- [ ] **Step 2: RED/GREEN run queue and claim orchestration**

Create the service from injected clock, randomness, config, admin allowlist, repository, and validation functions. `claim` accepts worker-authenticated `trigger: scheduled | trial` (default scheduled) and `scanMode: daily | thematic | watchlist_refresh` (default daily); it never accepts manual. It first claims already queued manual work, otherwise queues/claims the deterministic scheduled/trial plan. Thematic mode selects the configured ISO-week theme. The response includes only the raw lease, versions, immutable plan/queries, redacted config, and provider-neutral output schema.

- [ ] **Step 3: RED/GREEN completion/fail/abandon outcomes**

Authenticate before validation, require route/body run identity, run the server pipeline, and pass only `ValidatedRadarBatch` to the repository. Map `completed`, `replayed`, lease/terminal/hash conflicts, honest zero, partial, fail, and abandon to stable service results. Submit has no network call in service code. Abandon requires explicit run ID and safe reason, not a lease artifact.

- [ ] **Step 4: RED/GREEN administrator authorization and reads**

Every admin method normalizes the session email and rechecks the `ADMIN_EMAILS` allowlist; page-level checks are not authoritative. Test signed-out, non-admin, and admin behavior for class summaries, detail, watchlist, runs, and filter validation. Return `not_found`, `forbidden`, `invalid`, or safe results without leaking repository rows.

- [ ] **Step 5: RED/GREEN admin mutations and conflicts**

Drive review transitions, classification/expiry/no-fit edits, evidence, notes, merge, watchlist, promotion, reversal, and manual queueing. Manual queue input requires a client-generated UUID `requestId` plus an optional approved theme and no raw configuration overrides; the stored scan mode is always `manual`, using the normal daily mix when no theme is selected. Actor comes from the session. On revision conflicts return HTTP-ready 409 semantics plus the latest safe DTO.

- [ ] **Step 6: RED/GREEN promotion eligibility at the application boundary**

Recompute all four eligibility paths from current repository data; do not trust client-provided supporting counts or scores. Test qualified primary requirements, selected supporting IDs, rationale, actor, expected revisions, idempotency, safe conflict/failure mapping, and reversal.

- [ ] **Step 7: Compose without client-bound imports and commit**

`app/server/global-radar/index.ts` wires concrete repositories/config only at the edge and follows the existing Cloudflare versus Node caching rule. Domain and client modules must not import this composition root.

```bash
npx vitest run tests/global-radar-dto.test.ts tests/global-radar-run-service.test.ts tests/global-radar-admin-service.test.ts tests/global-radar-promotion-service.test.ts
npm run typecheck
git diff --check
git add app/server/global-radar tests/global-radar-dto.test.ts tests/global-radar-run-service.test.ts tests/global-radar-admin-service.test.ts tests/global-radar-promotion-service.test.ts
git commit -m "feat: orchestrate global radar workflows"
```

### Task 14: Add worker and administrator HTTP boundaries

**Files:**
- Create: `app/server/global-radar/route.ts`
- Create: `app/api/global-radar/worker/claim/route.ts`
- Create: `app/api/global-radar/worker/runs/[runId]/complete/route.ts`
- Create: `app/api/global-radar/worker/runs/[runId]/fail/route.ts`
- Create: `app/api/global-radar/worker/runs/[runId]/abandon/route.ts`
- Create: `app/api/admin/global-demand-radar/runs/route.ts`
- Create: `app/api/admin/global-demand-radar/signals/[signalId]/route.ts`
- Create: `app/api/admin/global-demand-radar/signals/[signalId]/evidence/route.ts`
- Create: `app/api/admin/global-demand-radar/signals/[signalId]/notes/route.ts`
- Create: `app/api/admin/global-demand-radar/signals/[signalId]/merge/route.ts`
- Create: `app/api/admin/global-demand-radar/entities/[entityId]/watchlist/route.ts`
- Create: `app/api/admin/global-demand-radar/entities/[entityId]/promotions/route.ts`
- Create: `app/api/admin/global-demand-radar/entities/[entityId]/promotions/reverse/route.ts`
- Test: `tests/global-radar-worker-routes.test.ts`
- Test: `tests/global-radar-admin-routes.test.ts`

- [ ] **Step 1: RED/GREEN the worker boundary before bodies**

Authenticate the Radar bearer before reading a request body, require JSON, stream/limit complete bodies to 2 MiB, reject declared or actual oversize, validate UUID path/body agreement, and map service outcomes to bounded JSON. Discovery credentials must fail every Radar route and Radar credentials must fail Discovery routes.

- [ ] **Step 2: RED/GREEN worker endpoints**

Claim accepts only the locked trigger/scan-mode object. Complete requires the lease header/body and strict batch. Fail requires the lease and safe message. Abandon uses the Radar bearer, explicit route run ID, and safe message but no lease. Test 200 replay, 400 validation, 401 auth, 409 conflict, 413 size, and safe 500 responses.

- [ ] **Step 3: RED/GREEN admin request security**

For every mutation, enforce same-origin before body parsing, exact JSON content type, a 64 KiB declared-and-streamed body limit, strict command schema, current session, service-owned admin authorization, and actor derivation from session. The signal detail route supports GET plus the discriminated PATCH; runs supports safe GET plus POST. Intent-specific routes do not accept generic action names.

- [ ] **Step 4: RED/GREEN safe conflict responses and no-store**

Return HTTP 409 with latest allowlisted DTO when available. Add `Cache-Control: no-store` to admin/worker responses. Assert no route response contains a secret, lease hash, submission hash, raw payload, full source content, private exception, or note outside authenticated detail.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run tests/global-radar-worker-routes.test.ts tests/global-radar-admin-routes.test.ts tests/discovery-routes.test.ts
npm run typecheck
git diff --check
git add app/server/global-radar/route.ts app/api/global-radar app/api/admin/global-demand-radar tests/global-radar-worker-routes.test.ts tests/global-radar-admin-routes.test.ts
git commit -m "feat: expose global radar APIs"
```

### Task 15: Ship safe worker commands and operations documentation

**Files:**
- Create: `scripts/global-radar-worker.ts`
- Create: `scripts/global-radar-worker-timeout.ts`
- Modify: `package.json`
- Create: `docs/global-demand-radar-operations.md`
- Modify: `README.md`
- Test: `tests/global-radar-worker-cli.test.ts`
- Test: `tests/global-radar-worker-timeout.test.ts`

- [ ] **Step 1: RED/GREEN command parsing**

Add exactly `global-radar:claim`, `validate`, `submit`, `fail`, and `abandon`. Claim accepts optional `--trigger scheduled|trial` and `--scan-mode daily|thematic|watchlist_refresh`; defaults are scheduled/daily. Validate requires `--file`. Submit/fail require `--claim-file`; abandon requires `--run-id` and rejects claim/lease options. Unknown, duplicate, missing, or cross-command options fail safely.

- [ ] **Step 2: RED/GREEN private claim artifacts and exact bytes**

Claim creates a `0700` temporary directory and `0600` claim JSON. Print only run ID, plan/version/count summary, and claim-file path; never the raw lease or secret. Validate reads at most 2 MiB and reports bounded schema issues. Submit reads the claim and validated batch once and transmits the exact file bytes so unknown-success recovery can replay the same file.

- [ ] **Step 3: RED/GREEN timeout and failure behavior**

Use 120 seconds only for submit and 30 seconds for claim/fail/abandon. Preserve error class/reason without printing response bodies, source content, tokens, or rejected documents. Test network abort, non-JSON response, oversized file, malformed claim, wrong run ID, replay, and safe stdout/stderr.

- [ ] **Step 4: Write the runbook without creating automation**

Document configuration, source/evidence rules, exact commands, private-file handling, validate-before-submit, exact-file retry after unknown success, fail versus orphan abandon, manual admin runs, zero/partial behavior, and provider-swap contract. Document—but do not create—the proposed schedules: daily 10:30 Asia/Kolkata; weekly thematic Sunday 11:30; India Discovery remains at 08:30.

- [ ] **Step 5: Run and commit**

```bash
npx vitest run tests/global-radar-worker-cli.test.ts tests/global-radar-worker-timeout.test.ts
npm run global-radar:validate -- --file tests/fixtures/global-radar-valid-batch.json
npm run typecheck
git diff --check
git add scripts/global-radar-worker.ts scripts/global-radar-worker-timeout.ts package.json docs/global-demand-radar-operations.md README.md tests/global-radar-worker-cli.test.ts tests/global-radar-worker-timeout.test.ts tests/fixtures/global-radar-valid-batch.json
git commit -m "feat: operate global radar worker"
```

The validation fixture in this task is a minimal reserved-domain worker batch, not one of the six illustrative UI records and never enters seed/runtime code.

### Task 16: Introduce one shared administrator shell

**Files:**
- Create: `app/components/product/AdminShell.tsx`
- Modify: `app/components/product/ProductShell.tsx`
- Modify: `app/components/product/product.module.css`
- Modify: `app/admin/verifications/page.tsx`
- Modify: `app/admin/opportunity-briefs/page.tsx`
- Modify: `app/admin/discovery/page.tsx`
- Create: `tests/admin-shell.test.tsx`
- Modify: `tests/verification-queue.test.tsx`
- Modify: `tests/opportunity-brief-admin-page.test.tsx`
- Modify: `tests/discovery-page.test.tsx`
- Modify: `tests/navigation.test.tsx`

- [ ] **Step 1: RED/GREEN the single ordered admin navigation source**

Create `AdminShell` with exact destinations, in order: Verification Queue, Opportunity Briefs, India Discovery, Global Demand Radar. Accept an explicit current destination and emit `aria-current="page"`. Keep the navigation inside authenticated product chrome and out of `SiteHeader`.

```tsx
<AdminShell current="global-demand-radar" eyebrow="Global intelligence" title="Global Demand Radar">
  {children}
</AdminShell>
```

- [ ] **Step 2: Migrate existing pages without behavior changes**

Move Verification, Opportunity Briefs, and Discovery from page-local `headerLinks` to `AdminShell`. Test their titles/content/auth behavior and current navigation state before and after. `ProductShell` remains usable for member pages.

- [ ] **Step 3: RED/GREEN responsive/focus behavior**

At 320 px, the admin header wraps without page overflow; links and logout remain at least 44 px in the mobile contract; focus is visible. Do not add Radar to public navigation or offline cache assets.

- [ ] **Step 4: Run and commit**

```bash
npx vitest run tests/admin-shell.test.tsx tests/verification-queue.test.tsx tests/opportunity-brief-admin-page.test.tsx tests/discovery-page.test.tsx tests/navigation.test.tsx
npm run typecheck
git diff --check
git add app/components/product/AdminShell.tsx app/components/product/ProductShell.tsx app/components/product/product.module.css app/admin/verifications/page.tsx app/admin/opportunity-briefs/page.tsx app/admin/discovery/page.tsx tests/admin-shell.test.tsx tests/verification-queue.test.tsx tests/opportunity-brief-admin-page.test.tsx tests/discovery-page.test.tsx tests/navigation.test.tsx
git commit -m "feat: unify administrator navigation"
```

### Task 17: Build the five-tab Radar administrator surface

**Files:**
- Create: `app/components/global-radar/types.ts`
- Create: `app/components/global-radar/GlobalRadarTabs.tsx`
- Create: `app/components/global-radar/GlobalRadarMetrics.tsx`
- Create: `app/components/global-radar/GlobalRadarSignalList.tsx`
- Create: `app/components/global-radar/GlobalRadarWatchlist.tsx`
- Create: `app/components/global-radar/GlobalRadarRuns.tsx`
- Create: `app/components/global-radar/global-radar.module.css`
- Create: `app/admin/global-demand-radar/page.tsx`
- Create: `app/admin/global-demand-radar/signal-list-page.tsx`
- Create: `app/admin/global-demand-radar/direct-demand/page.tsx`
- Create: `app/admin/global-demand-radar/demand-precursors/page.tsx`
- Create: `app/admin/global-demand-radar/momentum/page.tsx`
- Create: `app/admin/global-demand-radar/watchlist/page.tsx`
- Create: `app/admin/global-demand-radar/runs/page.tsx`
- Test: `tests/global-radar-pages.test.tsx`
- Test: `tests/global-radar-signal-list.test.tsx`
- Test: `tests/global-radar-watchlist.test.tsx`
- Test: `tests/global-radar-runs-ui.test.tsx`

- [ ] **Step 1: RED/GREEN root redirect and exact tabs**

Redirect `/admin/global-demand-radar` to `/admin/global-demand-radar/direct-demand`. Render five links in exact approved order and paths with one `aria-current="page"`. Treat every nested Radar page as current Global Demand Radar in `AdminShell`. The destination page performs session/admin authorization: signed out -> `/login`; authenticated non-admin -> `/dashboard`.

- [ ] **Step 2: Keep client props safe and server-owned**

Define UI-only DTO types in `app/components/global-radar/types.ts`; client components must not import `app/server`, `db`, repositories, environment, or session modules. The shared server list adapter validates GET filters, calls the authorized service, serializes safe DTOs, and supplies the active class explicitly.

- [ ] **Step 3: RED/GREEN class metrics, filters, lists, and empty states**

Render class-appropriate semantic `<dl>` metrics and a labelled `role="search"` GET form. Preserve approved filters through stable pagination. Render a semantic desktop table and complete cards below 900 px. Each item builds `/admin/global-demand-radar/signals/${signal.id}?returnTo=${encodeURIComponent(validatedListPath)}` from the safe DTO and validated internal list path. Distinguish an honest empty Radar from “no results for these filters”; never inject fictional data.

- [ ] **Step 4: RED/GREEN Watchlist**

Render entity, latest signal, monitoring state, priority/cadence, next scan, expiry, and promotion state. Send revision-bearing PATCH commands for enable/pause/disable/edit; “remove” means disable. Disable controls while pending, announce success with `role="status"`, and errors/conflicts with `role="alert"`; refresh from returned safe DTO.

- [ ] **Step 5: RED/GREEN Radar Runs**

Render only safe status, triggers/modes, counts, timestamps, source-error count, and bounded notices. Manual queue form submits a client UUID and optional approved theme; the service owns `scanMode: "manual"` and the remaining configuration. It must not expose worker claim, lease, payload, or retry controls.

- [ ] **Step 6: RED/GREEN responsive and accessible tabs**

Use a labelled, keyboard-scrollable, visibly focused contained tab rail. At `max-width: 767px`, use safe-area gutters, stacked full-width controls, 44 px targets, safe long-value wrapping, and no document overflow. Status/compliance include text or icons with accessible labels, never color alone.

- [ ] **Step 7: Run and commit**

```bash
npx vitest run tests/global-radar-pages.test.tsx tests/global-radar-signal-list.test.tsx tests/global-radar-watchlist.test.tsx tests/global-radar-runs-ui.test.tsx
npm run typecheck
git diff --check
git add app/components/global-radar app/admin/global-demand-radar tests/global-radar-pages.test.tsx tests/global-radar-signal-list.test.tsx tests/global-radar-watchlist.test.tsx tests/global-radar-runs-ui.test.tsx
git commit -m "feat: add global radar admin tabs"
```

### Task 18: Build full signal detail and review actions

**Files:**
- Create: `app/admin/global-demand-radar/signals/[signalId]/page.tsx`
- Create: `app/components/global-radar/GlobalRadarSignalDetail.tsx`
- Create: `app/components/global-radar/GlobalRadarActions.tsx`
- Create: `app/components/global-radar/GlobalRadarPromotionActions.tsx`
- Modify: `app/components/global-radar/global-radar.module.css`
- Test: `tests/global-radar-signal-detail.test.tsx`
- Test: `tests/global-radar-signal-actions.test.tsx`

- [ ] **Step 1: RED/GREEN authorization, identity, and safe return context**

Validate `signalId` as UUID and accept `returnTo` only when it is a same-origin path under `/admin/global-demand-radar/`; otherwise return to the active class tab. Signed-out/non-admin behavior matches the tab pages. Not-found content reveals no row details.

- [ ] **Step 2: RED/GREEN the exact twenty-section document**

Render these headings in exact DOM order: Organisation; What changed; Signal class; Publicly supported facts; Mewtuals interpretation; Required capabilities; Physical-data or hardware specifications; Target environments and tasks; Indian execution archetypes; India-fit reasoning and constraints; Systems-context explanation; Scale and timeline; Public response path; Compliance flags; Supporting evidence; Original-language source; English summary; Score rationale; Signal history; Admin notes and actions.

Test that facts, inference, translation, and score rationale have separate semantic containers. Original text uses DTO-provided `lang` and validated `dir`; English summary uses `lang="en"`. Long Chinese text and URLs wrap. Evidence links use `rel="noreferrer"`. A response path is evidence-only and never labelled or wired as outreach.

- [ ] **Step 3: RED/GREEN service-provided allowed actions**

Render controls from `allowedActions` in the safe detail DTO rather than duplicating transition/eligibility policy in React. Cover qualify, monitor, dismiss, reopen, no India fit, classification, expiry, append evidence, append note, merge, add/pause/disable watchlist, promote, and reverse. Every command sends current revision, reason where required, and idempotency key where relevant.

- [ ] **Step 4: RED/GREEN mutation feedback and revision conflicts**

Pending controls cannot double-submit. Success uses `role="status"`; validation/server errors use `role="alert"`. On 409, display that the record changed, replace local safe state with the latest DTO, and provide a focused review/retry path. Never render raw server response bodies.

- [ ] **Step 5: RED/GREEN destructive-looking confirmations without deletion**

Merge and promotion reversal require explicit confirmation copy describing preserved history. Merging never exposes delete semantics. Promotion UI requires the selected primary/supporting signals, eligibility path, and reason. Reversal explains that the Discovery candidate remains intact.

- [ ] **Step 6: Run and commit**

```bash
npx vitest run tests/global-radar-signal-detail.test.tsx tests/global-radar-signal-actions.test.tsx
npm run typecheck
git diff --check
git add app/admin/global-demand-radar/signals app/components/global-radar tests/global-radar-signal-detail.test.tsx tests/global-radar-signal-actions.test.tsx
git commit -m "feat: review global radar signals"
```

### Task 19: Add fictional fixtures, acceptance coverage, and privacy/browser proof

**Files:**
- Create: `tests/fixtures/global-radar-fictional.ts`
- Create: `tests/support/global-radar-test-data.ts`
- Create: `docs/global-demand-radar-fictional-examples.md`
- Create: `tests/global-radar-fictional-fixtures.test.ts`
- Create: `tests/global-radar.acceptance.integration.test.ts`
- Create: `tests/e2e/global-radar.spec.ts`
- Modify: `tests/responsive-contract.test.ts`
- Modify: `tests/pwa.test.tsx`
- Modify: `tests/e2e/mobile-pwa.spec.ts`
- Modify: `tests/e2e/product-v1.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Build six labelled, non-production examples**

Represent each fixture as `{ fictionalExample: true, input: validRadarFixture }`: the inner `input` value validates; passing the wrapper to any production batch/repository schema fails for its unknown marker. Use reserved `.example` domains and fictional UUIDs. Cover the six approved cases and document why each class/India/translation/momentum gate passes or does not.

No production module may import `tests/fixtures/global-radar-fictional.ts`. Component tests may render it only with the visible label `Fictional example — not a live radar signal.` and disabled mutations. Assert live empty/list/detail/metrics never mix in fixtures.

- [ ] **Step 2: RED/GREEN the full DB-backed lifecycle**

In acceptance tests, run queue -> claim -> submit -> list -> detail -> review -> watchlist -> promote -> reverse against PostgreSQL. Cover partial and honest-zero runs, exact replay with row counts unchanged, revision conflict with latest DTO, append-only notes/evidence, merge preservation, expiry, momentum, and source isolation.

- [ ] **Step 3: Prove India Discovery remains operational**

Run a Discovery scheduled claim while Radar is running and vice versa. Assert Discovery's worker secret/routes/commands, prompt/config, India daily identity, candidate rules, and manual/scheduled/trial claims are unchanged; `radar_promotion` intake is terminal/non-claimable and excluded from India coverage/run scheduling metrics. Verify existing candidates and statuses survive promotion dedupe/reversal.

- [ ] **Step 4: RED/GREEN public-only PWA privacy**

The current worker should need no production cache change. Assert `/api/global-radar/*` and `/api/admin/global-demand-radar/*` are never intercepted/cached; Radar admin navigation offline renders the public fallback headed exactly `Get online to see your partnerships.`; no Radar page asset/data is added to the public allowlist. If a test exposes a real gap, change only `app/pwa/service-worker-source.ts` and its executable tests.

- [ ] **Step 5: RED/GREEN responsive contract**

Extend source-level CSS contract tests for the contained tab rail, 900 px table/card switch, explicit 767 px mobile boundary, safe-area gutters, 44 px targets, stacked detail actions, overflow prevention, and long text wrapping.

- [ ] **Step 6: Exercise the browser at 320, 390, 767, and 1440 px**

Use the existing authenticated E2E setup and database test-data builder, not production fixtures or an insecure dev API. Cover all five URLs/order/current state, GET filters/pagination/empty states, twenty headings, review/watchlist/manual-run/promotion/reversal feedback, keyboard focus, tab rail, table/card switches, overflow, touch targets, original-language rendering, and offline fallback.

Intercept requests during every Radar action and fail the test if any endpoint, payload, or persistence helper refers to outreach, introductions, email sending, messaging, contact tasks, or member matching. Expected requests are only the approved Radar admin endpoints.

- [ ] **Step 7: Wire scripts, run, and commit**

Add Radar acceptance to `test:acceptance`, the two Radar DB files to `test:db`, exclude them from `test:unit`, and add `tests/e2e/global-radar.spec.ts` to `test:e2e`.

```bash
npx vitest run tests/global-radar-fictional-fixtures.test.ts tests/responsive-contract.test.ts tests/pwa.test.tsx
npm run db:test:prepare
DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test SESSION_SECRET=integration-session-secret-that-is-longer-than-32-characters npx vitest run --no-file-parallelism tests/global-radar.acceptance.integration.test.ts
npx playwright test tests/e2e/global-radar.spec.ts tests/e2e/mobile-pwa.spec.ts
git diff --check
git add tests docs/global-demand-radar-fictional-examples.md package.json app/pwa/service-worker-source.ts
git commit -m "test: verify global radar journeys"
```

Only include `app/pwa/service-worker-source.ts` in the commit if the failing executable contract required a real change.

### Task 20: Run the complete release gate and independent review

**Files:**
- Modify only files required by verified failures or actionable review findings.

- [ ] **Step 1: Review scope and forbidden side effects**

Inspect `git diff --stat`, `git diff`, and `git status --short`. Confirm no environment files, credentials, claim artifacts, dumps, browser profiles, traces, screenshots, coverage, build output, full fetched pages, production fixtures, automation changes, deployment changes, or outreach behavior are tracked.

- [ ] **Step 2: Run the exact complete release gate**

```bash
npm test
npm run test:db
npm run test:migrations
npm run test:acceptance
npm run test:e2e
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0. Save concise command/count evidence in the final handoff, not generated log files. Because this is an authenticated multi-route Sites project with existing PostgreSQL architecture, preserve `.openai/hosting.json` and the current Vinext/Cloudflare build; do not add D1/R2, replace auth, regenerate public social metadata, or publish.

- [ ] **Step 3: Run an independent code review**

Invoke `superpowers:requesting-code-review` with the approved design, this plan, and the full branch diff. Resolve every blocking correctness/security/data/privacy finding with a focused RED/GREEN cycle and rerun the affected test. Re-review until approved.

- [ ] **Step 4: Verify before claiming completion**

Invoke `superpowers:verification-before-completion`, rerun any stale or affected gate, and confirm the final worktree contains only intended changes. Do not call the subsystem complete from partial or historical test output.

- [ ] **Step 5: Commit final review fixes if needed**

Stage the explicit paths shown by `git diff --name-only`, then run
`git commit -m "fix: close global radar review findings"`. Skip this commit when
review required no changes.

- [ ] **Step 6: Prepare the durable handoff**

List the migration; eleven tables and major fields; enum/taxonomy/version contracts; eleven workflow stages; Codex adapter and query policy; formulas/gates; worker/admin routes; commands/environment; five tabs/detail/actions; tests and exact gate results; proposed schedules; and explicit proof that India Discovery still claims and persists independently. State plainly that no production migration, deployment, automation, outreach, or real Radar data was created.
