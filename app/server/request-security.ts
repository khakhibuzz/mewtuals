export class SameOriginError extends Error {
  constructor() {
    super("This request must come from the same origin.");
    this.name = "SameOriginError";
  }
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export function assertSameOrigin(request: Request): void {
  if (!isSameOrigin(request)) throw new SameOriginError();
}

export function requesterIdentityForRequest(
  request: Request,
  environment: "development" | "test" | "production",
): string {
  const connectingIp = normalizeConnectingIp(
    request.headers.get("cf-connecting-ip"),
  );
  if (connectingIp) return `cf:${connectingIp}`;

  if (
    environment !== "production" &&
    isLoopbackHostname(new URL(request.url).hostname)
  ) {
    return "development-loopback";
  }

  return "unknown-requester";
}

function normalizeConnectingIp(value: string | null): string | undefined {
  const normalized = value?.trim();
  if (
    !normalized ||
    normalized.length > 64 ||
    !/^[0-9A-Fa-f:.]+$/.test(normalized)
  ) {
    return undefined;
  }
  return normalized.toLowerCase();
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}
