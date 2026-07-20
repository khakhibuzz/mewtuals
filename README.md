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

Requirements:

- Node.js `>=22.13.0`
- PostgreSQL 16 (`brew install postgresql@16` on macOS)

Install dependencies and create local configuration:

```bash
npm install
cp .env.example .env.local
```

Use these development values as a starting point. Keep the placeholders blank
until the corresponding integration is configured.

```dotenv
DATABASE_URL=postgresql://<local-user>@127.0.0.1:55432/mewtuals
NODE_ENV=development
SESSION_SECRET=<at-least-32-random-characters>
RESEND_API_KEY=
EMAIL_FROM=
ADMIN_EMAILS=admin@example.com
MEWTUALS_DEV_AUTH=true
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Generate a session secret with `openssl rand -base64 48`, then start and prepare
the project-local database. Replace `<local-user>` with the output of `whoami`;
Vinext's worker runtime cannot infer the local PostgreSQL role:

```bash
npm run db:setup
```

Start Mewtuals on the product-v1 local URL:

```bash
npm run dev:4000
```

Open [http://localhost:4000](http://localhost:4000).

With `MEWTUALS_DEV_AUTH=true`, a login request made on an exact loopback host
(`localhost`, `127.0.0.1`, or `::1`) exposes a development confirmation link.
After submitting a profile for verification, the same local-only mode exposes
the development approval action. Neither shortcut is available in production
or on a non-loopback preview host.

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
npm run lint
npm run build
```

## Sites deployment preparation

Prepare the latest local commit, a named release, or an exact commit:

```bash
npm run prepare:sites
npm run prepare:sites -- website-v3
npm run prepare:sites -- <full-sha>
```

The command validates, builds, and packages that exact committed source into an
ignored request artifact. It never publishes or includes uncommitted files.
Ask Codex `Deploy Mewtuals` or `Deploy Mewtuals at <commit-ish>` to perform the
separate authenticated Sites release. Codex must reuse the existing Sites
project, verify the archive digest and Sites source head, obtain authorization
before a public deploy when the active request does not already provide it, and
verify both `https://mewtuals.com` and `https://www.mewtuals.com` afterward.

`test:acceptance` runs the complete durable member journey against PostgreSQL:
magic-link confirmation, onboarding, pending verification, local approval,
signals, curated picks, idempotent advancement, persistence, logout/re-login,
protected access, and token-at-rest assertions.

`test:e2e` expects Mewtuals to already be running at
`http://localhost:4000`. It drives the rendered member and administrator forms,
checks responsive layouts and protected redirects, and fails on browser or
offline-boundary errors. It also builds and starts a separate production-mode
server at `http://localhost:4002` for service-worker checks. Add
`mewtuals-mobile-e2e@example.test` only to the ignored local `ADMIN_EMAILS`
allowlist before running the gate. Set `PLAYWRIGHT_CHANNEL=chromium` after
installing Playwright's Chromium binary if Google Chrome is unavailable.

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
`127.0.0.1:55432/mewtuals`, even when the shell exports another `DATABASE_URL`.
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
