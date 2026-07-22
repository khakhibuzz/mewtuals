# Mewtuals Opportunity Brief Intake Design

**Date:** 2026-07-22
**Status:** Approved for the minimum usable release

## Goal

Turn `/join` into a low-friction public intake that a meetup participant can complete in under 30 seconds without authentication. The participant submits one public profile URL and at least one contact method, immediately sees confirmation, and appears in an administrator-owned Opportunity Brief Requests queue.

This release captures the request and supports manual research. It does not generate opportunity briefs automatically.

## Existing Boundaries Reused

The implementation extends the merged Mewtuals integration branch and reuses:

- Vinext/Next route and client-component patterns;
- `ProductShell` and `product.module.css` visual conventions;
- Zod domain validation and thin API-route adapters;
- service-owned orchestration under `app/server`;
- Drizzle/Postgres schemas, repositories, migrations, and test database tooling;
- same-origin enforcement, requester hashing, and durable abuse-control patterns;
- the existing administrator allowlist and session checks;
- Discovery Agent URL normalization, candidate identifiers, candidate records, and admin navigation;
- the existing Resend transport and environment configuration;
- the existing Sites project and exact-source deployment workflow.

No parallel authentication, persistence, admin, email, or discovery architecture is introduced.

## Public Experience

### `/join`

`/join` becomes a public, mobile-first Opportunity Brief request page.

Copy:

- Headline: `Find who you should collaborate with next.`
- Supporting text: `Share your company or creator profile. Mewtuals will research it and send you three partnership directions worth exploring. No account required.`
- Primary action: `Get my opportunity brief`
- Supporting line: `No login. No deck. We start with what is already public.`

Fields:

1. Participant type: `Company / Startup / Brand` or `Creator / Podcaster / Media`.
2. Public profile URL, required.
3. Email and WhatsApp number; at least one is required.
4. Optional `What are you open to?` textarea.

Inputs use accessible labels, touch targets of at least 44px, mobile keyboard hints, useful autocomplete attributes, field-level errors, an error summary, and an explicit loading state.

The page accepts `source` and standard UTM parameters. Values are bounded and passed to the server with the submission. The existing `/share` QR is updated to encode:

`https://mewtuals.com/join?source=bengaluru-meetup`

### Confirmation

After a successful submission the form is replaced in place with:

- Headline: `You’re on our research list.`
- Body: `We’ll study your profile and look for three partnerships worth exploring. Strong matches may also receive an invitation to join the verified Mewtuals network.`
- The normalized submitted profile URL.
- The recorded email, WhatsApp number, or both.

The user is not redirected to authentication or onboarding.

### Existing member entry

The current email magic-link join experience moves unchanged to `/network/join`. `/login`, magic-link verification, onboarding, profile confirmation, verification, and the member dashboard retain their current behavior. Invitation communication can point to `/network/join`; this release does not automate invitations.

## Request Domain

### Validation and normalization

A pure `app/domain/opportunity-brief.ts` module owns:

- participant type and status vocabulary;
- strict request-body validation and length bounds;
- reuse of Discovery Agent public URL normalization;
- lowercased email normalization;
- conservative international phone normalization that preserves a leading `+` and rejects impossible values;
- bounded `source` and UTM fields;
- allowed status transitions.

The server does not fetch the submitted URL during the request.

Release limits are explicit:

- JSON body: at most 16 KiB;
- profile URL: at most 2,048 characters before normalization;
- email: at most 320 characters;
- WhatsApp: after removing spaces, hyphens, and parentheses, an optional leading `+` followed by 8–15 digits; the normalized value preserves the leading `+` when supplied;
- `open_to_text`: at most 1,000 characters;
- `source`: at most 100 characters using letters, numbers, `.`, `_`, and `-`;
- each standard UTM value: at most 200 characters;
- stored repeat-source history: newest 20 entries only;
- serialized `source_metadata`: at most 8 KiB.

### Submission behavior

`POST /api/opportunity-briefs` is public but same-origin-only. It accepts JSON under a small fixed body limit, rejects a hidden honeypot value, derives a hashed requester identity with the existing session secret, validates the body, and calls one focused application service.

The service:

1. normalizes the profile URL and contacts;
2. applies durable requester-based rate limiting;
3. looks for an exact Discovery candidate identifier of the same participant type;
4. creates or updates the Opportunity Brief request transactionally;
5. links an exact existing candidate when present;
6. leaves `linked_candidate_id` null when no exact candidate exists;
7. records source/UTM information and the repeat submission;
8. commits the request before attempting acknowledgement delivery;
9. returns a safe confirmation snapshot.

