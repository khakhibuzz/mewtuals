# Mewtuals Physical AI Discovery V1 Design

**Date:** 2026-07-28
**Status:** Design approved; ready for implementation planning after document review

## Goal

Extend the existing Mewtuals Discovery Agent so Mewtuals can build a durable,
evidence-backed understanding of Indian robotics, hardware, and physical-AI
participants. The immediate product questions are:

- Which part of the robotics or physical-AI domain does this participant work
  in?
- What does it make, enable, or explain?
- How does it relate to the wider robotics ecosystem?
- How could it help other participants?
- What suppliers, partners, infrastructure, distribution, or expertise could
  help it?

This is research for partnership understanding, not a matching, enrichment,
or outreach system. Codex remains the initial public-web research worker so no
paid discovery provider is required before the first client.

## Product Scope

The default discovery campaign becomes `robotics_hardware_india`.

- Geography is India-first. A foreign participant is eligible only when public
  evidence shows that it meaningfully operates in or serves India.
- The one-time seed run requests 50 companies and zero creators.
- Ongoing scheduled runs request at most 15 companies and 5 creators.
- Requested counts are ceilings, not quotas. The worker returns fewer, or zero,
  when credible public evidence is insufficient.
- Existing candidates, administrator decisions, identities, evidence, and
  discovery history remain valid and unchanged.
- Companies remain the primary focus. Creators are included when their public
  work materially contributes to robotics or physical AI through technical
  education, analysis, community building, demonstrations, or industry reach.

V1 is intentionally specific to physical AI. It does not introduce a generic
campaign framework or try to anticipate every future Mewtuals domain. A later
domain can reuse or evolve this design after an actual need appears.

## Existing Architecture to Preserve

This feature extends the current pipeline:

```text
Scheduled Codex task
  -> claim one queued, trial, seed, or daily run
  -> research permitted public sources
  -> validate one bounded DiscoveryBatch
  -> submit using the existing lease
  -> persist candidates, evidence, and research versions in one transaction
  -> review through the existing admin discovery dashboard
```

The existing boundaries remain authoritative:

- `app/domain/discovery.ts` owns pure validation and normalization.
- `app/server/discovery-config.ts` owns parsed campaign configuration.
- `app/server/discovery-service.ts` owns run and admin orchestration.
- `db/repositories/discovery-repository.ts` owns PostgreSQL queries.
- Route handlers remain thin delivery adapters.
- PostgreSQL/Neon remains the sole source of truth.
- The existing lease, stale-run recovery, exact-body replay, identifier
  deduplication, source evidence, and administrator status behavior remain.

There is no second worker, enrichment queue, agent framework, database, or
provider-specific persistence path.

## Minimal Data Model

The existing `discovery_candidates` table remains the identity and review
record. Its existing `category` and `subcategory` fields hold the participant's
current descriptive domain categorization. V1 does not add robot-stack,
input/output, geography, score, contact, relationship, signal, or taxonomy
columns.

One new append-only table is added:

### `candidate_research_versions`

- `id`: UUID primary key
- `candidate_id`: foreign key to `discovery_candidates`
- `discovery_run_id`: foreign key to `discovery_runs`
- `summary`: concise dashboard-ready systems and ecosystem context
- `findings`: bounded structured plain-text research narrative
- `source_urls`: JSONB array containing the public URLs supporting this version
- `analysis_version`: research-contract version, initially `physical-ai-v1`
- `created_at`: immutable creation timestamp
- unique `(candidate_id, discovery_run_id)` constraint
- index on `(candidate_id, created_at)` for latest and historical reads
- index on `discovery_run_id` for run inspection

Each accepted physical-AI participant receives exactly one research version in
that discovery run. Exact replay of the same completed submission cannot create
a second version. Rediscovery in a later run creates a new version, preserving
the history available to administrators.

`source_urls` is a version snapshot, not a replacement for
`discovery_candidate_sources`. The existing source table continues to hold
normalized candidate evidence across runs.

The table deliberately stores the analysis as text rather than prematurely
normalizing its internal concepts. A concept becomes a new field or table only
after Mewtuals needs to filter it, compare it across participants, deduplicate
it, or update it independently.

### Run campaign marker

`discovery_runs` gains a bounded `campaign_key` text field. Existing rows are
backfilled as `general_discovery`; new default and seed runs use
`robotics_hardware_india`. This field selects the V2 research contract without
introducing a general campaign-management subsystem.

## Research Contract

The Discovery Batch contract becomes a backwards-compatible versioned union:

- `codex-web-v1` remains readable for safe replay and existing behavior.
- `codex-web-v2` adds a `research` object to each candidate.
- A `robotics_hardware_india` run requires the V2 contract and requires
  research for every accepted candidate.

