import { createHmac, timingSafeEqual } from "node:crypto";

export const GLOBAL_RADAR_WORKER_HMAC_PURPOSE =
  "global-radar-worker-v1" as const;
export const GLOBAL_RADAR_LEASE_HMAC_PURPOSE =
  "global-radar-lease-v1" as const;

function hmacDigest(secret: string, purpose: string, value: string): Buffer {
  return createHmac("sha256", secret)
    .update(purpose)
    .update("\0")
    .update(value)
    .digest();
}

export function hashGlobalRadarLeaseToken(
  secret: string,
  leaseToken: string,
): string {
  return hmacDigest(
    secret,
    GLOBAL_RADAR_LEASE_HMAC_PURPOSE,
    leaseToken,
  ).toString("hex");
}

export function verifyGlobalRadarBearer(
  authorization: string | null,
  expectedSecret: string,
): boolean {
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? "");
  if (!match) return false;

  const suppliedDigest = hmacDigest(
    expectedSecret,
    GLOBAL_RADAR_WORKER_HMAC_PURPOSE,
    match[1]!,
  );
  const expectedDigest = hmacDigest(
    expectedSecret,
    GLOBAL_RADAR_WORKER_HMAC_PURPOSE,
    expectedSecret,
  );
  return timingSafeEqual(suppliedDigest, expectedDigest);
}
