# Mewtuals Discovery Agent V1 Design

**Date:** 2026-07-22
**Status:** Approved for implementation

## Goal

Extend the existing Mewtuals product with a persistent Discovery Agent that
collects potential companies and creators, deduplicates them in PostgreSQL,
and gives administrators a usable review queue. Codex is the initial external
discovery worker so V1 needs no additional search-provider subscription. The
worker boundary must be replaceable by Exa, OpenAI web search, YouTube, or
other adapters after the first client without changing the database or admin
workflow.

Discovery identifies candidates only. Profile enrichment, verification,
matching, outreach, and autonomous status advancement are out of scope.

## Existing Architecture to Reuse

The implementation extends the current product instead of creating a parallel
system:

- Vinext/Next server pages and route handlers remain the delivery layer.
- `app/domain/` owns framework-free validation and normalization rules.
- `app/server/` owns authorization and use-case orchestration.
- `db/repositories/` remains the only owner of PostgreSQL queries.
- Drizzle schema and ordered migrations remain the database contract.
- `getCurrentSession()` plus `ADMIN_EMAILS` remain the administrator boundary.
- `ProductShell` and `product.module.css` remain the admin component system.
- Sites remains the deployment target and Neon/PostgreSQL remains the sole
  source of truth.

No LangGraph runtime, second database, browser storage, alternate auth stack,
or general-purpose agent framework is introduced.

## System Boundary

```text
Codex scheduled task
  -> claim one queued/daily discovery run
  -> search permitted public web sources
  -> submit a validated DiscoveryBatch
  -> Mewtuals Discovery service
  -> normalize and deduplicate
  -> PostgreSQL transaction
  -> admin discovery dashboard
```

The application owns configuration, persistence, deduplication, run state,
authorization, and review. Codex owns only public-web candidate collection and
candidate-level extraction. This is the provider seam: a future adapter only
needs to produce the same `DiscoveryBatch` contract.

## Discovery Configuration

Configuration is parsed once at the server boundary and returned to a claimed
worker run. Initial defaults are deliberately bounded:

- Geographies: `India`
- Candidates per run: `20`
- Allocation: `10` companies and `10` creators
- Enabled source: `codex_web`
- Company categories: startups, consumer brands, AI, technology,
  creator economy, wellness, fashion, hardware, productivity, fintech
- Creator categories: technology, startups/business, AI, consumer products,
  lifestyle, wellness, fashion, finance, podcasts/interviews
- Run cadence: daily at 08:30 Asia/Kolkata

The company count is `round(total * companyPercentage / 100)`, clamped to the
inclusive range from zero to the total. The creator count is the remainder, so
allocation always adds up to the requested total even when the total is odd.

Environment variables may override geography, category lists, total count,
company percentage, enabled sources, worker secret, and worker API base URL.
Changing these values must not change discovery service logic.

## Worker Protocol

### Claim

The worker calls a secret-protected claim endpoint. The server:

1. Rejects an invalid bearer secret with no database work.
2. Marks expired running leases as failed.
3. Claims the oldest administrator-queued run if one exists.
4. Otherwise creates or returns the idempotent daily run for the current local
   date, geography, and candidate allocation.
5. Refuses a second active run while a valid lease exists.
6. Returns the run id, lease token, structured configuration, prompt version,
   and output schema.

An authenticated claim may explicitly request `trial` instead of `scheduled`.
That creates a unique trial run and is used only by the documented first-run
command and acceptance test. Administrator requests create `manual` runs;
scheduled claims consume those queued runs before creating their normal daily
run.

The daily run has a stable external key, so repeated scheduled invocations do
not create repeated runs. A lease expires after two hours so a crashed Codex
task cannot block future work forever.

### Discover

Codex searches public web results, public company or portfolio pages, public
directories, public websites, public creator pages, YouTube/public podcast
pages, and public social-profile links. It must not use brittle authenticated
scraping or claim facts that its sources do not support.

Every candidate includes:

- `type`: `company` or `creator`
- `name`
- at least one stable public canonical URL
- optional website, primary social, and LinkedIn URLs
- a concise discovered description
- category and optional subcategory
- geography
- source name and source URL
- confidence score from 0 to 100
- raw source metadata limited to discovery evidence

The worker is instructed to return fewer candidates when evidence is weak. It
must never pad a batch or invent profile-enrichment data.

The submitted `DiscoveryBatch` envelope is:

```json
{
  "runId": "uuid",
  "leaseToken": "opaque token",
  "promptVersion": "codex-web-v1",
  "candidates": [],
  "sourceErrors": [
    { "sourceName": "string", "message": "bounded failure summary" }
  ]
}
```

