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
