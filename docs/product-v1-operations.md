# Mewtuals product v1 operations

This runbook covers the authenticated product flow. The public landing page has
no database dependency, but member authentication, onboarding, verification,
signals, picks, and introduction requests require PostgreSQL.

## 1. Local environment

Install Node.js `>=22.13.0`, project dependencies, and PostgreSQL 16:

```bash
npm install
brew install postgresql@16
cp .env.example .env.local
```

Populate `.env.local` without committing it:

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

Replace `<local-user>` with the output of `whoami`; Vinext's worker runtime
cannot infer the local PostgreSQL role. Generate `SESSION_SECRET` with
`openssl rand -base64 48`. A secret must contain
at least 32 characters. Rotating it invalidates outstanding magic links and
sessions, so treat rotation as a deliberate sign-out event.

Start the project-owned PostgreSQL 16 data directory, apply every migration,
and idempotently seed the four internal opportunity directions:

```bash
npm run db:setup
npm run db:status
```

The local cluster binds only to `127.0.0.1:55432`, creates `mewtuals` and the
separate `mewtuals_test` acceptance database, and stores its ignored data in
`.local-postgres/`. `db:setup` is an alias for `db:setup:local`; the command
hard-pins the application database and ignores an exported `DATABASE_URL`.
Stop the cluster with `npm run db:stop`.

Start the application:

```bash
npm run dev:4000
```

## 2. Local authentication and verification

Product v1 authentication is passwordless email magic link.

When all three conditions are true, the login response exposes the confirmation
URL for development instead of requiring email delivery:

1. `MEWTUALS_DEV_AUTH=true`.
2. the runtime is not production.
3. the request origin is an exact loopback hostname: `localhost`, `127.0.0.1`,
   or `::1`.

Open the returned URL, review the confirmation page, and submit its form. A GET
never consumes a link; the same-origin POST consumes it and creates the session.
This protects links from scanners and previews that automatically open URLs.

After the member confirms a profile and submits it for review, the pending
dashboard exposes a local approval action under the same non-production,
explicit-flag, exact-loopback restrictions. The server returns 404 for that
endpoint in production, when the flag is disabled, or on a non-loopback host.

Never enable these shortcuts as a substitute for a production mail or review
workflow.

## 3. Production environment

Configure secrets and variables in the hosting environment, not in committed
files:

| Variable | Requirement |
| --- | --- |
| `NODE_ENV` | `production` in the deployed runtime. Local dev scripts set `development` explicitly. |
| `DATABASE_URL` | Managed PostgreSQL connection URL. Prefer the provider's pooled/serverless URL for the deployed runtime. |
| `SESSION_SECRET` | Stable high-entropy value of at least 32 characters. |
| `RESEND_API_KEY` | Required for production magic-link delivery. |
| `EMAIL_FROM` | Required with the Resend key; use a verified sender such as `Mewtuals <login@mewtuals.com>`. |
| `ADMIN_EMAILS` | Comma-separated, normalized allowlist for `/admin/verifications`. |
| `MEWTUALS_DEV_AUTH` | `false` in production. Production code refuses the shortcut even if it is set incorrectly. |
| `GOOGLE_CLIENT_ID` | Leave blank in product v1; Google OAuth is deferred. |
| `GOOGLE_CLIENT_SECRET` | Leave blank in product v1; Google OAuth is deferred. |

Production email delivery fails closed if either `RESEND_API_KEY` or
`EMAIL_FROM` is missing. Verify the sender domain in Resend and test delivery to
an address outside the operator's domain before launch.

The admin allowlist controls review capability, not membership. Use separate
addresses for operators where practical, remove departing operators promptly,
and periodically compare the configured list with current owners.

## 4. Migrations, seed, and backups

For local development:

```bash
npm run db:migrate
npm run db:seed
```

For a managed database, inject its `DATABASE_URL` into the command environment
and run the same two commands from the release artifact before sending traffic:

```bash
DATABASE_URL='<managed-postgres-url>' npm run db:migrate
DATABASE_URL='<managed-postgres-url>' npm run db:seed
```

The seed is idempotent by stable opportunity key. Migrations are ordered under
`drizzle/` and recorded by Drizzle; never edit an already-applied migration.
Change the schema, generate a new migration, inspect it, then test both an empty
database and an upgraded copy.

Before a production migration:

1. confirm the provider's automated backups and point-in-time recovery window;
2. take an on-demand provider snapshot or a logical backup;
3. record the deployed commit and latest migration;
4. apply migrations, then the idempotent seed;
5. run the acceptance smoke path against a non-production database;
6. verify the member flow and admin queue after deployment.

