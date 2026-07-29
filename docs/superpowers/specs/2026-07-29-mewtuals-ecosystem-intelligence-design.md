# Mewtuals Ecosystem Intelligence Design

**Date:** 2026-07-29
**Status:** Approved for implementation by the user on 2026-07-29
**Baseline:** deployed Physical AI release `7dd8a69c3fd066b8c1551bf0ef17b21b21e7285b`

## Goal

Add a separate administrator-only workspace at
`/admin/ecosystem-intelligence` that turns the existing India-focused
Discovery dataset into an evidence-linked, cross-filterable map of the
robotics, drones, hardware, physical-AI, electronics, embedded-systems, and
advanced-manufacturing ecosystem.

The workspace explains what Mewtuals has mapped, where mapped organisations
sit, how lower-level capabilities connect to complete systems, and where the
current map needs more research. It never presents the discovered sample as a
market census and never converts a coverage imbalance into an automatic
commercial opportunity.

The existing `/admin/discovery` route remains the operational queue. Ecosystem
Intelligence is an analytical read model over the same candidates, evidence,
review states, runs, and systems-context versions. Global Demand Radar remains
a separate bounded context and is not part of this feature.

## Current-State Audit

### Existing components and boundaries to reuse

- `app/admin/discovery/page.tsx` establishes the server-rendered administrator
  page pattern: load the session, call a server service, redirect unauthorised
  users, serialize dates, and render inside `ProductShell`.
- `ProductShell` and `product.module.css` provide the restrained visual system,
  responsive boundary at 767px, 44px controls, page gutters, tables, dialogs,
  and wide admin layout.
- The three existing administrator pages repeat the same header link list. A
  shared `ADMIN_HEADER_LINKS` constant will replace that repetition and add
  `Ecosystem Intelligence` without otherwise redesigning Discovery.
- `DiscoveryDashboard` already owns candidate filtering, pagination, evidence,
  status mutations, and the candidate drawer. Its review actions and
  `DiscoveryResearchContext` will be extracted into small reusable children so
  the analytical workspace does not duplicate review policy.
- `discovery-service.ts` already centralises administrator checks from
  `ADMIN_EMAILS`. The new service will reuse the same actor and authorisation
  convention.
- `db/repositories/discovery-repository.ts` is the PostgreSQL adapter for the
  Discovery bounded context. Ecosystem aggregate queries will live in a new
  repository beside it, not in a page, component, or generic utility.
- `candidate_research_versions` is the authoritative versioned systems-context
  narrative. It already contains a summary, structured findings, public source
  URLs, analysis version, and run provenance.
- `discovery_candidate_sources` is the evidence ledger. The new workspace will
  link to these rows rather than inventing a second evidence model.

### Existing database fields available

`discovery_candidates` provides:

- company or creator participant type;
- name and stable canonical identity;
- canonical, website, primary-social, and LinkedIn URLs;
- short discovered description;
- one broad category and optional subcategory;
- free-text geography, currently commonly `India`;
- first evidence source;
- discovery and last-seen timestamps;
- discovery confidence score;
- review status: discovered, shortlisted, rejected, or queued for profile;
- most-recent Discovery run;
- bounded raw metadata.

Related tables provide:

- run campaign, trigger, counts, source names, dates, and terminal status;
- stable candidate identifiers;
- multiple public evidence sources with first- and last-seen timestamps;
- versioned Physical AI summary, findings, sources, and analysis version;
- optional candidate-linked Opportunity Brief requests.

Opportunity Brief email and phone fields are submitted contact data, not
verified public professional surfaces. They will not be treated as public
candidate contacts. The member `signals` table records member partnership
intent and is not a public ecosystem-momentum signal.

### Missing filterable data

The current schema has no authoritative equivalents for:

- organisation subtype within Discovery candidates;
- ecosystem domain and role;
- business value-chain stage;
- technical robot-stack layer;
- capability, component category, or robotics vertical;
- normalized headquarters state and city;
- time-bound, public candidate signals;
- evidence-backed candidate relationships.

The seven systems-context sections contain much of this meaning as prose, but
parsing that prose at read time would be non-deterministic, slow, difficult to
audit, and unable to distinguish evidence from inference consistently. The
workspace therefore continues to display the prose as the authoritative
narrative while adding only the minimum normalized facts required for filters
and aggregates.

### Visualisation and responsive state

