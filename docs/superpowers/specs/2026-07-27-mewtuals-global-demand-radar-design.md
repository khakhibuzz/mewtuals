# Mewtuals Global Demand Radar Design

**Date:** 2026-07-27
**Status:** Approved for implementation

## Goal

Add a separate Global Demand Radar bounded context to Mewtuals. The Radar
monitors public global developments in robotics, physical AI, real-world data,
hardware, manufacturing, deployment, distribution, and service infrastructure.
It answers one question:

> What changed globally that may create a practical opening for an Indian
> company, laboratory, manufacturer, data operation, service provider,
> distributor, or ecosystem participant?

The durable unit is a dated, evidence-backed signal, not a generic foreign
company profile. Every qualified record connects a global entity or entity set,
a dated development, one signal class, structured requirements, systems
context, Indian execution archetypes, India relevance, evidence, freshness,
and human review state.

The existing India-focused Discovery Agent remains the Indian Ecosystem Map.
The Radar maps global demand. A future Opportunity Bridge may connect the two,
but automatic matching and opportunity generation are not part of this work.

## Locked Decisions

- Build a sibling bounded context inside the existing application and
  Neon/PostgreSQL database.
- Keep all existing India Discovery tables, worker routes, CLI commands,
  prompt version, worker secret, run leases, schedule, and candidate semantics
  operational and India-focused.
- Give Radar its own tables, repository, service, worker secret, HMAC purposes,
  leases, routes, commands, configuration, prompt version, and admin pages.
- Reuse the current application layering, admin authentication, same-origin
  security, Drizzle/Postgres.js persistence, private worker artifacts, and
  exact-replay pattern.
- Use local Codex public-web research as the initial provider-neutral source
  adapter. Do not add LangGraphJS or a paid search provider in V1.
- Store no full fetched pages, private participant data, personal email
  inference, authenticated-scraping output, or outreach state.
- Do not create or modify a local Codex automation during implementation. Ship
  the commands and runbook, then document the proposed schedule and setup.
- Use the six fictional records only as labelled test/documentation fixtures.
  They never enter production data, metrics, or live mutations.

## Existing Architecture to Preserve

The implementation follows the repository-wide dependency direction:

- pages and route handlers translate framework input/output;
- `app/server` owns authorization, orchestration, request security, and worker
  lifecycle;
- `app/domain` owns pure taxonomies, validation, classification gates,
  normalization, scoring, and deduplication-key construction;
- `db/repositories` owns all SQL and transaction boundaries;
- Drizzle schema and ordered migrations remain the database contract;
- PostgreSQL remains the sole source of truth;
- admin authorization remains `getCurrentSession()` plus `ADMIN_EMAILS`;
- admin/member pages and APIs remain network-only and outside the service-worker
  cache.

Radar must not reuse `discovery_runs`. The existing table has a global
single-running-run guard, India-local daily identity, India-specific
configuration, and candidate-specific counters. Reuse would make Radar and
India Discovery block one another and would couple unrelated review states.

No current tracked code, schema, migration, page, route, worker command, or
automation implements Global Demand Radar.

## System Boundary

```text
Global Radar Codex task
  -> claim a Radar-owned queued or scheduled run
  -> receive a deterministic, versioned query plan
  -> search permitted public sources
  -> submit a bounded evidence-first batch
  -> validate every stage and class hard gate
  -> normalize identities and requirements
  -> deduplicate and persist transactionally
  -> derive/update momentum aggregates
  -> expose safe DTOs for administrator review
```

The application owns planning policy, query templates, schemas, validation,
classification gates, scoring formulae, deduplication, persistence, run state,
authorization, review, and audit history. The initial Codex adapter owns public
search execution, concise extraction, and translation drafts only. A future
provider must emit the same provider-neutral batch.

## Signal Classes

Every persisted signal has exactly one class.

### `direct_demand`

An identifiable organisation or public procurement authority explicitly states
a present external need. At least one evidence record must support the explicit
need, and at least one such record must be a first-party source or official
public procurement source. Examples include an RFP, supplier registration,
vendor request, public
partner application, distributor request, manufacturing request, data
collection request, testing/certification request, or public procurement
notice.

Funding, hiring, deployment, expansion, and platform launches do not satisfy
this class unless the same evidence also states a current external request.
Expired asks cannot remain active direct demand.

### `demand_precursor`

A dated, supported development creates a specific and explainable path to a
likely external need, but no request is yet public. Examples include a robotics
model or platform launch, funding round, teleoperation or data-operations
hiring, new robot deployment, data-factory construction, India office, or
geographic expansion.

The UI and summaries must never present a precursor as procurement, a confirmed
partnership request, or willingness to work with India.

### `ecosystem_momentum`

Multiple independent organisations show a consistent technology,
infrastructure, research, policy, or market direction. One announcement,
syndicated copies of one announcement, or repeated activity from one corporate
group cannot establish momentum. Momentum is directional intelligence, not an
opportunity.

The database uses one discriminated signal table, as requested, but every
class has separate required fields, checks, scoring components, admin tab, and
ordering. There is no cross-class opaque score and no persisted `unclassified`
record. Ambiguous observations are rejected before signal persistence and
counted by bounded rejection reason on the run.

## Centrally Managed Taxonomy

Taxonomy source lives under `app/domain/taxonomies/` and is framework-free.
Rows store `taxonomy_version`; initial value is `global-radar-v1`. Unknown
taxonomy values fail validation rather than being silently placed in metadata.

The top-level demand families are:

- robot learning and manipulation;
- egocentric and human activity data;
- multimodal physical-world data;
- spatial AI and 3D data;
- tactile and contact-rich data;
- autonomous mobility and drones;
- industrial and workplace data;
- India-specific field data;
- speech and audio;
- synthetic data and evaluation;
- physical-data operational infrastructure;
- robotics hardware and ecosystem demand.

