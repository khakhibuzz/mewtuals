import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { configureLocalEnvironment } from "./local-development.mjs";
import { loadLocalEnvironment } from "./load-local-env.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  loadLocalEnvironment();
  const created = configureLocalEnvironment(projectRoot);
  console.log(created
    ? "Created ignored local Node and Worker configuration with a new session secret."
    : "Reusing existing generated local configuration.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
