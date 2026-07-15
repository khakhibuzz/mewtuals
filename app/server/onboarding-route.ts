import { NextResponse } from "next/server";

import type { AuthenticatedSession } from "../../db/repositories/auth-repository";
import { assertSameOrigin, SameOriginError } from "./request-security";

type SessionReader = () => Promise<AuthenticatedSession | null>;

type ProtectedPageResolution =
  | { redirectTo: string }
  | { userId: string };

export function resolveProtectedPage(
  session: AuthenticatedSession | null,
  requestedPath: string,
  nextPath: string,
): ProtectedPageResolution {
  if (!session) return { redirectTo: "/login" };
  if (requestedPath !== nextPath) return { redirectTo: nextPath };
  return { userId: session.user.id };
}

export function createProtectedOnboardingHandler<
  Result extends { ok: boolean },
>(dependencies: {
  getSession: SessionReader;
  action: (userId: string, body: unknown) => Promise<Result>;
}) {
  return async function POST(request: Request) {
    try {
      assertSameOrigin(request);
    } catch (error) {
      if (error instanceof SameOriginError) {
        return NextResponse.json(
          { ok: false, error: "Request origin does not match this site." },
          { status: 403 },
        );
      }
      throw error;
    }

    const session = await dependencies.getSession();
    if (!session) {
      return NextResponse.json(
        { ok: false, error: "Sign in to continue." },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json(
        { ok: false, error: "Submit a valid form." },
        { status: 400 },
      );
    }

    const result = await dependencies.action(session.user.id, body);
    return NextResponse.json(result, {
      status: result.ok === true ? 200 : "redirectTo" in result ? 409 : 400,
    });
  };
}
