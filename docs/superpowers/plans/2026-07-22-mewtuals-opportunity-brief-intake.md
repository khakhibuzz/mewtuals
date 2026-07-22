# Mewtuals Opportunity Brief Intake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the authenticated `/join` gate with a public, sub-30-second Opportunity Brief request that persists to Postgres, appears in the administrator queue, acknowledges email when available, and preserves all existing member and Discovery Agent behavior.

**Architecture:** Add one Opportunity Brief bounded context across pure domain rules, a service-owned repository port, a Drizzle/Postgres adapter, thin public/admin routes, and focused UI components. Reuse existing request security, administrator sessions, email transport, Discovery candidate identifiers, and Sites deployment. Exact candidate linkage is opportunistic; unmatched requests remain unlinked durable research records.

**Tech Stack:** Vinext/Next.js, React 19, TypeScript, Zod, Drizzle ORM, PostgreSQL/Neon, Vitest, Testing Library, Playwright, Resend, Sites

---

## File Map

- Create `app/domain/opportunity-brief.ts`: intake normalization, validation, metadata bounds, status transitions, and public types.
- Modify `app/domain/discovery.ts`: expose one existing-rule-compatible identifier classifier for submitted profile URLs.
- Create `app/server/opportunity-brief-service.ts`: public submission and administrator use cases plus framework-free repository/email ports.
- Create `app/server/opportunity-brief-route.ts`: bounded JSON parsing and same-origin public HTTP adapter.
- Create `app/server/opportunity-brief-admin-route.ts`: authenticated administrator GET/PATCH HTTP adapters.
- Create `app/server/opportunity-brief.ts`: composition root using environment, repository, email, and session dependencies.
- Modify `app/server/email.ts`: reuse Resend transport for acknowledgement delivery without changing strict magic-link behavior.
- Create `db/repositories/opportunity-brief-repository.ts`: transactional rate limit, exact candidate lookup, idempotent upsert, admin queries, and mutations.
- Modify `db/schema.ts` and `db/types.ts`: opportunity-brief enums/tables and inferred types.
- Create `drizzle/0005_opportunity_brief_requests.sql` and `drizzle/meta/0005_snapshot.json`; modify `drizzle/meta/_journal.json` through Drizzle generation.
- Rename `scripts/test-discovery-migrations.mjs` to `scripts/test-migrations.mjs`: general fresh/latest-upgrade harness for every ordered migration.
- Create `app/api/opportunity-briefs/route.ts`: public POST route.
- Create `app/api/admin/opportunity-briefs/route.ts`: admin list/summary GET route.
- Create `app/api/admin/opportunity-briefs/[requestId]/route.ts`: admin mutation PATCH route.
- Create `app/components/product/OpportunityBriefForm.tsx`: public form and confirmation state.
- Create `app/components/product/OpportunityBriefDashboard.tsx`: metrics, filters, table, mutation coordination.
- Create `app/components/product/OpportunityBriefDetailDialog.tsx`: accessible request detail and admin controls.
- Modify `app/components/product/product.module.css`: mobile-first form/admin styles using existing tokens.
- Replace `app/join/page.tsx`: public Opportunity Brief page and source/UTM handoff.
- Create `app/network/join/page.tsx`: preserved magic-link join page.
- Modify `app/share/share-qr.ts`: tagged `bengaluru-meetup` destination.
- Modify `app/admin/discovery/page.tsx` and `app/admin/verifications/page.tsx`: shared admin navigation link.
- Create `app/admin/opportunity-briefs/page.tsx`: protected admin page and serialization.
- Add focused unit, route, component, integration, acceptance, and browser tests listed by task below.
- Modify `tests/e2e/product-v1.spec.ts` and `tests/e2e/mobile-pwa.spec.ts`: move account-entry expectations to `/network/join` and preserve network-only behavior for the new transactional `/join`.

## Task 1: Domain Contract and Discovery Identifier Reuse

**Files:**
- Create: `app/domain/opportunity-brief.ts`
- Modify: `app/domain/discovery.ts`
- Create: `tests/opportunity-brief-domain.test.ts`
- Modify: `tests/discovery-domain.test.ts`

- [ ] **Step 1: Write failing domain tests**

