import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { z } from "zod";

import * as schema from "./schema";

export type MewtualsDatabase = PostgresJsDatabase<typeof schema>;

let client: Sql | undefined;
let database: MewtualsDatabase | undefined;

const databaseUrlSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
    "DATABASE_URL must use the postgres:// or postgresql:// protocol.",
  );

function requireDatabaseUrl() {
  const result = databaseUrlSchema.safeParse(process.env.DATABASE_URL);

  if (!result.success) {
    throw new Error(
      "DATABASE_URL is required and must be a PostgreSQL URL. Copy .env.example to .env.local or export DATABASE_URL before using the database.",
    );
  }

  return result.data;
}

export function shouldCacheDatabaseConnection(runtime: object): boolean {
  return !("Cloudflare" in runtime);
}

export function getDb(): MewtualsDatabase {
  const cacheConnection = shouldCacheDatabaseConnection(globalThis);
  if (cacheConnection && database) {
    return database;
  }

  const nextClient = postgres(requireDatabaseUrl(), {
    max: 1,
    prepare: false,
    connect_timeout: 5,
    idle_timeout: cacheConnection ? 10 : 0,
  });
  const nextDatabase = drizzle(nextClient, { schema });

  if (cacheConnection) {
    client = nextClient;
    database = nextDatabase;
  }

  return nextDatabase;
}

export async function closeDb() {
  if (!client) {
    return;
  }

  await client.end({ timeout: 5 });
  client = undefined;
  database = undefined;
}
