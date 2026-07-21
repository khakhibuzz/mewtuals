# Mewtuals Discovery Agent V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the Codex-worker Discovery Agent, persist its first source-supported India candidate batch in Neon, and deliver an administrator dashboard for reviewing the resulting network.

**Architecture:** Keep discovery policy and normalization in framework-free domain code, orchestration in a focused discovery service, and all PostgreSQL operations in a repository. Codex runs outside the web app as a scheduled worker that claims a leased run and submits the provider-neutral `DiscoveryBatch`; the existing Vinext admin app remains the durable control plane and Neon/PostgreSQL remains authoritative.

**Tech Stack:** Vinext/React 19, TypeScript, PostgreSQL/Neon, Drizzle ORM, Postgres.js, Zod, Vitest, Testing Library, Sites, Codex Scheduled tasks.

## Execution rule: one behavior per RED/GREEN cycle

Each numbered test step below is a sequence of 2–5 minute micro-cycles, not one
large implementation jump. For every listed behavior, add one focused test,
run the exact focused command and observe the named assertion/module failure,
add only enough implementation to pass that test, rerun it GREEN, and then move
to the next behavior. Commit only after every micro-cycle in the task is green.
Do not write an entire test file before the first RED and do not write production
code for a later bullet while an earlier bullet is still red.

---

## File Structure

- `app/domain/discovery.ts` — candidate vocabulary, normalization, identity keys, batch schemas, filters, and allocation rules.
- `app/server/discovery-config.ts` — environment-backed discovery configuration and redacted worker-facing configuration.
- `app/server/discovery-service.ts` — run claiming, leases, completion/failure, admin listing, queueing, and candidate status use cases.
- `app/server/discovery-worker-auth.ts` — constant-time bearer and lease-token hashing helpers.
- `app/server/discovery-route.ts` — thin worker/admin request adapters with same-origin/session rules.
- `app/server/discovery.ts` — production composition root for repository, configuration, and services.
- `db/schema.ts` — discovery enums and four persistent discovery tables.
- `db/types.ts` — inferred discovery row/insert types.
- `db/repositories/discovery-repository.ts` — transactional claims, dedupe, identity/evidence upserts, list queries, and status changes.
- `app/api/discovery/worker/**` — secret-protected claim/complete/fail endpoints.
- `app/api/admin/discovery/**` — administrator queue/status endpoints.
- `app/admin/discovery/page.tsx` — server-owned filtered admin page.
- `app/components/product/DiscoveryDashboard.tsx` — summary, filters, candidate table, detail drawer, status mutations, and run state.
- `app/components/product/product.module.css` — scoped discovery dashboard styles using the existing visual system.
- `scripts/discovery-worker.ts` — local claim/validate/submit/fail commands that reuse the authoritative Zod batch schema.
- `docs/discovery-agent-operations.md` — environment, prompt, schedule, runbook, migration, failure recovery, and provider-swap instructions.
- `tests/discovery-*.test.*` — domain, configuration, service, routes, UI, and worker CLI unit tests.
- `tests/db.integration.test.ts` — repository persistence, concurrency, dedupe, identity, evidence, and replay coverage.
- `drizzle/0004_*.sql` plus metadata — ordered discovery schema migration.

### Task 1: Discovery domain and configuration contract

**Files:**
- Create: `app/domain/discovery.ts`
- Create: `app/server/discovery-config.ts`
- Modify: `app/server/env.ts`
- Modify: `.env.example`
- Modify: `.dev.vars.example`
- Test: `tests/discovery-domain.test.ts`
- Test: `tests/discovery-config.test.ts`

- [ ] **Step 1: RED/GREEN URL and name normalization micro-cycles**

In `tests/discovery-domain.test.ts`, add one test at a time for trimmed/collapsed
names; lower-cased hosts; preserved case-sensitive paths; removed `www`,
fragments, default ports, and tracking parameters; sorted retained parameters;
and rejected non-HTTP(S), private/loopback, search-result, and article-only
canonical URLs. After each test run
`npx vitest run tests/discovery-domain.test.ts -t '<test name>'`; expect first
`ERR_MODULE_NOT_FOUND` and then the named assertion to fail before the minimal
helper makes it pass.

