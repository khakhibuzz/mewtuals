# Mewtuals Physical AI Discovery V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Discovery Agent persist evidence-backed physical-AI research versions, seed up to 50 Indian companies, run ongoing 15-company/5-creator discovery, and expose current and historical findings in the existing admin drawer.

**Architecture:** Extend the current claim/lease/validate/submit transaction rather than creating another worker. Add a backwards-compatible V2 batch contract, one `candidate_research_versions` table, and a `campaign_key` on runs; keep all systems and ecosystem analysis inside bounded structured text. Read research lazily through the existing candidate admin route and render it in a focused child component inside the existing drawer.

**Tech Stack:** TypeScript, Zod, Vinext/Next route handlers, React, Drizzle ORM, PostgreSQL/Neon, Vitest, Testing Library, Playwright, Codex automations, OpenAI Sites.

**Specification:** `docs/superpowers/specs/2026-07-28-mewtuals-physical-ai-discovery-v1-design.md`

**Execution mode:** Inline execution in this task using `superpowers:executing-plans`, because the user explicitly asked to proceed through implementation, deployment, and the initial seed without another choice gate.

---

## File and Boundary Map

### Domain and configuration

- Modify `app/domain/discovery.ts`: versioned V1/V2 schemas, research bounds,
  duplicate-payload validation, and shared types.
- Modify `app/server/discovery-config.ts`: physical-AI default categories,
  campaign key, 75% company allocation, and the seed allocation helper.
- Modify `tests/discovery-domain.test.ts` and
  `tests/discovery-config.test.ts`: contract and configuration examples.

### Persistence

- Modify `db/schema.ts`: `discovery_runs.campaign_key` and the single new
  `candidate_research_versions` table.
- Modify `db/types.ts`: inferred research-version types.
- Create the next generated `drizzle/0005_*.sql` migration and matching
  `drizzle/meta/0005_snapshot.json` journal entry.
- Modify `scripts/test-discovery-migrations.mjs`: fresh and V1-upgrade
  assertions for the additive migration.
- Modify `db/repositories/discovery-repository.ts`: campaign persistence,
  bulk identity preloading, atomic research-version writes, same-candidate
  batch rejection, honest empty completion, and bounded history reads.
- Modify `tests/schema.test.ts`, `tests/db.integration.test.ts`, and
  `tests/discovery.acceptance.integration.test.ts`: schema, transaction,
  replay, history, and acceptance coverage.

### Application and worker protocol

- Modify `app/server/discovery-service.ts`: campaign-aware claim/output
  contracts, exact seed preset, persisted prompt validation, and authorized
  history use case.
- Modify `app/server/discovery-route.ts`: bounded `{ trigger, preset }` claim
  parsing and candidate research GET delivery.
- Modify `app/api/discovery/worker/claim/route.ts`: pass the claim selector.
- Modify `app/api/admin/discovery/candidates/[candidateId]/route.ts`: add GET
  beside the existing PATCH.
- Modify `scripts/discovery-worker.ts`: `--preset robotics-seed`, V1/V2 claim
  files, and unchanged exact-byte submission.
- Modify `tests/discovery-service.test.ts`, `tests/discovery-routes.test.ts`, and
  `tests/discovery-worker-cli.test.ts`: use-case, adapter, and CLI coverage.

### Admin drawer

- Create `app/components/product/DiscoveryResearchContext.tsx`: lazy research
  fetch, latest summary, findings toggle, history selection, and source links.
- Modify `app/components/product/DiscoveryDashboard.tsx`: mount the focused
  research component inside the selected candidate drawer.
- Modify `app/components/product/product.module.css`: compact research/history
  styles using existing drawer tokens.
- Create `tests/discovery-research-context.test.tsx` and modify
  `tests/discovery-dashboard.test.tsx`: loading, empty, error, latest, history,
  safe text, keyboard, and drawer behavior.
- Modify `tests/e2e/mobile-pwa.spec.ts`: authenticated administrator research
  fixture, latest/findings/history interaction, focus, touch-target, and narrow
  overflow verification in the real browser.

### Operations and release

- Modify `.env.example` and `.dev.vars.example`: 15/5 allocation and focused
  category vocabulary with placeholders preserved.
- Modify `docs/discovery-agent-operations.md`: V2 findings contract, seed
  command, saturation behavior, and updated scheduled prompt.
- Update the existing Codex automation through the app automation API; do not
  create a duplicate or edit its TOML by hand.
- Reuse `.openai/hosting.json` project
  `appgprj_6a56979ca26c8191b26abf2a5cd9dc51` for production deployment.

Do not modify or stage the unrelated in-progress Global Demand Radar spec or
plan currently present in the worktree.

At implementation start, capture the exact current commit as
`PHYSICAL_AI_START_SHA`. Use that captured SHA—not a hard-coded ancestor or
commit count—for final feature diff review because other approved work may land
on the shared branch while this plan executes.

### Execution preflight

- [ ] Capture and record the exact implementation boundary before Task 1

```bash
PHYSICAL_AI_START_SHA=$(git rev-parse HEAD)
git status --short --branch
```

Record the printed SHA in the execution notes so it can be restored into the
shell before Task 9. Confirm any existing changes are unrelated user work and
do not stage them.

---

### Task 1: Add the backwards-compatible V2 domain contract

