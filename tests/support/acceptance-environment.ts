import { createHash } from "node:crypto";
import { localDatabasePort } from "../../scripts/local-development.mjs";

export const LOCAL_APP_DATABASE_URL =
  `postgresql://127.0.0.1:${localDatabasePort()}/mewtuals`;
export const LOCAL_TEST_DATABASE_URL =
  `postgresql://127.0.0.1:${localDatabasePort()}/mewtuals_test`;

function requireLocalDatabaseUrl(
  value: string | undefined,
  databaseName: string,
  label: string,
) {
  let url: URL | undefined;
  try {
    url = value ? new URL(value) : undefined;
  } catch {
    url = undefined;
  }

  if (
    !url ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    url.hostname !== "127.0.0.1" ||
    url.port !== localDatabasePort() ||
    url.pathname !== `/${databaseName}` ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `This command requires the ${label} at 127.0.0.1:${localDatabasePort()}/${databaseName}. Refusing the configured DATABASE_URL.`,
    );
  }
  return value;
}

export function requireLocalAppDatabaseUrl(value: string | undefined) {
  return requireLocalDatabaseUrl(
    value,
    "mewtuals",
    "local application database",
  );
}

export function requireLocalTestDatabaseUrl(value: string | undefined) {
  return requireLocalDatabaseUrl(
    value,
    "mewtuals_test",
    "dedicated local test database",
  );
}

export function requireLoopbackBaseUrl(value: string | undefined) {
  if (!value) {
    throw new Error("PLAYWRIGHT_BASE_URL must be an exact loopback URL.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("PLAYWRIGHT_BASE_URL must be an exact loopback URL.");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const loopback = ["localhost", "127.0.0.1", "::1"].includes(hostname);
  if (
    url.protocol !== "http:" ||
    !loopback ||
    url.port !== "4000" ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "PLAYWRIGHT_BASE_URL must be an exact loopback origin on port 4000.",
    );
  }

  return url.origin;
}

export function acceptanceToken(runId: string, purpose: string) {
  return createHash("sha256")
    .update(`mewtuals-product-v1:${runId}:${purpose}`)
    .digest("base64url");
}
