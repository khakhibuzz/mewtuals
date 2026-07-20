# Mewtuals Sites Deployment Trigger Design

**Date:** 2026-07-20
**Status:** Approved direction; pending implementation

## Objective

Make Mewtuals releases easy to trigger while preserving the existing OpenAI
Sites project and custom domains.

The repository will expose one preparation command:

```bash
npm run prepare:sites -- [commit-ish]
```

With no argument, the command prepares the current `HEAD`. A SHA, tag, or branch
name prepares that exact commit. The authenticated Sites publish remains a
Codex action because Sites does not expose a standalone repository CLI or
long-lived deployment credential. Running `npm run prepare:sites` never changes
production by itself. The actual deployment trigger is an explicit Codex
request such as `Deploy Mewtuals` or `Deploy Mewtuals at <commit-ish>`.

## Existing boundary

- Reuse Sites project `appgprj_6a56979ca26c8191b26abf2a5cd9dc51` from
  `.openai/hosting.json`; never create another project for this repository.
- Preserve the public custom domains `mewtuals.com` and `www.mewtuals.com`.
- The local script owns deterministic commit selection, validation, building,
  packaging, and the deployment request artifact.
- Codex owns the short-lived Sites source credential, source push, version save,
  public deployment, status polling, and production verification.
- No Sites token, source credential, environment secret, or deployment archive
  is committed.

## Command contract

`scripts/prepare-sites-deployment.mjs` backs the package command.

1. Resolve the optional commit-ish with Git and record its full commit SHA.
2. Show the resolved SHA and subject. If the working tree has uncommitted
   changes, warn that they are excluded; do not silently deploy them.
3. Create a detached temporary Git worktree for the resolved commit so a
   historical release cannot mutate the developer's active checkout.
4. Confirm the commit contains `.openai/hosting.json` whose `project_id` is the
   expected project and whose `d1` and `r2` values are both exactly `null`.
   This release helper does not support changing either binding.
5. Install the commit's locked dependencies with `npm ci`.
6. Run `npm run lint`, `npm run test:unit`, and `npm run build` in that isolated
   checkout. Stop at the first failure.
7. Package the successful build with the installed Sites `package-site.sh`
   helper. `SITES_PACKAGE_SCRIPT` may override its location for tests or a
   nonstandard Codex installation; otherwise the script locates the newest
   installed bundled Sites helper under `CODEX_HOME`.
8. Write an ignored deployment attempt under
   `output/sites/<full-sha>/<timestamp>-<random-suffix>/` containing:
   - `site.tar.gz`, the deployable Sites archive;
   - `request.json`, with schema version, project ID, full target SHA, source
     commit description, archive path, archive digest, and creation time.
9. Create the archive and request under a sibling temporary directory, then
   atomically rename that directory into the attempt path only after both files
   are complete. Concurrent or failed preparations therefore cannot expose a
   stale request/archive pair or overwrite another attempt.
10. Remove the temporary worktree in `finally` and on handled `SIGINT` and
    `SIGTERM`: terminate the active child, preserve its exit status, run forced
    Git worktree removal, and prune stale worktree metadata. `SIGKILL` and host
    failure cannot be intercepted, so every new invocation first prunes stale
    worktree metadata and removes only abandoned temporary directories created
    by this script.
11. Print a concise success summary and the exact request file Codex should
    publish.

The script never selects dirty working-tree content. The default "latest"
means the latest local commit at `HEAD`, not uncommitted files and not an
implicit fetch from a remote.

## Authenticated publish flow

When asked to deploy Mewtuals, Codex runs the command for the requested
commit-ish and reads `request.json`. It then:

1. confirms the request project ID still matches `.openai/hosting.json`, the
   target commit still exists locally, the archive is a regular non-symlinked
   file, and a freshly computed SHA-256 matches `request.json`;
2. requests a short-lived Sites source repository credential;
3. uses only the credential-returned `remote_url` and `branch`, reads the
   current remote branch SHA, pushes
   `<target-sha>:refs/heads/<returned-branch>`, then reads the remote branch
   again and requires it to equal the target SHA;
4. saves one Sites version using that verified remote-head SHA and the prepared
   archive;
5. deploys that saved version publicly;
6. polls until the deployment succeeds or fails;
7. refreshes both custom-domain states and requires active routing and SSL;
8. requires HTTP 200 from both `https://mewtuals.com` and
   `https://www.mewtuals.com` before reporting completion.

Deploying an older commit is an explicit application rollback. If the Sites
source branch cannot fast-forward to it, Codex captures the observed remote SHA
and may push only with
`--force-with-lease=refs/heads/<returned-branch>:<observed-sha>`. It fails if
the branch moved. The GitHub repository is never force-pushed.

A source rollback does not roll back Sites environment values or secrets,
D1/R2 state, PostgreSQL schema or data, email configuration, or any other
external dependency. Before publishing a non-fast-forward target, Codex must
show that limitation, compare the target's migration inventory and hosting
bindings with the currently live source, and obtain explicit rollback
confirmation. A difference that cannot be shown compatible blocks the publish;
the script still may prepare the commit for inspection.

## Failure behavior

- An unknown or ambiguous commit-ish fails before creating deployment output.
- A missing or mismatched hosting manifest fails before dependency installation.
- Missing Node/npm, Git, or Sites packaging helper produces an actionable error.
- Validation or build failure prevents archive creation and deployment.
- Packaging validates `dist/server/index.js` and
  `dist/.openai/hosting.json`; invalid archives are rejected.
- The request uses a SHA-256 digest; Codex recomputes it immediately before
  upload and rejects missing, non-regular, symlinked, or replaced archives.
- A Sites deployment failure is terminal and reports the provider message.
- A successful Sites URL without healthy custom domains is not called complete.

## Tests and verification

Automated tests will cover:

- default target resolution to `HEAD`;
- explicit SHA, tag, and branch resolution;
- invalid commit rejection;
- dirty-tree warning without including dirty content;
- expected-project validation;
- command failure propagation;
- request metadata and archive digest generation;
- temporary-worktree cleanup on success, failure, `SIGINT`, and `SIGTERM`;
- stale temporary-worktree pruning on the next invocation;
- unique, atomically published attempt directories;
- package script wiring through `npm run prepare:sites`.

Release verification for this change is:

```bash
npm test
npm run lint
npm run prepare:sites
git diff --check
```

The first production use in this task will publish the current `HEAD`, poll the
Sites deployment, confirm both domain and SSL states, and verify HTTP 200 on the
apex and `www` domains.

## Durable documentation

- `README.md` documents how to prepare the latest commit or a named commit.
- `AGENTS.md` records that Sites deployments must reuse the existing project,
  use the generated request artifact, and verify both custom domains.
- `docs/product-v1-operations.md` records the operator sequence and the boundary
  between the local script and authenticated Sites actions.

No GitHub Actions deployment, Cloudflare migration, persistent deployment
credential, database migration automation, or production-secret setup is part
of this change.
