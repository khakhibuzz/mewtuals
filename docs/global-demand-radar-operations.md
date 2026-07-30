# Global Demand Radar operations

Global Demand Radar is a separate, evidence-first bounded context. It scans
public global demand signals, stores only server-validated Radar records, and
lets an administrator review them. It does not replace India Discovery, write
Discovery candidates except through the explicit promotion workflow, create a
match, send outreach, or turn a score into an automatic opportunity.

The initial worker adapter is Codex public-web research. Mewtuals remains the
source of truth for plans, validation, classification, scoring, deduplication,
persistence, run lifecycle, and administrator actions.

## Runtime configuration

Configure the application with the existing database and administrator values
plus a Radar-only worker secret:

```dotenv
DATABASE_URL=<managed PostgreSQL URL>
ADMIN_EMAILS=<comma-separated administrator emails>
GLOBAL_RADAR_WORKER_SECRET=<at least 32 random characters>
GLOBAL_RADAR_COUNTRIES=United States,China
GLOBAL_RADAR_LANGUAGES=en,zh-CN
GLOBAL_RADAR_THEMES=robot_teleoperation_demonstrations,egocentric_human_task_video,industrial_robotics_data,autonomous_mobility_and_drones,tactile_force_data,3d_spatial_data,multilingual_speech_and_human_robot_interaction,agriculture_field_collection,synthetic_data_digital_twins,physical_ai_evaluation,robotics_manufacturing,india_market_entry_and_after_sales_infrastructure
GLOBAL_RADAR_ENABLED_SOURCES=codex_public_web
GLOBAL_RADAR_RESULT_LIMIT=20
GLOBAL_RADAR_DIRECT_THRESHOLD=70
GLOBAL_RADAR_PRECURSOR_THRESHOLD=65
GLOBAL_RADAR_MOMENTUM_THRESHOLD=70
```

Configure the local worker in the ignored `.env.local` file:

```dotenv
GLOBAL_RADAR_API_BASE_URL=https://mewtuals.com
GLOBAL_RADAR_WORKER_SECRET=<same high-entropy Radar worker secret>
```

The shell environment wins over `.env.local`. The Radar worker secret must be
different from `DISCOVERY_WORKER_SECRET`. Never commit either secret, a private
claim artifact, a worker batch, or source material. Rotate the deployed and
local Radar secret together if exposure is possible.

The values returned inside a successful claim are authoritative for that run.
Do not silently change its countries, languages, themes, source families,
queries, result limit, thresholds, plan fingerprint, or version identifiers.

## Worker commands

The five Radar commands are deliberately separate from the Discovery command
family:

```bash
npm run global-radar:claim
npm run global-radar:claim -- --trigger trial --scan-mode daily
npm run global-radar:claim -- --scan-mode thematic
npm run global-radar:claim -- --scan-mode watchlist_refresh
npm run global-radar:validate -- --file <batch.json>
npm run global-radar:submit -- --claim-file <claim.json> --file <batch.json>
npm run global-radar:fail -- --claim-file <claim.json> --message <safe-message>
npm run global-radar:abandon -- --run-id <run-id> --message <safe-message>
```

`claim` defaults to `--trigger scheduled --scan-mode daily`. Its only other
trigger is `trial`; administrator-created manual runs enter through the admin
queue, not a CLI trigger. Unknown, duplicate, missing, and cross-command
options fail before a request is sent.

`validate` imports the authoritative rich
`globalRadarBatchProposalSchema`, applies the 2 MiB file ceiling, and emits no
rejected content. It is the mandatory pre-submit check. A repository-only
reserved-domain example can be checked with:

```bash
npm run global-radar:validate -- --file tests/fixtures/global-radar-valid-batch.json
```

The fixture is contract test data only. It is not a production seed, scheduled
input, or runtime data source.

## Private claim and batch files

A successful claim writes only the nested, validated secret-bearing claim to a
new temporary directory with mode `0700`; `claim.json` has mode `0600`.
Standard output contains a bounded summary with the run ID, lease expiry,
versions, plan counts, query count, public configuration counts, and file path.
It never contains the bearer secret, lease token, full queries, output schema,
or claim contents.

Treat `claimFile` as a secret capability:

- pass its path directly to `submit` or `fail`;
- never print, paste, upload, attach, or display its contents;
- keep batch and other working files in a separate private `0700` temporary
  directory and give each file mode `0600`;
- never put the lease token in shell arguments, logs, reports, or chat;
- remove the private directories only after confirmed completion, replay, or
  terminal failure.

`submit` reads and validates the batch, checks its run ID and plan fingerprint
against the private claim, and sends the exact file bytes. It uses the Radar
bearer plus `X-Global-Radar-Lease-Token`. `fail` uses the same private lease
header with a bounded reason. `abandon` intentionally accepts only the Radar
bearer, explicit run ID, and bounded reason; it rejects claim and lease options.

## Public research and evidence contract

Use only public, canonical evidence. Appropriate sources include official
company pages and announcements, supplier or partner pages, public procurement
and RFP portals, official research, datasets and benchmarks, official jobs and
investor material, government and industry sources, accelerator updates,
reputable technical or business publications, public conference material, and
official public social posts.

For every proposed signal:

- keep factual source claims separate from interpretation;
- prefer primary and official sources, and preserve independent provenance;
- use search-result pages only to find evidence, never as evidence themselves;
- do not use authenticated scraping, paywalled/session-derived content,
  private data, personal contact details, or unsupported enrichment;
