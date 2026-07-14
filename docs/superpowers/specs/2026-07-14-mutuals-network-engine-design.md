# Mutuals Network Engine — v0 Design

Status: approved product direction; implementation not started.

## 1. Purpose

Mutuals is building India's company-to-company opportunity infrastructure.

Its first product is an external partnerships function for early-stage companies. For one anchor company, Mutuals identifies the highest-value partnership currently worth pursuing, structures the exchange, and advances it to a decision-ready pilot. The company's team owns product and delivery.

The engine's governing rule is:

> Mutuals matches present assets to present needs; it does not manufacture synergy.

A valid run may therefore conclude:

> No partnership is currently worth pursuing. Reassess when one side gains distribution, customers or a strategic asset.

## 2. v0 scope

v0 supports all three initial partnership families. The focus condition determines which family is relevant; the product does not force a family before understanding the company.

### Distribution pathways

- distribution and referrals;
- financing-led conversion;
- repeatable creator-network or agency distribution.

### Strategic access

- strategic supply or manufacturing access.

### Commercial product combinations

- commercial integrations beyond public APIs;
- product bundles and cross-selling.

### Explicitly out of scope

CA/compliance directories, app recommendations, hiring, vendor reviews, market-image feedback, daily recommendations, expertise maps, generic startup promotion, autonomous outreach, and unrestricted social-media scraping are not part of v0.

## 3. Prototype success contract

Given a company URL, a founder or company LinkedIn URL, optional founder-supplied material, and a one-sentence current priority, v0 must:

1. produce an evidence-backed Company Model;
2. let the founder confirm or correct one focus condition and its missing asset;
3. return one explicit disposition:
   - **Pursue** — a hypothesis survives the gates and has a decision-ready pilot;
   - **Investigate** — the opportunity may be valuable, but named unknowns must be resolved first;
   - **No partnership** — present assets and needs do not justify action now;
4. preserve facts, founder statements, and inferences as different claim types;
5. expose evidence and confidence, and record founder corrections;
6. produce zero to three deliberately diverse internal hypotheses; and
7. for every surviving hypothesis, specify the counterparty, exchange, economics, responsibilities, pilot, metric, risks, and decision required.

This is called a contract because it makes prototype success falsifiable. Producing attractive ideas without evidence, a pilot, or a defensible disposition does not satisfy it.

## 4. The two intelligence systems

### Company Model — what is true about this company?

Capture:

- product, buyer, pricing, and sales motion;
- stage and strategic priorities;
- customer journey and revenue leakages;
- needs, constraints, and timing;
- assets: customers, distribution, expertise, data, trust, touchpoints, product capability, vendor relationships, technology, talent, and capital;
- external dependencies; and
- what the founder is willing and able to execute.

Public research creates the initial hypothesis. The founder conversation corrects it.

### Opportunity Playbook — what tends to work in this condition?

Each playbook contains:

- a recognisable company condition;
- a specific problem or opportunity;
- a mechanism that has worked or is credibly testable;
- required counterparty characteristics;
- the smallest reversible pilot;
- expected metric and time horizon; and
- risks, dependencies, and failure signals.

The core transformation is:

`Company condition → relevant playbooks → suitable counterparties → customised pilot`

## 5. Ubiquitous language and core records

These concepts remain distinct in code, storage, tests, and the operator interface.

### Evidence claim

An atomic statement about a company or counterparty with:

- claim text and structured attribute;
- subject company;
- claim kind: `observed`, `founder_stated`, or `inferred`;
- verification status: `unreviewed`, `confirmed`, `disputed`, `contradicted`, or `superseded`;
- source URL or founder interaction reference;
- capture time;
- confidence and rationale; and
- supersession history.

Claim kind preserves how a statement entered the system; verification status records what happened to it later. A founder-stated claim can therefore become contradicted without losing its origin. Confidence never turns an inference into a fact.

An **information gap** is a required field or decision question with no adequate claim yet. It is stored separately rather than represented as a fictional `unknown` claim. The interface can still present the human-readable states observed, founder-stated, inferred, contradicted, and unknown by composing claim kind, verification status, and information gaps.

### Company Model

A versioned view assembled from evidence claims. It is a current interpretation, not an untraceable summary blob.

### Condition Portfolio

A company may have several current conditions. Each condition states the observable situation, desired change, timing, constraints, and supporting evidence. One condition becomes the **focus condition** for an engine run.

### Missing asset

The external capability, access, distribution, supply, trust, or product element preventing the focus condition from improving. It must be specific enough to search for and must not merely restate the need.

