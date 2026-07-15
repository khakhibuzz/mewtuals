# Mewtuals Product v1 Design

**Date:** 2026-07-15
**Status:** Approved from the user-provided v1 brief

## Product Promise

Mewtuals is a curated media and distribution partnership network. Verified companies, brands, startups, distribution partners, and creators state what they can offer and what they need. Mewtuals returns a small, non-searchable set of high-fit opportunities and actively advances selected relationships.

This is not a marketplace, directory, lead database, or self-serve messaging product.

## Complete v1 Loop

`Sign in → identify yourself → Mewtuals understands you → verify → tell us what you need → receive curated opportunities → we advance the connection.`

The v1 is complete only when a new local user can traverse this entire loop with durable PostgreSQL state and see both pending-verification and verified states.

## Participant and Partnership Model

The top-level identity choice stays simple:

1. **Organisation** — company, brand, startup, or distribution partner.
2. **Creator** — creator, podcaster, publication, or media operator.

The model supports four initial partnership directions:

- brand ↔ creator
- brand ↔ brand
- creator ↔ creator
- startup ↔ distribution partner

Creators and podcasters are opportunity counterparties inside the broader Mewtuals network. The product language is `Media & Distribution Partnerships`, never `creator marketplace`.

## Public Website Boundary

The current landing-page section order, copy blocks, visual identity, hero graph, and case-study structure remain unchanged.

Only strategic entry points are added:

- Header: `For creators`, `Join Mewtuals`, and `Log in`.
- Hero: the primary partnership CTA enters `/join`; the explanatory CTA stays unchanged.
- For Startups: one `Join Mewtuals` CTA.
- Apply: the existing section remains in place and gains a direct route into the product after its current lightweight qualification interaction.

No public marketplace, participant search, browse surface, or new landing-page section is added.

## Authentication

### v1 method

Email magic-link authentication is the complete v1 path. Google OAuth and phone OTP are explicitly deferred because the brief permits any one of Google, email magic link, or phone OTP.

### Security contract

- Magic-link tokens are cryptographically random, stored only as SHA-256 hashes, single-use, and expire after 15 minutes.
- A user can request at most one active link per email per 60 seconds.
- Sessions use random opaque tokens stored only as hashes, expire after 30 days, and are delivered in `HttpOnly`, `SameSite=Lax` cookies with `Secure` enabled outside localhost.
- State-changing endpoints validate same-origin requests and never trust client-supplied user ids.
- Email addresses are normalized before lookup.

### Delivery modes

- When `RESEND_API_KEY` and `EMAIL_FROM` are present, the server sends the link through Resend's HTTPS API.
- In local development only, the response exposes the generated link on screen so the complete flow works without external credentials.
- Production never returns a magic link in an API response.
- `.env.example` and `.dev.vars.example` include blank placeholders for `DATABASE_URL`, `SESSION_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET`.

## Onboarding

### 1. Identify yourself

The user chooses `Organisation` or `Creator`.

Organisation users select one subtype: company, brand, startup, or distribution partner. Creator users select one subtype: creator, podcaster, publication, or media operator.

### 2. Submit source

- Organisation: website is required; LinkedIn is optional.
- Creator: primary social/profile URL is required; business email is optional.

URLs are validated and normalized server-side.

### 3. Generated profile

Mewtuals deterministically derives an editable draft containing:

- person's display name
- organisation or creator name
- identity/subtype
- canonical domain
- primary source URL

The generator uses source-domain and URL-handle heuristics only. It does not fabricate fetched facts or claim that external pages were researched. The user confirms or edits every field before submission.

### 4. Verification

Confirmation creates a durable profile. Submitting for verification changes the profile to `pending` and records the event.

While pending, the dashboard shows:

- `Verification in progress`
- one clearly labelled example opportunity
- four `Coming soon` cards
- no real counterparty identities

After review:

- `verified` unlocks curated opportunities
- `waitlisted` preserves the profile and signal while keeping opportunities locked

### Review operations

- `/admin/verifications` lists pending profiles for emails in `ADMIN_EMAILS`.
- An administrator can approve or waitlist with an optional note.
- Local development also exposes a clearly labelled `Simulate approval` action so the complete user loop can be verified without changing identities. This action is unavailable in production.

## Dashboard

### Your signal

The dashboard asks `What are you open to right now?` and persists:

