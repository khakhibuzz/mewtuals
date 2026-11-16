# Repository Consolidation Implementation Plan

> **For agentic workers:** Execute the preservation, merge, validation, and publication steps in order; use independent reviewers for merge resolutions and final review.

**Goal:** Reconcile all current Mewtuals development into GitHub `main` without discarding local work.

**Architecture:** Preserve both Git histories with a merge. Retain GitHub's independent local setup and CI while incorporating the existing Discovery, Opportunity Briefs, Ecosystem Intelligence, Global Demand Radar, public Physical AI site, performance work, and Battery Atlas. No deployment or database reset is part of this task.

**Tech Stack:** Git, TypeScript, React/Vinext, PostgreSQL 16, Vitest, Playwright.

## Starting evidence

- GitHub `main`: `a2ca574c25fdea9053bad1fcda3dbd09c4aba521`.
- Development: `fea44686b3d9bac9159a1ef2ad417d0410c761ec`, 205 commits beyond the shared base, missing two main commits; 202 commits absent from every GitHub branch.
- Working tree: 40 Battery Atlas implementation/test/plan files plus one proposed Robov3rse design document.
- Eleven worktrees; other feature tips are incorporated or patch-equivalent. The product-v1 hosting change is already represented in development. Preserve its dirty file, the mobile worktree's local `.neon`, all ignored configuration/database files, and the existing Radar stash.
- The owner explicitly requested reconciliation into main and no direct discarding. Do not delete branches, worktrees, stashes, databases, or notes.

## Tasks

- [x] Checkpoint the complete Battery Atlas changeset on `codex/consolidate-main`; keep the separate Robov3rse proposal in a distinct documentation commit.
- [x] Preserve every existing local branch and worktree. Review new source for accidental secret/configuration/artifact additions.
- [x] Merge `origin/main`, resolving `package.json`, lockfile, local database helpers, setup/CI, README, and overlapping tests so both histories' behavior remains covered.
- [x] Run focused merge-boundary tests; resolve failures with the smallest supported changes and preserve test coverage.
- [x] Run `npm test`, `npm run test:db`, `npm run test:migrations`, `npm run test:acceptance`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`. Use a separate disposable validation database if existing local data would otherwise need alteration.
- [x] Review the merged diff and actual rendered browser journeys. Record any remaining limitations without treating old plan notes as current results.
Publication procedure: push the reviewed result, update GitHub `main` without force, and verify the remote SHA and CI. The final delivery summary records that remote result. Retain the original local refs/worktrees for a later cleanup decision.

## File ownership

- `package.json` / `package-lock.json`: combine local feature dependencies and all suite selections with main's setup commands and dependency updates.
- `scripts/local-postgres.mjs`, `scripts/local-development.mjs`, `scripts/with-local-db.mjs`, related tests: preserve local safety guards, cross-platform setup, username and port handling.
- `.github/workflows/ci.yml`: validate the combined feature set and migrations on a fresh checkout.
- `README.md`: describe the combined product and one current setup/verification path.
- Existing Battery Atlas source, datasets, tests, and plans: preserve as implemented, including dated research labels.
- Robov3rse proposal: retain as proposed documentation; do not implement or deploy it as part of Mewtuals.

## Completion evidence

Local validation completed on 16 November 2026:

- Preservation commits: `573181b` (Battery Atlas), `0191333` (Robov3rse proposal), `cdb584c` (this plan). Both original histories meet in merge `ef9840b`.
- Final `npm test`: 110 unit suites / 1,922 tests and three rendered HTML tests passed; production build passed.
- Fresh isolated checkout on PostgreSQL port 55439: initial/repeated setup, 336 database tests, 61 acceptance tests, fresh migration path and populated upgrade/forward-compatibility paths passed.
- All 21 browser tests passed, including responsive/touch/overflow checks, member and administrator journeys, Battery Atlas map/market/policy flows, and public-only offline behavior. Production landing/navigation/Atlas filtering were also inspected in the in-app browser.
- Final typecheck, lint, and whitespace checks passed. Independent merge review found a manifest-cache revision issue; its executable regression now passes.
- Fresh setup uncovered two integration gaps that were fixed: externally located worktrees were not recognizing their own database directory, and local configuration lacked Discovery/Radar credentials. Generated older configurations gain only absent worker keys; existing bytes and secrets survive partial append failures, covered by regression tests.
- All original branches and worktrees remain. The 16-file Radar stash has no missing feature; seven files are identical and the rest are superseded by stricter current contracts. The conference-share branch's three unique commits are patch-equivalent. Neither historical draft was applied or discarded.
- Original local databases, ignored configuration, hosting changes, and `.neon` remain untouched. The separate validation checkout contains only generated local configuration and synthetic data.
- A second Docker checkout contained 21 unpublished Join/Login edits. They are preserved at `db8615e585f4313cc5458fc8191dff34f58f3b15` on `codex/docker-join-login-draft`, without modifying that checkout. Its `/join` member entry conflicts with the current Opportunity Brief route, so it remains a separate review decision. Its untracked task transcript stays local.

Limits: no Sites/production deployment was performed. Battery research retains its 6 September 2026 review date. Dependency installation still reports existing npm advisories (32 total); this reconciliation is not an advisory-remediation release. The in-app browser's old development-origin module cache was stale; a fresh production-origin tab rendered and operated correctly without deleting browser data.
