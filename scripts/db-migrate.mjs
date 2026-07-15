import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/postgres-js/migrator";

import { closeDb, getDb } from "../db/client.ts";

const migrationsFolder = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
);

try {
  await migrate(getDb(), { migrationsFolder });
  console.log(`Applied PostgreSQL migrations from ${migrationsFolder}`);
} catch (error) {
  console.error("PostgreSQL migration failed:", error);
  process.exitCode = 1;
} finally {
  await closeDb();
}
