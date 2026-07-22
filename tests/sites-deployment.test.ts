import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { EventEmitter, once as onceEvent } from "node:events";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { afterEach, describe, expect, test, vi } from "vitest";

import {
  defaultDependencies,
  EXPECTED_PROJECT_ID,
  prepareSitesDeployment,
  resolveCommit,
  resolveSitesPackageScript,
  TERMINATION_GRACE_MS,
  terminateChildTree,
  validateHostingManifest,
} from "../scripts/sites-deployment.mjs";
import { runCli } from "../scripts/prepare-sites-deployment.mjs";

const FULL_SHA = "0123456789abcdef0123456789abcdef01234567";
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "mewtuals-sites-test-"));
  temporaryDirectories.push(root);
  const repoRoot = path.join(root, "repo");
  const outputRoot = path.join(root, "output");
  const temporaryRoot = path.join(root, "os-temp");
  const packageScript = path.join(root, "package-site.sh");
  await Promise.all([
    mkdir(repoRoot, { recursive: true }),
    mkdir(outputRoot, { recursive: true }),
    mkdir(temporaryRoot, { recursive: true }),
  ]);
  await writeFile(
    path.join(repoRoot, ".openai-hosting-fixture.json"),
    JSON.stringify({
      project_id: EXPECTED_PROJECT_ID,
      d1: null,
      r2: null,
    }),
  );
  await writeFile(packageScript, "#!/bin/sh\n");
  await chmod(packageScript, 0o755);
  return { root, repoRoot, outputRoot, temporaryRoot, packageScript };
}

function createPreparationRunner({
  repoRoot,
  archiveBytes = "sites archive",
  dirty = false,
  failCommand,
}: {
  repoRoot: string;
  archiveBytes?: string;
  dirty?: boolean;
  failCommand?: string;
}) {
  const calls: Array<{ command: string; args: string[]; options: Record<string, unknown> }> = [];
  const run = vi.fn(async (command: string, args: string[], options: Record<string, unknown> = {}) => {
    calls.push({ command, args, options });
    const commandLabel = [command, ...args].join(" ");
    if (failCommand && commandLabel.includes(failCommand)) {
      throw new Error(`${failCommand} failed`);
    }
    if (command === "git" && args[0] === "rev-parse") return { stdout: `${FULL_SHA}\n` };
    if (command === "git" && args[0] === "show") return { stdout: "feat: exact release\n" };
    if (command === "git" && args[0] === "status") {
      return { stdout: dirty ? " M app/page.tsx\n" : "" };
    }
    if (command === "git" && args[0] === "worktree" && args[1] === "add") {
      const worktree = args[args.length - 2];
      await mkdir(path.join(worktree, ".openai"), { recursive: true });
      const manifest = await readFile(
        path.join(repoRoot, ".openai-hosting-fixture.json"),
      );
      await writeFile(path.join(worktree, ".openai", "hosting.json"), manifest);
      return { stdout: "" };
    }
    if (command.endsWith("package-site.sh")) {
      await writeFile(args[1], archiveBytes);
    }
    return { stdout: "" };
  });
  return { run, calls };
}

async function waitForFile(filePath: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      await readFile(filePath);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await delay(10);
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForJsonFile(filePath: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      return JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code !== "ENOENT" &&
        !(error instanceof SyntaxError)
      ) {
        throw error;
      }
      await delay(10);
    }
  }
  throw new Error(`Timed out waiting for valid JSON in ${filePath}`);
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

async function waitForProcessesToExit(pids: number[]) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (pids.every((pid) => !processIsAlive(pid))) return;
    await delay(10);
  }
  throw new Error(`Processes remained alive: ${pids.filter(processIsAlive).join(", ")}`);
}

describe("Sites deployment target", () => {
  test.each([
    ["HEAD", "HEAD"],
    ["full SHA", FULL_SHA],
    ["tag", "website-v1"],
    ["branch", "release/website-v3"],
  ])("resolves a %s to an exact commit and subject", async (_kind, commitish) => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ stdout: `${FULL_SHA}\n` })
      .mockResolvedValueOnce({ stdout: "feat: current release\n" });

    await expect(resolveCommit(commitish, run)).resolves.toEqual({
      sha: FULL_SHA,
      subject: "feat: current release",
    });
    expect(run).toHaveBeenNthCalledWith(
      1,
      "git",
      ["rev-parse", "--verify", `${commitish}^{commit}`],
      expect.any(Object),
    );
    expect(run).toHaveBeenNthCalledWith(
      2,
      "git",
      ["show", "-s", "--format=%s", FULL_SHA],
      expect.any(Object),
    );
  });

  test("turns an unknown or ambiguous commit into an actionable error with its cause", async () => {
    const cause = new Error("fatal: ambiguous argument");
    const run = vi.fn().mockRejectedValue(cause);

    await expect(resolveCommit("missing", run)).rejects.toMatchObject({
      message: expect.stringMatching(/Unknown or ambiguous commit-ish "missing"/),
      cause,
    });
  });
});

