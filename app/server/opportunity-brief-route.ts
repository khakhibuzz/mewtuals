import { NextResponse } from "next/server";

import { jsonFailure, isJsonRequest, readBoundedJson, hasFilledHoneypot, submissionIdForRequest } from "./public-form-request";
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
    submissionId: string,
  ) => Promise<PublicSubmissionResult>;
};

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

    const submissionId = submissionIdForRequest(request);
    if (!submissionId) return jsonFailure(400, "Invalid submission identifier. Refresh this page and try again.");

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
        await dependencies.submit(body.value, requesterHash, submissionId),
      );
    } catch {
      return jsonFailure(
        500,
        "We could not save your request. Please try again.",
      );
    }
  };
}