The added candidate shape is deliberately small:

```json
{
  "research": {
    "summary": "Concise systems and ecosystem context for the dashboard",
    "findings": "Bounded structured text using the required outline",
    "sourceUrls": ["https://public.example/source"],
    "analysisVersion": "physical-ai-v1"
  }
}
```

Validation requires a complete research object for each V2 candidate with:

- `summary`: 80 to 1,200 characters;
- `findings`: 600 to 12,000 characters;
- `sourceUrls`: 1 to 12 unique public HTTP(S) URLs, each no longer than 2,048
  characters; and
- `analysisVersion`: the literal `physical-ai-v1`.

Candidate count, per-type allocation, raw metadata, source errors, and total
request bytes also remain bounded. The total batch limit is 1 MiB, enough for
one 50-company seed with concise findings without creating an unbounded worker
request.

The worker must not include private data, authenticated page contents, secrets,
full copied pages, unsupported names, or personal contact details. Public
business contact surfaces may be mentioned inside findings only when they are
relevant and directly supported by a listed public source.

## Required Findings Outline

`findings` is one structured plain-text field with a stable writing outline. The outline
creates research consistency without creating database structure.

The Codex prompt and administrator review enforce the semantic outline. The
server validates only the research object's presence, types, and numeric bounds;
it does not parse prose headings or try to convert the narrative into a hidden
taxonomy. Source URLs are ordered so findings may refer to them as `[S1]`,
`[S2]`, and so on, but V1 does not add a field-level citation parser.

### 1. Domain and category

State the participant's primary robotics, hardware, or physical-AI domain and
any important secondary category. The existing candidate `category` and
`subcategory` should agree with this explanation.

### 2. Product or capability

Explain what the participant builds, supplies, integrates, researches,
distributes, or teaches. Prefer concrete capabilities over marketing language.

### 3. Robot or physical-AI systems context

Explain where the participant sits in the complete system. As relevant, connect
its work downward to underlying materials, manufacturing processes, components,
electronics, compute, sensors, power, or software, and upward to the resulting
robot capability or behavior.

Discuss inputs purchased, the transformation or capability added, and outputs
sold when public evidence or a clearly labelled assessment supports them. These
are prose findings, not separate fields.

### 4. Relationship to the wider ecosystem

Explain the participant's higher-level role in the Indian and, where relevant,
global robotics ecosystem:

- the ecosystem bottleneck it removes, reduces, or depends on;
- the types of upstream suppliers and downstream buyers around it;
- complementary participant types that make its offering more useful;
- competing or substitutable approaches when material;
- how its growth or failure would affect the broader ecosystem; and
- where partnerships could create disproportionate ecosystem leverage.

Named suppliers, customers, partners, or competitors are stated as facts only
when an explicit listed public source supports the relationship. Otherwise the
finding describes participant types and labels the statement as analysis.

### 5. Mutual-help opportunities

State how this participant could help others and what help it could plausibly
receive. Consider technical integration, component supply, contract
manufacturing, testing, talent, research, pilots, distribution, content,
customer access, and policy or ecosystem support only when relevant.

This section identifies possibilities for later human review. It does not
create a match, recommendation, outreach message, or autonomous action.

### 6. India strategic context

Where evidence permits, discuss manufacturing location, import dependence,
approximate value added, technical difficulty, replaceability, and strategic
importance for India. Approximations and judgments must be labelled as
assessments rather than presented as sourced measurements.

### 7. Evidence, assessment, and unknowns

The prose must visibly distinguish:

- **Evidence-backed fact:** directly supported by a listed source.
- **Assessment:** a reasoned conclusion derived from stated facts.
- **Unknown:** information that could not be supported publicly.

The worker leaves unsupported questions unknown. It does not invent a complete
supply chain, customer list, manufacturing location, or import profile.

## Categorization

The seed's 50 companies are categorized using the existing candidate category
and subcategory fields, supported by the corresponding findings. Categories
are configured prompt vocabulary rather than database enums or taxonomy rows.
They should remain broad enough to be understandable and may include robot
makers and integrators, components and actuation, sensing and perception,
electronics and compute, embedded software and AI, manufacturing and testing,
distribution and deployment, and research or ecosystem support.

The worker may use a more precise subcategory when the evidence warrants it.
Unknown or ambiguous classifications are described honestly instead of forced
into an inaccurate bucket. V1 does not add category-version tables, stack-layer
tables, or classification joins.

## Allocation, Saturation, and Scheduling

Default environment configuration becomes:

```dotenv
DISCOVERY_GEOGRAPHIES=India
DISCOVERY_TOTAL_CANDIDATES=20
DISCOVERY_COMPANY_PERCENTAGE=75
DISCOVERY_ENABLED_SOURCES=codex_web
```

