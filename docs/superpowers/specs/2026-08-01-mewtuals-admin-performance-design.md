# Mewtuals Authenticated Navigation Performance Design

## Outcome

Make authenticated administration navigation feel immediate and reduce intentional
Global Demand Radar page loads from multi-second waits toward the 200–500 ms
range, without weakening authentication, authorization, score-provenance checks,
or the PostgreSQL source-of-truth boundary.

## Measured baseline

Production worker observations on 2026-07-31 showed Radar React Server Component
requests taking about 2.2–3.8 seconds of wall time while consuming only about
67–99 ms of CPU. A single page view also generated requests for several sibling
Radar tabs. The evidence separates two costs:

1. Next link prefetch starts authenticated, database-backed routes that the user
   did not request.
2. An intentional Radar tab render creates separate database contexts for the
   session and Radar application, then recomputes list, class, and overview
   reports through repeated PostgreSQL reads.

The first cost is an avoidable navigation design choice. The second is remote
database/network waiting amplified by the current read-path design.

## Performance contract

- Authenticated administrator and Radar navigation links do not prefetch.
- One click starts one destination navigation; sibling authenticated routes are
  not fetched speculatively.
- A visible pending/loading state appears without waiting for destination data.
- One server render acquires one request-owned database context and passes it to
  authentication and the destination service. Cloudflare isolates never retain
  the database context globally.
- A Radar class page asks its repository for one class-summary read model rather
  than independently orchestrating list, class-metric, overview, and baseline
  reads in the service.
- The read model preserves fail-closed score-provenance validation, exact filter
  behavior, honest empty results, pagination, and the existing DTO.
- Private administrator responses remain network-only and are never stored in
  browser caches, Cache Storage, IndexedDB, local storage, or a service worker.
- Production acceptance targets a 200–500 ms median for an intentional empty or
  small Radar tab RSC request after warm deployment. If regional database
  transport prevents that target after code-path consolidation, connection
  pooling/acceleration is the next measured infrastructure step, not a reason to
  weaken correctness.

## Design

### 1. Stop speculative authenticated work

Set `prefetch={false}` on administrator destination links and Global Radar tab,
retry, and pagination links. Public navigation behavior stays unchanged. Add
tests that inspect rendered links so a framework upgrade cannot silently restore
authenticated prefetch fan-out.

### 2. Make navigation acknowledgement immediate

Add an administrator loading surface that retains the established visual shell
and announces that the requested view is loading. Keep the implementation small:
use route-segment loading boundaries and existing styles rather than adding a
client data cache or duplicating private data in browser state.

### 3. Compose one request-owned database context

Allow `getCurrentSession` and each administrator-facing service factory to
receive an explicit `MewtualsDatabase`. Administrator page loaders acquire the
database once, authenticate with it, and pass the same instance to their service.
Global Radar does the same for its application graph.

The default parameters remain for route handlers and non-page callers. Existing
non-Cloudflare process caching remains unchanged. Cloudflare continues to avoid
module-global database/application caching; the ownership improvement is
explicit composition inside one request.

### 4. Give Radar one repository read-model operation

Introduce a repository-owned `getClassSummary` operation with a single input
containing signal class, normalized filters, and observation time. The admin
service validates authorization and input once, calls that operation once, and
serializes the existing response.

Inside the PostgreSQL adapter, consolidate work around one bounded signal scan:

- validate stored score provenance once per scanned batch;
- accumulate overview, selected-class, and unfiltered selected-class metrics in
  the same pass;
- load requirements once per batch and reuse them for class and overview mixes;
- collect the requested filtered page and count without a second application
  scan;
- fetch latest-run and promoted-entity metadata together with independent
  metadata work while the scan executes.

Filtering must remain semantically identical to the current SQL filters. If a
filter cannot be safely mirrored in the read-model projector, retain one focused
filtered page query rather than approximate it. The important invariant is that
class and overview aggregates never rescan the same signal set independently.

The old granular repository reads may remain temporarily for other callers and
compatibility tests, but the page hot path no longer composes them.

### 5. Connection transport after code-path fixes

After deployment, measure intentional RSC requests again using worker wall and
CPU timings. If wall time remains above 500 ms while CPU and query count are low,
verify that production uses the managed pooled PostgreSQL endpoint. Consider a
Cloudflare-native database accelerator only if pooled transport still misses the
target. No infrastructure change is accepted without before/after evidence and
a rollback path.

## Testing and verification

- Component tests prove authenticated links opt out of prefetch and the loading
  surface is accessible.
- Composition tests prove the same database object reaches authentication and
  the destination service/application.
- Admin-service tests prove one repository summary call and preserve conflict,
  filter, and empty-state behavior.
- Repository integration tests compare the consolidated read model with existing
  expected metrics for unfiltered and filtered fixtures and record bounded query
  behavior.
- Run the repository release gate: unit/render, database, acceptance, end-to-end,
  lint, build, and `git diff --check`.
- Publish an exact committed Sites target, then compare production intentional
  tab requests with the recorded multi-second baseline. Do not claim the latency
  target from local tests alone.

## Non-goals

- No weakening or removal of Radar score-provenance validation.
- No caching of authenticated HTML, RSC payloads, session data, or administrator
  data in the service worker or browser persistence.
- No merge of Global Demand Radar with Discovery or Ecosystem Intelligence.
- No global Cloudflare database singleton.
- No speculative materialized-view subsystem unless measurement after the
  bounded read-model implementation proves it necessary.
