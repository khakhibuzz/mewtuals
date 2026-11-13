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

- [ ] Inspect GitHub branches/history and tracked files for publication blockers.
- [ ] Add failing tests for generated local configuration, rerun safety, refusal
  to overwrite existing configuration, and validated local port selection.
- [ ] Implement small local configuration/setup helpers, portable PostgreSQL
  discovery, and consistent development/test database URLs. Preserve the existing
  loopback and dedicated test-database safety checks.
- [ ] Add MIT license and package metadata; document prerequisites, clone/setup,
  local sign-in, tests, optional integrations, and asset provenance.
- [ ] Add CI that installs from the lockfile and verifies local setup, lint,
  type checking, unit/render, database, acceptance, and browser checks.
- [ ] Run the applicable repository release gate against disposable local data.
- [ ] Review changes and test the exact commit from a separate fresh clone.
- [ ] Push only this release work to GitHub main, make the repo public, and
  verify anonymous access, recognized licensing, and the clone instructions.

## Verification limits

Local authentication deliberately substitutes development confirmation links for
email delivery. Real email requires a deployer's own credentials; Google OAuth
is reserved for future implementation and is not enabled by filling placeholders.
Publishing source does not deploy or alter the live website. Do not include
unpublished branches or dirty work from the owner's original checkout.
