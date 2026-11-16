import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { execFileSync } from "node:child_process";

import { afterEach, describe, expect, it } from "vitest";

import {
  configureLocalEnvironment,
  localDatabasePort,
  localDatabaseUrl,
} from "../scripts/local-development.mjs";

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
    expect(env.NODE_ENV).toBe("development");
    expect(env.MEWTUALS_DEV_AUTH).toBe("true");
    expect(env.RESEND_API_KEY).toBe("");
    expect(env.GOOGLE_CLIENT_SECRET).toBe("");
  });

  it("preserves a generated secret and configuration when setup is repeated", () => {
    const directory = temporaryProject();
    configureLocalEnvironment(directory);
    const first = readFileSync(join(directory, ".env.local"), "utf8");
    configureLocalEnvironment(directory);
    expect(readFileSync(join(directory, ".env.local"), "utf8")).toBe(first);
  });

  it("refuses to overwrite pre-existing or mismatched configuration", () => {
    const directory = temporaryProject();
    writeFileSync(join(directory, ".env.local"), "DATABASE_URL=existing-value\n");
    expect(() => configureLocalEnvironment(directory)).toThrow(/existing/i);
    expect(readFileSync(join(directory, ".env.local"), "utf8")).toBe("DATABASE_URL=existing-value\n");
  });

  it("uses independently generated session secrets for different clones", () => {
    const first = temporaryProject();
    const second = temporaryProject();
    configureLocalEnvironment(first);
    configureLocalEnvironment(second);
    expect(parseEnv(readFileSync(join(first, ".env.local"), "utf8")).SESSION_SECRET)
      .not.toBe(parseEnv(readFileSync(join(second, ".env.local"), "utf8")).SESSION_SECRET);
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
