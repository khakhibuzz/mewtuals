# Mewtuals

Mewtuals helps Physical AI companies find counterparties and advance
partnerships from signal to pilot. This repository combines the public
Physical AI website, evidence-backed research tools for operators, and a
verified-member partnership workflow.

## Features

- **Public website:** the landing page, `/companies`, and `/ecosystem` explain
  the partnership service and how the Physical AI ecosystem fits together.
- **Opportunity Briefs:** visitors submit a company or creator profile at
  `/join` without an account. Operators review requests, source history,
  acknowledgement state, and supported candidate links at
  `/admin/opportunity-briefs`.
- **Member workflow:** email sign-in, public-evidence profile confirmation,
  verification, partnership signals, and up to three curated picks. Verified
  members may receive zero picks when no opportunity meets the matching gate.
  The workflow supports brand–creator, brand–brand, creator–creator, and
  startup–distribution partner directions.
- **Discovery Agent:** durable research runs, candidates, and source evidence
  for administrator review at `/admin/discovery`, with a replaceable external
  worker protocol.
- **Global Demand Radar:** separate research into direct demand, demand
  precursors, and ecosystem momentum at `/admin/global-demand-radar`. Explicit
  promotion connects a reviewed signal to Discovery.
- **Ecosystem intelligence:** an administrator workspace at
  `/admin/ecosystem-intelligence` for exploring Indian robotics and Physical AI
  participants, capabilities, geographic coverage, evidence, and research gaps.
- **Battery Atlas:** public India-first lifecycle research at
  `/ecosystem/batteries`, with market listings and policy pages at `/market`
  and `/policies` beneath that route. The committed research was reviewed on
  **6 September 2026**; records retain source dates, status distinctions, and
  evidence limitations. Listings and policy summaries are dated research, not
  live availability or eligibility checks.

The public landing page remains available without an account. The standalone
application form is directly shareable at `/apply` but intentionally absent
from the landing-page navigation. `/join` is the public, no-account Opportunity
Brief request; `/share` sends event visitors there with
`source=bengaluru-meetup`. New and returning members share one email entry at `/network/join`;
legacy `/login` bookmarks redirect there. Verified links continue to the dashboard
or the next unfinished onboarding step. Allowlisted operators manage public requests at
`/admin/opportunity-briefs`.

## Local setup

The local member journey needs no email account, Google credentials, cloud
database, Sites account, or files from the original developer's computer. UI
assets and seed data are committed. Dependency downloads require internet access.

Prerequisites: Node.js **22.22.3** (see `.nvmrc`), npm, and **PostgreSQL 16**.
Use macOS or Linux as a normal user; on Windows use Ubuntu in WSL2. PostgreSQL
initialization cannot run as root.

- macOS: `brew install postgresql@16`
- Ubuntu 24.04: `sudo apt-get update && sudo apt-get install -y postgresql-16`
- Other Linux distributions: install PostgreSQL 16 and put its bin directory,
  including `initdb`, `pg_ctl`, `psql`, and `createdb`, on `PATH`.

Do not start a global PostgreSQL service for this project. From a fresh clone:

```bash
git clone https://github.com/khakhibuzz/mewtuals.git
cd mewtuals
npm ci
npm run setup:local
npm run dev:4000
```