**Files:**
- Modify: `app/domain/discovery.ts`
- Test: `tests/discovery-domain.test.ts`

- [ ] **Step 1: Add failing V1/V2 contract tests**

Add helpers that produce a V2 candidate and V2 batch, then test:

```ts
const research = {
  summary: "A motion-control supplier connecting local robot builders to dependable actuation.",
  findings: "Domain and category\n" + "Evidence-backed fact [S1].\n".repeat(40),
  sourceUrls: ["https://evidence.example.com/company"],
  analysisVersion: "physical-ai-v1",
};

expect(discoveryBatchSchema.parse(batch()).promptVersion).toBe("codex-web-v1");
expect(
  discoveryBatchSchema.parse(
    batch({
      promptVersion: "codex-web-v2",
      candidates: [candidate({ research })],
    }),
  ).promptVersion,
).toBe("codex-web-v2");
```

Cover all exact limits from the spec: summary 80–1,200 characters, findings
600–12,000 characters, 1–12 unique source URLs, 2,048-character URLs,
`physical-ai-v1`, 50 candidates, and 1 MiB total bytes. Prove V2 rejects a
missing research object, private URLs, duplicate source URLs, and visible
duplicate candidate identifiers. Keep an empty candidate array valid.

- [ ] **Step 2: Run the focused domain test and verify failure**

Run:

```bash
npx vitest run tests/discovery-domain.test.ts
```

Expected: FAIL because `codex-web-v2`, the research schema, and the new byte
limit do not exist.

- [ ] **Step 3: Implement the minimal versioned schemas**

In `app/domain/discovery.ts`, keep the current base candidate schema and add:

```ts
export const DISCOVERY_V1_PROMPT_VERSION = "codex-web-v1" as const;
export const DISCOVERY_V2_PROMPT_VERSION = "codex-web-v2" as const;
export const PHYSICAL_AI_ANALYSIS_VERSION = "physical-ai-v1" as const;
export const MAX_DISCOVERY_BATCH_BYTES = 1_024 * 1_024;

export const candidateResearchSchema = z.strictObject({
  summary: z.string().trim().min(80).max(1_200),
  findings: z.string().trim().min(600).max(12_000),
  sourceUrls: z
    .array(publicDiscoveryUrlSchema)
    .min(1)
    .max(12)
    .refine((urls) => new Set(urls).size === urls.length, {
      message: "Research source URLs must be unique.",
    }),
  analysisVersion: z.literal(PHYSICAL_AI_ANALYSIS_VERSION),
});

export const physicalAiDiscoveryCandidateInputSchema =
  discoveryCandidateInputSchema.extend({ research: candidateResearchSchema });
```

Export separate V1 and V2 object schemas plus a `discoveryBatchSchema` union.
Export `DiscoveryBatchCandidate` as
`DiscoveryBatch["candidates"][number]` while preserving `DiscoveryCandidate` as
the base candidate type for existing helpers. Apply total-byte and duplicate
identifier refinements to the union so the CLI and server share one authority.
The duplicate check must compare every normalized stable identifier scoped by
candidate type, not names.

- [ ] **Step 4: Run the domain tests and verify they pass**

Run:

```bash
npx vitest run tests/discovery-domain.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the domain contract**

```bash
git add app/domain/discovery.ts tests/discovery-domain.test.ts
git commit -m "feat: add physical AI discovery batch contract"
```

---

### Task 2: Make physical AI the default campaign and define the seed preset

**Files:**
- Modify: `app/server/discovery-config.ts`
- Test: `tests/discovery-config.test.ts`

- [ ] **Step 1: Write failing configuration tests**

Assert the default config contains:

```ts
expect(readDiscoveryConfig({ NODE_ENV: "test" })).toMatchObject({
  campaignKey: "robotics_hardware_india",
  geographies: ["India"],
  totalCandidates: 20,
  companyPercentage: 75,
  enabledSources: ["codex_web"],
});

expect(physicalAiSeedConfig(readDiscoveryConfig({ NODE_ENV: "test" }))).toMatchObject({
  campaignKey: "robotics_hardware_india",
  totalCandidates: 50,
  companyPercentage: 100,
});
```

Also assert the default company and creator category lists are specific to
robotics/physical AI and that environment overrides still work.

- [ ] **Step 2: Run the configuration test and verify failure**

```bash
npx vitest run tests/discovery-config.test.ts
```

Expected: FAIL because campaign and seed configuration are absent and the
company percentage remains 50.

- [ ] **Step 3: Implement the focused configuration**

Add `campaignKey` to `DiscoveryConfig` and `PublicDiscoveryWorkerConfig`, set the
literal default `robotics_hardware_india`, change the default company percentage
to 75, and replace broad lifestyle categories with the spec's broad physical-AI
vocabulary. Add a pure helper:

```ts
export function physicalAiSeedConfig(
  config: DiscoveryConfig,
): DiscoveryConfig {
  return { ...config, totalCandidates: 50, companyPercentage: 100 };
}
```

Do not add campaign CRUD, database-driven taxonomy, or a second environment
configuration system.

- [ ] **Step 4: Run configuration and domain tests**

```bash
npx vitest run tests/discovery-config.test.ts tests/discovery-domain.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the campaign defaults**

