import { z } from "zod";

import type {
  AuthRepository,
  AuthenticatedSession,
} from "../../db/repositories/auth-repository";
import type { EmailSender } from "./email";
import { createOpaqueToken, hashToken } from "./tokens";

const MAGIC_LINK_LIFETIME_MS = 15 * 60 * 1_000;
const MAGIC_LINK_THROTTLE_SECONDS = 60;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;

const emailSchema = z.string().trim().toLowerCase().email();
const originSchema = z.string().url().transform((value) => new URL(value).origin);

type AuthEnvironment = "development" | "test" | "production";

type AuthServiceDependencies = {
  repository: AuthRepository;
  emailSender: EmailSender;
  sessionSecret: string;
  environment: AuthEnvironment;
  now?: () => Date;
  tokenFactory?: () => string;
};

export type MagicLinkRequestResult = {
  accepted: true;
  developmentVerifyUrl?: string;
};

export type VerifiedMagicLink = AuthenticatedSession & {
  token: string;
  expiresAt: Date;
};

export function normalizeEmail(email: string): string {
  return emailSchema.parse(email);
}

export function createAuthService(dependencies: AuthServiceDependencies) {
  const now = dependencies.now ?? (() => new Date());
  const tokenFactory = dependencies.tokenFactory ?? createOpaqueToken;

  return {
    async requestMagicLink(input: {
      email: string;
      origin: string;
    }): Promise<MagicLinkRequestResult> {
      const requestedAt = now();
      const email = normalizeEmail(input.email);
      const origin = originSchema.parse(input.origin);
      const token = tokenFactory();
      const verifyUrl = new URL("/auth/verify", origin);
      verifyUrl.searchParams.set("token", token);

      const created = await dependencies.repository.createMagicLink({
        email,
        tokenHash: hashToken(token, dependencies.sessionSecret),
        createdAt: requestedAt,
        expiresAt: new Date(requestedAt.getTime() + MAGIC_LINK_LIFETIME_MS),
        throttleWindowSeconds: MAGIC_LINK_THROTTLE_SECONDS,
      });

      if (!created.created) return { accepted: true };

      await dependencies.emailSender.sendMagicLink({
        email,
        verifyUrl: verifyUrl.toString(),
      });

      return dependencies.environment === "production"
        ? { accepted: true }
        : { accepted: true, developmentVerifyUrl: verifyUrl.toString() };
    },

    async verifyMagicLink(token: string): Promise<VerifiedMagicLink | null> {
      if (!token) return null;

      const verifiedAt = now();
      const sessionToken = tokenFactory();
      const expiresAt = new Date(verifiedAt.getTime() + SESSION_LIFETIME_MS);
      const authenticated =
        await dependencies.repository.consumeMagicLinkAndCreateSession({
          magicLinkTokenHash: hashToken(token, dependencies.sessionSecret),
          sessionTokenHash: hashToken(sessionToken, dependencies.sessionSecret),
          now: verifiedAt,
          sessionExpiresAt: expiresAt,
        });

      return authenticated
        ? { ...authenticated, token: sessionToken, expiresAt }
        : null;
    },

    getSession(token: string): Promise<AuthenticatedSession | null> {
      if (!token) return Promise.resolve(null);
      return dependencies.repository.findSession(
        hashToken(token, dependencies.sessionSecret),
        now(),
      );
    },

    logout(token: string): Promise<boolean> {
      if (!token) return Promise.resolve(false);
      return dependencies.repository.revokeSession(
        hashToken(token, dependencies.sessionSecret),
      );
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