This yields ceilings of 15 companies and 5 creators. The claim response remains
the worker's authority.

The one-time `robotics-seed` trial preset uses the same claim, validation,
submission, transaction, and dashboard path but requests 50 companies and zero
creators. The operator selects it explicitly with:

```bash
npm run discovery:claim -- --trigger trial --preset robotics-seed
```

The CLI sends the bounded preset selector in the authenticated claim body. The
server accepts `robotics-seed` only with the `trial` trigger, maps it to campaign
`robotics_hardware_india` and allocation 50/0, and rejects unknown presets or a
preset on a scheduled claim. It is an explicit operator action, not a second
pipeline and not part of the recurring schedule.

Market saturation is expected. Therefore:

- a completed search with no new credible candidates may submit an empty batch
  and finish `succeeded` with zero counts;
- a run with usable candidates and bounded source failures finishes `partial`;
- a run unable to perform credible research because its sources failed finishes
  `failed` through the existing failure command;
- duplicates update existing observation/evidence behavior without creating a
  second candidate; and
- no run invents marginal candidates merely to meet the ceiling.

Cadence is owned by the external Codex automation. Changing from daily to
weekly requires editing that automation schedule, not an application code or
database change. Candidate ceilings remain environment configuration, so they
can also be reduced without changing discovery logic.

## Transaction, Idempotency, and Performance

The server validates the complete V2 batch before beginning persistence. The
existing transaction remains the atomic boundary for:

1. validating and locking the running lease;
2. resolving candidate identities;
3. inserting or updating candidate observations without resetting admin status;
4. persisting source evidence;
5. inserting one research version for every accepted candidate; and
6. completing the run and its counts.

No candidate, evidence, or research version becomes visible if the transaction
fails.

The validated complete body remains the idempotency input. An exact retry with
the same lease and submission hash returns the recorded result without new
writes. A different body for a completed run remains rejected. The unique
candidate/run research constraint provides an additional database invariant.

A submitted batch may contain only one entry for a resolved candidate. The
domain validator rejects duplicate normalized candidate identities that are
visible within the payload. If separate submitted identities resolve through
stored identifiers to the same candidate, the repository aborts before any
writes with a bounded `duplicate_candidate_in_batch` error. The run remains
active so the worker can consolidate the evidence and research into one entry,
revalidate, and submit the corrected body. V1 does not silently choose or merge
two competing research narratives.

The 50-company seed must not repeat slow identifier and evidence lookups once
per candidate when the same information can be loaded or written in bounded
batches. Repository optimization remains local to PostgreSQL persistence and
must preserve the existing identity-conflict and transaction semantics.

## Admin Dashboard

The existing `/admin/discovery` page is extended without adding another
dashboard or top-level navigation item.

The existing candidate drawer gains one compact **Research context** section:

- the latest `summary`;
- a `View findings` control;
- a `History (n)` control; and
- the listed public sources for the selected version.

The section is shown only when a research version exists. General and historic
V1 candidates retain their current uncluttered drawer.

The rich content is loaded lazily from an administrator-only candidate research
endpoint when the drawer opens or the administrator requests it. The endpoint
returns the latest version and bounded version history in reverse chronological
order. Selecting a historical version replaces the displayed summary,
findings, sources, analysis version, and date inside the same drawer.

The endpoint returns the latest version plus at most 24 older versions, for a
maximum of 25 versions per response. It reuses existing administrator
authorization and exposes neither worker leases nor private configuration.
Findings render as text with preserved headings, lists, and line breaks;
submitted text is never interpreted as HTML or executable Markdown. This avoids
a new rendering dependency. The existing responsive drawer, focus, 44-pixel
touch target, overflow, and mobile behavior remain intact.

V1 does not add a relationship graph, taxonomy explorer, contact CRM, scoring
cards, new analytics theme, or a dense matrix of robotics fields.

## Codex Research Behavior

The repository operations guide and scheduled task prompt are updated so the
worker:

1. follows the claimed physical-AI configuration and allocation;
2. checks stable public identity and source URLs;
3. researches each candidate deeply enough to produce the required summary and
   findings outline;
4. uses the candidate's existing category and subcategory for its descriptive
   categorization;
5. distinguishes facts, assessments, and unknowns;
6. describes named commercial relationships only with explicit evidence;
7. returns fewer candidates, including zero, rather than padding;
8. validates and submits the exact private batch using the existing protocol;
   and
9. cleans temporary claim and batch files only after a terminal result.

The prompt requires evidence-backed factual statements to refer to the ordered
source list where practical. Codex performs the discovery and analysis.
`scripts/discovery-worker.ts`
continues to transport, validate, submit, fail, and cleanly report results; it
does not become the research intelligence.

