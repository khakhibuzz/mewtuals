# Mewtuals engineering conventions

Keep this file limited to repository-wide boundaries that should survive
individual features. Product requirements and implementation history belong in
`docs/`.

## Architecture

- Pages, route handlers, and other server delivery adapters translate framework
  input and output. They call focused services in `app/server`; they do not own
  business policy.
- Client UI calls API routes and renders their responses. Client code must not
  import `app/server` runtime modules, repositories, database code, or server
  environment access.
- `app/server` owns application orchestration, authentication, authorization,
  session handling, and request security. Authentication, authorization, and
  same-origin enforcement for mutations are server-owned and reused by routes;
  client state and client-side checks are never authoritative.
- `app/domain` owns pure validation, profile, workflow, signal, and matching
  rules. It must not import React, Next/Vinext, database code, environment
  access, or network clients.
- Runtime PostgreSQL repository implementations, including their SQL and
  schema/query-builder imports, live under `db/repositories`. Service-facing
  repository contracts currently live at the boundary appropriate to each
  service and must remain framework-free. Routes and composition modules may
  wire concrete repositories but must not construct queries. Schema, migration,
  and seed tooling remain under `db/`, `drizzle/`, and `scripts/`.
- A verified member may receive zero curated picks. Preserve that honest result;
  never weaken the matching gate or invent a recommendation to fill space.

## Responsive and PWA contracts

- Treat `@media (max-width: 767px)` as the mobile boundary. Design those layouts
  intentionally, keep visible controls at least 44px high and wide, support safe
  areas and long values, and prevent page-level horizontal overflow at supported
  mobile widths. A contained, labelled horizontal rail is allowed when it is the
  intended UI.
- The service worker is a public-landing cache, not an application-data cache.
  It may cache `/`, `/offline`, and explicitly approved public shell assets.
  Never cache `/api/*`, member/admin HTML, authenticated responses, profile or
  partnership data, or private user state in Cache Storage, IndexedDB, local
  storage, or background sync.
- Member and transactional routes stay network-only. When their navigation
  fails offline, show the public fallback headed exactly
  `Get online to see your partnerships.` without rendering member data.
- Keep the public application form at the directly shareable `/apply` route,
  outside the landing-page navigation. It is transactional and therefore
  network-only under the same offline fallback contract.
- Change service-worker behavior through
  `app/pwa/service-worker-source.ts` and its executable tests. Keep the public
  asset allowlist explicit; do not hand-maintain a second worker implementation.
  A changed allowlisted asset at the same URL also needs a deliberate worker
  revision or a versioned URL so existing installations receive new bytes.

## Verification and local artifacts

Sites releases must reuse project
`appgprj_6a56979ca26c8191b26abf2a5cd9dc51`. Prepare an exact committed target
with `npm run prepare:sites -- [commit-ish]`; the command never publishes and
never includes dirty files. The authenticated publisher must validate the
generated request and digest, prove the credential-returned Sites source branch
points at the target SHA, obtain any required public-deploy authorization, and
verify active routing, SSL, and HTTP 200 for both `mewtuals.com` and
`www.mewtuals.com`. Never persist Sites source credentials. A rollback may use
`--force-with-lease` only on the credential-returned Sites source branch after
an exact live-commit compatibility check; never force-push GitHub.

Run the proportionate focused test while editing, then use the complete release
gate before delivery:

```bash
npm test
npm run test:db
npm run test:acceptance
npm run test:e2e
npm run lint
npm run build
git diff --check
```

Keep `npm run test:e2e` covering responsive layouts, touch targets, overflow,
the member/admin journey, and the public-only offline privacy boundary. Extend
that coverage when a route or PWA behavior changes.

Never commit populated or local environment files, `.dev.vars`, secrets,
managed database URLs, local database directories or dumps, browser profiles,
traces, screenshots, coverage, or build output. The tracked, sanitized
`.env.example` and `.dev.vars.example` templates are the only environment-file
exceptions and must contain placeholders rather than credentials. Keep
disposable browser-test accounts allowlisted only in ignored local
configuration.