The project has no charting or mapping dependency. Existing visuals use React,
semantic HTML, CSS, and small custom SVG. The responsive contract explicitly
allows a labelled contained horizontal rail and requires a deliberate mobile
alternative rather than a shrunken desktop chart.

## Approaches Considered

### 1. Parse `candidate_research_versions.findings` on every request

This avoids a migration but produces unstable classifications, makes filters
depend on prose formatting, obscures whether a value is known or inferred, and
cannot index geography, signals, or relationships. It is rejected.

### 2. Add a large JSONB ecosystem profile per candidate

This is fast to prototype but repeats the problem the request explicitly asks
us to avoid: one opaque profile, inconsistent field shapes, unindexed filters,
and difficult evidence provenance. It is rejected.

### 3. Add a small normalized analytical fact layer over Discovery

This is the selected approach. Four additive child tables hold filterable
classifications, resolved headquarters, public signals, and verified
relationships. A versioned TypeScript taxonomy registry provides labels,
ordering, aliases, inference rules, metric definitions, and insight thresholds.
All visual aggregates query these facts together with the existing candidate,
run, evidence, and research tables.

The approach adds enough structure to answer the requested questions without a
parallel candidate architecture, taxonomy administration system, materialized
view, graph database, or generic analytics platform.

## Bounded Architecture

```text
admin page / client workspace
  -> validated URL filter model
  -> admin-only Ecosystem Intelligence route/service
  -> Ecosystem Intelligence repository
  -> existing Discovery tables + four additive child tables
  -> aggregate snapshot + paginated evidence ledger
```

Source dependencies remain inward:

- `app/domain/ecosystem-intelligence.ts` owns filter parsing, taxonomy keys,
  state/city normalization, metric rules, evidence-coverage rules, and insight
  rules. It imports no framework, database, environment, or network module.
- `app/server/ecosystem-intelligence-service.ts` authorises the administrator,
  applies the validated filter model, and returns plain DTOs.
- `db/repositories/ecosystem-intelligence-repository.ts` owns SQL and translates
  rows into domain inputs.
- page and API routes translate framework inputs and outputs only.
- client components receive DTOs, render, cross-filter, and call existing
  mutation routes. They do not import server or database modules.

## Minimal Additive Data Model

Migration `0008_ecosystem_intelligence_v1` adds four tables. All changes are
additive, nullable where data is unknown, and cascade only from a deleted
Discovery candidate.

### `candidate_ecosystem_classifications`

Stores filterable candidate-to-taxonomy associations.

- `candidate_id`
- `kind`: organisation subtype, ecosystem domain, ecosystem role, business
  stage, technical layer, capability, component category, or robotics vertical
- `term_key`: stable key from the versioned taxonomy registry
- `evidence_state`: `evidence_backed` or `inferred`
- `confidence`: integer 0–100
- `basis`: concise explanation of why the association exists
- `source_urls`: bounded JSONB array of public evidence URLs
- timestamps

Unique key: `(candidate_id, kind, term_key)`. Indexes support candidate detail,
kind/term filtering, evidence state, and confidence.

The table is for explicit enrichment. Current candidates also receive a
read-time inferred classification from their existing broad `category` through
central category inference rules. Explicit rows take precedence over an
identical inferred association. This makes current and future candidates useful
without modifying scheduled Discovery writes or running an unsafe prose parser.

### `candidate_headquarters`

Stores at most one public-evidence-backed headquarters location per candidate.

- `candidate_id` unique
- ISO country code, default `IN`
- normalized state key and display label
- normalized city key and display label
- optional longitude and latitude for reliable city bubbles
- evidence state, confidence, source URLs, and timestamps

No live or client-side geocoding occurs. A missing row is `Location not yet
resolved`; it is never guessed from a source domain, founder biography, or
manufacturing mention.

### `candidate_public_signals`

Stores dated public facts that may support ecosystem momentum.

- candidate ID
- centrally registered signal type
- concise title
- occurred-at date
- optional expiry date
- source URL
- confidence
- deterministic evidence key
- timestamps

An active signal is evidence-backed and still fresh at the query clock. Every
registered signal type has a finite default freshness window in the taxonomy.
The effective `active_until` is the earlier of an explicit expiry and
`occurred_at + default freshness window`; a missing explicit expiry therefore
never creates a permanent signal. Discovery dates never enter this table and
never count as ecosystem momentum.

The evidence key hashes the candidate ID, signal type, occurred-at date, and
normalized source URL. A database unique constraint on that key makes replaying
an import idempotent while allowing distinct dated facts from the same source.

