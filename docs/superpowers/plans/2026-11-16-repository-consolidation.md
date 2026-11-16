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

- [ ] Checkpoint the complete Battery Atlas changeset on `codex/consolidate-main`; keep the separate Robov3rse proposal in a distinct documentation commit.
- [ ] Preserve every existing local branch and worktree. Review new source for accidental secret/configuration/artifact additions.
- [ ] Merge `origin/main`, resolving `package.json`, lockfile, local database helpers, setup/CI, README, and overlapping tests so both histories' behavior remains covered.
- [ ] Run focused merge-boundary tests; resolve failures with the smallest supported changes and preserve test coverage.
- [ ] Run `npm test`, `npm run test:db`, `npm run test:migrations`, `npm run test:acceptance`, `npm run test:e2e`, `npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`. Use a separate disposable validation database if existing local data would otherwise need alteration.
- [ ] Review the merged diff and actual rendered browser journeys. Record any remaining limitations without treating old plan notes as current results.
- [ ] Push the reviewed result, update GitHub `main` without force, and verify the remote SHA and CI. Retain the original local refs/worktrees for a later cleanup decision.

## File ownership

- `package.json` / `package-lock.json`: combine local feature dependencies and all suite selections with main's setup commands and dependency updates.
- `scripts/local-postgres.mjs`, `scripts/local-development.mjs`, `scripts/with-local-db.mjs`, related tests: preserve local safety guards, cross-platform setup, username and port handling.
- `.github/workflows/ci.yml`: validate the combined feature set and migrations on a fresh checkout.
- `README.md`: describe the combined product and one current setup/verification path.
- Existing Battery Atlas source, datasets, tests, and plans: preserve as implemented, including dated research labels.
- Robov3rse proposal: retain as proposed documentation; do not implement or deploy it as part of Mewtuals.

## Completion evidence

Record exact commits, executed checks, remote verification, and preserved local-only material here after validation. A backup commit is not a release-readiness claim.
