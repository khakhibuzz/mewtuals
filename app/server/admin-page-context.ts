import { getDb, type MewtualsDatabase } from "../../db";
import type { AuthenticatedSession } from "../../db/repositories/auth-repository";
import { getCurrentSession } from "./session";

type AdminPageContextDependencies = Readonly<{
  getDatabase?: () => MewtualsDatabase;
  getSession?: (
    database: MewtualsDatabase,
  ) => Promise<AuthenticatedSession | null>;
}>;

export async function loadAdminPageContext(
  dependencies: AdminPageContextDependencies = {},
): Promise<{
  database: MewtualsDatabase;
  session: AuthenticatedSession | null;
}> {
  const database = (dependencies.getDatabase ?? getDb)();
  const session = await (dependencies.getSession ?? getCurrentSession)(database);
  return { database, session };
}
