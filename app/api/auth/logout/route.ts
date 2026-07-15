import { NextResponse } from "next/server";

import { createAuthRepository } from "../../../../db/repositories/auth-repository";
import { createAuthService } from "../../../server/auth-service";
import { createEmailSender } from "../../../server/email";
import { readServerEnvironment } from "../../../server/env";
import {
  assertSameOrigin,
  SameOriginError,
} from "../../../server/request-security";
import {
  clearSessionCookie,
  SESSION_COOKIE_NAME,
} from "../../../server/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof SameOriginError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const requestUrl = new URL(request.url);
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE_NAME);
  if (token) {
    const environment = readServerEnvironment();
    const service = createAuthService({
      repository: createAuthRepository(),
      emailSender: createEmailSender({
        environment: environment.environment,
        apiKey: environment.resendApiKey,
        from: environment.emailFrom,
      }),
      sessionSecret: environment.sessionSecret,
      environment: environment.environment,
    });
    await service.logout(token);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response, requestUrl.hostname);
  return response;
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }

  return undefined;
}