Desired public API:

```ts
export const candidateTypes = ["company", "creator"] as const;
export const candidateStatuses = [
  "discovered",
  "shortlisted",
  "rejected",
  "queued_for_profile",
] as const;

export const discoveryCandidateInputSchema = z.object({
  type: z.enum(candidateTypes),
  name: z.string().trim().min(1).max(200),
  canonicalUrl: publicUrlSchema,
  websiteUrl: publicUrlSchema.nullish(),
  primarySocialUrl: publicUrlSchema.nullish(),
  linkedinUrl: publicUrlSchema.nullish(),
  discoveredDescription: z.string().trim().min(1).max(1_000),
  category: z.string().trim().min(1).max(100),
  subcategory: z.string().trim().max(100).nullish(),
  geography: z.string().trim().min(1).max(100),
  sourceName: z.string().trim().min(1).max(100),
  sourceUrl: publicUrlSchema,
  discoveryScore: z.number().int().min(0).max(100),
  rawMetadata: rawMetadataSchema.default({}),
});

export function normalizeDiscoveryUrl(value: string): string;
export function candidateIdentifiers(input: DiscoveryCandidateInput): CandidateIdentifier[];
export function allocateCandidates(total: number, companyPercentage: number): {
  companies: number;
  creators: number;
};
```

- [ ] **Step 2: RED/GREEN identity and allocation micro-cycles**

Add one test at a time for company identity priority (website host, LinkedIn,
stable social/directory), creator identity priority (stable primary profile,
LinkedIn, website host), immutable canonical identifier ordering, and allocation
rounding at 1, 19, 20, and 21 candidates. Use the same single-test Vitest
command; expect an undefined export or value mismatch before each implementation.

- [ ] **Step 3: RED/GREEN bounded batch-schema micro-cycles**

Add one test at a time for every accepted enum, score 0–100, description/category
lengths, maximum 50 candidates, maximum 20 source errors, and these hard limits:
`rawMetadata` has at most 20 keys, keys are at most 64 characters, JSON depth is
at most 3, serialized metadata is at most 8 KiB per candidate, serialized batch
is at most 512 KiB, and every URL is public HTTP(S). Replace the illustrative
unbounded `z.record` above with a bounded `rawMetadataSchema` plus a batch
`superRefine` that emits stable issue messages. Each invalid fixture must fail
before the matching bound is implemented and pass afterward.

- [ ] **Step 4: RED/GREEN configuration micro-cycles**

In `tests/discovery-config.test.ts`, add and pass one test at a time for approved
defaults (India, categories from the spec, 20 candidates, 50% companies),
comma-separated overrides, integer/percentage bounds, required worker secret in
production, and a redacted public worker configuration that never includes the
secret. Run `npx vitest run tests/discovery-config.test.ts -t '<test name>'` for
each RED/GREEN cycle. Keep network, framework, environment reads, and database
imports out of `app/domain/discovery.ts`.

- [ ] **Step 5: Run focused tests GREEN and refactor names**

Run: `npx vitest run tests/discovery-domain.test.ts tests/discovery-config.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 6: Commit**

```bash
git add app/domain/discovery.ts app/server/discovery-config.ts app/server/env.ts .env.example .dev.vars.example tests/discovery-domain.test.ts tests/discovery-config.test.ts
git commit -m "feat: define discovery contracts"
```

### Task 2: PostgreSQL schema and repository persistence

**Files:**
- Modify: `db/schema.ts`
- Modify: `db/types.ts`
- Create: `db/repositories/discovery-repository.ts`
- Modify: `tests/schema.test.ts`
- Modify: `tests/db.integration.test.ts`
- Create: `scripts/test-discovery-migrations.mjs`
- Modify: `package.json`
- Create: generated `drizzle/0004_*.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: generated `drizzle/meta/0004_snapshot.json`

- [ ] **Step 1: RED/GREEN enum and table schema micro-cycles**

