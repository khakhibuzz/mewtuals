import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { userInfo } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const runtimeDir = join(projectRoot, ".local-postgres");
const dataDir = join(runtimeDir, "data");
const logFile = join(runtimeDir, "postgres.log");
const host = "127.0.0.1";
const port = "55432";
const databaseName = "mewtuals";

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

function ensureDatabase(binDir) {
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
  initialise(binDir);

  if (!isRunning(binDir)) {
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
  }

  ensureDatabase(binDir);
  console.log(
    `PostgreSQL 16 is running at postgresql://${host}:${port}/${databaseName}`,
  );
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
    ["-h", host, "-p", port, "-d", databaseName],
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
