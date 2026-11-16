# Unified network entry implementation plan

**Goal:** Adapt preserved Docker draft `db8615e` to the user-approved `/network/join` route and merge into GitHub main without discarding the draft or unrelated work.

**Architecture:** Keep `/join` as the public Opportunity Brief form and retain current public navigation. Use one existing email form for new and returning members at `/network/join`; `/login` redirects there for compatibility. After same-origin token consumption, the existing onboarding service selects dashboard or the unfinished onboarding step. Protected redirects, logout and expired-session recovery use the canonical entry. Keep authentication, privacy and single-use link contracts unchanged.

**Tech stack:** Vinext/React, existing PostgreSQL repositories, Vitest, Playwright.

- [x] Update page, form, verification-route and redirect tests; confirm failures before implementation.
- [x] Adapt the existing components and route handlers; preserve ProductShell admin navigation and public acquisition.
- [x] Extend browser checks for legacy redirect, new and returning members, and network-only offline fallback.
- [x] Run focused tests and all release gates documented in AGENTS.md; review the final diff.
- [ ] Commit and push to GitHub main without force; retain source branch, stashes and other worktrees.

No deployment or branch/worktree deletion is included. Work is isolated from concurrent robotics-data edits in the original checkout.

Review added a regression for onboarding lookup failure after token consumption: return the committed session cookie with the existing onboarding route as a safe retry point, and log only a generic message.

Verification on 16 November 2026: 1,930 unit tests, 3 production-render tests,
336 database tests, 61 acceptance tests, fresh/populated/forward migration
checks, 21 browser tests, typecheck, lint, production build, and whitespace
checks passed. Browser coverage includes new and returning members, legacy
redirects, mobile controls/overflow, administrator journeys, public acquisition,
and network-only offline fallbacks for both member entry URLs. The production
entry and legacy redirect were also inspected in the in-app browser.

The first browser launch encountered an occupied test port; the owner exited
before retry, and the complete retry passed. No unrelated process was stopped.
The in-app development origin retained an old Vite dependency cache; the
production build rendered correctly and the clean browser suite passed.
