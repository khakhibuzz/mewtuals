import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(projectRoot, ".local-postgres");
const dataDir = join(runtimeDir, "data");
const logFile = join(runtimeDir, "postgres.log");
const host = "127.0.0.1";
const port = "55432";
const databaseNames = ["mewtuals", "mewtuals_test"];
const primaryDatabaseName = databaseNames[0];

function run(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });

  if (result.error && !allowFailure) {
    throw result.error;
  }

  if (result.status !== 0 && !allowFailure) {
    const detail = capture ? result.stderr.trim() : "";
    throw new Error(
      `${command} exited with status ${result.status}${detail ? `: ${detail}` : ""}`,
    );
  }

  return result;
}

function pathFor(command) {
  const result = run("which", [command], { capture: true, allowFailure: true });
  const executable = result.stdout?.trim();
  return result.status === 0 && executable ? realpathSync(executable) : undefined;
}

function postgres16BinDir(candidate) {
  if (!candidate) {
    return undefined;
  }

  const postgres = join(candidate, "postgres");
  if (!existsSync(postgres)) {
    return undefined;
  }

  const version = run(postgres, ["--version"], {
    capture: true,
    allowFailure: true,
  });

  if (version.status !== 0 || !/PostgreSQL\) 16(?:\.|\s|$)/.test(version.stdout)) {
    return undefined;
  }

  const requiredCommands = [
    "createdb",
    "initdb",
    "pg_ctl",
    "pg_isready",
    "postgres",
    "psql",
  ];

  return requiredCommands.every((command) => existsSync(join(candidate, command)))
    ? candidate
    : undefined;
}

function locatePostgres16() {
  const pgConfig = pathFor("pg_config");
  if (pgConfig) {
    const version = run(pgConfig, ["--version"], {
      capture: true,
      allowFailure: true,
    });
    const bindir = run(pgConfig, ["--bindir"], {
      capture: true,
      allowFailure: true,
    });

    if (
      version.status === 0 &&
      /^PostgreSQL 16(?:\.|\s|$)/.test(version.stdout.trim()) &&
      bindir.status === 0
    ) {
      const found = postgres16BinDir(bindir.stdout.trim());
      if (found) {
        return found;
      }
    }
  }

  const postgres = pathFor("postgres");
  const pathCandidate = postgres16BinDir(postgres ? dirname(postgres) : undefined);
  if (pathCandidate) {
    return pathCandidate;
  }

  const brew = pathFor("brew");
  if (brew) {
    const prefix = run(brew, ["--prefix", "postgresql@16"], {
      capture: true,
      allowFailure: true,
    });
    const brewCandidate =
      prefix.status === 0
        ? postgres16BinDir(join(prefix.stdout.trim(), "bin"))
        : undefined;

    if (brewCandidate) {
      return brewCandidate;
    }
  }

  throw new Error(
    "PostgreSQL 16 was not found on PATH or via `brew --prefix postgresql@16`.",
  );
}

function binary(binDir, command) {
  return join(binDir, command);
}

function isInitialised() {
  return existsSync(join(dataDir, "PG_VERSION"));
}

function ensureVersion16() {
  const version = readFileSync(join(dataDir, "PG_VERSION"), "utf8").trim();
  if (version !== "16") {
    throw new Error(
      `Refusing to use ${dataDir}: expected PostgreSQL 16 data, found ${version}.`,
    );
  }
}

function initialise(binDir) {
  if (isInitialised()) {
    ensureVersion16();
    return;
  }

  if (existsSync(dataDir) && readdirSync(dataDir).length > 0) {
    throw new Error(
      `Refusing to overwrite non-empty, uninitialised data directory ${dataDir}.`,
    );
  }

  mkdirSync(dataDir, { recursive: true });
  run(binary(binDir, "initdb"), [
    "-D",
    dataDir,
    "--auth-local=trust",
    "--auth-host=trust",
    "--encoding=UTF8",
    "--no-locale",
    "--username",
    userInfo().username,
  ]);
}

function isRunning(binDir) {
  if (!isInitialised()) {
    return false;
  }

  const result = run(binary(binDir, "pg_ctl"), ["-D", dataDir, "status"], {
    capture: true,
    allowFailure: true,
  });
  return result.status === 0;
}

function connectionArgs(database = "postgres") {
  return ["-h", host, "-p", port, "-d", database];
}

function repositoryRoot() {
  const commonDirectory = run(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { capture: true },
  ).stdout.trim();
  return dirname(realpathSync(commonDirectory));
}

function runningServerIdentity(binDir) {
  const result = run(
    binary(binDir, "psql"),
    [
      ...connectionArgs(),
      "-tAc",
      "select current_setting('server_version_num') || E'\\t' || current_user || E'\\t' || current_setting('data_directory')",
    ],
    { capture: true, allowFailure: true },
  );
  if (result.status !== 0) return undefined;
  const [versionNumber, databaseUser, serverDataDirectory] = result.stdout
    .trim()
    .split("\t");
  if (!versionNumber || !databaseUser || !serverDataDirectory) {
    throw new Error("Refusing to reuse PostgreSQL: server identity was incomplete.");
  }
  return {
    versionNumber: Number(versionNumber),
    databaseUser,
    dataDirectory: realpathSync(serverDataDirectory),
  };
}

