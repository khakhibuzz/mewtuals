import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

const fixtureDirectories: string[] = [];

interface LauncherFixture {
  projectRoot: string;
  siblingDataDir: string;
  foreignDataDir: string;
  run: (
    action: "start" | "stop",
    endpointDataDir?: string,
  ) => ReturnType<typeof spawnSync>;
  events: () => string[];
}

function createLauncherFixture({
  initialised = false,
  ownServerRunning = false,
}: {
  initialised?: boolean;
  ownServerRunning?: boolean;
} = {}): LauncherFixture {
  const projectRoot = realpathSync(
    mkdtempSync(join(tmpdir(), "mewtuals-postgres-launcher-")),
  );
  fixtureDirectories.push(projectRoot);

  const scriptsDir = join(projectRoot, "scripts");
  const binDir = join(projectRoot, "fake-bin");
  const ownDataDir = join(projectRoot, ".local-postgres", "data");
  const siblingDataDir = join(
    projectRoot,
    ".worktrees",
    "sibling",
    ".local-postgres",
    "data",
  );
  const foreignDataDir = join(projectRoot, "foreign", "data");
  const commonGitDir = join(projectRoot, ".git");
  const stateFile = join(projectRoot, "postgres-state");
  const eventsFile = join(projectRoot, "events.log");

  for (const directory of [
    scriptsDir,
    binDir,
    siblingDataDir,
    foreignDataDir,
    commonGitDir,
  ]) {
    mkdirSync(directory, { recursive: true });
  }
  copyFileSync("scripts/local-postgres.mjs", join(scriptsDir, "local-postgres.mjs"));

  if (initialised) {
    mkdirSync(ownDataDir, { recursive: true });
    writeFileSync(join(ownDataDir, "PG_VERSION"), "16\n");
  }
  if (ownServerRunning) {
    writeFileSync(stateFile, "running\n");
  }

  const fakeCommand = `#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";

const command = basename(process.argv[1]);
const args = process.argv.slice(2);
const state = () => {
  try { return readFileSync(process.env.FAKE_STATE_FILE, "utf8").trim(); }
  catch { return "stopped"; }
};
const record = (event) => appendFileSync(process.env.FAKE_EVENTS_FILE, event + "\\n");

if (command === "pg_config") {
  process.stdout.write(args[0] === "--bindir" ? dirname(process.argv[1]) + "\\n" : "PostgreSQL 16.3\\n");
} else if (command === "postgres") {
  process.stdout.write("postgres (PostgreSQL) 16.3\\n");
} else if (command === "git") {
  process.stdout.write(process.env.FAKE_COMMON_GIT_DIR + "\\n");
} else if (command === "pg_ctl") {
  if (args.includes("status")) {
    record("pg_ctl status");
    process.exitCode = state() === "running" ? 0 : 3;
  } else if (args.includes("start")) {
    record("pg_ctl start");
    writeFileSync(process.env.FAKE_STATE_FILE, "running\\n");
  } else if (args.includes("stop")) {
    record("pg_ctl stop");
    writeFileSync(process.env.FAKE_STATE_FILE, "stopped\\n");
  }
} else if (command === "initdb") {
  record("initdb");
  const dataDirectory = args[args.indexOf("-D") + 1];
  mkdirSync(dataDirectory, { recursive: true });
  writeFileSync(dataDirectory + "/PG_VERSION", "16\\n");
} else if (command === "psql") {
  const query = args[args.indexOf("-tAc") + 1];
  if (query.includes("server_version_num")) {
    record("psql identity");
    const endpointDataDirectory = process.env.FAKE_ENDPOINT_DATA_DIR ||
      (state() === "running" ? process.env.FAKE_OWN_DATA_DIR : "");
    if (!endpointDataDirectory) {
      process.exitCode = 2;
    } else {
      process.stdout.write("160003\\t" + process.env.FAKE_DATABASE_USER + "\\t" + endpointDataDirectory + "\\n");
    }
  } else {
    record("psql database");
    process.stdout.write("1\\n");
  }
} else if (command === "createdb") {
  record("createdb");
}
`;

  for (const command of [
    "createdb",
    "git",
    "initdb",
    "pg_config",
    "pg_ctl",
    "pg_isready",
    "postgres",
    "psql",
  ]) {
    const commandPath = join(binDir, command);
    writeFileSync(commandPath, fakeCommand);
    chmodSync(commandPath, 0o755);
  }

  return {
    projectRoot,
    siblingDataDir,
    foreignDataDir,
    run(action, endpointDataDir) {
      return spawnSync(process.execPath, [join(scriptsDir, "local-postgres.mjs"), action], {
        cwd: projectRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ""}`,
          FAKE_COMMON_GIT_DIR: commonGitDir,
          FAKE_DATABASE_USER: userInfo().username,
          FAKE_ENDPOINT_DATA_DIR: endpointDataDir ?? "",
          FAKE_EVENTS_FILE: eventsFile,
          FAKE_OWN_DATA_DIR: ownDataDir,
          FAKE_STATE_FILE: stateFile,
        },
      });
    },
    events() {
      try {
        return readFileSync(eventsFile, "utf8").trim().split("\n");
      } catch {
        return [];
      }
    },
  };
}

afterEach(() => {
  for (const directory of fixtureDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local PostgreSQL launcher", () => {
  it("reuses a repository-owned sibling PostgreSQL 16 server without stopping it", () => {
    const fixture = createLauncherFixture();

    const start = fixture.run("start", fixture.siblingDataDir);
    const stop = fixture.run("stop", fixture.siblingDataDir);

    expect(start.status).toBe(0);
    expect(start.stdout).toContain(
      `Reusing repository-owned PostgreSQL at ${fixture.siblingDataDir}.`,
    );
    expect(stop.status).toBe(0);
    expect(fixture.events()).toEqual([
      "psql identity",
      "psql database",
      "psql database",
    ]);
  });

  it("rejects a running current cluster when the fixed endpoint is a sibling before database setup", () => {
    const fixture = createLauncherFixture({
      initialised: true,
      ownServerRunning: true,
    });

    const result = fixture.run("start", fixture.siblingDataDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("does not match the current worktree data directory");
    expect(fixture.events()).toEqual(["pg_ctl status", "psql identity"]);
  });

  it("rejects a foreign fixed endpoint before database setup", () => {
    const fixture = createLauncherFixture();

    const result = fixture.run("start", fixture.foreignDataDir);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Refusing to reuse PostgreSQL");
    expect(fixture.events()).toEqual(["psql identity"]);
  });

  it("identity-validates a self-started endpoint and stops only its own cluster", () => {
    const fixture = createLauncherFixture();

    const start = fixture.run("start");
    const stop = fixture.run("stop");

    expect(start.status).toBe(0);
    expect(stop.status).toBe(0);
    expect(fixture.events()).toEqual([
      "psql identity",
      "initdb",
      "pg_ctl start",
      "psql identity",
      "psql database",
      "psql database",
      "pg_ctl status",
      "pg_ctl stop",
    ]);
  });
});
