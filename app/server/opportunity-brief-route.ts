import { NextResponse } from "next/server";

import { MAX_OPPORTUNITY_BRIEF_BODY_BYTES } from "../domain/opportunity-brief";
import {
  assertSameOrigin,
  requesterIdentityForRequest,
  SameOriginError,
} from "./request-security";
import { hashToken } from "./tokens";
import type { PublicSubmissionResult } from "./opportunity-brief-service";

type OpportunityBriefPostDependencies = {
  environment: "development" | "test" | "production";
  sessionSecret: string;
  submit: (
    body: unknown,
    requesterHash: string,
  ) => Promise<PublicSubmissionResult>;
};

function jsonFailure(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

function isJsonRequest(request: Request): boolean {
  return (
    request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ===
    "application/json"
  );
}

function declaredBodyTooLarge(request: Request): boolean {
  const header = request.headers.get("content-length");
  if (header === null) return false;
  const length = Number(header);
  return Number.isFinite(length) && length > MAX_OPPORTUNITY_BRIEF_BODY_BYTES;
}

async function readBoundedJson(
  request: Request,
): Promise<
  | { ok: true; value: unknown }
  | { ok: false; response: ReturnType<typeof NextResponse.json> }
> {
  if (declaredBodyTooLarge(request)) {
    return {
      ok: false,
      response: jsonFailure(413, "Opportunity Brief request body is too large."),
    };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    return { ok: false, response: jsonFailure(400, "Submit valid JSON.") };
  }

  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_OPPORTUNITY_BRIEF_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      return {
        ok: false,
        response: jsonFailure(
          413,
          "Opportunity Brief request body is too large.",
        ),
      };
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
    return { ok: false, response: jsonFailure(400, "Submit valid JSON.") };
  }
}

function hasFilledHoneypot(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const website = (value as Record<string, unknown>).website;
  return typeof website === "string" && website.length > 0;
}

function publicResponse(result: PublicSubmissionResult) {
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        ...(result.errors ? { errors: result.errors } : {}),
      },
      { status: result.status },
    );
  }

  return NextResponse.json({
    ok: true,
    requestId: result.requestId,
    status: result.status,
    submission: {
      participantType: result.submission.participantType,
      profileUrl: result.submission.profileUrl,
      email: result.submission.email,
      phoneNumber: result.submission.phoneNumber,
      openToText: result.submission.openToText,
      source: result.submission.source,
      utm: result.submission.utm,
    },
  });
}

export function requesterHashForOpportunityBrief(
  requesterIdentity: string,
  sessionSecret: string,
): string {
  return hashToken(
    `opportunity-brief-requester:${requesterIdentity}`,
    sessionSecret,
  );
}

export function createOpportunityBriefPostHandler(
  dependencies: OpportunityBriefPostDependencies,
) {
  return async function POST(request: Request) {
    try {
      assertSameOrigin(request);
    } catch (error) {
      if (error instanceof SameOriginError) {
        return jsonFailure(403, "Request origin does not match this site.");
      }
      throw error;
    }

    if (!isJsonRequest(request)) {
      return jsonFailure(415, "Send an application/json request.");
    }

    const body = await readBoundedJson(request);
    if (!body.ok) return body.response;
    if (hasFilledHoneypot(body.value)) {
      return jsonFailure(400, "Review the Opportunity Brief request.");
    }

    try {
      const requesterIdentity = requesterIdentityForRequest(
        request,
        dependencies.environment,
      );
      const requesterHash = requesterHashForOpportunityBrief(
        requesterIdentity,
        dependencies.sessionSecret,
      );
      return publicResponse(
        await dependencies.submit(body.value, requesterHash),
      );
    } catch {
      return jsonFailure(
        500,
        "We could not save your request. Please try again.",
      );
    }
  };
}
