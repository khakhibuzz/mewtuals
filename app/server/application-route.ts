import { NextResponse } from "next/server";
import { hashToken } from "./tokens";
import { assertSameOrigin, requesterIdentityForRequest, SameOriginError } from "./request-security";
import { jsonFailure, isJsonRequest, readBoundedJson, hasFilledHoneypot, submissionIdForRequest } from "./public-form-request";
import type { ApplicationSubmissionResult } from "./application-service";

export function createApplicationPostHandler(dependencies: {
  environment: "development" | "test" | "production";
  sessionSecret: string;
  submit: (body: unknown, requesterHash: string, submissionId: string) => Promise<ApplicationSubmissionResult>;
}) {
  return async function POST(request: Request) {
    try { assertSameOrigin(request); } catch (error) {
      if (error instanceof SameOriginError) return jsonFailure(403, "Request origin does not match this site.");
      throw error;
    }
    if (!isJsonRequest(request)) return jsonFailure(415, "Send an application/json request.");
    const body = await readBoundedJson(request);
    if (!body.ok) return body.response;
    if (hasFilledHoneypot(body.value)) return jsonFailure(400, "Review your application details.");
    const submissionId = submissionIdForRequest(request);
    if (!submissionId) return jsonFailure(400, "Invalid submission identifier. Refresh this page and try again.");
    try {
      const identity = requesterIdentityForRequest(request, dependencies.environment);
      const requesterHash = hashToken(`application-requester:${identity}`, dependencies.sessionSecret);
      const result = await dependencies.submit(body.value, requesterHash, submissionId);
      return result.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: result.error, ...(result.errors ? {errors:result.errors} : {}) }, {status:result.status});
    } catch {
      return jsonFailure(500, "We could not save your application. Please try again.");
    }
  };
}
