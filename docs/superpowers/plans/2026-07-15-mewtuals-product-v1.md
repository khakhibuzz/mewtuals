# Mewtuals Product v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete PostgreSQL-backed Mewtuals v1 loop from passwordless sign-in through profile, verification, signal, curated opportunities, and a persisted request for Mewtuals to advance a relationship.

**Architecture:** Keep the existing landing page intact and place the product in dedicated routes. Framework-free domain modules own identity/profile generation, matching, and workflow rules; thin route handlers call application services; PostgreSQL repositories own durable state. Localhost runs against project-local PostgreSQL 16 while production uses the same schema through `DATABASE_URL`.

**Tech Stack:** Vinext/React 19, TypeScript, PostgreSQL 16, Drizzle ORM, Postgres.js, Zod, Vitest, Playwright CLI.

---

## File Structure

- `app/domain/` — pure validation, identity, profile-generation, matching, and status rules.
- `app/server/` — environment, token hashing, email delivery, session access, authorization, and use-case orchestration.
- `db/` — PostgreSQL schema, client, typed repositories, and seed catalogue.
- `app/api/` — thin JSON/form route adapters.
- `app/components/product/` — product shell, forms, cards, status UI.
- `app/(product)/` — public auth and protected onboarding/dashboard/admin routes.
- `scripts/` — local PostgreSQL lifecycle, migration, and seed commands.
- `tests/` — pure unit tests, PostgreSQL integration tests, and browser-flow coverage.

### Task 1: PostgreSQL foundation and local runtime

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `drizzle.config.ts`
- Replace: `db/schema.ts`
- Replace: `db/index.ts`
- Create: `db/client.ts`
- Create: `db/types.ts`
- Create: `db/seed-data.ts`
- Create: `scripts/local-postgres.mjs`
- Create: `scripts/db-migrate.mjs`
- Create: `scripts/db-seed.mjs`
- Create: `.dev.vars.example`
- Create: `.env.example`
- Test: `tests/schema.test.ts`

- [ ] Write a failing schema contract test that imports every required table and asserts required uniqueness/status columns exist.
- [ ] Run `npx vitest run tests/schema.test.ts` and verify RED because the PostgreSQL tables do not exist.
- [ ] Install `postgres`, `zod`, and `tsx`; keep Drizzle as the ORM.
- [ ] Define UUID-backed PostgreSQL tables: `users`, `magicLinks`, `sessions`, `profiles`, `verificationReviews`, `signals`, `opportunities`, `profileOpportunities`, and `introductionRequests`.
- [ ] Add foreign keys, ownership uniqueness, idempotency uniqueness, timestamps, indexes for token/status lookups, and explicit text status checks in the generated migration.
- [ ] Implement `getDb()` behind one `DATABASE_URL` check using Postgres.js with `max: 1`, `prepare: false`, and short idle/connect timeouts for Worker compatibility.
- [ ] Implement `scripts/local-postgres.mjs start|stop|status` using the installed PostgreSQL 16 binaries, project-local `.local-postgres/data`, host `127.0.0.1`, and port `55432`; initialize with local-only trust auth and create database `mewtuals` idempotently.
- [ ] Configure Drizzle for `dialect: "postgresql"` and migration output `drizzle/`.
- [ ] Add `db:start`, `db:stop`, `db:status`, `db:generate`, `db:migrate`, `db:seed`, and `db:setup` scripts.
- [ ] Add aligned blank configuration keys to both example environment files.
- [ ] Start PostgreSQL, generate the migration, inspect it, migrate, seed the catalogue, and rerun the schema test GREEN.
- [ ] Commit: `feat: add PostgreSQL foundation`.

### Task 2: Domain rules for identity, profiles, and curated fit

**Files:**
- Create: `app/domain/identity.ts`
- Create: `app/domain/profile.ts`
- Create: `app/domain/signal.ts`
- Create: `app/domain/matching.ts`
- Create: `app/domain/workflow.ts`
- Test: `tests/identity.test.ts`
- Test: `tests/profile.test.ts`
- Test: `tests/matching.test.ts`
- Test: `tests/workflow.test.ts`

- [ ] Write failing tests for organisation/creator subtype validation, safe URL normalization, deterministic domain/handle-to-name generation, signal validation, explicit status transitions, no-match output, maximum three picks, and all four partnership directions.
- [ ] Run the four focused test files and verify RED because domain modules are absent.
- [ ] Implement Zod schemas at the input boundary and small typed functions with no framework/database imports.
- [ ] Reject non-HTTP(S), credential-bearing, localhost/private-network, and malformed source URLs.
- [ ] Generate an editable profile draft only from user-supplied URL/name evidence; never fetch or invent external facts.
- [ ] Implement explicit transitions `draft → pending → verified|waitlisted`; reject invalid transitions.
- [ ] Implement deterministic opportunity scoring from identity/subtype plus signal-interest overlap; return only passing fits, sort deterministically, and cap at three.
- [ ] Rerun focused tests GREEN and commit: `feat: model participant and opportunity rules`.

