import { describe, expect, it } from "vitest";

import { globalRadarRequestTimeoutMs } from "../scripts/global-radar-worker-timeout";

describe("Global Radar worker request timeouts", () => {
  it("allows a full batch submission 120 seconds", () => {
    expect(globalRadarRequestTimeoutMs("submit")).toBe(120_000);
  });

  it("keeps non-submission network commands at 30 seconds", () => {
    expect(globalRadarRequestTimeoutMs("claim")).toBe(30_000);
    expect(globalRadarRequestTimeoutMs("fail")).toBe(30_000);
    expect(globalRadarRequestTimeoutMs("abandon")).toBe(30_000);
  });
});