- availability: `Open now`, `Open selectively`, or `Not currently available`
- one or more interests from media interviews, podcasts, creator collaborations, brand collaborations, product reviews, founder stories, distribution partnerships, and co-marketing
- an optional free-text note

### Mewtuals Picks

The feed is curated and non-searchable. The server assigns at most three opportunities from an internal seed catalogue using explicit identity and interest compatibility. It may return zero opportunities when no current fit passes the gate.

Every unlocked card contains:

- opportunity title
- partnership direction
- counterparty type, not a private real-world identity
- why the timing may fit
- reciprocal value
- one `Ask Mewtuals to advance this` action

### Advancing a relationship

The action creates one idempotent introduction request with state `requested`. The dashboard then shows the durable status `Mewtuals is reviewing the relationship`.

Internal states are `requested`, `reviewing`, `contacting`, `connected`, and `closed`. v1 users cannot directly message counterparties.

## PostgreSQL Data Model

PostgreSQL is the sole source of truth. Browser storage is not used for user or workflow state.

Tables:

- `users`
- `magic_links`
- `sessions`
- `profiles`
- `verification_reviews`
- `signals`
- `opportunities`
- `profile_opportunities`
- `introduction_requests`

The schema uses UUID primary keys, foreign keys, explicit status values, unique constraints for ownership/idempotency, and timestamps. Deleting a user cascades through user-owned records. Opportunity catalogue records remain curator-owned.

## Runtime and Database Environments

- Local development uses the installed PostgreSQL 16 server on a project-local data directory and port `55432`.
- Application queries use Drizzle ORM with Postgres.js.
- Production uses the same PostgreSQL schema through `DATABASE_URL`; a managed service such as Neon, Supabase, or another Cloudflare-reachable PostgreSQL provider can be attached without changing domain logic.
- Migrations live in source control and are applied explicitly.
- Database access stays behind repository modules; route handlers do not contain SQL.

## Route Map

Public:

- `/` — existing marketing page with product entry CTAs
- `/join` — email magic-link entry
- `/login` — returning-user entry
- `/auth/verify` — consumes magic link and creates session

Authenticated:

- `/onboarding/identity`
- `/onboarding/source`
- `/onboarding/profile`
- `/onboarding/verification`
- `/dashboard`
- `/logout`

Administrative:

- `/admin/verifications`

Server endpoints are grouped under `/api/auth`, `/api/onboarding`, `/api/verification`, `/api/signal`, `/api/opportunities`, and `/api/admin`.

## Architecture

The code is split by responsibility:

- `app/domain/` — validation, profile-generation, matching, and workflow rules with no framework or database imports.
- `app/server/` — session, email, authorization, and application services.
- `db/` — PostgreSQL schema, client, and repository implementations.
- `app/api/` — thin request/response adapters.
- `app/components/product/` — reusable product UI.
- route pages — server-owned loading and small client forms.

Domain tests run without a database. Repository and route integration tests use the local PostgreSQL database. Browser tests prove the full user loop.

## Error and Empty States

- Invalid or unsafe URLs return field-specific errors.
- Expired or consumed magic links return a recovery page with a fresh sign-in action.
- Missing database configuration fails clearly rather than silently using memory or browser storage.
- Pending and waitlisted users cannot access real picks through either UI or API.
- A verified user with no passing opportunity sees `No strong fit is ready yet` rather than fabricated recommendations.
- Repeated advance requests return the existing introduction request.

## Acceptance Criteria

1. A local user requests and opens a development magic link.
2. The user chooses an identity and submits a valid source.
3. The generated profile contains editable name, entity, identity, and domain fields.
4. The user confirms and submits for verification.
5. Pending dashboard shows exactly one example and four coming-soon cards without real identities.
6. Local approval or administrator approval changes status to verified.
7. The user persists availability, interests, and notes.
8. The verified dashboard returns zero to three non-searchable curated opportunities.
9. Advancing one creates and displays a durable introduction request.
10. Refreshing and signing back in preserves every completed state.
11. The existing landing-page structure and visuals remain intact apart from strategic CTAs.
12. PostgreSQL migrations, tests, lint, build, responsive browser flow, and accessibility checks pass.

## Deferred

- Google OAuth and phone OTP
- automatic external-page scraping or LLM profile enrichment
- public participant identities before verification
- direct messaging
- marketplace search or filters
- billing
- automated outbound introduction email
- machine-learning ranking
