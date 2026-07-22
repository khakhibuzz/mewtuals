# Discovery Agent operations

The Mewtuals Discovery Agent uses Codex as the first public-web discovery
worker. Mewtuals owns run allocation, validation, deduplication, persistence,
and administrator review. The worker only claims a run and returns a validated
provider-neutral discovery batch.

## Runtime configuration

Configure the deployed Mewtuals application with:

```dotenv
DATABASE_URL=<managed PostgreSQL URL>
ADMIN_EMAILS=<comma-separated administrator emails>
DISCOVERY_WORKER_SECRET=<at least 32 random characters>
DISCOVERY_GEOGRAPHIES=India
DISCOVERY_COMPANY_CATEGORIES=startups,consumer brands,AI,technology,creator economy,wellness,fashion,hardware,productivity,fintech
DISCOVERY_CREATOR_CATEGORIES=technology,startups/business,AI,consumer products,lifestyle,wellness,fashion,finance,podcasts/interviews
DISCOVERY_TOTAL_CANDIDATES=20
DISCOVERY_COMPANY_PERCENTAGE=50
DISCOVERY_ENABLED_SOURCES=codex_web
```

Configure the local Codex worker in the ignored `.env.local` file with the same
worker secret and the deployed origin:

```dotenv
DISCOVERY_API_BASE_URL=https://mewtuals.com
DISCOVERY_WORKER_SECRET=<same high-entropy worker secret>
```

The shell environment wins over `.env.local`. Never commit either the worker
secret or a claim artifact. Rotate the server and local secret together if it
may have been exposed.

## Migration and deployment order

1. Create a managed-database recovery point or confirm the provider backup.
2. Point `DATABASE_URL` at the intended database and apply the committed ordered
   migration with `npm run db:migrate`.
3. Deploy the application with the discovery environment variables.
4. Confirm an unauthenticated worker claim returns `401`; do not print the
   configured bearer value while checking it.
5. Run the explicit first trial below.
6. Verify its candidates and source evidence in `/admin/discovery` before
   enabling the daily task.

`npm run db:setup` and `npm run db:test:prepare` are local-only conveniences.
Do not run them against the managed production database.

## Worker commands

All commands load the existing `.env.local` file. They exit non-zero on invalid
input, missing configuration, transport failure, malformed responses, or any
non-2xx response.

```bash
npm run discovery:claim
npm run discovery:claim -- --trigger trial
npm run discovery:validate -- --file <batch.json>
npm run discovery:submit -- --run-id <id> --lease-token <token> --file <batch.json>
npm run discovery:fail -- --run-id <id> --lease-token <token> --message <message>
```

`discovery:validate` imports the application's authoritative
`discoveryBatchSchema`; it does not perform a weaker envelope-only check.
`discovery:submit` validates again and, in the explicit-token form above, sends
the file's exact JSON bytes.

A successful claim never prints the lease. It writes the complete claim to a
new mode-`0600` file in a private temporary directory and returns a safe JSON
summary containing `claimFile`, `runId`, configuration, and the output schema.
Scheduled tasks should pass that private file directly so a lease never appears
in shell arguments:

```bash
npm run discovery:submit -- --claim-file <claim-file> --file <batch.json>
npm run discovery:fail -- --claim-file <claim-file> --message <message>
```

Remove the claim directory and every candidate/batch temporary file after a
successful submit or terminal failure. Keep them only long enough to retry an
unknown submission result with the exact same batch.

## Manual queue semantics

`Run Discovery` in `/admin/discovery` creates a durable `manual` run in the
queue. It does not search inline in the browser. The next scheduled claim takes
the oldest queued manual run before it creates or claims that day's scheduled
run. Repeated clicks create distinct administrator requests, so queue only the
work actually wanted.

The scheduled daily claim is idempotent for the India local date and configured
allocation. An explicit `trial` claim creates a separate unique trial run and
is reserved for acceptance checks or deliberate operator trials.

## Public source and evidence rules

For every candidate:

- Use only public web results, official company or portfolio pages, public
  directories, public websites, public creator pages, YouTube channels, public
  podcast pages, and public social-profile links.
- Do not use authenticated scraping, private/contact data, brittle session
  extraction, or facts that the linked evidence does not support.
- Use a stable public identity as `canonicalUrl`. For a company, prefer its
  official website, then a LinkedIn company profile, then a stable organisation
  profile. For a creator, prefer YouTube, podcast, or a primary social profile,
  then a personal website or LinkedIn profile.
- Treat search pages, news articles, and generic listing pages as evidence, not
  as the candidate identity.
- Set `sourceUrl` to a working page that supports the submitted description,
  category, geography, and public identity. Keep `rawMetadata` limited to
  concise discovery evidence.
- Report a bounded `sourceErrors` item when a configured source cannot be used.
  Return fewer candidates when evidence is weak. Never pad the allocation,
  invent enrichment, or turn an inference into a sourced fact.

The claimed configuration is authoritative. Do not exceed its total or
per-type allocation, and do not silently replace its geography, categories,
sources, or prompt version.

## Daily Codex task