An unmatched request is itself the durable research-queue record. It does not create a speculative Discovery candidate. Later manual or Discovery Agent research may create a source-supported candidate and link it. A request participant is never marked verified.

The confirmation snapshot is built from the normalized values in the current submission, never by returning the merged database row. A person who repeats a public URL therefore cannot learn an email or phone number supplied by someone else earlier.

### Status transitions

The service permits only:

- `submitted` → `researching` or `rejected`;
- `researching` → `brief_ready` or `rejected`;
- `brief_ready` → `researching`, `contacted`, or `rejected`;
- `contacted` → `invited_to_join`, `converted`, or `rejected`;
- `invited_to_join` → `contacted`, `converted`, or `rejected`;
- `rejected` → `researching` for an explicit administrator restore;
- `converted` is terminal.

Selecting the current status is an idempotent no-op. All other transitions return `409`.

## PostgreSQL Model

Add an `opportunity_brief_status` enum:

- `submitted`
- `researching`
- `brief_ready`
- `contacted`
- `invited_to_join`
- `converted`
- `rejected`

Add an `opportunity_brief_acknowledgement_status` enum:

- `not_requested`
- `pending`
- `sent`
- `failed`

Add `opportunity_brief_requests` with:

- `id`
- `participant_type` using the existing company/creator vocabulary
- `profile_url`
- `normalized_profile_url`
- normalized nullable `email`
- normalized nullable `phone_number`
- nullable `open_to_text`
- nullable `source`
- `source_metadata` JSONB containing bounded UTM values and a bounded repeat-submission history
- nullable `linked_candidate_id` with `ON DELETE SET NULL`
- `status`, default `submitted`
- nullable `internal_notes`
- `acknowledgement_status`
- nullable `acknowledgement_sent_at`
- nullable `acknowledgement_error`
- `submission_count`
- `last_submitted_at`
- `created_at`
- `updated_at`

Constraints and indexes:

- unique `(participant_type, normalized_profile_url)`;
- check that email or phone is present;
- positive submission count;
- indexes for status, source, participant type, creation date, email, phone, and linked candidate.

Add `opportunity_brief_submission_attempts` with an opaque requester hash, linked request id, and creation time. Inside a requester-scoped advisory-locked transaction, the service permits eight persisted submissions per requester in a rolling 15-minute window. Created and merged submissions consume the limit; invalid, honeypot, and throttled requests do not create attempt rows. The ninth valid attempt returns a recoverable `429` response. No raw IP address is stored.

URL identity owns deduplication in this first release. A repeat of the same participant type and normalized profile URL updates the existing request, increments `submission_count`, refreshes non-empty contact/open-to/source data, and appends bounded source metadata. A contact reused for a different profile is indexed for administrator review but is not automatically merged, because one person may legitimately represent multiple profiles.

## Discovery Agent Integration

The Opportunity Brief repository reuses Discovery candidate identifiers for one exact lookup by participant type and normalized URL identity. The submitted URL is classified with the existing rules as `website_host`, `linkedin_url`, `social_url`, or `canonical`; only an equal `candidate_type` plus equal normalized identifier value qualifies. If that unique identifier exists, `linked_candidate_id` is stored. If none exists, the request remains unlinked.

This release does not:

- manufacture a candidate from unresearched form data;
- start a general Discovery run on the public request path;
- change Discovery worker prompts or scheduling;
- mark a requester discovered, shortlisted, verified, or a member;
- build Profile, Verification, or Matching agents.

## Administrator Experience

Add `/admin/opportunity-briefs` under the existing administrator session and email allowlist. Add the route to the admin navigation used by verification and discovery pages.

The page includes:

- total requests;
- new requests today;
- company/creator counts;
- source counts;
- awaiting-research count (`submitted`);
- linked-candidate count;
- filters for participant type, status, source, submitted date, and linked/unlinked;
- a paginated table with the requested fields;
- an accessible detail dialog showing the complete submission and available linked candidate data.

The table columns are participant type, profile URL, email/phone, open-to text, source, linked candidate, status, and submitted date. `New today` and submitted-date filters use `Asia/Kolkata`; date bounds are inclusive local calendar days and are converted to instants in the repository query.

Minimum administrator mutations:

- change status through allowed transitions;
- add or replace internal notes;
- link an existing candidate by exact candidate UUID;
- unlink a candidate.

Mutations use same-origin checks, authenticated sessions, administrator authorization, strict JSON validation, and optimistic `expectedUpdatedAt` concurrency matching the Discovery admin pattern. Candidate linking verifies that the candidate exists and has the same participant type. Elaborate candidate search and automatic brief generation are deferred.

## Acknowledgement Email

When a submission contains email, the application requests an acknowledgement after the database transaction commits.

- Subject: `Mewtuals is researching your next partnership`
- Confirms receipt.
- Repeats the submitted profile.
- States that Mewtuals will look for three partnership directions.
- Explains that a later invitation may allow the recipient to claim the profile and join the verified network.

The implementation reuses the Resend HTTP transport and HTML escaping. Email failure never loses or rolls back the request. Delivery updates acknowledgement status to `sent` or `failed`. When credentials are unavailable, status remains `pending`; no new provider is introduced. WhatsApp-only requests use `not_requested` and receive the on-screen confirmation only.

Acknowledgement rules are intentionally narrow:

- a newly created request with email is marked `pending` and receives one delivery attempt after commit;
- a repeat with the same normalized email does not resend;
- a repeat that adds or replaces email resets acknowledgement to `pending` and receives one attempt to the newly submitted address;
- an interrupted post-commit attempt remains `pending`;
- `failed` and `pending` delivery states are visible to administrators, but automatic retries and a resend action are deferred from this release.

## Error and Security Behavior

- Invalid fields return a stable field-error map.
- Duplicate submits are idempotent upserts, not extra rows.
- Concurrent duplicate submits serialize around the unique profile identity.
- Missing/cross-origin requests fail before persistence.
- Oversized, malformed, or non-JSON bodies fail with 400/413/415 as appropriate.
- Rate-limited requests return 429 without exposing abuse details.
- Acknowledgement delivery failure still returns submission success and is visible to administrators.
- Public responses never include internal notes, requester hashes, attempt records, candidate-private data, or acknowledgement errors.
- The route remains network-only and is not added to the PWA cache.

## Testing and Release

Test-first implementation covers:

- validation, URL/email/phone normalization, contact requirement, and transitions;
- deduplication and concurrent upsert behavior;
- source and UTM capture with bounded repeat history;
- exact candidate linking and unmatched null linkage;
- durable rate limiting;
- acknowledgement sent/pending/failed behavior;
- public route security and response redaction;
- administrator authorization, filters, mutations, concurrency, and candidate type checks;
- `/join` form/confirmation accessibility;
- preservation of `/network/join`, `/login`, authenticated onboarding, verification, and dashboard flows;
- QR decoding to the tagged production URL;
- phone-sized browser completion without overflow or account creation.

Generate and inspect the Drizzle migration, run it against the guarded local test database, and extend database acceptance coverage. Before deployment run the repository release gates in `AGENTS.md`. Production release reuses the existing Sites project, applies the production Postgres migration before serving the new code, deploys the exact validated commit, and verifies `/share`, tagged `/join`, submission, confirmation, admin visibility, active custom-domain SSL, and HTTP 200 behavior.

## Deferred

- automated opportunity-brief generation;
- targeted Discovery Agent research execution from the request;
- candidate-search typeahead;
- automated WhatsApp messages;
- automated invitations or account creation;
- Profile, Verification, and Matching agents;
- sophisticated cross-profile contact merging.

The acknowledgement email, seven-state request record, required summary/filter fields, and minimum administrator mutations remain part of this release because they are explicit in the supplied brief. Their implementation stays small: one admin route, one table/detail dialog, no candidate typeahead, no background email worker, and no automatic research.

## Acceptance Criteria

1. `/share` encodes `/join?source=bengaluru-meetup`.
2. A participant can submit one public profile URL and email or WhatsApp in under 30 seconds without authentication.
3. The participant immediately sees the specified confirmation and recorded details without an account redirect.
4. The durable request appears in the administrator Opportunity Brief queue.
5. Source and UTM data are stored.
6. Repeating the same normalized profile does not create a second request row.
7. An exact existing candidate links; an unmatched request remains safely unlinked and queued for research.
8. An email acknowledgement is attempted without making request persistence depend on delivery.
9. Existing account login, onboarding, verification, Discovery Agent, and member dashboard behavior continues to pass its regression tests.