## Initial Seed Run

After migration and deployment, the operator claims the named `robotics-seed`
trial preset with
`npm run discovery:claim -- --trigger trial --preset robotics-seed`. The worker
attempts one source-supported batch of 50 Indian robotics, hardware, or
physical-AI companies.

Every accepted company must have:

- a stable canonical identity;
- at least one working public evidence URL;
- a supported category and optional subcategory;
- a concise research summary;
- complete findings using the required outline; and
- explicit fact, assessment, and unknown labels where ambiguity exists.

The seed should span multiple ecosystem roles rather than cluster around only
well-known robot makers. It must still follow evidence quality over numerical
padding. The terminal run and persisted count are reported honestly if fewer
than 50 defensible companies can be completed.

The seed is complete only when its terminal run is durable, its candidates and
research versions are visible in Neon, and an administrator can inspect the
latest summary, full findings, sources, and history in the deployed drawer.

## API and Service Changes

The existing worker endpoints and commands remain the external protocol. Their
V2 claim/schema response is expanded rather than replaced.

One read-only administrator endpoint is added for a candidate's research
versions. Its exact route follows the repository's existing route convention;
the response is a framework-free service DTO containing only candidate id,
latest version, and bounded history.

Application services add focused use cases to:

- return physical-AI campaign configuration and seed allocation;
- validate and persist V2 research with the candidate batch; and
- list research versions for an authorized administrator.

Routes do not query Drizzle directly. Client components do not import server or
database modules.

## Migration and Compatibility

The migration is additive:

1. add and backfill `discovery_runs.campaign_key`;
2. create `candidate_research_versions` with its foreign keys, uniqueness, and
   indexes; and
3. leave all existing candidate and source rows untouched.

Old run and candidate reads continue to work. Existing completed V1 submissions
retain exact-replay compatibility. New physical-AI runs use V2. Deployment
applies the committed migration before enabling the updated worker contract or
running the seed.

Generated scheduled external run keys include the campaign key as well as the
local date and allocation. Trial keys also include the selected preset plus
their existing uniqueness component. Therefore new robotics runs cannot collide
with queued or historical general-discovery keys.

## Testing

### Domain and service tests

- V1 and V2 batch discrimination
- required research on physical-AI candidates
- bounded summaries, findings, source URLs, and total payload
- 50/0 seed and 15/5 scheduled allocations
- honest empty success, partial source failure, and failed research outcomes
- exact replay and changed-body rejection
- duplicate payload identity rejection and database-resolved same-candidate
  rejection without writes
- preservation of administrator candidate status
- latest-first research history mapping

### PostgreSQL integration tests

- additive migration and existing-row compatibility
- one research version per candidate per run
- atomic rollback across candidate, evidence, research, and run writes
- exact replay without duplicate research versions
- later-run version history
- candidate deduplication with new research attached to the resolved candidate
- bounded-batch persistence for the 50-company seed

### Route and UI tests

- administrator authorization for research reads
- no client import of server/database code
- drawer summary, findings, sources, empty state, and history selection
- safe structured-text rendering
- keyboard, focus, 44-pixel controls, narrow viewport, and overflow behavior
- unchanged rendering for candidates without research

### Release verification

Run the repository release gate:

```bash
npm test
npm run test:db
npm run test:acceptance
npm run test:e2e
npm run lint
npm run build
git diff --check
```

Then apply the migration, deploy the exact committed target through the
existing Sites project, run the initial seed, and verify the resulting records
and drawer against production PostgreSQL and the deployed admin application.

## Explicitly Deferred

- separate taxonomy, classification, fact, contact, signal, and relationship
  tables
- matching, recommendations, ranking, or autonomous partnership decisions
- outreach or message generation
- private contact collection or authenticated social scraping
- paid search or enrichment providers
- background execution independent of the local Codex host
- universal multi-campaign administration
- relationship graphs and structured robot-stack analytics
- promoting findings sections to structured fields before a real query or
  workflow requires them

## Acceptance Criteria

The implementation is accepted when:

- new default claims request the physical-AI campaign with 15 company and 5
  creator ceilings;
- the seed path requests 50 companies and persists every accepted participant
  through the same pipeline;
- every accepted physical-AI participant has one linked summary/findings/source
  version for its run;
- findings explain both system-level context and the participant's higher-level
  relationship to the wider ecosystem;
- public evidence, analysis, and unknowns are distinguishable;
- exact retries are safe and persistence remains atomic;
- empty credible searches succeed without padding;
- administrators can view the latest research and past versions in the existing
  drawer without dashboard clutter;
- schedule and candidate ceilings can be reduced without an application code
  change; and
- the full release gate and deployed seed verification pass.