Configure one standalone Codex scheduled task for **08:30 Asia/Kolkata every
day** (cron equivalent `30 8 * * *` with the timezone set to
`Asia/Kolkata`). Run it from the Mewtuals repository so the ignored local
environment is available. The local computer and Codex desktop app must be
running for this pre-client worker.

Use this exact task prompt:

```text
Run the Mewtuals Discovery Agent from this repository.

1. Execute `npm run discovery:claim`. Parse only its safe JSON output. If
   `claimed` is false, report "No discovery work was available" and stop
   successfully. If claimed, retain the returned `claimFile` path without
   printing or displaying that file's contents; it contains a secret lease.
2. Follow the returned configuration, prompt version, allocation, and output
   schema exactly. Search permitted public web sources for companies and
   creators in the returned configured geographies with plausible partnership,
   distribution, media, co-branding, or collaboration potential. Rotate across
   the configured category families.
3. Verify every source URL and stable candidate identity URL. Use public
   evidence only. Do not use authenticated scraping, private/contact data, or
   unsupported claims. Articles and search pages may be evidence but may not be
   canonical identities. Return fewer candidates when evidence is weak; never
   pad the batch or invent enrichment.
4. Create all working files in a new private temporary directory outside the
   repository. First write a candidate payload containing only `candidates`
   and `sourceErrors`. Then, without printing the lease, combine the private
   claim file's `runId`, `leaseToken`, and `promptVersion` with that payload to
   create the final DiscoveryBatch JSON. Give the final file mode 0600.
5. Run `npm run discovery:validate -- --file <batch-file>`. Correct source or
   schema problems only from verified evidence. Do not weaken the schema.
6. Submit once with
   `npm run discovery:submit -- --claim-file <claim-file> --file <batch-file>`.
   If the request times out or its result is unknown, retry the exact same file;
   do not generate a different batch for the same run.
7. If a valid batch cannot be submitted, call
   `npm run discovery:fail -- --claim-file <claim-file> --message <bounded safe summary>`.
   Never include a bearer secret, lease, rejected payload, private data, or full
   page contents in the failure summary.
8. Remove the temporary claim and batch directory after confirmed completion or
   failure. Report only the run id, terminal status, found/new/duplicate counts,
   honest source-error count, and whether temporary files were removed. Never
   print the worker secret, lease token, claim-file contents, or rejected batch.
```

When constructing the final batch, use a local program that reads both files
and writes the envelope without printing it. Do not paste a lease into a shell
command or conversation. One Node 22 pattern is:

```bash
node --input-type=module -e '
import { chmod, readFile, writeFile } from "node:fs/promises";
const [claimPath, payloadPath, batchPath] = process.argv.slice(1);
const claim = JSON.parse(await readFile(claimPath, "utf8"));
const payload = JSON.parse(await readFile(payloadPath, "utf8"));
const batch = {
  runId: claim.runId,
  leaseToken: claim.leaseToken,
  promptVersion: claim.promptVersion,
  candidates: payload.candidates,
  sourceErrors: payload.sourceErrors,
};
await writeFile(batchPath, `${JSON.stringify(batch, null, 2)}\n`, { mode: 0o600 });
await chmod(batchPath, 0o600);
' <claim-file> <candidate-payload.json> <batch.json>
```

## First trial acceptance

After migration and deployment, claim a trial instead of waiting for the daily
schedule:

```bash
npm run discovery:claim -- --trigger trial
```

Use the same evidence, validation, private-file, submit, and cleanup steps as
the daily task. The trial is accepted only when:

- its durable run is `succeeded` or honestly `partial`;
- at least one new company and one new creator are persisted;
- found, new, and duplicate counts agree with the stored candidates;
- `/admin/discovery` displays the candidates and all evidence links; and
- an administrator can filter the result, inspect details, and change one
  candidate status without a conflict.

## Retry, replay, and recovery

- **Unknown submit result:** retry the exact same batch and lease. Exact replay
  is a successful no-op that returns the recorded result.
- **Different body after completion:** do not retry it. The server rejects a
  changed submission for a completed run. Inspect the durable run and queue a
  new manual run only if more discovery is actually needed.
- **Known source failure with usable candidates:** include bounded source
  errors and submit; the run can finish `partial`.
- **No usable candidates after source failures:** call `discovery:fail` with a
  concise, non-secret summary.
- **Worker crash:** a valid running lease blocks a second worker. The lease is
  two hours; a later claim marks an expired run failed before claiming new
  work. Do not edit run rows manually to bypass a live lease.
- **Invalid or expired lease:** stop. Inspect the dashboard before claiming new
  work; never reuse a lease from another run.
- **Temporary file remains:** treat it as a secret, verify no worker process is
  still using it, and remove its private temporary directory.

## Replacing Codex later

Codex is an adapter, not the source of truth. A future Exa, OpenAI web search,
YouTube, or other paid worker should keep the same claim/complete/fail protocol
and produce the same `DiscoveryBatch`. Add its source name to configuration,
keep its credentials at the worker edge, and preserve the same public-evidence
and honest-underfill rules. No discovery tables, deduplication rules, service
orchestration, or administrator workflow should change merely because the
provider changes.
