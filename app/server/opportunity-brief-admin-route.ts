import { NextResponse } from "next/server";
import { z } from "zod";

import type { AuthenticatedSession } from "../../db/repositories/auth-repository";
import {
  opportunityBriefParticipantTypeSchema,
  opportunityBriefStatusSchema,
} from "../domain/opportunity-brief";
import { assertSameOrigin, SameOriginError } from "./request-security";
import type {
  AdminRequest,
  AdminSnapshot,
  OpportunityBriefAdminActor,
} from "./opportunity-brief-service";

const MAX_ADMIN_MUTATION_BYTES = 8 * 1_024;
const MAX_ADMIN_NOTES_LENGTH = 5_000;
const requestIdSchema = z.uuid();
const expectedUpdatedAtSchema = z.string().datetime({ offset: true });
const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
  });
const positiveIntegerSchema = z
  .string()
  .regex(/^[1-9]\d*$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(100));

type SessionReader = () => Promise<AuthenticatedSession | null>;
type AdminHttpResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; status: number; error: string; [key: string]: unknown };

const actorFrom = (session: AuthenticatedSession): OpportunityBriefAdminActor => ({
  userId: session.user.id,
  email: session.user.email,
});

export type SerializedOpportunityBriefRequest = ReturnType<
  typeof serializeOpportunityBriefRequest
>;

export function serializeOpportunityBriefRequest(request: AdminRequest) {
  return {
    id: request.id,
    participantType: request.participantType,
    profileUrl: request.profileUrl,
    email: request.email,
    phoneNumber: request.phoneNumber,
    openToText: request.openToText,
    source: request.source,
    utm: request.utm,
    linkedCandidateId: request.linkedCandidateId,
    status: request.status,
    adminNotes: request.adminNotes,
    acknowledgementStatus: request.acknowledgementStatus,
    acknowledgementSentAt: request.acknowledgementSentAt?.toISOString() ?? null,
    acknowledgementError: request.acknowledgementError,
    submissionCount: request.submissionCount,
    lastSubmittedAt: request.lastSubmittedAt.toISOString(),
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export function serializeOpportunityBriefAdminSnapshot(snapshot: AdminSnapshot) {
  const requests = snapshot.requests.map(serializeOpportunityBriefRequest);
  return {
    summary: {
      ...snapshot.summary,
      unlinked: Math.max(0, snapshot.summary.total - snapshot.summary.linkedCandidates),
      acknowledgementPending: snapshot.summary.pendingAcknowledgements,
      acknowledgementFailed: snapshot.summary.failedAcknowledgements,
    },
    requests,
    page: snapshot.page,
    pageSize: snapshot.pageSize,
    totalPages: snapshot.totalPages,
  };
}

function jsonFailure(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function signedOutFailure() {
  return jsonFailure(401, "Sign in to continue.");
}

function invalidRequestFailure() {
  return jsonFailure(400, "Submit a valid Opportunity Brief administrator request.");
}

function serviceResponse(result: AdminHttpResult) {
  if (result.ok) {
    const request = "request" in result ? result.request : undefined;
    return NextResponse.json(
      request && typeof request === "object"
        ? { ok: true, request: serializeOpportunityBriefRequest(request as AdminRequest) }
        : result,
      { status: 200 },
    );
  }
  const request = "request" in result ? result.request : undefined;
  return NextResponse.json(
    {
      ok: false,
      error: result.error,
      ...("errors" in result ? { errors: result.errors } : {}),
      ...(request && typeof request === "object"
        ? { request: serializeOpportunityBriefRequest(request as AdminRequest) }
        : {}),
    },
    { status: result.status },
  );
}

function sameOriginFailure(error: unknown) {
  if (!(error instanceof SameOriginError)) throw error;
  return jsonFailure(403, "Request origin does not match this site.");
}

type ListFilters = {
  participantType?: string;
  status?: string;
  source?: string;
  submittedFrom?: string;
  submittedTo?: string;
  linked?: boolean;
  page?: number;
  pageSize?: number;
};

function parseFilters(url: URL): ListFilters | null {
  const supported = new Set([
    "participantType",
    "status",
    "source",
    "from",
    "to",
    "linked",
    "page",
    "pageSize",
  ]);
  for (const key of url.searchParams.keys()) {
    if (!supported.has(key) || url.searchParams.getAll(key).length !== 1) return null;
  }
  const filters: ListFilters = {};
  for (const [key, value] of url.searchParams) {
    if (!value.trim()) return null;
    if (key === "participantType") {
      const parsed = opportunityBriefParticipantTypeSchema.safeParse(value);
      if (!parsed.success) return null;
      filters.participantType = parsed.data;
    } else if (key === "status") {
      const parsed = opportunityBriefStatusSchema.safeParse(value);
      if (!parsed.success) return null;
      filters.status = parsed.data;
    } else if (key === "source") {
      if (value.length > 100) return null;
      filters.source = value;
    } else if (key === "from" || key === "to") {
      const parsed = calendarDateSchema.safeParse(value);
      if (!parsed.success) return null;
      filters[key === "from" ? "submittedFrom" : "submittedTo"] = parsed.data;
    } else if (key === "linked") {
      if (value !== "linked" && value !== "unlinked") return null;
      filters.linked = value === "linked";
    } else if (key === "page" || key === "pageSize") {
      const parsed = positiveIntegerSchema.safeParse(value);
      if (!parsed.success) return null;
      filters[key] = parsed.data;
    }
  }
  return filters;
}

export function createOpportunityBriefAdminGetHandler(dependencies: {
  getSession: SessionReader;
  list: (
    actor: OpportunityBriefAdminActor,
    filters: ListFilters,
  ) => Promise<AdminHttpResult>;
}) {
  return async function GET(request: Request) {
    const session = await dependencies.getSession();
    if (!session) return signedOutFailure();
    const filters = parseFilters(new URL(request.url));
    if (!filters) return invalidRequestFailure();
    const result = await dependencies.list(actorFrom(session), filters);
    if (!result.ok) return serviceResponse(result);
    const snapshot = result.snapshot;
    if (!snapshot || typeof snapshot !== "object") {
      return jsonFailure(500, "We could not complete that request. Please try again.");
    }
    return NextResponse.json({
      ok: true,
      snapshot: serializeOpportunityBriefAdminSnapshot(snapshot as AdminSnapshot),
    });
  };
}

function isJsonRequest(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

async function readBoundedJson(request: Request): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: ReturnType<typeof NextResponse.json> }
> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ADMIN_MUTATION_BYTES) {
    return { ok: false, response: jsonFailure(413, "Administrator request body is too large.") };
  }
  const reader = request.body?.getReader();
  if (!reader) return { ok: false, response: invalidRequestFailure() };
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_ADMIN_MUTATION_BYTES) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, response: jsonFailure(413, "Administrator request body is too large.") };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return {
      ok: true,
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    };
  } catch {
    return { ok: false, response: jsonFailure(400, "Submit valid JSON.") };
  }
}