The V1 taxonomy contains these leaf concepts, converted to stable snake-case
identifiers in code:

- robot learning/manipulation: teleoperated trajectories, human task
  demonstrations, imitation-learning data, vision-language-action data, robot
  actions and joint states, successful/failed executions, human corrections,
  grasping, dexterous/bimanual manipulation, mobile manipulation, tool use,
  locomotion, navigation, human-robot interaction, and continuous rollout data;
- egocentric/human activity: first-person video, synchronized first/external
  video, hand-object interaction, hand/body pose, eye gaze, human motion,
  expert demonstrations, procedural/household/workplace activities, skilled
  trades, task narration, and commentary;
- multimodal physical world: RGB, stereo/depth, LiDAR, radar, thermal/event
  cameras, GPS/GNSS, IMU, wheel odometry, force/torque, tactile, environmental
  sensors, microphones, and calibrated synchronized sensor fusion;
- spatial AI/3D: multi-view capture, 3D reconstruction, RGB-D scenes, point
  clouds, meshes, camera poses, scene graphs, indoor/outdoor mapping,
  spatial-language grounding, digital twins, and world-model video;
- tactile/contact-rich: tactile images, force/torque feedback, slip detection,
  grasp stability, material properties, deformable-object interaction,
  visuotactile data, and industrial contact/assembly data;
- mobility/drones: Indian/mixed/unstructured roads, pedestrians/two-wheelers,
  rare traffic events, synchronized mobility sensors, AV/ADAS, drone
  navigation/aerial imagery/inspection, GPS-denied navigation, warehouse AMRs,
  ports, logistics, and construction navigation;
- industrial/workplace: factory processes, robotic assembly, machine tending,
  warehouse picking, packing/sorting, quality/defect inspection, maintenance,
  machine failures, worker-tool interaction, safety events, and robot
  failure/recovery/correction data;
- India field environments: agriculture, crops/pests, farms/rural settings,
  infrastructure, roads/bridges, utilities, construction, mining, ports,
  retail, warehouses, logistics, homes, hospitality, healthcare,
  rehabilitation, and wearable sensors;
- speech/audio: Indian languages, accented English, code-switching, noisy and
  far-field speech, human-robot commands, conversation, machinery/acoustic
  events, domain-expert dialogue, and customer-support audio;
- synthetic/evaluation: robotics simulation, synthetic sensors/trajectories,
  digital twins, sim-to-real, domain randomization, rare cases, world-model and
  reinforcement-learning data, physical-AI benchmarks, model/safety
  evaluation, failure analysis, and model-in-the-loop validation;
- physical-data operations: protocol and sensor-rig design, hardware,
  calibration/synchronization, participant/site access, consent,
  teleoperation/distributed field operations, ingestion, curation, annotation,
  semantic enrichment, QA/expert validation, de-identification, secure
  storage/transfer, licensing, continuous refresh, synthetic augmentation, and
  model evaluation;
- robotics hardware/ecosystem: motors, servos, actuators, gearboxes, encoders,
  sensors/cameras/LiDAR/radar, batteries/BMS, power electronics, embedded and
  edge-AI compute, microcontrollers, PCB design/manufacturing, EMS, harnesses,
  connectors, machining, sheet metal, enclosures, injection moulding,
  composites, prototyping, industrial design, contract manufacturing,
  ODM/OEM, assembly, testing/certification, imports/customs, logistics,
  integration, distribution, installation, maintenance/repair, after-sales
  support, and pilot-customer access.

Search and scoring use those identifiers rather than free-form synonyms.

The Indian execution archetype taxonomy is a separate shared source file so it
can later be reused by the Indian Ecosystem Map:

- `robotics_data_company`
- `robotics_lab`
- `university_network`
- `teleoperation_centre`
- `distributed_collector_network`
- `annotation_and_qa_company`
- `BPO_or_operations_company`
- `field_research_agency`
- `participant_recruitment_network`
- `residential_property_operator`
- `hospitality_network`
- `warehouse_operator`
- `factory_operator`
- `logistics_or_fleet_operator`
- `automotive_testing_company`
- `drone_operator`
- `agriculture_network`
- `healthcare_network`
- `infrastructure_company`
- `sensor_rig_provider`
- `robotics_hardware_provider`
- `simulation_or_digital_twin_studio`
- `cloud_and_data_infrastructure_provider`
- `privacy_and_deidentification_provider`
- `contract_manufacturer`
- `EMS_provider`
- `component_supplier`
- `testing_or_certification_lab`
- `system_integrator`
- `distributor`
- `installation_and_service_network`
- `specialist_creator_or_media`
- `government_or_industry_body`

## Modular Workflow Stages

Each stage has a strict Zod input/output schema, bounded collections and
strings, deterministic version identifiers, and tests independent of the
network and database.

1. `GlobalRadarPlanner`
   - input: run configuration, clock, scan mode, coverage state, watchlist state;
   - output: immutable `RadarPlan` with countries, languages, themes, source
     families, date window, result limit, taxonomy version, and score version.
2. `SearchQueryGenerator`
   - input: `RadarPlan` and approved query-template taxonomy;
   - output: deterministic `SearchQuery[]` with stable fingerprint, language,
     country, theme, signal intent, source adapter, recency, and execution order.
3. `SourceAdapters`
   - input: immutable queries;
   - output: bounded public `SourceObservation[]` and `SourceError[]`.
   - V1 adapter is the external `codex_public_web` worker; no browser or search
     SDK is introduced into application policy.
4. `EvidenceExtractor`
   - input: observations with public URLs and dates;
   - output: concise evidence claims, permitted short excerpts, original
     language, English summary, translation confidence, and supported field
     paths. It never returns full pages.
5. `SignalClassifier`
   - input: evidence candidates;
   - output: one proposed class plus gate facts, or a bounded rejection reason.
