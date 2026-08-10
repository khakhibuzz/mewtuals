# Mewtuals Physical AI Public Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship and host a minimal, mobile-friendly Physical AI public site with Ecosystem, For companies, and Join Mewtuals as its three primary destinations.

**Architecture:** Reuse the existing Next/Vinext application and shared public header. Keep `/` to a hero, actions, and ecosystem map only; move the company proposition to `/companies`; add the ecosystem chain and outcomes at `/ecosystem`; keep `/join` unchanged. The service worker continues to cache only `/`, `/offline`, and its explicit public assets.

**Tech Stack:** Next.js 16, React 19, TypeScript, CSS, Phosphor Icons, Vitest/Testing Library, Node rendered-HTML tests, Playwright, Sites.

**Visual references:**
- Homepage desktop: `/Users/keshavgarg/.codex/attachments/6411962f-d7d9-410c-8ef7-dfe300a6d469/image-1.png`
- Ecosystem content: `/Users/keshavgarg/.codex/attachments/6411962f-d7d9-410c-8ef7-dfe300a6d469/image-2.png`
- Homepage mobile rhythm: `/Users/keshavgarg/.codex/attachments/6411962f-d7d9-410c-8ef7-dfe300a6d469/image-3.png`

**Starting SHA:** `0160b7e200db22f499e02b4d5f4e257e1b4f409d`

---

### Task 1: Lock the three-destination header and sparse homepage

**Files:**
- Modify: `tests/navigation.test.tsx`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `app/components/SiteHeader.tsx`
- Modify: `app/components/Hero.tsx`
- Create: `app/components/EcosystemMap.tsx`
- Modify: `app/page.tsx`

- [ ] Write failing component assertions for exactly `Ecosystem -> /ecosystem`, `For companies -> /companies`, and `Join Mewtuals -> /join`; assert removed labels are absent and the wordmark links home.
- [ ] Write failing hero assertions for the exact Physical AI eyebrow, robotics headline, and `/ecosystem` secondary action.
- [ ] Update rendered-HTML assertions in the same red step to require the sparse hero/actions/map-only homepage, three routes, and absence of case studies plus removed labels.
- [ ] Run `npm run test:unit -- tests/navigation.test.tsx`. Expected: failures showing five old links and internet-native copy.
- [ ] Run `npm run build && node --test tests/rendered-html.test.mjs`. Expected: old navigation, case-study, and startup assertions fail.
- [ ] Install the icon library exactly with `npm install @phosphor-icons/react@2.1.10`.
- [ ] Implement the shared header, hero copy/actions, and accessible ecosystem map using the icon library.
- [ ] Remove `CaseStudies` and `ForStartups` from `app/page.tsx`, leaving hero/actions/map only.
- [ ] Run `npm run test:unit -- tests/navigation.test.tsx`. Expected: 7 passing tests.
- [ ] Run `npm run build && node --test tests/rendered-html.test.mjs`. Expected: all rendered-HTML tests pass.
- [ ] Commit with `git add app/page.tsx app/components/SiteHeader.tsx app/components/Hero.tsx app/components/EcosystemMap.tsx tests/navigation.test.tsx tests/rendered-html.test.mjs package.json package-lock.json && git commit -m "feat: reposition Mewtuals for Physical AI"`.

### Task 2: Add the Ecosystem and Companies routes

**Files:**
- Modify: `tests/navigation.test.tsx`
- Create: `tests/physical-ai-marketing.rendered.test.mjs`
- Create: `app/ecosystem/page.tsx`
- Create: `app/components/EcosystemChain.tsx`
- Create: `app/components/EcosystemOutcomes.tsx`
- Create: `app/companies/page.tsx`
- Create: `app/components/ForCompanies.tsx`
- Delete: `app/components/ForStartups.tsx`