Open [http://localhost:4000](http://localhost:4000).

`setup:local` generates ignored `.env.local` and `.dev.vars` files with matching
settings and independent random session, Discovery, and Radar worker secrets,
initializes a checkout-owned cluster in
`.local-postgres`, then applies migrations and seeds four opportunities. It
creates separate `mewtuals` and `mewtuals_test` databases. Repeating setup preserves
the generated secrets and existing user records. For matching files from older
generated setup, it adds missing worker secrets without changing existing values;
it refuses to overwrite manually created or mismatched configuration.

The database listens only on `127.0.0.1:55432`, using trust authentication for
local development. Never use this configuration for public deployment. Stop the
cluster with `npm run db:stop`. If port 55432 is occupied, choose a free port on
the first setup; the generated files remember it:

```bash
MEWTUALS_LOCAL_DATABASE_PORT=55439 npm run setup:local
```

An occupied port is reusable only when the server is PostgreSQL 16, runs as the
current local user, and has a verified repository-owned `.local-postgres/data`
directory in the main checkout or a sibling `.worktrees` checkout. Unrelated
servers are rejected. Reusing a sibling server also shares its local databases;
choose a free, separate port for independent-clone or release validation.
If the first attempt failed because the port was busy, stop this clone's database
with `npm run db:stop`, remove only its generated `.env.local` and `.dev.vars`,
then rerun setup with a free port. Do not remove manually maintained configuration.
Keep each clone's generated configuration and cluster separate. Do not copy
`.env.local`, `.dev.vars`, or `.local-postgres` between clones. The committed
`.env.example` and `.dev.vars.example` are blank manual-configuration references.

To try the member journey, visit `/network/join`, enter `reader@example.test`,
select **Open local sign-in link**, then **Continue to Mewtuals**. No email is
sent in this mode. Complete onboarding with sample information, submit the
profile, and use the development approval action. Verified members may receive
zero matches.

These shortcuts require `MEWTUALS_DEV_AUTH=true`, a non-production runtime, and
an exact loopback request host (`localhost`, `127.0.0.1`, or `::1`). They stay
disabled in production and on public preview domains. The generated admin
allowlist contains only `mewtuals-mobile-e2e@example.test`, a disposable test
identity. External service credentials remain blank.
`npm start` explicitly selects production mode, which disables these shortcuts
even when generated local configuration is present.

## Installable app and offline behavior

Mewtuals can be installed from a supported browser after one completed online
visit. In production it must be served over HTTPS; `localhost` is accepted as a
secure development origin. Browser and operating-system install controls vary,
so use the available Install or Add to Home Screen action rather than expecting
an in-page prompt.

Offline support is deliberately public-only. The landing page and its approved
static assets remain usable after the service worker finishes installing. Every
member, onboarding, administrator, and transactional route—including
`/apply`, `/join`, and `/network/join`—remains network-only and falls back to
`Get online to see your partnerships.` No API response, profile, partnership,
or account data is stored for offline use.

Validate install and offline behavior against a built origin, not development
behavior alone:

```bash
npm run build
npm start -- --port 4002
```

Open [http://localhost:4002](http://localhost:4002), wait for the first online
load to complete, then test installation and offline navigation. The automated
browser gate manages this built origin itself.

## Verification commands

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

## Sites deployment preparation

Prepare the latest local commit, a named release, or an exact commit:

```bash
npm run prepare:sites
npm run prepare:sites -- website-v3
npm run prepare:sites -- <full-sha>
```

The command runs a locked install, lint, unit tests, build, and package-integrity
checks for that exact committed source, then creates an ignored request
artifact. It does not run the database, migration, acceptance, or end-to-end
gates listed above; run the complete release gate before preparing and
deploying. It never publishes or includes uncommitted files.
Ask Codex `Deploy Mewtuals` or `Deploy Mewtuals at <commit-ish>` to perform the
separate authenticated Sites release. Codex must reuse the existing Sites
project, verify the archive digest and Sites source head, obtain authorization
before a public deploy when the active request does not already provide it, and
verify both `https://mewtuals.com` and `https://www.mewtuals.com` afterward.

`test:acceptance` runs the complete durable member, Discovery, and Opportunity
Brief journeys against the guarded `mewtuals_test` PostgreSQL database. The
Opportunity Brief gate covers tagged intake, normalized-profile deduplication,
source history, acknowledgement state, source-supported exact candidate links,
administrator mutations with optimistic tokens, and separation from member and
onboarding records.

For browser tests, run `npx playwright install chromium`, then
`PLAYWRIGHT_CHANNEL=chromium npm run test:e2e`. Chrome is the default when
already installed. Linux CI installs browser OS packages with
`npx playwright install --with-deps chromium`.

`test:e2e` expects Mewtuals to already be running at
`http://localhost:4000`. It drives the rendered member and administrator forms,
including the public `/join` request and `/admin/opportunity-briefs` queue,
checks responsive layouts, native-dialog focus, protected redirects, and fails
on browser or offline-boundary errors. It also builds and starts a separate
production-mode server at `http://localhost:4002` for service-worker checks.
Local setup configures the disposable `mewtuals-mobile-e2e@example.test` admin
identity in ignored local configuration. Browser tests use synthetic
`example.test` accounts and remove their own records.

The **Fresh clone** GitHub Actions workflow runs unit, database, migration,
acceptance, browser, lint, and type checks without repository secrets. Historical
`examples/d1` starter snippets are not wired into this PostgreSQL application
and are excluded from the application's type check. Pushing code to GitHub
preserves its source; passing checks and deploying that commit are separate
steps. A GitHub push does not publish a Sites release.

## Database commands

```bash
npm run db:start
npm run db:status
npm run db:migrate
npm run db:seed
npm run db:test:prepare
npm run db:stop
```

`db:setup` is an alias for the guarded `db:setup:local` command. It always uses
`127.0.0.1:<local-port>/mewtuals` (55432 by default), even when the shell exports
another `DATABASE_URL`.
`db:test:prepare` similarly owns the separate local `mewtuals_test` database.
Production migrations should use the managed `DATABASE_URL` directly; do not
use either local convenience command in production.

## Production configuration

The authenticated hosted flow requires all of the following before it is
production-ready:

- a managed PostgreSQL `DATABASE_URL`
- a stable, high-entropy `SESSION_SECRET`
- `RESEND_API_KEY` and a verified `EMAIL_FROM`
- `ADMIN_EMAILS` for verification, Discovery, and Opportunity Brief operations
- migrations and the opportunity seed applied to the production database

Google OAuth is intentionally deferred in product v1. `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are reserved blank placeholders; email magic links are
the implemented authentication path.

See [docs/product-v1-operations.md](docs/product-v1-operations.md) for the
deployment checklist, backup procedure, security behavior, and incident notes.

## Discovery Agent

The persistent Discovery Agent uses a replaceable external worker protocol;
Codex is the initial public-web worker. Administrators review its durable runs,
candidates, and source evidence at `/admin/discovery`.

See
[docs/discovery-agent-operations.md](docs/discovery-agent-operations.md) for
migrations, worker commands, the first trial, the exact daily Codex prompt,
08:30 Asia/Kolkata scheduling, evidence rules, secret-safe temporary files,
replay recovery, and the future provider seam.

## Global Demand Radar

Global Demand Radar is a separate public-evidence subsystem for direct demand,
demand precursors, and ecosystem momentum. Administrators review its durable
runs and signals under `/admin/global-demand-radar`; promotion is the only
explicit write bridge into Discovery.

See
[docs/global-demand-radar-operations.md](docs/global-demand-radar-operations.md)
for the five worker commands, private claim handling, public-evidence contract,
exact-file replay, honest zero and partial behavior, manual runs, provider
replacement boundary, and the proposed but not activated Radar schedules.

## Project shape

- `app/`: landing page, member UI, routes, domain rules, and server services
- `db/`: PostgreSQL schema, repositories, and opportunity catalogue seed
- `drizzle/`: ordered PostgreSQL migrations
- `scripts/`: local PostgreSQL, migration, and seed tooling
- `tests/`: unit, render, database integration, and product acceptance coverage
- `docs/`: product design, implementation plan, and operations handoff

The application uses vinext for the Sites-compatible build, Drizzle for schema
and migrations, Postgres.js for database access, and Vitest for automated
verification.

## License and assets

Mewtuals source and original project assets are provided under the [MIT
license](LICENSE). The committed graph artwork and brand icons are project
assets; no private asset directory or generated build output is required.
Names and trademarks in sample/editorial content remain their owners' property.
Dependencies installed from npm retain their respective licenses. MIT does not
replace those licenses or grant trademark rights.