Cover the two participant values, seven statuses, exact transition graph, URL normalization, email normalization, accepted WhatsApp formats, contact requirement, field/body limits, source slug rules, five UTM keys, 20-entry history bound, and 8 KiB metadata bound. Add Discovery tests proving a company root domain maps to `website_host`, LinkedIn to `linkedin_url`, supported social profiles to `social_url`, and a stable non-root profile to `canonical`.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/opportunity-brief-domain.test.ts tests/discovery-domain.test.ts`

Expected: FAIL because the Opportunity Brief module and exported profile identifier classifier do not exist.

- [ ] **Step 3: Implement the minimum pure domain API**

Export these stable concepts:

```ts
export const opportunityBriefStatuses = [
  "submitted", "researching", "brief_ready", "contacted",
  "invited_to_join", "converted", "rejected",
] as const;

export const opportunityBriefInputSchema = z.strictObject({
  participantType: z.enum(["company", "creator"]),
  profileUrl: boundedProfileUrlSchema,
  email: optionalNormalizedEmailSchema,
  phoneNumber: optionalNormalizedWhatsappSchema,
  openToText: optionalBoundedTextSchema,
  source: optionalSourceSchema,
  utm: utmSchema,
  website: z.string().max(0), // honeypot
}).superRefine(requireEmailOrPhone);

export function transitionOpportunityBriefStatus(
  current: OpportunityBriefStatus,
  requested: OpportunityBriefStatus,
): OpportunityBriefStatus;
```

Expose `candidateIdentifierForProfileUrl(profileUrl)` from `app/domain/discovery.ts` by reusing the current normalization and host classification, not by duplicating URL rules.

- [ ] **Step 4: Run GREEN and refactor**

Run: `npx vitest run tests/opportunity-brief-domain.test.ts tests/discovery-domain.test.ts`

Expected: PASS with one behavior per test and no framework/database imports in either domain module.

- [ ] **Step 5: Commit**

```bash
git add app/domain/opportunity-brief.ts app/domain/discovery.ts tests/opportunity-brief-domain.test.ts tests/discovery-domain.test.ts
git commit -m "feat: define opportunity brief intake rules"
```

## Task 2: PostgreSQL Schema and Migration

**Files:**
- Modify: `db/schema.ts`
- Modify: `db/types.ts`
- Modify: `tests/schema.test.ts`
- Create: `drizzle/0005_opportunity_brief_requests.sql`
- Create: `drizzle/meta/0005_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Rename: `scripts/test-discovery-migrations.mjs` → `scripts/test-migrations.mjs`
- Modify: `package.json`

- [ ] **Step 1: Add failing schema contract tests**

Assert the two new enums, request and attempt table names, candidate `ON DELETE SET NULL` foreign key, contact check, positive submission check, unique participant/profile identity, requester-window indexes, admin filter indexes, and inferred type exports.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/schema.test.ts`

Expected: FAIL because the tables and enums do not exist.

- [ ] **Step 3: Add schema definitions**

Use the existing `discoveryCandidateTypeEnum` for `participant_type`. Add the exact fields and constraints from the approved design. Define bounded metadata types rather than untyped JSON. Attempts contain `id`, `requester_hash`, `request_id`, and `created_at`; raw IP data is never stored.

- [ ] **Step 4: Generate and inspect the named migration**

Run: `npm run db:generate -- --name opportunity_brief_requests`

Expected: Drizzle creates `drizzle/0005_opportunity_brief_requests.sql`, its snapshot, and one journal entry. Inspect SQL to confirm it only adds the approved enums, tables, constraints, indexes, and foreign keys.

- [ ] **Step 5: Run GREEN**

Generalize the migration harness before running it: read the ordered journal instead of hard-coding migration `0004` or a total count, assert contiguous indexes/tags, apply every migration to a fresh database, then build the upgrade database from all journal entries except the newest migration. Insert representative product and Discovery fixtures into that `0004` baseline, apply only the newest migration, and prove both fixture families survive alongside the new tables. Rename the script and keep `npm run test:migrations` as the stable command.

Run: `npx vitest run tests/schema.test.ts && npm run test:migrations && git diff --check`

Expected: PASS for schema contracts, fresh migration, `0004` → `0005` upgrade, preserved product/Discovery fixtures, and no handwritten/generated drift.

- [ ] **Step 6: Commit**

```bash
git add db/schema.ts db/types.ts tests/schema.test.ts drizzle package.json package-lock.json
git add -A scripts/test-discovery-migrations.mjs scripts/test-migrations.mjs
git commit -m "feat: persist opportunity brief requests"
```

## Task 3: Submission Service and Email Adapter

**Files:**
- Create: `app/server/opportunity-brief-service.ts`
- Modify: `app/server/email.ts`
- Create: `tests/opportunity-brief-service.test.ts`
- Modify: `tests/auth-service.test.ts`

- [ ] **Step 1: Write failing service tests with in-memory fakes**

Prove normalization is passed to the repository, the current submission alone forms the public confirmation, exact candidate linkage is accepted from the repository result, unmatched requests remain null, repeat requests do not expose stored contacts, the ninth attempt returns 429, transition/candidate-type/concurrency failures map correctly, and internal fields never enter public results.

Cover acknowledgement behavior: new email sends after persistence; same-email repeat does not resend; newly added/replaced email resets pending and sends once; WhatsApp-only is `not_requested`; sent/failed status is recorded; transport failure still returns success; missing credentials leave pending.

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/opportunity-brief-service.test.ts tests/auth-service.test.ts`

