import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NextResponse } from "next/server";
import { MAX_OPPORTUNITY_BRIEF_BODY_BYTES } from "../domain/opportunity-brief";

export function jsonFailure(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

export function isJsonRequest(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

export function declaredBodyTooLarge(request: Request): boolean {
  const header = request.headers.get("content-length");
  if (header === null) return false;
  const length = Number(header);
  return Number.isFinite(length) && length > MAX_OPPORTUNITY_BRIEF_BODY_BYTES;
}

export async function readBoundedJson(
  request: Request,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: ReturnType<typeof NextResponse.json> }
> {
  if (declaredBodyTooLarge(request)) {
    try {
      await request.body?.cancel();
    } catch {
      // The response remains a bounded rejection even if the client stream
      // cannot be cancelled.
    }
    return {
      ok: false,
      response: jsonFailure(413, "Submission body is too large."),
    };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return { ok: false, response: jsonFailure(400, "Submit valid JSON.") };
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_OPPORTUNITY_BRIEF_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Preserve the primary size-limit response.
        }
        return {
          ok: false,
          response: jsonFailure(
            413,
            "Submission body is too large.",
          ),
        };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, response: jsonFailure(400, "Submit valid JSON.") };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // A reader implementation must not mask the bounded public response.
    }
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
    return { ok: false, response: jsonFailure(400, "Submit valid JSON.") };
  }
}

export function hasFilledHoneypot(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const website = (value as Record<string, unknown>).website;
  return typeof website === "string" && website.length > 0;
}


export function submissionIdForRequest(request: Request): string | null {
  const supplied = request.headers.get("Idempotency-Key");
  if (supplied === null) return randomUUID();
  const parsed = z.uuid().safeParse(supplied);
  return parsed.success ? parsed.data : null;
}
