import { describe, expect, it } from "vitest";

import { shouldCacheDatabaseConnection } from "../db/client";

describe("database runtime lifecycle", () => {
  it("keeps Node clients reusable for scripts and tests", () => {
    expect(shouldCacheDatabaseConnection({})).toBe(true);
  });

  it("keeps Cloudflare socket clients request-scoped", () => {
    expect(shouldCacheDatabaseConnection({ Cloudflare: {} })).toBe(false);
  });
});