Expected: FAIL because the service and acknowledgement adapter do not exist.

- [ ] **Step 3: Define narrow ports and implement use cases**

The service-owned port includes only:

```ts
type OpportunityBriefRepository = {
  submit(input: SubmitRepositoryInput): Promise<SubmitRepositoryResult>;
  recordAcknowledgement(id: string, outcome: AcknowledgementOutcome): Promise<void>;
  getAdminSnapshot(actorTime: Date, filters: AdminFilters): Promise<AdminSnapshot>;
  getAdminRequest(requestId: string): Promise<AdminRequest | null>;
  getCandidateType(candidateId: string): Promise<"company" | "creator" | null>;
  applyAdminMutation(input: AtomicAdminMutation): Promise<AdminMutationResult>;
};
```

Keep validation in the domain and orchestration in the service. Administrator authorization reuses the normalized `ADMIN_EMAILS` set. Public success returns only current normalized input plus request id/status.

For status changes, the service reads the current request, applies `transitionOpportunityBriefStatus`, and passes both `expectedStatus` and client-supplied `expectedUpdatedAt` to `applyAdminMutation`. The repository performs one conditional update matching id, status, and updated time; zero updated rows return conflict. For candidate linking, the service reads candidate type, rejects a mismatch, and the same optimistic conditional update applies the link. Candidate type is immutable in the current Discovery model and the database foreign key protects existence. Notes/unlink use the same `expectedUpdatedAt` guard. The repository does not decide status policy.

- [ ] **Step 4: Reuse Resend without weakening auth**

Keep `createEmailSender` and strict production magic-link behavior intact. Extract shared Resend request/escaping helpers and add `createOpportunityBriefAcknowledgementSender`, which returns `sent`, `failed`, or `pending` and uses the approved subject/body.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run tests/opportunity-brief-service.test.ts tests/auth-service.test.ts`

Expected: PASS with auth regression behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add app/server/opportunity-brief-service.ts app/server/email.ts tests/opportunity-brief-service.test.ts tests/auth-service.test.ts
git commit -m "feat: orchestrate opportunity brief submissions"
```

## Task 4: Transactional Repository and Database Acceptance

