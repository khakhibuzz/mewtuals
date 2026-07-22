import { describe, expect, it } from "vitest";

import { discoveryRequestTimeoutMs } from "../scripts/discovery-worker-timeout";

describe("discovery worker request timeouts", () => {
  it("allows batch submission enough time to persist a full discovery run", () => {
    expect(discoveryRequestTimeoutMs("submit")).toBe(120_000);
  });

  it("keeps short worker operations on the default timeout", () => {
    expect(discoveryRequestTimeoutMs("claim")).toBe(30_000);
    expect(discoveryRequestTimeoutMs("fail")).toBe(30_000);
    expect(discoveryRequestTimeoutMs("abandon")).toBe(30_000);
  });
});