6. `RequirementExtractor`
   - input: a classified signal draft;
   - output: one or more normalized physical-data, hardware, manufacturing,
     deployment, market-access, research, or operational-service requirements.
7. `IndiaRelevanceAssessor`
   - input: evidence, requirements, geographic facts, and public exclusions;
   - output: relevance type, reasons, constraints, unknowns, confidence, and
     India-fit component score.
8. `EvidenceValidator`
   - input: complete draft;
   - output: validated signal or rejection. It enforces class hard gates,
     evidence presence, source rules, dates, response-path rules, translation
     separation, systems-context facts/inferences, and score coverage.
9. `Deduplicator`
   - input: validated signals and stable normalized identities;
   - output: new, update, duplicate, conflict, or explicit merge candidate.
10. `TransactionalPersistence`
    - input: validated resolutions and the leased run;
    - output: terminal run counts and safe replay result.
11. `AdminReview`
    - input: authenticated commands with expected record revisions;
    - output: safe updated DTOs plus append-only history/audit events.

The worker may propose classification, requirements, relevance, and scores, but
the application recomputes deterministic values and enforces hard gates. A
worker assertion alone never upgrades a precursor to direct demand or an
inference to explicit India relevance.

## Query and Source Strategy

### Daily tactical planning

The default plan prioritizes the United States and China, with opportunistic
high-quality coverage from Europe, Japan, South Korea, the Middle East,
Southeast Asia, and other markets. It targets at most 20 accepted signals.
Fewer or zero accepted signals is valid when evidence is weak.

Direct-demand templates combine capability terms with explicit request intent:
RFP, procurement, supplier registration, vendor, partner application,
distributor, contract manufacturing, data collection, teleoperation,
demonstrations, testing, certification, installation, or service support.

Precursor templates combine approved capability terms with launches, funding,
hiring, deployments, facilities, expansion, supply-chain buildout, robot fleets,
or India market entry. Generic company searches and generic marketing language
are excluded.

Weekly thematic plans rotate through: robot teleoperation/demonstrations;
egocentric/human-task video; industrial robotics data; autonomous mobility and
drones; tactile/force data; 3D spatial data; multilingual speech and
human-robot interaction; agriculture/field collection; synthetic data/digital
twins; physical-AI evaluation; robotics manufacturing; and India market entry
plus after-sales infrastructure.

Watchlist categories are configuration, not workflow code: physical-AI and
robotics foundation-model builders, humanoid/industrial robotics, autonomous
driving, drones, robotics-data companies, simulation/digital twins,
sensor/actuator companies, contract manufacturers, warehouse/logistics and
property/facility operators, AI research laboratories, and important robotics
investors/accelerators.

### Chinese search and translation

China plans generate equivalent Chinese and English query families. Evidence
stores the original public URL, original-language claim or permitted concise
excerpt, and a separately labelled English summary. Translation confidence is
stored separately from evidence confidence. A translation never replaces the
original text or becomes a factual source by itself.

### Source hierarchy

The source order is: official company material; official partner/supplier
pages; public procurement and RFP portals; official research; official datasets
and benchmarks; official jobs; official investor material; government and
industry sources; accelerator/investor updates; reputable technical/business
publications; public conference material; official public social posts.

Search-result pages may locate evidence but are not evidence. Low-quality
aggregators cannot be the sole support for a qualified signal. Jobs, funding,
and launches normally produce precursors. All sources must be public without
authentication.

Response paths are stored only when the evidence explicitly publishes a
professional channel: supplier/partner registration, procurement/RFP portal,
distributor application, official enquiry/India contact, research form, or an
officially published business email. URLs must be public HTTP(S). Email values
must appear in cited first-party evidence; the system never guesses a local
part, derives a personal address, or treats a person's contact as a company
response path.

Every executed query stores its run, exact query, normalized fingerprint,
language, source country, target theme, adapter, execution timestamp, result
count, and bounded error. Credentials, prompts containing secrets, full result
pages, and private browser state are never stored.

## India Relevance

API/domain values preserve the approved relevance vocabulary:

- `explicit_India`
- `existing_India_presence`
- `India_expansion`
- `globally_open`
- `inferred_India_compatible`
- `no_current_India_fit`

`explicit_India` requires evidence that explicitly mentions India, Indian
suppliers/participants/languages/roads/environments/manufacturing/distribution,
or India-based collection, installation, or service operations.

`inferred_India_compatible` requires an open or globally deliverable
requirement, a plausible taxonomy-backed Indian execution archetype, and no
evidence excluding India. It must be labelled as Mewtuals interpretation and
never phrased as the organisation wanting India.

The assessment stores `India_fit_reasons`, `India_fit_constraints`,
`India_fit_unknowns`, and `India_fit_confidence`. `no_current_India_fit` is a
valid, monitorable result and does not prevent persistence. Unknown or
materially unresolved regulatory/logistics facts remain null/unknown rather
than being converted into positive fit.

## Systems Context

Every qualified direct demand and every strong precursor (class score at or
above 70) requires these structured fields:

- `higher_level_system_goal`
- `relevant_stack_layer`
- `lower_level_inputs_required`
- `transformation_or_capability_added`
- `downstream_model_or_robot_behavior`
- `why_the_requirement_matters`
- `possible_Indian_execution_role`
- `factual_elements`
- `inferred_elements`
- `systems_context_summary`

The summary is 80–150 words. Robotics/hardware context uses this chain:
raw materials -> components -> structure -> actuators/joints -> power -> PCB
and electronics -> compute/chips -> sensors -> connectivity -> embedded
software -> AI/control -> assembly -> testing -> integration -> deployment ->
maintenance. Physical-data context uses: real-world access -> people/robots/
environments -> sensor capture -> calibration/synchronization -> ingestion ->
curation -> annotation -> QA -> training -> evaluation -> deployment ->
failures/corrections -> repeated collection. Facts and Mewtuals inference
remain separate arrays and are rendered separately. Weaker precursors and
momentum records may leave systems context null rather than inventing detail.

