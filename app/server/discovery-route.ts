import { NextResponse } from "next/server";

import { MAX_DISCOVERY_BATCH_BYTES } from "../domain/discovery";
import type { AuthenticatedSession } from "../../db/repositories/auth-repository";
import { assertSameOrigin, SameOriginError } from "./request-security";
import type {
  DiscoveryAdminActor,
  DiscoveryClaimSelector,
} from "./discovery-service";

type DiscoveryHttpResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; status: number; error: string; [key: string]: unknown };

type SessionReader = () => Promise<AuthenticatedSession | null>;

function discoveryResponse(result: DiscoveryHttpResult) {
  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}

function sameOriginFailure(error: unknown) {
  if (!(error instanceof SameOriginError)) throw error;
  return NextResponse.json(
    { ok: false, error: "Request origin does not match this site." },
    { status: 403 },
  );
}

function actorFrom(session: AuthenticatedSession): DiscoveryAdminActor {
  return { userId: session.user.id, email: session.user.email };
}

function signedOutFailure() {
  return NextResponse.json(
    { ok: false, error: "Sign in to continue." },
    { status: 401 },
  );
}

function workerAuthenticationFailure() {
  return NextResponse.json(
    { ok: false, error: "Worker authentication is required." },
    { status: 401 },
  );
}

function isJsonRequest(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

function jsonContentTypeFailure() {
  return NextResponse.json(
    { ok: false, error: "Send an application/json request." },
    { status: 415 },
  );
}

function declaredBodyTooLarge(request: Request): boolean {
  const value = request.headers.get("content-length");
  if (value === null) return false;
  const length = Number(value);
  return Number.isFinite(length) && length > MAX_DISCOVERY_BATCH_BYTES;
}

function bodyTooLargeFailure() {
  return NextResponse.json(
    { ok: false, error: "Discovery request body is too large." },
    { status: 413 },
  );
}

function malformedJsonFailure() {
  return NextResponse.json(
    { ok: false, error: "Submit valid JSON." },
    { status: 400 },
  );
}

function invalidWorkerRequestFailure() {
  return NextResponse.json(
    { ok: false, error: "Submit a valid worker request." },
    { status: 400 },
  );
}

async function readBoundedWorkerJson(
  request: Request,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: ReturnType<typeof NextResponse.json> }
> {
  if (declaredBodyTooLarge(request)) {
    return { ok: false, response: bodyTooLargeFailure() };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false, response: malformedJsonFailure() };
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_DISCOVERY_BATCH_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, response: bodyTooLargeFailure() };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, response: malformedJsonFailure() };
  }
}

export function createWorkerClaimHandler(dependencies: {
  authenticateWorker: (authorization: string | null) => boolean;
  claim: (selector: DiscoveryClaimSelector) => Promise<DiscoveryHttpResult>;
}) {
  return async function POST(request: Request) {
    if (!dependencies.authenticateWorker(request.headers.get("authorization"))) {
      return workerAuthenticationFailure();
    }
    if (!isJsonRequest(request)) return jsonContentTypeFailure();
    const body = await readBoundedWorkerJson(request);
    if (!body.ok) return body.response;
    if (
      !body.value ||
      typeof body.value !== "object" ||
      Array.isArray(body.value) ||
      Object.keys(body.value).some(
        (key) => key !== "trigger" && key !== "preset",
      )
    ) {
      return invalidWorkerRequestFailure();
    }
    const trigger = (body.value as { trigger?: unknown }).trigger ?? "scheduled";
    const preset = (body.value as { preset?: unknown }).preset;
    if (trigger !== "scheduled" && trigger !== "trial") {
      return invalidWorkerRequestFailure();
    }
    if (
      (preset !== undefined && preset !== "robotics-seed") ||
      (preset !== undefined && trigger !== "trial")
    ) {
      return invalidWorkerRequestFailure();
    }
    return discoveryResponse(
      await dependencies.claim({
        trigger,
        ...(preset === "robotics-seed" ? { preset } : {}),
      }),
    );
  };
}

export function createWorkerCompleteHandler(dependencies: {
  authenticateWorker: (authorization: string | null) => boolean;
  complete: (runId: string, body: unknown) => Promise<DiscoveryHttpResult>;
}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ runId: string }> },
  ) {
    if (!dependencies.authenticateWorker(request.headers.get("authorization"))) {
      return workerAuthenticationFailure();
    }
    if (!isJsonRequest(request)) return jsonContentTypeFailure();
    const body = await readBoundedWorkerJson(request);
    if (!body.ok) return body.response;
    const { runId } = await context.params;
    if (
      !body.value ||
      typeof body.value !== "object" ||
      Array.isArray(body.value) ||
      (body.value as { runId?: unknown }).runId !== runId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Discovery route and batch run ids must match.",
        },
        { status: 400 },
      );
    }
    return discoveryResponse(await dependencies.complete(runId, body.value));
  };
}