### Opportunity Playbook

A reusable mechanism that maps a known condition and missing asset to a counterparty archetype and a reversible pilot.

### Counterparty candidate

A specific organisation that appears to possess the required asset and may have a reciprocal reason to participate. Its fit is also evidence-backed; reachability alone is not fit.

### Opportunity hypothesis

A testable proposed value path connecting one anchor-company need to one present counterparty asset, with reciprocal value, economics, responsibilities, pilot, measurement, and failure conditions.

### Engine run

The durable history of one focus condition moving through research, validation, composition, review, and disposition.

## 6. Cold-start model

Mutuals starts as an opportunity service with an expanding network underneath it.

The cold start uses **anchor company + archetype library**:

1. model one real anchor company truthfully;
2. choose one present focus condition;
3. retrieve playbooks as search priors, not as answers;
4. search the open web and Mutuals' growing relationship memory for counterparties;
5. validate both sides' present assets and needs;
6. structure the smallest test; and
7. store what the attempt teaches the company model, playbook, and network.

Two acquisition lanes feed the same engine:

- **Company-first:** begin with a founder Mutuals can help, then find a fitting playbook and counterparty.
- **Playbook-first:** begin with a strong mechanism observed in the market, then identify companies whose current condition actually fits it.

Neither lane is allowed to skip current-condition validation.

## 7. End-to-end workflow

### Initial inputs

- company URL;
- founder or company LinkedIn URL;
- optional product demo, pitch deck, or app link; and
- current priority in one sentence.

### Research and modelling

1. The intake boundary validates URLs, consent, and run ownership.
2. Source adapters retrieve permitted public or founder-supplied material: company pages, product pages, public profiles, reviews, job listings, founder posts, and press.
3. The extraction service writes atomic claims into the evidence ledger with provenance and confidence.
4. The Company Model projector assembles a versioned model from current claims.
5. The condition service infers a Condition Portfolio and creates questions that could invalidate weak assumptions.
6. A founder or operator corrects the model and confirms one focus condition.
7. The missing-asset service defines the external asset required now.

### Opportunity formation

8. Playbook retrieval searches all three v0 families for condition fit.
9. Hybrid discovery searches both:
   - open-web evidence for capability and strategic fit; and
   - Mutuals network evidence for trust, access, responsiveness, and prior outcomes.
10. The composer creates complete value-path hypotheses.
11. Deterministic hard gates classify hypotheses as `pass`, `needs_evidence`, or `fail` and preserve their rationale.
12. The ranker scores `pass` hypotheses; the diversity selector returns at most three. If none pass, specific `needs_evidence` hypotheses may support an `investigate` disposition.
13. The presentation policy may expose only the strongest hypothesis while preserving the internal set.

### Human decision and feedback

14. The meeting dashboard shows the model, weak assumptions, questions, and possible unlocks.
15. A human chooses `pursue`, `investigate`, or `no partnership`.
16. For `pursue`, an operator approves and carries out outreach; v0 never sends autonomously.
17. Qualification, negotiation, pilot decisions, and outcomes are recorded as events.
18. Feedback updates Company Models, condition evidence, playbook performance, and network relationship evidence without overwriting history.

## 8. Hard gates and ranking

Ranking is a pipeline, not one opaque model score. Every gate returns one of:

- `pass` — sufficient current evidence supports the gate;
- `needs_evidence` — the path is plausible, but named information gaps prevent a decision; or
- `fail` — current evidence invalidates the path.

Each result stores reason codes, evidence references, and blockers. `needs_evidence` paths are retained for investigation; `fail` paths do not enter ranking.

### Gate 1 — condition-to-playbook relevance

The playbook must address the focus condition and named missing asset. A merely interesting mechanism fails.

### Gate 2 — counterparty fit

There must be evidence that the candidate possesses the required asset, can plausibly execute, and has a present reciprocal reason to engage.

### Gate 3 — complete opportunity actionability

A hypothesis passes only if all are true:

- both sides exchange identifiable present value;
- the anchor company has authority and capacity to act;
- a bounded pilot can be described;
- responsibilities and customer/data boundaries are explicit;
- downside is acceptable and the pilot is reversible;
- a measurable signal can arrive within a stated horizon; and
- no known strategic, legal, trust, or brand conflict invalidates the path.

### Ranking dimensions

Passing hypotheses are scored with deterministic, inspectable rubrics for:

- expected value;
- evidence confidence;
- reciprocity;
- timing;
- execution effort;
- reversibility;
- time to evidence; and
- strategic and operational risk.

