import { z } from "zod";

import {
  MAX_GLOBAL_RADAR_BATCH_BYTES,
  globalRadarValidationProposalSchema,
} from "../../domain/global-radar";
import type { AuthenticatedSession } from "../../../db/repositories/auth-repository";
import { assertSameOrigin, SameOriginError } from "../request-security";
import {
  adminInvalid,
  adminResult,
  failure,
  internalFailure,
  isJsonRequest,
  readBoundedJson,
  workerInvalid,
  workerResult,
} from "./route-response";
import {
  GLOBAL_RADAR_LEASE_HEADER,
  MAX_GLOBAL_RADAR_ADMIN_BODY_BYTES,
  globalRadarAbandonBodySchema,
  globalRadarClaimSelectorSchema,
  globalRadarEntityQualificationBodySchema,
  globalRadarEvidenceBodySchema,
  globalRadarFailBodySchema,
  globalRadarManualRunSchema,
  globalRadarMergeBodySchema,
  globalRadarNoteBodySchema,
  globalRadarPromotionBodySchema,
  globalRadarPromotionReversalBodySchema,
  globalRadarRouteUuidSchema,
  globalRadarSignalPatchSchema,
  globalRadarWatchlistBodySchema,
} from "./route-schemas";
import type { GlobalRadarAdminActor } from "./run-service";

type SessionReader = () => Promise<AuthenticatedSession | null>;
type WorkerAuthorization = Readonly<{ scope: "global-radar-worker" }>;

export type GlobalRadarWorkerRouteService = Readonly<{
  authorizeWorker(authorization: string | null): WorkerAuthorization | null;
  claim(authorization: WorkerAuthorization, value: unknown): Promise<unknown>;
  complete(authorization: WorkerAuthorization, value: unknown): Promise<unknown>;
  fail(authorization: WorkerAuthorization, value: unknown): Promise<unknown>;
  abandon(authorization: WorkerAuthorization, value: unknown): Promise<unknown>;
}>;

export type GlobalRadarAdminRouteService = Readonly<{
  getSignalDetail(actor: GlobalRadarAdminActor, signalId: unknown): Promise<unknown>;
  listRuns(actor: GlobalRadarAdminActor, value: unknown): Promise<unknown>;
  reviewSignal(
    actor: GlobalRadarAdminActor,
    signalId: unknown,
    value: unknown,
  ): Promise<unknown>;
  editClassification(
    actor: GlobalRadarAdminActor,
    signalId: unknown,
    value: unknown,
  ): Promise<unknown>;
  editExpiry(
    actor: GlobalRadarAdminActor,
    signalId: unknown,
    value: unknown,
  ): Promise<unknown>;
  appendEvidence(
    actor: GlobalRadarAdminActor,
    signalId: unknown,
    value: unknown,
  ): Promise<unknown>;
  appendNote(
    actor: GlobalRadarAdminActor,
    signalId: unknown,
    value: unknown,
  ): Promise<unknown>;
  mergeSignals(actor: GlobalRadarAdminActor, value: unknown): Promise<unknown>;
  upsertWatchlist(actor: GlobalRadarAdminActor, value: unknown): Promise<unknown>;
  qualifyEntity(
    actor: GlobalRadarAdminActor,
    entityId: unknown,
    value: unknown,
  ): Promise<unknown>;
  queueManual(actor: GlobalRadarAdminActor, value: unknown): Promise<unknown>;
  promote(actor: GlobalRadarAdminActor, value: unknown): Promise<unknown>;
  reversePromotion(actor: GlobalRadarAdminActor, value: unknown): Promise<unknown>;
}>;

type WorkerDependencies = Readonly<{
  getService(): GlobalRadarWorkerRouteService;
}>;

type AdminDependencies = Readonly<{
  getSession: SessionReader;
  getService(): GlobalRadarAdminRouteService;
}>;

type RouteContext<Key extends string> = Readonly<{
  params: Promise<Record<Key, string>>;
}>;

function authorizeWorker(
  dependencies: WorkerDependencies,
  request: Request,
):
  | {
      service: GlobalRadarWorkerRouteService;
      authorization: WorkerAuthorization;
    }
  | null {
  const service = dependencies.getService();
  const authorization = service.authorizeWorker(
    request.headers.get("authorization"),
  );
  return authorization ? { service, authorization } : null;
}

async function workerBody(request: Request) {
  if (!isJsonRequest(request)) {
    return {
      ok: false as const,
      response: failure(415, "Send an application/json request."),
    };
  }
  return readBoundedJson(
    request,
    MAX_GLOBAL_RADAR_BATCH_BYTES,
    "Global Radar worker request body is too large.",
  );
}