## Sensitive Data and Compliance Flags

The Radar makes no legal conclusion. It records possible complexity involving
faces, voices, biometrics, gaze, health, children, home interiors, workplace
monitoring, precise location, road users, employee data, industrial secrets,
defence/dual use, copyrighted material, and export controls.

Each signal stores nullable flags for consent, de-identification, legal review,
known residency requirements, and participant-rights complexity. Unknown means
null. A severe flag can force `needs_review` and reduce actionability, but it
does not state that an activity is lawful or unlawful.

## Class-Specific Scoring

All components are integers from 0–100, evidence-linked, versioned, and shown
in the admin detail. Composite scores order records only inside their own class
tab. They are never compared across classes and never override a hard gate.

Missing components remain null. Each composite stores `score_coverage`, the
sum of available component weights. A composite is null until coverage is at
least 0.80 and the class-required components are present.

### Direct demand

Required components are explicitness, evidence confidence, actionability, and
India fit. The transparent formula is:

```text
direct_demand_score = 0.18 explicitness
     + 0.12 evidence confidence
     + 0.10 freshness
     + 0.14 actionability
     + 0.12 India fit
     + 0.12 commercial potential
     + 0.07 repeatability
     + 0.05 response accessibility
     + 0.05 strategic learning
     + 0.05 (100 - compliance complexity)
```

Known weights are normalized when coverage is at least 0.80. Unknown compliance
complexity remains null rather than silently becoming zero risk. Direct demand
also requires explicitness at least 75 and evidence confidence at least 60.

### Demand precursor

Required components are evidence confidence, proximity to external demand, and
India fit:

```text
precursor_score = 0.20 evidence confidence
                + 0.20 proximity to external demand
                + 0.15 funding/deployment momentum
                + 0.15 likely data/hardware intensity
                + 0.15 India fit
                + 0.05 estimated time horizon
                + 0.10 strategic relevance
```

Known weights are normalized when coverage is at least 0.80. Time-horizon
anchors are 100 for at most 30 days, 80 for 31–90, 60 for 91–180, 35 for
181–365, and null when no supported estimate exists. Evidence confidence must
be at least 60; proximity must be at least 50 for qualification.

### Ecosystem momentum

The server derives momentum from deduplicated evidence and distinct entity
associations over 7-, 30-, and 90-day windows. It requires at least two
independent organisations, at least two evidence items, at least one primary
source, taxonomy consistency at least 70, and evidence quality at least 60.

Normalized breadth, primary-source, and diversity components use versioned
targets of five entities, five primary sources, and four source families.
Volume uses versioned per-taxonomy targets. Growth compares recent event rates
with their preceding windows and is clamped to 0–100.

```text
momentum_score = 0.25 independent entity breadth
               + 0.15 primary-source depth
               + 0.10 source diversity
               + 0.15 weighted 7/30/90-day volume
               + 0.15 growth versus preceding periods
               + 0.10 taxonomy consistency
               + 0.10 evidence quality
```

A momentum record may be human-qualified only when its evidence gates pass and
the configurable class threshold is met. Thresholds never qualify records
automatically.

### Freshness

Freshness is derived from the announcement/effective date, not worker
subjective judgement: 100 through 7 days, 80 through 30, 50 through 90, 20
through 180, and 0 after 180. A direct demand past its known expiry is marked
expired regardless of its prior score. An evergreen official intake must be
re-observed to remain active.

## Database Model

One additive migration introduces Radar-owned enums, constraints, indexes, and
the following eleven tables. Arrays are nullable when the distinction between
unknown and known-empty matters. JSONB is bounded and reserved for irregular
specification details, not primary filter fields.

Implementation clarification (2026-07-29): the fields called out below make
already-approved planning, scoring, replay, identity, and momentum rules
durable. They do not add a table, signal class, route, or cross-context write.
They close storage omissions discovered while implementing Tasks 2, 5, 8, and
9 so those policies are not hidden in `raw_metadata` or recomputed from mutable
configuration.

### `global_entities`

Stores lightweight identity:

- `id`, `canonical_name`, `normalized_name`, nullable `canonical_domain`,
  nullable `website_url`, nullable `linkedin_url`, nullable
  `canonical_corporate_group_id`, and canonical
  `stable_public_identifiers` as a bounded text array;
- `headquarters_country`, nullable `headquarters_city`, nullable
  `operating_countries`;
- `organisation_type`, `sector`, `short_description`;
- `entity_status`: `observed | watchlisted | monitoring | qualified | archived
  | promoted_to_candidate`;
- `first_seen_at`, `last_seen_at`, nullable `promoted_candidate_id`, bounded
  `raw_metadata`, integer `revision`, `created_at`, and `updated_at`.

Partial unique indexes protect normalized canonical domain and normalized
LinkedIn identity. `(normalized_name, headquarters_country)` is a collision
candidate, not an automatic merge rule. A GIN index makes canonical stable
public identifiers directly queryable rather than hiding them in metadata.
Automatically discovered entities
require at least one attached valid signal; administrator watchlist entries are
the only signal-free creation path.

### `global_radar_runs`

Stores:

- `id`, unique `external_run_key`, `request_hash`, `trigger` (`scheduled |
  manual | trial`), `scan_mode` (`daily | thematic | watchlist_refresh |
  manual`), run `status`, `plan_fingerprint`, and a bounded immutable
  `plan_snapshot`;
- `started_at`, `completed_at`, `created_at`, `updated_at`;
- source countries/languages, target domains/signal types, and sources used;
- `number_results_examined`, `number_entities_observed`,
  `number_signals_found`, `number_direct_demands`, `number_precursors`,
  `number_momentum_records`, `number_new`, `number_updated`,
  `number_duplicates`, `number_rejected_for_weak_evidence`, and
  `number_source_errors`;
