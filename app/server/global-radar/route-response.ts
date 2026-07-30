import { NextResponse } from "next/server";

import { globalRadarSafeRunSchema } from "./route-schemas";

export type JsonRecord = Record<string, unknown>;

const workerConflictReasons = new Set([
  "completion_identity_mismatch",
  "entity_identity_conflict",
  "failure_mismatch",
  "invalid_input",
  "invalid_plan",
  "invalid_state",
  "lease_expired",
  "lease_mismatch",
  "request_mismatch",
]);

const safeAdminReasons = new Set([
  "active_promotion_exists",
  "already_merged",
  "candidate_identity_conflict",
  "candidate_identity_missing",
  "candidate_mapping_invalid",
  "classification_requirements_not_met",
  "duplicate_signal",
  "eligibility_not_met",
  "entity_identity_conflict",
  "idempotency_mismatch",
  "invalid_input",
  "no_active_promotion",
  "not_found",
  "persistence_failure",
  "primary_signal_not_qualified",
  "promotion_reversed",
  "qualification_requirements_not_met",
  "request_mismatch",
  "restoration_not_safe",
  "revision_mismatch",
  "signal_entity_mismatch",
  "source_evidence_missing",
  "supporting_signal_invalid",
  "transition_not_allowed",
  "missing_public_identity_evidence",
  "identifier_conflict",
  "primary_signal_below_threshold",
  "primary_signal_hard_gates_failed",
  "primary_signal_not_india_compatible",
  "primary_signal_not_direct_demand",
  "insufficient_repeated_signals",
  "missing_documented_indian_relationship",
  "entity_not_qualified",
  "insufficient_independent_primary_sources",
]);

export function noStoreJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function failure(status: number, error: string) {
  return noStoreJson({ ok: false, error }, status);
}

export function internalFailure() {
  return failure(500, "We could not complete that request. Please try again.");
}

export function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isJsonRequest(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

function declaredBodyTooLarge(request: Request, maximumBytes: number): boolean {
  const value = request.headers.get("content-length");
  if (value === null) return false;
  if (!/^\d+$/.test(value.trim())) return true;
  return Number(value) > maximumBytes;
}

export async function readBoundedJson(
  request: Request,
  maximumBytes: number,
  oversizedMessage: string,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
  if (declaredBodyTooLarge(request, maximumBytes)) {
    return { ok: false, response: failure(413, oversizedMessage) };
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return { ok: false, response: failure(400, "Submit valid JSON.") };
  }
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > maximumBytes) {
      await reader.cancel().catch(() => undefined);
      return { ok: false, response: failure(413, oversizedMessage) };
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
    return {
      ok: true,
      value: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    };
  } catch {
    return { ok: false, response: failure(400, "Submit valid JSON.") };
  }
}

export function workerInvalid() {
  return noStoreJson(
    {
      ok: false,
      outcome: "invalid",
      error: "Submit a valid Global Radar worker request.",
    },
    400,
  );
}

export function safeRun(value: unknown) {
  const parsed = globalRadarSafeRunSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function workerResult(value: unknown): Response {
  if (!isRecord(value) || typeof value.outcome !== "string") {
    return internalFailure();
  }
  if (value.outcome === "claimed" && isRecord(value.claim)) {
    return noStoreJson({ ok: true, outcome: "claimed", claim: value.claim });
  }
  if (value.outcome === "no_work") {
    if (
      !["active_run", "empty_queue", "active_race"].includes(
        String(value.reason),
      )
    ) {
      return internalFailure();
    }
    const run = safeRun(value.run);
    return noStoreJson({
      ok: true,
      outcome: "no_work",
      reason: value.reason,
      ...(run ? { run } : {}),
    });
  }
  if (value.outcome === "completed" || value.outcome === "replayed") {
    const run = safeRun(value.run);
    if (!run) return internalFailure();
    return noStoreJson({ ok: true, outcome: value.outcome, run });
  }
  if (value.outcome === "unauthorized") {
    return failure(401, "Global Radar worker authentication is required.");
  }
  if (value.outcome === "invalid") return workerInvalid();
  if (value.outcome === "not_found") {
    return noStoreJson(
      {
        ok: false,
        outcome: "not_found",
        error: "Global Radar run was not found.",
      },
      404,
    );
  }
  if (value.outcome === "conflict") {
    const reason = workerConflictReasons.has(String(value.reason))
      ? String(value.reason)
      : "invalid_input";
    const run = safeRun(value.run);
    return noStoreJson(
      {
        ok: false,
        outcome: "conflict",
        reason,
        ...(run ? { run } : {}),
      },
      409,
    );
  }
  return internalFailure();
}

export function adminInvalid() {
  return noStoreJson(
    {
      ok: false,
      outcome: "invalid",
      error: "Submit a valid Global Radar administrator request.",
    },
    400,
  );
}

function selectedResult(
  source: JsonRecord,
  keys: readonly string[],
): JsonRecord {
  const selected: JsonRecord = {};
  for (const key of keys) {
    if (!Object.hasOwn(source, key)) continue;
    if (key === "run") {
      const run = safeRun(source.run);
      if (run) selected.run = run;
      continue;
    }
    if (key === "runs") {
      if (!Array.isArray(source.runs)) continue;
      const runs = source.runs.map(safeRun);
      if (runs.every(Boolean)) selected.runs = runs;
      continue;
    }
    if (key === "reason") {
      selected.reason = safeAdminReasons.has(String(source.reason))
        ? String(source.reason)
        : "invalid_input";
      continue;
    }
    if (key === "httpStatus") {
      if (source.httpStatus === 409) selected.httpStatus = 409;
      continue;
    }
    selected[key] = source[key];
  }
  return selected;
}

export function adminResult(
  value: unknown,
  options: Readonly<{
    successOutcomes: readonly string[];
    successKeys: readonly string[];
    conflictKeys?: readonly string[];
  }>,
): Response {
  if (!isRecord(value) || typeof value.outcome !== "string") {
    return internalFailure();
  }
  if (options.successOutcomes.includes(value.outcome)) {
    return noStoreJson({
      ok: true,
      ...selectedResult(value, ["outcome", ...options.successKeys]),
    });
  }
  if (value.outcome === "forbidden") {
    return noStoreJson(
      {
        ok: false,
        outcome: "forbidden",
        error: "Administrator access is required.",
      },
      403,
    );
  }
  if (value.outcome === "invalid") return adminInvalid();
  if (value.outcome === "not_found") {
    return noStoreJson(
      {
        ok: false,
        outcome: "not_found",
        error: "Global Radar record was not found.",
      },
      404,
    );
  }
  if (value.outcome === "conflict") {
    return noStoreJson(
      {
        ok: false,
        ...selectedResult(value, [
          "outcome",
          "reason",
          "httpStatus",
          ...(options.conflictKeys ?? []),
        ]),
      },
      409,
    );
  }
  if (value.outcome === "ineligible") {
    return noStoreJson(
      {
        ok: false,
        ...selectedResult(value, ["outcome", "reason"]),
      },
      409,
    );
  }
  if (value.outcome === "failed") {
    return noStoreJson(
      {
        ok: false,
        ...selectedResult(value, ["outcome", "reason", "promotion"]),
      },
      500,
    );
  }
  return internalFailure();
}