type MutationAction =
  | { kind: "status"; body: { expectedUpdatedAt: string; status: string } }
  | { kind: "notes"; body: { expectedUpdatedAt: string; notes: string | null } }
  | { kind: "link"; body: { expectedUpdatedAt: string; candidateId: string } }
  | { kind: "unlink"; body: { expectedUpdatedAt: string } };

function parseMutation(value: unknown): MutationAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const expected = expectedUpdatedAtSchema.safeParse(body.expectedUpdatedAt);
  if (!expected.success) return null;
  const actions = ["status", "notes", "linkedCandidateId", "unlink"].filter(
    (key) => Object.hasOwn(body, key),
  );
  if (actions.length !== 1) return null;
  const allowedKeys = new Set(["expectedUpdatedAt", actions[0]]);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) return null;
  const action = actions[0];
  if (action === "status") {
    const status = opportunityBriefStatusSchema.safeParse(body.status);
    return status.success
      ? { kind: "status", body: { expectedUpdatedAt: expected.data, status: status.data } }
      : null;
  }
  if (action === "notes") {
    if (
      body.notes !== null &&
      (typeof body.notes !== "string" || body.notes.length > MAX_ADMIN_NOTES_LENGTH)
    ) return null;
    return {
      kind: "notes",
      body: { expectedUpdatedAt: expected.data, notes: body.notes as string | null },
    };
  }
  if (action === "linkedCandidateId") {
    const candidateId = z.uuid().safeParse(body.linkedCandidateId);
    return candidateId.success
      ? { kind: "link", body: { expectedUpdatedAt: expected.data, candidateId: candidateId.data } }
      : null;
  }
  return body.unlink === true
    ? { kind: "unlink", body: { expectedUpdatedAt: expected.data } }
    : null;
}

type Mutation = (
  actor: OpportunityBriefAdminActor,
  requestId: string,
  body: Record<string, unknown>,
) => Promise<AdminHttpResult>;

export function createOpportunityBriefAdminPatchHandler(dependencies: {
  getSession: SessionReader;
  updateStatus: Mutation;
  updateNotes: Mutation;
  linkCandidate: Mutation;
  unlinkCandidate: Mutation;
}) {
  return async function PATCH(
    request: Request,
    context: { params: Promise<{ requestId: string }> },
  ) {
    try {
      assertSameOrigin(request);
    } catch (error) {
      return sameOriginFailure(error);
    }
    const session = await dependencies.getSession();
    if (!session) return signedOutFailure();
    if (!isJsonRequest(request)) {
      return jsonFailure(415, "Send an application/json request.");
    }
    const { requestId } = await context.params;
    if (!requestIdSchema.safeParse(requestId).success) return invalidRequestFailure();
    const decoded = await readBoundedJson(request);
    if (!decoded.ok) return decoded.response;
    const action = parseMutation(decoded.value);
    if (!action) return invalidRequestFailure();
    const actor = actorFrom(session);
    const result =
      action.kind === "status"
        ? await dependencies.updateStatus(actor, requestId, action.body)
        : action.kind === "notes"
          ? await dependencies.updateNotes(actor, requestId, action.body)
          : action.kind === "link"
            ? await dependencies.linkCandidate(actor, requestId, action.body)
            : await dependencies.unlinkCandidate(actor, requestId, action.body);
    return serviceResponse(result);
  };
}