Add one schema assertion at a time for each enum and then each of
`discovery_runs`, `discovery_candidates`, `discovery_candidate_identifiers`, and
`discovery_candidate_sources`. Run
`npx vitest run tests/schema.test.ts -t '<test name>'`; expect a missing export
or named constraint mismatch before adding the minimal Drizzle declaration.
Continue one assertion at a time for UUID ids, timestamps, confidence check,
foreign keys, unique external run key, unique candidate canonical key, unique
identifier ownership, unique source evidence, and filtering indexes.
Add a partial unique index on the constant expression `(true)` where
`status = 'running'`; it is the database backstop that permits at most one
active discovery run globally even if two claim transactions race.

- [ ] **Step 2: Add inferred types after the schema is GREEN**

Define:

```ts
export const discoveryCandidateTypeEnum = pgEnum("discovery_candidate_type", ["company", "creator"]);
export const discoveryCandidateStatusEnum = pgEnum("discovery_candidate_status", ["discovered", "shortlisted", "rejected", "queued_for_profile"]);
export const discoveryRunStatusEnum = pgEnum("discovery_run_status", ["queued", "running", "succeeded", "partial", "failed"]);
export const discoveryRunTriggerEnum = pgEnum("discovery_run_trigger", ["scheduled", "manual", "trial"]);
export const discoveryRunCandidateTypeEnum = pgEnum("discovery_run_candidate_type", ["company", "creator", "both"]);
export const discoveryIdentifierKindEnum = pgEnum("discovery_identifier_kind", ["canonical", "website_host", "social_url", "linkedin_url"]);
```

Use JSONB for bounded metadata/error summaries, `text[]` for sources, a
submission hash, lease-token hash/expiry, and the indexes required by the spec.

- [ ] **Step 3: Generate and inspect the ordered migration**

Run: `npm run db:generate`

Expected: one new `0004_*.sql` migration and matching metadata. Inspect the SQL
for all enum/table/check/index/foreign-key constraints; edit schema and
regenerate if it is incomplete rather than hand-editing generated metadata.
Assert `_journal.json` contains exactly one new ordered entry whose tag matches
the migration filename and whose snapshot parent matches `0003`.

- [ ] **Step 4: Implement and run an exact fresh/upgrade migration harness**

Create `scripts/test-discovery-migrations.mjs` with literal allowlisted database
names `mewtuals_discovery_fresh_test` and `mewtuals_discovery_upgrade_test`.
Connect first to `postgresql://127.0.0.1:55432/postgres`, reject any database
name outside those two constants, terminate only connections to those names,
and create them. Fresh path: run the committed migrator against the full
`drizzle/` folder. Upgrade path: create a `mkdtemp` folder, copy migrations
`0000`–`0003` plus a filtered journal, migrate, insert representative existing
users/profiles/verifications, then run the full committed migrator. Query
`information_schema`, the Drizzle journal, and fixture rows in both databases.
Expected: `0004` appears exactly once, all four tables/constraints/partial index
exist, and existing rows are unchanged. In `finally`, terminate and drop only
the two literal databases and remove only the created temp folder. Add
`"test:migrations": "npm run db:start && node scripts/test-discovery-migrations.mjs"`
and run it twice to prove cleanup/idempotency.

- [ ] **Step 5: Run schema tests GREEN**

Run: `npx vitest run tests/schema.test.ts`

Expected: PASS.

- [ ] **Step 6: Prepare the test database before the first repository RED**

Run: `npm run db:test:prepare && DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run tests/db.integration.test.ts`

Expected: existing integration tests pass before discovery assertions are added.

- [ ] **Step 7: RED/GREEN run queue and lease repository micro-cycles**

Add one integration test and minimal repository method at a time for queueing,
one claimant winning with `FOR UPDATE SKIP LOCKED`, active-lease refusal, and
stale-lease recovery. Run
`DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run tests/db.integration.test.ts -t '<test name>'`;
expect missing-method or assertion failure before each implementation.
Include a real concurrent test with two queued rows and two independent database
connections claiming simultaneously. Assert exactly one becomes `running`, the
other remains queued/null, and the partial-unique-index race is caught and
translated to the normal no-work result rather than leaking a SQL error.

- [ ] **Step 8: RED/GREEN candidate persistence micro-cycles**

Add and pass one test at a time for first insertion, canonical dedupe, alias
dedupe, multi-source evidence, stronger display URL upgrade with immutable
canonical key, identity collision logging, maximum score, and preserved admin
status.