- bounded `error_summary`, nullable `requested_by_email`;
- prompt/schema/taxonomy/scoring versions, Radar lease token hash/expiry,
  submission hash, and batch fingerprint.

It has its own advisory-lock namespace and partial one-running-run index, fully
independent from `discovery_runs`. Reusing an external key with a changed
request hash is a conflict. Manual queued runs sort before scheduled work.

### `global_radar_search_queries`

Stores one planned/executed query per run: `id`, run ID, query text and
fingerprint, language, source country, theme, class intent, adapter,
`recency_days`, ordinal, status, executed timestamp, results examined, bounded
error, and created timestamp. There is no separate `target_market` field; the
locked public query contract uses source country, theme, and intent. Unique
`(run_id, fingerprint)` prevents duplicated plan work.

### `global_radar_signals`

Stores the primary signal contract:

- `id`, `global_entity_id` (required for direct/precursor, nullable for
  multi-entity momentum), and exactly one `signal_class`;
- `demand_domain`, `signal_type`, `title`, `factual_summary`,
  `interpretation_summary`, required `theme`, and nullable
  `systems_context_summary`;
- `source_country`, nullable target/collection/manufacturing/delivery
  geographies, `industry`, nullable `target_model_or_system`, nullable target
  capability tags, and nullable required counterparty archetypes;
- `india_relevance_type`, rationale, reasons, constraints, unknowns, and
  confidence;
- direct/generic components: demand explicitness, evidence confidence, India
  fit, actionability, commercial potential, repeatability, strategic learning,
  freshness, response accessibility, and compliance complexity;
- precursor-only components: proximity to external demand,
  funding/deployment momentum, likely data/hardware intensity, estimated time
  horizon, and strategic relevance;
- momentum-only components: independent entity count, primary-source count,
  source diversity, 7/30/90-day volume, growth versus previous period,
  taxonomy consistency, and evidence quality;
- nullable `direct_demand_score`, `precursor_score`, `momentum_score`, score
  coverage, and score-policy version;
- nullable `announced_at`, `effective_from`, `expires_at`, direct-only required
  boolean `evergreen` and nullable `reobserve_by`, plus required `observed_at`;
- status: `newly_discovered | needs_review | monitoring | qualified |
  dismissed | expired | promoted`;
- nullable public response path type/URL/business email and partner application
  URL;
- source language, extraction method, taxonomy version, bounded raw metadata,
  and timestamps;
- structured systems-context columns, India assessment arrays, and sensitive
  data/compliance fields defined above.

It additionally stores:

- stable `dedupe_key`, revision, first/most-recent run IDs, and optional
  `merged_into_signal_id`; `dedupe_version` and nullable
  `momentum_policy_version` make the applicable derivation policies explicit;
- first/last seen timestamps and created/updated timestamps.

Class checks require only the fields appropriate to the discriminator. There is
no generic opportunity score. Non-applicable class-specific component and
composite columns must be null, enforced in both the domain schema and database
checks. Direct demand requires `evergreen`; `reobserve_by` is required if and
only if that flag is true. Both columns are null for non-direct classes. Active
signal identity is a partial unique index on `(dedupe_version, dedupe_key)`
where `merged_into_signal_id IS NULL`; dismissed and expired unmerged rows
continue to own the key, while merged historical versions remain inspectable.

### `global_radar_signal_entities`

Many-to-many association for supporting entities and momentum contributors,
with signal ID, entity ID, role, confidence, and created timestamp. Unique
`(signal_id, entity_id, role)` prevents duplicate associations.
Direct/precursor records use the signal's
`global_entity_id` as their primary entity and may add supporting entities.
Momentum may use several contributors, which is how the
independent-organisation gate remains inspectable instead of being hidden in a
count.

### `global_signal_requirements`

Stores `id`, signal ID, requirement kind (`physical_data | robotics_hardware |
manufacturing | deployment | market_access | research | operational_service`),
capability tag, required concise `summary`, nullable data families, sensor
modalities, environments, task
families, collection methods, human roles, robot embodiments, Indian execution
archetypes, bounded scale/technical/quality/rights-and-compliance JSONB,
confidence, requirement fingerprint, and timestamps. A normalized requirement
fingerprint prevents duplicates within a signal.

### `global_signal_evidence`

Stores `id`, signal and run IDs, nullable contributor `global_entity_id`, source
URL/name/type/language/country, required `source_family`,
evidence claim, permitted concise source excerpt, separate English summary,
nullable published date, observed date, evidence confidence, translation
confidence, primary-source flag, required `is_syndicated`, direct-demand support flag, India-relevance
support flag, bounded raw metadata, and created timestamp. It also stores the
canonical URL, evidence fingerprint, and `supported_field_paths`.
Those field paths provide field-level provenance. Unique
`(signal_id, evidence_fingerprint)` allows several sources while preventing
exact replay duplication. Full page contents are forbidden.

### `global_signal_updates`

Preserves every automated or administrator-visible signal change. It stores
update type, previous/new safe state, optional evidence, actor type/ID/email,
reason, observed/created timestamps, and idempotency key. Rediscovery never
silently overwrites human status, classification, expiry, notes, or promotion
state.

### `global_radar_watchlist_entries`

Stores configurable entity monitoring: entity ID, enabled/paused state,
priority, one `theme`, `category`, required `category_search_term_en`, nullable
`category_search_term_zh_cn`, countries, languages, cadence, next
scan, reason, creator, revision, and timestamps. The domain/repository boundary
requires the Chinese term whenever China is effective work. No watchlist values
are hard-coded into workflow logic. Disabling an entry preserves the row and
history.

### `global_radar_promotions`

Stores idempotency/request hashes, Radar entity, primary supporting signal,
all supporting signal IDs, eligibility path, expected revisions, previous
entity/signal statuses, Discovery run/candidate links, actor, reason, source
snapshot digest, status, promotion and reversal timestamps/actors/reasons. One
entity has at most one active promotion. Failed/conflicted attempts remain
inspectable.