### `candidate_relationships`

Stores verified directed relationships.

- source candidate ID
- optional target candidate ID
- target public name when the target is not yet resolved to a candidate
- centrally registered relationship type
- evidence URL
- confidence
- optional observed-at date
- deterministic evidence key
- timestamps

Checks prevent self-links and require either a target candidate or a non-empty
target name. No inferred edge is stored or rendered. Indexes cover source,
resolved target, type, and observed date.

The relationship evidence key hashes the source candidate ID, relationship
type, normalized resolved target ID or normalized public target name, normalized
evidence URL, and observed-at date. A database unique constraint enforces the
same replay-safe identity used by the importer.

### No new public-contact table in V1

`website_url` and `linkedin_url` are the current public professional contact
surfaces. `primary_social_url` is included only for creator/media views. Private
Opportunity Brief email and phone values remain isolated. A later public-contact
enrichment table is justified only when Mewtuals collects sourced business
emails, enquiry pages, or public phone numbers for candidates.

## Versioned Taxonomy Registry

`app/domain/ecosystem-intelligence-taxonomy.ts` is the single source for:

- taxonomy version `ecosystem-intelligence-v1`;
- the requested domains, subtypes, roles, business stages, technical layers,
  capabilities, components, verticals, signal types, and relationship types;
- display labels, order, short explanatory copy, upstream inputs, downstream
  functions, and mobile labels;
- category-to-classification inference rules for the eight Physical AI
  Discovery categories;
- common India state and city aliases;
- finite default freshness windows for every signal type;
- insight coverage targets and data-readiness thresholds.

UI components never repeat taxonomy strings. Database rows store keys; the
domain rejects keys not present in the registry. Unknown is a computed explicit
bucket, not a fake taxonomy association.

## Shared Global Filter Model

One Zod schema parses page and API query parameters. The same normalized object
is passed to every aggregate and the ledger query.

Supported filters:

- participant type and optional enabler inclusion;
- ecosystem domain;
- organisation subtype;
- ecosystem role;
- business stage;
- technical layer;
- capability;
- component category;
- robotics vertical;
- headquarters state and city;
- active signal type;
- review status;
- public contact availability;
- evidence coverage band;
- minimum Discovery confidence;
- discovery date range;
- page, page size, sort, and direction.

Defaults are companies, India/Physical AI scope, and all non-rejected review
states. Rejected records become visible only through an explicit filter. The
creator/media toggle adds specialised creators and ecosystem enablers without
making them dominate the default view.

Unknown values use the literal filter value `unknown`. Filters are canonicalized
into stable URL search parameters. A click on any visual updates this same model,
resets the ledger to page one, pushes the new URL, and refetches one complete
snapshot. Filter chips, breadcrumb, browser reload, back/forward navigation,
copying the URL, and Reset view all use the same serialization.

`minimumDiscoveryConfidence` always filters the candidate's existing
`discovery_score`. Classification, headquarters, signal, and relationship
confidence remain fact-level evidence qualifiers used by their own aggregates
and displays; they are not combined into one ambiguous threshold.

## Evidence Population and Ownership

Discovery remains the owner of candidate identity, source capture, research
history, and review workflow. Ecosystem Intelligence does not add another
scheduler or worker and does not change the daily Discovery contract.

Structured classifications, headquarters, public signals, and relationships
are populated through a private versioned evidence importer:
`scripts/ecosystem-intelligence-import.ts`. It supports separate `validate` and
`import` commands over a local mode-0600 JSON file using schema
`ecosystem-intelligence-import-v1`. Each fact must contain a stable candidate
ID or canonical identity, a registered taxonomy key, confidence, and public
source URL. Arrays and strings are bounded before any database write.

The importer resolves all candidate identities before mutation, then applies
the file transactionally and idempotently. A retry of the same evidence file
cannot create duplicate classifications, signals, or relationships. Its
terminal output contains safe counts and validation errors only; it never
prints input payloads, private data, or credentials. Operations and recovery
are documented in `docs/ecosystem-intelligence-operations.md`.

The initial release immediately derives category-backed classifications from
existing Discovery data at read time and uses existing research versions,
source URLs, dates, websites, LinkedIn URLs, and creator social URLs. The
initial evidence import adds only facts verified from public sources. Missing
headquarters, signal, and relationship facts stay visibly unresolved rather
than being guessed. Subsequent research batches can produce the same versioned
import contract without coupling those writes to the Discovery scheduler.