A portable logical backup can be produced with PostgreSQL 16 tooling:

```bash
pg_dump "$DATABASE_URL" --format=custom --file=mewtuals-before-release.dump
pg_restore --list mewtuals-before-release.dump
```

Store backups outside the application repository. Test restoration on an
isolated database periodically; an untested backup is not a recovery plan.

## 5. Verification and release gate

Prepare the database, then run every gate from the repository root:

```bash
npm run db:setup
npm test
npm run test:db
npm run test:acceptance
npm run test:e2e
npm run lint
npm run build
git diff --check
```

`npm test` intentionally excludes live-database suites. `npm run test:db` runs
the repository integration suite plus the complete product acceptance flow in
the dedicated local `mewtuals_test` database. Both database test commands
prepare that database themselves and refuse a non-loopback or differently named
database. `npm run test:acceptance` is the narrow repeatable database smoke test.

The acceptance test uses a unique member, cleans its records, and checks:

- confirmation GET is read-only and same-origin POST creates a session;
- onboarding follows identity → source → profile → verification order;
- pending members cannot use verified-only actions;
- exact-loopback development approval records a verification audit;
- a signal produces zero to three evidence-compatible picks;
- advancing the same pick is idempotent and creates one request;
- a fresh service instance and a new login see the persisted member state;
- logout revokes the old session and protected mutations return 401;
- magic-link, requester, and session credentials are stored only as HMACs.

Keep the local application running at `http://localhost:4000` while running the
rendered-browser gate in a second terminal:

```bash
npm run test:e2e
```

Add `mewtuals-mobile-e2e@example.test` only to the ignored local `ADMIN_EMAILS`
allowlist before running the gate. The test refuses to use any other account as
its administrator and deletes only its reserved disposable accounts.

The Playwright test uses Google Chrome by default and drives the complete fresh
member and administrator journey through the actual forms and cookies. It
checks 320×740, 390×844, 767×900, and 1440×1100 layouts, touch targets,
page-level overflow, protected redirects, and console errors. It refuses a
non-loopback base URL and refuses database cleanup unless `.env.local` points to
the project-owned application database at `127.0.0.1:55432/mewtuals`.

The gate also builds and starts an isolated production-mode origin at
`http://localhost:4002` for installable-PWA and real-offline assertions. The
test runner owns that server; do not start or reuse a process on port 4002 while
the gate is running. Development behavior on port 4000 alone is not sufficient
evidence for service-worker caching.

If Google Chrome is unavailable, install Playwright's Chromium and select it:

```bash
npx playwright install chromium
PLAYWRIGHT_CHANNEL=chromium npm run test:e2e
```

For release QA, also inspect the actual browser at 1440×1100 and 390×844,
complete the flow with a fresh email, use keyboard navigation, confirm there are
no console errors, and verify protected page redirects while signed out.

## 6. PWA and offline operations

The installable app intentionally has a narrow offline boundary:

- `/` and the public landing shell may be cached after a successful online
  service-worker installation;
- `/offline` is the only fallback for failed non-root document navigation and
  is headed `Get online to see your partnerships.`;
- `/apply` is a directly shareable, online-only application form and is not
  linked from the landing-page navigation;
- API requests, member/onboarding/admin HTML, authenticated responses, profile
  data, partnership data, and transactional state are never cached;
- member actions and background synchronization remain unavailable offline.

The `/sw.js` response uses `Cache-Control: no-cache`, so browsers revalidate it.
Its cache name is derived from the complete worker template, so a policy or
allowlist change creates a new `mewtuals-*` cache revision. If an allowlisted
asset changes at the same URL, deliberately revise the worker source or version
the asset URL; otherwise an existing cache-first installation can retain the old
bytes. Installation stages the complete public shell; if any required response
fails, the new cache is removed and the current worker continues serving. After
successful activation, the worker deletes only stale `mewtuals-*` revisions. An
online root navigation refreshes required assets before replacing the cached
landing HTML, retaining the prior shell if refresh fails.

Service-worker activation follows browser lifecycle rules. A newly installed
revision may wait until controlled tabs and installed-app windows close. To
force a clean support check, close Mewtuals everywhere, clear the origin's site
data in browser settings (or unregister the worker and clear storage in browser
developer tools), then revisit `/` online before testing offline. Clearing site
data also removes the session cookie and signs the member out.

