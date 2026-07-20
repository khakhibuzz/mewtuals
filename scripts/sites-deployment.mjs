import { createHash, randomBytes as nodeRandomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

export const EXPECTED_PROJECT_ID = "appgprj_6a56979ca26c8191b26abf2a5cd9dc51";

const MARKER_VERSION = 1;
const WORKTREE_PREFIX = "mewtuals-sites-preparation-";
const WORKTREE_MARKER = ".mewtuals-sites-preparation.json";
const ARTIFACT_PREFIX = ".mewtuals-sites-artifact-";
const ARTIFACT_MARKER = ".mewtuals-sites-artifact.json";
export const TERMINATION_GRACE_MS = 250;

function abortError() {
  return new DOMException("The operation was aborted", "AbortError");
}

function killDirectChild(child, signal = "SIGTERM") {
  try {
    child.kill(signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function waitForCloseOrGrace({
  child,
  graceMs,
  setTimer,
  clearTimer,
}) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimer(timer);
      child.removeListener?.("close", onClose);
      resolve(result);
    };
    const onClose = () => finish("closed");
    child.once("close", onClose);
    timer = setTimer(() => finish("timeout"), graceMs);
    timer?.unref?.();
    if (child.exitCode !== null && child.exitCode !== undefined) finish("closed");
  });
}

export async function terminateChildTree({
  platform = process.platform,
  pid,
  child,
  spawnProcess = spawn,
  killProcess = process.kill.bind(process),
  graceMs = TERMINATION_GRACE_MS,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  if (!pid) {
    killDirectChild(child);
    return;
  }
  if (platform !== "win32") {
    const outcome = waitForCloseOrGrace({ child, graceMs, setTimer, clearTimer });
    try {
      killProcess(-pid, "SIGTERM");
    } catch (error) {
      if (error?.code !== "ESRCH") killDirectChild(child);
    }
    if ((await outcome) === "timeout") {
      try {
        killProcess(-pid, "SIGKILL");
      } catch {
        killDirectChild(child, "SIGKILL");
      }
    }
    return;
  }

  try {
    const taskkill = spawnProcess(
      "taskkill",
      ["/PID", String(pid), "/T", "/F"],
      { shell: false, stdio: "ignore", windowsHide: true },
    );
    const taskkillResult = await new Promise((resolve) => {
      let settled = false;
      let timer;
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimer(timer);
        callback(value);
      };
      taskkill.once("error", () => settle(resolve, { failed: true }));
      taskkill.once("close", (code) => settle(resolve, { failed: code !== 0 }));
      timer = setTimer(() => settle(resolve, { failed: true }), graceMs);
      timer?.unref?.();
    });
    if (taskkillResult.failed) killDirectChild(child, "SIGKILL");
  } catch {
    killDirectChild(child, "SIGKILL");
  }
}