**Files:**
- Create: `db/repositories/opportunity-brief-repository.ts`
- Create: `tests/opportunity-brief-repository.integration.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing guarded Postgres integration tests**

Using `mewtuals_test`, prove: initial insert; same normalized participant/profile upsert; submission count/history bound; eight-attempt rolling window and ninth rejection; concurrent duplicate submissions produce one row; exact candidate identifier linkage; unmatched null linkage; contacts indexed but different profile URLs remain separate; acknowledgement update; admin filters/summary; optimistic mutation conflict; transition enforcement delegated to service; candidate type mismatch rejection; link/unlink; and cleanup isolation.

- [ ] **Step 2: Select the test in database scripts and run RED**

Add the file to `test:db` and `test:acceptance`, exclude it from `test:unit`, then run:

`npm run db:test:prepare && DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals_test npx vitest run --no-file-parallelism tests/opportunity-brief-repository.integration.test.ts`

Expected: FAIL because the concrete repository does not exist.

- [ ] **Step 3: Implement transaction boundaries**

Use a requester-hash advisory transaction lock, count attempts newer than 15 minutes, and insert the attempt only after an accepted created/merged request. Use the unique participant/profile constraint as the idempotency backstop. Perform the candidate identifier lookup inside the transaction and use `ON DELETE SET NULL` linkage. Bound source history before writing JSON.

Admin queries use parameterized Drizzle expressions, `Asia/Kolkata` day bounds supplied by the service, maximum page size 100, and never select requester hashes or attempt rows into public/admin UI models.

Implement `getAdminRequest`, `getCandidateType`, and `applyAdminMutation` with the conditional contracts defined in Task 3; integration tests must create a real race by updating `updated_at` between read and mutation and observe `conflict`.

- [ ] **Step 4: Run GREEN and migration rehearsal**

Run the focused integration test twice after a fresh `db:test:prepare` to prove cleanup/idempotency, then run `npm run test:db`.

Expected: PASS; migrations apply cleanly and all existing product/discovery database suites remain green.

- [ ] **Step 5: Commit**

```bash
git add db/repositories/opportunity-brief-repository.ts tests/opportunity-brief-repository.integration.test.ts package.json package-lock.json
git commit -m "feat: store and deduplicate opportunity briefs"
```

## Task 5: Public API, `/join` UI, Preserved Member Entry, and Tagged QR

**Files:**
- Create: `app/server/opportunity-brief-route.ts`
- Create: `app/server/opportunity-brief.ts`
- Create: `app/api/opportunity-briefs/route.ts`
- Create: `app/components/product/OpportunityBriefForm.tsx`
- Modify: `app/components/product/product.module.css`
- Replace: `app/join/page.tsx`
- Create: `app/network/join/page.tsx`
- Modify: `app/share/share-qr.ts`
- Create: `tests/opportunity-brief-routes.test.ts`
- Create: `tests/opportunity-brief-form.test.tsx`
- Modify: `tests/product-pages.test.tsx`
- Modify: `tests/share-page.test.tsx`
- Modify: `tests/pwa.test.tsx`
- Modify: `tests/e2e/product-v1.spec.ts`
- Modify: `tests/e2e/mobile-pwa.spec.ts`

- [ ] **Step 1: Write failing route and UI tests**

Route tests cover same-origin, JSON content type, 16 KiB body cap with/without `Content-Length`, malformed JSON, honeypot, validation errors, 429, safe confirmation, and unexpected failures. UI tests cover exact copy, accessible labels, participant choices, one-contact requirement, loading/error focus, current-submission confirmation, source/UTM handoff, and no auth redirect.

Regression tests prove `/network/join` renders the old MagicLink form, `/login` remains unchanged, `/share` decodes exactly to `https://mewtuals.com/join?source=bengaluru-meetup`, and `/join` remains absent from the PWA cache allowlist.

Update the existing browser helpers and assertions in `tests/e2e/product-v1.spec.ts` and `tests/e2e/mobile-pwa.spec.ts`: member creation/magic-link requests navigate to `/network/join`; public navigation that intentionally enters acquisition remains `/join`; signed-out member-route redirects continue to `/login`; offline navigation to `/join` continues to use the network-required fallback and never exposes submitted data.

- [ ] **Step 2: Run RED**

Run the five focused test files. Expected: FAIL because the public route/form/member route and tagged destination do not exist.

- [ ] **Step 3: Implement bounded route and composition**

Follow `discovery-route.ts` bounded-reader style at 16 KiB, reuse `assertSameOrigin` and `requesterIdentityForRequest`, hash requester identity with the session secret, and wire the concrete repository and optional acknowledgement sender in `app/server/opportunity-brief.ts`.

- [ ] **Step 4: Implement the mobile-first public experience**

Use `ProductShell`, route-scoped product styles, a focused client form, exact approved copy, `inputMode`, autocomplete, 44px controls, error summary focus, and success heading focus. Parse only the accepted query keys in the server page. Do not fetch the profile or initiate authentication.

Move the old `app/join/page.tsx` implementation unchanged to `/network/join`; update only tests/links that explicitly represent an administrator invitation. Public acquisition links continue to `/join`.