function isRepositoryOwnedDataDirectory(candidate) {
  const root = repositoryRoot();
  if (candidate === resolve(root, ".local-postgres", "data")) return true;

  const worktreesRoot = resolve(root, ".worktrees");
  const worktreeRelativePath = relative(worktreesRoot, candidate);
  const pathParts = worktreeRelativePath.split(sep);
  return (
    worktreeRelativePath !== "" &&
    !worktreeRelativePath.startsWith(`..${sep}`) &&
    pathParts.length === 3 &&
    pathParts[0] !== "" &&
    pathParts[1] === ".local-postgres" &&
    pathParts[2] === "data"
  );
}

function assertReusableServer(identity) {
  const expectedUser = userInfo().username;
  const validVersion =
    Number.isInteger(identity.versionNumber) &&
    identity.versionNumber >= 160000 &&
    identity.versionNumber < 170000;
  if (
    !validVersion ||
    identity.databaseUser !== expectedUser ||
    !isRepositoryOwnedDataDirectory(identity.dataDirectory)
  ) {
    throw new Error(
      `Refusing to reuse PostgreSQL at ${host}:${port}: expected PostgreSQL 16 owned by ${expectedUser} with a repository-owned .local-postgres/data directory.`,
    );
  }
}

function assertCurrentWorktreeServer(identity) {
  assertReusableServer(identity);
  const currentDataDirectory = realpathSync(dataDir);
  if (identity.dataDirectory !== currentDataDirectory) {
    throw new Error(
      `Refusing to use PostgreSQL at ${host}:${port}: endpoint data directory ${identity.dataDirectory} does not match the current worktree data directory ${currentDataDirectory}.`,
    );
  }
}

function requireServerIdentity(identity) {
  if (!identity) {
    throw new Error(
      `Refusing to use PostgreSQL at ${host}:${port}: server identity could not be validated.`,
    );
  }
  return identity;
}

function ensureDatabase(binDir, databaseName) {
  const result = run(
    binary(binDir, "psql"),
    [
      ...connectionArgs(),
      "-tAc",
      `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`,
    ],
    { capture: true },
  );

  if (result.stdout.trim() === "1") {
    return;
  }

  run(binary(binDir, "createdb"), [
    "-h",
    host,
    "-p",
    port,
    databaseName,
  ]);
}

function start(binDir) {
  let reusedDataDirectory;
  const ownServerRunning = isRunning(binDir);
  let identity = runningServerIdentity(binDir);

  if (ownServerRunning) {
    assertCurrentWorktreeServer(requireServerIdentity(identity));
  } else {
    if (identity) {
      assertReusableServer(identity);
      reusedDataDirectory = identity.dataDirectory;
    } else {
      initialise(binDir);
      run(binary(binDir, "pg_ctl"), [
        "-D",
        dataDir,
        "-l",
        logFile,
        "-o",
        `-h ${host} -p ${port} -c unix_socket_directories=''`,
        "-w",
        "start",
      ]);
      identity = runningServerIdentity(binDir);
      assertCurrentWorktreeServer(requireServerIdentity(identity));
    }
  }

  for (const databaseName of databaseNames) {
    ensureDatabase(binDir, databaseName);
  }
  if (reusedDataDirectory) {
    console.log(`Reusing repository-owned PostgreSQL at ${reusedDataDirectory}.`);
  }
  console.log(`PostgreSQL 16 is running at ${host}:${port}.`);
  console.log(`Databases: ${databaseNames.join(", ")}`);
}

function stop(binDir) {
  if (!isInitialised()) {
    console.log("PostgreSQL is not initialised for this project.");
    return;
  }

  ensureVersion16();
  if (!isRunning(binDir)) {
    console.log("PostgreSQL is already stopped.");
    return;
  }

  run(binary(binDir, "pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"]);
  console.log("PostgreSQL stopped.");
}

function status(binDir) {
  if (!isInitialised()) {
    console.log("PostgreSQL is not initialised for this project.");
    return;
  }

  ensureVersion16();
  if (!isRunning(binDir)) {
    console.log("PostgreSQL is stopped.");
    return;
  }

  const ready = run(
    binary(binDir, "pg_isready"),
    ["-h", host, "-p", port, "-d", primaryDatabaseName],
    { capture: true, allowFailure: true },
  );
  console.log(ready.stdout.trim() || "PostgreSQL is running.");
}

const action = process.argv[2];
if (!["start", "stop", "status"].includes(action)) {
  console.error("Usage: node scripts/local-postgres.mjs <start|stop|status>");
  process.exitCode = 1;
} else {
  try {
    const binDir = locatePostgres16();
    ({ start, stop, status })[action](binDir);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
