import { NextResponse } from "next/server";

import type { AuthenticatedSession } from "../../db/repositories/auth-repository";
import { assertSameOrigin, SameOriginError } from "./request-security";

type SessionReader = () => Promise<AuthenticatedSession | null>;
type DashboardResult =
  | { ok: true; [key: string]: unknown }
  | { ok: false; status: number; error: string; [key: string]: unknown };

function sameOriginFailure(error: unknown) {
  if (!(error instanceof SameOriginError)) throw error;
  return NextResponse.json(
    { ok: false, error: "Request origin does not match this site." },
    { status: 403 },
  );
}

function unauthenticated() {
  return NextResponse.json(
    { ok: false, error: "Sign in to continue." },
    { status: 401 },
  );
}

async function readObjectBody(request: Request) {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export function createSignalHandler(dependencies: {
  getSession: SessionReader;
  saveSignal: (userId: string, body: unknown) => Promise<DashboardResult>;
}) {
  return async function POST(request: Request) {
    try {
      assertSameOrigin(request);
    } catch (error) {
      return sameOriginFailure(error);
    }

    const session = await dependencies.getSession();
    if (!session) return unauthenticated();
    const body = await readObjectBody(request);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Submit a valid partnership signal." },
        { status: 400 },
      );
    }

    const result = await dependencies.saveSignal(session.user.id, body);
    return NextResponse.json(
      result.ok ? { ...result, nextPath: "/dashboard" } : result,
      { status: result.ok ? 200 : result.status },
    );
  };
}

export function createAdvanceHandler(dependencies: {
  getSession: SessionReader;
  advance: (
    userId: string,
    opportunityId: string,
    note?: unknown,
  ) => Promise<DashboardResult>;
}) {
  return async function POST(
    request: Request,
    context: { params: Promise<{ opportunityId: string }> },
  ) {
    try {
      assertSameOrigin(request);
    } catch (error) {
      return sameOriginFailure(error);
    }

    const session = await dependencies.getSession();
    if (!session) return unauthenticated();
    const body = await readObjectBody(request);
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Submit a valid relationship request." },
        { status: 400 },
      );
    }

    const { opportunityId } = await context.params;
    const result = await dependencies.advance(
      session.user.id,
      opportunityId,
      body.note,
    );
    return NextResponse.json(result, {
      status: result.ok ? 200 : result.status,
    });
  };
}