```bash
git add app/server/discovery-config.ts tests/discovery-config.test.ts
git commit -m "feat: default discovery to physical AI"
```

---

### Task 3: Add the additive PostgreSQL schema and migration

**Files:**
- Modify: `db/schema.ts`
- Modify: `db/types.ts`
- Modify: `tests/schema.test.ts`
- Modify: `scripts/test-discovery-migrations.mjs`
- Create: `drizzle/0005_physical_ai_discovery_v1.sql` (generated name may keep
  Drizzle's deterministic prefix)
- Create: `drizzle/meta/0005_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

- [ ] **Step 1: Add failing schema-shape tests**

In `tests/schema.test.ts`, assert the new schema exports and inferred columns.
In `scripts/test-discovery-migrations.mjs`, add
`candidate_research_versions` to the exact table/column/index/constraint checks
and require `discovery_runs.campaign_key` to be non-null with default
`general_discovery` after upgrading a database containing V1 rows.

- [ ] **Step 2: Run the schema test and verify failure**

```bash
npx vitest run tests/schema.test.ts
```

Expected: FAIL because the table and campaign column do not exist.

- [ ] **Step 3: Define the Drizzle schema**

Add `campaignKey` to `discoveryRuns`:

```ts
campaignKey: text("campaign_key")
  .default("general_discovery")
  .notNull(),
```

Add one table only:

```ts
export const candidateResearchVersions = pgTable(
  "candidate_research_versions",
  {
    id: id(),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => discoveryCandidates.id, { onDelete: "cascade" }),
    discoveryRunId: uuid("discovery_run_id")
      .notNull()
      .references(() => discoveryRuns.id),
    summary: text("summary").notNull(),
    findings: text("findings").notNull(),
    sourceUrls: jsonb("source_urls").$type<string[]>().notNull(),
    analysisVersion: text("analysis_version").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    unique("candidate_research_versions_candidate_run_unique").on(
      table.candidateId,
      table.discoveryRunId,
    ),
    index("candidate_research_versions_candidate_created_idx").on(
      table.candidateId,
      table.createdAt,
    ),
    index("candidate_research_versions_run_idx").on(table.discoveryRunId),
    check("candidate_research_versions_summary_check", sql`length(${table.summary}) between 80 and 1200`),
    check("candidate_research_versions_findings_check", sql`length(${table.findings}) between 600 and 12000`),
    check("candidate_research_versions_sources_check", sql`jsonb_typeof(${table.sourceUrls}) = 'array' and jsonb_array_length(${table.sourceUrls}) between 1 and 12`),
    check("candidate_research_versions_analysis_check", sql`${table.analysisVersion} = 'physical-ai-v1'`),
  ],
);
```

Export inferred select/insert types from `db/types.ts`.

- [ ] **Step 4: Generate and inspect the ordered migration**

Run:

```bash
npm run db:generate -- --name physical_ai_discovery_v1
```

Expected: one new `0005` SQL file, one snapshot, and one journal entry. Inspect
the SQL and confirm it only adds/backfills `campaign_key`, creates the research
table, constraints, indexes, and foreign keys. It must not rewrite existing
candidate, source, run status, or enum data.

- [ ] **Step 5: Run fresh and upgrade migration verification**

```bash
npm run test:migrations
```

Expected: PASS for both a fresh database and an upgrade fixture. Confirm the
upgrade fixture's existing run reads `campaign_key = 'general_discovery'` and
its existing profile/review rows are unchanged.

- [ ] **Step 6: Commit the migration**

```bash
git add db/schema.ts db/types.ts tests/schema.test.ts scripts/test-discovery-migrations.mjs drizzle
git commit -m "feat: add candidate research versions"
```

---

### Task 4: Persist research atomically and read bounded history

**Files:**
- Modify: `db/repositories/discovery-repository.ts`
- Modify: `tests/db.integration.test.ts`
- Test: `tests/discovery.acceptance.integration.test.ts`

- [ ] **Step 1: Add failing repository integration tests**

Add tests proving:

1. A V2 new candidate inserts one candidate, its identifiers/evidence, and one
   linked research version in the same run.
2. A later V2 run resolving the same candidate creates a second history row and
   preserves the administrator status.
3. Exact replay creates no additional version.
4. Two payload entries resolving through stored identifiers to one candidate
   return conflict reason `duplicate_candidate_in_batch` plus the first
   deterministic pair of zero-based payload indexes, leave the run `running`,
   and write nothing.
5. A later invalid candidate rolls back candidates, sources, and research.
6. An empty batch with no source errors succeeds with zero counts; an empty
   batch with source errors fails honestly.
7. `getCandidateResearchVersions(candidateId, 25)` returns latest plus at most
   24 older rows in reverse chronological order and distinguishes a missing
   candidate from a candidate with no research.
8. A representative 50-new-company transaction completes with 50 research
   rows, demonstrating the bounded bulk path.

Use `candidateResearchVersions` directly in assertions. Do not use elapsed-time
assertions; prove the bulk query shape through the implementation and the
50-row result.

- [ ] **Step 2: Run the focused database test and verify failure**

```bash
npm run db:test:prepare
DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run --no-file-parallelism tests/db.integration.test.ts
```

Expected: FAIL because research persistence/history and the new conflict reason
are absent.

- [ ] **Step 3: Extend repository contracts**

Add `campaignKey` to `QueueDiscoveryRunInput`, switch completion candidates to
`DiscoveryBatchCandidate`, add `duplicate_candidate_in_batch` to
`DiscoveryRunConflictReason`, allow that conflict result to carry only
`details: { candidateIndexes: [number, number] }`, and add:

```ts
export type CandidateResearchHistory = {
  candidateId: string;
  latest: CandidateResearchVersion | null;
  history: CandidateResearchVersion[];
};

