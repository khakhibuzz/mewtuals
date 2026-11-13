# Mewtuals

Mewtuals is a curated partnership network for verified companies, brands,
creators, startups, and distribution partners. Members identify themselves,
confirm a profile generated from public evidence, pass verification, signal
what they are open to, and receive up to three curated partnership picks.

Product v1 supports four directions:

- brand ↔ creator
- brand ↔ brand
- creator ↔ creator
- startup ↔ distribution partner

The public landing page remains available without an account. The standalone
application form is directly shareable at `/apply` but intentionally absent
from the landing-page navigation. The member flow starts at `/join`; returning
members use `/login`.

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
settings and a random session secret, initializes a checkout-owned cluster in
`.local-postgres`, then applies migrations and seeds four opportunities. It
creates separate `mewtuals` and `mewtuals_test` databases. Repeating setup preserves
the generated secret and existing user records; it refuses to overwrite manually
created or mismatched configuration.

The database listens only on `127.0.0.1:55432`, using trust authentication for
local development. Never use this configuration for public deployment. Stop the
cluster with `npm run db:stop`. If port 55432 is occupied, choose a free port on
the first setup; the generated files remember it:

```bash
MEWTUALS_LOCAL_DATABASE_PORT=55439 npm run setup:local
```

An occupied port causes setup to fail instead of attaching to another database.
If the first attempt failed because the port was busy, stop this clone's database
with `npm run db:stop`, remove only its generated `.env.local` and `.dev.vars`,
then rerun setup with a free port. Do not remove manually maintained configuration.
Keep each clone's generated configuration and cluster separate. Do not copy
`.env.local`, `.dev.vars`, or `.local-postgres` between clones. The committed
`.env.example` and `.dev.vars.example` are blank manual-configuration references.

To try the member journey, visit `/join`, enter `reader@example.test`, select
**Open local sign-in link**, then **Continue to Mewtuals**. No email is sent in
this mode. Complete onboarding with sample information, submit the profile, and
use the development approval action. Verified members may receive zero matches.

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
`/apply`—remains network-only and falls back to
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
npm run test:acceptance
npm run test:e2e
npm run typecheck
npm run lint
npm run build
```

`test:acceptance` runs the complete durable member journey against PostgreSQL:
magic-link confirmation, onboarding, pending verification, local approval,
signals, curated picks, idempotent advancement, persistence, logout/re-login,
protected access, and token-at-rest assertions.

For browser tests, run `npx playwright install chromium`, then
`PLAYWRIGHT_CHANNEL=chromium npm run test:e2e`. Chrome is the default when
already installed. Linux CI installs browser OS packages with
`npx playwright install --with-deps chromium`.

`test:e2e` expects Mewtuals to already be running at
`http://localhost:4000`. It drives the rendered member and administrator forms,
checks responsive layouts and protected redirects, and fails on browser or
offline-boundary errors. It also builds and starts a separate production-mode
server at `http://localhost:4002` for service-worker checks. Local setup configures
the disposable admin identity. Browser tests use synthetic `example.test`
accounts and remove their own records.

The **Fresh clone** GitHub Actions workflow runs these checks without repository
secrets. Historical `examples/d1` starter snippets are not wired into this
PostgreSQL application and are excluded from the application's type check.

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
- `ADMIN_EMAILS` for the verification queue
- migrations and the opportunity seed applied to the production database

Google OAuth is intentionally deferred in product v1. `GOOGLE_CLIENT_ID` and
`GOOGLE_CLIENT_SECRET` are reserved blank placeholders; email magic links are
the implemented authentication path.

See [docs/product-v1-operations.md](docs/product-v1-operations.md) for the
deployment checklist, backup procedure, security behavior, and incident notes.

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
