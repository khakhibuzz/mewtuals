import { describe, expect, it } from "vitest";

import { summarizeGlobalRadarSourceFailures } from "../db/repositories/global-radar-repository";

const FAILED_QUERY_FINGERPRINT = "a".repeat(64);

function failedQuery(error: string | null = "Search request timed out.") {
  return {
    fingerprint: FAILED_QUERY_FINGERPRINT,
    error,
  };
}

describe("Global Radar source-failure metrics", () => {
  it("counts an executed-query error when no separate source error was submitted", () => {
    expect(
      summarizeGlobalRadarSourceFailures({
        executedQueries: [failedQuery()],
        sourceErrors: [],
      }),
    ).toEqual({ numberSourceErrors: 1 });
  });

  it("does not double-count a source error linked to the same failed query", () => {
    expect(
      summarizeGlobalRadarSourceFailures({
        executedQueries: [failedQuery()],
        sourceErrors: [
          {
            queryFingerprint: FAILED_QUERY_FINGERPRINT,
            sourceName: "Codex public web",
            message: "Search request timed out.",
          },
        ],
      }),
    ).toEqual({ numberSourceErrors: 1 });
  });

  it("still counts an independently reported source error", () => {
    expect(
      summarizeGlobalRadarSourceFailures({
        executedQueries: [failedQuery()],
        sourceErrors: [
          {
            queryFingerprint: null,
            sourceName: "Official procurement portal",
            message: "The source was unavailable.",
          },
        ],
      }),
    ).toEqual({ numberSourceErrors: 2 });
  });
});