### `global_radar_admin_events`

Append-only audit for signal, entity, watchlist, merge, and promotion actions.
It stores actor, target, action, reason, bounded safe before/after values,
idempotency key, and timestamp. It never stores lease hashes, secrets, full
payloads, or full sources.

## Deduplication, History, and Exact Replay

Entity identity uses canonical domain, normalized official website, normalized
LinkedIn organisation URL, and stable public identifiers. Name-only equality
never auto-merges unrelated entities.

Signal dedupe key is a versioned hash over signal class, primary/supporting
entity identities, normalized signal type and requirement fingerprints,
approximate announced-time bucket, target geographies, and primary source.
Mirrors of one development become evidence on one signal. A changed deadline,
scope, requested geography, or materially changed requirement creates an update
and may create a new signal version rather than erasing the old state.

Completion locks the Radar run and verifies status, unexpired lease hash, and
canonical validated submission hash. Inside one transaction it resolves entity
and signal identities, inserts/updates signals, requirements, evidence,
associations, update history, query outcomes, and terminal counters.

The same terminal run, lease, and submission hash returns `replayed` with no
writes. A changed hash conflicts. After an unknown timeout, the operator retries
the exact same mode-`0600` batch file; it never regenerates or rescales the
batch. Partial source success persists valid signals and records bounded errors.
Zero valid signals with errors fails; an honest zero-signal run without source
failure may succeed with zero records.

## Run Lifecycle and Worker Protocol

Radar statuses are `queued`, `running`, `succeeded`, `partial`, and `failed`.
Signal statuses are exactly `newly_discovered`, `needs_review`, `monitoring`,
`qualified`, `dismissed`, `expired`, and `promoted`.

New valid signals start `newly_discovered`. A deterministic compliance or
missing-score-coverage condition may start them `needs_review`; ingestion never
starts a signal `qualified` or `promoted`. Class thresholds do not control
persistence. They control within-tab high-quality metrics and are required
preconditions for the administrator's `qualify` action.

Allowed human-visible transitions are explicit:

- newly discovered -> needs review, monitoring, dismissed, or expired;
- needs review -> qualified, monitoring, dismissed, or expired;
- monitoring -> needs review, qualified, dismissed, or expired;
- qualified -> monitoring, dismissed, expired, or promoted;
- promoted -> qualified only through promotion reversal;
- dismissed/expired -> needs review when new evidence or an explicit admin
  reopen supplies a reason.

Marking no India fit sets `no_current_India_fit` and normally leaves the signal
in monitoring; the administrator may dismiss it separately. Rediscovery may
refresh facts and recency but cannot change a human status without an explicit
transition and update event.

Scheduled daily keys include the Asia/Kolkata local date and immutable config
hash. Weekly thematic keys include ISO week, theme, and config hash. Manual
requests use an administrator request UUID and have claim priority. A valid
Radar run does not block India Discovery and vice versa.

Claim recovery is terminal and deterministic. Inside the Radar claim
transaction, every `running` row whose lease has expired is changed to
`failed`, receives `completed_at`, and records bounded `lease_expired` failure
metadata before the active-run check and next selection. The expired run is not
silently requeued; a later scheduled key or explicit administrator request
creates the next attempt.

Worker endpoints are separate:

- `POST /api/global-radar/worker/claim`
- `POST /api/global-radar/worker/runs/:runId/complete`
- `POST /api/global-radar/worker/runs/:runId/fail`
- `POST /api/global-radar/worker/runs/:runId/abandon`

The worker command family is:

- `npm run global-radar:claim`
- `npm run global-radar:validate -- --file <batch.json>`
- `npm run global-radar:submit -- --claim-file <claim.json> --file <batch.json>`
- `npm run global-radar:fail -- --claim-file <claim.json> --message <safe-message>`
- `npm run global-radar:abandon -- --run-id <run-id> --message <safe-message>`

Claim writes the secret-bearing response only to a private temporary file with
mode `0600` and prints a bounded safe summary. Submit uses 120 seconds; other
network commands use 30 seconds. The worker secret and HMAC purpose are unique
to Radar, so Radar credentials cannot invoke Discovery routes.

`fail` is the normal terminal path when the worker still has its lease but
cannot submit a valid batch. `abandon` is Radar-secret-authenticated orphan
recovery used only when the claim artifact/lease token is irrecoverably lost.
It authenticates with `GLOBAL_RADAR_WORKER_SECRET` from the local environment
and requires the explicit safe run ID, not the lost claim file.
It may change a currently `running` Radar run to `failed` with bounded
`abandoned` metadata and `completed_at`; it cannot change a queued or successful
run. Repeating the same abandonment for the already-abandoned run is an
idempotent replay, while a different reason or another terminal state
conflicts. Either terminal path releases the Radar-only partial running index.

The batch is capped at 20 accepted signals, 100 evidence items, 100
requirements, 120 executed queries, 50 entities, 50 bounded source errors, and
2 MiB serialized size. Strict schemas reject unknown keys and overlong or
unbounded metadata before persistence.

## Application Services and Routes

Focused services own:

- queue/claim/complete/fail/abandon Radar runs;
- load class metrics and filtered signal summaries;
- load one signal detail;
- qualify, monitor, dismiss, mark no India fit, edit classification, and edit
  expiry with optimistic revision checks;
- append evidence and administrator notes;
- merge duplicate signals transactionally without deleting history;
- add/pause/remove an entity watchlist entry;
- promote an entity and reverse promotion;
- expire stale direct demand and recompute momentum from validated evidence.

Admin mutation routes are intent-specific:

