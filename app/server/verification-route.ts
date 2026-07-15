import { NextResponse } from "next/server";

import type { AuthenticatedSession } from "../../db/repositories/auth-repository";
import {
  assertSameOrigin,
  isLoopbackHostname,
  SameOriginError,
} from "./request-security";
import type { VerificationActor } from "./verification-service";

type SessionReader = () => Promise<AuthenticatedSession | null>;
type VerificationResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; status: number; error: string; [key: string]: unknown };

const actorFrom = (session: AuthenticatedSession): VerificationActor => ({
  userId: session.user.id,
  email: session.user.email,
});

function sameOriginFailure(error: unknown) {
  if (!(error instanceof SameOriginError)) throw error;
  return NextResponse.json(
    { ok: false, error: "Request origin does not match this site." },
    { status: 403 },
  );
}

export function createAdminVerificationHandler(dependencies: {
  getSession: SessionReader;
  review: (
    actor: VerificationActor,
    profileId: string,
    body: unknown,
  ) => Promise<VerificationResult>;
}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ profileId: string }> },
  ) {
    try {
      assertSameOrigin(request);
    } catch (error) {
      return sameOriginFailure(error);
    }

    const session = await dependencies.getSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Sign in to continue." },
        { status: 401 },
      );
    }
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "Submit a valid review." },
        { status: 400 },
      );
    }

    const { profileId } = await context.params;
    const result = await dependencies.review(actorFrom(session), profileId, body);
    return NextResponse.json(result, {
      status: result.ok ? 200 : result.status,
    });
  };
}

export function createDevelopmentApprovalHandler(dependencies: {
  environment: "development" | "test" | "production";
  developmentAuthEnabled: boolean;
  getSession: SessionReader;
  approve: (actor: VerificationActor) => Promise<VerificationResult>;
}) {
  return async function POST(request: Request) {
    try {
      assertSameOrigin(request);
    } catch (error) {
      return sameOriginFailure(error);
    }

    if (
      dependencies.environment === "production" ||
      !dependencies.developmentAuthEnabled ||
      !isLoopbackHostname(new URL(request.url).hostname)
    ) {
      return NextResponse.json(
        { ok: false, error: "Not found." },
        { status: 404 },
      );
    }

    const session = await dependencies.getSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Sign in to continue." },
        { status: 401 },
      );
    }

    const result = await dependencies.approve(actorFrom(session));
    return NextResponse.json(
      result.ok ? { ...result, nextPath: "/dashboard" } : result,
      { status: result.ok ? 200 : result.status },
    );
  };
}