The server rejects mismatched run ids, lease tokens, prompt versions, and
batches larger than the claimed allocation before persistence begins.

### Submit

The worker submits one bounded batch with the run id and lease token. The
server validates the complete batch before writing. Inside a transaction it:

1. Normalizes names and URLs.
2. Resolves candidates by stable canonical identity.
3. Inserts genuinely new candidates.
4. Updates `last_seen_at`, latest run, maximum confidence, and evidence for
   known candidates without resetting an administrator decision.
5. Upserts source evidence so multiple sources remain inspectable.
6. Completes the run with found/new/duplicate counts and source errors.

Submission is idempotent. Replaying the same completed run returns its recorded
result and does not write candidates again. Partial source failures produce a
`partial` run when at least one candidate was processed and `failed` when none
could be processed.

### Local Worker Commands

Repository scripts wrap claim and submit operations so the scheduled prompt
does not reimplement authentication or HTTP details:

- `npm run discovery:claim`
- `npm run discovery:validate -- --file <batch.json>`
- `npm run discovery:submit -- --run-id <id> --lease-token <token> --file <batch.json>`
- `npm run discovery:fail -- --run-id <id> --lease-token <token> --message <message>`

The scripts load the existing local environment file, redact secrets from
output, fail non-zero on invalid server responses, and never write application
state outside PostgreSQL.

## Database Model

### `discovery_candidates`

- UUID primary key
- type enum: `company | creator`
- name and normalized name
- canonical identity key and canonical URL
- website, primary social, and LinkedIn URLs when known
- discovered description
- category and optional subcategory
- geography
- first source name and URL
- discovered, last-seen, created, and updated timestamps
- most recent discovery run id
- discovery confidence score constrained to 0-100
- status enum: `discovered | shortlisted | rejected | queued_for_profile`
- raw metadata JSONB
- unique `(type, canonical_identity_key)` constraint
- indexes for type, geography, category, source, status, and discovery date

The canonical identity hierarchy is explicit. For a company, prefer its
official website host, then a normalized LinkedIn company profile, then a
stable primary social or public-directory organisation profile. For a creator,
prefer a stable YouTube, podcast, or primary social profile, then a personal
website or LinkedIn profile. Search-result, news-article, and generic directory
listing pages are evidence URLs, not candidate identities, and a candidate
without one acceptable identity is rejected. URL normalization lowercases
hosts, removes `www`, fragments, default ports, tracking parameters, duplicate
trailing slashes, and sorts retained query parameters. A website, social URL,
or LinkedIn URL can also match an existing candidate. Name-only equality is not
allowed to merge two records because it can collapse unrelated people or
companies.

### `discovery_candidate_sources`

- UUID primary key
- candidate and discovery run foreign keys
- source name and source URL
- first-seen and last-seen timestamps
- source-specific raw metadata JSONB
- unique `(candidate_id, source_name, source_url)` constraint

This table preserves multi-source evidence without turning `raw_metadata` into
a concurrency-sensitive source of truth.

### `discovery_runs`

- UUID primary key
- stable external run key
- trigger: `scheduled | manual | trial`
- status: `queued | running | succeeded | partial | failed`
- started, completed, created, and updated timestamps
- lease token hash and lease expiry
- geography and candidate type (`company | creator | both`)
- sources used
- requested count and company percentage
- found, new, and duplicate counts
- structured error/log summary JSONB
- administrator requester email when manually queued

Only the lease hash is stored. An active-run constraint plus transaction-level
claiming protects against simultaneous jobs.

## Application Services

`app/domain/discovery.ts` owns candidate input validation, URL normalization,
identity-key construction, filter/status vocabulary, and batch limits. It has
no framework or database imports.

`app/server/discovery-service.ts` owns the use cases:

- claim a daily or queued run
- complete or fail a leased run
- list summary, runs, and filtered candidates for an administrator
- queue a manual run
- change candidate status

The service accepts repository, clock, token, and configuration dependencies so
unit tests can exercise behavior without PostgreSQL or network access.

`db/repositories/discovery-repository.ts` implements atomic claims,
deduplication, evidence upserts, run statistics, list queries, and status
updates with Drizzle/PostgreSQL.

## HTTP and Authorization

Administrator endpoints use the existing session and `ADMIN_EMAILS` allowlist,
plus same-origin protection for mutations:

- `POST /api/admin/discovery/runs` queues a manual run.
- `PATCH /api/admin/discovery/candidates/:candidateId` changes status.

Worker endpoints do not use browser sessions. They require a constant-time
comparison against `DISCOVERY_WORKER_SECRET`, a valid run id, and a one-time
lease token:

