import { describe, expect, it } from "vitest";

import { shouldCacheDiscoveryService } from "../app/server/discovery";
import { shouldCacheDatabaseConnection } from "../db/client";

describe("database runtime lifecycle", () => {
  it("keeps Node clients reusable for scripts and tests", () => {
    expect(shouldCacheDatabaseConnection({})).toBe(true);
  });

  it("keeps Cloudflare socket clients request-scoped", () => {
    expect(shouldCacheDatabaseConnection({ Cloudflare: {} })).toBe(false);
  });

  it("keeps Cloudflare discovery services request-scoped", () => {
    expect(shouldCacheDiscoveryService({ Cloudflare: {} })).toBe(false);
  });

  it("keeps Node discovery services reusable for scripts and tests", () => {
    expect(shouldCacheDiscoveryService({})).toBe(true);
  });
});
