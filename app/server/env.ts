import { z } from "zod";

const optionalTrimmedString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).optional(),
);

const serverEnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must contain at least 32 characters."),
  RESEND_API_KEY: optionalTrimmedString,
  EMAIL_FROM: optionalTrimmedString,
  ADMIN_EMAILS: optionalTrimmedString,
  MEWTUALS_DEV_AUTH: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  GOOGLE_CLIENT_ID: optionalTrimmedString,
  GOOGLE_CLIENT_SECRET: optionalTrimmedString,
});

export type ServerEnvironment = {
  environment: "development" | "test" | "production";
  sessionSecret: string;
  resendApiKey?: string;
  emailFrom?: string;
  adminEmails: readonly string[];
  developmentAuthEnabled: boolean;
  googleClientId?: string;
  googleClientSecret?: string;
};

export function readServerEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): ServerEnvironment {
  const result = serverEnvironmentSchema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues.map((issue) => issue.message).join(" ");
    throw new Error(`Invalid Mewtuals server environment: ${detail}`);
  }

  const value = result.data;
  return {
    environment: value.NODE_ENV,
    sessionSecret: value.SESSION_SECRET,
    resendApiKey: value.RESEND_API_KEY,
    emailFrom: value.EMAIL_FROM,
    adminEmails: (value.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    developmentAuthEnabled: value.MEWTUALS_DEV_AUTH,
    googleClientId: value.GOOGLE_CLIENT_ID,
    googleClientSecret: value.GOOGLE_CLIENT_SECRET,
  };
}

export function canExposeDevelopmentVerifyUrl(
  environment: ServerEnvironment,
  requestOrigin: string,
): boolean {
  if (
    environment.environment === "production" ||
    !environment.developmentAuthEnabled
  ) {
    return false;
  }

  try {
    const hostname = new URL(requestOrigin).hostname
      .replace(/^\[|\]$/g, "")
      .toLowerCase();
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1"
    );
  } catch {
    return false;
  }
}
