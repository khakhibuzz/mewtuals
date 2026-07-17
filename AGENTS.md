# Mewtuals engineering conventions

Keep this file limited to repository-wide boundaries that should survive
individual features. Product requirements and implementation history belong in
`docs/`.

## Architecture

- Delivery adapters (`app/**/page.tsx`, `app/**/route.ts`, and UI components)
  translate framework input and output. They call focused services in
  `app/server`; they do not own business policy.
- `app/server` owns application orchestration, authentication, authorization,
  session handling, request security, and integration ports. Keep those checks
  on the server and reuse them from routes; client state is never authoritative.
- `app/domain` owns pure validation, profile, workflow, signal, and matching
  rules. It must not import React, Next/Vinext, database code, environment
  access, or network clients.
- Runtime SQL belongs only in `db/repositories`. Repositories implement the
  interfaces needed by server services; routes and services must not construct
  queries or import schema/query builders. Schema, migration, and seed tooling
  remain under `db/`, `drizzle/`, and `scripts/`.
- A verified member may receive zero curated picks. Preserve that honest result;
  never weaken the matching gate or invent a recommendation to fill space.

## Responsive and PWA contracts

- Treat `@media (max-width: 767px)` as the mobile boundary. Design those layouts
  intentionally, keep visible controls at least 44px high and wide, support safe
  areas and long values, and prevent page-level horizontal overflow at 320px.
  A contained, labelled horizontal rail is allowed when it is the intended UI.
- The service worker is a public-landing cache, not an application-data cache.
  It may cache `/`, `/offline`, and explicitly approved public shell assets.
  Never cache `/api/*`, member/admin HTML, authenticated responses, profile or
  partnership data, or private user state in Cache Storage, IndexedDB, local
  storage, or background sync.
- Member and transactional routes stay network-only. When their navigation
  fails offline, show the public fallback headed exactly
  `Get online to see your partnerships.` without rendering member data.
- Change service-worker behavior through
  `app/pwa/service-worker-source.ts` and its executable tests. Keep the public
  asset allowlist explicit; do not hand-maintain a second worker implementation.
  A changed allowlisted asset at the same URL also needs a deliberate worker
  revision or a versioned URL so existing installations receive new bytes.

## Verification and local artifacts

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

The browser gate requires the local member app on `localhost:4000` and manages a
built PWA origin on `localhost:4002`. It covers 320px, 390px, 767px, and desktop
layouts, touch targets, overflow, the member/admin journey, and the offline
privacy boundary.

Never commit `.env*`, `.dev.vars`, secrets, managed database URLs, local database
directories or dumps, browser profiles, traces, screenshots, coverage, or build
output. Keep disposable browser-test accounts allowlisted only in ignored local
configuration.