Category-specific sub-scores may be added behind a versioned scoring policy. For example, distribution pathways care about qualified reach and handoff conversion; strategic access cares about capacity, lead time, and dependency concentration; product combinations care about integration ownership, attach rate, and support burden.

Do not pretend that early estimates are precise. v0 uses anchored ordinal ratings with written rationale. Scoring-policy versions, component scores, and human overrides are stored so later outcomes can be compared with the original judgment.

### Diversity selection

The final internal set contains zero to three hypotheses and avoids near-duplicates. When evidence permits, the roles are:

- high-confidence;
- adjacent but materially different; and
- non-obvious but still evidence-backed.

Three is a ceiling, not a quota.

### Disposition rules

- **Pursue:** at least one `pass` hypothesis is decision-ready.
- **Investigate:** no hypothesis is decision-ready, but at least one `needs_evidence` path remains plausible. The result must list the exact questions or research actions required.
- **No partnership:** every considered path is `fail`, with enough evidence to conclude that present assets and needs do not justify action. The result must state what change would justify reassessment.

## 9. Meeting dashboard contract

The operator-facing dashboard displays only:

- what the company does;
- who it serves;
- how it currently grows;
- current condition hypotheses;
- assets it can exchange;
- external dependencies;
- three possible unlocks at most;
- evidence and confidence;
- questions to ask now;
- potential counterparties; and
- the smallest pilot.

Inferred needs are visually and semantically hypotheses, never facts. The meeting exists to correct the model, not to perform confidence theatre.

## 10. Architecture

v0 uses a typed evidence pipeline with human gates. It is neither one monolithic prompt nor an autonomous multi-agent swarm.

### Domain layer

Framework-independent TypeScript modules own:

- Company Model and claim semantics;
- condition selection;
- playbook eligibility;
- hard gates;
- scoring policies;
- diversity rules;
- disposition rules; and
- pilot completeness rules.

These modules accept plain data and run without a model provider, database, web framework, or orchestration runtime.

### Application layer

Focused use cases coordinate domain behavior:

- `StartOpportunityRun`;
- `ResearchCompany`;
- `BuildCompanyModel`;
- `ConfirmFocusCondition`;
- `DiscoverCounterparties`;
- `GenerateOpportunitySet`;
- `ReviewOpportunitySet`;
- `RecordDisposition`; and
- `RecordOutcome`.

The application layer owns ports for evidence sources, model inference, repositories, clocks, search, notifications, and a narrow `WorkflowScheduler` used to request that a persisted run start or resume. It does not own or depend on a LangGraph-shaped orchestrator.

### Adapters

Outer adapters implement:

- public web and official API retrieval;
- founder-supplied document parsing;
- LLM structured extraction and hypothesis drafting;
- persistent repositories;
- meeting dashboard delivery;
- operator-approved communications; and
- the workflow runtime.

External source, model-provider, persistence, and orchestration types do not enter the domain.

## 11. LangGraphJS decision

### Recommendation

**Conditionally adopt** `@langchain/langgraph` for v0 as a replaceable workflow driver only after a short deployment compatibility spike passes. Do not make application work depend on it before that result, and do not use it as the domain model, canonical database, ranking engine, or autonomous agent framework.

It fits this workflow because an engine run is long-lived, stateful, retriable, and interrupted by human decisions. LangGraphJS directly supports explicit graph state, persistence checkpoints, retries, and human-in-the-loop interrupts. Its Graph API also makes the run inspectable as named nodes and transitions.

### Chosen shape

- Prefer the typed `StateGraph`/Graph API over a free-running agent or the Functional API. The explicit graph better matches an auditable business process.
- Use LangGraph without requiring the wider LangChain abstraction stack beyond its core peer dependency.
- Keep graph state small: run identifiers, current stage, references to persisted records, bounded intermediate outputs, and pending human decision.
- Keep canonical Company Models, evidence, playbooks, hypotheses, decisions, and outcomes in Mutuals-owned repositories.
- Put all gates and scoring in pure domain code called by graph nodes.
- Use LLM nodes only for evidence extraction, interpretation, question generation, and draft composition.
- Add dedicated interrupt nodes for Company Model correction, focus-condition confirmation, opportunity review, and outreach approval. Put `interrupt()` first in those nodes and keep writes or network calls in separate nodes.
- Isolate network, LLM, clock/random, and business-write effects into discrete nodes or tasks. A node may repeat after an interrupt or after a crash before its checkpoint commits, so every effect must tolerate replay.
- Give every domain command a stable operation ID derived from the engine run, logical operation, and input version.
- Derive the authoritative business stage from committed Mutuals events; treat the graph checkpoint as recovery state, not proof that a business transition committed.
- Persist `workflowDefinitionVersion` on every engine run. Route new runs to the current version while keeping a compatible graph definition available for in-flight runs that may resume days later.
- Record an immutable event for each material state transition and human override.

