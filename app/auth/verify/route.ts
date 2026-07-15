import { NextResponse } from "next/server";

import { createAuthRepository } from "../../../db/repositories/auth-repository";
import { createAuthService } from "../../server/auth-service";
import { createEmailSender } from "../../server/email";
import { readServerEnvironment } from "../../server/env";
import { setSessionCookie } from "../../server/session";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token") ?? "";
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
  const verified = await service.verifyMagicLink(token);

  if (!verified) {
    return NextResponse.redirect(new URL("/login?error=invalid-link", requestUrl));
  }

  const response = NextResponse.redirect(new URL("/onboarding/identity", requestUrl));
  setSessionCookie(response, verified.token, requestUrl.hostname);
  return response;
}
