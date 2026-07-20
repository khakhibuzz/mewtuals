# Mewtuals Sites Deployment Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe exact-commit Sites preparation command, use it to publish the latest Mewtuals commit, and verify both custom domains.

**Architecture:** A dependency-injected Node ESM module owns commit resolution, manifest validation, isolated-worktree orchestration, checks, packaging, atomic request output, hashing, and cleanup. A thin CLI adapter exposes `npm run prepare:sites -- [commit-ish]`. The script never holds Sites credentials or changes production; the authenticated Codex Sites flow consumes its request artifact, verifies integrity and the Sites source head, then saves and deploys one public version.

**Tech Stack:** Node.js 22 ESM, Git worktrees, npm scripts, Vitest, OpenAI Sites packaging helper and connector, SHA-256.

---

## File map

- Create `scripts/sites-deployment.mjs`: testable deployment-preparation domain and orchestration functions.
- Create `scripts/prepare-sites-deployment.mjs`: CLI argument handling, signal wiring, output, and exit codes.
- Create `tests/sites-deployment.test.ts`: target, manifest, artifact, cleanup, signal, and package-wiring coverage.
- Create `tests/fixtures/sites-deployment-signal-child.mjs`: real subprocess signal fixture using an injected blocking preparation.
- Modify `package.json`: add `prepare:sites`.
- Modify `README.md`: user-facing latest/named-commit preparation instructions and the Sites/Codex boundary.
- Modify `AGENTS.md`: durable project/deployment invariants.
- Modify `docs/product-v1-operations.md`: exact operator and rollback procedure.

### Task 1: Exact target and hosting-contract validation

**Files:**
- Create: `scripts/sites-deployment.mjs`
- Create: `tests/sites-deployment.test.ts`

- [ ] **Step 1: Write failing tests for target resolution and manifest validation**

Test exported functions with an injected command runner and filesystem:

```ts
expect(await resolveCommit("HEAD", fakeRunner)).toEqual({
  sha: FULL_SHA,
  subject: "feat: current release",
});
expect(await resolveCommit("website-v1", fakeRunner)).toMatchObject({ sha: V1_SHA });
await expect(resolveCommit("missing", fakeRunner)).rejects.toThrow("Unknown commit-ish");

expect(validateHostingManifest({
  project_id: EXPECTED_PROJECT_ID,
  d1: null,
  r2: null,
})).toEqual({ projectId: EXPECTED_PROJECT_ID });
expect(() => validateHostingManifest({
  project_id: "wrong",
  d1: null,
  r2: null,
})).toThrow("expected Sites project");
expect(() => validateHostingManifest({
  project_id: EXPECTED_PROJECT_ID,
  d1: { database_name: "unexpected" },
  r2: null,
})).toThrow("does not support D1 or R2 bindings");
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npm run test:unit -- tests/sites-deployment.test.ts
```

Expected: FAIL because `scripts/sites-deployment.mjs` does not exist.

- [ ] **Step 3: Implement the smallest target and manifest API**

Export:

```js
export const EXPECTED_PROJECT_ID = "appgprj_6a56979ca26c8191b26abf2a5cd9dc51";

export async function resolveCommit(commitish, run) {
  // git rev-parse --verify <commitish>^{commit}
  // git show -s --format=%s <sha>
}

export function validateHostingManifest(manifest) {
  // Require exact project_id and d1 === null && r2 === null.
}
```

Use argument arrays rather than shell strings. Convert command failures into an
actionable unknown/ambiguous commit error without hiding command context.

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the same command. Expected: all target and manifest tests PASS.

### Task 2: Isolated preparation, atomic artifacts, and cleanup

