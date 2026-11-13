import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { localDatabaseUrl } from "./local-development.mjs";
import { loadLocalEnvironment } from "./load-local-env.mjs";

const [target, command, ...args] = process.argv.slice(2);
if (!["app", "test"].includes(target) || !command) {
  console.error("Usage: node scripts/with-local-db.mjs <app|test> <command> [...args]");
  process.exitCode = 1;
} else {
  loadLocalEnvironment();
  const result = spawnSync(command, args, {
    cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
    env: {
      ...process.env,
      DATABASE_URL: localDatabaseUrl(target === "test" ? "mewtuals_test" : "mewtuals"),
    },
    stdio: "inherit",
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