- [ ] **Step 5: Run GREEN**

Run:

`npx vitest run tests/opportunity-brief-routes.test.ts tests/opportunity-brief-form.test.tsx tests/product-pages.test.tsx tests/share-page.test.tsx tests/pwa.test.tsx`

Expected: PASS with the QR decoder proving the tagged destination.

- [ ] **Step 6: Commit**

```bash
git add app/server/opportunity-brief-route.ts app/server/opportunity-brief.ts app/api/opportunity-briefs/route.ts app/components/product/OpportunityBriefForm.tsx app/components/product/product.module.css app/join/page.tsx app/network/join/page.tsx app/share/share-qr.ts tests/opportunity-brief-routes.test.ts tests/opportunity-brief-form.test.tsx tests/product-pages.test.tsx tests/share-page.test.tsx tests/pwa.test.tsx tests/e2e/product-v1.spec.ts tests/e2e/mobile-pwa.spec.ts
git commit -m "feat: launch public opportunity brief intake"
```

## Task 6: Administrator Queue and Mutations

**Files:**
- Create: `app/server/opportunity-brief-admin-route.ts`
- Create: `app/api/admin/opportunity-briefs/route.ts`
- Create: `app/api/admin/opportunity-briefs/[requestId]/route.ts`
- Create: `app/admin/opportunity-briefs/page.tsx`
- Create: `app/components/product/OpportunityBriefDashboard.tsx`
- Create: `app/components/product/OpportunityBriefDetailDialog.tsx`
- Modify: `app/components/product/product.module.css`
- Modify: `app/admin/discovery/page.tsx`
- Modify: `app/admin/verifications/page.tsx`
- Create: `tests/opportunity-brief-admin-routes.test.ts`
- Create: `tests/opportunity-brief-dashboard.test.tsx`
- Create: `tests/opportunity-brief-admin-page.test.tsx`

- [ ] **Step 1: Write failing admin tests**

Prove signed-out 401/redirect, non-admin 403/redirect, same-origin PATCH, strict filter parsing, India-local dates, metrics and table fields, pagination, accessible detail dialog/focus return, status graph, notes, exact candidate UUID link, type mismatch, unlink, optimistic conflict, feedback states, and no private attempt/requester data.

- [ ] **Step 2: Run RED**

Run the three focused admin test files. Expected: FAIL because routes/page/components do not exist.

- [ ] **Step 3: Implement thin admin adapters**

Implement admin HTTP behavior only in `app/server/opportunity-brief-admin-route.ts`; do not add admin branches to the public route adapter from Task 5. Reuse current session reading and the Opportunity Brief service administrator check. GET returns the serialized snapshot; PATCH accepts one strict mutation object containing `expectedUpdatedAt` and exactly one of status, notes, linked candidate UUID, or unlink.

- [ ] **Step 4: Implement the page and focused components**

Keep the dashboard component responsible for filters/table/mutation coordination and the dialog responsible for detail/actions. Add Opportunity Brief navigation to all three admin pages. Candidate linking is a validated UUID field with a link to Discovery admin; do not build search/typeahead.

- [ ] **Step 5: Run GREEN**

Run: `npx vitest run tests/opportunity-brief-admin-routes.test.ts tests/opportunity-brief-dashboard.test.tsx tests/opportunity-brief-admin-page.test.tsx`

Expected: PASS, including accessible dialog behavior and concurrency feedback.

- [ ] **Step 6: Commit**

```bash
git add app/server/opportunity-brief-admin-route.ts app/api/admin/opportunity-briefs/route.ts app/api/admin/opportunity-briefs/\[requestId\]/route.ts app/admin/opportunity-briefs/page.tsx app/components/product/OpportunityBriefDashboard.tsx app/components/product/OpportunityBriefDetailDialog.tsx app/components/product/product.module.css app/admin/discovery/page.tsx app/admin/verifications/page.tsx tests/opportunity-brief-admin-routes.test.ts tests/opportunity-brief-dashboard.test.tsx tests/opportunity-brief-admin-page.test.tsx
git commit -m "feat: operate opportunity briefs from admin"
```

## Task 7: Complete Journey, Mobile Browser, and Regression Gates