- `POST /api/admin/global-demand-radar/runs`
- `PATCH /api/admin/global-demand-radar/signals/:signalId`
- `POST /api/admin/global-demand-radar/signals/:signalId/evidence`
- `POST /api/admin/global-demand-radar/signals/:signalId/notes`
- `POST /api/admin/global-demand-radar/signals/:signalId/merge`
- `PATCH /api/admin/global-demand-radar/entities/:entityId/watchlist`
- `POST /api/admin/global-demand-radar/entities/:entityId/promotions`
- `POST /api/admin/global-demand-radar/entities/:entityId/promotions/reverse`

All mutations enforce same-origin, session authentication, administrator
authorization in the service, bounded JSON, strict schemas, actor derivation
from the session, optimistic revision, and append-only audit. Conflict returns
HTTP 409 with the latest safe DTO.

## Controlled Promotion Boundary

Promotion is the only deliberate bridge into `discovery_candidates`. Every
path requires a human administrator, a currently qualified primary supporting
signal, a supported reason, public identity evidence, matching revisions, no
unresolved identifier conflict, and one explicitly selected eligibility path:

1. `qualified_india_direct_demand`: one qualified direct demand at or above the
   direct threshold, with a non-`no_current_India_fit` relevance type;
2. `repeated_india_compatible_signals`: at least three qualified direct-demand
   or precursor signals in the trailing 180 days, each at or above its class
   threshold and each non-`no_current_India_fit`;
3. `documented_indian_relationship`: the qualified primary signal has primary
   evidence explicitly supporting an existing Indian relationship or presence;
4. `exceptional_strategic_relevance`: the primary signal and entity are both
   qualified, at least two independent primary sources support the case, and an
   administrator rationale is recorded in the audit event.

The administrator selects one primary supporting signal. The promotion record
also stores every supporting signal ID used for the chosen eligibility path,
the eligibility path, and immutable snapshots of the entity and primary signal
states.

A focused bridge repository owns one transaction across Radar and Discovery
tables. It reuses the existing candidate identity rules, creates or resolves a
candidate, adds bounded public source evidence, records the promotion, updates
the Radar entity/signal, and appends audits. Radar repositories do not otherwise
write Discovery tables.

Because current candidates and source rows require a Discovery run, promotion
creates an already-terminal `radar_promotion` Discovery intake run with an
idempotent external key. This adds one enum value but does not alter India
scheduled/manual claim behavior. New candidates begin `discovered`; existing
candidate status is preserved. Promotion never creates or verifies a member
profile, queues matching, generates an opportunity, or initiates outreach.

Reversal is compensating and non-destructive: it marks the promotion reversed,
clears `promoted_candidate_id` when it still matches, restores the entity and
primary signal statuses captured by the promotion, and preserves the Discovery
candidate and all history unchanged. Reversal requires matching current
revisions; if later administrator changes make restoration unsafe, it returns
409 rather than guessing a state.

## Admin Information Architecture

`/admin/global-demand-radar` redirects to the first of five deep-linkable tabs:

1. `/admin/global-demand-radar/direct-demand`
2. `/admin/global-demand-radar/demand-precursors`
3. `/admin/global-demand-radar/momentum`
4. `/admin/global-demand-radar/watchlist`
5. `/admin/global-demand-radar/runs`

The shared administrator navigation becomes Verification Queue, India
Discovery, and Global Demand Radar. It stays inside the authenticated product
shell and never appears in the public header. Active destinations use
`aria-current`.

The first three tabs are separate server-owned views over the discriminated
signal model, with class-appropriate metrics, GET filters, pagination, truthful
empty states, and links to
`/admin/global-demand-radar/signals/:signalId`. Watchlist is entity-oriented.
Runs exposes only safe status, counts, timings, notices, and manual queueing.

Summary metrics cover the requested new signals, active direct demand,
high-quality precursors, explicit/inferred India signals, US/China/other
counts, physical-data/hardware split, capability families, expiry, promotion,
latest run, source errors, and merged duplicates.

Signal detail is a full route, not the existing Discovery drawer. It renders
the requested information in this exact order:

1. Organisation
2. What changed
3. Signal class
4. Publicly supported facts
5. Mewtuals interpretation
6. Required capabilities
7. Physical-data or hardware specifications
8. Target environments and tasks
9. Indian execution archetypes
10. India-fit reasoning and constraints
11. Systems-context explanation
12. Scale and timeline
13. Public response path
14. Compliance flags
15. Supporting evidence
16. Original-language source
17. English summary
18. Score rationale
19. Signal history
20. Admin notes and actions

Facts, inference, translation, and score rationale remain visually distinct.
Original text has the correct `lang`/`dir`. Public response paths are evidence,
not outreach controls.

List DTOs contain only fields needed for rows. Detail DTOs explicitly allowlist
the twenty sections. Run DTOs omit lease/submission hashes, secrets, raw
provider payloads, rejected bodies, private failures, and unrestricted metadata.

## Responsive and Accessibility Contract

At `max-width: 767px`, pages use safe-area gutters, have no document-level
horizontal overflow, and keep visible controls at least 44px square. The tab
bar may be a contained, labelled horizontal rail. It remains keyboard
scrollable, visibly focused, and contained within the page.

Metrics use semantic description lists. Filters are labelled GET forms. Wide
lists use semantic tables and switch to complete cards below the established
table breakpoint. Pagination preserves filters. Detail actions stack on mobile.
Long URLs, arrays, Chinese text, and translated summaries wrap safely. Status
and compliance never rely on color alone.

## Environment and Operations

New configuration is parsed at the server/CLI edge:

- `GLOBAL_RADAR_WORKER_SECRET`
- `GLOBAL_RADAR_API_BASE_URL`
- `GLOBAL_RADAR_COUNTRIES` (default `United States,China`)
- `GLOBAL_RADAR_LANGUAGES` (default `en,zh-CN`)
- `GLOBAL_RADAR_THEMES`
- `GLOBAL_RADAR_ENABLED_SOURCES` (default `codex_public_web`)
- `GLOBAL_RADAR_RESULT_LIMIT` (default 20, maximum 20)
- `GLOBAL_RADAR_DIRECT_THRESHOLD` (default 70)
- `GLOBAL_RADAR_PRECURSOR_THRESHOLD` (default 65)
- `GLOBAL_RADAR_MOMENTUM_THRESHOLD` (default 70)

