import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadLocalEnvironment } from "../scripts/load-local-env.mjs";

const originalDatabaseUrl = process.env.DATABASE_URL;
const temporaryDirectories: string[] = [];

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }

  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local database environment", () => {
  it("loads DATABASE_URL from .env.local when the shell does not provide it", () => {
    const directory = mkdtempSync(join(tmpdir(), "mewtuals-env-"));
    const envFile = join(directory, ".env.local");
    temporaryDirectories.push(directory);
    delete process.env.DATABASE_URL;
    writeFileSync(
      envFile,
      "DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals\n",
      "utf8",
    );

    expect(loadLocalEnvironment(envFile)).toBe(true);
    expect(process.env.DATABASE_URL).toBe(
      "postgresql://127.0.0.1:55432/mewtuals",
    );
  });
});
