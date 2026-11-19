# Public form owner emails implementation plan

**Goal:** Persist /apply and /join submissions and notify keshav@mewtuals.com with every supplied field, preserving existing /join applicant acknowledgements.

**Architecture:** Add an immutable PostgreSQL public_form_submissions ledger and reuse Resend. /join inserts its ledger record atomically with its existing Opportunity Brief upsert. /apply stores a distinct application. Client-memory UUIDs identify attempts, and the server rejects reuse with a different normalized payload. Provider idempotency plus persisted acceptance protect retries. Failure retains inputs and saved data without presenting ordinary success.

**Delivery:** Save first, then send a stable email snapshot with a stable idempotency key. Store provider ID on acceptance; later failures cannot overwrite acceptance. Ambiguous attempts older than the provider's 24-hour idempotency window require reconciliation. Keep sender/recipient server-owned and private metadata out of public responses.

**Tasks:**
- [x] Add ledger contract, schema, additive migration, and atomic repository operations with conflict/concurrency/rollback tests.
- [x] Add email snapshot formatting and notification delivery service with recipient/reply-to/content, retry, timeout and acceptance-recording tests.
- [x] Wire /join notifications, add /api/applications with bounded validation/same-origin/honeypot/rate limits, and replace /apply prototype submission.
- [x] Give both clients stable per-payload retry IDs in memory; verify retained-input failures and real success UI.
- [x] Add a bounded operator reconciliation/retry script and operational instructions.
- [ ] Run full release checks, review diff, verify production recovery/migration access, apply additive migration, publish committed source, and send two clearly labelled live test submissions to the authorized owner address. Verify provider acceptance and inbox delivery separately where access permits.

**Scope:** No redesign, new email provider, unrelated database cleanup, or changes to administrator authorization. Prior /apply entries were never stored and cannot be recovered. Production migration must precede code depending on the new table.