**Files:**
- Modify: `scripts/sites-deployment.mjs`
- Modify: `tests/sites-deployment.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Cover:

- dirty status emits a warning while the worktree is built from the resolved SHA;
- startup prunes Git worktree metadata and only marked abandoned script-owned
  worktree and artifact-staging directories from a previous invocation;
- a detached worktree runs `npm ci`, lint, unit tests, build, then the selected package helper;
- the helper can be supplied through `SITES_PACKAGE_SCRIPT`;
- when `CODEX_HOME` is unset, helper discovery falls back to `~/.codex`;
- the default helper resolver selects the newest semantic-versioned bundled
  Sites version, requires a regular executable file, and invokes exactly
  `package-site.sh <worktree> <temp-attempt>/site.tar.gz`;
- output is written under a unique full-SHA attempt directory via one final rename;
- `request.json` contains schema version `1`, project ID, full SHA, subject,
  absolute archive path, SHA-256, and ISO creation time;
- failure removes the temporary worktree and incomplete output while preserving the original exit error;
- an injected `SIGINT` or `SIGTERM` aborts the active child and still invokes cleanup;
- separate preparations of the same commit never share an attempt directory.

Use temporary fixture directories and fake command/package runners. Do not run
`npm ci` or the real build in unit tests.

- [ ] **Step 2: Run focused tests and confirm RED**

Expected: orchestration exports or behavior are missing.

- [ ] **Step 3: Implement the orchestration**

Export a single primary API:

```js
export async function prepareSitesDeployment({
  commitish = "HEAD",
  repoRoot,
  outputRoot,
  env = process.env,
  signal,
  dependencies = defaultDependencies,
}) {
  // prune -> resolve -> warn -> worktree -> validate -> install/check/build
  // -> package -> lstat/hash -> write request -> atomic rename -> cleanup
  return { requestPath, archivePath, sha, subject };
}
```

Implementation requirements:

- create a unique OS-temp parent containing a versioned
  `.mewtuals-sites-preparation.json` marker with repository realpath, PID, and
  creation time;
- create each temporary artifact-attempt directory with a versioned
  `.mewtuals-sites-artifact.json` marker containing the same ownership fields;
- at startup, scan only directories with the exact worktree or artifact-staging
  prefix. Remove a directory on the next invocation only when its marker is
  valid for the same repository and its recorded PID is no longer alive;
  preserve and warn about active, foreign, malformed, or unmarked directories;
- pass an `AbortSignal` to every spawned child;
- on POSIX, start each command in its own process group and terminate the group
  on abort before awaiting the child exit; use an equivalent child-tree
  termination path where process groups are unavailable;
- on cleanup, use `git worktree remove --force`, `git worktree prune`, and
  recursive removal only inside the marked temp parent;
- never use `shell: true`;
- package into a sibling temporary attempt directory and rename it to the final
  attempt only after the complete request has been flushed;
- use `lstat` to reject symlink/non-file archives before hashing;
- write the final archive path into the request even while writing under the
  temporary attempt directory;
- choose the Sites helper using `SITES_PACKAGE_SCRIPT` first, otherwise inspect
  `${CODEX_HOME:-~/.codex}/plugins/cache/openai-bundled/sites/*/scripts/package-site.sh`,
  sort semantic versions, and require the selected path to be a regular
  executable file.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Expected: all exact-commit, artifact, failure, cleanup, and signal tests PASS.

- [ ] **Step 5: Commit the tested preparation core**

```bash
git add scripts/sites-deployment.mjs tests/sites-deployment.test.ts
git commit -m "feat: prepare exact commits for Sites deployment"
```

### Task 3: CLI, package command, and operator contract

**Files:**
- Create: `scripts/prepare-sites-deployment.mjs`
- Modify: `package.json`
- Modify: `tests/sites-deployment.test.ts`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/product-v1-operations.md`

- [ ] **Step 1: Add failing CLI/package contract tests**

Assert that:

- `package.json` maps `prepare:sites` to
  `node scripts/prepare-sites-deployment.mjs`;
- zero positional arguments selects `HEAD`;
- one positional argument is forwarded unchanged;
- more than one positional argument exits with usage text;
- CLI success prints the SHA and absolute request path;
- CLI failure prints one concise error and sets a non-zero exit code;
- signal handling aborts preparation and exits `130` for `SIGINT` or `143` for
  `SIGTERM` after cleanup.

Test the core signal path with an injected `AbortSignal`. Separately spawn
`tests/fixtures/sites-deployment-signal-child.mjs`, wait for its ready marker,
send real `SIGINT` and `SIGTERM`, and assert exit `130`/`143` plus the fixture's
cleanup marker. This tests OS signal behavior without running Git or npm.

- [ ] **Step 2: Run focused tests and confirm RED**

Expected: CLI and package wiring are absent.

- [ ] **Step 3: Implement the thin CLI adapter**

Export an injectable adapter with no import-time side effects:

```js
export async function runCli({
  prepare = prepareSitesDeployment,
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  signals = process,
} = {}) {
  // Parse argv, register handlers on signals, call prepare, await cleanup,
  // unregister handlers, and return the intended exit code.
}
```

The executable wrapper calls `runCli()` only when the module is the direct
entrypoint and assigns its returned code to `process.exitCode`. The adapter must:

```js
const controller = new AbortController();
// register SIGINT/SIGTERM once; abort rather than process.exit immediately
// call prepareSitesDeployment({ commitish, signal: controller.signal })
// preserve the signal exit code only after the promise settles and cleanup ran
```

It must not contain Git, packaging, or hashing policy already owned by the core.

- [ ] **Step 4: Update durable documentation**

Document:

```bash
npm run prepare:sites
npm run prepare:sites -- website-v3
npm run prepare:sites -- <full-sha>
```

State plainly that the command does not publish; the user triggers publishing
by asking Codex `Deploy Mewtuals` or `Deploy Mewtuals at <commit-ish>`. Record
the existing project ID, credential non-persistence, request-integrity check,
remote-head verification, rollback limitation, `--force-with-lease` boundary,
and apex/`www` verification.

- [ ] **Step 5: Run focused tests, full unit suite, and lint**

```bash
npm run test:unit -- tests/sites-deployment.test.ts
npm run test:unit
npm run lint
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit CLI and documentation**

```bash
git add package.json scripts/prepare-sites-deployment.mjs tests/sites-deployment.test.ts README.md AGENTS.md docs/product-v1-operations.md
git commit -m "feat: add repeatable Sites deployment trigger"
```

- [ ] **Step 7: Push the durable automation source before production**

```bash
git push -u origin codex/sites-deploy-script
```

Expected: the private GitHub branch contains the exact committed source that
will be prepared and deployed. Production publishing must not precede this
durable push.

### Task 4: Prepare and verify the exact release artifact

**Files:**
- Generated, ignored: `output/sites/<full-sha>/<attempt>/site.tar.gz`
- Generated, ignored: `output/sites/<full-sha>/<attempt>/request.json`

- [ ] **Step 1: Run the complete source gate from the committed branch**

```bash
npm test
npm run lint
git diff --check
git status --short
```

Expected: tests/render/build/lint pass and the tracked worktree is clean.

- [ ] **Step 2: Prepare the default current commit**

```bash
npm run prepare:sites
```

Expected: isolated install, lint, unit tests, build, and Sites package succeed;
the command prints the current full SHA and one request path.

- [ ] **Step 3: Independently validate the request**

Check that the target SHA equals current `HEAD`, the project ID matches the
hosting manifest, the archive is a regular non-symlinked file, its recomputed
SHA-256 equals the request, and the archive contains:

```text
dist/server/index.js
dist/.openai/hosting.json
```

Expected: every assertion passes before any Sites write action.

### Task 5: Publish through Sites and verify production

**Files:**
- No tracked file changes.

- [ ] **Step 1: Inspect current Sites and source state**

Reuse project `appgprj_6a56979ca26c8191b26abf2a5cd9dc51`. Get its current
site/version, both custom domains, and a new short-lived source credential.
Use only the returned `remote_url`, `branch`, `auth_mode`, and token.

The user explicitly requested deployment to the already-public custom domains
in this active task. Re-check that authorization immediately before the public
deploy call; if execution has moved to a task without that request, stop and
obtain fresh public-deployment approval.

- [ ] **Step 2: Verify archive integrity immediately before upload**

Repeat the full-SHA existence, project ID, regular-file/non-symlink, and SHA-256
checks from Task 4. Stop if any value changed.

- [ ] **Step 3: Push and prove the Sites source head**

Read the remote branch SHA with the credential's per-command authorization
header. A missing branch is an initial-source case and permits a normal push.
For an existing branch, fetch its observed SHA into an isolated temporary ref
and inspect that commit's `.openai/hosting.json` and `drizzle/` tree. Push:

```text
<target-sha>:refs/heads/<credential-branch>
```

Use a normal fast-forward push for this latest release. If a future named
historical target is non-fast-forward:

1. use the Sites connector's site/version reads to identify the live version and
   its exact commit SHA; block the rollback if that identity is unavailable;
2. fetch that exact live commit through the authenticated source repository and
   require the fetched object to match the Sites live-version identity; treat
   the observed source-branch head only as the force-with-lease safety value;
3. compare target and live-commit hosting manifests and require the same project
   ID with `d1`/`r2` exactly null;
4. compare the complete `drizzle/` path and blob-hash inventories and require
   them to be identical; otherwise compatibility is not proven and deployment
   is blocked;
5. explain that environment values, secrets, database state, and other external
   dependencies are not rolled back and obtain explicit rollback confirmation;
6. push only with
   `--force-with-lease=refs/heads/<branch>:<observed-sha>`.

Re-read the remote head and require exact equality with the target SHA. Fail if
the lease or branch moved. Never persist the credential in a remote URL, named
Git remote, or Git config.

- [ ] **Step 4: Save and deploy one public Sites version**

Call `save_site_version` with the verified target SHA and exact archive. Deploy
that returned version publicly (the site is already public and this user has
explicitly requested production deployment). Poll `get_deployment_status`
until `succeeded` or a terminal failure.

- [ ] **Step 5: Verify the custom domains**

Refresh `mewtuals.com` and `www.mewtuals.com`; require `status: active`,
`provider_status: active`, and `ssl_status: active`. Then run:

```bash
curl -sS -I --max-time 20 https://mewtuals.com
curl -sS -I --max-time 20 https://www.mewtuals.com
```

Expected: HTTP 200 from both. Also request `/apply` from the apex domain and
require both HTTP 200 and the release-specific text
`Put Mewtuals on your company’s side.`. Confirm the Sites deployment references
the newly saved version ID and target commit so an old HTTP-200 deployment
cannot be mistaken for this release.

- [ ] **Step 6: Confirm durable source and production identity agree**

Confirm the private GitHub branch, verified Sites source branch, saved version,
and production deployment all reference the same target commit. Keep the
worktree for future deployment-script changes.