getCandidateResearchVersions(
  candidateId: string,
  limit: number,
): Promise<CandidateResearchHistory | null>;
```

Include `campaignKey` in queued values and safe admin run selections.

- [ ] **Step 4: Preload identities and detect same-candidate entries before writes**

At the start of the completion transaction, after lease/replay checks:

1. Compute and retain every candidate's normalized identifiers once.
2. Query all matching identifiers in at most one query per candidate type.
3. Build `type:value -> candidateId` and `candidateId -> stored kinds` maps.
4. Lock all matched candidate rows in one ordered `FOR UPDATE` query.
5. Preserve the existing behavior when one input entry spans identifiers owned
   by multiple records: record an identity conflict and skip that entry.
6. Track resolved candidate ids across input entries. If a second input resolves
   to an already-used id, return the non-terminal conflict
   `duplicate_candidate_in_batch` before any candidate/source/research write.
   Include only the first deterministic pair of input indexes in its bounded
   conflict details so the worker can consolidate the correct private entries.

Do not merge narratives or choose one implicitly.

- [ ] **Step 5: Batch the common 50-company write path**

Build persistence rows in memory after resolution:

- insert all new candidates in one statement and map returned rows by their
  immutable canonical identity key;
- apply existing-candidate updates without changing `status`;
- insert all identifiers in one statement with the existing conflict target;
- upsert all primary source evidence in one statement; and
- insert all present `candidate.research` values into
  `candidate_research_versions` in one statement.

Keep these writes and run completion inside the existing transaction. V1
candidates have no research row. V2 candidates are already guaranteed by the
service/domain contract to have research.

- [ ] **Step 6: Implement honest empty completion and history reads**

Use this terminal rule:

```ts
const status =
  input.candidates.length === 0
    ? sourceErrors.length === 0
      ? "succeeded"
      : "failed"
    : sourceErrors.length > 0 || identityConflicts.length > 0
      ? "partial"
      : "succeeded";
```

Only attach an empty-submission failure summary when source errors prevented
research. Implement the history method with an existence check and a
latest-first query capped to `Math.min(25, Math.max(1, limit))`; return the first
row as `latest` and the remaining rows as `history`.

- [ ] **Step 7: Run repository and acceptance integration tests**

```bash
DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run --no-file-parallelism tests/db.integration.test.ts tests/discovery.acceptance.integration.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit persistence behavior**

```bash
git add db/repositories/discovery-repository.ts tests/db.integration.test.ts tests/discovery.acceptance.integration.test.ts
git commit -m "feat: persist physical AI research atomically"
```

---

### Task 5: Make claims campaign-aware and expose authorized research history

**Files:**
- Modify: `app/server/discovery-service.ts`
- Modify: `tests/discovery-service.test.ts`

- [ ] **Step 1: Add failing service tests**

Cover:

- scheduled physical-AI external key for the fixed test clock
  `discovery:scheduled:robotics_hardware_india:2026-07-28:india:both:20:75`;
- new manual runs storing the physical-AI campaign;
- old queued `general_discovery` runs returning V1 prompt/schema;
- new scheduled/manual physical-AI runs returning V2 prompt/schema and 15/5;
- `claimRun({ trigger: "trial", preset: "robotics-seed" })` storing campaign
  `robotics_hardware_india`, candidate type `company`, count 50, and percentage
  100;
- rejection of unknown presets and any preset on scheduled claims;
- persisted campaign/prompt mismatch rejection before repository completion;
- safe mapping of `duplicate_candidate_in_batch` with two bounded payload
  indexes and no candidate content;
- authorized latest/history reads, invalid UUID, non-admin denial, missing
  candidate, and empty history.

- [ ] **Step 2: Run the service test and verify failure**

```bash
npx vitest run tests/discovery-service.test.ts
```

Expected: FAIL on the new selector, campaign, V2 schema, and history use case.

- [ ] **Step 3: Implement a narrow claim selector and run configuration**

Use a small boundary type:

```ts
export type DiscoveryClaimSelector = {
  trigger: "scheduled" | "trial";
  preset?: "robotics-seed";
};
```

Change `claimRun` to accept the selector. The seed preset uses
`physicalAiSeedConfig`, `candidateType: "company"`, and a trial key containing
campaign, preset, and the existing random uniqueness token. Scheduled keys
contain campaign/date/geography/type/count/percentage. Queue manual runs with
the current campaign. Persisted run values, not current environment drift,
remain authoritative when a queued run is claimed.

- [ ] **Step 4: Return the correct versioned output schema and validate submit against the run**

Generate the worker output schema from `physicalAiDiscoveryBatchSchema` for V2
runs and the V1 object schema for old general runs. Update descriptions to the
1 MiB limit and annotate the research fields.

In completion:

1. parse the union batch;
2. load the persisted run;
3. derive expected prompt version from `run.campaignKey`;
4. reject a mismatch with 400 before calling the repository; and
5. preserve persisted allocation validation and canonical-body hashing.

When the repository returns `duplicate_candidate_in_batch`, map only its reason
and validated two-index details into the 409 service result. Other conflicts do
not gain arbitrary detail fields.

- [ ] **Step 5: Implement the authorized history use case**

Add `getCandidateResearch(actor, candidateId)` that validates administrator and
UUID, calls the repository with limit 25, maps missing candidate to 404, and
returns a framework-free JSON DTO with ISO timestamps:

```ts
{
  candidateId,
  latest: versionOrNull,
  history: olderVersions,
}
```

Do not expose lease hashes, submission hashes, raw candidate metadata, or
database row internals.

- [ ] **Step 6: Run service tests**

```bash
npx vitest run tests/discovery-service.test.ts tests/discovery-domain.test.ts tests/discovery-config.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit application use cases**

```bash
git add app/server/discovery-service.ts tests/discovery-service.test.ts
git commit -m "feat: add physical AI discovery use cases"
```

---

### Task 6: Extend the worker CLI and thin HTTP adapters

**Files:**
- Modify: `app/server/discovery-route.ts`
- Modify: `app/api/discovery/worker/claim/route.ts`
- Modify: `app/api/admin/discovery/candidates/[candidateId]/route.ts`
- Modify: `scripts/discovery-worker.ts`
- Modify: `tests/discovery-routes.test.ts`
- Modify: `tests/discovery-worker-cli.test.ts`

- [ ] **Step 1: Add failing route and CLI tests**

Route tests must prove:

```ts
expect(claim).toHaveBeenCalledWith({
  trigger: "trial",
  preset: "robotics-seed",
});
```

They must reject unknown keys, an unknown preset, and a preset with scheduled
trigger. Add GET candidate research tests for signed-out 401, member 403,
invalid/missing 4xx mapping, and successful JSON serialization. Keep PATCH and
same-origin behavior unchanged.

CLI tests must prove:

- `claim --trigger trial --preset robotics-seed` sends the exact body;
- `--preset` without trial and unknown presets fail before network access;
- a V2 claim is stored in a mode-0600 private claim file;
- both V1 and V2 claim files can supply submit/fail credentials; and
- a non-2xx submit response exposes only a recognized bounded conflict reason
  such as `duplicate_candidate_in_batch` and two validated payload indexes,
  never its rejected body or secrets;
- submit still forwards the validated file's exact bytes.

- [ ] **Step 2: Run route and CLI tests and verify failure**

```bash
npx vitest run tests/discovery-routes.test.ts tests/discovery-worker-cli.test.ts
```

Expected: FAIL on selector parsing, V2 claims, and GET composition.

- [ ] **Step 3: Implement strict claim parsing at the route boundary**

Allow only `trigger` and `preset`, normalize omitted trigger to `scheduled`, and
pass a `DiscoveryClaimSelector` object to the service. Reject invalid
combinations before the service call. Update the production claim route to pass
the selector unchanged.

- [ ] **Step 4: Add the administrator research GET adapter**

Add `createAdminDiscoveryCandidateResearchHandler` beside the existing PATCH
handler. It reads the session, derives the actor, extracts `candidateId`, calls
the research use case, and returns `discoveryResponse`. Export `GET` and `PATCH`
from the existing candidate route composition; do not add SQL or policy there.

- [ ] **Step 5: Extend the worker CLI without exposing secrets**

Allow `--preset` only for `claim`, build the exact authenticated body, and
accept prompt versions from the exported V1/V2 constants. Keep the complete
claim response only in the private file. Safe stdout may include run id, prompt
version, public config/schema, and claim-file path, but never the lease.

Keep `validate` and `submit` on the union schema and retain byte-for-byte file
submission after validation.

For non-2xx responses, parse no more than 16 KiB and retain only safe fields:
numeric HTTP status, a bounded public `error` string, a recognized conflict
`reason`, and for `duplicate_candidate_in_batch` exactly two distinct integer
payload indexes from 0 through 49. Add this reason to recognized submit errors
so the seed operator can correct that non-terminal, pre-write conflict. Discard
all other response fields, and never echo a lease, payload, source contents,
candidate names, database ids/details, or arbitrary server JSON.

- [ ] **Step 6: Run route and CLI tests**

```bash
npx vitest run tests/discovery-routes.test.ts tests/discovery-worker-cli.test.ts tests/discovery-worker-timeout.test.ts
```

Expected: PASS, including the existing 120-second submit timeout contract.

- [ ] **Step 7: Commit the protocol adapters**

```bash
git add app/server/discovery-route.ts app/api/discovery/worker/claim/route.ts 'app/api/admin/discovery/candidates/[candidateId]/route.ts' scripts/discovery-worker.ts tests/discovery-routes.test.ts tests/discovery-worker-cli.test.ts
git commit -m "feat: expose physical AI discovery protocol"
```

---

### Task 7: Add the uncluttered research section to the existing drawer

**Files:**
- Create: `app/components/product/DiscoveryResearchContext.tsx`
- Modify: `app/components/product/DiscoveryDashboard.tsx`
- Modify: `app/components/product/product.module.css`
- Create: `tests/discovery-research-context.test.tsx`
- Modify: `tests/discovery-dashboard.test.tsx`
- Modify: `tests/e2e/mobile-pwa.spec.ts`

- [ ] **Step 1: Write failing component tests**

Test the child component independently with a stubbed `fetch`:

- loading text uses `role="status"`;
- 401/403/404/network failures show a compact retryable alert;
- a candidate with no research omits the entire `Research context` section and
  shows no fake fields;
- latest summary appears after fetch;
- findings remain collapsed until `View findings`;
- findings render as inert text preserving line breaks, so a value such as
  `<img src=x onerror=alert(1)>` remains text and creates no image element;
- source links open publicly with `rel="noreferrer"`;
- `History (2)` reveals two older choices and selecting one swaps summary,
  findings, sources, version, and timestamp;
- candidate-id changes discard stale in-flight responses; and
- all buttons retain accessible names and at least the existing 44-pixel class.

Update the dashboard test to open the existing drawer and assert the research
section is inside that dialog, not a new page or overlay.

Extend the existing mobile Playwright administrator journey with a uniquely
named database fixture containing one candidate and two research versions.
Navigate to `/admin/discovery` through the existing dedicated admin login,
open that candidate's drawer, verify latest summary, reveal findings, select the
older version, and assert focus remains within the native dialog until close.
Use the existing responsive audit helper at 390px and direct bounding-box
assertions for the new controls. Delete the candidate before its runs during
test cleanup so foreign keys remain valid.

- [ ] **Step 2: Run component tests and verify failure**

```bash
npx vitest run tests/discovery-research-context.test.tsx tests/discovery-dashboard.test.tsx
```

Expected: FAIL because the research child component does not exist.

- [ ] **Step 3: Implement a focused lazy-fetch component**

Define a local transport DTO and validate unknown response data before using it.
Use `AbortController` in an effect keyed by `candidateId`. Keep state as:

```ts
type ResearchState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; latest: ResearchVersion | null; history: ResearchVersion[] };
```

Render one compact `Research context` group. Show latest summary by default,
then buttons for findings and history. Render findings in an element with
`white-space: pre-wrap`; never use `dangerouslySetInnerHTML` and do not add a
Markdown dependency.

- [ ] **Step 4: Mount it inside the existing candidate drawer**

In `DiscoveryDashboard.tsx`, render:

```tsx
<DiscoveryResearchContext
  candidateId={selectedCandidate.id}
  candidateName={selectedCandidate.name}