Repository interface:

```ts
export interface DiscoveryRepository {
  queueRun(input: QueueDiscoveryRunInput): Promise<DiscoveryRun>;
  claimRun(input: ClaimDiscoveryRunInput): Promise<ClaimedDiscoveryRun | null>;
  completeRun(input: CompleteDiscoveryRunInput): Promise<DiscoveryRunResult>;
  failRun(input: FailDiscoveryRunInput): Promise<DiscoveryRunResult>;
  getAdminSummary(filters: DiscoveryFilters): Promise<DiscoveryAdminSnapshot>;
  updateCandidateStatus(input: UpdateCandidateStatusInput): Promise<
    | { outcome: "updated"; candidate: DiscoveryCandidate }
    | { outcome: "conflict"; candidate: DiscoveryCandidate }
    | { outcome: "not_found" }
  >;
}
```

- [ ] **Step 9: RED/GREEN replay and count micro-cycles**

Add and pass one test at a time for exact replay, changed replay rejection, and
accurate found/new/duplicate counts. Verify all completion candidate/evidence/
count updates roll back together when the final candidate is invalid.

- [ ] **Step 10: Refactor the completed transactional repository**

Lock claimable rows with `FOR UPDATE SKIP LOCKED`, serialize the daily external
key, use stored identifier rows as the dedupe lookup, and keep the complete-run
candidate/evidence/count updates in one transaction. Never reset a non-
`discovered` status during rediscovery.

- [ ] **Step 11: Run repository integration tests GREEN**