## Aggregate Query Architecture

One admin-only GET endpoint, `/api/admin/ecosystem-intelligence`, returns the
complete analytical snapshot for a filter state:

- summary metrics and data-quality metrics;
- geography aggregates;
- business-stage aggregates;
- technical-layer aggregates;
- role × capability and state × role matrices;
- deterministic insight cards;
- Discovery velocity;
- ecosystem momentum readiness or active-signal aggregates;
- relationship readiness or a capped relationship summary;
- 25 paginated candidate ledger rows;
- filter-option counts needed by the current view.

The repository executes a bounded set of set-based queries inside one
read-only transaction. A shared SQL filter builder supplies the same candidate
predicate to every query. It never loads all candidate records and computes
charts in the browser, and it never issues per-candidate queries.

The current dataset is small. V1 uses no materialized view and no cache. Query
timings are covered by integration tests and can be logged through existing
safe server error handling. A short-lived aggregate cache is deferred until
profiling shows a need and an invalidation boundary is defined.

Candidate detail uses a second admin-only endpoint,
`/api/admin/ecosystem-intelligence/candidates/:candidateId`, returning identity,
classifications, headquarters, contacts derived from public candidate URLs,
active signals, verified relationships, and the existing bounded research
history. Existing status mutation routes remain authoritative.

No CSV endpoint is added in V1 because the repository has no existing export
contract. This avoids creating a new bulk data-exfiltration surface during the
first analytical release.

## Metric Definitions

Every percentage uses the currently filtered, non-rejected-by-default
participant count as its denominator and returns both numerator and denominator.

- **Organisations mapped:** distinct filtered candidates.
- **Companies mapped:** filtered candidates with type `company`.
- **Roles represented:** distinct ecosystem-role keys, excluding Unknown.
- **Technical layers represented:** distinct technical-layer keys, excluding
  Unknown.
- **States/cities represented:** distinct resolved headquarters keys.
- **Publicly reachable:** a company with a valid public website or LinkedIn URL;
  creator/media views may also use a valid primary social URL.
- **Active public signals:** unexpired candidate-public-signal rows with a
  public source URL.
- **Documented relationships:** relationship rows with a public evidence URL;
  unresolved targets still count but are labelled unresolved.
- **Evidence coverage:** a deterministic 0–100 score with five 20-point
  dimensions: candidate source evidence, current systems context, classification,
  resolved headquarters, and public professional contact. Evidence-backed
  classification earns 20 points; inferred-only classification earns 10.
- **Strong evidence:** score at least 80 and at least one evidence-backed
  classification.

Data-quality percentages report state/city, role, capability, evidence,
contacts, active signals, and systems context separately. Missing dimensions
are visible as counts and percentages rather than silently omitted.

## Narrative Page

### 1. What we have mapped

A compact metric strip answers scale and representation. A restrained
data-quality panel immediately qualifies the map. Every metric includes a
definition tooltip and numerator/denominator screen-reader text.

### 2. Where India is building

A state-level choropleth uses a locally stored, simplified India state GeoJSON
derived from the MIT-licensed DataMeet maps repository. Attribution and the
exact source revision live beside the asset. `d3-geo` is the only new runtime
visualisation dependency; it projects static geometry but owns no state, fetch,
tooltip, or interaction behavior.

States are buttons inside an accessible SVG. Fill communicates count, while
visible labels, a ranked state/city list, and accessible names communicate the
same values without relying on colour. City bubbles render only when public,
reliable coordinates exist. The mobile primary surface is the ranked list;
the map remains an optional overview.

Unresolved locations remain in an explicit count and link to a ledger filtered
to `headquarters=unknown`.

### 3. How the ecosystem fits together

A full-width explorer switches between centrally configured business stages
and technical layers. Each stage/layer is a semantic button showing participant
count, strong-evidence percentage, representative companies, and major
capabilities. The technical view includes configured upstream inputs and
downstream functions so low-level components connect to robot behavior without
claiming verified supplier flows.

No Sankey is used.

### 4. What the ecosystem can currently do

Two accessible matrix tables render role × capability and state × role. Each
cell contains its number, evidence coverage, and an interpretation-readiness
label. CSS provides the intensity scale, but text remains the authoritative
value. Matrices use a labelled horizontal rail on narrow screens.

### 5. Where the map needs deeper research

