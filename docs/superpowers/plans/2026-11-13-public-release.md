# Public release implementation plan

**Goal:** Publish the existing GitHub Mewtuals project under MIT with a verified,
documented local workflow that needs no private files or service credentials.

**Design:** Preserve the React/Vinext application and PostgreSQL persistence.
Generate ignored, checkout-local development configuration with a random session
secret and loopback-only development authentication. Keep production integrations
optional for local use and preserve production authentication restrictions. Use a
configurable, validated local database port so independent clones cannot silently
reuse another checkout's database. Native Node.js 22 and PostgreSQL 16 remain
documented prerequisites; no account or paid service is required for local flows.

**Tech stack:** TypeScript, React, Vinext/Vite, PostgreSQL 16, Node.js 22,
Vitest, Playwright.

## Tasks

- [x] Inspect GitHub branches/history and tracked files for publication blockers.
- [x] Add failing tests for generated local configuration, rerun safety, refusal
  to overwrite existing configuration, and validated local port selection.
- [x] Implement small local configuration/setup helpers, portable PostgreSQL
  discovery, and consistent development/test database URLs. Preserve the existing
  loopback and dedicated test-database safety checks.
- [x] Add MIT license and package metadata; document prerequisites, clone/setup,
  local sign-in, tests, optional integrations, and asset provenance.
- [x] Add CI that installs from the lockfile and verifies local setup, lint,
  type checking, unit/render, database, acceptance, and browser checks.
- [x] Run the applicable repository release gate against disposable local data.
- [x] Review changes and test the exact commit from a separate fresh clone.
- [ ] Push only this release work to GitHub main, make the repo public, and
  verify anonymous access, recognized licensing, and the clone instructions.

## Local verification completed

Release source commit `e385371` was cloned into a separate directory without
copying ignored configuration, dependencies, database files, or service credentials.
`npm ci` and setup succeeded; repeated setup preserved the generated secret.
The clone used an independent random secret and database port. A deliberate
occupied-port setup attempt failed before migrations or seeds and left the
existing PostgreSQL process unchanged; the documented recovery then succeeded.

- 277 unit tests, 3 rendered-output tests, 23 database tests, and the dedicated
  acceptance run passed.
- All 3 browser tests passed, covering the member/admin journey, responsive
  layouts, persistence, public-only offline caching, and production rejection
  of the development approval endpoint.
- Lint, standalone type checking, production build, and whitespace checks passed.
- Gitleaks scanned 65 commits reachable from the release and existing GitHub
  branches with no findings; a separate publication review found no blockers.

Compatible Next.js, React, React Server Components, and Zod security updates were
applied and verified. Dependency maintenance remains: the full npm audit reports
32 advisories (1 low, 20 moderate, 11 high); the production-only audit reports
one moderate advisory in `baseline-browser-mapping`. Broader toolchain upgrades
are outside this local-development release. These checks do not constitute a
production security certification.

## Verification limits

Local authentication deliberately substitutes development confirmation links for
email delivery. Real email requires a deployer's own credentials; Google OAuth
is reserved for future implementation and is not enabled by filling placeholders.
Publishing source does not deploy or alter the live website. Do not include
unpublished branches or dirty work from the owner's original checkout.
