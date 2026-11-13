import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  acceptanceToken,
  LOCAL_APP_DATABASE_URL,
  LOCAL_TEST_DATABASE_URL,
  requireLocalAppDatabaseUrl,
  requireLocalTestDatabaseUrl,
  requireLoopbackBaseUrl,
} from "./support/acceptance-environment";

describe("acceptance environment safety", () => {
  it("pins local setup to the project-owned application database", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    const environmentExample = readFileSync(".env.example", "utf8");

    expect(packageJson.scripts["db:setup"]).toBe("npm run db:setup:local");
    expect(packageJson.scripts["db:setup:local"]).toContain("scripts/with-local-db.mjs app");
    expect(packageJson.scripts["db:setup:local"]).not.toContain(
      "${DATABASE_URL",
    );
    expect(packageJson.scripts["dev:4000"]).toContain("vinext dev --port 4000");
    expect(packageJson.scripts["dev:4000"]).toContain("NODE_ENV=development");
    expect(packageJson.scripts.lint).toContain("--ignore-pattern .worktrees");
    expect(environmentExample).toContain(
      "postgresql://<local-user>@127.0.0.1:55432/mewtuals",
    );
  });

  it("checks local PostgreSQL status against the primary database", () => {
    const source = readFileSync("scripts/local-postgres.mjs", "utf8");

    expect(source).toContain("const primaryDatabaseName = databaseNames[0]");
    expect(source).toContain(
      '["-h", host, "-p", port, "-d", primaryDatabaseName]',
    );
  });

  it("allows only the dedicated loopback database in integration acceptance", () => {
    expect(requireLocalTestDatabaseUrl(LOCAL_TEST_DATABASE_URL)).toBe(
      LOCAL_TEST_DATABASE_URL,
    );

    for (const unsafe of [
      LOCAL_APP_DATABASE_URL,
      "postgresql://db.example.com:5432/mewtuals_test",
      `postgresql://127.0.0.1:${new URL(LOCAL_TEST_DATABASE_URL).port === "5432" ? "5433" : "5432"}/mewtuals_test`,
      "postgresql://127.0.0.1:55432/production",
    ]) {
      expect(() => requireLocalTestDatabaseUrl(unsafe)).toThrow(
        /dedicated local test database/,
      );
    }
  });

  it("allows browser cleanup only for the project-owned loopback database", () => {
    expect(requireLocalAppDatabaseUrl(LOCAL_APP_DATABASE_URL)).toBe(
      LOCAL_APP_DATABASE_URL,
    );
    expect(
      requireLocalAppDatabaseUrl(
        LOCAL_APP_DATABASE_URL.replace("postgresql://", "postgresql://local-user@"),
      ),
    ).toBe(LOCAL_APP_DATABASE_URL.replace("postgresql://", "postgresql://local-user@"));
    expect(() =>
      requireLocalAppDatabaseUrl(LOCAL_TEST_DATABASE_URL),
    ).toThrow(/local application database/);
    expect(() =>
      requireLocalAppDatabaseUrl("postgresql://db.example.com/mewtuals"),
    ).toThrow(/local application database/);
  });

  it("accepts only an exact loopback browser origin", () => {
    expect(requireLoopbackBaseUrl("http://localhost:4000")).toBe(
      "http://localhost:4000",
    );
    expect(requireLoopbackBaseUrl("http://127.0.0.1:4000/")).toBe(
      "http://127.0.0.1:4000",
    );
    expect(requireLoopbackBaseUrl("http://[::1]:4000")).toBe(
      "http://[::1]:4000",
    );
    expect(() => requireLoopbackBaseUrl("https://preview.example")).toThrow(
      /loopback/,
    );
  });

  it("derives distinct valid opaque tokens from each run and purpose", () => {
    const runId = "019f6545-8a2f-7bd1-a2dc-982e5470d454";
    const magic = acceptanceToken(runId, "magic");
    const session = acceptanceToken(runId, "session");

    expect(magic).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(session).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(magic).not.toBe(session);
    expect(acceptanceToken(`${runId}-next`, "magic")).not.toBe(magic);
  });
});