async function runChild(command, args, { cwd, env = process.env, signal } = {}) {
  const useProcessGroup = process.platform !== "win32";
  const child = spawn(command, args, {
    cwd,
    env,
    detached: useProcessGroup,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));

  let aborted = false;
  let termination;
  const terminate = () => {
    aborted = true;
    if (!child.pid || child.exitCode !== null) return;
    termination ??= terminateChildTree({ pid: child.pid, child });
  };
  signal?.addEventListener("abort", terminate, { once: true });
  if (signal?.aborted) terminate();

  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", async (code, childSignal) => {
        const output = Buffer.concat(stdout).toString("utf8");
        const errors = Buffer.concat(stderr).toString("utf8");
        if (aborted) {
          await termination;
          reject(abortError());
          return;
        }
        if (code !== 0) {
          const detail = errors.trim() || output.trim() || `signal ${childSignal ?? "unknown"}`;
          reject(
            new Error(
              `Command failed (${code ?? "no exit code"}): ${command} ${args.join(" ")}\n${detail}`,
            ),
          );
          return;
        }
        resolve({ stdout: output, stderr: errors });
      });
    });
  } finally {
    signal?.removeEventListener("abort", terminate);
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

export const defaultDependencies = Object.freeze({
  run: runChild,
  warn: (message) => console.warn(message),
  now: () => new Date(),
  randomBytes: nodeRandomBytes,
  temporaryRoot: tmpdir(),
  rename,
  isProcessAlive,
});

export async function resolveCommit(commitish, run) {
  try {
    const resolved = await run(
      "git",
      ["rev-parse", "--verify", `${commitish}^{commit}`],
      {},
    );
    const sha = resolved.stdout.trim();
    const described = await run(
      "git",
      ["show", "-s", "--format=%s", sha],
      {},
    );

    return { sha, subject: described.stdout.trim() };
  } catch (cause) {
    if (cause?.name === "AbortError") throw cause;
    throw new Error(
      `Unknown or ambiguous commit-ish "${commitish}". Verify that it names a local commit.`,
      { cause },
    );
  }
}

export function validateHostingManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Invalid Sites hosting manifest: expected a JSON object.");
  }

  if (manifest.project_id !== EXPECTED_PROJECT_ID) {
    throw new Error(
      `Invalid Sites hosting manifest: expected Sites project ${EXPECTED_PROJECT_ID}.`,
    );
  }

  if (manifest.d1 !== null || manifest.r2 !== null) {
    throw new Error(
      "Invalid Sites hosting manifest: this deployment helper does not support D1 or R2 bindings.",
    );
  }

  return { projectId: EXPECTED_PROJECT_ID };
}

function parseSemanticVersion(value) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match) return null;
  const prerelease = match[4]?.split(".") ?? null;
  if (prerelease?.some((identifier) => /^\d+$/.test(identifier) && /^0\d/.test(identifier))) {
    return null;
  }
  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease,
  };
}

function comparePrereleaseIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    const leftNumber = BigInt(left);
    const rightNumber = BigInt(right);
    return leftNumber < rightNumber ? -1 : leftNumber > rightNumber ? 1 : 0;
  }
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareSemanticVersions(left, right) {
  const leftVersion = parseSemanticVersion(left);
  const rightVersion = parseSemanticVersion(right);
  if (!leftVersion || !rightVersion) return leftVersion ? 1 : rightVersion ? -1 : 0;
  for (let index = 0; index < 3; index += 1) {
    if (leftVersion.numbers[index] !== rightVersion.numbers[index]) {
      return leftVersion.numbers[index] - rightVersion.numbers[index];
    }
  }
  if (!leftVersion.prerelease && rightVersion.prerelease) return 1;
  if (leftVersion.prerelease && !rightVersion.prerelease) return -1;
  const leftPrerelease = leftVersion.prerelease ?? [];
  const rightPrerelease = rightVersion.prerelease ?? [];
  for (let index = 0; index < Math.max(leftPrerelease.length, rightPrerelease.length); index += 1) {
    if (leftPrerelease[index] === undefined) return -1;
    if (rightPrerelease[index] === undefined) return 1;
    const precedence = comparePrereleaseIdentifiers(
      leftPrerelease[index],
      rightPrerelease[index],
    );
    if (precedence !== 0) return precedence;
  }
  return 0;
}