Run: `DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run tests/db.integration.test.ts`

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add db/schema.ts db/types.ts db/repositories/discovery-repository.ts drizzle scripts/test-discovery-migrations.mjs package.json tests/schema.test.ts tests/db.integration.test.ts
git commit -m "feat: persist discovery candidates and runs"
```

### Task 3: Discovery service, leases, and HTTP boundaries

**Files:**
- Create: `app/server/discovery-worker-auth.ts`
- Create: `app/server/discovery-service.ts`
- Create: `app/server/discovery-route.ts`
- Create: `app/server/discovery.ts`
- Create: `app/api/discovery/worker/claim/route.ts`
- Create: `app/api/discovery/worker/runs/[runId]/complete/route.ts`
- Create: `app/api/discovery/worker/runs/[runId]/fail/route.ts`
- Create: `app/api/admin/discovery/runs/route.ts`
- Create: `app/api/admin/discovery/candidates/[candidateId]/route.ts`
- Test: `tests/discovery-service.test.ts`
- Test: `tests/discovery-routes.test.ts`

- [ ] **Step 1: RED/GREEN queue and claim service micro-cycles**

Add one test and minimal method at a time for administrator allowlisting, daily
external-key idempotency, manual priority, trial runs, two-hour leases, opaque
lease hashing, and active-run refusal. Run
`npx vitest run tests/discovery-service.test.ts -t '<test name>'`; expect a
missing export/method or named assertion failure before each implementation.
Use injected repository, clock, and token factory.

- [ ] **Step 2: RED/GREEN completion and failure service micro-cycles**

Add and pass one test at a time for succeeded/partial/failed outcomes, exact
replay, changed replay conflict, invalid lease, filter validation, and redacted
errors. Hash worker and lease tokens with HMAC-SHA256 using server secrets and
compare bearer values with `timingSafeEqual`.

- [ ] **Step 3: RED/GREEN compare-and-update administrator status**

Define `UpdateCandidateStatusInput` with `candidateId`, `status`, and
`expectedUpdatedAt`. Add repository and service tests proving the update uses a
single conditional `WHERE id = ? AND updated_at = ?` mutation, succeeds with the
current timestamp, returns not-found for an unknown id, and returns a typed
conflict with the latest candidate for a stale timestamp. The HTTP PATCH body
uses the same fields and maps stale writes to 409 so concurrent administrators
cannot silently overwrite one another.

- [ ] **Step 4: RED/GREEN worker route boundary micro-cycles**

In `tests/discovery-routes.test.ts`, add one test at a time for missing/wrong
bearer rejection, non-JSON content type, `Content-Length` over 512 KiB, streamed
body exceeding 512 KiB even without `Content-Length`, malformed JSON, mismatched
route/body run ids, invalid batch fields/bounds, lease errors, and success.
Run `npx vitest run tests/discovery-routes.test.ts -t '<test name>'`; expect a
missing adapter or wrong status before each minimal fix. Read at most 512 KiB +
1 byte before parsing and never echo secrets or rejected payloads.

- [ ] **Step 5: RED/GREEN administrator route boundary micro-cycles**

Add and pass one test at a time for administrator session derivation,
same-origin enforcement, non-admin denial, queue success, valid candidate
status compare-and-update, stale 409 response, and invalid filters. Admin
mutations reuse `getCurrentSession`, `assertSameOrigin`, and the existing
administrator actor shape. Route files only compose the production service.

- [ ] **Step 6: Run service and route tests GREEN**

Run: `npx vitest run tests/discovery-service.test.ts tests/discovery-routes.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/server/discovery-worker-auth.ts app/server/discovery-service.ts app/server/discovery-route.ts app/server/discovery.ts app/api/discovery app/api/admin/discovery tests/discovery-service.test.ts tests/discovery-routes.test.ts
git commit -m "feat: add discovery worker protocol"
```

### Task 4: Codex worker commands and runbook

**Files:**
- Create: `scripts/discovery-worker.ts`
- Modify: `package.json`
- Create: `tests/discovery-worker-cli.test.ts`
- Create: `docs/discovery-agent-operations.md`
- Modify: `README.md`

- [ ] **Step 1: RED/GREEN local validation CLI micro-cycles**

Spawn `tsx scripts/discovery-worker.ts` from Vitest. Add one test at a time for
valid batch acceptance; invalid candidate URL/type/score; invalid identity;
metadata depth/key/byte bounds; candidate/source-error/batch-byte bounds; and
malformed JSON. Run
`npx vitest run tests/discovery-worker-cli.test.ts -t '<test name>'`; expect the
missing script first and then a zero/non-zero exit mismatch before each minimal
implementation. Import and execute the same `discoveryBatchSchema` exported by
`app/domain/discovery.ts`; the CLI must never use a weaker envelope-only check.

- [ ] **Step 2: RED/GREEN network command micro-cycles**

Against a temporary local HTTP server, add and pass one test at a time for
claim, explicit trial claim, submit preserving the batch exactly, fail,
non-2xx errors, missing secret/base URL, and secret redaction. Use Node 22
built-ins and the existing local-environment loader; never log bearer or lease
secrets.

Add scripts:

```json
{
  "discovery:claim": "tsx scripts/discovery-worker.ts claim",
  "discovery:validate": "tsx scripts/discovery-worker.ts validate",
  "discovery:submit": "tsx scripts/discovery-worker.ts submit",
  "discovery:fail": "tsx scripts/discovery-worker.ts fail"
}
```

- [ ] **Step 3: Run CLI tests GREEN**

Run: `npx vitest run tests/discovery-worker-cli.test.ts`

Expected: PASS.

- [ ] **Step 4: Document the durable Codex prompt and operations**

Document environment variables, migration, manual queue semantics, local
commands, the exact scheduled-task prompt, 08:30 Asia/Kolkata cadence, source
rules, temporary-file behavior, stale-run recovery, first trial, and the future
provider adapter boundary. Keep the prompt explicit about honest underfill and
public evidence.

- [ ] **Step 5: Commit**

```bash
git add scripts/discovery-worker.ts package.json tests/discovery-worker-cli.test.ts docs/discovery-agent-operations.md README.md
git commit -m "feat: add Codex discovery worker commands"
```

### Task 5: Administrator dashboard service and page

**Files:**
- Create: `app/admin/discovery/page.tsx`
- Create: `app/components/product/DiscoveryDashboard.tsx`
- Modify: `app/components/product/ProductShell.tsx`
- Modify: `app/components/product/product.module.css`
- Test: `tests/discovery-dashboard.test.tsx`
- Test: `tests/discovery-page.test.tsx`

- [ ] **Step 1: RED/GREEN protected server-page micro-cycles**

Add one test and minimal page behavior at a time for login redirect, non-admin
redirect, administrator snapshot loading, each query-string filter, existing
verification-admin navigation, and serialization that excludes secrets, token
hashes, and raw error payloads. Run
`npx vitest run tests/discovery-page.test.tsx -t '<test name>'`; expect a missing
module or assertion failure before each fix. Reuse `getCurrentSession`, the
discovery service, `ProductShell`, and the `/admin/verifications` policy.

- [ ] **Step 2: RED/GREEN dashboard summary and filter micro-cycles**

Add one component test at a time for all six summary/run values, empty states,
candidate columns, semantic wide table, labelled narrow records, accessible
filters, server-navigation query strings, and evidence links. Run
`npx vitest run tests/discovery-dashboard.test.tsx -t '<test name>'` for each
RED/GREEN cycle. Render only known serialized discovery data.

- [ ] **Step 3: RED/GREEN detail-drawer micro-cycles**

Add and pass one test at a time for keyboard-openable details, native dialog
semantics, candidate/source content, Escape close, focus return, and body scroll
restoration on close/unmount. Use visible focus and status announcements.

- [ ] **Step 4: RED/GREEN mutation micro-cycles**

Add and pass one test at a time for queue-run feedback, one in-flight mutation,
shortlisted/rejected/queued actions, PATCH containing the candidate's current
`updatedAt` as `expectedUpdatedAt`, successful returned-version replacement, and
409 conflict recovery that displays the latest server candidate without losing
the administrator's context.

- [ ] **Step 5: Extend existing styles without a second design system**

Add focused summary-grid, filter, table, badge, drawer, and run-list classes.
Keep semantic tables on wide screens and labelled records on narrow screens;
verify the 620px/900px/1180px rules remain coherent.

- [ ] **Step 6: Run UI tests GREEN**

Run: `npx vitest run tests/discovery-page.test.tsx tests/discovery-dashboard.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/admin/discovery/page.tsx app/components/product/DiscoveryDashboard.tsx app/components/product/ProductShell.tsx app/components/product/product.module.css tests/discovery-page.test.tsx tests/discovery-dashboard.test.tsx
git commit -m "feat: add discovery admin dashboard"
```

### Task 6: Complete local integration and acceptance verification

**Files:**
- Modify: `tests/product-v1.acceptance.integration.test.ts` only if discovery
  admin authorization can be added without obscuring the existing member flow
- Create: `tests/discovery.acceptance.integration.test.ts`
- Modify: `package.json`
- Modify: `tests/rendered-html.test.mjs` only if route output needs a stable
  rendered contract

- [ ] **Step 1: Wire the database-only test scripts and prove selection**

Update `test:unit` to exclude `tests/discovery.acceptance.integration.test.ts`.
Update `test:db` and `test:acceptance` to include both existing product and new
discovery acceptance files (with `db:test:prepare` first). Add a package-script
contract assertion or run `npm run test:unit -- --reporter=verbose` and verify
the discovery acceptance filename is absent; then run `npm run test:acceptance
-- --reporter=verbose` and verify it is selected with the test database.

- [ ] **Step 2: RED/GREEN the discovery acceptance journey in slices**

Against PostgreSQL: queue a manual run as admin, claim it as worker, submit a
batch containing a company, creator, and duplicate, verify source evidence and
counts, load filtered admin data, change one status with `expectedUpdatedAt`,
prove a stale second update conflicts, rediscover it, and prove the decision
survives. Add one assertion/use-case call at a time and run the named test after
each RED before adding the minimal wiring needed for GREEN.

- [ ] **Step 3: Run acceptance RED, then fix only integration gaps**

Run: `npm run db:test:prepare && DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run tests/discovery.acceptance.integration.test.ts`

Expected initially: FAIL at the first missing integration contract, then PASS
after minimal wiring fixes.

- [ ] **Step 4: Run all focused discovery tests**

Run: `npx vitest run tests/discovery-domain.test.ts tests/discovery-config.test.ts tests/discovery-service.test.ts tests/discovery-routes.test.ts tests/discovery-worker-cli.test.ts tests/discovery-page.test.tsx tests/discovery-dashboard.test.tsx tests/schema.test.ts`

Expected: PASS.

- [ ] **Step 5: Run the existing complete verification suite**

Run, in order:

```bash
npm test
npm run test:migrations
npm run test:db
npm run test:acceptance
npm run lint
npm run build
git diff --check
```

Expected: all exit zero. Record exact counts. Do not claim the feature complete
from focused tests alone.

- [ ] **Step 6: Start the local app and inspect the actual admin UI**

Prepare local PostgreSQL, create an administrator session fixture through the
existing supported development flow, and start `npm run dev:4000`. Verify at
390x844, near 768px, and 1440x1100: summary, filters, table/stacked records,
drawer, status updates, queue action, focus behavior, no horizontal overflow,
no console errors, and existing onboarding/dashboard/admin routes.

- [ ] **Step 7: Commit**

```bash
git add tests app db scripts docs README.md package.json package-lock.json drizzle
git commit -m "test: verify discovery agent journey"
```

### Task 7: Production migration, deployment, and first Codex data

**Files:**
- Temporary only if required: `app/api/discovery/worker/migrate/route.ts` and
  `tests/discovery-migration-route.test.ts`; remove both before final deployment
- Modify ignored local environment securely; never commit values
- No final source file beyond already planned operations documentation unless a
  verified deployment fix is required

- [ ] **Step 1: Configure production and local worker secrets**

Generate a high-entropy `DISCOVERY_WORKER_SECRET` without printing it. Add it to
the existing Sites project environment and the ignored local automation
environment. Add non-secret `DISCOVERY_API_BASE_URL=https://mewtuals.com` only
locally. Call the available Sites environment read capability, then its update
capability with only the new key so all existing
Sites entries remain unchanged; record the returned environment revision.

