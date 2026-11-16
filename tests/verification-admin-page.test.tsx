import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import VerificationAdminPage from "../app/admin/verifications/page";
import { loadAdminPageContext } from "../app/server/admin-page-context";
import { getVerificationService } from "../app/server/verification";

const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("../app/server/admin-page-context", () => ({ loadAdminPageContext: vi.fn() }));
vi.mock("../app/server/verification", () => ({ getVerificationService: vi.fn() }));

const database = { requestOwned: "verification" } as never;
const session = {
  session: { id: "session", expiresAt: new Date("2026-08-15T00:00:00.000Z") },
  user: { id: "admin", email: "admin@example.com", name: "Admin" },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAdminPageContext).mockResolvedValue({ database, session });
});

describe("verification administrator page", () => {
  it("redirects signed-out visitors before constructing the service", async () => {
    vi.mocked(loadAdminPageContext).mockResolvedValue({ database, session: null });

    await expect(VerificationAdminPage()).rejects.toThrow("redirect:/network/join");
    expect(getVerificationService).not.toHaveBeenCalled();
  });

  it("loads the queue through the exact request-owned database", async () => {
    const listPending = vi.fn(async () => ({ ok: true as const, profiles: [] }));
    vi.mocked(getVerificationService).mockReturnValue({ listPending } as never);

    render(await VerificationAdminPage());

    expect(screen.getByRole("heading", { name: "Profiles awaiting review." })).toBeVisible();
    expect(loadAdminPageContext).toHaveBeenCalledOnce();
    expect(getVerificationService).toHaveBeenCalledWith(database);
  });
});