### Task 3: PostgreSQL repositories and authentication service

**Files:**
- Create: `db/repositories/auth-repository.ts`
- Create: `db/repositories/profile-repository.ts`
- Create: `db/repositories/opportunity-repository.ts`
- Create: `app/server/env.ts`
- Create: `app/server/tokens.ts`
- Create: `app/server/request-security.ts`
- Create: `app/server/email.ts`
- Create: `app/server/auth-service.ts`
- Create: `app/server/session.ts`
- Create: `app/api/auth/magic-link/route.ts`
- Create: `app/auth/verify/route.ts`
- Create: `app/api/auth/logout/route.ts`
- Test: `tests/tokens.test.ts`
- Test: `tests/auth-service.test.ts`
- Test: `tests/db.integration.test.ts`

- [ ] Write failing token/auth tests for random opaque tokens, HMAC hashing, normalized email, 15-minute single-use magic links, 60-second request throttling, 30-day sessions, expired/consumed rejection, and session lookup.
- [ ] Write a PostgreSQL integration test that cleans test-owned records, runs create/consume/reuse flows, and verifies constraints.
- [ ] Run focused tests and verify RED.
- [ ] Implement repositories as the only SQL owners; route handlers must not import schema/query builders.
- [ ] Implement Resend HTTPS delivery with a local-development response link and a generic production response.
- [ ] Implement same-origin checking for every state-changing endpoint.
- [ ] Set the session cookie as opaque, `HttpOnly`, `SameSite=Lax`, path `/`, 30-day max age, and secure outside localhost.
- [ ] Make magic-link consumption atomic and idempotently reject reuse.
- [ ] Run unit and PostgreSQL integration tests GREEN and commit: `feat: add passwordless authentication`.

### Task 4: Sign-in and onboarding experience

**Files:**
- Create: `app/components/product/ProductShell.tsx`
- Create: `app/components/product/MagicLinkForm.tsx`
- Create: `app/components/product/IdentityForm.tsx`
- Create: `app/components/product/SourceForm.tsx`
- Create: `app/components/product/ProfileConfirmForm.tsx`
- Create: `app/components/product/VerificationSubmit.tsx`
- Create: `app/components/product/product.module.css`
- Create: `app/join/page.tsx`
- Create: `app/login/page.tsx`
- Create: `app/onboarding/identity/page.tsx`
- Create: `app/onboarding/source/page.tsx`
- Create: `app/onboarding/profile/page.tsx`
- Create: `app/onboarding/verification/page.tsx`
- Create: `app/api/onboarding/identity/route.ts`
- Create: `app/api/onboarding/source/route.ts`
- Create: `app/api/onboarding/profile/route.ts`
- Create: `app/api/verification/submit/route.ts`
- Test: `tests/onboarding-service.test.ts`
- Test: `tests/product-ui.test.tsx`

- [ ] Write failing service/UI tests for the ordered onboarding gates, two top-level identity choices, all subtypes, source requirements by identity, editable generated profile fields, confirm action, and pending submission.
- [ ] Run focused tests and verify RED.
- [ ] Implement protected server pages that derive the current user from the session cookie and redirect to the correct next incomplete step.
- [ ] Keep forms small and progressive; use the landing page's warm paper, charcoal, grid lines, restrained type, and negative space without copying marketing sections into the app.
- [ ] Return field-specific accessible errors and preserve submitted values on recoverable failures.
- [ ] Persist identity, normalized sources, generated profile, user edits, confirmation, and verification status through repository-backed services.
- [ ] Run focused tests GREEN and commit: `feat: build member onboarding flow`.

### Task 5: Verification operations and pending dashboard

**Files:**
- Create: `app/server/verification-service.ts`
- Create: `app/admin/verifications/page.tsx`
- Create: `app/components/product/VerificationQueue.tsx`
- Create: `app/api/admin/verifications/[profileId]/route.ts`
- Create: `app/api/dev/verification/approve/route.ts`
- Create: `app/components/product/PendingDashboard.tsx`
- Create: `app/dashboard/page.tsx`
- Test: `tests/verification-service.test.ts`
- Test: `tests/pending-dashboard.test.tsx`

