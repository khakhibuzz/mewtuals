import { describe, expect, it, vi } from "vitest";

import { loadAdminPageContext } from "../app/server/admin-page-context";
import type { AuthenticatedSession } from "../db/repositories/auth-repository";

describe("administrator page context", () => {
  it("acquires one database and passes that exact database to session loading", async () => {
    const database = { requestOwned: true } as never;
    const session: AuthenticatedSession = {
      session: {
        id: "session",
        expiresAt: new Date("2026-08-15T00:00:00.000Z"),
      },
      user: { id: "admin", email: "admin@example.com", name: "Admin" },
    };
    const getDatabase = vi.fn(() => database);
    const getSession = vi.fn(async () => session);

    await expect(
      loadAdminPageContext({ getDatabase, getSession }),
    ).resolves.toEqual({ database, session });
    expect(getDatabase).toHaveBeenCalledTimes(1);
    expect(getSession).toHaveBeenCalledOnce();
    expect(getSession).toHaveBeenCalledWith(database);
  });
});
