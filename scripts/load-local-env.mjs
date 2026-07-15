import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

const defaultEnvFile = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../.env.local",
);

export function loadLocalEnvironment(envFile = defaultEnvFile) {
  if (!existsSync(envFile)) {
    return false;
  }

  loadEnvFile(envFile);
  return true;
}