### Proposed graph

`intake → research → extract claims → project Company Model → infer conditions → [founder correction] → confirm focus → define missing asset → retrieve playbooks → discover counterparties → compose → gate → rank/diversify → [operator review] → disposition → [outreach approval] → track pilot/outcome`

Conditional exits can end a run as `investigate` or `no partnership` at any point after enough evidence exists.

### Boundary against lock-in

LangGraph is an outer workflow driver. Its nodes call application use cases with plain inputs; domain and application modules never import LangGraph. `StartOpportunityRun` persists the run and can call the narrow `WorkflowScheduler` port to request execution. The LangGraph worker consumes that request and invokes the use cases. Domain and use-case tests call those use cases directly; only workflow-adapter contract tests depend on LangGraph. This prevents a circular orchestration boundary and keeps a future replacement possible without rewriting Mutuals' business rules.

### Deployment caveat

The current website is a Vinext app deployed as a Cloudflare Worker. Its package declares Node 22 for local/build tooling and enables `nodejs_compat`, but Workers still implement a subset of Node APIs; that declaration does not prove every LangGraph dependency is Worker-compatible. The repo's optional D1 binding is currently unset, and the official LangGraphJS checkpointer integrations do not establish a D1 production path. A custom D1 checkpointer is possible but is additional infrastructure, not a v0 assumption.

Before committing the engine to the website runtime, run a narrow spike that verifies:

1. graph execution in the intended deployment environment;
2. durable checkpoint save/resume across process restarts;
3. interrupt/resume with a stable run or thread identifier;
4. idempotent retry after a simulated source failure; and
5. both crash orderings between business commit and checkpoint commit;
6. outbox recovery for an approved external action; and
7. recovery from a timeout with unknown external success; and
8. no dependency on in-memory checkpointing in production.

Do not run the long-lived workflow inside a normal Cloudflare request lifecycle. A request may start or resume a run, but durable execution belongs in an environment whose lifetime and checkpoint adapter have been proven. The likely v0 deployment is the landing/dashboard on Cloudflare and a small Node workflow service using a proven Postgres or Redis checkpointer. A custom D1 saver can be considered later if its value exceeds the maintenance cost. The domain and data contracts remain unchanged.

### Why not omit an orchestrator entirely?

A handwritten state machine is viable for the first few synchronous steps. It becomes costly once runs pause for meetings, resume days later, retry public-source calls, branch into all three dispositions, and need an auditable history. LangGraph earns its place only at that orchestration boundary.

### Why not use an autonomous multi-agent system?

The product requires controlled evidence, explicit business rules, and human authority. Autonomous delegation would make provenance, replay, cost, and failure behavior harder to reason about without improving the core matching contract.

## 12. Persistence and event semantics

The Mutuals database is the source of truth. Business run status in Mutuals storage is authoritative; a LangGraph checkpoint is only a replay cursor. Any mismatch is reconciled from canonical business records rather than treated as an exactly-once dual write.

Persist:

- immutable evidence claims and provenance;
- versioned Company Models and Condition Portfolios;
- versioned playbooks and scoring policies;
- engine runs, authoritative business stage, and workflow-definition version;
- candidate snapshots and hypotheses;
- human corrections, overrides, and dispositions;
- outreach and qualification events; and
- pilot measurements and outcomes.

All domain commands and external actions use stable operation IDs derived from the engine run and logical action. Repositories reject or return the prior result for a repeated operation. Retries must not duplicate sources, outreach, or decisions. Derived Company Model views and rank outputs must be rebuildable from their source records and policy versions.

Because a LangGraph checkpoint and a Mutuals business commit are not assumed to share one atomic transaction, every node reconciles against committed business events before applying its command. A crash after the business commit but before the checkpoint may replay the node; the stable operation ID makes that replay a no-op. A crash after the checkpoint attempt but before a business commit cannot advance the authoritative business stage.

External effects use a transactional outbox. Approval and outbox intent commit with the business event, then a retryable dispatcher delivers at least once with a stable action ID. It reuses a provider idempotency key when one is supported. If a timeout leaves downstream success unknown and the provider cannot deduplicate, the action enters `unknown` and must be reconciled before retry. Persist the progression `approved → queued → attempted → acknowledged`, with `unknown` as an explicit failure branch. The system never assumes exactly-once external delivery.

