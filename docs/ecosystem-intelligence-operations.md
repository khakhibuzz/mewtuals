# Ecosystem Intelligence evidence operations

Ecosystem Intelligence facts enter Mewtuals through the private,
versioned `ecosystem-intelligence-import-v1` contract. The importer enriches
existing Discovery candidates only. It does not create candidates, change
Discovery runs, sources, research, or review state, touch Opportunity Brief
data, or change the Discovery scheduler.

## Create a private evidence file

Create the file outside the repository and make it private before writing
evidence into it:

```bash
install -m 600 /dev/null /absolute/private/path/evidence.json
```

The operational file mode is `0600`. The importer accepts only a regular file
owned by the current user with no group or other permission bits. It rejects
symbolic links, directories, oversized files, unknown top-level or fact fields,
private/non-HTTP URLs, unregistered taxonomy keys, unresolved or ambiguous
candidate identities, and duplicate facts within one file.
Every URL-valued field is limited to 2,048 characters before normalization.

Each candidate entry identifies one existing Discovery candidate by exactly
one of `candidateId` or `canonicalUrl`. A resolved relationship target uses
exactly one of `targetCandidateId` or `targetCanonicalUrl`; an external,
unresolved public organisation uses `targetPublicName` alone. Every fact needs
public evidence URLs and an integer confidence from 0 through 100. Missing
facts should be omitted rather than guessed.

Do not commit evidence files. Do not place credentials, private contacts,
authenticated page contents, or copied source pages in the contract.

## Validate before import

Validation reads and normalizes the private file, checks all bounds and
identities that do not require PostgreSQL, and prepares the canonical inputs
for deterministic SHA-256 evidence identities. It performs no database work;
final evidence keys that need a canonical candidate identity are derived only
after the import transaction resolves that identity:

```bash
npm run ecosystem:validate -- --file /absolute/private/path/evidence.json
```

Only proceed after the command exits zero with terminal status `validated`.
Output is intentionally limited to the schema version, file hash, bounded
candidate/fact counts, duplicate counts, unresolved count, and terminal status.
Failures contain bounded JSON paths and error codes, never rejected values,
source contents, SQL, credentials, or the database URL.
`unresolvedCount` is the number of relationship facts that intentionally use
an external `targetPublicName`; it is a factual count and therefore remains the
same when an unchanged file is replayed.

## Import and retry safely

Import the exact validated bytes:

```bash
npm run ecosystem:import -- --file /absolute/private/path/evidence.json
```

The repository first resolves every source and resolved relationship target by
Discovery candidate ID or the existing normalized Discovery identifiers. It
rejects missing, ambiguous, repeated, or self-referential identities before
writing. It then applies classifications, headquarters, public signals, and
relationships in one PostgreSQL transaction with explicit unique conflict
targets. A failure rolls back every fact in the file.

Classifications upsert by candidate/kind/term, headquarters by candidate, and
signals and relationships by their deterministic evidence keys. Upserts
preserve `created_at` and update only their evidence-owned fields and
`updated_at`. Replaying unchanged bytes is idempotent and reports existing facts
as duplicates rather than creating new rows.

If the import exits without terminal JSON or its success is otherwise unknown,
do not generate or edit a replacement file. Retry the exact same file and
confirm that its `fileHash` is unchanged. Never infer failure from a timeout;
the transaction may already have committed.

## Backup and recovery

Before a large or operationally significant import, confirm the managed
PostgreSQL backup/point-in-time recovery window and record the current
deployment and migration SHA. Retain the exact mode-0600 evidence file until
the import has a known terminal result and the expected safe counts have been
checked. Recovery should restore or repair only the four Ecosystem Intelligence
tables; Discovery and Opportunity Brief tables are separate sources of truth.

For an input mistake with a successful commit, do not hand-edit Discovery data.
Prepare a corrected versioned evidence file, validate it, and use the normal
upsert contract. For facts that must be removed rather than corrected, use a
reviewed database recovery procedure with a current backup; the V1 importer is
add/update only.

## Future research producers

Future research jobs may emit the same
`ecosystem-intelligence-import-v1` document, subject to the same public-evidence,
privacy, size, taxonomy, and identity requirements. Validate and import those
files through this command pair. Do not add Ecosystem Intelligence facts to the
Discovery worker payload and do not change the Discovery schedule or scheduler
to run this importer.