/>
```

Place it after the existing basic details/public profiles and before review
status. Keep drawer open/close, focus return, candidate status mutation, and
evidence rendering unchanged.

- [ ] **Step 5: Add compact responsive styles**

Reuse existing typography, borders, colors, and button classes. Add only the
classes needed for summary text, collapsible controls, version list, pre-wrapped
findings, and sources. Ensure long URLs/findings wrap, the drawer does not cause
page-level horizontal overflow at 390px, and controls are at least 44px.

- [ ] **Step 6: Run component, responsive, and real-browser tests**

```bash
npx vitest run tests/discovery-research-context.test.tsx tests/discovery-dashboard.test.tsx tests/responsive-contract.test.ts
npx playwright test tests/e2e/mobile-pwa.spec.ts
```

Expected: PASS. The Playwright test must show no page-level horizontal overflow,
new interactive controls at least 44px high and wide, working latest/history
interaction, correct focus return, and no browser errors.

- [ ] **Step 7: Commit the drawer experience**

```bash
git add app/components/product/DiscoveryResearchContext.tsx app/components/product/DiscoveryDashboard.tsx app/components/product/product.module.css tests/discovery-research-context.test.tsx tests/discovery-dashboard.test.tsx tests/e2e/mobile-pwa.spec.ts
git commit -m "feat: show discovery research history in drawer"
```

---

### Task 8: Update runtime examples and the Codex operating contract

**Files:**
- Modify: `.env.example`
- Modify: `.dev.vars.example`
- Modify: `docs/discovery-agent-operations.md`
- Modify: `tests/discovery-worker-cli.test.ts`
- Modify: `tests/discovery-config.test.ts`

- [ ] **Step 1: Add failing documentation/config assertions**

Extend existing config/CLI tests or add a small text-contract assertion so the
tracked examples and operations guide contain:

- `DISCOVERY_TOTAL_CANDIDATES=20`;
- `DISCOVERY_COMPANY_PERCENTAGE=75`;
- focused company/creator category lists;
- `npm run discovery:claim -- --trigger trial --preset robotics-seed`;
- V2 `summary`, `findings`, `sourceUrls`, and `analysisVersion` instructions;
- an explicit claimed-contract branch: V2 requires research, while a queued
  `codex-web-v1` run must emit the unchanged strict V1 candidate shape with no
  `research` field;
- the seven required findings sections, including higher-level ecosystem
  relationship and mutual-help opportunities;
- fact/assessment/unknown labels;
- honest zero/underfill behavior; and
- exact-file replay/private-file cleanup rules.

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npx vitest run tests/discovery-config.test.ts tests/discovery-worker-cli.test.ts
```

Expected: FAIL until the examples/runbook match the new contract.

- [ ] **Step 3: Update examples and the runbook**