## 13. Research, privacy, and safety

- Retrieve only publicly accessible, contractually permitted, officially exposed, or founder-supplied material.
- Respect source terms, robots rules where applicable, rate limits, and removal requests.
- Do not use unrestricted social scraping as a foundational dependency.
- Store the minimum personal data needed for the relationship workflow.
- Separate public evidence from confidential founder-supplied material and enforce access by company/run.
- Never expose one company's confidential needs, customers, or economics to a proposed counterparty without explicit approval.
- Never send outreach in v0 without operator approval.
- Expire or refresh claims whose truth is time-sensitive.

## 14. Evaluation and learning loop

Measure the engine at four levels.

### Model quality

- percentage of material claims accepted, corrected, contradicted, or left unknown by founders;
- evidence coverage of Company Model fields;
- calibration of confidence against later corrections.

### Hypothesis quality

- hard-gate survival rate;
- operator `pursue`, `investigate`, and `no partnership` rates;
- reason codes for rejection;
- diversity without semantic duplication;
- percentage of presented hypotheses that contain a complete pilot.

### Advancement quality

- qualified conversations initiated;
- counterparty response and qualification rate;
- time from engine run to decision-ready pilot;
- percentage of pursued hypotheses approved for a pilot.

### Commercial outcome

- pilots launched;
- measurable handoffs, conversions, revenue, supply access, attach rate, or another category-specific outcome;
- time to first evidence;
- value created relative to Mutuals/operator effort;
- reversals, incidents, and trust failures.

Do not optimize the engine for number of ideas or messages sent. The primary v0 learning metric is the proportion of runs that reach the correct disposition with evidence and produce useful founder corrections. Commercial value is the ultimate measure but will lag.

## 15. Test strategy

### Domain tests

- fail hypotheses with no reciprocal value;
- distinguish `investigate` from `no partnership`;
- require a complete pilot for `pursue`;
- cap output at three and prevent near-duplicate selections;
- preserve the null result;
- prove category-specific scoring cannot bypass hard gates.

### Application tests

- build a run from fixture evidence without a live model or network;
- apply founder corrections without destroying prior claims;
- preserve a claim's origin when its verification status changes;
- resume from every human gate;
- record scoring-policy and playbook versions;
- record a human override with rationale.

### Adapter and workflow tests

- validate structured LLM output and reject malformed data;
- retry transient source failures without duplicating evidence;
- checkpoint and resume after process restart;
- resume an in-flight run against its recorded workflow-definition version;
- replay an interrupted node without repeating side effects;
- recover from a crash after business commit but before checkpoint commit;
- recover from a crash before business commit while a checkpoint operation is attempted;
- dispatch an outbox action without duplicating the external effect;
- reconcile an outbox action whose downstream success is unknown;
- exercise all three dispositions end to end;
- verify authorization boundaries around confidential evidence and outreach.

### Evaluation fixtures

Maintain a small, human-reviewed set of real or consented company cases. Each fixture contains expected accepted facts, disputed inferences, plausible conditions, forbidden fabricated claims, and an acceptable disposition range. This becomes the regression set as playbooks and prompts evolve.

## 16. v0 build order

1. Domain records, claim semantics, gates, dispositions, and tests.
2. LangGraph runtime and persistent-checkpointer spike in the intended deployment shape; adopt only if it passes.
3. Manual evidence entry plus Company Model and founder-correction flow.
4. One permitted website research adapter and structured extraction.
5. Condition Portfolio, focus-condition gate, and missing-asset definition.
6. Minimal playbook library spanning all three families.
7. Counterparty search and evidence-backed candidate records.
8. Opportunity composition, ranking, diversity, and meeting dashboard.
9. Durable workflow integration, manual outreach/action tracking, and feedback capture.
10. Evaluation harness and scoring calibration from field outcomes.

The first useful prototype may use manual research and operator-entered corrections. Automation is added where repetition is proven.

## 17. Decision references

- [LangGraphJS repository](https://github.com/langchain-ai/langgraphjs)
- [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [Thinking in LangGraph](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)
- [Workflows and agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)
- [Graph API and Functional API comparison](https://docs.langchain.com/oss/javascript/langgraph/functional-api)
- [LangGraph workflow compatibility](https://docs.langchain.com/oss/javascript/langgraph/backward-compatibility)
- [LangGraph v1](https://docs.langchain.com/oss/javascript/releases/langgraph-v1)
- [Cloudflare Workers Node.js compatibility](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
