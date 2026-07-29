import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  hashDiscoveryToken,
  verifyDiscoveryBearer,
} from "../app/server/discovery-worker-auth";
import {
  GLOBAL_RADAR_LEASE_HMAC_PURPOSE,
  GLOBAL_RADAR_WORKER_HMAC_PURPOSE,
  hashGlobalRadarLeaseToken,
  verifyGlobalRadarBearer,
} from "../app/server/global-radar/worker-auth";

function purposeDigest(secret: string, purpose: string, value: string): string {
  return createHmac("sha256", secret)
    .update(purpose)
    .update("\0")
    .update(value)
    .digest("hex");
}

describe("Global Radar worker authentication", () => {
  it("locks distinct Radar worker and lease HMAC purposes", () => {
    expect(GLOBAL_RADAR_WORKER_HMAC_PURPOSE).toBe("global-radar-worker-v1");
    expect(GLOBAL_RADAR_LEASE_HMAC_PURPOSE).toBe("global-radar-lease-v1");
    expect(GLOBAL_RADAR_WORKER_HMAC_PURPOSE).not.toBe(
      GLOBAL_RADAR_LEASE_HMAC_PURPOSE,
    );
  });

  it("hashes a lease with only the Radar lease purpose and returns no raw lease", () => {
    const secret = "radar-worker-secret";
    const leaseToken = "raw-lease-token-never-store";
    const digest = hashGlobalRadarLeaseToken(secret, leaseToken);

    expect(digest).toBe(
      purposeDigest(secret, GLOBAL_RADAR_LEASE_HMAC_PURPOSE, leaseToken),
    );
    expect(digest).toMatch(/^[a-f0-9]{64}$/);
    expect(digest).not.toContain(leaseToken);
    expect(hashGlobalRadarLeaseToken(secret, leaseToken)).toBe(digest);
    expect(hashGlobalRadarLeaseToken("wrong-secret", leaseToken)).not.toBe(
      digest,
    );
    expect(
      purposeDigest(secret, GLOBAL_RADAR_WORKER_HMAC_PURPOSE, leaseToken),
    ).not.toBe(digest);
  });

  it("validates only an exact Radar bearer credential", () => {
    const secret = "exact-radar-worker-secret";

    expect(verifyGlobalRadarBearer(`Bearer ${secret}`, secret)).toBe(true);
    expect(verifyGlobalRadarBearer("Bearer wrong-secret", secret)).toBe(false);
    expect(
      verifyGlobalRadarBearer("Basic exact-radar-worker-secret", secret),
    ).toBe(false);
    expect(verifyGlobalRadarBearer(`bearer ${secret}`, secret)).toBe(false);
    expect(verifyGlobalRadarBearer(`Bearer  ${secret}`, secret)).toBe(false);
    expect(verifyGlobalRadarBearer(`Bearer ${secret} `, secret)).toBe(false);
    expect(verifyGlobalRadarBearer("Bearer", secret)).toBe(false);
    expect(verifyGlobalRadarBearer(null, secret)).toBe(false);
  });

  it("keeps Radar and Discovery credentials and lease hashes mutually separated", () => {
    const radarSecret = "radar-only-secret";
    const discoverySecret = "discovery-only-secret";
    const token = "same-lease-token";

    expect(
      verifyGlobalRadarBearer(`Bearer ${discoverySecret}`, radarSecret),
    ).toBe(false);
    expect(
      verifyDiscoveryBearer(`Bearer ${radarSecret}`, discoverySecret),
    ).toBe(false);
    expect(hashGlobalRadarLeaseToken(radarSecret, token)).not.toBe(
      hashDiscoveryToken(radarSecret, token),
    );
  });

  it("does not accept a lease-purpose digest as a worker bearer", () => {
    const secret = "radar-worker-secret";
    const leasePurposeCredential = purposeDigest(
      secret,
      GLOBAL_RADAR_LEASE_HMAC_PURPOSE,
      secret,
    );

    expect(
      verifyGlobalRadarBearer(`Bearer ${leasePurposeCredential}`, secret),
    ).toBe(false);
  });
});
