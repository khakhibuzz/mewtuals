import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { configureLocalEnvironment } from "./local-development.mjs";
import { loadLocalEnvironment } from "./load-local-env.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  loadLocalEnvironment();
  const updated = configureLocalEnvironment(projectRoot);
  console.log(updated
    ? "Configured ignored local Node and Worker development settings."
    : "Reusing existing generated local configuration.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