- `POST /api/discovery/worker/claim`
- `POST /api/discovery/worker/runs/:runId/complete`
- `POST /api/discovery/worker/runs/:runId/fail`

Responses never expose stored token hashes, database details, unrelated
candidates, or secret configuration.

## Admin Dashboard

`/admin/discovery` extends the existing admin shell and remains available only
to configured administrators.

The page contains:

- total discovered companies
- total discovered creators
- candidates first discovered today
- latest run status and completion time
- duplicates skipped by the latest run
- a manual `Run Discovery` action that queues a Codex run and clearly reports
  that it is waiting for the worker
- filters for type, geography, category, source, status, and discovery date
- a server-filtered candidate table with name, type, category, geography,
  source, discovered date, confidence, status, and relevant links
- an accessible detail drawer showing exactly the known discovery fields and
  all evidence links
- status actions for shortlisted, rejected, and queued for profile
- a compact recent-run list including partial/failed results and error summary

The dashboard reuses the warm paper, charcoal, grid, typography, spacing, form,
button, and responsive patterns already used by verification operations. It
does not introduce a generic analytics theme or fake enrichment fields.

## Daily Codex Task

A standalone local scheduled task runs every day at 08:30 Asia/Kolkata against
the Mewtuals project. It:

1. Executes the claim command.
2. Stops successfully when the server reports no work.
3. Follows the returned configuration and repository runbook.
4. Uses public web search to collect source-supported candidates.
5. Writes a temporary JSON batch outside the repository.
6. Validates and submits it through the repository scripts.
7. Calls the failure command if it claimed a run but cannot submit a valid
   batch.
8. Reports the run id and persisted counts in Scheduled.

The task runs in the local project so its ignored environment file is
available. The computer and ChatGPT desktop app must be running. This is an
accepted pre-client constraint. A later paid provider moves the same protocol
into a continuously available server-side worker.

## Failure Handling

- Invalid candidate entries reject the batch before writes.
- Individual source errors are stored and do not discard valid candidates.
- A duplicate submission is a successful no-op.
- A stale running lease is failed before new work is claimed.
- A worker cannot complete a run with the wrong or expired lease.
- Candidate status changes are compare-and-update operations; an administrator
  decision is never overwritten by rediscovery.
- Missing database or worker configuration fails clearly.
- Admin empty states distinguish no candidates, no matching filters, a queued
  run, and a failed run.

## Testing and Verification

### Unit tests

- URL and name normalization
- canonical identity construction
- structured batch validation and limits
- service run state, leases, idempotency, and source-failure outcomes
- administrator authorization and status transitions
- route authentication and same-origin behavior
- dashboard rendering, filters, drawer, queue action, and status mutation

### PostgreSQL integration tests

- migration/schema constraints
- new candidate insertion
- canonical URL and identifier deduplication
- multi-source evidence upsert
- last-seen and confidence updates
- administrator status preservation
- simultaneous/stale run behavior
- run counts and idempotent replay

### Product verification

- existing unit, database, acceptance, render, lint, and build commands
- local administrator flow on desktop and mobile
- one real Codex trial run with source-supported India candidates
- direct confirmation that candidate and evidence records exist in PostgreSQL
- deployed admin route and worker endpoint behavior
- production run result showing non-zero companies and creators

## Deployment and Migration

The Drizzle schema change produces an ordered PostgreSQL migration committed
with the source. Local and test databases use the existing migration command.
Production applies the same SQL to Neon before the discovery endpoints are
used. If the hosted database credential is only available to the deployed
Worker, a temporary secret-protected migration bridge may be deployed solely
to apply this committed migration; it must be removed and the final source
redeployed before completion.

New environment variables are added to both examples and to Sites runtime
configuration. The existing Sites project and custom domains are reused.

## First Trial Run

The first trial requests twenty candidates split evenly between companies and
creators in India. Candidate selection rotates across the configured category
families and prioritizes clear partnership, distribution, media,
co-branding, or collaboration potential. Every persisted record must have a
working source URL and must be supported by public evidence.

The trial is complete only when:

- the run is `succeeded` or `partial` with an honest error summary
- at least one company and one creator are newly persisted in Neon
- duplicate counts match repository behavior
- the admin dashboard renders the persisted records and evidence links
- administrators can filter, inspect, and change a candidate status

## Deferred

- Profile, Verification, and Matching Agents
- autonomous candidate shortlisting or rejection
- contact discovery or private data collection
- authenticated social-platform scraping
- automated outreach
- provider billing and high-volume search
- background execution independent of the local Codex host
- ranking models beyond a transparent discovery confidence score