describe("Sites hosting manifest", () => {
  test("accepts the existing unbound Sites project", () => {
    expect(
      validateHostingManifest({
        project_id: EXPECTED_PROJECT_ID,
        d1: null,
        r2: null,
      }),
    ).toEqual({ projectId: EXPECTED_PROJECT_ID });
  });

  test("rejects the wrong Sites project", () => {
    expect(() =>
      validateHostingManifest({ project_id: "wrong", d1: null, r2: null }),
    ).toThrow(/expected Sites project/);
  });

  test.each([
    { d1: { database_name: "unexpected" }, r2: null },
    { d1: null, r2: { bucket_name: "unexpected" } },
  ])("rejects bound D1 or R2 manifests: %j", ({ d1, r2 }) => {
    expect(() =>
      validateHostingManifest({ project_id: EXPECTED_PROJECT_ID, d1, r2 }),
    ).toThrow(/does not support D1 or R2 bindings/);
  });
});

describe("child-tree cancellation", () => {
  test("uses taskkill without a shell for Windows child trees", async () => {
    const taskkill = new EventEmitter();
    const spawnProcess = vi.fn(() => taskkill);
    const child = { kill: vi.fn() };
    const terminated = terminateChildTree({
      platform: "win32",
      pid: 4321,
      child,
      spawnProcess,
    });
    queueMicrotask(() => taskkill.emit("close", 0));

    await expect(terminated).resolves.toBeUndefined();
    expect(spawnProcess).toHaveBeenCalledWith(
      "taskkill",
      ["/PID", "4321", "/T", "/F"],
      expect.objectContaining({ shell: false }),
    );
    expect(child.kill).not.toHaveBeenCalled();
  });

  test("cooperative POSIX cancellation clears escalation without waiting the grace", async () => {
    const child = new EventEmitter();
    const killProcess = vi.fn();
    const scheduled: Array<() => void> = [];
    const clearTimer = vi.fn();
    const terminated = terminateChildTree({
      platform: "darwin",
      pid: 4321,
      child,
      killProcess,
      setTimer: (callback: () => void) => {
        scheduled.push(callback);
        return { unref: vi.fn() };
      },
      clearTimer,
    });
    child.emit("close", 0);

    await expect(terminated).resolves.toBeUndefined();
    expect(TERMINATION_GRACE_MS).toBeGreaterThan(0);
    expect(killProcess).toHaveBeenCalledTimes(1);
    expect(killProcess).toHaveBeenCalledWith(-4321, "SIGTERM");
    expect(clearTimer).toHaveBeenCalledTimes(1);
    expect(scheduled).toHaveLength(1);
  });

  test("uncooperative POSIX cancellation escalates the process group to SIGKILL", async () => {
    const child = new EventEmitter();
    const killProcess = vi.fn();
    let escalate: (() => void) | undefined;
    const terminated = terminateChildTree({
      platform: "linux",
      pid: 9876,
      child,
      killProcess,
      setTimer: (callback: () => void) => {
        escalate = callback;
        return { unref: vi.fn() };
      },
      clearTimer: vi.fn(),
    });
    escalate?.();

    await expect(terminated).resolves.toBeUndefined();
    expect(killProcess).toHaveBeenNthCalledWith(1, -9876, "SIGTERM");
    expect(killProcess).toHaveBeenNthCalledWith(2, -9876, "SIGKILL");
  });

  test("falls back to killing the direct Windows child when taskkill fails", async () => {
    const taskkill = new EventEmitter();
    const child = { kill: vi.fn() };
    const terminated = terminateChildTree({
      platform: "win32",
      pid: 4321,
      child,
      spawnProcess: () => taskkill,
    });
    queueMicrotask(() => taskkill.emit("error", new Error("taskkill missing")));

    await expect(terminated).resolves.toBeUndefined();
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  test.skipIf(process.platform === "win32")(
    "default runner abort kills its POSIX child and grandchild process group",
    async () => {
      const fixture = await createFixture();
      const readyPath = path.join(fixture.root, "process-tree.json");
      const fixtureScript = path.join(
        process.cwd(),
        "tests/fixtures/sites-deployment-process-tree-child.mjs",
      );
      const controller = new AbortController();
      const running = defaultDependencies.run(
        process.execPath,
        [fixtureScript, readyPath],
        { signal: controller.signal },
      );
      const pids = (await waitForJsonFile(readyPath)) as number[];
      expect(pids).toHaveLength(2);
      expect(pids.every(processIsAlive)).toBe(true);

      controller.abort();
      await expect(running).rejects.toMatchObject({ name: "AbortError" });
      try {
        await waitForProcessesToExit(pids);
      } finally {
        for (const pid of pids) {
          if (processIsAlive(pid)) {
            try {
              process.kill(pid, "SIGKILL");
            } catch {}
          }
        }
      }
    },
  );

  test.skipIf(process.platform === "win32")(
    "uncooperative real child tree is killed and deployment cleanup proceeds",
    async () => {
      const fixture = await createFixture();
      const readyPath = path.join(fixture.root, "uncooperative-tree.json");
      const fixtureScript = path.join(
        process.cwd(),
        "tests/fixtures/sites-deployment-uncooperative-tree-child.mjs",
      );
      const controller = new AbortController();
      const base = createPreparationRunner({ repoRoot: fixture.repoRoot });
      const run = vi.fn(
        (command: string, args: string[], options: Record<string, unknown>) => {
          if (command === "npm" && args.join(" ") === "run lint") {
            return defaultDependencies.run(
              process.execPath,
              [fixtureScript, readyPath],
              { signal: options.signal as AbortSignal },
            );
          }
          return base.run(command, args, options);
        },
      );
      const preparing = prepareSitesDeployment({
        repoRoot: fixture.repoRoot,
        outputRoot: fixture.outputRoot,
        env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
        signal: controller.signal,
        dependencies: { run, temporaryRoot: fixture.temporaryRoot },
      });
      const pids = (await waitForJsonFile(readyPath)) as number[];
      const startedAt = Date.now();
      const safetyKill = setTimeout(() => {
        try {
          process.kill(-pids[0], "SIGKILL");
        } catch {}
      }, 2_500);
      controller.abort();

      try {
        await expect(preparing).rejects.toMatchObject({ name: "AbortError" });
        expect(Date.now() - startedAt).toBeLessThan(2_000);
        await waitForProcessesToExit(pids);
        expect(
          base.calls.some(
            ({ command, args }) =>
              command === "git" && args.slice(0, 3).join(" ") === "worktree remove --force",
          ),
        ).toBe(true);
      } finally {
        clearTimeout(safetyKill);
        for (const pid of pids) {
          if (processIsAlive(pid)) {
            try {
              process.kill(pid, "SIGKILL");
            } catch {}
          }
        }
      }
    },
    10_000,
  );
});

describe("Sites package helper selection", () => {
  test("prefers the explicit override", async () => {
    const fixture = await createFixture();
    await expect(
      resolveSitesPackageScript({
        env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
      }),
    ).resolves.toBe(fixture.packageScript);
  });

  test("uses HOME/.codex and selects the newest semantic Sites version", async () => {
    const fixture = await createFixture();
    const codexHome = path.join(fixture.root, "home", ".codex");
    for (const version of ["0.9.9", "0.10.0", "0.2.20", "not-a-version"]) {
      const helper = path.join(
        codexHome,
        "plugins/cache/openai-bundled/sites",
        version,
        "scripts/package-site.sh",
      );
      await mkdir(path.dirname(helper), { recursive: true });
      await writeFile(helper, "#!/bin/sh\n");
      await chmod(helper, 0o755);
    }

    await expect(
      resolveSitesPackageScript({ env: { HOME: path.join(fixture.root, "home") } }),
    ).resolves.toBe(
      path.join(
        codexHome,
        "plugins/cache/openai-bundled/sites/0.10.0/scripts/package-site.sh",
      ),
    );
  });

  test("rejects a non-executable helper", async () => {
    const fixture = await createFixture();
    await chmod(fixture.packageScript, 0o644);

    await expect(
      resolveSitesPackageScript({
        env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
      }),
    ).rejects.toThrow(/regular executable file/);
  });

  test("does not silently fall back when the newest installed helper is invalid", async () => {
    const fixture = await createFixture();
    const codexHome = path.join(fixture.root, "codex-home");
    for (const [version, mode] of [
      ["1.9.0", 0o755],
      ["1.10.0", 0o644],
    ] as const) {
      const helper = path.join(
        codexHome,
        "plugins/cache/openai-bundled/sites",
        version,
        "scripts/package-site.sh",
      );
      await mkdir(path.dirname(helper), { recursive: true });
      await writeFile(helper, "#!/bin/sh\n");
      await chmod(helper, mode);
    }

    await expect(
      resolveSitesPackageScript({ env: { CODEX_HOME: codexHome } }),
    ).rejects.toThrow(/regular executable file/);
  });

  test("orders numeric prerelease identifiers by SemVer precedence", async () => {
    const fixture = await createFixture();
    const codexHome = path.join(fixture.root, "codex-home");
    for (const version of ["2.0.0-rc.2", "2.0.0-rc.10"]) {
      const helper = path.join(
        codexHome,
        "plugins/cache/openai-bundled/sites",
        version,
        "scripts/package-site.sh",
      );
      await mkdir(path.dirname(helper), { recursive: true });
      await writeFile(helper, "#!/bin/sh\n");
      await chmod(helper, 0o755);
    }

    await expect(
      resolveSitesPackageScript({ env: { CODEX_HOME: codexHome } }),
    ).resolves.toContain("/2.0.0-rc.10/scripts/package-site.sh");
  });

  test("accepts build metadata and ignores it for SemVer precedence", async () => {
    const fixture = await createFixture();
    const codexHome = path.join(fixture.root, "codex-home");
    for (const version of ["2.0.0-rc.99", "2.0.0+installed.7"]) {
      const helper = path.join(
        codexHome,
        "plugins/cache/openai-bundled/sites",
        version,
        "scripts/package-site.sh",
      );
      await mkdir(path.dirname(helper), { recursive: true });
      await writeFile(helper, "#!/bin/sh\n");
      await chmod(helper, 0o755);
    }

    await expect(
      resolveSitesPackageScript({ env: { CODEX_HOME: codexHome } }),
    ).resolves.toContain("/2.0.0+installed.7/scripts/package-site.sh");
  });
});

describe("Sites deployment preparation", () => {
  test("builds the exact detached commit in order and atomically publishes a complete request", async () => {
    const fixture = await createFixture();
    const warning = vi.fn();
    const { run, calls } = createPreparationRunner({
      repoRoot: fixture.repoRoot,
      dirty: true,
    });
    const renameCalls: Array<[string, string]> = [];
    const result = await prepareSitesDeployment({
      repoRoot: fixture.repoRoot,
      outputRoot: fixture.outputRoot,
      env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
      dependencies: {
        run,
        warn: warning,
        temporaryRoot: fixture.temporaryRoot,
        now: () => new Date("2026-07-20T10:20:30.000Z"),
        randomBytes: () => Buffer.from("a1b2c3d4", "hex"),
        rename: async (source: string, destination: string) => {
          await expect(
            readFile(path.join(source, ".mewtuals-sites-artifact.json"), "utf8"),
          ).resolves.toContain(`"repository"`);
          renameCalls.push([source, destination]);
          await rename(source, destination);
        },
      },
    });

    expect(warning).toHaveBeenCalledWith(expect.stringMatching(/dirty.*excluded/i));
    expect(
      calls.some(
        ({ command, args }) =>
          command === "git" &&
          args[0] === "worktree" &&
          args[1] === "add" &&
          args.includes("--detach") &&
          args.at(-1) === FULL_SHA,
      ),
    ).toBe(true);
    const lifecycle = calls
      .filter(({ command, args }) => command === "npm" || command.endsWith("package-site.sh") || args[1] === "add")
      .map(({ command, args }) =>
        command.endsWith("package-site.sh") ? "package" : [command, ...args.slice(0, 2)].join(" "),
      );
    expect(lifecycle).toEqual([
      "git worktree add",
      "npm ci",
      "npm run lint",
      "npm run test:unit",
      "npm run build",
      "package",
    ]);
    const packageCall = calls.find(({ command }) => command === fixture.packageScript);
    expect(packageCall?.args).toEqual([
      expect.stringContaining("mewtuals-sites-preparation-"),
      expect.stringMatching(/\.mewtuals-sites-artifact-.*\/site\.tar\.gz$/),
    ]);
    expect(renameCalls).toHaveLength(1);
    expect(result.sha).toBe(FULL_SHA);
    expect(path.isAbsolute(result.requestPath)).toBe(true);
    expect(path.isAbsolute(result.archivePath)).toBe(true);
    expect(path.dirname(result.requestPath)).toBe(path.dirname(result.archivePath));
    expect(path.dirname(result.requestPath)).toMatch(
      new RegExp(`/sites/${FULL_SHA}/2026-07-20T10-20-30-000Z-a1b2c3d4$`),
    );

    const request = JSON.parse(await readFile(result.requestPath, "utf8"));
    expect(request).toEqual({
      schema_version: 1,
      project_id: EXPECTED_PROJECT_ID,
      target_sha: FULL_SHA,
      subject: "feat: exact release",
      archive_path: result.archivePath,
      archive_sha256: createHash("sha256").update("sites archive").digest("hex"),
      created_at: "2026-07-20T10:20:30.000Z",
    });
    const attemptEntries = await readdir(path.dirname(result.requestPath));
    expect(attemptEntries.sort()).toEqual(["request.json", "site.tar.gz"]);
    expect(
      calls.every(({ options }) => "signal" in options),
    ).toBe(true);
  });

  test("creates a distinct attempt for repeated preparations of the same commit", async () => {
    const fixture = await createFixture();
    let suffix = 0;
    const prepare = async () => {
      suffix += 1;
      const { run } = createPreparationRunner({ repoRoot: fixture.repoRoot });
      return prepareSitesDeployment({
        repoRoot: fixture.repoRoot,
        outputRoot: fixture.outputRoot,
        env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
        dependencies: {
          run,
          temporaryRoot: fixture.temporaryRoot,
          now: () => new Date("2026-07-20T10:20:30.000Z"),
          randomBytes: () => Buffer.from(`0000000${suffix}`, "hex"),
        },
      });
    };

    const first = await prepare();
    const second = await prepare();
    expect(path.dirname(first.requestPath)).not.toBe(path.dirname(second.requestPath));
    await expect(readFile(first.requestPath, "utf8")).resolves.toContain(FULL_SHA);
    await expect(readFile(second.requestPath, "utf8")).resolves.toContain(FULL_SHA);
  });

  test("prunes only dead same-repository marked temporary state", async () => {
    const fixture = await createFixture();
    const repository = await realpath(fixture.repoRoot);
    const deadWorktree = path.join(fixture.temporaryRoot, "mewtuals-sites-preparation-dead");
    const activeWorktree = path.join(fixture.temporaryRoot, "mewtuals-sites-preparation-active");
    const unmarkedWorktree = path.join(fixture.temporaryRoot, "mewtuals-sites-preparation-unmarked");
    const malformedWorktree = path.join(fixture.temporaryRoot, "mewtuals-sites-preparation-malformed");
    const artifactParent = path.join(fixture.outputRoot, "sites", FULL_SHA);
    const deadArtifact = path.join(artifactParent, ".mewtuals-sites-artifact-dead");
    const foreignArtifact = path.join(artifactParent, ".mewtuals-sites-artifact-foreign");
    const marker = (pid: number, markerRepository = repository) =>
      JSON.stringify({ version: 1, repository: markerRepository, pid, created_at: new Date().toISOString() });
    await Promise.all([
      mkdir(deadWorktree, { recursive: true }),
      mkdir(activeWorktree, { recursive: true }),
      mkdir(unmarkedWorktree, { recursive: true }),
      mkdir(malformedWorktree, { recursive: true }),
      mkdir(deadArtifact, { recursive: true }),
      mkdir(foreignArtifact, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(deadWorktree, ".mewtuals-sites-preparation.json"), marker(999_991)),
      writeFile(path.join(activeWorktree, ".mewtuals-sites-preparation.json"), marker(process.pid)),
      writeFile(path.join(malformedWorktree, ".mewtuals-sites-preparation.json"), "{malformed"),
      writeFile(path.join(deadArtifact, ".mewtuals-sites-artifact.json"), marker(999_992)),
      writeFile(path.join(foreignArtifact, ".mewtuals-sites-artifact.json"), marker(999_993, "/foreign/repo")),
    ]);
    const warning = vi.fn();
    const { run } = createPreparationRunner({ repoRoot: fixture.repoRoot });

    await prepareSitesDeployment({
      repoRoot: fixture.repoRoot,
      outputRoot: fixture.outputRoot,
      env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
      dependencies: {
        run,
        warn: warning,
        temporaryRoot: fixture.temporaryRoot,
      },
    });

    await expect(readFile(path.join(deadWorktree, ".mewtuals-sites-preparation.json"))).rejects.toThrow();
    await expect(readFile(path.join(deadArtifact, ".mewtuals-sites-artifact.json"))).rejects.toThrow();
    await expect(readFile(path.join(activeWorktree, ".mewtuals-sites-preparation.json"))).resolves.toBeTruthy();
    expect(await readdir(unmarkedWorktree)).toEqual([]);
    await expect(
      readFile(
        path.join(malformedWorktree, ".mewtuals-sites-preparation.json"),
        "utf8",
      ),
    ).resolves.toBe("{malformed");
    await expect(readFile(path.join(foreignArtifact, ".mewtuals-sites-artifact.json"))).resolves.toBeTruthy();
    expect(warning).toHaveBeenCalledWith(expect.stringMatching(/preserv/i));
  });

  test("removes only the exact registered marked worktree without expire-now pruning", async () => {
    const fixture = await createFixture();
    await defaultDependencies.run("git", ["init"], { cwd: fixture.repoRoot });
    await defaultDependencies.run("git", ["add", "."], { cwd: fixture.repoRoot });
    await defaultDependencies.run(
      "git",
      [
        "-c",
        "user.name=Sites Test",
        "-c",
        "user.email=sites@example.test",
        "commit",
        "-m",
        "fixture",
      ],
      { cwd: fixture.repoRoot },
    );
    const repository = await realpath(fixture.repoRoot);
    const unrelatedWorktree = path.join(fixture.root, "unrelated-missing-worktree");
    await defaultDependencies.run(
      "git",
      ["worktree", "add", "--detach", unrelatedWorktree, "HEAD"],
      { cwd: repository },
    );
    await rm(unrelatedWorktree, { recursive: true, force: true });
    const markedParent = path.join(
      fixture.temporaryRoot,
      "mewtuals-sites-preparation-real-git",
    );
    const registeredWorktree = path.join(markedParent, "worktree");
    await mkdir(markedParent, { recursive: true });
    await defaultDependencies.run(
      "git",
      ["worktree", "add", "--detach", registeredWorktree, "HEAD"],
      { cwd: repository },
    );
    await writeFile(
      path.join(markedParent, ".mewtuals-sites-preparation.json"),
      JSON.stringify({
        version: 1,
        repository,
        pid: 999_994,
        created_at: "2026-07-20T00:00:00.000Z",
      }),
    );
    const calls: Array<{ command: string; args: string[] }> = [];
    const run = async (command: string, args: string[], options: Record<string, unknown>) => {
      calls.push({ command, args });
      if (command === "git" && args[0] === "rev-parse") {
        throw new Error("missing target");
      }
      return defaultDependencies.run(command, args, options);
    };

    await expect(
      prepareSitesDeployment({
        commitish: "missing",
        repoRoot: repository,
        outputRoot: fixture.outputRoot,
        dependencies: {
          run,
          temporaryRoot: fixture.temporaryRoot,
        },
      }),
    ).rejects.toThrow(/Unknown or ambiguous/);
    await expect(readdir(markedParent)).rejects.toThrow();
    const worktreeList = await defaultDependencies.run(
      "git",
      ["worktree", "list", "--porcelain"],
      { cwd: repository },
    );
    expect(worktreeList.stdout).not.toContain(registeredWorktree);
    expect(calls).toContainEqual({
      command: "git",
      args: ["worktree", "remove", "--force", registeredWorktree],
    });
    expect(calls.some(({ args }) => args.includes("--expire"))).toBe(false);
    const forcedRemovals = calls.filter(
      ({ command, args }) =>
        command === "git" && args.slice(0, 3).join(" ") === "worktree remove --force",
    );
    expect(forcedRemovals).toEqual([
      {
        command: "git",
        args: ["worktree", "remove", "--force", registeredWorktree],
      },
    ]);
  });

  test("cleans up after a failed child while preserving the primary error", async () => {
    const fixture = await createFixture();
    const primaryError = "npm run lint failed";
    const { run, calls } = createPreparationRunner({
      repoRoot: fixture.repoRoot,
      failCommand: "npm run lint",
    });

    await expect(
      prepareSitesDeployment({
        repoRoot: fixture.repoRoot,
        outputRoot: fixture.outputRoot,
        env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
        dependencies: { run, temporaryRoot: fixture.temporaryRoot },
      }),
    ).rejects.toThrow(primaryError);
    expect(
      calls.some(({ command, args }) =>
        command === "git" && args.slice(0, 3).join(" ") === "worktree remove --force",
      ),
    ).toBe(true);
    expect(
      calls.filter(({ command, args }) => command === "git" && args.join(" ") === "worktree prune"),
    ).toHaveLength(2);
    const outputSites = path.join(fixture.outputRoot, "sites", FULL_SHA);
    await expect(readdir(outputSites)).rejects.toThrow();
    expect((await readdir(fixture.temporaryRoot)).filter((entry) => entry.startsWith("mewtuals-sites-preparation-"))).toEqual([]);
  });

  test("attempts registered-worktree cleanup even when worktree creation reports failure", async () => {
    const fixture = await createFixture();
    const { run, calls } = createPreparationRunner({
      repoRoot: fixture.repoRoot,
      failCommand: "git worktree add",
    });

    await expect(
      prepareSitesDeployment({
        repoRoot: fixture.repoRoot,
        outputRoot: fixture.outputRoot,
        env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
        dependencies: { run, temporaryRoot: fixture.temporaryRoot },
      }),
    ).rejects.toThrow("git worktree add failed");
    expect(
      calls.some(({ command, args }) =>
        command === "git" && args.slice(0, 3).join(" ") === "worktree remove --force",
      ),
    ).toBe(true);
  });

  test("preserves a marked parent when cleanup removal fails and retries next invocation", async () => {
    const fixture = await createFixture();
    const { run, calls } = createPreparationRunner({
      repoRoot: fixture.repoRoot,
      failCommand: "git worktree remove",
    });

    await expect(
      prepareSitesDeployment({
        repoRoot: fixture.repoRoot,
        outputRoot: fixture.outputRoot,
        env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
        dependencies: { run, temporaryRoot: fixture.temporaryRoot },
      }),
    ).rejects.toThrow("git worktree remove failed");
    expect(
      calls.filter(({ command, args }) => command === "git" && args.join(" ") === "worktree prune"),
    ).toHaveLength(2);
    const preserved = (await readdir(fixture.temporaryRoot)).filter((entry) =>
      entry.startsWith("mewtuals-sites-preparation-"),
    );
    expect(preserved).toHaveLength(1);
    const preservedParent = path.join(fixture.temporaryRoot, preserved[0]);
    const markerPath = path.join(
      preservedParent,
      ".mewtuals-sites-preparation.json",
    );
    const marker = JSON.parse(await readFile(markerPath, "utf8"));
    await writeFile(markerPath, JSON.stringify({ ...marker, pid: 999_996 }));

    const retryBase = createPreparationRunner({ repoRoot: fixture.repoRoot });
    const retryRun = vi.fn(
      (command: string, args: string[], options: Record<string, unknown>) => {
        if (command === "git" && args.join(" ") === "worktree list --porcelain") {
          return Promise.resolve({
            stdout: `worktree ${path.join(preservedParent, "worktree")}\n`,
          });
        }
        return retryBase.run(command, args, options);
      },
    );
    await prepareSitesDeployment({
      repoRoot: fixture.repoRoot,
      outputRoot: fixture.outputRoot,
      env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
      dependencies: {
        run: retryRun,
        temporaryRoot: fixture.temporaryRoot,
      },
    });
    await expect(readdir(preservedParent)).rejects.toThrow();
    expect(retryRun).toHaveBeenCalledWith(
      "git",
      ["worktree", "remove", "--force", path.join(preservedParent, "worktree")],
      expect.any(Object),
    );
  });

  test("preserves the primary error and marked parent when cleanup also fails", async () => {
    const fixture = await createFixture();
    const base = createPreparationRunner({ repoRoot: fixture.repoRoot });
    const run = vi.fn(
      async (command: string, args: string[], options: Record<string, unknown>) => {
        const label = [command, ...args].join(" ");
        if (label.includes("npm run lint")) throw new Error("primary lint failure");
        if (label.includes("git worktree remove")) {
          throw new Error("secondary cleanup failure");
        }
        return base.run(command, args, options);
      },
    );

    await expect(
      prepareSitesDeployment({
        repoRoot: fixture.repoRoot,
        outputRoot: fixture.outputRoot,
        env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
        dependencies: { run, temporaryRoot: fixture.temporaryRoot },
      }),
    ).rejects.toThrow("primary lint failure");
    const preserved = (await readdir(fixture.temporaryRoot)).filter((entry) =>
      entry.startsWith("mewtuals-sites-preparation-"),
    );
    expect(preserved).toHaveLength(1);
    await expect(
      readFile(
        path.join(
          fixture.temporaryRoot,
          preserved[0],
          ".mewtuals-sites-preparation.json",
        ),
        "utf8",
      ),
    ).resolves.toContain(`"repository"`);
  });

  test("passes abort to the active child and still performs worktree cleanup", async () => {
    const fixture = await createFixture();
    const controller = new AbortController();
    const { run, calls } = createPreparationRunner({ repoRoot: fixture.repoRoot });
    const baseImplementation = run.getMockImplementation();
    run.mockImplementation(async (command, args, options) => {
      if (command === "npm" && args.join(" ") === "run lint") {
        controller.abort();
        throw new DOMException("The operation was aborted", "AbortError");
      }
      return baseImplementation?.(command, args, options);
    });

    await expect(
      prepareSitesDeployment({
        repoRoot: fixture.repoRoot,
        outputRoot: fixture.outputRoot,
        env: { SITES_PACKAGE_SCRIPT: fixture.packageScript },
        signal: controller.signal,
        dependencies: { run, temporaryRoot: fixture.temporaryRoot },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls.some(({ command, args }) => command === "git" && args.includes("remove"))).toBe(true);
    expect(calls.filter(({ options }) => options.signal === controller.signal).length).toBeGreaterThan(0);
  });
});

describe("Sites deployment CLI", () => {
  test("runbook pins rollback and production identity verification", async () => {
    const runbook = await readFile(
      path.join(process.cwd(), "docs/product-v1-operations.md"),
      "utf8",
    );
    const normalizedRunbook = runbook.replace(/\s+/g, " ");

    expect(normalizedRunbook).toContain("connector-reported live version");
    expect(normalizedRunbook).toContain("complete `drizzle/` path and blob-hash inventories");
    expect(normalizedRunbook).toContain("`/apply`");
    expect(normalizedRunbook).toContain("Put Mewtuals on your company’s side.");
    expect(normalizedRunbook).toContain("newly saved version and target SHA");
    expect(normalizedRunbook).toContain(
      "GitHub commit, Sites source head, saved Sites version, and production deployment",
    );
  });

  test("package.json exposes the preparation command", async () => {
    const packageJson = JSON.parse(
      await readFile(path.join(process.cwd(), "package.json"), "utf8"),
    );
    expect(packageJson.scripts["prepare:sites"]).toBe(
      "node scripts/prepare-sites-deployment.mjs",
    );
  });

  test.each([
    [[], "HEAD"],
    [["website-v3"], "website-v3"],
    [[FULL_SHA], FULL_SHA],
  ])("forwards argv %j as commit-ish %s", async (argv, commitish) => {
    const prepare = vi.fn().mockResolvedValue({
      sha: FULL_SHA,
      subject: "feat: release subject",
      requestPath: "/absolute/output/request.json",
    });
    const stdout = { write: vi.fn() };

    await expect(
      runCli({ prepare, argv, stdout, stderr: { write: vi.fn() } }),
    ).resolves.toBe(0);
    expect(prepare).toHaveBeenCalledWith({
      commitish,
      signal: expect.any(AbortSignal),
    });
    expect(stdout.write).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(
          `${FULL_SHA}.*feat: release subject.*\/absolute\/output\/request\\.json`,
          "s",
        ),
      ),
    );
  });

  test("rejects extra positional arguments with usage text", async () => {
    const prepare = vi.fn();
    const stderr = { write: vi.fn() };

    await expect(
      runCli({ prepare, argv: ["one", "two"], stdout: { write: vi.fn() }, stderr }),
    ).resolves.toBeGreaterThan(0);
    expect(prepare).not.toHaveBeenCalled();
    expect(stderr.write).toHaveBeenCalledWith(expect.stringMatching(/^Usage:/));
  });

  test("prints one bounded two-line diagnostic in a single write and returns nonzero", async () => {
    const stderr = { write: vi.fn() };
    const prepare = vi
      .fn()
      .mockRejectedValue(
        new Error("build failed\n\nuseful child stderr\nthird line is omitted"),
      );

    await expect(
      runCli({ prepare, argv: [], stdout: { write: vi.fn() }, stderr }),
    ).resolves.toBe(1);
    expect(stderr.write).toHaveBeenCalledTimes(1);
    expect(stderr.write).toHaveBeenCalledWith(
      "Sites preparation failed: build failed — useful child stderr\n",
    );
  });

  test.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)("awaits injected cleanup before returning %i for %s", async (signalName, exitCode) => {
    const signals = new EventEmitter();
    let cleanupFinished = false;
    const prepare = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((resolve) => {
          signal.addEventListener(
            "abort",
            async () => {
              await delay(5);
              cleanupFinished = true;
              resolve({ sha: FULL_SHA, requestPath: "/unused" });
            },
            { once: true },
          );
        }),
    );
    const stdout = { write: vi.fn() };
    const result = runCli({
      prepare,
      argv: [],
      stdout,
      stderr: { write: vi.fn() },
      signals,
    });
    signals.emit(signalName);

    await expect(result).resolves.toBe(exitCode);
    expect(cleanupFinished).toBe(true);
    expect(stdout.write).not.toHaveBeenCalled();
    expect(signals.listenerCount("SIGINT")).toBe(0);
    expect(signals.listenerCount("SIGTERM")).toBe(0);
  });

  test.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const)("handles real subprocess %s with exit code %i after cleanup", async (signalName, exitCode) => {
    const fixture = await createFixture();
    const readyPath = path.join(fixture.root, `${signalName}.ready`);
    const cleanupPath = path.join(fixture.root, `${signalName}.cleanup`);
    const fixtureScript = path.join(
      process.cwd(),
      "tests/fixtures/sites-deployment-signal-child.mjs",
    );
    const child = spawn(process.execPath, [fixtureScript, readyPath, cleanupPath], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const exit = onceEvent(child, "exit");
    await waitForFile(readyPath);
    child.kill(signalName);
    const [code, terminatingSignal] = await exit;

    expect(terminatingSignal).toBeNull();
    expect(code).toBe(exitCode);
    await expect(readFile(cleanupPath, "utf8")).resolves.toBe("cleanup complete\n");
  });
});
