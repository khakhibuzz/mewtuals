import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { createAuthRepository } from "../../db/repositories/auth-repository";
import { createAuthService } from "./auth-service";
import { createEmailSender } from "./email";
import { readServerEnvironment } from "./env";

export const SESSION_COOKIE_NAME = "mewtuals_session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieOptions(hostname: string) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
    secure: !isLocalHostname(hostname),
  };
}

export function setSessionCookie(
  response: NextResponse,
  token: string,
  hostname: string,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(hostname));
}

export function clearSessionCookie(
  response: NextResponse,
  hostname: string,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    ...sessionCookieOptions(hostname),
    maxAge: 0,
  });
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

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
  return service.getSession(token);
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}
