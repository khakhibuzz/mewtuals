# Public form email operations

`/apply` representation applications and `/join` Opportunity Brief submissions
are saved before their owner notification is sent to `keshav@mewtuals.com`.
The applicant acknowledgement for `/join` remains a separate email.

Each saved submission has a UUID and an immutable snapshot of its normalized
fields, sender, recipient, reply address, subject, text and HTML. Retrying uses
that exact snapshot and the Resend idempotency key `form-submission/<uuid>`.
Changing runtime sender settings does not rewrite an existing snapshot.

## Inspect pending notifications

Inject the intended `DATABASE_URL` into the command environment through the
existing secure operator configuration. The command also loads ignored
`.env.local`; an already exported variable takes precedence. Never put
credentials into command arguments, source control, screenshots or logs.

Run the read-only command from the matching release checkout:

```bash
npm run forms:notifications --
npm run forms:notifications -- status --limit 50
npm run forms:notifications -- status <submission-uuid>
```

The default lists at most 20 pending submissions; the maximum limit is 100.
An exact UUID can inspect an accepted submission as well. Empty output with exit
code 0 means the selected pending list was empty. Output is one JSON object per
submission containing only its ID, form, creation time, status and provider
message ID. Contact information, request hashes, message bodies and provider
errors are never printed.

Statuses mean:

- `pending`: provider acceptance has not been durably recorded.
- `provider_accepted`: Resend returned a valid message ID and acceptance was
  recorded. This does not confirm delivery to the destination inbox.
- `reconciliation_needed`: an unconfirmed attempt is at or beyond the safe retry
  window. The command will not resend it automatically.

## Retry deliberately

A retry sends real email using the configured `RESEND_API_KEY`. Read-only status
commands do not require email credentials. Retry configuration is read with the
same server environment validation as the application, including its
`SESSION_SECRET`. The stored sender and message are reused.

```bash
npm run forms:notifications -- retry <submission-uuid>
npm run forms:notifications -- retry --limit 10
```

`retry` requires an exact UUID or an explicit limit from 1 to 100. Batch retries
run sequentially and use the oldest pending submissions first. Already accepted
notifications are not resent. Exit code 1 means a command or selected delivery
could not be confirmed; exit code 2 means invalid arguments. Every reported
acceptance is read back from the database after delivery.

The delivery manager allows a five-second request deadline and reserves that
same interval before Resend's 24-hour idempotency window expires. If a request
may have reached Resend but its result was not recorded, retrying within the
safe window reuses the same key and body. Beyond that window, the operator must
reconcile the outcome before any further send. The CLI has no force-resend flag.

## Verify delivery and reconcile ambiguity

For an accepted notification, use its provider message ID in the existing
Resend Emails dashboard or the authenticated retrieve-email API. The API returns
`last_event`; a sending-only API key cannot retrieve email records. Do not widen
or replace production credentials solely to turn a delivery check into a send.

For an older unconfirmed attempt, inspect Resend's records and the destination
inbox for the submission UUID included in the message. If the provider accepted
it, reconcile the recorded acceptance through the repository's
`recordAccepted(id, providerMessageId, at)` operation only after verifying the
matching recipient and immutable message. If absence of a prior delivery cannot
be established, leave the submission for review rather than sending with a new
UUID or changing its saved snapshot.

Check the actual `keshav@mewtuals.com` inbox separately when access is available.
A connected mailbox for a different address does not establish destination
receipt unless forwarding and the received message are verified. Record only
bounded operational identifiers and outcomes in release evidence.

For live smoke checks, use clearly labelled operator-owned submissions and a
unique source. Verify the persisted submission, provider acceptance and inbox
receipt independently. Do not claim receipt from HTTP success alone.

Provider references: [retrieve a sent email](https://resend.com/docs/api-reference/emails/retrieve-email),
[API-key permissions](https://resend.com/docs/api-reference/api-keys/create-api-key),
and [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Deployment and recovery

Apply `drizzle/0010_public_form_submissions.sql` before deploying code that uses
the ledger. It is additive and compatible with the preceding release. Record
the SQL SHA-256 and the matching journal timestamp in
`drizzle.__drizzle_migrations` in the same transaction as the migration. Abort
if the existing migration checkpoint differs from the expected committed
`0009_global_demand_radar`; never repeat DDL after an uncertain response without
first reading the table and migration journal.

The 2026-11-19 production preparation confirmed migration 0009 with timestamp
`1785486179122` and hash
`a2f510fa20029c779a3ed67c510f56eaf97e11487061753c582064fa2d354350`.
The prior live application source was
`67aacabe9068841233fc82e9fd6718503c649e87` (Sites version 21).
A full data-and-schema recovery branch, `pre-form-owner-emails-20261119`
(`br-twilight-frost-azjj8dg8`), was created from Neon main at
2026-11-19 12:07:20 UTC (17:37:20 IST) with no automatic expiration. Preserve this checkpoint
and subsequent production submissions; ordinary application rollback can leave
the additive ledger in place. Restoring the whole database requires a separate
decision because it would lose writes after the checkpoint.

The release's local database verification uses PostgreSQL on port 55443.
The legacy `db:start` wrapper rejects the existing external Codex worktree
location. After verifying the cluster's exact data directory and ownership,
the documented underlying database, migration and acceptance commands passed
without changing that guard or the unrelated default cluster.