- [ ] **Step 2: Establish a production migration recovery checkpoint**

Confirm the production host is Neon without exposing the connection string.
In the Neon console/API, record the project/branch identifier, current restore
window, and a named restore point or protected branch immediately before DDL.
Also record pre-migration Drizzle journal rows, existing application table row
counts, and the SHA-256 of `drizzle/0004_*.sql`. Stop before DDL if a restorable
checkpoint cannot be confirmed. The recovery procedure is: restore the named
branch/point, repoint the unchanged Sites secret, deploy the previous saved
Sites version, and verify the recorded journal/counts.

- [ ] **Step 3: Apply all pending committed migrations safely**

Prefer `DATABASE_URL=<production Neon URL> npm run db:migrate`. If the credential
is only available inside Sites, first RED/GREEN a temporary
`POST /api/discovery/worker/migrate` adapter locally. It accepts a separate
high-entropy `DISCOVERY_MIGRATION_SECRET`, refuses all other methods/content
types, enforces the same 512 KiB request cap, acquires a PostgreSQL advisory
lock, verifies the request's migration tag and SHA-256 against the committed
file, invokes the same committed migrator to apply **all pending migrations** in
order, and returns only applied tags plus schema/journal assertions. A second
identical request must be a no-op; a changed tag/hash must be 409. Test wrong
secret, replay, concurrent calls, and hash mismatch. Generate a separate
high-entropy `DISCOVERY_MIGRATION_SECRET` without printing it, store it only in
an ignored local temporary environment and Sites using the environment update
capability, record that environment revision, and deploy the temporary version
with that revision. Execute once, verify `0004` appears exactly once and the recorded
existing row counts are unchanged, then delete the route/test, remove
`DISCOVERY_MIGRATION_SECRET` from Sites with the same update capability, delete
the local copy, record the removal revision, rebuild/test, commit the clean
source, and deploy the cleaned source before any trial. Keep the prior saved
version and checkpoint until final verification passes.