- [ ] Write failing tests for admin allowlist enforcement, pending-to-verified/waitlisted transitions, review audit records, production denial of dev approval, and pending UI containing one labelled example plus exactly four coming-soon cards.
- [ ] Run focused tests and verify RED.
- [ ] Implement `/admin/verifications` for `ADMIN_EMAILS` only, with approve/waitlist notes.
- [ ] Implement local-only simulate approval through the same verification service, hard-disabled when `NODE_ENV=production` or `MEWTUALS_DEV_AUTH` is not true.
- [ ] Ensure pending/waitlisted API and UI responses never include real opportunity/counterparty records.
- [ ] Run focused tests GREEN and commit: `feat: add member verification workflow`.

### Task 6: Signals, curated picks, and relationship advancement

**Files:**
- Create: `app/server/dashboard-service.ts`
- Create: `app/components/product/SignalForm.tsx`
- Create: `app/components/product/OpportunityCard.tsx`
- Create: `app/components/product/VerifiedDashboard.tsx`
- Create: `app/api/signal/route.ts`
- Create: `app/api/opportunities/[opportunityId]/advance/route.ts`
- Test: `tests/dashboard-service.test.ts`
- Test: `tests/verified-dashboard.test.tsx`
- Extend: `tests/db.integration.test.ts`

- [ ] Write failing tests for persisted availability/interests/note, verified-only opportunity access, deterministic zero-to-three picks, non-searchable presentation, and idempotent introduction requests.
- [ ] Run focused tests and verify RED.
- [ ] Implement signal upsert and opportunity assignment inside a transaction after verification/signal changes.
- [ ] Render at most three opportunity cards with direction, counterparty type, timing rationale, reciprocal value, and no private real-world identity.
- [ ] Implement `Ask Mewtuals to advance this` as an idempotent request; subsequent renders show `Mewtuals is reviewing the relationship`.
- [ ] Implement the valid empty state `No strong fit is ready yet`.
- [ ] Run unit and database integration tests GREEN and commit: `feat: unlock curated partnership picks`.

### Task 7: Strategic landing-page entry points

**Files:**
- Modify: `app/components/SiteHeader.tsx`
- Modify: `app/components/Hero.tsx`
- Modify: `app/components/ForStartups.tsx`
- Modify: `app/components/ApplySection.tsx`
- Modify: `app/globals.css` only for CTA styling if existing classes are insufficient
- Test: `tests/navigation.test.tsx`
- Test: `tests/rendered-html.test.mjs`

- [ ] Update tests first to require `/join`, `/login`, creator entry, and product CTAs while retaining all existing section ids, copy, graph, case studies, and layout assertions.
- [ ] Run focused tests and verify RED.
- [ ] Add header links `For creators`, `Join Mewtuals`, and `Log in` without changing section order or wordmark behavior.
- [ ] Route the hero primary CTA to `/join`; retain the explanatory CTA.
- [ ] Add one restrained `Join Mewtuals` CTA inside the existing For Startups content and one post-qualification continuation inside Apply.
- [ ] Run focused and full landing tests GREEN; inspect diff to ensure no public section restructuring.
- [ ] Commit: `feat: connect landing page to product flow`.

### Task 8: Configuration, documentation, and complete verification

**Files:**
- Rewrite: `README.md`
- Create: `docs/product-v1-operations.md`
- Create: `tests/e2e/product-v1.spec.ts` or equivalent Playwright CLI script
- Modify: `app/layout.tsx` for product metadata only if needed
- Create: `public/og.png` only if a generated social card passes exact-text inspection

- [ ] Document local PostgreSQL start/setup, development magic link, local approval, production `DATABASE_URL`, Resend configuration, admin allowlist, deferred Google keys, migrations, backups, and deployment notes.
- [ ] Start PostgreSQL and run `npm run db:setup` from a clean database.
- [ ] Run `npm test`, `npm run test:db`, `npm run lint`, `npm run build`, and `git diff --check`.
- [ ] Start the app on localhost and exercise the complete flow with a fresh email: sign in, identity, source, generated profile edit, confirm, submit, pending state, simulate approval, save signal, receive picks, advance one, refresh, logout, and sign back in.
- [ ] Verify mobile 390×844 and desktop 1440×1100, keyboard navigation, labels/errors, protected-route redirects, zero console errors, and HTTP 200.
- [ ] Verify PostgreSQL directly: durable profile, signal, verification audit, assigned picks, one idempotent introduction request, no plaintext auth/session tokens.
- [ ] Build the Sites-compatible bundle. If hosted PostgreSQL and email credentials are absent, do not claim the deployed authenticated flow is production-ready; keep localhost as the verified working environment and list the exact required values.
- [ ] Stage only product-v1 source, migrations, tests, docs, and examples; exclude `.openai/hosting.json`, `.dev.vars`, and `.local-postgres`.
- [ ] Commit: `feat: deliver Mewtuals product v1`.
- [ ] Tag the completed commit `product-v1` while preserving `website-v1`, `website-v2`, and `website-v3`.