**Files:**
- Create: `tests/opportunity-brief.acceptance.integration.test.ts`
- Create: `tests/e2e/opportunity-brief.spec.ts`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/product-v1-operations.md`

- [ ] **Step 1: Write acceptance and browser tests**

The database acceptance test submits a tagged unmatched request, proves one durable row and null candidate linkage, repeats it idempotently, links an existing source-supported candidate, performs administrator transitions/notes/link/unlink, and proves authenticated onboarding data remains separate.

The 390×844 browser test submits in under 30 seconds without auth, checks no overflow and 44px controls, sees exact confirmation/current contact, then signs in as a configured development administrator and finds the request in `/admin/opportunity-briefs`. It also opens `/network/join` and proves magic-link account entry still works.

- [ ] **Step 2: Run RED, then make only wiring/documentation fixes**

Add the database acceptance file to `test:acceptance` and `test:db`, explicitly add `--exclude tests/opportunity-brief.acceptance.integration.test.ts` to `test:unit`, and add the browser file to `test:e2e`. Run them and fix only integration gaps, accessible names, documented commands, or environment setup—not new product scope.

- [ ] **Step 3: Run complete local release gates**

Run fresh:

```bash
npm test
npm run test:migrations
npm run test:db
npm run test:acceptance
npm run test:e2e
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0; existing login, onboarding, verification, Discovery Agent, mobile, offline, and dashboard journeys remain green.

- [ ] **Step 4: Manually inspect the rendered mobile flow**

Use the approved Playwright wrapper at 390×844. Capture `/join`, submit a representative request, inspect confirmation, verify no console errors/overflow, and confirm the `/share` QR points to the tagged route.

- [ ] **Step 5: Commit**

```bash
git add tests/opportunity-brief.acceptance.integration.test.ts tests/e2e/opportunity-brief.spec.ts package.json package-lock.json README.md docs/product-v1-operations.md
git commit -m "test: verify opportunity brief journey"
```

## Task 8: Production Migration and Sites Release

**Files:**
- Modify only files required by real release failures.

- [ ] **Step 1: Obtain a fresh final review**

Review the complete diff against the approved spec. Fix every Critical/Important issue and re-run affected tests.

- [ ] **Step 2: Prepare exact committed release source**

Run `npm run prepare:sites -- HEAD`, validate the generated request/digest, and verify the worktree is clean. Reconcile the target onto the current Sites source branch without force-pushing unrelated history.

- [ ] **Step 3: Apply the production Postgres migration before code deployment**

Treat this as an explicit release gate, not a routine local command:

1. In the managed Postgres provider, verify automated backups and the active point-in-time-recovery window, then create an on-demand snapshot. If the provider cannot create or identify a restorable backup, stop.
2. Record the current Sites live commit/version and query the production Drizzle migration journal plus `information_schema` before mutation. Preserve this evidence outside the repository release artifact.
3. Obtain the production URL through the approved secret channel without printing or persisting it. If it is available only inside Sites and cannot be used by the guarded migration process, stop and report the deployment blocker.
4. Apply exactly:

   `DATABASE_URL="$MEWTUALS_PRODUCTION_DATABASE_URL" npm run db:migrate`

5. Query the Drizzle journal, both new tables, both new enums, the unique profile identity, contact check, foreign keys, and required indexes. Confirm existing user/profile/discovery row counts remain unchanged.

Drizzle executes the migration transactionally; any error blocks code deployment. Application rollback remains source-only because `0005` is additive and backward compatible. Do not drop new production objects to roll back. If data recovery is required, restore the on-demand snapshot to an isolated database first, validate it, and coordinate a provider-level restore before changing live traffic.

- [ ] **Step 4: Deploy through the existing public Sites project**

Push the exact validated SHA to the credential-returned Sites branch, package the matching build, save one version, deploy with the user's standing authorization to publish this requested feature, and poll to terminal success.

- [ ] **Step 5: Verify production end to end**

Verify active SSL and HTTP 200 for apex and `www`; `/share` decodes to tagged `/join`; submit a controlled production request; verify immediate confirmation and its row in the authenticated admin queue; verify acknowledgement state; remove or clearly label the controlled record according to the operations procedure; confirm `/network/join`, `/login`, and existing member routes remain reachable.