- [ ] **Step 4: Publish the exact validated source to the existing Sites project**

The active user instruction to finish the implementation, run the trial, and
deliver the final admin dashboard is explicit authorization for the required
temporary migration deployment (only if used) and final public deployment. If
that authorization is no longer active at execution time, call
`request_user_input` before each public deployment. Read project id
`appgprj_6a56979ca26c8191b26abf2a5cd9dc51` from
`.openai/hosting.json` and call `sites_get_site` to reconfirm it is the existing
public Mewtuals project. Run `npm test && npm run test:migrations && npm run
test:db && npm run test:acceptance && npm run lint && npm run build`; set `commit_sha` to the clean
`git rev-parse HEAD`. Call `sites_create_source_repository_*`, push exactly that
SHA to its returned branch with a per-command authorization header (never print
or persist the token), and package that same checkout with:

```bash
/Users/keshavgarg/.codex/plugins/cache/openai-bundled/sites/0.1.30/scripts/package-site.sh . /private/tmp/mewtuals-discovery-site.tar.gz
```

Call `sites_save_site_version(project_id, commit_sha, archive)`, then
`sites_deploy_site_version(project_id, version_id)` using the existing public
access mode. Poll `sites_get_deployment_status` with the exact project/version/
deployment ids until `succeeded`; verify returned URL, `https://mewtuals.com`,
and `https://www.mewtuals.com` HTTP status/headers. Do not create a second Sites
project or alter domains/access.