Installation UI, update timing, and standalone-window behavior vary by browser
and operating system. A deployed PWA requires HTTPS; loopback `localhost` is
accepted for local testing. Verify the target browser/device rather than
assuming an install prompt will be shown.

The release gate must prove the public landing works offline, `/dashboard`
shows only the network-required fallback, cached paths contain no member/API
routes, no private member text appears, and the application recovers after the
network returns. Keep the port-4000 member server running and let
`npm run test:e2e` manage the built port-4002 PWA server.

## 7. Security and operating behavior

- Magic links expire after 15 minutes and are single-use.
- A recipient can receive one issued link per 60 seconds; a new issued link
  invalidates earlier live links for that recipient.
- A requester is limited to 10 attempts per rolling 15 minutes.
- The system limits all requesters to 1,000 attempts per rolling 15 minutes.
- Throttled attempts are recorded durably, so restarts do not reset abuse
  controls.
- Sessions last 30 days and use `HttpOnly`, `SameSite=Lax` cookies. Cookies are
  `Secure` on every non-loopback host.
- State-changing routes require a same-origin request.
- Raw magic-link, requester, and session credentials are never stored. The
  database stores HMAC digests keyed by `SESSION_SECRET`.
- Verification decisions, signals, assigned opportunities, and introduction
  requests are durable PostgreSQL records.
- An introduction request is owner-scoped and idempotent. Requested
  relationships remain visible even if their catalogue item is later inactive.
- Zero picks is a valid result; do not manufacture a weak match to fill space.

Monitor failed email delivery, authentication request volume, pending review
age, migration errors, database connection saturation, and introduction-request
state age. Never log raw magic links, session cookies, `SESSION_SECRET`, Resend
credentials, or the full managed database URL.

## 8. Hosting notes

`npm run build` produces the Sites-compatible bundle. A successful static build
does not prove the authenticated deployed flow is operational. Do not describe a
deployment as production-ready until managed PostgreSQL, Resend, the sender
identity, `SESSION_SECRET`, the admin allowlist, migrations, seed, and a real
email sign-in have all been verified in that environment.

The deployment order is:

1. provision managed PostgreSQL and backups;
2. configure production secrets and variables;
3. apply migrations and seed;
4. build and deploy the application;
5. request and consume a real emailed magic link;
6. verify the admin review flow and one member signal/pick flow;
7. confirm logs and database records contain no plaintext credentials.

### Exact-commit Sites release

Prepare a release request from the latest local commit, a tag/branch, or a full
SHA:

```bash
npm run prepare:sites
npm run prepare:sites -- website-v3
npm run prepare:sites -- <full-sha>
```

Preparation checks out only the resolved commit in an isolated worktree, runs
the locked install and release gates, and writes an ignored archive plus
`request.json`. Dirty files are excluded. The command never publishes. Trigger
the authenticated step by asking Codex `Deploy Mewtuals` or
`Deploy Mewtuals at <commit-ish>`.

The publisher must:

1. reuse Sites project `appgprj_6a56979ca26c8191b26abf2a5cd9dc51`;
2. require the request SHA to exist, the archive to be a regular non-symlinked
   file, and a recomputed SHA-256 to equal `request.json`;
3. request a short-lived Sites source credential, use only its returned remote
   and branch, never persist it, and verify that branch's remote head equals the
   target SHA after pushing;
4. save one version, then pass the public-deploy authorization gate—approval in
   an earlier task is not reusable—and poll the deployment to a terminal state;
5. require the active deployment to reference the newly saved version and
   target SHA;
6. require active routing and SSL plus HTTP 200 from both
   `https://mewtuals.com` and `https://www.mewtuals.com`, then verify `/apply`
   includes the release-specific text `Put Mewtuals on your company’s side.`;
7. record that the GitHub commit, Sites source head, saved Sites version, and
   production deployment all identify the same target SHA.

An older target is an application-source rollback only. It does not roll back
Sites environment values or secrets, PostgreSQL schema/data, D1/R2 state, email
configuration, or other external dependencies. Before a non-fast-forward
publish, read the connector-reported live version, obtain and fetch its exact
commit, and compare its complete `drizzle/` path and blob-hash inventories plus
hosting bindings with the rollback target. Block the release if that live
commit is unknown or compatibility cannot be shown, and obtain explicit
rollback confirmation. `--force-with-lease` is allowed only for the
credential-returned Sites source branch using its observed SHA; never
force-push the GitHub repository.

Google OAuth is not a launch dependency for product v1. Its two placeholders
exist only to make the deferred integration explicit.
