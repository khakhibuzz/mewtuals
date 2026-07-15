import { describe, expect, it } from "vitest";

import {
  canTransitionProfileStatus,
  transitionProfileStatus,
} from "../app/domain/workflow";

describe("profile verification workflow", () => {
  it.each([
    ["draft", "pending"],
    ["pending", "verified"],
    ["pending", "waitlisted"],
  ] as const)("allows %s to transition to %s", (from, to) => {
    expect(canTransitionProfileStatus(from, to)).toBe(true);
    expect(transitionProfileStatus(from, to)).toBe(to);
  });

  it.each([
    ["draft", "verified"],
    ["draft", "waitlisted"],
    ["pending", "draft"],
    ["verified", "pending"],
    ["waitlisted", "pending"],
    ["verified", "waitlisted"],
  ] as const)("rejects %s to %s", (from, to) => {
    expect(canTransitionProfileStatus(from, to)).toBe(false);
    expect(() => transitionProfileStatus(from, to)).toThrow(
      `Cannot transition profile from ${from} to ${to}`,
    );
  });

  it("rejects same-state transitions so writes remain explicit", () => {
    expect(canTransitionProfileStatus("pending", "pending")).toBe(false);
    expect(() => transitionProfileStatus("pending", "pending")).toThrow();
  });
});