Pure domain functions generate insight cards from aggregate inputs and central
thresholds. V1 rules cover:

- representation below a configured map-coverage target;
- geographic concentration when at least five resolved candidates exist and a
  state holds at least 60% of them;
- missing-data rates at or above 20% with at least three affected candidates;
- low public-contact availability below 35% in a group of at least four;
- three or more active dependency-related signals;
- stale evidence older than 180 days affecting at least 25% of a group.

Cards always say `current Mewtuals map`, include counts, coverage, confidence,
rule key, and View supporting companies. They never use `shortage`, `does not
exist`, or `opportunity` unless independent evidence later introduces an
explicit rule for that conclusion.

### 6. What is changing

Discovery velocity reports Mewtuals research activity over 7, 30, and 90 days
by candidate date, source, role, state, evidence score, and review status.

Ecosystem momentum reads only active candidate-public-signal rows. Below five
active signals spanning at least three organisations, it shows: `Not enough
evidence-backed signals to establish ecosystem momentum yet.` When ready, it
shows signal categories, companies, freshness, expiry, and sources.

### 7. How companies are connected

The relationship view requires at least eight verified edges spanning at least
five candidates. Below that threshold it shows a readiness message and counts
for verified edges and unresolved targets. Above it, a capped, clustered SVG
shows at most 40 nodes and 60 edges grouped by role or layer. Every edge has a
relationship type and evidence link. The ledger remains the accessible
alternative. No inferred edge is rendered.

### 8. The companies behind this view

The bottom ledger is the evidence backbone for every section. It is server-side
paginated, sorted, globally filtered, and responsive. Desktop uses the detailed
table; mobile uses full-width records. It links to existing evidence and opens
the shared company drawer. Status actions call the existing Discovery mutation
route and then refresh the analytical snapshot.

## Company Systems-Context Drawer

The new drawer reuses the native-dialog, focus, Escape, scroll-lock, and review
action behavior already proven by Discovery. Shared children prevent policy and
mutation duplication.

It displays:

1. identity and short description;
2. explicit/inferred classification chips;
3. business stages and technical layers;
4. systems-context summary and full versioned findings;
5. inputs, transformations, outputs, buyer/supplier types as present in the
   existing evidence/assessment/unknown prose—never parsed into false facts;
6. resolved headquarters or an explicit unknown state;
7. active public signals;
8. verified upstream/downstream relationships;
9. public professional contact links;
10. evidence sources, confidence, and research history;
11. existing shortlist, reject, and queue-for-profile actions.

Facts show `Evidence-backed`; category-derived associations show `Inferred`;
missing dimensions show `Unknown`.

## UI Composition

New focused components live under
`app/components/product/ecosystem-intelligence/`:

- `EcosystemIntelligenceWorkspace`
- `EcosystemFilterBar`
- `CoverageSummary`
- `IndiaEcosystemMap`
- `EcosystemExplorer`
- `CapabilityHeatmaps`
- `ResearchGapInsights`
- `ChangeSignals`
- `RelationshipReadiness`
- `EcosystemCandidateLedger`
- `EcosystemCandidateDrawer`

The workspace coordinates URL state and data fetching. Each child is a pure
render/interaction unit with a small typed contract. No section owns a private
filter interpretation.

## Error, Empty, and Partial-Data Behavior

- Initial page failure renders a retryable administrator-only error surface.
- Cross-filter fetches retain the prior snapshot, mark it stale, and show one
  bounded error message with Retry.
- Every aggregate returns its denominator and readiness state.
- Empty visuals render explanatory text and a filter action instead of dummy
  data, an empty chart, or a zero-value market claim.
- Unknown location, role, layer, capability, signal, relationship, contact, and
  systems-context coverage are explicit categories.
- Filters with zero results preserve their chips and offer Reset view.
- Existing Discovery writes continue even if analytical reads fail.

## Security and Privacy

- Page and both APIs require a current session and the existing administrator
  allowlist.
- API failures never include SQL, environment values, private contact data, or
  evidence page contents.
- No Opportunity Brief email or phone value enters an aggregate or response.
- URL filters contain taxonomy keys and dates only, never candidate private
  data.
- No new public route, service-worker cache entry, or offline data store is
  created.
- Candidate mutations continue to enforce same-origin and optimistic
  concurrency in their existing route.

## Performance

