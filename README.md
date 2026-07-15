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

The public landing page remains available without an account. The member flow
starts at `/join`; returning members use `/login`.

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
DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals
SESSION_SECRET=<at-least-32-random-characters>
RESEND_API_KEY=
EMAIL_FROM=
ADMIN_EMAILS=admin@example.com
MEWTUALS_DEV_AUTH=true
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Generate a session secret with `openssl rand -base64 48`, then start and prepare
the project-local database:

```bash
npm run db:setup
```

Start Mewtuals on the product-v1 local URL:

```bash
PORT=4000 PUBLIC_BASE_URL=http://localhost:4000 npm run dev
```

Open [http://localhost:4000](http://localhost:4000).

With `MEWTUALS_DEV_AUTH=true`, a login request made on an exact loopback host
(`localhost`, `127.0.0.1`, or `::1`) exposes a development confirmation link.
After submitting a profile for verification, the same local-only mode exposes
the development approval action. Neither shortcut is available in production
or on a non-loopback preview host.

## Verification commands

```bash
npm test
npm run test:db
npm run test:acceptance
npm run lint
npm run build
```

`test:acceptance` runs the complete durable member journey against PostgreSQL:
magic-link confirmation, onboarding, pending verification, local approval,
signals, curated picks, idempotent advancement, persistence, logout/re-login,
protected access, and token-at-rest assertions.

## Database commands

```bash
npm run db:start
npm run db:status
npm run db:migrate
npm run db:seed
npm run db:stop
```

`db:setup` is the local convenience command: it starts PostgreSQL on
`127.0.0.1:55432`, applies migrations, and idempotently seeds the internal
opportunity catalogue. Production migrations should use the managed
`DATABASE_URL` directly; do not run the local setup command in production.

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