- [ ] Write rendered-response tests asserting `/ecosystem` and `/companies` return 200, the six ecosystem stages are present, the four outcome cards are present, and the Companies page preserves the comparison and join action.
- [ ] Run `npm run build && node --test tests/physical-ai-marketing.rendered.test.mjs`. Expected: `/ecosystem` and `/companies` fail with 404.
- [ ] Implement `/ecosystem` with exact chain labels `Components`, `Manufacturing`, `OEMs`, `Integrators`, `Distribution`, `Media` and outcome titles `Supply chain access`, `Distribution and pilots`, `Media and visibility`, `Ecosystem intelligence`.
- [ ] Write the failing company-language test against the new `ForCompanies` component name before implementation.
- [ ] Run `npm run test:unit -- tests/navigation.test.tsx`. Expected: the new company-language assertion fails before `ForCompanies` exists.
- [ ] Implement `/companies` by renaming the obsolete startup component to `ForCompanies.tsx` and composing it under the shared public header.
- [ ] Run `npm run test:unit -- tests/navigation.test.tsx`. Expected: the company-language assertion and the complete navigation suite pass.
- [ ] Run `npm run build && node --test tests/physical-ai-marketing.rendered.test.mjs`. Expected: 4 passing tests.
- [ ] Commit with `git add app/ecosystem app/companies app/components/EcosystemChain.tsx app/components/EcosystemOutcomes.tsx app/components/ForCompanies.tsx app/components/ForStartups.tsx tests/navigation.test.tsx tests/physical-ai-marketing.rendered.test.mjs && git commit -m "feat: add Physical AI ecosystem pages"`.

### Task 3: Make the public routes intentionally responsive

**Files:**
- Modify: `tests/responsive-contract.test.ts`
- Modify: `tests/e2e/mobile-pwa.spec.ts`
- Modify: `app/globals.css`

- [ ] Add failing CSS-contract assertions for the mobile ecosystem map, one-column ecosystem chain, one-column outcomes, and at least 154px-high stage cards.
- [ ] Update the browser expectations to three public links and add route visits for `/`, `/ecosystem`, `/companies`, and `/join`.
- [ ] Run `npm run test:unit -- tests/responsive-contract.test.ts`. Expected: missing `.ecosystem-map`, `.ecosystem-chain`, and `.ecosystem-outcomes` mobile rules.
- [ ] Implement desktop radial/map, horizontal chain, outcome grid, and `@media (max-width: 767px)` one-column layouts with generous vertical spacing.
- [ ] Extend the browser touch helper so every visible mobile control must have both `width >= 44` and `height >= 44`.
- [ ] Run `npm run test:unit -- tests/responsive-contract.test.ts`. Expected: passing responsive contract.
- [ ] Run `npm run test:e2e`. Expected: the full Playwright suite passes, including `/`, `/ecosystem`, `/companies`, and `/join` at 390x844 and 1440x1100 with zero overflow and 44px-by-44px controls.
- [ ] Commit with `git add app/globals.css tests/responsive-contract.test.ts tests/e2e/mobile-pwa.spec.ts && git commit -m "feat: make Physical AI pages responsive"`.

### Task 4: Preserve the public-only PWA boundary

**Files:**
- Modify: `tests/pwa.test.tsx`
- Do not modify: `app/pwa/service-worker-source.ts`
- Do not modify: `public/favicon.svg`

- [ ] Add an executable worker-harness test proving navigations to `/ecosystem` and `/companies` are fetched network-only and never added to Cache Storage.
- [ ] Run `npm run test:unit -- tests/pwa.test.tsx`. Expected: the new contract passes against the intentionally unchanged worker; any failure blocks rollout.
- [ ] Confirm the explicit public asset allowlist is unchanged, so no worker revision or versioned public asset URL is required.
- [ ] Commit with `git add tests/pwa.test.tsx && git commit -m "test: protect Physical AI pages from offline caching"`.

### Task 5: Refresh metadata and social identity