- [ ] **Step 5: Negative-auth smoke tests, then one real Codex trial**

Before valid discovery, POST claim/complete/fail without a bearer and with a
wrong bearer; require 401 and no new/changed run. Then claim with
`npm run discovery:claim -- --trigger trial`.

Use public web search to collect up to ten India companies and ten India creators
across the approved categories. Verify every source URL and candidate identity,
write the bounded batch to a `mktemp` file outside the repo, run full shared-Zod
`discovery:validate`, submit it, and securely delete the temporary lease/batch
files. Preserve an honest partial result if any source fails.

- [ ] **Step 6: Verify newly persisted production data and real admin behavior**

Require a successful/partial trial response and query candidates joined to that
run's sources to prove `newCount >= 2`, including at least one **newly persisted**
company and one **newly persisted** creator attributable to the trial (duplicates
do not satisfy this gate). Verify their public evidence through admin queries.
Request a real magic link for an email present in production `ADMIN_EMAILS`, use
the delivered single-use link to establish a production session, and verify an
unallowlisted user/anonymous request cannot access admin data. Open
`/admin/discovery` at desktop and mobile sizes, use company/creator and one
category/status filter, open a candidate detail, and compare-and-update one
candidate status. Re-fetch to prove durability; submit a stale version to prove
409; rediscover the candidate and prove the administrator decision survives.

- [ ] **Step 7: Create and verify the daily Codex scheduled task**

Use the desktop automation capabilities discovered in `ALL_TOOLS` (currently
`codex_app__list_projects({})` and `codex_app__automation_update(...)`). Inspect
`$CODEX_HOME/automations/*/automation.toml` for normalized name
`Mewtuals daily discovery` and update its id rather than creating a duplicate.
Test the exact reviewed prompt manually. For create, pass `mode: "create"`,
`kind: "cron"`, the returned `projectId`, `executionEnvironment: "local"`,
`destination: "local"`, `name`, exact `prompt`,
`rrule: "FREQ=DAILY;BYHOUR=8;BYMINUTE=30;BYSECOND=0"`, `status: "ACTIVE"`,
`notificationPolicy: "failed_runs_only"`, the configured default model, and a
supported reasoning effort. For update, first view the existing id and pass its
full preserved fields with `mode: "update"`. The schedule is interpreted in the
desktop's Asia/Kolkata timezone. The worker CLI loads ignored `.env.local`;
never embed secrets in the prompt or automation file. View the saved automation
afterward and record its id, project id, timezone/cadence, enabled state,
computed next run, execution destination, prompt digest, permissions, and
notification policy. Re-scan automations and require exactly one matching
enabled task.

- [ ] **Step 8: Run fresh final verification**

From the final source state rerun:

```bash
npm test
npm run test:migrations
npm run test:db
npm run test:acceptance
npm run lint
npm run build
git diff --check
git status --short
```

Then confirm the deployed version/commit, environment revision, production run,
new company/creator ids and counts, automation id/status, and admin dashboard all
correspond to the same final source. Confirm the temporary migration route and
secret are absent and the negative-auth checks remain 401.

- [ ] **Step 9: Complete the feature branch**

Invoke `superpowers:finishing-a-development-branch`, preserve the production
deployment and data, and integrate the reviewed branch using the option already
authorized by the user's instruction to finish the implementation.