async function requireExecutableRegularFile(filePath) {
  let metadata;
  try {
    metadata = await lstat(filePath);
    await access(filePath, fsConstants.X_OK);
  } catch (cause) {
    throw new Error(`Sites package helper must be a regular executable file: ${filePath}`, {
      cause,
    });
  }
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Sites package helper must be a regular executable file: ${filePath}`);
  }
  return filePath;
}

export async function resolveSitesPackageScript({ env = process.env } = {}) {
  if (env.SITES_PACKAGE_SCRIPT) {
    return requireExecutableRegularFile(path.resolve(env.SITES_PACKAGE_SCRIPT));
  }

  const home = env.CODEX_HOME
    ? path.resolve(env.CODEX_HOME)
    : path.join(env.HOME ? path.resolve(env.HOME) : homedir(), ".codex");
  const sitesRoot = path.join(home, "plugins", "cache", "openai-bundled", "sites");
  let entries;
  try {
    entries = await readdir(sitesRoot, { withFileTypes: true });
  } catch (cause) {
    throw new Error(
      `No bundled Sites package helper found under ${sitesRoot}. Install the Sites plugin or set SITES_PACKAGE_SCRIPT.`,
      { cause },
    );
  }
  const versions = entries
    .filter((entry) => entry.isDirectory() && parseSemanticVersion(entry.name))
    .map((entry) => entry.name)
    .sort(compareSemanticVersions)
    .reverse();
  const newestVersion = versions[0];
  if (!newestVersion) {
    throw new Error(
      `No semantic-versioned Sites package helper found under ${sitesRoot}. Install the Sites plugin or set SITES_PACKAGE_SCRIPT.`,
    );
  }
  return requireExecutableRegularFile(
    path.join(sitesRoot, newestVersion, "scripts", "package-site.sh"),
  );
}

function makeMarker(repository, createdAt) {
  return {
    version: MARKER_VERSION,
    repository,
    pid: process.pid,
    created_at: createdAt,
  };
}

function isValidMarker(marker) {
  return (
    marker &&
    marker.version === MARKER_VERSION &&
    typeof marker.repository === "string" &&
    Number.isSafeInteger(marker.pid) &&
    marker.pid > 0 &&
    typeof marker.created_at === "string"
  );
}

async function readMarker(directory, markerName) {
  try {
    return JSON.parse(await readFile(path.join(directory, markerName), "utf8"));
  } catch {
    return null;
  }
}

async function scanPrefixedDirectories(parent, prefix) {
  try {
    return (await readdir(parent, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
      .map((entry) => path.join(parent, entry.name));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

async function pruneMarkedDirectory({
  directory,
  markerName,
  repository,
  dependencies,
  beforeRemove,
}) {
  const marker = await readMarker(directory, markerName);
  if (
    isValidMarker(marker) &&
    marker.repository === repository &&
    !dependencies.isProcessAlive(marker.pid)
  ) {
    await beforeRemove?.(directory);
    await rm(directory, { recursive: true, force: true });
    return true;
  }
  dependencies.warn(`Preserving unverified or active Sites temporary directory: ${directory}`);
  return false;
}

function listedWorktreePaths(output) {
  return output
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => path.resolve(line.slice("worktree ".length)));
}

async function canonicalPath(filePath) {
  try {
    return await realpath(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return path.resolve(filePath);
    throw error;
  }
}

async function pathExists(filePath) {
  try {
    await lstat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function removeRegisteredMarkedWorktree({
  markedParent,
  repository,
  signal,
  dependencies,
}) {
  const worktree = path.join(markedParent, "worktree");
  const listed = await dependencies.run("git", ["worktree", "list", "--porcelain"], {
    cwd: repository,
    signal,
  });
  const targetWorktree = await canonicalPath(worktree);
  const registeredWorktrees = await Promise.all(
    listedWorktreePaths(listed.stdout).map(canonicalPath),
  );
  if (!registeredWorktrees.includes(targetWorktree)) return;
  try {
    await dependencies.run("git", ["worktree", "remove", "--force", worktree], {
      cwd: repository,
      signal,
    });
  } catch (cause) {
    if (await pathExists(worktree)) {
      throw new Error(`Could not remove registered abandoned Git worktree: ${worktree}`, {
        cause,
      });
    }
  }
}

async function pruneOrphanState({ repository, outputRoot, signal, dependencies }) {
  await dependencies.run("git", ["worktree", "prune"], {
    cwd: repository,
    signal,
  });

  const worktreeDirectories = await scanPrefixedDirectories(
    dependencies.temporaryRoot,
    WORKTREE_PREFIX,
  );
  for (const directory of worktreeDirectories) {
    await pruneMarkedDirectory({
      directory,
      markerName: WORKTREE_MARKER,
      repository,
      dependencies,
      beforeRemove: (markedParent) =>
        removeRegisteredMarkedWorktree({
          markedParent,
          repository,
          signal,
          dependencies,
        }),
    });
  }

  const sitesOutput = path.join(outputRoot, "sites");
  let commitDirectories = [];
  try {
    commitDirectories = (await readdir(sitesOutput, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(sitesOutput, entry.name));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  for (const commitDirectory of commitDirectories) {
    const artifactDirectories = await scanPrefixedDirectories(
      commitDirectory,
      ARTIFACT_PREFIX,
    );
    for (const directory of artifactDirectories) {
      await pruneMarkedDirectory({
        directory,
        markerName: ARTIFACT_MARKER,
        repository,
        dependencies,
      });
    }
  }
}

async function writeJsonFlushed(filePath, value) {
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeOwnedTemporary(directory, markerName, repository) {
  if (!directory) return;
  const marker = await readMarker(directory, markerName);
  if (
    isValidMarker(marker) &&
    marker.repository === repository &&
    marker.pid === process.pid
  ) {
    await rm(directory, { recursive: true, force: true });
  }
}

function attemptTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

async function createArtifactAttempt({
  commitOutput,
  repository,
  createdAt,
  dependencies,
}) {
  for (let count = 0; count < 10; count += 1) {
    const suffix = dependencies.randomBytes(4).toString("hex");
    const attemptName = `${attemptTimestamp(new Date(createdAt))}-${suffix}`;
    const finalDirectory = path.join(commitOutput, attemptName);
    const temporaryDirectory = path.join(commitOutput, `${ARTIFACT_PREFIX}${attemptName}`);
    try {
      await mkdir(temporaryDirectory);
      await writeFile(
        path.join(temporaryDirectory, ARTIFACT_MARKER),
        `${JSON.stringify(makeMarker(repository, createdAt), null, 2)}\n`,
      );
      return { finalDirectory, temporaryDirectory };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
  }
  throw new Error("Could not allocate a unique Sites deployment attempt directory.");
}

export async function prepareSitesDeployment({
  commitish = "HEAD",
  repoRoot = process.cwd(),
  outputRoot = repoRoot ? path.join(repoRoot, "output") : undefined,
  env = process.env,
  signal,
  dependencies: overrides = defaultDependencies,
}) {
  if (!repoRoot) throw new Error("repoRoot is required to prepare a Sites deployment.");
  if (!outputRoot) throw new Error("outputRoot is required to prepare a Sites deployment.");
  const dependencies = { ...defaultDependencies, ...overrides };
  const repository = await realpath(repoRoot);
  const absoluteOutputRoot = path.resolve(outputRoot);
  const cleanupController = new AbortController();
  let worktreeParent;
  let worktree;
  let worktreeAdded = false;
  let temporaryAttempt;
  let primaryError;

  try {
    await pruneOrphanState({
      repository,
      outputRoot: absoluteOutputRoot,
      signal,
      dependencies,
    });

    const runInRepository = (command, args, options = {}) =>
      dependencies.run(command, args, {
        cwd: repository,
        signal,
        ...options,
      });
    const { sha, subject } = await resolveCommit(commitish, runInRepository);
    const status = await runInRepository("git", ["status", "--porcelain"], {});
    if (status.stdout.trim()) {
      dependencies.warn(
        "The original worktree is dirty; uncommitted files are excluded from this deployment preparation.",
      );
    }

    const createdAt = dependencies.now().toISOString();
    await mkdir(dependencies.temporaryRoot, { recursive: true });
    worktreeParent = await mkdtemp(path.join(dependencies.temporaryRoot, WORKTREE_PREFIX));
    await writeFile(
      path.join(worktreeParent, WORKTREE_MARKER),
      `${JSON.stringify(makeMarker(repository, createdAt), null, 2)}\n`,
    );
    worktree = path.join(worktreeParent, "worktree");
    worktreeAdded = true;
    await runInRepository("git", ["worktree", "add", "--detach", worktree, sha], {});

    let manifest;
    try {
      manifest = JSON.parse(
        await readFile(path.join(worktree, ".openai", "hosting.json"), "utf8"),
      );
    } catch (cause) {
      throw new Error(`Commit ${sha} does not contain a readable .openai/hosting.json.`, {
        cause,
      });
    }
    const { projectId } = validateHostingManifest(manifest);

    for (const args of [
      ["ci"],
      ["run", "lint"],
      ["run", "test:unit"],
      ["run", "build"],
    ]) {
      await dependencies.run("npm", args, {
        cwd: worktree,
        env,
        signal,
      });
    }

    const packageScript = await resolveSitesPackageScript({ env });
    const commitOutput = path.join(absoluteOutputRoot, "sites", sha);
    await mkdir(commitOutput, { recursive: true });
    const attempt = await createArtifactAttempt({
      commitOutput,
      repository,
      createdAt,
      dependencies,
    });
    temporaryAttempt = attempt.temporaryDirectory;
    const temporaryArchive = path.join(temporaryAttempt, "site.tar.gz");
    const finalArchive = path.join(attempt.finalDirectory, "site.tar.gz");
    const finalRequest = path.join(attempt.finalDirectory, "request.json");

    await dependencies.run(packageScript, [worktree, temporaryArchive], {
      cwd: repository,
      env,
      signal,
    });
    const archiveMetadata = await lstat(temporaryArchive);
    if (!archiveMetadata.isFile() || archiveMetadata.isSymbolicLink()) {
      throw new Error(`Sites package helper did not create a regular non-symlink archive: ${temporaryArchive}`);
    }
    const archiveSha256 = createHash("sha256")
      .update(await readFile(temporaryArchive))
      .digest("hex");
    await writeJsonFlushed(path.join(temporaryAttempt, "request.json"), {
      schema_version: 1,
      project_id: projectId,
      target_sha: sha,
      subject,
      archive_path: finalArchive,
      archive_sha256: archiveSha256,
      created_at: createdAt,
    });
    await dependencies.rename(temporaryAttempt, attempt.finalDirectory);
    temporaryAttempt = undefined;
    await rm(path.join(attempt.finalDirectory, ARTIFACT_MARKER));

    return {
      requestPath: finalRequest,
      archivePath: finalArchive,
      sha,
      subject,
    };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    let cleanupFailure;
    let worktreeRemovalFailed = false;
    const recordCleanupFailure = (message, error) => {
      cleanupFailure ??= error;
      dependencies.warn(`${message}: ${error.message}`);
    };
    if (temporaryAttempt) {
      try {
        await removeOwnedTemporary(temporaryAttempt, ARTIFACT_MARKER, repository);
      } catch (cleanupError) {
        recordCleanupFailure("Could not remove incomplete Sites artifact", cleanupError);
      }
    }
    if (worktreeAdded) {
      try {
        await dependencies.run("git", ["worktree", "remove", "--force", worktree], {
          cwd: repository,
          signal: cleanupController.signal,
        });
      } catch (cleanupError) {
        worktreeRemovalFailed = true;
        recordCleanupFailure("Could not remove temporary Git worktree", cleanupError);
      }
    }
    try {
      await dependencies.run("git", ["worktree", "prune"], {
        cwd: repository,
        signal: cleanupController.signal,
      });
    } catch (cleanupError) {
      recordCleanupFailure("Could not prune Git worktrees", cleanupError);
    }
    if (!worktreeRemovalFailed) {
      try {
        await removeOwnedTemporary(worktreeParent, WORKTREE_MARKER, repository);
      } catch (cleanupError) {
        recordCleanupFailure("Could not remove Sites preparation directory", cleanupError);
      }
    }
    if (!primaryError && cleanupFailure) throw cleanupFailure;
  }
}
