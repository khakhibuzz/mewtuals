import { NextResponse } from "next/server";

import { createAuthRepository } from "../../../db/repositories/auth-repository";
import { createAuthService } from "../../server/auth-service";
import { createEmailSender } from "../../server/email";
import { readServerEnvironment } from "../../server/env";
import {
  assertSameOrigin,
  SameOriginError,
} from "../../server/request-security";
import { setSessionCookie } from "../../server/session";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token") ?? "";

  if (!tokenPattern.test(token)) {
    return verificationPage(
      invalidLinkContent(),
      400,
    );
  }

  return verificationPage(confirmationContent(token));
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch (error) {
    if (error instanceof SameOriginError) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    throw error;
  }

  const requestUrl = new URL(request.url);
  const formData = await request.formData().catch(() => null);
  const token = formData?.get("token");
  if (typeof token !== "string" || !tokenPattern.test(token)) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-link", requestUrl),
      303,
    );
  }

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
    exposeDevelopmentVerifyUrl: false,
  });
  const verified = await service.verifyMagicLink(token);

  if (!verified) {
    return NextResponse.redirect(
      new URL("/login?error=invalid-link", requestUrl),
      303,
    );
  }

  const response = NextResponse.redirect(
    new URL("/onboarding/identity", requestUrl),
    303,
  );
  setSessionCookie(response, verified.token, requestUrl.hostname);
  return response;
}

function verificationPage(content: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Continue to Mewtuals</title>
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3efe5; color: #1c1b18; font: 16px/1.5 Arial, sans-serif; }
      main { width: min(32rem, calc(100% - 2rem)); border-top: 1px solid #1c1b18; padding: 2.5rem 0; }
      h1 { margin: 0 0 1rem; font: 500 clamp(2rem, 7vw, 3.5rem)/1 Georgia, serif; letter-spacing: -0.04em; }
      p { max-width: 30rem; }
      button, a { color: inherit; }
      button { margin-top: 1.5rem; border: 1px solid #1c1b18; background: #1c1b18; color: #f3efe5; padding: 0.85rem 1.2rem; cursor: pointer; font: inherit; }
      a { text-underline-offset: 0.2em; }
    </style>
  </head>
  <body><main>${content}</main></body>
</html>`,
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "strict-origin",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

function confirmationContent(token: string): string {
  return `<p>Mewtuals</p>
<h1>Confirm your sign-in.</h1>
<p>Continue to your private Mewtuals profile. This link can only be used once.</p>
<form method="post" action="/auth/verify">
  <input type="hidden" name="token" value="${escapeHtmlAttribute(token)}">
  <button type="submit">Continue to Mewtuals</button>
</form>`;
}

function invalidLinkContent(): string {
  return `<p>Mewtuals</p>
<h1>This sign-in link is not valid.</h1>
<p>It may be incomplete. <a href="/login">Request a fresh sign-in link</a>.</p>`;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
