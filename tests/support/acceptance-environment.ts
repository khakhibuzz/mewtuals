import { createHash } from "node:crypto";
import { localDatabasePort } from "../../scripts/local-development.mjs";

export const LOCAL_APP_DATABASE_URL =
  `postgresql://127.0.0.1:${localDatabasePort()}/mewtuals`;
export const LOCAL_TEST_DATABASE_URL =
  `postgresql://127.0.0.1:${localDatabasePort()}/mewtuals_test`;

function requiredUnprivilegedPort(
  environmentName: "MEWTUALS_LOCAL_APP_PORT",
  defaultPort: string,
) {
  const configuredPort = process.env[environmentName]?.trim();
  if (!configuredPort) {
    return defaultPort;
  }

  const portNumber = Number(configuredPort);
  if (
    !/^\d+$/.test(configuredPort) ||
    !Number.isSafeInteger(portNumber) ||
    portNumber < 1024 ||
    portNumber > 65_535
  ) {
    throw new Error(
      `${environmentName} must be an unprivileged TCP port from 1024 to 65535.`,
    );
  }

  return configuredPort;
}

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
  const requiredPort = requiredUnprivilegedPort(
    "MEWTUALS_LOCAL_APP_PORT",
    "4000",
  );
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
    url.port !== requiredPort ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      `PLAYWRIGHT_BASE_URL must be an exact loopback origin on port ${requiredPort}.`,
    );
  }

  return url.origin;
}

export function acceptanceToken(runId: string, purpose: string) {
  return createHash("sha256")
    .update(`mewtuals-product-v1:${runId}:${purpose}`)
    .digest("base64url");
}