function leaseToken(request: Request): string | null {
  const parsed = z.string().trim().min(1).max(512).safeParse(
    request.headers.get(GLOBAL_RADAR_LEASE_HEADER),
  );
  return parsed.success ? parsed.data : null;
}

export function createGlobalRadarWorkerClaimHandler(
  dependencies: WorkerDependencies,
) {
  return async function POST(request: Request) {
    try {
      const authorized = authorizeWorker(dependencies, request);
      if (!authorized) {
        return failure(401, "Global Radar worker authentication is required.");
      }
      if (request.headers.has(GLOBAL_RADAR_LEASE_HEADER)) {
        return workerInvalid();
      }
      const body = await workerBody(request);
      if (!body.ok) return body.response;
      const parsed = globalRadarClaimSelectorSchema.safeParse(body.value);
      if (!parsed.success) return workerInvalid();
      return workerResult(
        await authorized.service.claim(authorized.authorization, parsed.data),
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarWorkerCompleteHandler(
  dependencies: WorkerDependencies,
) {
  return async function POST(
    request: Request,
    context: RouteContext<"runId">,
  ) {
    try {
      const authorized = authorizeWorker(dependencies, request);
      if (!authorized) {
        return failure(401, "Global Radar worker authentication is required.");
      }
      const body = await workerBody(request);
      if (!body.ok) return body.response;
      const { runId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(runId);
      const lease = leaseToken(request);
      const batch = globalRadarValidationProposalSchema.safeParse(body.value);
      if (
        !id.success ||
        !lease ||
        !batch.success ||
        batch.data.runId !== id.data
      ) {
        return workerInvalid();
      }
      return workerResult(
        await authorized.service.complete(authorized.authorization, {
          runId: id.data,
          leaseToken: lease,
          batch: body.value,
        }),
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarWorkerFailHandler(
  dependencies: WorkerDependencies,
) {
  return async function POST(
    request: Request,
    context: RouteContext<"runId">,
  ) {
    try {
      const authorized = authorizeWorker(dependencies, request);
      if (!authorized) {
        return failure(401, "Global Radar worker authentication is required.");
      }
      const body = await workerBody(request);
      if (!body.ok) return body.response;
      const { runId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(runId);
      const parsed = globalRadarFailBodySchema.safeParse(body.value);
      const lease = leaseToken(request);
      if (!id.success || !parsed.success || !lease || parsed.data.runId !== id.data) {
        return workerInvalid();
      }
      return workerResult(
        await authorized.service.fail(authorized.authorization, {
          ...parsed.data,
          leaseToken: lease,
        }),
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarWorkerAbandonHandler(
  dependencies: WorkerDependencies,
) {
  return async function POST(
    request: Request,
    context: RouteContext<"runId">,
  ) {
    try {
      const authorized = authorizeWorker(dependencies, request);
      if (!authorized) {
        return failure(401, "Global Radar worker authentication is required.");
      }
      const body = await workerBody(request);
      if (!body.ok) return body.response;
      const { runId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(runId);
      const parsed = globalRadarAbandonBodySchema.safeParse(body.value);
      if (
        !id.success ||
        !parsed.success ||
        parsed.data.runId !== id.data ||
        request.headers.has(GLOBAL_RADAR_LEASE_HEADER)
      ) {
        return workerInvalid();
      }
      return workerResult(
        await authorized.service.abandon(authorized.authorization, parsed.data),
      );
    } catch {
      return internalFailure();
    }
  };
}

function actorFrom(session: AuthenticatedSession): GlobalRadarAdminActor {
  return { userId: session.user.id, email: session.user.email };
}

function sameOriginFailure(error: unknown): Response {
  if (!(error instanceof SameOriginError)) throw error;
  return failure(403, "Request origin does not match this site.");
}

async function adminMutationRequest(
  dependencies: AdminDependencies,
  request: Request,
): Promise<
  | {
      ok: true;
      actor: GlobalRadarAdminActor;
      service: GlobalRadarAdminRouteService;
      value: unknown;
    }
  | { ok: false; response: Response }
> {
  try {
    assertSameOrigin(request);
  } catch (error) {
    return { ok: false, response: sameOriginFailure(error) };
  }
  const session = await dependencies.getSession();
  if (!session) {
    return { ok: false, response: failure(401, "Sign in to continue.") };
  }
  if (!isJsonRequest(request)) {
    return {
      ok: false,
      response: failure(415, "Send an application/json request."),
    };
  }
  const body = await readBoundedJson(
    request,
    MAX_GLOBAL_RADAR_ADMIN_BODY_BYTES,
    "Global Radar administrator request body is too large.",
  );
  if (!body.ok) return body;
  return {
    ok: true,
    actor: actorFrom(session),
    service: dependencies.getService(),
    value: body.value,
  };
}

function pageQuery(request: Request): { page: number } | null {
  const params = new URL(request.url).searchParams;
  for (const key of params.keys()) {
    if (key !== "page" || params.getAll(key).length !== 1) return null;
  }
  const raw = params.get("page");
  if (raw === null) return { page: 1 };
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const page = Number(raw);
  return page <= 100 ? { page } : null;
}

async function adminRead(
  dependencies: AdminDependencies,
): Promise<
  | {
      ok: true;
      actor: GlobalRadarAdminActor;
      service: GlobalRadarAdminRouteService;
    }
  | { ok: false; response: Response }
> {
  const session = await dependencies.getSession();
  if (!session) {
    return { ok: false, response: failure(401, "Sign in to continue.") };
  }
  return {
    ok: true,
    actor: actorFrom(session),
    service: dependencies.getService(),
  };
}

export function createGlobalRadarAdminRunsGetHandler(
  dependencies: AdminDependencies,
) {
  return async function GET(request: Request) {
    try {
      const authorized = await adminRead(dependencies);
      if (!authorized.ok) return authorized.response;
      const page = pageQuery(request);
      if (!page) return adminInvalid();
      return adminResult(
        await authorized.service.listRuns(authorized.actor, page),
        {
          successOutcomes: ["listed"],
          successKeys: ["page", "pageSize", "total", "runs"],
        },
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarAdminRunsPostHandler(
  dependencies: AdminDependencies,
) {
  return async function POST(request: Request) {
    try {
      const prepared = await adminMutationRequest(dependencies, request);
      if (!prepared.ok) return prepared.response;
      const parsed = globalRadarManualRunSchema.safeParse(prepared.value);
      if (!parsed.success) return adminInvalid();
      return adminResult(
        await prepared.service.queueManual(prepared.actor, parsed.data),
        {
          successOutcomes: ["queued", "replayed"],
          successKeys: ["run"],
          conflictKeys: ["run"],
        },
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarAdminSignalGetHandler(
  dependencies: AdminDependencies,
) {
  return async function GET(
    request: Request,
    context: RouteContext<"signalId">,
  ) {
    try {
      const authorized = await adminRead(dependencies);
      if (!authorized.ok) return authorized.response;
      if ([...new URL(request.url).searchParams.keys()].length > 0) {
        return adminInvalid();
      }
      const { signalId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(signalId);
      if (!id.success) return adminInvalid();
      return adminResult(
        await authorized.service.getSignalDetail(authorized.actor, id.data),
        {
          successOutcomes: ["found"],
          successKeys: ["detail"],
        },
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarAdminSignalPatchHandler(
  dependencies: AdminDependencies,
) {
  return async function PATCH(
    request: Request,
    context: RouteContext<"signalId">,
  ) {
    try {
      const prepared = await adminMutationRequest(dependencies, request);
      if (!prepared.ok) return prepared.response;
      const { signalId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(signalId);
      const parsed = globalRadarSignalPatchSchema.safeParse(prepared.value);
      if (!id.success || !parsed.success) return adminInvalid();
      const result = "command" in parsed.data
        ? await prepared.service.reviewSignal(
            prepared.actor,
            id.data,
            parsed.data,
          )
        : "classification" in parsed.data
          ? await prepared.service.editClassification(
              prepared.actor,
              id.data,
              parsed.data,
            )
          : await prepared.service.editExpiry(
              prepared.actor,
              id.data,
              parsed.data,
            );
      return adminResult(result, {
        successOutcomes: ["updated", "replayed"],
        successKeys: ["detail"],
        conflictKeys: ["latest"],
      });
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarAdminEvidencePostHandler(
  dependencies: AdminDependencies,
) {
  return async function POST(
    request: Request,
    context: RouteContext<"signalId">,
  ) {
    try {
      const prepared = await adminMutationRequest(dependencies, request);
      if (!prepared.ok) return prepared.response;
      const { signalId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(signalId);
      const parsed = globalRadarEvidenceBodySchema.safeParse(prepared.value);
      if (!id.success || !parsed.success) return adminInvalid();
      return adminResult(
        await prepared.service.appendEvidence(
          prepared.actor,
          id.data,
          parsed.data,
        ),
        {
          successOutcomes: ["appended", "replayed"],
          successKeys: ["revision"],
          conflictKeys: ["latest"],
        },
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarAdminNotePostHandler(
  dependencies: AdminDependencies,
) {
  return async function POST(
    request: Request,
    context: RouteContext<"signalId">,
  ) {
    try {
      const prepared = await adminMutationRequest(dependencies, request);
      if (!prepared.ok) return prepared.response;
      const { signalId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(signalId);
      const parsed = globalRadarNoteBodySchema.safeParse(prepared.value);
      if (!id.success || !parsed.success) return adminInvalid();
      return adminResult(
        await prepared.service.appendNote(prepared.actor, id.data, parsed.data),
        {
          successOutcomes: ["appended", "replayed"],
          successKeys: ["revision"],
          conflictKeys: ["latest"],
        },
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarAdminMergePostHandler(
  dependencies: AdminDependencies,
) {
  return async function POST(
    request: Request,
    context: RouteContext<"signalId">,
  ) {
    try {
      const prepared = await adminMutationRequest(dependencies, request);
      if (!prepared.ok) return prepared.response;
      const { signalId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(signalId);
      const parsed = globalRadarMergeBodySchema.safeParse(prepared.value);
      if (
        !id.success ||
        !parsed.success ||
        parsed.data.survivorSignalId !== id.data
      ) {
        return adminInvalid();
      }
      return adminResult(
        await prepared.service.mergeSignals(prepared.actor, parsed.data),
        {
          successOutcomes: ["merged", "replayed"],
          successKeys: ["survivor", "duplicate"],
          conflictKeys: ["survivor", "duplicate"],
        },
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarAdminWatchlistPatchHandler(
  dependencies: AdminDependencies,
) {
  return async function PATCH(
    request: Request,
    context: RouteContext<"entityId">,
  ) {
    try {
      const prepared = await adminMutationRequest(dependencies, request);
      if (!prepared.ok) return prepared.response;
      const { entityId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(entityId);
      const parsed = globalRadarWatchlistBodySchema.safeParse(prepared.value);
      if (
        !id.success ||
        !parsed.success ||
        parsed.data.entity.entityId !== id.data
      ) {
        return adminInvalid();
      }
      return adminResult(
        await prepared.service.upsertWatchlist(prepared.actor, parsed.data),
        {
          successOutcomes: ["created", "updated", "replayed"],
          successKeys: ["entity", "entry"],
          conflictKeys: ["entity", "entry"],
        },
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarAdminEntityQualificationPatchHandler(
  dependencies: AdminDependencies,
) {
  return async function PATCH(
    request: Request,
    context: RouteContext<"entityId">,
  ) {
    try {
      const prepared = await adminMutationRequest(dependencies, request);
      if (!prepared.ok) return prepared.response;
      const { entityId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(entityId);
      const parsed = globalRadarEntityQualificationBodySchema.safeParse(
        prepared.value,
      );
      if (
        !id.success ||
        !parsed.success ||
        parsed.data.entityId !== id.data
      ) {
        return adminInvalid();
      }
      return adminResult(
        await prepared.service.qualifyEntity(
          prepared.actor,
          id.data,
          parsed.data,
        ),
        {
          successOutcomes: ["updated", "replayed"],
          successKeys: ["entity"],
          conflictKeys: ["entity"],
        },
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarAdminPromotionPostHandler(
  dependencies: AdminDependencies,
) {
  return async function POST(
    request: Request,
    context: RouteContext<"entityId">,
  ) {
    try {
      const prepared = await adminMutationRequest(dependencies, request);
      if (!prepared.ok) return prepared.response;
      const { entityId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(entityId);
      const parsed = globalRadarPromotionBodySchema.safeParse(prepared.value);
      if (!id.success || !parsed.success || parsed.data.entityId !== id.data) {
        return adminInvalid();
      }
      return adminResult(
        await prepared.service.promote(prepared.actor, parsed.data),
        {
          successOutcomes: ["promoted", "replayed"],
          successKeys: ["promotion"],
          conflictKeys: ["promotion"],
        },
      );
    } catch {
      return internalFailure();
    }
  };
}

export function createGlobalRadarAdminPromotionReversePostHandler(
  dependencies: AdminDependencies,
) {
  return async function POST(
    request: Request,
    context: RouteContext<"entityId">,
  ) {
    try {
      const prepared = await adminMutationRequest(dependencies, request);
      if (!prepared.ok) return prepared.response;
      const { entityId } = await context.params;
      const id = globalRadarRouteUuidSchema.safeParse(entityId);
      const parsed = globalRadarPromotionReversalBodySchema.safeParse(prepared.value);
      if (!id.success || !parsed.success || parsed.data.entityId !== id.data) {
        return adminInvalid();
      }
      return adminResult(
        await prepared.service.reversePromotion(prepared.actor, parsed.data),
        {
          successOutcomes: ["reversed", "replayed"],
          successKeys: ["promotion"],
          conflictKeys: ["promotion"],
        },
      );
    } catch {
      return internalFailure();
    }
  };
}
