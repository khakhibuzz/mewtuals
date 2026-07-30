import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const operations = readFileSync(
  resolve(process.cwd(), "docs/global-demand-radar-operations.md"),
  "utf8",
);
const normalizedOperations = operations.replace(/\s+/gu, " ");

describe("Global Demand Radar operations documentation", () => {
  it("provides a copyable standalone Codex automation setup without activating it", () => {
    expect(operations).toContain(
      "## Local Codex automation setup (not activated)",
    );
    expect(operations).toContain(
      "Working directory: `/Users/keshavgarg/Documents/Creativity`",
    );
    expect(operations).toContain(
      "Name: `mewtuals-global-demand-radar-daily`",
    );
    expect(operations).toContain("Timezone: `Asia/Kolkata`");
    expect(operations).toContain("Schedule: `30 10 * * *`");
    expect(operations).toContain(
      "npm run global-radar:claim -- --trigger scheduled --scan-mode daily",
    );
    expect(normalizedOperations).toContain(
      "When `claimed` is `false`, stop successfully",
    );
    expect(operations).toContain(
      "npm run global-radar:validate -- --file <batch-file>",
    );
    expect(operations).toContain(
      "npm run global-radar:submit -- --claim-file <claim-file> --file <batch-file>",
    );
    expect(operations).toContain(
      "npm run global-radar:fail -- --claim-file <claim-file> --message <safe-message>",
    );
    expect(operations).toContain(
      "npm run global-radar:abandon -- --run-id <run-id> --message <safe-message>",
    );
    expect(normalizedOperations).toContain(
      "retry the exact same submit command with the unchanged files",
    );
    expect(normalizedOperations).toContain(
      "Clean up private files only after confirmed terminal completion, replay, or failure.",
    );
    expect(normalizedOperations).toContain(
      "Do not create, enable, or update either automation while following this runbook.",
    );
  });

  it("keeps the thematic task separate from daily Radar and India Discovery", () => {
    expect(operations).toContain(
      "Name: `mewtuals-global-demand-radar-weekly-thematic`",
    );
    expect(operations).toContain("Schedule: `30 11 * * 0`");
    expect(operations).toContain(
      "npm run global-radar:claim -- --trigger scheduled --scan-mode thematic",
    );
    expect(normalizedOperations).toContain(
      "Do not edit, replace, pause, or reuse the existing India Discovery automation.",
    );
  });
});
