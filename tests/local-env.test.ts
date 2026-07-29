import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { globalRadarThemes } from "../app/domain/global-radar";
import { loadLocalEnvironment } from "../scripts/load-local-env.mjs";

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalGlobalRadarWorkerSecret =
  process.env.GLOBAL_RADAR_WORKER_SECRET;
const temporaryDirectories: string[] = [];

afterEach(() => {
  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
  if (originalGlobalRadarWorkerSecret === undefined) {
    delete process.env.GLOBAL_RADAR_WORKER_SECRET;
  } else {
    process.env.GLOBAL_RADAR_WORKER_SECRET = originalGlobalRadarWorkerSecret;
  }

  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("local environment configuration", () => {
  it("loads database and Radar worker values from .env.local when the shell does not provide them", () => {
    const directory = mkdtempSync(join(tmpdir(), "mewtuals-env-"));
    const envFile = join(directory, ".env.local");
    temporaryDirectories.push(directory);
    delete process.env.DATABASE_URL;
    delete process.env.GLOBAL_RADAR_WORKER_SECRET;
    writeFileSync(
      envFile,
      [
        "DATABASE_URL=postgresql://127.0.0.1:55432/mewtuals",
        "GLOBAL_RADAR_WORKER_SECRET=local-radar-worker-secret",
        "",
      ].join("\n"),
      "utf8",
    );

    expect(loadLocalEnvironment(envFile)).toBe(true);
    expect(process.env.DATABASE_URL).toBe(
      "postgresql://127.0.0.1:55432/mewtuals",
    );
    expect(process.env.GLOBAL_RADAR_WORKER_SECRET).toBe(
      "local-radar-worker-secret",
    );
  });

  it.each([[".env.example"], [".dev.vars.example"]] as const)(
    "documents the exact safe Radar variables in %s",
    (filename) => {
      const values = Object.fromEntries(
        readFileSync(filename, "utf8")
          .split(/\r?\n/)
          .filter((line) => line && !line.startsWith("#"))
          .map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator), line.slice(separator + 1)];
          }),
      );

      expect(values).toMatchObject({
        GLOBAL_RADAR_WORKER_SECRET: "",
        GLOBAL_RADAR_API_BASE_URL: "https://mewtuals.com",
        GLOBAL_RADAR_COUNTRIES: "United States,China",
        GLOBAL_RADAR_LANGUAGES: "en,zh-CN",
        GLOBAL_RADAR_THEMES: globalRadarThemes.join(","),
        GLOBAL_RADAR_ENABLED_SOURCES: "codex_public_web",
        GLOBAL_RADAR_RESULT_LIMIT: "20",
        GLOBAL_RADAR_DIRECT_THRESHOLD: "70",
        GLOBAL_RADAR_PRECURSOR_THRESHOLD: "65",
        GLOBAL_RADAR_MOMENTUM_THRESHOLD: "70",
      });
    },
  );

  it("pins the exact no-emit typecheck command", () => {
    const packageJson = JSON.parse(
      readFileSync("package.json", "utf8"),
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
  });
});