**Files:**
- Modify: `tests/pwa.test.tsx`
- Modify: `tests/rendered-html.test.mjs` only for metadata introduced in this task; homepage routing assertions already changed in Task 1.
- Modify: `app/layout.tsx`
- Modify: `public/og.png`

- [ ] Write failing metadata assertions for the Physical AI title, description, and social-card alt.
- [ ] Run `npm run test:unit -- tests/pwa.test.tsx`. Expected: old social-card alt failure.
- [ ] Generate exactly one bespoke social card using the settled homepage copy and map motif; verify `Mewtuals` and `External partnerships for Physical AI companies.` render exactly before replacing `public/og.png`.
- [ ] Update the root metadata without changing favicon or service-worker allowlisted asset URLs.
- [ ] Run `npm run test:unit -- tests/pwa.test.tsx` and `npm run build && node --test tests/rendered-html.test.mjs tests/physical-ai-marketing.rendered.test.mjs`. Expected: all passing.
- [ ] Commit with `git add app/layout.tsx public/og.png tests/pwa.test.tsx tests/rendered-html.test.mjs && git commit -m "feat: refresh Mewtuals Physical AI identity"`.

### Task 6: Browser design QA

**Files:**
- Modify: `tests/e2e/mobile-pwa.spec.ts`
- Create: `docs/2026-08-11-mewtuals-physical-ai-design-qa.md`

- [ ] Re-read `docs/superpowers/specs/2026-08-11-mewtuals-physical-ai-public-site-design.md`, especially its no-invented-claims, no-endorsements, and no-unverified-logos boundary.
- [ ] Start the supported local application with `npm run dev:4000` and open `http://localhost:4000/` in the in-app browser.
- [ ] At 390x844 and 1440x1100, visit `/`, `/ecosystem`, `/companies`, and `/join`.
- [ ] At both sizes, verify no page-level horizontal overflow, all visible controls are at least 44px high and wide, and the page preserves meaningful vertical negative space.
- [ ] On the public header, open the menu, select a destination and verify it closes; reopen, press Escape, verify it closes and returns focus.
- [ ] Compare the homepage and ecosystem captures with the three visual-reference files in one combined comparison input. Record typography, spacing, colors, image/icon quality, and copy findings in `docs/2026-08-11-mewtuals-physical-ai-design-qa.md`.
- [ ] Fix every P0/P1/P2 issue, recapture the same viewport/state, repeat the combined comparison, and set `final result: passed` only with evidence.

### Task 7: Full release gate, exact commit, and Sites publication

**Files:**
- Review: `.openai/hosting.json`
- Review: generated deployment request/archive only; never persist credentials.

- [ ] Run the complete release gate exactly: `npm test`, `npm run test:db`, `npm run test:acceptance`, `npm run test:e2e`, `npm run lint`, `npm run build`, `git diff --check`. Every command must exit 0.
- [ ] Review `git status --short`, `git diff --stat 0160b7e200db22f499e02b4d5f4e257e1b4f409d...HEAD`, `git diff 0160b7e200db22f499e02b4d5f4e257e1b4f409d...HEAD`, and the remaining working-tree diff for the entire release: unrelated changes, secrets, local artifacts, and accidental worker/cache changes.
- [ ] Commit the exact validated source and record the full SHA.
- [ ] Run `npm run prepare:sites -- <validated-commit-sha>` and validate the generated request and digest.
- [ ] Reuse Sites project `appgprj_6a56979ca26c8191b26abf2a5cd9dc51`; obtain an authenticated source write credential without persisting it and prove its returned source branch points at the exact validated SHA.
- [ ] Obtain any required public-deploy authorization, save one Sites version from the prepared archive, deploy it, and poll until succeeded.
- [ ] Verify active routing, valid SSL, and HTTP 200 for `/`, `/ecosystem`, `/companies`, and `/join` on both `https://mewtuals.com` and `https://www.mewtuals.com`.
- [ ] Open the deployed URL in Codex and return it as the primary deliverable.