Keep environment files sanitized. Rewrite the scheduled prompt in
`docs/discovery-agent-operations.md` so it remains self-contained and first
branches on the claimed `promptVersion` and `outputSchema`. For
`codex-web-v2`, tell Codex to research physical-AI companies/creators and
construct the required research object for every candidate. For a queued
`codex-web-v1` run, require the unchanged strict V1 candidate shape and forbid
the extra research field so old manual work remains completable. Both branches
use public evidence and stop honestly at saturation; the V2 branch also cites
ordered research sources where practical.

Document that daily-to-weekly is an automation setting and total/company
percentage are environment settings; neither requires application code.

- [ ] **Step 4: Run worker/config tests**

```bash
npx vitest run tests/discovery-config.test.ts tests/discovery-worker-cli.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit operations documentation**

```bash
git add .env.example .dev.vars.example docs/discovery-agent-operations.md tests/discovery-config.test.ts tests/discovery-worker-cli.test.ts
git commit -m "docs: define physical AI discovery operations"
```

---

### Task 9: Run the complete local verification and review the implementation

**Files:**
- Review all files changed by Tasks 1–8
- Modify only the failing feature file/test when verification reveals a defect

- [ ] **Step 1: Run the focused migration and database gates**

```bash
npm run test:migrations
npm run test:db
```

Expected: PASS. Confirm the local migration applied as `0005`, V1 upgrade data
survived, V2 research is atomic, and 50-row persistence passes.

- [ ] **Step 2: Run the complete repository release gate**

```bash
npm test
npm run test:db
npm run test:acceptance
npm run test:e2e
npm run lint
npm run build
git diff --check
```

Expected: every command exits zero. Do not claim success from a subset.

- [ ] **Step 3: Inspect the complete diff and boundary invariants**

Run:

```bash
git diff "$PHYSICAL_AI_START_SHA"..HEAD -- app db scripts tests docs .env.example .dev.vars.example drizzle
git status --short
```

Verify:

- no client import reaches `app/server`, `db`, or environment modules;
- routes contain no SQL or business policy;
- only one new application table exists;
- V1 replay remains supported;
- candidate admin status is never overwritten;
- exact replay and non-terminal duplicate rejection are preserved;
- findings are inert text;
- no secrets, claim files, local environment, build output, screenshots, or
  unrelated Global Demand Radar files are staged.

- [ ] **Step 4: Run a code-review skill and fix only blocker findings**

Use `superpowers:requesting-code-review` against the implementation commits and
the approved spec. Apply `superpowers:receiving-code-review` before accepting
any suggestion. Re-run the focused test for each correction, then repeat the
full gate if production code changes.

- [ ] **Step 5: Commit any verified review corrections**

Stage only the explicit Physical AI source/test paths corrected during review;
never use `git add .`. Then run:

```bash
git commit -m "fix: harden physical AI discovery"
```

Skip this commit when review requires no changes.

---

### Task 10: Migrate, deploy, update automation, and run the 50-company seed

**Files and external state:**
- Read: `.openai/hosting.json`
- Use: existing Sites project `appgprj_6a56979ca26c8191b26abf2a5cd9dc51`
- Update: production Neon schema through the committed migration
- Update: existing `mewtuals-discovery-agent` Codex automation through
  `automation_update`
- Create only private temporary claim/payload/batch files outside the repository

- [ ] **Step 1: Invoke the required release skills**

Read and follow `sites:sites-building`, `sites:sites-hosting`, and
`superpowers:verification-before-completion` before any production claim.
Confirm the worktree still contains only the user's unrelated Radar changes in
addition to committed Physical AI work.

- [ ] **Step 2: Apply the committed migration to the production database**

Use the configured production `DATABASE_URL` without printing it. Confirm a
provider recovery point or backup, then run:

```bash
npm run db:migrate
```

Expected: the committed `0005` migration applies successfully. Verify with a
bounded read-only query that `discovery_runs.campaign_key` and
`candidate_research_versions` exist; do not print unrelated production data.

- [ ] **Step 3: Prepare and publish the exact committed Sites target**

Capture the exact feature commit and prepare it:

```bash
PHYSICAL_AI_RELEASE_SHA=$(git rev-parse HEAD)
npm run prepare:sites -- "$PHYSICAL_AI_RELEASE_SHA"
```

Use the Sites connector to save a version from the validated archive/digest and
deploy that saved version to production. Prove the Sites credential source
branch points to the exact SHA as required by repository policy. Never include
dirty files or persist Sites credentials.

- [ ] **Step 4: Verify and update the production discovery environment**

Use the Sites connector's environment-variable read operation for project
`appgprj_6a56979ca26c8191b26abf2a5cd9dc51`. Preserve every unrelated variable
and every secret. Ensure the production discovery values explicitly contain:

```dotenv
DISCOVERY_GEOGRAPHIES=India
DISCOVERY_TOTAL_CANDIDATES=20
DISCOVERY_COMPANY_PERCENTAGE=75
DISCOVERY_ENABLED_SOURCES=codex_web
```

Update the focused company/creator category variables to the tracked example
values. Use the Sites environment-variable update operation only when a value
is absent or stale. Re-read the redacted environment names/values afterward and
prove 20/75 is active; do not assume the new code default wins over a legacy
`DISCOVERY_COMPANY_PERCENTAGE=50` override. If changing runtime variables
requires a new deployment/version to activate them, perform that exact Sites
step before continuing.

- [ ] **Step 5: Verify production routing and the admin API boundary**

Verify active routing, SSL, and HTTP 200 for both `mewtuals.com` and
`www.mewtuals.com`. Confirm the unauthenticated research endpoint and worker
claim do not expose data (401), and confirm the deployed build reports the
expected version through the Sites deployment state.

- [ ] **Step 6: Update the existing Codex automation without duplicating it**

Inspect the existing automation by id, preserve its name, project, local
execution environment, model, reasoning effort, notification policy, status,
and 08:30 Asia/Kolkata schedule. Replace only its prompt with the exact updated
scheduled prompt from `docs/discovery-agent-operations.md`. Keep the count and
cadence configurable for a later weekly switch.

- [ ] **Step 7: Claim the explicit seed and create private files**

Capture the safe claim stdout without reading or printing a private claim file.
Parse `claimed` first:

```bash
DISCOVERY_CLAIM_OUTPUT=$(npm run --silent discovery:claim -- --trigger trial --preset robotics-seed)
DISCOVERY_CLAIMED=$(node -e 'const value=JSON.parse(process.argv[1]); process.stdout.write(value.claimed === true ? "true" : "false")' "$DISCOVERY_CLAIM_OUTPUT")
```

If `claimed` is false, treat it as a successful no-work stop. Do not fail or
abandon any run: the unavailable work may belong to another valid worker. Wait
for the active run to finish or for normal lease recovery, then retry the same
seed claim later. Only after `DISCOVERY_CLAIMED` is exactly `true`, run:

```bash
DISCOVERY_CLAIM_FILE=$(node -e 'const value=JSON.parse(process.argv[1]); if (typeof value.claimFile !== "string") process.exit(1); process.stdout.write(value.claimFile)' "$DISCOVERY_CLAIM_OUTPUT")
DISCOVERY_SEED_DIR=$(mktemp -d /private/tmp/mewtuals-physical-ai-seed.XXXXXX)
DISCOVERY_BATCH_FILE="$DISCOVERY_SEED_DIR/batch.json"
```

Never display the private claim file. Keep the new temporary directory mode
0700 and the final batch mode 0600.

- [ ] **Step 8: Research and validate up to 50 companies**

Use current public web evidence to research a diverse India-first batch across
robot makers/integrators, actuation/components, sensing, electronics/compute,
embedded AI/software, manufacturing/testing, deployment, and ecosystem support.
Every candidate must have stable identity, category/subcategory, summary,
complete findings outline, ordered public sources, and fact/assessment/unknown
labels. Do not pad or invent a relationship to reach 50.

Privately combine the claim credentials with the candidate payload, then run:

```bash
npm run discovery:validate -- --file "$DISCOVERY_BATCH_FILE"
```

Expected: PASS with no schema errors. Correct only from verified evidence.

- [ ] **Step 9: Submit exactly once and handle unknown outcomes safely**

```bash
npm run discovery:submit -- --claim-file "$DISCOVERY_CLAIM_FILE" --file "$DISCOVERY_BATCH_FILE"
```

If the command returns no terminal JSON or times out, retry the exact same file;
never regenerate a different body for that run. If the CLI returns HTTP 409
with the recognized safe reason `duplicate_candidate_in_batch`, the transaction
has not written or terminalized the run: use the two validated zero-based
payload indexes to consolidate those private entries into one candidate,
revalidate the corrected body, and resubmit. For lease, state, or
submission-hash conflicts, do not change the file or mutate the run; inspect
durable state. If credible submission is impossible while the lease remains
valid, call `discovery:fail` with a bounded safe summary.

- [ ] **Step 10: Verify the authenticated production drawer and durable results**

Confirm:

- the seed run is terminal `succeeded` or honestly `partial`;
- found/new/duplicate/source-error counts match persisted rows;
- every accepted physical-AI candidate has one research version for the run;
- latest and historical research endpoint reads are authorized and bounded;
- the deployed drawer can show summary, findings, sources, and history; and
- the re-read Sites environment proves 20 total and 75% companies, while the
  tested deployed configuration deterministically allocates that as 15/5; and
- the automation remains active for future 15/5 runs.

Open `https://mewtuals.com/admin/discovery` through the Chrome or in-app browser
using an existing authenticated administrator session. Open a seeded candidate,
verify its latest summary, reveal findings, confirm the correct no-prior-history
state for this first V2 seed, and inspect source links at desktop and 390px
widths with no browser errors or overflow. The two-version Playwright fixture is
the acceptance evidence for selecting older history until a later production
rediscovery creates a real second version. Do not claim or queue an extra
production run merely to manufacture history or verify allocation. If no
administrator session is available, stop at this verification gate and ask the
user to sign in; do not claim deployment completion from database/API evidence
alone.

Only after confirmed terminal success/failure, remove the private claim and
batch directory. Report the run id, status, counts, deployed version/SHA,
automation status, and whether cleanup completed—never secrets or payload
contents.

- [ ] **Step 11: Mark the durable objective complete**

Run the final requirement-by-requirement audit against the approved spec and
the user's deployment goal. Only when code, migration, Sites deployment,
automation, seed persistence, and dashboard access are all evidenced, mark the
goal complete.
