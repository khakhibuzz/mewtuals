import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { execFileSync, spawnSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  configureLocalEnvironment,
  localDatabasePort,
  localDatabaseUrl,
} from "../scripts/local-development.mjs";
import { readDiscoveryConfig } from "../app/server/discovery-config";
import { readGlobalRadarConfig } from "../app/server/global-radar/config";

const secretNames = ["SESSION_SECRET", "DISCOVERY_WORKER_SECRET", "GLOBAL_RADAR_WORKER_SECRET"] as const;

const directories: string[] = [];
function temporaryProject() {
  const directory = mkdtempSync(join(tmpdir(), "mewtuals-local-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("fresh-clone local configuration", () => {
  it("creates matching Node and Worker configuration without service credentials", () => {
    const directory = temporaryProject();
    configureLocalEnvironment(directory, { port: "55439", username: "developer" });
    const nodeConfig = readFileSync(join(directory, ".env.local"), "utf8");
    expect(readFileSync(join(directory, ".dev.vars"), "utf8")).toBe(nodeConfig);
    const env = parseEnv(nodeConfig);
    expect(env.DATABASE_URL).toBe("postgresql://developer@127.0.0.1:55439/mewtuals");
    expect(env.MEWTUALS_LOCAL_DATABASE_PORT).toBe("55439");
    expect(env.SESSION_SECRET).toMatch(/^[A-Za-z0-9_-]{64}$/);
    for (const name of secretNames) expect(env[name]).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(new Set(secretNames.map((name) => env[name])).size).toBe(3);
    for (const NODE_ENV of ["development", "production"]) {
      expect(readDiscoveryConfig({ ...env, NODE_ENV }).workerSecret).toBe(env.DISCOVERY_WORKER_SECRET);
      expect(readGlobalRadarConfig({ ...env, NODE_ENV }).workerSecret).toBe(env.GLOBAL_RADAR_WORKER_SECRET);
    }
    expect(env.NODE_ENV).toBe("development");
    expect(env.MEWTUALS_DEV_AUTH).toBe("true");
    expect(env.RESEND_API_KEY).toBe("");
    expect(env.GOOGLE_CLIENT_SECRET).toBe("");
  });

  it("preserves all generated secrets and configuration when setup is repeated", () => {
    const directory = temporaryProject();
    configureLocalEnvironment(directory);
    const first = readFileSync(join(directory, ".env.local"), "utf8");
    configureLocalEnvironment(directory);
    expect(readFileSync(join(directory, ".env.local"), "utf8")).toBe(first);
    expect(readFileSync(join(directory, ".dev.vars"), "utf8")).toBe(first);
  });

  it("refuses to overwrite pre-existing or mismatched configuration", () => {
    const directory = temporaryProject();
    writeFileSync(join(directory, ".env.local"), "DATABASE_URL=existing-value\n");
    expect(() => configureLocalEnvironment(directory)).toThrow(/existing/i);
    expect(readFileSync(join(directory, ".env.local"), "utf8")).toBe("DATABASE_URL=existing-value\n");
  });

  it("uses independently generated secrets for different clones", () => {
    const first = temporaryProject();
    const second = temporaryProject();
    configureLocalEnvironment(first);
    configureLocalEnvironment(second);
    const firstConfig = parseEnv(readFileSync(join(first, ".env.local"), "utf8"));
    const secondConfig = parseEnv(readFileSync(join(second, ".env.local"), "utf8"));
    expect(new Set(secretNames.flatMap((name) => [firstConfig[name], secondConfig[name]])).size).toBe(6);
  });

  it("adds absent worker secrets to matching generated files while preserving existing settings", () => {
    const directory = temporaryProject();
    configureLocalEnvironment(directory);
    const original = readFileSync(join(directory, ".env.local"), "utf8")
      .replace(/^DISCOVERY_WORKER_SECRET=.*\n/gm, "")
      .replace(/^GLOBAL_RADAR_WORKER_SECRET=.*\n/gm, "")
      + "# Keep the developer's local settings\nADMIN_EMAILS=operator@example.test\n";
    for (const filename of [".env.local", ".dev.vars"]) writeFileSync(join(directory, filename), original);

    configureLocalEnvironment(directory);

    const upgraded = readFileSync(join(directory, ".env.local"), "utf8");
    expect(upgraded.startsWith(original)).toBe(true);
    expect(readFileSync(join(directory, ".dev.vars"), "utf8")).toBe(upgraded);
    const before = parseEnv(original);
    const after = parseEnv(upgraded);
    for (const [name, value] of Object.entries(before)) expect(after[name]).toBe(value);
    expect(readDiscoveryConfig({ ...after, NODE_ENV: "production" }).workerSecret).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(readGlobalRadarConfig({ ...after, NODE_ENV: "production" }).workerSecret).toMatch(/^[A-Za-z0-9_-]{64}$/);
    configureLocalEnvironment(directory);
    expect(readFileSync(join(directory, ".env.local"), "utf8")).toBe(upgraded);
  });

  it("preserves an existing worker secret when only the other one is absent", () => {
    const directory = temporaryProject();
    configureLocalEnvironment(directory);
    const original = readFileSync(join(directory, ".env.local"), "utf8")
      .replace(/^GLOBAL_RADAR_WORKER_SECRET=.*\n/gm, "")
      .replace(/^DISCOVERY_WORKER_SECRET=.*\n/gm, "")
      + `DISCOVERY_WORKER_SECRET=${"existing-local-discovery-secret-".repeat(2)}\n`;
    for (const filename of [".env.local", ".dev.vars"]) writeFileSync(join(directory, filename), original);

    configureLocalEnvironment(directory);

    const upgraded = parseEnv(readFileSync(join(directory, ".env.local"), "utf8"));
    expect(upgraded.DISCOVERY_WORKER_SECRET).toBe(parseEnv(original).DISCOVERY_WORKER_SECRET);
    expect(readGlobalRadarConfig(upgraded).workerSecret).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it("refuses to upgrade a mismatched generated pair", () => {
    const directory = temporaryProject();
    configureLocalEnvironment(directory);
    const original = readFileSync(join(directory, ".env.local"), "utf8")
      .replace(/^DISCOVERY_WORKER_SECRET=.*\n/gm, "")
      .replace(/^GLOBAL_RADAR_WORKER_SECRET=.*\n/gm, "");
    writeFileSync(join(directory, ".env.local"), original);
    writeFileSync(join(directory, ".dev.vars"), original + "ADMIN_EMAILS=other@example.test\n");

    expect(() => configureLocalEnvironment(directory)).toThrow(/existing local configuration/);
    expect(readFileSync(join(directory, ".env.local"), "utf8")).toBe(original);
    expect(readFileSync(join(directory, ".dev.vars"), "utf8")).toBe(original + "ADMIN_EMAILS=other@example.test\n");
  });

  it("restores the original Node configuration when the matching Worker upgrade cannot be written", () => {
    const directory = temporaryProject();
    configureLocalEnvironment(directory);
    const original = readFileSync(join(directory, ".env.local"), "utf8")
      .replace(/^DISCOVERY_WORKER_SECRET=.*\n/gm, "")
      .replace(/^GLOBAL_RADAR_WORKER_SECRET=.*\n/gm, "");
    for (const filename of [".env.local", ".dev.vars"]) writeFileSync(join(directory, filename), original);
    chmodSync(join(directory, ".dev.vars"), 0o400);

    expect(() => configureLocalEnvironment(directory)).toThrow();
    expect(readFileSync(join(directory, ".env.local"), "utf8")).toBe(original);
    expect(readFileSync(join(directory, ".dev.vars"), "utf8")).toBe(original);
  });

  it.each([".env.local", ".dev.vars"])("preserves both original files after a partial append failure in %s", (filename) => {
    const directory = temporaryProject();
    configureLocalEnvironment(directory);
    const original = readFileSync(join(directory, ".env.local"), "utf8")
      .replace(/^DISCOVERY_WORKER_SECRET=.*\n/gm, "")
      .replace(/^GLOBAL_RADAR_WORKER_SECRET=.*\n/gm, "")
      + "# Preserve Unicode: अक्षर";
    for (const filename of [".env.local", ".dev.vars"]) writeFileSync(join(directory, filename), original);
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import fs from "node:fs";
      import { syncBuiltinESMExports } from "node:module";
      import { pathToFileURL } from "node:url";
      const [helperPath, directory, failingPath] = process.argv.slice(1);
      const actualAppend = fs.appendFileSync;
      fs.appendFileSync = (path, data, options) => {
        if (path !== failingPath) return actualAppend(path, data, options);
        actualAppend(path, String(data).slice(0, 7), options);
        throw Object.assign(new Error("Simulated partial append failure"), { code: "ENOSPC" });
      };
      syncBuiltinESMExports();
      const { configureLocalEnvironment } = await import(pathToFileURL(helperPath).href);
      try {
        configureLocalEnvironment(directory);
        process.stdout.write("unexpected success");
      } catch (error) {
        if (error.code !== "ENOSPC") throw error;
        process.stdout.write("expected append failure");
      }
    `, resolve("scripts/local-development.mjs"), directory, join(directory, filename)], { encoding: "utf8" });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("expected append failure");
    for (const filename of [".env.local", ".dev.vars"]) {
      expect(readFileSync(join(directory, filename))).toEqual(Buffer.from(original));
    }
  });
});

describe("local database connection selection", () => {
  it("accepts only a valid unprivileged numeric local port", () => {
    expect(localDatabasePort({})).toBe("55432");
    expect(localDatabasePort({ MEWTUALS_LOCAL_DATABASE_PORT: "55439" })).toBe("55439");
    for (const port of ["", "5432 -h 0.0.0.0", "0", "1023", "65536", "abc", "05432"]) {
      expect(() => localDatabasePort({ MEWTUALS_LOCAL_DATABASE_PORT: port })).toThrow(/port/i);
    }
  });

  it("constructs loopback URLs for only the app and dedicated test databases", () => {
    expect(localDatabaseUrl("mewtuals_test", { port: "55439", username: "dev user" }))
      .toBe("postgresql://dev%20user@127.0.0.1:55439/mewtuals_test");
    expect(() => localDatabaseUrl("production")).toThrow(/database/i);
  });

  it("ignores an inherited remote database URL when running local test commands", () => {
    const output = execFileSync(process.execPath, [
      "scripts/with-local-db.mjs", "test", process.execPath,
      "-e", "process.stdout.write(process.env.DATABASE_URL)",
    ], {
      encoding: "utf8",
      env: { ...process.env, MEWTUALS_LOCAL_DATABASE_PORT: "55439", DATABASE_URL: "postgresql://private.example/production" },
    });
    const url = new URL(output);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.port).toBe("55439");
    expect(url.pathname).toBe("/mewtuals_test");
  });
});