Thresholds do not reject otherwise valid evidence-backed records. They define
the high-quality summary metrics and the minimum score for an administrator to
qualify that class. Promotion applies the explicit eligibility rules above;
scores alone never promote an entity.

The runbook documents exact commands, private-file handling, safe output,
manual runs, failure/replay recovery, and source rules. The proposed automation
schedule is a daily tactical run at 10:30 Asia/Kolkata, leaving the India task
at 08:30 untouched. A weekly thematic run is proposed for Sunday at 11:30 with
a rotating approved theme. Actual automation creation requires a separate,
explicit user action.

## Migration Strategy

Generate the next forward-only Drizzle migration from the schema. It adds
Radar enums/tables/indexes plus `radar_promotion` to the existing Discovery run
trigger enum. No existing column or row is deleted or repurposed.

The migration harness must test:

1. a fresh database through the new migration;
2. upgrade from `0007` with populated users, sessions, profiles, verification
   reviews, Opportunity Brief requests, Discovery runs, candidates,
   identifiers, evidence, campaign keys, and candidate research versions;
3. exact preservation of those populated rows and constraints after upgrade;
4. the new Radar schema, enum, FK, check, uniqueness, and index contract.

Runtime migration continues through the existing `db:migrate` command. No
production migration or deployment is implied by local implementation.

## Fictional Examples

Six schema-valid fixtures and a documentation table illustrate correct
classification without becoming live data:

1. an official request for teleoperated robot data — `direct_demand`, external
   request evidence required, initially `needs_review`;
2. an official humanoid deployment announcement without an external ask —
   `demand_precursor`, monitored and never labelled procurement;
3. an official India-specific autonomous-navigation data request —
   `direct_demand` with `explicit_India`;
4. an official Chinese-language request for Indian manufacturing —
   `direct_demand`, original Chinese plus separate English summary and
   translation confidence;
5. an official requirement for noisy Indian-language speech —
   `direct_demand` with speech/audio capabilities and explicit India evidence;
6. a multi-organisation physical-AI platform direction —
   `ecosystem_momentum`, qualified only after independent-entity gates pass.

Fixtures use reserved `.example` domains, fictional UUIDs, and an explicit
`fictionalExample` marker. Tests prove production repository input rejects that
marker and the live admin surface never mixes fixtures into metrics or actions.

## Testing and Verification

### Domain/unit tests

- signal-class gates and refusal to upgrade precursors;
- generic-marketing rejection;
- English/Chinese query generation and original-language preservation;
- translation/evidence confidence separation;
- taxonomy and Indian archetype validation;
- entity/signal/requirement/evidence normalization and fingerprints;
- explicit versus inferred India relevance;
- public response paths and refusal to infer personal emails;
- sensitive-data flags and null unknowns;
- class formulas, score coverage, freshness, expiry, and momentum gates;
- systems-context word limits and factual/inferred separation.

### Service/route tests

- administrator and worker authorization;
- same-origin and bounded-body enforcement;
- leased runs, manual priority, expiry, fail/abandon, source isolation, and
  exact replay;
- admin filters, statuses, revision conflicts, notes/evidence append, merge,
  watchlist, promotion, and compensating reversal;
- DTO tests proving secrets, raw payloads, full sources, and private notes do
  not leak.

### PostgreSQL/migration tests

- fresh and populated-upgrade migrations;
- independent Discovery/Radar simultaneous claims;
- entity and signal identity collisions;
- multiple evidence records for one signal;
- exact replay with no duplicate entities, signals, requirements, evidence,
  updates, queries, or counters;
- atomic rollback, update history, optimistic revisions, expiry, watchlist, and
  momentum aggregation;
- promotion idempotency, candidate deduplication, status preservation, and
  promotion-versus-Discovery ingestion races.

### UI and browser tests

- exact five-tab order, URLs, active state, filters, pagination, and empty
  states;
- exact twenty-section detail order;
- signed-out, non-admin, and admin behavior;
- all review actions and accessible status/conflict feedback;
- 320, 390, 767, and 1440 pixel overflow, touch-target, focus, tab-rail, table,
  card, and long-text checks;
- admin/API network-only privacy and the public offline fallback;
- assertion that no Radar action produces an outreach persistence or network
  operation.

### Release gate

Run the focused tests while implementing, then:

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

Add `typecheck` as `tsc --noEmit`. Confirm existing authentication, onboarding,
verification, member dashboard, India Discovery, admin, PWA, and build tests
remain green.

## Out of Scope

- automatic matching to Indian organisations;
- opportunity generation or recommendations;
- automated outreach, introductions, emails, or campaigns;
- private contact enrichment or personal-email inference;
- authenticated social scraping or data brokers;
- physical data collection or participant recruitment;
- legal approval or commercial negotiation;
- full foreign-company profiling;
- member verification;
- claims of willingness to partner without public evidence;
- deployment, production migration, or automation creation without separate
  authorization.

## Completion Criteria

Implementation is complete when the additive migration, domain stages,
provider-neutral worker protocol, deterministic queries and scoring, Radar
repository/services/routes, five-tab admin UI, detail and review flows,
watchlist, promotion bridge, operations documentation, fictional fixtures, and
specified tests exist and pass the complete release gate.

The final handoff must list migrations, tables/fields, taxonomies, workflow
stages, source adapters, query policy, formulas, routes/components, tests,
environment variables, manual commands, proposed automation schedule/setup,
and explicit evidence that the India Discovery Agent remains operational and
unchanged in purpose.
