import { createHmac, timingSafeEqual } from "node:crypto";

function hmacDigest(secret: string, purpose: string, value: string): Buffer {
  return createHmac("sha256", secret)
    .update(purpose)
    .update("\0")
    .update(value)
    .digest();
}

export function hashDiscoveryToken(secret: string, token: string): string {
  return hmacDigest(secret, "discovery-lease", token).toString("hex");
}

export function verifyDiscoveryBearer(
  authorization: string | null,
  expectedSecret: string,
): boolean {
  const match = /^Bearer ([^\s]+)$/.exec(authorization ?? "");
  if (!match) return false;

  const suppliedDigest = hmacDigest(
    expectedSecret,
    "discovery-worker",
    match[1]!,
  );
  const expectedDigest = hmacDigest(
    expectedSecret,
    "discovery-worker",
    expectedSecret,
  );
  return timingSafeEqual(suppliedDigest, expectedDigest);
}