- keep only concise claims and permitted short excerpts, never full page HTML,
  documents, response bodies, or copied articles;
- preserve the original-language claim, add a separate English summary, and
  provide translation confidence when the source is not English;
- cite every material response path and every India-relevance fact with the
  supported field paths required by the schema;
- use only public professional response paths. Never initiate contact or
  outreach;
- record uncertainty honestly. Worker classifications, India relevance, and
  score components are proposals; the server recomputes authoritative values.

The claimed plan and output schema define the requested coverage. Do not
replace a missing signal with an invented one, lower evidence thresholds, or
force an unclassified observation through as demand.

## Normal execution

1. Run `global-radar:claim` with the intended locked scan mode. Parse only its
   safe JSON output.
2. When `claimed` is `false`, report that no Radar work was available and stop
   successfully. Do not retry-loop or inspect private state.
3. When claimed, retain `claimFile` without displaying it. Read its plan,
   queries, public configuration, and output schema only inside the private
   worker process.
4. Execute the immutable public-web plan. Store concise proposals and bounded
   source errors in one rich provider-neutral batch. The lease does not belong
   in the batch.
5. Run `global-radar:validate` on the final file. Correct schema or evidence
   problems only from verified public sources; never weaken the validator.
6. Run `global-radar:submit` once with the private claim path and exact batch
   path.
7. Treat `completed` and `replayed` as terminal success. Report only the run ID,
   status, safe counts, safe notices, and cleanup result.
8. Remove private working files after confirmed terminal completion or failure.

Submit has a 120-second timeout. Claim, fail, and abandon use 30 seconds.

## Honest zero and partial coverage

Zero supported signals is a valid result when all planned sources were
successfully checked and no evidence met the contract. Submit the planned query
records with empty `signals` and empty `sourceErrors`; never pad a quiet run.

When some sources fail but supported signals remain, include only bounded,
non-secret source errors and submit the valid signals. The server may record a
partial run. When source failures leave no valid signals, the rich proposal
must not disguise that failure as an honest zero; call `global-radar:fail` with
a concise safe reason instead.

Thresholds do not authorize persistence or promotion on their own. A valid
batch can contain rejected proposals, and a persisted signal can still require
administrator review.

## Retry, replay, failure, and abandonment

- **Unknown submit result or timeout:** keep both private files unchanged and
  retry `global-radar:submit` with the exact same claim and exact same batch.
  Do not regenerate, reorder, reformat, or fail the run while the outcome is
  unknown.
- **`replayed`:** this is successful idempotent recovery. Use the returned safe
  run and clean up the private files.
- **Lease, state, or submission conflict:** stop and inspect the authenticated
  run dashboard. Do not modify the batch or call `fail` until durable state is
  known.
- **Known worker/source failure while the lease is available:** call
  `global-radar:fail -- --claim-file ...` with a bounded message that contains
  no URL contents, rejected payload, secret, lease, personal data, or full page
  text.
- **Claim artifact or lease irrecoverably lost:** use `global-radar:abandon`
  with the explicit safe run ID and reason. This is orphan recovery, not a
  substitute for normal failure and not a way to bypass a live lease.
- **Expired lease:** stop. A later claim performs deterministic server-side
  expiry recovery; never edit run rows or reuse another run's lease.
- **Claim returns no work:** this is a successful no-work stop, including when
  another Radar run is active.

An exact retry can return `replayed`. A different terminal reason or changed
submission can return a bounded conflict. The CLI allowlists conflict metadata
and never prints response bodies or secret-bearing fields.

## Manual administrator runs

The administrator run action creates a durable `manual` run. It does not
search inline in the browser and it does not bypass the worker lease. The next
worker claim takes queued manual work according to server priority. Each manual
request has its own administrator request UUID; create one only when that
additional coverage is intended.

Manual runs use the same claim artifact, public-evidence rules, validation,
exact-byte submission, retry, and terminal cleanup process. They do not create
automatic promotions, matches, opportunities, or outreach.

## Proposed schedules only

No scheduler or Codex automation is created or modified by this runbook. The
proposed independent schedules are:

- daily Radar scan: `10:30 Asia/Kolkata` (`30 10 * * *`) using
  `global-radar:claim` with scheduled/daily defaults;
- weekly thematic Radar scan: Sunday at `11:30 Asia/Kolkata`
  (`30 11 * * 0`) using `--scan-mode thematic`;
- India Discovery remains independently scheduled at `08:30 Asia/Kolkata`.

If these are later approved for activation, configure each as a standalone
task rooted in this repository. Its task must stop when `claimed` is false,
keep claim contents private, validate before submit, retry the exact file after
unknown success, and clean up only after terminal evidence. Activating a Radar
schedule must not edit or replace the India Discovery schedule.

## Replacing the worker provider

Codex is an adapter, not a data owner. A later OpenAI web-search, Exa, internal
research, or other provider may replace it only at the worker edge. The new
adapter must keep the same claim/complete/fail/abandon protocol, Radar-only
authentication and lease header, immutable plan, rich provider-neutral batch,
2 MiB limit, public-evidence rules, exact replay semantics, and safe output.

A provider swap must not require changing Radar tables, deduplication,
server-authoritative classification/scoring, administrator review, or the
promotion boundary. Provider credentials and provider-specific payloads stay
outside the Mewtuals domain and persistence model.

## Release verification

Run the complete repository gate before deployment:

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

These commands verify code; they do not publish, migrate production, create an
automation, run real Radar research, or write production Radar data.