- all aggregates are set-based and server-side;
- ledger pagination defaults to 25 and caps at 100;
- relationship graph payload is capped;
- representative-company arrays are capped at five;
- filter option arrays are bounded by the registry;
- indexes match classification, geography, signal, relationship, review, and
  date filters;
- no N+1 detail reads occur in the snapshot;
- no materialized view or cache is added until measured query latency requires
  one.

## Testing

### Domain tests

- taxonomy integrity, ordering, and unique keys;
- filter parsing, canonical URL serialization, unknown handling, and defaults;
- state/city alias normalization without guessing;
- category inference marked `inferred`;
- evidence score and strong-evidence definitions;
- safe insight wording and thresholds;
- Discovery velocity separated from signal momentum;
- signal activity, explicit expiry, and finite default freshness;
- relationship readiness and evidenced-edge-only rules.

### Repository and migration tests

- fresh and upgrade migration paths;
- additive constraints, foreign keys, uniqueness, and indexes;
- all aggregates use the same filter population;
- rejected-by-default and explicit rejected filtering;
- classification precedence over category inference;
- evidence-import validation, identity resolution, idempotency, and rollback;
- unknown buckets and zero denominators;
- pagination and deterministic sorting;
- no private Opportunity Brief contact data in DTOs;
- bounded graph and representative rows;
- existing Discovery fixtures remain unchanged.

### Route, component, and browser tests

- unauthenticated and non-admin denial for page and APIs;
- admin navigation includes the new route on all admin pages;
- filter chips, Reset, URL reload, browser history, and visual cross-filtering;
- metric definitions and data-quality panel;
- map/list equivalence and geographic breadcrumb;
- business/technical explorer;
- both matrices with numeric accessible labels;
- insight support actions and safe language;
- velocity/momentum distinction and readiness messages;
- relationship readiness and evidenced graph;
- paginated ledger and shared candidate drawer;
- existing review actions still mutate through Discovery;
- 320×740, 390×844, 767×900, and 1440×1100 overflow, touch, focus,
  tooltip, and keyboard behavior;
- existing Discovery page behavior remains unchanged.

The complete repository release gate remains mandatory.

## Rollout

1. Commit the reviewed implementation on a branch from the deployed Physical
   AI release.
2. Run the complete local release gate, including migration fresh/upgrade and
   responsive E2E coverage.
3. Create a persistent Neon recovery branch.
4. Apply migration `0008` transactionally and verify row counts are unchanged.
5. Validate the reviewed initial evidence file, apply it idempotently with the
   committed importer, and verify imported and unresolved counts without
   printing source payloads.
6. Deploy the exact committed target through the existing Sites project.
7. Verify Sites version provenance, environment revision, custom-domain SSL,
   admin redirects, and API authorisation.
8. Open the authenticated production workspace and verify current data-quality
   states, cross-filtering, ledger, and drawer.

No scheduled Discovery setting, worker prompt, or automation is changed by
this feature.

## Known Initial Data Limitations

- Most existing candidates have only country-level free-text geography; the
  state map may initially emphasize unresolved location coverage.
- Current Physical AI categories support broad inferred classifications but do
  not replace sourced role, layer, component, capability, or vertical facts.
- Candidate-public-signal and relationship tables begin empty unless existing
  evidence is explicitly migrated; momentum and graph sections may therefore
  show readiness states.
- Website and LinkedIn URLs support a conservative contactability metric, not a
  claim that a named buyer or sales contact is available.
- Systems-context prose remains rich but not fully filterable. Future Discovery
  enrichment should emit normalized evidence-backed facts through a versioned
  contract only after this V1 read model is proven.

## Acceptance Criteria

The feature is complete when an administrator can:

1. open Ecosystem Intelligence without changing Discovery operations;
2. see defined, qualified map-coverage and data-quality metrics;
3. explore resolved India states/cities and inspect unresolved locations;
4. move between business value-chain and technical robot-stack views;
5. cross-filter every populated visual through one URL-persisted model;
6. inspect the companies and public evidence behind each result;
7. distinguish inferred classification from evidence-backed facts and Unknown;
8. see deterministic research gaps without market-shortage claims;
9. distinguish Discovery velocity from evidence-backed ecosystem momentum;
10. see a relationship graph only when verified data is ready;
11. inspect a company from systems context through review actions in one drawer;
12. use equivalent keyboard, screen-reader, mobile, and desktop interactions;
13. observe honest empty/readiness states where the current data is incomplete;
14. return to Discovery with its queue, filtering, and review behavior intact.