export function createWorkerFailHandler(dependencies: {
  authenticateWorker: (authorization: string | null) => boolean;
  fail: (runId: string, body: unknown) => Promise<DiscoveryHttpResult>;
}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ runId: string }> },
  ) {
    if (!dependencies.authenticateWorker(request.headers.get("authorization"))) {
      return workerAuthenticationFailure();
    }
    if (!isJsonRequest(request)) return jsonContentTypeFailure();
    const body = await readBoundedWorkerJson(request);
    if (!body.ok) return body.response;
    const { runId } = await context.params;
    if (
      !body.value ||
      typeof body.value !== "object" ||
      Array.isArray(body.value) ||
      (body.value as { runId?: unknown }).runId !== runId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Discovery route and failure run ids must match.",
        },
        { status: 400 },
      );
    }
    return discoveryResponse(await dependencies.fail(runId, body.value));
  };
}

export function createWorkerAbandonHandler(dependencies: {
  authenticateWorker: (authorization: string | null) => boolean;
  abandon: (runId: string, body: unknown) => Promise<DiscoveryHttpResult>;
}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ runId: string }> },
  ) {
    if (!dependencies.authenticateWorker(request.headers.get("authorization"))) {
      return workerAuthenticationFailure();
    }
    if (!isJsonRequest(request)) return jsonContentTypeFailure();
    const body = await readBoundedWorkerJson(request);
    if (!body.ok) return body.response;
    const { runId } = await context.params;
    if (
      !body.value ||
      typeof body.value !== "object" ||
      Array.isArray(body.value) ||
      (body.value as { runId?: unknown }).runId !== runId
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Discovery route and abandonment run ids must match.",
        },
        { status: 400 },
      );
    }
    return discoveryResponse(await dependencies.abandon(runId, body.value));
  };
}

export function createAdminDiscoveryRunsPostHandler(dependencies: {
  getSession: SessionReader;
  queue: (actor: DiscoveryAdminActor) => Promise<DiscoveryHttpResult>;
}) {
  return async function POST(request: Request) {
    try {
      assertSameOrigin(request);
    } catch (error) {
      return sameOriginFailure(error);
    }
    const session = await dependencies.getSession();
    if (!session) return signedOutFailure();
    return discoveryResponse(await dependencies.queue(actorFrom(session)));
  };
}

export function createAdminDiscoveryRunsGetHandler(dependencies: {
  getSession: SessionReader;
  list: (
    actor: DiscoveryAdminActor,
    filters: Record<string, string>,
  ) => Promise<DiscoveryHttpResult>;
}) {
  return async function GET(request: Request) {
    const session = await dependencies.getSession();
    if (!session) return signedOutFailure();
    const filters = Object.fromEntries(new URL(request.url).searchParams.entries());
    return discoveryResponse(
      await dependencies.list(actorFrom(session), filters),
    );
  };
}

export function createAdminDiscoveryCandidateHandler(dependencies: {
  getSession: SessionReader;
  update: (
    actor: DiscoveryAdminActor,
    candidateId: string,
    body: unknown,
  ) => Promise<DiscoveryHttpResult>;
}) {
  return async function PATCH(
    request: Request,
    context: { params: Promise<{ candidateId: string }> },
  ) {
    try {
      assertSameOrigin(request);
    } catch (error) {
      return sameOriginFailure(error);
    }
    const session = await dependencies.getSession();
    if (!session) return signedOutFailure();
    if (!isJsonRequest(request)) return jsonContentTypeFailure();
    const body = await readBoundedWorkerJson(request);
    if (!body.ok) return body.response;
    const { candidateId } = await context.params;
    return discoveryResponse(
      await dependencies.update(actorFrom(session), candidateId, body.value),
    );
  };
}

export function createAdminDiscoveryCandidateResearchHandler(dependencies: {
  getSession: SessionReader;
  getResearch: (
    actor: DiscoveryAdminActor,
    candidateId: string,
  ) => Promise<DiscoveryHttpResult>;
}) {
  return async function GET(
    _request: Request,
    context: { params: Promise<{ candidateId: string }> },
  ) {
    const session = await dependencies.getSession();
    if (!session) return signedOutFailure();
    const { candidateId } = await context.params;
    return discoveryResponse(
      await dependencies.getResearch(actorFrom(session), candidateId),
    );
  };
}
